"""How a game is won and lost, decided by Forge. P6-AP.

    python -I scripts/check-results.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B). The result
is read off GAME_ENDED and the last board; Proxic never infers a result
from life totals, so each one is set up so that inferring it would be
WRONG.

  felidar   Felidar Sovereign: at the beginning of its controller's
            upkeep with 40 or more life, that player wins -- with the
            opponent on 20, and Forge's reason names the card
  platinum  Platinum Angel: its controller at 0 life or less stays in
            the game for turns; when the Angel is destroyed they lose
  grace     Angel's Grace: split second (nobody can cast a spell while
            it is on the stack), then lethal damage leaves its caster
            on 1 life and still playing

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its card.
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
        trace = os.path.join(TRACES, f"results-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def cast(g, frame, name):
    return g.option(frame, name=name, zone="hand", land=False)


def pick(frame, text):
    return next((o["actionId"] for o in frame.get("options", []) if (o.get("label") or "") == text), None)


def life(g, seat, viewer=1):
    return g.player(viewer, seat).get("life")


def ended(g):
    e = g.ended or {}
    return {k: e.get(k) for k in ("outcome", "winningSeat", "turn", "reason")} if e else None


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


# --- the scenarios ----------------------------------------------------------


def felidar():
    g = game("felidar", [("Plains", 24), ("Felidar Sovereign", 12), ("Angel's Mercy", 24)])

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return DEFAULT
        if f.get("kind") == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if not g.mine(1, name="Felidar Sovereign"):
                o = cast(g, f, "Felidar Sovereign")
                if o:
                    return o
            if (life(g, 1) or 0) < 40:
                return cast(g, f, "Angel's Mercy")
            return None
        return DEFAULT

    g.run(policy, max_turn=60)
    found = {"ended": ended(g), "phase": g.state.get(1, {}).get("phase"),
             "life": (life(g, 1), life(g, 2)), "felidar": bool(g.mine(1, name="Felidar Sovereign")),
             "stopped": g.stopped_badly()}
    if not g.ended or not found["felidar"] or (found["life"][0] or 0) < 40:
        return "inconclusive", "never had Felidar Sovereign out and 40 life", found
    e = found["ended"]
    problems = [found["stopped"]] if found["stopped"] else []
    if e["outcome"] != "WINNER" or e["winningSeat"] != 1:
        problems.append(f"seat 1 should have won: {e}")
    if "Felidar Sovereign" not in str(e.get("reason")):
        problems.append(f"Forge's reason should name Felidar Sovereign: {e.get('reason')!r}")
    if "UPKEEP" not in str(found["phase"]).upper():
        problems.append(f"the win should come in the upkeep, the board says {found['phase']!r}")
    if (found["life"][1] or 0) <= 0:
        problems.append(f"the opponent should still be alive: {found['life']}")
    return result(problems, f"won in the upkeep on {found['life'][0]} life, the opponent on "
                            f"{found['life'][1]}, and Forge's reason names Felidar Sovereign", found)


def platinum():
    g = game("platinum", [("Plains", 26), ("Platinum Angel", 34)],
             [("Mountain", 18), ("Swamp", 10), ("Lightning Bolt", 22), ("Doom Blade", 10)])
    st = {"low_turn": None, "low_life": None, "blade": False}

    def angel(g):
        return g.zone(2, "battlefield", owner=1, name="Platinum Angel")

    def policy(g, f):
        kind = f.get("kind")
        if f["authorisedSeat"] == 1:
            if kind == "chooseSpellAbilityToPlay":
                return g.play_land(f) or (None if g.mine(1, name="Platinum Angel")
                                          else cast(g, f, "Platinum Angel"))
            return DEFAULT
        # Seat 2: burn seat 1 only once the Angel is out, then, two turns
        # after seat 1 went to 0 or less and stayed, destroy the Angel.
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f, prefer="Swamp" if not g.mine(2, name="Swamp") else None)
            if land:
                return land
            if not angel(g):
                return None
            if st["low_turn"] is not None and g.turn >= st["low_turn"] + 2:
                o = cast(g, f, "Doom Blade")
                if o:
                    st["blade"] = True
                    return o
                return None
            return cast(g, f, "Lightning Bolt")
        if kind == "chooseTargetsFor":
            for want in ("Platinum Angel", "Alice"):
                o = next((o["actionId"] for o in f["options"] if want in (o.get("label") or "")), None)
                if o and (want == "Alice") != st["blade"]:
                    return o
            return f["options"][0]["actionId"] if f.get("options") else None
        return DEFAULT

    def until(g):
        if angel(g) and (life(g, 1, viewer=2) or 0) <= 0 and st["low_turn"] is None:
            st["low_turn"], st["low_life"] = g.turn, life(g, 1, viewer=2)
        return False

    g.run(policy, until=until, max_turn=70)
    found = {"low_turn": st["low_turn"], "low_life": st["low_life"], "blade": st["blade"],
             "ended": ended(g), "angel": bool(g.zone(2, "battlefield", owner=1, name="Platinum Angel")),
             "stopped": g.stopped_badly()}
    if st["low_turn"] is None or not st["blade"]:
        return "inconclusive", "seat 1 never went to 0 life with the Angel out and then lost it", found
    e = found["ended"] or {}
    problems = [found["stopped"]] if found["stopped"] else []
    if e.get("turn") is not None and e["turn"] < st["low_turn"] + 2:
        problems.append(f"the game ended on turn {e['turn']}, but seat 1 went to {st['low_life']} life "
                        f"on turn {st['low_turn']} with the Angel out")
    if e.get("outcome") != "WINNER" or e.get("winningSeat") != 2:
        problems.append(f"with the Angel destroyed, seat 2 should have won: {e}")
    return result(problems, f"on {st['low_life']} life with Platinum Angel out from turn {st['low_turn']}, "
                            f"seat 1 played on; once Doom Blade destroyed it, Forge ended the game "
                            f"on turn {e.get('turn')}", found)


def grace():
    # Bob is the burn: he Bolts Alice to 3 or less, one at a time, and
    # Bolts her again once her Angel's Grace has resolved. Alice only
    # needs a Plains and a Grace, so the scenario no longer waits on a
    # lucky draw: when Alice burned herself (and needed a Mountain, six
    # Bolts and then Grace together) it ran past turn 40 in about one CI
    # run in three.
    g = game("grace", [("Plains", 20), ("Angel's Grace", 40)],
             [("Mountain", 30), ("Lightning Bolt", 30)])
    st = {"grace_turn": None, "on_stack_offered": {1: set(), 2: set()}, "asked_during": {1: 0, 2: 0},
          "lethal": None, "bolt_seen": False, "after": None, "grace_seen": False}

    def grace_on_stack(g):
        return any("Angel's Grace" in (s.get("description") or "") for s in g.state.get(1, {}).get("stack") or [])

    def stack_empty(g):
        return not g.state.get(1, {}).get("stack")

    def policy(g, f):
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay" and grace_on_stack(g):
            # Split second: anything but a mana ability is a rules breach.
            st["asked_during"][seat] += 1
            for o in f["options"]:
                label = o.get("label") or ""
                if "{T}: Add" not in label:
                    st["on_stack_offered"][seat].add(label)
            return None
        if kind == "chooseTargetsFor":
            o = pick(f, "Alice")
            return o or (f["options"][0]["actionId"] if f.get("options") else None)
        if kind != "chooseSpellAbilityToPlay":
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        hp = life(g, 1) or 0
        if st["grace_turn"] is not None and st["lethal"] is None and g.turn > st["grace_turn"]:
            st["grace_turn"] = None  # a Grace turn went by without the Bolt: again
            st["grace_seen"] = False
        if seat == 2:
            if not stack_empty(g):
                # One at a time: life is read before a Bolt on the stack
                # has resolved. And while Grace is on the stack a Bolt is
                # exactly what split second must keep off this list.
                return None
            if st["grace_turn"] is None:
                return cast(g, f, "Lightning Bolt") if hp > 3 else None
            # Only once Grace has really been on the stack and resolved:
            # Forge undoes a cast it cannot pay for, and a Bolt after an
            # undone Grace is simply lethal.
            if st["grace_turn"] == g.turn and st["grace_seen"] and st["lethal"] is None:
                o = cast(g, f, "Lightning Bolt")
                if o:
                    st["lethal"] = hp
                return o
            return None
        # Alice: Grace on her own turn, at 3 or less, when Bob can answer
        # with a Bolt (so split second has a castable spell to hold back,
        # and the lethal Bolt can follow it), and with a Plains to spare:
        # a player with nothing at all to do is not asked, and the check
        # below wants both players asked while Grace is on the stack.
        bob_ready = g.untapped_lands(2, name="Mountain") and g.zone(2, "hand", owner=2, name="Lightning Bolt")
        if (st["grace_turn"] is None and hp <= 3 and stack_empty(g) and bob_ready
                and len(g.untapped_lands(1, name="Plains")) >= 2
                and g.state.get(1, {}).get("activeSeat") == 1):
            o = cast(g, f, "Angel's Grace")
            if o:
                st["grace_turn"] = g.turn
            return o
        return None

    def until(g):
        if grace_on_stack(g):
            st["grace_seen"] = True
        # Life is read once the Bolt has been on the stack and left it.
        stack = g.state.get(1, {}).get("stack") or []
        if st["lethal"] is not None and any("Lightning Bolt" in (s.get("description") or "") for s in stack):
            st["bolt_seen"] = True
        if st["bolt_seen"] and not stack and st["after"] is None:
            st["after"] = life(g, 1)
        return st["after"] is not None and g.turn >= st["grace_turn"] + 2

    g.run(policy, until=until, max_turn=60)
    found = {"grace_turn": st["grace_turn"], "life_before_bolt": st["lethal"], "life_after": st["after"],
             "offered_during_split_second": {k: sorted(v) for k, v in st["on_stack_offered"].items()},
             "priority_during_split_second": st["asked_during"],
             "turn_now": g.turn, "ended": ended(g), "stopped": g.stopped_badly()}
    if st["lethal"] is None or st["after"] is None:
        return "inconclusive", "never cast Angel's Grace and then a lethal Bolt in one turn", found
    problems = [found["stopped"]] if found["stopped"] else []
    if not all(st["asked_during"].values()):
        problems.append(f"both players should get priority with Angel's Grace on the stack: {st['asked_during']}")
    for seat, labels in found["offered_during_split_second"].items():
        if labels:
            problems.append(f"split second: seat {seat} was offered {labels}")
    if st["after"] != 1:
        problems.append(f"lethal damage under Angel's Grace should leave 1 life: {st['lethal']} -> {st['after']}")
    if g.ended:
        problems.append(f"the game ended: {found['ended']}")
    return result(problems, f"split second held (nothing castable while it was on the stack); "
                            f"a Bolt at {st['lethal']} life left its caster on 1, still playing two turns on",
                  found)


SCENARIOS = {"felidar": felidar, "platinum": platinum, "grace": grace}

if __name__ == "__main__":
    import json
    worst = 0
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        verdict_, message, found = scenario()
        code = {"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_]
        worst = 1 if 1 in (worst, code) else max(worst, code)
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:900])
        sys.stdout.flush()
    sys.exit(worst)
