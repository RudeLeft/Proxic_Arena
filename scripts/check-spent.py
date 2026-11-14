"""Spec 0084 -- spent not killed, library shuffles, coming alive, fights
(Mechanics Lab, Layer B).

    python -I scripts/check-spent.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is its own small game; what it checks is read from the
snapshots both seats were sent (protocol/README.md), never inferred:

  treasures  Three Treasures (Strike It Rich) pay for Hill Giant: each one's
             move off the battlefield says `spent`, to both seats; a Shock
             that kills Bob's Grizzly Bears in the same game is NOT spent
             (F-0084-A)
  wilds      Evolving Wilds and Windswept Heath cracked: each move `spent`;
             the Forest fetched comes in tapped; Alice's library `shuffles`
             told to both seats (F-0084-B)
  clue       Thraben Inspector's Clue cracked for {2}: the Clue `spent`, and
             its ability on the stack names the Clue as its source, to both
             seats (F-0084-C)
  rampant    Rampant Growth, then Sylvan Scrying: each shuffles Alice's
             library, told to both seats as `shuffles: [1]` (F-0084-D)
  copter     Llanowar Elves crew Smuggler's Copter: `crewed` {Copter, by:
             [Elves]} to both seats; the Copter is a 3/3 creature, and at
             the next turn is not (F-0084-E)
  mutavault  Mutavault animated for {1}: a 2/2 creature that turn, a land
             with no power the next (F-0084-E)
  prey       Prey Upon: Alice's Centaur Courser fights Bob's Grizzly Bears:
             the damage wave says `fight`, one fight, both striking
             (F-0084-F)
  ram        Ram Through: the Courser deals 3 to Bob's Bears: `fight`, one
             bite, no blockers (F-0084-F)
  edict      Diabolic Edict: Bob sacrifices his Bears -- `sacrificed`, never
             `spent` (an edict kills; it keeps the defeated look)

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
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
BEARS = [("Forest", 30), ("Grizzly Bears", 30)]
BEARS_DEAL = {"hand": ["Forest"] * 3 + ["Grizzly Bears"] * 4, "top": ["Forest", "Grizzly Bears"] * 4}
QUIET = [("Island", 60)]


def game(name, seat1, seat2=BEARS, deal=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"spent-{name}.jsonl")
    deal = dict(deal or {})
    if seat2 is BEARS and 2 not in deal:
        deal[2] = BEARS_DEAL
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

    def moves(self, seat):
        return [m for s in self.boards(seat) for m in (s.get("moves") or [])]

    def shuffles(self, seat):
        return [x for s in self.boards(seat) for x in (s.get("shuffles") or [])]

    def crewed(self, seat):
        return [x for s in self.boards(seat) for x in (s.get("crewed") or [])]

    def waves(self, seat):
        return [s["damage"] for s in self.boards(seat) if s.get("damage")]


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def stack_empty(g):
    return not g.state.get(1, {}).get("stack") and not g.state.get(1, {}).get("casting")


def cast(g, f, name, seat=1):
    """The option casting `name` from `seat`'s hand, when it can be paid."""
    return next((o["actionId"] for o in f["options"]
                 if o.get("payable") is not False and "Play land" not in (o.get("label") or "")
                 and any(c.get("id") == card_of(o.get("actionId")) and c.get("name") == name
                         for c in g.zone(seat, "hand"))), None)


def use(g, f, name, contains=None, seat=1):
    """An ability of `seat`'s permanent named `name` (its label containing `contains`)."""
    ids = {c["id"] for c in named(g, name, seat)}
    return next((o["actionId"] for o in f["options"]
                 if card_of(o.get("actionId")) in ids and o.get("payable") is not False
                 and (contains is None or contains.lower() in (o.get("label") or "").lower())), None)


def named(g, word, seat=1):
    """`seat`'s permanents whose name starts with `word` ("Treasure Token")."""
    return [c for c in g.mine(seat) if (c.get("name") or "").startswith(word)]


def bob_casts_bears(g, f):
    """Bob plays his lands and casts his Bears, nothing else."""
    if f.get("kind") == "chooseSpellAbilityToPlay":
        return g.play_land(f) or (cast(g, f, "Grizzly Bears", 2) if not g.zone(2, "stack") else None)
    if f.get("kind") in ("declareAttackers", "declareBlockers"):
        return None
    return DEFAULT


def pay_with(g, f, name):
    ids = {c["id"] for c in named(g, name) if not c.get("tapped")}
    return next((o["actionId"] for o in f.get("options", []) if card_of(o["actionId"]) in ids), None)


def spent_moves(w, seat, ids):
    return [m for m in w.moves(seat) if m.get("card") in ids and m.get("from", {}).get("zone") == "battlefield"]


# --- the scenarios ----------------------------------------------------------


def treasures():
    """Three Treasures pay for Hill Giant; a Shock kills a Bear (not spent)."""
    g = game("treasures", [("Mountain", 24), ("Strike It Rich", 18), ("Hill Giant", 12), ("Shock", 6)],
             deal={1: {"hand": ["Mountain", "Strike It Rich", "Mountain", "Strike It Rich", "Strike It Rich",
                                "Hill Giant", "Shock"],
                       "top": ["Mountain", "Mountain", "Mountain", "Mountain"]}})
    w = Watch(g)
    st = {"giant": None, "shock": None, "bear": None, "treasures": set(), "paying": False}

    def policy(g, f):
        seat = f["authorisedSeat"]
        kind = f.get("kind")
        if seat == 2:
            return bob_casts_bears(g, f)
        tr = named(g, "Treasure")
        st["treasures"] |= {c["id"] for c in tr}
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if not stack_empty(g):
                return None
            bears = [c for c in g.zone(1, "battlefield", owner=2) if c.get("name") == "Grizzly Bears"]
            if bears and not st["shock"] and g.untapped_lands(1):
                o = cast(g, f, "Shock")
                if o:
                    st["shock"], st["bear"] = card_of(o), bears[0]["id"]
                    st["paying"] = False
                    return o
            if len(tr) < 3 and g.untapped_lands(1):
                o = cast(g, f, "Strike It Rich")
                if o:
                    st["paying"] = False
                    return o
            untapped = [c for c in tr if not c.get("tapped")]
            if len(untapped) >= 3 and g.untapped_lands(1) and not st["giant"]:
                o = cast(g, f, "Hill Giant")
                if o:
                    st["giant"] = card_of(o)
                    st["paying"] = True
                    return o
            return None
        if kind == "chooseTargetsFor" and st["bear"] and not st["giant"]:
            return next((o["actionId"] for o in f["options"] if o.get("objectId") == st["bear"]), DEFAULT)
        if kind in ("applyManaToCost", "chooseManaAbility"):
            if st["paying"]:
                return pay_with(g, f, "Treasure") or pay_with(g, f, "Mountain") or DEFAULT
            return pay_with(g, f, "Mountain") or DEFAULT
        return DEFAULT

    def until(g):
        w.see()
        return st["giant"] is not None and stack_empty(g) and not named(g, "Treasure") \
            and bool(spent_moves(w, 2, {st["bear"]}))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"giant": st["giant"], "treasures": sorted(st["treasures"]), "bear": st["bear"],
             "moves1": spent_moves(w, 1, st["treasures"] | {st["bear"]}),
             "moves2": spent_moves(w, 2, st["treasures"] | {st["bear"]}), "stopped": g.stopped_badly()}
    if not st["giant"] or len(st["treasures"]) < 3 or not st["bear"]:
        return "inconclusive", "never paid for Hill Giant with three Treasures and Shocked a Bear", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        ms = spent_moves(w, seat, st["treasures"])
        if len(ms) < 3 or not all(m.get("spent") is True and m.get("why") == "sacrificed" for m in ms):
            problems.append(f"seat {seat}: three Treasures sacrificed and spent: {ms}")
        bear = spent_moves(w, seat, {st["bear"]})
        if not bear or any(m.get("spent") for m in bear):
            problems.append(f"seat {seat}: the Bear the Shock killed is not spent: {bear}")
    return result(problems, "three Treasures spent paying for Hill Giant; the Shocked Bear is not", found)


def wilds():
    """Evolving Wilds and Windswept Heath cracked; the library shuffles."""
    g = game("wilds", [("Forest", 24), ("Evolving Wilds", 12), ("Windswept Heath", 12), ("Grizzly Bears", 12)],
             QUIET,
             deal={1: {"hand": ["Evolving Wilds", "Windswept Heath", "Forest", "Grizzly Bears", "Forest",
                                "Grizzly Bears", "Forest"], "top": ["Forest"] * 6}})
    w = Watch(g)
    st = {"fetch": {}}

    def policy(g, f):
        seat = f["authorisedSeat"]
        kind = f.get("kind")
        if seat == 2:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            for name in ("Evolving Wilds", "Windswept Heath"):
                for c in g.mine(1, name=name):
                    if c["id"] not in st["fetch"] and not c.get("tapped"):
                        o = use(g, f, name)
                        if o:
                            st["fetch"][c["id"]] = name
                            return o
            if len(st["fetch"]) < 2:
                for name in ("Evolving Wilds", "Windswept Heath"):
                    if not g.mine(1, name=name) and not any(v == name for v in st["fetch"].values()):
                        o = g.play_land(f, prefer=name)
                        if o and name in " ".join(g.labels(f)):
                            return o
            return None
        if kind == "chooseSingleEntityForEffect" and f.get("options"):
            return f["options"][0]["actionId"]  # the land searched for
        return DEFAULT

    def until(g):
        w.see()
        return len(st["fetch"]) == 2 and stack_empty(g) \
            and all(any(m.get("card") == i and m.get("to", {}).get("zone") == "graveyard" for m in w.moves(1))
                    for i in st["fetch"])

    g.run(policy, until=until, max_turn=10)
    w.see()
    ids = set(st["fetch"])
    # Evolving Wilds puts its land in tapped; Windswept Heath untapped.
    forests = [c for s in w.boards(1) for c in s.get("battlefield", []) if c.get("seat") == 1
               and c.get("name") == "Forest"]
    fetched = [c for c in forests if c.get("tapped")]
    found = {"fetch": st["fetch"], "moves1": spent_moves(w, 1, ids), "moves2": spent_moves(w, 2, ids),
             "fetched": sorted({c["id"] for c in fetched}),
             "shuffles1": w.shuffles(1), "shuffles2": w.shuffles(2), "stopped": g.stopped_badly()}
    if len(ids) < 2:
        return "inconclusive", "never cracked both Evolving Wilds and Windswept Heath", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        ms = spent_moves(w, seat, ids)
        if len(ms) < 2 or not all(m.get("spent") is True for m in ms):
            problems.append(f"seat {seat}: both fetch lands spent: {ms}")
        if w.shuffles(seat).count(1) < 2:
            problems.append(f"seat {seat}: Alice's library shuffled twice: {w.shuffles(seat)}")
    if len({c["id"] for c in forests}) < 2 or not found["fetched"]:
        problems.append(f"two Forests fetched, the Wilds' tapped: {sorted({c['id'] for c in forests})}, "
                        f"tapped {found['fetched']}")
    return result(problems, "Evolving Wilds and Windswept Heath spent; two Forests in (the Wilds' tapped); Alice's library "
                            "shuffled, both seats told",
                  found)


def clue():
    """Thraben Inspector's Clue cracked: spent, its ability names it."""
    g = game("clue", [("Plains", 30), ("Thraben Inspector", 30)], QUIET,
             deal={1: {"hand": ["Plains", "Thraben Inspector", "Plains", "Plains", "Plains", "Plains", "Plains"],
                       "top": ["Plains"] * 6}})
    w = Watch(g)
    st = {"clue": None, "ability": {1: [], 2: []}}

    def policy(g, f):
        seat = f["authorisedSeat"]
        kind = f.get("kind")
        if seat == 2:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if not stack_empty(g):
                return None
            if not g.mine(1, name="Thraben Inspector"):
                return cast(g, f, "Thraben Inspector")
            clues = named(g, "Clue")
            if clues and not st["clue"] and len(g.untapped_lands(1)) >= 2:
                o = use(g, f, "Clue")
                if o:
                    st["clue"] = clues[0]["id"]
                    return o
            return None
        return DEFAULT

    def until(g):
        w.see()
        for seat in (1, 2):
            for e in (g.state.get(seat, {}).get("stack") or []):
                if st["clue"] and e.get("source") == st["clue"]:
                    st["ability"][seat].append(e.get("id"))
        return st["clue"] and stack_empty(g) and bool(spent_moves(w, 2, {st["clue"]}))

    g.run(policy, until=until, max_turn=10)
    w.see()
    found = {"clue": st["clue"], "moves1": spent_moves(w, 1, {st["clue"]}), "moves2": spent_moves(w, 2, {st["clue"]}),
             "ability": st["ability"], "stopped": g.stopped_badly()}
    if not st["clue"]:
        return "inconclusive", "never cracked a Clue", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        ms = spent_moves(w, seat, {st["clue"]})
        if not ms or not all(m.get("spent") is True for m in ms):
            problems.append(f"seat {seat}: the Clue spent: {ms}")
        if not st["ability"][seat]:
            problems.append(f"seat {seat}: the Clue's ability on the stack names the Clue as its source")
    return result(problems, "the Clue spent; its ability's source is the Clue, both seats", found)


def rampant():
    """Rampant Growth, then Sylvan Scrying: Alice's library shuffles each time."""
    g = game("rampant", [("Forest", 30), ("Rampant Growth", 15), ("Sylvan Scrying", 15)], QUIET,
             deal={1: {"hand": ["Forest", "Forest", "Rampant Growth", "Sylvan Scrying", "Forest", "Forest", "Forest"],
                       "top": ["Forest"] * 6}})
    w = Watch(g)
    st = {"cast": []}

    def policy(g, f):
        seat = f["authorisedSeat"]
        kind = f.get("kind")
        if seat == 2:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if not stack_empty(g):
                return None
            for name in ("Rampant Growth", "Sylvan Scrying"):
                if name not in st["cast"]:
                    o = cast(g, f, name)
                    if o:
                        st["cast"].append(name)
                        return o
            return None
        return DEFAULT

    def until(g):
        w.see()
        return len(st["cast"]) == 2 and stack_empty(g) and w.shuffles(1).count(1) >= 2 \
            and w.shuffles(2).count(1) >= 2

    g.run(policy, until=until, max_turn=10)
    w.see()
    found = {"cast": st["cast"], "shuffles1": w.shuffles(1), "shuffles2": w.shuffles(2), "stopped": g.stopped_badly()}
    if len(st["cast"]) < 2:
        return "inconclusive", "never cast both Rampant Growth and Sylvan Scrying", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        if w.shuffles(seat).count(1) < 2:
            problems.append(f"seat {seat}: Alice's library shuffled twice: {w.shuffles(seat)}")
        # The game's own opening shuffles come with the first boards, before
        # anyone played (the page draws no first board moving).
        later = [x for s in w.boards(seat) if (s.get("turn") or 0) >= 2 for x in (s.get("shuffles") or [])]
        if 2 in later:
            problems.append(f"seat {seat}: Bob's library was never shuffled in play: {w.shuffles(seat)}")
    return result(problems, "Rampant Growth and Sylvan Scrying: `shuffles: [1]` each time, both seats", found)


def copter():
    """Llanowar Elves crew Smuggler's Copter."""
    g = game("copter", [("Forest", 30), ("Llanowar Elves", 15), ("Smuggler's Copter", 15)], QUIET,
             deal={1: {"hand": ["Forest", "Llanowar Elves", "Forest", "Smuggler's Copter", "Forest", "Forest",
                                "Forest"], "top": ["Forest"] * 6}})
    w = Watch(g)
    st = {"crewed": None, "turn": None, "copter": None, "elves": None}

    def policy(g, f):
        seat = f["authorisedSeat"]
        kind = f.get("kind")
        if seat == 2:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if not stack_empty(g):
                return None
            if not g.mine(1, name="Llanowar Elves"):
                return cast(g, f, "Llanowar Elves")
            if not g.mine(1, name="Smuggler's Copter"):
                return cast(g, f, "Smuggler's Copter")
            elves = g.mine(1, name="Llanowar Elves")[0]
            cop = g.mine(1, name="Smuggler's Copter")[0]
            if not st["crewed"] and not elves.get("tapped") and not elves.get("sick"):
                o = use(g, f, "Smuggler's Copter", contains="crew")
                if o:
                    st["crewed"], st["turn"] = True, g.turn
                    st["copter"], st["elves"] = cop["id"], elves["id"]
                    return o
            return None
        if kind == "CostTapType" and st["elves"]:
            return next((o["actionId"] for o in f["options"] if card_of(o.get("actionId")) == st["elves"]),
                        f["options"][0]["actionId"] if f.get("options") else None)
        if kind in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def alive(g, seat):
        c = next((c for c in g.zone(seat, "battlefield") if c.get("id") == st["copter"]), None)
        return c and c.get("power") is not None

    def until(g):
        w.see()
        return st["turn"] is not None and g.turn >= st["turn"] + 1 and not alive(g, 1) \
            and any(x.get("card") == st["copter"] for x in w.crewed(2))

    g.run(policy, until=until, max_turn=12)
    w.see()
    found = {"copter": st["copter"], "elves": st["elves"], "crewed1": w.crewed(1), "crewed2": w.crewed(2),
             "stopped": g.stopped_badly()}
    if not st["crewed"]:
        return "inconclusive", "never crewed the Copter", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        cr = [x for x in w.crewed(seat) if x.get("card") == st["copter"]]
        if not cr or st["elves"] not in cr[0].get("by", []):
            problems.append(f"seat {seat}: crewed by the Elves: {w.crewed(seat)}")
        sizes = [next((c.get("power") for c in s.get("battlefield", []) if c.get("id") == st["copter"]), "gone")
                 for s in w.boards(seat)]
        if 3 not in sizes:
            problems.append(f"seat {seat}: the Copter was never a 3/3: {sizes}")
    if alive(g, 1):
        problems.append("the Copter is still a creature the next turn")
    return result(problems, "the Elves crewed the Copter (`crewed`, both seats); a 3/3, then not", found)


def mutavault():
    """Mutavault becomes a 2/2 for {1}, and is a land again next turn."""
    g = game("mutavault", [("Mountain", 30), ("Mutavault", 30)], QUIET,
             deal={1: {"hand": ["Mutavault", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain"],
                       "top": ["Mountain"] * 6}})
    w = Watch(g)
    st = {"turn": None, "vault": None}

    def policy(g, f):
        seat = f["authorisedSeat"]
        kind = f.get("kind")
        if seat == 2:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            if not g.mine(1, name="Mutavault"):
                return g.play_land(f, prefer="Mutavault")
            land = g.play_land(f)
            if land:
                return land
            if not stack_empty(g):
                return None
            if st["turn"] is None and g.untapped_lands(1, name="Mountain"):
                o = use(g, f, "Mutavault", contains="creature")
                if o:
                    st["turn"], st["vault"] = g.turn, g.mine(1, name="Mutavault")[0]["id"]
                    return o
            return None
        if kind in ("applyManaToCost", "chooseManaAbility"):
            return pay_with(g, f, "Mountain") or DEFAULT
        if kind in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def power(s):
        return next((c.get("power") for c in s.get("battlefield", []) if c.get("id") == st["vault"]), "gone")

    def until(g):
        w.see()
        return st["turn"] is not None and g.turn >= st["turn"] + 1 and power(g.state.get(1, {})) is None

    g.run(policy, until=until, max_turn=10)
    w.see()
    sizes = {seat: [power(s) for s in w.boards(seat)] for seat in (1, 2)}
    found = {"vault": st["vault"], "sizes": sizes, "stopped": g.stopped_badly()}
    if st["turn"] is None:
        return "inconclusive", "never animated Mutavault", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        if 2 not in sizes[seat] or (seat == 1 and sizes[seat][-1] is not None):
            problems.append(f"seat {seat}: a 2/2, then a land again: {sizes[seat]}")
    return result(problems, "Mutavault a 2/2 for the turn, a land again after, both seats", found)


def fight_game(name, spell):
    g = game(name, [("Forest", 30), ("Centaur Courser", 15), (spell, 15)],
             deal={1: {"hand": ["Forest", "Forest", "Centaur Courser", "Forest", spell, "Forest", "Forest"],
                       "top": ["Forest"] * 6}})
    w = Watch(g)
    st = {"cast": False, "courser": None, "bear": None}

    def policy(g, f):
        seat = f["authorisedSeat"]
        kind = f.get("kind")
        if seat == 2:
            return bob_casts_bears(g, f)
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if not stack_empty(g):
                return None
            if not g.mine(1, name="Centaur Courser"):
                return cast(g, f, "Centaur Courser")
            bears = [c for c in g.zone(1, "battlefield", owner=2) if c.get("name") == "Grizzly Bears"]
            if bears and not st["cast"]:
                o = cast(g, f, spell)
                if o:
                    st["cast"] = True
                    st["courser"] = g.mine(1, name="Centaur Courser")[0]["id"]
                    st["bear"] = bears[0]["id"]
                    return o
            return None
        if kind == "chooseTargetsFor" and st["cast"]:
            for want in (st["courser"], st["bear"]):
                o = next((o["actionId"] for o in f["options"] if o.get("objectId") == want), None)
                if o:
                    return o
            return DEFAULT
        if kind in ("declareAttackers",):
            return None
        return DEFAULT

    def until(g):
        w.see()
        return st["cast"] and stack_empty(g) and any(wv.get("fight") for wv in w.waves(2))

    g.run(policy, until=until, max_turn=12)
    w.see()
    return g, w, st


def check_fight(name, spell, blockers):
    g, w, st = fight_game(name, spell)
    found = {"courser": st["courser"], "bear": st["bear"], "waves1": w.waves(1), "waves2": w.waves(2),
             "stopped": g.stopped_badly()}
    if not st["cast"]:
        return "inconclusive", f"never cast {spell} with the Courser and a Bear", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        waves = [wv for wv in w.waves(seat) if wv.get("fight")]
        if len(waves) != 1:
            problems.append(f"seat {seat}: one wave marked `fight`: {w.waves(seat)}")
            continue
        wv = waves[0]
        want = [{"attacker": st["courser"], "defender": {"object": st["bear"]},
                 "blockers": [st["bear"]] if blockers else []}]
        if wv.get("fights") != want:
            problems.append(f"seat {seat}: fights {wv.get('fights')}, wanted {want}")
        if wv.get("combat"):
            problems.append(f"seat {seat}: a spell's fight is not combat's: {wv.get('combat')}")
    return result(problems, f"{spell}: one {'fight, both striking' if blockers else 'bite, no blockers'}, "
                            "told to both seats", found)


def prey():
    return check_fight("prey", "Prey Upon", True)


def ram():
    return check_fight("ram", "Ram Through", False)


def edict():
    """Diabolic Edict: Bob's sacrificed Bear is not spent."""
    g = game("edict", [("Swamp", 30), ("Diabolic Edict", 30)],
             deal={1: {"hand": ["Swamp", "Swamp", "Diabolic Edict", "Swamp", "Swamp", "Swamp", "Diabolic Edict"],
                       "top": ["Swamp"] * 6}})
    w = Watch(g)
    st = {"cast": False, "bears": set()}

    def policy(g, f):
        seat = f["authorisedSeat"]
        kind = f.get("kind")
        if seat == 2:
            return bob_casts_bears(g, f)
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if not stack_empty(g):
                return None
            bears = [c for c in g.zone(1, "battlefield", owner=2) if c.get("name") == "Grizzly Bears"]
            if bears and not st["cast"]:
                o = cast(g, f, "Diabolic Edict")
                if o:
                    st["cast"] = True
                    st["bears"] = {c["id"] for c in bears}
                    return o
            return None
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if "player:2" in (o.get("actionId") or "")
                         or o.get("objectId") == "player:2"), DEFAULT)
        return DEFAULT

    def until(g):
        w.see()
        return st["cast"] and stack_empty(g) and any(m.get("why") == "sacrificed" for m in w.moves(2))

    g.run(policy, until=until, max_turn=10)
    w.see()
    found = {"moves1": [m for m in w.moves(1) if m.get("why") == "sacrificed"],
             "moves2": [m for m in w.moves(2) if m.get("why") == "sacrificed"], "stopped": g.stopped_badly()}
    if not st["cast"] or not found["moves2"]:
        return "inconclusive", "Diabolic Edict never made Bob sacrifice a Bear", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        ms = [m for m in w.moves(seat) if m.get("why") == "sacrificed"]
        if not ms or any(m.get("spent") for m in ms):
            problems.append(f"seat {seat}: an edict's sacrifice is never spent: {ms}")
    return result(problems, "Diabolic Edict: Bob's Bear sacrificed, not spent (keeps the defeated look)", found)


SCENARIOS = {"treasures": treasures, "wilds": wilds, "clue": clue, "rampant": rampant, "copter": copter,
             "mutavault": mutavault, "prey": prey, "ram": ram, "edict": edict}

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
            print("  " + json.dumps(found, default=str)[:2500])
        sys.stdout.flush()
    sys.exit(worst)
