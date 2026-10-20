"""Attachments, as Forge has them now. P6-AK.

PHASE_06 acceptance P6-AK: "Use representative equipment/aura/
mutate/reconfigure/attachment behavior. Verify current relationships
are represented from Forge state." Required evidence: a run.

    python -I scripts/check-attachments.py <worker.jar> <res-root> [trace.jsonl]

Seat 1 plays the Mechanics Lab's attachment cards; seat 2 plays
Grizzly Bears and nothing else, so there is something of the
opponent's to enchant and to steal:

  Bonesplitter     equipped to one creature, then to another: the
                   relationship MOVES
  Pacifism         seat 1's Aura on seat 2's creature: an attachment
                   across the table
  Control Magic    seat 1's Aura on a creature it then controls: the
                   same object, a new controller, still attached
  Rabbit Battery   reconfigured onto a creature: it stops being a
                   creature and becomes Equipment attached to one

Read from BOTH seats' snapshots, because each seat's board is its own
view: every attachedTo must name a card on that seat's battlefield.
Mutate is P6-AJ's (Gemrazer) and is not repeated here.

Exit 0 when every property held, 1 when one did not, 2 when a card
never got as far as its attachment.
"""
import json
import re
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
SEAT1 = [("Island", 14), ("Plains", 10), ("Mountain", 14), ("Raging Goblin", 6),
         ("Rabbit Battery", 6), ("Bonesplitter", 6), ("Pacifism", 6), ("Control Magic", 6)]
SEAT2 = [("Forest", 30), ("Grizzly Bears", 30)]
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
found = {
    "bonesplitter_hosts": [],      # distinct attachedTo values, in order
    "pacifism": None,              # {host, host_seat}
    "control_magic": None,         # {host, host_seat_before, host_seat_after}
    "battery": None,               # {host, kind, types}
    "dangling": [],                # attachedTo naming a card the viewer does not have
}
stolen_before = {}                 # card id -> seat it had before Control Magic
intent = None                      # what the next target question is for


def bf(seat):
    return state.get(seat, {}).get("battlefield", [])


def mine(seat, name=None):
    return [c for c in bf(seat) if c.get("seat") == seat and (name is None or c.get("name") == name)]


def creatures(seat, owner_seat):
    return [c for c in bf(seat) if c.get("seat") == owner_seat and c.get("kind") == "creature"]


def untapped(seat, land=None):
    return [c for c in mine(seat) if c.get("kind") == "land" and not c.get("tapped")
            and (land is None or c.get("name") == land)]


def observe(s):
    seat = s.get("seat")
    on_board = {c["id"]: c for c in s.get("battlefield", [])}
    for c in s.get("battlefield", []):
        host = c.get("attachedTo")
        if not host:
            continue
        if host not in on_board:
            found["dangling"].append(f"seat {seat}: {c['name']} -> {host}")
            continue
        if seat != 2:
            continue  # the rest read from the opponent's view: the harder one
        name, target = c.get("name"), on_board[host]
        if name == "Bonesplitter" and (not found["bonesplitter_hosts"] or found["bonesplitter_hosts"][-1] != host):
            found["bonesplitter_hosts"].append(host)
        if name == "Pacifism":
            found["pacifism"] = {"host": host, "host_seat": target.get("seat"), "aura_seat": c.get("seat")}
        if name == "Control Magic":
            found["control_magic"] = {"host": host, "host_seat_before": stolen_before.get(host),
                                      "host_seat_after": target.get("seat"), "aura_seat": c.get("seat")}
        if name == "Rabbit Battery":
            found["battery"] = {"host": host, "kind": c.get("kind"), "types": c.get("types")}


def done():
    return (len(found["bonesplitter_hosts"]) >= 2 and found["pacifism"] and found["control_magic"]
            and found["battery"])


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
        observe(s)
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

    def offered(name, contains=None, zone="hand"):
        ids = {c["id"] for c in state.get(seat, {}).get(zone, [])
               if c.get("name") == name and (zone != "battlefield" or c.get("seat") == seat)}
        for o, label in zip(options, labels):
            if card_of(o["actionId"]) in ids and (contains is None or contains in label) \
                    and "Play land" not in label:
                return o
        return None

    if dkind == "chooseSpellAbilityToPlay" and seat == 1:
        lands_total = len(untapped(1))
        islands, plains, mountains = (len(untapped(1, n)) for n in ("Island", "Plains", "Mountain"))
        mine_creatures = creatures(1, 1)
        theirs = creatures(1, 2)
        splitter = mine(1, "Bonesplitter")
        battery = mine(1, "Rabbit Battery")
        # A land of whatever colour is shortest on the battlefield.
        have = {n: len(mine(1, n)) for n in ("Island", "Plains", "Mountain")}
        for land in sorted(have, key=have.get):
            o = next((o for o, label in zip(options, labels) if "Play land" in label
                      and any(c["id"] == card_of(o["actionId"]) and c["name"] == land
                              for c in state[1].get("hand", []))), None)
            if o:
                pick = o
                break
        moved = len(found["bonesplitter_hosts"])
        if pick is None and splitter and lands_total >= 1:
            host = splitter[0].get("attachedTo")
            others = [c for c in mine_creatures if c["id"] != host and c.get("name") != "Rabbit Battery"]
            if (moved == 0 and mine_creatures) or (moved == 1 and others):
                pick = offered("Bonesplitter", "Equip", zone="battlefield")
                intent = ("equip", host)
        if pick is None and mountains >= 1 and len([c for c in mine_creatures if c["name"] == "Raging Goblin"]) < 2:
            pick = offered("Raging Goblin")
        if pick is None and mountains >= 1 and not battery:
            pick = offered("Rabbit Battery")
        if pick is None and lands_total >= 1 and not splitter:
            pick = offered("Bonesplitter")
        if pick is None and plains >= 1 and lands_total >= 2 and theirs and not mine(1, "Pacifism"):
            pick, intent = offered("Pacifism"), ("pacifism", None)
        if pick is None and islands >= 2 and lands_total >= 4 and len(theirs) >= 1 \
                and not mine(1, "Control Magic"):
            pacified = {c.get("attachedTo") for c in mine(1, "Pacifism")}
            if any(c["id"] not in pacified for c in theirs):
                pick, intent = offered("Control Magic"), ("steal", None)
                for c in theirs:
                    stolen_before.setdefault(c["id"], c.get("seat"))
        if pick is None and mountains >= 1 and battery and not battery[0].get("attachedTo") \
                and any(c["name"] == "Raging Goblin" for c in mine_creatures):
            pick, intent = offered("Rabbit Battery", "Reconfigure", zone="battlefield"), ("reconfigure", None)
    elif dkind == "chooseSpellAbilityToPlay" and seat == 2:
        land = [o for o, label in zip(options, labels) if "Play land" in label]
        bears = offered("Grizzly Bears")
        forests = len(untapped(2, "Forest"))
        pick = land[0] if land else (bears if forests >= 2 else None)
    elif dkind == "chooseTargetsFor":
        on_board = {c["id"]: c for c in bf(seat)}
        targets = [(o, on_board.get(card_of(o["actionId"]))) for o in options]
        targets = [(o, c) for o, c in targets if c]
        want = intent[0] if intent else None
        if want in ("pacifism", "steal"):
            pacified = {c.get("attachedTo") for c in mine(1, "Pacifism")}
            pick = next((o for o, c in targets if c.get("seat") == 2 and c["id"] not in pacified), None) \
                or next((o for o, c in targets if c.get("seat") == 2), None)
        elif want == "equip":
            pick = next((o for o, c in targets if c.get("seat") == 1 and c["id"] != intent[1]
                         and c.get("name") != "Rabbit Battery"), None)
        elif want == "reconfigure":
            pick = next((o for o, c in targets if c.get("name") == "Raging Goblin"), None)
        if pick is None and options and frame.get("mandatory"):
            pick = options[0]
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

missing = [k for k in ("pacifism", "control_magic", "battery") if not found[k]]
if len(found["bonesplitter_hosts"]) < 2:
    missing.append("bonesplitter moved")
if missing:
    print("INCONCLUSIVE: never got as far as", ", ".join(missing))
    sys.exit(2)
problems = []
if found["dangling"]:
    problems.append(f"an attachment names a card the viewer does not have: {found['dangling'][:3]}")
pac = found["pacifism"]
if pac["aura_seat"] != 1 or pac["host_seat"] != 2:
    problems.append(f"Pacifism is not seat 1's Aura on seat 2's creature: {pac}")
cm = found["control_magic"]
if cm["aura_seat"] != 1 or cm["host_seat_after"] != 1 or cm["host_seat_before"] != 2:
    problems.append(f"Control Magic's creature did not move from seat 2 to seat 1, as the same object: {cm}")
bat = found["battery"]
if bat["kind"] == "creature" or "Equipment" not in str(bat["types"]):
    problems.append(f"a reconfigured Rabbit Battery is still shown as a creature: {bat}")
if problems:
    print("WRONG:", "; ".join(problems))
    sys.exit(1)
print("OK: equipment moved, Auras sit across the table and on a stolen creature, and a reconfigured "
      "creature became Equipment -- each from Forge's own state, in both seats' views")
