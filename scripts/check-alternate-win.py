"""An alternate win, read from Forge. P6-AP.

PHASE_06 §6.149, acceptance P6-AP. Required evidence: a run.

    python -I scripts/check-alternate-win.py <worker.jar> <res-root> [trace.jsonl]

Laboratory Maniac: "If you would draw a card while your library has
no cards in it, you win the game instead." Seat 1's deck is ten cards
-- nine Islands and the Maniac -- so its library is empty within a few
turns; seat 2's is sixty Islands. Nobody attacks and nobody's life
moves. So if the game ends with seat 1 the winner, nothing about life
totals could have said so: only Forge's rule did.

Checked off the protocol:

  the result  GAME_ENDED: WINNER, seat 1
  the reason  Forge's own words name Laboratory Maniac (the winner's
              PlayerOutcome, carried as `reason`, never composed)
  the board   both players on 20 life; seat 1's library empty
  the last    a snapshot to EACH seat after the last question and
  board       before GAME_ENDED, showing both players. Without it the
              players' last picture is from the last question, and
              whatever happened after (the mill that emptied the
              library) never reaches them; and Forge drops a player
              who has lost from getPlayers(), so the loser got no
              final board and the winner's showed nobody else

Exit 0 when every property held, 1 when one did not, 2 when the game
never got there.
"""
import json
import re
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
MANIAC = "Laboratory Maniac"
SEAT1 = [("Island", 9), (MANIAC, 1)]
SEAT2 = [("Island", 60)]

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
found = {"ended": None, "maniac_out": False, "last_board": None, "final_board_sent": []}
board_since_question = set()

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
        def cards(deck):
            return [{"name": n, "quantity": q} for n, q in deck]
        send({"protocolVersion": 1, "type": "START_GAME",
              "messageId": str(uuid.uuid4()), "matchId": str(uuid.uuid4()),
              "players": [{"displayName": "Alice", "seatNumber": 1, "cards": cards(SEAT1)},
                          {"displayName": "Bob", "seatNumber": 2, "cards": cards(SEAT2)}]})
        continue

    if kind == "MATCH_SNAPSHOT":
        s = frame.get("state") or {}
        state[s.get("seat")] = s
        board_since_question.add(s.get("seat"))
        if s.get("seat") == 2:
            found["last_board"] = {p["seat"]: {"life": p["life"], "library": p["libraryCount"]}
                                   for p in s.get("players", [])}
            if any(c.get("name") == MANIAC for c in s.get("battlefield", [])):
                found["maniac_out"] = True
        continue

    if kind == "GAME_ENDED":
        found["final_board_sent"] = sorted(board_since_question)
        found["ended"] = {k: frame.get(k) for k in ("outcome", "winningSeat", "turn", "reason", "detail")}
        break
    if kind == "ERROR":
        print("worker error:", frame.get("errorCode"), frame.get("detail"))
        break
    if kind != "DECISION_REQUEST":
        continue
    board_since_question = set()

    seat = frame["authorisedSeat"]
    dkind = frame.get("kind")
    options = frame.get("options", [])
    labels = [o.get("label") or "" for o in options]
    pick = None

    if dkind == "chooseSpellAbilityToPlay":
        hand = {c["id"]: c["name"] for c in state.get(seat, {}).get("hand", [])}
        land = [o for o, label in zip(options, labels) if "Play land" in label]
        untapped = [c for c in state.get(seat, {}).get("battlefield", [])
                    if c.get("seat") == seat and c.get("name") == "Island" and not c.get("tapped")]
        maniac = [o for o in options if hand.get(card_of(o["actionId"])) == MANIAC]
        pick = land[0] if land else (maniac[0] if seat == 1 and maniac and len(untapped) >= 3 else None)
    elif dkind in ("declareAttackers", "declareBlockers"):
        pick = None
    elif dkind in ("applyManaToCost", "mulliganKeepHand", "chooseStartingPlayer", "confirmPayment",
                   "chooseCardsToDiscardToMaximumHandSize"):
        pick = options[0] if options else None
    else:
        pick = options[0] if (options and frame.get("mandatory")) else None

    send({"protocolVersion": 1, "type": "DECISION_RESPONSE", "messageId": str(uuid.uuid4()),
          "decisionId": frame["decisionId"], "seat": seat, "stateVersion": frame["stateVersion"],
          "actionId": pick["actionId"] if pick else None})

proc.kill()
if trace:
    trace.close()
print(json.dumps(found, indent=2))

ended, board = found["ended"], found["last_board"]
if not ended or not found["maniac_out"]:
    print("INCONCLUSIVE: the game did not end with the Maniac out")
    sys.exit(2)
problems = []
if ended["outcome"] != "WINNER" or ended["winningSeat"] != 1:
    problems.append(f"not a seat-1 win: {ended}")
if MANIAC not in str(ended.get("reason")):
    problems.append(f"Forge's reason does not name the Maniac: {ended.get('reason')!r}")
if board and (board.get(1, {}).get("life") != 20 or board.get(2, {}).get("life") != 20):
    problems.append(f"life moved, so life could have decided it: {board}")
if found["final_board_sent"] != [1, 2]:
    problems.append(f"the final board went to seats {found['final_board_sent']} between the last question "
                    "and GAME_ENDED, not to both")
if board and sorted(board) != [1, 2]:
    problems.append(f"the loser's final board does not show both players: {board}")
if board and board.get(1, {}).get("library") != 0:
    problems.append(f"seat 1's library was not empty: {board}")
if problems:
    print("WRONG:", "; ".join(problems))
    sys.exit(1)
print("OK: Forge declared the alternate win, and said why, with both players on 20 life")
