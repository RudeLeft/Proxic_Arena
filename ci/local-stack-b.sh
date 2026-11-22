#!/usr/bin/env bash
# The second local stack (owner 2026-11-21): its own project, database
# and test accounts on 127.0.0.1:8081, so two test runs can go at once
# (one per stack). Run from the project folder:
#
#   bash ci/local-stack-b.sh
#
# Then point a run at it:
#   PROXIC_E2E_URL=http://127.0.0.1:8081 PROXIC_E2E_CONTAINER=proxic-arena-b-arena-server-1 ...
#
# The accounts are the same test accounts CI creates (ci.yml, "Create the
# test accounts"); creating one that exists already fails harmlessly.
set -euo pipefail
# Git Bash on Windows would turn /app/bin/... into a Windows path.
export MSYS_NO_PATHCONV=1
export PROXIC_LOCAL_PORT=8081
compose() { docker compose -p proxic-arena-b -f docker-compose.yml -f docker-compose.local.yml "$@"; }
compose up -d --build
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' proxic-arena-b-arena-server-1 2>/dev/null)" = "healthy" ] && break
  sleep 5
done
server() { compose exec -T arena-server "$@"; }
printf '%s' 'a perfectly fine local passphrase' \
  | server /app/bin/arena-admin create RudeLeft --admin --password-stdin >/dev/null 2>&1 || true
printf '%s' 'a perfectly ordinary player password' \
  | server /app/bin/arena-admin create Pat --password-stdin >/dev/null 2>&1 || true
for name in $(node -p 'require("./frontend/e2e/match-accounts.json").accounts.map(a => a.username).join(" ")'); do
  node -e 'process.stdout.write(require("./frontend/e2e/match-accounts.json").accounts.find(a => a.username === process.argv[1]).password)' "$name" \
    | server /app/bin/arena-admin create "$name" --password-stdin >/dev/null 2>&1 || true
done
echo "second stack ready on http://127.0.0.1:8081"
