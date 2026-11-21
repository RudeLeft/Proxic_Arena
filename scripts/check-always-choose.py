"""Spec 0104 -- you always choose: every card or player an effect has you
choose is asked, even when only one fits (Mechanics Lab, Layer B).

    python -I scripts/check-always-choose.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker. What it checks is read
from the questions and the snapshots both seats were sent, never inferred:

  appetite-one   Alice's Appetite for Brains; Bob's hand holds ONE card of
                 mana value 4 or more (Hill Giant): Alice IS asked, one
                 option, required, in the card's words ("mana value 4 or
                 greater"); the question shows Bob's whole hand (`looking`)
                 with each other card's reason (`arrange.why`: Lightning
                 Bolt "mana value 1", Island "a land", the 2s "mana value
                 2"), whose hand (`arrange.owner` 2). Afterwards Bob's
                 window says "Alice exiled your Hill Giant." with Hill Giant
                 "to: exile", and still says it after the next turn line;
                 Alice gets no window for it and no reveal of the card. Both
                 play logs: "Alice exiled Hill Giant from Bob's hand
                 (Appetite for Brains)". Bob's boards carry no reasons
  appetite-two   two such cards: asked with two options
  appetite-none  none: no question; Alice's plain reveal of Bob's hand stays
                 after the next turn line, and is gone once she closes it
                 (REPORTS_CLOSED, as the server sends it)
  reckoning      Divine Reckoning with one creature (Grizzly Bears): asked,
                 one option, in its words ("Each player chooses a creature
                 they control"); Grizzly Bears (one ability) was cast with no
                 getAbilityToPlay question
  peacekeeper    Anointed Peacekeeper's "choose an opponent": asked, Bob the
                 one option
  graveyard      Sudden Reclamation with one creature card in the
                 graveyard: the creature return is asked, one option
  izzet-charm    Izzet Charm with nothing to counter and no creature: the
                 mode is asked, one option ("Draw two cards...")
  spellskite     Bob's Spellskite on Alice's one-target Lightning Bolt: Bob
                 is asked which target to change, one option
  adventure      Shardless Agent cascades into Giant Killer: only the
                 creature half (mana value 1, not Chop Down's 3) can be
                 cast, and the half is asked all the same (getAbilityToPlay,
                 owner 2026-11-19); a card cast from hand with one ability is
                 never asked (reckoning)

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its point.
"""
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, HOLD, Game, card_of  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]

ENTITY = ("chooseSingleEntityForEffect", "chooseCardsForEffect")


def game(name, seat1, seat2, deal=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"always-choose-{name}.jsonl")
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


def result(problems, ok, found):
    if found.get("stopped"):
        problems = problems + [found["stopped"]]
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def stack_of(g, seat):
    return (g.state.get(seat) or {}).get("stack") or []


def cast(g, f, name):
    seat = f["authorisedSeat"]
    for o in f["options"]:
        if o.get("payable") is False or "Play land" in (o.get("label") or ""):
            continue
        cid = card_of(o.get("actionId"))
        if any(c.get("id") == cid and c.get("name") == name for c in g.zone(seat, "hand")):
            return o["actionId"]
    return None


def windows(board):
    a = board.get("action")
    return [a] + list(a.get("gathered") or []) if a else []


def record(f):
    return {"kind": f.get("kind"), "prompt": f.get("prompt"), "mandatory": f.get("mandatory"),
            "options": [(o.get("actionId"), o.get("label")) for o in f.get("options") or []],
            "arrange": f.get("arrange"), "looking": [(c.get("id"), c.get("name")) for c in f.get("looking") or []]}


def log_lines(trace_frames, seat):
    """Every play-log line [seat] was sent, as plain text."""
    out = []
    for s in trace_frames:
        if s.get("seat") != seat:
            continue
        for e in s.get("playLog") or []:
            words = []
            for p in e.get("parts") or []:
                if isinstance(p, str):
                    words.append(p)
                elif "player" in p:
                    words.append({1: "Alice", 2: "Bob"}.get(p["player"], "?"))
                else:
                    words.append(p.get("name") or "a card")
            out.append("".join(words))
    return out


# --- Appetite for Brains ----------------------------------------------------------------

BOB_DECK = [("Island", 36), ("Hill Giant", 6), ("Lightning Bolt", 6), ("Grizzly Bears", 6), ("Counterspell", 6)]
HANDS = {
    "one": ["Hill Giant", "Lightning Bolt", "Island", "Island", "Island", "Grizzly Bears", "Counterspell"],
    "two": ["Hill Giant", "Hill Giant", "Lightning Bolt", "Island", "Island", "Grizzly Bears", "Counterspell"],
    "none": ["Lightning Bolt", "Island", "Island", "Island", "Grizzly Bears", "Counterspell", "Counterspell"],
}
WHY_WANT = {"Lightning Bolt": "mana value 1", "Island": "a land", "Grizzly Bears": "mana value 2",
            "Counterspell": "mana value 2"}


def appetite(which):
    st = {"cast": None, "asked": [], "closed": None, "sent": False, "frames": []}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 1 and kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if st["cast"] is None and g.untapped_lands(1) and not stack_of(g, 1):
                o = cast(g, f, "Appetite for Brains")
                if o:
                    st["cast"] = g.turn
                return o
            return None
        if seat == 1 and kind in ENTITY:
            # Bob's hand as Bob's own board has it now (he may have played an Island first).
            st["asked"].append(record(f) | {"bob": sorted(c.get("name") for c in g.zone(2, "hand"))})
            giant = next((o["actionId"] for o in f["options"] if o.get("label") == "Hill Giant"), None)
            return giant or DEFAULT
        if seat == 2 and kind in ENTITY:
            st["asked"].append(record(f) | {"seat": 2})
        return DEFAULT

    g = game(f"appetite-{which}", [("Swamp", 30), ("Appetite for Brains", 30)], BOB_DECK,
             deal={1: {"hand": ["Swamp"] * 3 + ["Appetite for Brains"] * 4, "top": ["Swamp"] * 10},
                   2: {"hand": HANDS[which], "top": ["Island"] * 10}})
    w = Watch(g)

    def until(g):
        w.see()
        if st["cast"] is None:
            return False
        if which != "none":
            return g.turn >= st["cast"] + 2
        reveal = (g.state.get(1) or {}).get("reveal")
        if g.turn >= st["cast"] + 1 and reveal and not st["sent"]:
            # Close it as the server would: the seat, the newest stamp shown.
            st["closed"] = reveal.get("stamp")
            g.send({"protocolVersion": 1, "type": "REPORTS_CLOSED", "messageId": str(uuid.uuid4()),
                    "seat": 1, "upTo": st["closed"]})
            st["sent"] = True
            return False
        return st["sent"] and g.turn >= st["cast"] + 2

    g.run(policy, until=until, max_turn=10)
    w.see()
    found = {"stopped": g.stopped_badly(), "cast": st["cast"], "asked": st["asked"]}
    problems = []
    if st["cast"] is None:
        return "inconclusive", "Appetite for Brains was never cast", found
    hand = [q for q in st["asked"] if q.get("seat") is None and (q.get("arrange") or {}).get("zone") == "hand"]
    if [q for q in st["asked"] if q.get("seat") == 2]:
        problems.append(f"seat 2 was asked a card choice: {[q for q in st['asked'] if q.get('seat') == 2]}")
    boards1, boards2 = w.boards(1), w.boards(2)
    after = [b for b in boards1 if (b.get("turn") or 0) > st["cast"]]
    if which == "none":
        if hand:
            problems.append(f"nothing fits: no question, but Alice was asked {hand}")
        if not after:
            return "inconclusive", "the game ended before the next turn", found
        cast_turn = [b for b in boards1 if b.get("turn") == st["cast"] and b.get("reveal")]
        if not cast_turn:
            problems.append("Alice was never shown Bob's hand (no reveal on her board)")
        else:
            r = cast_turn[-1]["reveal"]
            found["reveal"] = {"title": r.get("title"), "cards": sorted(c.get("name") for c in r.get("cards") or [])}
            held = next((p.get("handCount") for p in cast_turn[-1].get("players") or [] if p.get("seat") == 2), None)
            names = [c.get("name") for c in r.get("cards") or []]
            # Bob's whole hand (he may have played an Island before it was cast).
            if len(names) != held or any(names.count(n) > HANDS["none"].count(n) for n in names):
                problems.append(f"the reveal is Bob's whole hand: {found['reveal']}")
            key = r.get("key")
            kept = [b for b in after if (b.get("reveal") or {}).get("key") == key]
            if not kept:
                problems.append("F-0104-F: the reveal is gone at the next turn line; it stays until closed")
            if not st["sent"] and not problems:
                return "inconclusive", "the reveal was never there to close in the next turn", found
            later = [b for b in after if (b.get("turn") or 0) >= st["cast"] + 2]
            if later and any((b.get("reveal") or {}).get("key") == key for b in later):
                problems.append("F-0104-F: the reveal is still sent after Alice closed it")
            if not later and not problems:
                return "inconclusive", "no board after the close", found
        return result(problems, "nothing to choose: no question; the reveal stays past the turn line until "
                                "closed", found)
    want = 1 if which == "one" else 2
    if not hand:
        return result(problems + [f"Alice was never asked (the shortcut): {st['asked']}"], "", found)
    q = hand[0]
    found["question"] = q
    if len(q["options"]) != want or any(label != "Hill Giant" for _, label in q["options"]):
        problems.append(f"F-0104-A: {want} option(s), Hill Giant: {q['options']}")
    if q["mandatory"] is not True:
        problems.append("F-0104-A: the choice is required")
    if "mana value 4 or greater" not in (q["prompt"] or ""):
        problems.append(f"F-0104-A: the prompt is the card's words: {q['prompt']!r}")
    if q["arrange"].get("owner") != 2:
        problems.append(f"whose hand: {q['arrange'].get('owner')}")
    names = sorted(n for _, n in q["looking"])
    if names != q["bob"]:
        problems.append(f"the question shows Bob's whole hand: {names}")
    why = q["arrange"].get("why") or {}
    for cid, name in q["looking"]:
        if name == "Hill Giant":
            if cid in why:
                problems.append("an offered card has no reason")
            continue
        if why.get(cid) != WHY_WANT[name]:
            problems.append(f"F-0104-C: {name}'s reason is {WHY_WANT[name]!r}: {why.get(cid)!r}")
    # F-0104-D: Bob's window, and none for Alice.
    told = [(b, a) for b in boards2 for a in windows(b) if "exiled your" in (a.get("said") or "")]
    if not told:
        problems.append("F-0104-D: Bob has no window for his card")
    else:
        b, a = told[0]
        found["said2"] = a.get("said")
        if a.get("said") != "Alice exiled your Hill Giant.":
            problems.append(f"F-0104-D: Bob's window: {a.get('said')!r}")
        cards = [(c.get("name"), c.get("to")) for c in a.get("cards") or []]
        if cards != [("Hill Giant", "exile")]:
            problems.append(f"F-0104-E(3): Bob's window shows his own exiled card only: {cards}")
        if a.get("by") != 1:
            problems.append(f"by Alice: {a.get('by')}")
        key = a.get("key")
        if not any(any(x.get("key") == key for x in windows(x2)) for x2 in boards2
                   if (x2.get("turn") or 0) > b.get("turn")):
            problems.append("the window stays past the next turn line")
    mine = [a.get("said") for b in boards1 for a in windows(b) if "exiled" in (a.get("said") or "")]
    if mine:
        problems.append(f"the caster gets no window: {mine}")
    giant_reveal = [b for b in boards1 if b.get("turn") == st["cast"] and b.get("reveal")]
    if giant_reveal:
        problems.append(f"no reveal window for the caster either: {giant_reveal[-1]['reveal'].get('title')}")
    for seat in (1, 2):
        lines = [x for x in log_lines(w.boards(seat), seat) if "exiled Hill Giant" in x]
        found[f"log{seat}"] = lines
        if "Alice exiled Hill Giant from Bob's hand (Appetite for Brains)" not in lines:
            problems.append(f"F-0104-D: seat {seat}'s play log: {lines}")
    # F-0104-E(1): Bob's boards carry no reasons, no question about his hand.
    if any("mana value 1" in json.dumps(b) for b in boards2):
        problems.append("F-0104-E: Bob's boards carry the reasons")
    return result(problems, f"{which}: Alice asked ({want} option{'s' if want > 1 else ''}), the whole hand "
                            "shown with reasons; Bob's window kept past the turn line; none for Alice", found)


# --- the other card and player choices ----------------------------------------------------


def simple(name, seat1, seat2, deal, act, wanted, max_turn=14):
    """Alice plays lands and does [act]; the first question [wanted] picks is returned."""
    st = {"q": None, "acted": False, "extra": []}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if st["q"] is None and wanted(g, f):
            st["q"] = record(f) | {"seat": seat}
        if kind == "getAbilityToPlay":
            st["extra"].append(record(f))
        if kind == "chooseCardName" and st["q"] is not None:
            # Anointed Peacekeeper names a card next (a search, not this
            # check's business): the moment is over, the game ends here.
            g.concede(1)
            return HOLD
        if kind == "chooseSpellAbilityToPlay" and seat == 1:
            land = g.play_land(f)
            if land:
                return land
            o = act(g, f, st)
            return o
        if kind == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        return DEFAULT

    g = game(name, seat1, seat2, deal=deal)
    g.run(policy, until=lambda g: st["q"] is not None and not stack_of(g, 1), max_turn=max_turn)
    st["stopped"] = g.stopped_badly()
    return st


def one_option(st, what, ok, prompt=None, label=None):
    found = {"stopped": st["stopped"], "question": st["q"]}
    if st["q"] is None:
        return "inconclusive", f"{what} was never asked", found
    problems = []
    q = st["q"]
    if len(q["options"]) != 1:
        problems.append(f"one option: {q['options']}")
    elif label and label not in (q["options"][0][1] or ""):
        problems.append(f"the option is {label!r}: {q['options']}")
    if prompt and prompt not in (q["prompt"] or ""):
        problems.append(f"the prompt, in the card's words, has {prompt!r}: {q['prompt']!r}")
    return result(problems, ok, found)


def when_lands(n, card):
    def act(g, f, st):
        if st["acted"] or stack_of(g, 1) or len(g.untapped_lands(1)) < n:
            return None
        o = cast(g, f, card)
        st["acted"] = bool(o)
        return o
    return act


def reckoning():
    def act(g, f, st):
        if not g.mine(1, name="Grizzly Bears"):
            o = cast(g, f, "Grizzly Bears") if len(g.untapped_lands(1)) >= 2 else None
            return o
        return when_lands(4, "Divine Reckoning")(g, f, st)

    st = simple("reckoning", [("Plains", 24), ("Forest", 6), ("Grizzly Bears", 10), ("Divine Reckoning", 20)],
                [("Island", 60)],
                {1: {"hand": ["Forest", "Plains", "Plains", "Plains", "Grizzly Bears", "Divine Reckoning", "Plains"],
                     "top": ["Plains"] * 8},
                 2: {"hand": ["Island"] * 7, "top": ["Island"] * 8}},
                act, lambda g, f: f["authorisedSeat"] == 1 and f.get("kind") in ENTITY
                and any(o.get("label") == "Grizzly Bears" for o in f["options"]), max_turn=16)
    verdict_ = one_option(st, "Divine Reckoning's creature", "Divine Reckoning with one creature: asked, Bears the "
                          "one option", prompt="Each player chooses a creature they control", label="Grizzly Bears")
    if verdict_[0] == "ok" and st["extra"]:
        return "wrong", f"getAbilityToPlay was asked for a card with one ability: {st['extra']}", verdict_[2]
    return verdict_


def peacekeeper():
    st = simple("peacekeeper", [("Plains", 40), ("Anointed Peacekeeper", 20)], [("Island", 60)],
                {1: {"hand": ["Plains"] * 4 + ["Anointed Peacekeeper"] * 3, "top": ["Plains"] * 8},
                 2: {"hand": ["Island"] * 7, "top": ["Island"] * 8}},
                when_lands(3, "Anointed Peacekeeper"),
                lambda g, f: f["authorisedSeat"] == 1 and f.get("kind") in ENTITY
                and any((o.get("objectId") or "").startswith("player:") for o in f["options"]))
    return one_option(st, "Anointed Peacekeeper's opponent", "Anointed Peacekeeper: Bob asked as the one opponent",
                      label="Bob")


def graveyard():
    # Three or four draws before the cast: either way, one creature among the four milled.
    st = simple("graveyard", [("Forest", 40), ("Grizzly Bears", 10), ("Sudden Reclamation", 10)], [("Island", 60)],
                {1: {"hand": ["Forest"] * 4 + ["Sudden Reclamation"] * 2 + ["Forest"],
                     "top": ["Forest"] * 4 + ["Grizzly Bears"] + ["Forest"] * 10},
                 2: {"hand": ["Island"] * 7, "top": ["Island"] * 8}},
                when_lands(4, "Sudden Reclamation"),
                lambda g, f: f["authorisedSeat"] == 1 and f.get("kind") in ENTITY
                and any(o.get("label") == "Grizzly Bears" for o in f["options"]))
    return one_option(st, "the creature to return", "Sudden Reclamation: the one creature card asked",
                      label="Grizzly Bears")


def izzet_charm():
    st = simple("izzet-charm", [("Island", 20), ("Mountain", 20), ("Izzet Charm", 20)], [("Plains", 60)],
                {1: {"hand": ["Island", "Mountain", "Island", "Mountain", "Izzet Charm", "Izzet Charm", "Island"],
                     "top": ["Mountain", "Island"] * 6},
                 2: {"hand": ["Plains"] * 7, "top": ["Plains"] * 8}},
                when_lands(2, "Izzet Charm"),
                lambda g, f: f["authorisedSeat"] == 1 and f.get("kind") == "chooseModeForAbility")
    return one_option(st, "Izzet Charm's mode", "Izzet Charm: the one legal mode asked", label="Draw two cards")


def spellskite():
    st = {"bolt": False, "changed": False, "q": None, "bears": None}
    bears_deal = {"hand": ["Forest", "Mountain", "Forest", "Grizzly Bears", "Spellskite", "Mountain", "Forest"],
                  "top": ["Mountain", "Forest", "Mountain", "Forest"]}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseTarget":
            st["q"] = record(f) | {"seat": seat}
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            up = any(e.get("name") == "Lightning Bolt" for e in stack_of(g, seat))
            if seat == 2 and st["bolt"] and not st["changed"] and up:
                o = g.option(f, name="Spellskite", zone="battlefield")
                st["changed"] = bool(o)
                return o
            if stack_of(g, seat):
                return None
            land = g.play_land(f)
            if land:
                return land
            if seat == 2:
                if not g.mine(2, name="Spellskite"):
                    return cast(g, f, "Spellskite")
                if not g.mine(2, name="Grizzly Bears"):
                    return cast(g, f, "Grizzly Bears")
                return None
            bears = g.zone(1, "battlefield", owner=2, name="Grizzly Bears")
            if not st["bolt"] and bears and g.zone(1, "battlefield", owner=2, name="Spellskite") \
                    and len(g.untapped_lands(2)) >= 1:
                o = cast(g, f, "Lightning Bolt")
                if o:
                    st["bolt"], st["bears"] = True, bears[0]["id"]
                return o
            return None
        if kind == "chooseTargetsFor" and seat == 1 and st["bolt"] and not st["changed"]:
            return next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == st["bears"]), DEFAULT)
        if kind == "chooseTargetsFor" and st["changed"]:
            return next((o["actionId"] for o in f["options"]
                         # Spec 0113 (W1-003): the spell's button by its id, its card's name in the label.
                         if o["actionId"].startswith("target:stack:") and "Lightning Bolt" in (o.get("label") or "")),
                        DEFAULT)
        return DEFAULT

    g = game("spellskite", [("Mountain", 40), ("Lightning Bolt", 20)],
             [("Forest", 20), ("Mountain", 20), ("Spellskite", 20), ("Grizzly Bears", 20)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Lightning Bolt"] * 3, "top": ["Mountain"] * 6}, 2: bears_deal})
    g.run(policy, until=lambda g: st["q"] is not None and not stack_of(g, 1), max_turn=20)
    st["stopped"] = g.stopped_badly()
    return one_option(st, "Spellskite's target to change", "Spellskite on a one-target Bolt: the target asked",
                      label="Grizzly Bears")


def adventure():
    """Shardless Agent (mana value 3) cascades into Giant Killer: its creature
    (mana value 1) may be cast, Chop Down (mana value 3, not less than 3) may
    not -- Forge offers the one half, and it is asked all the same (owner
    2026-11-19, "Ask her too"). Forge offers a half whose target is missing,
    so the limit that removes one is cascade's mana value."""
    st = {"elf": False, "q": None, "halves": [], "cast": None}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 1 and kind == "getAbilityToPlay":
            st["halves"].append(record(f))
            if st["q"] is None:
                st["q"] = record(f) | {"seat": seat}
            return f["options"][0]["actionId"]
        if seat == 1 and kind == "confirmAction" and "Giant Killer" in json.dumps(f):
            st["cast"] = True
            return next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith("Yes")),
                        f["options"][0]["actionId"])
        if kind == "chooseSpellAbilityToPlay" and seat == 1:
            if stack_of(g, 1):
                return None
            land = g.play_land(f, prefer="Forest" if not g.mine(1, name="Forest") else "Island")
            if land:
                return land
            if not st["elf"]:
                o = cast(g, f, "Shardless Agent")
                st["elf"] = bool(o)
                return o
            return None
        if kind == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        return DEFAULT

    g = game("adventure", [("Island", 14), ("Forest", 14), ("Shardless Agent", 12), ("Giant Killer", 20)],
             [("Island", 60)],
             deal={1: {"hand": ["Forest", "Island", "Forest", "Island", "Shardless Agent", "Shardless Agent",
                                "Island"],
                       "top": ["Forest", "Island", "Forest"] + ["Giant Killer"] * 6},
                   2: {"hand": ["Island"] * 7, "top": ["Island"] * 8}})
    g.run(policy, until=lambda g: st["q"] is not None and not stack_of(g, 1)
          and g.mine(1, name="Giant Killer"), max_turn=16)
    st["stopped"] = g.stopped_badly()
    found = {"stopped": st["stopped"], "question": st["q"], "cast": st["cast"]}
    if not st["elf"]:
        return "inconclusive", "Shardless Agent was never cast", found
    if st["q"] is None:
        return result([f"the half was not asked (cascade offered: {st['cast']})"], "", found)
    problems = []
    if len(st["q"]["options"]) != 1:
        problems.append(f"one half can be cast (Chop Down is not less than 3): {st['q']['options']}")
    if not g.mine(1, name="Giant Killer"):
        problems.append("the clicked half, the creature, is on the battlefield")
    return result(problems, "cascade into Giant Killer: the one castable half asked, then cast", found)


SCENARIOS = {"appetite-one": lambda: appetite("one"), "appetite-two": lambda: appetite("two"),
             "appetite-none": lambda: appetite("none"), "reckoning": reckoning, "peacekeeper": peacekeeper,
             "graveyard": graveyard, "izzet-charm": izzet_charm, "spellskite": spellskite,
             "adventure": adventure}

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
            print("  " + json.dumps(found, default=str)[:3000])
        sys.stdout.flush()
    sys.exit(worst)
