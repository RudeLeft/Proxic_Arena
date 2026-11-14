"""Spec 0087 -- cards a player may still use from a graveyard or an exile
(Mechanics Lab, Layer B).

    python -I scripts/check-piles.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker. What it checks is read
from the snapshots both seats were sent -- a graveyard or exile entry's
`uses` ([{seat, how}]), `foretold`, `plotted`, `known`, `name` and
`counters`, and the round's `moves` -- never inferred:

  stage       Light Up the Stage: its two cards in Alice's exile may be
              played by her (`uses` seat 1, "cast"), both seats see it, on
              her next turn too; when that turn ends they are still in
              exile and no longer usable (F-0087-A)
  giant       Bonecrusher Giant's Stomp: the Giant waits in exile on its
              adventure, usable by Alice, both seats; she casts it from
              there (exile -> stack) and it is on the battlefield (F-0087-B)
  think-twice Think Twice from the hand: in the graveyard, usable (its
              flashback), both seats; cast again from there, then exiled
              and no longer usable (F-0087-B)
  foretell    Saw It Coming foretold: Alice sees it by name, foretold,
              usable; Bob sees a face-down card, foretold, usable by Alice,
              and is never sent its name (F-0087-C)
  suspend     Ancestral Vision suspended: in exile, `uses` "suspended", its
              time counters 4, 3, 2, 1 at Alice's upkeeps and 0 while its
              "cast it" trigger waits, both seats; then it goes from exile
              to the stack without being paid and Alice draws three
              (F-0087-D)
  unearth     Amendment 1: Faithless Looting discards Dregscape Zombie: the
              Looting is usable from the graveyard ("cast", flashback), the
              Zombie by its ability ("ability", Unearth), both seats; the
              Zombie is unearthed from there
  gonti       Amendment 1: Gonti exiles Bob's top card face down: it is in
              Bob's exile, usable by Alice (seat 1), Alice sees what it is,
              Bob only a face-down card, never named; Alice casts it from
              Bob's exile
  plot        Amendment 1: Slickshot Show-Off plotted: in exile, `plotted`,
              usable by Alice, both seats; cast from there on a later turn
  hideaway    Mosswort Bridge hides a card: Alice may look at it (it is on
              Forge's list for that), but nobody may use it there, so it has
              no `uses`, both seats

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its point.
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
BEARS_DEAL = {"hand": ["Forest"] * 3 + ["Grizzly Bears"] * 4, "top": ["Forest", "Grizzly Bears"] * 4}


def game(name, seat1, seat2=BEARS, deal=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"piles-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal)


class Watch:
    """Every snapshot each seat was sent, once each, in order."""

    def __init__(self, g):
        self.g = g
        self.seen = {1: {}, 2: {}}

    def see(self):
        for seat in (1, 2):
            s = self.g.state.get(seat)
            if s and s.get("stateRevision") not in self.seen[seat]:
                self.seen[seat][s.get("stateRevision")] = json.loads(json.dumps(s))

    def boards(self, seat):
        return list(self.seen[seat].values())


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def in_pile(board, card_id):
    """(zone, entry) of [card_id] in a graveyard or an exile, else (None, None)."""
    for zone in ("graveyard", "exile"):
        for c in board.get(zone) or []:
            if c.get("id") == card_id:
                return zone, c
    return None, None


def uses(entry):
    return [(u.get("seat"), u.get("how")) for u in (entry or {}).get("uses") or []]


def calm(g, seat=1):
    return not (g.state.get(seat) or {}).get("stack")


def hand_land(g, f):
    """A land from the hand only (never one a pile lets her play)."""
    return g.option(f, zone="hand", land=True)


def seat2_plays(*names):
    def play(g, f):
        if f.get("kind") == "chooseSpellAbilityToPlay":
            land = hand_land(g, f)
            if land:
                return land
            for name in names:
                o = g.option(f, name=name, zone="hand", land=False)
                if o:
                    return o
            return None
        return DEFAULT
    return play


def option_for(f, card_id, contains=None, without=None):
    for o in f.get("options", []):
        label = o.get("label") or ""
        if card_of(o.get("actionId")) != card_id:
            continue
        if contains and contains not in label:
            continue
        if without and without in label:
            continue
        return o["actionId"]
    return None


def hand_option(g, f, name, contains=None, without=None):
    for c in g.mine(f["authorisedSeat"], zone="hand", name=name):
        o = option_for(f, c["id"], contains, without)
        if o:
            return o
    return None


def steady(w, card_id, problems, what, until=None):
    """Once usable, [card_id] stays usable on every board while it lies in the same pile
    (no flicker between steps or turns), up to the board where `until` says it stops."""
    for seat in (1, 2):
        zone_was, on = None, False
        for b in w.boards(seat):
            zone, e = in_pile(b, card_id)
            if until and until(b):
                break
            if zone != zone_was:
                zone_was, on = zone, False
            if uses(e):
                on = True
            elif on and zone:
                problems.append(f"seat {seat}: {what} dropped out of use on turn {b.get('turn')} {b.get('phase')}")
                break


def both_saw(w, card_id, want, problems, what):
    """Both seats were sent [card_id] in a pile with exactly the uses [want] at least once."""
    for seat in (1, 2):
        if not any(uses(in_pile(b, card_id)[1]) == want for b in w.boards(seat)):
            problems.append(f"seat {seat}: {what} was never sent with uses {want}")


# --- F-0087-A: Light Up the Stage -----------------------------------------------------------------


def stage():
    st = {"cast_turn": None, "cast": False}

    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return seat2_plays("Grizzly Bears")(g, f)
        if f.get("kind") == "chooseSpellAbilityToPlay":
            land = hand_land(g, f)
            if land:
                return land
            if not st["cast"] and calm(g) and len(g.untapped_lands(1)) >= 3:
                o = hand_option(g, f, "Light Up the Stage", without="Spectacle")
                if o:
                    st["cast"], st["cast_turn"] = True, g.turn
                    return o
            return None
        return DEFAULT

    g = game("stage", [("Mountain", 30), ("Light Up the Stage", 30)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Light Up the Stage"] * 3, "top": ["Mountain"] * 4},
                   2: BEARS_DEAL})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["cast_turn"] is not None and g.turn > st["cast_turn"] + 3)[1],
          max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly(), "cast on turn": st["cast_turn"]}
    if st["cast_turn"] is None:
        return "inconclusive", "Light Up the Stage was never cast", found
    problems = [found["stopped"]] if found["stopped"] else []
    a = w.boards(1)
    exiled = []
    for b in a:
        exiled = [c["id"] for c in b.get("exile") or [] if c.get("seat") == 1 and uses(c) == [(1, "cast")]]
        if len(exiled) >= 2:
            break
    found["exiled"] = exiled
    if len(exiled) < 2:
        return result(problems + ["two cards in Alice's exile were never both usable by her"], "", found)
    t0 = st["cast_turn"]
    for seat in (1, 2):
        boards = w.boards(seat)
        for card in exiled:
            nxt = [b for b in boards if b.get("turn") == t0 + 2 and in_pile(b, card)[0] == "exile"]
            if not nxt or uses(in_pile(nxt[-1], card)[1]) != [(1, "cast")]:
                problems.append(f"seat {seat}: {card} not usable on Alice's next turn")
            after = [b for b in boards if b.get("turn", 0) >= t0 + 3 and in_pile(b, card)[0] == "exile"]
            if not after:
                problems.append(f"seat {seat}: {card} left exile (the scenario never plays it)")
            elif uses(in_pile(after[0], card)[1]):
                problems.append(f"seat {seat}: {card} still usable after the window ended: {in_pile(after[0], card)[1]}")
    return result(problems, "two exiled cards usable by Alice through her next turn, then no longer, both seats", found)


# --- F-0087-B: Bonecrusher Giant and Think Twice ----------------------------------------------------


def giant():
    st = {"stomp": False, "giant": None}

    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return seat2_plays("Grizzly Bears")(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if len(g.mine(1, name="Mountain")) < 3:
                land = hand_land(g, f)
                if land:
                    return land
            exiled = g.zone(1, "exile", owner=1, name="Bonecrusher Giant")
            if st["stomp"] and exiled and st["giant"] is None and len(g.untapped_lands(1)) >= 3 and calm(g):
                o = option_for(f, exiled[0]["id"], contains="Creature") or option_for(f, exiled[0]["id"])
                if o:
                    st["giant"] = exiled[0]["id"]
                    return o
            if not st["stomp"] and len(g.untapped_lands(1)) >= 2 and calm(g):
                o = next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith("Stomp")), None)
                if o:
                    st["stomp"] = True
                    return o
            return None
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if "Bob" in (o.get("label") or "")),
                        f["options"][0]["actionId"])
        return DEFAULT

    g = game("giant", [("Mountain", 24), ("Bonecrusher Giant", 36)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Bonecrusher Giant"] * 3, "top": ["Mountain"] * 4}, 2: BEARS_DEAL})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["giant"] is not None and calm(g)
                                   and any(c["id"] == st["giant"] for c in g.mine(1)))[1], max_turn=20)
    w.see()
    found = {"stopped": g.stopped_badly(), "stomp": st["stomp"], "giant": st["giant"]}
    if st["giant"] is None:
        return "inconclusive", "the Giant was never cast from exile", found
    problems = [found["stopped"]] if found["stopped"] else []
    both_saw(w, st["giant"], [(1, "cast")], problems, "the Giant on its adventure")
    steady(w, st["giant"], problems, "the Giant")
    for seat in (1, 2):
        moved = any(m.get("card") == st["giant"] and m.get("from", {}).get("zone") == "exile"
                    and m.get("to", {}).get("zone") == "stack" for b in w.boards(seat) for m in b.get("moves") or [])
        if not moved:
            problems.append(f"seat {seat}: never told the Giant went from exile to the stack")
    if not any(c["id"] == st["giant"] for c in g.mine(1)):
        problems.append("the Giant is not on the battlefield")
    return result(problems, "the Giant waited in exile usable by Alice (both seats) and was cast from there", found)


def think_twice():
    st = {"first": None, "again": False}

    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return seat2_plays("Grizzly Bears")(g, f)
        if f.get("kind") == "chooseSpellAbilityToPlay":
            land = hand_land(g, f)
            if land:
                return land
            if not calm(g):
                return None
            if st["first"] is None and len(g.untapped_lands(1)) >= 2:
                hand = g.mine(1, zone="hand", name="Think Twice")
                for c in hand:
                    o = option_for(f, c["id"])
                    if o:
                        st["first"] = c["id"]
                        return o
            grave = [c for c in g.mine(1, zone="graveyard", name="Think Twice") if c["id"] == st["first"]]
            if grave and not st["again"] and len(g.untapped_lands(1)) >= 3:
                o = option_for(f, grave[0]["id"])
                if o:
                    st["again"] = True
                    return o
            return None
        return DEFAULT

    g = game("think-twice", [("Island", 30), ("Think Twice", 30)],
             deal={1: {"hand": ["Island"] * 4 + ["Think Twice"] * 3, "top": ["Island"] * 4}, 2: BEARS_DEAL})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["again"] and calm(g)
                                   and all([c for c in g.zone(seat, "exile") if c["id"] == st["first"]]
                                           for seat in (1, 2)))[1],
          max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly(), "card": st["first"], "flashback": st["again"]}
    if not st["again"]:
        return "inconclusive", "Think Twice was never cast from the graveyard", found
    problems = [found["stopped"]] if found["stopped"] else []
    both_saw(w, st["first"], [(1, "cast")], problems, "Think Twice in the graveyard")
    steady(w, st["first"], problems, "Think Twice")
    for seat in (1, 2):
        exiled = [in_pile(b, st["first"])[1] for b in w.boards(seat) if in_pile(b, st["first"])[0] == "exile"]
        if not exiled or any(uses(e) for e in exiled):
            problems.append(f"seat {seat}: after its flashback Think Twice should be in exile, unusable: {exiled[-1:]}")
    return result(problems, "Think Twice usable from the graveyard (both seats), flashed back, then exiled and unusable", found)


# --- F-0087-C: foretell --------------------------------------------------------------------------


def foretell():
    st = {"card": None, "turn": None}

    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return seat2_plays("Grizzly Bears")(g, f)
        if f.get("kind") == "chooseSpellAbilityToPlay":
            land = hand_land(g, f)
            if land:
                return land
            if st["card"] is None and calm(g) and len(g.untapped_lands(1)) >= 2 and g.state[1].get("activeSeat") == 1:
                for c in g.mine(1, zone="hand", name="Saw It Coming"):
                    o = option_for(f, c["id"], contains="Foretell")
                    if o:
                        st["card"], st["turn"] = c["id"], g.turn
                        return o
            return None
        return DEFAULT

    g = game("foretell", [("Island", 30), ("Saw It Coming", 30)],
             deal={1: {"hand": ["Island"] * 4 + ["Saw It Coming"] * 3, "top": ["Island"] * 4}, 2: BEARS_DEAL})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["turn"] is not None and g.turn > st["turn"] + 1)[1], max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "card": st["card"], "turn": st["turn"]}
    if st["card"] is None:
        return "inconclusive", "Saw It Coming was never foretold", found
    problems = [found["stopped"]] if found["stopped"] else []
    card = st["card"]
    mine = [in_pile(b, card)[1] for b in w.boards(1) if in_pile(b, card)[0] == "exile"]
    theirs = [in_pile(b, card)[1] for b in w.boards(2) if in_pile(b, card)[0] == "exile"]
    found["alice"], found["bob"] = mine[-1:] , theirs[-1:]
    if not mine or not all(e.get("name") == "Saw It Coming" and e.get("foretold") and uses(e) == [(1, "cast")]
                           for e in mine):
        problems.append(f"Alice should see her foretold card by name, foretold and usable: {mine[-1:]}")
    if not theirs or not all(e.get("known") is False and e.get("name") == "Face-down" and e.get("foretold")
                             and uses(e) == [(1, "cast")] for e in theirs):
        problems.append(f"Bob should see a face-down foretold card usable by Alice, nothing more: {theirs[-1:]}")
    steady(w, card, problems, "the foretold card")
    if any("Saw It Coming" in json.dumps(b) for b in w.boards(2)):
        problems.append("Bob was sent the name Saw It Coming")
    return result(problems, "foretold: Alice sees Saw It Coming, usable; Bob a face-down foretold card, never named", found)


# --- F-0087-D: suspend ---------------------------------------------------------------------------


def time_of(entry):
    for c in (entry or {}).get("counters") or []:
        if str(c.get("name")).upper() == "TIME":
            return c.get("count")
    return 0


def suspend():
    st = {"card": None, "cast": False}

    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return seat2_plays("Grizzly Bears")(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = hand_land(g, f)
            if land:
                return land
            if st["card"] is None and calm(g) and g.untapped_lands(1):
                for c in g.mine(1, zone="hand", name="Ancestral Vision"):
                    o = option_for(f, c["id"], contains="Suspend") or option_for(f, c["id"])
                    if o:
                        st["card"] = c["id"]
                        return o
            return None
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if "Alice" in (o.get("label") or "")),
                        f["options"][0]["actionId"])
        # "Cast it without paying?" -- yes.
        if st["card"] and f.get("options") and kind not in ("declareAttackers", "declareBlockers"):
            yes = next((o["actionId"] for o in f["options"] if (o.get("label") or "").lower() in ("yes", "cast", "cast it")),
                       None)
            if yes:
                st["cast"] = True
                return yes
        return DEFAULT

    g = game("suspend", [("Island", 30), ("Ancestral Vision", 30)],
             deal={1: {"hand": ["Island"] * 4 + ["Ancestral Vision"] * 3, "top": ["Island"] * 12}, 2: BEARS_DEAL})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["card"] is not None and calm(g)
                                   and bool([c for c in g.zone(1, "graveyard") if c["id"] == st["card"]]))[1],
          max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly(), "card": st["card"]}
    if st["card"] is None:
        return "inconclusive", "Ancestral Vision was never suspended", found
    problems = [found["stopped"]] if found["stopped"] else []
    card = st["card"]
    for seat in (1, 2):
        counts = []
        for b in w.boards(seat):
            zone, e = in_pile(b, card)
            # At 0 too, while its "cast it" trigger waits (it is cast from the fan).
            if zone == "exile":
                if uses(e) != [(1, "suspended")]:
                    problems.append(f"seat {seat}: suspended card sent with uses {uses(e)}")
                    break
                n = time_of(e)
                if not counts or counts[-1] != n:
                    counts.append(n)
        found[f"time, seat {seat}"] = counts
        if counts != [4, 3, 2, 1, 0]:
            problems.append(f"seat {seat}: time counters went {counts}, not 4, 3, 2, 1, 0")
        moved = any(m.get("card") == card and m.get("from", {}).get("zone") == "exile"
                    and m.get("to", {}).get("zone") == "stack" for b in w.boards(seat) for m in b.get("moves") or [])
        if not moved:
            problems.append(f"seat {seat}: never told it went from exile to the stack")
    if not [c for c in g.zone(1, "graveyard") if c["id"] == card]:
        return "inconclusive", "it was never cast at zero", found
    # Its suspend cost ({U}) was paid from the hand; nothing after it left exile.
    a = w.boards(1)
    went = next((i for i, b in enumerate(a) if any(m.get("card") == card and m.get("to", {}).get("zone") == "stack"
                                                  and m.get("from", {}).get("zone") == "exile" for m in b.get("moves") or [])),
                None)
    if went is not None:
        before = max((p.get("n", 0) for b in a[:went] for p in b.get("payments") or [] if p.get("for") == card), default=0)
        later = [p for b in a[went:] for p in b.get("payments") or [] if p.get("for") == card and p.get("n", 0) > before]
        if later:
            problems.append(f"it was paid for after leaving exile (it should be cast free): {later[:1]}")
    return result(problems, "suspended: time 4, 3, 2, 1 at her upkeeps and 0 while it waits, then cast free from exile, both seats", found)


# --- Amendment 1: abilities from the graveyard; the other player's piles; plot -------------------


def unearth():
    st = {"looted": False, "zombie": None, "unearthed": False}

    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return seat2_plays("Grizzly Bears")(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = hand_land(g, f)
            if land:
                return land
            if not calm(g):
                return None
            if not st["looted"] and g.untapped_lands(1, name="Mountain"):
                o = hand_option(g, f, "Faithless Looting", without="Flashback")
                if o:
                    st["looted"] = True
                    return o
            grave = g.mine(1, zone="graveyard", name="Dregscape Zombie")
            if grave and not st["unearthed"] and g.untapped_lands(1, name="Swamp"):
                o = option_for(f, grave[0]["id"], contains="Unearth") or option_for(f, grave[0]["id"])
                if o:
                    st["zombie"], st["unearthed"] = grave[0]["id"], True
                    return o
            return None
        # The Looting's discards: the Zombies first.
        zombies = {c["id"] for c in g.mine(1, zone="hand", name="Dregscape Zombie")}
        o = next((o["actionId"] for o in f.get("options", []) if card_of(o.get("actionId")) in zombies
                  or o.get("objectId") in zombies), None)
        if st["looted"] and o and "iscard" in (f.get("prompt") or "").lower() + str(kind).lower():
            return o
        return DEFAULT

    g = game("unearth", [("Mountain", 14), ("Swamp", 14), ("Faithless Looting", 12), ("Dregscape Zombie", 20)],
             deal={1: {"hand": ["Mountain", "Swamp", "Faithless Looting", "Dregscape Zombie", "Dregscape Zombie",
                                "Swamp", "Mountain"], "top": ["Swamp", "Mountain"] * 4}, 2: BEARS_DEAL})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["unearthed"] and calm(g)
                                   and all(any(c["id"] == st["zombie"] for c in g.zone(seat, "battlefield"))
                                           for seat in (1, 2)))[1], max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "looted": st["looted"], "zombie": st["zombie"]}
    if not st["unearthed"]:
        return "inconclusive", "no Zombie was unearthed", found
    problems = [found["stopped"]] if found["stopped"] else []
    both_saw(w, st["zombie"], [(1, "ability")], problems, "Dregscape Zombie in the graveyard")
    steady(w, st["zombie"], problems, "Dregscape Zombie")
    looting = next((c["id"] for b in w.boards(1) for c in b.get("graveyard") or []
                    if c.get("name") == "Faithless Looting"), None)
    found["looting"] = looting
    if looting:
        both_saw(w, looting, [(1, "cast")], problems, "Faithless Looting in the graveyard")
        steady(w, looting, problems, "Faithless Looting")
    else:
        problems.append("Faithless Looting never reached the graveyard")
    if not any(c["id"] == st["zombie"] for c in g.mine(1)):
        problems.append("the Zombie is not on the battlefield")
    return result(problems, "Looting usable by flashback, the Zombie by Unearth (an ability), both seats; unearthed", found)


def gonti():
    st = {"gonti": False, "card": None, "cast": False, "turn": None}

    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return seat2_plays("Grizzly Bears")(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = hand_land(g, f)
            if land:
                return land
            if not calm(g):
                return None
            if not st["gonti"] and len(g.untapped_lands(1)) >= 4:
                o = hand_option(g, f, "Gonti, Lord of Luxury")
                if o:
                    st["gonti"] = True
                    return o
            taken = [c for c in g.zone(1, "exile", owner=2) if uses(c) == [(1, "cast")]]
            if taken and not st["cast"] and len(g.untapped_lands(1)) >= 2:
                o = option_for(f, taken[0]["id"])
                if o:
                    st["card"], st["cast"], st["turn"] = taken[0]["id"], True, g.turn
                    return o
            return None
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if "Bob" in (o.get("label") or "")),
                        f["options"][0]["actionId"])
        # Which of the four to exile: a Grizzly Bears.
        o = next((o["actionId"] for o in f.get("options", []) if "Grizzly Bears" in (o.get("label") or "")), None)
        if st["gonti"] and o:
            return o
        return DEFAULT

    g = game("gonti", [("Swamp", 30), ("Gonti, Lord of Luxury", 30)],
             deal={1: {"hand": ["Swamp"] * 4 + ["Gonti, Lord of Luxury"] * 3, "top": ["Swamp"] * 6},
                   2: {"hand": ["Forest"] * 7, "top": ["Grizzly Bears"] * 12}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["cast"] and calm(g)
                                   and (any(c["id"] == st["card"] for c in g.mine(1)) or g.turn > st["turn"] + 1))[1],
          max_turn=18)
    w.see()
    found = {"stopped": g.stopped_badly(), "gonti": st["gonti"], "card": st["card"]}
    if st["card"] is None:
        # Not even offered: the bug Amendment 1 fixes would show here.
        taken = next(([c for c in b.get("exile") or [] if c.get("seat") == 2] for b in w.boards(1)[::-1]
                      if [c for c in b.get("exile") or [] if c.get("seat") == 2]), [])
        found["bob's exile"] = taken
        if taken:
            return "wrong", "Alice was never offered the card Gonti exiled", found
        return "inconclusive", "Gonti never exiled a card", found
    problems = [found["stopped"]] if found["stopped"] else []
    card = st["card"]
    mine = [in_pile(b, card)[1] for b in w.boards(1) if in_pile(b, card)[0] == "exile"]
    theirs = [in_pile(b, card)[1] for b in w.boards(2) if in_pile(b, card)[0] == "exile"]
    found["alice"], found["bob"] = mine[-1:], theirs[-1:]
    if not mine or not all(e.get("name") == "Grizzly Bears" and e.get("seat") == 2 and uses(e) == [(1, "cast")]
                           for e in mine):
        problems.append(f"Alice should see Bob's exiled Grizzly Bears, usable by her: {mine[-1:]}")
    if not theirs or not all(e.get("known") is False and e.get("name") == "Face-down" and uses(e) == [(1, "cast")]
                             for e in theirs):
        problems.append(f"Bob should see a face-down card in his exile usable by Alice: {theirs[-1:]}")
    if not any(c["id"] == card for c in g.mine(1)):
        problems.append("the card is not on Alice's battlefield")
    return result(problems, "Gonti's card in Bob's exile usable by Alice (face down to Bob), cast by her from there", found)


def plot():
    st = {"card": None, "turn": None, "cast": False}

    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return seat2_plays("Grizzly Bears")(g, f)
        if f.get("kind") == "chooseSpellAbilityToPlay":
            land = hand_land(g, f)
            if land:
                return land
            if not calm(g) or g.state[1].get("activeSeat") != 1:
                return None
            if st["card"] is None and len(g.untapped_lands(1)) >= 2:
                for c in g.mine(1, zone="hand", name="Slickshot Show-Off"):
                    o = option_for(f, c["id"], contains="Plot")
                    if o:
                        st["card"], st["turn"] = c["id"], g.turn
                        return o
            if st["card"] and not st["cast"] and g.turn > st["turn"]:
                o = option_for(f, st["card"])
                if o:
                    st["cast"] = True
                    return o
            return None
        return DEFAULT

    g = game("plot", [("Mountain", 30), ("Slickshot Show-Off", 30)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Slickshot Show-Off"] * 3, "top": ["Mountain"] * 4}, 2: BEARS_DEAL})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["cast"] and calm(g) and any(c["id"] == st["card"] for c in g.mine(1)))[1],
          max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "card": st["card"], "cast": st["cast"]}
    if not st["cast"]:
        return "inconclusive", "nothing was plotted and cast", found
    problems = [found["stopped"]] if found["stopped"] else []
    both_saw(w, st["card"], [(1, "cast")], problems, "the plotted card")
    steady(w, st["card"], problems, "the plotted card")
    for seat in (1, 2):
        if not any(in_pile(b, st["card"])[1] and in_pile(b, st["card"])[1].get("plotted") for b in w.boards(seat)):
            problems.append(f"seat {seat}: never told the card is plotted")
    if not any(c["id"] == st["card"] for c in g.mine(1)):
        problems.append("the plotted card is not on the battlefield")
    return result(problems, "plotted: in exile, plotted, usable by Alice (both seats); cast from there later", found)


def hideaway():
    """A card a player may only LOOK at (Mosswort Bridge's hidden card) is on Forge's list but has no
    use where it lies: it never stands in the fan (Alice's view) and is never usable (Bob's)."""
    def policy(g, f):
        w.see()
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 1 and kind == "chooseSpellAbilityToPlay":
            if not g.mine(1, name="Mosswort Bridge"):
                return g.option(f, name="Mosswort Bridge", zone="hand", land=True) or hand_land(g, f)
            return hand_land(g, f)
        if seat == 1 and kind not in ("declareAttackers", "declareBlockers") and f.get("options"):
            return f["options"][0]["actionId"]
        return DEFAULT

    g = game("hideaway", [("Forest", 45), ("Mosswort Bridge", 15)], [("Swamp", 60)],
             deal={1: {"hand": ["Mosswort Bridge", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest"],
                       "top": ["Forest"] * 8}})
    w = Watch(g)

    def hidden(b):
        return [c for c in b.get("exile") or [] if c.get("seat") == 1 and c.get("faceDown")]

    g.run(policy, until=lambda g: (w.see(), all(any(hidden(b) for b in w.boards(s)) for s in (1, 2))
                                   and all(not (g.state.get(s) or {}).get("stack") for s in (1, 2)))[1],
          max_turn=6)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        seen = [c for b in w.boards(seat) for c in hidden(b)]
        if not seen:
            return "inconclusive", f"seat {seat} never saw the Bridge hide a card", found
        found[f"seat {seat}"] = seen[-1]
        if seat == 1 and not seen[-1].get("known"):
            problems.append("seat 1: Alice may look at the card she hid (the look the list is made of)")
        if any(c.get("uses") for c in seen):
            problems.append(f"seat {seat}: the hidden card is marked usable: {[c.get('uses') for c in seen][-1]}")
    return result(problems, "Mosswort Bridge's hidden card: Alice may look at it, nobody may use it there", found)


SCENARIOS = {"stage": stage, "giant": giant, "think-twice": think_twice, "foretell": foretell, "suspend": suspend,
             "unearth": unearth, "gonti": gonti, "plot": plot, "hideaway": hideaway}

if __name__ == "__main__":
    worst = 0
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        result_, message, found = scenario()
        code = {"ok": 0, "inconclusive": 2, "wrong": 1}[result_]
        worst = max(worst, code) if worst != 1 else 1
        print(f"{name}: {result_.upper()}: {message}")
        if result_ != "ok":
            print("  " + json.dumps(found, default=str)[:1500])
        sys.stdout.flush()
    sys.exit(worst)
