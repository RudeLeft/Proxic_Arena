"""Was every question Proxic answers really asked in this run's games? PHASE_08.

    python3 -I scripts/check-questions-asked.py --summarise <trace.jsonl>...  > asked.txt
    python3 -I scripts/check-questions-asked.py <asked.txt or trace.jsonl>...

The record says which questions Proxic ASKS. Saying so is not evidence:
this reads the Mechanics Lab's game traces from the CI run -- what the
worker actually sent -- and fails when a question the record calls
answered was never put to anybody in any of them. A scenario that stops
reaching its question (a deck change, a Forge update) fails the build
here, instead of passing for a check that no longer checks anything.

The Lab runs on two machines, so each writes a summary (--summarise:
every question name asked, with the scenario that asked it) and one job
reads both. Rows whose proof is still PENDING are listed, not required.

Exit 0 when every proven question was asked, 1 when one was not.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module  # noqa: E402

record_rows = import_module("check-question-record").rows


def asked_in(paths):
    """Question name -> the scenarios (trace files) that asked it."""
    asked = {}
    for path in paths:
        scenario = os.path.basename(path)
        if path.endswith(".jsonl"):
            for line in open(path, encoding="utf-8"):
                try:
                    record = json.loads(line)
                except ValueError:
                    continue
                frame = record.get("frame") or {}
                if record.get("dir") == "in" and frame.get("type") == "DECISION_REQUEST" and frame.get("kind"):
                    asked.setdefault(frame["kind"], set()).add(scenario)
        else:
            for line in open(path, encoding="utf-8"):
                kind, _, where = line.strip().partition("\t")
                if kind:
                    asked.setdefault(kind, set()).update(w for w in where.split(",") if w)
    return asked


def main(argv):
    if argv and argv[0] == "--summarise":
        for kind, where in sorted(asked_in(argv[1:]).items()):
            print(f"{kind}\t{','.join(sorted(where))}")
        return 0
    asked = asked_in(argv)
    missing, pending = [], []
    for row in record_rows():
        if row["status"] != "ASKS":
            continue
        if row["evidence"].startswith("PENDING:"):
            pending.append(row["entry"])
            continue
        for kind in (k.strip() for k in row["asks"].split(",") if k.strip()):
            if kind not in asked:
                missing.append(f"{row['entry']}: '{kind}' was never asked (evidence: {row['evidence']})")
    print(f"{len(asked)} different questions asked across {len(argv)} inputs; "
          f"{len(pending)} answered questions still PENDING proof")
    if missing:
        print("WRONG: answered, but never asked in this run's games:\n  " + "\n  ".join(missing))
        return 1
    print("OK: every answered question with proof was asked in a real game")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
