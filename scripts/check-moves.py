"""Phase 10 A-00 -- every card's move, as Forge made it (Mechanics Lab).

    python -I scripts/check-moves.py <worker.jar> <res-root> [trace] [scenario...]

The board used to guess where a card went by comparing two snapshots (a
card put into a library was drawn going to exile). Now each snapshot round
carries `moves`: where from, where to, and why a card left the battlefield.

  destroy    Murder on a Grizzly Bears: both seats are told card, from the
             battlefield, to its owner's graveyard, why "destroyed" (and,
             spec 0066, no tag: no "said", the shatter shows it).
  sacrifice  Innocent Blood (each player sacrifices a creature): both
             leave as "sacrificed", never "destroyed".
  bounce     Unsummon on Bob's Grizzly Bears: both seats told it went from
             his battlefield to his hand, with no `where` (Phase 10 A-14);
             Bob is told WHICH card (the one targeted), Alice is not: it is
             in a hand she can't see (2026-11-08, no live id for a card in a
             zone hidden from the viewer -- HiddenIds).
  top        Griptide on the Bears: to his library, `where` "top", both seats.
  bottom     Hallowed Burial with a Savannah Lions of Alice's and Bob's
             Bears out: each to its OWNER's library, `where` "bottom".
  shuffled   Chaos Warp on the Bears: to his library, `where` "shuffled"
             (Forge moves it, then shuffles: the shuffle replaces any place).
  lapse      Memory Lapse on Bob's Bears spell: from the STACK to the top of
             his library.
             A card that went into a library is named to nobody (a library
             is hidden from its owner too): the place, never the card.
  hidden     over every snapshot of all the games: a move the seat can't see
             at either end (the other player drawing) never names the card;
             one whose card is now where the seat can see it always does --
             unless the other seat's own snapshot of that round shows the
             card back in its hand (a cast Forge took back without a move);
             a move into a library never names it; a seat's own draws are
             named.

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its point.
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


# The Lab's deal (lab.py): Bob's creatures in his opening hand.
BOB = {"hand": ["Forest"] * 4 + ["Grizzly Bears"] * 3}


def game(name, seat1, seat2, deal=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"moves-{name}.jsonl")
    # The Lab's deal (lab.py): each scenario's cards in the opening hand,
    # so its moment never waits on the shuffle.
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal)


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


WATCHES = []


class Watch:
    """Every snapshot each seat was sent, in order."""

    def __init__(self, g):
        self.g = g
        WATCHES.append(self)
        self.revisions = {1: -1, 2: -1}
        self.snaps = {1: [], 2: []}

    def see(self):
        for seat in (1, 2):
            s = self.g.state.get(seat)
            if s and s.get("stateRevision") != self.revisions[seat]:
                self.revisions[seat] = s.get("stateRevision")
                self.snaps[seat].append(s)

    def moves(self, seat):
        return [m for s in self.snaps[seat] for m in s.get("moves") or []]


def names(snaps):
    out = {}
    for s in snaps:
        for zone in ("battlefield", "hand", "graveyard", "exile"):
            for c in s.get(zone) or []:
                out[c["id"]] = c.get("name")
    return out


# --- destroy ------------------------------------------------------------------


def destroy():
    g = game("destroy", [("Swamp", 30), ("Murder", 30)], [("Forest", 30), ("Grizzly Bears", 30)],
             deal={1: {"hand": ["Swamp"] * 4 + ["Murder"] * 3, "top": ["Swamp"] * 2}, 2: BOB})
    w = Watch(g)
    st = {"cast": False, "target": None}

    def policy(g, f):
        w.see()
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 2:
                return g.option(f, name="Grizzly Bears", zone="hand", land=False)
            bears = [c for c in g.mine(2) if c.get("name") == "Grizzly Bears"]
            if not st["cast"] and bears and len(g.untapped_lands(1, name="Swamp")) >= 3:
                o = g.option(f, name="Murder", zone="hand", land=False)
                if o:
                    st["cast"] = True
                    return o
            return None
        if kind == "chooseTargetsFor" and seat == 1:
            o = next((o for o in f["options"] if "Grizzly Bears" in (o.get("label") or "")), None)
            if o:
                st["target"] = o.get("objectId")
                return o["actionId"]
        return DEFAULT

    def until(g):
        w.see()
        return st["target"] is not None and any(
            m.get("card") == st["target"] and m["to"]["zone"] == "graveyard" for m in w.moves(1)) and any(
            m.get("card") == st["target"] and m["to"]["zone"] == "graveyard" for m in w.moves(2))

    g.run(policy, until=until, max_turn=30)
    w.see()
    found = {"target": st["target"], "stopped": g.stopped_badly(),
             "seat1": [m for m in w.moves(1) if m.get("card") == st["target"]],
             "seat2": [m for m in w.moves(2) if m.get("card") == st["target"]]}
    if not st["target"] or not found["seat1"]:
        return "inconclusive", "never Murdered a Grizzly Bears", found
    problems = [found["stopped"]] if found["stopped"] else []
    want = {"card": st["target"], "from": {"zone": "battlefield", "seat": 2},
            "to": {"zone": "graveyard", "seat": 2}, "why": "destroyed"}
    for seat in (1, 2):
        died = [m for m in found[f"seat{seat}"] if m["from"]["zone"] == "battlefield"]
        if died != [want]:
            problems.append(f"seat {seat} should be told {want}: {died}")
    return result(problems, "Murder: both seats told the Bears went from Bob's battlefield to his graveyard, "
                            "destroyed", found)


# --- sacrifice ----------------------------------------------------------------


def sacrifice():
    # Plenty of each: CI 2026-11-06 twice ran out of turns before both sides
    # had a creature and seat 1 an Innocent Blood.
    g = game("sacrifice", [("Swamp", 22), ("Walking Corpse", 20), ("Innocent Blood", 18)],
             [("Forest", 24), ("Grizzly Bears", 36)],
             deal={1: {"hand": ["Swamp"] * 4 + ["Walking Corpse"] * 2 + ["Innocent Blood"],
                       "top": ["Swamp"] * 3}, 2: BOB})
    w = Watch(g)
    st = {"cast": False}

    def policy(g, f):
        w.see()
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 2:
                return g.option(f, name="Grizzly Bears", zone="hand", land=False)
            if (g.state.get(1) or {}).get("stack"):
                return None
            mine = [c for c in g.mine(1) if c.get("name") == "Walking Corpse"]
            theirs = [c for c in g.mine(2) if c.get("name") == "Grizzly Bears"]
            # Again until a sacrifice is seen: a cast with no Swamp left
            # untapped is cancelled (CI 2026-11-06 cast it once, after the
            # Corpse had used the mana, and never again).
            sacrificed = any(m.get("why") == "sacrificed" for m in w.moves(1))
            if not sacrificed and mine and theirs and g.untapped_lands(1, name="Swamp"):
                o = g.option(f, name="Innocent Blood", zone="hand", land=False)
                if o:
                    st["cast"] = True
                    return o
            if not mine:
                return g.option(f, name="Walking Corpse", zone="hand", land=False)
            return None
        return DEFAULT

    def until(g):
        w.see()
        return st["cast"] and all(
            len([m for m in w.moves(seat) if m.get("why") == "sacrificed"]) >= 2 for seat in (1, 2))

    g.run(policy, until=until, max_turn=40)
    w.see()
    gone = {seat: [m for m in w.moves(seat) if m["from"]["zone"] == "battlefield"] for seat in (1, 2)}
    found = {"stopped": g.stopped_badly(), "left": gone}
    if not st["cast"] or len(gone[1]) < 2:
        return "inconclusive", "never cast Innocent Blood with a creature on each side", found
    problems = [found["stopped"]] if found["stopped"] else []
    n = names(w.snaps[1])
    for seat in (1, 2):
        sac = sorted((n.get(m.get("card")), m["to"].get("seat")) for m in gone[seat] if m.get("why") == "sacrificed")
        if sac != [("Grizzly Bears", 2), ("Walking Corpse", 1)]:
            problems.append(f"seat {seat}: a Corpse and a Bears, sacrificed, each to its owner's graveyard: {gone[seat]}")
        if any(m.get("why") == "destroyed" for m in gone[seat]):
            problems.append(f"seat {seat}: a sacrifice is not 'destroyed': {gone[seat]}")
    return result(problems, "Innocent Blood: the Corpse and the Bears leave as 'sacrificed', to both seats", found)


# --- back to a hand, onto / into a library (Phase 10 A-14) ---------------------


def sends_back(name, seat1, spell, mana, wants, mine=None, respond=False):
    """Seat 1 casts `spell` (needing `mana` untapped lands) at Bob's Grizzly
    Bears -- on the battlefield, or, with `respond`, as a spell on the stack.
    `mine`: a creature Alice casts first. `wants`: {owner seat: (zone,
    where)} for each creature card that must be told moved, to both seats."""
    land = seat1[0][0]
    hand = [land] * 5 + [mine, spell] if mine else [land] * 4 + [spell] * 3
    g = game(name, seat1, [("Forest", 30), ("Grizzly Bears", 30)],
             deal={1: {"hand": hand, "top": [land] * 4}, 2: BOB})
    w = Watch(g)
    st = {"cast": False, "targets": set()}

    def bears_on_stack(g):
        return [c for c in (g.state.get(1) or {}).get("stack") or [] if c.get("name") == "Grizzly Bears"]

    def policy(g, f):
        w.see()
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 2:
                return g.option(f, name="Grizzly Bears", zone="hand", land=False)
            if st["cast"]:
                return None
            lands = len(g.untapped_lands(1))
            if mine and not g.mine(1, name=mine):
                if (g.state.get(1) or {}).get("stack"):
                    return None
                return g.option(f, name=mine, zone="hand", land=False)
            ready = bears_on_stack(g) if respond else \
                [c for c in g.mine(2) if c.get("name") == "Grizzly Bears"] and not (g.state.get(1) or {}).get("stack")
            if ready and lands >= mana:
                o = g.option(f, name=spell, zone="hand", land=False)
                if o:
                    st["cast"] = True
                    return o
            return None
        if kind == "chooseTargetsFor" and seat == 1:
            o = next((o for o in f["options"] if "Grizzly Bears" in (o.get("label") or "")), None)
            if o:
                st["targets"].add(o.get("objectId"))
                return o["actionId"]
        return DEFAULT

    def told(seat):
        return [m for m in w.moves(seat) if m["to"]["zone"] in ("hand", "library")
                and m["from"]["zone"] in ("battlefield", "stack")]

    def until(g):
        w.see()
        return st["cast"] and all(len({m["to"].get("seat") for m in told(seat)}) >= len(wants) for seat in (1, 2)) \
            and not (g.state.get(1) or {}).get("stack")

    g.run(policy, until=until, max_turn=30)
    w.see()
    found = {"cast": st["cast"], "targets": sorted(st["targets"]), "stopped": g.stopped_badly(),
             "seat1": told(1), "seat2": told(2)}
    if not st["cast"] or not found["seat1"]:
        return "inconclusive", f"never cast {spell} with its creature(s) there", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        # A set: Hallowed Burial takes every Bears Bob has out.
        got = sorted({(m["to"].get("seat"), m["to"]["zone"], m.get("where")) for m in found[f"seat{seat}"]})
        want = sorted((owner, zone, where) for owner, (zone, where) in wants.items())
        if got != want:
            problems.append(f"seat {seat} should be told {want}: {found[f'seat{seat}']}")
        # Named only to a seat that can see where it went: its owner's own
        # hand. A library, or the other player's hand, gets no card (HID-003:
        # both halves -- the owner must still be told which one).
        for m in found[f"seat{seat}"]:
            sees = m["to"]["zone"] == "hand" and m["to"].get("seat") == seat
            if sees and "card" not in m:
                problems.append(f"seat {seat}: a card back in its own hand is not named: {m}")
            if not sees and "card" in m:
                problems.append(f"seat {seat}: names {m['card']}, now in a zone hidden from it: {m}")
        # A stack entry's id is not its card's (stack:N): the spell is the
        # one Bears spell anyway.
        named = {m.get("card") for m in found[f"seat{seat}"]} - {None}
        if st["targets"] and not respond and named and not named & st["targets"]:
            problems.append(f"seat {seat}: the targeted card is not the one told moved")
        from_zone = "stack" if respond else "battlefield"
        if any(m["from"]["zone"] != from_zone for m in found[f"seat{seat}"]):
            problems.append(f"seat {seat}: should move from the {from_zone}")
    return result(problems, f"{spell}: both seats told {sorted(wants.items())}", found)


def bounce():
    return sends_back("bounce", [("Island", 30), ("Unsummon", 30)], "Unsummon", 1, {2: ("hand", None)})


def top():
    return sends_back("top", [("Island", 30), ("Griptide", 30)], "Griptide", 4, {2: ("library", "top")})


def bottom():
    return sends_back("bottom", [("Plains", 26), ("Savannah Lions", 14), ("Hallowed Burial", 20)],
                      "Hallowed Burial", 5, {1: ("library", "bottom"), 2: ("library", "bottom")},
                      mine="Savannah Lions")


def shuffled():
    return sends_back("shuffled", [("Mountain", 30), ("Chaos Warp", 30)], "Chaos Warp", 3,
                      {2: ("library", "shuffled")})


def lapse():
    return sends_back("lapse", [("Island", 30), ("Memory Lapse", 30)], "Memory Lapse", 2,
                      {2: ("library", "top")}, respond=True)


# --- hidden -------------------------------------------------------------------


def visible(place, viewer):
    zone = place["zone"]
    if zone in ("battlefield", "stack", "merged", "graveyard", "command"):
        return True
    if zone == "hand":
        return place.get("seat") == viewer
    return None if zone == "exile" else False  # exile: depends on face-down


def hidden():
    checked = 0
    wrong = []
    own_draws = {1: 0, 2: 0}
    their_draws = {1: 0, 2: 0}
    taken_back = 0
    for w in WATCHES:
        by_rev = {seat: {s.get("stateRevision"): s for s in w.snaps[seat]} for seat in (1, 2)}
        for seat in (1, 2):
            other = 3 - seat
            for snap in w.snaps[seat]:
                pair = by_rev[other].get(snap.get("stateRevision"))
                theirs = (pair or {}).get("moves") or []
                their_hand = {c.get("id") for c in (pair or {}).get("hand") or []}
                for i, m in enumerate(snap.get("moves") or []):
                    checked += 1
                    a, b = visible(m["from"], seat), visible(m["to"], seat)
                    if b is True and "card" not in m:
                        # The other seat's view of the same move, same round:
                        # its card back in that seat's hand is hidden from this one.
                        twin = theirs[i] if i < len(theirs) else {}
                        if twin.get("card") in their_hand:
                            taken_back += 1
                        elif pair is not None:
                            wrong.append(("should name the card", seat, m))
                    if a is False and b is False and "card" in m:
                        wrong.append(("must not name the card", seat, m))
                    if m["to"]["zone"] == "library" and "card" in m:
                        wrong.append(("names a card now in a library", seat, m))
                    if m.get("card") in their_hand:
                        wrong.append(("names a card now in the other player's hand", seat, m))
                    if "why" in m and "card" not in m:
                        wrong.append(("a why without its card", seat, m))
                    if m["from"]["zone"] == "library" and m["to"]["zone"] == "hand":
                        if m["to"].get("seat") == seat:
                            own_draws[seat] += 1 if "card" in m else 0
                        else:
                            their_draws[seat] += 1 if "card" not in m else 0
    found = {"checked": checked, "wrong": wrong[:6], "own_draws": own_draws, "their_draws": their_draws,
             "taken back into a hand, unnamed": taken_back}
    if checked < 50 or not all(own_draws.values()) or not all(their_draws.values()):
        return "inconclusive", f"too few moves seen: {found}", found
    problems = [f"{x[0]} (seat {x[1]}): {x[2]}" for x in wrong[:4]]
    return result(problems, f"{checked} moves: the other player's draws never named, every visible move named",
                  found)


SCENARIOS = {"destroy": destroy, "sacrifice": sacrifice, "bounce": bounce, "top": top, "bottom": bottom,
             "shuffled": shuffled, "lapse": lapse, "hidden": hidden}

if __name__ == "__main__":
    worst = 0
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        verdict_, message, found = scenario()
        code = {"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_]
        worst = 1 if 1 in (worst, code) else max(worst, code)
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:2000])
        sys.stdout.flush()
    sys.exit(worst)
