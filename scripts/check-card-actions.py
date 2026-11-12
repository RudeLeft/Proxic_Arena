"""Card actions told in the report window -- spec 0075 (owner 2026-11-12).

    python -I scripts/check-card-actions.py <worker.jar> <res-root> [trace-dir|trace.jsonl] [scenario...]

Bob (seat 2) does something with a card; Alice (seat 1) is the other
player. Each scenario checks the report window each seat is sent (one
sentence naming who did it, in that reader's words), who is sent none, and
that no grey notice repeats it (no "Cycled: ...", no "Bob chose white", no
"... the flip", no "You rolled 4", no "There are no cards in ...").

  unsummon  F-0075-A: Bob's Unsummon on Alice's Grizzly Bears: Alice reads
            "Bob returned your Grizzly Bears to your hand.", the Bears a
            picture "-> hand"; Bob is sent nothing
  bounce    F-0075-A: the other way round -- Alice's Unsummon on Bob's
            Bears: Bob reads "Alice returned your Grizzly Bears to your
            hand."; Alice is sent nothing
  cycle     F-0075-B: Bob cycles Forgotten Cave: Alice reads "Bob cycled
            Forgotten Cave and drew a card.", the Cave a picture
            "-> graveyard", the card he drew never named; Bob is sent
            nothing; no "Cycled" notice for anyone
  color     F-0075-C: Bob's Voice of All: Alice reads "Bob chose <colour>."
            with the colour as a picture (marks: color); Bob nothing
  coin      F-0075-C: Bob's Stitch in Time: Alice reads "Bob flipped a coin
            and won." or "... and lost." with a coin picture (marks: coin) and Stitch in Time face up;
            Bob reads "You flipped a coin and ..." (owner 2026-11-12: a flip is
            luck, not a choice, so the flipper is told too)
  die       F-0075-C: Bob's Goblin Tutor rolls a die: both boards carry the
            roll (the tumbling die); no grey line repeats it, and no report
            window is made of the roll
  duress    F-0075-D: Alice has played out her hand (Ornithopters); Bob's
            Duress on her empty hand: no "There are no cards in ..." line
            for anyone; the look is a report window for both -- Alice "Bob
            looked at your hand. It has no cards.", Bob (there was nothing
            to choose) "You looked at Alice's hand. It has no cards."

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

BEARS = [("Forest", 30), ("Grizzly Bears", 30)]
BEARS_DEAL = {"hand": ["Forest"] * 4 + ["Grizzly Bears"] * 3, "top": ["Forest"] * 3}
# Grey lines the report window replaces (spec 0075): none may reach a page.
GREY = re.compile(r"^(Cycled|.*\bchose\b|.*\bpicked\b|.*\bthe flip\b|.*\brolled\b|There are no cards in |Looking at )",
                  re.IGNORECASE)


def S(**kw):
    """One scenario: the actor's deck, card and lands, the other's deck, the
    deals, when to cast, the target to prefer, and what each seat reads."""
    return kw


SCENARIOS = {
    "unsummon": S(actor=2, card="Unsummon", lands=1,
                  decks={1: BEARS, 2: [("Island", 30), ("Unsummon", 30)]},
                  deal={1: BEARS_DEAL, 2: {"hand": ["Island"] * 4 + ["Unsummon"] * 3, "top": ["Island"] * 3}},
                  ready=lambda g: bool(g.mine(1, name="Grizzly Bears")), target="Grizzly Bears",
                  said={1: r"^Bob returned your Grizzly Bears to your hand\.$"}, silent=[2],
                  pictures={1: [("Grizzly Bears", "hand")]}),
    "bounce": S(actor=1, card="Unsummon", lands=1,
                decks={2: BEARS, 1: [("Island", 30), ("Unsummon", 30)]},
                deal={2: BEARS_DEAL, 1: {"hand": ["Island"] * 4 + ["Unsummon"] * 3, "top": ["Island"] * 3}},
                ready=lambda g: bool(g.mine(2, name="Grizzly Bears")), target="Grizzly Bears",
                said={2: r"^Alice returned your Grizzly Bears to your hand\.$"}, silent=[1],
                pictures={2: [("Grizzly Bears", "hand")]}),
    "cycle": S(actor=2, card="Forgotten Cave", lands=1, cycle=True,
               decks={1: BEARS, 2: [("Mountain", 30), ("Forgotten Cave", 30)]},
               deal={1: BEARS_DEAL, 2: {"hand": ["Mountain"] * 3 + ["Forgotten Cave"] * 4, "top": ["Mountain"] * 3}},
               said={1: r"^Bob cycled Forgotten Cave and drew a card\.$"}, silent=[2],
               pictures={1: [("Forgotten Cave", "graveyard")]}),
    "color": S(actor=2, card="Voice of All", lands=4,
               decks={1: BEARS, 2: [("Plains", 30), ("Voice of All", 30)]},
               deal={1: BEARS_DEAL, 2: {"hand": ["Plains"] * 4 + ["Voice of All"] * 3, "top": ["Plains"] * 4}},
               said={1: r"^Bob chose (white|blue|black|red|green)\.$"}, silent=[2],
               marks={1: "color"}, pictures={1: [("Voice of All", "battlefield")]}),
    "coin": S(actor=2, card="Stitch in Time", lands=3,
              decks={1: BEARS, 2: [("Volcanic Island", 30), ("Stitch in Time", 30)]},
              deal={1: BEARS_DEAL,
                    2: {"hand": ["Volcanic Island"] * 4 + ["Stitch in Time"] * 3, "top": ["Volcanic Island"] * 4}},
              # Owner 2026-11-12: a flip is luck, not a choice -- the flipper is told too.
              said={1: r"^Bob flipped a coin and (won|lost)\.$", 2: r"^You flipped a coin and (won|lost)\.$"},
              silent=[], marks={1: "coin", 2: "coin"},
              # The spell, face up, as it was on the stack (no "-> stack" under it).
              pictures={1: [("Stitch in Time", None)], 2: [("Stitch in Time", None)]}),
    "die": S(actor=2, card="Goblin Tutor", lands=1,
             decks={1: BEARS, 2: [("Mountain", 30), ("Goblin Tutor", 30)]},
             deal={1: BEARS_DEAL, 2: {"hand": ["Mountain"] * 4 + ["Goblin Tutor"] * 3, "top": ["Mountain"] * 3}},
             said={}, silent=[1, 2], rolled=True),
    "duress": S(actor=2, card="Duress", lands=1,
                decks={1: [("Ornithopter", 60)], 2: [("Swamp", 30), ("Duress", 30)]},
                deal={1: {"hand": ["Ornithopter"] * 7, "top": ["Ornithopter"] * 6},
                      2: {"hand": ["Swamp"] * 4 + ["Duress"] * 3, "top": ["Swamp"] * 3}},
                ready=lambda g: g.player(2, 1).get("handCount") == 0 and g.state.get(2, {}).get("activeSeat") == 2,
                target="Alice", empty_look=True,
                said={2: r"^You looked at Alice's hand\. It has no cards\.$",
                      1: r"^Bob looked at your hand\. It has no cards\.$"}, silent=[]),
}


def trace_of(name):
    if not TRACES:
        return ""
    if TRACES.endswith(".jsonl"):
        return TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    return os.path.join(TRACES, f"card-actions-{name}.jsonl")


def run(name):
    sc = SCENARIOS[name]
    actor, other = sc["actor"], 3 - sc["actor"]
    g = Game(seat1=sc["decks"][1], seat2=sc["decks"][2], jar=JAR, res=RES, trace=trace_of(name), deal=sc["deal"])
    st = {"turn": None, "rolls": {1: [], 2: []}}
    seen = {1: [], 2: []}
    ready = sc.get("ready") or (lambda g: True)

    def policy(game, f):
        seat, kind = f["authorisedSeat"], f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if seat == other:
                # The other player plays out: lands, Bears, every Ornithopter.
                return game.play_land(f) or game.option(f, name="Grizzly Bears", zone="hand", land=False) \
                    or game.option(f, name="Ornithopter", zone="hand", land=False)
            if st["turn"] is not None:
                return game.play_land(f, prefer=sc["decks"][actor][0][0]) if not sc.get("cycle") else None
            land = game.play_land(f, prefer=sc["decks"][actor][0][0])
            if land and not sc.get("cycle"):
                return land
            if sc.get("cycle"):
                if land and game.state.get(actor, {}).get("activeSeat") == actor \
                        and not game.untapped_lands(actor):
                    return land
                caves = game.mine(actor, "hand", name=sc["card"])
                if caves and game.untapped_lands(actor):
                    for o in f["options"]:
                        if o.get("objectId") == caves[0]["id"] and (o.get("use") or {}).get("kind") == "cycling":
                            st["turn"] = game.turn
                            return o["actionId"]
                return None
            if len(game.untapped_lands(actor)) >= sc["lands"] and ready(game):
                o = game.option(f, name=sc["card"], zone="hand", land=False)
                if o:
                    st["turn"] = game.turn
                    return o
            return None
        if kind in ("declareAttackers", "declareBlockers", "mulliganKeepHand", "chooseStartingPlayer"):
            return DEFAULT
        if kind == "chooseTargetsFor" and seat == actor and sc.get("target"):
            for o in f.get("options") or []:
                label = o.get("label") or ""
                if sc["target"] in label and ("player:" in o["actionId"]) == (sc["target"] in ("Alice", "Bob")):
                    return o["actionId"]
        return DEFAULT

    def until(game):
        for seat in (1, 2):
            s = game.state.get(seat, {})
            a = s.get("action")
            if a and all(a.get("key") != x.get("key") for x in seen[seat]):
                seen[seat].append(a)
            for r in s.get("rolls") or []:
                if r not in st["rolls"][seat]:
                    st["rolls"][seat].append(r)
        return st["turn"] is not None and game.turn > st["turn"] + 1

    g.run(policy, until=until, max_turn=16)
    return g, st, seen


def main():
    found, problems, inconclusive = {}, [], []
    for name, sc in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        g, st, seen = run(name)
        bad = g.stopped_badly()
        if bad:
            problems.append(f"{name}: {bad}")
            continue
        if st["turn"] is None:
            inconclusive.append(f"{name}: {sc['card']} was never played")
            continue
        grey = {seat: [n for n in g.notices.get(seat) or [] if GREY.search(n)] for seat in (1, 2)}
        found[name] = {"told": {seat: [a.get("said") for a in seen[seat]] for seat in (1, 2)},
                       "marks": {seat: [a.get("marks") for a in seen[seat]] for seat in (1, 2)},
                       "grey": grey, "rolls": {seat: len(st["rolls"][seat]) for seat in (1, 2)}}
        before = len(problems)
        for seat, pattern in sc["said"].items():
            hits = [a for a in seen[seat] if re.search(pattern, a.get("said") or "")]
            if not hits:
                problems.append(f"{name}: seat {seat} was never told {pattern!r}; it was told "
                                f"{found[name]['told'][seat]}")
                continue
            want_mark = (sc.get("marks") or {}).get(seat)
            if want_mark and not any(m.get("kind") == want_mark for a in hits for m in a.get("marks") or []):
                problems.append(f"{name}: seat {seat}'s window should carry a {want_mark} picture: {hits[0]}")
            for card, to in (sc.get("pictures") or {}).get(seat, []):
                if not any(c.get("name") == card and c.get("to") == to for a in hits for c in a.get("cards") or []):
                    problems.append(f"{name}: seat {seat}'s window should show {card} -> {to}: "
                                    f"{[(c.get('name'), c.get('to')) for a in hits for c in a.get('cards') or []]}")
        for seat in sc["silent"]:
            if seen[seat]:
                problems.append(f"{name}: seat {seat} should be sent no window: {found[name]['told'][seat]}")
        for seat in (1, 2):
            if grey[seat]:
                problems.append(f"{name}: seat {seat} was sent a grey line the window replaces: {grey[seat]}")
            for a in seen[seat]:
                for c in a.get("cards") or []:
                    if str(c.get("id", "")).startswith("card:"):
                        problems.append(f"{name}: seat {seat} was sent a real card id in a report")
                    if c.get("seat") == 3 - seat and c.get("to") == "hand" and seat != sc["actor"] \
                            and c.get("name") and name == "cycle":
                        problems.append(f"{name}: the card Bob drew was named to seat {seat}: {c.get('name')}")
        if sc.get("rolled") and not all(st["rolls"][seat] for seat in (1, 2)):
            problems.append(f"{name}: the roll should reach both boards (the die tumbles): {st['rolls']}")
        if len(problems) == before:
            print(f"{name}: OK: {found[name]}", flush=True)
    verdict(found, problems, "each card action told once, in the report window, to the right player",
            "; ".join(inconclusive) if inconclusive and not problems else None)


main()
