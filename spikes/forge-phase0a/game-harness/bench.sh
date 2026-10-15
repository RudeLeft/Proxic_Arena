#!/bin/bash
# §0A.10 / 0B.2 -- concurrent worker benchmark.
# Spawns N Forge match workers, holds them alive, and samples real OS
# memory. No estimates (PHASE_00 0.48: measure, do not extrapolate).
N=$1
HOLD=${2:-40}
rm -f bench_*.log
start=$(date +%s)
for i in $(seq 1 $N); do
  java -jar target/game-harness-0.0.1.jar --res=../forge-upstream/forge-gui/res \
       --deck1=decks/identity_red.dck --limit=30 --hold=$HOLD > bench_$i.log 2>&1 &
done
sleep 18
echo "--- $N concurrent workers, sampled 18s after launch ---"
powershell -Command "
  \$p = Get-Process java -ErrorAction SilentlyContinue
  if (\$p) {
    \$sum = (\$p | Measure-Object WorkingSet64 -Sum).Sum
    \$cnt = (\$p | Measure-Object).Count
    '{0,-22} {1}' -f 'java processes:', \$cnt
    '{0,-22} {1:N0} MB' -f 'total RSS:', (\$sum/1MB)
    '{0,-22} {1:N0} MB' -f 'mean RSS per worker:', (\$sum/1MB/\$cnt)
    '{0,-22} {1:N0} MB' -f 'max single worker:', ((\$p | Measure-Object WorkingSet64 -Maximum).Maximum/1MB)
  } else { 'no java processes alive' }
"
wait
echo "--- results ---"
ok=0
for i in $(seq 1 $N); do
  r=$(grep -oE 'RESULT: [A-Z]+' bench_$i.log | head -1 | cut -d' ' -f2)
  t=$(grep 'Forge ready' bench_$i.log | grep -oE '[0-9]+' | head -1)
  printf '  worker %d: %-5s  forge-ready=%sms\n' $i "$r" "$t"
  [ "$r" = "PASS" ] && ok=$((ok+1))
done
echo "  passed: $ok/$N   wall: $(( $(date +%s) - start ))s"
