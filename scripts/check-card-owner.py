"""A stolen card says whose card it is. Spec 0049.

    python -I scripts/check-card-owner.py <worker.jar> <res-root> [trace.jsonl]

A card's `seat` is its CONTROLLER (ViewerSnapshot.describe). The server
finds a card's picture in its OWNER's deck, so the snapshot must say who
that is: before spec 0049 a creature taken with Act of Treason was looked
for in the thief's deck and came out bare. Checked off the protocol:

  stolen     a creature on the battlefield with `seat` != `owner`, whose
             `owner` is the seat that cast it -- seen by BOTH seats
  every card every card in every zone names an owner (1 or 2), and off
             the battlefield and stack the owner is the controller
  stack      a spell on the stack names its card's owner

A focused deck (Layer B): Mountains, Raging Goblins and Acts of Treason,
the same for both seats. Each seat plays a land, casts a Goblin, and casts
Act of Treason on the other seat's creature when it can.

Exit 0 when every property held, 1 when one did not, 2 when nothing was
ever stolen.
"""
import json
import re
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
DECK = [("Mountain", 24), ("Raging Goblin", 16), ("Act of Treason", 20)]
GOBLIN, TREASON = "Raging Goblin", "Act of Treason"
MAX_TURN = 16
ZONES = ("battlefield", "hand", "otherHands", "graveyard", "exile", "casting")

# The deal (test-only labDeal, protocol/README.md "the Lab's deal"): the
# opening hand and the draws after it, so the scenario reaches its moment on
# the first game instead of waiting on Forge's shuffle.
DEAL = {
    1: {"hand": ["Mountain", "Mountain", "Mountain", "Raging Goblin", "Raging Goblin", "Act of Treason", "Act of Treason"], "top": ["Mountain", "Mountain"]},
    2: {"hand": ["Mountain", "Mountain", "Mountain", "Raging Goblin", "Raging Goblin", "Act of Treason", "Act of Treason"], "top": ["Mountain", "Mountain"]},
}

proc = subprocess.Popen(
    ["java", "-jar", JAR, RES, "--lab-deal"],
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


def card_of(action_id):
    m = re.search(r"card:(\d+)", action_id or "")
    return f"card:{m.group(1)}" if m else None


state = {}
cast_by = {}          # card id -> the seat it first entered the battlefield under
stolen = {}           # viewer seat -> [(card id, seat, owner)]
problems = []
stack_owners = 0

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
              "players": [{"displayName": "Alice", "seatNumber": 1, "cards": deck, "labDeal": DEAL[1]},
                          {"displayName": "Bob", "seatNumber": 2, "cards": deck, "labDeal": DEAL[2]}]})
        continue

    if kind == "MATCH_SNAPSHOT":
        s = frame.get("state") or {}
        viewer = s.get("seat")
        state[viewer] = s
        for zone in ZONES:
            for c in s.get(zone, []):
                owner = c.get("owner")
                if owner not in (1, 2):
                    problems.append(f"{zone} {c.get('id')} names no owner: {owner!r}")
                elif zone != "battlefield" and zone != "casting" and owner != c.get("seat"):
                    problems.append(f"{zone} {c.get('id')} owner {owner} but seat {c.get('seat')}")
        for c in s.get("battlefield", []):
            cast_by.setdefault(c["id"], c.get("seat"))
            if c.get("owner") != c.get("seat") and c.get("name") == GOBLIN:
                if c.get("owner") != cast_by[c["id"]]:
                    problems.append(f"{c['id']} owner {c.get('owner')}, but it came in under seat {cast_by[c['id']]}")
                stolen.setdefault(viewer, []).append((c["id"], c.get("seat"), c.get("owner")))
        for entry in s.get("stack", []):
            if entry.get("source"):
                if entry.get("owner") not in (1, 2):
                    problems.append(f"stack {entry.get('id')} names no owner")
                else:
                    stack_owners += 1
        if s.get("turn", 0) > MAX_TURN or (stolen.get(1) and stolen.get(2)):
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
    labels = [o.get("label") or "" for o in options]
    board = state.get(seat, {}).get("battlefield", [])
    pick = None

    if dkind == "chooseSpellAbilityToPlay":
        theirs = [c for c in board if c.get("seat") != seat and c.get("name") == GOBLIN]
        land = [o for o, label in zip(options, labels) if "Play land" in label]
        treason = [o for o, label in zip(options, labels) if label.startswith(TREASON)]
        goblin = [o for o, label in zip(options, labels) if label.startswith(GOBLIN)]
        if land:
            pick = land[0]
        elif theirs and treason:
            pick = treason[0]
        elif goblin:
            pick = goblin[0]
    elif dkind == "chooseTargetsFor":
        ids = {c["id"] for c in board if c.get("seat") != seat}
        pick = next((o for o in options if card_of(o.get("actionId")) in ids),
                    options[0] if options else None)
    elif dkind in ("applyManaToCost", "mulliganKeepHand", "chooseStartingPlayer", "confirmPayment",
                   "chooseCardsToDiscardToMaximumHandSize"):
        pick = options[0] if options else None
    elif dkind in ("declareAttackers", "declareBlockers"):
        pick = None
    else:
        pick = options[0] if (options and frame.get("mandatory")) else None

    respond(frame, pick["actionId"] if pick else None)

proc.kill()
if trace:
    trace.close()
print(json.dumps({"stolen": stolen, "stack entries with an owner": stack_owners}, indent=2))

if not stolen:
    print("INCONCLUSIVE: nothing was ever stolen")
    sys.exit(2)
if not (stolen.get(1) and stolen.get(2)):
    problems.append(f"only seat(s) {sorted(stolen)} saw a stolen card")
if stack_owners == 0:
    problems.append("no spell on the stack ever named its owner")
if problems:
    print("WRONG:", "; ".join(dict.fromkeys(problems)))
    sys.exit(1)
print("OK: a stolen creature names its owner to both seats, and every card says whose it is")
