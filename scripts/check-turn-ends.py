"""Spec 0102, item 3 -- a turn ended early, a turn or a step skipped
(Mechanics Lab, Layer B).

    python -I scripts/check-turn-ends.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker. What it checks is read
from the snapshots both seats were sent -- the report window (`action`),
the stack, the turn and the active seat -- never inferred:

  time-stop    Alice's Lightning Bolt waits on the stack when Bob casts Time
               Stop: on the first board where the Bolt is off the stack,
               Alice's window says "Bob ended the turn: the spells on the
               stack were exiled.", with the Bolt and Time Stop, each
               "to: exile"; Bob gets no window for it
  meditate     Bob casts Meditate (draw four, skip your next turn): Alice is
               told as it resolves, in the same turn, "Bob's spell: Bob
               skips their next turn.", with Meditate's picture; Bob gets no
               window for it; Alice then plays two turns in a row
  fatespinner  Bob's Fatespinner triggers at Alice's upkeep; Alice chooses
               the combat phase: Alice is told "Bob's spell: you skip your
               combat." in that upkeep, with Fatespinner's picture; Bob gets
               no window for the skip

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its point.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]


def game(name, seat1, seat2, deal=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"turn-ends-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal)


class Watch:
    """Every snapshot each seat was sent, once each, in order."""

    def __init__(self, g):
        self.g = g
        self.seen = {1: {}, 2: {}}

    def see(self):
        for seat in (1, 2):
            s = self.g.state.get(seat)
            if s and s.get("stateRevision") not in self.seen[seat]:
                self.seen[seat][s.get("stateRevision")] = s

    def boards(self, seat):
        return list(self.seen[seat].values())


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def named(g, f, name):
    seat = f["authorisedSeat"]
    for o in f["options"]:
        label = o.get("label") or ""
        if o.get("payable") is False or "Play land" in label:
            continue
        cid = card_of(o.get("actionId"))
        if any(c.get("id") == cid and c.get("name") == name for c in g.zone(seat, "hand")):
            return o["actionId"]
    return None


def stack_of(g, seat):
    return (g.state.get(seat) or {}).get("stack") or []


def said(board):
    """The sentences of the window on [board]: the newest and the ones gathered with it."""
    a = board.get("action")
    if not a:
        return []
    return [a] + list(a.get("gathered") or [])


def first_with(w, seat, words):
    """The first board [seat] was sent whose window says [words], and that report."""
    for b in w.boards(seat):
        for a in said(b):
            if words in (a.get("said") or ""):
                return b, a
    return None, None


# --- time stop --------------------------------------------------------------------------


def time_stop():
    st = {"bolt": False, "stop": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            if kind == "chooseSpellAbilityToPlay":
                if any(e.get("name") == "Lightning Bolt" for e in stack_of(g, 2)) and not st["stop"]:
                    o = named(g, f, "Time Stop")
                    st["stop"] = bool(o)
                    return o
                return g.play_land(f) if not stack_of(g, 2) else None
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, 1) or st["bolt"]:
                return None
            if len(g.untapped_lands(2, name="Island")) >= 6:
                o = named(g, f, "Lightning Bolt")
                st["bolt"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor" and st["bolt"]:
            return next((o["actionId"] for o in f["options"] if "Bob" in (o.get("label") or "")), DEFAULT)
        return DEFAULT

    g = game("time-stop", [("Mountain", 30), ("Lightning Bolt", 30)], [("Island", 50), ("Time Stop", 10)],
             deal={1: {"hand": ["Mountain"] * 3 + ["Lightning Bolt"] * 4, "top": ["Mountain"] * 10},
                   2: {"hand": ["Island"] * 6 + ["Time Stop"], "top": ["Island"] * 10}})
    w = Watch(g)

    def until(g):
        w.see()
        return st["stop"] and first_with(w, 1, "ended the turn")[0] is not None \
            and not stack_of(g, 1) and not stack_of(g, 2)

    g.run(policy, until=until, max_turn=18)
    w.see()
    found = {"stopped": g.stopped_badly(), "bolt": st["bolt"], "stop": st["stop"]}
    problems = [found["stopped"]] if found["stopped"] else []
    board, report = first_with(w, 1, "ended the turn")
    if not st["stop"]:
        return "inconclusive", f"Time Stop was never cast (bolt {st['bolt']})", found
    if not report:
        return result(problems + ["seat 1: no 'ended the turn' window at all"], "", found)
    want = "Bob ended the turn: the spells on the stack were exiled."
    found["said1"] = report.get("said")
    found["cards1"] = [(c.get("name"), c.get("to")) for c in report.get("cards") or []]
    if report.get("said") != want:
        problems.append(f"seat 1: the window says {want!r}: {report.get('said')!r}")
    names = sorted(c.get("name") for c in report.get("cards") or [])
    if names != ["Lightning Bolt", "Time Stop"] or any(c.get("to") != "exile" for c in report.get("cards") or []):
        problems.append(f"seat 1: the window shows the Bolt and Time Stop, each to exile: {found['cards1']}")
    # At once: the first board without the Bolt on the stack carries it.
    boards = w.boards(1)
    on = [i for i, b in enumerate(boards) if any(e.get("name") == "Lightning Bolt" for e in b.get("stack") or [])]
    after = next((b for b in boards[on[-1] + 1:]), None) if on else None
    if after is None or not any("ended the turn" in (a.get("said") or "") for a in said(after)):
        problems.append("seat 1: the window comes on the first board after the Bolt left the stack")
    b2, r2 = first_with(w, 2, "ended the turn")
    if r2:
        problems.append(f"seat 2: Bob ended it: no window for him: {r2.get('said')!r}")
    return result(problems, "Time Stop: Alice's window at once, the Bolt and Time Stop to exile; none for Bob",
                  found)


# --- meditate (a turn skipped) ------------------------------------------------------------


def meditate():
    st = {"cast": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2 and kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, 2) or st["cast"]:
                return None
            if len(g.untapped_lands(2, name="Island")) >= 3 and (g.state.get(2) or {}).get("activeSeat") == 2:
                o = named(g, f, "Meditate")
                st["cast"] = bool(o)
                return o
            return None
        if kind == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        return DEFAULT

    g = game("meditate", [("Mountain", 60)], [("Island", 50), ("Meditate", 10)],
             deal={1: {"hand": ["Mountain"] * 7, "top": ["Mountain"] * 10},
                   2: {"hand": ["Island"] * 5 + ["Meditate"] * 2, "top": ["Island"] * 10}})
    w = Watch(g)
    seen = {"at": None}

    def until(g):
        w.see()
        b, r = first_with(w, 1, "skips their next turn")
        if b and seen["at"] is None:
            seen["at"] = b.get("turn")
        # Two of Alice's turns after the one it was told in.
        if seen["at"] is None:
            return False
        later = {(x.get("turn"), x.get("activeSeat")) for x in w.boards(1) if (x.get("turn") or 0) > seen["at"]}
        return len([t for t in later if t[1] == 1]) >= 2

    g.run(policy, until=until, max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly(), "cast": st["cast"]}
    problems = [found["stopped"]] if found["stopped"] else []
    if not st["cast"]:
        return "inconclusive", "Meditate was never cast", found
    board, report = first_with(w, 1, "skips their next turn")
    if not report:
        return result(problems + ["seat 1: no skip window at all"], "", found)
    want = "Bob's spell: Bob skips their next turn."
    found["said1"] = report.get("said")
    if report.get("said") != want:
        problems.append(f"seat 1: the window says {want!r}: {report.get('said')!r}")
    if not any(c.get("name") == "Meditate" for c in report.get("cards") or []):
        problems.append(f"seat 1: the window shows Meditate: {report.get('cards')}")
    # Told as it resolves: in Bob's own turn (he cast it then), not later.
    if board.get("activeSeat") != 2:
        problems.append(f"seat 1: told in Bob's turn, as Meditate resolved: turn {board.get('turn')} "
                        f"active {board.get('activeSeat')}")
    b2, r2 = first_with(w, 2, "skips")
    if r2:
        problems.append(f"seat 2: Bob did it: no window for him: {r2.get('said')!r}")
    # The skip itself (Forge's): Alice's turns follow each other.
    turns = []
    for x in w.boards(1):
        t = (x.get("turn"), x.get("activeSeat"))
        if (x.get("turn") or 0) > board.get("turn") and t not in turns:
            turns.append(t)
    found["turns after"] = turns[:4]
    if len(turns) < 2:
        return "inconclusive", f"the game ended before two turns after it: {turns}", found
    if turns[0][1] != 1 or turns[1][1] != 1:
        problems.append(f"Bob's next turn was skipped: Alice plays two in a row: {turns[:3]}")
    return result(problems, "Meditate: Alice told as it resolved, in Bob's turn; none for Bob; Bob's next "
                            "turn skipped", found)


# --- fatespinner (a step skipped) ---------------------------------------------------------


def fatespinner():
    st = {"cast": False, "chose": None}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        labels = Game.labels(f)
        if seat == 1 and any("Combat phase" in label for label in labels):
            st["chose"] = next(label for label in labels if "Combat phase" in label)
            return next(o["actionId"] for o in f["options"] if "Combat phase" in (o.get("label") or ""))
        if seat == 2 and kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, 2) or st["cast"] or g.mine(2, name="Fatespinner"):
                return None
            if len(g.untapped_lands(2, name="Island")) >= 3:
                o = named(g, f, "Fatespinner")
                st["cast"] = bool(o)
                return o
            return None
        if kind == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        return DEFAULT

    g = game("fatespinner", [("Mountain", 60)], [("Island", 50), ("Fatespinner", 10)],
             deal={1: {"hand": ["Mountain"] * 7, "top": ["Mountain"] * 10},
                   2: {"hand": ["Island"] * 5 + ["Fatespinner"] * 2, "top": ["Island"] * 10}})
    w = Watch(g)

    def until(g):
        w.see()
        b, r = first_with(w, 1, "skip your")
        return b is not None and (g.state.get(1) or {}).get("turn", 0) > b.get("turn")

    g.run(policy, until=until, max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly(), "cast": st["cast"], "chose": st["chose"]}
    problems = [found["stopped"]] if found["stopped"] else []
    if not st["chose"]:
        return "inconclusive", f"Alice was never asked Fatespinner's choice (cast {st['cast']})", found
    board, report = first_with(w, 1, "skip your")
    if not report:
        return result(problems + ["seat 1: no skip window at all"], "", found)
    want = "Bob's spell: you skip your combat."
    found["said1"] = report.get("said")
    if report.get("said") != want:
        problems.append(f"seat 1: the window says {want!r}: {report.get('said')!r}")
    if not any(c.get("name") == "Fatespinner" for c in report.get("cards") or []):
        problems.append(f"seat 1: the window shows Fatespinner: {report.get('cards')}")
    if board.get("activeSeat") != 1:
        problems.append(f"seat 1: told in Alice's own turn (its upkeep): active {board.get('activeSeat')}")
    b2, r2 = first_with(w, 2, "skip")
    if r2:
        problems.append(f"seat 2: Bob's Fatespinner: no skip window for him: {r2.get('said')!r}")
    return result(problems, "Fatespinner: Alice chose combat and was told as it resolved; none for Bob", found)


SCENARIOS = {"time-stop": time_stop, "meditate": meditate, "fatespinner": fatespinner}

if __name__ == "__main__":
    worst = 0
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        verdict_, message, found = scenario()
        code = {"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_]
        worst = 1 if 1 in (worst, code) else max(worst, code)
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:3000])
        sys.stdout.flush()
    sys.exit(worst)
