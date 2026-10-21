"""Concede is Forge's concession, and Forge declares the winner. PHASE_07 §7.55, P7-T.

    python -I scripts/check-concede.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is its own small game. The result is read off GAME_ENDED,
never inferred: a concession is a real loss, and only Forge says who won.

  own-move   seat 1 concedes on its own move, then answers nothing:
             seat 2 wins, Forge records seat 1 as having conceded
  waiting    seat 2 concedes while seat 1 is being asked (seat 2 holds
             nothing): the question seat 1 was looking at is withdrawn
             and the game ends -- not left waiting for an answer
  targeting  seat 1 concedes halfway through casting Lightning Bolt,
             with the target question open: still Forge's result, not
             a failed match
  mulligan   a concession before the game proper starts is refused
             (NOT_STARTED); Abandon is the way out of a game that has
             not begun, as in Forge's own client

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, HOLD, Game  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
BOLTS = [("Mountain", 30), ("Lightning Bolt", 30)]


def game(name, seat1=BOLTS, seat2=BOLTS):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"concede-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def ended(g):
    e = g.ended or {}
    return {k: e.get(k) for k in ("outcome", "winningSeat", "concededSeat", "turn", "detail")} if e else None


def won_by_concession(g, loser, found):
    """The checks every concession shares: Forge's winner, Forge's reason."""
    problems = []
    e = found["ended"]
    if g.error:
        problems.append(f"worker error {g.error.get('errorCode')}: {g.error.get('detail')}")
    if not e:
        problems.append("the game never ended")
        return problems
    winner = 2 if loser == 1 else 1
    if e["outcome"] != "WINNER" or e["winningSeat"] != winner:
        problems.append(f"seat {winner} should have won: {e}")
    if e["concededSeat"] != loser:
        problems.append(f"Forge should record seat {loser} as having conceded: {e}")
    return problems


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


# --- the scenarios ----------------------------------------------------------


def own_move():
    g = game("own-move")
    st = {"sent": False}

    def policy(g, f):
        if st["sent"]:
            return HOLD
        if f["authorisedSeat"] == 1 and f.get("kind") == "chooseSpellAbilityToPlay" and g.turn >= 3:
            g.concede(1)
            st["sent"] = True
            return HOLD
        return DEFAULT

    g.run(policy, max_turn=12)
    found = {"ended": ended(g), "sent": st["sent"], "turn": g.turn}
    if not st["sent"]:
        return "inconclusive", "seat 1 was never asked on turn 3 or later", found
    return result(won_by_concession(g, 1, found), "seat 1 conceded on its move; Forge declared seat 2", found)


def waiting():
    g = game("waiting")
    st = {"sent": False, "asked": None}

    def policy(g, f):
        if st["sent"]:
            return HOLD
        if f["authorisedSeat"] == 1 and f.get("kind") == "chooseSpellAbilityToPlay" and g.turn >= 3:
            # Seat 1 is looking at a question; seat 2 concedes. Nobody
            # answers it: the concession alone must end the game.
            st["asked"] = f["decisionId"]
            g.concede(2)
            st["sent"] = True
            return HOLD
        return DEFAULT

    g.run(policy, max_turn=12)
    found = {"ended": ended(g), "sent": st["sent"], "openQuestion": st["asked"]}
    if not st["sent"]:
        return "inconclusive", "seat 1 was never asked on turn 3 or later", found
    return result(won_by_concession(g, 2, found),
                  "seat 2 conceded while seat 1 was being asked; the question was withdrawn and seat 1 won",
                  found)


def targeting():
    g = game("targeting")
    st = {"sent": False, "cast": False}

    def policy(g, f):
        if st["sent"]:
            return HOLD
        kind = f.get("kind")
        if f["authorisedSeat"] == 1 and kind == "chooseSpellAbilityToPlay" and g.turn >= 3:
            land = g.play_land(f)
            if land:
                return land
            bolt = g.option(f, name="Lightning Bolt", zone="hand", land=False)
            if bolt:
                st["cast"] = True
                return bolt
            return None
        if f["authorisedSeat"] == 1 and kind == "chooseTargetsFor" and st["cast"]:
            g.concede(1)
            st["sent"] = True
            return HOLD
        return DEFAULT

    g.run(policy, max_turn=16)
    found = {"ended": ended(g), "sent": st["sent"]}
    if not st["sent"]:
        return "inconclusive", "seat 1 never reached a target question for Lightning Bolt", found
    problems = won_by_concession(g, 1, found)
    if found["ended"] and found["ended"]["outcome"] == "FAILED":
        problems.append("a concession mid-cast reported a failed match instead of Forge's result")
    return result(problems, "seat 1 conceded mid-cast; still Forge's result, seat 2 won", found)


def mulligan():
    g = game("mulligan")
    st = {"sent": False}

    def policy(g, f):
        if st["sent"]:
            return HOLD
        if f.get("kind") == "mulliganKeepHand":
            g.concede(f["authorisedSeat"])
            st["sent"] = True
            return HOLD
        return DEFAULT

    g.run(policy, max_turn=2)
    found = {"error": g.error, "ended": ended(g), "sent": st["sent"]}
    if not st["sent"]:
        return "inconclusive", "nobody was asked to keep a hand", found
    problems = []
    if not g.error or g.error.get("errorCode") != "CONCEDE_REFUSED" or g.error.get("detail") != "NOT_STARTED":
        problems.append(f"a concession during the mulligan should be refused NOT_STARTED: {g.error}")
    if found["ended"]:
        problems.append(f"the game ended: {found['ended']}")
    return result(problems, "refused before the game proper started (NOT_STARTED)", found)


SCENARIOS = {"own-move": own_move, "waiting": waiting, "targeting": targeting, "mulligan": mulligan}

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
