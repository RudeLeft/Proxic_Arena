"""Spec 0098 (F-0098-B) -- the test-only deal switch is never set for production.

    python -I scripts/check-test-switch.py [repo-root]

PROXIC_TEST_DEALS=true lets a browser test deal set cards (the server then
starts the worker with --lab-deal and mounts POST /api/matches/test-deal).
It belongs only in the local and CI overrides. This fails if the production
compose files or the Dockerfile (the image's defaults) mention it at all --
not just "=true": a line passing it through from .env would let a host's
settings file switch it on -- and if the two overrides stop setting it (the
name changed, and the check would be guarding nothing).

Exit 0 when clean, 1 naming each offending line.
"""
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SWITCH = "PROXIC_TEST_DEALS"
PRODUCTION = ("docker-compose.yml", "docker-compose.unraid.yml", "Dockerfile")
TESTS = ("docker-compose.local.yml", "docker-compose.ci.yml")

problems = []
for name in PRODUCTION:
    path = os.path.join(ROOT, name)
    if not os.path.isfile(path):
        problems.append(f"{name}: missing (cannot check it)")
        continue
    with open(path, encoding="utf-8") as f:
        for number, line in enumerate(f, 1):
            if SWITCH in line:
                problems.append(f"{name}:{number}: production must never set {SWITCH}: {line.strip()}")

for name in TESTS:
    path = os.path.join(ROOT, name)
    with open(path, encoding="utf-8") as f:
        text = f.read()
    if not re.search(rf'^\s*{SWITCH}:\s*"true"\s*$', text, re.MULTILINE):
        problems.append(f'{name}: does not set {SWITCH}: "true" (renamed? the check guards nothing)')

if problems:
    print("\n".join(problems))
    sys.exit(1)
print(f"{SWITCH}: set only in {', '.join(TESTS)}; not in {', '.join(PRODUCTION)}")
