"""Leyline of the Void: begin the game with it on the battlefield.

PHASE_06 §6.68, acceptance P6-AC (the Leyline-style half).

    python -I scripts/check-leyline.py <worker.jar> <res-root> [trace.jsonl]

"If Leyline of the Void is in your opening hand, you may begin the
game with it on the battlefield." §6.68 asks that a legal opening-hand
action be represented WITHOUT pretending the card was cast. Checked
off the protocol:

  the offer    before the first turn, each player is asked which of
               their opening-hand Leylines to begin with -- one
               question per pick, Pass for "no more"
  the choice   seat 1 takes up to two and stops with at least one
               left; seat 2 declines. Exactly
               seat 1's two chosen cards are on the battlefield when
               the game starts, seat 2's are still in hand
  not cast     nothing is paid for and nothing goes on the stack
               before the first priority window
  the effect   seat 2 never plays a land, so it discards at its first
               cleanup -- and with seat 1's Leyline out, the card is
               exiled instead of reaching the graveyard (Forge's
               replacement, observed: hand down, graveyard still 0)

A focused deck (Layer B): three Leylines to every Swamp, so an
opening hand holds several -- the first version used half and half,
and seat 1 was dealt exactly one, which cannot show "two, then stop". It is not Open Format -- the worker does
not check format, the server does -- and does not need to be.

KNOWN FORGE DEFECT (found by this check, 2026-10-20). Forge applies
a "moved to a graveyard" replacement only for permanents in its LAST-
KNOWN-STATE copy of the battlefield, and refreshes that copy when a
player DOES something -- plays a land, casts, resolves. Placing the
opening-hand Leylines does not refresh it. So if nobody acts at all
before the first card is discarded, the Leylines are skipped and the
card reaches the graveyard. Forge's own desktop client takes the
same path. AGENTS VEND-001/002 and ARCH-002 forbid patching it
without the owner, so this reports it BY NAME in exactly that
condition and fails in any other.

Exit 0 when every property held (or only the known defect showed),
1 when one did not, 2 when the game never reached the scenario.
"""
import json
import re
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
DECK = [("Swamp", 15), ("Leyline of the Void", 45)]
LEYLINE = "Leyline of the Void"
KIND = "chooseSaToActivateFromOpeningHand"

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


def respond(frame, action_id):
    send({"protocolVersion": 1, "type": "DECISION_RESPONSE",
          "messageId": str(uuid.uuid4()), "decisionId": frame["decisionId"],
          "seat": frame["authorisedSeat"], "stateVersion": frame["stateVersion"],
          "actionId": action_id})


state = {}
found = {
    "asked": {1: [], 2: []},      # per seat: [(options, prompt)] for each question
    "chosen": [],                 # seat 1's picks, in order
    "pregame_kinds": [],          # every other decision kind before the first priority
    "pregame_stack": False,       # anything on a stack before the first priority
    "at_start": None,             # boards at the first priority window
    "discard": None,              # seat 2's discard, and where it went
}
started = False
discarding = None                 # (hand, graveyard) before seat 2's discard
acted = False                     # anyone did anything after the game began


def player(seat, who):
    return next((p for p in state.get(seat, {}).get("players", []) if p.get("seat") == who), {})


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
        if not started and s.get("stack"):
            found["pregame_stack"] = True
        if discarding is not None and s.get("seat") == 2:
            me = player(2, 2)
            if me.get("handCount", 99) < discarding[0]:
                found["discard"] = {"hand_before": discarding[0], "hand_after": me.get("handCount"),
                                    "graveyard_before": discarding[1],
                                    "graveyard_after": me.get("graveyardCount")}
                break
        continue

    if kind in ("GAME_ENDED", "ERROR"):
        print("stopped:", kind, frame.get("outcome") or frame.get("errorCode"), frame.get("detail"))
        break
    if kind != "DECISION_REQUEST":
        continue

    seat = frame["authorisedSeat"]
    dkind = frame.get("kind")
    options = frame.get("options", [])
    pick = None

    if dkind == KIND:
        found["asked"][seat].append(([o.get("label") for o in options], frame.get("prompt")))
        # Up to two, always leaving one, so "stop" is a real answer.
        if seat == 1 and len(found["chosen"]) < 2 and len(options) > 1:
            pick = options[0]["actionId"]
            found["chosen"].append("card:" + re.search(r"card:(\d+)", pick).group(1))
        # Seat 2 declines; seat 1 stops after two.
    elif dkind == "chooseSpellAbilityToPlay":
        if not started:
            started = True
            found["at_start"] = {
                str(who): {
                    "battlefield": [c["id"] for c in state[1].get("battlefield", [])
                                    if c.get("seat") == who and c.get("name") == LEYLINE],
                    "hand": player(1, who).get("handCount"),
                } for who in (1, 2)
            }
            found["at_start"]["2"]["leylines_in_hand"] = len(
                [c for c in state.get(2, {}).get("hand", []) if c.get("name") == LEYLINE])
        # Seat 1 plays Swamps; seat 2 plays nothing at all.
        if seat == 1:
            lands = [o for o in options if "Play land" in (o.get("label") or "")]
            pick = lands[0]["actionId"] if lands else None
            acted = acted or pick is not None
    elif dkind == "chooseCardsToDiscardToMaximumHandSize":
        if seat == 2 and discarding is None:
            me = player(2, 2)
            discarding = (me.get("handCount"), me.get("graveyardCount"))
        pick = options[0]["actionId"] if options else None
    elif dkind in ("mulliganKeepHand", "chooseStartingPlayer", "applyManaToCost"):
        pick = options[0]["actionId"] if options else None
    elif not started:
        found["pregame_kinds"].append(dkind)
        pick = options[0]["actionId"] if (options and frame.get("mandatory")) else None
    else:
        pick = options[0]["actionId"] if (options and frame.get("mandatory")) else None

    respond(frame, pick)

proc.kill()
if trace:
    trace.close()
print(json.dumps(found, indent=2))

start = found["at_start"]
if not found["asked"][1] or start is None:
    print("INCONCLUSIVE: no opening-hand question, or the game never started")
    sys.exit(2)
problems = []
first_labels, first_prompt = found["asked"][1][0]
if not all(LEYLINE in (label or "") for label in first_labels):
    problems.append(f"seat 1 was offered something other than Leylines: {first_labels}")
if "begin the game" not in (first_labels[0] or "").lower():
    problems.append(f"the option is not Forge's opening-hand effect: {first_labels[0]!r}")
# One question per pick, plus the one that was answered "no more".
if len(found["asked"][1]) != len(found["chosen"]) + 1:
    problems.append(f"seat 1 made {len(found['chosen'])} picks in {len(found['asked'][1])} questions")
if not found["chosen"]:
    print("INCONCLUSIVE: seat 1 was dealt fewer than two Leylines")
    sys.exit(2)
if not found["asked"][2]:
    problems.append("seat 2 was never asked")
if sorted(start["1"]["battlefield"]) != sorted(found["chosen"]):
    problems.append(f"seat 1 chose {found['chosen']} and began with {start['1']['battlefield']}")
if start["2"]["battlefield"]:
    problems.append(f"seat 2 declined and began with {start['2']['battlefield']}")
if not start["2"]["leylines_in_hand"]:
    problems.append("seat 2's declined Leylines are not in its hand")
if found["pregame_stack"]:
    problems.append("something went on the stack before the game began -- it was cast")
if any(k in ("applyManaToCost", "payManaCost") for k in found["pregame_kinds"]):
    problems.append(f"mana was asked for before the game began: {found['pregame_kinds']}")
discard = found["discard"]
if discard is None:
    print("INCONCLUSIVE: seat 2 never discarded" + (f" ({problems})" if problems else ""))
    sys.exit(2)
known_defect = False
if discard["graveyard_after"] != discard["graveyard_before"]:
    if acted:
        problems.append(f"seat 2's discard reached its graveyard under seat 1's Leyline: {discard}")
    else:
        known_defect = True
if problems:
    print("WRONG:", "; ".join(problems))
    sys.exit(1)
if known_defect:
    print("KNOWN FORGE DEFECT: nobody acted before the discard, Forge's last-known battlefield")
    print("  did not yet hold the opening-hand Leylines, and the discard reached the graveyard.")
    print("OK (Proxic's part): chosen from the opening hand and begun on the battlefield uncast")
    sys.exit(0)
print("OK: chosen from the opening hand, begun on the battlefield uncast, and Forge's replacement applies")
