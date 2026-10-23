"""Effects that change what a card IS, read from Forge. P6-AL, §6.85.

    python -I scripts/check-text-effects.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B). The board
must show Forge's CURRENT characteristics -- never the printed ones --
in both seats' views.

  march      March of the Machines: a Mind Stone (an artifact, mana
             value 2) becomes a 2/2 artifact creature
  mind-bend  Mind Bend: the player chooses "change a basic land type",
             then Forest -> Island; Shanodin Dryads' forestwalk becomes
             islandwalk
  mind-bend-colour
             Mind Bend, "change a colour word" (Phase 8: chooseColor):
             black, then the LAST colour offered; White Knight's
             protection from black becomes protection from that colour

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its card.
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


def game(name, seat1, seat2=BEARS):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"text-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def cast(g, frame, name):
    return g.option(frame, name=name, zone="hand", land=False)


def pick(frame, text):
    return next((o["actionId"] for o in frame.get("options", []) if text in (o.get("label") or "")), None)


def seen(g, card_id):
    """The card as each seat's board shows it."""
    return {seat: next((c for c in g.state.get(seat, {}).get("battlefield", []) if c.get("id") == card_id), None)
            for seat in (1, 2)}


def shape(c):
    return c and {k: c.get(k) for k in ("kind", "types", "power", "toughness", "keywords")}


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def march():
    g = game("march", [("Island", 26), ("March of the Machines", 14), ("Mind Stone", 20)])
    st = {"stone": None, "before": None, "cast": False}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return DEFAULT
        if f.get("kind") == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            stones = g.mine(1, name="Mind Stone")
            if not stones:
                return cast(g, f, "Mind Stone")
            if not st["cast"] and len(g.untapped_lands(1)) >= 4:
                o = cast(g, f, "March of the Machines")
                if o:
                    st["stone"] = stones[0]["id"]
                    st["before"] = shape(stones[0])
                    st["cast"] = True
                    return o
            return None
        return DEFAULT

    # Each seat's board arrives as its own frame: wait for both to show
    # March, or the second is read before it has been sent.
    g.run(policy, until=lambda g: st["cast"] and not g.state.get(1, {}).get("stack") and all(
        g.zone(seat, "battlefield", owner=1, name="March of the Machines") for seat in (1, 2)), max_turn=24)
    now = seen(g, st["stone"]) if st["stone"] else {}
    found = {"before": st["before"], "after": {s: shape(c) for s, c in now.items()}, "stopped": g.stopped_badly()}
    if not st["cast"] or not g.mine(1, name="March of the Machines"):
        return "inconclusive", "never had a Mind Stone and four Islands for March", found
    problems = [found["stopped"]] if found["stopped"] else []
    if (st["before"] or {}).get("kind") == "creature":
        problems.append(f"Mind Stone is not a creature before March: {st['before']}")
    for seat, c in found["after"].items():
        if not c:
            problems.append(f"seat {seat} cannot see the Mind Stone")
            continue
        if c["kind"] != "creature" or "Creature" not in str(c["types"]) or (c["power"], c["toughness"]) != (2, 2):
            problems.append(f"seat {seat}: Mind Stone should be a 2/2 artifact creature: {c}")
    return result(problems, "Mind Stone (mana value 2) shown as a 2/2 artifact creature to both players", found)


def mind_bend():
    g = game("mind-bend", [("Island", 30), ("Mind Bend", 30)], [("Forest", 30), ("Shanodin Dryads", 30)])
    st = {"dryad": None, "before": None, "asked": [], "cast": False}

    def policy(g, f):
        kind = f.get("kind")
        if f["authorisedSeat"] == 2:
            if kind == "chooseSpellAbilityToPlay":
                return g.play_land(f) or (None if g.mine(2, name="Shanodin Dryads")
                                          else g.option(f, name="Shanodin Dryads", zone="hand", land=False))
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            dryads = g.zone(1, "battlefield", owner=2, name="Shanodin Dryads")
            if dryads and not st["cast"] and g.untapped_lands(1):
                o = cast(g, f, "Mind Bend")
                if o:
                    st["cast"], st["dryad"], st["before"] = True, dryads[0]["id"], shape(dryads[0])
                    return o
            return None
        if not st["cast"]:
            return DEFAULT
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == st["dryad"]), None)
        if kind == "chooseSpellAbilitiesForEffect":
            st["asked"].append((kind, [o.get("label") for o in f["options"]]))
            return pick(f, "type")
        if kind in ("chooseSomeType", "chooseColor"):
            prompt = f.get("prompt") or ""
            st["asked"].append((kind, prompt, len(f["options"])))
            if kind == "chooseSomeType" and "replace" not in prompt and "new" not in prompt:
                st["asked"].append(("ambiguous", prompt))
            want = "Island" if "new" in prompt.lower() else "Forest"
            return next((o["actionId"] for o in f["options"] if o.get("label") == want), DEFAULT)
        return DEFAULT

    g.run(policy, until=lambda g: st["cast"] and not g.state.get(1, {}).get("stack") and all(
        g.zone(seat, "graveyard", owner=1, name="Mind Bend") for seat in (1, 2)), max_turn=16)
    now = seen(g, st["dryad"]) if st["dryad"] else {}
    found = {"before": st["before"], "after": {s: shape(c) for s, c in now.items()}, "asked": st["asked"],
             "stopped": g.stopped_badly()}
    if not st["cast"] or not g.zone(1, "graveyard", owner=1, name="Mind Bend"):
        return "inconclusive", "never cast Mind Bend at Shanodin Dryads", found
    problems = [found["stopped"]] if found["stopped"] else []
    if "Forestwalk" not in str((st["before"] or {}).get("keywords")):
        problems.append(f"Shanodin Dryads should start with forestwalk: {st['before']}")
    if any(a[0] == "ambiguous" for a in st["asked"]):
        problems.append(f"the two land-type questions must say which is the old word and which the new: {st['asked']}")
    if not any(a[0] == "chooseSpellAbilitiesForEffect" and len(a[1]) == 2 for a in st["asked"]):
        problems.append(f"colour word or land type should be the player's choice: {st['asked']}")
    for seat, c in found["after"].items():
        kw = str((c or {}).get("keywords"))
        if "Islandwalk" not in kw or "Forestwalk" in kw:
            problems.append(f"seat {seat}: forestwalk should now read islandwalk: {c}")
    return result(problems, "the player chose a land type, Forest -> Island; Shanodin Dryads shows "
                            "islandwalk, not forestwalk, to both players", found)


def mind_bend_colour():
    g = game("mind-bend-colour", [("Island", 30), ("Mind Bend", 30)], [("Plains", 30), ("White Knight", 30)])
    st = {"knight": None, "before": None, "asked": [], "cast": False, "new": None}

    def policy(g, f):
        kind = f.get("kind")
        if f["authorisedSeat"] == 2:
            if kind == "chooseSpellAbilityToPlay":
                return g.play_land(f) or (None if g.mine(2, name="White Knight")
                                          else g.option(f, name="White Knight", zone="hand", land=False))
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            knights = g.zone(1, "battlefield", owner=2, name="White Knight")
            if knights and not st["cast"] and g.untapped_lands(1):
                o = cast(g, f, "Mind Bend")
                if o:
                    st["cast"], st["knight"], st["before"] = True, knights[0]["id"], shape(knights[0])
                    return o
            return None
        if not st["cast"]:
            return DEFAULT
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == st["knight"]), None)
        if kind == "chooseSpellAbilitiesForEffect":
            st["asked"].append((kind, [o.get("label") for o in f["options"]]))
            return next((o["actionId"] for o in f["options"] if "olor" in (o.get("label") or "")), None)
        if kind == "chooseColor":
            labels = [o.get("label") or "" for o in f["options"]]
            st["asked"].append((kind, f.get("prompt"), labels))
            if st["asked"] and sum(1 for a in st["asked"] if a[0] == "chooseColor") == 1:
                return next((o["actionId"] for o in f["options"] if (o.get("label") or "").lower() == "black"), DEFAULT)
            st["new"] = labels[-1]
            return f["options"][-1]["actionId"]
        return DEFAULT

    g.run(policy, until=lambda g: st["cast"] and not g.state.get(1, {}).get("stack") and all(
        g.zone(seat, "graveyard", owner=1, name="Mind Bend") for seat in (1, 2)), max_turn=16)
    now = seen(g, st["knight"]) if st["knight"] else {}
    found = {"before": st["before"], "after": {s: shape(c) for s, c in now.items()}, "asked": st["asked"],
             "stopped": g.stopped_badly()}
    if not st["cast"] or not g.zone(1, "graveyard", owner=1, name="Mind Bend"):
        return "inconclusive", "never cast Mind Bend at White Knight", found
    problems = [found["stopped"]] if found["stopped"] else []
    colours = [a for a in st["asked"] if a[0] == "chooseColor"]
    if len(colours) != 2:
        problems.append(f"expected the old colour word, then the new: {colours}")
    elif len(colours[1][2]) < 2:
        problems.append(f"the new colour was no choice: {colours[1][2]}")
    if "Protection from black" not in ((st["before"] or {}).get("keywords") or []):
        problems.append(f"White Knight should start with protection from black: {st['before']}")
    # Exactly these words: the board once showed "Protection from from black".
    want = f"Protection from {(st['new'] or '?').lower()}"
    for seat, c in found["after"].items():
        protections = [k for k in (c or {}).get("keywords") or [] if k.startswith("Protection")]
        if protections != [want]:
            problems.append(f"seat {seat}: protection from black should now read {want!r}: {protections}")
    return result(problems, f"the player changed black to {st['new']}; White Knight shows {want} to both "
                            "players", found)


SCENARIOS = {"march": march, "mind-bend": mind_bend, "mind-bend-colour": mind_bend_colour}

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
            print("  " + json.dumps(found, default=str)[:1500])
        sys.stdout.flush()
    sys.exit(worst)
