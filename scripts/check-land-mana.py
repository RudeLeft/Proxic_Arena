"""What each land makes, as its pill shows it. Spec 0046.

    python -I scripts/check-land-mana.py <worker.jar> <res-root> [trace-dir] [scenario...]

  lands       seat 1 plays a Plains, a Hallowed Fountain, a Wastes and an
              Evolving Wilds: the board says {W}, {W}{U}, {C} and nothing
              (a fetch land makes no mana itself) -- to BOTH seats
  blood-moon  then seat 2 casts Blood Moon (nonbasic lands are Mountains):
              the Fountain and the Wilds now make {R}, the basic Plains and
              Wastes are unchanged -- read from the abilities the lands have
              now, not from their names

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
LANDS = ["Plains", "Hallowed Fountain", "Wastes", "Evolving Wilds"]
BEFORE = {"Plains": ["W"], "Hallowed Fountain": ["W", "U"], "Wastes": ["C"], "Evolving Wilds": []}
AFTER = {"Plains": ["W"], "Hallowed Fountain": ["R"], "Wastes": ["C"], "Evolving Wilds": ["R"]}


def game(name):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"land-mana-{name}.jsonl")
    # The deal: one of each land, and Blood Moon with the Mountains to cast it.
    deal = {1: {"hand": LANDS + ["Plains", "Wastes", "Plains"]},
            2: {"hand": ["Mountain"] * 5 + ["Blood Moon"] * 2}}
    return Game([(n, 15) for n in LANDS], [("Mountain", 40), ("Blood Moon", 20)], jar=JAR, res=RES, trace=trace,
                deal=deal)


def makes(g, viewer):
    """Each of seat 1's lands, as `viewer` is told it: name -> the pill."""
    seen = {}
    for c in g.zone(viewer, "battlefield"):
        if c.get("seat") == 1 and c.get("name") in LANDS:
            seen[c["name"]] = c.get("makes") or []
    return seen


def run(name):
    g = game(name)
    st = {"before": None, "after": None, "moon": False}

    def policy(g, f):
        seat, kind = f["authorisedSeat"], f.get("kind")
        if kind != "chooseSpellAbilityToPlay":
            # Hallowed Fountain asks for 2 life (or enters tapped); Evolving
            # Wilds is never cracked (its pill is what is checked).
            if kind == "confirmPayment":
                return "confirm:yes"
            return DEFAULT
        if seat == 1:
            mine = {c.get("name") for c in g.mine(1)}
            for land in LANDS:
                if land not in mine:
                    o = g.option(f, name=land, land=True)
                    if o:
                        return o
            return None
        if st["before"] is not None and not g.mine(2, name="Blood Moon"):
            o = g.option(f, name="Blood Moon", zone="hand", land=False)
            if o and len([c for c in g.mine(2, name="Mountain") if not c.get("tapped")]) >= 3:
                st["moon"] = True
                return o
        return g.play_land(f) or None

    def until(g):
        # Both seats' boards, once each shows all four (seat 2's can be a frame behind).
        if len(makes(g, 1)) == 4 and len(makes(g, 2)) == 4 and st["before"] is None:
            st["before"] = {1: makes(g, 1), 2: makes(g, 2)}
            if name == "lands":
                return True
        if st["before"] is not None and g.mine(2, name="Blood Moon") and not g.state.get(1, {}).get("stack"):
            st["after"] = {1: makes(g, 1), 2: makes(g, 2)}
            return True
        return False

    g.run(policy, until=until, max_turn=20)
    found = {"before": st["before"], "after": st["after"], "stopped": g.stopped_badly()}
    if st["before"] is None or (name == "blood-moon" and st["after"] is None):
        return "inconclusive", "the four lands (and Blood Moon) were never all out", found
    problems = [found["stopped"]] if found["stopped"] else []
    want = BEFORE if name == "lands" else AFTER
    got = st["before"] if name == "lands" else st["after"]
    for viewer in (1, 2):
        for land, symbols in want.items():
            if got[viewer].get(land) != symbols:
                problems.append(f"seat {viewer} sees {land} make {got[viewer].get(land)}, expected {symbols}")
    ok = "Plains {W}, Fountain {W}{U}, Wastes {C}, Wilds nothing" if name == "lands" else \
        "under Blood Moon: Fountain and Wilds {R}, the basics unchanged"
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


SCENARIOS = {"lands": lambda: run("lands"), "blood-moon": lambda: run("blood-moon")}

if __name__ == "__main__":
    codes = []
    for name, go in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        for _ in range(3):
            verdict_, message, found = go()
            if verdict_ != "inconclusive":
                break
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_])
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:1500])
        sys.stdout.flush()
    sys.exit(1 if 1 in codes else max(codes, default=0))
