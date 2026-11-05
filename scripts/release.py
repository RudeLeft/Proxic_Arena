"""Release the exact commit CI passed (owner's "Faster CI Plan", 2026-11-05).

    python3 -I scripts/release.py 1.44.0            # dry run: says what it would do
    python3 -I scripts/release.py 1.44.0 --publish  # creates the GitHub release

Finds the "Version 1.44.0" commit on origin/main, and refuses unless a CI
run on EXACTLY that commit completed with the full suite green -- "Promote
to latest" succeeded, which only happens when every job passed and the
image was tested (a documentation-only run skips it). Then it tags that
commit, whatever has been pushed since, with the notes from CHANGELOG.md.

Ten of twenty releases before this were published before CI had run, and
1.29.0 never had a green run; one release sat green for nine hours waiting
for a quiet main. Neither can happen this way.
"""

import json
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(*args, tries=3):
    """A command's output; GitHub's API answers 502 now and then, so try again."""
    for attempt in range(tries):
        done = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", cwd=ROOT)
        if done.returncode == 0:
            return done.stdout
        if attempt + 1 < tries:
            time.sleep(5)
    refuse(f"{' '.join(args[:3])} failed: {done.stderr.strip()[:200]}")


def refuse(why):
    print(f"NOT RELEASED: {why}", file=sys.stderr)
    sys.exit(1)


def version_commit(version):
    run("git", "fetch", "-q", "origin", "main")
    for line in run("git", "log", "origin/main", "--format=%H%x09%s", "-n", "400").splitlines():
        sha, _, subject = line.partition("\t")
        if subject == f"Version {version}":
            return sha
    refuse(f'no "Version {version}" commit on origin/main')


def green_full_run(sha):
    runs = json.loads(run("gh", "run", "list", "--workflow", "ci.yml", "--commit", sha,
                          "--json", "databaseId,status,conclusion,event", "--limit", "20"))
    for ci in runs:
        if ci["event"] != "push" or ci["status"] != "completed" or ci["conclusion"] != "success":
            continue
        # filter=latest: a run rerun after a flake counts by its last attempt.
        jobs = json.loads(run("gh", "api", f"repos/{{owner}}/{{repo}}/actions/runs/{ci['databaseId']}/jobs?filter=latest&per_page=100"))["jobs"]
        if any(j["name"] == "Promote to latest" and j["conclusion"] == "success" for j in jobs):
            return ci["databaseId"]
    states = ", ".join(f'{c["databaseId"]} {c["status"]}/{c["conclusion"]}' for c in runs) or "none"
    refuse(f"no full-suite green CI run on {sha[:12]} (runs: {states})")


def notes(version):
    text = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    m = re.search(rf"^## {re.escape(version)} — .*?\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    if not m or not m.group(1).strip():
        refuse(f"no CHANGELOG.md section for {version}")
    return m.group(1).strip() + "\n"


def main():
    args = sys.argv[1:]
    if not args or not re.fullmatch(r"\d+\.\d+\.\d+", args[0]):
        print(__doc__)
        sys.exit(2)
    version, publish = args[0], "--publish" in args[1:]
    tag = f"v{version}"
    if subprocess.run(["gh", "release", "view", tag], capture_output=True, cwd=ROOT).returncode == 0:
        refuse(f"{tag} already exists")
    sha = version_commit(version)
    ci = green_full_run(sha)
    body = notes(version)
    print(f"{tag}: commit {sha[:12]}, CI run {ci} green with the full suite")
    print(f"notes: {len(body.splitlines())} lines from CHANGELOG.md")
    if not publish:
        print("dry run: add --publish to create the release")
        return
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as f:
        f.write(body)
    run("gh", "release", "create", tag, "--target", sha, "--title", f"Proxic Arena {version}", "--notes-file", f.name)
    print(f"released {tag} at {sha[:12]}")


if __name__ == "__main__":
    main()
