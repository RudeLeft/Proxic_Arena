#!/bin/bash
# Phase 0A §0A.5 resource-necessity matrix.
#
# Baseline, then one run per resource with that path pointed at a path
# that does not exist -- the realistic Docker failure (we forgot to COPY
# it). Each run's result is the evidence that justifies shipping that
# resource, or shows it is not required.
#
# A UNIQUE absent path per run, deleted afterwards: Forge CREATES missing
# resource directories, so reusing one path silently converts the second
# and later runs from "missing directory" into "empty directory", which
# is a different test. That contaminated an earlier version of this run.
RES=../forge-upstream/forge-gui/res
run () {
  label="$1"; shift
  miss="./__absent_${label}__"
  rm -rf "$miss"
  out=$(java -jar target/bootstrap-harness-0.0.1.jar --res=$RES "$@" 2>&1)
  res=$(echo "$out" | grep -m1 -E "^RESULT:")
  why=$(echo "$out" | grep -m1 -E "^  (java|PROBE)" | cut -c1-96)
  cards=$(echo "$out" | grep -m1 "card database loaded" | sed 's/.*loaded: //')
  mana=$(echo "$out" | grep -m1 "getLandManaForColor" | sed 's/.*getLandManaForColor(GREEN)=//;s/ .*//')
  printf '%-14s %-6s %-12s %-7s %s\n' "$label" "${res#RESULT: }" "${cards:--}" "${mana:--}" "$why"
  rm -rf "$miss"
}
printf '%-14s %-6s %-12s %-7s %s\n' "OMITTED" "RESULT" "CARDS" "G-MANA" "FAILURE"
printf '%s\n' "---------------------------------------------------------------------------------"
run "(baseline)"
for r in languages lists cardsfolder tokenscripts editions blockdata setlookup; do
  run "$r" "--$r=./__absent_${r}__"
done
