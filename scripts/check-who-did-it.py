"""Who did it, and what they did -- PHASE_09 Amendment 12 (owner 2026-11-03).

    python -I scripts/check-who-did-it.py <worker.jar> <res-root> [trace-dir] [scenario...]

Alice (seat 1) plays a card that searches, looks at, reorders or moves
cards in a library or a hand; Bob (seat 2) plays lands and small
creatures. Each scenario checks the report the other player is sent once
it resolves: one sentence naming who did it, in that reader's words, and
the cards -- face up only where that reader may know them, otherwise a
back with no name. Amendment 13 (item 7): the player who made the
choices is sent no report, and no reveal tray, for it.

  tutor       Demonic Tutor: Bob reads "Alice searched their library and
              put a card into their hand", and his card is a back,
              nameless; Alice is told nothing
  matron      Goblin Matron (searched, revealed): Bob reads the card's name
  ponder      Ponder: Bob reads "Alice looked at the top 3 cards of their
              library and put them back in an order they chose", 3 backs
  brainstorm  Brainstorm: Bob reads "Alice drew 3 cards, then put 2 cards
              from their hand on top of their library", 2 backs
  seize       Thoughtseize on Bob: Bob reads "Alice looked at your hand and
              chose <card> for you to discard"
  probe       Gitaxian Probe on Bob: Bob reads "Alice looked at your hand."
  scour       Thought Scour on Bob: Bob reads "You milled 2 cards." and
              Alice "Bob milled 2 cards." (spec 0074, Amendment 1: a mill is
              told to both unless you milled yourself)
  mindrot     Mind Rot on Bob, who chooses: Alice reads "Bob discarded
              <names>"; Bob is told nothing

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, verdict  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
BOB = [("Plains", 30), ("Savannah Lions", 15), ("Raging Goblin", 15)]

# name: (Alice's deck, the card, lands it needs, {seat: the sentence}, seats whose cards must all be backs,
#        the seat that chose and so is told nothing)
SCENARIOS = {
    "tutor": ([("Swamp", 30), ("Demonic Tutor", 30)], "Demonic Tutor", 2,
              {2: r"^Alice searched their library and put a card into their hand, then shuffled\.$"}, {2}, 1),
    "matron": ([("Mountain", 24), ("Goblin Matron", 18), ("Goblin Piker", 18)], "Goblin Matron", 3,
               {2: r"^Alice searched their library and put Goblin (Matron|Piker) into their hand, then shuffled\.$"},
               set(), 1),
    "ponder": ([("Island", 30), ("Ponder", 30)], "Ponder", 1,
               {2: r"^Alice looked at the top 3 cards of their library and put them back in an order they chose"
                   r"(, then shuffled)?\.$"}, {2}, 1),
    "brainstorm": ([("Island", 30), ("Brainstorm", 30)], "Brainstorm", 1,
                   {2: r"^Alice drew 3 cards, then put 2 cards from their hand on top of their library\.$"}, {2}, 1),
    "seize": ([("Swamp", 30), ("Thoughtseize", 30)], "Thoughtseize", 1,
              {2: r"^Alice looked at your hand and chose (Savannah Lions|Raging Goblin) for you to discard\.$"},
              set(), 1),
    "probe": ([("Island", 30), ("Gitaxian Probe", 30)], "Gitaxian Probe", 1,
              {2: r"^Alice looked at your hand\.$"}, set(), 1),
    "scour": ([("Island", 30), ("Thought Scour", 30)], "Thought Scour", 1,
              {1: r"^Bob milled 2 cards\.$", 2: r"^You milled 2 cards\.$"}, set(), None),
    "mindrot": ([("Swamp", 30), ("Mind Rot", 30)], "Mind Rot", 3,
                {1: r"^Bob discarded .+\.$"}, set(), 2),
}


def trace_of(name):
    if not TRACES:
        return ""
    if TRACES.endswith(".jsonl"):
        return TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    return os.path.join(TRACES, f"who-did-it-{name}.jsonl")


def run(name):
    deck, card, lands, expected, backs_for, chooser = SCENARIOS[name]
    # The Lab's deal (lab.py): Alice's lands and the card in her opening
    # hand, lands next; Bob holds both creatures (seize names one).
    land = deck[0][0]
    deal = {1: {"hand": [land] * 4 + [card] * 3, "top": [land] * 4},
            2: {"hand": ["Plains"] * 3 + ["Savannah Lions"] * 2 + ["Raging Goblin"] * 2, "top": ["Plains"] * 3}}
    g = Game(seat1=deck, seat2=BOB, jar=JAR, res=RES, trace=trace_of(name), deal=deal)
    cast = {"turn": None}
    seen = {1: [], 2: []}

    def policy(game, f):
        seat, kind = f["authorisedSeat"], f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if seat == 1 and cast["turn"] is None and len(game.untapped_lands(1)) >= lands \
                    and game.state.get(1, {}).get("activeSeat") == 1:
                o = game.option(f, name=card, zone="hand", land=False)
                if o:
                    cast["turn"] = game.turn
                    return o
            return DEFAULT
        if kind in ("declareAttackers", "declareBlockers", "mulliganKeepHand", "chooseStartingPlayer"):
            return DEFAULT
        if cast["turn"] is not None and f.get("options"):
            if kind == "chooseTargetsFor" and seat == 1:
                for o in f["options"]:
                    if "player:" in o["actionId"] and "Bob" in (o.get("label") or ""):
                        return o["actionId"]
            return f["options"][0]["actionId"]
        return DEFAULT

    def until(game):
        for seat in (1, 2):
            a = game.state.get(seat, {}).get("action")
            if a and all(a.get("key") != s.get("key") for s in seen[seat]):
                seen[seat].append(a)
        return cast["turn"] is not None and game.turn > cast["turn"] + 1

    g.run(policy, until=until, max_turn=16)
    return g, cast["turn"], seen, expected, backs_for, chooser


def main():
    found, problems, inconclusive = {}, [], []
    for name in SCENARIOS:
        if ONLY and name not in ONLY:
            continue
        g, turn, seen, expected, backs_for, chooser = run(name)
        bad = g.stopped_badly()
        if bad:
            problems.append(f"{name}: {bad}")
            continue
        if turn is None:
            inconclusive.append(f"{name}: Alice never cast it")
            continue
        found[name] = {seat: [a.get("said") for a in seen[seat]] for seat in (1, 2)}
        for seat, pattern in expected.items():
            if not any(re.search(pattern, a.get("said") or "") for a in seen[seat]):
                problems.append(f"{name}: seat {seat} was never told {pattern!r}; it was told {found[name][seat]}")
        if chooser is not None and seen[chooser]:
            problems.append(f"{name}: seat {chooser} made the choices and was still told: {found[name][chooser]}")
        for seat in backs_for:
            for a in seen[seat]:
                for c in a.get("cards", []):
                    if c.get("known") or c.get("name") not in (None, "", "Face-down"):
                        problems.append(f"{name}: seat {seat} was sent a card it may not know: {c.get('name')!r}")
        for seat in (1, 2):
            for a in seen[seat]:
                if a.get("by") != 1:
                    problems.append(f"{name}: seat {seat}'s report names seat {a.get('by')} as the one who acted")
                for c in a.get("cards", []):
                    if str(c.get("id", "")).startswith("card:"):
                        problems.append(f"{name}: seat {seat} was sent a real card id in a report")
        if not problems:
            print(f"{name}: OK: {found[name]}", flush=True)
    verdict(found, problems, "every report named Alice, in each reader's words, with only what they may know",
            "; ".join(inconclusive) if inconclusive and not problems else None)


main()
