"""Play a real Forge game through the worker and report what stops it.

PHASE_06 §6.105, §6.106. Phase 6's remaining work is a loop: play
until Forge asks for an interaction the adapter does not implement,
read which one, implement it, repeat. This runs one turn of that
loop in about a minute, locally, without a server, a database, a
browser or a second person.

It speaks the same transport the server does -- line-delimited JSON
on the worker's stdin/stdout -- so what it proves is what a real
match would do.

    python -I scripts/play-a-game.py <worker.jar> <forge-res-root> [first|land]

    first   take the first action Forge offers; reaches new ground
            fastest, because passing forever just decks out
    land    play lands and pass on everything else, which separates
            "can we PLAY things" from "can we TARGET things"

Decisions answered and stubs reached are printed, and the final
GAME_ENDED carries §6.106's evidence: the Forge method that is not
implemented yet.
"""
import json
import subprocess
import sys
import threading
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
STRATEGY = sys.argv[3] if len(sys.argv) > 3 else "first"

proc = subprocess.Popen(
    ["java", "-jar", JAR, RES],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    encoding="utf-8",
    bufsize=1,
)

stderr_lines = []


def drain_stderr():
    for line in proc.stderr:
        stderr_lines.append(line.rstrip())


threading.Thread(target=drain_stderr, daemon=True).start()


def send(obj):
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()


def deck(entries):
    return [{"name": n, "quantity": q} for n, q in entries]


def frames():
    for line in proc.stdout:
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            yield json.loads(line)
        except ValueError:
            continue


decisions = 0
first_land = False
for frame in frames():
    kind = frame.get("type")

    if kind == "WORKER_READY":
        print("worker ready, forge", frame.get("forgeRelease"))
        send({
            "protocolVersion": 1,
            "type": "START_GAME",
            "messageId": str(uuid.uuid4()),
            "matchId": str(uuid.uuid4()),
            "players": [
                {"displayName": "Alice", "seatNumber": 1,
                 "cards": deck([("Mountain", 40), ("Staggershock", 25)])},
                {"displayName": "Bob", "seatNumber": 2,
                 "cards": deck([("Mountain", 40), ("Staggershock", 25)])},
            ],
        })

    elif kind == "GAME_STARTED":
        print("game started, turn", frame.get("turn"))

    elif kind == "DECISION_REQUEST":
        decisions += 1
        options = frame.get("options", [])
        if decisions <= 6 or (decisions % 50 == 0):
            labels = [o.get("label") for o in options]
            print(f"decision {decisions} seat {frame.get('authorisedSeat')}: {labels}")
        if STRATEGY == "land":
            # Play lands only, pass on everything else: lands need
            # no targets, so this isolates whether PLAYING works
            # from whether TARGETING does.
            lands = [o for o in options if "Mountain" in (o.get("label") or "")]
            action = lands[0]["actionId"] if lands else None
            if lands:
                first_land = True
        else:
            action = options[0]["actionId"] if options else None
            if options:
                first_land = True
        send({
            "protocolVersion": 1,
            "type": "DECISION_RESPONSE",
            "messageId": str(uuid.uuid4()),
            "decisionId": frame["decisionId"],
            "seat": frame["authorisedSeat"],
            "stateVersion": frame["stateVersion"],
            "actionId": action,
        })

    elif kind == "GAME_ENDED":
        print("\n=== GAME_ENDED ===")
        print(json.dumps(frame, indent=2))
        break

    elif kind == "ERROR":
        print("\n=== ERROR ===")
        print(json.dumps(frame, indent=2))
        break

print(f"\ndecisions answered: {decisions}")
stubs = [line for line in stderr_lines if "STUB REACHED" in line]
if stubs:
    print("\n=== stubs reached ===")
    for line in dict.fromkeys(stubs):
        print("  ", line)
trace = [line for line in stderr_lines if "Exception" in line or "\tat net.barnflix" in line]
if trace:
    print("\n=== exception lines ===")
    for line in trace[:15]:
        print("  ", line)

proc.kill()
