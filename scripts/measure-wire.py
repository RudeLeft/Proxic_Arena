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
board at a time: permessage-deflate without a shared window), deflated as
the server sends since P11-D2 ("streamed": one window per seat's connection,
kept between boards, each board sync-flushed and its 4-byte tail dropped,
SocketCompression.kt; boards only, so INFERENCE for the real socket, whose
stream also carries questions and steps), the update as the page now reads
it since P11-D4 ("delta": a MATCH_DELTA's fields or, when a whole board goes,
that board as sent; `Stream`, the mirror of BoardStream.kt, one per seat's
connection; "deltaStreamed" is that deflated as sent; every update is rebuilt
as the page does, `PageModel`, and must equal the worker's board:
`deltaMismatches` 0; `wholeBoardsByReason` counts the boards sent whole),
boards per game, boards per combat, and
`payments` repeated unchanged from the board before. Since P11-D3 the
server sends each history entry once (`payments`, `rolls`, `notices`;
BoardHistory.kt): "once" is the board as the server now sends it, made
here by the same rule (`trim`, one memory per seat's connection), and
"onceStreamed" is that deflated as sent; every such board is rebuilt as the
page does (`rebuild`, frontend history.ts) and checked to equal the worker's
board, the spectator's too (`historyMismatches` must be 0). `--out` writes the
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


# P11-D3 -- the server's rule (BoardHistory.kt), mirrored for the Lab's boards.
HISTORY_KEYS = ("payments", "rolls", "notices")


def overlap(had, now):
    m = min(len(had), len(now))
    while m > 0:
        if had[len(had) - m:] == now[:m]:
            return m
        m -= 1
    return 0


def trim(state, held):
    """The board the server sends for `state` to a page holding `held`, and what it then holds."""
    out = dict(state)
    kept = {}
    holds = {}
    for k in HISTORY_KEYS:
        now = state.get(k) if isinstance(state.get(k), list) else []
        holds[k] = now
        m = overlap(held.get(k, []), now)
        if m == 0:
            continue
        kept[k] = m
        rest = now[m:]
        if rest:
            out[k] = rest
        else:
            out.pop(k, None)
    if kept:
        out["kept"] = kept
    return out, holds


def rebuild(sent, held):
    """The page's step (frontend history.ts withHistory)."""
    out = dict(sent)
    kept = out.pop("kept", None) or {}
    for k, m in kept.items():
        out[k] = held.get(k, [])[len(held.get(k, [])) - m:] + (sent.get(k) or [])
    return out


# P11-D4 -- only what changed: the server's rule (BoardDelta.kt, BoardStream.kt),
# mirrored for the Lab's boards. Held to the Kotlin and the page's copies by
# protocol/fixtures/delta/ (scripts/check-deltas.py --self-test).
NOT_PATCHED = set(HISTORY_KEYS) | {"kept"}
# What each envelope adds to its body (protocolVersion, type, messageId; a
# snapshot also "state"): BoardStream.DELTA_ENVELOPE / SNAPSHOT_ENVELOPE.
DELTA_ENVELOPE = 92
SNAPSHOT_ENVELOPE = 105


def size(x) -> int:
    """Characters of compact JSON, as the server counts them (no ASCII escaping)."""
    return len(json.dumps(x, separators=(",", ":"), ensure_ascii=False))


def keyed_by(old, now):
    """"id" or "seat" when both lists are keyed by it (every entry an object, each key unique), else None."""
    items = list(old) + list(now)
    if not all(isinstance(x, dict) for x in items):
        return None
    if all("id" in x for x in items):
        by = "id"
    elif not any("id" in x for x in items) and all("seat" in x for x in items):
        by = "seat"
    else:
        return None
    for lst in (old, now):
        keys = [json.dumps(x[by], sort_keys=True) for x in lst]
        if len(set(keys)) != len(keys):
            return None
    return by


def _k(item, by):
    return json.dumps(item[by], sort_keys=True)


def patch(old, now, by):
    had = {_k(x, by): x for x in old}
    now_keys = [_k(x, by) for x in now]
    now_set = set(now_keys)
    out = {}
    put = [x for x in now if had.get(_k(x, by)) != x]
    drop = [x[by] for x in old if _k(x, by) not in now_set]
    kept = [_k(x, by) for x in old if _k(x, by) in now_set]
    added = [k for k in now_keys if k not in had]
    if put:
        out["put"] = put
    if drop:
        out["drop"] = drop
    if kept + added != now_keys:
        out["order"] = [x[by] for x in now]
    return out


def diff(base, board):
    """How `base` becomes `board`, but for the history lists: {set?, unset?, lists?} (BoardDelta.diff)."""
    sets, lists = {}, {}
    for k, v in board.items():
        if k in NOT_PATCHED:
            continue
        if k in base and base[k] == v:
            continue
        old = base.get(k)
        by = keyed_by(old, v) if isinstance(old, list) and isinstance(v, list) else None
        if k not in base or by is None:
            sets[k] = v
        else:
            lists[k] = patch(old, v, by)
    unset = [k for k in base if k not in NOT_PATCHED and k not in board]
    out = {}
    if sets:
        out["set"] = sets
    if unset:
        out["unset"] = unset
    if lists:
        out["lists"] = lists
    return out


def apply_list(old, p):
    put = p.get("put") or []
    by = keyed_by(old, put)
    if by is None:
        raise ValueError("a list that is not keyed")
    drop = {json.dumps(k, sort_keys=True) for k in (p.get("drop") or [])}
    put_by = {_k(x, by): x for x in put}
    old_keys = {_k(x, by) for x in old}
    items = [put_by.get(_k(x, by), x) for x in old if _k(x, by) not in drop]
    items += [x for x in put if _k(x, by) not in old_keys]
    order = p.get("order")
    if order is None:
        return items
    by_key = {_k(x, by): x for x in items}
    keys = [json.dumps(k, sort_keys=True) for k in order]
    if len(keys) != len(items) or any(k not in by_key for k in keys):
        raise ValueError("an order that does not fit")
    return [by_key[k] for k in keys]


def apply(base, delta):
    """`base` with `delta` applied but for the history lists, which (and `kept`) come from the delta (BoardDelta.apply)."""
    out = {k: v for k, v in base.items() if k not in NOT_PATCHED}
    for k in delta.get("unset") or []:
        out.pop(k, None)
    for k, v in (delta.get("set") or {}).items():
        out[k] = v
    for k, p in (delta.get("lists") or {}).items():
        if not isinstance(base.get(k), list):
            raise ValueError(f"no list {k} to patch")
        out[k] = apply_list(base[k], p)
    for k in NOT_PATCHED:
        if k in delta:
            out[k] = delta[k]
    return out


class Stream:
    """One connection's BoardStream: what goes out for each board (BoardStream.step)."""

    def __init__(self, deltas=True, reset_on_checkpoint=True):
        self.deltas = deltas
        self.reset_on_checkpoint = reset_on_checkpoint
        self.held, self.revision, self.base = {}, None, None
        self.counts = Counter()

    def step(self, state, asked=None):
        """(type, body, reason): MATCH_SNAPSHOT and its state, or MATCH_DELTA and its fields."""
        rev = state.get("stateRevision")
        if rev is not None and self.revision is not None and rev < self.revision:
            self.counts["older"] += 1
            return "MATCH_SNAPSHOT", state, "older"
        if rev is not None:
            self.revision = rev
        had = self.base
        if not self.deltas:
            why = "off"
        elif asked:
            why = asked
        elif had is None:
            why = "first"
        elif had.get("gameEpoch") != state.get("gameEpoch"):
            why = "epoch"
        elif had.get("turn") != state.get("turn"):
            why = "turn"
        else:
            why = None
        if why in ("epoch", "turn") and self.reset_on_checkpoint:
            self.held = {}
        sent, self.held = trim(state, self.held)
        self.base = state
        if why is not None:
            self.counts[why] += 1
            return "MATCH_SNAPSHOT", sent, why
        d = {}
        if "gameEpoch" in state:
            d["gameEpoch"] = state["gameEpoch"]
        if "stateRevision" in had:
            d["from"] = had["stateRevision"]
        if "stateRevision" in state:
            d["to"] = state["stateRevision"]
        d.update(diff(had, state))
        for k in list(HISTORY_KEYS) + ["kept"]:
            if k in sent:
                d[k] = sent[k]
        if size(d) + DELTA_ENVELOPE >= size(sent) + SNAPSHOT_ENVELOPE:
            self.counts["size"] += 1
            return "MATCH_SNAPSHOT", sent, "size"
        self.counts["delta"] += 1
        return "MATCH_DELTA", d, "delta"


class PageModel:
    """The page's side (frontend match.ts, delta.ts, history.ts): the board it rebuilds from what it is sent."""

    def __init__(self):
        self.base, self.held, self.revision = None, {}, None
        self.waiting = False

    def take(self, kind, body):
        """The whole board the page makes of one message; None when it must ask for a full board."""
        if kind == "MATCH_DELTA":
            if self.waiting:
                return None
            b = self.base
            if b is None or b.get("gameEpoch") != body.get("gameEpoch") or b.get("stateRevision") != body.get("from"):
                self.waiting = True
                return None
            try:
                whole = rebuild(apply(b, body), self.held)
            except (ValueError, KeyError, TypeError):
                self.waiting = True
                return None
        else:
            whole = rebuild(body, self.held)
        rev = whole.get("stateRevision")
        if self.revision is not None and rev is not None and rev < self.revision:
            return whole        # older than the base: shown nowhere, not the base (its log lines kept)
        self.revision = rev
        self.base = whole
        self.held = {k: whole.get(k) if isinstance(whole.get(k), list) else [] for k in HISTORY_KEYS}
        self.waiting = False
        return whole


def same_history(a, b):
    for k in HISTORY_KEYS:
        if (a.get(k) or []) != (b.get(k) or []):
            return False
    rest = lambda x: {k: v for k, v in x.items() if k not in HISTORY_KEYS}
    return rest(a) == rest(b)


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(len(xs) * p))] if xs else 0


def measure(files):
    raw = {"players": [], "spectator": []}
    deflated = []
    streamed = []
    deltas = []
    per_game = []
    combat_runs = []
    payments_boards = 0
    payments_same = 0
    fields = Counter()
    once = []
    once_streamed = []
    mismatches = 0
    delta_mismatches = 0
    delta_streamed = []
    reasons = Counter()
    for f in files:
        last = {}
        streams = {}
        held = {}
        once_streams = {}
        d4 = {}
        d4_pages = {}
        d4_z = {}
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
            sent, held_now = trim(st, held.get(seat, {}))
            if not same_history(st, rebuild(sent, held.get(seat, {}))):
                mismatches += 1
            held[seat] = held_now
            # P11-D4: the update as the page now reads it (a delta, or the board), and its rebuild.
            kind, body, why = d4.setdefault(seat, Stream()).step(st)
            if d4_pages.setdefault(seat, PageModel()).take(kind, body) != st:
                delta_mismatches += 1
            if seat in (1, 2):
                reasons[why] += 1
                u = compact(body)
                deltas.append(len(u))
                zd = d4_z.setdefault(seat, zlib.compressobj(6, zlib.DEFLATED, -15))
                delta_streamed.append(len(zd.compress(u) + zd.flush(zlib.Z_SYNC_FLUSH)) - 4)
                raw["players"].append(len(b))
                deflated.append(len(zlib.compress(b, 6)))
                z = streams.setdefault(seat, zlib.compressobj(6, zlib.DEFLATED, -15))
                streamed.append(len(z.compress(b) + z.flush(zlib.Z_SYNC_FLUSH)) - 4)
                t = compact(sent)
                once.append(len(t))
                zo = once_streams.setdefault(seat, zlib.compressobj(6, zlib.DEFLATED, -15))
                once_streamed.append(len(zo.compress(t) + zo.flush(zlib.Z_SYNC_FLUSH)) - 4)
                for k, v in st.items():
                    fields[k] += len(compact(v))
                if seat in last:
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
        "streamedBytesMedian": pct(streamed, 0.5),
        "streamedBytesP95": pct(streamed, 0.95),
        "streamedShare": round(sum(streamed) / total, 3),
        "onceBytesMedian": pct(once, 0.5),
        "onceBytesP95": pct(once, 0.95),
        "onceShare": round(sum(once) / total, 3),
        "onceStreamedBytesMedian": pct(once_streamed, 0.5),
        "onceStreamedBytesP95": pct(once_streamed, 0.95),
        "onceStreamedShare": round(sum(once_streamed) / total, 3),
        "historyMismatches": mismatches,
        "deltaBytesMedian": pct(deltas, 0.5),
        "deltaBytesP95": pct(deltas, 0.95),
        "deltaBytesLargest": max(deltas, default=0),
        "deltaShare": round(sum(deltas) / total, 3),
        "deltaStreamedBytesMedian": pct(delta_streamed, 0.5),
        "deltaStreamedBytesP95": pct(delta_streamed, 0.95),
        "deltaStreamedShare": round(sum(delta_streamed) / total, 3),
        "deltaMismatches": delta_mismatches,
        "updatesAsDeltas": reasons["delta"],
        "wholeBoardsByReason": dict(sorted((k, v) for k, v in reasons.items() if k != "delta")),
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
