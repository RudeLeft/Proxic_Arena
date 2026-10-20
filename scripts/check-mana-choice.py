"""Declining a mana ability is a choice, not a crash. §6.189 regression.

    python -I scripts/check-mana-choice.py <worker.jar> <res-root> [trace.jsonl]

Found by the P6-AO check: a player paying with a land that has two
mana abilities is asked which one. Passing there -- "never mind, not
this land" -- returned to the payment, which is right. But the loop
guard of §6.189 counted each pass as the payment "making no progress"
and ENDED THE MATCH after eight. The guard exists for automation that
spins without a person (Phase 0A measured 679,963 identical attempts);
a person declining is waited for every time and is not that.

Shivan Reef ("{T}: Add {C}." and "{T}: Add {U} or {R}.") pays the {1}
of Bonesplitter, so the question is always real. Seat 1 declines it
ten times running, then answers; the game must still be running and
Bonesplitter must resolve.

Exit 0 when it held, 1 when the match failed or the spell did not
resolve, 2 when the question never came up.
"""
import json
import re
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
DECK = [("Shivan Reef", 30), ("Bonesplitter", 30)]
DECLINES = 10
MAX_TURN = 12

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
found = {"declined": 0, "ability_options": None, "resolved": False, "failed": None}

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
        if s.get("seat") == 1 and any(c.get("name") == "Bonesplitter" and c.get("seat") == 1
                                      for c in s.get("battlefield", [])):
            found["resolved"] = True
            break
        if s.get("turn", 0) > MAX_TURN:
            break
        continue

    if kind in ("GAME_ENDED", "ERROR"):
        print("stopped:", kind, frame.get("outcome") or frame.get("errorCode"), frame.get("detail"))
        if frame.get("outcome") == "FAILED":
            found["failed"] = frame.get("detail")
        break
    if kind != "DECISION_REQUEST":
        continue

    seat = frame["authorisedSeat"]
    dkind = frame.get("kind")
    options = frame.get("options", [])
    labels = [o.get("label") or "" for o in options]
    pick = None

    if dkind == "chooseSpellAbilityToPlay" and seat == 1:
        hand = {c["id"]: c["name"] for c in state.get(1, {}).get("hand", [])}
        land = [o for o, label in zip(options, labels) if "Play land" in label]
        cast = [o for o in options if hand.get(card_of(o["actionId"])) == "Bonesplitter"]
        untapped = [c for c in state.get(1, {}).get("battlefield", [])
                    if c.get("seat") == 1 and c.get("name") == "Shivan Reef" and not c.get("tapped")]
        pick = land[0] if land else (cast[0] if cast and untapped else None)
    elif dkind == "chooseManaAbility" and seat == 1:
        found["ability_options"] = labels
        if found["declined"] < DECLINES:
            found["declined"] += 1
            pick = None
        else:
            pick = options[0] if options else None
    elif dkind in ("applyManaToCost", "mulliganKeepHand", "chooseStartingPlayer", "confirmPayment"):
        pick = options[0] if options else None
    elif dkind == "chooseSpellAbilityToPlay":
        pick = None
    else:
        pick = options[0] if (options and frame.get("mandatory")) else None

    send({"protocolVersion": 1, "type": "DECISION_RESPONSE", "messageId": str(uuid.uuid4()),
          "decisionId": frame["decisionId"], "seat": seat, "stateVersion": frame["stateVersion"],
          "actionId": pick["actionId"] if pick else None})

proc.kill()
if trace:
    trace.close()
print(json.dumps(found, indent=2))

if found["failed"]:
    print(f"WRONG: declining a mana ability ended the match: {found['failed']}")
    sys.exit(1)
if found["declined"] < DECLINES:
    print(f"INCONCLUSIVE: the ability question came up {found['declined']} times")
    sys.exit(2)
if not found["resolved"]:
    print("WRONG: after the declines, the spell never resolved")
    sys.exit(1)
print(f"OK: declined {DECLINES} times, the game went on, and the spell was paid for after")
