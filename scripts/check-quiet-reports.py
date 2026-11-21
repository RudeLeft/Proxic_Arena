"""No report window for what the animation showed -- spec 0109, item 7 (owner 2026-11-20, canvas "7" A).

    python -I scripts/check-quiet-reports.py <worker.jar> <res-root> [trace-dir|trace.jsonl] [scenario...]

Bob (seat 2) does something to Alice's (seat 1) card, or she to his. A
report window used to tell the player who did not act; now there is none
when the cause's arrow pointed at the card, it landed where every player
sees it, nothing was hidden and it was the effect's one visible result
(ActionReports#quiet). The play log keeps a line, and the board shows the
move (its `moves`), for both seats.

F-0109-C -- no window, for either seat; a play-log line naming the card,
for both; the move on both seats' boards:

  mist-raven     Bob's Mist Raven's trigger returns Alice's Grizzly Bears to
                 her hand
  unsummon       Bob's Unsummon on Alice's Bears
  repulse        Bob's Repulse on Alice's Bears, and he draws a card (a draw
                 is another result the table shows: still no window)
  raise-dead     Alice bolts Bob's Bears; Bob's Raise Dead, aimed at it in his
                 graveyard, returns it to his hand (RETURN: Alice was told)
  counterspell   Bob's Counterspell on Alice's Bears spell: to her graveyard
  act-of-treason Bob's Act of Treason takes Alice's Bears (Forge's GainControl:
                 there was never a report; a control change is no Kind.CONTROL,
                 which is Mindslaver's turn)

F-0109-D -- the window stays (one of the five tests fails):

  griptide       Bob's Griptide puts Alice's Bears on top of her library
                 (test 2: a library can't be seen): "Bob put your Grizzly Bears
                 on top of your library."
  untargeted     Bob's Evacuation returns every creature (test 1: no arrow):
                 Alice reads "Bob returned your Grizzly Bears to your hand."
  mixed          Bob's Psychic Strike counters Alice's Bears and mills two of
                 her cards (tests 3-4: another result, out of a library):
                 Alice reads "Bob countered your Grizzly Bears."
  fizzle         Alice's Lightning Bolt at Bob's Bears; Bob Unsummons his own
                 Bears in answer: the Bolt fizzles and both read "... did
                 nothing" (test 5: a non-event; a fizzle keeps its window)

F-0109-E -- no report taken away carried a hidden fact: in every quiet
scenario each seat's own board (`moves`) shows the card's move, and it went
where that seat may see it (a hand, a graveyard, the battlefield), never
into a library or face down. griptide is the bite: with test 2 removed it
loses its window and fails here.

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]

BEARS = [("Forest", 30), ("Grizzly Bears", 30)]
BEARS_DEAL = {"hand": ["Forest"] * 4 + ["Grizzly Bears"] * 3, "top": ["Forest"] * 4}


def game(name, seat1, seat2, deal):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"quiet-reports-{name}.jsonl")
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
                self.seen[seat][s.get("stateRevision")] = s

    def boards(self, seat):
        return list(self.seen[seat].values())

    def moves(self, seat):
        return [m for s in self.boards(seat) for m in (s.get("moves") or [])]

    def reports(self, seat):
        """Every report this seat was sent (the newest and the gathered), once each by key."""
        out = {}
        for s in self.boards(seat):
            a = s.get("action")
            if not a:
                continue
            for r in [a, *(a.get("gathered") or [])]:
                out.setdefault(r.get("key"), r)
        return list(out.values())

    def log(self, seat):
        lines, seen = [], set()
        for s in self.boards(seat):
            for line in s.get("playLog") or []:
                if line.get("n") in seen:
                    continue
                seen.add(line.get("n"))
                lines.append("".join(p if isinstance(p, str) else p.get("name") or f"<{p.get('player')}>"
                                     for p in line.get("parts") or []))
        return lines


def named(g, f, name):
    """The option that casts [name] from the asked seat's hand."""
    seat = f["authorisedSeat"]
    for o in f["options"]:
        label = o.get("label") or ""
        if o.get("payable") is False or "Play land" in label:
            continue
        cid = card_of(o.get("actionId"))
        if any(c.get("id") == cid and c.get("name") == name for c in g.zone(seat, "hand")):
            return o["actionId"]
    return None


def stack_of(g, seat):
    return (g.state.get(seat) or {}).get("stack") or []


def lands(g, seat, name):
    return len(g.untapped_lands(seat, name))


def target_card(f, card_id):
    return next((o["actionId"] for o in f.get("options") or [] if card_id and o.get("objectId") == card_id), None)


def bears_of(g, viewer, owner, zone="battlefield"):
    found = g.zone(viewer, zone, owner=owner, name="Grizzly Bears")
    return found[0]["id"] if found else None


# --- the scenarios ----------------------------------------------------------------------
#
# Each returns (decks, deal, policy) and names its card, the seat that acts,
# the card id's move it waits for (from, to), and what it expects.


def at_alices_bears(card, mana, deck, cost):
    """Bob casts [card] at Alice's Bears once she has one and he has [cost] untapped [mana]."""

    def policy(g, f):
        seat, kind = f["authorisedSeat"], f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 1:
                return None if stack_of(g, 1) else named(g, f, "Grizzly Bears")
            if not stack_of(g, 2) and bears_of(g, 2, 1) and lands(g, 2, mana) >= cost:
                return named(g, f, card)
            return None
        if kind == "chooseTargetsFor" and seat == 2:
            return target_card(f, bears_of(g, 2, 1)) or DEFAULT
        return DEFAULT

    return {"decks": (BEARS, deck), "deal": {1: BEARS_DEAL, 2: {"hand": [mana] * 4 + [card] * 3, "top": [mana] * 6}},
            "policy": policy, "card": card, "owner": 1}


def raise_dead():
    """Alice bolts Bob's Bears; Bob's Raise Dead brings it back to his hand."""

    def policy(g, f):
        seat, kind = f["authorisedSeat"], f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f, prefer="Swamp" if seat == 2 and not g.untapped_lands(2, "Swamp") else None)
            if land:
                return land
            if stack_of(g, seat):
                return None
            if seat == 1:
                if bears_of(g, 1, 2) and lands(g, 1, "Mountain") >= 1:
                    return named(g, f, "Lightning Bolt")
                return None
            if bears_of(g, 2, 2, "graveyard") and lands(g, 2, "Swamp") >= 1:
                return named(g, f, "Raise Dead")
            if not bears_of(g, 2, 2) and not bears_of(g, 2, 2, "graveyard") and lands(g, 2, "Forest") >= 1 \
                    and len(g.untapped_lands(2)) >= 2:
                return named(g, f, "Grizzly Bears")
            return None
        if kind == "chooseTargetsFor":
            if seat == 1:
                return target_card(f, bears_of(g, 1, 2)) or DEFAULT
            return target_card(f, bears_of(g, 2, 2, "graveyard")) or DEFAULT
        return DEFAULT

    return {"decks": ([("Mountain", 30), ("Lightning Bolt", 30)],
                      [("Forest", 15), ("Swamp", 15), ("Grizzly Bears", 15), ("Raise Dead", 15)]),
            "deal": {1: {"hand": ["Mountain"] * 4 + ["Lightning Bolt"] * 3, "top": ["Mountain"] * 6},
                     2: {"hand": ["Forest", "Swamp", "Forest", "Swamp", "Grizzly Bears", "Raise Dead", "Raise Dead"],
                         "top": ["Swamp", "Forest", "Swamp", "Forest"]}},
            "policy": policy, "card": "Raise Dead", "owner": 2, "from": "graveyard"}


def at_alices_spell(card, cost):
    """Alice casts Bears; Bob answers with [card] once it is on the stack."""

    def policy(g, f):
        seat, kind = f["authorisedSeat"], f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 1:
                return None if stack_of(g, 1) else named(g, f, "Grizzly Bears")
            on = stack_of(g, 2)
            if on and on[0].get("name") == "Grizzly Bears" and all(lands(g, 2, m) >= n for m, n in cost):
                return named(g, f, card)
            return None
        if kind == "chooseTargetsFor" and seat == 2:
            return next((o["actionId"] for o in f.get("options") or []
                         if "stack:" in o["actionId"] and "Grizzly Bears" in (o.get("label") or "")), DEFAULT)
        return DEFAULT

    mana = [m for m, _ in cost]
    deck = [(m, 30 // len(mana)) for m in mana] + [(card, 30)]
    hand = (mana * 4)[:4] + [card] * 3
    return {"decks": (BEARS, deck), "deal": {1: BEARS_DEAL, 2: {"hand": hand, "top": (mana * 3)[:6]}},
            "policy": policy, "card": card, "owner": 1, "from": "stack"}


def fizzle():
    """Alice's Bolt at Bob's Bears; Bob Unsummons his own Bears in answer."""

    def policy(g, f):
        seat, kind = f["authorisedSeat"], f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f, prefer="Forest" if seat == 2 and not g.mine(2, name="Forest") else None)
            if land:
                return land
            on = stack_of(g, seat)
            if seat == 2:
                if on and on[0].get("name") == "Lightning Bolt" and lands(g, 2, "Island") >= 1:
                    return named(g, f, "Unsummon")
                if not on and not bears_of(g, 2, 2) and lands(g, 2, "Forest") >= 1 and len(g.untapped_lands(2)) >= 3:
                    return named(g, f, "Grizzly Bears")
                return None
            if not on and bears_of(g, 1, 2) and lands(g, 1, "Mountain") >= 1 \
                    and any(c.get("name") == "Island" and not c.get("tapped") for c in g.mine(2)):
                return named(g, f, "Lightning Bolt")
            return None
        if kind == "chooseTargetsFor":
            return target_card(f, bears_of(g, seat, 2)) or DEFAULT
        return DEFAULT

    return {"decks": ([("Mountain", 30), ("Lightning Bolt", 30)],
                      [("Island", 20), ("Forest", 10), ("Grizzly Bears", 15), ("Unsummon", 15)]),
            "deal": {1: {"hand": ["Mountain"] * 4 + ["Lightning Bolt"] * 3, "top": ["Mountain"] * 6},
                     2: {"hand": ["Forest", "Island", "Island", "Grizzly Bears", "Unsummon", "Unsummon", "Island"],
                         "top": ["Island"] * 6}},
            "policy": policy, "card": "Lightning Bolt", "owner": 2}


SCENARIOS = {
    # F-0109-C: no window.
    "mist-raven": dict(at_alices_bears("Mist Raven", "Island", [("Island", 30), ("Mist Raven", 30)], 4),
                       quiet=True, to="hand", logged=r"Grizzly Bears returned to <1>'s hand"),
    "unsummon": dict(at_alices_bears("Unsummon", "Island", [("Island", 30), ("Unsummon", 30)], 1),
                     quiet=True, to="hand", logged=r"Grizzly Bears returned to <1>'s hand"),
    "repulse": dict(at_alices_bears("Repulse", "Island", [("Island", 30), ("Repulse", 30)], 3),
                    quiet=True, to="hand", logged=r"Grizzly Bears returned to <1>'s hand"),
    "raise-dead": dict(raise_dead(), quiet=True, to="hand", logged=r"Grizzly Bears returned to <2>'s hand"),
    "counterspell": dict(at_alices_spell("Counterspell", [("Island", 2)]), quiet=True, to="graveyard",
                         logged=r"Grizzly Bears was countered"),
    "act-of-treason": dict(at_alices_bears("Act of Treason", "Mountain", [("Mountain", 30), ("Act of Treason", 30)], 3),
                           quiet=True, to="battlefield", control=True,
                           # No line for the control change itself: the cast names its target.
                           logged=r"cast Act of Treason targeting <1>'s Grizzly Bears"),
    # F-0109-D: the window stays.
    "griptide": dict(at_alices_bears("Griptide", "Island", [("Island", 30), ("Griptide", 30)], 4),
                     to="library", said={1: r"^Bob put your Grizzly Bears on top of your library\.$"}),
    "untargeted": dict(at_alices_bears("Evacuation", "Island", [("Island", 30), ("Evacuation", 30)], 5),
                       to="hand", said={1: r"^Bob returned your (\w+ )?Grizzly Bears to your hand\.$"}),
    "mixed": dict(at_alices_spell("Psychic Strike", [("Island", 1), ("Swamp", 1)]), to="graveyard",
                  said={1: r"^Bob countered your Grizzly Bears\b"}),
    "fizzle": dict(fizzle(), fizzle=True,
                   said={1: r"^Your Lightning Bolt did nothing", 2: r"^Alice's Lightning Bolt did nothing"}),
}


def moved(w, seat, card_id, frm, to):
    """This seat's board showed [card_id] go from [frm] to [to] (a `moves` entry): by its id, or
    nameless where it went into a hand or a library this seat may not see (its id withheld, HID-001)."""
    return [m for m in w.moves(seat) if (m.get("card") == card_id or ("card" not in m and to in ("hand", "library")))
            and (m.get("from") or {}).get("zone") == frm and (m.get("to") or {}).get("zone") == to]


def run(name):
    sc = SCENARIOS[name]
    d1, d2 = sc["decks"]
    g = game(name, d1, d2, sc["deal"])
    w = Watch(g)
    st = {"card": None, "done": None, "control": None}
    frm = sc.get("from", "battlefield")

    def until(g):
        w.see()
        if st["card"] is None:
            # The Bears the effect is about, while it still is where it starts.
            seat = 2
            on = stack_of(g, 2)
            if sc.get("fizzle"):
                pass
            elif frm == "stack":
                if len(on) >= 2 and on[-1].get("name") == "Grizzly Bears":
                    st["card"] = on[-1].get("source") or on[-1].get("card")
            elif any(e.get("name") == sc["card"] or e.get("source") and
                     (g.card(seat, e.get("source")) or {}).get("name") == sc["card"] for e in on):
                st["card"] = bears_of(g, 2, sc["owner"], frm)
        if sc.get("fizzle"):
            done = all(any(m.get("why") == "fizzled" for m in w.moves(s)) for s in (1, 2))
        elif sc.get("control"):
            bears = st["card"]
            done = bool(bears) and any(c.get("id") == bears and c.get("controller", c.get("seat")) == 2
                                       for c in g.zone(1, "battlefield"))
            if done and st["control"] is None:
                st["control"] = g.turn
        else:
            done = bool(st["card"]) and all(moved(w, s, st["card"], frm, sc["to"]) for s in (1, 2))
        if done and st["done"] is None:
            st["done"] = g.turn
        # A little after: any report would have arrived.
        return st["done"] is not None and g.turn > st["done"]

    g.run(sc["policy"], until=until, max_turn=16)
    w.see()
    return g, w, st


def judge(name, g, w, st):
    sc = SCENARIOS[name]
    found = {"card": st["card"], "done": st["done"], "stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    if st["done"] is None:
        return "inconclusive", f"{sc['card']} never did its move (card {st['card']})", found
    for seat in (1, 2):
        told = [r for r in w.reports(seat) if r.get("source") == sc["card"]]
        found[f"told{seat}"] = [r.get("said") for r in told]
        log = w.log(seat)
        found[f"log{seat}"] = [line for line in log if "Grizzly Bears" in line][-4:]
        want = (sc.get("said") or {}).get(seat)
        if sc.get("quiet"):
            # F-0109-C: no window for anyone.
            if told:
                problems.append(f"seat {seat}: no report window for {sc['card']}: {found[f'told{seat}']}")
            # The play log keeps its line, for both seats.
            if not any(re.search(sc["logged"], line) for line in log):
                problems.append(f"seat {seat}: the play log says {sc['logged']!r}: {found[f'log{seat}']}")
            # F-0109-E: the move is on this seat's own board, somewhere it may see.
            if not sc.get("control"):
                shown = moved(w, seat, st["card"], sc.get("from", "battlefield"), sc["to"])
                found[f"move{seat}"] = shown[:1]
                if not shown:
                    problems.append(f"seat {seat}: its board shows the Bears' move to {sc['to']}")
                elif sc["to"] not in ("hand", "graveyard", "battlefield", "exile"):
                    problems.append(f"seat {seat}: a quiet move went somewhere hidden: {shown[0]}")
        elif want:
            if not any(re.search(want, r.get("said") or "") for r in told):
                problems.append(f"seat {seat}: the window stays and says {want!r}: {found[f'told{seat}']}")
        elif seat != 1 and told and not sc.get("fizzle"):
            problems.append(f"seat {seat} (who acted) is sent no window: {found[f'told{seat}']}")
        if sc.get("fizzle"):
            bounced = [r.get("said") for r in w.reports(seat) if r.get("source") == "Unsummon"]
            if bounced:
                problems.append(f"seat {seat}: Bob's Unsummon of his own Bears tells nobody: {bounced}")
        for r in w.reports(seat):
            for c in r.get("cards") or []:
                if str(c.get("id", "")).startswith("card:"):
                    problems.append(f"seat {seat}: a report's cards never carry a card's own id: {c}")
    ok = ("no window for either seat, a play-log line and the move on both boards" if sc.get("quiet")
          else "the window stays, in the reader's words")
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


if __name__ == "__main__":
    worst = 0
    for name in SCENARIOS:
        if ONLY and name not in ONLY:
            continue
        verdict_, message, found = judge(name, *run(name))
        code = {"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_]
        worst = 1 if 1 in (worst, code) else max(worst, code)
        print(f"{name}: {verdict_.upper()}: {message}")
        print("  " + json.dumps(found, default=str)[:3000])
        sys.stdout.flush()
    sys.exit(worst)
