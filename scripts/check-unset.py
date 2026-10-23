"""Un-set questions: the answer is what happens. PHASE_08 P8-I, Amendment 1.

    python -I scripts/check-unset.py <worker.jar> <res-root> [trace-dir] [scenario...]

Phase 8 Amendment 1 (owner, 2026-10-23): every Un-set question is built.
Each scenario is its own small game (Mechanics Lab, Layer B):

  sector      Space Beleren ("space sculptor"): each creature is assigned a
              sector by its controller (chooseSector) -- the first Lions to
              Gamma, the second to Alpha; then Beleren's -1 picks Gamma: a
              +1/+1 counter on the Gamma Lions only

  crank-yes   Wrench-Rigger assembles a Goblin Slingshot from the contraption
              deck (sorted there by card type) onto sprocket 3, the LAST
              (chooseSprocket); when sprocket 3 cranks it is offered
              (chooseContraptionsToCrank) and cranked: +2/+0
  crank-no    the same, not cranked: no bonus

The dice questions Un-set cards reach are in check-dice.py.

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
LANDS_ONLY = [("Forest", 60)]


def game(name, seat1, seat2=LANDS_ONLY):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"unset-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


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


def sector():
    g = game("sector", [("Plains", 16), ("Island", 16), ("Space Beleren", 12), ("Savannah Lions", 16)])
    st = {"assigned": {}, "asked": [], "used": False, "picked": None, "turn": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        prompt = f.get("prompt") or ""
        if k == "chooseSector":
            labels = [o.get("label") for o in f["options"]]
            st["asked"].append((seat, labels, prompt))
            if prompt.startswith("Assign "):
                lions = [c["id"] for c in g.mine(1, name="Savannah Lions") if c["id"] not in st["assigned"]]
                want = "Gamma" if not st["assigned"] else "Alpha"
                if lions:
                    st["assigned"][lions[0]] = want
                return next(o["actionId"] for o in f["options"] if o.get("label") == want)
            st["picked"] = "Gamma"
            return next(o["actionId"] for o in f["options"] if o.get("label") == "Gamma")
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            beleren = g.mine(1, name="Space Beleren")
            if not st["used"] and beleren and len(st["assigned"]) >= 2:
                o = g.option(f, name="Space Beleren", zone="battlefield", contains="sector of your choice")
                if o:
                    st["used"], st["turn"] = True, g.turn
                    return o
            land = g.play_land(f)
            if land:
                return land
            if st["used"]:
                return None
            if len(g.mine(1, name="Savannah Lions")) < 2:
                o = cast(g, f, "Savannah Lions")
                if o:
                    return o
            return None if beleren else cast(g, f, "Space Beleren")
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        if st["picked"] and stack_empty(g) and st["after"] is None:
            st["after"] = {c["id"]: {k["name"]: k["count"] for k in c.get("counters", []) or []}
                           for c in g.mine(1, name="Savannah Lions")}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"assigned": st["assigned"], "asked": st["asked"][:4], "picked": st["picked"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["picked"] or not st["after"]:
        return "inconclusive", "Space Beleren never chose a sector with two Lions assigned", found
    problems = []
    if any(seat != 1 for seat, _, _ in st["asked"]):
        problems.append("the opponent was asked about seat 1's sectors")
    if any(labels != ["Alpha", "Beta", "Gamma"] for _, labels, _ in st["asked"]):
        problems.append(f"one answer per sector: {st['asked']}")
    if not any(p.startswith("Assign Savannah Lions to a sector") for _, _, p in st["asked"]):
        problems.append(f"the assignment names the creature: {[p for _, _, p in st['asked']]}")
    for cid, where in st["assigned"].items():
        got = (st["after"].get(cid) or {}).get("P1P1")
        if where == "Gamma" and got != 1:
            problems.append(f"{cid} is in Gamma: one +1/+1 counter, got {st['after'].get(cid)}")
        if where != "Gamma" and got:
            problems.append(f"{cid} is in {where}: no counter, got {st['after'].get(cid)}")
    return outcome(problems, "Space Beleren: the Lions in Gamma got the counter, the one in Alpha did not", found)


def contraption(crank):
    """Wrench-Rigger assembles a Contraption from seat 1's contraption deck
    -- fifteen Goblin Slingshots, put there by card type (Phase 8
    Amendment 3) -- onto a sprocket (chooseSprocket): 3, the LAST. The
    crank question then comes on a turn whose sprocket is 3
    (chooseContraptionsToCrank). Cranked: creatures get +2/+0. Not: no
    bonus."""
    g = game(f"crank-{'yes' if crank else 'no'}",
             [("Mountain", 30), ("Wrench-Rigger", 30), ("Goblin Slingshot", 15)])
    st = {"sprocket": [], "crank": [], "rigger": None, "before": None, "after": None, "turn": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseSprocket":
            st["sprocket"].append((seat, [o.get("label") for o in f["options"]], f.get("prompt")))
            return f["options"][-1]["actionId"]
        if k == "chooseContraptionsToCrank":
            st["crank"].append((seat, len(f["options"]), f.get("prompt")))
            rigger = next((c for c in g.mine(1) if c["id"] == st["rigger"]), {})
            st["before"], st["turn"] = rigger.get("power"), g.turn
            return f["options"][0]["actionId"] if crank and len(st["crank"]) == 1 else None
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if st["rigger"] is None:
                o = cast(g, f, "Wrench-Rigger")
                if o:
                    st["rigger"] = card_of(o)
                return o
            return None
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        if st["crank"] and st["after"] is None and stack_empty(g) and g.turn == st["turn"] and                 g.state.get(1, {}).get("phase") in ("MAIN1", "MAIN2", "END_OF_TURN"):
            rigger = next((c for c in g.mine(1) if c["id"] == st["rigger"]), {})
            st["after"] = rigger.get("power")
        return st["after"] is not None

    # Sprocket 3 cranks every third turn of seat 1's: room for a late Rigger.
    g.run(policy, until=until, max_turn=30)
    found = {"sprocket": st["sprocket"], "crank": st["crank"], "power": [st["before"], st["after"]],
             "stopped": g.stopped_badly()}
    if not st["sprocket"] or not st["crank"] or st["after"] is None:
        return "inconclusive", "a Contraption was never assembled and then offered for cranking", found
    problems = []
    seat, labels, prompt = st["sprocket"][0]
    if seat != 1 or [l.split(" ")[1] for l in labels] != ["1", "2", "3"] or             not prompt.startswith("Assemble Goblin Slingshot onto a sprocket"):
        problems.append(f"seat 1 assembles the Slingshot onto sprocket 1, 2 or 3: {st['sprocket'][0]}")
    if not st["crank"][0][2].startswith("Crank which Contraptions on sprocket 3?"):
        problems.append(f"it was put on sprocket 3, so it is offered when sprocket 3 cranks: {st['crank'][0]}")
    gained = (st["after"] or 0) - (st["before"] or 0)
    if crank and gained != 2:
        problems.append(f"cranked Goblin Slingshot: +2/+0, got {st['before']} -> {st['after']}")
    if not crank and gained:
        problems.append(f"not cranked: no bonus, got {st['before']} -> {st['after']}")
    return outcome(problems, "Goblin Slingshot on sprocket 3, cranked when sprocket 3 came: +2/+0" if crank
                   else "Goblin Slingshot on sprocket 3, not cranked: no bonus", found)


SCENARIOS = {"sector": sector, "crank-yes": lambda: contraption(True), "crank-no": lambda: contraption(False)}

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
