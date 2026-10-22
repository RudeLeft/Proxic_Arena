"""What a spell costs right now, as Forge reckons it. Owner request 2026-10-21.

    python -I scripts/check-mana-cost.py <worker.jar> <res-root> [trace] [scenario...]

The board shows each card's cost as mana symbols: the printed cost from the
snapshot ("manaCost"), and -- when the player is asked what to do -- the
cost the cast would actually take ("cost" on the option), from Forge's own
cost adjustment. A card that changes costs changes the second, never the
first.

  printed   Lightning Strike in hand carries its printed {1}{R}; a land none
  reduced   Goblin Electromancer ("instant and sorcery spells you cast cost
            {1} less") in play: Lightning Strike's cast option costs {R}
  raised    the opponent's Thalia, Guardian of Thraben ("noncreature spells
            cost {1} more"): Lightning Strike's cast option costs {2}{R}

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
STRIKE = "Lightning Strike"


def game(name, seat1, seat2):
    trace = os.path.join(TRACES, f"mana-cost-{name}.jsonl") if TRACES and os.path.isdir(TRACES) else ""
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def strike_costs(f):
    return [o.get("cost") for o in f.get("options", []) if (o.get("label") or "").startswith(STRIKE + " —")]


def run(name, seat1, seat2, enabler, enabler_seat):
    """Play lands, cast the enabler, then read Lightning Strike's option cost."""
    g = game(name, seat1, seat2)
    st = {"printed": None, "land": "absent", "costs": [], "enabled": False}

    def policy(g, f):
        hand = (g.state.get(1) or {}).get("hand", [])
        for c in hand:
            if c.get("name") == STRIKE:
                st["printed"] = c.get("manaCost")
            if c.get("kind") == "land" and "manaCost" in c:
                st["land"] = c.get("manaCost")
        seat, kind = f["authorisedSeat"], f.get("kind")
        st["enabled"] = bool(enabler and g.mine(enabler_seat, name=enabler))
        if kind == "chooseSpellAbilityToPlay":
            if seat == 1 and st["enabled"] or (seat == 1 and not enabler):
                found = [c for c in strike_costs(f) if c]
                if found:
                    st["costs"] = found
            land = g.play_land(f)
            if land:
                return land
            if enabler and seat == enabler_seat and not g.mine(enabler_seat, name=enabler):
                o = g.option(f, name=enabler, zone="hand", land=False)
                if o:
                    return o
            return None
        return DEFAULT

    g.run(policy, until=lambda g: bool(st["costs"]), max_turn=24)
    return g, st


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def printed():
    g, st = run("printed", [("Mountain", 30), (STRIKE, 30)], [("Forest", 30), ("Grizzly Bears", 30)], None, 0)
    found = {"printed": st["printed"], "land": st["land"], "option": st["costs"], "stopped": g.stopped_badly()}
    if not st["printed"]:
        return "inconclusive", "never had Lightning Strike in hand", found
    problems = [found["stopped"]] if found["stopped"] else []
    if st["printed"] != "{1}{R}":
        problems.append(f"printed cost should be {{1}}{{R}}: {st['printed']!r}")
    if st["land"] != "absent":
        problems.append(f"a land should carry no mana cost: {st['land']!r}")
    if st["costs"] and st["costs"][0] != "{1}{R}":
        problems.append(f"with nothing changing it, the cast should cost {{1}}{{R}}: {st['costs']}")
    return result(problems, "Lightning Strike reads {1}{R} in hand and on its cast; a land has no cost", found)


def reduced():
    g, st = run("reduced", [("Mountain", 20), ("Island", 10), ("Goblin Electromancer", 15), (STRIKE, 15)],
                [("Forest", 30), ("Grizzly Bears", 30)], "Goblin Electromancer", 1)
    found = {"option": st["costs"], "printed": st["printed"], "stopped": g.stopped_badly()}
    if not st["costs"]:
        return "inconclusive", "never had Goblin Electromancer out with Lightning Strike in hand", found
    problems = [found["stopped"]] if found["stopped"] else []
    if st["costs"][0] != "{R}":
        problems.append(f"with Goblin Electromancer out, the cast should cost {{R}}: {st['costs']}")
    if st["printed"] and st["printed"] != "{1}{R}":
        problems.append(f"the printed cost must not change: {st['printed']!r}")
    return result(problems, "Goblin Electromancer out: the cast costs {R}, the printed cost still {1}{R}", found)


def raised():
    g, st = run("raised", [("Mountain", 30), (STRIKE, 30)],
                [("Plains", 30), ("Thalia, Guardian of Thraben", 30)], "Thalia, Guardian of Thraben", 2)
    found = {"option": st["costs"], "printed": st["printed"], "stopped": g.stopped_badly()}
    if not st["costs"]:
        return "inconclusive", "never had Thalia out with Lightning Strike in hand", found
    problems = [found["stopped"]] if found["stopped"] else []
    if st["costs"][0] != "{2}{R}":
        problems.append(f"with the opponent's Thalia out, the cast should cost {{2}}{{R}}: {st['costs']}")
    return result(problems, "the opponent's Thalia out: the cast costs {2}{R}", found)


SCENARIOS = {"printed": printed, "reduced": reduced, "raised": raised}

if __name__ == "__main__":
    worst = 0
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        status, text, found = scenario()
        print(f"--- {name}")
        print(json.dumps(found, indent=2, ensure_ascii=False, default=str))
        print(f"{status.upper()}: {text}")
        worst = max(worst, {"ok": 0, "wrong": 1, "inconclusive": 2}[status])
    sys.exit(worst)
