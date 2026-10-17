#!/bin/sh
# One-time setup for an Unraid host.
#
#   sh scripts/unraid-setup.sh
#
# Writes .env with freshly generated secrets, points Compose at the
# right two files, and says what to do next. Safe to run twice: it
# never overwrites a secret that is already set.
#
# What it deliberately does NOT do:
#
#   - create the data directories. Docker creates a missing bind
#     mount source itself, and the `init-data` service in
#     docker-compose.unraid.yml fixes the ownership on every start.
#   - build. `pull_policy: build` means `up` builds.
#   - create an account. The password is typed by a person, into a
#     prompt, and is never handled by a script (PHASE_03 §3.58).

set -eu

cd "$(dirname "$0")/.."

say() { printf '%s\n' "$*"; }

# A secret, without depending on openssl being installed: Unraid has
# it, a stripped container may not, and failing here would be a poor
# reason to stop.
secret() {
    bytes="$1"
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex "$bytes"
    else
        od -An -tx1 -N "$bytes" /dev/urandom | tr -d ' \n'
    fi
}

# set_var FILE NAME VALUE -- replace the line, or append it.
set_var() {
    file="$1"; name="$2"; value="$3"
    if grep -q "^${name}=" "$file" 2>/dev/null; then
        # A temp file and a move: sed -i is not portable, and a
        # half-written .env is worse than no .env.
        awk -v n="$name" -v v="$value" \
            'BEGIN{FS=OFS="="} $1==n {print n "=" v; next} {print}' \
            "$file" > "$file.tmp"
        mv "$file.tmp" "$file"
    else
        printf '%s=%s\n' "$name" "$value" >> "$file"
    fi
}

# current FILE NAME -- the value, or empty.
current() {
    grep "^$2=" "$1" 2>/dev/null | head -n 1 | cut -d= -f2- || true
}

if [ ! -f .env ]; then
    say "Creating .env from .env.example"
    cp .env.example .env
else
    say "Keeping the existing .env"
fi

# Production settings. These are facts about the host, not choices.
set_var .env APP_ENV production
set_var .env PUBLIC_BASE_URL https://proxic.barnflix.net

# Both compose files, so no -f flags are needed anywhere -- including
# the Compose Manager GUI, whose buttons cannot pass them. The
# separator is a colon on Linux.
#
# docker-compose.local.yml is deliberately absent: it turns Secure
# off on session cookies, which is right for a laptop over HTTP and
# wrong for anything reachable from outside (PHASE_03 §3.23).
set_var .env COMPOSE_FILE docker-compose.yml:docker-compose.unraid.yml

# Secrets: generated once, never regenerated, never printed.
#
# Regenerating POSTGRES_PASSWORD against an EXISTING database would
# lock the server out of it -- PostgreSQL keeps whatever initdb was
# given -- so a value that is already set is left alone even when it
# looks weak.
for pair in "PROXIC_SESSION_SECRET 32" "POSTGRES_PASSWORD 16"; do
    name=${pair% *}
    bytes=${pair#* }
    value=$(current .env "$name")
    case "$value" in
        "" | changeme | change-me | CHANGEME | replace-me)
            set_var .env "$name" "$(secret "$bytes")"
            say "Generated $name"
            ;;
        *)
            say "$name is already set; leaving it alone"
            ;;
    esac
done

# The tunnel runs OUTSIDE this stack on this host, reaching the
# origin on the published port, so the compose service behind the
# `edge` profile is unused and its token must be empty rather than
# the word "changeme" -- which would otherwise look like a secret
# somebody forgot.
case "$(current .env CLOUDFLARE_TUNNEL_TOKEN)" in
    changeme) set_var .env CLOUDFLARE_TUNNEL_TOKEN ""
              say "Cleared CLOUDFLARE_TUNNEL_TOKEN (the tunnel runs outside this stack)" ;;
esac

chmod 600 .env 2>/dev/null || true

say ""
say "Checking what is left..."
remaining=$(grep -c "changeme" .env 2>/dev/null || true)
[ "${remaining:-0}" = "0" ] || say "  WARNING: $remaining placeholder(s) still in .env"

say ""
say "Done. Next:"
say ""
say "  1. In the Compose Manager GUI, add a stack named exactly"
say "     'proxic-arena', pointed at:"
say "       $(pwd)"
say "     Leave the compose-file discovery alone -- .env now names"
say "     both files."
say ""
say "  2. Press Compose Up. It builds, which takes 3-10 minutes the"
say "     first time."
say ""
say "  3. Create your account, in the arena-server container console:"
say "       /app/bin/arena-admin create RudeLeft --admin"
say "     It asks for the password. 12 characters minimum."
say ""
say "  4. Sign in at https://proxic.barnflix.net"
