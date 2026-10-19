"""Measure what Phase 6 still owes — PHASE_06 §6.105, §6.106.

The rest of this phase is a loop: play, find the interaction Forge
wants that the adapter cannot represent, implement it, repeat. That
loop is sound but blind — it finds walls one at a time and never
says how many are left.

This runs the adapter in SURVEY MODE (`-Dproxic.survey=true`), where
an unimplemented decision records itself and returns a default
instead of throwing. One game then reaches every decision kind it
would have hit, not just the first.

    python -I scripts/survey-decisions.py <worker.jar> <res-root>

THE RESULT IS A SIZING TOOL AND NOTHING ELSE. The adapter's own note
is blunt about why: "a surveyed run's game result is MEANINGLESS --
returning null/false to the engine is not answering". A surveyed
game is not a game. It cannot show that anything works; it can only
show what gets asked for, which is the question here.

Several decks, because which decisions a game needs is mostly a
property of the cards in it. A mono-red burn deck will never ask how
to order blockers.
"""
import json
import subprocess
import sys
import uuid
from collections import Counter

JAR, RES = sys.argv[1], sys.argv[2]
DECISIONS_PER_DECK = 1200

# Chosen to reach different parts of the decision surface rather
# than to be good decks. Each name is one Forge already ships.
DECKS = {
    "burn": [("Mountain", 40), ("Staggershock", 25)],
    "creatures": [("Mountain", 30), ("Hellspark Elemental", 18), ("Legion Warboss", 17)],
    "mixed": [("Mountain", 34), ("Hellspark Elemental", 12),
              ("Legion Warboss", 10), ("Staggershock", 9)],
    # Planeswalkers, loyalty costs and a counter-type choice: a
    # part of the decision surface that no mono-red deck can reach.
    "counters": [("Plains", 36), ("Elspeth Resplendent", 4),
                 ("Savannah Lions", 20)],
}

stubs = Counter()
costs = Counter()
asked = Counter()
played = {}
ended = {}


def survey(name, cards):
    proc = subprocess.Popen(
        ["java", "-Dproxic.survey=true", "-jar", JAR, RES],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        bufsize=1,
    )

    def send(obj):
        proc.stdin.write(json.dumps(obj) + "\n")
        proc.stdin.flush()

    decisions = 0
    asked_for_counters = False
    for line in proc.stdout:
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            frame = json.loads(line)
        except ValueError:
            continue

        kind = frame.get("type")
        if kind == "WORKER_READY":
            deck = [{"name": n, "quantity": q} for n, q in cards]
            send({
                "protocolVersion": 1,
                "type": "START_GAME",
                "messageId": str(uuid.uuid4()),
                "matchId": str(uuid.uuid4()),
                "players": [
                    {"displayName": "Alice", "seatNumber": 1, "cards": deck},
                    {"displayName": "Bob", "seatNumber": 2, "cards": deck},
                ],
            })

        elif kind == "DECISION_REQUEST":
            decisions += 1
            if decisions > DECISIONS_PER_DECK:
                # Out of budget. The counters live in the worker,
                # so ASK FOR THEM rather than killing the process
                # and losing the entire run's measurement -- a
                # surveyed game often does not end at all, which
                # is the case where this matters most.
                if not asked_for_counters:
                    asked_for_counters = True
                    send({
                        "protocolVersion": 1,
                        "type": "GAME_RESULT",
                        "messageId": str(uuid.uuid4()),
                        "timeoutSeconds": 0,
                    })
                continue
            options = frame.get("options", [])
            labels = [o.get("label") or "" for o in options]
            # Play like a person, for the reason play-a-game.py
            # explains at length: a script that taps its lands for
            # nothing never pays for anything.
            lands = [o for o, lab in zip(options, labels) if "Play land" in lab]
            casts = [o for o, lab in zip(options, labels)
                     if "Play land" not in lab and "Add {" not in lab]
            chosen = lands[0] if lands else (casts[0] if casts else None)
            send({
                "protocolVersion": 1,
                "type": "DECISION_RESPONSE",
                "messageId": str(uuid.uuid4()),
                "decisionId": frame["decisionId"],
                "seat": frame["authorisedSeat"],
                "stateVersion": frame["stateVersion"],
                "actionId": chosen["actionId"] if chosen else None,
            })

        elif kind in ("GAME_ENDED", "GAME_RESULT"):
            stubs.update(frame.get("stubsReached", {}))
            costs.update(frame.get("costsReached", {}))
            asked.update(frame.get("asked", {}))
            ended[name] = frame.get("outcome", "?")
            break

        elif kind == "ERROR":
            print(f"  {name}: worker error {frame.get('errorCode')}")
            break

    played[name] = decisions
    proc.kill()


for name, cards in DECKS.items():
    print(f"surveying {name}...")
    survey(name, cards)

print()
print("=== decisions ANSWERED (implemented) ===")
for kind, count in asked.most_common():
    print(f"  {count:7d}  {kind}")

print()
print("=== decisions NOT IMPLEMENTED, reached anyway ===")
if not stubs:
    print("   none — these decks ask for nothing that is missing")
for kind, count in stubs.most_common():
    print(f"  {count:7d}  {kind}")

print()
print("=== cost types NOT IMPLEMENTED ===")
if not costs:
    print("   none")
for kind, count in costs.most_common():
    print(f"  {count:7d}  {kind}")

print()
print(f"decisions driven: {played}")
print(f"ended: {ended}")
print("NOTE: a surveyed game is not a game. This sizes what is")
print("missing; it proves nothing about what works.")
