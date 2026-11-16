"""An ability on the stack is no handle on its card once that card is hidden.

    python -I scripts/check-top-goes-home.py <worker.jar> <res-root> [trace.jsonl]

Found 2026-11-16 by check-hidden-tops on the loyalty deck: Sensei's
Divining Top's "{T}: Draw a card, then put Sensei's Divining Top on top
of its owner's library" resolved under two of its own "{1}: Look at the
top three cards of your library", and the opponent's board still carried
the Top's id -- in those two stack entries' `source`, and through them in
every payment made for it. An id is a live handle on a card in a library
(AGENTS HID-001; HiddenIds).

A focused deck (Layer B): Alice holds Islands and the Top; Bob, Islands.
With the Top out and two Islands untapped, Alice activates "look" twice,
then "draw, then put it on top" -- which resolves first. In the round
after it, with the two looks still on the stack:

  bob     no string anywhere in Bob's board is the Top's id or names it as
          text (the looks' descriptions are Forge's "Sensei's Divining Top
          (48) - Look at..."); the two looks are still there, by name (the
          guard fired: HID-004)
  alice   Alice's board keeps the Top's id on the looks exactly when Forge
          shows her her own top card (`libraryTop`), as the owner was in
          the loyalty games; when it does not, a library is hidden from its
          owner too (HID-003: both seats; HiddenIdsTest holds the shown case)

Exit 0 when both held, 1 when one did not, 2 when the game never reached
the moment.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, verdict  # noqa: E402

TOP = "Sensei's Divining Top"
TEXT_ID = re.compile(r"[\w'] \((\d+)\)")
JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None


def ids(node):
    """Every card id in [node], under any key -- a "card:N" string, or Forge's
    own wording naming it as text ("Sensei's Divining Top (48) - Look at...")."""
    if isinstance(node, dict):
        return set().union(*(ids(v) for v in node.values())) if node else set()
    if isinstance(node, list):
        return set().union(*(ids(v) for v in node)) if node else set()
    if not isinstance(node, str):
        return set()
    if node.startswith("card:"):
        return {node}
    return {f"card:{m.group(1)}" for m in TEXT_ID.finditer(node)}


def looks(state):
    return [e for e in state.get("stack") or [] if e.get("name") == TOP and e.get("kind") == "ability"]


def main():
    g = Game([("Island", 40), (TOP, 20)], [("Island", 60)], jar=JAR, res=RES, trace=TRACE,
             deal={1: {"hand": [TOP] + ["Island"] * 6, "top": ["Island"] * 10}})
    st = {"top": None, "looked": 0, "drew": False, "seen": {}}

    def policy(g, f):
        if f["authorisedSeat"] != 1 or f.get("kind") != "chooseSpellAbilityToPlay":
            return DEFAULT
        tops = g.mine(1, name=TOP)
        if not tops:
            return g.option(f, name=TOP, zone="hand", land=False) or g.play_land(f) or None
        st["top"] = tops[0]["id"]
        if st["drew"]:
            return None
        if st["looked"] < 2 and len(g.untapped_lands(1)) >= 2 - st["looked"]:
            o = g.option(f, contains="Look at")
            if o:
                st["looked"] += 1
                return o
        if st["looked"] == 2:
            o = g.option(f, contains="Draw a card")
            if o:
                st["drew"] = True
                return o
        return g.play_land(f) or None

    def until(g):
        if not st["drew"] or not st["top"]:
            return False
        for seat in (1, 2):
            s = g.state.get(seat) or {}
            on_table = any(c.get("id") == st["top"] for c in s.get("battlefield") or [])
            if seat not in st["seen"] and not on_table and len(looks(s)) == 2:
                st["seen"][seat] = s
        return len(st["seen"]) == 2

    g.run(policy, until=until, max_turn=12)
    found = {"top": st["top"], "looks activated": st["looked"], "drew": st["drew"],
             "stopped": g.stopped_badly()}
    if len(st["seen"]) < 2:
        verdict(found, [], "", inconclusive="the Top never went home under two of its looks")
    bob, alice = st["seen"][2], st["seen"][1]
    found["bob's looks"] = looks(bob)
    found["alice's looks"] = looks(alice)
    found["alice's libraryTop"] = [c.get("id") for c in alice.get("libraryTop") or []]
    problems = [found["stopped"]] if found["stopped"] else []
    if st["top"] in ids(bob):
        problems.append(f"Bob's board still names the Top ({st['top']}), now in Alice's library")
    if any(f"({st['top'][5:]})" in (e.get("description") or "") for e in looks(bob)):
        problems.append("Bob's looks' words still carry the Top's id as text")
    if any(e.get("name") != TOP for e in looks(bob)):
        problems.append("Bob's looks lost their name")
    # HID-003: Alice keeps the handle exactly when Forge shows her her own top
    # card (it does in some games, not in this one); never blanked when shown.
    shown = st["top"] in found["alice's libraryTop"]
    kept = [e.get("source") == st["top"] for e in looks(alice)]
    if shown and not all(kept):
        problems.append("Alice, shown her own top card, lost its id on her looks")
    if not shown and any(kept) or not shown and st["top"] in ids(alice):
        problems.append("Alice's board names the Top in her library though she was not shown it")
    verdict(found, problems, "Bob's looks name the Top without its id; Alice has the id only if shown her top card"
                             f" (shown: {shown})")


if __name__ == "__main__":
    main()
