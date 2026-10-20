"""Karn Liberated: a game restarted inside the same match.

PHASE_06 §6.69-§6.72, acceptance P6-AD. Required evidence: a run.

    python -I scripts/check-karn.py <worker.jar> <res-root> [trace.jsonl]

Karn's -14: "Restart the game, leaving in exile all non-Aura
permanent cards exiled with Karn Liberated. Then put those cards onto
the battlefield under your control." Forge restarts IN PLACE -- the
same Game object, card id numbers carried over -- so the protocol has
to make the old game unreachable on its own. Checked:

  the restart   Forge performs it: the epoch goes 1 -> 2, the turn
                count starts again, both players are back at 20 life
  the carry     the cards exiled with Karn come back on the
                battlefield under seat 1's control, including ones
                seat 2 owns
  the epoch     every snapshot and question after it says game 2
  stale ids     the last answer of game 1, sent again, is refused;
                a game-1 action id sent against a game-2 question is
                refused -- nothing from before can act on what is now

A focused deck (Layer B): Plains and Karns. Seat 1 plays lands,
casts Karn at seven, +4 twice (6 -> 10 -> 14), then -14. Karn's +4
targets seat 2, who exiles a card from hand each time; seat 2 plays
lands and nothing else. Not Open Format; the worker does not check.

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
DECK = [("Plains", 40), ("Karn Liberated", 20)]
KARN = "Karn Liberated"
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


def respond(frame, action_id, decision_id=None):
    send({"protocolVersion": 1, "type": "DECISION_RESPONSE",
          "messageId": str(uuid.uuid4()), "decisionId": decision_id or frame["decisionId"],
          "seat": frame["authorisedSeat"], "stateVersion": frame["stateVersion"],
          "actionId": action_id})


def card_of(action_id):
    m = re.search(r"card:(\d+)", action_id or "")
    return f"card:{m.group(1)}" if m else None


state = {}
found = {
    "ultimate": None,        # the -14: decision id, action id, epoch, turn
    "exiled_by_karn": [],    # seat 2's cards exiled by the +4s (ids)
    "after": None,           # game 2's first board, as seat 1 sees it
    "epochs_seen": [],       # every distinct epoch on snapshots
    "question_epochs": [],   # every distinct epoch on questions
    "stale_answer": None,    # the gate's verdict on game 1's last answer
    "stale_action": None,    # ... on a game 1 action id, against a game 2 question
}
probing = None               # which stale probe is outstanding
returned = set()             # every card seen on seat 1's battlefield in game 2
waiting = None               # the game 2 question being probed


def loyalty(card):
    for counter in card.get("counters", []):
        if "LOYALTY" in str(counter.get("name")).upper():
            return counter.get("count", 0)
    return 0


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
        epoch = s.get("gameEpoch")
        if epoch == 2 and s.get("seat") == 1:
            # Any game-2 board, not just the first: Forge returns the
            # exiled cards one at a time, and the first version judged
            # at the instant between the two. (Two Karns under one
            # player then meet the legend rule, so "both at once" would
            # be the wrong test anyway.)
            returned.update(c["id"] for c in s.get("battlefield", []) if c.get("seat") == 1)
        if epoch not in found["epochs_seen"]:
            found["epochs_seen"].append(epoch)
        if epoch == 2 and s.get("seat") == 1 and found["after"] is None and s.get("phase"):
            found["after"] = {
                "turn": s.get("turn"),
                "life": {p["seat"]: p["life"] for p in s.get("players", [])},
                "seat1_battlefield": [(c["id"], c["name"], c.get("seat")) for c in s.get("battlefield", [])
                                      if c.get("seat") == 1],
                "notices": s.get("notices"),
            }
        if s.get("turn", 0) > MAX_TURN and found["ultimate"] is None:
            break
        if found["after"] is not None and found["stale_action"] is not None:
            break
        continue

    if kind == "ERROR" and probing:
        found[probing] = frame.get("detail")
        probing = "stale_action" if probing == "stale_answer" else None
        if probing == "stale_action":
            # A game-1 action id, against the game-2 question.
            respond(waiting, found["ultimate"]["actionId"])
        else:
            # Probes done. Answer the waiting question honestly and
            # play on until game 2 has a board with a turn in it.
            options = waiting.get("options", [])
            respond(waiting, options[0]["actionId"] if options and waiting.get("mandatory") else None)
        continue
    if kind == "DECISION_ACCEPTED" and probing:
        found[probing] = "ACCEPTED"
        break
    if kind in ("GAME_ENDED", "ERROR"):
        print("stopped:", kind, frame.get("outcome") or frame.get("errorCode"), frame.get("detail"))
        break
    if kind != "DECISION_REQUEST":
        continue

    seat = frame["authorisedSeat"]
    dkind = frame.get("kind")
    options = frame.get("options", [])
    labels = [o.get("label") or "" for o in options]
    epoch = frame.get("gameEpoch")
    if epoch not in found["question_epochs"]:
        found["question_epochs"].append(epoch)
    pick = None

    # Game 2's first question: probe the stale ids against it.
    if epoch == 2 and found["ultimate"] and probing is None and found["stale_answer"] is None:
        waiting = frame
        probing = "stale_answer"
        u = found["ultimate"]
        # Game 1's last answer, exactly as it was sent.
        send({"protocolVersion": 1, "type": "DECISION_RESPONSE", "messageId": str(uuid.uuid4()),
              "decisionId": u["decisionId"], "seat": 1, "stateVersion": u["stateVersion"],
              "actionId": u["actionId"]})
        continue

    if dkind == "chooseSpellAbilityToPlay" and seat == 1:
        mine = {c["id"]: c for c in state.get(1, {}).get("battlefield", []) if c.get("seat") == 1}
        karns = [c for c in mine.values() if c.get("name") == KARN]
        ultimate = [o for o, label in zip(options, labels) if "Restart the game" in label]
        plus = [o for o, label in zip(options, labels) if "exiles a card from their hand" in label]
        if karns and ultimate and loyalty(karns[0]) >= 14:
            pick = ultimate[0]
            found["ultimate"] = {"decisionId": frame["decisionId"], "stateVersion": frame["stateVersion"],
                                 "actionId": pick["actionId"], "epoch": epoch,
                                 "turn": state[1].get("turn"), "loyalty": loyalty(karns[0])}
        elif karns and plus:
            pick = plus[0]
        else:
            land = [o for o, label in zip(options, labels) if "Play land" in label]
            cast = [o for o, label in zip(options, labels)
                    if label.startswith(KARN) and "Play land" not in label
                    and card_of(o["actionId"]) in {c["id"] for c in state[1].get("hand", [])}]
            pick = land[0] if land else (cast[0] if cast and not karns else None)
    elif dkind == "chooseSpellAbilityToPlay" and seat == 2:
        land = [o for o, label in zip(options, labels) if "Play land" in label]
        pick = land[0] if land else None
    elif dkind == "chooseTargetsFor" and seat == 1:
        # Karn's +4: the opponent exiles a card.
        pick = next((o for o, label in zip(options, labels) if "Bob" in label), options[0] if options else None)
    elif seat == 2 and dkind in ("chooseSingleEntityForEffect", "chooseEntitiesForEffect", "chooseCardsForZoneChange"):
        pick = options[0] if options else None
        if pick:
            found["exiled_by_karn"].append(card_of(pick["actionId"]))
    elif dkind in ("declareAttackers", "declareBlockers"):
        pick = None
    elif dkind in ("applyManaToCost", "mulliganKeepHand", "chooseStartingPlayer", "confirmPayment",
                   "chooseCardsToDiscardToMaximumHandSize"):
        pick = options[0] if options else None
    else:
        pick = options[0] if (options and frame.get("mandatory")) else None

    respond(frame, pick["actionId"] if pick else None)

proc.kill()
if trace:
    trace.close()
print(json.dumps(found, indent=2))

u, after = found["ultimate"], found["after"]
if u is None:
    print("INCONCLUSIVE: Karn's -14 was never reached")
    sys.exit(2)
problems = []
if after is None:
    problems.append("no game-2 board was ever sent")
else:
    if after["turn"] >= u["turn"]:
        problems.append(f"the turn count did not start again: {u['turn']} -> {after['turn']}")
    if any(life != 20 for life in after["life"].values()):
        problems.append(f"life was not reset: {after['life']}")
    missing = [cid for cid in found["exiled_by_karn"] if cid and cid not in returned]
    if found["exiled_by_karn"] and missing:
        problems.append(f"cards exiled with Karn did not come back under seat 1: {missing}")
    if not any("restarted" in n for n in (after["notices"] or [])):
        problems.append(f"seat 1 was not told the game restarted: {after['notices']}")
if found["epochs_seen"][:1] != [1] or 2 not in found["epochs_seen"]:
    problems.append(f"snapshots did not go from game 1 to game 2: {found['epochs_seen']}")
if 2 not in found["question_epochs"]:
    problems.append(f"no question was marked game 2: {found['question_epochs']}")
if found["stale_answer"] in (None, "ACCEPTED"):
    problems.append(f"game 1's last answer was accepted in game 2: {found['stale_answer']}")
if found["stale_action"] in (None, "ACCEPTED"):
    problems.append(f"a game-1 action id was accepted for a game-2 question: {found['stale_action']}")
if problems:
    print("WRONG:", "; ".join(problems))
    sys.exit(1)
print("OK: Forge restarted the game, game 2 is a new epoch, and nothing from game 1 can act in it")
