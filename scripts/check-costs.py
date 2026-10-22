"""Unusual costs, paid the way the rules allow. P6-AN, §6.92.

    python -I scripts/check-costs.py <worker.jar> <res-root> [trace-dir] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B): focused
decks so the card is reached on purpose, a policy that pays the way the
card allows, and a check of the result on the board -- never of the
fact that a question was asked.

  dismember      Phyrexian mana: one Swamp for {1}, 4 life for {B/P}{B/P}
  force-of-will  alternative cost: no lands; exile a blue card, pay 1 life
  delve          Treasure Cruise: graveyard cards exiled pay generic mana
  convoke        Venerated Loxodon: creatures tapped pay, then get counters
  improvise      Reverse Engineer: artifacts tapped pay generic mana
  affinity       Thoughtcast: artifacts reduce the cost, nothing tapped

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
        trace = os.path.join(TRACES, f"costs-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def seat2_bears(g, frame):
    """Seat 2: lands, then Grizzly Bears -- something to aim at."""
    if frame.get("kind") == "chooseSpellAbilityToPlay":
        return g.play_land(frame) or (g.option(frame, name="Grizzly Bears")
                                      if len(g.untapped_lands(2)) >= 2 else None)
    return DEFAULT


def cast(g, frame, name, contains=None):
    return g.option(frame, name=name, zone="hand", contains=contains, land=False)


def graveyard(g, seat, name=None):
    return g.zone(seat, "graveyard", owner=seat, name=name)


# --- the scenarios ----------------------------------------------------------


def dismember():
    g = game("dismember", [("Swamp", 30), ("Dismember", 30)])
    done = {"cast": False, "life_before": None}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if not g.mine(1, name="Swamp"):
                return g.play_land(f)
            bears = [c for c in g.zone(1, "battlefield", owner=2, name="Grizzly Bears")]
            if bears and not done["cast"] and len(g.untapped_lands(1)) == 1:
                done["cast"], done["life_before"] = True, g.player(1, 1).get("life")
                return cast(g, f, "Dismember")
            return None
        if kind == "applyManaToCost":
            # Life for both Phyrexian symbols first; then the Swamp for {1}.
            life = [o for o in f["options"] if o["actionId"] == "mana:life:phyrexian"]
            return life[0]["actionId"] if life else f["options"][0]["actionId"]
        return DEFAULT

    # Until the creature is dead, or a turn later: it dies to state-based
    # actions AFTER Dismember resolves, which is a later snapshot.
    done["turn"] = None

    def until(g):
        if done["cast"] and graveyard(g, 1, "Dismember"):
            done["turn"] = done["turn"] or g.turn
            return bool(graveyard(g, 2, "Grizzly Bears")) or g.turn > done["turn"] + 1
        return False

    g.run(policy, until=until, max_turn=24)
    found = {"life_before": done["life_before"], "life_after": g.player(1, 1).get("life"),
             "bears_dead": len(graveyard(g, 2, "Grizzly Bears")), "dismember_resolved": bool(graveyard(g, 1, "Dismember")),
             "lands_tapped": [c.get("tapped") for c in g.mine(1, name="Swamp")]}
    if not done["cast"]:
        return "inconclusive", "Dismember was never cast", found
    problems = []
    if not found["dismember_resolved"]:
        problems.append("Dismember never resolved")
    if found["bears_dead"] < 1:
        problems.append("the creature did not die to -5/-5")
    if found["life_before"] - found["life_after"] != 4:
        problems.append(f"4 life should have paid {{B/P}}{{B/P}}: {found['life_before']} -> {found['life_after']}")
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "{1}{B/P}{B/P} paid with one Swamp and 4 life; the creature died", found)


def force_of_will():
    # Seat 1 has no lands at all: only the alternative cost can cast it.
    g = game("force-of-will", [("Force of Will", 60)])
    done = {"cast": False, "life_before": None, "bears_cast": False}

    def policy(g, f):
        kind = f.get("kind")
        if f["authorisedSeat"] == 2:
            if kind == "chooseSpellAbilityToPlay":
                bears = g.option(f, name="Grizzly Bears", zone="hand", land=False)
                if bears and len(g.untapped_lands(2)) >= 2 and not done["bears_cast"]:
                    done["bears_cast"] = True
                    return bears
                return g.play_land(f)
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            # A stack entry carries Forge's description, not a name.
            on_stack = [c for c in g.state.get(1, {}).get("stack", []) if "Grizzly Bears" in str(c)]
            if on_stack and not done["cast"]:
                alt = [o for o in f["options"] if "Force of Will" in o["label"] and "life" in o["label"].lower()]
                if alt:
                    done["cast"], done["life_before"] = True, g.player(1, 1).get("life")
                    done["fow_in_grave"] = len(graveyard(g, 1, "Force of Will"))
                    return alt[0]["actionId"]
            return None
        if kind == "CostExile" and f["options"]:
            return f["options"][0]["actionId"]  # the blue card to exile
        return DEFAULT

    # Discards put copies in the graveyard first: wait for ONE MORE than
    # were there when it was cast.
    g.run(policy, until=lambda g: done["cast"]
          and len(graveyard(g, 1, "Force of Will")) > done.get("fow_in_grave", 99)
          and not g.state.get(1, {}).get("stack"), max_turn=24)
    exiled = [c for c in g.zone(1, "exile", owner=1) if c.get("name") == "Force of Will"]
    found = {"bears_cast": done["bears_cast"], "fow_cast": done["cast"],
             "bears_countered": bool(g.zone(1, "graveyard", owner=2, name="Grizzly Bears")),
             "bears_on_battlefield": bool(g.zone(1, "battlefield", owner=2, name="Grizzly Bears")),
             "life": (done["life_before"], g.player(1, 1).get("life")), "exiled": len(exiled),
             "lands": len(g.mine(1, name=None))}
    if not done["cast"]:
        return "inconclusive", "Force of Will's alternative cost was never offered against a spell", found
    problems = []
    if not found["bears_countered"] or found["bears_on_battlefield"]:
        problems.append("Grizzly Bears was not countered")
    if found["life"][0] - found["life"][1] != 1:
        problems.append(f"the alternative cost is 1 life: {found['life']}")
    if found["exiled"] < 1:
        problems.append("no blue card was exiled to pay")
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "cast with no mana: a blue card exiled and 1 life paid, and the spell was countered", found)


def delve():
    g = game("delve", [("Island", 24), ("Treasure Cruise", 36)])
    done = {"cast": False, "before": None, "delved": 0}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if len(g.mine(1, name="Island")) < 4:
                return g.play_land(f)
            o = cast(g, f, "Treasure Cruise")
            if o and not done["cast"] and len(graveyard(g, 1)) >= 4 and len(g.untapped_lands(1)) >= 4:
                done["cast"] = True
                done["before"] = {"grave": len(graveyard(g, 1)), "hand": g.player(1, 1).get("handCount"),
                                  "exile": len(g.zone(1, "exile", owner=1)),
                                  "cruise": len(graveyard(g, 1, "Treasure Cruise"))}
                return o
            return None
        if kind == "chooseEntitiesForEffect" and done["cast"] and "Delve" in (f.get("prompt") or ""):
            if done["delved"] < 4 and f["options"]:
                done["delved"] += 1
                return f["options"][0]["actionId"]
            return None
        return DEFAULT

    g.run(policy, until=lambda g: done["cast"]
          and len(g.zone(1, "exile", owner=1)) > done["before"]["exile"]
          and not g.state.get(1, {}).get("stack"), max_turn=40)
    found = {"before": done["before"], "delved": done["delved"],
             "after": {"grave": len(graveyard(g, 1)), "hand": g.player(1, 1).get("handCount"),
                       "exile": len(g.zone(1, "exile", owner=1))}}
    if not done["cast"]:
        return "inconclusive", "the graveyard never held four cards with four Islands up", found
    b, a = found["before"], found["after"]
    problems = []
    if done["delved"] != 4:
        problems.append(f"delve was offered {done['delved']} times, not 4")
    if a["exile"] - b["exile"] != 4:
        problems.append(f"4 graveyard cards should be in exile: {b['exile']} -> {a['exile']}")
    # Hand: -1 (Cruise cast) +3 drawn.
    if a["hand"] - b["hand"] != 2:
        problems.append(f"Treasure Cruise draws three: hand {b['hand']} -> {a['hand']}")
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "four graveyard cards exiled for {4} of {7}{U}, four Islands paid the rest, three drawn", found)


def discard_spare(f, spare):
    """At hand size, a spare land goes first, not the card under test."""
    o = next((o["actionId"] for o in f["options"] if spare in o["label"]), None)
    return o or f["options"][0]["actionId"]


def cast_again(g, card):
    """Not yet cast, or Forge undid the cast (the card is back in hand)."""
    return card is None or any(c["id"] == card for c in g.zone(1, "hand", owner=1))


def convoke():
    g = game("convoke", [("Plains", 24), ("Savannah Lions", 18), ("Venerated Loxodon", 18)])
    done = {"card": None, "tapped": []}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            lions = g.mine(1, name="Savannah Lions")
            if len(g.mine(1, name="Plains")) < 2:
                land = g.play_land(f)
                if land:
                    return land
            o = cast(g, f, "Venerated Loxodon")
            if o and len(lions) >= 3 and cast_again(g, done["card"]) and len(g.untapped_lands(1)) >= 2:
                done["card"], done["tapped"] = card_of(o), []
                return o
            if len(lions) < 3 and g.untapped_lands(1):
                return cast(g, f, "Savannah Lions")
            return None
        if kind == "chooseCardsForConvokeOrImprovise":
            lions = [o for o in f["options"] if any(c["id"] == card_of(o["actionId"])
                                                    for c in g.mine(1, name="Savannah Lions"))]
            if lions and len(done["tapped"]) < 3:
                done["tapped"].append(card_of(lions[0]["actionId"]))
                return lions[0]["actionId"]
            return None
        if kind == "chooseCardsToDiscardToMaximumHandSize":
            return discard_spare(f, "Plains")
        return DEFAULT

    g.run(policy, until=lambda g: done["card"] and any(c["id"] == done["card"] for c in g.mine(1))
          and not g.state.get(1, {}).get("stack"), max_turn=40)
    lions = {c["id"]: c for c in g.mine(1, name="Savannah Lions")}
    found = {"convoked": done["tapped"], "loxodon": any(c["id"] == done["card"] for c in g.mine(1)),
             "lions": {i: {"tapped": c.get("tapped"), "counters": c.get("counters")} for i, c in lions.items()}}
    if not done["card"]:
        return "inconclusive", "never had three Lions and two Plains", found
    problems = []
    if not found["loxodon"]:
        problems.append("Venerated Loxodon did not resolve")
    if len(done["tapped"]) != 3:
        problems.append(f"three creatures should have convoked: {done['tapped']}")
    for cid in done["tapped"]:
        lion = lions.get(cid, {})
        if not lion.get("tapped"):
            problems.append(f"{cid} convoked but is untapped")
        if "P1P1" not in str(lion.get("counters")) and "+1/+1" not in str(lion.get("counters")):
            problems.append(f"{cid} convoked but got no +1/+1 counter: {lion.get('counters')}")
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "three creatures tapped to convoke {4}{W}, each then got its +1/+1 counter", found)


def improvise():
    g = game("improvise", [("Island", 20), ("Ornithopter", 20), ("Reverse Engineer", 20)])
    done = {"card": None, "tapped": [], "hand_before": None}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            thopters = g.mine(1, name="Ornithopter")
            if len(thopters) < 3:
                o = cast(g, f, "Ornithopter")
                if o:
                    return o
            if len(g.mine(1, name="Island")) < 2:
                return g.play_land(f)
            o = cast(g, f, "Reverse Engineer")
            if o and len(thopters) >= 3 and cast_again(g, done["card"]) and len(g.untapped_lands(1)) >= 2:
                done["card"], done["tapped"] = card_of(o), []
                done["hand_before"] = g.player(1, 1).get("handCount")
                return o
            return None
        if kind == "chooseCardsForConvokeOrImprovise":
            if f["options"] and len(done["tapped"]) < 3:
                done["tapped"].append(card_of(f["options"][0]["actionId"]))
                return f["options"][0]["actionId"]
            return None
        if kind == "chooseCardsToDiscardToMaximumHandSize":
            return discard_spare(f, "Island")
        return DEFAULT

    # The copy that was cast, not any copy: a discarded one is in the
    # graveyard too.
    resolved = lambda g: any(c["id"] == done["card"] for c in graveyard(g, 1))  # noqa: E731
    g.run(policy, until=lambda g: done["card"] and resolved(g)
          and not g.state.get(1, {}).get("stack"), max_turn=28)
    thopters = {c["id"]: c.get("tapped") for c in g.mine(1, name="Ornithopter")}
    found = {"improvised": done["tapped"], "thopters_tapped": thopters,
             "hand": (done["hand_before"], g.player(1, 1).get("handCount")),
             "resolved": bool(done["card"] and resolved(g))}
    if not done["card"]:
        return "inconclusive", "never had three Ornithopters and two Islands", found
    problems = []
    if not found["resolved"]:
        problems.append("Reverse Engineer did not resolve")
    if len(done["tapped"]) != 3 or not all(thopters.get(c) for c in done["tapped"]):
        problems.append(f"three artifacts should have been tapped to improvise: {found}")
    if found["hand"][1] - found["hand"][0] != 2:
        problems.append(f"Reverse Engineer draws three: hand {found['hand']}")
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "three artifacts tapped for {3}, two Islands for {U}{U}, three cards drawn", found)


def affinity():
    # Half Ornithopters: four of them is the whole setup, and at a third
    # of the deck a CI run once drew only three in eighteen turns.
    g = game("affinity", [("Island", 15), ("Ornithopter", 30), ("Thoughtcast", 15)])
    done = {"card": None, "hand_before": None}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            thopters = g.mine(1, name="Ornithopter")
            if len(thopters) < 4:
                o = cast(g, f, "Ornithopter")
                if o:
                    return o
            if not g.mine(1, name="Island"):
                return g.play_land(f)
            o = cast(g, f, "Thoughtcast")
            if o and len(thopters) >= 4 and cast_again(g, done["card"]) and g.untapped_lands(1):
                done["card"], done["hand_before"] = card_of(o), g.player(1, 1).get("handCount")
                return o
            return None
        if kind == "chooseCardsForConvokeOrImprovise":
            return None  # affinity is not improvise: nothing is tapped
        if kind == "chooseCardsToDiscardToMaximumHandSize":
            return discard_spare(f, "Island")
        return DEFAULT

    # The copy that was cast, not any copy: a discarded one is in the
    # graveyard too.
    resolved = lambda g: any(c["id"] == done["card"] for c in graveyard(g, 1))  # noqa: E731
    g.run(policy, until=lambda g: done["card"] and resolved(g)
          and not g.state.get(1, {}).get("stack"), max_turn=36)
    done["cast"] = bool(done["card"])
    found = {"resolved": bool(done["card"] and resolved(g)),
             "hand": (done["hand_before"], g.player(1, 1).get("handCount")),
             "islands": len(g.mine(1, name="Island")),
             "thopters_tapped": [c.get("tapped") for c in g.mine(1, name="Ornithopter")],
             "turn": g.turn, "stopped": g.stopped_badly()}
    if not done["cast"]:
        return "inconclusive", "never had four Ornithopters and an Island", found
    problems = []
    if not found["resolved"]:
        problems.append("Thoughtcast did not resolve -- {4}{U} reduced by four artifacts is {U}")
    if found["hand"][1] - found["hand"][0] != 1:
        problems.append(f"Thoughtcast draws two: hand {found['hand']}")
    if any(found["thopters_tapped"]):
        problems.append("affinity tapped artifacts; it only counts them")
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "{4}{U} cost {U} with four artifacts out, none tapped; two cards drawn", found)


SCENARIOS = {"dismember": dismember, "force-of-will": force_of_will, "delve": delve,
             "convoke": convoke, "improvise": improvise, "affinity": affinity}

if __name__ == "__main__":
    import json
    worst = 0
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        result, message, found = scenario()
        code = {"ok": 0, "inconclusive": 2, "wrong": 1}[result]
        worst = max(worst, code) if worst != 1 else 1
        print(f"{name}: {result.upper()}: {message}")
        if result != "ok":
            print("  " + json.dumps(found, default=str)[:600])
        sys.stdout.flush()
    sys.exit(worst)
