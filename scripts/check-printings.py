"""The printing a deck asked for is the printing Forge built. P6-BD.

PHASE_06 P6-BD: "Where exact printing identity is part of the accepted
deck contract, verify Forge construction preserves it." §6.33 freezes
the printing at setup; the server sends each entry's resolved set and
collector number in START_GAME. Required evidence: a run.

    python -I scripts/check-printings.py <worker.jar> <res-root> [trace.jsonl]

Seat 1's deck is two printings of each of two cards, chosen so the
difference is ONLY the printing:

  Lightning Bolt   M10 #146 and A25 #141   two sets
  Mountain         M10 #242 and M10 #245   one set, two numbers

Seat 2's is sixty M10 #243 Mountains. Every card each seat is shown
carries `printing`; checked off the protocol:

  exact       every printing seen is one that seat's deck asked for,
              for that name
  both        each requested printing of each card is seen -- the
              four did not collapse into one per name
  public      seat 2's view of seat 1's battlefield names the same
              printings seat 1's own view does

Exit 0 when every property held, 1 when one did not, 2 when not every
printing came up within the turn limit.
"""
import json
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
SEAT1 = [("Lightning Bolt", "M10", "146", 15), ("Lightning Bolt", "A25", "141", 15),
         ("Mountain", "M10", "242", 15), ("Mountain", "M10", "245", 15)]
SEAT2 = [("Mountain", "M10", "243", 60)]
MAX_TURN = 30  # 16 left about one run in a hundred without one printing drawn (CI, 2026-10-20)

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


asked = {1: {(n, f"{s}/{c}") for n, s, c, _ in SEAT1}, 2: {(n, f"{s}/{c}") for n, s, c, _ in SEAT2}}
seen = {1: {}, 2: {}}          # seat -> card id -> (name, printing), that seat's own cards
public = {}                    # card id -> printing as seat 2 sees seat 1's battlefield
own_view = {}                  # card id -> printing as seat 1 sees it
missing = []                   # cards shown with no printing


def walk(state):
    viewer = state.get("seat")
    for zone in ("hand", "battlefield", "graveyard"):
        for c in state.get(zone, []):
            if not c.get("known", True) or c.get("name") == "Face-down":
                continue
            printing = c.get("printing")
            if printing is None:
                missing.append((viewer, zone, c.get("name")))
                continue
            if c.get("seat") == viewer:
                seen[viewer][c["id"]] = (c["name"], printing)
            if zone == "battlefield" and c.get("seat") == 1:
                (own_view if viewer == 1 else public)[c["id"]] = printing


def every_printing_seen():
    return asked[1] <= set(seen[1].values())


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
            return [{"name": n, "set": s, "number": c, "quantity": q} for n, s, c, q in deck]
        send({"protocolVersion": 1, "type": "START_GAME",
              "messageId": str(uuid.uuid4()), "matchId": str(uuid.uuid4()),
              "players": [{"displayName": "Alice", "seatNumber": 1, "cards": cards(SEAT1)},
                          {"displayName": "Bob", "seatNumber": 2, "cards": cards(SEAT2)}]})
        continue

    if kind == "MATCH_SNAPSHOT":
        s = frame.get("state") or {}
        walk(s)
        if (every_printing_seen() and public) or s.get("turn", 0) > MAX_TURN:
            break
        continue

    if kind in ("GAME_ENDED", "ERROR"):
        print("stopped:", kind, frame.get("outcome") or frame.get("errorCode"), frame.get("detail"))
        break
    if kind != "DECISION_REQUEST":
        continue

    options = frame.get("options", [])
    labels = [o.get("label") or "" for o in options]
    dkind = frame.get("kind")
    pick = None
    if dkind == "chooseSpellAbilityToPlay":
        # Lands only: the printings are on show in hand and on the
        # battlefield, and nothing needs to resolve.
        land = [o for o, label in zip(options, labels) if "Play land" in label]
        pick = land[0] if land else None
    elif dkind in ("mulliganKeepHand", "chooseStartingPlayer", "chooseCardsToDiscardToMaximumHandSize"):
        pick = options[0] if options else None
    elif dkind in ("declareAttackers", "declareBlockers"):
        pick = None
    else:
        pick = options[0] if (options and frame.get("mandatory")) else None
    send({"protocolVersion": 1, "type": "DECISION_RESPONSE", "messageId": str(uuid.uuid4()),
          "decisionId": frame["decisionId"], "seat": frame["authorisedSeat"],
          "stateVersion": frame["stateVersion"], "actionId": pick["actionId"] if pick else None})

proc.kill()
if trace:
    trace.close()
from collections import Counter
print(json.dumps({
    "seat 1 printings": dict(Counter(f"{n} {p}" for n, p in seen[1].values())),
    "seat 2 printings": dict(Counter(f"{n} {p}" for n, p in seen[2].values())),
    "seat 1 battlefield as seat 2 sees it": dict(Counter(public.values())),
    "shown without a printing": missing[:5],
}, indent=2))

problems = []
for viewer in (1, 2):
    stray = {pair for pair in seen[viewer].values() if pair not in asked[viewer]}
    if stray:
        problems.append(f"seat {viewer} holds printings its deck never asked for: {sorted(stray)}")
if missing:
    problems.append(f"{len(missing)} known card(s) shown with no printing, e.g. {missing[:3]}")
for card, printing in public.items():
    if card in own_view and own_view[card] != printing:
        problems.append(f"{card}: seat 1 sees {own_view[card]}, seat 2 sees {printing}")
if problems:
    print("WRONG:", "; ".join(problems))
    sys.exit(1)
if not every_printing_seen() or not public:
    print(f"INCONCLUSIVE: not every printing came up: {sorted(asked[1] - set(seen[1].values()))}")
    sys.exit(2)
print("OK: every card is the exact printing its deck asked for -- two sets, and two collector "
      "numbers in one set -- and the opponent is shown the same printing")
