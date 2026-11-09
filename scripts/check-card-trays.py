"""The cards a tray question shows, and how it lays them out. PHASE_09 W-07..W-10.

    python -I scripts/check-card-trays.py <worker.jar> <res-root> [trace-dir] [scenario...]

The owner chose (2026-11-01) trays of card pictures for putting cards in
order, scry and surveil, choosing from a hidden zone and Fact or
Fiction's piles. The page can only draw them from what the question
carries: its cards (`looking`, each named as this player may see it)
and `arrange` -- where the cards go, which end the first pick lands at,
a shuffle that may follow, the hidden zone, the split, the two piles.
Each scenario is a small game that reaches the question and checks it:

  ponder      Ponder: the order question shows the three cards, "to" the
              top, the first pick on top, a shuffle may follow; asked as
              "draw first"; then the shuffle question
  impulse     Impulse: the four cards from the library ("zone": library),
              names without Forge's numbers; the rest go to the BOTTOM,
              the first pick at the very bottom, never "draw first"
  brainstorm  Brainstorm: the two from the hand are picked "to" the top
              (no pictures: they are clicked in the hand), then their
              order, to the top
  tutor       Demonic Tutor: every option a picture from the library, no
              internal numbers ("Island (69)" was on every button)
  seize       Thoughtseize on the opponent: their nonland cards, as
              pictures, "zone": hand
  scry        Preordain's scry 2: the cards, the other row "to" the bottom
  opt         Opt's scry 1: the card, the other row "to" the bottom
  surveil     Consider's surveil 1: the other row "to" the graveyard
  piles       Fact or Fiction: the opponent's split shows the five cards
              ("split"); the caster's choice carries both piles by card
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
BASICS = {"Plains", "Island", "Swamp", "Mountain", "Forest"}
NUMBERED = re.compile(r"\(\d+\)")


class LandKeeper(Game):
    """Discards spells, not lands, down to hand size: a game short of mana
    never reaches the card it exists for."""

    def default(self, frame):
        if frame.get("kind") == "chooseCardsToDiscardToMaximumHandSize":
            spare = [o for o in frame.get("options", []) if (o.get("label") or "") not in BASICS]
            if spare:
                return spare[0]["actionId"]
        return super().default(frame)


def game(name, seat1, seat2=BEARS):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"card-trays-{name}.jsonl")
    # The Lab's deal (protocol/README.md): every deck here is a land and the
    # spell; four lands and three of the spell in hand, lands drawn after,
    # so the spell is cast on time. Seat 2 holds nonland cards (Thoughtseize
    # needs one to take).
    (land, _), (spell, _) = seat1
    deal = {1: {"hand": [land] * 4 + [spell] * 3, "top": [land] * 4},
            2: {"hand": ["Forest", "Forest", "Forest", "Grizzly Bears", "Grizzly Bears", "Grizzly Bears",
                         "Grizzly Bears"]}}
    return LandKeeper(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal)


def stack_empty(g):
    return not g.state.get(1, {}).get("stack") and not g.state.get(2, {}).get("stack")


def caster(spell, wanted):
    """A policy for seat 1: lands, then `spell` once; `wanted(g, f)` sees every
    other question first and returns an answer, or DEFAULT."""
    st = {"cast": None}

    def policy(g, f):
        answer = wanted(g, f, st)
        if answer is not DEFAULT:
            return answer
        if f["authorisedSeat"] == 1 and f.get("kind") == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            if st["cast"] is None:
                o = g.option(f, name=spell, zone="hand", land=False)
                if o and not any(x["actionId"] == o and x.get("payable") is False for x in f["options"]):
                    st["cast"] = card_of(o)
                    return o
            return g.play_land(f)
        if f["authorisedSeat"] == 2 and f.get("kind") == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        return DEFAULT

    return policy, st


def shown(f):
    """The ids of the cards the question shows, and whether each is named."""
    cards = f.get("looking") or []
    return [c.get("id") for c in cards], all(c.get("name") and c.get("known", True) for c in cards)


def options_cards(f):
    return [card_of(o["actionId"]) for o in f.get("options", []) if card_of(o["actionId"])]


def outcome(problems, ok, found):
    if problems:
        return "wrong", "; ".join(problems), found
    return "ok", ok, found


def seen(asked, kind, seat=1):
    return [f for f in asked if f.get("kind") == kind and f["authorisedSeat"] == seat]


def play(name, deck, spell, kinds, answer=lambda g, f: f["options"][-1]["actionId"], seat2=BEARS,
         max_turn=14, enough=lambda asked: False, opponent=None):
    """Cast `spell`; record every question of `kinds` (either seat) and answer
    it with `answer` (seat 1) or `opponent` (seat 2); stop when `enough`."""
    g = game(name, deck, seat2)
    asked = []

    def wanted(g, f, st):
        if st["cast"] and f.get("kind") in kinds:
            asked.append(f)
            if f["authorisedSeat"] == 2 and opponent:
                return opponent(g, f)
            return answer(g, f) if f.get("options") else None
        return DEFAULT

    policy, st = caster(spell, wanted)
    g.run(policy, until=lambda g: enough(asked), max_turn=max_turn)
    return asked, g


def ponder():
    asked, g = play("ponder", [("Island", 30), ("Ponder", 30)], "Ponder",
                    {"orderMoveToZoneList", "confirmAction"},
                    answer=lambda g, f: (f["options"][-1]["actionId"]),
                    enough=lambda a: any(f["kind"] != "orderMoveToZoneList" for f in a))
    order = seen(asked, "orderMoveToZoneList")
    found = {"asked": [(f["kind"], f.get("prompt"), f.get("arrange"), shown(f)[0]) for f in asked],
             "stopped": g.stopped_badly()}
    if not order:
        return "inconclusive", "Ponder never asked its order", found
    problems = []
    first = order[0]
    ids, named = shown(first)
    if len(ids) != 3 or not named or sorted(ids) != sorted(options_cards(first)):
        problems.append(f"the three cards, named, the same as the options: {ids} / {options_cards(first)}")
    if first.get("arrange") != {"to": "top", "first": "top", "shuffle": True}:
        problems.append(f"to the top, first pick on top, a shuffle may follow: {first.get('arrange')}")
    if "draw first" not in (first.get("prompt") or ""):
        problems.append(f"asked as which to draw first: {first.get('prompt')}")
    if len(order) > 1 and len(shown(order[1])[0]) != 2:
        problems.append(f"the second question shows the two left: {shown(order[1])[0]}")
    # Forge's confirmAction carries its words on the Yes ("Yes -- Do you want to shuffle the library?").
    if not any(f["kind"] == "confirmAction" and "shuffle" in " ".join(Game.labels(f)).lower() for f in asked):
        problems.append("the shuffle question follows the order")
    return outcome(problems, "Ponder: three named cards to the top, the shuffle flagged and asked", found)


def impulse():
    asked, g = play("impulse", [("Island", 30), ("Impulse", 30)], "Impulse",
                    {"chooseEntitiesForEffect", "chooseSingleEntityForEffect", "orderMoveToZoneList"},
                    enough=lambda a: any(f["kind"] == "orderMoveToZoneList" for f in a))
    found = {"asked": [(f["kind"], f.get("prompt"), f.get("arrange"), shown(f)[0], Game.labels(f)) for f in asked],
             "stopped": g.stopped_badly()}
    choose = [f for f in asked if f["kind"] != "orderMoveToZoneList"]
    order = seen(asked, "orderMoveToZoneList")
    if not choose or not order:
        return "inconclusive", "Impulse never reached its two questions", found
    problems = []
    ids, named = shown(choose[0])
    if len(ids) != 4 or not named or not set(options_cards(choose[0])) <= set(ids):
        problems.append(f"the four cards, named, the options among them: {ids}")
    if (choose[0].get("arrange") or {}).get("zone") != "library":
        problems.append(f"from the library: {choose[0].get('arrange')}")
    if any(NUMBERED.search(label) for label in Game.labels(choose[0])):
        problems.append(f"names without Forge's numbers: {Game.labels(choose[0])}")
    o = order[0]
    if o.get("arrange", {}).get("to") != "bottom" or o.get("arrange", {}).get("first") != "bottom":
        problems.append(f"the rest to the bottom, the first pick at the very bottom: {o.get('arrange')}")
    if "draw" in (o.get("prompt") or "") or "very bottom" not in (o.get("prompt") or ""):
        problems.append(f"asked as the very bottom, never 'draw first': {o.get('prompt')}")
    if len(shown(o)[0]) != 3:
        problems.append(f"the three left as pictures: {shown(o)[0]}")
    return outcome(problems, "Impulse: four named pictures from the library; the rest to the bottom, "
                             "asked as the bottom", found)


def brainstorm():
    asked, g = play("brainstorm", [("Island", 30), ("Brainstorm", 30)], "Brainstorm",
                    {"chooseEntitiesForEffect", "orderMoveToZoneList"},
                    enough=lambda a: any(f["kind"] == "orderMoveToZoneList" for f in a))
    found = {"asked": [(f["kind"], f.get("prompt"), f.get("arrange"), shown(f)[0]) for f in asked],
             "stopped": g.stopped_badly()}
    picks = seen(asked, "chooseEntitiesForEffect")
    order = seen(asked, "orderMoveToZoneList")
    if not picks or not order:
        return "inconclusive", "Brainstorm never reached its two questions", found
    problems = []
    if any(f.get("arrange") != {"to": "top"} for f in picks):
        problems.append(f"every pick from the hand 'to' the top: {[f.get('arrange') for f in picks]}")
    if any(f.get("looking") for f in picks):
        problems.append("the hand's cards are clicked in the hand, not shown again")
    if order[0].get("arrange", {}).get("to") != "top" or len(shown(order[0])[0]) != 2:
        problems.append(f"then the two, to the top, as pictures: {order[0].get('arrange')} {shown(order[0])[0]}")
    return outcome(problems, "Brainstorm: picks marked 'to the top', then the two in order", found)


def tutor():
    asked, g = play("tutor", [("Swamp", 30), ("Demonic Tutor", 30)], "Demonic Tutor",
                    {"chooseSingleEntityForEffect", "chooseEntitiesForEffect"},
                    enough=lambda a: bool(a))
    found = {"asked": [(f["kind"], f.get("arrange"), len(shown(f)[0]), Game.labels(f)[:5]) for f in asked],
             "stopped": g.stopped_badly()}
    if not asked:
        return "inconclusive", "Demonic Tutor never searched", found
    f = asked[0]
    problems = []
    ids, named = shown(f)
    if sorted(ids) != sorted(options_cards(f)) or not named or len(ids) < 20:
        problems.append(f"every option a named picture: {len(ids)} pictures, {len(options_cards(f))} options")
    if (f.get("arrange") or {}).get("zone") != "library":
        problems.append(f"from the library: {f.get('arrange')}")
    if any(NUMBERED.search(label) for label in Game.labels(f)):
        problems.append(f"names without Forge's numbers: {Game.labels(f)[:6]}")
    return outcome(problems, f"Demonic Tutor: {len(ids)} named pictures from the library, no numbers", found)


def seize():
    def target(g, f):
        # The opponent, not yourself.
        theirs = [o for o in f["options"] if (o.get("objectId") or "") == "player:2"]
        return (theirs or f["options"])[0]["actionId"]

    g = game("seize", [("Swamp", 30), ("Thoughtseize", 30)], [("Forest", 24), ("Grizzly Bears", 36)])
    asked = []

    def wanted(g, f, st):
        if st["cast"] and f["authorisedSeat"] == 1 and f.get("kind") == "chooseTargetsFor":
            return target(g, f)
        if st["cast"] and f["authorisedSeat"] == 1 and f.get("kind") in (
                "chooseSingleEntityForEffect", "chooseEntitiesForEffect"):
            asked.append(f)
            return f["options"][-1]["actionId"]
        return DEFAULT

    policy, st = caster("Thoughtseize", wanted)
    g.run(policy, until=lambda g: bool(asked), max_turn=14)
    found = {"asked": [(f["kind"], f.get("prompt"), f.get("arrange"), f.get("looking")) for f in asked],
             "stopped": g.stopped_badly()}
    if not asked:
        return "inconclusive", "Thoughtseize never asked for a card (no nonland card in hand?)", found
    f = asked[0]
    problems = []
    ids, named = shown(f)
    if sorted(ids) != sorted(options_cards(f)) or not named:
        problems.append(f"the cards to choose from, named pictures: {ids} / {options_cards(f)}")
    if (f.get("arrange") or {}).get("zone") != "hand":
        problems.append(f"from the opponent's hand: {f.get('arrange')}")
    if any((c.get("name") or "") in BASICS for c in f.get("looking") or []):
        problems.append("only nonland cards are choices")
    return outcome(problems, "Thoughtseize: the opponent's nonland cards as named pictures", found)


def scry(name, deck, spell, kinds, to, size):
    asked, g = play(name, deck, spell, kinds, answer=lambda g, f: None if not f.get("mandatory")
                    else f["options"][0]["actionId"], enough=lambda a: bool(a))
    found = {"asked": [(f["kind"], f.get("prompt"), f.get("arrange"), shown(f)[0]) for f in asked],
             "stopped": g.stopped_badly()}
    if not asked:
        return "inconclusive", f"{spell} never looked", found
    f = asked[0]
    problems = []
    ids, named = shown(f)
    if len(ids) != size or not named:
        problems.append(f"the {size} card(s), named: {ids}")
    if (f.get("arrange") or {}).get("to") != to:
        problems.append(f"the other row {to}: {f.get('arrange')}")
    return outcome(problems, f"{spell}: {size} named card(s), the other row {to}", found)


def piles():
    def split(g, f):
        # One card into pile 1, then done.
        return f["options"][0]["actionId"] if len(f["options"]) == 5 else None

    asked, g = play("piles", [("Island", 30), ("Fact or Fiction", 30)], "Fact or Fiction",
                    {"chooseEntitiesForEffect", "chooseCardsPile"}, opponent=split,
                    enough=lambda a: any(f["kind"] == "chooseCardsPile" for f in a), max_turn=16)
    found = {"asked": [(f["authorisedSeat"], f["kind"], f.get("arrange"), shown(f)[0], Game.labels(f))
                       for f in asked], "stopped": g.stopped_badly()}
    splits = seen(asked, "chooseEntitiesForEffect", seat=2)
    choose = seen(asked, "chooseCardsPile")
    if not splits or not choose:
        return "inconclusive", "Fact or Fiction never reached its piles", found
    problems = []
    s = splits[0]
    if (s.get("arrange") or {}).get("split") != "piles" or len(shown(s)[0]) != 5 or not shown(s)[1]:
        problems.append(f"the split shows the five named cards: {s.get('arrange')} {shown(s)[0]}")
    c = choose[0]
    p = (c.get("arrange") or {}).get("piles") or []
    if len(p) != 2 or [x.get("count") for x in p] != [1, 4] or [len(x.get("cards", [])) for x in p] != [1, 4]:
        problems.append(f"two piles, one card and four, by card: {p}")
    elif sorted(p[0]["cards"] + p[1]["cards"]) != sorted(shown(c)[0]) \
            or sorted(shown(c)[0]) != sorted(shown(s)[0]):
        problems.append(f"the piles' cards are the five that were split: {p} / {shown(s)[0]}")
    return outcome(problems, "Fact or Fiction: the split shows the five; the choice carries both piles", found)


SCENARIOS = {
    "ponder": ponder, "impulse": impulse, "brainstorm": brainstorm, "tutor": tutor, "seize": seize,
    "scry": lambda: scry("scry", [("Island", 30), ("Preordain", 30)], "Preordain",
                         {"arrangeForScry"}, "bottom", 2),
    "opt": lambda: scry("opt", [("Island", 30), ("Opt", 30)], "Opt", {"willPutCardOnTop"}, "bottom", 1),
    "surveil": lambda: scry("surveil", [("Island", 30), ("Consider", 30)], "Consider",
                            {"arrangeForSurveil"}, "graveyard", 1),
    "piles": piles,
}

if __name__ == "__main__":
    codes = []
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        # A game that never reached its moment proves nothing: up to two
        # more, each a fresh shuffle. A WRONG answer is final.
        for _ in range(3):
            result, message, found = scenario()
            if result != "inconclusive":
                break
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[result])
        print(f"{name}: {result.upper()}: {message}")
        if result != "ok":
            print("  " + json.dumps(found, default=str)[:1500])
        sys.stdout.flush()
    sys.exit(1 if 1 in codes else max(codes, default=0))
