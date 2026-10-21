"""Thousands of tokens at once stay playable. forge_patches/0002, owner report 2026-10-21.

    python -I scripts/check-token-speed.py <worker.jar> <res-root> [budget-seconds]

Krenko, Mob Boss doubles its controller's Goblins each time it is tapped.
The game is driven until one activation makes 2,048 Goblin tokens (4,095
Goblins afterwards), and that activation -- from Krenko's ability being
chosen to the next question -- must finish within the budget.

Measured on the development machine: 110 s without patch 0002 (Forge looked
every card up in the last-known battlefield by a linear scan, for every
card moved: cubic in the token count), 40 s with it. The default budget, 75 s,
sits between. It is a benchmark: a slower machine needs a larger budget,
given as the third argument, and the patched/unpatched pair is what matters.

Exit 0 within the budget, 1 over it, 2 when the game never got there.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
BUDGET = float(sys.argv[3]) if len(sys.argv) > 3 else 75.0
TARGET = 4095

g = Game([("Mountain", 24), ("Krenko, Mob Boss", 36)], [("Forest", 30), ("Grizzly Bears", 30)],
         jar=JAR, res=RES, trace="")
st = {"started": None, "goblins_before": 0, "timings": [], "done": False}


def goblins():
    return len(g.mine(1, name="Goblin Token")) + len(g.mine(1, name="Goblin"))


def policy(g, f):
    now = time.time()
    if st["started"] is not None and goblins() > st["goblins_before"]:
        st["timings"].append((goblins(), round(now - st["started"], 1)))
        print(f"{goblins()} Goblins: {st['timings'][-1][1]} s", flush=True)
        st["done"] = goblins() >= TARGET
        st["started"] = None
    if f["authorisedSeat"] == 2:
        return g.play_land(f) if f.get("kind") == "chooseSpellAbilityToPlay" else DEFAULT
    kind = f.get("kind")
    if kind == "chooseSpellAbilityToPlay":
        land = g.play_land(f)
        if land:
            return land
        for o in f.get("options", []):
            label = o.get("label") or ""
            if label.startswith("Krenko, Mob Boss") and "Create" in label and o.get("payable", True):
                st["started"], st["goblins_before"] = now, goblins()
                return o["actionId"]
        if not g.mine(1, name="Krenko, Mob Boss"):
            for o in f.get("options", []):
                label = o.get("label") or ""
                if label.startswith("Krenko, Mob Boss —") and "Create" not in label and o.get("payable", True):
                    return o["actionId"]
        return None
    if kind in ("declareAttackers", "declareBlockers"):
        return None
    return DEFAULT


g.run(policy, until=lambda g: st["done"], max_turn=80)
if not st["done"] and st["started"] is not None and time.time() - st["started"] > BUDGET:
    # Still making tokens when the worker went quiet: over the budget.
    print(f"WRONG: an activation was still making tokens after {round(time.time() - st['started'])} s "
          f"(budget {BUDGET} s); {st['timings']}")
    sys.exit(1)
if not st["done"]:
    print("INCONCLUSIVE: never reached", TARGET, "Goblins;", g.stopped_badly(), st["timings"])
    sys.exit(2)
last = st["timings"][-1][1]
if last > BUDGET:
    print(f"WRONG: making 2,048 Goblin tokens took {last} s, over the {BUDGET} s budget")
    sys.exit(1)
print(f"OK: 2,048 Goblin tokens made in {last} s (budget {BUDGET} s)")
sys.exit(0)
