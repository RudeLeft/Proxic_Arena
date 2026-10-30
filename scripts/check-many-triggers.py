"""Copies of one trigger are not an order question. Phase 9 W-05, owner 2026-10-30.

    python -I scripts/check-many-triggers.py <worker.jar> <res-root>

Boggart Shenanigans: "Whenever another Goblin you control dies, you may
have Boggart Shenanigans deal 1 damage to target player or planeswalker."
Seat 1 makes Goblin tokens with Dragon Fodder, then casts Pyroclasm, so
several Goblins die at once and Boggart Shenanigans triggers once for each.

The triggers differ only in what caused them (which Goblin died), and the
ability never reads its cause, so any order gives the same result: seat 1
must NOT be asked "which resolves first". Each trigger still asks for its
target and, resolving, whether to use it ("may"); the opponent loses one
life per trigger.

Each target question also says which copy it is, of how many ("2 of 4"),
so the page can offer one target for them all.

Exit 0 when right, 1 when wrong, 2 when the game never got there.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, verdict  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
BOGGART = "Boggart Shenanigans"

g = Game([("Mountain", 20), (BOGGART, 14), ("Dragon Fodder", 16), ("Pyroclasm", 10)],
         [("Forest", 30), ("Island", 30)], jar=JAR, res=RES, trace="")
st = {"died": None, "life": None, "order": 0, "targets": 0, "confirms": 0, "copies": [], "done": False}


def goblins():
    # Goblin creatures: Boggart Shenanigans is a Goblin too (Kindred Enchantment).
    return [c for c in g.mine(1) if c.get("kind") == "creature" and "Goblin" in (c.get("types") or "")]


def policy(g, f):
    kind = f.get("kind")
    if f["authorisedSeat"] == 2:
        return g.play_land(f) if kind == "chooseSpellAbilityToPlay" else DEFAULT
    if st["died"] is not None:
        if kind == "orderSimultaneousAbilities" and any(
                label.startswith(BOGGART) for label in g.labels(f)):
            st["order"] += 1
        if kind == "chooseTargetsFor" and (f.get("about") or {}).get("name") == BOGGART:
            st["targets"] += 1
            about = f["about"]
            st["copies"].append(f"{about.get('copy')} of {about.get('copies')}")
            return next((o["actionId"] for o in f.get("options", []) if o.get("objectId") == "player:2"),
                        DEFAULT)
        if kind == "confirmTrigger" and any(BOGGART in label for label in g.labels(f)):
            st["confirms"] += 1
            if st["confirms"] >= st["died"]:
                st["done"] = True
            return "confirm:yes"
    if kind == "chooseSpellAbilityToPlay":
        land = g.play_land(f)
        if land:
            return land
        if st["died"] is not None:
            return None
        if not g.mine(1, name=BOGGART):
            return g.option(f, name=BOGGART, zone="hand")
        if len(goblins()) < 4:
            return g.option(f, name="Dragon Fodder", zone="hand")
        # Only when it can be paid for: a refused cast would leave the
        # scenario waiting for deaths that never come.
        cast = next((o["actionId"] for o in f.get("options", [])
                     if (o.get("label") or "").startswith("Pyroclasm") and o.get("payable", True)), None)
        if cast:
            st["died"] = len(goblins())
            st["life"] = g.player(1, 2).get("life")
        return cast
    if kind in ("declareAttackers", "declareBlockers"):
        return None
    return DEFAULT


g.run(policy, until=lambda g: st["done"], max_turn=40)
found = dict(st)
found["opponent life now"] = g.player(1, 2).get("life")
if not st["done"]:
    verdict(found, [], "", inconclusive=g.stopped_badly() or "Pyroclasm never killed the Goblins")
problems = []
if st["order"]:
    problems.append(f"asked to order {st['order']} time(s): copies of one trigger are not a choice")
if st["targets"] != st["died"]:
    problems.append(f"{st['targets']} target questions for {st['died']} triggers")
# Phase 9 W-06: each target question says which copy it is, of how many.
if st["copies"] != [f"{n} of {st['died']}" for n in range(1, st["died"] + 1)]:
    problems.append(f"target questions said {st['copies']}, not 1..{st['died']} of {st['died']}")
if st["confirms"] != st["died"]:
    problems.append(f"{st['confirms']} yes questions for {st['died']} triggers")
verdict(found, problems,
        f"{st['died']} Goblins died: no order question, {st['targets']} targets and {st['confirms']} yeses")
