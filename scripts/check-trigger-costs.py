"""A trigger's own "you may pay" cost is asked first, and not at all when it can't be paid. Spec 0043.

    python -I scripts/check-trigger-costs.py <worker.jar> <res-root> [trace-dir] [scenario...]

Skirk Drill Sergeant: "Whenever this or another Goblin dies, you may pay
{2}{R}. If you do, reveal the top card of your library..." Seat 1 has one
out, sacrifices a Mogg Fanatic (a Goblin), and:

  pay     with three Mountains untapped: asked "Pay {2}{R}?" (confirmPayment)
          BEFORE any mana question; Pay, then what to tap; the top card is
          revealed (the library is one smaller)
  skip    the same, Skip: no mana question, the library is untouched
  broke   fewer than three Mountains untapped: no question at all, the
          library untouched (not paying is the only answer)

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
DECK = [("Mountain", 24), ("Skirk Drill Sergeant", 18), ("Mogg Fanatic", 18)]


def game(name):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"trigger-costs-{name}.jsonl")
    return Game(DECK, [("Forest", 60)], jar=JAR, res=RES, trace=trace)


def stack_empty(g):
    return not g.state.get(1, {}).get("stack") and not g.state.get(2, {}).get("stack")


def scenario(name):
    g = game(name)
    st = {"sacrificed": False, "asked": [], "library": None, "after": None, "answered": None}

    def untapped(g):
        return len([c for c in g.mine(1, name="Mountain") if not c.get("tapped")])

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if seat != 1:
            return DEFAULT
        # The Fanatic's own sacrifice is confirmed too (confirmPayment, about
        # the Fanatic): yes. Only the Drill Sergeant's "Pay {2}{R}?" counts.
        sergeant = k == "confirmPayment" and any("{2}{R}" in (o.get("label") or "") for o in f.get("options", []))
        if k == "confirmPayment" and not sergeant:
            return "confirm:yes"
        if st["sacrificed"]:
            st["asked"].append("payQuestion" if sergeant else k)
            if sergeant:
                st["answered"] = "pay" if name == "pay" else "skip"
                return "confirm:yes" if name == "pay" else "confirm:no"
            if k == "applyManaToCost":
                return f["options"][0]["actionId"] if f.get("options") else None
        if k == "chooseTargetsFor":
            return "player:2" if any(o["actionId"] == "player:2" for o in f["options"]) else DEFAULT
        if k != "chooseSpellAbilityToPlay" or not stack_empty(g) or st["sacrificed"]:
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        if not g.mine(1, name="Skirk Drill Sergeant"):
            o = g.option(f, name="Skirk Drill Sergeant", zone="hand", land=False)
            return o
        if not g.mine(1, name="Mogg Fanatic"):
            o = g.option(f, name="Mogg Fanatic", zone="hand", land=False)
            return o
        # In the first main phase, so the result is read before the next draw.
        if str(g.state.get(1, {}).get("phase")) != "MAIN1":
            return None
        ready = untapped(g) >= 3 if name != "broke" else untapped(g) < 3
        if not ready:
            return None
        sac = g.option(f, name="Mogg Fanatic", contains="Sacrifice")
        if sac:
            st["sacrificed"] = True
            st["library"] = (g.player(1, 1) or {}).get("libraryCount")
            st["when"] = (g.turn, str(g.state.get(1, {}).get("phase")))
        return sac

    def until(g):
        # Everything the sacrifice set off has resolved once the game has
        # moved on to a later step with the stack empty.
        now = (g.turn, str(g.state.get(1, {}).get("phase")))
        if (st["sacrificed"] and stack_empty(g) and st["after"] is None and now != st.get("when")
                and now[0] == st["when"][0]):
            st["after"] = (g.player(1, 1) or {}).get("libraryCount")
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {k: st[k] for k in ("sacrificed", "asked", "library", "after", "answered")}
    found["stopped"] = g.stopped_badly()
    if not st["sacrificed"] or st["after"] is None:
        return "inconclusive", "a Mogg Fanatic was never sacrificed with a Drill Sergeant out", found
    problems = [found["stopped"]] if found["stopped"] else []
    asked = st["asked"]
    if name == "broke":
        if "payQuestion" in asked or "applyManaToCost" in asked:
            problems.append(f"asked with too little mana to pay {{2}}{{R}}: {asked}")
        if st["after"] != st["library"]:
            problems.append(f"nothing was paid, but the library went {st['library']} -> {st['after']}")
        ok = "too little mana: not asked, nothing revealed"
    else:
        if "payQuestion" not in asked:
            problems.append(f"never asked whether to pay: {asked}")
        elif "applyManaToCost" in asked and asked.index("applyManaToCost") < asked.index("payQuestion"):
            problems.append(f"asked for mana before asking whether to pay: {asked}")
        if name == "pay":
            if "applyManaToCost" not in asked:
                problems.append(f"Pay did not ask what to tap: {asked}")
            if st["after"] != (st["library"] or 0) - 1:
                problems.append(f"paid, but the top card was not revealed: library {st['library']} -> {st['after']}")
            ok = "asked Pay first; paid; the top card was revealed"
        else:
            if "applyManaToCost" in asked:
                problems.append(f"Skip still asked for mana: {asked}")
            if st["after"] != st["library"]:
                problems.append(f"skipped, but the library went {st['library']} -> {st['after']}")
            ok = "asked Pay first; skipped; nothing revealed"
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


SCENARIOS = {"pay": lambda: scenario("pay"), "skip": lambda: scenario("skip"), "broke": lambda: scenario("broke")}

if __name__ == "__main__":
    codes = []
    for name, run in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        for _ in range(3):
            verdict_, message, found = run()
            if verdict_ != "inconclusive":
                break
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_])
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:1200])
        sys.stdout.flush()
    sys.exit(1 if 1 in codes else max(codes, default=0))
