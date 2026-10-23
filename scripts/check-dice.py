"""Dice the player changes: the die shows what they chose. PHASE_08 P8-F, Amendment 1.

    python -I scripts/check-dice.py <worker.jar> <res-root> [trace-dir] [scenario...]

Every scenario rolls the same die: Ebony Fly's "{4}: roll a d6; it becomes
an X/X flier", so the roll's final value is the Fly's power on the board.
Each brings one Un-set card that changes rolls (Phase 8 Amendment 1, owner
2026-10-23: the dice questions only those cards reach):

  reroll      Monitor Monitor, "once each turn, you may pay {1} to reroll":
              the die chosen (chooseDiceToReroll), Monitor's {1} paid -- one
              more land than the {4} is tapped
  nudge       Xenosquirrels, "remove a +1/+1 counter: increase or decrease
              the result by 1" (chooseRollToModify): the roll chosen, one
              counter removed, Increase -- the Fly is the roll plus one
  swap        Vedalken Squirrel-Whacker, "exchange one result with its power
              or toughness" (chooseRollToSwap, chooseRollSwapValue): the
              roll and whichever of power or toughness differs from it --
              the Fly takes that old value
  planar      Fractured Powerstone with Ichor Elixir: outside Planechase
              the die is not rolled -- choosePDRollToIgnore cannot arise
  ignore      Bamboozling Beeble on seat 1 itself: two dice, one ignored
              (chooseRollToIgnore) -- the LAST offered; the Fly is the other

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
LANDS_ONLY = [("Forest", 60)]
ROLL = re.compile(r"Roll: (\d+)")


def game(name, seat1):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"dice-{name}.jsonl")
    return Game(seat1, LANDS_ONLY, jar=JAR, res=RES, trace=trace)


def stack_empty(g):
    return not g.state.get(1, {}).get("stack") and not g.state.get(2, {}).get("stack")


def cast(g, f, name):
    in_hand = {c["id"] for c in g.zone(1, "hand") if c.get("name") == name}
    return next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) in in_hand
                 and o.get("payable") is not False and "Play land" not in (o.get("label") or "")), None)


def outcome(problems, ok, found):
    if found.get("stopped"):
        problems = problems + [found["stopped"]]
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def sources(g):
    """Untapped mana sources: the lands, and Ebony Fly itself ({T}: add {C})."""
    return len(g.untapped_lands(1)) + len([c for c in g.mine(1, name="Ebony Fly") if not c.get("tapped")])


def rolls_in(f):
    return [int(m.group(1)) for o in f["options"] for m in [ROLL.match(o.get("label") or "")] if m]


def fly_game(name, extra_cards, ready, answer, lands_needed=4, max_turn=24):
    """Seat 1 casts [extra_cards] then Ebony Fly, and once [ready](g) and
    [lands_needed] lands are untapped, rolls with the Fly. [answer](g, f, st)
    answers the dice questions (None: not one of them). Returns g, st with
    the Fly's power after the roll resolved and the lands it used."""
    seat1 = [("Island", 18), ("Swamp", 14), ("Ebony Fly", 10)] + extra_cards
    g = game(name, seat1)
    st = {"rolled": False, "turn": None, "asked": [], "lands": None, "after": None, "fly": None}
    wanted = [n for n, _ in extra_cards]

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        got = answer(g, f, st) if seat == 1 else None
        if got is not None:
            return got
        if k in ("confirmAction", "confirmTrigger") and seat == 1:
            return "confirm:yes"
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            flies = g.mine(1, name="Ebony Fly")
            if not st["rolled"] and flies and ready(g, st) and len(g.untapped_lands(1)) >= lands_needed:
                o = g.option(f, name="Ebony Fly", zone="battlefield", contains="Roll")
                if o:
                    st["rolled"], st["turn"], st["fly"] = True, g.turn, flies[0]["id"]
                    st["lands"] = sources(g)
                    return o
            land = g.play_land(f)
            if land:
                return land
            if st["rolled"]:
                return None
            for name_ in wanted:
                if not g.mine(1, name=name_):
                    o = cast(g, f, name_)
                    return o
            return None if flies else cast(g, f, "Ebony Fly")
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        if st["rolled"] and stack_empty(g) and st["after"] is None and \
                (st["asked"] or g.turn > st["turn"]):
            fly = next((c for c in g.mine(1) if c["id"] == st["fly"]), {})
            st["after"] = {"power": fly.get("power"), "lands": sources(g),
                           "board": {c["id"]: (c.get("name"), c.get("power"),
                                               {k["name"]: k["count"] for k in c.get("counters", []) or []})
                                     for c in g.mine(1) if c.get("kind") == "creature"}}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=max_turn)
    return g, st


def reroll():
    def answer(g, f, st):
        k = f.get("kind")
        if k == "chooseDiceToReroll":
            st["asked"].append((k, rolls_in(f), f.get("prompt")))
            return f["options"][0]["actionId"] if len(st["asked"]) == 1 else None
        return None

    g, st = fly_game("reroll", [("Monitor Monitor", 10)], lambda g, st: g.mine(1, name="Monitor Monitor"), answer,
                     lands_needed=5)
    found = {"asked": st["asked"], "lands": st["lands"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Ebony Fly never rolled with Monitor Monitor out", found
    problems = []
    if len(st["asked"][0][1]) != 1 or not st["asked"][0][2].startswith("You rolled "):
        problems.append(f"one die offered, and the question shows the roll: {st['asked'][0]}")
    if st["lands"] - st["after"]["lands"] != 5:
        problems.append(f"{{4}} for the roll and Monitor's {{1}}: five mana sources tapped (lands, or the Fly "
                        f"itself), got {st['lands'] - st['after']['lands']}")
    if not 1 <= (st["after"]["power"] or 0) <= 6:
        problems.append(f"the Fly is the new roll, 1 to 6: {st['after']['power']}")
    return outcome(problems, f"Monitor Monitor: the die rerolled for {{1}}, the Fly is a {st['after']['power']}", found)


def nudge():
    def answer(g, f, st):
        k = f.get("kind")
        if k == "chooseRollToModify":
            st["asked"].append((k, rolls_in(f), f.get("prompt")))
            st["roll"] = rolls_in(f)[-1] if len(st["asked"]) == 1 else st.get("roll")
            return f["options"][-1]["actionId"] if len(st["asked"]) == 1 else None
        if k == "chooseBinary" and st["asked"]:
            st["asked"].append((k, [o.get("label") for o in f["options"]], f.get("prompt")))
            return next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith("Increase")),
                        f["options"][0]["actionId"])
        if k == "confirmPayment" and st["asked"]:
            return "confirm:yes"
        return None

    g, st = fly_game("nudge", [("Xenosquirrels", 10)], lambda g, st: g.mine(1, name="Xenosquirrels"), answer)
    found = {"asked": st["asked"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Ebony Fly never rolled with Xenosquirrels out", found
    problems = []
    roll = st.get("roll")
    if st["after"]["power"] != roll + 1:
        problems.append(f"rolled {roll}, increased by one: the Fly should be {roll + 1}, got {st['after']['power']}")
    squirrels = [v for v in st["after"]["board"].values() if v[0] == "Xenosquirrels"]
    if not squirrels or squirrels[0][2].get("P1P1") != 1:
        problems.append(f"one +1/+1 counter removed from Xenosquirrels: {squirrels}")
    return outcome(problems, f"Xenosquirrels: the {roll} became {roll + 1}, one counter spent", found)


def swap():
    def answer(g, f, st):
        k = f.get("kind")
        if k == "chooseRollToSwap":
            st["asked"].append((k, rolls_in(f), f.get("prompt")))
            if len(st["asked"]) == 1:
                st["roll"] = rolls_in(f)[-1]
                return f["options"][-1]["actionId"]
            return None
        if k == "chooseRollSwapValue":
            st["asked"].append((k, [o.get("label") for o in f["options"]], f.get("prompt")))
            # "Exchange the roll of 5 with power (5) or toughness (3)?" --
            # take the one that differs, or a swap would change nothing.
            m = re.search(r"power \((\d+)\) or toughness \((\d+)\)", f.get("prompt") or "")
            power, tough = (int(m.group(1)), int(m.group(2))) if m else (None, None)
            st["swapped"] = "power" if power != st["roll"] else "toughness"
            st["old"] = power if st["swapped"] == "power" else tough
            want = "Power" if st["swapped"] == "power" else "Toughness"
            return next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith(want)),
                        f["options"][0]["actionId"])
        return None

    def ready(g, st):
        whacker = g.mine(1, name="Vedalken Squirrel-Whacker")
        if whacker:
            st["whacker"] = whacker[0]["id"]
        return bool(whacker)

    g, st = fly_game("swap", [("Vedalken Squirrel-Whacker", 10)], ready, answer)
    found = {"asked": st["asked"], "whacker": st.get("whacker"), "after": st["after"], "stopped": g.stopped_badly()}
    asked = [a for a in st["asked"] if a[0] == "chooseRollToSwap"]
    if not asked or not st["after"]:
        return "inconclusive", "Ebony Fly never rolled with the Squirrel-Whacker out", found
    roll, side, old = st["roll"], st.get("swapped"), st.get("old")
    if old == roll:
        return "inconclusive", "the roll matched both the Whacker's power and toughness: a swap shows nothing", found
    problems = []
    values = [a for a in st["asked"] if a[0] == "chooseRollSwapValue"]
    if not values or "power (" not in (values[0][2] or "") or "toughness (" not in (values[0][2] or ""):
        problems.append(f"the second question names power and toughness: {values}")
    whacker = st["after"]["board"].get(st["whacker"], (None, None, None))
    if side == "power" and whacker[1] != roll:
        problems.append(f"the {roll} exchanged with power: the Whacker's power should be {roll}, got {whacker[1]}")
    if st["after"]["power"] != old:
        problems.append(f"the Fly takes the Whacker's old {side} {old}, got {st['after']['power']}")
    return outcome(problems, f"Squirrel-Whacker: the {roll} exchanged with its {side}, the Fly took the old {old}",
                   found)


def ignore():
    def answer(g, f, st):
        k = f.get("kind")
        if k == "chooseRollToIgnore":
            rolls = rolls_in(f)
            st["asked"].append((k, rolls, f.get("prompt")))
            st["kept"] = rolls[0]
            return f["options"][-1]["actionId"]
        if k == "chooseTargetsFor" and not st["rolled"]:
            return next((o["actionId"] for o in f["options"] if o.get("objectId") == "player:1"), DEFAULT)
        return None

    def ready(g, st):
        # The Beeble first, on seat 1 itself, the same turn as the roll.
        if st.get("beeble_turn") == g.turn:
            return True
        return False

    def beeble_answer(g, f, st):
        got = answer(g, f, st)
        if got is not None:
            return got
        if f.get("kind") == "chooseSpellAbilityToPlay" and stack_empty(g) and not st["rolled"] \
                and st.get("beeble_turn") is None:
            beebles = [c for c in g.mine(1, name="Bamboozling Beeble") if not c.get("sick") and not c.get("tapped")]
            if beebles and g.mine(1, name="Ebony Fly") and len(g.untapped_lands(1)) >= 5:
                o = g.option(f, name="Bamboozling Beeble", zone="battlefield", contains="next time")
                if o:
                    st["beeble_turn"] = g.turn
                    return o
        return None

    g, st = fly_game("ignore", [("Bamboozling Beeble", 10)], ready, beeble_answer)
    found = {"asked": st["asked"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Ebony Fly never rolled under the Beeble's effect", found
    problems = []
    rolls = st["asked"][0][1]
    if len(rolls) != 2:
        problems.append(f"two dice instead of one, both offered: {rolls}")
    if st["after"]["power"] != st["kept"]:
        problems.append(f"the last roll ignored, so the Fly is {st['kept']}, got {st['after']['power']}")
    return outcome(problems, f"Bamboozling Beeble: rolled {rolls}, the last ignored -- the Fly is {st['kept']}", found)


def planar():
    """Fractured Powerstone rolls the planar die; Ichor Elixir would make it
    two dice and one ignored (choosePDRollToIgnore). Forge rolls nothing
    outside a Planechase game, and Proxic never plays one: the proof that
    the question cannot arise is this game -- both cards out, the die
    "rolled", nothing asked, and the game goes on."""
    g = game("planar", [("Island", 30), ("Fractured Powerstone", 15), ("Ichor Elixir", 15)])
    st = {"used": False, "asked": [], "turn": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "choosePDRollToIgnore":
            st["asked"].append((seat, [o.get("label") for o in f["options"]], f.get("prompt")))
            return f["options"][-1]["actionId"]
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            stones = [c for c in g.mine(1, name="Fractured Powerstone") if not c.get("tapped")]
            if not st["used"] and stones and g.mine(1, name="Ichor Elixir"):
                o = g.option(f, name="Fractured Powerstone", zone="battlefield", contains="planar")
                if o:
                    st["used"], st["turn"] = True, g.turn
                    return o
            land = g.play_land(f)
            if land:
                return land
            if not g.mine(1, name="Ichor Elixir"):
                return cast(g, f, "Ichor Elixir")
            return None if g.mine(1, name="Fractured Powerstone") else cast(g, f, "Fractured Powerstone")
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        if st["used"] and st["after"] is None and g.turn > st["turn"]:
            st["after"] = g.turn
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"asked": st["asked"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["used"] or st["after"] is None:
        return "inconclusive", "Fractured Powerstone never rolled with Ichor Elixir out", found
    problems = []
    if st["asked"]:
        problems.append(f"outside Planechase the planar die is not rolled, so nothing is asked: {st['asked']}")
    return outcome(problems, "Fractured Powerstone with Ichor Elixir: nothing rolled, nothing asked, the game "
                             "went on (Planechase is not played)", found)


SCENARIOS = {"reroll": reroll, "nudge": nudge, "swap": swap, "ignore": ignore, "planar": planar}

if __name__ == "__main__":
    codes = []
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        # A game that never reached its moment proves nothing either way:
        # up to two more, each a fresh shuffle. A WRONG answer is final.
        for _ in range(3):
            verdict_, message, found = scenario()
            if verdict_ != "inconclusive":
                break
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_])
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:1200])
        sys.stdout.flush()
    # A wrong answer outranks a game that never got there.
    sys.exit(1 if 1 in codes else max(codes, default=0))
