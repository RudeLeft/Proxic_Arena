"""Is the card you put on top the card you draw next?

PHASE_06 §6.50, AGENTS TEST-011.

    python -I scripts/check-library-order.py <worker.jar> <res-root>

Brainstorm draws three and puts two back on top of your library,
and which of them you draw next turn is the whole card. The
ordering reaches the adapter as a list to be sorted; getting the
sort right and then handing it back the wrong way round draws the
other card, every time, and nothing anywhere says so. Forge's own
AI controller carries the comment that makes this a trap:

    Cards going to the top of a deck are returned in reverse order.

So "orderMoveToZoneList was asked 57 times" is not evidence. This
answers it with a named card and then watches the hand:

  1. the question asks which card to draw first (once "which goes
     closest to the top") -- answer it
  2. wait for that player to draw exactly one card
  3. it has to be the card that was put on top

Exactly one, because a Brainstorm draws three at once and which of
those was on top is then unknowable. Draws of three are skipped
rather than guessed at.

A deck of Islands and Brainstorms, so nothing else moves cards
between zones and the only ordering question is this one.
"""
import json
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
DECK = [("Island", 40), ("Brainstorm", 25)]
WANT = 5

proc = subprocess.Popen(
    ["java", "-jar", JAR, RES],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL, text=True, encoding="utf-8", bufsize=1)


def send(obj):
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()


hands = {}          # seat -> set of card ids currently in hand
expecting = {}      # seat -> (id, label) put closest to the top
results = []        # (expected label, drawn label, ok)
skipped = 0
asked = 0

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
        deck = [{"name": n, "quantity": q} for n, q in DECK]
        send({"protocolVersion": 1, "type": "START_GAME",
              "messageId": str(uuid.uuid4()), "matchId": str(uuid.uuid4()),
              "players": [{"displayName": "Alice", "seatNumber": 1, "cards": deck},
                          {"displayName": "Bob", "seatNumber": 2, "cards": deck}]})

    elif kind == "MATCH_SNAPSHOT":
        seat = frame.get("seat")
        state = frame.get("state") or {}
        hand = {card.get("id"): card for card in state.get("hand", [])}
        before = hands.get(seat)
        hands[seat] = hand

        pending = expecting.get(seat)
        if pending is not None and before is not None:
            gained = [cid for cid in hand if cid not in before]
            if len(gained) == 1:
                drawn = hand[gained[0]]
                label = f"{drawn.get('name')} ({gained[0]})"
                results.append((pending[1], label, gained[0] == pending[0]))
                expecting.pop(seat)
            elif len(gained) > 1:
                # A Brainstorm drew three at once; which was on top
                # is not knowable from this.
                globals()["skipped"] = skipped + 1
                expecting.pop(seat)

    elif kind == "DECISION_REQUEST":
        options = frame.get("options", [])
        labels = [o.get("label") or "" for o in options]
        seat = frame.get("authorisedSeat")
        pick = None

        if frame.get("kind") == "orderMoveToZoneList":
            asked += 1
            prompt = frame.get("prompt") or ""
            if ("closest to the top" in prompt or "want to draw" in prompt) and options:
                # Take the LAST option offered, not the first: the
                # first would also be the answer of an
                # implementation that ignores the choice entirely.
                pick = options[-1]
                # The option id is TYPED for its question --
                # "order:card:12" -- while a snapshot names the same
                # card "card:12". Comparing them raw reported five
                # correct draws out of five as failures.
                expecting[seat] = (
                    str(pick.get("actionId")).replace("order:", "", 1), labels[-1])
            else:
                pick = options[0] if options else None
        else:
            lands = [o for o, label in zip(options, labels) if "Play land" in label]
            casts = [o for o, label in zip(options, labels)
                     if "Play land" not in label and "Add {" not in label]
            pick = lands[0] if lands else (casts[0] if casts else None)

        send({"protocolVersion": 1, "type": "DECISION_RESPONSE",
              "messageId": str(uuid.uuid4()), "decisionId": frame["decisionId"],
              "seat": seat, "stateVersion": frame["stateVersion"],
              "actionId": pick["actionId"] if pick else None})

        if len(results) >= WANT:
            break

    elif kind == "GAME_ENDED":
        print("game ended:", frame.get("outcome"), "turn", frame.get("turn"),
              "stubs", frame.get("stubsReached"))
        break
    elif kind == "ERROR":
        print("worker error:", frame.get("errorCode"))
        break

proc.kill()

print(f"\norderings asked: {asked}, draws of more than one skipped: {skipped}")
print("\nput closest to the top -> next card drawn")
wrong = []
for expected, drawn, ok in results:
    print(f"  {expected:<28} -> {drawn:<28}{'' if ok else '  <-- not the one put on top'}")
    if not ok:
        wrong.append((expected, drawn))

print()
if not results:
    print("INCONCLUSIVE: no ordering was followed by a single draw")
    sys.exit(2)
if wrong:
    print(f"WRONG: {len(wrong)} of {len(results)} draws were not the card put on top")
    sys.exit(1)
print(f"OK: all {len(results)} draws were the card put closest to the top")
