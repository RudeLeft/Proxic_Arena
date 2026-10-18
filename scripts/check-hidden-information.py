"""Play a real game and assert nothing leaks — PHASE_06 §6.42, §6.45.

§6.45 asks for "actual production-boundary tests". This is that
boundary: the bytes the worker puts on the wire, read by a program
that knows what each seat is allowed to see. Nothing is mocked and
nothing is inspected in memory — if a snapshot carries something it
should not, it is carried here too.

§6.42 is the rule being checked. Hidden information must be REMOVED
before serialisation, not hidden afterwards. A browser that receives
an opponent's hand and declines to draw it has already lost the
information, so the test is not "is it displayed" but "is it on the
wire at all".

    python -I scripts/check-hidden-information.py <worker.jar> <res-root>

Exits non-zero on the first violation, naming it.
"""
import json
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TURNS_TO_PLAY = 400

proc = subprocess.Popen(
    ["java", "-jar", JAR, RES],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL,
    text=True,
    encoding="utf-8",
    bufsize=1,
)

violations = []
snapshots = 0
checked_cards = 0


def send(obj):
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()


def check(snapshot, seat):
    """Everything in one snapshot that could be a leak."""
    global checked_cards

    # The hand in a snapshot is the VIEWER'S OWN, always. A card
    # in it belonging to another seat is an opponent's hand on the
    # wire, which is the leak §6.42 exists to prevent.
    for card in snapshot.get("hand", []):
        checked_cards += 1
        if card.get("seat") != seat:
            violations.append(
                f"seat {seat} was sent a hand card belonging to seat {card.get('seat')}: {card}"
            )

    # A card the viewer may not identify must carry no identity.
    # "Face-down" is the only name allowed through.
    for card in snapshot.get("battlefield", []) + snapshot.get("hand", []):
        checked_cards += 1
        if not card.get("known") and card.get("name") != "Face-down":
            violations.append(
                f"seat {seat} was told the identity of a card it may not see: {card}"
            )

    # Library contents are hidden from EVERYONE, including their
    # owner. Only counts may travel.
    if "library" in snapshot:
        violations.append(f"seat {seat} was sent library contents")
    for player in snapshot.get("players", []):
        for forbidden in ("hand", "library", "cards"):
            if forbidden in player:
                violations.append(
                    f"seat {seat} was sent {forbidden} contents for seat {player.get('seat')}"
                )
        for required in ("life", "handCount", "libraryCount"):
            if required not in player:
                violations.append(f"seat {seat} snapshot is missing {required}")

    # §6.46 — every id typed. A bare integer cannot identify a
    # game object, because card ids and stack ids share a range.
    for card in snapshot.get("battlefield", []) + snapshot.get("hand", []):
        if not str(card.get("id", "")).startswith("card:"):
            violations.append(f"untyped object id: {card.get('id')}")
    for item in snapshot.get("stack", []):
        if not str(item.get("id", "")).startswith("stack:"):
            violations.append(f"untyped stack id: {item.get('id')}")


decisions = 0
last_revision = {}
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
        deck = [{"name": "Mountain", "quantity": 40}, {"name": "Staggershock", "quantity": 25}]
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

    elif kind == "MATCH_SNAPSHOT":
        snapshots += 1
        seat = frame.get("seat")
        state = frame.get("state", {})
        check(state, seat)

        # §6.41 — the revision is monotonic per viewer.
        revision = state.get("stateRevision")
        if seat in last_revision and revision < last_revision[seat]:
            violations.append(
                f"seat {seat} revision went backwards: {last_revision[seat]} -> {revision}"
            )
        last_revision[seat] = revision

    elif kind == "DECISION_REQUEST":
        decisions += 1
        if decisions > TURNS_TO_PLAY:
            break
        options = frame.get("options", [])
        send({
            "protocolVersion": 1,
            "type": "DECISION_RESPONSE",
            "messageId": str(uuid.uuid4()),
            "decisionId": frame["decisionId"],
            "seat": frame["authorisedSeat"],
            "stateVersion": frame["stateVersion"],
            "actionId": options[0]["actionId"] if options else None,
        })

    elif kind in ("GAME_ENDED", "ERROR"):
        break

proc.kill()

print(f"snapshots checked: {snapshots}")
print(f"cards inspected:   {checked_cards}")
print(f"decisions played:  {decisions}")

if violations:
    print(f"\nFAILED — {len(violations)} violation(s):")
    for problem in dict.fromkeys(violations):
        print("  ", problem)
    sys.exit(1)

if snapshots == 0:
    sys.exit("no snapshots were produced; the check proved nothing")

print("\nOK — no hidden information reached a viewer that may not see it")
