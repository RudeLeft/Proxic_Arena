"""A player thinking over a mulligan is not a hung start. §6.29.

PHASE_06 §6.29: "Human gameplay decisions do not use this startup
timeout." Found in CI, 2026-10-20: the worker gave a game 120 seconds
to reach its first priority window, counting the pregame questions --
which come BEFORE that window -- so a host who mulliganed for a while
had the match failed under them.

    python -I scripts/check-start-budget.py <worker.jar> <res-root>

The real worker, with its start budget cut to 3 seconds
(-Dproxic.startBudgetSeconds=3). Seat 1's first opening-hand question
is held for 8 seconds before it is answered. The game must start
(GAME_STARTED), not fail (GAME_START_FAILED): the 8 seconds were a
player's, not Forge's.

Exit 0 when it started, 1 when the wait was counted against it, 2 when
no pregame question came.
"""
import json
import subprocess
import sys
import time
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
BUDGET, HOLD = 3, 8
DECK = [{"name": "Island", "quantity": 60}]

proc = subprocess.Popen(
    ["java", f"-Dproxic.startBudgetSeconds={BUDGET}", "-jar", JAR, RES],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL, text=True, encoding="utf-8", bufsize=1)


def send(obj):
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()


held = None
outcome = None
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
        send({"protocolVersion": 1, "type": "START_GAME", "messageId": str(uuid.uuid4()),
              "matchId": str(uuid.uuid4()),
              "players": [{"displayName": "Alice", "seatNumber": 1, "cards": DECK},
                          {"displayName": "Bob", "seatNumber": 2, "cards": DECK}]})
        continue
    if kind == "GAME_STARTED":
        outcome = "started"
        break
    if kind == "ERROR" and frame.get("errorCode") == "GAME_START_FAILED":
        outcome = f"failed: {frame.get('detail')}"
        break
    if kind != "DECISION_REQUEST":
        continue
    options = frame.get("options", [])
    if held is None:
        # The first pregame question: a player taking their time.
        held = frame.get("kind")
        time.sleep(HOLD)
    send({"protocolVersion": 1, "type": "DECISION_RESPONSE", "messageId": str(uuid.uuid4()),
          "decisionId": frame["decisionId"], "seat": frame["authorisedSeat"],
          "stateVersion": frame["stateVersion"],
          "actionId": options[0]["actionId"] if options else None})

proc.kill()
print(json.dumps({"held": held, "held_seconds": HOLD, "budget_seconds": BUDGET, "outcome": outcome}))
if held is None:
    print("INCONCLUSIVE: no pregame question to hold")
    sys.exit(2)
if outcome != "started":
    print(f"WRONG: a player's {HOLD}s on '{held}' was counted against Forge's {BUDGET}s start budget: {outcome}")
    sys.exit(1)
print(f"OK: held '{held}' for {HOLD}s against a {BUDGET}s start budget, and the game still started")
