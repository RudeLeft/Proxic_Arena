"""Spec 0079 -- creature copies, copied spells, and spells that fizzle
(Mechanics Lab, Layer B).

    python -I scripts/check-copies.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker. What it checks is read
from the snapshots both seats were sent -- a card's `copy` and `copyOf`
(the card it copied, by id, only while the reader may see that card) and
`artOwner` (whose deck has the copied card's picture), a stack entry's
`copy` and `copyOf` (the stack entry it copies), the round's `moves` (a
copy ending on the stack goes to "nowhere"; a spell that fizzled says
why: "fizzled"), the report window (`action`) and the play log -- never
inferred:

  clone        Alice's Clone enters as a copy of Bob's Serra Angel: on
               Alice's side, named Serra Angel, copy, copyOf Bob's Angel,
               artOwner 2 -- to both seats
  counterpart  Cackling Counterpart on Alice's own Serra Angel: a Serra
               Angel token, copy, copyOf the Angel (no artOwner: her own)
  fork         Bob's Lightning Bolt at Alice; Alice's Fork copies it at
               Bob: the copy is a copy of the Bolt's stack entry, artOwner
               2, the log says "copied" (not "cast"), and when it is done
               it goes to "nowhere" (no graveyard); Bob takes 3
  storm        Four Ornithopters, then Grapeshot: four copies of the
               Grapeshot's stack entry, each going "nowhere" when done
  fizzle       Alice's Lightning Bolt at Bob's Grizzly Bears (between his
               two other creatures); Bob answers with Unsummon: the Bolt's
               move says "fizzled", both seats get the report window
               ("Alice's Lightning Bolt did nothing: its target was
               gone." / "Your ...") and a play-log line
  storm-split  spec 0082: the same storm, two copies at Bob and two at his
               Grizzly Bears -- two groups of one batch; the Bears die
  resonator    spec 0082: Strionic Resonator copies Flametongue Kavu's
               trigger; the copy (a trigger entry) is `copy`, names the
               trigger's entry, carries its batch, and aims at the Bears

Spec 0082, in fork, storm and storm-split: the copies on their way onto the
stack are never in `casting`; they are in `copying`, counting up 1 -> N
with the one asked "new target?" marked `aiming`, each naming the
original's entry, one batch (`group`) the same on the way and on the stack.

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
        trace = os.path.join(TRACES, f"copies-{name}.jsonl")
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

    def stacks(self, seat):
        return [e for s in self.boards(seat) for e in s.get("stack") or []]

    def moves(self, seat):
        return [m for s in self.boards(seat) for m in (s.get("moves") or [])]

    def actions(self, seat):
        out = []
        for s in self.boards(seat):
            a = s.get("action")
            if a and a not in out:
                out.append(a)
        return out

    def log(self, seat):
        lines = []
        for s in self.boards(seat):
            for line in s.get("playLog") or []:
                words = "".join(p if isinstance(p, str) else p.get("name") or f"<{p.get('player')}>"
                                for p in line.get("parts") or [])
                lines.append(words)
        return lines


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
    """The first option whose label (or object) contains any of [words]."""
    for o in f.get("options", []):
        label = o.get("label") or ""
        if any(w in label for w in words):
            return o["actionId"]
    return None


def stack_of(g, seat):
    return (g.state.get(seat) or {}).get("stack") or []


# --- clone ------------------------------------------------------------------------


def clone():
    st = {"cast": False}

    def policy(g, f):
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, seat):
                return None
            if seat == 2:
                return None if g.mine(2, name="Serra Angel") else named(g, f, "Serra Angel")
            if g.zone(1, "battlefield", owner=2, name="Serra Angel") and not st["cast"]:
                o = named(g, f, "Clone")
                st["cast"] = bool(o)
                return o
            return None
        if seat == 1 and st["cast"]:
            # Clone's "enter as a copy?" and "of which creature?": yes, Bob's Angel.
            angel = next((c["id"] for c in g.zone(1, "battlefield", owner=2, name="Serra Angel")), None)
            o = next((o["actionId"] for o in f.get("options", []) if angel and o.get("objectId") == angel), None)
            return o or labelled(f, "Serra Angel", "Yes", "yes", "Copy", "copy") or DEFAULT
        return DEFAULT

    g = game("clone", [("Island", 30), ("Clone", 30)], [("Plains", 30), ("Serra Angel", 30)],
             deal={1: {"hand": ["Island"] * 4 + ["Clone"] * 3, "top": ["Island"] * 6},
                   2: {"hand": ["Plains"] * 5 + ["Serra Angel"] * 2, "top": ["Plains"] * 6}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(any(c.get("seat") == 1 and c.get("copy") for c in w.cards(s, "Serra Angel")) for s in (1, 2))

    g.run(policy, until=until, max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly(), "asked": [a for a in g.asked if a[0] == 1][-6:]}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        copies = [c for c in w.cards(seat, "Serra Angel") if c.get("seat") == 1]
        bobs = [c for c in w.cards(seat, "Serra Angel") if c.get("seat") == 2]
        found[f"seat{seat}"] = copies[-1:] + bobs[-1:]
        if not copies:
            return "inconclusive", f"seat {seat} never saw Alice's Clone as a Serra Angel", found
        clone_ = copies[-1]
        if not clone_.get("copy"):
            problems.append(f"seat {seat}: the Clone should say it is a copy: {clone_}")
        if not bobs or clone_.get("copyOf") != bobs[-1]["id"]:
            problems.append(f"seat {seat}: the Clone should name Bob's Angel ({bobs[-1:]}) as what it copied: "
                            f"{clone_.get('copyOf')}")
        if clone_.get("artOwner") != 2:
            problems.append(f"seat {seat}: the Clone wears Bob's Angel picture (artOwner 2): {clone_.get('artOwner')}")
        if bobs and bobs[-1].get("copy"):
            problems.append(f"seat {seat}: Bob's own Angel is not a copy: {bobs[-1]}")
        # The Clone on the stack was "Clone", never a copy.
        clones = [e for e in w.stacks(seat) if e.get("name") == "Clone"]
        if not clones or any(e.get("copy") for e in clones):
            problems.append(f"seat {seat}: Clone on the stack is a spell, not a copy: {clones[:1]}")
    return result(problems, "Clone enters as Bob's Serra Angel: copy, copyOf Bob's Angel, artOwner 2, to both", found)


# --- counterpart --------------------------------------------------------------------


def counterpart():
    st = {"cast": False}

    def policy(g, f):
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if seat != 1:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, seat):
                return None
            if not g.mine(1, name="Serra Angel"):
                return named(g, f, "Serra Angel")
            if not st["cast"]:
                o = named(g, f, "Cackling Counterpart")
                st["cast"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor":
            angel = next((c["id"] for c in g.mine(1, name="Serra Angel")), None)
            return next((o["actionId"] for o in f["options"] if o.get("objectId") == angel), DEFAULT)
        return DEFAULT

    lands = ["Plains", "Island", "Plains", "Island", "Plains", "Island", "Island", "Plains"]
    g = game("counterpart", [("Plains", 15), ("Island", 15), ("Serra Angel", 15), ("Cackling Counterpart", 15)],
             [("Swamp", 60)],
             deal={1: {"hand": lands[:4] + ["Serra Angel", "Cackling Counterpart", "Cackling Counterpart"],
                       "top": lands[4:] + ["Island"] * 4}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(any(c.get("token") and c.get("copy") for c in w.cards(s, "Serra Angel")) for s in (1, 2))

    g.run(policy, until=until, max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        tokens = [c for c in w.cards(seat, "Serra Angel") if c.get("token")]
        cards = [c for c in w.cards(seat, "Serra Angel") if not c.get("token")]
        found[f"seat{seat}"] = tokens[-1:] + cards[-1:]
        if not tokens:
            return "inconclusive", f"seat {seat} never saw a Serra Angel token", found
        token = tokens[-1]
        if not token.get("copy"):
            problems.append(f"seat {seat}: the token should say it is a copy: {token}")
        if not cards or token.get("copyOf") != cards[-1]["id"]:
            problems.append(f"seat {seat}: the token should name the Angel it copies ({cards[-1:]}): "
                            f"{token.get('copyOf')}")
        if "artOwner" in token:
            problems.append(f"seat {seat}: a copy of your own card wears your own picture (no artOwner): {token}")
    return result(problems, "Cackling Counterpart: a Serra Angel token, copy, copyOf Alice's Angel, to both", found)


# --- fork -----------------------------------------------------------------------------


def fork():
    st = {"bolt": False, "fork": False}

    def policy(g, f):
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        stack = stack_of(g, seat)
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 2 and not stack and not st["bolt"] and len(g.untapped_lands(1)) >= 2 \
                    and g.untapped_lands(2):
                o = named(g, f, "Lightning Bolt")
                st["bolt"] = bool(o)
                return o
            if seat == 1 and not st["fork"] and any(e.get("name") == "Lightning Bolt" and e.get("controller") == 2
                                                   for e in stack):
                o = named(g, f, "Fork")
                st["fork"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor":
            if seat == 2:
                return labelled(f, "Alice") or DEFAULT
            bolt = next((e["id"] for e in stack if e.get("name") == "Lightning Bolt"), None)
            o = next((o["actionId"] for o in f["options"] if bolt and o.get("objectId") == bolt), None)
            return o or labelled(f, "Bob") or DEFAULT
        if seat == 1 and st["fork"]:
            # "Choose new targets for the copy?": yes -- at Bob.
            return labelled(f, "Bob") or labelled(f, "Yes", "yes") or DEFAULT
        return DEFAULT

    g = game("fork", [("Mountain", 30), ("Fork", 30)], [("Mountain", 30), ("Lightning Bolt", 30)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Fork"] * 3, "top": ["Mountain"] * 4},
                   2: {"hand": ["Mountain"] * 4 + ["Lightning Bolt"] * 3, "top": ["Mountain"] * 4}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(any(m.get("to", {}).get("zone") == "nowhere" for m in w.moves(s)) for s in (1, 2)) \
            and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "asked": [a for a in g.asked if a[0] == 1][-6:]}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        copies = [e for e in w.stacks(seat) if e.get("copy")]
        found[f"seat{seat}"] = copies[:1] + [e for e in w.stacks(seat) if not e.get("copy")][:2]
        if not copies:
            return "inconclusive", f"seat {seat} never saw Fork's copy on the stack", found
        copy = copies[0]
        bolts = [e for e in w.stacks(seat) if e.get("name") == "Lightning Bolt" and not e.get("copy")]
        if copy.get("name") != "Lightning Bolt" or copy.get("controller") != 1:
            problems.append(f"seat {seat}: the copy is Alice's Lightning Bolt: {copy}")
        if not bolts or copy.get("copyOf") != bolts[0]["id"]:
            problems.append(f"seat {seat}: the copy names the Bolt's entry ({bolts[:1]}): {copy.get('copyOf')}")
        if copy.get("artOwner") != 2:
            problems.append(f"seat {seat}: the copy wears Bob's Bolt picture (artOwner 2): {copy}")
        if any(e.get("copy") for e in bolts):
            problems.append(f"seat {seat}: Bob's own Bolt is not a copy")
        ended = [m for m in w.moves(seat) if m.get("card") == copy.get("source")]
        if [m.get("to", {}).get("zone") for m in ended] != ["nowhere"]:
            problems.append(f"seat {seat}: the copy ends on the stack, to nowhere (never a graveyard): {ended}")
        log = w.log(seat)
        found[f"log{seat}"] = [line for line in log if "Lightning Bolt" in line][-4:]
        if not any("copied Lightning Bolt" in line for line in log) or \
                any(line.startswith("<1> cast Lightning Bolt") for line in log):
            problems.append(f"seat {seat}: the log says Alice copied the Bolt, not cast it: {found[f'log{seat}']}")
        problems += putting_on(w, seat, {copy.get("source")}, {copy["id"]: copy}, found)
    return result(problems, "Fork: the copy of Bob's Bolt is marked, names its entry, artOwner 2, "
                            "\"copied\" in the log, gone to nowhere", found)


# --- storm ------------------------------------------------------------------------------


def storm():
    st = {"thopters": 0, "grape": False}

    def policy(g, f):
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if seat != 1:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, 1):
                return None
            # Storm counts this turn's spells: the four Ornithopters, then
            # Grapeshot, all in the turn with two lands to pay for it.
            if len(g.untapped_lands(1)) < 2:
                return None
            if len(g.mine(1, name="Ornithopter")) < 4:
                return named(g, f, "Ornithopter")
            if not st["grape"] and len(g.untapped_lands(1)) >= 2:
                o = named(g, f, "Grapeshot")
                st["grape"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor":
            return labelled(f, "Bob") or DEFAULT
        if st["grape"]:
            return labelled(f, "Bob") or labelled(f, "Yes", "yes") or DEFAULT
        return DEFAULT

    g = game("storm", [("Mountain", 30), ("Ornithopter", 15), ("Grapeshot", 15)], [("Island", 60)],
             deal={1: {"hand": ["Mountain", "Mountain", "Ornithopter", "Ornithopter", "Ornithopter", "Ornithopter",
                                "Grapeshot"], "top": ["Mountain"] * 4}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(len([m for m in w.moves(s) if m.get("to", {}).get("zone") == "nowhere"]) >= 4 for s in (1, 2)) \
            and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=10)
    w.see()
    found = {"stopped": g.stopped_badly(), "asked": [a for a in g.asked if a[0] == 1][-6:]}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        copies = {e["id"]: e for e in w.stacks(seat) if e.get("copy")}
        grapes = [e for e in w.stacks(seat) if e.get("name") == "Grapeshot" and e.get("kind") == "spell"
                  and not e.get("copy")]
        found[f"seat{seat}"] = list(copies.values())[:2] + grapes[:1]
        if len(copies) < 4:
            return "inconclusive", f"seat {seat} saw {len(copies)} storm copies, not 4", found
        if len(copies) != 4:
            problems.append(f"seat {seat}: four spells before it, four copies: {len(copies)}")
        if not grapes or any(e.get("copyOf") != grapes[0]["id"] for e in copies.values()):
            problems.append(f"seat {seat}: each copy names the Grapeshot's entry ({grapes[:1]}): "
                            f"{[e.get('copyOf') for e in copies.values()]}")
        if any("artOwner" in e for e in copies.values()):
            problems.append(f"seat {seat}: a copy of your own spell wears your own picture (no artOwner)")
        sources = {e.get("source") for e in copies.values()}
        ended = list({m.get("card"): m for m in w.moves(seat) if m.get("card") in sources}.values())
        if len(ended) != 4 or any(m.get("to", {}).get("zone") != "nowhere" for m in ended):
            problems.append(f"seat {seat}: each copy ends to nowhere: {ended}")
        # Told once, with the board it ended in: its entry gone from that stack.
        early = [(s.get("stateRevision"), m.get("card")) for s in w.boards(seat) for m in s.get("moves") or []
                 if m.get("card") in sources and any(e.get("source") == m.get("card") for e in s.get("stack") or [])]
        told = [m.get("card") for s in w.boards(seat) for m in s.get("moves") or [] if m.get("card") in sources]
        if early or len(told) != 4:
            problems.append(f"seat {seat}: each copy's end is told once, with the board it is gone from: "
                            f"early {early}, told {told}")
        bob = next((p for p in (g.state.get(seat) or {}).get("players", []) if p.get("seat") == 2), {})
        if bob.get("life") != 15:
            problems.append(f"seat {seat}: Grapeshot and four copies, 1 each: Bob at 15: {bob.get('life')}")
        problems += putting_on(w, seat, sources, copies, found)
    return result(problems, "Grapeshot with storm 4: four copies of its entry, each gone to nowhere; Bob 20 -> 15; "
                            "on their way, 1 -> 4 in `copying` (never `casting`), one batch", found)


def putting_on(w, seat, sources, copies, found):
    """Spec 0082 -- the copies on their way onto the stack, as [seat] saw them:
    never in `casting` (they are not cast); in `copying`, counting up 1 -> N
    with the one asked "new target?" marked `aiming`, each naming the
    original's entry; one batch (`group`) the same in `copying` and on the
    stack; every copy's card listed there before it is on the stack."""
    problems = []
    boards = w.boards(seat)
    cast = [c.get("id") for s in boards for c in s.get("casting") or [] if c.get("copy")]
    if cast:
        problems.append(f"seat {seat}: a copy put onto the stack is never in `casting`: {cast[:4]}")
    counts, aimed, groups, early = [], 0, set(), set()
    for s in boards:
        coming = s.get("copying") or []
        if not coming:
            continue
        if not counts or counts[-1] != len(coming):
            counts.append(len(coming))
        aimed += sum(1 for e in coming if e.get("aiming"))
        for e in coming:
            groups.add(e.get("group"))
            early.add(e.get("source"))
            if not e.get("copy") or not str(e.get("copyOf") or "").startswith("stack:"):
                problems.append(f"seat {seat}: a copy on its way names the entry it copies: {e}")
                break
    found[f"copying{seat}"] = counts
    n = len(sources)
    if counts[:n] != list(range(1, n + 1)):
        problems.append(f"seat {seat}: the copies on their way count up 1 -> {n}: {counts}")
    if aimed == 0:
        problems.append(f"seat {seat}: the copy asked \"new target?\" is marked `aiming`")
    stacked = {e.get("group") for e in copies.values()}
    if len(groups) != 1 or None in groups or groups != stacked:
        problems.append(f"seat {seat}: one batch, the same group on the way and on the stack: {groups} / {stacked}")
    if early != sources:
        problems.append(f"seat {seat}: every copy is shown on its way before it is on the stack: {early} / {sources}")
    return problems


# --- storm, split targets -----------------------------------------------------------


def storm_split():
    """Spec 0082 -- Grapeshot with storm 4 at Bob, two copies at Bob and two at
    his Grizzly Bears: two groups of two (the same batch), the Bears die."""
    st = {"thopters": 0, "grape": False, "asked": 0}

    def policy(g, f):
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if seat == 2:
            if kind == "chooseSpellAbilityToPlay":
                land = g.play_land(f)
                if land:
                    return land
                if not stack_of(g, 2) and not g.mine(2, name="Grizzly Bears"):
                    return named(g, f, "Grizzly Bears")
                return None
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, 1):
                return None
            if len(g.untapped_lands(1)) < 2 or not g.zone(1, "battlefield", owner=2, name="Grizzly Bears"):
                return None
            if len(g.mine(1, name="Ornithopter")) < 4:
                return named(g, f, "Ornithopter")
            if not st["grape"]:
                o = named(g, f, "Grapeshot")
                st["grape"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor" and st["grape"] and "New target" in (f.get("prompt") or ""):
            st["asked"] += 1
            if st["asked"] > 2:
                bears = next((c["id"] for c in g.zone(1, "battlefield", owner=2, name="Grizzly Bears")), None)
                return next((o["actionId"] for o in f["options"] if bears and o.get("objectId") == bears), DEFAULT)
            return labelled(f, "Bob") or DEFAULT
        if kind == "chooseTargetsFor":
            return labelled(f, "Bob") or DEFAULT
        return DEFAULT

    g = game("storm-split", [("Mountain", 30), ("Ornithopter", 15), ("Grapeshot", 15)],
             [("Forest", 40), ("Grizzly Bears", 20)],
             deal={1: {"hand": ["Mountain", "Mountain", "Ornithopter", "Ornithopter", "Ornithopter", "Ornithopter",
                                "Grapeshot"], "top": ["Mountain"] * 4},
                   2: {"hand": ["Forest", "Forest", "Grizzly Bears", "Forest", "Forest", "Forest", "Forest"],
                       "top": ["Forest"] * 4}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(len([m for m in w.moves(s) if m.get("to", {}).get("zone") == "nowhere"]) >= 4 for s in (1, 2)) \
            and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=12)
    w.see()
    found = {"stopped": g.stopped_badly(), "asked": st["asked"]}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        copies = {e["id"]: e for e in w.stacks(seat) if e.get("copy")}
        if len(copies) < 4:
            return "inconclusive", f"seat {seat} saw {len(copies)} storm copies, not 4", found
        sources = {e.get("source") for e in copies.values()}
        # The board where all four first stand on the stack: two at Bob, two at the Bears.
        landed = next((s for s in w.boards(seat)
                       if len([e for e in s.get("stack") or [] if e.get("copy")]) == 4), None)
        aims = [json.dumps(e.get("targets"), sort_keys=True) for e in (landed or {}).get("stack") or []
                if e.get("copy")]
        found[f"aims{seat}"] = aims
        if sorted({a: aims.count(a) for a in aims}.values()) != [2, 2]:
            problems.append(f"seat {seat}: two copies at Bob and two at his Bears: {aims}")
        problems += putting_on(w, seat, sources, copies, found)
        bears = [m for m in w.moves(seat) if m.get("to", {}).get("zone") == "graveyard"
                 and m.get("from", {}).get("zone") == "battlefield"]
        if not bears:
            problems.append(f"seat {seat}: two copies at the Bears kill them")
    return result(problems, "Grapeshot storm 4, split: two copies at Bob, two at the Bears (one batch, two groups), "
                            "1 -> 4 on their way, the Bears die", found)


# --- an ability copy: Strionic Resonator ----------------------------------------------


def resonator():
    """Spec 0082 -- Strionic Resonator copies Flametongue Kavu's trigger (at Bob's
    Serra Angel); the copy aims at his Grizzly Bears. The copy is a stack entry
    marked `copy`, naming the trigger's entry; on its way it is in `copying`."""
    st = {"reso": False, "ftk": False, "copy": False, "asked": 0}

    def policy(g, f):
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        stack = stack_of(g, seat)
        if seat == 2:
            if kind == "chooseSpellAbilityToPlay":
                land = g.play_land(f)
                if land:
                    return land
                if stack:
                    return None
                if not g.mine(2, name="Grizzly Bears"):
                    return named(g, f, "Grizzly Bears")
                if not g.mine(2, name="Serra Angel"):
                    return named(g, f, "Serra Angel")
                return None
            return DEFAULT
        reso = next((c["id"] for c in g.mine(1, name="Strionic Resonator")), None)
        angel = next((c["id"] for c in g.zone(1, "battlefield", owner=2, name="Serra Angel")), None)
        bears = next((c["id"] for c in g.zone(1, "battlefield", owner=2, name="Grizzly Bears")), None)
        trig = next((e["id"] for e in stack if e.get("name") == "Flametongue Kavu" and e.get("kind") == "trigger"
                     and not e.get("copy")), None)
        if kind == "chooseSpellAbilityToPlay":
            if trig and reso and not st["copy"]:
                o = next((o["actionId"] for o in f["options"] if o.get("objectId") == reso
                          and "Play land" not in (o.get("label") or "")), None)
                st["copy"] = bool(o)
                return o
            land = g.play_land(f)
            if land:
                return land
            if stack:
                return None
            if not reso and len(g.untapped_lands(1)) >= 2:
                o = named(g, f, "Strionic Resonator")
                st["reso"] = bool(o)
                return o
            if reso and not st["ftk"] and angel and bears and len(g.untapped_lands(1)) >= 6:
                o = named(g, f, "Flametongue Kavu")
                st["ftk"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor":
            st["asked"] += 1
            if st["copy"] and "New target" in (f.get("prompt") or ""):
                return next((o["actionId"] for o in f["options"] if bears and o.get("objectId") == bears), DEFAULT)
            if st["copy"]:
                # The Resonator's own target: the Kavu's trigger.
                t = next((o["actionId"] for o in f["options"] if trig and o.get("objectId") == trig), None)
                if t:
                    return t
            return next((o["actionId"] for o in f["options"] if angel and o.get("objectId") == angel), DEFAULT)
        return DEFAULT

    g = game("resonator", [("Mountain", 34), ("Strionic Resonator", 10), ("Flametongue Kavu", 16)],
             [("Forest", 22), ("Plains", 22), ("Grizzly Bears", 8), ("Serra Angel", 8)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Strionic Resonator", "Flametongue Kavu", "Flametongue Kavu"],
                       "top": ["Mountain"] * 6},
                   2: {"hand": ["Forest", "Plains", "Forest", "Plains", "Grizzly Bears", "Serra Angel", "Plains"],
                       "top": ["Plains", "Forest", "Plains"] * 3}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(any(e.get("copy") and e.get("kind") == "trigger" for e in w.stacks(s)) for s in (1, 2)) \
            and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=24)
    w.see()
    found = {"stopped": g.stopped_badly(), "st": st}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        copies = [e for e in w.stacks(seat) if e.get("copy") and e.get("kind") == "trigger"]
        originals = [e for e in w.stacks(seat) if e.get("name") == "Flametongue Kavu" and e.get("kind") == "trigger"
                     and not e.get("copy")]
        found[f"seat{seat}"] = copies[:1] + originals[:1]
        if not copies:
            return "inconclusive", f"seat {seat} never saw the Resonator's copy on the stack", found
        copy = copies[0]
        if not originals or copy.get("copyOf") != originals[0]["id"]:
            problems.append(f"seat {seat}: the copy names the trigger's entry ({originals[:1]}): {copy.get('copyOf')}")
        if not copy.get("group"):
            problems.append(f"seat {seat}: the copy carries its batch: {copy}")
        coming = [e for s in w.boards(seat) for e in s.get("copying") or []]
        found[f"copying{seat}"] = coming[:2]
        if not any(e.get("aiming") and e.get("kind") == "trigger" for e in coming):
            problems.append(f"seat {seat}: the copy is shown on its way while its new target is chosen")
        if any(e.get("copyOf") != originals[0]["id"] for e in coming if originals):
            problems.append(f"seat {seat}: on its way, the copy names the trigger's entry: {coming[:2]}")
        aimed = [t for e in copies for t in e.get("targets") or []]
        bears = next((c["id"] for s in w.boards(seat) for c in s.get("battlefield") or []
                      if c.get("name") == "Grizzly Bears"), None)
        if {"object": bears} not in aimed:
            problems.append(f"seat {seat}: the copy aims at Bob's Bears ({bears}): {aimed}")
        if any(e.get("copy") for e in originals):
            problems.append(f"seat {seat}: the Kavu's own trigger is not a copy")
    return result(problems, "Strionic Resonator: the copy of the Kavu's trigger is marked, names the trigger's "
                            "entry, is shown on its way while aimed, and aims at the Bears", found)


# --- fizzle ---------------------------------------------------------------------------


def fizzle():
    st = {"bolt": False, "unsummon": False}
    order = ["Merfolk of the Pearl Trident", "Grizzly Bears", "Fugitive Wizard"]

    def policy(g, f):
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        stack = stack_of(g, seat)
        bears = next((c["id"] for c in g.zone(seat, "battlefield", owner=2, name="Grizzly Bears")), None)
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 2:
                if stack and not st["unsummon"] and any(e.get("name") == "Lightning Bolt" for e in stack):
                    o = named(g, f, "Unsummon")
                    st["unsummon"] = bool(o)
                    return o
                if stack:
                    return None
                for name in order:
                    if not g.mine(2, name=name):
                        return named(g, f, name)
                return None
            if not stack and not st["bolt"] and all(g.mine(2, name=n) for n in order) \
                    and any(c.get("name") == "Island" and not c.get("tapped") for c in g.mine(2)):
                o = named(g, f, "Lightning Bolt")
                st["bolt"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if bears and o.get("objectId") == bears), DEFAULT)
        return DEFAULT

    g = game("fizzle", [("Mountain", 30), ("Lightning Bolt", 30)],
             [("Island", 24), ("Forest", 12), ("Merfolk of the Pearl Trident", 6), ("Grizzly Bears", 6),
              ("Fugitive Wizard", 6), ("Unsummon", 6)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Lightning Bolt"] * 3, "top": ["Mountain"] * 6},
                   2: {"hand": ["Island", "Forest", "Island", "Merfolk of the Pearl Trident", "Grizzly Bears",
                                "Fugitive Wizard", "Unsummon"], "top": ["Island"] * 6}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(any(m.get("why") == "fizzled" for m in w.moves(s)) for s in (1, 2)) \
            and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    bolt_card = None
    for seat in (1, 2):
        fizzled = [m for m in w.moves(seat) if m.get("why") == "fizzled"]
        found[f"moves{seat}"] = fizzled
        if not fizzled:
            return "inconclusive", f"seat {seat} never saw the Bolt fizzle (bolt {st['bolt']}, "\
                                   f"unsummon {st['unsummon']})", found
        m = fizzled[0]
        bolt_card = m.get("card")
        if m.get("from", {}).get("zone") != "stack" or m.get("to") != {"zone": "graveyard", "seat": 1}:
            problems.append(f"seat {seat}: the fizzled Bolt goes from the stack to Alice's graveyard: {m}")
        if "said" in m:
            problems.append(f"seat {seat}: no tag rides on a fizzled spell: {m}")
        reports = [a for a in w.actions(seat) if "did nothing" in (a.get("said") or "")]
        found[f"report{seat}"] = reports[-1:]
        want = "Your Lightning Bolt did nothing: its target was gone." if seat == 1 \
            else "Alice's Lightning Bolt did nothing: its target was gone."
        if not reports or reports[-1].get("said") != want:
            problems.append(f"seat {seat}: the report window says {want!r}: {[a.get('said') for a in reports]}")
        else:
            cards = reports[-1].get("cards") or []
            names = [(c.get("name"), c.get("to") or c.get("toSaid")) for c in cards]
            whose = "your hand" if seat == 2 else "Bob's hand"
            if names != [("Lightning Bolt", "graveyard"), ("Grizzly Bears", f"in {whose}")]:
                problems.append(f"seat {seat}: the window shows the Bolt to the graveyard and the Bears "
                                f"in {whose}: {names}")
            if any(str(c.get("id", "")).startswith("card:") for c in cards):
                problems.append(f"seat {seat}: a report's cards never carry a card's own id: {cards}")
        log = w.log(seat)
        found[f"log{seat}"] = log[-6:]
        if not any("<1>'s Lightning Bolt did nothing: its target was gone" in line for line in log):
            problems.append(f"seat {seat}: the play log says the Bolt did nothing: {log[-6:]}")
        if any("countered" in line for line in log[-6:]):
            problems.append(f"seat {seat}: a fizzle is not a counter: {log[-6:]}")
    # The Bears were between the Merfolk and the Wizard (the page holds the spot).
    rows = [c.get("name") for c in (w.boards(1)[0].get("battlefield") or [])] if w.boards(1) else []
    found["bolt"] = bolt_card
    return result(problems, "Alice's Bolt at Bob's Bears, Unsummoned: \"fizzled\", the report to both "
                            "(\"Your ...\" / \"Alice's ...\"), the Bears in Bob's hand, a log line", found)


SCENARIOS = {"clone": clone, "counterpart": counterpart, "fork": fork, "storm": storm, "fizzle": fizzle,
             "storm-split": storm_split, "resonator": resonator}

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
