"""Spec 0061 -- nothing thrown away by one click; say why a card left (Mechanics Lab).

    python -I scripts/check-thrown-away.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is its own small game against Forge.

  cave       F-0061-A, E, D: Alice plays a Mountain, then holds Forgotten
             Cave with the land drop used. The only option offered for the
             Cave is its cycling (`use` "cycling"), and the question carries
             the play it can't make, greyed with why: notNow ["Play it as your
             land", "You've already played a land this turn", use "land"].
             Cycled, the payment question says what it is for (about.pay "to
             cycle Forgotten Cave", about.then "Then Forgotten Cave goes to
             your graveyard and you draw a card."); the Cave goes to her
             graveyard, why "cycled", to both seats; spec 0075: no one is
             told a line for it (Bob's report window says "Alice cycled
             Forgotten Cave and drew a card.", check-card-actions.py).
  handsize   F-0061-C, D: Alice never plays a land; at her cleanup with eight
             cards the discard question says how many (arrange.discard 1);
             the card goes why "discarded" (spec 0097: no word tag);
             spec 0074 Amendment 1: no one is told a line for it (no
             top-of-table notice; the report window explains what the other
             player does).
  countered  F-0061-D: Bob casts Grizzly Bears, Alice counters it: the Bears
             goes from the stack to his graveyard, why "countered" (spec
             0097: no word tag), to both seats; spec 0074
             Amendment 1: no line for it (the report window explains it).
  passed     F-0061-B: both seats follow the stops rule (spec 0035); Alice
             holds only Craw Wurms ({4}{G}{G}) and Forests. At her own Main 1
             with nothing to play her board says so (spec 0097, item 2: the
             act button's "Passing · Nothing to play · N lands, ..."; the
             board's `passing`, her seat only, that turn only -- no grey
             notice any more), and the rest of the turn takes visible time: its END
             step (or the next turn) comes at least 0.8 s later (a 0.4 s
             pause at each step passed for: Main 1, Main 2, ...).
  drew       F-0124-B (spec 0124, owner Q1 "Every step"): Alice's turn
             passes from Main 1 (three Islands, only Air Elementals in
             hand: "Three lands; no land in hand"); her Scroll Thief hits
             Bob and draws an Island. At Main 2 she is asked to play it,
             and the boards sent with that question no longer say
             `passing`; once it is played and nothing else can be, it comes
             back that turn with the reason as it is now ("Four lands; no
             land in hand"). Bob's boards never say it.
             On 1.76.0 the first reason stayed all turn.
  declined   Spec 0124, owner answer 2026-11-28 ("Ordinary button",
             Option B): Alice has six Islands and Air Elemental in hand;
             asked at Main 1 and Main 2 she passes it up (End turn). For the
             rest of that turn none of her boards says `passing`, and her
             End step goes at full speed: from her Main 2 pass to the next
             turn under 0.3 s. Before this answer, "Passing" came back
             from the combat steps and the End step paused 0.4 s.

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its point.
"""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]


def game(name, seat1, seat2, stops=None, deal=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"thrown-away-{name}.jsonl")
    # The Lab's deal (lab.py): each scenario's cards in the opening hand,
    # so its moment never waits on the shuffle.
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, stops=stops, deal=deal)


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


class Watch:
    """Every snapshot each seat was sent, in order, with when it came."""

    def __init__(self, g):
        self.g = g
        self.revisions = {1: -1, 2: -1}
        self.snaps = {1: [], 2: []}
        self.times = {1: [], 2: []}

    def see(self):
        for seat in (1, 2):
            s = self.g.state.get(seat)
            if s and s.get("stateRevision") != self.revisions[seat]:
                self.revisions[seat] = s.get("stateRevision")
                self.snaps[seat].append(s)
                self.times[seat].append(time.monotonic())

    def moves(self, seat):
        return [m for s in self.snaps[seat] for m in s.get("moves") or []]


def to_graveyard(w, seat, card=None, why=None):
    return [m for m in w.moves(seat) if m["to"]["zone"] == "graveyard"
            and (card is None or m.get("card") == card) and (why is None or m.get("why") == why)]


# --- cave ---------------------------------------------------------------------


def cave():
    g = game("cave", [("Mountain", 30), ("Forgotten Cave", 30)], [("Forest", 30), ("Grizzly Bears", 30)],
             deal={1: {"hand": ["Mountain"] * 3 + ["Forgotten Cave"] * 4}})
    w = Watch(g)
    st = {"land_turn": None, "cave": None, "offered": None, "not_now": None, "paid_about": None,
          "cycled": False}

    def policy(g, f):
        w.see()
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if seat == 2:
            if kind == "chooseSpellAbilityToPlay":
                return g.play_land(f) or g.option(f, name="Grizzly Bears", zone="hand", land=False)
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            if st["cycled"]:
                return g.play_land(f, prefer="Mountain") if st["land_turn"] != g.turn else None
            if st["land_turn"] != g.turn:
                o = g.option(f, name="Mountain", land=True)
                if o:
                    st["land_turn"] = g.turn
                    return o
                return None
            caves = g.mine(1, "hand", name="Forgotten Cave")
            if caves and g.untapped_lands(1, name="Mountain") and (g.state.get(1) or {}).get("phase") == "MAIN1":
                cid = caves[0]["id"]
                mine = [o for o in f["options"] if o.get("objectId") == cid]
                st["cave"] = cid
                st["offered"] = [(o.get("use") or {}).get("kind") for o in mine]
                st["not_now"] = (f.get("notNow") or {}).get(cid)
                cycle = next((o for o in mine if (o.get("use") or {}).get("kind") == "cycling"), None)
                if cycle:
                    st["cycled"] = True
                    return cycle["actionId"]
            return None
        if kind == "applyManaToCost" and st["cycled"] and st["paid_about"] is None:
            st["paid_about"] = f.get("about")
            return f["options"][0]["actionId"] if f.get("options") else None
        return DEFAULT

    def until(g):
        w.see()
        return st["cave"] is not None and all(to_graveyard(w, seat, st["cave"]) for seat in (1, 2))

    g.run(policy, until=until, max_turn=24)
    w.see()
    found = {"cave": st["cave"], "offered": st["offered"], "notNow": st["not_now"],
             "about": st["paid_about"], "seat1": to_graveyard(w, 1, st["cave"]),
             "seat2": to_graveyard(w, 2, st["cave"]), "told1": g.notices.get(1), "told2": g.notices.get(2),
             "stopped": g.stopped_badly()}
    if not st["cave"] or not found["seat1"]:
        return "inconclusive", "never held Forgotten Cave with the land drop used and a Mountain", found
    problems = [found["stopped"]] if found["stopped"] else []
    if st["offered"] != ["cycling"]:
        problems.append(f"the Cave's options should be its cycling alone: {st['offered']}")
    want_row = {"label": "Play it as your land", "why": "You've already played a land this turn", "use": "land"}
    if st["not_now"] != [want_row]:
        problems.append(f"the Cave should carry its play, greyed with why: {st['not_now']}")
    about = st["paid_about"] or {}
    if about.get("pay") != "to cycle Forgotten Cave" or \
            about.get("then") != "Then Forgotten Cave goes to your graveyard and you draw a card.":
        problems.append(f"the payment should say what it is for: {about}")
    for seat in (1, 2):
        moved = found[f"seat{seat}"]
        if [(m.get("why"), m.get("said"), m["from"]["zone"]) for m in moved] != [("cycled", None, "hand")]:
            problems.append(f"seat {seat} should be told the Cave was cycled from the hand: {moved}")
    for seat in (1, 2):
        if any(n.startswith("Cycled") for n in g.notices.get(seat) or []):
            problems.append(f"seat {seat} should be told no line for a cycle (spec 0075): {g.notices.get(seat)}")
    return result(problems, "Forgotten Cave after the land drop: cycling alone offered, its play greyed with "
                            "why; 'Pay {R} to cycle Forgotten Cave'; moved as cycled, no top-of-table line", found)


# --- handsize -----------------------------------------------------------------


def handsize():
    g = game("handsize", [("Mountain", 60)], [("Forest", 30), ("Grizzly Bears", 30)])
    w = Watch(g)
    st = {"asked": None, "card": None}

    def policy(g, f):
        w.see()
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if seat == 1 and kind == "chooseSpellAbilityToPlay":
            return None  # never a land: the hand grows
        if seat == 1 and kind == "chooseCardsToDiscardToMaximumHandSize" and st["asked"] is None:
            st["asked"] = {"arrange": f.get("arrange"), "mandatory": f.get("mandatory"),
                           "options": len(f.get("options") or [])}
            st["card"] = f["options"][0].get("objectId")
            return f["options"][0]["actionId"]
        if seat == 2 and kind == "chooseSpellAbilityToPlay":
            return g.play_land(f) or g.option(f, name="Grizzly Bears", zone="hand", land=False)
        return DEFAULT

    def until(g):
        w.see()
        return st["card"] is not None and all(to_graveyard(w, seat, st["card"]) for seat in (1, 2))

    g.run(policy, until=until, max_turn=12)
    w.see()
    found = {"asked": st["asked"], "card": st["card"], "seat1": to_graveyard(w, 1, st["card"]),
             "seat2": to_graveyard(w, 2, st["card"]), "told1": g.notices.get(1), "told2": g.notices.get(2),
             "stopped": g.stopped_badly()}
    if not st["asked"] or not found["seat1"]:
        return "inconclusive", "Alice never discarded to hand size", found
    problems = [found["stopped"]] if found["stopped"] else []
    if (st["asked"]["arrange"] or {}).get("discard") != 1:
        problems.append(f"the question should say one card is to go: {st['asked']}")
    for seat in (1, 2):
        moved = found[f"seat{seat}"]
        if [(m.get("why"), m.get("said")) for m in moved] != [("discarded", None)]:
            problems.append(f"seat {seat} should be told the card was discarded, too many cards: {moved}")
    for seat in (1, 2):
        if any(n.startswith("Discarded") for n in g.notices.get(seat) or []):
            problems.append(f"seat {seat} should be told no line for a discard (spec 0074): {g.notices.get(seat)}")
    return result(problems, "the hand-size discard says how many; the card moves as 'Discarded: too many "
                            "cards', no top-of-table line", found)


# --- countered ----------------------------------------------------------------


def countered():
    g = game("countered", [("Island", 30), ("Counterspell", 30)], [("Forest", 30), ("Grizzly Bears", 30)],
             deal={1: {"hand": ["Island"] * 4 + ["Counterspell"] * 3}, 2: {"hand": ["Forest"] * 4 + ["Grizzly Bears"] * 3}})
    w = Watch(g)
    st = {"cast": False, "bears": None}

    def bears_on_stack(g):
        return [e for e in (g.state.get(1) or {}).get("stack") or [] if e.get("name") == "Grizzly Bears"]

    def policy(g, f):
        w.see()
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            if seat == 2:
                return g.play_land(f) or g.option(f, name="Grizzly Bears", zone="hand", land=False)
            land = g.play_land(f)
            if land:
                return land
            if not st["cast"] and bears_on_stack(g) and len(g.untapped_lands(1)) >= 2:
                o = g.option(f, name="Counterspell", zone="hand", land=False)
                if o:
                    st["cast"] = True
                    return o
            return None
        if kind == "chooseTargetsFor" and seat == 1:
            o = next((o for o in f["options"] if "Grizzly Bears" in (o.get("label") or "")), None)
            if o:
                return o["actionId"]
        return DEFAULT

    def until(g):
        w.see()
        return st["cast"] and all(to_graveyard(w, seat, why="countered") for seat in (1, 2))

    g.run(policy, until=until, max_turn=24)
    w.see()
    found = {"cast": st["cast"], "seat1": to_graveyard(w, 1, why="countered"),
             "seat2": to_graveyard(w, 2, why="countered"),
             "stack_to_graveyard": [m for m in w.moves(2) if m["from"]["zone"] == "stack"
                                    and m["to"]["zone"] == "graveyard"],
             "told1": g.notices.get(1), "told2": g.notices.get(2), "stopped": g.stopped_badly()}
    if not st["cast"] or not found["stack_to_graveyard"]:
        return "inconclusive", "never countered a Grizzly Bears", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        moved = found[f"seat{seat}"]
        if [(m.get("why"), m.get("said"), m["from"]["zone"], m["to"].get("seat")) for m in moved] != \
                [("countered", None, "stack", 2)]:
            problems.append(f"seat {seat} should be told the Bears was countered by Counterspell: {moved}")
    # The Counterspell itself resolved: no reason, no tag.
    if any(m.get("said") for m in found["stack_to_graveyard"] if m.get("why") != "countered"):
        problems.append(f"a spell that resolved carries no tag: {found['stack_to_graveyard']}")
    for seat in (1, 2):
        if any(n.startswith("Countered") for n in g.notices.get(seat) or []):
            problems.append(f"seat {seat} should be told no line for a counter (spec 0074): {g.notices.get(seat)}")
    return result(problems, "a countered Bears moves as 'countered' with no word tag, no top-of-table line; "
                            "the Counterspell that resolved has no tag", found)


# --- passed -------------------------------------------------------------------

# Spec 0097, item 2 -- the board's why, for the act button's "Nothing to play · ...".
# Spec 0113 (W1-246): "Two lands; no land in hand".
WHY = re.compile(r"^(No lands|One land|\w+ lands); "
                 r"(no land in hand|a land already played this turn|no land you can play)$")


def passing_now(s):
    p = s.get("passing") or {}
    return bool(p) and p.get("turn") == s.get("turn")


LATE = {"END_OF_TURN", "CLEANUP"}


def passed():
    g = game("passed", [("Forest", 16), ("Craw Wurm", 44)], [("Forest", 30), ("Grizzly Bears", 30)],
             # No land in the opening hand: Alice's turn 1 has nothing to play.
             stops={1: True, 2: True}, deal={1: {"hand": ["Craw Wurm"] * 7}})
    w = Watch(g)
    st = {"at": None, "gap": None}

    def policy(g, f):
        w.see()
        if f.get("kind") == "chooseSpellAbilityToPlay":
            if f["authorisedSeat"] == 2:
                return g.play_land(f) or g.option(f, name="Grizzly Bears", zone="hand", land=False)
            return g.play_land(f)
        return DEFAULT

    def until(g):
        w.see()
        snaps = w.snaps[1]
        if st["at"] is None:
            for i, s in enumerate(snaps):
                if passing_now(s):
                    st["at"] = i
                    break
        if st["at"] is not None:
            # To the turn's END step or later: a board in between proves
            # nothing (a combat step sends one with nothing to fight -- CI
            # 2026-11-08 timed only Main 1's pause that way, on turn 1).
            # Main 1 and Main 2 at least are passed for, 0.4 s each.
            turn = snaps[st["at"]].get("turn")
            for i in range(st["at"] + 1, len(snaps)):
                if snaps[i].get("turn") != turn or snaps[i].get("phase") in LATE:
                    st["gap"] = w.times[1][i] - w.times[1][st["at"]]
                    st["until"] = f'turn {snaps[i].get("turn")} {snaps[i].get("phase")}'
                    return True
        return False

    g.run(policy, until=until, max_turn=20)
    w.see()
    told = [n for n in g.notices.get(1) or [] if n.startswith("Nothing you can play")]
    board = w.snaps[1][st["at"]] if st["at"] is not None else {}
    why = (board.get("passing") or {}).get("why")
    # Gone at the turn line: no board of a later turn still says it.
    later = [s.get("turn") for s in w.snaps[1][(st["at"] or 0):]
             if s.get("turn") != board.get("turn") and s.get("passing")]
    # Bob's board of the same round: nothing new told him (his own turns may be passed too).
    revision = board.get("stateRevision")
    bob = [i for i, s in enumerate(w.snaps[2]) if s.get("stateRevision") == revision]
    bob_new = []
    if bob and bob[0] > 0:
        before, now = w.snaps[2][bob[0] - 1], w.snaps[2][bob[0]]
        k = (now.get("noticesTotal") or 0) - (before.get("noticesTotal") or 0)
        bob_new = (now.get("notices") or [])[-k:] if k > 0 else []
    bob_passing = [s.get("turn") for s in w.snaps[2] if s.get("turn") == board.get("turn") and s.get("passing")]
    found = {"told": told, "why": why, "later": later, "bob_passing": bob_passing,
             "phase": board.get("phase"), "active": board.get("activeSeat"),
             "noticesTotal": board.get("noticesTotal"), "gap_s": st["gap"], "until": st.get("until"),
             "bob_told": [n for n in bob_new if n.startswith("Nothing you can play")],
             "stopped": g.stopped_badly()}
    if st["at"] is None or st["gap"] is None:
        return "inconclusive", "Alice's turn was never passed for want of anything to play", found
    problems = [found["stopped"]] if found["stopped"] else []
    if told:
        problems.append(f"spec 0097: no grey notice for a passed turn any more: {told}")
    if not WHY.match(why or ""):
        problems.append(f"the act button's why: {why!r}")
    if later:
        problems.append(f"the passed turn should be gone at the turn line, still said on turns {later}")
    if board.get("phase") != "MAIN1" or board.get("activeSeat") != 1:
        problems.append(f"the passed turn should be said from Alice's own Main 1: {board.get('phase')}, "
                        f"seat {board.get('activeSeat')}")
    if found["bob_told"] or found["bob_passing"]:
        problems.append(f"Bob must not be told Alice's turn was passed: {found['bob_told']} {found['bob_passing']}")
    if st["gap"] < 0.8:
        problems.append(f"the passed turn's steps should take visible time (>= 0.8 s), took {st['gap']:.2f} s")
    return result(problems, f"Alice's board says it from her Main 1 ('Nothing to play · {why}'), Bob's not; "
                            f"gone at the turn line; the rest of the "
                            f"turn took {st['gap']:.2f} s", found)


# --- drew -------------------------------------------------------------------


def drew():
    """F-0124-B: "Nothing to play" re-checked at every step of the turn."""
    # Alice: three Islands, Scroll Thief and Air Elementals (five mana) in
    # her opening hand; her draws are Air Elementals until the fifth, an
    # Island. The Thief attacks only when its hit will be that fifth draw
    # (on the play or on the draw alike), so the Island comes mid-turn.
    g = game("drew", [("Island", 4), ("Scroll Thief", 1), ("Air Elemental", 55)], [("Mountain", 60)],
             stops={1: True, 2: True},
             deal={1: {"hand": ["Island"] * 3 + ["Scroll Thief"] + ["Air Elemental"] * 3,
                       "top": ["Air Elemental"] * 4 + ["Island"]}})
    w = Watch(g)
    st = {"library0": None, "attacked": None, "main1": None, "asked_main2": None, "asked_board": None,
          "after": None, "played": False}

    def alice():
        return g.state.get(1) or {}

    def draws():
        me = next((p for p in alice().get("players", []) if p.get("seat") == 1), {})
        if st["library0"] is None and alice().get("turn"):
            st["library0"] = me.get("libraryCount")
        return (st["library0"] or 0) - (me.get("libraryCount") or 0)

    def policy(g, f):
        w.see()
        draws()
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            return g.play_land(f) if kind == "chooseSpellAbilityToPlay" else DEFAULT
        board = alice()
        if kind == "declareAttackers":
            thief = next((o["actionId"] for o in f.get("options", [])
                          if (o.get("label") or "").startswith("Scroll Thief")), None)
            if thief and draws() == 4 and st["attacked"] is None:
                st["attacked"] = board.get("turn")
                return thief
            return None
        if kind == "chooseSpellAbilityToPlay":
            if st["attacked"] is not None and board.get("turn") == st["attacked"]                     and board.get("phase") == "MAIN2" and not st["played"]:
                # Asked after the Thief's draw: the boards sent with it.
                st["asked_main2"] = board.get("turn")
                st["asked_board"] = board.get("passing")
                land = g.play_land(f)
                st["played"] = land is not None
                return land
            land = g.play_land(f)
            if land:
                return land
            return g.option(f, name="Scroll Thief", zone="hand")
        return DEFAULT

    def until(g):
        w.see()
        draws()
        board = alice()
        if st["attacked"] is None and board.get("passing") and draws() == 4 and board.get("phase") == "MAIN1":
            st["main1"] = (board.get("passing") or {}).get("why")
        if st["played"] and board.get("turn") == st["attacked"] and board.get("passing"):
            st["after"] = (board.get("passing") or {}).get("why")
            return True
        return st["attacked"] is not None and (board.get("turn") or 0) > st["attacked"]

    g.run(policy, until=until, max_turn=16)
    w.see()
    turn = st["attacked"]
    bob = [s.get("turn") for s in w.snaps[2] if s.get("passing") and s.get("turn") == turn]
    found = dict(st, bob_passing=bob, stopped=g.stopped_badly())
    if turn is None or not st["asked_main2"]:
        return "inconclusive", "the Thief never drew the Island mid-turn, or Alice was never asked at Main 2", found
    problems = [found["stopped"]] if found["stopped"] else []
    if st["main1"] != "Three lands; no land in hand":
        problems.append(f"Main 1 should pass for her with 'Three lands; no land in hand': {st['main1']!r}")
    if st["asked_board"]:
        problems.append(f"asked at Main 2 (an Island to play), her board still says passing: {st['asked_board']}")
    if st["after"] != "Four lands; no land in hand":
        problems.append(f"once played, passing should come back with the reason as it is now: {st['after']!r}")
    if bob:
        problems.append(f"Bob's boards must never say Alice's turn is passing: turns {bob}")
    return result(problems, f"passing from Main 1 ({st['main1']!r}); gone when asked at Main 2 after the "
                            f"Thief's draw; back with {st['after']!r}; Bob never told", found)


# --- declined ---------------------------------------------------------------


def declined():
    """Spec 0124, owner answer 2026-11-28 ("Ordinary button")."""
    # Alice: Islands and one Air Elemental in hand, Islands on top. She plays
    # a land every turn; from her fifth land the Elemental can be cast, and
    # she never casts it: asked, she passes (End turn).
    g = game("declined", [("Island", 40), ("Air Elemental", 20)], [("Mountain", 60)],
             stops={1: True, 2: True},
             deal={1: {"hand": ["Island"] * 6 + ["Air Elemental"], "top": ["Island"] * 8}})
    w = Watch(g)
    st = {"turn": None, "lands": None, "passes": 0, "main2_at": None, "next_at": None, "after": []}

    def alice():
        return g.state.get(1) or {}

    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return g.play_land(f) if f.get("kind") == "chooseSpellAbilityToPlay" else DEFAULT
        if f.get("kind") != "chooseSpellAbilityToPlay":
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        board = alice()
        lands = len([c for c in g.mine(1) if c.get("kind") == "land"])
        elemental = g.option(f, name="Air Elemental", zone="hand")
        if elemental and lands >= 6 and board.get("activeSeat") == 1 and board.get("phase") in ("MAIN1", "MAIN2"):
            if st["turn"] is None:
                st["turn"], st["lands"] = board.get("turn"), lands
            if board.get("turn") == st["turn"]:
                st["passes"] += 1
                if board.get("phase") == "MAIN2":
                    st["main2_at"] = time.monotonic()
        return None  # never cast it: End turn

    def until(g):
        w.see()
        board = alice()
        done = st["turn"] is not None and (board.get("turn") or 0) > st["turn"]
        if done and st["next_at"] is None:
            st["next_at"] = time.monotonic()
        return done

    g.run(policy, until=until, max_turn=20)
    w.see()
    turn = st["turn"]
    # Every board of that turn sent after her first pass with the Elemental on offer.
    asked_at = None
    for i, s in enumerate(w.snaps[1]):
        if s.get("turn") == turn and s.get("phase") in ("MAIN1", "MAIN2"):
            asked_at = i
            break
    after = [(s.get("phase"), (s.get("passing") or {}).get("why")) for s in w.snaps[1][(asked_at or 0):]
             if s.get("turn") == turn and passing_now(s)]
    phases = sorted({s.get("phase") for s in w.snaps[1] if s.get("turn") == turn})
    # From her End turn at Main 2 to the next turn: the End step at full
    # speed (on the branch before this answer it paused 0.4 s there).
    gap = st["next_at"] - st["main2_at"] if st["main2_at"] and st["next_at"] else None
    found = dict(st, after=after, phases=phases, gap_s=gap, stopped=g.stopped_badly())
    if turn is None or not st["passes"] or gap is None:
        return "inconclusive", "Alice never passed up Air Elemental at Main 2 with six lands, or the next turn never came", found
    problems = [found["stopped"]] if found["stopped"] else []
    if after:
        problems.append(f"she passed up Air Elemental on turn {turn}; 'Passing' must not come back that turn: {after}")
    if gap >= 0.3:
        problems.append(f"the End step after she passed it up should be at full speed (< 0.3 s), took {gap:.2f} s")
    return result(problems, f"turn {turn}: {st['lands']} lands, Air Elemental passed up {st['passes']} time(s); "
                            f"no 'Passing' for the rest of the turn; Main 2 to the next turn {gap:.2f} s", found)


SCENARIOS = {"cave": cave, "handsize": handsize, "countered": countered, "passed": passed, "drew": drew,
             "declined": declined}

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
