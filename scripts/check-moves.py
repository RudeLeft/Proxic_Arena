"""Phase 10 A-00 -- every card's move, as Forge made it (Mechanics Lab).

    python -I scripts/check-moves.py <worker.jar> <res-root> [trace] [scenario...]

The board used to guess where a card went by comparing two snapshots (a
card put into a library was drawn going to exile). Now each snapshot round
carries `moves`: where from, where to, and why a card left the battlefield.

  destroy    Murder on a Grizzly Bears: both seats are told card, from the
             battlefield, to its owner's graveyard, why "destroyed".
  sacrifice  Innocent Blood (each player sacrifices a creature): both
             leave as "sacrificed", never "destroyed".
  hidden     over every snapshot of both games: a move the seat can't see
             at either end (the other player drawing) never names the card;
             one it can see always does; a seat's own draws are named.

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


def game(name, seat1, seat2):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"moves-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


WATCHES = []


class Watch:
    """Every snapshot each seat was sent, in order."""

    def __init__(self, g):
        self.g = g
        WATCHES.append(self)
        self.revisions = {1: -1, 2: -1}
        self.snaps = {1: [], 2: []}

    def see(self):
        for seat in (1, 2):
            s = self.g.state.get(seat)
            if s and s.get("stateRevision") != self.revisions[seat]:
                self.revisions[seat] = s.get("stateRevision")
                self.snaps[seat].append(s)

    def moves(self, seat):
        return [m for s in self.snaps[seat] for m in s.get("moves") or []]


def names(snaps):
    out = {}
    for s in snaps:
        for zone in ("battlefield", "hand", "graveyard", "exile"):
            for c in s.get(zone) or []:
                out[c["id"]] = c.get("name")
    return out


# --- destroy ------------------------------------------------------------------


def destroy():
    g = game("destroy", [("Swamp", 30), ("Murder", 30)], [("Forest", 30), ("Grizzly Bears", 30)])
    w = Watch(g)
    st = {"cast": False, "target": None}

    def policy(g, f):
        w.see()
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 2:
                return g.option(f, name="Grizzly Bears", zone="hand", land=False)
            bears = [c for c in g.mine(2) if c.get("name") == "Grizzly Bears"]
            if not st["cast"] and bears and len(g.untapped_lands(1, name="Swamp")) >= 3:
                o = g.option(f, name="Murder", zone="hand", land=False)
                if o:
                    st["cast"] = True
                    return o
            return None
        if kind == "chooseTargetsFor" and seat == 1:
            o = next((o for o in f["options"] if "Grizzly Bears" in (o.get("label") or "")), None)
            if o:
                st["target"] = o.get("objectId")
                return o["actionId"]
        return DEFAULT

    def until(g):
        w.see()
        return st["target"] is not None and any(
            m.get("card") == st["target"] and m["to"]["zone"] == "graveyard" for m in w.moves(1)) and any(
            m.get("card") == st["target"] and m["to"]["zone"] == "graveyard" for m in w.moves(2))

    g.run(policy, until=until, max_turn=30)
    w.see()
    found = {"target": st["target"], "stopped": g.stopped_badly(),
             "seat1": [m for m in w.moves(1) if m.get("card") == st["target"]],
             "seat2": [m for m in w.moves(2) if m.get("card") == st["target"]]}
    if not st["target"] or not found["seat1"]:
        return "inconclusive", "never Murdered a Grizzly Bears", found
    problems = [found["stopped"]] if found["stopped"] else []
    want = {"card": st["target"], "from": {"zone": "battlefield", "seat": 2},
            "to": {"zone": "graveyard", "seat": 2}, "why": "destroyed"}
    for seat in (1, 2):
        died = [m for m in found[f"seat{seat}"] if m["from"]["zone"] == "battlefield"]
        if died != [want]:
            problems.append(f"seat {seat} should be told {want}: {died}")
    return result(problems, "Murder: both seats told the Bears went from Bob's battlefield to his graveyard, "
                            "destroyed", found)


# --- sacrifice ----------------------------------------------------------------


def sacrifice():
    # Plenty of each: CI 2026-11-06 twice ran out of turns before both sides
    # had a creature and seat 1 an Innocent Blood.
    g = game("sacrifice", [("Swamp", 22), ("Walking Corpse", 20), ("Innocent Blood", 18)],
             [("Forest", 24), ("Grizzly Bears", 36)])
    w = Watch(g)
    st = {"cast": False}

    def policy(g, f):
        w.see()
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 2:
                return g.option(f, name="Grizzly Bears", zone="hand", land=False)
            if (g.state.get(1) or {}).get("stack"):
                return None
            mine = [c for c in g.mine(1) if c.get("name") == "Walking Corpse"]
            theirs = [c for c in g.mine(2) if c.get("name") == "Grizzly Bears"]
            # Again until a sacrifice is seen: a cast with no Swamp left
            # untapped is cancelled (CI 2026-11-06 cast it once, after the
            # Corpse had used the mana, and never again).
            sacrificed = any(m.get("why") == "sacrificed" for m in w.moves(1))
            if not sacrificed and mine and theirs and g.untapped_lands(1, name="Swamp"):
                o = g.option(f, name="Innocent Blood", zone="hand", land=False)
                if o:
                    st["cast"] = True
                    return o
            if not mine:
                return g.option(f, name="Walking Corpse", zone="hand", land=False)
            return None
        return DEFAULT

    def until(g):
        w.see()
        return st["cast"] and all(
            len([m for m in w.moves(seat) if m.get("why") == "sacrificed"]) >= 2 for seat in (1, 2))

    g.run(policy, until=until, max_turn=40)
    w.see()
    gone = {seat: [m for m in w.moves(seat) if m["from"]["zone"] == "battlefield"] for seat in (1, 2)}
    found = {"stopped": g.stopped_badly(), "left": gone}
    if not st["cast"] or len(gone[1]) < 2:
        return "inconclusive", "never cast Innocent Blood with a creature on each side", found
    problems = [found["stopped"]] if found["stopped"] else []
    n = names(w.snaps[1])
    for seat in (1, 2):
        sac = sorted((n.get(m.get("card")), m["to"].get("seat")) for m in gone[seat] if m.get("why") == "sacrificed")
        if sac != [("Grizzly Bears", 2), ("Walking Corpse", 1)]:
            problems.append(f"seat {seat}: a Corpse and a Bears, sacrificed, each to its owner's graveyard: {gone[seat]}")
        if any(m.get("why") == "destroyed" for m in gone[seat]):
            problems.append(f"seat {seat}: a sacrifice is not 'destroyed': {gone[seat]}")
    return result(problems, "Innocent Blood: the Corpse and the Bears leave as 'sacrificed', to both seats", found)


# --- hidden -------------------------------------------------------------------


def visible(place, viewer):
    zone = place["zone"]
    if zone in ("battlefield", "stack", "merged", "graveyard", "command"):
        return True
    if zone == "hand":
        return place.get("seat") == viewer
    return None if zone == "exile" else False  # exile: depends on face-down


def hidden():
    checked = 0
    wrong = []
    own_draws = {1: 0, 2: 0}
    their_draws = {1: 0, 2: 0}
    for w in WATCHES:
        for seat in (1, 2):
            for m in w.moves(seat):
                checked += 1
                a, b = visible(m["from"], seat), visible(m["to"], seat)
                if (a is True or b is True) and "card" not in m:
                    wrong.append(("should name the card", seat, m))
                if a is False and b is False and "card" in m:
                    wrong.append(("must not name the card", seat, m))
                if "why" in m and "card" not in m:
                    wrong.append(("a why without its card", seat, m))
                if m["from"]["zone"] == "library" and m["to"]["zone"] == "hand":
                    if m["to"].get("seat") == seat:
                        own_draws[seat] += 1 if "card" in m else 0
                    else:
                        their_draws[seat] += 1 if "card" not in m else 0
    found = {"checked": checked, "wrong": wrong[:6], "own_draws": own_draws, "their_draws": their_draws}
    if checked < 50 or not all(own_draws.values()) or not all(their_draws.values()):
        return "inconclusive", f"too few moves seen: {found}", found
    problems = [f"{x[0]} (seat {x[1]}): {x[2]}" for x in wrong[:4]]
    return result(problems, f"{checked} moves: the other player's draws never named, every visible move named",
                  found)


SCENARIOS = {"destroy": destroy, "sacrifice": sacrifice, "hidden": hidden}

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
