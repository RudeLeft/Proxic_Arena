#!/bin/sh
# Fail if a test skipped itself without permission.
#
#   sh ci/check-skips.sh server/build/test-results/test
#
# JUnit records a skip as a pass-shaped result, so a suite that
# assumes its way out of running reports green. Phase 1 shipped two
# tests that silently never ran -- this is that failure wearing CI
# clothes, where nobody is watching the console.
#
# Classes listed in ci/expected-skips.txt may skip. Anything else is
# an error, and the message names it.

set -eu

results="${1:-server/build/test-results/test}"
allowed="$(dirname "$0")/expected-skips.txt"

total=0
skipped=0
unexpected=""

for file in "$results"/TEST-*.xml; do
    [ -f "$file" ] || continue

    header=$(head -c 2000 "$file")
    class=$(printf '%s' "$header" | sed -n 's/.*testsuite name="\([^"]*\)".*/\1/p' | head -n 1)
    tests=$(printf '%s' "$header" | sed -n 's/.* tests="\([0-9]*\)".*/\1/p' | head -n 1)
    skips=$(printf '%s' "$header" | sed -n 's/.*skipped="\([0-9]*\)".*/\1/p' | head -n 1)

    total=$((total + ${tests:-0}))
    skips=${skips:-0}
    [ "$skips" -eq 0 ] && continue

    skipped=$((skipped + skips))
    if grep -qx "$class" "$allowed" 2>/dev/null; then
        echo "  allowed: $class skipped $skips"
    else
        unexpected="$unexpected$class ($skips)\n"
    fi
done

echo "$total tests, $skipped skipped"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "$total tests, $skipped skipped (declared in ci/expected-skips.txt)" \
        >> "$GITHUB_STEP_SUMMARY"
fi

if [ -n "$unexpected" ]; then
    echo ""
    echo "Undeclared skips:"
    printf "%b" "$unexpected"
    echo "A skipped test proves nothing. Either make it run on CI, or"
    echo "add it to ci/expected-skips.txt with the reason."
    exit 1
fi
