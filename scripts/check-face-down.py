"""A face-down creature, really played. P6-I, §6.44.

PHASE_06 P6-I: "Controller/opponent receive the correct asymmetric
view. Unauthorized opponent does not receive true identity or
front-face art." Required evidence: a run. The §6.44 checks had only
ever been exercised by deliberately breaking them; no morph had been
played.

    python -I scripts/check-face-down.py <worker.jar> <res-root> [trace.jsonl]

Seat 1 casts Willbender face down (morph: a 2/2 for {3}), attacks with
it, and later turns it face up for {1}{U}. Seat 2 plays Grizzly Bears,
so it is asked about blocking the face-down attacker. Checked off the
protocol, for that one card id:

  controller   seat 1 is shown Willbender, face down, known -- on the
               board and in its own questions ("Willbender (face
               down)"), never a blank name
  opponent     seat 2 is shown "Face-down", unknown, and NOTHING that
               identifies it: no printing, keywords or faces -- in every
               snapshot, and no question or notice sent to seat 2 while
               it is face down names it. What the rules make public it
               IS shown (owner decision 2026-10-20): a creature, with the
               same power and toughness its controller sees for the
               face-down 2/2 -- never the real card's 1/2
  turned up    once Forge turns it face up, seat 2 is shown Willbender
               under the SAME id

Front-face art follows from the second: the server picks a picture by
the name in the snapshot, and seat 2's says "Face-down".

Exit 0 when every property held, 1 when one did not, 2 when the
creature never went face down and came back up.
"""
import json
import re
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
SEAT1 = [("Island", 30), ("Willbender", 30)]
SEAT2 = [("Forest", 30), ("Grizzly Bears", 30)]
NAME = "Willbender"
IDENTIFYING = ("printing", "keywords", "faces", "face")
MAX_TURN = 24

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
hidden = None            # the face-down card's id, while it is face down
was_hidden = None        # the id, once it has been face down
found = {
    "controller_view": None,       # seat 1's entry while face down
    "opponent_view": None,         # seat 2's entry while face down
    "opponent_frames_checked": 0,  # seat-2-bound frames read while it was face down
    "attacked_face_down": False,
    "controller_labels": [],       # seat 1's option labels for the card while face down
    "turned_up_for_opponent": None,
    "leaks": [],
}


def entry(s, card_id):
    return next((c for c in s.get("battlefield", []) if c.get("id") == card_id), None)


def check_opponent_frame(frame):
    """Anything sent to seat 2 while the card is face down."""
    found["opponent_frames_checked"] += 1
    if frame.get("type") == "MATCH_SNAPSHOT":
        s = frame["state"]
        c = entry(s, hidden)
        if c is not None:
            found["opponent_view"] = c
            if c.get("known") or c.get("name") != "Face-down":
                found["leaks"].append(f"snapshot names it: {c}")
            for key in IDENTIFYING:
                if key in c:
                    found["leaks"].append(f"snapshot carries {key}={c[key]!r}")
        for text in s.get("notices", []):
            if NAME in text:
                found["leaks"].append(f"notice names it: {text!r}")
    elif frame.get("type") == "DECISION_REQUEST":
        for option in frame.get("options", []):
            if card_of(option.get("actionId")) == hidden and NAME in (option.get("label") or ""):
                found["leaks"].append(f"question names it: {option}")
        if NAME in (frame.get("prompt") or ""):
            found["leaks"].append(f"prompt names it: {frame.get('prompt')!r}")


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
        seat = s.get("seat")
        state[seat] = s
        if seat == 1:
            down = [c for c in s.get("battlefield", []) if c.get("seat") == 1 and c.get("faceDown")]
            if hidden is None and down:
                hidden = was_hidden = down[0]["id"]
            if hidden is not None:
                mine = entry(s, hidden)
                if mine and mine.get("faceDown"):
                    found["controller_view"] = mine
                elif mine and not mine.get("faceDown"):
                    hidden = None  # turned face up; seat 2's next snapshot is checked below
        if seat == 2 and hidden is not None:
            check_opponent_frame(frame)
        if seat == 2 and hidden is None and was_hidden is not None:
            c = entry(s, was_hidden)
            if c and c.get("known") and c.get("name") == NAME:
                found["turned_up_for_opponent"] = c
                break
        if s.get("turn", 0) > MAX_TURN:
            break
        continue

    if kind in ("GAME_ENDED", "ERROR"):
        print("stopped:", kind, frame.get("outcome") or frame.get("errorCode"), frame.get("detail"))
        break
    if kind != "DECISION_REQUEST":
        continue

    seat = frame["authorisedSeat"]
    if seat == 2 and hidden is not None:
        check_opponent_frame(frame)
    if seat == 1 and hidden is not None:
        for option in frame.get("options", []):
            label = option.get("label") or ""
            if card_of(option.get("actionId")) == hidden and label not in found["controller_labels"]:
                found["controller_labels"].append(label)
    dkind = frame.get("kind")
    options = frame.get("options", [])
    labels = [o.get("label") or "" for o in options]
    pick = None

    if dkind == "chooseSpellAbilityToPlay":
        land = [o for o, label in zip(options, labels) if "Play land" in label]
        untapped = [c for c in state.get(seat, {}).get("battlefield", [])
                    if c.get("seat") == seat and c.get("kind") == "land" and not c.get("tapped")]
        if seat == 1:
            face_down_cast = [o for o, label in zip(options, labels)
                              if NAME in label and "face down" in label]
            turn_up = [o for o, label in zip(options, labels)
                       if hidden and card_of(o["actionId"]) == hidden and "Morph" in label]
            if land:
                pick = land[0]
            elif was_hidden is None and face_down_cast and len(untapped) >= 3:
                pick = face_down_cast[0]
            elif turn_up and found["attacked_face_down"] and len(untapped) >= 2:
                pick = turn_up[0]
        else:
            bears = [o for o, label in zip(options, labels) if label.startswith("Grizzly Bears")]
            pick = land[0] if land else (bears[0] if bears and len(untapped) >= 2 else None)
    elif dkind == "declareAttackers" and seat == 1:
        # Attack with the face-down creature once, so seat 2 is asked
        # about blocking something it cannot identify.
        attack = [o for o in options if hidden and o["actionId"].startswith("attacker:")
                  and card_of(o["actionId"]) == hidden]
        if attack and not found["attacked_face_down"]:
            pick = attack[0]
            found["attacked_face_down"] = True
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

if not found["controller_view"] or not found["opponent_view"] or not found["turned_up_for_opponent"]:
    print("INCONCLUSIVE: the creature did not go face down, get seen, and come back up")
    sys.exit(2)
problems = list(found["leaks"])
ctl = found["controller_view"]
opp = found["opponent_view"]
if opp.get("kind") != "creature" or (opp.get("power"), opp.get("toughness")) != (ctl.get("power"), ctl.get("toughness")):
    problems.append(f"the opponent is not shown the public face-down creature its controller sees: "
                    f"{opp} vs {ctl.get('power')}/{ctl.get('toughness')}")
if (opp.get("power"), opp.get("toughness")) == (1, 2):
    problems.append("the opponent was shown Willbender's real 1/2")
if ctl.get("name") != NAME or not ctl.get("known"):
    problems.append(f"the controller is not shown its own face-down card: {ctl}")
labels = found["controller_labels"]
# Named, wherever the label puts it: "Stop attacking — Willbender (face
# down) — 2/2" is a take-back, offered since spec 0042.
if not labels or any(f"{NAME} (face down)" not in label for label in labels):
    problems.append(f"the controller's own questions do not name it: {labels}")
if problems:
    print("WRONG:", "; ".join(problems[:5]))
    sys.exit(1)
print(f"OK: the controller sees {NAME} face down; the opponent sees only 'Face-down' "
      f"across {found['opponent_frames_checked']} frames, then {NAME} under the same id once Forge turns it up")
