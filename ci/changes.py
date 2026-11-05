"""Does this push change anything the image or the slow suites could see?

Prints ``code=true`` or ``code=false`` (for $GITHUB_OUTPUT). Owner's
"Faster CI Plan", 2026-11-05: a push that changes only documentation runs
the checks alone -- docs are not in the image, so there is nothing new to
test, and the checks job still runs the ledger and question-record checks
that read docs/testing/.

Compared with the last commit that passed EVERYTHING -- the revision label
on :latest, which only a fully green run on main promotes -- not with the
previous push, so a code push whose run was folded into a later docs push
is still tested. Anything uncertain counts as code: another event or
branch, no label, a label that is not an ancestor of HEAD, any error.

docs/testing/ (the ledger), Test Deck/ (the Lab corpus), ci/ and .github/
(the gate itself) are never documentation.

    python3 -I ci/changes.py                 # in CI
    python3 -I ci/changes.py --base <sha>    # try the rule on any commit
"""

import json
import os
import re
import subprocess
import sys

DOCS = re.compile(r"\.md$|^docs/")
NEVER_DOCS = re.compile(r"^(docs/testing/|Test Deck/|ci/|\.github/)")


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def last_tested(image):
    """The revision label of :latest, '' if it cannot be read."""
    out = run("docker", "buildx", "imagetools", "inspect", f"{image}:latest", "--format", "{{json .Image}}")
    found = json.loads(out)
    # One platform gives the image config itself; with attestations it is a
    # map of platform -> config (the attestation entries carry no labels).
    configs = [found] if "config" in found else [v for v in found.values() if isinstance(v, dict)]
    for config in configs:
        revision = ((config.get("config") or {}).get("Labels") or {}).get("org.opencontainers.image.revision", "")
        if revision:
            return revision
    return ""


def docs_only(changed):
    return bool(changed) and all(DOCS.search(f) and not NEVER_DOCS.search(f) for f in changed)


def classify(base):
    if not base:
        print("no last fully tested commit: full suite", file=sys.stderr)
        return True
    if subprocess.run(["git", "merge-base", "--is-ancestor", base, "HEAD"], capture_output=True).returncode != 0:
        print(f"{base} is not behind HEAD: full suite", file=sys.stderr)
        return True
    changed = [f for f in run("git", "diff", "--name-only", base, "HEAD").splitlines() if f]
    print(f"changed since {base[:12]}:", *changed, sep="\n  ", file=sys.stderr)
    return not docs_only(changed)


def main():
    try:
        if len(sys.argv) == 3 and sys.argv[1] == "--base":
            code = classify(sys.argv[2])
        elif os.environ.get("GITHUB_EVENT_NAME") == "push" and os.environ.get("GITHUB_REF") == "refs/heads/main":
            code = classify(last_tested(os.environ["IMAGE"]))
        else:
            code = True
    except Exception as error:  # anything uncertain is code
        print(f"could not tell ({error}): full suite", file=sys.stderr)
        code = True
    print(f"code={'true' if code else 'false'}")


if __name__ == "__main__":
    main()
