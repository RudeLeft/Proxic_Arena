"""Current characteristics, not printed ones. P6-AL.

PHASE_06 §6.83-§6.85, acceptance P6-AL. Required evidence: a run.

    python -I scripts/check-characteristics.py <worker.jar> <res-root> [trace.jsonl]

Two continuous effects from the Mechanics Lab, one per seat:

  Humility    "All creatures lose all abilities and have base power
              and toughness 1/1." Seat 1's Serra Angel is 4/4 with
              Flying and Vigilance, then 1/1 with neither.
  Blood Moon  "Nonbasic lands are Mountains." Seat 2's Evolving Wilds
              has no land type and a sacrifice-to-search ability, then
              is a Mountain whose ability is to tap for red.

All read off the protocol -- the snapshot's power, toughness, keywords
and type line, and the actions Forge offers -- which is the whole
claim: the board shows what Forge says a card IS now. Printed text
says Serra Angel flies; under Humility it does not.

A focused deck (Layer B), both seats from one list; seat 1 casts the
white cards, seat 2 the red. Nobody attacks.

Exit 0 when every property held, 1 when one did not, 2 when a card
never reached the battlefield.
"""
import json
import re
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
DECK = [("Plains", 16), ("Mountain", 14), ("Serra Angel", 8), ("Humility", 8),
        ("Evolving Wilds", 6), ("Blood Moon", 8)]
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


def card_of(action_id):
    m = re.search(r"card:(\d+)", action_id or "")
    return f"card:{m.group(1)}" if m else None


state = {}
found = {"serra_before": None, "serra_after": None, "wilds_before": None, "wilds_after": None,
         "wilds_actions_before": None, "wilds_actions_after": None}


def mine(seat, name=None):
    return [c for c in state.get(seat, {}).get("battlefield", [])
            if c.get("seat") == seat and (name is None or c.get("name") == name)]


def shape(card):
    return {k: card.get(k) for k in ("id", "name", "types", "power", "toughness", "keywords")}


def done():
    return all(found[k] for k in ("serra_after", "wilds_after", "wilds_actions_after"))


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
        if s.get("seat") == 1:
            serra, humility = mine(1, "Serra Angel"), mine(1, "Humility")
            if serra and not humility:
                found["serra_before"] = shape(serra[0])
            if serra and humility:
                found["serra_after"] = shape(serra[0])
            wilds, moon = mine(2, "Evolving Wilds"), mine(2, "Blood Moon")
            if wilds and not moon:
                found["wilds_before"] = shape(wilds[0])
            if wilds and moon:
                found["wilds_after"] = shape(wilds[0])
        if done() or s.get("turn", 0) > MAX_TURN:
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
    pick = None

    def offered(name, play_land=None):
        hand = {c["id"] for c in state.get(seat, {}).get("hand", []) if c.get("name") == name}
        for o, label in zip(options, labels):
            if card_of(o["actionId"]) in hand and (play_land is None or ("Play land" in label) == play_land):
                return o
        return None

    if dkind == "chooseSpellAbilityToPlay":
        # What Forge offers for the Wilds on the battlefield: its
        # search before Blood Moon, a Mountain's red mana after.
        wilds = {c["id"] for c in mine(2, "Evolving Wilds")}
        if seat == 2 and wilds:
            acts = sorted({label.split(" — ", 1)[-1] for o, label in zip(options, labels)
                           if card_of(o["actionId"]) in wilds})
            if mine(2, "Blood Moon"):
                found["wilds_actions_after"] = acts or ["(none)"]
            elif acts:
                found["wilds_actions_before"] = acts
        untapped = [c for c in mine(seat) if "Land" in str(c.get("types")) and not c.get("tapped")]
        plains = [c for c in untapped if c.get("name") == "Plains"]
        mountains = [c for c in untapped if c.get("name") == "Mountain"]
        if seat == 1:
            pick = offered("Plains", True) or offered("Mountain", True)
            if pick is None and not mine(1, "Serra Angel") and len(untapped) >= 5 and len(plains) >= 2:
                pick = offered("Serra Angel", False)
            if pick is None and mine(1, "Serra Angel") and not mine(1, "Humility") \
                    and len(untapped) >= 4 and len(plains) >= 2:
                pick = offered("Humility", False)
        else:
            if not mine(2, "Evolving Wilds"):
                pick = offered("Evolving Wilds", True)
            pick = pick or offered("Mountain", True)
            if pick is None and mine(2, "Evolving Wilds") and not mine(2, "Blood Moon") \
                    and len(untapped) >= 3 and mountains and found["wilds_actions_before"]:
                pick = offered("Blood Moon", False)
    elif dkind in ("declareAttackers", "declareBlockers"):
        pick = None
    elif dkind in ("applyManaToCost", "mulliganKeepHand", "chooseStartingPlayer",
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

if not found["serra_before"] or not found["wilds_before"]:
    print("INCONCLUSIVE: a card never reached the battlefield")
    sys.exit(2)
if not done():
    print("INCONCLUSIVE: Humility or Blood Moon never resolved")
    sys.exit(2)
problems = []
before, after = found["serra_before"], found["serra_after"]
if (before["power"], before["toughness"]) != (4, 4) or set(before.get("keywords") or []) != {"Flying", "Vigilance"}:
    problems.append(f"Serra Angel was not printed-correct before Humility: {before}")
if (after["power"], after["toughness"]) != (1, 1):
    problems.append(f"Humility did not make it 1/1: {after}")
if after.get("keywords"):
    problems.append(f"Humility did not remove its keywords: {after}")
if after["id"] != before["id"]:
    problems.append("Serra Angel changed identity")
wb, wa = found["wilds_before"], found["wilds_after"]
if "Mountain" in str(wb["types"]):
    problems.append(f"Evolving Wilds was a Mountain before Blood Moon: {wb}")
if "Mountain" not in str(wa["types"]):
    problems.append(f"Blood Moon did not make Evolving Wilds a Mountain: {wa}")
if not any("Search" in a or "Sacrifice" in a for a in found["wilds_actions_before"]):
    problems.append(f"the Wilds' own ability was not offered before: {found['wilds_actions_before']}")
if any("Search" in a or "Sacrifice" in a for a in found["wilds_actions_after"]):
    problems.append(f"the Wilds kept its ability under Blood Moon: {found['wilds_actions_after']}")
if not any("Add {R}" in a for a in found["wilds_actions_after"]):
    problems.append(f"as a Mountain it did not tap for red: {found['wilds_actions_after']}")
if problems:
    print("WRONG:", "; ".join(problems))
    sys.exit(1)
print("OK: the snapshot and the actions follow Forge's current characteristics, not printed text")
