"""A creature type chosen from Forge's own list -- P6-AH; P11-B4 (2026-11-22).

    python -I scripts/check-semantic-choices.py <worker.jar> <res-root> [trace.jsonl]
    python -I scripts/check-semantic-choices.py --self-test

P6-AH: the values a player picks a WORD from must come from Forge, because
a list of creature types kept anywhere else is a second rules engine that
goes stale the day a set is released. Adaptive Automaton (a required card
of the Lab's corpus) is the one card that asks it as it enters:

  asked      Alice casts Adaptive Automaton with a Raging Goblin out: she
             alone is asked `chooseSomeType`, offered Forge's whole list
             (over 200 types, "Goblin" among them and not first)
  used       she picks Goblin, not the first offered, and the answer is
             what the game uses: on BOTH seats' boards the Automaton is a
             Goblin as well as a Construct, and the Raging Goblin is a 2/2
             (the Automaton's +1/+1 to other creatures of the chosen type)

Until P11-B4 this script played up to six shuffled games of four cards and
only reported whether each question was ever asked. Its other three are
held in CI by focused, dealt scenarios that check what follows the answer:
a colour (`check-text-effects.py` Mind Bend, `check-you-choose.py` brave),
a coin call and the flip told to the other player (`check-coin-flip.py`
krark, `check-card-actions.py` coin), and another creature type
(`check-cost-kinds.py` Caller of the Hunt).

Exit 0 when it held, 1 when it did not, 2 when the Automaton never entered.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, verdict  # noqa: E402

AUTOMATON, GOBLIN, CHOSEN = "Adaptive Automaton", "Raging Goblin", "Goblin"
# The Lab's deal (protocol/README.md "the Lab's deal"): the Goblin on turn
# one, the Automaton on turn three.
DEAL = {1: {"hand": ["Mountain", "Raging Goblin", "Mountain", "Adaptive Automaton", "Mountain", "Mountain",
                     "Mountain"], "top": ["Mountain", "Mountain", "Mountain"]}}


def problems_of(asked, boards):
    """`asked`: [(seat, [option labels])] of every chooseSomeType; `boards`:
    {seat: board} once the Automaton is out. The rules above, as problems."""
    problems = []
    if not asked:
        return ["no creature type was asked"]
    if any(seat != 1 for seat, _ in asked):
        problems.append(f"a seat other than the caster was asked: {[s for s, _ in asked]}")
    labels = asked[0][1]
    if len(labels) < 200:
        problems.append(f"only {len(labels)} types offered: not Forge's whole list")
    if CHOSEN not in labels:
        problems.append(f"{CHOSEN} was not offered")
    elif labels[0] == CHOSEN:
        problems.append(f"{CHOSEN} was the first type offered: picking it proves nothing")
    for seat in (1, 2):
        board = boards.get(seat) or {}
        cards = board.get("battlefield") or []
        auto = next((c for c in cards if c.get("name") == AUTOMATON and c.get("seat") == 1), None)
        gob = next((c for c in cards if c.get("name") == GOBLIN and c.get("seat") == 1), None)
        if not auto or not gob:
            problems.append(f"seat {seat} does not see Alice's Automaton and Goblin")
            continue
        if CHOSEN not in str(auto.get("types")):
            problems.append(f"seat {seat}: the Automaton is not a {CHOSEN}: {auto.get('types')!r}")
        if (gob.get("power"), gob.get("toughness")) != (2, 2):
            problems.append(f"seat {seat}: the Raging Goblin is {gob.get('power')}/{gob.get('toughness')}, not 2/2")
    return problems


def self_test():
    """The rules on made-up questions and boards: a right game passes, each planted fault fails."""
    types = ["Advisor", "Aetherborn"] + [f"Type{i}" for i in range(250)] + [CHOSEN]
    auto = {"name": AUTOMATON, "seat": 1, "types": "Artifact Creature - Construct Goblin"}
    gob = {"name": GOBLIN, "seat": 1, "power": 2, "toughness": 2}
    good = {s: {"battlefield": [auto, gob]} for s in (1, 2)}

    def fails(asked=None, boards=None):
        return bool(problems_of(asked if asked is not None else [(1, types)], boards or good))
    results = {
        "a right game passes": not problems_of([(1, types)], good),
        "a short list (not Forge's) fails": fails(asked=[(1, ["Elf", CHOSEN, "Human"])]),
        "Goblin first fails": fails(asked=[(1, [CHOSEN] + types)]),
        "the other seat asked fails": fails(asked=[(1, types), (2, types)]),
        "nothing asked fails": fails(asked=[]),
        "the answer ignored (Goblin 1/1) fails":
            fails(boards={1: good[1], 2: {"battlefield": [auto, dict(gob, power=1, toughness=1)]}}),
        "the Automaton not a Goblin fails":
            fails(boards={1: {"battlefield": [dict(auto, types="Artifact Creature - Construct"), gob]}, 2: good[2]}),
    }
    print(json.dumps(results, indent=1))
    return 0 if all(results.values()) else 1


def main():
    jar, res = sys.argv[1], sys.argv[2]
    trace = sys.argv[3] if len(sys.argv) > 3 else ""
    g = Game([("Mountain", 40), (GOBLIN, 10), (AUTOMATON, 10)], [("Mountain", 60)],
             jar=jar, res=res, trace=trace, deal=DEAL)
    st = {"asked": [], "picked": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseSomeType":
            labels = g.labels(f)
            st["asked"].append((seat, labels))
            pick = next((o["actionId"] for o in f["options"] if o.get("label") == CHOSEN), DEFAULT)
            st["picked"] = CHOSEN if pick is not DEFAULT else None
            return pick
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if not g.mine(1, name=GOBLIN):
                return g.option(f, name=GOBLIN, zone="hand", land=False)
            if not g.mine(1, name=AUTOMATON) and len(g.untapped_lands(1)) >= 3:
                return g.option(f, name=AUTOMATON, zone="hand", land=False)
            return None
        return DEFAULT

    def out(g):
        return all(any(c.get("name") == AUTOMATON for c in g.zone(s, "battlefield", owner=1)) for s in (1, 2))

    g.run(policy, until=out, max_turn=10)
    boards = {s: g.state.get(s, {}) for s in (1, 2)}
    found = {"stopped": g.stopped_badly(), "asked": [(s, len(l), l[:5]) for s, l in st["asked"]],
             "picked": st["picked"],
             "seen": {s: [(c.get("name"), c.get("types"), c.get("power"), c.get("toughness"))
                          for c in (b.get("battlefield") or []) if c.get("seat") == 1 and c.get("kind") != "land"]
                      for s, b in boards.items()}}
    if not out(g):
        verdict(found, [], "", inconclusive="Adaptive Automaton never entered the battlefield")
    problems = problems_of(st["asked"], boards)
    if found["stopped"]:
        problems.append(found["stopped"])
    verdict(found, problems, f"Adaptive Automaton: {len(st['asked'][0][1])} types from Forge, {CHOSEN} picked; "
                             "on both boards the Automaton is a Goblin and the Raging Goblin a 2/2")


if __name__ == "__main__":
    sys.exit(self_test() if sys.argv[1:] == ["--self-test"] else main())
