"""Player and global state beyond the zones. P6-AO.

PHASE_06 §6.95-§6.97, acceptance P6-AO. Required evidence: a run.

    python -I scripts/check-player-state.py <worker.jar> <res-root> [trace.jsonl]

The snapshot carries Forge's state generically -- every counter on a
player, Forge's designations, the command zone, day or night -- and
this checks four kinds of it from the Mechanics Lab, each produced by
real play and read off the protocol:

  energy     Aether Hub enters: seat 1 has an ENERGY counter
  poison     Glistener Elf (infect) hits seat 2 unblocked: seat 2 has
             POISON counters, and its life is unchanged
  monarch    Palace Jailer enters: seat 1 is the monarch
  day/night  Reckless Stormseeker (daybound) enters: it is day

Every one is Forge's value, sent the same way; nothing here is a rule
written for one mechanic (§6.96).

The first run of this found two adapter faults, both fixed: paying
energy (Aether Hub's coloured mana) was an unimplemented cost that
ended the match, and declining "which mana ability?" eight times
ended it too. The second has its own check, check-mana-choice.py.

A focused deck (Layer B), one list for both seats; seat 1 plays the
four cards and attacks with the Elf, seat 2 plays lands only.

Exit 0 when every property held, 1 when one did not, 2 when the game
never produced them all.
"""
import json
import re
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
# Ten Aether Hubs, not four: energy is seen only once a Hub is drawn, and
# with four about one game in ten ended (the Elf's poison) before one was
# -- inconclusive in CI, 2026-10-21. Seven of each basic still cast all three.
DECK = [("Forest", 7), ("Plains", 8), ("Mountain", 7), ("Aether Hub", 10),
        ("Glistener Elf", 8), ("Palace Jailer", 8), ("Reckless Stormseeker", 8)]
CASTS = ["Glistener Elf", "Palace Jailer", "Reckless Stormseeker"]
MAX_TURN = 40

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
found = {"energy": None, "poison": None, "poisoned_life": None, "monarch": None, "dayTime": None,
         "failed": None}


def player(s, seat):
    return next((p for p in s.get("players", []) if p.get("seat") == seat), {})


def counter(p, name):
    return next((c["count"] for c in p.get("counters", []) if name in str(c.get("name")).upper()), 0)


def mine(seat, name=None):
    return [c for c in state.get(seat, {}).get("battlefield", [])
            if c.get("seat") == seat and (name is None or c.get("name") == name)]


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
        if s.get("seat") == 2:   # judged from the OPPONENT's view: this state is public
            p1, p2 = player(s, 1), player(s, 2)
            found["energy"] = max(found["energy"] or 0, counter(p1, "ENERGY")) or found["energy"]
            if counter(p2, "POISON"):
                found["poison"] = counter(p2, "POISON")
                found["poisoned_life"] = p2.get("life")
            if "monarch" in (p1.get("designations") or []):
                found["monarch"] = "seat 1"
            # The FIRST value seen: the Stormseeker entering makes it day.
            if s.get("dayTime") and not found["dayTime"]:
                found["dayTime"] = s["dayTime"]
        if all(found[k] for k in ("energy", "poison", "monarch", "dayTime")) or s.get("turn", 0) > MAX_TURN:
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

        def from_hand(name, play_land=None):
            for o, label in zip(options, labels):
                if hand.get(card_of(o["actionId"])) == name and \
                        (play_land is None or ("Play land" in label) == play_land):
                    return o
            return None

        lands = mine(1)
        names = [c["name"] for c in lands]
        if not mine(1, "Aether Hub"):
            pick = from_hand("Aether Hub", True)
        for basic in ("Plains", "Forest", "Mountain"):
            if pick is None and names.count(basic) < 2:
                pick = from_hand(basic, True)
        if pick is None:
            pick = from_hand("Plains", True) or from_hand("Mountain", True) or from_hand("Forest", True)
        untapped = len([c for c in lands if "Land" in str(c.get("types")) and not c.get("tapped")])
        cost = {"Glistener Elf": 1, "Palace Jailer": 4, "Reckless Stormseeker": 3}
        for name in CASTS:
            if pick is None and not mine(1, name) and untapped >= cost[name]:
                pick = from_hand(name, False)
    elif dkind == "chooseSpellAbilityToPlay":
        pick = next((o for o, label in zip(options, labels) if "Play land" in label), None)
    elif dkind == "declareAttackers" and seat == 1:
        # The Elf, and only the Elf -- and only until it has poisoned
        # once: ten poison counters end the game before the rest.
        elf = {c["id"] for c in mine(1, "Glistener Elf")}
        if not found["poison"]:
            # attacker: only -- once it attacks, the Elf is also offered as
            # "unattack:" (take it back), and choosing that looped for ever.
            pick = next((o for o in options if o["actionId"].startswith("attacker:")
                         and card_of(o["actionId"]) in elf), None)
    elif dkind in ("declareAttackers", "declareBlockers"):
        pick = None
    # chooseManaAbility too: Aether Hub asks which of its two abilities,
    # and "no" cancels the spell -- which this script then cast again, for
    # ever (1.1 million questions in one CI run, 2026-10-21).
    elif dkind in ("applyManaToCost", "mulliganKeepHand", "chooseStartingPlayer", "confirmPayment",
                   "chooseCardsToDiscardToMaximumHandSize", "chooseManaAbility"):
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

if found["failed"]:
    print(f"WRONG: the match failed: {found['failed']}")
    sys.exit(1)
missing = [k for k in ("energy", "poison", "monarch", "dayTime") if not found[k]]
if missing:
    print(f"INCONCLUSIVE: never saw {missing}")
    sys.exit(2)
problems = []
if found["poisoned_life"] != 20:
    problems.append(f"infect damage took life instead of only giving poison: life {found['poisoned_life']}")
# The first daybound permanent makes it DAY (rule 726.2). Checking only
# "day or night" let an inverted reading of Forge's flag through.
if found["dayTime"] != "day":
    problems.append(f"a daybound permanent entering should make it day, not {found['dayTime']!r}")
if problems:
    print("WRONG:", "; ".join(problems))
    sys.exit(1)
print("OK: energy, poison, the monarch and day/night all reach the board as Forge state")
