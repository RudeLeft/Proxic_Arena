"""Costs built in Phase 8: what the player picks is what pays. PHASE_08 P8-F.

    python -I scripts/check-cost-kinds.py <worker.jar> <res-root> [trace-dir] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B), answers
with options no default would take, and checks the board:

  tap-two     Diversionary Tactics, "tap two untapped creatures you
              control" (CostTapType): three Lions offered, the LAST two
              picked are the two tapped, the third stays untapped; the
              target is tapped
  atoll-pay   Coral Atoll enters (chooseCardsForCost): the LAST untapped
              Island offered goes back to hand, and the Atoll stays; the
              question says what it takes, with the number filled in
  atoll-no    the same, declined: the Atoll is sacrificed
  chalice     Everflowing Chalice, multikicker (chooseNumberForKeywordCost):
              kicked twice -- two charge counters
  offspring-yes  Rust-Shield Rampager, offspring (the same question, yes or
              no): a 1/1 token copy enters
  offspring-no   the same, no: no token
  gush        Gush instead of its mana (CostReturn): the two Islands picked
              (the LAST each time) go back to hand, the third stays
  crew        Smuggler's Copter, crew 1 (CostTapType, total power): the
              LAST Lion offered crews it, then Done -- that Lion is tapped,
              the others are not, and the Copter is a creature

Only the paying player is asked; the cross-game checks read these traces
in CI.

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
BASICS = {"Plains", "Island", "Swamp", "Mountain", "Forest"}


class LandKeeper(Game):
    """Discards down to hand size from the spells, keeping the lands."""

    def default(self, frame):
        if frame.get("kind") == "chooseCardsToDiscardToMaximumHandSize":
            spare = [o for o in frame.get("options", []) if (o.get("label") or "") not in BASICS]
            if spare:
                return spare[0]["actionId"]
        return super().default(frame)


def game(name, seat1, seat2=BEARS):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"cost-{name}.jsonl")
    return LandKeeper(seat1, seat2, jar=JAR, res=RES, trace=trace)


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


def lions(g):
    return {c["id"]: c for c in g.mine(1, name="Savannah Lions")}


def tap_two():
    g = game("tap-two", [("Plains", 30), ("Savannah Lions", 18), ("Diversionary Tactics", 12)])
    st = {"used": False, "asked": [], "picked": [], "target": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostTapType":
            offered = [card_of(o["actionId"]) for o in f["options"] if card_of(o["actionId"])]
            st["asked"].append((seat, sorted(offered), f.get("prompt")))
            pick = f["options"][-1]["actionId"]
            st["picked"].append(card_of(pick))
            return pick
        if k == "chooseTargetsFor" and seat == 1 and st["used"]:
            o = next((o for o in f["options"] if (o.get("label") or "").startswith("Grizzly Bears")), None)
            st["target"] = o and card_of(o["actionId"])
            return o["actionId"] if o else DEFAULT
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or (cast(g, f, "Grizzly Bears") if stack_empty(g) else None)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            ready = [c for c in lions(g).values() if not c.get("tapped")]
            bears = [c for c in g.zone(1, "battlefield", owner=2, name="Grizzly Bears") if not c.get("tapped")]
            if not st["used"] and len(ready) >= 3 and bears and g.mine(1, name="Diversionary Tactics"):
                o = g.option(f, name="Diversionary Tactics", zone="battlefield")
                if o:
                    st["used"], st["before"] = True, sorted(c["id"] for c in ready)
                    return o
            land = g.play_land(f)
            if land:
                return land
            if not g.mine(1, name="Diversionary Tactics") and len(lions(g)) >= 3:
                o = cast(g, f, "Diversionary Tactics")
                if o:
                    return o
            return cast(g, f, "Savannah Lions") if len(lions(g)) < 3 else None
        return DEFAULT

    def until(g):
        if len(st["picked"]) >= 2 and stack_empty(g) and st["after"] is None:
            st["after"] = {"tapped": sorted(cid for cid, c in lions(g).items() if c.get("tapped")),
                           "untapped": sorted(cid for cid, c in lions(g).items() if not c.get("tapped")),
                           "target_tapped": any(c["id"] == st["target"] and c.get("tapped")
                                                for c in g.zone(1, "battlefield", owner=2))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"asked": st["asked"], "picked": st["picked"], "target": st["target"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if len(st["picked"]) < 2:
        return "inconclusive", "Diversionary Tactics' tap cost was never asked twice", found
    problems = []
    if any(seat != 1 for seat, _, _ in st["asked"]):
        problems.append("the opponent was asked to pay seat 1's cost")
    if len(st["asked"][0][1]) < 3:
        problems.append(f"three untapped Lions should be offered: {st['asked'][0][1]}")
    after = st["after"]
    if sorted(st["picked"]) != after["tapped"]:
        problems.append(f"picked {sorted(st['picked'])} to tap, but tapped are {after['tapped']}")
    if not after["untapped"]:
        problems.append("the Lion not picked should stay untapped")
    if not after["target_tapped"]:
        problems.append(f"the target Bears {st['target']} should be tapped")
    return outcome(problems, "Diversionary Tactics: the two Lions picked paid the cost, the third stayed untapped, "
                             "and the target was tapped", found)


def crew():
    g = game("crew", [("Plains", 30), ("Savannah Lions", 18), ("Smuggler's Copter", 12)])
    st = {"used": False, "asked": [], "picked": None, "copter": None, "after": None, "turn": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostTapType":
            labels = [o.get("label") for o in f["options"]]
            st["asked"].append((seat, labels, f.get("prompt")))
            if st["picked"] is None:
                lion = [o for o in f["options"] if card_of(o["actionId"])][-1]
                st["picked"] = card_of(lion["actionId"])
                return lion["actionId"]
            return "cost:done"
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            copters = g.mine(1, name="Smuggler's Copter")
            ready = [c for c in lions(g).values() if not c.get("tapped")]
            if not st["used"] and copters and len(ready) >= 2:
                o = g.option(f, name="Smuggler's Copter", zone="battlefield", contains="Crew")
                if o:
                    st["used"], st["copter"], st["turn"] = True, copters[0]["id"], g.turn
                    return o
            land = g.play_land(f)
            if land:
                return land
            if not copters and cast(g, f, "Smuggler's Copter"):
                return cast(g, f, "Smuggler's Copter")
            return cast(g, f, "Savannah Lions") if len(lions(g)) < 2 else None
        return DEFAULT

    def until(g):
        # Crew's cost is paid before the ability is on the stack: wait for
        # the Copter to become a creature, or for the turn to move on.
        copter = next((c for c in g.mine(1) if c["id"] == st["copter"]), {})
        done = copter.get("kind") == "creature" or (st["turn"] is not None and g.turn > st["turn"])
        if st["picked"] and done and stack_empty(g) and st["after"] is None:
            st["after"] = {"tapped": sorted(cid for cid, c in lions(g).items() if c.get("tapped")),
                           "copter": copter.get("kind")}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"asked": st["asked"][:3], "picked": st["picked"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["picked"]:
        return "inconclusive", "Smuggler's Copter was never crewed", found
    problems = []
    if any(seat != 1 for seat, _, _ in st["asked"]):
        problems.append("the opponent was asked to crew seat 1's Copter")
    if len(st["asked"]) < 2 or "Done" not in st["asked"][1][1]:
        problems.append(f"after one Lion (power 2 >= 1) the crew should offer Done: {st['asked'][:2]}")
    if st["after"]["tapped"] != [st["picked"]]:
        problems.append(f"crewed with {st['picked']}, but tapped are {st['after']['tapped']}")
    if st["after"]["copter"] != "creature":
        problems.append(f"the crewed Copter should be a creature: {st['after']['copter']}")
    return outcome(problems, "Smuggler's Copter: crewed by the Lion picked, which alone is tapped; the Copter is a "
                             "creature", found)


def atoll(pay):
    """Coral Atoll enters: return an untapped Island you control, or it is
    sacrificed (chooseCardsForCost, optional)."""
    g = game(f"atoll-{'pay' if pay else 'no'}", [("Island", 40), ("Coral Atoll", 20)])
    st = {"atoll": None, "asked": [], "picked": None, "islands": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseCardsForCost":
            offered = sorted(card_of(o["actionId"]) for o in f["options"])
            st["asked"].append((seat, offered, f.get("prompt")))
            if not pay:
                return None
            st["picked"] = card_of(f["options"][-1]["actionId"])
            return f["options"][-1]["actionId"]
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            untapped = [c for c in g.mine(1, name="Island") if not c.get("tapped")]
            if st["atoll"] is None and len(untapped) >= 2:
                o = g.option(f, name="Coral Atoll", land=True)
                if o:
                    st["atoll"], st["islands"] = card_of(o), sorted(c["id"] for c in untapped)
                    return o
            return g.option(f, name="Island", land=True)
        return DEFAULT

    def until(g):
        if st["asked"] and stack_empty(g) and st["after"] is None:
            st["after"] = {"atoll": any(c["id"] == st["atoll"] for c in g.mine(1)),
                           "atoll_grave": any(c["id"] == st["atoll"] for c in g.zone(1, "graveyard", owner=1)),
                           "hand": [c["id"] for c in g.zone(1, "hand")],
                           "islands": sorted(c["id"] for c in g.mine(1, name="Island"))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=12)
    found = {"asked": st["asked"], "picked": st["picked"], "islands_before": st["islands"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Coral Atoll's return cost was never asked", found
    problems = []
    seat, offered, prompt = st["asked"][0]
    if seat != 1:
        problems.append("the opponent was asked to pay seat 1's Coral Atoll")
    if offered != st["islands"]:
        problems.append(f"offered {offered}, not exactly the untapped Islands {st['islands']}")
    if "%d" in (prompt or "") or "Island" not in (prompt or ""):
        problems.append(f"the question should say what it takes, filled in: {prompt!r}")
    after = st["after"]
    if pay:
        if not after["atoll"] or st["picked"] not in after["hand"] or st["picked"] in after["islands"]:
            problems.append(f"returned {st['picked']}: it should be in hand and the Atoll kept: {after}")
    elif after["atoll"] or not after["atoll_grave"]:
        problems.append(f"declined: Coral Atoll should be sacrificed: {after}")
    return outcome(problems, "Coral Atoll: the Island picked went back to hand, and the Atoll stayed" if pay
                   else "Coral Atoll: declined, and the Atoll was sacrificed", found)


def counters_of(c):
    return {k["name"]: k["count"] for k in (c or {}).get("counters", []) or []}


def chalice():
    """Everflowing Chalice, multikicker {2}: kicked twice (not the first
    count offered, 0), it enters with two charge counters."""
    g = game("chalice", [("Plains", 40), ("Everflowing Chalice", 20)])
    st = {"cast": None, "asked": [], "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseNumberForKeywordCost":
            ids = [o["actionId"] for o in f["options"]]
            st["asked"].append((seat, ids, f.get("prompt")))
            return "number:2" if "number:2" in ids else DEFAULT
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if st["cast"] is None and len(g.untapped_lands(1)) >= 4:
                o = cast(g, f, "Everflowing Chalice")
                if o:
                    st["cast"] = card_of(o)
                    return o
            return None
        return DEFAULT

    def until(g):
        chalice = next((c for c in g.mine(1) if c["id"] == st["cast"]), None)
        if st["asked"] and chalice and stack_empty(g) and st["after"] is None:
            st["after"] = counters_of(chalice)
        return st["after"] is not None

    g.run(policy, until=until, max_turn=14)
    found = {"asked": st["asked"], "counters": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Everflowing Chalice never asked how many times to kick", found
    problems = []
    seat, ids, _ = st["asked"][0]
    if seat != 1:
        problems.append("the opponent was asked about seat 1's multikicker")
    if ids[0] != "number:0" or "number:2" not in ids:
        problems.append(f"0 first, 2 among the counts: {ids}")
    if (st["after"] or {}).get("CHARGE") != 2:
        problems.append(f"kicked twice, so two charge counters: {st['after']}")
    return outcome(problems, "Everflowing Chalice: kicked twice, and it entered with two charge counters", found)


def offspring(yes):
    """Rust-Shield Rampager, offspring {2}: yes or no (Forge's addKeywordCost,
    max 1) -- yes makes a 1/1 token copy when it enters."""
    g = game(f"offspring-{'yes' if yes else 'no'}", [("Forest", 36), ("Rust-Shield Rampager", 24)])
    st = {"cast": None, "asked": [], "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseNumberForKeywordCost":
            st["asked"].append((seat, [o.get("label") for o in f["options"]]))
            return "confirm:yes" if yes else "confirm:no"
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if st["cast"] is None and len(g.untapped_lands(1)) >= 6:
                o = cast(g, f, "Rust-Shield Rampager")
                if o:
                    st["cast"] = card_of(o)
                    return o
            return None
        return DEFAULT

    def until(g):
        landed = any(c["id"] == st["cast"] for c in g.mine(1))
        if st["asked"] and landed and stack_empty(g) and st["after"] is None:
            st["after"] = [(c["id"], c.get("power"), c.get("toughness")) for c in g.mine(1, name="Rust-Shield Rampager")
                           if c.get("token")]
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {"asked": st["asked"], "tokens": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Rust-Shield Rampager never asked about offspring", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the opponent was asked about seat 1's offspring")
    tokens = st["after"] or []
    if yes and [(p, t) for _, p, t in tokens] != [(1, 1)]:
        problems.append(f"offspring paid: one 1/1 token copy, got {tokens}")
    if not yes and tokens:
        problems.append(f"offspring not paid: no token, got {tokens}")
    return outcome(problems, "offspring paid, and a 1/1 token copy entered" if yes
                   else "offspring not paid, and no token", found)


def gush():
    """Gush instead of its mana: return two Islands you control (CostReturn).
    Three Islands out; the LAST offered each time go back to hand, the
    third stays; Gush draws two."""
    g = game("gush", [("Island", 36), ("Gush", 24)])
    st = {"cast": None, "asked": [], "picked": [], "islands": None, "hand": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostReturn":
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            st["picked"].append(card_of(f["options"][-1]["actionId"]))
            return f["options"][-1]["actionId"]
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            islands = g.mine(1, name="Island")
            if st["cast"] is None and len(islands) >= 3:
                alt = [o for o in f["options"] if (o.get("label") or "").startswith("Gush")
                       and "return two Islands" in (o.get("label") or "")]
                if alt:
                    st["cast"] = card_of(alt[0]["actionId"])
                    st["islands"] = sorted(c["id"] for c in islands)
                    st["hand"] = len(g.zone(1, "hand"))
                    return alt[0]["actionId"]
            return g.play_land(f)
        return DEFAULT

    def until(g):
        resolved = st["cast"] and any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if len(st["picked"]) >= 2 and resolved and stack_empty(g) and st["after"] is None:
            st["after"] = {"islands": sorted(c["id"] for c in g.mine(1, name="Island")),
                           "hand": [c["id"] for c in g.zone(1, "hand")]}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=12)
    found = {"asked": st["asked"], "picked": st["picked"], "islands_before": st["islands"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if len(st["picked"]) < 2 or not st["after"]:
        return "inconclusive", "Gush's return cost was never asked twice", found
    problems = []
    if any(seat != 1 for seat, _, _ in st["asked"]):
        problems.append("the opponent was asked to pay seat 1's Gush")
    if st["asked"][0][1] != st["islands"]:
        problems.append(f"offered {st['asked'][0][1]}, not exactly the Islands {st['islands']}")
    if "two Islands" not in (st["asked"][0][2] or ""):
        problems.append(f"the question should say what it takes: {st['asked'][0][2]!r}")
    after = st["after"]
    if any(i not in after["hand"] or i in after["islands"] for i in st["picked"]):
        problems.append(f"returned {st['picked']}: both should be in hand, off the battlefield: {after}")
    kept = [i for i in st["islands"] if i not in st["picked"]]
    if any(i not in after["islands"] for i in kept):
        problems.append(f"{kept} were not picked and should stay on the battlefield")
    # Gush left the hand (-1), two Islands came back (+2), two cards drawn (+2).
    if len(after["hand"]) != st["hand"] - 1 + 2 + 2:
        problems.append(f"hand {st['hand']} -> {len(after['hand'])}: Gush, two Islands back, two drawn")
    return outcome(problems, "Gush: the two Islands picked went back to hand, the third stayed, and two cards "
                             "were drawn", found)


SCENARIOS = {"tap-two": tap_two, "crew": crew, "atoll-pay": lambda: atoll(True), "atoll-no": lambda: atoll(False),
             "chalice": chalice, "offspring-yes": lambda: offspring(True), "offspring-no": lambda: offspring(False),
             "gush": gush}

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
    sys.exit(1 if 1 in codes else max(codes, default=0))
