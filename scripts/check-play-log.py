"""Spec 0064 -- the play log, written per seat, in a real game (Mechanics Lab).

    python -I scripts/check-play-log.py <worker.jar> <res-root> [trace.jsonl]

Alice plays Mountains and Islands, casts Willbender FACE DOWN (morph),
Lightning Bolt at Bob's Grizzly Bears (or at Bob), Hill Giant, and attacks;
Bob plays Forests and Grizzly Bears and blocks when he can. Both seats'
`playLog` lines are read off the protocol and checked from BOTH seats
(HID-003):

  draws       a seat's own draws name the cards; the other seat's line for
              the same draw names none ("Bob drew a card")
  face down   Alice's line names Willbender, face down; Bob's line for the
              same cast is "a face-down spell" and no line Bob is sent names
              Willbender while it is face down
  bolt        "Alice cast Lightning Bolt targeting ..." for both seats, with
              the Bolt named (it is on the stack, public)
  combat      an attack line ("Alice attacked Bob with ...") and a damage line
              carrying Bob's life total, for both seats
  turns       a turn header per turn, for both seats
  timing      every line arrives in a snapshot of the revision it carries
              (HID-005: never ahead of the board)

Then check-hidden-log.py runs over this game's trace (every card a line
names is one that seat's own snapshots name).

Exit 0 when every property held, 1 when one did not, 2 when the game never
reached its moments.
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, verdict  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None

SEAT1 = [("Mountain", 12), ("Island", 10), ("Willbender", 12), ("Lightning Bolt", 14), ("Hill Giant", 12)]
SEAT2 = [("Forest", 24), ("Grizzly Bears", 36)]

logs = {1: [], 2: []}          # seat -> every line it was sent, in order
timing = []                    # lines whose rev is not their snapshot's
st = {"face_down": None, "bolted": False, "attacked": False, "blocks": 0, "bolts": 0}


def text(line):
    out = []
    for p in line.get("parts", []):
        if isinstance(p, str):
            out.append(p)
        elif "player" in p:
            out.append({1: "Alice", 2: "Bob"}.get(p["player"], "?"))
        else:
            out.append(f"[{p.get('label') or p.get('name')}]")
    return "".join(out)


def names(line):
    return [p.get("name") for p in line.get("parts", []) if isinstance(p, dict) and p.get("name")]


class Logged(Game):
    """The harness, also reading each seat's play log off its snapshots."""

    def run(self, policy, until=lambda g: False, max_turn=20):
        outer = until

        def watch(g):
            for seat in (1, 2):
                s = g.state.get(seat) or {}
                rev = s.get("stateRevision")
                for line in s.get("playLog", []) or []:
                    if line.get("n") in seen[seat]:
                        continue
                    seen[seat].add(line.get("n"))
                    logs[seat].append(line)
                    if line.get("rev") != rev:
                        timing.append((seat, line, rev))
            return outer(g)

        seen = {1: set(), 2: set()}
        return super().run(policy, until=watch, max_turn=max_turn)


def policy(g, f):
    kind, seat = f.get("kind"), f["authorisedSeat"]
    if kind == "chooseSpellAbilityToPlay":
        land = g.play_land(f)
        if land:
            return land
        lands = len(g.untapped_lands(seat))
        if seat == 1:
            if st["face_down"] is None and lands >= 3:
                o = next((o["actionId"] for o in f["options"]
                          if "Willbender" in (o.get("label") or "") and "face down" in (o.get("label") or "")), None)
                if o:
                    st["face_down"] = "cast"
                    return o
            if g.untapped_lands(1, "Mountain") and (st["bolted"] or g.zone(1, "battlefield", owner=2,
                                                                          name="Grizzly Bears")):
                o = g.option(f, name="Lightning Bolt", zone="hand", land=False)
                if o and st["bolts"] < 2:
                    st["bolted"] = True
                    st["bolts"] += 1
                    return o
            if lands >= 4:
                o = g.option(f, name="Hill Giant", zone="hand", land=False)
                if o:
                    return o
            return None
        if lands >= 2:
            return g.option(f, name="Grizzly Bears", zone="hand", land=False)
        return None
    if kind == "chooseTargetsFor" and seat == 1:
        # The Bolt: a Grizzly Bears of Bob's.
        # The second goes at Bob himself: damage to a player, with his life total.
        want = "Grizzly Bears" if st["bolts"] == 1 else "Bob"
        o = next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith(want)), None)
        return o or DEFAULT
    if kind == "declareAttackers" and seat == 1:
        ready = [o for o in f.get("options", []) if (o.get("actionId") or "").startswith("attacker:")]
        if ready:
            st["attacked"] = True
            return ready[0]["actionId"]
        return None
    if kind == "declareBlockers" and seat == 2:
        # One block, then Bob lets the attacks through (damage to a player).
        if st["blocks"] >= 1:
            return None
        o = next((o["actionId"] for o in f.get("options", [])
                  if (o.get("label") or "").startswith("Grizzly Bears")), None)
        if o:
            st["blocks"] += 1
        return o
    return DEFAULT


g = Logged(SEAT1, SEAT2, jar=JAR, res=RES, trace=TRACE).run(policy, max_turn=16)

problems, found = [], {}
bad = g.stopped_badly()
if bad:
    problems.append(bad)

for seat in (1, 2):
    found[f"seat {seat} lines"] = len(logs[seat])
    found[f"seat {seat} sample"] = [text(line) for line in logs[seat] if line.get("kind") != "turn"][:40]

# Turns: both seats have a header per turn they saw.
for seat in (1, 2):
    turns = sorted({line["turn"] for line in logs[seat] if line.get("kind") == "turn"})
    found[f"seat {seat} turns"] = turns
    if len(turns) < 4:
        problems.append(f"seat {seat}: only {len(turns)} turn headers")

# Draws: own named, the other seat's anonymous -- both halves (HID-003).
for seat, other in ((1, 2), (2, 1)):
    mine = [line for line in logs[seat] if " drew " in text(line) and text(line).startswith(
        {1: "Alice", 2: "Bob"}[seat])]
    theirs = [line for line in logs[other] if " drew " in text(line) and text(line).startswith(
        {1: "Alice", 2: "Bob"}[seat])]
    found[f"seat {seat}'s draws, as seat {seat} reads them"] = [text(line) for line in mine[:4]]
    found[f"seat {seat}'s draws, as seat {other} reads them"] = [text(line) for line in theirs[:4]]
    if not mine or not any(names(line) for line in mine):
        problems.append(f"seat {seat}'s own draws never named a card")
    for line in theirs:
        if names(line):
            problems.append(f"seat {other} was told what seat {seat} drew: {text(line)!r}")
    if not theirs:
        problems.append(f"seat {other} never read a line about seat {seat}'s draws")

# Face down: Alice's line names it, Bob's does not -- and nothing Bob reads names it.
alice_fd = [line for line in logs[1] if line.get("kind") == "spell" and any(
    isinstance(p, dict) and p.get("faceDown") for p in line.get("parts", []))]
bob_fd = [line for line in logs[2] if "a face-down spell" in text(line)]
found["face-down cast, Alice"] = [text(line) for line in alice_fd]
found["face-down cast, Bob"] = [text(line) for line in bob_fd]
if st["face_down"] is None:
    problems.append("INCONCLUSIVE: Willbender was never cast face down")
else:
    if not any("Willbender" in names(line) for line in alice_fd):
        problems.append("Alice's own face-down cast did not name Willbender")
    if not bob_fd:
        problems.append("Bob was never told a face-down spell was cast")
    # Until it is public: a face-down card is turned face up as it leaves the
    # battlefield, and the line that moves it then names it for everyone.
    for line in logs[2]:
        if line.get("kind") == "death" and "Willbender" in names(line):
            found["Willbender named to Bob once public"] = text(line)
            break
        if "Willbender" in names(line) or "Willbender" in text(line):
            problems.append(f"Bob was told about Willbender while it was face down: {text(line)!r}")

# The Bolt, named for both.
for seat in (1, 2):
    bolt = [text(line) for line in logs[seat] if "cast [Lightning Bolt] targeting Bob's [Grizzly Bears]" in text(line)]
    found[f"bolt, seat {seat}"] = bolt[:2]
    if st["bolted"] and not bolt:
        problems.append(f"seat {seat} never read that Alice cast Lightning Bolt")

# Combat: an attack, and damage carrying a life total, for both.
for seat in (1, 2):
    attacks = [text(line) for line in logs[seat] if " attacked " in text(line)]
    hits = [line for line in logs[seat] if line.get("kind") == "damage" and line.get("life")]
    found[f"attacks, seat {seat}"] = attacks[:3]
    if st["attacked"] and not attacks:
        problems.append(f"seat {seat} never read an attack")
    if st["attacked"] and not hits:
        problems.append(f"seat {seat} never read damage with a life total")

# HID-005: every line came in the snapshot of its own revision.
found["lines delivered in another revision's snapshot"] = len(timing)
for seat, line, rev in timing[:5]:
    problems.append(f"seat {seat}: line rev {line.get('rev')} arrived in snapshot rev {rev}: {text(line)!r}")

# And the trace check over this very game.
if TRACE:
    here = os.path.dirname(os.path.abspath(__file__))
    checked = subprocess.run([sys.executable, "-I", os.path.join(here, "check-hidden-log.py"), TRACE],
                             capture_output=True, text=True, encoding="utf-8")
    found["check-hidden-log"] = checked.stdout.strip().splitlines()[-1:] if checked.stdout else checked.stderr
    if checked.returncode == 1:
        problems.append("check-hidden-log found a leak: " + checked.stdout[-800:])

inconclusive = [p for p in problems if p.startswith("INCONCLUSIVE")]
problems = [p for p in problems if not p.startswith("INCONCLUSIVE")]
verdict(found, problems, "each seat's play log named only what that seat may see, from both seats",
        inconclusive[0] if inconclusive and not problems else None)
