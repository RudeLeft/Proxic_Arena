"""Mana that makes more than one, and mana left floating. 2026-10-22.

    python -I scripts/check-mana-pool.py <worker.jar> <res-root> [trace-dir] [scenario...]

The owner's question: "Sol Ring gives you 2 mana when tapped but I suspect
it's not working." Each scenario is its own small game (Mechanics Lab,
Layer B) and checks the board, never the fact that a question was asked:

  sol-ring   Sol Ring alone pays {2}: Bronze Sable is cast with every
             land left untapped
  floating   Sol Ring's spare {C} is spendable: Gingerbrute ({1}) is paid
             with Sol Ring, and the {C} left floating then pays for Signal
             Pest ({1}) -- no land tapped, nothing wasted

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its cards.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
BEARS = [("Forest", 30), ("Grizzly Bears", 30)]


def game(name, seat1, seat2=BEARS):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"mana-pool-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def cast(g, frame, name):
    return g.option(frame, name=name, zone="hand", land=False)


def sol_ring_option(g, frame):
    """The payment option that taps Sol Ring, if one is offered."""
    rings = {c["id"] for c in g.mine(1, name="Sol Ring")}
    return next((o["actionId"] for o in frame.get("options", []) if card_of(o["actionId"]) in rings), None)


def pool_option(frame):
    """A payment option that spends floating mana (not a permanent, not life)."""
    return next((o["actionId"] for o in frame.get("options", [])
                 if o["actionId"].startswith("mana:pool:")), None)


def stack_empty(g):
    return not g.state.get(1, {}).get("stack")


def sol_ring():
    g = game("sol-ring", [("Mountain", 24), ("Sol Ring", 18), ("Bronze Sable", 18)])
    done = {"sable": False, "lands_before": None, "ring_offered": None}

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
            if not done["sable"] and not ring[0].get("tapped"):
                o = cast(g, f, "Bronze Sable")
                if o:
                    done["sable"] = True
                    done["lands_before"] = len(g.untapped_lands(1))
                    done["sables_before"] = len(g.mine(1, name="Bronze Sable"))
                    return o
            return g.play_land(f)
        if kind == "applyManaToCost" and done["sable"] and done["ring_offered"] is None:
            o = sol_ring_option(g, f)
            done["ring_offered"] = bool(o)
            return o  # None cancels: Sol Ring was not offered
        return DEFAULT

    def until(g):
        return done["sable"] and stack_empty(g) and done["ring_offered"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {"ring_offered": done["ring_offered"], "lands_untapped": (done["lands_before"], len(g.untapped_lands(1))),
             "sables": (done.get("sables_before"), len(g.mine(1, name="Bronze Sable"))),
             "stopped": g.stopped_badly()}
    if not done["sable"]:
        return "inconclusive", "never had Sol Ring out with Bronze Sable in hand", found
    problems = []
    if not done["ring_offered"]:
        problems.append("Sol Ring was not offered to pay {2}")
    if found["sables"][1] <= (found["sables"][0] or 0):
        problems.append("Bronze Sable did not reach the battlefield")
    if found["lands_untapped"][1] < found["lands_untapped"][0]:
        problems.append(f"a land was tapped as well: untapped lands {found['lands_untapped']}")
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "Sol Ring alone paid {2} for Bronze Sable; no land tapped", found)


def floating():
    g = game("floating", [("Mountain", 20), ("Sol Ring", 14), ("Gingerbrute", 13), ("Signal Pest", 13)])
    done = {"brute": False, "pest": False, "lands_before": None, "pool_after_brute": None,
            "pest_payment": None, "pest_options": None}

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
                if g.option(f, name="Signal Pest", zone="hand"):  # both in hand, or wait
                    o = cast(g, f, "Gingerbrute")
                    if o:
                        done["brute"] = True
                        done["lands_before"] = len(g.untapped_lands(1))
                        return o
                return g.play_land(f)
            if done["brute"] and not done["pest"] and g.mine(1, name="Gingerbrute"):
                done["pool_after_brute"] = g.player(1, 1).get("manaPool")
                o = cast(g, f, "Signal Pest")
                done["pest"] = True
                done["pest_offered"] = bool(o)
                return o
            return None if done["pest"] else g.play_land(f)
        if kind == "applyManaToCost":
            if done["brute"] and not done["pest"]:
                return sol_ring_option(g, f)  # Gingerbrute: Sol Ring only
            if done["pest"] and done["pest_payment"] is None:
                done["pest_options"] = g.labels(f)
                o = pool_option(f)
                done["pest_payment"] = "pool" if o else "no floating mana offered"
                return o  # None cancels rather than tapping a land
        return DEFAULT

    def until(g):
        return done["pest"] and stack_empty(g) and (done["pest_payment"] is not None or not done.get("pest_offered"))

    g.run(policy, until=until, max_turn=20)
    found = {"pool_after_gingerbrute": done["pool_after_brute"], "signal_pest_offered": done.get("pest_offered"),
             "pest_payment": done["pest_payment"], "pest_payment_options": done["pest_options"],
             "lands_untapped": (done["lands_before"], len(g.untapped_lands(1))),
             "pests": len(g.mine(1, name="Signal Pest")), "stopped": g.stopped_badly()}
    if not done["brute"]:
        return "inconclusive", "never had Sol Ring out with Gingerbrute and Signal Pest in hand", found
    problems = []
    if found["pool_after_gingerbrute"] != {"C": 1}:
        problems.append(f"Sol Ring paying {{1}} should leave {{C}} floating; the pool was "
                        f"{found['pool_after_gingerbrute']}")
    if not found["signal_pest_offered"]:
        problems.append("Signal Pest was not offered, though the floating {C} pays for it")
    elif found["pest_payment"] != "pool":
        problems.append("the floating {C} was not offered to pay for Signal Pest: "
                        f"{found['pest_payment_options']}")
    elif found["pests"] < 1:
        problems.append("Signal Pest did not reach the battlefield")
    if found["lands_untapped"][1] is not None and found["lands_untapped"][0] is not None \
            and found["lands_untapped"][1] < found["lands_untapped"][0]:
        problems.append(f"a land was tapped: untapped lands {found['lands_untapped']}")
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "Sol Ring's spare {C} floated and paid for Signal Pest; no land tapped", found)


SCENARIOS = {"sol-ring": sol_ring, "floating": floating}

if __name__ == "__main__":
    import json
    worst = 0
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        result, message, found = scenario()
        code = {"ok": 0, "inconclusive": 2, "wrong": 1}[result]
        worst = max(worst, code) if worst != 1 else 1
        print(f"{name}: {result.upper()}: {message}")
        if result != "ok":
            print("  " + json.dumps(found, default=str)[:900])
        sys.stdout.flush()
    sys.exit(worst)
