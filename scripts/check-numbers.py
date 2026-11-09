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
  targets  Arc Lightning, Phase 9 Amendment 17: each target question
           carries arrange.targets -- chosen (in order), enough, more,
           cancel -- with the cancel answer as the last option; its words
           name the card, never "CARDNAME". With Bob and an Ogre chosen,
           cancel backs out (Arc Lightning back in hand, Bob's life and
           the lands untouched); cast again, a pass after Bob is "no
           more": Bob takes all 3.
  gempalm  spec 0058, item 3: with three Goblins out, Gempalm Incinerator's
           cycle option says "... draw a card, then deal 3 damage to a
           creature (3 Goblins)", its target window "Gempalm Incinerator
           may deal 3 damage to target creature (3 Goblins on the
           battlefield)."; the Ogre dies.
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
# The Lab's deal (protocol/README.md): seat 2's Ogre comes out on its
# third land.
OGRES_DEAL = {"hand": ["Mountain", "Mountain", "Mountain", "Gray Ogre", "Gray Ogre", "Mountain"],
              "top": ["Mountain"] * 3}


def game(name, seat1, seat2=OGRES, hand=None, top=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"numbers-{name}.jsonl")
    # The Lab's deal: the opening hand and draws each scenario's moment
    # needs, so the shuffle cannot leave it inconclusive.
    deal = {1: {"hand": hand or [], "top": top or []}}
    if seat2 is OGRES:
        deal[2] = OGRES_DEAL
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal)


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
    g = game("x", [("Mountain", 40), ("Fireball", 20)], [("Mountain", 60)],
             hand=["Mountain"] * 4 + ["Fireball"] * 3, top=["Mountain"] * 4)
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
    g = game("kicker", [("Mountain", 40), ("Everflowing Chalice", 20)], [("Mountain", 60)],
             hand=["Mountain"] * 4 + ["Everflowing Chalice"] * 3, top=["Mountain"] * 3)
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
    g = game("split", [("Mountain", 40), ("Arc Lightning", 20)],
             hand=["Mountain"] * 5 + ["Arc Lightning"] * 2, top=["Mountain"] * 4)
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


def targets():
    g = game("targets", [("Mountain", 40), ("Arc Lightning", 20)],
             hand=["Mountain"] * 4 + ["Arc Lightning"] * 3, top=["Mountain"] * 4)
    st = {"casts": 0, "asked": [], "cancelled": None, "arcs": None, "bob": None, "done": False,
          "after_cancel": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or cast(g, f, "Gray Ogre")
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            arcs = len(g.zone(1, "hand", name="Arc Lightning"))
            if st["casts"] == 1 and st["after_cancel"] is None:
                # The first question after backing out: what it left.
                st["after_cancel"] = {"arcs": arcs, "bob": g.player(1, 2).get("life"),
                                      "untapped": len(g.untapped_lands(1))}
            ogres = g.zone(1, "battlefield", owner=2, name="Gray Ogre")
            if st["casts"] < 2 and ogres and len(g.untapped_lands(1)) >= 3:
                o = cast(g, f, "Arc Lightning")
                if o:
                    st["casts"] += 1
                    if st["casts"] == 1:
                        st["arcs"], st["bob"] = arcs, g.player(1, 2).get("life")
                        st["untapped"] = len(g.untapped_lands(1))
                    return o
            return g.play_land(f)
        if seat == 1 and k == "chooseTargetsFor" and st["casts"] in (1, 2) and not st["done"]:
            t = (f.get("arrange") or {}).get("targets")
            st["asked"].append({"cast": st["casts"], "targets": t, "prompt": f.get("prompt"),
                                "last": f["options"][-1]["actionId"] if f["options"] else None})
            chosen = len((t or {}).get("chosen") or [])
            if chosen == 0:
                return next((o["actionId"] for o in f["options"] if o.get("label") == "Bob"), DEFAULT)
            if st["casts"] == 1 and chosen == 1:
                o = next((o for o in f["options"] if (o.get("label") or "").startswith("Gray Ogre")), None)
                return o["actionId"] if o else DEFAULT
            if st["casts"] == 1:
                st["cancelled"] = t
                return (t or {}).get("cancel") or DEFAULT
            st["done"] = True
            return None  # Done: no more targets, Bob takes all 3
        return DEFAULT

    def until(g):
        # Resolved: the stack is also empty while it is being paid for.
        return st["done"] and not g.state.get(1, {}).get("stack")             and g.player(1, 2).get("life") != st["bob"]

    g.run(policy, until=until, max_turn=16)
    found = {"stopped": g.stopped_badly(), "asked": st["asked"], "after_cancel": st["after_cancel"],
             "before": {"arcs": st["arcs"], "bob": st["bob"], "untapped": st.get("untapped")},
             "bob_end": g.player(1, 2).get("life")}
    if not st["done"]:
        return "inconclusive", "Arc Lightning was never cast twice with an Ogre out", found
    problems = []
    first = [a for a in st["asked"] if a["cast"] == 1]
    second = [a for a in st["asked"] if a["cast"] == 2]
    want1 = [([], False, 3), (["player:2"], True, 2), (None, True, 1)]
    for a, (chosen, enough, more) in zip(first, want1):
        t = a["targets"] or {}
        if (chosen is not None and t.get("chosen") != chosen) or t.get("enough") is not enough                 or t.get("more") != more or t.get("cancel") != "target:cancel":
            problems.append(f"cast 1 asked {t}, wanted chosen {chosen}, enough {enough}, more {more}")
        if a["last"] != "target:cancel":
            problems.append(f"the cancel answer is the last option: {a['last']}")
        if "CARDNAME" in (a["prompt"] or "") or not (a["prompt"] or "").startswith("Arc Lightning deals"):
            problems.append(f"the words name the card: {a['prompt']!r}")
    if len(first) != 3 or len((first[2]["targets"] or {}).get("chosen") or []) != 2:
        problems.append(f"Bob and the Ogre, then the cancel: {first}")
    before, after = found["before"], st["after_cancel"] or {}
    if after.get("arcs") != before["arcs"] or after.get("bob") != before["bob"]             or after.get("untapped") != before["untapped"]:
        problems.append(f"cancel backs out: Arc Lightning in hand, Bob and the lands untouched: {before} -> {after}")
    if len(second) != 2 or (second[1]["targets"] or {}).get("chosen") != ["player:2"]:
        problems.append(f"cast 2: Bob, then Done: {second}")
    if before["bob"] is not None and found["bob_end"] != before["bob"] - 3:
        problems.append(f"Done went on: Bob takes all 3 ({before['bob']} -> {found['bob_end']})")
    return outcome(problems, "Arc Lightning: chosen/enough/more/cancel each step; cancel at two backed out; "
                   "Done at one, Bob -3", found)


def harnessed():
    g = game("energy", [("Mountain", 40), ("Harnessed Lightning", 20)],
             hand=["Mountain"] * 5 + ["Harnessed Lightning"] * 2, top=["Mountain"] * 4)
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


def gempalm():
    """Spec 0058, item 3: Gempalm Incinerator's X, counted, in the menu and the target window."""
    g = game("gempalm", [("Mountain", 22), ("Goblin Piker", 20), ("Gempalm Incinerator", 18)],
             hand=["Mountain"] * 3 + ["Goblin Piker"] * 3 + ["Gempalm Incinerator"], top=["Mountain"] * 5)
    st = {"goblins": None, "line": None, "prompt": None, "cycled": False, "ogre": None, "done": False}

    def goblins(g):
        return len([c for c in g.zone(1, "battlefield") if "Goblin" in (c.get("types") or "")])

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or cast(g, f, "Gray Ogre")
        if seat != 1:
            return DEFAULT
        if k == "chooseSpellAbilityToPlay" and not g.state.get(1, {}).get("stack"):
            land = g.play_land(f)
            if land:
                return land
            ogres = g.zone(1, "battlefield", owner=2, name="Gray Ogre")
            n = goblins(g)
            cycle = next((o for o in f["options"] if (o.get("use") or {}).get("kind") == "cycling"
                          and o.get("payable") is not False), None)
            if not st["cycled"] and n >= 3 and ogres and cycle:
                st["goblins"], st["line"], st["cycled"] = n, cycle["use"].get("line"), True
                return cycle["actionId"]
            if n < 3:
                return cast(g, f, "Goblin Piker")
            return None
        if k == "confirmTrigger" and st["cycled"]:
            return next((o["actionId"] for o in f["options"] if o["actionId"].endswith("yes")),
                        f["options"][0]["actionId"] if f["options"] else None)
        if k == "chooseTargetsFor" and st["cycled"] and st["prompt"] is None:
            st["prompt"] = f.get("prompt")
            o = next((o for o in f["options"] if (o.get("label") or "").startswith("Gray Ogre")), None)
            st["ogre"] = o and card_of(o["actionId"])
            st["done"] = True
            return o["actionId"] if o else DEFAULT
        return DEFAULT

    def until(g):
        return st["done"] and not g.state.get(1, {}).get("stack") and st["ogre"] is not None             and not any(c["id"] == st["ogre"] for c in g.zone(1, "battlefield"))

    g.run(policy, until=until, max_turn=20)
    found = {k: st[k] for k in st} | {"stopped": g.stopped_badly()}
    if not st["cycled"]:
        return "inconclusive", "never had three Goblins, an Ogre and Gempalm Incinerator to cycle", found
    n = st["goblins"]
    problems = []
    want_line = (f"Discard Gempalm Incinerator and draw a card, then deal {n} damage to a creature "
                 f"({n} Goblins). You won't cast it.")
    if st["line"] != want_line:
        problems.append(f"the cycle option says the damage: {st['line']!r} (want {want_line!r})")
    want_prompt = f"Gempalm Incinerator may deal {n} damage to target creature ({n} Goblins on the battlefield)."
    if st["prompt"] != want_prompt:
        problems.append(f"the target window says the damage: {st['prompt']!r} (want {want_prompt!r})")
    if st["ogre"] is None or not until(g):
        problems.append("the Ogre should have died")
    return outcome(problems, f"Gempalm Incinerator with {n} Goblins: 'deal {n} damage ... ({n} Goblins)' in the "
                   "cycle option and the target window; the Ogre died", found)


SCENARIOS = {"x": fireball, "kicker": chalice, "split": arc_lightning, "targets": targets,
             "energy": harnessed, "gempalm": gempalm}

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
