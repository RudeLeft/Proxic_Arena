"""Spec 0070, Amendment 1: the "seen" eye, both ways, and nothing more.

    python -I scripts/check-seen-hands.py <worker.jar> <res-root> [trace] [scenario...]

  duress    Alice (seat 1) casts Duress at Bob (seat 2) on turn 1: Forge
            reveals Bob's hand to Alice (nothing for Duress to take: lands
            and creatures). Then Bob plays lands and a revealed Grizzly
            Bears, and draws; Alice Unsummons that Bears back to his hand
            (the same card id, back in the hand: NOT seen this time). Round
            by round, both seats' boards:

  F-0070-H  Alice's otherHands holds exactly Bob's revealed cards that are
            STILL in his hand, face up and `seen`; never a card Bob drew
            after the reveal; never a revealed card once it has left his
            hand (a Forest played, the Bears cast) -- not in that round, not
            in any later one
  F-0070-G  Bob's own hand marks `seen` on exactly those same cards, and
            the mark is gone once a card leaves his hand -- also when it
            comes back (the worker forgets a card that changes zone)

check-hidden-hands.py reads the same trace for everything else a seat
must not be sent.

Exit 0 when it held, 1 when it did not, 2 when the game never reached
its moment.
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
S, F, I = "Swamp", "Forest", "Island"


def trace_path(name):
    if not TRACES:
        return tempfile.mktemp(suffix=f"-seen-{name}.jsonl")
    if TRACES.endswith(".jsonl"):
        return TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    return os.path.join(TRACES, f"seen-{name}.jsonl")


def stack_empty(g):
    return not g.state.get(1, {}).get("stack") and not g.state.get(2, {}).get("stack")


def duress():
    deal = {1: {"hand": [S, "Duress", I, "Unsummon", I, S, "Unsummon"], "top": [I, S, I, S]},
            2: {"hand": [F, F, F, "Grizzly Bears", "Grizzly Bears", "Hill Giant", "Hill Giant"],
                "top": [F, "Grizzly Bears", F, F]}}
    g = Game([(S, 20), (I, 20), ("Duress", 4), ("Unsummon", 4), ("Hill Giant", 12)], [(F, 30), ("Grizzly Bears", 16), ("Hill Giant", 14)],
             jar=JAR, res=RES, trace=trace_path("duress"), deal=deal)
    st = {"bounce": False, "bounced": None, "back": False, "cast": False, "revealed": None, "rounds": {}, "problems": [], "left": set(), "drawn": set(),
          "checked": 0}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if seat == 1 and not st["cast"]:
                ids = {c["id"] for c in g.mine(1, "hand", name="Duress")}
                o = next((o for o in f["options"] if card_of(o["actionId"]) in ids
                          and o.get("payable") is not False), None)
                if o:
                    st["cast"] = True
                    return o["actionId"]
            # The revealed Bears on the battlefield: back to Bob's hand.
            bears = [c for c in g.zone(1, "battlefield", owner=2, name="Grizzly Bears")
                     if st["revealed"] and c["id"] in st["revealed"]]
            if seat == 1 and bears and not st["bounce"]:
                ids = {c["id"] for c in g.mine(1, "hand", name="Unsummon")}
                o = next((o for o in f["options"] if card_of(o["actionId"]) in ids
                          and o.get("payable") is not False), None)
                if o:
                    st["bounce"], st["bounced"] = True, bears[0]["id"]
                    return o["actionId"]
            if seat == 2 and st["revealed"] is not None and not st["bounce"]:
                ids = {c["id"] for c in g.mine(2, "hand", name="Grizzly Bears")}
                o = next((o for o in f["options"] if card_of(o["actionId"]) in ids
                          and o.get("payable") is not False), None)
                if o:
                    return o["actionId"]
            return None
        if k == "chooseTargetsFor" and seat == 1:
            want = st["bounced"] if st["bounce"] else "player:2"
            o = next((o for o in f["options"] if o.get("objectId") == want), None)
            return o["actionId"] if o else DEFAULT
        return DEFAULT

    def until(g):
        a, b = g.state.get(1, {}), g.state.get(2, {})
        if a.get("stateRevision") is None or a.get("stateRevision") != b.get("stateRevision"):
            return False
        rev = a["stateRevision"]
        if rev in st["rounds"]:
            return False
        st["rounds"][rev] = True
        bob_hand = {c["id"] for c in b.get("hand", [])}
        shown = {c["id"]: c for c in a.get("otherHands", []) if c.get("seen")}
        marked = {c["id"] for c in b.get("hand", []) if c.get("seen")}
        if st["revealed"] is None:
            if shown:
                st["revealed"] = set(shown)
                st["at"] = {"rev": rev, "turn": g.turn, "bob": sorted(bob_hand)}
                if set(shown) != bob_hand:
                    st["problems"].append(f"rev {rev}: Alice shown {sorted(shown)}, Bob's hand {sorted(bob_hand)}")
            elif marked:
                st["problems"].append(f"rev {rev}: Bob's {sorted(marked)} marked seen before any reveal")
            return False
        st["checked"] += 1
        st["left"] |= st["revealed"] - bob_hand
        st["drawn"] |= bob_hand - st["revealed"]
        if st["bounced"] in bob_hand and st["bounced"] in st["left"]:
            st["back"] = True
        # A card that left the hand is not seen again, even back in it.
        expect = (st["revealed"] - st["left"]) & bob_hand
        if set(shown) != expect:
            st["problems"].append(f"rev {rev}: Alice shown {sorted(shown)}, expected {sorted(expect)}")
        if marked != expect:
            st["problems"].append(f"rev {rev}: Bob's eye on {sorted(marked)}, expected {sorted(expect)}")
        for cid, c in shown.items():
            if not c.get("known") or c.get("name") in (None, "", "Face-down"):
                st["problems"].append(f"rev {rev}: {cid} shown to Alice face down")
        # Nothing that left Bob's hand is in Alice's otherHands, seen or not.
        stale = {c["id"] for c in a.get("otherHands", [])} & st["left"]
        if stale:
            st["problems"].append(f"rev {rev}: Alice still sent {sorted(stale)} after it left Bob's hand")
        return st["back"] and g.turn >= 8

    g.run(policy, until=until, max_turn=14)
    found = {"at": st.get("at"), "revealed": sorted(st["revealed"] or []), "left": sorted(st["left"]),
             "drawn": sorted(st["drawn"]), "bounced back": st["bounced"] if st["back"] else None,
             "rounds checked": st["checked"], "stopped": g.stopped_badly()}
    if st["revealed"] is None:
        return "inconclusive", "Duress never revealed Bob's hand", found
    if not st["left"] or not st["drawn"] or not st["back"]:
        return "inconclusive", "no revealed card left Bob's hand and came back, or he drew none", found
    problems = st["problems"] + ([found["stopped"]] if found["stopped"] else [])
    return ("wrong", "; ".join(problems[:6]), found) if problems else (
        "ok", f"Duress: Alice kept seeing Bob's {len(st['revealed'])} revealed cards, eye on both sides, only "
              f"while each stayed in his hand ({len(st['left'])} left it, {len(st['drawn'])} drawn after: "
              f"never shown; the Bears bounced back to his hand was not seen again)", found)


SCENARIOS = {"duress": duress}

if __name__ == "__main__":
    results, worst = {}, 0
    for name, run in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        verdict_, words, found = run()
        results[name] = {"verdict": verdict_, "says": words, "found": found}
        code = {"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_]
        worst = 1 if 1 in (worst, code) else max(worst, code)
    print(json.dumps(results, indent=2, ensure_ascii=False, default=str))
    for name, r in results.items():
        print(f"{name}: {r['verdict'].upper()} -- {r['says']}")
    sys.exit(worst)
