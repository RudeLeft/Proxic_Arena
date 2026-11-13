"""Spec 0080 -- flicker, phasing, and cards that survive (Mechanics Lab,
Layer B).

    python -I scripts/check-survivors.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker. What it checks is read
from the snapshots both seats were sent -- the round's `moves` (a flicker is
one move, why "flickered", `via` its exile), a permanent's `phasedOut`,
`shields` and `indestructible`, the round's `phased` and `survived`, the
damage wave's prevented hits ({amount: 0, prevented: N}) and the report
window (`action`) -- never inferred:

  ephemerate   Alice's Ephemerate on her Grizzly Bears: one move, battlefield
               to battlefield by way of her exile, the same id; never two
  flickerwisp  Alice's Flickerwisp exiles Bob's Bears; they come back at the
               end step: two moves in two rounds (to exile, then back), no
               "flickered" -- unchanged
  teferi       Bob's Teferi's Protection: his permanents stay in both seats'
               `battlefield` flagged phasedOut, `phased` out; Alice's report
               window says so ("Bob's permanents phased out until Bob's next
               turn. Bob's life can't change." -- the effect's CantChangeLife
               static, as Forge has it), Bob gets none; never a move to exile; at his next
               turn they phase in (`phased` out false, no phasedOut)
  slip         Bob's Slip Out the Back on his Bears: Alice's window says
               "Bob's Grizzly Bears phased out until Bob's next turn." and
               nothing about life (no such effect)
  regenerate   Alice's Murder at Bob's River Boa; Bob regenerates in answer:
               shields 1 while the Murder waits, then survived "regenerated",
               the Boa still there, tapped, no shield
  wrath        Alice's Wrath of God with her Darksteel Myr and Bob's Bears on
               the table: the Myr indestructible, survived "indestructible",
               still there; the Bears destroyed
  myr-block    Bob's Hill Giant attacks, Alice's Darksteel Myr blocks: the
               Myr takes 3, survived "indestructible", still there
  holy-day     Alice attacks with two Bears; Bob casts Holy Day: the combat
               wave carries a prevented hit per attacker (amount 0,
               prevented 2, target Bob); Bob stays at 20
  fog          the same with Fog
  pro-red      Bob's Lightning Bolt at Alice's Bears; Gods Willing gives them
               protection from red: the Bolt fizzles (spec 0079), the Bears
               still there with "Protection from red"
  pyroclasm    Bob's Pyroclasm with Alice's Kor Firewalker (protection from
               red) and Bears on the table: a prevented hit on the
               Firewalker (prevented 2), the Bears take 2

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
        trace = os.path.join(TRACES, f"survivors-{name}.jsonl")
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

    def cards(self, seat, name=None):
        return [c for s in self.boards(seat) for c in s.get("battlefield") or []
                if name is None or c.get("name") == name]

    def listed(self, seat, key):
        return [e for s in self.boards(seat) for e in (s.get(key) or [])]

    def hits(self, seat):
        out, keys = [], set()
        for s in self.boards(seat):
            d = s.get("damage")
            if d and d.get("key") not in keys:
                keys.add(d.get("key"))
                out.append(d)
        return out

    def actions(self, seat):
        out = []
        for s in self.boards(seat):
            a = s.get("action")
            if a and a not in out:
                out.append(a)
        return out


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def named(g, f, name):
    """The option that casts [name] from the asked seat's hand."""
    seat = f["authorisedSeat"]
    for o in f["options"]:
        label = o.get("label") or ""
        if o.get("payable") is False or "Play land" in label:
            continue
        cid = card_of(o.get("actionId"))
        if any(c.get("id") == cid and c.get("name") == name for c in g.zone(seat, "hand")):
            return o["actionId"]
    return None


def labelled(f, *words):
    for o in f.get("options", []):
        label = o.get("label") or ""
        if any(w in label for w in words):
            return o["actionId"]
    return None


def stack_of(g, seat):
    return (g.state.get(seat) or {}).get("stack") or []


def target(f, card_id):
    return next((o["actionId"] for o in f["options"] if card_id and o.get("objectId") == card_id), None)


def first_id(cards):
    return cards[0]["id"] if cards else None


# --- ephemerate -----------------------------------------------------------------------


def ephemerate():
    st = {"cast": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat != 1:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, 1):
                return None
            if not g.mine(1, name="Grizzly Bears"):
                return named(g, f, "Grizzly Bears")
            if not st["cast"]:
                o = named(g, f, "Ephemerate")
                st["cast"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor":
            return target(f, first_id(g.mine(1, name="Grizzly Bears"))) or DEFAULT
        return DEFAULT

    g = game("ephemerate", [("Plains", 15), ("Forest", 15), ("Grizzly Bears", 15), ("Ephemerate", 15)],
             [("Swamp", 60)],
             deal={1: {"hand": ["Forest", "Plains", "Forest", "Grizzly Bears", "Ephemerate", "Ephemerate", "Plains"],
                       "top": ["Plains", "Forest"] * 4}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(any(m.get("why") == "flickered" for m in w.listed(s, "moves")) for s in (1, 2)) \
            and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=12)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        bears = w.cards(seat, "Grizzly Bears")
        flick = [m for m in w.listed(seat, "moves") if m.get("why") == "flickered"]
        found[f"moves{seat}"] = flick
        if not flick:
            return "inconclusive", f"seat {seat} never saw the Ephemerate resolve (cast {st['cast']})", found
        m = flick[0]
        if m.get("from") != {"zone": "battlefield", "seat": 1} or m.get("to") != {"zone": "battlefield", "seat": 1} \
                or m.get("via") != {"zone": "exile", "seat": 1}:
            problems.append(f"seat {seat}: one move, Alice's table to her table by way of her exile: {m}")
        if not bears or m.get("card") != bears[-1]["id"]:
            problems.append(f"seat {seat}: the flicker names the Bears (Forge keeps the id): {m} / {bears[-1:]}")
        other = [x for x in w.listed(seat, "moves") if x.get("card") == m.get("card") and x is not m
                 and "exile" in (x.get("from", {}).get("zone"), x.get("to", {}).get("zone"))]
        if other:
            problems.append(f"seat {seat}: never a second move through exile for the Bears: {other}")
    return result(problems, "Ephemerate on the Bears: one move battlefield -> battlefield via Alice's exile, "
                            "the same id, to both", found)


# --- flickerwisp -----------------------------------------------------------------------


def flickerwisp():
    st = {"cast": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, seat):
                return None
            if seat == 2:
                return None if g.mine(2, name="Grizzly Bears") else named(g, f, "Grizzly Bears")
            if g.zone(1, "battlefield", owner=2, name="Grizzly Bears") and not st["cast"]:
                o = named(g, f, "Flickerwisp")
                st["cast"] = bool(o)
                return o
            return None
        if seat == 1 and kind == "chooseTargetsFor":
            return target(f, first_id(g.zone(1, "battlefield", owner=2, name="Grizzly Bears"))) or DEFAULT
        return DEFAULT

    g = game("flickerwisp", [("Plains", 30), ("Flickerwisp", 30)], [("Forest", 30), ("Grizzly Bears", 30)],
             deal={1: {"hand": ["Plains"] * 4 + ["Flickerwisp"] * 3, "top": ["Plains"] * 6},
                   2: {"hand": ["Forest"] * 4 + ["Grizzly Bears"] * 3, "top": ["Forest"] * 6}})
    w = Watch(g)

    def back(seat):
        return any(m.get("from", {}).get("zone") == "exile" and m.get("to", {}).get("zone") == "battlefield"
                   for m in w.listed(seat, "moves"))

    def until(g):
        w.see()
        return all(back(s) for s in (1, 2))

    g.run(policy, until=until, max_turn=12)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        moves = w.listed(seat, "moves")
        out = [m for m in moves if m.get("from", {}).get("zone") == "battlefield"
               and m.get("to", {}).get("zone") == "exile"]
        ret = [m for m in moves if m.get("from", {}).get("zone") == "exile"
               and m.get("to", {}).get("zone") == "battlefield"]
        found[f"seat{seat}"] = out[:1] + ret[:1]
        if not ret:
            return "inconclusive", f"seat {seat} never saw the Bears come back (cast {st['cast']})", found
        if not out or out[0].get("card") != ret[0].get("card"):
            problems.append(f"seat {seat}: to exile, then back, the same card: {out[:1]} {ret[:1]}")
        if any(m.get("why") == "flickered" for m in moves):
            problems.append(f"seat {seat}: Flickerwisp's end-of-turn return is not a flicker in one go")
        rounds = [s.get("stateRevision") for s in w.boards(seat)
                  if any(m in (s.get("moves") or []) for m in out[:1] + ret[:1])]
        if len(set(rounds)) < 2:
            problems.append(f"seat {seat}: exiled and returned in two different rounds: {rounds}")
    return result(problems, "Flickerwisp: Bob's Bears to exile, back at the end step -- two moves, two rounds",
                  found)


# --- teferi ---------------------------------------------------------------------------------


def teferi():
    st = {"cast": False, "turn": None}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat != 2:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, 2):
                return None
            if not g.mine(2, name="Grizzly Bears"):
                return named(g, f, "Grizzly Bears")
            if not st["cast"] and len(g.untapped_lands(2)) >= 3:
                o = named(g, f, "Teferi's Protection")
                st["cast"] = bool(o)
                st["turn"] = g.turn
                return o
            return None
        return DEFAULT

    g = game("teferi", [("Swamp", 60)],
             [("Plains", 20), ("Forest", 20), ("Grizzly Bears", 10), ("Teferi's Protection", 10)],
             deal={2: {"hand": ["Forest", "Plains", "Plains", "Grizzly Bears", "Teferi's Protection",
                                "Teferi's Protection", "Plains"], "top": ["Plains", "Forest"] * 5}})
    w = Watch(g)

    def phased(seat, out):
        return any(p.get("out") is out for p in w.listed(seat, "phased"))

    def until(g):
        w.see()
        return all(phased(s, True) and phased(s, False) for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        if not (phased(seat, True) and phased(seat, False)):
            return "inconclusive", f"seat {seat} never saw Bob's board phase out and in (cast {st['cast']})", found
        ghosts = [c for c in w.cards(seat) if c.get("phasedOut")]
        found[f"ghosts{seat}"] = ghosts[:3]
        if not any(c.get("name") == "Grizzly Bears" and c.get("seat") == 2 for c in ghosts):
            problems.append(f"seat {seat}: Bob's Bears stay on the table, phased out: {ghosts[:3]}")
        if any(c.get("seat") != 2 for c in ghosts):
            problems.append(f"seat {seat}: only Bob's permanents phase out: {ghosts}")
        to_exile = [m for m in w.listed(seat, "moves") if m.get("card") in {c["id"] for c in ghosts}
                    and m.get("to", {}).get("zone") == "exile"]
        if to_exile:
            problems.append(f"seat {seat}: a phased-out permanent never moves to exile: {to_exile}")
        last = w.boards(seat)[-1]
        if any(c.get("phasedOut") for c in last.get("battlefield") or []):
            problems.append(f"seat {seat}: phased back in at Bob's turn: still phased out in the last board")
        reports = [a for a in w.actions(seat) if "phased out" in (a.get("said") or "")]
        found[f"report{seat}"] = [a.get("said") for a in reports]
        if seat == 1:
            want = "Bob's permanents phased out until Bob's next turn. Bob's life can't change."
            if not reports or reports[0].get("said") != want:
                problems.append(f"seat 1: the report window says {want!r}: {found['report1']}")
            elif not any(c.get("name") == "Grizzly Bears" for c in reports[0].get("cards") or []):
                problems.append(f"seat 1: the window shows the Bears: {reports[0].get('cards')}")
        elif reports:
            problems.append(f"seat 2: Bob did it to himself: no window for him: {found['report2']}")
    return result(problems, "Teferi's Protection: Bob's permanents phased out in place (phasedOut), Alice's "
                            "window, never exiled, phased in at his turn", found)


def slip():
    st = {"cast": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat != 2:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, 2):
                return None
            if not g.mine(2, name="Grizzly Bears"):
                return named(g, f, "Grizzly Bears")
            if not st["cast"] and g.untapped_lands(2, name="Island"):
                o = named(g, f, "Slip Out the Back")
                st["cast"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor":
            return target(f, first_id(g.mine(2, name="Grizzly Bears"))) or DEFAULT
        return DEFAULT

    g = game("slip", [("Swamp", 60)],
             [("Island", 20), ("Forest", 20), ("Grizzly Bears", 10), ("Slip Out the Back", 10)],
             deal={2: {"hand": ["Forest", "Island", "Forest", "Grizzly Bears", "Slip Out the Back", "Island",
                                "Forest"], "top": ["Island", "Forest"] * 5}})
    w = Watch(g)

    def until(g):
        w.see()
        return any("phased out" in (a.get("said") or "") for a in w.actions(1))

    g.run(policy, until=until, max_turn=12)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    said = [a.get("said") for a in w.actions(1) if "phased out" in (a.get("said") or "")]
    found["said"] = said
    if not said:
        return "inconclusive", f"Alice never got the window (cast {st['cast']})", found
    want = "Bob's Grizzly Bears phased out until Bob's next turn."
    if said[0] != want:
        problems.append(f"seat 1: no life sentence without a life effect: {want!r}: {said}")
    return result(problems, "Slip Out the Back: Bob's Bears phase out; Alice's window, no life sentence", found)


# --- regenerate --------------------------------------------------------------------------


def regenerate():
    st = {"murder": False, "regen": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        stack = stack_of(g, seat)
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 2:
                if stack and not st["regen"] and any(e.get("name") == "Murder" for e in stack) \
                        and g.untapped_lands(2):
                    boa = first_id(g.mine(2, name="River Boa"))
                    o = next((o["actionId"] for o in f["options"] if card_of(o.get("actionId")) == boa
                              and "egenerate" in (o.get("label") or "")), None)
                    st["regen"] = bool(o)
                    return o
                if stack:
                    return None
                return None if g.mine(2, name="River Boa") else named(g, f, "River Boa")
            if not stack and not st["murder"] and g.zone(1, "battlefield", owner=2, name="River Boa") \
                    and len(g.untapped_lands(1)) >= 3 and g.untapped_lands(2, name="Forest"):
                o = named(g, f, "Murder")
                st["murder"] = bool(o)
                return o
            return None
        if seat == 1 and kind == "chooseTargetsFor":
            return target(f, first_id(g.zone(1, "battlefield", owner=2, name="River Boa"))) or DEFAULT
        return DEFAULT

    g = game("regenerate", [("Swamp", 30), ("Murder", 30)], [("Forest", 40), ("River Boa", 20)],
             deal={1: {"hand": ["Swamp"] * 4 + ["Murder"] * 3, "top": ["Swamp"] * 6},
                   2: {"hand": ["Forest"] * 5 + ["River Boa"] * 2, "top": ["Forest"] * 6}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(any(x.get("how") == "regenerated" for x in w.listed(s, "survived")) for s in (1, 2)) \
            and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        surv = [x for x in w.listed(seat, "survived") if x.get("how") == "regenerated"]
        found[f"survived{seat}"] = surv
        if not surv:
            return "inconclusive", f"seat {seat} never saw the Boa regenerate (murder {st['murder']}, " \
                                   f"regen {st['regen']})", found
        boa = surv[0].get("card")
        shielded = [c for c in w.cards(seat) if c.get("id") == boa and c.get("shields") == 1]
        if not shielded:
            problems.append(f"seat {seat}: the Boa shows its shield (shields 1) while the Murder waits")
        last = next((c for c in (w.boards(seat)[-1].get("battlefield") or []) if c.get("id") == boa), None)
        found[f"boa{seat}"] = last
        if not last or not last.get("tapped") or last.get("shields"):
            problems.append(f"seat {seat}: the Boa stays, tapped, its shield used: {last}")
        if any(m.get("card") == boa and m.get("from", {}).get("zone") == "battlefield"
               for m in w.listed(seat, "moves")):
            problems.append(f"seat {seat}: the Boa never left the table")
    return result(problems, "River Boa regenerates against Murder: shields 1, survived \"regenerated\", stays "
                            "tapped with no shield, to both", found)


# --- wrath ---------------------------------------------------------------------------------


def wrath():
    st = {"cast": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, seat):
                return None
            if seat == 2:
                return None if g.mine(2, name="Grizzly Bears") else named(g, f, "Grizzly Bears")
            if not g.mine(1, name="Darksteel Myr"):
                return named(g, f, "Darksteel Myr")
            if not st["cast"] and g.zone(1, "battlefield", owner=2, name="Grizzly Bears") \
                    and len(g.untapped_lands(1)) >= 4:
                o = named(g, f, "Wrath of God")
                st["cast"] = bool(o)
                return o
            return None
        return DEFAULT

    g = game("wrath", [("Plains", 30), ("Darksteel Myr", 15), ("Wrath of God", 15)],
             [("Forest", 30), ("Grizzly Bears", 30)],
             deal={1: {"hand": ["Plains"] * 4 + ["Darksteel Myr", "Wrath of God", "Wrath of God"],
                       "top": ["Plains"] * 6},
                   2: {"hand": ["Forest"] * 4 + ["Grizzly Bears"] * 3, "top": ["Forest"] * 6}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(any(x.get("how") == "indestructible" for x in w.listed(s, "survived")) for s in (1, 2)) \
            and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        myrs = w.cards(seat, "Darksteel Myr")
        surv = [x for x in w.listed(seat, "survived") if x.get("how") == "indestructible"]
        found[f"survived{seat}"] = surv
        if not surv:
            return "inconclusive", f"seat {seat} never saw the Wrath resolve (cast {st['cast']})", found
        if not myrs or not all(c.get("indestructible") for c in myrs):
            problems.append(f"seat {seat}: the Myr is marked indestructible on every board: {myrs[-1:]}")
        if not myrs or surv[0].get("card") != myrs[-1]["id"]:
            problems.append(f"seat {seat}: the survivor is the Myr: {surv} / {myrs[-1:]}")
        last = w.boards(seat)[-1].get("battlefield") or []
        if not any(c.get("name") == "Darksteel Myr" for c in last):
            problems.append(f"seat {seat}: the Myr is still on the table")
        if any(c.get("name") == "Grizzly Bears" for c in last):
            problems.append(f"seat {seat}: the Bears were destroyed")
        dead = [m for m in w.listed(seat, "moves") if m.get("why") == "destroyed"]
        if not dead:
            problems.append(f"seat {seat}: the Bears' move says destroyed")
    return result(problems, "Wrath of God: the Myr indestructible, survived \"indestructible\", stays; the Bears "
                            "destroyed", found)


# --- myr-block ------------------------------------------------------------------------------


def myr_block():
    st = {"attacked": False, "blocked": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, seat):
                return None
            name = "Darksteel Myr" if seat == 1 else "Hill Giant"
            return None if g.mine(seat, name=name) else named(g, f, name)
        if kind == "declareAttackers" and seat == 2:
            giant = [c["id"] for c in g.mine(2, name="Hill Giant") if not c.get("sick") and not c.get("tapped")]
            if st["attacked"] or not giant or not g.mine(1, name="Darksteel Myr"):
                return None
            o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == giant[0]), None)
            st["attacked"] = bool(o)
            return o
        if kind == "declareBlockers" and seat == 1:
            if not st["attacked"] or st["blocked"]:
                return None
            myr = first_id(g.mine(1, name="Darksteel Myr"))
            o = next((o["actionId"] for o in f["options"] if o["actionId"].startswith("blocker:")
                      and card_of(o["actionId"]) == myr), None)
            st["blocked"] = bool(o)
            return o
        if kind == "declareAttackers":
            return None
        return DEFAULT

    g = game("myr-block", [("Plains", 30), ("Darksteel Myr", 30)], [("Mountain", 30), ("Hill Giant", 30)],
             deal={1: {"hand": ["Plains"] * 4 + ["Darksteel Myr"] * 3, "top": ["Plains"] * 6},
                   2: {"hand": ["Mountain"] * 4 + ["Hill Giant"] * 3, "top": ["Mountain"] * 6}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(any(x.get("how") == "indestructible" for x in w.listed(s, "survived")) for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        surv = [x for x in w.listed(seat, "survived") if x.get("how") == "indestructible"]
        found[f"survived{seat}"] = surv
        if not surv:
            return "inconclusive", f"seat {seat} never saw the Myr hold a lethal block " \
                                   f"(attacked {st['attacked']}, blocked {st['blocked']})", found
        myr = surv[0].get("card")
        struck = [h for d in w.hits(seat) for h in d.get("hits", [])
                  if h.get("target") == {"object": myr} and h.get("amount") == 3]
        if not struck:
            problems.append(f"seat {seat}: the Myr took the Giant's 3: {w.hits(seat)[-1:]}")
        last = w.boards(seat)[-1].get("battlefield") or []
        if not any(c.get("id") == myr for c in last):
            problems.append(f"seat {seat}: the Myr is still on the table")
    return result(problems, "Darksteel Myr blocks the Hill Giant: takes 3, survived \"indestructible\", stays",
                  found)


# --- holy-day ---------------------------------------------------------------------------------


def holy_day(spell="Holy Day", land="Plains"):
    st = {"attacked": [], "holy": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 2:
                attacking = any(c.get("attacking") for c in g.zone(2, "battlefield", owner=1))
                if attacking and not st["holy"] and not stack_of(g, 2):
                    o = named(g, f, spell)
                    st["holy"] = bool(o)
                    return o
                return None
            if stack_of(g, 1):
                return None
            if len(g.mine(1, name="Grizzly Bears")) < 2:
                return named(g, f, "Grizzly Bears")
            return None
        if kind == "declareAttackers" and seat == 1:
            ready = [c["id"] for c in g.mine(1, name="Grizzly Bears") if not c.get("sick") and not c.get("tapped")]
            if len(ready) < 2 and not st["attacked"]:
                return None
            if st["attacked"] and len(st["attacked"]) >= 2:
                return None
            o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) in ready
                      and card_of(o["actionId"]) not in st["attacked"]), None)
            if o:
                st["attacked"].append(card_of(o))
            return o
        if kind in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    g = game("holy-day" if spell == "Holy Day" else "fog", [("Forest", 30), ("Grizzly Bears", 30)],
             [(land, 40), (spell, 20)],
             deal={1: {"hand": ["Forest"] * 4 + ["Grizzly Bears"] * 3, "top": ["Forest"] * 6},
                   2: {"hand": [land] * 4 + [spell] * 3, "top": [land] * 6}})
    w = Watch(g)

    def prevented(seat):
        return [h for d in w.hits(seat) if d.get("combat") for h in d.get("hits", []) if h.get("prevented")]

    def until(g):
        w.see()
        return all(len(prevented(s)) >= 2 for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        hits = prevented(seat)
        found[f"hits{seat}"] = hits
        if len(hits) < 2:
            return "inconclusive", f"seat {seat} saw {len(hits)} prevented hits (attacked {st['attacked']}, " \
                                   f"holy {st['holy']})", found
        if sorted(h.get("source") for h in hits) != sorted(st["attacked"]):
            problems.append(f"seat {seat}: one prevented hit per attacking Bears: {hits}")
        if any(h.get("amount") != 0 or h.get("prevented") != 2 or h.get("target") != {"player": 2} for h in hits):
            problems.append(f"seat {seat}: each is amount 0, prevented 2, at Bob: {hits}")
        wave = next(d for d in w.hits(seat) if any(h.get("prevented") for h in d.get("hits", [])))
        if not wave.get("fights"):
            problems.append(f"seat {seat}: the wave still says who fought whom: {wave}")
        bob = g.player(seat, 2)
        if bob.get("life") != 20:
            problems.append(f"seat {seat}: Bob stays at 20: {bob.get('life')}")
    return result(problems, f"{spell}: the combat wave has a prevented hit per attacker (0, prevented 2, at Bob); "
                            "Bob at 20", found)


# --- pro-red --------------------------------------------------------------------------------------


def pro_red():
    st = {"bolt": False, "gods": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        stack = stack_of(g, seat)
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 1:
                if stack and not st["gods"] and any(e.get("name") == "Lightning Bolt" for e in stack):
                    o = named(g, f, "Gods Willing")
                    st["gods"] = bool(o)
                    return o
                if stack:
                    return None
                return None if g.mine(1, name="Grizzly Bears") else named(g, f, "Grizzly Bears")
            if not stack and not st["bolt"] and g.zone(2, "battlefield", owner=1, name="Grizzly Bears") \
                    and any(c.get("name") == "Plains" and not c.get("tapped") for c in g.zone(2, "battlefield", owner=1)):
                o = named(g, f, "Lightning Bolt")
                st["bolt"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor":
            if seat == 2:
                return target(f, first_id(g.zone(2, "battlefield", owner=1, name="Grizzly Bears"))) or DEFAULT
            return target(f, first_id(g.mine(1, name="Grizzly Bears"))) or DEFAULT
        if seat == 1 and st["gods"] and kind == "chooseProtectionType":
            return labelled(f, "red", "Red") or DEFAULT
        return DEFAULT

    g = game("pro-red", [("Plains", 15), ("Forest", 15), ("Grizzly Bears", 15), ("Gods Willing", 15)],
             [("Mountain", 30), ("Lightning Bolt", 30)],
             deal={1: {"hand": ["Forest", "Plains", "Forest", "Plains", "Grizzly Bears", "Gods Willing",
                                "Gods Willing"], "top": ["Plains", "Forest"] * 3},
                   2: {"hand": ["Mountain"] * 4 + ["Lightning Bolt"] * 3, "top": ["Mountain"] * 6}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(any(m.get("why") == "fizzled" for m in w.listed(s, "moves")) for s in (1, 2)) \
            and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "asked": [a for a in g.asked if a[0] == 1][-4:]}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        fizzled = [m for m in w.listed(seat, "moves") if m.get("why") == "fizzled"]
        if not fizzled:
            return "inconclusive", f"seat {seat} never saw the Bolt fizzle (bolt {st['bolt']}, gods {st['gods']})", \
                found
        bears = [c for c in w.cards(seat, "Grizzly Bears") if "Protection from red" in (c.get("keywords") or [])]
        found[f"bears{seat}"] = bears[-1:]
        if not bears:
            problems.append(f"seat {seat}: the Bears have protection from red")
        last = w.boards(seat)[-1].get("battlefield") or []
        if not any(c.get("name") == "Grizzly Bears" for c in last):
            problems.append(f"seat {seat}: the Bears are still on the table")
        said = [a.get("said") for a in w.actions(seat) if "did nothing" in (a.get("said") or "")]
        if not any("could no longer be chosen" in s for s in said):
            problems.append(f"seat {seat}: the window says its target could no longer be chosen: {said}")
    return result(problems, "Gods Willing (protection from red) against Bob's Bolt: it fizzles, the Bears stay "
                            "with protection from red", found)


# --- pyroclasm ---------------------------------------------------------------------------------


def pyroclasm():
    st = {"cast": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, seat):
                return None
            if seat == 1:
                for name in ("Kor Firewalker", "Grizzly Bears"):
                    if not g.mine(1, name=name):
                        o = named(g, f, name)
                        if o:
                            return o
                return None
            if not st["cast"] and g.zone(2, "battlefield", owner=1, name="Kor Firewalker") \
                    and g.zone(2, "battlefield", owner=1, name="Grizzly Bears"):
                o = named(g, f, "Pyroclasm")
                st["cast"] = bool(o)
                return o
            return None
        return DEFAULT

    g = game("pyroclasm", [("Plains", 15), ("Forest", 15), ("Kor Firewalker", 15), ("Grizzly Bears", 15)],
             [("Mountain", 30), ("Pyroclasm", 30)],
             deal={1: {"hand": ["Plains", "Plains", "Forest", "Forest", "Kor Firewalker", "Grizzly Bears", "Plains"],
                       "top": ["Plains", "Forest"] * 3},
                   2: {"hand": ["Mountain"] * 4 + ["Pyroclasm"] * 3, "top": ["Mountain"] * 6}})
    w = Watch(g)

    def prevented(seat):
        return [h for d in w.hits(seat) for h in d.get("hits", []) if h.get("prevented")]

    def until(g):
        w.see()
        return all(prevented(s) for s in (1, 2)) and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        hits = prevented(seat)
        found[f"hits{seat}"] = [h for d in w.hits(seat) for h in d.get("hits", [])]
        if not hits:
            return "inconclusive", f"seat {seat} never saw the Pyroclasm stopped (cast {st['cast']})", found
        walker = first_id([c for c in w.cards(seat, "Kor Firewalker")])
        if hits[0].get("target") != {"object": walker} or hits[0].get("prevented") != 2 or hits[0].get("amount"):
            problems.append(f"seat {seat}: the Firewalker's 2 is prevented (amount 0, prevented 2): {hits}")
        bears = [h for h in found[f"hits{seat}"] if h.get("amount") == 2 and not h.get("prevented")]
        if not bears:
            problems.append(f"seat {seat}: the Bears take 2: {found[f'hits{seat}']}")
    return result(problems, "Pyroclasm: protection from red prevents the Firewalker's 2 (a prevented hit); the "
                            "Bears take 2", found)


SCENARIOS = {"ephemerate": ephemerate, "flickerwisp": flickerwisp, "teferi": teferi, "slip": slip, "regenerate": regenerate,
             "wrath": wrath, "myr-block": myr_block, "holy-day": holy_day,
             "fog": lambda: holy_day("Fog", "Forest"), "pro-red": pro_red,
             "pyroclasm": pyroclasm}

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
