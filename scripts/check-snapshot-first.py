"""State before the question, over whole games. P6-L, §6.48.

    python -I scripts/check-snapshot-first.py <trace.jsonl>...

PHASE_06 P6-L: "No action/decision references a newly relevant
object before the receiving viewer has sufficient state to identify
it." Required evidence: a protocol trace.

Reads worker protocol traces (the ones every check-*.py script writes
when given a trace path) and, for EVERY decision request in them,
checks what the seat it went to had already been sent:

  a snapshot      the seat was sent a MATCH_SNAPSHOT before the
                  question, published AFTER the question was asked:
                  stateRevision > stateVersion. (They share one
                  counter. The question takes its number N when it
                  is asked; publishing the snapshots that precede it
                  bumps the counter to N+1. A snapshot at N or below
                  was published before the question existed -- the
                  board as it was, not as it is being asked about.
                  Checked by moving one snapshot after its question
                  in a real trace: ">=" let it through, ">" does not.)
  every object    each card the question's options name (card:N in
                  an actionId) is in that snapshot -- or, when it is
                  in a zone the seat cannot see (a library being
                  searched, cards being revealed), the option says
                  what it is in its label, so the question carries
                  the state itself

A question about card:57 that arrives before the seat has heard of
card:57 is a button the player cannot read. Exit 0 when every
question in every trace held, 1 when one did not, 2 when the traces
held no questions to check.
"""
import json
import re
import sys
from collections import Counter

CARD = re.compile(r"card:(\d+)")


def ids_in(state):
    """Every object id the seat has been shown, in any zone."""
    found = set()

    def walk(node):
        if isinstance(node, dict):
            value = node.get("id")
            if isinstance(value, str) and CARD.fullmatch(value):
                found.add(value)
            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(state)
    return found


def check(path, totals, problems):
    latest = {}
    for number, line in enumerate(open(path, encoding="utf-8"), 1):
        entry = json.loads(line)
        if entry.get("dir") != "in":
            continue
        frame = entry["frame"]
        kind = frame.get("type")
        if kind == "MATCH_SNAPSHOT":
            state = frame.get("state") or {}
            latest[state.get("seat")] = state
            continue
        if kind != "DECISION_REQUEST":
            continue

        totals["questions"] += 1
        seat = frame["authorisedSeat"]
        where = f"{path}:{number} decision {frame.get('decisionId')} ({frame.get('kind')})"
        state = latest.get(seat)
        if state is None:
            problems.append(f"{where}: seat {seat} had been sent no snapshot at all")
            continue
        if (state.get("stateRevision") or 0) <= (frame.get("stateVersion") or 0):
            problems.append(f"{where}: seat {seat} held revision {state.get('stateRevision')}, "
                            f"published before the question at {frame.get('stateVersion')}")
        known = ids_in(state)
        for option in frame.get("options", []):
            for number_ in CARD.findall(option.get("actionId") or ""):
                card = f"card:{number_}"
                totals["references"] += 1
                if card in known:
                    continue
                if (option.get("label") or "").strip():
                    # Hidden from the board, named by the question.
                    totals["carried by the label"] += 1
                    totals[f"  carried by the label: {frame.get('kind')}"] += 1
                    continue
                problems.append(f"{where}: {card} is in no snapshot seat {seat} was sent, "
                                f"and the option does not say what it is")


def main():
    totals, problems = Counter(), []
    for path in sys.argv[1:]:
        check(path, totals, problems)
    for key in sorted(totals):
        print(f"{key}: {totals[key]}")
    if not totals["questions"]:
        print("INCONCLUSIVE: no questions in the traces")
        sys.exit(2)
    if problems:
        for problem in problems[:20]:
            print("WRONG:", problem)
        print(f"WRONG: {len(problems)} question(s) arrived before their state")
        sys.exit(1)
    print(f"OK: {totals['questions']} questions, each after the state it refers to")


main()
