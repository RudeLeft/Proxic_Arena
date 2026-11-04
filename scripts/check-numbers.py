"""Choosing a number, as the worker asks it -- PHASE_09 W-11, Amendment 14.

    python -I scripts/check-numbers.py <worker.jar> <res-root> [trace-dir] [scenario...]

The page's dial and split tray build on what the worker sends with each
question; these games read it off the protocol and check the board after:

  x        Fireball: arrange.number.values is each option's number, in
           order; canMake is sent; each option costs "{X}{R}" with X
           filled in; an option is unpayable exactly when its cost is more
           than canMake. The X answered is the X then owed.
  kicker   Everflowing Chalice: multikicker {2} -- values, keyword
           "Multikicker", each "{2}", costs {0}, {2}, {4}...; kicked once,
           one charge counter.
  split    Arc Lightning at Bob and a Gray Ogre: no share is asked until
           both targets are chosen (the targets first, rule 601.2d); then
           one question, its arrange.divide the whole split (3 damage, the
           two targets in order, the Ogre needing 2, values [1, 2]); 1 to
           Bob -- Bob loses 1, the Ogre dies.
  energy   Harnessed Lightning: chooseNumber names its card (about) and
           carries the card's sentence ("... deals that much damage ...");
           pay all 3 -- the Ogre dies.

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
OGRES = [("Mountain", 30), ("Gray Ogre", 30)]


def game(name, seat1, seat2=OGRES):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"numbers-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def mana_value(cost):
    total = 0
    for s in re.findall(r"\{([^}]+)\}", cost or ""):
        total += int(s) if s.isdigit() else (0 if s == "X" else 1)
    return total


def cast(g, f, name):
    o = g.option(f, name=name, zone="hand", land=False)
    if o and any(x["actionId"] == o and x.get("payable") is False for x in f["options"]):
        return None
    return o


def outcome(problems, ok, found):
    if found.get("stopped"):
        problems = problems + [found["stopped"]]
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def number_layout(f):
    return ((f.get("arrange") or {}).get("number")) or {}


def check_dial(f, problems, label):
    """Values, costs and payable agree with each other and with canMake."""
    layout = number_layout(f)
    values, options = layout.get("values"), f.get("options", [])
    if not values or len(values) != len(options):
        problems.append(f"{label}: values {values} do not match the {len(options)} options")
        return layout
    if any(not o["actionId"].endswith(f":{v}") for o, v in zip(options, values)):
        problems.append(f"{label}: values {values} are not the options' numbers, in order")
    make = layout.get("canMake")
    for o in options:
        cost = o.get("cost")
        if cost is None or make is None:
            problems.append(f"{label}: no cost or no canMake: {o}, {make}")
            break
        if (o.get("payable") is False) != (mana_value(cost) > make):
            problems.append(f"{label}: {o['actionId']} costs {cost}, can make {make}, payable {o.get('payable')}")
            break
    return layout


def fireball():
    g = game("x", [("Mountain", 40), ("Fireball", 20)], [("Mountain", 60)])
    st = {"asked": None, "chosen": None, "owing": None, "costs": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if st["asked"] is None and len(g.untapped_lands(1)) >= 4:
                o = cast(g, f, "Fireball")
                if o:
                    return o
            return g.play_land(f)
        if seat == 1 and k == "announceRequirements" and st["asked"] is None:
            st["asked"] = f
            payable = [o for o in f["options"] if o.get("payable") is not False]
            pick = payable[-1] if payable else f["options"][0]
            st["chosen"] = pick
            return pick["actionId"]
        if seat == 1 and k == "applyManaToCost" and st["chosen"] and st["owing"] is None:
            st["owing"] = f.get("owing")
            return DEFAULT
        if seat == 1 and k == "chooseTargetsFor" and st["asked"]:
            them = next((o["actionId"] for o in f["options"] if o.get("label") == "Bob"), None)
            if them and not st.get("targeted"):
                st["targeted"] = True
                return them
            return None
        return DEFAULT

    g.run(policy, until=lambda g: st["owing"] is not None, max_turn=14)
    f = st["asked"]
    found = {"stopped": g.stopped_badly(), "owing": st["owing"],
             "chosen": st["chosen"] and st["chosen"]["actionId"],
             "layout": f and number_layout(f),
             "options": f and [(o["actionId"], o.get("cost"), o.get("payable", True)) for o in f["options"]]}
    if not f or not st["owing"]:
        return "inconclusive", "Fireball was never announced and paid for", found
    problems = []
    layout = check_dial(f, problems, "Fireball")
    if not re.search(r"\bX\b", layout.get("says") or ""):
        problems.append(f"the card's sentence about X: {layout.get('says')!r}")
    costs = {o["actionId"]: o.get("cost") for o in f["options"]}
    if costs.get("number:2") not in ("{2}{R}",):
        problems.append(f"X = 2 should cost {{2}}{{R}}: {costs.get('number:2')}")
    if st["chosen"].get("cost") != st["owing"]:
        problems.append(f"the X chosen costs {st['chosen'].get('cost')}, but {st['owing']} was owed")
    return outcome(problems, f"Fireball: X = {st['chosen']['actionId'][7:]} at {st['owing']}, "
                             f"can make {layout.get('canMake')}", found)


def chalice():
    g = game("kicker", [("Mountain", 40), ("Everflowing Chalice", 20)], [("Mountain", 60)])
    st = {"asked": None, "kicked": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if st["asked"] is None and len(g.untapped_lands(1)) >= 2:
                o = cast(g, f, "Everflowing Chalice")
                if o:
                    return o
            return g.play_land(f)
        if seat == 1 and k == "chooseNumberForKeywordCost" and st["asked"] is None:
            st["asked"] = f
            one = next((o for o in f["options"] if o["actionId"] == "number:1"), None)
            st["kicked"] = 1 if one else 0
            return one["actionId"] if one else None
        return DEFAULT

    def until(g):
        return any(c.get("counters") for c in g.mine(1, name="Everflowing Chalice"))

    g.run(policy, until=until, max_turn=14)
    f = st["asked"]
    chalices = g.mine(1, name="Everflowing Chalice")
    found = {"stopped": g.stopped_badly(), "layout": f and number_layout(f),
             "options": f and [(o["actionId"], o.get("cost"), o.get("payable", True)) for o in f["options"]],
             "counters": [c.get("counters") for c in chalices]}
    if not f or not chalices:
        return "inconclusive", "Everflowing Chalice was never kicked and resolved", found
    problems = []
    layout = check_dial(f, problems, "Chalice")
    if layout.get("keyword") != "Multikicker" or layout.get("each") != "{2}":
        problems.append(f"keyword and each: {layout.get('keyword')!r}, {layout.get('each')!r}")
    costs = [o.get("cost") for o in f["options"]][:3]
    if costs != ["{0}", "{2}", "{4}"]:
        problems.append(f"0, 1, 2 times should cost {{0}}, {{2}}, {{4}}: {costs}")
    if "-- " in (f.get("prompt") or "") or " --" in (f.get("prompt") or ""):
        problems.append(f"a double dash in the question: {f.get('prompt')!r}")
    charge = sum(x.get("count", 0) for c in chalices for x in c.get("counters") or [] if x.get("name") == "CHARGE")
    if charge != 1:
        problems.append(f"kicked once, one charge counter: {charge}")
    return outcome(problems, f"Everflowing Chalice: kicked once at {costs[1]}, one charge counter", found)


def arc_lightning():
    g = game("split", [("Mountain", 40), ("Arc Lightning", 20)])
    st = {"order": [], "split": None, "ogre": None, "bob": None, "cast": False}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or cast(g, f, "Gray Ogre")
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            ogres = g.zone(1, "battlefield", owner=2, name="Gray Ogre")
            if not st["cast"] and ogres and len(g.untapped_lands(1)) >= 3:
                o = cast(g, f, "Arc Lightning")
                if o:
                    st["cast"] = True
                    st["bob"] = g.player(1, 2).get("life")
                    return o
            return g.play_land(f)
        if seat == 1 and st["cast"] and st["split"] is None and k in ("chooseTargetsFor", "divideAsYouChoose"):
            st["order"].append(k)
            if k == "divideAsYouChoose":
                st["split"] = f
                one = next((o for o in f["options"] if o["actionId"] == "divide:1"), None)
                return one["actionId"] if one else DEFAULT
            chosen = sum(1 for x in st["order"] if x == "chooseTargetsFor") - 1
            if chosen == 0:
                return next((o["actionId"] for o in f["options"] if o.get("label") == "Bob"), DEFAULT)
            if chosen == 1:
                o = next((o for o in f["options"] if (o.get("label") or "").startswith("Gray Ogre")), None)
                st["ogre"] = o and card_of(o["actionId"])
                return o["actionId"] if o else DEFAULT
            return None  # no third target
        return DEFAULT

    def until(g):
        return st["split"] is not None and not g.state.get(1, {}).get("stack") \
            and not any(c["id"] == st["ogre"] for c in g.zone(1, "battlefield"))

    g.run(policy, until=until, max_turn=16)
    f = st["split"]
    split = ((f or {}).get("arrange") or {}).get("divide") or {}
    found = {"stopped": g.stopped_badly(), "order": st["order"], "divide": split,
             "options": f and [o["actionId"] for o in f["options"]],
             "bob": (st["bob"], g.player(1, 2).get("life")),
             "ogre_gone": st["ogre"] is not None and not any(c["id"] == st["ogre"] for c in g.zone(1, "battlefield"))}
    if not f:
        return "inconclusive", "Arc Lightning was never split between two targets", found
    problems = []
    if st["order"][:3] != ["chooseTargetsFor"] * 3 or st["order"][3:4] != ["divideAsYouChoose"]:
        problems.append(f"every target first, then the split: {st['order']}")
    targets = [t.get("object") for t in split.get("targets", [])]
    if split.get("total") != 3 or split.get("at") != 0 or targets != ["player:2", st["ogre"]]:
        problems.append(f"the whole split: total 3, at 0, Bob then the Ogre: {split}")
    if [t.get("lethal") for t in split.get("targets", [])] != [None, 2]:
        problems.append(f"the Ogre needs 2, Bob nothing: {split.get('targets')}")
    if split.get("values") != [1, 2] or [o["actionId"] for o in f["options"]] != ["divide:1", "divide:2"]:
        problems.append(f"1 or 2 to Bob, leaving 1 for the Ogre: {split.get('values')}, {found['options']}")
    if found["bob"][0] is not None and found["bob"][1] != found["bob"][0] - 1:
        problems.append(f"1 to Bob: {found['bob']}")
    if not found["ogre_gone"]:
        problems.append("2 to the Ogre: it should have died")
    return outcome(problems, "Arc Lightning: both targets, then one split question; Bob -1, the Ogre died", found)


def harnessed():
    g = game("energy", [("Mountain", 40), ("Harnessed Lightning", 20)])
    st = {"asked": None, "cast": False, "ogre": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or cast(g, f, "Gray Ogre")
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            ogres = g.zone(1, "battlefield", owner=2, name="Gray Ogre")
            if not st["cast"] and ogres and len(g.untapped_lands(1)) >= 2:
                o = cast(g, f, "Harnessed Lightning")
                if o:
                    st["cast"] = True
                    return o
            return g.play_land(f)
        if seat == 1 and k == "chooseTargetsFor" and st["cast"]:
            o = next((o for o in f["options"] if (o.get("label") or "").startswith("Gray Ogre")), None)
            st["ogre"] = o and card_of(o["actionId"])
            return o["actionId"] if o else DEFAULT
        if seat == 1 and k == "chooseNumber" and st["asked"] is None:
            st["asked"] = f
            return f["options"][-1]["actionId"]
        return DEFAULT

    def until(g):
        return st["asked"] is not None and not g.state.get(1, {}).get("stack")

    g.run(policy, until=until, max_turn=16)
    f = st["asked"]
    layout = number_layout(f or {})
    found = {"stopped": g.stopped_badly(), "about": f and f.get("about"), "layout": layout,
             "options": f and [o["actionId"] for o in f["options"]],
             "ogre_gone": st["ogre"] is not None and not any(c["id"] == st["ogre"] for c in g.zone(1, "battlefield"))}
    if not f:
        return "inconclusive", "Harnessed Lightning never asked how much energy", found
    problems = []
    if ((f.get("about") or {}).get("name")) != "Harnessed Lightning":
        problems.append(f"the question names its card: {f.get('about')}")
    if "that much" not in (layout.get("says") or ""):
        problems.append(f"the card's sentence: {layout.get('says')!r}")
    if layout.get("values") != [int(o["actionId"][7:]) for o in f["options"]]:
        problems.append(f"values are the options' numbers: {layout.get('values')}")
    if not found["ogre_gone"]:
        problems.append("3 energy paid: the Ogre should have died")
    return outcome(problems, "Harnessed Lightning: named, its sentence, 3 energy paid, the Ogre died", found)


SCENARIOS = {"x": fireball, "kicker": chalice, "split": arc_lightning, "energy": harnessed}

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
            print("  " + json.dumps(found, default=str)[:1500])
        sys.stdout.flush()
    sys.exit(1 if 1 in codes else max(codes, default=0))
