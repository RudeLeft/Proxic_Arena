"""A cancelled cast can be cast again; one attacker or blocker can be taken back. Spec 0042.

    python -I scripts/check-take-backs.py <worker.jar> <res-root> [trace-dir] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B):

  recast        seat 1 casts a Hill Giant and passes (Cancel) at its first
                payment question: the very next "your move" still offers
                the same card, and casting it then puts it on the
                battlefield. Before spec 0042 the worker's loop guard held
                a cancelled card back until priority passed.
  attack-one    seat 1's ONE ready Grizzly Bears attacks, is taken back
                (unattack), attacks again, then seat 1 passes: the Bears
                attacks and seat 2 loses 2. Before spec 0042 the first
                attack ended the question: one attacker could not be taken
                back.
  block-one     seat 2's ONE Grizzly Bears blocks seat 1's attacker, is
                taken back (unblock), blocks again, then seat 2 passes: the
                attack is blocked and seat 2 loses nothing.

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
        trace = os.path.join(TRACES, f"take-backs-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def stack_empty(g):
    return not g.state.get(1, {}).get("stack") and not g.state.get(2, {}).get("stack")


def payable(f, o):
    return o and not any(x["actionId"] == o and x.get("payable") is False for x in f["options"])


def outcome(problems, ok, found):
    if found.get("stopped"):
        problems = problems + [found["stopped"]]
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def recast():
    g = game("recast", [("Mountain", 30), ("Hill Giant", 30)])
    st = {"card": None, "cancelled": False, "offered_after": None, "cast": False, "landed": False}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if seat != 1:
            return DEFAULT
        if k == "applyManaToCost" and st["card"] and not st["cancelled"]:
            st["cancelled"] = True
            return None  # Cancel: back out of the cast
        if k == "chooseSpellAbilityToPlay" and stack_empty(g):
            if st["cancelled"] and st["offered_after"] is None:
                ids = [card_of(o["actionId"]) for o in f["options"]]
                st["offered_after"] = st["card"] in ids
                if st["offered_after"]:
                    st["cast"] = True
                    return next(o["actionId"] for o in f["options"] if card_of(o["actionId"]) == st["card"])
            land = g.play_land(f)
            if land:
                return land
            if st["card"] is None:
                o = g.option(f, name="Hill Giant", zone="hand", land=False)
                if payable(f, o):
                    st["card"] = card_of(o)
                    return o
            return None
        return DEFAULT

    def until(g):
        if st["cast"] and stack_empty(g):
            st["landed"] = any(c["id"] == st["card"] for c in g.mine(1, name="Hill Giant"))
        return st["landed"] or st["offered_after"] is False

    g.run(policy, until=until, max_turn=16)
    found = {k: st[k] for k in st} | {"stopped": g.stopped_badly()}
    if not st["cancelled"]:
        return "inconclusive", "a Hill Giant was never cast", found
    problems = []
    if not st["offered_after"]:
        problems.append("the cancelled Hill Giant was not offered at the next question")
    elif not st["landed"]:
        problems.append("cast again after Cancel, the Hill Giant did not reach the battlefield")
    return outcome(problems, "cancelled at its payment, the Hill Giant was offered at once and cast", found)


def attack_one():
    g = game("attack-one", BEARS, [("Island", 60)])
    st = {"steps": [], "life": None, "after": None, "bears": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "declareAttackers" and seat == 1:
            ids = [o["actionId"] for o in f["options"]]
            if st["life"] is None:
                ready = [c for c in g.mine(1, name="Grizzly Bears") if not c.get("sick") and not c.get("tapped")]
                if len(ready) != 1:
                    return None
                st["bears"] = ready[0]["id"]
                st["life"] = (g.player(1, 2) or {}).get("life")
            attack, back = f"attacker:{st['bears']}", f"unattack:{st['bears']}"
            n = len(st["steps"])
            if n in (0, 2) and attack in ids:
                st["steps"].append("attack")
                return attack
            if n == 1 and back in ids:
                st["steps"].append("take back")
                return back
            if n == 3 and back in ids:
                st["steps"].append("done")
                return None
            st["steps"].append(f"unexpected: {ids}")
            return None
        if k == "chooseSpellAbilityToPlay" and seat == 1 and stack_empty(g) and st["life"] is None:
            o = g.play_land(f)
            if o:
                return o
            if not g.mine(1, name="Grizzly Bears"):
                o = g.option(f, name="Grizzly Bears", zone="hand", land=False)
                return o if payable(f, o) else None
            return None
        return DEFAULT

    def until(g):
        if "done" in st["steps"] and stack_empty(g) and g.state.get(1, {}).get("phase") in (
                "COMBAT_END", "MAIN2", "END_OF_TURN", "CLEANUP"):
            st["after"] = (g.player(1, 2) or {}).get("life")
        return st["after"] is not None or any(s.startswith("unexpected") for s in st["steps"])

    g.run(policy, until=until, max_turn=12)
    found = {k: st[k] for k in st} | {"stopped": g.stopped_badly()}
    if st["life"] is None:
        return "inconclusive", "seat 1 never had exactly one Bears ready to attack", found
    problems = []
    if st["steps"] != ["attack", "take back", "attack", "done"]:
        problems.append(f"attack, take back, attack, done was not offered in turn: {st['steps']}")
    elif st["after"] is None or st["life"] - st["after"] != 2:
        problems.append(f"the Bears attacked once confirmed, but seat 2 went {st['life']} -> {st['after']}")
    return outcome(problems, "one Bears: attacked, taken back, attacked again; confirmed, 2 damage", found)


def block_one():
    g = game("block-one", BEARS, BEARS)
    st = {"attacked": False, "steps": [], "life": None, "after": None, "blocker": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "declareAttackers" and seat == 1:
            if st["attacked"]:
                return None
            ready2 = [c for c in g.mine(2, name="Grizzly Bears") if not c.get("tapped")]
            o = next((o["actionId"] for o in f["options"] if o["actionId"].startswith("attacker:")), None)
            if o and len(ready2) == 1:
                st["attacked"] = True
                st["life"] = (g.player(1, 2) or {}).get("life")
                return o
            return None
        if k == "declareBlockers" and seat == 2 and st["attacked"]:
            ids = [o["actionId"] for o in f["options"]]
            if st["blocker"] is None:
                st["blocker"] = next((card_of(i) for i in ids if i.startswith("blocker:")), None)
            block, back = f"blocker:{st['blocker']}", f"unblock:{st['blocker']}"
            n = len(st["steps"])
            if n in (0, 2) and block in ids:
                st["steps"].append("block")
                return block
            if n == 1 and back in ids:
                st["steps"].append("take back")
                return back
            if n == 3 and back in ids:
                st["steps"].append("done")
                return None
            st["steps"].append(f"unexpected: {ids}")
            return None
        if k == "chooseSpellAbilityToPlay" and stack_empty(g) and not st["attacked"]:
            o = g.play_land(f)
            if o:
                return o
            if not g.mine(seat, name="Grizzly Bears"):
                o = g.option(f, name="Grizzly Bears", zone="hand", land=False)
                return o if payable(f, o) else None
            return None
        return DEFAULT

    def until(g):
        if "done" in st["steps"] and stack_empty(g) and g.state.get(1, {}).get("phase") in (
                "COMBAT_END", "MAIN2", "END_OF_TURN", "CLEANUP"):
            st["after"] = (g.player(1, 2) or {}).get("life")
        return st["after"] is not None or any(s.startswith("unexpected") for s in st["steps"])

    g.run(policy, until=until, max_turn=14)
    found = {k: st[k] for k in st} | {"stopped": g.stopped_badly()}
    if not st["steps"]:
        return "inconclusive", "seat 2 never had exactly one Bears to block with", found
    problems = []
    if st["steps"] != ["block", "take back", "block", "done"]:
        problems.append(f"block, take back, block, done was not offered in turn: {st['steps']}")
    elif st["after"] != st["life"]:
        problems.append(f"the attack was blocked, but seat 2 went {st['life']} -> {st['after']}")
    return outcome(problems, "one Bears: blocked, taken back, blocked again; confirmed, no damage", found)


SCENARIOS = {"recast": recast, "attack-one": attack_one, "block-one": block_one}

if __name__ == "__main__":
    codes = []
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        for _ in range(3):
            verdict_, message, found = scenario()
            if verdict_ != "inconclusive":
                break
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_])
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:1200])
        sys.stdout.flush()
    sys.exit(1 if 1 in codes else max(codes, default=0))
