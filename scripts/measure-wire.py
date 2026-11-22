"""Phase 11's wire measure over Mechanics Lab traces (P11-D1), for before/after.

The boards the worker sends each seat, read from Lab traces (the worker's
side: the server adds picture addresses before the browser gets them; the
browser's side is frontend/tools/measure/redraw.spec.ts's wire numbers).

    python -I scripts/measure-wire.py <traces folder> [--set fixed|all] [--out file.json]

`--set fixed` (the default) reads only the fixed traces below: the same
games before and after each change to the update format (P11-R5). `all`
reads every trace in the folder (the 2026-11-19 baseline read all 384).
Traces come from a Lab run (CI's "mechanics-lab-traces-*" artifacts, or a
local run of the scripts/check-<scenario>.py named here into one folder).

For each set: per seat (players and the spectator), the board's bytes as
compact JSON (median, p95, largest), the same deflated (zlib level 6, one
board at a time: permessage-deflate without a shared window), a simple
delta from that seat's board before (changed keys, changed or added list
members by id, removed ids), boards per game, boards per combat, and
`payments` repeated unchanged from the board before. `--out` writes the
kit's result file (ci/measure.mjs compare reads it); stdout has the same.
"""

import json
import sys
import zlib
from collections import Counter
from pathlib import Path

# The fixed set: big boards, combat, payments, wipes, tokens, a spectator,
# copies and long games. Names are scripts/check-<scenario>.py's traces.
FIXED = [
    "game-flow-krenko",
    "game-flow-scute",
    "results-felidar",
    "results-platinum",
    "results-grace",
    "wipes-wrath",
    "wipes-pestilence",
    "modes-entwine",
    "play-log",
    "costs-delve",
    "karn",
    "combat-choices-trample-two-blockers",
    "blocks-menace",
    "players-monarch",
    "soulbond-two-pairs",
    "mindslaver",
]
COMBAT = {
    "COMBAT_BEGIN",
    "COMBAT_DECLARE_ATTACKERS",
    "COMBAT_DECLARE_BLOCKERS",
    "COMBAT_FIRST_STRIKE_DAMAGE",
    "COMBAT_DAMAGE",
    "COMBAT_END",
}


def compact(x) -> bytes:
    return json.dumps(x, separators=(",", ":")).encode()


def keyed(items):
    out = {}
    for i, x in enumerate(items):
        k = x.get("id") if isinstance(x, dict) else None
        out[k if k is not None else ("#", i)] = x
    return out


def delta(prev, cur) -> int:
    n = 0
    for k, v in cur.items():
        pv = prev.get(k)
        if pv == v:
            continue
        if isinstance(v, list) and isinstance(pv, list):
            a, b = keyed(pv), keyed(v)
            for kk, vv in b.items():
                if a.get(kk) != vv:
                    n += len(compact(vv))
            n += sum(len(str(kk)) + 3 for kk in a if kk not in b)
        else:
            n += len(k) + len(compact(v))
    n += sum(len(k) + 3 for k in prev if k not in cur)
    return n


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(len(xs) * p))] if xs else 0


def measure(files):
    raw = {"players": [], "spectator": []}
    deflated = []
    deltas = []
    per_game = []
    combat_runs = []
    payments_boards = 0
    payments_same = 0
    fields = Counter()
    for f in files:
        last = {}
        count = 0
        run = 0
        for line in f.read_text(encoding="utf-8").splitlines():
            try:
                o = json.loads(line)
            except ValueError:
                continue
            fr = o.get("frame") or {}
            if o.get("dir") != "in" or fr.get("type") != "MATCH_SNAPSHOT":
                continue
            seat = fr.get("seat")
            st = fr.get("state") or {}
            b = compact(st)
            count += 1
            if seat in (1, 2):
                raw["players"].append(len(b))
                deflated.append(len(zlib.compress(b, 6)))
                for k, v in st.items():
                    fields[k] += len(compact(v))
                if seat in last:
                    deltas.append(delta(last[seat], st))
                    if st.get("payments"):
                        payments_boards += 1
                        if st.get("payments") == last[seat].get("payments"):
                            payments_same += 1
                last[seat] = st
                if seat == 1:
                    if st.get("phase") in COMBAT:
                        run += 1
                    elif run:
                        combat_runs.append(run)
                        run = 0
            else:
                raw["spectator"].append(len(b))
        per_game.append(count)
    p = raw["players"]
    total = sum(p) or 1
    out = {
        "games": len(files),
        "boardBytesMedian": pct(p, 0.5),
        "boardBytesP95": pct(p, 0.95),
        "boardBytesLargest": max(p, default=0),
        "deflatedBytesMedian": pct(deflated, 0.5),
        "deflatedBytesP95": pct(deflated, 0.95),
        "deflatedShare": round(sum(deflated) / total, 3),
        "deltaBytesMedian": pct(deltas, 0.5),
        "deltaBytesP95": pct(deltas, 0.95),
        "deltaShare": round(sum(deltas) / total, 3),
        "boardsPerGameMedian": pct(per_game, 0.5),
        "boardsPerGameP95": pct(per_game, 0.95),
        "boardsPerCombatMedian": pct(combat_runs, 0.5),
        "boardsPerCombatP95": pct(combat_runs, 0.95),
        "paymentsSameShare": round(payments_same / max(1, payments_boards), 3),
        "spectatorBoards": len(raw["spectator"]),
        "spectatorBytesMedian": pct(raw["spectator"], 0.5),
    }
    for k, v in fields.most_common(6):
        out[f"share_{k}"] = round(v / total, 3)
    return out


def main(argv):
    if not argv or argv[0].startswith("-"):
        print(__doc__)
        return 2
    folder = Path(argv[0])
    which = argv[argv.index("--set") + 1] if "--set" in argv else "fixed"
    out = argv[argv.index("--out") + 1] if "--out" in argv else None
    if which == "fixed":
        files = [folder / f"{n}.jsonl" for n in FIXED]
        missing = [f.name for f in files if not f.exists()]
        if missing:
            print(f"missing from the fixed set: {', '.join(missing)}", file=sys.stderr)
            return 1
    else:
        files = sorted(folder.glob("*.jsonl"))
    numbers = measure(files)
    for k, v in numbers.items():
        print(f"{k:24} {v}")
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_text(
            json.dumps(
                {
                    "kind": "wire-lab",
                    "engine": "worker",
                    "machine": "-",
                    "commit": "-",
                    "when": "-",
                    "traces": str(folder),
                    "rows": [{"key": f"lab {which}", **numbers}],
                },
                indent=1,
            ),
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
