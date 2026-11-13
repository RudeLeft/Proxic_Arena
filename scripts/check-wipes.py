"""Phase 10 A-07 -- board wipes, many cards at once (Mechanics Lab).

    python -I scripts/check-wipes.py <worker.jar> <res-root> [trace] [scenario...]

The Lab had two board wipes (PHASE_10 Amendment 1, row 12); these are the
games the jump check replays to see a full table leave together. Alice
builds a board, Bob does too, then Alice wipes it:

  wrath       Wrath of God: five or more creatures a side -- Alice's two
              piles of Soldier tokens and an indestructible Darksteel Myr,
              Bob's Memnites, Ornithopters and Bears. Every creature but the
              Myr is destroyed, all in ONE round, told to both seats; the Myr stays.
  pyroclasm   Pyroclasm: two damage to each creature. Bob's small ones die,
              Alice's Hill Giant and Bob's Centaur Courser (3/3) live.
  pestilence  Pestilence, {B} twice: one damage to each creature AND each
              player per activation -- the creatures die, both lives fall 2.
  judgment    Day of Judgment with an Aura (Holy Strength) and Equipment
              (Bonesplitter) attached: the creatures go, the Aura goes with
              its creature, the Equipment stays on the table, attached to
              nothing.
  infest      Infest: -2/-2 to every creature (a -X/-X wipe, dying, not
              destroyed: why "died").
  evacuation  Evacuation: every creature back to its owner's hand, tokens
              too (they cease to exist).

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its point.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]

# Bob: free creatures at once, then a Bears or a Courser as his Forests come.
BOB_DECK = [("Forest", 20), ("Memnite", 12), ("Ornithopter", 12), ("Grizzly Bears", 8), ("Centaur Courser", 8)]
BOB_HAND = {"hand": ["Forest", "Memnite", "Memnite", "Ornithopter", "Ornithopter", "Forest", "Grizzly Bears"],
            "top": ["Forest", "Centaur Courser", "Forest", "Grizzly Bears", "Forest", "Forest"]}
BOB_CASTS = ["Memnite", "Ornithopter", "Centaur Courser", "Grizzly Bears"]


def game(name, seat1, seat2, deal):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"wipes-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal)


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


class Watch:
    """Every snapshot each seat was sent, in order."""

    def __init__(self, g):
        self.g = g
        self.revisions = {1: -1, 2: -1}
        self.snaps = {1: [], 2: []}

    def see(self):
        for seat in (1, 2):
            s = self.g.state.get(seat)
            if s and s.get("stateRevision") != self.revisions[seat]:
                self.revisions[seat] = s.get("stateRevision")
                self.snaps[seat].append(s)

    def rounds(self, seat):
        """Each snapshot's moves off the battlefield, as one round."""
        return [[m for m in s.get("moves") or [] if m["from"]["zone"] == "battlefield"] for s in self.snaps[seat]]


def creatures(g, seat, owner):
    return [c for c in g.zone(seat, "battlefield", owner=owner) if c.get("kind") == "creature"]


def wipe(name, seat1, hand, top, build, ready, fire, times=1, seat2=None, bob=None):
    """Alice casts `build` (in that order of preference) until `ready(g)`,
    then `fire` -- (card name, label part, zone) -- `times` times, the stack
    empty between. Bob casts his free creatures and what his lands allow."""
    g = game(name, seat1, seat2 or BOB_DECK, deal={1: {"hand": hand, "top": top}, 2: bob or BOB_HAND})
    w = Watch(g)
    st = {"fired": 0, "before": None}

    def policy(g, f):
        w.see()
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        stack = (g.state.get(1) or {}).get("stack")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack:
                return None
            if seat == 2:
                for card in BOB_CASTS:
                    o = g.option(f, name=card, zone="hand", land=False)
                    if o:
                        return o
                return None
            if st["fired"] < times and ready(g) and (fire[2] != "hand" or g.zone(1, "hand", name=fire[0])):
                o = g.option(f, name=fire[0], contains=fire[1], zone=fire[2], land=False)
                if o:
                    if st["fired"] == 0:
                        st["before"] = {s: [c for c in creatures(g, 1, s)] for s in (1, 2)}
                    st["fired"] += 1
                    return o
            if st["fired"]:
                return None
            for card, part, zone in (build(g) if callable(build) else build):
                # option() also takes a label that starts with the name: an
                # ability of the same card on the battlefield is not a cast.
                if zone == "hand" and not g.zone(1, "hand", name=card):
                    continue
                o = g.option(f, name=card, contains=part, zone=zone, land=False)
                if o:
                    return o
            return None
        if kind == "chooseTargetsFor" and seat == 1:
            # An Aura or an Equip: on one of Alice's own creatures.
            mine = {c["id"] for c in creatures(g, 1, 1)}
            o = next((o for o in f["options"] if o.get("objectId") in mine), None)
            if o:
                return o["actionId"]
        return DEFAULT

    def until(g):
        w.see()
        return st["fired"] >= times and not (g.state.get(1) or {}).get("stack") and all(
            any(len(r) >= 3 for r in w.rounds(seat)) for seat in (1, 2))

    g.run(policy, until=until, max_turn=24)
    w.see()
    return g, w, st


def big_round(w, seat):
    rounds = [r for r in w.rounds(seat) if r]
    return max(rounds, key=len) if rounds else []


def told_both(w, problems, at_least, why=None, to=None):
    """Both seats were told the same wipe, in one round, at least
    `at_least` cards off the battlefield, each with `why` / to `to`."""
    got = {}
    for seat in (1, 2):
        r = big_round(w, seat)
        got[seat] = r
        if len(r) < at_least:
            problems.append(f"seat {seat}: {len(r)} left the battlefield in one round, want {at_least}+")
        for m in r:
            if why and m.get("card") and m.get("why") != why:
                problems.append(f"seat {seat}: {m} should be '{why}'")
            if to and m["to"]["zone"] != to:
                problems.append(f"seat {seat}: {m} should go to {to}")
    if len(got[1]) != len(got[2]):
        problems.append(f"the seats were told different wipes: {len(got[1])} and {len(got[2])}")
    return got


def names_on(g, seat):
    return sorted(c.get("name") for c in g.zone(seat, "battlefield"))


def base(g, st, w):
    found = {"stopped": g.stopped_badly(), "fired": st["fired"],
             "before": {s: sorted(c.get("name") for c in v) for s, v in (st["before"] or {}).items()},
             "after": {s: names_on(g, s) for s in (1, 2)},
             "round": {s: len(big_round(w, s)) for s in (1, 2)}}
    problems = [found["stopped"]] if found["stopped"] else []
    return found, problems


# --- the scenarios ------------------------------------------------------------


def wrath():
    g, w, st = wipe(
        "wrath", [("Plains", 24), ("Raise the Alarm", 14), ("Darksteel Myr", 10), ("Wrath of God", 12)],
        hand=["Plains", "Plains", "Plains", "Raise the Alarm", "Raise the Alarm", "Darksteel Myr", "Raise the Alarm"],
        top=["Plains", "Wrath of God", "Plains", "Plains", "Raise the Alarm", "Plains"],
        build=[("Darksteel Myr", None, "hand"), ("Raise the Alarm", None, "hand")],
        ready=lambda g: len(creatures(g, 1, 1)) >= 5 and any(
            c.get("name") == "Darksteel Myr" for c in creatures(g, 1, 1))
        and sum(1 for c in creatures(g, 1, 1) if c.get("token")) >= 4
        and len(creatures(g, 1, 2)) >= 5 and len(g.untapped_lands(1)) >= 4,
        fire=("Wrath of God", None, "hand"))
    found, problems = base(g, st, w)
    if not st["fired"]:
        return "inconclusive", "never had five creatures a side and Wrath of God", found
    n = len(st["before"][1]) + len(st["before"][2]) - 1
    told_both(w, problems, n, why="destroyed", to="graveyard")
    for seat in (1, 2):
        if names_on(g, seat).count("Darksteel Myr") != 1:
            problems.append(f"seat {seat}: the indestructible Myr should stay: {names_on(g, seat)}")
        if any(c.get("kind") == "creature" and c.get("name") != "Darksteel Myr" for c in g.zone(seat, "battlefield")):
            problems.append(f"seat {seat}: a creature survived Wrath: {names_on(g, seat)}")
    return result(problems, f"Wrath of God: {n} creatures (tokens among them) left in one round, the Myr stayed",
                  found)


def pyroclasm():
    g, w, st = wipe(
        "pyroclasm", [("Mountain", 26), ("Hill Giant", 14), ("Raging Goblin", 10), ("Pyroclasm", 10)],
        hand=["Mountain", "Mountain", "Mountain", "Raging Goblin", "Raging Goblin", "Hill Giant", "Pyroclasm"],
        top=["Mountain", "Mountain", "Mountain", "Mountain"],
        build=[("Hill Giant", None, "hand"), ("Raging Goblin", None, "hand")],
        ready=lambda g: any(c.get("name") == "Hill Giant" for c in creatures(g, 1, 1))
        and any(c.get("name") == "Centaur Courser" for c in creatures(g, 1, 2))
        and len(creatures(g, 1, 2)) >= 5 and len(g.untapped_lands(1)) >= 2,
        fire=("Pyroclasm", None, "hand"))
    found, problems = base(g, st, w)
    if not st["fired"]:
        return "inconclusive", "never had the Giant, the Courser and five of Bob's out with Pyroclasm", found
    small = sum(1 for s in (1, 2) for c in st["before"][s] if c.get("name") not in ("Hill Giant", "Centaur Courser"))
    told_both(w, problems, small, why="died", to="graveyard")
    for seat in (1, 2):
        left = names_on(g, seat)
        for big in ("Hill Giant", "Centaur Courser"):
            if big not in left:
                problems.append(f"seat {seat}: {big} (3/3) should live: {left}")
    return result(problems, f"Pyroclasm: {small} small creatures died together; the 3/3s lived", found)


def pestilence():
    g, w, st = wipe(
        "pestilence", [("Swamp", 26), ("Pestilence", 12), ("Walking Corpse", 12)],
        hand=["Swamp", "Swamp", "Swamp", "Pestilence", "Walking Corpse", "Walking Corpse", "Swamp"],
        top=["Swamp", "Swamp", "Swamp", "Swamp"],
        build=[("Pestilence", None, "hand"), ("Walking Corpse", None, "hand")],
        ready=lambda g: bool(g.mine(1, name="Pestilence")) and len(creatures(g, 1, 1)) >= 2
        and len(creatures(g, 1, 2)) >= 5 and len(g.untapped_lands(1)) >= 2,
        fire=("Pestilence", None, "battlefield"), times=2)
    found, problems = base(g, st, w)
    if st["fired"] < 2:
        return "inconclusive", "never activated Pestilence twice with creatures out", found
    told_both(w, problems, 3, to="graveyard")
    lives = {s: [[p.get("life") for p in snap.get("players", [])] for snap in w.snaps[s]] for s in (1, 2)}
    found["lives"] = {s: v[-1] for s, v in lives.items()}
    for seat in (1, 2):
        if not any(life and all(x is not None and x <= 18 for x in life) for life in lives[seat]):
            problems.append(f"seat {seat}: both players should have taken 2: {lives[seat][-1]}")
    return result(problems, "Pestilence twice: the creatures died together, both players took 2", found)


def judgment():
    g, w, st = wipe(
        "judgment", [("Plains", 24), ("Savannah Lions", 14), ("Holy Strength", 8), ("Bonesplitter", 6),
                     ("Day of Judgment", 8)],
        hand=["Plains", "Plains", "Savannah Lions", "Savannah Lions", "Bonesplitter", "Holy Strength", "Plains"],
        top=["Plains", "Day of Judgment", "Plains", "Savannah Lions", "Plains", "Plains"],
        # The Aura and the Equip only once Alice has a creature to put them
        # on; equipped once, not again.
        build=lambda g: ([("Holy Strength", None, "hand")] if creatures(g, 1, 1) else [])
        + ([("Bonesplitter", "Equip", "battlefield")] if creatures(g, 1, 1) and not any(
            c.get("name") == "Bonesplitter" and c.get("attachedTo") for c in g.mine(1)) else [])
        + [("Bonesplitter", None, "hand"), ("Savannah Lions", None, "hand")],
        ready=lambda g: any(c.get("name") == "Holy Strength" and c.get("attachedTo") for c in g.mine(1))
        and any(c.get("name") == "Bonesplitter" and c.get("attachedTo") for c in g.mine(1))
        and len(creatures(g, 1, 2)) >= 4 and len(g.untapped_lands(1)) >= 4,
        fire=("Day of Judgment", None, "hand"))
    found, problems = base(g, st, w)
    if not st["fired"]:
        return "inconclusive", "never had an Aura and Equipment on and Day of Judgment", found
    got = told_both(w, problems, 4)
    for seat in (1, 2):
        names = {}
        for s in w.snaps[seat]:
            for c in s.get("battlefield") or []:
                names[c["id"]] = c.get("name")
        gone = [names.get(m.get("card")) for m in got[seat]]
        if "Holy Strength" not in gone and not any(m["to"]["zone"] == "graveyard" for m in got[seat]):
            problems.append(f"seat {seat}: the Aura should go with its creature: {gone}")
        split = [c for c in g.zone(seat, "battlefield") if c.get("name") == "Bonesplitter"]
        if not split or split[0].get("attachedTo"):
            problems.append(f"seat {seat}: Bonesplitter should stay, attached to nothing: {split}")
        if any(c.get("kind") == "creature" for c in g.zone(seat, "battlefield")):
            problems.append(f"seat {seat}: a creature survived: {names_on(g, seat)}")
    return result(problems, "Day of Judgment: creatures and the Aura went together; the Equipment stayed, unattached",
                  found)


def infest():
    g, w, st = wipe(
        "infest", [("Swamp", 26), ("Walking Corpse", 14), ("Infest", 12)],
        hand=["Swamp", "Swamp", "Swamp", "Walking Corpse", "Walking Corpse", "Infest", "Swamp"],
        top=["Swamp", "Swamp", "Swamp"],
        build=[("Walking Corpse", None, "hand")],
        ready=lambda g: len(creatures(g, 1, 1)) >= 2 and len(creatures(g, 1, 2)) >= 5
        and len(g.untapped_lands(1)) >= 3,
        fire=("Infest", None, "hand"))
    found, problems = base(g, st, w)
    if not st["fired"]:
        return "inconclusive", "never cast Infest with creatures a side", found
    n = sum(1 for s in (1, 2) for c in st["before"][s] if c.get("name") != "Centaur Courser")
    told_both(w, problems, n, why="died", to="graveyard")
    return result(problems, f"Infest: {n} creatures died together at -2/-2", found)


def evacuation():
    g, w, st = wipe(
        "evacuation", [("Island", 26), ("Memnite", 14), ("Evacuation", 10),
                       ("Plains", 10), ("Raise the Alarm", 10)],
        hand=["Island", "Island", "Plains", "Memnite", "Memnite", "Raise the Alarm", "Island"],
        top=["Island", "Evacuation", "Plains", "Island"],
        build=[("Raise the Alarm", None, "hand"), ("Memnite", None, "hand")],
        ready=lambda g: len(creatures(g, 1, 1)) >= 4 and len(creatures(g, 1, 2)) >= 5
        and len(g.untapped_lands(1)) >= 5,
        fire=("Evacuation", None, "hand"))
    found, problems = base(g, st, w)
    if not st["fired"]:
        return "inconclusive", "never cast Evacuation with creatures a side", found
    n = len(st["before"][1]) + len(st["before"][2])
    got = told_both(w, problems, n)
    for seat in (1, 2):
        cards = [m for m in got[seat] if m["to"]["zone"] == "hand"]
        if len(cards) < n - 2:
            problems.append(f"seat {seat}: every card creature should go to its owner's hand: {got[seat]}")
        if any(c.get("kind") == "creature" for c in g.zone(seat, "battlefield")):
            problems.append(f"seat {seat}: a creature stayed: {names_on(g, seat)}")
    return result(problems, f"Evacuation: {n} creatures, tokens too, back to hands in one round", found)


SCENARIOS = {"wrath": wrath, "pyroclasm": pyroclasm, "pestilence": pestilence, "judgment": judgment,
             "infest": infest, "evacuation": evacuation}

if __name__ == "__main__":
    worst = 0
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        verdict_, message, found = scenario()
        code = {"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_]
        worst = 1 if 1 in (worst, code) else max(worst, code)
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:2000])
        sys.stdout.flush()
    sys.exit(worst)
