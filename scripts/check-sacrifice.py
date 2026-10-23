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


def game(name, seat1, seat2=BEARS):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"sacrifice-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


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
        self.log.append({"seat": seat, "kind": frame["kind"], "prompt": frame.get("prompt") or "", "offered": offered,
                         "own creatures": creatures(g, seat), "picked": card_of(pick)})
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
    g = game("monument", [("Mountain", 28), ("Sol Ring", 4), ("Eldrazi Monument", 12), ("Raging Goblin", 16)])
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
    g = game("monument-alone", [("Mountain", 30), ("Sol Ring", 4), ("Eldrazi Monument", 26)])
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
    g = game(name, seat1_deck)
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
    g = game("innocent-blood", [("Swamp", 26), ("Innocent Blood", 14), ("Walking Corpse", 20)])
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


SCENARIOS = {"monument": monument, "monument-alone": monument_alone, "edict": edict,
             "innocent-blood": innocent_blood, "imperial-edict": imperial_edict}

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
