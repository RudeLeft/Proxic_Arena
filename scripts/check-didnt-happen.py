"""Spec 0101, item 2 -- stack entries that left without resolving (Mechanics
Lab, Layer B).

    python -I scripts/check-didnt-happen.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker. What it checks is read
from the snapshots both seats were sent -- the round's `left`, the stack's
entries before it, the moves and the report window (`action`) -- never
inferred:

  stifle     Alice's Prodigal Pyromancer aims 1 damage at Bob's Llanowar
             Elves; Bob Stifles the ability: `left` names the ability's
             stack entry (shown on an earlier board), why "countered", by
             Stifle, to both; no damage to the Elves; Alice's window says
             "Bob countered Prodigal Pyromancer's ability with Stifle." with
             the Pyromancer's picture; Bob gets no window for it
  time-stop  Alice's Lightning Bolt waits on the stack when Bob casts Time
             Stop: `left` names the Bolt's entry, why "ended", by Time Stop,
             to both; Time Stop itself is not listed; the Bolt goes to
             Alice's exile; Bob keeps his life

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its point.
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
        trace = os.path.join(TRACES, f"didnt-happen-{name}.jsonl")
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

    def listed(self, seat, key):
        return [e for s in self.boards(seat) for e in (s.get(key) or [])]

    def stacks(self, seat):
        return [e for s in self.boards(seat) for e in (s.get("stack") or [])]

    def actions(self, seat):
        out = []
        for s in self.boards(seat):
            a = s.get("action")
            if a and a not in out:
                out.append(a)
        return out

    def hits(self, seat):
        out, keys = [], set()
        for s in self.boards(seat):
            d = s.get("damage")
            if d and d.get("key") not in keys:
                keys.add(d.get("key"))
                out.extend(d.get("hits") or [])
        return out


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def named(g, f, name):
    seat = f["authorisedSeat"]
    for o in f["options"]:
        label = o.get("label") or ""
        if o.get("payable") is False or "Play land" in label:
            continue
        cid = card_of(o.get("actionId"))
        if any(c.get("id") == cid and c.get("name") == name for c in g.zone(seat, "hand")):
            return o["actionId"]
    return None


def stack_of(g, seat):
    return (g.state.get(seat) or {}).get("stack") or []


def first_id(cards):
    return cards[0]["id"] if cards else None


def reports(w, seat, words):
    return [a for a in w.actions(seat) if words in (a.get("said") or "")]


# --- stifle -----------------------------------------------------------------------------


def stifle():
    st = {"ping": False, "stifle": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            if kind == "chooseSpellAbilityToPlay":
                ping = next((e for e in stack_of(g, 2) if e.get("kind") == "ability"
                             and e.get("name") == "Prodigal Pyromancer"), None)
                if ping and not st["stifle"]:
                    o = named(g, f, "Stifle")
                    st["stifle"] = bool(o)
                    return o
                land = g.play_land(f)
                if land:
                    return land
                if stack_of(g, 2):
                    return None
                return None if g.mine(2, name="Llanowar Elves") else named(g, f, "Llanowar Elves")
            if kind == "chooseTargetsFor" and st["stifle"]:
                ping = next((e for e in stack_of(g, 2) if e.get("kind") == "ability"), None)
                return next((o["actionId"] for o in f["options"] if ping and o.get("objectId") == ping["id"]),
                            DEFAULT)
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, 1):
                return None
            pyro = [c for c in g.mine(1, name="Prodigal Pyromancer") if not c.get("sick") and not c.get("tapped")]
            if not g.mine(1, name="Prodigal Pyromancer"):
                return named(g, f, "Prodigal Pyromancer")
            if pyro and not st["ping"] and g.zone(1, "battlefield", owner=2, name="Llanowar Elves") \
                    and g.untapped_lands(2, name="Island"):
                o = g.option(f, name="Prodigal Pyromancer", zone="battlefield")
                st["ping"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor" and st["ping"]:
            elves = first_id(g.zone(1, "battlefield", owner=2, name="Llanowar Elves"))
            return next((o["actionId"] for o in f["options"] if o.get("objectId") == elves), DEFAULT)
        return DEFAULT

    g = game("stifle", [("Mountain", 30), ("Prodigal Pyromancer", 30)],
             [("Forest", 20), ("Island", 20), ("Llanowar Elves", 10), ("Stifle", 10)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Prodigal Pyromancer"] * 3, "top": ["Mountain"] * 6},
                   2: {"hand": ["Forest", "Island", "Forest", "Island", "Llanowar Elves", "Stifle", "Stifle"],
                       "top": ["Island", "Forest"] * 3}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(w.listed(s, "left") for s in (1, 2)) and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "ping": st["ping"], "stifle": st["stifle"]}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        left = w.listed(seat, "left")
        found[f"left{seat}"] = left
        if not left:
            return "inconclusive", f"seat {seat} never saw the ability countered (ping {st['ping']}, stifle " \
                                   f"{st['stifle']})", found
        ping = next((e for e in w.stacks(seat) if e.get("kind") == "ability"
                     and e.get("name") == "Prodigal Pyromancer"), None)
        spell = next((e for e in w.stacks(seat) if e.get("name") == "Stifle"), None)
        if not ping or not spell or left != [{"stack": ping["id"], "why": "countered", "by": spell.get("source")}]:
            problems.append(f"seat {seat}: left names the ping's entry, countered by Stifle: {left} / {ping}")
        if any(h.get("amount") for h in w.hits(seat)):
            problems.append(f"seat {seat}: no damage dealt: {w.hits(seat)}")
        said = reports(w, seat, "countered")
        found[f"said{seat}"] = [(a.get("said"), [c.get("name") for c in a.get("cards") or []]) for a in said]
        if seat == 1:
            want = "Bob countered Prodigal Pyromancer's ability with Stifle."
            if not said or said[0].get("said") != want:
                problems.append(f"seat 1: the window says {want!r}: {found['said1']}")
            elif not any(c.get("name") == "Prodigal Pyromancer" for c in said[0].get("cards") or []):
                problems.append(f"seat 1: the window shows the Pyromancer: {said[0].get('cards')}")
        elif said:
            problems.append(f"seat 2: Bob did it: no window for him: {found['said2']}")
    return result(problems, "Stifle on the Pyromancer's ping: left (countered, by Stifle) to both, no damage; "
                            "Alice's window, none for Bob", found)


# --- time stop --------------------------------------------------------------------------


def time_stop():
    st = {"bolt": False, "stop": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            if kind == "chooseSpellAbilityToPlay":
                if any(e.get("name") == "Lightning Bolt" for e in stack_of(g, 2)) and not st["stop"]:
                    o = named(g, f, "Time Stop")
                    st["stop"] = bool(o)
                    return o
                return g.play_land(f) if not stack_of(g, 2) else None
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, 1) or st["bolt"]:
                return None
            if len(g.untapped_lands(2, name="Island")) >= 6:
                o = named(g, f, "Lightning Bolt")
                st["bolt"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor" and st["bolt"]:
            return next((o["actionId"] for o in f["options"] if "Bob" in (o.get("label") or "")), DEFAULT)
        return DEFAULT

    g = game("time-stop", [("Mountain", 30), ("Lightning Bolt", 30)], [("Island", 50), ("Time Stop", 10)],
             deal={1: {"hand": ["Mountain"] * 3 + ["Lightning Bolt"] * 4, "top": ["Mountain"] * 10},
                   2: {"hand": ["Island"] * 6 + ["Time Stop"], "top": ["Island"] * 10}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(w.listed(s, "left") for s in (1, 2)) and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=18)
    w.see()
    found = {"stopped": g.stopped_badly(), "bolt": st["bolt"], "stop": st["stop"]}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        left = w.listed(seat, "left")
        found[f"left{seat}"] = left
        if not left:
            return "inconclusive", f"seat {seat} never saw the Bolt end (bolt {st['bolt']}, stop {st['stop']})", \
                found
        bolt = next((e for e in w.stacks(seat) if e.get("name") == "Lightning Bolt"), None)
        stop = next((e for e in w.stacks(seat) if e.get("name") == "Time Stop"), None)
        if not bolt or not stop or left != [{"stack": bolt["id"], "why": "ended", "by": stop.get("source")}]:
            problems.append(f"seat {seat}: left names the Bolt's entry alone, ended by Time Stop: {left}")
        moves = [m for m in w.listed(seat, "moves") if bolt and m.get("card") == bolt.get("source")]
        if not any(m.get("to") == {"zone": "exile", "seat": 1} for m in moves):
            problems.append(f"seat {seat}: the Bolt goes to Alice's exile: {moves}")
        bob = next((p for p in w.boards(seat)[-1].get("players") or [] if p.get("seat") == 2), {})
        if bob.get("life") != 20:
            problems.append(f"seat {seat}: Bob keeps his life: {bob.get('life')}")
    return result(problems, "Time Stop: the waiting Bolt left (ended, by Time Stop) to both, into Alice's exile",
                  found)


SCENARIOS = {"stifle": stifle, "time-stop": time_stop}

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
