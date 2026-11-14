"""Spec 0085 -- protection and gained-ability marks, and what a card holds
(Mechanics Lab, Layer B).

    python -I scripts/check-marks.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker. What it checks is read
from the snapshots both seats were sent -- a permanent's `keywords`,
`gained`, `unblockable`, `lostAbilities`, `indestructible` and `holds`, the
`exile` list and the round's `moves` -- never inferred:

  heroic      Alice's Heroic Intervention with three creatures out: each has
              "Hexproof" gained and is indestructible, both seats; after the
              turn none has (F-0085-A)
  mom         Bob's Lightning Bolt at Alice's Grizzly Bears; Mother of Runes
              gives them protection from red: "Protection from red" gained,
              the Bolt fizzles (F-0085-B)
  run-amok    Run Amok on Alice's attacking Bears: "Trample" gained while it
              attacks; gone after the turn (F-0085-C)
  strobe      Assault Strobe: "Double Strike" gained (Amendment 1)
  distortion  Distortion Strike: `unblockable` (can't be blocked), then not
              (Amendment 1)
  frog        Turn to Frog on Alice's Kor Firewalker: `lostAbilities`, its
              printed protection from red gone from `keywords`; after the
              turn back, and lostAbilities gone (Amendment 1)
  humility    Humility with Kor Firewalker out: `lostAbilities`, no
              protection (Amendment 1)
  banishing   Alice's Banishing Light exiles Bob's Bears: it `holds` them,
              both seats; Bob's Disenchant: the Bears come back, the same id
              (F-0085-E)
  fiend       Alice's Fiend Hunter exiles Bob's Bears and `holds` them; Bob's
              Bolt kills the Hunter: the Bears come back (F-0085-E)
  mox         Alice's Chrome Mox imprints a card: it `holds` it; Bob's Shatter:
              the card stays in exile (Amendment 1)
  hideaway    Alice's Mosswort Bridge hides a card face down: it `holds` it,
              both seats; for Bob that exiled card is not known (no name),
              for Alice it is (Amendment 1)

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
        trace = os.path.join(TRACES, f"marks-{name}.jsonl")
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


def ability(g, f, name):
    """The option that uses [name]'s ability on the asked seat's battlefield (not a mana ability)."""
    seat = f["authorisedSeat"]
    ids = {c["id"] for c in g.mine(seat, name=name)}
    for o in f["options"]:
        if o.get("payable") is False or "Play land" in (o.get("label") or ""):
            continue
        if card_of(o.get("actionId")) in ids and "Add {" not in (o.get("label") or ""):
            return o["actionId"]
    return None


def stack_of(g, seat):
    return (g.state.get(seat) or {}).get("stack") or []


def target(f, card_id):
    return next((o["actionId"] for o in f["options"] if card_id and o.get("objectId") == card_id), None)


def first_id(cards):
    return cards[0]["id"] if cards else None


def lower(xs):
    return [x.lower() for x in (xs or [])]


def yes(f):
    """Forge's optional trigger or "you may": the Yes."""
    for o in f.get("options", []):
        if (o.get("label") or "").lower().startswith("yes"):
            return o["actionId"]
    return None


def casts(plan):
    """A seat-1 policy from a plan: a list of (name, ready) -- cast each once, when ready(g)."""
    done = set()

    def step(g, f):
        for name, ready in plan:
            if name in done or not ready(g):
                continue
            o = named(g, f, name)
            if o:
                done.add(name)
                return o
        return None
    return step, done


def cards_named(board, name):
    return [c for c in board.get("battlefield") or [] if c.get("name") == name]


# --- heroic -----------------------------------------------------------------------------------


def heroic():
    st = {"turn": None}
    creatures = ["Llanowar Elves", "Grizzly Bears", "Savannah Lions"]

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat != 1 or kind != "chooseSpellAbilityToPlay":
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        if stack_of(g, 1):
            return None
        for name in creatures:
            if not g.mine(1, name=name):
                o = named(g, f, name)
                if o:
                    return o
        if st["turn"] is None and all(g.mine(1, name=n) for n in creatures):
            o = named(g, f, "Heroic Intervention")
            if o:
                st["turn"] = g.turn
            return o
        return None

    g = game("heroic", [("Forest", 20), ("Plains", 10), ("Llanowar Elves", 10), ("Grizzly Bears", 10),
                        ("Savannah Lions", 5), ("Heroic Intervention", 5)], [("Swamp", 60)],
             deal={1: {"hand": ["Forest", "Llanowar Elves", "Plains", "Savannah Lions", "Grizzly Bears",
                                "Heroic Intervention", "Forest"], "top": ["Forest", "Plains"] * 4}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["turn"] is not None and g.turn >= st["turn"] + 2)[1], max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "cast on turn": st["turn"]}
    problems = [found["stopped"]] if found["stopped"] else []
    if st["turn"] is None:
        return "inconclusive", "Heroic Intervention was never cast", found
    for seat in (1, 2):
        boards = w.boards(seat)
        marked = [b for b in boards
                  if all(any("hexproof" in lower(c.get("gained")) and c.get("indestructible")
                             for c in cards_named(b, n)) for n in creatures)]
        found[f"marked{seat}"] = [[(c["name"], c.get("gained"), c.get("indestructible")) for c in b["battlefield"]
                                   if c.get("kind") == "creature"] for b in marked[:1]]
        if not marked:
            problems.append(f"seat {seat}: all three creatures had hexproof gained and were indestructible together")
            continue
        last = boards[-1]
        left = [c["name"] for c in last.get("battlefield") or [] if c.get("seat") == 1
                and ("hexproof" in lower(c.get("gained")) or c.get("indestructible"))]
        if left:
            problems.append(f"seat {seat}: after the turn nothing is still hexproof or indestructible: {left}")
    return result(problems, "Heroic Intervention: hexproof gained and indestructible on all three at once, "
                            "both seats; gone after the turn", found)


# --- mother of runes ---------------------------------------------------------------------------


def mom():
    st = {"bolt": False, "mom": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        labels = lower(Game.labels(f))
        if seat == 1 and st["mom"] and any("red" in x for x in labels) and kind != "chooseSpellAbilityToPlay":
            return next(o["actionId"] for o in f["options"] if "red" in (o.get("label") or "").lower())
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            stack = stack_of(g, seat)
            if seat == 1:
                if stack and not st["mom"] and any(e.get("name") == "Lightning Bolt" for e in stack):
                    o = ability(g, f, "Mother of Runes")
                    st["mom"] = bool(o)
                    return o
                if stack:
                    return None
                for name in ("Mother of Runes", "Grizzly Bears"):
                    if not g.mine(1, name=name):
                        o = named(g, f, name)
                        if o:
                            return o
                return None
            mother = g.zone(2, "battlefield", owner=1, name="Mother of Runes")
            if not stack and not st["bolt"] and g.zone(2, "battlefield", owner=1, name="Grizzly Bears") \
                    and mother and not mother[0].get("tapped") and g.turn >= 4:
                o = named(g, f, "Lightning Bolt")
                st["bolt"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor":
            if seat == 2:
                return target(f, first_id(g.zone(2, "battlefield", owner=1, name="Grizzly Bears"))) or DEFAULT
            return target(f, first_id(g.mine(1, name="Grizzly Bears"))) or DEFAULT
        return DEFAULT

    g = game("mom", [("Plains", 15), ("Forest", 15), ("Mother of Runes", 15), ("Grizzly Bears", 15)],
             [("Mountain", 30), ("Lightning Bolt", 30)],
             deal={1: {"hand": ["Plains", "Mother of Runes", "Forest", "Grizzly Bears", "Plains", "Forest",
                                "Grizzly Bears"], "top": ["Plains", "Forest"] * 3},
                   2: {"hand": ["Mountain"] * 4 + ["Lightning Bolt"] * 3, "top": ["Mountain"] * 6}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(any(m.get("why") == "fizzled" for m in w.listed(s, "moves")) for s in (1, 2)) \
            and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        if not any(m.get("why") == "fizzled" for m in w.listed(seat, "moves")):
            return "inconclusive", f"seat {seat} never saw the Bolt fizzle (bolt {st['bolt']}, mom {st['mom']})", found
        bears = [c for b in w.boards(seat) for c in cards_named(b, "Grizzly Bears")
                 if "Protection from red" in (c.get("gained") or [])]
        found[f"bears{seat}"] = bears[-1:]
        if not bears:
            problems.append(f"seat {seat}: the Bears have protection from red, gained")
        elif "Protection from red" not in (bears[-1].get("keywords") or []):
            problems.append(f"seat {seat}: a gained keyword is one it has")
    return result(problems, "Mother of Runes: protection from red gained on the Bears, both seats; Bob's Bolt "
                            "fizzles", found)


# --- one creature given something: run amok, assault strobe, distortion strike --------------------


def pumped(name, spell, deck_land, test, attack, what):
    """Alice's Grizzly Bears, then [spell] at it (while attacking when [attack]); [test](card) is the mark."""
    st = {"turn": None, "attacked": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat != 1:
            return DEFAULT
        bears = [c for c in g.mine(1, name="Grizzly Bears")]
        if kind == "declareAttackers":
            ready = [c["id"] for c in bears if not c.get("sick") and not c.get("tapped")]
            if not attack or st["attacked"] or not ready or len(g.untapped_lands(1)) < 2:
                return None
            o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == ready[0]), None)
            st["attacked"] = bool(o)
            return o
        if kind == "chooseTargetsFor":
            return target(f, first_id(bears)) or DEFAULT
        if kind != "chooseSpellAbilityToPlay":
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        if stack_of(g, 1):
            return None
        if not bears:
            return named(g, f, "Grizzly Bears")
        if st["turn"] is None and (not attack or any(c.get("attacking") for c in bears)) \
                and not any(c.get("sick") for c in bears):
            o = named(g, f, spell)
            if o:
                st["turn"] = g.turn
            return o
        return None

    g = game(name, [("Forest", 15), (deck_land, 15), ("Grizzly Bears", 15), (spell, 15)], [("Swamp", 60)],
             deal={1: {"hand": ["Forest", deck_land, "Grizzly Bears", spell, "Forest", deck_land, spell],
                       "top": ["Forest", deck_land] * 4}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["turn"] is not None and g.turn >= st["turn"] + 2)[1], max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "cast on turn": st["turn"], "attacked": st["attacked"]}
    problems = [found["stopped"]] if found["stopped"] else []
    if st["turn"] is None:
        return "inconclusive", f"{spell} was never cast", found
    for seat in (1, 2):
        boards = w.boards(seat)
        marked = [c for b in boards for c in cards_named(b, "Grizzly Bears")
                  if test(c) and (not attack or c.get("attacking"))]
        found[f"marked{seat}"] = marked[:1]
        if not marked:
            problems.append(f"seat {seat}: the Bears were {what}")
            continue
        if any(test(c) for c in cards_named(boards[-1], "Grizzly Bears")):
            problems.append(f"seat {seat}: after the turn the Bears are no longer {what}")
    return result(problems, f"{spell}: the Bears {what}, both seats; gone after the turn", found)


# --- lost abilities: turn to frog, humility -------------------------------------------------------


def frog():
    st = {"turn": None}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat != 1:
            return DEFAULT
        walker = g.mine(1, name="Kor Firewalker")
        if kind == "chooseTargetsFor":
            return target(f, first_id(walker)) or DEFAULT
        if kind != "chooseSpellAbilityToPlay":
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        if stack_of(g, 1):
            return None
        if not walker:
            return named(g, f, "Kor Firewalker")
        if st["turn"] is None and g.untapped_lands(1, name="Island"):
            o = named(g, f, "Turn to Frog")
            if o:
                st["turn"] = g.turn
            return o
        return None

    g = game("frog", [("Plains", 20), ("Island", 10), ("Kor Firewalker", 15), ("Turn to Frog", 15)],
             [("Swamp", 60)],
             deal={1: {"hand": ["Plains", "Plains", "Kor Firewalker", "Island", "Turn to Frog", "Plains",
                                "Turn to Frog"], "top": ["Plains", "Island"] * 4}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["turn"] is not None and g.turn >= st["turn"] + 2)[1], max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "cast on turn": st["turn"]}
    problems = [found["stopped"]] if found["stopped"] else []
    if st["turn"] is None:
        return "inconclusive", "Turn to Frog was never cast", found
    for seat in (1, 2):
        boards = w.boards(seat)
        printed = [c for b in boards for c in cards_named(b, "Kor Firewalker")
                   if "Protection from red" in (c.get("keywords") or [])]
        lost = [c for b in boards for c in cards_named(b, "Kor Firewalker") if c.get("lostAbilities")]
        found[f"lost{seat}"] = lost[:1]
        if not printed:
            problems.append(f"seat {seat}: the Firewalker had its printed protection before")
        if not lost:
            problems.append(f"seat {seat}: the Firewalker lost all its abilities")
        elif "Protection from red" in (lost[0].get("keywords") or []):
            problems.append(f"seat {seat}: with its abilities lost its protection is gone")
        if printed and "Protection from red" in (printed[0].get("gained") or []):
            problems.append(f"seat {seat}: printed protection is not gained")
        end = cards_named(boards[-1], "Kor Firewalker")
        if not end or end[0].get("lostAbilities") or "Protection from red" not in (end[0].get("keywords") or []):
            problems.append(f"seat {seat}: after the turn it has its protection again: {end}")
    return result(problems, "Turn to Frog: Kor Firewalker lostAbilities, its protection gone; back after the turn,"
                            " both seats", found)


def humility():
    st = {"cast": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat != 1 or kind != "chooseSpellAbilityToPlay":
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        if stack_of(g, 1):
            return None
        if not g.mine(1, name="Kor Firewalker"):
            return named(g, f, "Kor Firewalker")
        if not st["cast"]:
            o = named(g, f, "Humility")
            st["cast"] = bool(o)
            return o
        return None

    g = game("humility", [("Plains", 30), ("Kor Firewalker", 15), ("Humility", 15)], [("Swamp", 60)],
             deal={1: {"hand": ["Plains", "Plains", "Kor Firewalker", "Plains", "Humility", "Plains",
                                "Plains"], "top": ["Plains"] * 8}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(any(c.get("lostAbilities") for b in w.boards(s) for c in cards_named(b, "Kor Firewalker"))
                   for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "cast": st["cast"]}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        lost = [c for b in w.boards(seat) for c in cards_named(b, "Kor Firewalker") if c.get("lostAbilities")]
        found[f"lost{seat}"] = lost[:1]
        if not lost:
            return "inconclusive", f"seat {seat} never saw Humility take the Firewalker's abilities", found
        if "Protection from red" in (lost[0].get("keywords") or []):
            problems.append(f"seat {seat}: under Humility no protection")
    return result(problems, "Humility: Kor Firewalker lostAbilities, no protection, both seats", found)


# --- held cards: banishing light, fiend hunter, chrome mox, hideaway ------------------------------


def held_ids(board, holder):
    return [h for c in cards_named(board, holder) for h in (c.get("holds") or [])]


def returns(name, holder, holder_cost_lands, killer, bob_lands):
    """Alice's [holder] takes Bob's Grizzly Bears; Bob's [killer] removes it; the Bears come back."""
    st = {"held": False, "killed": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 1:
            if kind == "chooseTargetsFor":
                return target(f, first_id(g.zone(1, "battlefield", owner=2, name="Grizzly Bears"))) or DEFAULT
            if kind != "chooseSpellAbilityToPlay":
                return yes(f) or DEFAULT
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, 1):
                return None
            if not st["held"] and g.zone(1, "battlefield", owner=2, name="Grizzly Bears"):
                o = named(g, f, holder)
                st["held"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor":
            return target(f, first_id(g.zone(2, "battlefield", owner=1, name=holder))) or DEFAULT
        if kind != "chooseSpellAbilityToPlay":
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        if stack_of(g, 2):
            return None
        if not st["held"] and not g.mine(2, name="Grizzly Bears"):
            return named(g, f, "Grizzly Bears")
        holders = g.zone(2, "battlefield", owner=1, name=holder)
        if not st["killed"] and holders and any(holders[0].get("holds") or []):
            o = named(g, f, killer)
            st["killed"] = bool(o)
            return o
        return None

    g = game(name, [("Plains", 60 - 15), (holder, 15)], [*bob_lands, ("Grizzly Bears", 10), (killer, 10)],
             deal={1: {"hand": ["Plains"] * holder_cost_lands + [holder] * (7 - holder_cost_lands),
                       "top": ["Plains"] * 6},
                   2: {"hand": [bob_lands[0][0], bob_lands[1][0], "Grizzly Bears", killer, bob_lands[0][0],
                                bob_lands[1][0], killer], "top": [bob_lands[0][0], bob_lands[1][0]] * 4}})
    w = Watch(g)

    def until(g):
        w.see()
        return st["killed"] and all(not stack_of(g, s) for s in (1, 2)) \
            and all(cards_named(w.boards(s)[-1], "Grizzly Bears") and not cards_named(w.boards(s)[-1], holder)
                    for s in (1, 2))

    g.run(policy, until=until, max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly(), "held": st["held"], "killed": st["killed"]}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        boards = w.boards(seat)
        holding = [b for b in boards if held_ids(b, holder)]
        if not holding or not st["killed"]:
            return "inconclusive", f"seat {seat} never saw {holder} hold the Bears and go (held {st['held']}, " \
                                   f"killed {st['killed']})", found
        held = held_ids(holding[0], holder)
        exiled = [c for c in holding[0].get("exile") or [] if c.get("id") in held]
        found[f"holds{seat}"] = held
        found[f"exile{seat}"] = exiled
        if len(held) != 1 or not exiled or exiled[0].get("name") != "Grizzly Bears":
            problems.append(f"seat {seat}: {holder} holds Bob's Bears, in exile and named: {held} {exiled}")
            continue
        back = cards_named(boards[-1], "Grizzly Bears")
        if not back or back[0].get("id") != held[0]:
            problems.append(f"seat {seat}: the same Bears came back to the table: {back}")
        if any(c.get("holds") for c in boards[-1].get("battlefield") or []):
            problems.append(f"seat {seat}: nothing holds anything afterwards")
    return result(problems, f"{holder} holds Bob's Bears (both seats); {killer}: they come back", found)


def mox():
    st = {"mox": False, "shatter": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 1:
            if kind == "chooseSpellAbilityToPlay":
                land = g.play_land(f)
                if land:
                    return land
                if stack_of(g, 1) or st["mox"]:
                    return None
                o = named(g, f, "Chrome Mox")
                st["mox"] = bool(o)
                return o
            if kind in ("declareAttackers", "declareBlockers"):
                return None
            return yes(f) or (f["options"][0]["actionId"] if f.get("options") else None)
        if kind == "chooseTargetsFor":
            return target(f, first_id(g.zone(2, "battlefield", owner=1, name="Chrome Mox"))) or DEFAULT
        if kind != "chooseSpellAbilityToPlay":
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        moxes = g.zone(2, "battlefield", owner=1, name="Chrome Mox")
        if not stack_of(g, 2) and not st["shatter"] and moxes and moxes[0].get("holds"):
            o = named(g, f, "Shatter")
            st["shatter"] = bool(o)
            return o
        return None

    g = game("mox", [("Plains", 30), ("Chrome Mox", 15), ("Grizzly Bears", 15)],
             [("Mountain", 30), ("Shatter", 30)],
             deal={1: {"hand": ["Chrome Mox", "Grizzly Bears", "Plains", "Plains", "Grizzly Bears", "Plains",
                                "Plains"], "top": ["Plains"] * 6},
                   2: {"hand": ["Mountain"] * 4 + ["Shatter"] * 3, "top": ["Mountain"] * 6}})
    w = Watch(g)

    def until(g):
        w.see()
        return st["shatter"] and all(not stack_of(g, s) for s in (1, 2)) \
            and all(not cards_named(w.boards(s)[-1], "Chrome Mox") for s in (1, 2))

    g.run(policy, until=until, max_turn=12)
    w.see()
    found = {"stopped": g.stopped_badly(), "mox": st["mox"], "shatter": st["shatter"]}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        boards = w.boards(seat)
        holding = [b for b in boards if held_ids(b, "Chrome Mox")]
        if not holding or not st["shatter"]:
            return "inconclusive", f"seat {seat} never saw the Mox imprint and go", found
        held = held_ids(holding[0], "Chrome Mox")
        found[f"holds{seat}"] = held
        if len(held) != 1 or not any(c.get("id") == held[0] and c.get("name") == "Grizzly Bears"
                                     for c in holding[0].get("exile") or []):
            problems.append(f"seat {seat}: the Mox holds the imprinted Bears: {held}")
            continue
        if not any(c.get("id") == held[0] for c in boards[-1].get("exile") or []):
            problems.append(f"seat {seat}: the imprinted card stays in exile")
    return result(problems, "Chrome Mox holds the imprinted card (both seats); Shatter: it stays in exile", found)


def hideaway():
    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 1 and kind == "chooseSpellAbilityToPlay":
            if not g.mine(1, name="Mosswort Bridge"):
                return g.play_land(f, prefer="Mosswort Bridge")
            return g.play_land(f)
        if seat == 1 and kind not in ("declareAttackers", "declareBlockers") and f.get("options"):
            return yes(f) or f["options"][0]["actionId"]
        return DEFAULT

    g = game("hideaway", [("Forest", 45), ("Mosswort Bridge", 15)], [("Swamp", 60)],
             deal={1: {"hand": ["Mosswort Bridge", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest"],
                       "top": ["Forest"] * 8}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(any(held_ids(b, "Mosswort Bridge") for b in w.boards(s)) for s in (1, 2)) \
            and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=6)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        holding = [b for b in w.boards(seat) if held_ids(b, "Mosswort Bridge")]
        if not holding:
            return "inconclusive", f"seat {seat} never saw the Bridge hide a card", found
        held = held_ids(holding[-1], "Mosswort Bridge")
        exiled = [c for c in holding[-1].get("exile") or [] if c.get("id") in held]
        found[f"exile{seat}"] = exiled
        if len(held) != 1 or len(exiled) != 1:
            problems.append(f"seat {seat}: the Bridge holds one card, in exile: {held} {exiled}")
            continue
        if seat == 2 and (exiled[0].get("known") or exiled[0].get("name") != "Face-down"):
            problems.append("seat 2: Bob is not told what the hidden card is")
        if seat == 1 and not exiled[0].get("known"):
            problems.append("seat 1: Alice may look at the card she hid")
    return result(problems, "Mosswort Bridge holds the hidden card (both seats): face down and unnamed for Bob",
                  found)


SCENARIOS = {
    "heroic": heroic,
    "mom": mom,
    "run-amok": lambda: pumped("run-amok", "Run Amok", "Mountain", lambda c: "trample" in lower(c.get("gained")),
                               True, "given trample"),
    "strobe": lambda: pumped("strobe", "Assault Strobe", "Mountain",
                             lambda c: "double strike" in lower(c.get("gained")), False, "given double strike"),
    "distortion": lambda: pumped("distortion", "Distortion Strike", "Island", lambda c: bool(c.get("unblockable")),
                                 False, "made unblockable"),
    "frog": frog,
    "humility": humility,
    "banishing": lambda: returns("banishing", "Banishing Light", 3, "Disenchant",
                                 [("Forest", 20), ("Plains", 20)]),
    "fiend": lambda: returns("fiend", "Fiend Hunter", 3, "Lightning Bolt", [("Forest", 20), ("Mountain", 20)]),
    "mox": mox,
    "hideaway": hideaway,
}

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
