"""Priority stops: Arena-style passing, and nothing but passing. PHASE_07 §7.53, AMENDMENT 13, P7-R.

    python -I scripts/check-stops.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is its own small game against Forge, both seats with the
default stops the server sends (STOPS below).

  quiet      an eight-turn game asks a fraction of the priority questions
             a game without stops asks, and none at a step nobody stops
             at with an empty stack (upkeep, draw, beginning and end of
             combat, end step) -- while the land drops and the attack
             question still happen
  respond    seat 1 casts Lightning Bolt; seat 2, holding a Bolt and an
             untapped Mountain, is asked (a response is never skipped)
  nothing    the same Bolt, but seat 2 holds only creatures and lands: it
             is passed for, not asked
  pass-turn  seat 1 passes to the end of its turn in Main 1: not asked again
             that turn, and asked again on its next one

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]

# The server's defaults (AMENDMENT 13): your main phases, and combat once
# there is one; everything else passes unless something is on the stack.
STOPS = {"own": ["MAIN1", "COMBAT_DECLARE_BLOCKERS", "MAIN2"],
         "opponent": ["COMBAT_DECLARE_ATTACKERS", "COMBAT_DECLARE_BLOCKERS"]}
QUIET_STEPS = {"UPKEEP", "DRAW", "COMBAT_BEGIN", "COMBAT_END", "END_OF_TURN"}
RED = [("Mountain", 24), ("Raging Goblin", 12), ("Lightning Bolt", 12), ("Shock", 12)]
BEARS = [("Forest", 30), ("Grizzly Bears", 30)]


def game(name, seat1, seat2, stops=True):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"stops-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace,
                stops={1: STOPS, 2: STOPS} if stops else None)


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def where(g, f):
    st = g.state.get(f["authorisedSeat"]) or {}
    return st.get("turn"), st.get("phase"), bool(st.get("stack")), st.get("activeSeat")


def survey(stops):
    g = game("quiet" if stops else "quiet-all", RED, RED, stops)
    asked = []
    drops = {"held": set(), "played": set()}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat = f["authorisedSeat"]
        asked.append((f.get("kind"), phase, stack, seat == active))
        if f.get("kind") == "chooseSpellAbilityToPlay":
            # A land drop is owed whenever the active player holds a
            # Mountain in a main phase: stops must never skip it.
            hand = (g.state.get(seat) or {}).get("hand", [])
            if seat == active and str(phase).startswith("MAIN") \
                    and any(c.get("name") == "Mountain" for c in hand):
                drops["held"].add((seat, turn))
            land = g.play_land(f)
            if land:
                drops["played"].add((seat, turn))
                return land
            if f["authorisedSeat"] == active and str(phase).startswith("MAIN"):
                goblin = g.option(f, name="Raging Goblin", zone="hand", land=False)
                if goblin:
                    return goblin
            return None
        return DEFAULT

    g.run(policy, max_turn=8)
    g.drops = drops
    return g, asked


def quiet():
    g_all, all_asked = survey(False)
    g, asked = survey(True)
    prio = [a for a in asked if a[0] == "chooseSpellAbilityToPlay"]
    prio_all = [a for a in all_asked if a[0] == "chooseSpellAbilityToPlay"]
    bad = collections.Counter(a[1] for a in prio if a[1] in QUIET_STEPS and not a[2])
    kinds = collections.Counter(a[0] for a in asked)
    found = {"priority asked, no stops": len(prio_all), "priority asked, default stops": len(prio),
             "asked at a quiet step with an empty stack": dict(bad), "turns": g.turn,
             "other questions": {k: v for k, v in kinds.items() if k != "chooseSpellAbilityToPlay"},
             "lands": len(g.mine(1, name="Mountain")) + len(g.mine(2, name="Mountain")),
             "land drops missed (seat, turn)": sorted(g.drops["held"] - g.drops["played"]),
             "stopped": g.stopped_badly() or g_all.stopped_badly()}
    if g.turn < 8:
        return "inconclusive", "the game did not reach turn 8", found
    problems = [found["stopped"]] if found["stopped"] else []
    if bad:
        problems.append(f"asked at a step nobody stops at: {dict(bad)}")
    if not len(prio) * 2 < len(prio_all):
        problems.append(f"default stops should at least halve the priority questions: {len(prio)} vs {len(prio_all)}")
    # Not a fixed count: a shuffle can deal few Mountains (CI once saw
    # 5 in 8 turns). What stops must not do is skip a drop that was owed.
    if found["land drops missed (seat, turn)"] or found["lands"] < 3:
        problems.append(f"the land drops should still happen: {found['lands']} Mountains in play, "
                        f"missed {found['land drops missed (seat, turn)']}")
    if not kinds.get("declareAttackers"):
        problems.append("the attack question should still be asked")
    return result(problems, f"{len(prio)} priority questions instead of {len(prio_all)} in {g.turn} turns; none at a "
                            f"quiet step; lands played and attacks asked", found)


def bolt_game(name, seat2):
    g = game(name, [("Mountain", 30), ("Lightning Bolt", 30)], seat2)
    st = {"cast": False, "seat2_on_stack": 0, "seat2_asked_after": 0}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat, kind = f["authorisedSeat"], f.get("kind")
        if st["cast"] and seat == 2 and kind == "chooseSpellAbilityToPlay":
            st["seat2_asked_after"] += 1
            if stack:
                st["seat2_on_stack"] += 1
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 1 and not st["cast"] and turn >= 3 and not stack:
                bolt = g.option(f, name="Lightning Bolt", zone="hand", land=False)
                if bolt:
                    st["cast"] = True
                    return bolt
            return None
        if kind == "chooseTargetsFor" and seat == 1:
            bob = next((o["actionId"] for o in f.get("options", []) if "Bob" in (o.get("label") or "")), None)
            return bob or DEFAULT
        return DEFAULT

    def until(g):
        return st["cast"] and g.turn >= 5

    g.run(policy, until=until, max_turn=8)
    return g, st


def respond():
    g, st = bolt_game("respond", [("Mountain", 30), ("Lightning Bolt", 30)])
    found = dict(st, stopped=g.stopped_badly())
    if not st["cast"]:
        return "inconclusive", "seat 1 never cast Lightning Bolt", found
    problems = [found["stopped"]] if found["stopped"] else []
    if st["seat2_on_stack"] < 1:
        problems.append("seat 2, holding a Bolt, was not asked while the Bolt was on the stack")
    return result(problems, "seat 2 was asked with the Bolt on the stack, holding a Bolt of its own", found)


def nothing():
    g, st = bolt_game("nothing", BEARS)
    found = dict(st, stopped=g.stopped_badly())
    if not st["cast"]:
        return "inconclusive", "seat 1 never cast Lightning Bolt", found
    problems = [found["stopped"]] if found["stopped"] else []
    if st["seat2_on_stack"]:
        problems.append(f"seat 2 had nothing to respond with and was asked {st['seat2_on_stack']} time(s)")
    return result(problems, "seat 2, holding only creatures and lands, was passed for while the Bolt resolved", found)


def pass_turn():
    g = game("pass-turn", RED, RED)
    st = {"turn": None, "after": 0, "next": 0}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat, kind = f["authorisedSeat"], f.get("kind")
        if seat == 1 and kind == "chooseSpellAbilityToPlay":
            if st["turn"] is not None:
                if turn == st["turn"] and not stack:
                    st["after"] += 1
                elif turn and st["turn"] and turn >= st["turn"] + 2 and seat == active:
                    st["next"] += 1
            elif turn and turn >= 3 and seat == active and phase == "MAIN1" and not stack:
                land = g.play_land(f)
                if land:
                    return land
                st["turn"] = turn
                g.pass_turn(1)
                return None
        if kind == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        return DEFAULT

    def until(g):
        return st["next"] > 0

    g.run(policy, until=until, max_turn=10)
    found = dict(st, stopped=g.stopped_badly())
    if st["turn"] is None:
        return "inconclusive", "seat 1 never reached its Main 1 on turn 3 or later", found
    problems = [found["stopped"]] if found["stopped"] else []
    if st["after"]:
        problems.append(f"asked {st['after']} more time(s) in the turn it passed")
    if not st["next"]:
        problems.append("never asked again on its next turn")
    return result(problems, "passed to the end of the turn: not asked again that turn, asked on the next", found)


SCENARIOS = {"quiet": quiet, "respond": respond, "nothing": nothing, "pass-turn": pass_turn}

if __name__ == "__main__":
    worst = 0
    for name, run in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        status, text, found = run()
        print(f"--- {name}")
        print(json.dumps(found, indent=2, ensure_ascii=False, default=str))
        print(f"{status.upper()}: {text}")
        worst = max(worst, {"ok": 0, "wrong": 1, "inconclusive": 2}[status])
    sys.exit(worst)
