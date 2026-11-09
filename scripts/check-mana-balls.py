"""Spec 0062 -- a spark of mana for every payment: what each mana paid.

    python -I scripts/check-mana-balls.py <worker.jar> <res-root> [trace-dir] [scenario...]

The page flies a ball from whatever paid to the symbol of the cost it paid,
in the mana's colour. It can only do that if the game says, as each step is
paid, what each mana was and which symbol it paid -- the last mana too
(nothing is asked after it), and to the other player (who is asked
nothing). Each scenario is its own small game (Mechanics Lab, Layer B) and
reads the `payments` both seats were sent:

  nekrataal  {2}{B}{B} paid Forest, Swamp, Swamp, Swamp: four steps, green
             then black; the Forest's green pays a generic, the Swamps the
             two {B}, the last Swamp the other generic -- that last step
             sent no later than the first board on which the card is no
             longer being cast (nothing is asked after it). The other seat gets
             the same steps with colour and source but no cost and no
             symbol (the spell is face down to them).
  sol-ring   Bronze Sable ({2}) paid by Sol Ring: one step, two grey mana.
  phyrexian  Dismember {1}{B/P}{B/P}: two steps from "life", black, each
             paying a {B/P}; a Swamp's black pays the {1}.
  convoke    Venerated Loxodon {4}{W}: three Savannah Lions tapped, white,
             from each Lion; then the Plains -- all one payment, its cost
             the whole {4}{W}.
  floating   Sol Ring's spare {C} pays Signal Pest's {1}: from "pool", grey.
  ability    cycling Forgotten Cave ({R}): kind "ability", red, the {R};
             public, so the other seat is told the symbol and the cost too.

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its card.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of, verdict  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
BEARS = [("Forest", 30), ("Grizzly Bears", 30)]
HIDDEN = ("cost", "owing")
# The Lab's deal (protocol/README.md): seat 2's Bears come out on time.
BEARS_DEAL = {"hand": ["Forest", "Forest", "Forest", "Grizzly Bears", "Grizzly Bears"]}


def game(name, seat1, seat2=BEARS, hand=None, top=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"mana-balls-{name}.jsonl")
    # The Lab's deal: the opening hand and draws each scenario's moment
    # needs, so the shuffle cannot leave it inconclusive.
    deal = {1: {"hand": hand or [], "top": top or []}}
    if seat2 is BEARS:
        deal[2] = BEARS_DEAL
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal)


class Seen:
    """Every payment record each seat was sent, by n; and, per seat, the steps
    it had been sent for a card on the first board after that card stopped
    being cast."""

    def __init__(self):
        self.by_seat = {1: {}, 2: {}}
        self.casting = {1: set(), 2: set()}
        self.when_cast = {1: {}, 2: {}}

    def look(self, g):
        for seat in (1, 2):
            state = g.state.get(seat) or {}
            casting = {c.get("id") for c in state.get("casting") or []}
            for p in state.get("payments") or []:
                if p["n"] not in self.by_seat[seat]:
                    self.by_seat[seat][p["n"]] = p
            for card in self.casting[seat] - casting:
                self.when_cast[seat].setdefault(card, sorted(
                    n for n, p in self.by_seat[seat].items() if p.get("for") == card))
            self.casting[seat] = casting
        return False

    def both(self, for_id, steps):
        """Both seats have been sent at least [steps] steps for [for_id]."""
        return for_id is not None and all(len(self.of(seat, for_id)) >= steps for seat in (1, 2))

    def of(self, seat, for_id):
        return [p for n, p in sorted(self.by_seat[seat].items()) if p.get("for") == for_id]


def cast(g, frame, name):
    return g.option(frame, name=name, zone="hand", land=False)


def stack_empty(g):
    """Nothing on the stack and nothing being cast: the payment is over (a
    trace then holds the whole cast, to film)."""
    return not g.state.get(1, {}).get("stack") and not g.state.get(1, {}).get("casting")


def pay_with(g, f, name):
    """The payment option that taps a permanent of this name."""
    ids = {c["id"] for c in g.mine(1, name=name) if not c.get("tapped")}
    return next((o["actionId"] for o in f.get("options", []) if card_of(o["actionId"]) in ids), None)


def hidden_problems(seen, for_id, problems):
    """The other seat: the same steps, colour and source, never the cost."""
    mine, theirs = seen.of(1, for_id), seen.of(2, for_id)
    if [p["n"] for p in theirs] != [p["n"] for p in mine]:
        problems.append(f"seat 2 should get the same steps: {[p['n'] for p in mine]} vs {[p['n'] for p in theirs]}")
    for p in theirs:
        if any(k in p for k in HIDDEN) or any("shard" in m for m in p["mana"]):
            problems.append(f"seat 2 was told the cost of a spell drawn face down to it: {p}")
        if not all(m.get("colour") and m.get("from") for m in p["mana"]):
            problems.append(f"seat 2 needs each mana's colour and source: {p}")


def shape(records):
    return [[(m["colour"], m.get("shard"), m["from"]) for m in p["mana"]] for p in records]


# --- the scenarios ----------------------------------------------------------


def nekrataal():
    g = game("nekrataal", [("Forest", 12), ("Swamp", 24), ("Nekrataal", 24)],
             hand=["Forest", "Swamp", "Swamp", "Swamp", "Nekrataal", "Nekrataal", "Swamp"], top=["Swamp"] * 4)
    seen, done = Seen(), {"card": None, "order": []}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return DEFAULT
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            forests, swamps = g.untapped_lands(1, "Forest"), g.untapped_lands(1, "Swamp")
            if not done["card"] and forests and len(swamps) >= 3 and stack_empty(g):
                o = cast(g, f, "Nekrataal")
                if o:
                    done["card"] = card_of(o)
                    return o
            if not g.mine(1, name="Forest"):
                return g.play_land(f, prefer="Forest")
            return g.play_land(f, prefer="Swamp")
        if kind == "applyManaToCost" and done["card"]:
            o = (pay_with(g, f, "Forest") if not done["order"] else None) or pay_with(g, f, "Swamp")
            done["order"].append(card_of(o))
            return o
        if kind == "chooseCardsToDiscardToMaximumHandSize":
            return next((o["actionId"] for o in f["options"] if "Forest" in (o.get("label") or "")),
                        f["options"][0]["actionId"])
        return DEFAULT

    g.run(policy, until=lambda g: seen.look(g) or (seen.both(done["card"], 4)
                                                   and stack_empty(g)), max_turn=24)
    mine = seen.of(1, done["card"])
    found = {"tapped": done["order"], "seat1": mine, "seat2": seen.of(2, done["card"]),
             "steps_when_cast": {seat: seen.when_cast[seat].get(done["card"]) for seat in (1, 2)},
             "stopped": g.stopped_badly()}
    if not done["card"]:
        return "inconclusive", "never had a Forest and three Swamps with Nekrataal", found
    problems = []
    want = [[("G", "1", done["order"][0])], [("B", "B", done["order"][1])], [("B", "B", done["order"][2])],
            [("B", "1", done["order"][3])]] if len(done["order"]) == 4 else None
    if shape(mine) != want:
        problems.append(f"each mana's colour, symbol and source: {shape(mine)}, wanted {want}")
    if any(p.get("cost") != "{2}{B}{B}" for p in mine):
        problems.append(f"the cost being paid is {{2}}{{B}}{{B}}: {[p.get('cost') for p in mine]}")
    if len({p["payment"] for p in mine}) != 1 or any(p.get("kind") != "cast" for p in mine):
        problems.append("four steps of one payment, for a spell being cast")
    for seat in (1, 2):
        if found["steps_when_cast"][seat] != [p["n"] for p in mine]:
            problems.append(f"seat {seat}: every step, the last too, must be told by the first board after "
                            f"the cast: {found['steps_when_cast'][seat]}")
    hidden_problems(seen, done["card"], problems)
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "G->{1}, B->{B}, B->{B}, the last B->{1} (told with the cast); seat 2: colours, no cost", found)


def sol_ring():
    g = game("sol-ring", [("Mountain", 24), ("Sol Ring", 18), ("Bronze Sable", 18)],
             hand=["Mountain", "Sol Ring", "Bronze Sable", "Mountain", "Mountain", "Bronze Sable", "Mountain"],
             top=["Mountain"] * 3)
    seen, done = Seen(), {"card": None}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return DEFAULT
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            ring = g.mine(1, name="Sol Ring")
            if not ring:
                return (cast(g, f, "Sol Ring") if g.untapped_lands(1) else None) or g.play_land(f)
            if not done["card"] and not ring[0].get("tapped"):
                o = cast(g, f, "Bronze Sable")
                if o:
                    done["card"] = card_of(o)
                    return o
            return g.play_land(f)
        if kind == "applyManaToCost" and done["card"]:
            return pay_with(g, f, "Sol Ring") or DEFAULT
        return DEFAULT

    g.run(policy, until=lambda g: seen.look(g) or (seen.both(done["card"], 1) and stack_empty(g)),
          max_turn=16)
    mine = seen.of(1, done["card"])
    ring = next((c["id"] for c in g.mine(1, name="Sol Ring")), None)
    found = {"seat1": mine, "seat2": seen.of(2, done["card"]), "ring": ring}
    if not done["card"]:
        return "inconclusive", "never had Sol Ring out with Bronze Sable in hand", found
    problems = []
    if shape(mine) != [[("C", "1", ring), ("C", "1", ring)]]:
        problems.append(f"one tap, two grey mana, each a generic: {shape(mine)}")
    hidden_problems(seen, done["card"], problems)
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "Sol Ring: one step, two colourless mana, each paying a {1}", found)


def phyrexian():
    g = game("phyrexian", [("Swamp", 30), ("Dismember", 30)], hand=["Swamp"] + ["Dismember"] * 6)
    seen, done = Seen(), {"card": None}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            if f.get("kind") == "chooseSpellAbilityToPlay":
                return g.play_land(f) or (g.option(f, name="Grizzly Bears")
                                          if len(g.untapped_lands(2)) >= 2 else None)
            return DEFAULT
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if not g.mine(1, name="Swamp"):
                return g.play_land(f)
            bears = g.zone(1, "battlefield", owner=2, name="Grizzly Bears")
            if bears and not done["card"] and len(g.untapped_lands(1)) == 1:
                o = cast(g, f, "Dismember")
                if o:
                    done["card"] = card_of(o)
                return o
            return None
        if kind == "applyManaToCost":
            life = [o for o in f["options"] if o["actionId"] == "mana:life:phyrexian"]
            return life[0]["actionId"] if life else f["options"][0]["actionId"]
        return DEFAULT

    g.run(policy, until=lambda g: seen.look(g) or (seen.both(done["card"], 3)
                                                   and stack_empty(g)), max_turn=24)
    mine = seen.of(1, done["card"])
    found = {"seat1": mine, "seat2": seen.of(2, done["card"])}
    if not done["card"]:
        return "inconclusive", "Dismember was never cast", found
    problems = []
    got = shape(mine)
    if got[:2] != [[("B", "B/P", "life")], [("B", "B/P", "life")]]:
        problems.append(f"two steps of 2 life, each a {{B/P}}, black: {got}")
    if len(got) != 3 or got[2][0][:2] != ("B", "1") or not str(got[2][0][2]).startswith("card:"):
        problems.append(f"then the Swamp's black pays the {{1}}: {got}")
    hidden_problems(seen, done["card"], problems)
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "two {B/P} from life, black; the Swamp's black pays the {1}", found)


def convoke():
    g = game("convoke", [("Plains", 24), ("Savannah Lions", 18), ("Venerated Loxodon", 18)],
             hand=["Plains", "Plains", "Savannah Lions", "Savannah Lions", "Savannah Lions", "Venerated Loxodon",
                   "Plains"], top=["Plains"] * 4)
    seen, done = Seen(), {"card": None, "tapped": []}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return DEFAULT
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            lions = g.mine(1, name="Savannah Lions")
            if len(g.mine(1, name="Plains")) < 2:
                land = g.play_land(f)
                if land:
                    return land
            o = cast(g, f, "Venerated Loxodon")
            if o and not done["card"] and len(lions) >= 3 and len(g.untapped_lands(1)) >= 2:
                done["card"] = card_of(o)
                return o
            if len(lions) < 3 and g.untapped_lands(1):
                return cast(g, f, "Savannah Lions")
            return None
        if kind == "chooseCardsForConvokeOrImprovise":
            # Only while it is really being cast: the game also asks this
            # while it only checks what the card would cost.
            casting = any(c.get("id") == done["card"] for c in g.state.get(1, {}).get("casting") or [])
            lions = [o for o in f["options"] if any(c["id"] == card_of(o["actionId"])
                                                    for c in g.mine(1, name="Savannah Lions"))]
            if casting and lions and len(done["tapped"]) < 3:
                done["tapped"].append(card_of(lions[0]["actionId"]))
                return lions[0]["actionId"]
            return None
        if kind == "chooseCardsToDiscardToMaximumHandSize":
            return next((o["actionId"] for o in f["options"] if "Plains" in (o.get("label") or "")),
                        f["options"][0]["actionId"])
        return DEFAULT

    g.run(policy, until=lambda g: seen.look(g) or (seen.both(done["card"], 5)
                                                   and stack_empty(g)), max_turn=40)
    mine = seen.of(1, done["card"])
    found = {"convoked": done["tapped"], "seat1": mine, "seat2": seen.of(2, done["card"])}
    if not done["card"]:
        return "inconclusive", "never had three Lions and two Plains", found
    problems = []
    got = shape(mine)
    lions = [m for step in got[:3] for m in step]
    if [m[2] for m in lions] != done["tapped"] or any(m[0] != "W" for m in lions):
        problems.append(f"three white balls, one from each Lion tapped: {got[:3]} vs {done['tapped']}")
    if sorted(m[1] for m in lions) != ["1", "1", "W"]:
        problems.append(f"the Lions pay the {{W}} and two generic: {[m[1] for m in lions]}")
    plains = [m for step in got[3:] for m in step]
    if len(plains) != 2 or any(m[0] != "W" or m[1] != "1" for m in plains):
        problems.append(f"then two Plains, white, each a generic: {got[3:]}")
    if len({p["payment"] for p in mine}) != 1 or any(p.get("cost") != "{4}{W}" for p in mine):
        problems.append(f"convoke and mana are one payment of {{4}}{{W}}: {[(p['payment'], p.get('cost')) for p in mine]}")
    hidden_problems(seen, done["card"], problems)
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "three Lions (white, from each) then two Plains: one payment of {4}{W}", found)


def floating():
    g = game("floating", [("Mountain", 20), ("Sol Ring", 14), ("Gingerbrute", 13), ("Signal Pest", 13)],
             hand=["Mountain", "Sol Ring", "Gingerbrute", "Signal Pest", "Mountain", "Mountain", "Signal Pest"],
             top=["Mountain"] * 3)
    seen, done = Seen(), {"brute": None, "pest": None}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return DEFAULT
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            ring = g.mine(1, name="Sol Ring")
            if not ring:
                return (cast(g, f, "Sol Ring") if g.untapped_lands(1) else None) or g.play_land(f)
            if not done["brute"] and not ring[0].get("tapped"):
                o = cast(g, f, "Gingerbrute")
                if o and g.zone(1, "hand", owner=1, name="Signal Pest"):
                    done["brute"] = card_of(o)
                    return o
            if done["brute"] and not done["pest"] and (g.player(1, 1).get("manaPool") or {}).get("C"):
                o = cast(g, f, "Signal Pest")
                if o:
                    done["pest"] = card_of(o)
                    return o
            return g.play_land(f)
        if kind == "applyManaToCost" and done["brute"]:
            pool = next((o["actionId"] for o in f["options"] if o["actionId"].startswith("mana:pool:")), None)
            return pool or pay_with(g, f, "Sol Ring") or DEFAULT
        return DEFAULT

    g.run(policy, until=lambda g: seen.look(g) or (seen.both(done["pest"], 1) and stack_empty(g)),
          max_turn=16)
    mine = seen.of(1, done["pest"])
    found = {"seat1": mine, "seat2": seen.of(2, done["pest"]), "brute": seen.of(1, done["brute"])}
    if not done["pest"]:
        return "inconclusive", "never had Sol Ring's spare mana with Signal Pest in hand", found
    problems = []
    if shape(mine) != [[("C", "1", "pool")]]:
        problems.append(f"the floating {{C}} pays the {{1}}, from the mana display: {shape(mine)}")
    hidden_problems(seen, done["pest"], problems)
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "mana already made: one grey ball from the pool to the {1}", found)


def ability():
    g = game("ability", [("Mountain", 30), ("Forgotten Cave", 30)],
             hand=["Mountain", "Forgotten Cave", "Forgotten Cave", "Mountain", "Forgotten Cave", "Mountain",
                   "Forgotten Cave"])
    seen, done = Seen(), {"card": None}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return DEFAULT
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            cycle = next((o for o in f["options"] if (o.get("use") or {}).get("kind") == "cycling"), None)
            if cycle and not done["card"] and g.untapped_lands(1, "Mountain") and stack_empty(g):
                done["card"] = card_of(cycle["actionId"])
                return cycle["actionId"]
            return g.play_land(f, prefer="Mountain")
        if kind == "applyManaToCost" and done["card"]:
            return pay_with(g, f, "Mountain") or DEFAULT
        return DEFAULT

    g.run(policy, until=lambda g: seen.look(g) or (seen.both(done["card"], 1) and stack_empty(g)),
          max_turn=16)
    mine, theirs = seen.of(1, done["card"]), seen.of(2, done["card"])
    found = {"seat1": mine, "seat2": theirs}
    if not done["card"]:
        return "inconclusive", "never cycled Forgotten Cave with a Mountain up", found
    problems = []
    got = shape(mine)
    if len(got) != 1 or got[0][0][:2] != ("R", "R") or not str(got[0][0][2]).startswith("card:"):
        problems.append(f"the Mountain's red pays the {{R}}: {got}")
    if any(p.get("kind") != "ability" for p in mine):
        problems.append(f"an ability's payment: {[p.get('kind') for p in mine]}")
    if shape(theirs) != got or any(p.get("cost") != "{R}" for p in theirs):
        problems.append(f"an ability is public: seat 2 sees the symbol and the cost too: {theirs}")
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "cycling: the Mountain's red pays the {R}; the other seat is told it all", found)


SCENARIOS = {"nekrataal": nekrataal, "sol-ring": sol_ring, "phyrexian": phyrexian, "convoke": convoke,
             "floating": floating, "ability": ability}


def main():
    results, problems, inconclusive = {}, [], []
    for name, run in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        status, text, found = run()
        results[name] = {"status": status, "says": text, "found": found}
        print(f"== {name}: {status.upper()}: {text}", flush=True)
        if status == "wrong":
            problems.append(f"{name}: {text}")
        elif status == "inconclusive":
            inconclusive.append(f"{name}: {text}")
    verdict(results, problems, "every payment step told what each mana paid, to both seats",
            "; ".join(inconclusive) if inconclusive and not problems else None)


if __name__ == "__main__":
    main()
