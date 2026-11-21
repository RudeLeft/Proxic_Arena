"""Sacrifice and destroy, chosen by the right player. Phase 8 Part 1 (spec 0001).

    python -I scripts/check-sacrifice.py <worker.jar> <res-root> [trace-dir] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B), and checks
spec 0001's points on the board, never the mere fact a question was asked:

  monument        Eldrazi Monument, upkeep, with creatures: its controller
                  is asked; exactly their creatures are offered; the one
                  picked (the LAST offered, so no default could pass) is in
                  the graveyard; the game goes on  (F-0001-A)
  monument-alone  the same with no creature: the Monument itself goes, no
                  question, no stop  (F-0001-B)
  edict           Diabolic Edict on the opponent: the OPPONENT is asked,
                  about their creatures only; the caster never  (F-0001-C)
  innocent-blood  each player is asked about their own creatures  (F-0001-D)
  imperial-edict  "target opponent chooses a creature … destroy it": the
                  destroy question, the opponent's choice  (0001 D1)

Spec 0112 (F-0112-A, F-0112-C) -- "each player" sacrifices, the worker's
`nextSeats` (who is asked after this player) and `earlier` (what the
players before them sacrificed):

  barter              Barter in Blood, two creatures each: Alice's questions
                      carry nextSeats [2] and no earlier; Bob's carry no
                      nextSeats and earlier = Alice's two picks, named, each
                      in a graveyard in Bob's own snapshot of that moment,
                      never a card she was offered and kept
  barter-none-second  Bob has no creature: Alice's questions carry no
                      nextSeats, and Bob is never asked
  barter-none-first   Alice has no creature: she is never asked, and Bob's
                      questions carry no earlier
  innocent            Innocent Blood, Alice offered two and keeping one: Bob's
                      earlier names only the one she sacrificed (the HID-004
                      bite: filled from her offers, it would name the kept one)

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
BEARS = [("Forest", 30), ("Grizzly Bears", 30)]
SAC, DESTROY = "choosePermanentsToSacrifice", "choosePermanentsToDestroy"


def game(name, seat1, seat2=BEARS, deal=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"sacrifice-{name}.jsonl")
    # The Lab's deal (lab.py): each scenario's cards in the opening hand,
    # so its moment never waits on the shuffle.
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal)


def creatures(g, seat):
    """Ids of the creatures `seat` controls, as `seat` sees the board."""
    return {c["id"] for c in g.mine(seat) if c.get("kind") == "creature"}


def graveyard_ids(g, seat):
    return {c["id"] for c in g.zone(seat, "graveyard", owner=seat)}


def stack_empty(g):
    return not g.state.get(1, {}).get("stack") and not g.state.get(2, {}).get("stack")


def cast(g, frame, name):
    """The option to cast `name` from hand, only when it can be paid for."""
    o = g.option(frame, name=name, zone="hand", land=False)
    if o and any(x["actionId"] == o and x.get("payable") is False for x in frame["options"]):
        return None
    return o


class Asked:
    """Every sacrifice/destroy question: who, what was offered, what was picked."""

    def __init__(self):
        self.log = []

    def answer(self, g, frame):
        """Record the question, check it against the board, and pick the LAST option."""
        seat = frame["authorisedSeat"]
        offered = {card_of(o["actionId"]) for o in frame.get("options", [])}
        pick = frame["options"][-1]["actionId"]
        # Spec 0112 -- who chooses next (the server's), what the players before
        # sacrificed (the asker's), and every graveyard card this seat's own
        # snapshot of this moment shows (the question comes after it, P6-L).
        graves = {c["id"]: c.get("name") for c in g.zone(seat, "graveyard")}
        self.log.append({"seat": seat, "kind": frame["kind"], "prompt": frame.get("prompt") or "", "offered": offered,
                         "own creatures": creatures(g, seat), "picked": card_of(pick),
                         "nextSeats": frame.get("nextSeats"), "earlier": frame.get("earlier"), "graves": graves})
        return pick

    def by(self, seat):
        return [q for q in self.log if q["seat"] == seat]


def unnamed(log, card):
    """The asker is told which card is making them choose -- often the other player's."""
    return [f"seat {q['seat']} was asked {q['prompt']!r}, which does not say it is {card}"
            for q in log if not q["prompt"].startswith(card + ":")]


def wrong_offers(log):
    return [f"seat {q['seat']} was offered {sorted(q['offered'])}, not exactly its creatures "
            f"{sorted(q['own creatures'])}" for q in log if q["offered"] != q["own creatures"]]


def monument():
    g = game("monument", [("Mountain", 28), ("Sol Ring", 4), ("Eldrazi Monument", 12), ("Raging Goblin", 16)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Sol Ring", "Eldrazi Monument", "Raging Goblin"],
                       "top": ["Raging Goblin", "Mountain", "Raging Goblin", "Mountain"]}})
    asked = Asked()
    done = {"monument": False}

    def policy(g, f):
        kind = f.get("kind")
        if kind in (SAC, DESTROY):
            return asked.answer(g, f)
        if f["authorisedSeat"] == 1 and kind == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            for name in ("Sol Ring", "Eldrazi Monument", "Raging Goblin"):
                if name in ("Sol Ring", "Eldrazi Monument") and g.mine(1, name=name):
                    continue
                o = cast(g, f, name)
                if o:
                    return o
            return g.play_land(f)
        return DEFAULT

    def until(g):
        done["monument"] = done["monument"] or bool(g.mine(1, name="Eldrazi Monument"))
        return bool(asked.by(1)) and stack_empty(g) and asked.by(1)[0]["picked"] in graveyard_ids(g, 1)

    g.run(policy, until=until, max_turn=24)
    found = {"asked": [{k: (sorted(v) if isinstance(v, set) else v) for k, v in q.items()} for q in asked.log],
             "monument out": done["monument"], "stopped": g.stopped_badly()}
    if not asked.by(1):
        return "inconclusive", "the Monument's upkeep trigger was never reached with creatures out", found
    problems = wrong_offers(asked.log) + unnamed(asked.log, "Eldrazi Monument")
    if asked.by(2):
        problems.append("seat 2 was asked about seat 1's Monument")
    if asked.by(1)[0]["picked"] not in graveyard_ids(g, 1):
        problems.append("the creature picked was not sacrificed")
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "Eldrazi Monument asked its controller, offered exactly their creatures, and sacrificed the one "
               "picked", found)


def monument_alone():
    g = game("monument-alone", [("Mountain", 30), ("Sol Ring", 4), ("Eldrazi Monument", 26)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Sol Ring"] + ["Eldrazi Monument"] * 2,
                       "top": ["Mountain"] * 4}})
    asked = Asked()
    seen = {"turn": None}

    def policy(g, f):
        if f.get("kind") in (SAC, DESTROY):
            return asked.answer(g, f)
        if f["authorisedSeat"] == 1 and f.get("kind") == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            if not g.mine(1, name="Sol Ring") and cast(g, f, "Sol Ring"):
                return cast(g, f, "Sol Ring")
            if not g.mine(1, name="Eldrazi Monument") and cast(g, f, "Eldrazi Monument"):
                return cast(g, f, "Eldrazi Monument")
            return g.play_land(f)
        return DEFAULT

    def until(g):
        if g.mine(1, name="Eldrazi Monument") and seen["turn"] is None:
            seen["turn"] = g.turn
        return seen["turn"] is not None and g.turn >= seen["turn"] + 3

    g.run(policy, until=until, max_turn=30)
    gone = len(g.zone(1, "graveyard", owner=1, name="Eldrazi Monument"))
    found = {"monument first out on turn": seen["turn"], "monuments in graveyard": gone,
             "questions": len(asked.log), "stopped": g.stopped_badly()}
    if seen["turn"] is None:
        return "inconclusive", "Eldrazi Monument was never cast", found
    problems = []
    if gone < 1:
        problems.append("with no creature, the Monument should have sacrificed itself")
    if asked.log:
        problems.append("a sacrifice question was asked with nothing to choose from")
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "with no creature the Monument sacrificed itself; nobody was asked, nothing stopped", found)


def targeted(name, card, kind, seat1_deck):
    """seat 1 casts `card` at seat 2 once seat 2 has two creatures; seat 2 must choose."""
    g = game(name, seat1_deck, deal={1: {"hand": ["Swamp"] * 4 + [card] * 3}, 2: {"hand": ["Forest"] * 4 + ["Grizzly Bears"] * 3}})
    asked = Asked()
    done = {"cast": False}

    def policy(g, f):
        k = f.get("kind")
        if k in (SAC, DESTROY):
            return asked.answer(g, f)
        if f["authorisedSeat"] == 2:
            if k == "chooseSpellAbilityToPlay":
                return g.play_land(f) or cast(g, f, "Grizzly Bears")
            return DEFAULT
        if k == "chooseSpellAbilityToPlay":
            if not stack_empty(g) or done["cast"]:
                return None if not stack_empty(g) else g.play_land(f)
            if len(creatures(g, 2)) >= 2:
                o = cast(g, f, card)
                if o:
                    done["cast"] = True
                    return o
            return g.play_land(f)
        if k == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if o.get("label") == "Bob"), DEFAULT)
        return DEFAULT

    def until(g):
        return bool(asked.by(2)) and stack_empty(g) and asked.by(2)[0]["picked"] in graveyard_ids(g, 2)

    g.run(policy, until=until, max_turn=24)
    found = {"cast": done["cast"], "asked": [{k: (sorted(v) if isinstance(v, set) else v) for k, v in q.items()}
                                             for q in asked.log], "stopped": g.stopped_badly()}
    if not asked.by(2):
        return "inconclusive", f"{card} never reached seat 2's choice", found
    problems = wrong_offers(asked.log) + unnamed(asked.log, card)
    if asked.by(1):
        problems.append(f"the caster was asked: {card} is the opponent's choice")
    if any(q["kind"] != kind for q in asked.log):
        problems.append(f"the question was {[q['kind'] for q in asked.log]}, not {kind}")
    if asked.by(2)[0]["picked"] not in graveyard_ids(g, 2):
        problems.append("the creature seat 2 picked did not go to the graveyard")
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", f"{card}: the opponent chose among exactly their creatures; the one picked is gone", found)


def edict():
    return targeted("edict", "Diabolic Edict", SAC, [("Swamp", 30), ("Diabolic Edict", 30)])


def imperial_edict():
    return targeted("imperial-edict", "Imperial Edict", DESTROY, [("Swamp", 30), ("Imperial Edict", 30)])


def innocent_blood():
    g = game("innocent-blood", [("Swamp", 26), ("Innocent Blood", 14), ("Walking Corpse", 20)],
             deal={1: {"hand": ["Swamp"] * 4 + ["Walking Corpse"] * 2 + ["Innocent Blood"],
                       "top": ["Swamp"] * 2}, 2: {"hand": ["Forest"] * 4 + ["Grizzly Bears"] * 3}})
    asked = Asked()
    done = {"cast": False}

    def policy(g, f):
        k = f.get("kind")
        if k in (SAC, DESTROY):
            return asked.answer(g, f)
        if f["authorisedSeat"] == 2:
            if k == "chooseSpellAbilityToPlay":
                return g.play_land(f) or cast(g, f, "Grizzly Bears")
            return DEFAULT
        if k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            if not done["cast"] and len(creatures(g, 1)) >= 2 and len(creatures(g, 2)) >= 2:
                o = cast(g, f, "Innocent Blood")
                if o:
                    done["cast"] = True
                    return o
            if len(creatures(g, 1)) < 2 and cast(g, f, "Walking Corpse"):
                return cast(g, f, "Walking Corpse")
            return g.play_land(f)
        return DEFAULT

    def until(g):
        return bool(asked.by(1)) and bool(asked.by(2)) and stack_empty(g)

    g.run(policy, until=until, max_turn=24)
    found = {"cast": done["cast"], "asked": [{k: (sorted(v) if isinstance(v, set) else v) for k, v in q.items()}
                                             for q in asked.log], "stopped": g.stopped_badly()}
    if not (asked.by(1) and asked.by(2)):
        return "inconclusive", "Innocent Blood never asked both players", found
    problems = wrong_offers(asked.log) + unnamed(asked.log, "Innocent Blood")
    for seat in (1, 2):
        if asked.by(seat)[0]["picked"] not in graveyard_ids(g, seat):
            problems.append(f"seat {seat}'s pick was not sacrificed")
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "Innocent Blood: each player chose among their own creatures, and each pick is gone", found)


def each_sacrifices(name, card, seat1_creatures, seat2_creatures):
    """Alice (seat 1) casts `card` on her turn once each side has its creatures.

    `seat1_creatures` / `seat2_creatures`: how many creatures each side casts
    first (0: that side's deck has none). Alice is the active player, so Forge
    asks her first, then Bob."""
    one = [("Swamp", 40), (card, 10)] + ([("Walking Corpse", 10)] if seat1_creatures else [("Swamp", 10)])
    two = [("Forest", 40), ("Grizzly Bears", 20)] if seat2_creatures else [("Forest", 60)]
    g = game(name, one, two,
             deal={1: {"hand": ["Swamp"] * 4 + ["Walking Corpse"] * seat1_creatures + [card],
                       "top": ["Swamp"] * 3},
                   2: {"hand": ["Forest"] * 4 + ["Grizzly Bears"] * seat2_creatures, "top": ["Forest"] * 3}})
    asked = Asked()
    done = {"cast": False, "resolved": False}

    def policy(g, f):
        k = f.get("kind")
        if k in (SAC, DESTROY):
            return asked.answer(g, f)
        if f["authorisedSeat"] == 2:
            if k == "chooseSpellAbilityToPlay":
                if len(creatures(g, 2)) < seat2_creatures and stack_empty(g):
                    o = cast(g, f, "Grizzly Bears")
                    if o:
                        return o
                return g.play_land(f)
            return DEFAULT
        if k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            if not done["cast"] and len(creatures(g, 1)) >= seat1_creatures \
                    and len(creatures(g, 2)) >= seat2_creatures:
                o = cast(g, f, card)
                if o:
                    done["cast"] = True
                    return o
            if len(creatures(g, 1)) < seat1_creatures:
                o = cast(g, f, "Walking Corpse")
                if o:
                    return o
            return g.play_land(f)
        return DEFAULT

    def until(g):
        if done["cast"] and stack_empty(g) and g.zone(1, "graveyard", owner=1, name=card):
            done["resolved"] = True
        return done["resolved"]

    g.run(policy, until=until, max_turn=24)
    log = [{k: (sorted(v) if isinstance(v, set) else v) for k, v in q.items() if k != "graves"} for q in asked.log]
    found = {"cast": done["cast"], "resolved": done["resolved"], "asked": log, "stopped": g.stopped_badly()}
    if not done["resolved"]:
        return None, found
    return asked, found


def earlier_problems(asked):
    """F-0112-C -- `earlier` names only cards the asker's own snapshot shows in a
    graveyard, by their names there, and never a card the earlier player was
    offered and kept."""
    problems = []
    picked, kept = {}, {}
    for q in asked.log:
        picked.setdefault(q["seat"], set()).add(q["picked"])
    for q in asked.log:
        kept.setdefault(q["seat"], set()).update(q["offered"] - picked[q["seat"]])
    for q in asked.log:
        for row in q["earlier"] or []:
            for c in row.get("cards", []):
                if c["id"] not in q["graves"]:
                    problems.append(f"seat {q['seat']}'s earlier names {c['id']}, not in a graveyard it sees")
                elif q["graves"][c["id"]] != c.get("name"):
                    problems.append(f"seat {q['seat']}'s earlier names {c['id']} {c.get('name')!r}, "
                                    f"its snapshot {q['graves'][c['id']]!r}")
                if c["id"] in kept.get(row.get("seat"), set()):
                    problems.append(f"seat {q['seat']}'s earlier names {c['id']}, which seat {row.get('seat')} "
                                    "was offered and kept")
    return problems


def ids_of(row):
    return sorted(c["id"] for c in row.get("cards", []))


def barter():
    asked, found = each_sacrifices("barter", "Barter in Blood", 2, 2)
    if asked is None:
        return "inconclusive", "Barter in Blood never resolved with two creatures each", found
    first, second = asked.by(1), asked.by(2)
    # Each pick is its own question: the first offers every creature, the next what is left.
    problems = wrong_offers([q for q in (first[:1] + second[:1])]) + unnamed(asked.log, "Barter in Blood")         + earlier_problems(asked)
    if len(first) != 2 or len(second) != 2:
        problems.append(f"each player should be asked twice (one pick each): {len(first)} and {len(second)}")
    if any(q["nextSeats"] != [2] for q in first):
        problems.append(f"Alice's questions' nextSeats {[q['nextSeats'] for q in first]}, not [2]")
    if any(q["earlier"] for q in first):
        problems.append("Alice, asked first, was told of an earlier sacrifice")
    if any(q["nextSeats"] for q in second):
        problems.append(f"Bob, asked last, has nextSeats {[q['nextSeats'] for q in second]}")
    alice = sorted(q["picked"] for q in first)
    for q in second:
        rows = q["earlier"] or []
        if [r.get("seat") for r in rows] != [1] or ids_of(rows[0]) != alice:
            problems.append(f"Bob's earlier {rows}, not Alice's two picks {alice}")
        elif any(not c.get("name") for c in rows[0]["cards"]):
            problems.append("an earlier card has no name")
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "Barter in Blood: Alice is told Bob chooses next; Bob is told the two she sacrificed, both in "
               "his own graveyard view", found)


def barter_none_second():
    asked, found = each_sacrifices("barter-none-second", "Barter in Blood", 2, 0)
    if asked is None or not asked.by(1):
        return "inconclusive", "Barter in Blood never resolved with Alice's two creatures out", found
    problems = earlier_problems(asked)
    if asked.by(2):
        problems.append("Bob, with no creature, was asked")
    if any(q["nextSeats"] for q in asked.by(1)):
        problems.append(f"Alice's questions say someone chooses next: {[q['nextSeats'] for q in asked.by(1)]}")
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "Bob has no creature: nobody is next after Alice, and Bob is not asked", found)


def barter_none_first():
    asked, found = each_sacrifices("barter-none-first", "Barter in Blood", 0, 2)
    if asked is None or not asked.by(2):
        return "inconclusive", "Barter in Blood never resolved with Bob's two creatures out", found
    problems = earlier_problems(asked)
    if asked.by(1):
        problems.append("Alice, with no creature, was asked")
    if any(q["earlier"] for q in asked.by(2)):
        problems.append(f"Bob was told of an earlier sacrifice: {[q['earlier'] for q in asked.by(2)]}")
    if any(q["nextSeats"] for q in asked.by(2)):
        problems.append("Bob, asked last, has nextSeats")
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "Alice has no creature: she is not asked, and Bob's questions carry no earlier", found)


def innocent():
    asked, found = each_sacrifices("innocent", "Innocent Blood", 2, 2)
    if asked is None:
        return "inconclusive", "Innocent Blood never resolved with two creatures each", found
    first, second = asked.by(1), asked.by(2)
    problems = wrong_offers(asked.log) + unnamed(asked.log, "Innocent Blood") + earlier_problems(asked)
    if len(first) != 1 or len(second) != 1:
        problems.append(f"each player should be asked once: {len(first)} and {len(second)}")
    else:
        if len(first[0]["offered"]) < 2:
            problems.append("Alice was offered one creature: the kept-card check proves nothing")
        if first[0]["nextSeats"] != [2] or first[0]["earlier"]:
            problems.append(f"Alice's question: nextSeats {first[0]['nextSeats']}, earlier {first[0]['earlier']}")
        rows = second[0]["earlier"] or []
        if second[0]["nextSeats"] or [r.get("seat") for r in rows] != [1] \
                or ids_of(rows[0]) != [first[0]["picked"]]:
            problems.append(f"Bob's question: nextSeats {second[0]['nextSeats']}, earlier {rows}, "
                            f"not Alice's one pick {first[0]['picked']}")
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "Innocent Blood: Bob is told only the creature Alice sacrificed, not the one she kept", found)


SCENARIOS = {"monument": monument, "monument-alone": monument_alone, "edict": edict,
             "innocent-blood": innocent_blood, "imperial-edict": imperial_edict,
             "barter": barter, "barter-none-second": barter_none_second,
             "barter-none-first": barter_none_first, "innocent": innocent}

if __name__ == "__main__":
    import json
    codes = []
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        result, message, found = scenario()
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[result])
        print(f"{name}: {result.upper()}: {message}")
        if result != "ok":
            print("  " + json.dumps(found, default=str)[:900])
        sys.stdout.flush()
    # A wrong answer outranks a game that never got there.
    sys.exit(1 if 1 in codes else max(codes, default=0))
