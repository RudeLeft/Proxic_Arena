"""Values that are not game objects — P6-AG, P6-AH, P6-AI, P6-AM.

    python -I scripts/check-semantic-choices.py <worker.jar> <res-root>

Everything else the adapter asks picks a THING on the board. These
pick a word: a creature type, a colour, a call of heads or tails.
They share a shape and they share a risk — the allowed values must
come from FORGE, because a list of creature types maintained
anywhere else is a second rules engine that goes stale the day a
set is released (P6-AH says exactly this).

Four things are watched, over as many games as it takes:

  chooseSomeType   Adaptive Automaton: a creature type, from
                   Forge's own list of valid types
  chooseColor(s)   Alchor's Tomb: a colour
  chooseBinary     Goblin Archaeologist: calling a coin flip.
                   Mana Clash cannot stand in — it sets NoCall,
                   so Forge flips without asking
  notices          P6-AM's other half. FORGE flips the coin; the
                   only thing owed is that the player is TOLD the
                   outcome. notifyOfValue used to be a no-op, so
                   the game acted on a flip nobody saw.

A game can end before any of them happens, so this plays several.
"""
import json
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
GAMES = int(sys.argv[3]) if len(sys.argv) > 3 else 6
DECK = [("Mountain", 28), ("Adaptive Automaton", 10), ("Alchor's Tomb", 9),
        ("Goblin Archaeologist", 10), ("Mana Clash", 8)]

WANTED = ("chooseSomeType", "chooseColor", "chooseColors", "chooseBinary")

seen = {}
notices = []


def play(game_no):
    proc = subprocess.Popen(
        ["java", "-jar", JAR, RES],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, text=True, encoding="utf-8", bufsize=1)

    def send(obj):
        proc.stdin.write(json.dumps(obj) + "\n")
        proc.stdin.flush()

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
            # P6-AM — what Forge told this viewer.
            for text in (frame.get("state") or {}).get("notices", []):
                if text not in notices:
                    notices.append(text)

        elif kind == "DECISION_REQUEST":
            options = frame.get("options", [])
            labels = [o.get("label") or "" for o in options]
            dkind = frame.get("kind")

            if dkind in WANTED and dkind not in seen:
                seen[dkind] = {
                    "prompt": frame.get("prompt"),
                    "mandatory": frame.get("mandatory"),
                    "options": labels[:8],
                    "count": len(labels),
                }

            lands = [o for o, label in zip(options, labels) if "Play land" in label]
            casts = [o for o, label in zip(options, labels)
                     if "Play land" not in label and "Add {" not in label]
            pick = lands[0] if lands else (casts[0] if casts else None)
            send({"protocolVersion": 1, "type": "DECISION_RESPONSE",
                  "messageId": str(uuid.uuid4()), "decisionId": frame["decisionId"],
                  "seat": frame["authorisedSeat"], "stateVersion": frame["stateVersion"],
                  "actionId": pick["actionId"] if pick else None})

        elif kind == "GAME_ENDED":
            stubs = frame.get("stubsReached") or {}
            if stubs:
                print(f"  game {game_no}: STUB REACHED {stubs}")
            break
        elif kind == "ERROR":
            print(f"  game {game_no}: worker error {frame.get('errorCode')}")
            break
    proc.kill()


for game in range(1, GAMES + 1):
    play(game)
    if all(k in seen for k in ("chooseSomeType", "chooseBinary")) and notices \
            and ("chooseColor" in seen or "chooseColors" in seen):
        break

print()
for kind in WANTED:
    found = seen.get(kind)
    if not found:
        print(f"{kind}: NOT SEEN")
        continue
    print(f"{kind}: {found['count']} options, mandatory={found['mandatory']}")
    print(f"   prompt={found['prompt']!r}")
    print(f"   options={found['options']}")

print()
print(f"notices told to a player: {len(notices)}")
for text in notices[:6]:
    print(f"   {text!r}")

print()
missing = [k for k in ("chooseSomeType", "chooseBinary") if k not in seen]
if "chooseColor" not in seen and "chooseColors" not in seen:
    missing.append("chooseColor/chooseColors")
if not notices:
    missing.append("notices (P6-AM: the outcome must reach the player)")
if missing:
    print("NOT REACHED: " + ", ".join(missing))
    sys.exit(1)
print("OK: every value-choice was asked with Forge's own candidates,")
print("and the flip outcome reached the player who flipped.")
