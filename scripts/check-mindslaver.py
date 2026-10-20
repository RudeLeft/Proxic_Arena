"""Mindslaver: one player answers for another. P6-U.

PHASE_06 §6.37, §6.38, acceptance P6-U. Required evidence: a run.

    python -I scripts/check-mindslaver.py <worker.jar> <res-root> [trace.jsonl]

"{4}, {T}, Sacrifice Mindslaver: You control target player during
that player's next turn. (You see all cards that player could see and
make all decisions for the player.)" Checked off the protocol:

  routing    during seat 2's controlled turn, its questions say
             actedForSeat 2, authorisedSeat 1 -- Forge's answer to
             "who decides", not the seat's owner
  refusal    seat 2 answering one of them is refused (WRONG_SEAT);
             seat 1's answer is accepted
  sight      seat 1 sees seat 2's hand during that turn -- and not
             before it: Forge says who may see, card by card
  return     after that turn, seat 2 answers its own questions again
  one view   every snapshot round sends each seat ONE snapshot, its
             own, and the controlled seat keeps receiving its own
             during the controlled turn. The first run of this found
             the controlled player filed under the master's seat: two
             snapshots a round to seat 1, one built from seat 2's view,
             and none to seat 2.

A focused deck (Layer B): Mountains and Mindslavers. Seat 1 plays
lands, casts Mindslaver at six, sacrifices it at the next chance
targeting seat 2. Seat 2 plays lands only.

Exit 0 when every property held, 1 when one did not, 2 when control
was never taken.
"""
import json
import re
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
DECK = [("Mountain", 40), ("Mindslaver", 20)]
SLAVER = "Mindslaver"
MAX_TURN = 30

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


def respond(frame, action_id, seat=None):
    send({"protocolVersion": 1, "type": "DECISION_RESPONSE",
          "messageId": str(uuid.uuid4()), "decisionId": frame["decisionId"],
          "seat": seat or frame["authorisedSeat"], "stateVersion": frame["stateVersion"],
          "actionId": action_id})


def card_of(action_id):
    m = re.search(r"card:(\d+)", action_id or "")
    return f"card:{m.group(1)}" if m else None


state = {}
found = {
    "activated": None,            # the turn Mindslaver was used
    "controlled": [],             # (decisionId, kind, actedFor, authorised) for seat-2 questions while controlled
    "wrong_seat": None,           # the gate's verdict on seat 2 answering one
    "seen_before": None,          # seat 2 hand cards seat 1 saw before control
    "seen_during": None,          # ... during
    "after": None,                # first seat-2 question after the controlled turn
}
probing = None                    # a controlled question being probed
per_revision = {}                 # (seat, stateRevision) -> snapshots sent
seat2_during = 0                  # snapshots seat 2 got while controlled
controlled_turn = None

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
        key = (frame.get("seat"), s.get("stateRevision"))
        per_revision[key] = per_revision.get(key, 0) + 1
        if frame.get("seat") != s.get("seat"):
            per_revision[("mislabelled", key)] = 1
        if s.get("seat") == 2 and controlled_turn is not None and not found["after"]:
            seat2_during += 1
        if s.get("seat") == 1:
            seen = [c["name"] for c in s.get("otherHands", []) if c.get("owner") == 2 and c.get("known")]
            if controlled_turn is not None and s.get("turn") == controlled_turn and s.get("activeSeat") == 2:
                found["seen_during"] = found["seen_during"] or seen
            elif found["activated"] is None and seen:
                found["seen_before"] = seen
        if s.get("turn", 0) > MAX_TURN or found["after"]:
            break
        continue

    if kind == "ERROR" and probing:
        found["wrong_seat"] = frame.get("detail")
        # Now seat 1 answers it, as Forge asked.
        respond(probing, None if not probing.get("mandatory") else probing["options"][0]["actionId"])
        probing = None
        continue
    if kind == "DECISION_ACCEPTED" and probing:
        found["wrong_seat"] = "ACCEPTED"
        probing = None
        break
    if kind in ("GAME_ENDED", "ERROR"):
        print("stopped:", kind, frame.get("outcome") or frame.get("errorCode"), frame.get("detail"))
        break
    if kind != "DECISION_REQUEST":
        continue

    acted, seat = frame.get("actedForSeat"), frame["authorisedSeat"]
    dkind = frame.get("kind")
    options = frame.get("options", [])
    labels = [o.get("label") or "" for o in options]
    turn = state.get(1, {}).get("turn")
    pick = None

    if acted == 2 and seat == 1:
        # Seat 2's decision, answered by seat 1.
        controlled_turn = controlled_turn or turn
        found["controlled"].append((frame["decisionId"], dkind, acted, seat))
        if found["wrong_seat"] is None:
            # Seat 2 tries to answer its own question. It may not.
            probing = frame
            respond(frame, options[0]["actionId"] if options else None, seat=2)
            continue
        pick = None if not frame.get("mandatory") else (options[0] if options else None)
    elif acted == 2 and seat == 2 and controlled_turn is not None and turn is not None and turn > controlled_turn:
        found["after"] = {"decisionId": frame["decisionId"], "kind": dkind, "turn": turn}
        pick = None
    elif dkind == "chooseSpellAbilityToPlay" and seat == 1:
        mine = [c for c in state.get(1, {}).get("battlefield", []) if c.get("seat") == 1]
        lands = [c for c in mine if c.get("name") == "Mountain" and not c.get("tapped")]
        out = [c for c in mine if c.get("name") == SLAVER]
        use = [o for o, label in zip(options, labels) if "You control target player" in label]
        land = [o for o, label in zip(options, labels) if "Play land" in label]
        cast = [o for o, label in zip(options, labels)
                if label.startswith(SLAVER) and "control target" not in label and "Play land" not in label]
        if out and use and len(lands) >= 4 and found["activated"] is None:
            pick = use[0]
            found["activated"] = turn
        elif land:
            pick = land[0]
        elif not out and cast and len(lands) >= 6 and found["activated"] is None:
            pick = cast[0]
    elif dkind == "chooseSpellAbilityToPlay":
        land = [o for o, label in zip(options, labels) if "Play land" in label]
        pick = land[0] if land else None
    elif dkind == "chooseTargetsFor" and seat == 1:
        pick = next((o for o, label in zip(options, labels) if "Bob" in label), options[0] if options else None)
    elif dkind in ("applyManaToCost", "mulliganKeepHand", "chooseStartingPlayer", "confirmPayment",
                   "chooseCardsToDiscardToMaximumHandSize", "CostSacrifice"):
        pick = options[0] if options else None
    elif dkind in ("declareAttackers", "declareBlockers"):
        pick = None
    else:
        pick = options[0] if (options and frame.get("mandatory")) else None

    respond(frame, pick["actionId"] if pick else None)

proc.kill()
if trace:
    trace.close()
print(json.dumps(found, indent=2))

if not found["controlled"]:
    print("INCONCLUSIVE: Mindslaver never took control" + (f" (used on turn {found['activated']})" if found["activated"] else ""))
    sys.exit(2)
problems = []
if found["wrong_seat"] != "WRONG_SEAT":
    problems.append(f"seat 2 answering its controlled decision: {found['wrong_seat']}")
if not found["seen_during"]:
    problems.append("seat 1 controlled seat 2 and never saw seat 2's hand")
if found["seen_before"]:
    problems.append(f"seat 1 saw seat 2's hand BEFORE control: {found['seen_before']}")
doubled = {k: n for k, n in per_revision.items() if n > 1}
if doubled:
    problems.append(f"a seat got more than one snapshot in a round: {list(doubled)[:3]}")
if seat2_during == 0:
    problems.append("the controlled player received no snapshots of their own during control")
if not found["after"]:
    problems.append("seat 2 never answered its own question again after the controlled turn")
if problems:
    print("WRONG:", "; ".join(problems))
    sys.exit(1)
print("OK: Forge's controller answers, the controlled player cannot, and sight follows control")
