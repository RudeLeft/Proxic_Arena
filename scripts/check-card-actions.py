"""Card actions told in the report window -- spec 0075 (owner 2026-11-12).

    python -I scripts/check-card-actions.py <worker.jar> <res-root> [trace-dir|trace.jsonl] [scenario...]

Bob (seat 2) does something with a card; Alice (seat 1) is the other
player. Each scenario checks the report window each seat is sent (one
sentence naming who did it, in that reader's words), who is sent none, and
that no grey notice repeats it (no "Cycled: ...", no "Bob chose white", no
"... the flip", no "You rolled 4", no "There are no cards in ...").

  unsummon  F-0075-A, as spec 0109 item 7 changed it: Bob's Unsummon on
            Alice's Grizzly Bears: its arrow and the Bears flying home told
            it, so neither seat is sent a window (it was Alice's "Bob
            returned your Grizzly Bears to your hand."; what keeps a bounce
            window is scripts/check-quiet-reports.py)
  bounce    F-0075-A, as spec 0109 changed it: the other way round --
            Alice's Unsummon on Bob's Bears: no window for either seat
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
  mana      F-0092-B (spec 0092): Bob casts Birds of Paradise with Jungle
            Hollow ({B} or {G}), then Putrid Leech ({B}{G}) with two of
            Jungle Hollow, Dismal Backwater ({U} or {B}) and the Birds (any
            colour). Forge announces each colour to Alice; none is a window
            for anyone, nor a grey line ("Bob picked {B}"). The Leech must
            resolve, or the scenario proves nothing. (Voice of All's colour,
            still a window, is "color" above.)

Spec 0097 (owner 2026-11-16) -- fewer windows for the player who acted,
grey notices made windows:

  counter   F-0097-E, as spec 0109 item 7 changed it: Alice's Counterspell
            on Bob's Grizzly Bears: the arrow and the spell to his
            graveyard told it, so neither seat is sent a window (it was
            Bob's "Alice countered your Grizzly Bears.")
  mill      F-0097-E: Alice's Thought Scour on Bob: Bob reads "You milled
            2 cards."; Alice is sent nothing
  unpaid    F-0097-C: Bob's Lightning Rift triggers when he cycles with his
            last land: he can't pay {1}. Both read the fizzle window --
            Alice "Bob's Lightning Rift did nothing: they couldn't pay {1}.",
            Bob "Your Lightning Rift did nothing: you couldn't pay {1}." --
            and no grey "... so it was skipped." line
  reveal    F-0097-E: Bob's Armored Kincaller enters and he reveals a
            Dinosaur from his hand (a plain reveal, shown to every player):
            the reveal tray is Alice's; Bob is shown no tray of his own
            reveal (Goblin Ringleader's was already the other player's
            alone: Amendment 13, item 7)
  (Bounce audiences, where a window stays -- a library, no arrow --, are
  scripts/check-quiet-reports.py's griptide and untargeted: the one it
  happened to only. A game restart is scripts/check-karn.py.)

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
GREY = re.compile(r"^(Cycled|.*\bchose\b|.*\bpicked\b|.*\bthe flip\b|.*\brolled\b|There are no cards in |Looking at "
                  r"|.*so it was skipped|.*cannot be named)",
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
                  # Spec 0109, item 7: no window (was seat 1's "Bob returned your ...").
                  said={}, silent=[1, 2]),
    "bounce": S(actor=1, card="Unsummon", lands=1,
                decks={2: BEARS, 1: [("Island", 30), ("Unsummon", 30)]},
                deal={2: BEARS_DEAL, 1: {"hand": ["Island"] * 4 + ["Unsummon"] * 3, "top": ["Island"] * 3}},
                ready=lambda g: bool(g.mine(2, name="Grizzly Bears")), target="Grizzly Bears",
                # Spec 0109, item 7: no window (was seat 2's "Alice returned your ...").
                said={}, silent=[1, 2]),
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
    "mana": S(actor=2, card="Putrid Leech", lands=1,
              decks={1: BEARS, 2: [("Jungle Hollow", 15), ("Dismal Backwater", 15), ("Birds of Paradise", 15),
                                   ("Putrid Leech", 15)]},
              deal={1: BEARS_DEAL,
                    2: {"hand": ["Jungle Hollow", "Dismal Backwater", "Birds of Paradise"] + ["Putrid Leech"] * 4,
                        "top": ["Dismal Backwater"] * 3}},
              # Birds on the table since an earlier turn (cast with Jungle Hollow's {G}).
              ready=lambda g: any(not c.get("tapped") and not c.get("sick")
                                  for c in g.mine(2, name="Birds of Paradise")),
              birds=True, said={}, silent=[1, 2], resolved="Putrid Leech"),
    # --- spec 0097 ---
    "counter": S(actor=1, card="Counterspell", lands=2,
                 decks={2: BEARS, 1: [("Island", 30), ("Counterspell", 30)]},
                 deal={2: BEARS_DEAL, 1: {"hand": ["Island"] * 4 + ["Counterspell"] * 3, "top": ["Island"] * 3}},
                 ready=lambda g: any(e.get("name") == "Grizzly Bears"
                                     for e in (g.state.get(1) or {}).get("stack") or []),
                 target="Grizzly Bears",
                 # Spec 0109, item 7: no window (was seat 2's "Alice countered your Grizzly Bears.").
                 said={}, silent=[1, 2]),
    "mill": S(actor=1, card="Thought Scour", lands=1,
              decks={2: BEARS, 1: [("Island", 30), ("Thought Scour", 30)]},
              deal={2: BEARS_DEAL, 1: {"hand": ["Island"] * 4 + ["Thought Scour"] * 3, "top": ["Island"] * 3}},
              target="Bob", said={2: r"^You milled two cards\.$"}, silent=[1]),
    "unpaid": S(actor=2, card="Lightning Rift", lands=2, rift=True,
                decks={1: BEARS, 2: [("Mountain", 20), ("Lightning Rift", 10), ("Forgotten Cave", 30)]},
                deal={1: BEARS_DEAL,
                      2: {"hand": ["Mountain"] * 2 + ["Lightning Rift"] + ["Forgotten Cave"] * 4,
                          "top": ["Forgotten Cave"] * 4}},
                said={1: r"^Bob's Lightning Rift did nothing: they couldn't pay \{1\}\.$",
                      2: r"^Your Lightning Rift did nothing: you couldn't pay \{1\}\.$"}, silent=[],
                pictures={1: [("Lightning Rift", "battlefield")], 2: [("Lightning Rift", "battlefield")]}),
    "reveal": S(actor=2, card="Armored Kincaller", lands=3,
                decks={1: BEARS, 2: [("Forest", 30), ("Armored Kincaller", 30)]},
                deal={1: BEARS_DEAL,
                      2: {"hand": ["Forest"] * 4 + ["Armored Kincaller"] * 3, "top": ["Forest"] * 4}},
                said={}, silent=[], tray={1: True, 2: False}),
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
    st = {"turn": None, "rolls": {1: [], 2: []}, "trays": {1: [], 2: []}}
    seen = {1: [], 2: []}
    ready = sc.get("ready") or (lambda g: True)

    def policy(game, f):
        seat, kind = f["authorisedSeat"], f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if seat == other:
                # The other player plays out: lands, Bears, every Ornithopter.
                return game.play_land(f) or game.option(f, name="Grizzly Bears", zone="hand", land=False) \
                    or game.option(f, name="Ornithopter", zone="hand", land=False)
            if sc.get("rift"):
                # Spec 0097 -- Lightning Rift on the table, then cycle Caves
                # (declining to pay while he could): the cycle with the last
                # untapped land leaves the {1} unpayable.
                lands = game.untapped_lands(actor)
                if not game.mine(actor, name="Lightning Rift"):
                    land = game.play_land(f, prefer="Mountain")
                    if land:
                        return land
                    if len(lands) >= 2:
                        return game.option(f, name="Lightning Rift", zone="hand", land=False)
                    return None
                caves = game.mine(actor, "hand", name="Forgotten Cave")
                if st["turn"] is None and caves and lands:
                    for o in f["options"]:
                        if o.get("objectId") == caves[0]["id"] and (o.get("use") or {}).get("kind") == "cycling":
                            if len(lands) == 1:
                                st["turn"] = game.turn
                            return o["actionId"]
                return None
            if st["turn"] is not None:
                return game.play_land(f, prefer=sc["decks"][actor][0][0]) if not sc.get("cycle") else None
            land = game.play_land(f, prefer=sc["decks"][actor][0][0])
            if land and not sc.get("cycle"):
                return land
            if sc.get("birds") and not game.mine(actor, name="Birds of Paradise"):
                birds = game.option(f, name="Birds of Paradise", zone="hand", land=False)
                if birds:
                    return birds
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
        if sc.get("rift") and kind == "confirmPayment" and seat == actor:
            return None
        if kind == "chooseCardsToRevealFromHand" and seat == actor and f.get("options"):
            return f["options"][0]["actionId"]
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
            # Spec 0097 -- the reveal tray each seat was shown.
            t = s.get("reveal")
            if t and t.get("key") not in st["trays"][seat]:
                st["trays"][seat].append(t.get("key"))
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
        if sc.get("resolved") and not g.mine(sc["actor"], name=sc["resolved"]):
            problems.append(f"{name}: {sc['resolved']} never reached the battlefield: nothing was paid for")
        # Spec 0097, item 7 -- a plain reveal: the other player's tray only.
        for seat, want in (sc.get("tray") or {}).items():
            got = bool(st["trays"][seat]) or (want and any(a.get("said") for a in seen[seat]))
            if got != want:
                problems.append(f"{name}: seat {seat} should {'' if want else 'not '}be shown the reveal: "
                                f"trays {st['trays'][seat]}, windows {found[name]['told'][seat]}")
        found[name]["trays"] = {seat: len(st["trays"][seat]) for seat in (1, 2)}
        if sc.get("rolled") and not all(st["rolls"][seat] for seat in (1, 2)):
            problems.append(f"{name}: the roll should reach both boards (the die tumbles): {st['rolls']}")
        if len(problems) == before:
            print(f"{name}: OK: {found[name]}", flush=True)
    verdict(found, problems, "each card action told once, in the report window, to the right player",
            "; ".join(inconclusive) if inconclusive and not problems else None)


main()
