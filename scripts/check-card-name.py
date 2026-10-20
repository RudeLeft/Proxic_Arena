"""Naming any card: search, then pick. P6-AG.

PHASE_06 §6.73-§6.74, acceptance P6-AG. Owner decision 2026-10-20:
the player searches Forge's allowed names and picks one; the answer
is still one of Forge's options.

    python -I scripts/check-card-name.py <worker.jar> <res-root> [trace.jsonl]

Pithing Needle: "As Pithing Needle enters, choose a card name.
Activated abilities of sources with the chosen name can't be
activated unless they're mana abilities." Checked off the protocol:

  the question   chooseCardName arrives SEARCHABLE, with no options
                 on it and a count of how many names Forge allows
  the search     DECISION_SEARCH returns Forge's names, best match
                 first; accents do not matter ("mjolnir" finds
                 Mjolnir with its umlaut)
  the gate       an answer that is not one of Forge's names is
                 refused
  the effect     the named card's ability is offered BEFORE the
                 Needle and not after -- Forge applied the name

A focused deck: Mountains, Evolving Wilds and Pithing Needles. Each
player plays an Evolving Wilds and never cracks it, casts a Needle,
and names Evolving Wilds.

Exit 0 when every property held, 1 when one did not, 2 when the game
never reached the scenario.
"""
import json
import re
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
DECK = [("Mountain", 30), ("Evolving Wilds", 10), ("Pithing Needle", 20)]
WILDS, NEEDLE = "Evolving Wilds", "Pithing Needle"
MAX_TURN = 20

proc = subprocess.Popen(
    ["java", "-jar", JAR, RES],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL, text=True, encoding="utf-8", bufsize=1)
trace = open(TRACE, "w", encoding="utf-8") if TRACE else None


def send(obj):
    if trace:
        trace.write(json.dumps({"dir": "out", "frame": obj}) + "\n")
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()


def card_of(action_id):
    m = re.search(r"card:(\d+)", action_id or "")
    return f"card:{m.group(1)}" if m else None


state = {}
found = {
    "wilds_ability_before": False,   # offered before anything was named
    "question": None,                # the chooseCardName request
    "searches": {},                  # query -> (total, first labels)
    "bogus_refused": None,           # the gate's verdict on a made-up id
    "named": None,                   # the id and label chosen
    "wilds_ability_after": None,     # trying the ability after naming it
}
naming = None                        # the pending chooseCardName frame
attempt = None                       # trying the named card's ability
queries = ["evolv", "mjolnir", "oin the", "zzzzzz"]


def mine(seat, zone):
    return [c for c in state.get(seat, {}).get(zone, []) if c.get("seat") == seat]


def respond(frame, action_id):
    send({"protocolVersion": 1, "type": "DECISION_RESPONSE",
          "messageId": str(uuid.uuid4()), "decisionId": frame["decisionId"],
          "seat": frame["authorisedSeat"], "stateVersion": frame["stateVersion"],
          "actionId": action_id})


def search(frame, query):
    send({"protocolVersion": 1, "type": "DECISION_SEARCH", "messageId": str(uuid.uuid4()),
          "decisionId": frame["decisionId"], "seat": frame["authorisedSeat"], "query": query})


turn = 0
for line in proc.stdout:
    line = line.strip()
    if not line.startswith("{"):
        continue
    try:
        frame = json.loads(line)
    except ValueError:
        continue
    if trace:
        trace.write(json.dumps({"dir": "in", "frame": frame}) + "\n")
    kind = frame.get("type")

    if kind == "WORKER_READY":
        deck = [{"name": n, "quantity": q} for n, q in DECK]
        send({"protocolVersion": 1, "type": "START_GAME",
              "messageId": str(uuid.uuid4()), "matchId": str(uuid.uuid4()),
              "players": [{"displayName": "Alice", "seatNumber": 1, "cards": deck},
                          {"displayName": "Bob", "seatNumber": 2, "cards": deck}]})
        continue

    if kind == "MATCH_SNAPSHOT":
        s = frame.get("state") or {}
        state[s.get("seat")] = s
        turn = s.get("turn") or turn
        if turn > MAX_TURN or found["wilds_ability_after"] is not None:
            break
        continue

    if kind == "DECISION_OPTIONS" and naming:
        query = frame.get("query")
        found["searches"][query] = (frame.get("total"), [o["label"] for o in frame.get("options", [])][:5])
        for option in frame.get("options", []):
            if option.get("label") == WILDS:
                found["_wilds_id"] = option["actionId"]
        pending = [q for q in queries if q not in found["searches"]]
        if pending:
            search(naming, pending[0])
        else:
            # Every search answered. First a made-up id, which the
            # gate must refuse; the real answer follows the refusal.
            respond(naming, "name:999999")
        continue

    if kind == "ERROR" and frame.get("errorCode") == "DECISION_REFUSED" and naming:
        found["bogus_refused"] = frame.get("detail")
        # The id of Evolving Wilds, from the search that found it.
        respond(naming, found.get("_wilds_id"))
        found["named"] = (found["_wilds_id"], WILDS)
        naming = None
        continue

    if kind == "GAME_ENDED":
        print("game ended before the scenario:", frame.get("outcome"))
        break
    if kind == "ERROR":
        print("worker error:", frame.get("errorCode"), frame.get("detail"))
        if frame.get("errorCode") != "SEARCH_REFUSED":
            break
        continue
    if kind != "DECISION_REQUEST":
        continue

    seat = frame["authorisedSeat"]
    dkind = frame.get("kind")
    options = frame.get("options", [])
    labels = [o.get("label") or "" for o in options]
    pick = None

    if dkind == "chooseCardName" and found["question"] is None:
        found["question"] = {"searchable": frame.get("searchable"), "optionCount": frame.get("optionCount"),
                             "options_sent": len(options), "mandatory": frame.get("mandatory"),
                             "prompt": frame.get("prompt"), "seat": seat}
        naming = frame
        search(frame, queries[0])
        continue

    if dkind == "chooseSpellAbilityToPlay":
        def own(zone, name):
            return {c["id"] for c in mine(seat, zone) if c.get("name") == name}

        wilds_on_board = own("battlefield", WILDS)
        offered_wilds = [o for o, label in zip(options, labels)
                         if card_of(o.get("actionId")) in wilds_on_board and "Add {" not in label]
        if found["named"] is None:
            if offered_wilds:
                found["wilds_ability_before"] = True
        elif attempt is not None and seat == attempt["seat"]:
            # Back at THIS player's priority after trying the named
            # card's ability. Forge refuses it AT ACTIVATION
            # (PlaySpellAbility's checkRestrictions) and rolls back: no
            # sacrifice, no search, the Wilds still on the battlefield.
            #
            # This player's: the first version judged at the next
            # priority of EITHER seat, and when that was the opponent's
            # it looked for this Wilds on the opponent's battlefield --
            # passing locally, failing on CI, on a game that was right.
            found["wilds_ability_after"] = {
                "attempted": True,
                "sacrifice_asked": attempt["sacrifice_asked"],
                "searched": attempt["searched"],
                "still_on_battlefield": attempt["card"] in wilds_on_board,
            }
            attempt = None
        elif attempt is None and offered_wilds and found["wilds_ability_after"] is None:
            # STILL OFFERED -- as Forge's own desktop client offers it:
            # both list abilities with getAllPossibleAbilities, which
            # does not consult "can't be activated" effects. So TRY
            # it, and see whether Forge lets it happen.
            attempt = {"card": card_of(offered_wilds[0]["actionId"]), "seat": seat,
                       "sacrifice_asked": False, "searched": False}
            respond(frame, offered_wilds[0]["actionId"])
            continue

        play = [o for o, label in zip(options, labels) if "Play land" in label]
        wilds_play = [o for o in play if card_of(o["actionId"]) in own("hand", WILDS)]
        mountain_play = [o for o in play if card_of(o["actionId"]) in own("hand", "Mountain")]
        needle = [o for o in options if card_of(o["actionId"]) in own("hand", NEEDLE)]
        if not wilds_on_board and wilds_play:
            pick = wilds_play[0]
        elif mountain_play:
            pick = mountain_play[0]
        elif found["question"] is None and found["wilds_ability_before"] and needle:
            pick = needle[0]
    elif dkind == "confirmPayment" and attempt is not None and WILDS in (frame.get("prompt") or ""):
        # Forge asking to sacrifice the Wilds would mean it let the
        # named ability through. Answer no either way.
        attempt["sacrifice_asked"] = True
        pick = None
    elif (attempt is not None and seat == attempt["seat"]
          and dkind in ("chooseSingleEntityForEffect", "chooseEntitiesForEffect")):
        # A library search for a land: the ability resolved.
        attempt["searched"] = True
        pick = None
    elif dkind in ("declareAttackers", "declareBlockers"):
        pick = None
    elif dkind in ("applyManaToCost", "mulliganKeepHand", "chooseStartingPlayer",
                   "chooseCardsToDiscardToMaximumHandSize"):
        pick = options[0] if options else None
    else:
        pick = options[0] if (options and frame.get("mandatory")) else None

    respond(frame, pick["actionId"] if pick else None)


proc.kill()
if trace:
    trace.close()
found.pop("_wilds_id", None)
print(json.dumps(found, indent=2, ensure_ascii=False))

q = found["question"]
if not q:
    print("INCONCLUSIVE: no Pithing Needle was cast")
    sys.exit(2)
problems = []
if not q["searchable"] or q["options_sent"] != 0:
    problems.append(f"the question was not sent searchable and empty: {q}")
if not (q["optionCount"] or 0) > 20000:
    problems.append(f"Forge allowed suspiciously few names: {q['optionCount']}")
hits = found["searches"]
# Every name STARTING with "evolv" ranks equally, alphabetically; the
# first version of this expected Evolving Wilds first and was wrong.
if not hits.get("evolv") or WILDS not in hits["evolv"][1]:
    problems.append(f"'evolv' did not find Evolving Wilds: {hits.get('evolv')}")
if not hits.get("mjolnir") or not any(label.startswith("Mjölnir") for label in hits["mjolnir"][1]):
    problems.append(f"'mjolnir' did not find Mjölnir: {hits.get('mjolnir')}")
if not hits.get("oin the") or not any("Óin" in label for label in hits["oin the"][1]):
    problems.append(f"'oin the' did not find Óin the Brave: {hits.get('oin the')}")
if hits.get("zzzzzz") and hits["zzzzzz"][0] != 0:
    problems.append(f"nonsense found something: {hits['zzzzzz']}")
if found["bogus_refused"] != "STALE_DECISION":
    problems.append(f"a made-up name id was not refused: {found['bogus_refused']}")
if not found["wilds_ability_before"]:
    problems.append("the Wilds' ability was never offered before naming (no control)")
after = found["wilds_ability_after"]
if after is None:
    print("INCONCLUSIVE: never tried the Wilds' ability after naming it")
    sys.exit(2)
if after["sacrifice_asked"] or after["searched"] or not after["still_on_battlefield"]:
    problems.append(f"Evolving Wilds was named, and its ability still went ahead: {after}")
if problems:
    print("WRONG:", "; ".join(problems))
    sys.exit(1)
print("OK: the name was searched for, picked from Forge's list, and Forge applied it")
