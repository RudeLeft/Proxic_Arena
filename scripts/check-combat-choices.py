"""Combat damage the attacking player decides: it lands where they said. PHASE_08 P8-E.

    python -I scripts/check-combat-choices.py <worker.jar> <res-root> [trace-dir] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B):

  double-block    a Hill Giant blocked by two Grizzly Bears: its player
                  assigns the damage one point at a time
                  (assignCombatDamage) and puts every point on the LAST
                  Bears offered -- that one dies, the other is untouched
  wolf-yes        Lone Wolf, blocked: "assign its damage as though it
                  weren't blocked?" (confirmStaticApplication) -- Yes: the
                  defending player loses 2, the blocker takes nothing
  wolf-no         the same, No: the blocker takes the 2 and dies, the
                  defending player loses nothing

Only the attacking player is asked; the cross-game checks read these
traces in CI.

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
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
BEARS = [("Forest", 30), ("Grizzly Bears", 30)]


def game(name, seat1, seat2=BEARS):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"combat-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def stack_empty(g):
    return not g.state.get(1, {}).get("stack") and not g.state.get(2, {}).get("stack")


def cast(g, f, name):
    o = g.option(f, name=name, zone="hand", land=False)
    if o and any(x["actionId"] == o and x.get("payable") is False for x in f["options"]):
        return None
    return o


def outcome(problems, ok, found):
    if found.get("stopped"):
        problems = problems + [found["stopped"]]
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def bears_now(g):
    """Seat 2's Bears as SEAT 1's board shows them: the snapshot that just
    arrived is seat 1's, and seat 2's own view may not have caught up."""
    return sorted(c["id"] for c in g.zone(1, "battlefield", owner=2, name="Grizzly Bears"))


def ready(g, seat, name):
    return [c for c in g.mine(seat, name=name) if not c.get("sick") and not c.get("tapped")]


def attack(g, f, st, name, blockers_needed):
    """Seat 1 attacks once with `name`, when seat 2 has the blockers."""
    if st["attacked"] or not ready(g, 1, name) or len(ready(g, 2, "Grizzly Bears")) < blockers_needed:
        return None
    o = next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith(name)), None)
    if o:
        st["attacked"] = True
        st["life"] = (g.player(1, 2) or {}).get("life")
        st["bears_before"] = sorted(c["id"] for c in g.mine(2, name="Grizzly Bears"))
    return o


def block(g, f, st, count):
    """Seat 2 blocks with `count` Bears, one question each, then is done."""
    if not st["attacked"] or len(st["blockers"]) >= count:
        return None
    o = next((o for o in f["options"] if o["actionId"].startswith("blocker:")
              and card_of(o["actionId"]) not in st["blockers"]), None)
    if not o:
        return None
    st["blockers"].append(card_of(o["actionId"]))
    return o["actionId"]


def double_block():
    g = game("double-block", [("Mountain", 30), ("Hill Giant", 30)])
    st = {"attacked": False, "blockers": [], "asked": [], "picked": None, "after": None, "life": None,
          "bears_before": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "assignCombatDamage":
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"] if card_of(o["actionId"]))))
            st["picked"] = st["picked"] or card_of(f["options"][-1]["actionId"])
            return next(o["actionId"] for o in f["options"] if card_of(o["actionId"]) == st["picked"])
        if k == "declareAttackers":
            return attack(g, f, st, "Hill Giant", 2) if seat == 1 else None
        if k == "declareBlockers":
            return block(g, f, st, 2) if seat == 2 else None
        if k == "chooseSpellAbilityToPlay" and stack_empty(g):
            name = "Hill Giant" if seat == 1 else "Grizzly Bears"
            return g.play_land(f) or (None if st["attacked"] else cast(g, f, name))
        return DEFAULT

    def until(g):
        if st["asked"] and stack_empty(g) and st["after"] is None and g.state.get(1, {}).get("phase") in (
                "COMBAT_END", "MAIN2", "END_OF_TURN", "CLEANUP"):
            st["after"] = {"bears": bears_now(g), "grave": sorted(c["id"] for c in g.zone(1, "graveyard", owner=2))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"blockers": st["blockers"], "asked": st["asked"][:2], "points": len(st["asked"]),
             "picked": st["picked"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "the Hill Giant was never double-blocked", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the defending player was asked to assign the attacker's damage")
    if sorted(st["asked"][0][1]) != sorted(st["blockers"]):
        problems.append(f"offered {st['asked'][0][1]}, not exactly the blockers {st['blockers']}")
    if len(st["asked"]) != 3:
        problems.append(f"a 3-power attacker should be asked 3 times, one point each: {len(st['asked'])}")
    spared = [b for b in st["blockers"] if b != st["picked"]]
    after = st["after"] or {}
    if st["picked"] not in after.get("grave", []):
        problems.append(f"all 3 damage went to {st['picked']}, but it is not in the graveyard: {after}")
    if any(b not in after.get("bears", []) for b in spared):
        problems.append(f"{spared} took no damage, but did not survive: {after}")
    return outcome(problems, "the Hill Giant's player put every point on the Bears picked: that one died, the "
                             "other is untouched", found)


def wolf(yes):
    g = game(f"wolf-{'yes' if yes else 'no'}", [("Forest", 30), ("Lone Wolf", 30)])
    st = {"attacked": False, "blockers": [], "asked": [], "after": None, "life": None, "bears_before": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "confirmStaticApplication":
            st["asked"].append((seat, f.get("prompt")))
            return "confirm:yes" if yes else "confirm:no"
        if k == "declareAttackers":
            return attack(g, f, st, "Lone Wolf", 1) if seat == 1 else None
        if k == "declareBlockers":
            return block(g, f, st, 1) if seat == 2 else None
        if k == "chooseSpellAbilityToPlay" and stack_empty(g):
            name = "Lone Wolf" if seat == 1 else "Grizzly Bears"
            return g.play_land(f) or (None if st["attacked"] else cast(g, f, name))
        return DEFAULT

    def until(g):
        if st["asked"] and stack_empty(g) and st["after"] is None and g.state.get(1, {}).get("phase") in (
                "COMBAT_END", "MAIN2", "END_OF_TURN", "CLEANUP"):
            st["after"] = {"life": (g.player(1, 2) or {}).get("life"), "bears": bears_now(g)}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"blockers": st["blockers"], "asked": st["asked"], "life_before": st["life"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Lone Wolf was never blocked and asked", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the defending player was asked about Lone Wolf's damage")
    after = st["after"] or {}
    blocker = st["blockers"][0] if st["blockers"] else None
    if yes:
        if after.get("life") != (st["life"] or 0) - 2:
            problems.append(f"said Yes: the defender should lose 2, went {st['life']} -> {after.get('life')}")
        if blocker not in after.get("bears", []):
            problems.append(f"said Yes: the blocking Bears {blocker} should take nothing and live")
    else:
        if after.get("life") != st["life"]:
            problems.append(f"said No: the defender should lose nothing, went {st['life']} -> {after.get('life')}")
        if blocker in after.get("bears", []):
            problems.append(f"said No: the blocking Bears {blocker} should take 2 and die")
    return outcome(problems, "Lone Wolf: Yes, and its damage went to the player past the blocker" if yes
                   else "Lone Wolf: No, and its damage went to the blocker", found)


SCENARIOS = {"double-block": double_block, "wolf-yes": lambda: wolf(True), "wolf-no": lambda: wolf(False)}

if __name__ == "__main__":
    codes = []
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        verdict_, message, found = scenario()
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_])
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:1200])
        sys.stdout.flush()
    # A wrong answer outranks a game that never got there.
    sys.exit(1 if 1 in codes else max(codes, default=0))
