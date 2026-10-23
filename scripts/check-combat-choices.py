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

  exert-last      two Glory-Bound Initiates attack: "Exert which
                  attackers?" (exertAttackers) -- the LAST one, then Done:
                  7 damage, 4 life, and next turn that one alone stays tapped
  exert-none      the same, Done at once: 6 damage, nothing gained, both untap
  enlist-last     a Faithbonder attacks: "Enlist with which attackers?" --
                  it; the creature to tap (CostEnlist) -- the LAST at home:
                  1 + its power in damage, and only it tapped
  enlist-none     the same, none enlisted: 1 damage, nothing else tapped
  prison-pay      Ghostly Prison: a Bears attacks only if {2} is paid
                  (payCombatCost); the mana question names it -- paid: 2 damage
  prison-no       the same, passed: it does not attack

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


def exert(pick):
    """Two Glory-Bound Initiates (3/1; exerted: +1/+3 and lifelink) attack an
    empty board. "Exert which attackers?" (exertAttackers): the LAST one
    offered, then Done -- 4 + 3 damage and 4 life gained, and on seat 1's
    next turn that one is still tapped, the other untapped. Or none: 6
    damage, nothing gained."""
    g = game(f"exert-{'last' if pick else 'none'}", [("Plains", 30), ("Glory-Bound Initiate", 30)],
             [("Forest", 60)])
    st = {"attackers": [], "asked": [], "picked": None, "turn": None, "life": None,
          "combat": None, "after": None}

    def lives():
        return ((g.player(1, 1) or {}).get("life"), (g.player(1, 2) or {}).get("life"))

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "exertAttackers":
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            if pick and st["picked"] is None:
                st["picked"] = card_of(f["options"][-1]["actionId"])
                return f["options"][-1]["actionId"]
            return None
        if k == "declareAttackers" and seat == 1:
            if st["turn"] is not None and g.turn != st["turn"]:
                return None
            ready = [c["id"] for c in g.mine(1, name="Glory-Bound Initiate")
                     if not c.get("sick") and not c.get("tapped")]
            if len(ready) < 2 and not st["attackers"]:
                return None
            o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) in ready
                      and card_of(o["actionId"]) not in st["attackers"]), None)
            if o and len(st["attackers"]) < 2:
                st["attackers"].append(card_of(o))
                st["turn"], st["life"] = g.turn, st["life"] or lives()
                return o
            return None
        if seat == 1 and k == "chooseSpellAbilityToPlay" and stack_empty(g):
            return g.play_land(f) or (cast(g, f, "Glory-Bound Initiate")
                                      if len(g.mine(1, name="Glory-Bound Initiate")) < 2 else None)
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        return DEFAULT

    def until(g):
        phase = g.state.get(1, {}).get("phase")
        if st["asked"] and st["combat"] is None and g.turn == st["turn"] and phase in ("MAIN2", "END_OF_TURN"):
            st["combat"] = lives()
        if st["combat"] and st["after"] is None and g.turn >= st["turn"] + 2 and phase == "MAIN1":
            st["after"] = {c["id"]: bool(c.get("tapped")) for c in g.mine(1, name="Glory-Bound Initiate")
                           if c["id"] in st["attackers"]}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"attackers": st["attackers"], "asked": st["asked"], "picked": st["picked"],
             "life": [st["life"], st["combat"]], "tapped": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "two Initiates never attacked and reached the next turn", found
    problems = []
    seat, offered, prompt = st["asked"][0]
    if seat != 1:
        problems.append("the defending player was asked which attackers to exert")
    if offered != sorted(st["attackers"]):
        problems.append(f"offered {offered}, not exactly the attackers {st['attackers']}")
    (me0, them0), (me1, them1) = st["life"], st["combat"]
    if pick:
        if (them0 - them1, me1 - me0) != (7, 4):
            problems.append(f"one exerted: 7 damage and 4 gained, got {them0 - them1} and {me1 - me0}")
        other = [a for a in st["attackers"] if a != st["picked"]]
        if st["after"].get(st["picked"]) is not True or any(st["after"].get(a) for a in other):
            problems.append(f"next turn {st['picked']} stays tapped, {other} untaps: {st['after']}")
    else:
        if (them0 - them1, me1 - me0) != (6, 0):
            problems.append(f"none exerted: 6 damage, nothing gained, got {them0 - them1} and {me1 - me0}")
        if any(st["after"].values()):
            problems.append(f"none exerted, so both untap: {st['after']}")
    return outcome(problems, "exerted the Initiate picked: 7 damage, 4 life, and it stayed tapped" if pick
                   else "exerted none: 6 damage, both untapped", found)


def prison(pay):
    """Ghostly Prison on the defending side: a Bears attacks only if its
    player pays {2} (payCombatCost). The mana question names the attacker.
    Paid: 2 damage. Passed: it does not attack, no damage."""
    g = game(f"prison-{'pay' if pay else 'no'}", [("Forest", 30), ("Grizzly Bears", 30)],
             [("Plains", 30), ("Ghostly Prison", 30)])
    st = {"attacked": None, "prompts": [], "life": None, "turn": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        prompt = f.get("prompt") or ""
        if k == "applyManaToCost" and seat == 1 and "attack" in prompt:
            st["prompts"].append(prompt)
            return DEFAULT if pay else None
        if k == "declareAttackers" and seat == 1:
            ready = [c["id"] for c in g.mine(1, name="Grizzly Bears") if not c.get("sick") and not c.get("tapped")]
            lands = [c for c in g.mine(1, name="Forest") if not c.get("tapped")]
            prison_out = g.zone(1, "battlefield", owner=2, name="Ghostly Prison")
            if st["attacked"] or not ready or len(lands) < 2 or not prison_out:
                return None
            o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == ready[0]), None)
            if o:
                st["attacked"], st["turn"] = ready[0], g.turn
                st["life"] = (g.player(1, 2) or {}).get("life")
            return o
        if seat == 1 and k == "chooseSpellAbilityToPlay" and stack_empty(g):
            return g.play_land(f) or (None if g.mine(1, name="Grizzly Bears") else cast(g, f, "Grizzly Bears"))
        if seat == 2 and k == "chooseSpellAbilityToPlay" and stack_empty(g):
            return g.play_land(f) or (None if g.mine(2, name="Ghostly Prison") else cast(g, f, "Ghostly Prison"))
        if k == "declareBlockers":
            return None
        return DEFAULT

    def until(g):
        if st["attacked"] and st["after"] is None and g.turn == st["turn"] and \
                g.state.get(1, {}).get("phase") in ("MAIN2", "END_OF_TURN"):
            st["after"] = (g.player(1, 2) or {}).get("life")
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"attacked": st["attacked"], "prompts": st["prompts"], "life": [st["life"], st["after"]],
             "stopped": g.stopped_badly()}
    if not st["prompts"] or st["after"] is None:
        return "inconclusive", "a Bears never attacked into Ghostly Prison", found
    problems = []
    if not st["prompts"][0].startswith("Grizzly Bears attacks: pay its cost, or pass and it doesn't attack."):
        problems.append(f"the payment should name the attacker and say what passing does: {st['prompts'][0]!r}")
    lost = st["life"] - st["after"]
    if lost != (2 if pay else 0):
        problems.append(f"{'paid: 2' if pay else 'passed: no'} damage, got {lost}")
    return outcome(problems, "Ghostly Prison: paid, and the Bears hit for 2" if pay
                   else "Ghostly Prison: passed, and the Bears did not attack", found)


def enlist(pick):
    """One Benalish Faithbonder (1/3, enlist) attacks an empty board while a
    Savannah Lions and another Faithbonder stay home. "Enlist with which
    attackers?" (enlistAttackers) -- it, then Done; the creature to tap
    (CostEnlist) -- the LAST offered: the opponent loses 1 + its power, and
    only it is tapped. Or none: 1 damage, nothing else tapped."""
    g = game(f"enlist-{'last' if pick else 'none'}",
             [("Plains", 30), ("Benalish Faithbonder", 15), ("Savannah Lions", 15)], [("Forest", 60)])
    st = {"attacker": None, "asked": [], "helpers": None, "picked": None, "power": None, "turn": None,
          "life": None, "after": None}

    def ready():
        return [c for c in g.mine(1) if c.get("kind") == "creature" and not c.get("sick") and not c.get("tapped")]

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "enlistAttackers":
            st["asked"].append((seat, k, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            if pick and not any(a[1] == "enlistAttackers" for a in st["asked"][:-1]):
                return f["options"][-1]["actionId"]
            return None
        if k == "CostEnlist":
            st["asked"].append((seat, k, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            chosen = f["options"][-1]
            st["picked"] = card_of(chosen["actionId"])
            st["power"] = next((c.get("power") for c in g.mine(1) if c["id"] == st["picked"]), None)
            return chosen["actionId"]
        if k == "declareAttackers" and seat == 1:
            if st["attacker"]:
                return None
            bonders = [c["id"] for c in ready() if c.get("name") == "Benalish Faithbonder"]
            if not bonders or len(ready()) < 3:
                return None
            o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == bonders[0]), None)
            if o:
                st["attacker"], st["turn"] = bonders[0], g.turn
                st["helpers"] = sorted(c["id"] for c in ready() if c["id"] != bonders[0])
                st["life"] = (g.player(1, 2) or {}).get("life")
            return o
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay" and stack_empty(g):
            if st["attacker"]:
                return None
            land = g.play_land(f)
            if land:
                return land
            if len(g.mine(1, name="Benalish Faithbonder")) < 2:
                return cast(g, f, "Benalish Faithbonder")
            return None if g.mine(1, name="Savannah Lions") else cast(g, f, "Savannah Lions")
        return DEFAULT

    def until(g):
        if st["attacker"] and st["after"] is None and g.turn == st["turn"] and \
                g.state.get(1, {}).get("phase") in ("MAIN2", "END_OF_TURN"):
            st["after"] = {"life": (g.player(1, 2) or {}).get("life"),
                           "tapped": sorted(c["id"] for c in g.mine(1) if c.get("tapped") and c.get("kind") == "creature"
                                            and c["id"] != st["attacker"])}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"attacker": st["attacker"], "helpers": st["helpers"], "asked": st["asked"], "picked": st["picked"],
             "power": st["power"], "life": st["life"], "after": st["after"], "stopped": g.stopped_badly()}
    if not any(a[1] == "enlistAttackers" for a in st["asked"]) or not st["after"]:
        return "inconclusive", "a Faithbonder never attacked with creatures to enlist", found
    problems = []
    if any(seat != 1 for seat, _, _, _ in st["asked"]):
        problems.append("the defending player was asked about enlisting")
    first = next(a for a in st["asked"] if a[1] == "enlistAttackers")
    if first[2] != [st["attacker"]]:
        problems.append(f"offered {first[2]}, not exactly the attacking Faithbonder {st['attacker']}")
    lost = st["life"] - st["after"]["life"]
    if pick:
        cost = [a for a in st["asked"] if a[1] == "CostEnlist"]
        if not cost or cost[0][2] != st["helpers"]:
            problems.append(f"the creatures to tap should be exactly the ones at home {st['helpers']}: {cost}")
        if lost != 1 + (st["power"] or 0) or st["after"]["tapped"] != [st["picked"]]:
            problems.append(f"enlisted {st['picked']} (power {st['power']}): {1 + (st['power'] or 0)} damage and it "
                            f"alone tapped, got {lost} and {st['after']['tapped']}")
    elif lost != 1 or st["after"]["tapped"] or any(a[1] == "CostEnlist" for a in st["asked"]):
        problems.append(f"none enlisted: 1 damage, nothing else tapped, got {lost} and {st['after']['tapped']}")
    return outcome(problems, "enlisted the creature picked: its power added, and it alone tapped" if pick
                   else "enlisted none: 1 damage, nothing else tapped", found)


SCENARIOS = {"double-block": double_block, "wolf-yes": lambda: wolf(True), "wolf-no": lambda: wolf(False),
             "exert-last": lambda: exert(True), "exert-none": lambda: exert(False),
             "prison-pay": lambda: prison(True), "prison-no": lambda: prison(False),
             "enlist-last": lambda: enlist(True), "enlist-none": lambda: enlist(False)}

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
