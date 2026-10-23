"""Is every piece of evidence the Phase 8 record names real, and run? PHASE_08 P8-C, P8-D.

    python3 -I scripts/check-question-record.py

The record (forge-worker/src/test/resources/forge-questions.tsv) has a
row per question and cost kind Forge can put to a player. The worker's
own test (ForgeQuestionRecordTest) holds it to the compiled code: a row
for every entry, and a status that is what the code does. This holds it
to the repository:

  - every row is well formed: a known status, a plain-English name, and
    for a question Proxic ASKS, the question name(s) the page receives;
  - every row names its evidence, and the evidence exists:
      scripts/check-X.py      a Mechanics Lab scenario -- and it is in the
                              CI Lab list, or it proves nothing on a build
      frontend/e2e/X.spec.ts  a browser test (CI runs every spec)
      a JUnit class name      a worker test, in forge-worker/src/test
      -> <entry>              ROUTES-TO: the entry Forge forwards to, which
                              must have a row of its own
      -                       NOT-A-QUESTION only
  - PENDING: <why> stands for proof still to come (Phase 8 P8-E closes
    them; its exit gate needs none). Counted and printed, never hidden.

Exit 0 when the record holds, 1 when it does not.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECORD = os.path.join(ROOT, "forge-worker", "src", "test", "resources", "forge-questions.tsv")
CI = os.path.join(ROOT, ".github", "workflows", "ci.yml")
TESTS = os.path.join(ROOT, "forge-worker", "src", "test", "java")
STATUSES = {"ASKS", "TELLS", "ENGINE", "UNBUILT", "UNREACHABLE", "ROUTES-TO", "NOT-A-QUESTION"}
COLUMNS = ["entry", "status", "asks", "name", "cards", "evidence"]


def rows(path=RECORD):
    """The record, as dicts. Comments (#) and blank lines are skipped."""
    out, header = [], None
    for number, line in enumerate(open(path, encoding="utf-8"), 1):
        line = line.rstrip("\r\n")
        if not line.strip() or line.startswith("#"):
            continue
        cells = line.split("\t")
        if header is None:
            header = cells
            if header != COLUMNS:
                sys.exit(f"{path}: the header must be {COLUMNS}, is {header}")
            continue
        if len(cells) != len(COLUMNS):
            sys.exit(f"{path}:{number}: {len(cells)} cells, not {len(COLUMNS)}")
        row = dict(zip(COLUMNS, cells))
        row["line"] = number
        out.append(row)
    return out


def lab_list(path=CI):
    """The scenarios CI's Mechanics Lab runs, from the workflow's own list."""
    text = open(path, encoding="utf-8").read()
    block = re.search(r"printf '%s\\n' \\\n(.*?)\|\s*awk", text, re.S)
    if not block:
        sys.exit(f"{path}: cannot find the Mechanics Lab list")
    return set(block.group(1).replace("\\", " ").split())


def junit_exists(name):
    for _, _, files in os.walk(TESTS):
        if f"{name}.java" in files:
            return True
    return False


def evidence_problems(row, entries, lab):
    status, evidence = row["status"], row["evidence"].strip()
    where = f"{row['entry']} (line {row['line']})"
    if not evidence:
        return [f"{where}: names no evidence"]
    if status == "NOT-A-QUESTION":
        return [] if evidence == "-" else [f"{where}: NOT-A-QUESTION takes '-', not {evidence!r}"]
    if evidence.startswith("PENDING:"):
        if status in ("UNBUILT", "ROUTES-TO"):
            return [f"{where}: {status} has its proof now, it cannot be PENDING"]
        return [] if evidence[len("PENDING:"):].strip() else [f"{where}: PENDING without a reason"]
    if status == "ROUTES-TO":
        target = evidence[2:].strip() if evidence.startswith("->") else None
        if not target or target not in entries:
            return [f"{where}: ROUTES-TO must name an entry with a row (-> <entry>), not {evidence!r}"]
        return []
    problems = []
    for token in (t.strip() for t in evidence.split(",")):
        m = re.fullmatch(r"scripts/check-([a-z0-9-]+)\.py", token)
        if m:
            if not os.path.exists(os.path.join(ROOT, token)):
                problems.append(f"{where}: {token} does not exist")
            elif m.group(1) not in lab:
                problems.append(f"{where}: {token} is not in CI's Mechanics Lab list, so no build runs it")
            continue
        if re.fullmatch(r"frontend/e2e/[A-Za-z0-9.-]+\.spec\.ts", token):
            if not os.path.exists(os.path.join(ROOT, token)):
                problems.append(f"{where}: {token} does not exist")
            continue
        if re.fullmatch(r"[A-Z][A-Za-z0-9]*Test", token):
            if not junit_exists(token):
                problems.append(f"{where}: no worker test {token}")
            continue
        problems.append(f"{where}: {token!r} is not evidence this check knows how to find")
    if status == "UNBUILT" and "LoudFailureTest" not in evidence:
        problems.append(f"{where}: UNBUILT's proof is the loud stop itself, LoudFailureTest")
    return problems


def main():
    record = rows()
    entries = {r["entry"] for r in record}
    lab = lab_list()
    problems = []
    for row in record:
        if row["status"] not in STATUSES:
            problems.append(f"{row['entry']} (line {row['line']}): unknown status {row['status']!r}")
            continue
        if not row["name"].strip():
            problems.append(f"{row['entry']} (line {row['line']}): no plain-English name")
        if row["status"] == "ASKS" and not row["asks"].strip():
            problems.append(f"{row['entry']} (line {row['line']}): ASKS, but names no question the page receives")
        problems += evidence_problems(row, entries, lab)
    counts = {}
    for row in record:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    pending = [r["entry"] for r in record if r["evidence"].startswith("PENDING:")]
    print(f"{len(record)} rows: " + ", ".join(f"{n} {s}" for s, n in sorted(counts.items())))
    print(f"proof still to come (PENDING): {len(pending)}")
    if problems:
        print("WRONG:\n  " + "\n  ".join(problems))
        return 1
    print("OK: every row's evidence exists and runs in CI")
    return 0


if __name__ == "__main__":
    sys.exit(main())
