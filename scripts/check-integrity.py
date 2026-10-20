"""Project integrity, as a run. P6-BM.

PHASE_06 P6-BM: verify Proxic_Arena_OLD unchanged, Proxic_Deck_Builder
unchanged, the canonical Test Deck TXT and CSV unchanged, and the
pinned Forge tree free of unapproved Proxic edits. Required evidence:
an integrity check.

    python -I scripts/check-integrity.py            check against the baseline
    python -I scripts/check-integrity.py --record   write the baseline's HEADs

READ-ONLY everywhere (AGENTS ISO-001, ISO-002, VEND-001): every probe is
`git rev-parse`, `git status`, `git diff` or a file hash. Nothing is
written outside docs/testing/evidence/p6-bm-integrity.json, and that
only with --record.

  siblings     ../Proxic_Arena_OLD and ../Proxic_Deck_Builder: HEAD is
               the recorded one and the working tree is clean
  Test Deck    the canonical TXT and CSV match their committed bytes
               and their recorded SHA-256
  Forge        the vendored tree's HEAD is the pin in
               PHASE_00_ACCEPTED_DECISIONS.md and it has no change of
               any kind against it

Local only: CI has no sibling checkouts. Exit 0 when everything held,
1 when something did not.
"""
import hashlib
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASELINE = ROOT / "docs/testing/evidence/p6-bm-integrity.json"
SIBLINGS = {"Proxic_Arena_OLD": ROOT.parent / "Proxic_Arena_OLD",
            "Proxic_Deck_Builder": ROOT.parent / "Proxic_Deck_Builder"}
CORPUS = ["Test Deck/Testing Deck/Proxic_Arena_Mechanics_Lab_SOURCE.txt",
          "Test Deck/Testing Deck/Proxic_Arena_Mechanics_Lab_Coverage.csv"]
FORGE = ROOT / "spikes/forge-phase0a/forge-upstream"


def git(where, *args):
    return subprocess.run(["git", "-C", str(where), *args], capture_output=True, text=True,
                          encoding="utf-8").stdout.strip()


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin():
    text = (ROOT / "docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md").read_text(encoding="utf-8")
    return re.search(r"\b[0-9a-f]{40}\b", text).group(0)


if "--record" in sys.argv:
    BASELINE.write_text(json.dumps({
        "siblings": {name: git(path, "rev-parse", "HEAD") for name, path in SIBLINGS.items()},
        "corpus": {rel: sha256(ROOT / rel) for rel in CORPUS},
    }, indent=2) + "\n", encoding="utf-8")
    print(f"recorded {BASELINE.relative_to(ROOT)}")
    sys.exit(0)

baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
results = []


def report(ok, what, detail):
    results.append(ok)
    print(f"{'OK   ' if ok else 'WRONG'} {what}: {detail}")


for name, path in SIBLINGS.items():
    head = git(path, "rev-parse", "HEAD")
    dirty = [line for line in git(path, "status", "--porcelain").splitlines() if line]
    expected = baseline["siblings"][name]
    report(head == expected, f"{name} HEAD", f"{head[:12]} (recorded {expected[:12]})")
    report(not dirty, f"{name} working tree", "clean" if not dirty else "; ".join(dirty[:5]))

for rel in CORPUS:
    committed = not git(ROOT, "status", "--porcelain", "--", rel)
    digest = sha256(ROOT / rel)
    report(committed and digest == baseline["corpus"][rel], f"Test Deck {pathlib.Path(rel).suffix[1:].upper()}",
           f"sha256 {digest[:16]}, {'as committed' if committed else 'CHANGED since its commit'}")

pinned = pin()
head = git(FORGE, "rev-parse", "HEAD")
report(head == pinned, "Forge HEAD", f"{head[:12]} (pinned {pinned[:12]})")
changed = [line for line in git(FORGE, "status", "--porcelain").splitlines() if line]
diff = git(FORGE, "diff", "--stat", pinned)
report(not changed and not diff, "Forge tree", "no change against the pin" if not changed and not diff
       else "; ".join(changed[:5]) or diff[:200])

sys.exit(0 if all(results) else 1)
