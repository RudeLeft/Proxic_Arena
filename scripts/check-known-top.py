"""Spec 0103, item 4 -- the cards you know are on top of your library.

    python -I scripts/check-known-top.py <worker.jar> <res-root> [trace.jsonl]

Forge does not remember what a player knows of its own library once a look
ends; the worker does, from the player's own answers (KnownTops, like
SeenHands), and sends it as `knownTop` in that player's own snapshot alone
(the HID-002 exception the owner approved 2026-11-17).

A focused deck (Layer B). Alice holds Brainstorm, Lightning Bolt, Forest,
Evolving Wilds and Opt; the only Bolt and the only Forest in her deck, so a
name anywhere in Bob's boards is a leak. Alice casts Brainstorm, puts back
Forest and then Lightning Bolt (Bolt chosen to be drawn first), and:

  known     Alice's board says `knownTop` [Lightning Bolt, Forest], numbered
            from the top, under stand-in ids (never a card's own id)
  bob       no board of Bob's has a `knownTop`, and none names Lightning
            Bolt or Forest, from the deal to the end (HID-001, HID-003)
  draw      Alice's next draw is Lightning Bolt and her `knownTop` becomes
            [Forest]
  shuffle   Evolving Wilds' search shuffles her library: from that board on,
            no `knownTop`
  bottom    Opt's scry 1 put on the bottom adds nothing

Exit 0 when all held, 1 when one did not, 2 when the game never reached
the moment.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, verdict  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
BOLT, FOREST, WILDS = "Lightning Bolt", "Forest", "Evolving Wilds"
SECRET = (BOLT, FOREST)


def names(node):
    if isinstance(node, dict):
        return set().union(*(names(v) for v in node.values())) if node else set()
    if isinstance(node, list):
        return set().union(*(names(v) for v in node)) if node else set()
    return {node} if isinstance(node, str) else set()


def known(state):
    return [c.get("name") for c in state.get("knownTop") or []]


def main():
    alice = [("Island", 50), ("Brainstorm", 4), ("Opt", 4), (WILDS, 1), (BOLT, 1), (FOREST, 1)]
    g = Game(alice, [("Island", 60)], jar=JAR, res=RES, trace=TRACE,
             deal={1: {"hand": ["Brainstorm", BOLT, FOREST, WILDS, "Opt", "Island", "Island"],
                       "top": ["Island"] * 12}})
    st = {"cast": False, "putBack": [], "known": None, "drew": None, "afterDraw": None,
          "wilds": False, "shuffled": None, "opt": False, "bottomed": False, "afterOpt": None,
          "bobLeaks": set(), "bobKnown": 0, "revs": 0}

    def policy(g, f):
        seat, kind = f["authorisedSeat"], f.get("kind")
        labels = g.labels(f)
        if seat != 1:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            if not st["cast"] and g.untapped_lands(1):
                o = g.option(f, name="Brainstorm", zone="hand")
                if o:
                    st["cast"] = True
                    return o
            if st["afterDraw"] is not None and not st["wilds"]:
                o = g.option(f, name=WILDS, land=True)
                if o:
                    return o
                o = g.option(f, name=WILDS, land=False)
                if o:
                    st["wilds"] = True
                    return o
            if st["shuffled"] is not None and not st["opt"] and g.untapped_lands(1, name="Island"):
                o = g.option(f, name="Opt", zone="hand")
                if o:
                    st["opt"] = True
                    return o
            # Islands only: the Forest stays hidden from Bob.
            return g.option(f, name="Island", land=True)
        if kind == "orderMoveToZoneList":
            # "Which card do you want to draw first?": Lightning Bolt.
            for o, label in zip(f.get("options") or [], labels):
                if BOLT in label:
                    return o["actionId"]
            return DEFAULT
        if kind == "willPutCardOnTop":
            for o, label in zip(f.get("options") or [], labels):
                if label == "Bottom":
                    st["bottomed"] = True
                    return o["actionId"]
            return DEFAULT
        if st["cast"] and not st["known"]:
            # Brainstorm's put back: Forest, then Lightning Bolt.
            for want in (FOREST, BOLT):
                if want in st["putBack"]:
                    continue
                for o, label in zip(f.get("options") or [], labels):
                    if label.startswith(want):
                        st["putBack"].append(want)
                        return o["actionId"]
        return DEFAULT

    def until(g):
        a, b = g.state.get(1) or {}, g.state.get(2) or {}
        st["revs"] += 1
        if b.get("knownTop"):
            st["bobKnown"] += 1
        st["bobLeaks"] |= names(b) & set(SECRET)
        k = known(a)
        if k and st["known"] is None:
            st["known"] = {"names": k, "ids": [c.get("id") for c in a.get("knownTop")]}
        hand = [c.get("name") for c in a.get("hand") or []]
        if st["known"] and st["drew"] is None and BOLT in hand:
            st["drew"] = BOLT
            st["afterDraw"] = k
        if st["wilds"] and st["shuffled"] is None and 1 in (a.get("shuffles") or []):
            st["shuffled"] = k
        if st["opt"] and st["bottomed"] and st["afterOpt"] is None and not a.get("stack"):
            st["afterOpt"] = k
        return st["afterOpt"] is not None

    g.run(policy, until=until, max_turn=10)
    found = {k: (sorted(v) if isinstance(v, set) else v) for k, v in st.items()}
    found["stopped"] = g.stopped_badly()
    if st["known"] is None or st["afterDraw"] is None or st["shuffled"] is None or st["afterOpt"] is None:
        verdict(found, [found["stopped"]] if found["stopped"] else [], "",
                inconclusive="the game never reached Brainstorm, the draw, the shuffle and Opt")
    problems = [found["stopped"]] if found["stopped"] else []
    if st["known"]["names"] != [BOLT, FOREST]:
        problems.append(f"Alice's knownTop after Brainstorm is {st['known']['names']}, not [Bolt, Forest]")
    if any(not str(i).startswith("known:1:") for i in st["known"]["ids"]):
        problems.append(f"knownTop carries a card's own id: {st['known']['ids']}")
    if st["afterDraw"] != [FOREST]:
        problems.append(f"after drawing the Bolt, knownTop is {st['afterDraw']}, not [Forest]")
    if st["shuffled"]:
        problems.append(f"a shuffled library still has a knownTop: {st['shuffled']}")
    if st["afterOpt"]:
        problems.append(f"a scry to the bottom made a knownTop: {st['afterOpt']}")
    if st["bobKnown"]:
        problems.append(f"Bob was sent a knownTop in {st['bobKnown']} boards")
    if st["bobLeaks"]:
        problems.append(f"Bob's boards name {sorted(st['bobLeaks'])}")
    verdict(found, problems, "Alice alone knows Bolt then Forest on top; a draw pops it, a shuffle clears it,"
                             " a scry to the bottom adds nothing; Bob is told nothing")


if __name__ == "__main__":
    main()
