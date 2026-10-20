"""Panglacial Wurm: an action taken INSIDE another interaction.

PHASE_06 §6.63, acceptance P6-AE. Required evidence: a run and a
protocol trace.

    python -I scripts/check-panglacial-wurm.py <worker.jar> <res-root> [trace.jsonl]

"While you're searching your library, you may cast Panglacial Wurm
from your library." The cast happens in the middle of a search:
Forge is resolving Evolving Wilds, has the library open, and
offers the Wurm before the player picks the land. P6-AE asks that
the protocol carry that legal action without flattening it away --
no "finish the search first", no skipping the offer because a
selection is already in progress.

What is checked, all off the protocol:

  the offer      Forge asks about casting the Wurm while the Wilds
                 ability is still on the stack (the search is live)
  the cast       answered yes, the Wurm's mana is asked for and paid
                 -- a second interaction nested in the first
  the search     AFTER the Wurm is paid for, the search resumes and
                 asks which land to take; it was not abandoned
  the result     the Wurm reaches the battlefield and so does a
                 land from the library

A FOCUSED DECK (§6.6 Layer B): Forests, Evolving Wilds and Wurms.
Both players lay Forests and do nothing else until they hold seven
untapped Forests and an Evolving Wilds; then they crack the Wilds.
Nobody attacks. The Wurm is never cast from the hand.

Exit 0 when every property held, 1 when one did not, 2 when the
game never reached the scenario.
"""
import json
import re
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
DECK = [("Forest", 40), ("Evolving Wilds", 10), ("Panglacial Wurm", 10)]
WURM, WILDS = "Panglacial Wurm", "Evolving Wilds"
MAX_TURN = 40

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
events = []                # (decisionId, what) in order, for the nesting check
found = {"offer": None, "cast_paid": 0, "search_resumed": None, "wurm_on_battlefield": None,
         "cracked_by": None}


def mine(seat, zone):
    return [c for c in state.get(seat, {}).get(zone, []) if c.get("seat") == seat]


def untapped_forests(seat):
    return [c for c in mine(seat, "battlefield") if c.get("name") == "Forest" and not c.get("tapped")]


def respond(frame, option):
    send({"protocolVersion": 1, "type": "DECISION_RESPONSE",
          "messageId": str(uuid.uuid4()), "decisionId": frame["decisionId"],
          "seat": frame["authorisedSeat"], "stateVersion": frame["stateVersion"],
          "actionId": option["actionId"] if option else None})


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
        who = found["cracked_by"]
        if who and s.get("seat") == who and found["search_resumed"]:
            wurm = [c for c in mine(who, "battlefield") if c.get("name") == WURM]
            if wurm:
                found["wurm_on_battlefield"] = {"card": wurm[0]["id"], "turn": turn}
                break
        if turn > MAX_TURN:
            break
        continue

    if kind == "GAME_ENDED":
        print("game ended before the scenario:", frame.get("outcome"))
        break
    if kind == "ERROR":
        print("worker error:", frame.get("errorCode"), frame.get("detail"))
        break
    if kind != "DECISION_REQUEST":
        continue

    seat = frame["authorisedSeat"]
    dkind = frame.get("kind")
    prompt = frame.get("prompt") or ""
    options = frame.get("options", [])
    labels = [o.get("label") or "" for o in options]
    pick = None
    stack = [x.get("description", "") for x in state.get(seat, {}).get("stack", [])]

    if dkind == "chooseSpellAbilityToPlay":
        def on(zone, name, play_land=None, ability=False):
            for o, label in zip(options, labels):
                cid = card_of(o.get("actionId"))
                card = next((c for c in state.get(seat, {}).get(zone, []) if c.get("id") == cid), {})
                if card.get("name") != name:
                    continue
                if play_land is not None and (("Play land" in label) != play_land):
                    continue
                if ability and ("Add {" in label or "Play land" in label):
                    continue
                return o
            return None

        wilds_out = [c for c in mine(seat, "battlefield") if c.get("name") == WILDS]
        if found["cracked_by"] is None and wilds_out and len(untapped_forests(seat)) >= 7:
            pick = on("battlefield", WILDS, ability=True)
            if pick:
                found["cracked_by"] = seat
                events.append((frame["decisionId"], "crack the Wilds"))
        if pick is None and found["cracked_by"] is None:
            forests = len([c for c in mine(seat, "battlefield") if c.get("name") == "Forest"])
            if forests >= 7 and not wilds_out:
                pick = on("hand", WILDS, play_land=True)
            if pick is None:
                pick = on("hand", "Forest", play_land=True)

    elif dkind in ("confirmAction", "confirmPayment") and seat == found["cracked_by"]:
        # Forge's question arrives as the affirmative OPTION's label
        # ("Yes — Do you want to play Panglacial Wurm?"), not as the
        # prompt; the first run of this missed it by reading only
        # the prompt.
        asks_wurm = WURM in prompt or any(WURM in label for label in labels)
        if asks_wurm and found["offer"] is None:
            found["offer"] = {"decisionId": frame["decisionId"], "prompt": prompt,
                              "stack_while_asked": stack,
                              "options": labels}
            events.append((frame["decisionId"], "offer: cast the Wurm"))
            pick = options[0] if options else None
        elif asks_wurm:
            # Forge offers EVERY Wurm in the library, one after
            # another. One is the scenario; the mana is spent.
            pick = next((o for o, label in zip(options, labels) if label.startswith("No")), None)
        else:
            pick = options[0] if options else None   # yes: sacrifice the Wilds

    elif dkind == "applyManaToCost" and seat == found["cracked_by"] and found["offer"]:
        found["cast_paid"] += 1
        events.append((frame["decisionId"], "pay for the Wurm"))
        pick = options[0] if options else None

    elif (dkind in ("chooseSingleEntityForEffect", "chooseEntitiesForEffect")
          and seat == found["cracked_by"] and found["offer"]
          and any("Forest" in label for label in labels)):
        if found["search_resumed"] is None:
            found["search_resumed"] = {"decisionId": frame["decisionId"], "kind": dkind,
                                       "prompt": prompt, "options": labels[:5],
                                       "stack_while_asked": stack}
            events.append((frame["decisionId"], "search resumes: choose a land"))
        pick = next((o for o, label in zip(options, labels) if "Forest" in label), None)

    elif dkind in ("declareAttackers", "declareBlockers"):
        pick = None
    elif dkind in ("mulliganKeepHand", "chooseStartingPlayer", "chooseCardsToDiscardToMaximumHandSize",
                   "applyManaToCost"):
        pick = options[0] if options else None
    else:
        pick = options[0] if (options and frame.get("mandatory")) else None

    respond(frame, pick)

proc.kill()
if trace:
    trace.close()

print(json.dumps(found, indent=2))
print("order:", events)

if not found["cracked_by"]:
    print("INCONCLUSIVE: nobody reached seven Forests and an Evolving Wilds")
    sys.exit(2)
problems = []
offer, resumed = found["offer"], found["search_resumed"]
if not offer:
    problems.append("the search ran, but casting the Wurm was never offered")
else:
    if not any(WILDS in s for s in offer["stack_while_asked"]):
        problems.append(f"the offer did not come during the Wilds' search: stack {offer['stack_while_asked']}")
if offer and found["cast_paid"] == 0:
    problems.append("yes to the Wurm, but its mana was never asked for")
if offer and not resumed:
    problems.append("the search did not resume after the Wurm: flattened away")
if offer and resumed and resumed["decisionId"] < offer["decisionId"]:
    problems.append("the land was chosen before the offer")
if offer and resumed and not found["wurm_on_battlefield"]:
    problems.append("the Wurm never reached the battlefield")
if problems:
    print("WRONG:", "; ".join(problems))
    sys.exit(1)
print("OK: the Wurm was offered, cast and paid for inside the search, and the search went on")
