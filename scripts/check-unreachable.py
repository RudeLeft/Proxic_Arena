"""Forge questions that cannot arise in Proxic -- the proofs that need Forge's cards. PHASE_08 P8-D.

    python -I scripts/check-unreachable.py <worker.jar> <res-root> [trace-dir] [scenario...]

The record calls some of Forge's questions UNREACHABLE, and the worker's
own UnreachableQuestionsTest proves the ones decided by the code (no
ante, no legacy blocker ordering, one game a match, two methods Forge
never calls). These need Forge's card files, or a real game:

  shards        CostPayShards: no card in Forge's card files pays a shards
                cost (Forge's Adventure mode only) -- while the same search
                does find a cost that exists, so it is searching
  backup-plan   chooseStartingHand: asked only of a player with Backup
                Plan, a Conspiracy. A deck holding it is refused before the
                game (Forge's variant cards never resolve into a Proxic
                deck), while the same deck without it plays
  unknown-card  revealUnsupported: Forge marks a card "unsupported" only when
                its card files do not have it. A deck naming such a card
                is refused before the game, so Forge never gets to say so
  ante          revealAnte -- reachable after all, and now TOLD: a deck with
                Contract from Below starts (it was a loud stop, so it could
                not), its owner is told the ante cards were taken out, the
                other player is told nothing about them. Spec 0124 (owner
                Q3 "Report window", F-0124-D): told in the report window
                (the board's `action`: by 0, byWords "Your deck", the card
                face up by its printing), only once the game's first turn
                has begun (never over the opening hand), to the owner's
                boards alone; no grey notice to anybody

Exit 0 when every proof held, 1 when one did not, 2 when one never got
there.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game  # noqa: E402

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
        trace = os.path.join(TRACES, f"unreachable-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def cards_using(pattern):
    """Card scripts in Forge's card files whose cost uses `pattern`."""
    found = []
    folder = os.path.join(RES, "cardsfolder")
    for root, _, files in os.walk(folder):
        for name in files:
            if not name.endswith(".txt"):
                continue
            text = open(os.path.join(root, name), encoding="utf-8", errors="replace").read()
            if re.search(r"Cost\$[^|\n]*" + pattern, text):
                found.append(name)
    return found


def shards():
    shard_cards = cards_using(r"PayShards")
    life_cards = cards_using(r"PayLife<")
    found = {"pays shards": shard_cards[:10], "pays life (the search works)": len(life_cards)}
    if not life_cards:
        return "wrong", "the search found no PayLife cost either: it is not searching", found
    if shard_cards:
        return "wrong", f"cards pay a shards cost, so CostPayShards can arise: {shard_cards[:10]}", found
    return "ok", f"no card pays shards (the same search finds {len(life_cards)} that pay life)", found


# The worker died or went quiet (lab.py): the game never got to the
# question, so the proof is not wrong, only not reached. Exit 2, which CI
# retries once (TEST-013.4, 2026-11-16).
NO_WORKER = ("WORKER_EXITED", "WORKER_SILENT")


def died(*games):
    return next((g.stopped_badly() for g in games if (g.error or {}).get("errorCode") in NO_WORKER), None)


def started(g):
    return g.turn >= 1 and not g.stopped_badly()


def backup_plan():
    with_it = game("backup-plan", [("Swamp", 59), ("Backup Plan", 1)])
    with_it.run(lambda g, f: DEFAULT, until=lambda g: g.turn >= 2, max_turn=3)
    without = game("backup-plan-without", [("Swamp", 60)])
    without.run(lambda g, f: DEFAULT, until=lambda g: g.turn >= 2, max_turn=3)
    found = {"with Backup Plan": with_it.stopped_badly(), "asked": sorted({a[1] for a in with_it.asked}),
             "without it": without.stopped_badly() or f"turn {without.turn}"}
    if died(with_it, without):
        return "inconclusive", f"the worker stopped before the proof: {died(with_it, without)}", found
    problems = []
    if not (with_it.error or {}).get("errorCode") == "DECK_UNRESOLVED":
        problems.append(f"a deck with Backup Plan should be refused before the game: {found['with Backup Plan']}")
    if any(a[1] == "chooseStartingHand" for a in with_it.asked):
        problems.append("chooseStartingHand was asked")
    if not started(without):
        problems.append(f"the same deck without Backup Plan should play: {found['without it']}")
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "a deck with Backup Plan is refused before the game; without it, the same deck plays", found)


def ante():
    g = game("ante", [("Swamp", 56), ("Contract from Below", 4)])
    boards = {1: [], 2: []}

    def until(g):
        for seat in (1, 2):
            board = g.state.get(seat)
            if board and (not boards[seat] or boards[seat][-1] is not board):
                boards[seat].append(board)
        return g.turn >= 2

    g.run(lambda g, f: DEFAULT, until=until, max_turn=3)
    reports = [(b.get("turn"), b["action"]) for b in boards[1] if b.get("action")]
    ante_reports = [(t, a) for t, a in reports if "Contract from Below" in json.dumps(a)]
    found = {"turn": g.turn, "stopped": g.stopped_badly(), "notices": g.notices,
             "reports": ante_reports[:1]}
    if not started(g):
        return "wrong", f"a deck with Contract from Below should start: {found['stopped']}", found
    problems = []
    if any(g.notices.get(seat) for seat in (1, 2)):
        problems.append(f"spec 0124: no grey notice to anybody any more: {g.notices}")
    if not ante_reports:
        problems.append("seat 1 should be told in the report window that its ante cards were taken out")
    else:
        first_turn, report = ante_reports[0]
        cards = report.get("cards") or []
        if not first_turn:
            problems.append("the report must wait for the first turn (the opening hand kept)")
        if report.get("by") != 0 or report.get("byWords") != "Your deck":
            problems.append(f"the game's own report: by 0, 'Your deck': {report.get('by')} {report.get('byWords')}")
        if report.get("said") != "Ante isn't played, so every copy of Contract from Below was taken out of your deck.":
            problems.append(f"the words: {report.get('said')!r}")
        if [(c.get("name"), c.get("known"), c.get("owner"), bool(c.get("printing"))) for c in cards] !=                 [("Contract from Below", True, 1, True)]:
            problems.append(f"one picture, face up, by its printing: {cards}")
    if any("Contract from Below" in json.dumps(b) for b in boards[2]):
        problems.append("seat 2 was told about seat 1's deck (HID-001)")
    if any("Contract from Below" in json.dumps(b.get("action") or {}) for b in boards[1] if not b.get("turn")):
        problems.append("the report showed before the first turn, over the opening hand")
    seen = [c for seat in (1, 2) for z in ("hand", "battlefield", "graveyard", "exile")
            for c in g.zone(seat, z) if c.get("name") == "Contract from Below"]
    if seen:
        problems.append(f"Contract from Below is in the game: {seen[:2]}")
    return ("wrong", "; ".join(problems), found) if problems else         ("ok", "a deck with ante cards plays; its owner is told in the report window once the first turn "
               "begins, with the card's picture; the opponent is told nothing; no grey notice", found)


def unknown_card():
    g = game("unknown-card", [("Swamp", 59), ("Zzyzx Not A Real Card", 1)])
    g.run(lambda g, f: DEFAULT, until=lambda g: g.turn >= 2, max_turn=3)
    found = {"stopped": g.stopped_badly(), "turn": g.turn, "notices": g.notices}
    if died(g):
        return "inconclusive", f"the worker stopped before the proof: {died(g)}", found
    if (g.error or {}).get("errorCode") != "DECK_UNRESOLVED":
        return "wrong", f"a deck naming a card Forge does not have should be refused before the game: {found}", found
    return "ok", "a deck naming a card Forge does not have is refused before the game", found


SCENARIOS = {"shards": shards, "backup-plan": backup_plan, "unknown-card": unknown_card, "ante": ante}

if __name__ == "__main__":
    codes = []
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        verdict_, message, found = scenario()
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_])
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:1200])
        sys.stdout.flush()
    sys.exit(1 if 1 in codes else max(codes, default=0))
