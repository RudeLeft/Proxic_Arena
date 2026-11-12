"""A two-faced card turns over: same object, Forge's other face. P6-BF.

PHASE_06 §6.79, §6.81, acceptances P6-BF and P6-AJ.

    python -I scripts/check-multiface.py <worker.jar> <res-root> [trace.jsonl]

Delver of Secrets: "At the beginning of your upkeep, look at the top
card of your library. You may reveal that card. If an instant or
sorcery card is revealed this way, transform Delver of Secrets." Its
back face is Insectile Aberration, a 3/2 flier. Checked off the
protocol:

  front     on the battlefield as Delver of Secrets, 1/1, face
            Original, and both face names listed -- Forge's
  the turn  the upkeep question is answered (reveal), and Forge
            transforms it
  back      the SAME object id, now Insectile Aberration, 3/2, face
            Backside -- one object, a different face, nothing in the
            id implying one picture
  rules     its type line and power are the back face's, from Forge,
            not the printed front
  the look  "look at the top card" REACHES the player: when asked
            "Reveal?", seat 1 has already been shown which card it is (its
            report window, `reveal`; spec 0075: no "Looking at ..." line
            repeats it).
            Found missing while building this check: reveals were a
            no-op, and the question was answered about a card nobody
            had shown.
  exactly   P6-J: seat 1 reveals only an instant, as a player would,
            and declines otherwise. Seat 2 is shown every reveal
            and nothing else -- one new reveal window per "yes",
            none for a "no".

A focused deck (Layer B): Delvers, Islands, and Opts (instants), so a
revealed top card is an instant about a third of the time. Seat 1
casts one Delver and reveals every upkeep; seat 2 does nothing.

Exit 0 when every property held, 1 when one did not, 2 when no
Delver transformed in time.
"""
import json
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
DECK = [("Island", 20), ("Delver of Secrets", 20), ("Opt", 20)]
FRONT, BACK = "Delver of Secrets", "Insectile Aberration"
MAX_TURN = 30

# The deal (test-only labDeal, protocol/README.md "the Lab's deal"): the
# opening hand and the draws after it, so the scenario reaches its moment on
# the first game instead of waiting on Forge's shuffle.
DEAL = {
    1: {"hand": ["Island", "Delver of Secrets", "Island", "Island", "Island", "Island", "Delver of Secrets"], "top": ["Island", "Opt"]},
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


state = {}
found = {"front": None, "back": None, "reveal_questions": 0,
         "seen_when_asked": [],   # seat 1's latest reveal window's cards at each "Reveal?" question
         "opponent_told": [],     # the cards of each NEW reveal window seat 2 is shown
         "looking_lines": [],     # any "Looking at ..." line: none may come (spec 0075)
         "answered": []}          # (card looked at, revealed?) per question
seen_2 = set()
stop_at = None                    # the revision at which seat 1 saw the back
delver_id = None

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
                          {"displayName": "Bob", "seatNumber": 2, "cards": deck}]})
        continue

    if kind == "MATCH_SNAPSHOT":
        s = frame.get("state") or {}
        state[s.get("seat")] = s
        for note in s.get("notices") or []:
            if note.startswith("Looking at ") and note not in found["looking_lines"]:
                found["looking_lines"].append(note)
        if s.get("seat") == 2:
            # Each new reveal window seat 2 is shown, once.
            shown = s.get("reveal")
            if shown and shown.get("key") not in seen_2:
                seen_2.add(shown.get("key"))
                found["opponent_told"].append(", ".join(c.get("name") or "" for c in shown.get("cards") or []))
            # Snapshots go out seat by seat; stop only once seat 2 has
            # had the one that matches seat 1's last, or a reveal made
            # in that round is never seen (the first version stopped
            # one frame early and reported seat 2 told nothing).
            if stop_at is not None and s.get("stateRevision", 0) >= stop_at:
                break
        if s.get("seat") == 1:
            for c in s.get("battlefield", []):
                if c.get("seat") != 1:
                    continue
                if delver_id is None and c.get("name") == FRONT:
                    delver_id = c["id"]
                if c["id"] != delver_id:
                    continue
                keep = {k: c.get(k) for k in ("id", "name", "face", "faces", "power", "toughness", "types")}
                if c.get("name") == FRONT and found["front"] is None:
                    found["front"] = keep
                if c.get("name") == BACK:
                    found["back"] = keep
            if found["back"] and stop_at is None:
                stop_at = s.get("stateRevision", 0)
            if s.get("turn", 0) > MAX_TURN:
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
    prompt = frame.get("prompt") or ""
    pick = None

    if dkind == "chooseSpellAbilityToPlay" and seat == 1:
        land = [o for o, label in zip(options, labels) if "Play land" in label]
        delver = [o for o, label in zip(options, labels) if label.startswith(FRONT) and "Play land" not in label]
        pick = land[0] if land else (delver[0] if delver and delver_id is None else None)
    elif dkind == "chooseSpellAbilityToPlay":
        pick = None
    elif seat == 1 and (dkind.startswith("confirm") or "reveal" in prompt.lower()
                        or any("reveal" in label.lower() for label in labels)):
        # "You may reveal that card": yes for an instant, as a player
        # would -- it is what transforms Delver -- and no otherwise.
        found["reveal_questions"] += 1
        shown = state.get(1, {}).get("reveal") or {}
        looked = ", ".join(c.get("name") or "" for c in shown.get("cards") or []) or None
        found["seen_when_asked"].append(looked)
        reveal = looked == "Opt"
        found["answered"].append((looked, reveal))
        pick = next((o for o, label in zip(options, labels) if label.startswith("Yes" if reveal else "No")), None)
    elif dkind in ("applyManaToCost", "mulliganKeepHand", "chooseStartingPlayer",
                   "chooseCardsToDiscardToMaximumHandSize"):
        pick = options[0] if options else None
    elif dkind in ("declareAttackers", "declareBlockers"):
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

front, back = found["front"], found["back"]
if front is None:
    print("INCONCLUSIVE: Delver never reached the battlefield")
    sys.exit(2)
if back is None:
    print(f"INCONCLUSIVE: Delver never transformed ({found['reveal_questions']} reveal questions)")
    sys.exit(2)
problems = []
if front.get("face") != "Original" or front.get("faces") != [FRONT, BACK]:
    problems.append(f"the front does not say which face it is: {front}")
if (front.get("power"), front.get("toughness")) != (1, 1):
    problems.append(f"the front is not a 1/1: {front}")
if back.get("id") != front.get("id"):
    problems.append(f"transforming made a different object: {front['id']} -> {back['id']}")
if back.get("face") != "Backside" or back.get("faces") != [FRONT, BACK]:
    problems.append(f"the back does not say which face it is: {back}")
if (back.get("power"), back.get("toughness")) != (3, 2) or "Insect" not in str(back.get("types")):
    problems.append(f"the back's characteristics are not Insectile Aberration's: {back}")
looked = [n for n in found["seen_when_asked"] if n]
if len(looked) != found["reveal_questions"]:
    problems.append(f"asked to reveal a card it was not shown: {found['seen_when_asked']}")
if found["looking_lines"]:
    problems.append(f"no 'Looking at ...' line repeats a reveal window (spec 0075): {found['looking_lines']}")
revealed = [looked for looked, yes in found["answered"] if yes]
told = found["opponent_told"]
if told != revealed:
    problems.append(f"seat 2 was told {told}, and seat 1 revealed exactly {revealed}")
if problems:
    print("WRONG:", "; ".join(problems))
    sys.exit(1)
print("OK: one object, Forge's other face, with the back face's characteristics")
