"""Modal spells and their extra costs, chosen by the player. P6-AN, §6.92.

    python -I scripts/check-modes.py <worker.jar> <res-root> [trace-dir] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B). The player
picks the modes; Forge applies them; the check reads the RESULT off the
board.

  escalate   Collective Brutality: two modes, so a discard as escalate's
             extra cost; the creature dies and 2 life is drained
  cryptic    Cryptic Command: choose two -- bounce and draw
  entwine    Tooth and Nail: entwine paid, both halves happen
  spree      Three Steps Ahead: two modes, each with its own extra cost
  pawprint   Season of Weaving: modes within a five-pawprint budget

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its card.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
# A trace DIRECTORY, or a trace FILE path as CI passes every check one
# (each scenario then writes <file stem>-<scenario>.jsonl beside it).
# Anything else is a scenario name to run alone.
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
BEARS = [("Forest", 30), ("Grizzly Bears", 30)]


def game(name, seat1, seat2=BEARS):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"modes-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def seat2_bears(g, frame):
    if frame.get("kind") == "chooseSpellAbilityToPlay":
        return g.play_land(frame) or (g.option(frame, name="Grizzly Bears", zone="hand", land=False)
                                      if len(g.untapped_lands(2)) >= 2 else None)
    return DEFAULT


def cast(g, frame, name, contains=None):
    return g.option(frame, name=name, zone="hand", contains=contains, land=False)


def pick(frame, text):
    """The option whose label contains `text`."""
    return next((o["actionId"] for o in frame.get("options", []) if text in (o.get("label") or "")), None)


def resolved(g, seat, name, before):
    """One more copy of `name` in the graveyard than `before`, nothing on the stack."""
    return len(g.zone(seat, "graveyard", owner=seat, name=name)) > before and not g.state.get(seat, {}).get("stack")


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


# --- the scenarios ----------------------------------------------------------


def escalate():
    g = game("escalate", [("Swamp", 24), ("Collective Brutality", 36)])
    st = {"cast": False, "modes": [], "before": None}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if len(g.mine(1, name="Swamp")) < 3:
                return g.play_land(f)
            o = cast(g, f, "Collective Brutality")
            if o and not st["cast"] and g.zone(1, "battlefield", owner=2, name="Grizzly Bears") \
                    and len(g.untapped_lands(1)) >= 2:
                st["cast"] = True
                st["before"] = {"hand": g.player(1, 1).get("handCount"), "me": g.player(1, 1).get("life"),
                                "them": g.player(1, 2).get("life"),
                                "grave": len(g.zone(1, "graveyard", owner=1, name="Collective Brutality"))}
                return o
            return None
        if kind == "chooseModeForAbility" and st["cast"]:
            for text in ("-2/-2", "loses 2 life"):
                if text not in st["modes"]:
                    o = pick(f, text)
                    if o:
                        st["modes"].append(text)
                        return o
            return None
        if kind == "chooseTargetsFor":
            creature = next((o["actionId"] for o in f["options"] if "Grizzly" in o["label"]), None)
            return creature or f["options"][0]["actionId"]
        if kind == "CostDiscard":
            return f["options"][0]["actionId"]
        return DEFAULT

    g.run(policy, until=lambda g: st["cast"] and resolved(g, 1, "Collective Brutality", st["before"]["grave"])
          and g.zone(1, "graveyard", owner=2, name="Grizzly Bears"), max_turn=28)
    b = st["before"] or {}
    found = {"modes": st["modes"], "before": b, "after": {
        "hand": g.player(1, 1).get("handCount"), "me": g.player(1, 1).get("life"), "them": g.player(1, 2).get("life")},
        "bears_dead": bool(g.zone(1, "graveyard", owner=2, name="Grizzly Bears")), "stopped": g.stopped_badly()}
    if not st["cast"]:
        return "inconclusive", "never cast with a creature to shrink", found
    a = found["after"]
    problems = []
    if found["stopped"]:
        problems.append(found["stopped"])
    if len(st["modes"]) != 2:
        problems.append(f"two modes should have been chosen: {st['modes']}")
    if not found["bears_dead"]:
        problems.append("the creature did not die to -2/-2")
    if (b.get("me"), b.get("them")) != (a["me"] - 2, a["them"] + 2):
        problems.append(f"2 life should have moved: me {b.get('me')}->{a['me']}, them {b.get('them')}->{a['them']}")
    # -1 the spell, -1 the escalate discard.
    if b.get("hand") is not None and b["hand"] - a["hand"] != 2:
        problems.append(f"escalate's discard did not happen: hand {b['hand']}->{a['hand']}")
    return result(problems, "two modes, one card discarded for escalate; the creature died and 2 life moved", found)


def cryptic():
    g = game("cryptic", [("Island", 24), ("Cryptic Command", 36)])
    st = {"cast": False, "modes": [], "before": None}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if len(g.mine(1, name="Island")) < 4:
                return g.play_land(f)
            o = cast(g, f, "Cryptic Command")
            if o and not st["cast"] and g.zone(1, "battlefield", owner=2, name="Grizzly Bears") \
                    and len(g.untapped_lands(1)) >= 4:
                st["cast"] = True
                st["before"] = {"hand": g.player(1, 1).get("handCount"), "their_hand": g.player(1, 2).get("handCount"),
                                "bears": len(g.zone(1, "battlefield", owner=2, name="Grizzly Bears")),
                                "grave": len(g.zone(1, "graveyard", owner=1, name="Cryptic Command"))}
                return o
            return None
        if kind == "chooseModeForAbility" and st["cast"]:
            for text in ("Return target permanent", "Draw a card"):
                if text not in st["modes"]:
                    o = pick(f, text)
                    if o:
                        st["modes"].append(text)
                        return o
            return None
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if "Grizzly" in o["label"]), f["options"][0]["actionId"])
        return DEFAULT

    g.run(policy, until=lambda g: st["cast"] and resolved(g, 1, "Cryptic Command", st["before"]["grave"]),
          max_turn=28)
    b = st["before"] or {}
    found = {"modes": st["modes"], "before": b, "after": {
        "hand": g.player(1, 1).get("handCount"), "their_hand": g.player(1, 2).get("handCount"),
        "bears": len(g.zone(1, "battlefield", owner=2, name="Grizzly Bears"))}, "stopped": g.stopped_badly()}
    if not st["cast"]:
        return "inconclusive", "never cast with a creature to bounce", found
    a = found["after"]
    problems = [found["stopped"]] if found["stopped"] else []
    if len(st["modes"]) != 2:
        problems.append(f"two modes should have been chosen: {st['modes']}")
    if a["bears"] != b["bears"] - 1 or a["their_hand"] != b["their_hand"] + 1:
        problems.append(f"the creature was not returned to its owner's hand: {b} -> {a}")
    if a["hand"] != b["hand"]:  # -1 the spell, +1 drawn
        problems.append(f"Cryptic Command's draw did not happen: hand {b['hand']}->{a['hand']}")
    return result(problems, "choose two: the creature returned to its owner's hand, and a card drawn", found)


def entwine():
    g = game("entwine", [("Forest", 40), ("Tooth and Nail", 10), ("Grizzly Bears", 10)])
    st = {"cast": False, "entwined": False, "before": None}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if len(g.mine(1, name="Forest")) < 11:
                return g.play_land(f)
            o = cast(g, f, "Tooth and Nail")
            in_hand = len(g.mine(1, "hand", name="Grizzly Bears"))
            if o and not st["cast"] and in_hand >= 1 and len(g.untapped_lands(1)) >= 11:
                st["cast"] = True
                st["before"] = {"bears": len(g.mine(1, name="Grizzly Bears")),
                                "grave": len(g.zone(1, "graveyard", owner=1, name="Tooth and Nail"))}
                return o
            return None
        if kind == "chooseOptionalCosts" and st["cast"]:
            o = pick(f, "Entwine")
            if o:
                st["entwined"] = True
            return o
        if kind == "chooseEntitiesForEffect" and st["cast"]:
            # "up to two" from the library, then "up to two" from hand onto
            # the battlefield: take what is offered.
            bears = [o["actionId"] for o in f["options"] if "Grizzly" in o["label"]]
            return bears[0] if bears else None
        return DEFAULT

    g.run(policy, until=lambda g: st["cast"] and resolved(g, 1, "Tooth and Nail", st["before"]["grave"]),
          max_turn=46)
    b = st["before"] or {}
    found = {"entwined": st["entwined"], "before": b, "after_bears": len(g.mine(1, name="Grizzly Bears")),
             "stopped": g.stopped_badly()}
    if not st["cast"]:
        return "inconclusive", "never had eleven Forests and a creature in hand", found
    problems = [found["stopped"]] if found["stopped"] else []
    if not st["entwined"]:
        problems.append("entwine was not offered as an optional cost")
    if found["after_bears"] - b.get("bears", 0) != 2:
        problems.append(f"two creatures should have entered from hand: {b.get('bears')} -> {found['after_bears']}")
    return result(problems, "entwine paid: creatures searched for, and two put onto the battlefield", found)


def spree():
    g = game("spree", [("Island", 24), ("Ornithopter", 12), ("Three Steps Ahead", 24)])
    st = {"cast": False, "modes": [], "before": None}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if not g.mine(1, name="Ornithopter"):
                o = cast(g, f, "Ornithopter")
                if o:
                    return o
            if len(g.mine(1, name="Island")) < 6:
                return g.play_land(f)
            o = cast(g, f, "Three Steps Ahead")
            if o and not st["cast"] and g.mine(1, name="Ornithopter") and len(g.untapped_lands(1)) >= 6:
                st["cast"] = True
                st["before"] = {"hand": g.player(1, 1).get("handCount"),
                                "thopters": len(g.mine(1, name="Ornithopter")),
                                "grave": len(g.zone(1, "graveyard", owner=1, name="Three Steps Ahead"))}
                return o
            return None
        if kind in ("chooseModeForAbility", "chooseOptionalCosts") and st["cast"]:
            for text in ("copy of target", "Draw two"):
                if text not in st["modes"]:
                    o = pick(f, text)
                    if o:
                        st["modes"].append(text)
                        return o
            return None
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if "Ornithopter" in o["label"]), f["options"][0]["actionId"])
        return DEFAULT

    g.run(policy, until=lambda g: st["cast"] and resolved(g, 1, "Three Steps Ahead", st["before"]["grave"]),
          max_turn=32)
    b = st["before"] or {}
    found = {"modes": st["modes"], "before": b, "after": {
        "hand": g.player(1, 1).get("handCount"), "thopters": len(g.mine(1, name="Ornithopter"))},
        "stopped": g.stopped_badly()}
    if not st["cast"]:
        return "inconclusive", "never had six Islands and an artifact", found
    a = found["after"]
    problems = [found["stopped"]] if found["stopped"] else []
    if len(st["modes"]) != 2:
        problems.append(f"two spree modes should have been chosen: {st['modes']}")
    if a["thopters"] != b["thopters"] + 1:
        problems.append(f"the copy mode made no token: {b['thopters']} -> {a['thopters']}")
    if a["hand"] - b["hand"] != 0:  # -1 spell, +2 drawn, -1 discarded
        problems.append(f"draw two then discard one: hand {b['hand']}->{a['hand']}")
    return result(problems, "two spree modes, each cost paid: a token copy, two drawn and one discarded", found)


def pawprint():
    g = game("pawprint", [("Island", 30), ("Season of Weaving", 30)])
    st = {"cast": False, "chosen": 0, "offered_after_budget": None, "before": None}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if len(g.mine(1, name="Island")) < 6:
                return g.play_land(f)
            o = cast(g, f, "Season of Weaving")
            if o and not st["cast"] and len(g.untapped_lands(1)) >= 6:
                st["cast"] = True
                st["before"] = {"hand": g.player(1, 1).get("handCount"),
                                "grave": len(g.zone(1, "graveyard", owner=1, name="Season of Weaving"))}
                return o
            return None
        if kind == "chooseModeForAbility" and st["cast"]:
            draw = pick(f, "Draw a card")
            if st["chosen"] >= 5:
                st["offered_after_budget"] = [o["label"][:40] for o in f["options"]]
                return None
            if draw:
                st["chosen"] += 1
                return draw
            return None
        return DEFAULT

    g.run(policy, until=lambda g: st["cast"] and resolved(g, 1, "Season of Weaving", st["before"]["grave"]),
          max_turn=32)
    b = st["before"] or {}
    found = {"draw_modes_chosen": st["chosen"], "offered_after_budget": st["offered_after_budget"],
             "before": b, "after_hand": g.player(1, 1).get("handCount"), "stopped": g.stopped_badly()}
    if not st["cast"]:
        return "inconclusive", "never had six Islands", found
    problems = [found["stopped"]] if found["stopped"] else []
    if st["chosen"] != 5:
        problems.append(f"five one-pawprint draws should fit the budget: {st['chosen']}")
    if st["offered_after_budget"]:
        problems.append(f"a mode was offered with the budget spent: {st['offered_after_budget']}")
    if found["after_hand"] - b.get("hand", 0) != 4:  # -1 spell, +5 drawn
        problems.append(f"five draws: hand {b.get('hand')}->{found['after_hand']}")
    return result(problems, "five one-pawprint modes chosen, nothing offered past the budget, five drawn", found)


SCENARIOS = {"escalate": escalate, "cryptic": cryptic, "entwine": entwine, "spree": spree, "pawprint": pawprint}

if __name__ == "__main__":
    import json
    worst = 0
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        verdict_, message, found = scenario()
        code = {"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_]
        worst = 1 if 1 in (worst, code) else max(worst, code)
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:700])
        sys.stdout.flush()
    sys.exit(worst)
