"""Spec 0098 (F-0098-B), Phase 11 P11-D0 -- the test-only switches are never set for production.

    python -I scripts/check-test-switch.py [repo-root]

PROXIC_TEST_DEALS=true lets a browser test deal set cards (the server then
starts the worker with --lab-deal and mounts POST /api/matches/test-deal).
PROXIC_TEST_TIMING=true writes timing marks to the server's log and each
match's worker log (P11-D0's timeline measure). PROXIC_TEST_DELTA_CHECK=true
adds the whole board to every MATCH_DELTA for the page to compare (P11-D4's
browser gate). Each belongs only in the
test overrides. This fails if the production compose files or the
Dockerfile (the image's defaults) mention either at all -- not just
"=true": a line passing it through from .env would let a host's settings
file switch it on -- and if an override stops naming its switch (the name
changed, and the check would be guarding nothing).

Exit 0 when clean, 1 naming each offending line.
"""
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PRODUCTION = ("docker-compose.yml", "docker-compose.unraid.yml", "Dockerfile")
# Each switch: the test overrides that must name it, and how.
SWITCHES = {
    # Always on in the local and CI stacks.
    "PROXIC_TEST_DEALS": {
        "docker-compose.local.yml": r'"true"',
        "docker-compose.ci.yml": r'"true"',
    },
    # The local stack only, off unless the shell bringing it up says so.
    "PROXIC_TEST_TIMING": {
        "docker-compose.local.yml": r'"\$\{PROXIC_TEST_TIMING:-false\}"',
    },
    # P11-D4: always on in CI, on in the local stack unless the shell says
    # otherwise (the measuring kit turns it off).
    "PROXIC_TEST_DELTA_CHECK": {
        "docker-compose.local.yml": r'"\$\{PROXIC_TEST_DELTA_CHECK:-true\}"',
        "docker-compose.ci.yml": r'"true"',
    },
}

problems = []
for name in PRODUCTION:
    path = os.path.join(ROOT, name)
    if not os.path.isfile(path):
        problems.append(f"{name}: missing (cannot check it)")
        continue
    with open(path, encoding="utf-8") as f:
        for number, line in enumerate(f, 1):
            for switch in SWITCHES:
                if switch in line:
                    problems.append(f"{name}:{number}: production must never set {switch}: {line.strip()}")

for switch, overrides in SWITCHES.items():
    for name, value in overrides.items():
        with open(os.path.join(ROOT, name), encoding="utf-8") as f:
            text = f.read()
        if not re.search(rf"^\s*{switch}:\s*{value}\s*$", text, re.MULTILINE):
            problems.append(f"{name}: does not set {switch} as expected (renamed? the check guards nothing)")

if problems:
    print("\n".join(problems))
    sys.exit(1)
for switch, overrides in SWITCHES.items():
    print(f"{switch}: set only in {', '.join(overrides)}; not in {', '.join(PRODUCTION)}")
