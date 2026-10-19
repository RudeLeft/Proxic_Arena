"""Is the X that was ANNOUNCED the X that Forge charges and deals?

PHASE_06 §6.91, §6.105, AGENTS TEST-011.

    python -I scripts/check-x-announcement.py <worker.jar> <res-root>

"announceRequirements was asked 364 times" proves it is called. It
does not prove the answer is used. The ordinary harness answers
every decision with the first option, which here is X = 0, so 364
Fireballs dealt nothing, the game still ran to turn 118 and still
reported a winner. An implementation that ignored the player and
returned the minimum would look exactly like that -- which is the
silent-wrong-move class, not a crash.

So this announces a real number and checks the two things that
follow from it, both read off the protocol:

  the COST    after announcing X = n, the mana the player is then
              asked to find should be n plus the base
  the DAMAGE  a Fireball at a single target takes exactly n off
              that player's life

It also records how many values each question offered, which is
the other half: the list has to grow with what the board could
pay, or a player with twelve lands is quietly held to two.

A deck of Mountains and Fireballs, so the only legal targets are
the two players and the arithmetic has nothing else in it.

ONE TARGET, DELIBERATELY. Fireball deals X divided EVENLY among
any number of targets and costs {1} more for each one past the
first, so a script that keeps choosing targets sees a larger cost
and smaller damage than X -- and both look exactly like a broken
announcement. The first version of this reported X = 1 being
charged {2}{R}, and X = 3 taking one life, as faults. They were
two targets and three targets.
"""
import json
import re
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
DECK = [("Mountain", 40), ("Fireball", 25)]
WANT = 6          # Fireballs to watch resolve

proc = subprocess.Popen(
    ["java", "-jar", JAR, RES],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL, text=True, encoding="utf-8", bufsize=1)


def send(obj):
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()


life = {}                 # seat -> life, from the latest snapshot
announced = None          # X just announced, waiting for its cost
owed_checks = []          # (x, the cost asked for afterwards)
damage_checks = []        # (x, victim seat, life before, life after)
pending_damage = None
offers = []               # values offered per question
targeted = 0              # targets taken for the spell being cast

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
        state = frame.get("state") or {}
        for player in state.get("players", []):
            seat = player.get("seat")
            if seat is None:
                continue
            before = life.get(seat)
            life[seat] = player.get("life")
            # The damage lands between two snapshots.
            if (pending_damage is not None and before is not None
                    and seat == pending_damage["victim"]
                    and life[seat] != before):
                damage_checks.append((pending_damage["x"], seat,
                                      pending_damage["before"], life[seat]))
                pending_damage = None

    elif kind == "DECISION_REQUEST":
        options = frame.get("options", [])
        labels = [o.get("label") or "" for o in options]
        dkind = frame.get("kind")
        seat = frame.get("authorisedSeat")
        pick = None

        if dkind == "announceRequirements":
            offers.append(len(options))
            targeted = 0
            # The biggest X on offer that is still cheap enough to
            # pay for early, so the game keeps moving.
            values = []
            for index, label in enumerate(labels):
                found = re.search(r"=\s*(\d+)", label)
                if found:
                    values.append((int(found.group(1)), index))
            affordable = [v for v in values if v[0] <= 3]
            if affordable:
                value, index = max(affordable)
                pick = options[index]
                announced = value
                victim = 2 if seat == 1 else 1
                if value > 0:
                    pending_damage = {"x": value, "victim": victim,
                                      "before": life.get(victim)}
            else:
                pick = options[0] if options else None

        elif dkind == "applyManaToCost" and announced is not None:
            # "Mountain - still owing {3}{R}" -- the first thing
            # asked for after announcing is the whole cost.
            owed = re.search(r"still owing (\S+)", labels[0] if labels else "")
            owed_checks.append((announced, owed.group(1) if owed else "?"))
            announced = None
            pick = options[0] if options else None

        elif dkind == "chooseTargetsFor":
            if targeted == 0:
                them = "Bob" if seat == 1 else "Alice"
                for index, label in enumerate(labels):
                    if them in label:
                        pick = options[index]
                        break
                if pick is None:
                    pick = options[0] if options else None
                targeted += 1
            elif not frame.get("mandatory"):
                pick = None          # pass: no more targets
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

        if len(damage_checks) >= WANT:
            break

    elif kind == "GAME_ENDED":
        print("game ended:", frame.get("outcome"), "turn", frame.get("turn"),
              "stubs", frame.get("stubsReached"))
        break
    elif kind == "ERROR":
        print("worker error:", frame.get("errorCode"))
        break

proc.kill()

print(f"\nvalues offered per question: {sorted(set(offers))}")
print("  (one per payable amount, so this grows with the board)")

print("\nannounced X -> mana then asked for")
bad_cost = []
for x, owed in owed_checks[:12]:
    ok = str(x) in owed
    print(f"  X = {x:<3} -> {owed:<10}{'' if ok else '  <-- does not contain the X'}")
    if not ok:
        bad_cost.append((x, owed))

print("\nannounced X -> life lost by the target")
bad_damage = []
for x, seat, before, after in damage_checks:
    lost = (before or 0) - (after or 0)
    ok = lost == x
    print(f"  X = {x:<3} -> seat {seat}: {before} -> {after}  (lost {lost})"
          f"{'' if ok else '  <-- not X'}")
    if not ok:
        bad_damage.append((x, lost))

print()
if not owed_checks or not damage_checks:
    print("INCONCLUSIVE: no Fireball was both announced and resolved")
    sys.exit(2)
if bad_cost or bad_damage:
    print(f"WRONG: {len(bad_cost)} cost mismatch(es), {len(bad_damage)} damage mismatch(es)")
    sys.exit(1)
print("OK: the X announced is the X paid for and the X dealt")
