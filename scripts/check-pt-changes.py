"""Spec 0078 -- creatures getting bigger or smaller, damage left, loyalty
(Mechanics Lab, Layer B).

    python -I scripts/check-pt-changes.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker. What it checks is read
from the snapshots both seats were sent -- a permanent's power, toughness,
basePower, baseToughness, damage and counters, and the round's `moves`
(a creature leaving the battlefield carries `last`: {power, toughness},
its size as it last stood there, protocol/README.md) -- never inferred:

  growth    Giant Growth on Grizzly Bears: 2/2 -> 5/5 (printed 2/2 still
            sent), then back to 2/2 at end of turn
  pridemate Soul Warden, Ajani's Pridemate, Savannah Lions: Pridemate's
            first +1/+1 counter arrives and it is 3/3 in the same board
  grasp     Grasp of Darkness on a Giant-Grown Bears (5/5): it lives as a
            1/1; the -4/-4 ends at end of turn (2/2)
  dies      Grasp of Darkness on Rumbling Baloth (4/4): it dies; its move
            to the graveyard says last {0, 0} to BOTH seats (the board the
            page drew before still said 4/4)
  anthem    Glorious Anthem with two Savannah Lions out: both go 2/1 -> 3/2
            in the same board
  damage    Rumbling Baloth attacks, Hill Giant blocks: the Baloth lives
            with damage 3 (toughness still 4), and the damage is gone the
            next turn; the Giant's move says last {3, 3}
  walker    Jace Beleren: +2 (3 -> 5 loyalty), then -1 (5 -> 4)
  counter   Spike Feeder: a +1/+1 counter removed for 2 life -- P1P1 2 -> 1,
            2/2 -> 1/1, in one board

Both seats are sent the same sizes and the same `last` (the battlefield is
public). Exit 0 when every scenario held, 1 when one did not, 2 when one
never reached its point.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]


def game(name, seat1, seat2, deal=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"pt-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal)


class Watch:
    """Every snapshot each seat was sent, once each, in order."""

    def __init__(self, g):
        self.g = g
        self.seen = {1: {}, 2: {}}

    def see(self):
        for seat in (1, 2):
            s = self.g.state.get(seat)
            if s and s.get("stateRevision") not in self.seen[seat]:
                self.seen[seat][s.get("stateRevision")] = s

    def boards(self, seat):
        return list(self.seen[seat].values())

    def sizes(self, seat, name):
        """[(rev, turn, id, power, toughness, damage, P1P1, loyalty)] for each board showing [name]."""
        out = []
        for s in self.boards(seat):
            for c in s.get("battlefield") or []:
                if c.get("name") != name:
                    continue
                counters = {k.get("name"): k.get("count") for k in c.get("counters") or []}
                out.append((s.get("stateRevision"), s.get("turn"), c.get("id"), c.get("power"), c.get("toughness"),
                            c.get("damage"), counters.get("P1P1", 0), counters.get("LOYALTY")))
        return out

    def moves(self, seat):
        return [m for s in self.boards(seat) for m in (s.get("moves") or [])]

    def same_sizes(self, name):
        strip = lambda rows: sorted({r[2:] for r in rows})  # noqa: E731
        return strip(self.sizes(1, name)) == strip(self.sizes(2, name))


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def named(g, f, name, contains=None):
    """The option that plays [name] from the hand (or, with [contains], its ability)."""
    seat = f["authorisedSeat"]
    for o in f["options"]:
        label = o.get("label") or ""
        if o.get("payable") is False or "Play land" in label:
            continue
        cid = card_of(o.get("actionId"))
        zone = "battlefield" if contains else "hand"
        if not any(c.get("id") == cid and c.get("name") == name for c in g.zone(seat, zone)):
            continue
        if contains and contains not in label:
            continue
        return o["actionId"]
    return None


def target(f, wanted):
    return next((o["actionId"] for o in f["options"] if o.get("objectId") == wanted), DEFAULT)


def growth():
    st = {"cast": False}

    def policy(g, f):
        kind = f.get("kind")
        if f["authorisedSeat"] != 1:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if (g.state.get(1) or {}).get("stack"):
                return None
            if g.mine(1, name="Grizzly Bears") and not st["cast"]:
                o = named(g, f, "Giant Growth")
                if o:
                    st["cast"] = True
                return o
            return named(g, f, "Grizzly Bears") if not g.mine(1, name="Grizzly Bears") else None
        if kind == "chooseTargetsFor":
            bears = g.mine(1, name="Grizzly Bears")
            return target(f, bears[0]["id"]) if bears else DEFAULT
        return DEFAULT

    g = game("growth", [("Forest", 30), ("Grizzly Bears", 15), ("Giant Growth", 15)], [("Island", 60)],
             deal={1: {"hand": ["Forest", "Grizzly Bears", "Forest", "Giant Growth"], "top": ["Forest"] * 4}})
    w = Watch(g)

    def until(g):
        w.see()
        rows = w.sizes(1, "Grizzly Bears")
        grown = [r for r in rows if (r[3], r[4]) == (5, 5)]
        return bool(grown) and any((r[3], r[4]) == (2, 2) and r[0] > grown[0][0] for r in rows)

    g.run(policy, until=until, max_turn=12)
    w.see()
    rows = w.sizes(1, "Grizzly Bears")
    found = {"bears": rows, "stopped": g.stopped_badly()}
    grown = [r for r in rows if (r[3], r[4]) == (5, 5)]
    if not grown:
        return "inconclusive", "Giant Growth never resolved on the Bears", found
    problems = [found["stopped"]] if found["stopped"] else []
    after = [r for r in rows if r[0] > grown[-1][0]]
    if not after or (after[0][3], after[0][4]) != (2, 2):
        problems.append(f"the Bears should go back to 2/2 after the 5/5: {after[:2]}")
    base = [c for s in w.boards(1) for c in s.get("battlefield") or [] if c.get("id") == grown[0][2]
            and c.get("power") == 5]
    if base and (base[0].get("basePower"), base[0].get("baseToughness")) != (2, 2):
        problems.append(f"the 5/5 Bears should still say printed 2/2: {base[0]}")
    if not w.same_sizes("Grizzly Bears"):
        problems.append("both seats should be sent the same sizes")
    return result(problems, "Giant Growth: Bears 2/2 -> 5/5 (printed 2/2) -> 2/2 at end of turn", found)


def pridemate():
    order = ["Soul Warden", "Ajani's Pridemate", "Savannah Lions"]

    def policy(g, f):
        if f["authorisedSeat"] != 1:
            return DEFAULT
        if f.get("kind") == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if (g.state.get(1) or {}).get("stack"):
                return None
            for name in order:
                if name != "Savannah Lions" and g.mine(1, name=name):
                    continue
                o = named(g, f, name)
                if o:
                    return o
                if name != "Savannah Lions" and not g.mine(1, name=name):
                    return None
            return None
        return DEFAULT

    g = game("pridemate", [("Plains", 30), ("Soul Warden", 10), ("Ajani's Pridemate", 10), ("Savannah Lions", 10)],
             [("Island", 60)],
             deal={1: {"hand": ["Plains", "Soul Warden", "Plains", "Ajani's Pridemate", "Savannah Lions"],
                       "top": ["Plains", "Savannah Lions", "Plains"]}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), any(r[6] >= 1 for r in w.sizes(1, "Ajani's Pridemate"))
                                   and any(r[6] >= 1 for r in w.sizes(2, "Ajani's Pridemate")))[1], max_turn=12)
    w.see()
    rows = w.sizes(1, "Ajani's Pridemate")
    found = {"pridemate": rows, "stopped": g.stopped_badly()}
    first = next((r for r in rows if r[6] >= 1), None)
    if not first:
        return "inconclusive", "Pridemate never got a counter", found
    problems = [found["stopped"]] if found["stopped"] else []
    if (first[3], first[4], first[6]) != (3, 3, 1):
        problems.append(f"the first counter and 3/3 arrive in one board: {first}")
    if not w.same_sizes("Ajani's Pridemate"):
        problems.append("both seats should be sent the same sizes and counters")
    return result(problems, "Pridemate: a +1/+1 counter and 3/3 in the same board, to both seats", found)


def grasp():
    st = {"grown": False, "grasped": False}

    def policy(g, f):
        kind = f.get("kind")
        if f["authorisedSeat"] != 1:
            return DEFAULT
        bears = g.mine(1, name="Grizzly Bears")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if (g.state.get(1) or {}).get("stack"):
                return None
            if not bears:
                return named(g, f, "Grizzly Bears")
            if bears[0].get("power") == 5 and not st["grasped"]:
                o = named(g, f, "Grasp of Darkness")
                st["grasped"] = st["grasped"] or bool(o)
                return o
            # Both spells in one turn: Giant Growth only with three lands untapped.
            if not st["grown"] and len(g.untapped_lands(1)) >= 3:
                o = named(g, f, "Giant Growth")
                st["grown"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor":
            return target(f, bears[0]["id"]) if bears else DEFAULT
        return DEFAULT

    g = game("grasp", [("Forest", 15), ("Swamp", 15), ("Grizzly Bears", 10), ("Giant Growth", 10),
                       ("Grasp of Darkness", 10)], [("Island", 60)],
             deal={1: {"hand": ["Forest", "Swamp", "Grizzly Bears", "Giant Growth", "Grasp of Darkness", "Swamp"],
                       "top": ["Forest", "Forest", "Swamp"]}})
    w = Watch(g)

    def until(g):
        w.see()
        rows = w.sizes(1, "Grizzly Bears")
        small = [r for r in rows if (r[3], r[4]) == (1, 1)]
        return bool(small) and any((r[3], r[4]) == (2, 2) and r[0] > small[0][0] for r in rows)

    g.run(policy, until=until, max_turn=14)
    w.see()
    rows = w.sizes(1, "Grizzly Bears")
    found = {"bears": rows, "stopped": g.stopped_badly()}
    small = [r for r in rows if (r[3], r[4]) == (1, 1)]
    if not small:
        return "inconclusive", "Grasp never resolved on the grown Bears", found
    problems = [found["stopped"]] if found["stopped"] else []
    before = [r for r in rows if r[0] < small[0][0]]
    if not before or (before[-1][3], before[-1][4]) != (5, 5):
        problems.append(f"the board before Grasp should show the 5/5: {before[-1:]}")
    if not any((r[3], r[4]) == (2, 2) and r[0] > small[0][0] for r in rows):
        problems.append("the -4/-4 and +3/+3 should both end at end of turn (2/2)")
    if any(m.get("card") == small[0][2] and m["from"]["zone"] == "battlefield" for m in w.moves(1)):
        problems.append("the 1/1 Bears should live")
    if not w.same_sizes("Grizzly Bears"):
        problems.append("both seats should be sent the same sizes")
    return result(problems, "Grasp on a 5/5: it lives as a 1/1, back to 2/2 at end of turn", found)


def dies():
    st = {"grasped": False}

    def policy(g, f):
        kind = f.get("kind")
        if f["authorisedSeat"] != 1:
            return DEFAULT
        baloth = g.mine(1, name="Rumbling Baloth")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if (g.state.get(1) or {}).get("stack"):
                return None
            if not baloth:
                return None if st["grasped"] else named(g, f, "Rumbling Baloth")
            if not st["grasped"]:
                o = named(g, f, "Grasp of Darkness")
                st["grasped"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor":
            return target(f, baloth[0]["id"]) if baloth else DEFAULT
        return DEFAULT

    g = game("dies", [("Forest", 15), ("Swamp", 15), ("Rumbling Baloth", 15), ("Grasp of Darkness", 15)],
             [("Island", 60)],
             deal={1: {"hand": ["Forest", "Forest", "Swamp", "Rumbling Baloth", "Grasp of Darkness", "Swamp"],
                       "top": ["Forest", "Swamp", "Forest"]}})
    w = Watch(g)

    def died(seat):
        return [m for m in w.moves(seat) if m.get("to", {}).get("zone") == "graveyard"
                and m.get("from", {}).get("zone") == "battlefield"
                and any(r[2] == m.get("card") for r in w.sizes(seat, "Rumbling Baloth"))]

    g.run(policy, until=lambda g: (w.see(), bool(died(1)) and bool(died(2)))[1], max_turn=14)
    w.see()
    found = {"baloth": w.sizes(1, "Rumbling Baloth"), "moves": [died(1), died(2)], "stopped": g.stopped_badly()}
    if not died(1):
        return "inconclusive", "the Baloth never died to Grasp", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        moves = died(seat)
        if not moves or moves[0].get("last") != {"power": 0, "toughness": 0}:
            problems.append(f"seat {seat}: the Baloth's death should say last 0/0: {moves}")
    last_board = [r for r in w.sizes(1, "Rumbling Baloth")]
    if not last_board or (last_board[-1][3], last_board[-1][4]) != (4, 4):
        problems.append(f"the last board with the Baloth should still say 4/4: {last_board[-1:]}")
    return result(problems, "Grasp on a 4/4: it dies, its move says last 0/0 to both seats", found)


def anthem():
    def policy(g, f):
        if f["authorisedSeat"] != 1:
            return DEFAULT
        if f.get("kind") == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if (g.state.get(1) or {}).get("stack"):
                return None
            if len(g.mine(1, name="Savannah Lions")) < 2:
                return named(g, f, "Savannah Lions")
            return None if g.mine(1, name="Glorious Anthem") else named(g, f, "Glorious Anthem")
        return DEFAULT

    g = game("anthem", [("Plains", 30), ("Savannah Lions", 15), ("Glorious Anthem", 15)], [("Island", 60)],
             deal={1: {"hand": ["Plains", "Savannah Lions", "Plains", "Savannah Lions", "Glorious Anthem"],
                       "top": ["Plains", "Plains", "Plains"]}})
    w = Watch(g)

    def big(seat):
        return [s for s in w.boards(seat)
                if len([c for c in s.get("battlefield") or [] if c.get("name") == "Savannah Lions"
                        and (c.get("power"), c.get("toughness")) == (3, 2)]) >= 2]

    g.run(policy, until=lambda g: (w.see(), bool(big(1)) and bool(big(2)))[1], max_turn=12)
    w.see()
    rows = w.sizes(1, "Savannah Lions")
    found = {"lions": rows, "stopped": g.stopped_badly()}
    if not big(1):
        return "inconclusive", "the Anthem never came with two Lions out", found
    problems = [found["stopped"]] if found["stopped"] else []
    rev = big(1)[0].get("stateRevision")
    before = [r for r in rows if r[0] < rev]
    last_rev = max((r[0] for r in before), default=None)
    was = [(r[3], r[4]) for r in before if r[0] == last_rev]
    if was != [(2, 1), (2, 1)]:
        problems.append(f"both Lions were 2/1 in the board before, and both 3/2 in the next: {was}")
    if not w.same_sizes("Savannah Lions"):
        problems.append("both seats should be sent the same sizes")
    return result(problems, "Glorious Anthem: both Lions 2/1 -> 3/2 in the same board", found)


def damage():
    st = {"attacked": False, "blocked": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if (g.state.get(seat) or {}).get("stack"):
                return None
            want = "Rumbling Baloth" if seat == 1 else "Hill Giant"
            return None if g.mine(seat, name=want) else named(g, f, want)
        if kind == "declareAttackers" and seat == 1:
            ready = any(not c.get("sick") for c in g.mine(1, name="Rumbling Baloth"))
            giant = any(not c.get("tapped") for c in g.mine(2, name="Hill Giant"))
            if st["attacked"] or not ready or not giant:
                return None
            st["attacked"] = True
            return next((o["actionId"] for o in f["options"] if "Rumbling Baloth" in (o.get("label") or "")), None)
        if kind == "declareBlockers" and seat == 2:
            if st["attacked"] and not st["blocked"]:
                o = next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith("Hill Giant")), None)
                st["blocked"] = bool(o)
                return o
            return None
        if kind in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    g = game("damage", [("Forest", 30), ("Rumbling Baloth", 30)], [("Mountain", 30), ("Hill Giant", 30)],
             deal={1: {"hand": ["Forest"] * 4 + ["Rumbling Baloth"], "top": ["Forest"] * 4},
                   2: {"hand": ["Mountain"] * 4 + ["Hill Giant"], "top": ["Mountain"] * 4}})
    w = Watch(g)

    def hurt(seat):
        return [r for r in w.sizes(seat, "Rumbling Baloth") if (r[5] or 0) > 0]

    def until(g):
        w.see()
        h = hurt(1)
        return bool(h) and any(r[0] > h[-1][0] and not r[5] for r in w.sizes(1, "Rumbling Baloth"))

    g.run(policy, until=until, max_turn=14)
    w.see()
    rows = w.sizes(1, "Rumbling Baloth")
    found = {"baloth": rows, "giant_moves": [m for m in w.moves(1) if m.get("last")], "stopped": g.stopped_badly()}
    if not hurt(1):
        return "inconclusive", "the Baloth never took damage", found
    problems = [found["stopped"]] if found["stopped"] else []
    h = hurt(1)[0]
    if (h[3], h[4], h[5]) != (4, 4, 3):
        problems.append(f"the Baloth should be 4/4 with 3 damage: {h}")
    if not any(r[0] > hurt(1)[-1][0] and not r[5] for r in rows):
        problems.append("its damage should be gone by the next turn")
    giants = {r[2] for r in w.sizes(1, "Hill Giant")}
    for seat in (1, 2):
        gm = [m for m in w.moves(seat) if m.get("card") in giants and m["from"]["zone"] == "battlefield"]
        if not gm or gm[0].get("last") != {"power": 3, "toughness": 3}:
            problems.append(f"seat {seat}: the Giant's death should say last 3/3: {gm}")
    if not w.same_sizes("Rumbling Baloth"):
        problems.append("both seats should be sent the same sizes and damage")
    return result(problems, "Baloth blocked by Hill Giant: 4/4 with 3 damage, gone next turn; Giant last 3/3", found)


def walker():
    st = {"plus": False, "minus": False}

    def policy(g, f):
        kind = f.get("kind")
        if f["authorisedSeat"] != 1:
            return DEFAULT
        jace = g.mine(1, name="Jace Beleren")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if (g.state.get(1) or {}).get("stack"):
                return None
            if not jace:
                return None if st["plus"] else named(g, f, "Jace Beleren")
            if not st["plus"]:
                o = named(g, f, "Jace Beleren", contains="Each player draws")
                st["plus"] = bool(o)
                st["plus_turn"] = g.turn
                return o
            if not st["minus"] and g.turn > st.get("plus_turn", 99):
                o = named(g, f, "Jace Beleren", contains="Target player draws")
                st["minus"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if "Alice" in (o.get("label") or "")), DEFAULT)
        return DEFAULT

    g = game("walker", [("Island", 40), ("Jace Beleren", 20)], [("Island", 60)],
             deal={1: {"hand": ["Island", "Island", "Island", "Jace Beleren"], "top": ["Island"] * 6}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), any(r[7] == 4 for r in w.sizes(1, "Jace Beleren"))
                                   and any(r[7] == 4 for r in w.sizes(2, "Jace Beleren")))[1], max_turn=14)
    w.see()
    rows = w.sizes(1, "Jace Beleren")
    found = {"jace": rows, "stopped": g.stopped_badly()}
    seen = []
    for r in rows:
        if not seen or seen[-1] != r[7]:
            seen.append(r[7])
    if 4 not in seen[1:]:
        return "inconclusive", f"Jace never went +2 then -1: {seen}", found
    problems = [found["stopped"]] if found["stopped"] else []
    if seen[:3] != [3, 5, 4]:
        problems.append(f"loyalty should go 3 -> 5 -> 4: {seen}")
    if not w.same_sizes("Jace Beleren"):
        problems.append("both seats should be sent the same loyalty")
    return result(problems, "Jace Beleren: loyalty 3 -> 5 (+2) -> 4 (-1), to both seats", found)


def counter():
    st = {"used": False}

    def policy(g, f):
        kind = f.get("kind")
        if f["authorisedSeat"] != 1:
            return DEFAULT
        feeder = g.mine(1, name="Spike Feeder")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if (g.state.get(1) or {}).get("stack"):
                return None
            if not feeder:
                return None if st["used"] else named(g, f, "Spike Feeder")
            if not st["used"] and len(g.untapped_lands(1)) >= 2:
                o = named(g, f, "Spike Feeder", contains="gain 2 life")
                st["used"] = bool(o)
                return o
            return None
        return DEFAULT

    g = game("counter", [("Forest", 40), ("Spike Feeder", 20)], [("Island", 60)],
             deal={1: {"hand": ["Forest", "Forest", "Forest", "Spike Feeder"], "top": ["Forest"] * 6}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), any(r[6] == 1 for r in w.sizes(1, "Spike Feeder"))
                                   and any(r[6] == 1 for r in w.sizes(2, "Spike Feeder")))[1], max_turn=14)
    w.see()
    rows = w.sizes(1, "Spike Feeder")
    found = {"feeder": rows, "stopped": g.stopped_badly()}
    one = next((r for r in rows if r[6] == 1), None)
    if not one:
        return "inconclusive", "Spike Feeder never took a counter off", found
    problems = [found["stopped"]] if found["stopped"] else []
    before = [r for r in rows if r[0] < one[0]]
    if not before or (before[-1][3], before[-1][4], before[-1][6]) != (2, 2, 2):
        problems.append(f"Spike Feeder was 2/2 with two counters: {before[-1:]}")
    if (one[3], one[4]) != (1, 1):
        problems.append(f"with one counter it is 1/1 in the same board: {one}")
    if not w.same_sizes("Spike Feeder"):
        problems.append("both seats should be sent the same sizes and counters")
    return result(problems, "Spike Feeder: a +1/+1 counter off, 2/2 -> 1/1 with the badge 2 -> 1", found)


SCENARIOS = {"growth": growth, "pridemate": pridemate, "grasp": grasp, "dies": dies, "anthem": anthem,
             "damage": damage, "walker": walker, "counter": counter}

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
            print("  " + json.dumps(found, default=str)[:3000])
        sys.stdout.flush()
    sys.exit(worst)
