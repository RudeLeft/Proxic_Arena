"""Lab traces rewritten as a page receives them -- P11-R4, P11-B4 (2026-11-22).

    python -I scripts/as-sent-traces.py <traces folder> <out folder> [--rebuilt]
    python -I scripts/as-sent-traces.py --self-test

A Lab trace is the WORKER's output: every board whole. Since P11-D3 the
server sends each seat's history lists once (`payments`, `rolls`,
`notices`, with `kept`; BoardHistory.kt), so the page receives less, and
rebuilds the whole board before anything reads it (frontend history.ts).
The hidden checks read traces, so this writes a trace folder again, per
seat's stream, the way the server's rule makes it (`scripts/measure-wire.py`
`trim`, the Python mirror of BoardHistory.kt; the spectator's stream too):

  (default)   each board AS SENT: what is on the wire to that page (since
              P11-D4 mostly MATCH_DELTA frames)
  --rebuilt   each board as the PAGE REBUILDS it from what was sent
              (`rebuild`, history.ts withHistory); every rebuilt board must
              equal the worker's, or this exits 1 naming the first that
              does not (P11-R4: "the rebuilt view must equal the full view")

Every hidden check then reads a --rebuilt folder exactly as it reads the Lab's:

    python -I scripts/as-sent-traces.py "$traces" "$out" --rebuilt
    python -I scripts/check-hidden-hands.py "$out"/*.jsonl      (and the rest)

Other lines (questions, answers) are copied unchanged. P11-D4 (deltas)
added its step here: `sent_board` makes the MATCH_DELTA from the board that
seat's connection was last sent (`measure-wire.py` `Stream`, the mirror of
BoardStream.kt), `page_board` applies it (`PageModel`, the page's delta.ts
and history.ts). As sent, a delta is written as a MATCH_DELTA frame (with its
seat); the hidden checks read MATCH_SNAPSHOT boards, so P11-R4's gate runs
them over the rebuilt traces `scripts/check-deltas.py` writes (CI).

Exit 0 when written (and, with --rebuilt, every board rebuilt equal), 1 when
a rebuilt board differs.
"""
import importlib.util
import json
import sys
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "measure_wire", Path(__file__).resolve().parent / "measure-wire.py")
mw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mw)


def sent_board(state, stream):
    """What the server sends a page for `state` on `stream` (P11-D4: a MATCH_DELTA from the
    board this connection was last sent, or the board, P11-D3's history trimmed): (type, body)."""
    kind, body, _ = stream.step(state)
    return kind, body


def page_board(kind, body, page):
    """The whole board the page makes of what it was sent (None: it would ask for a full board)."""
    return page.take(kind, body)


def rewrite(lines, rebuilt=False):
    """Trace lines -> (lines as sent or rebuilt, boards, mismatches)."""
    streams, pages = {}, {}
    out, boards, mismatches = [], 0, []
    for line in lines:
        try:
            o = json.loads(line)
        except ValueError:
            out.append(line)
            continue
        frame = o.get("frame") or {}
        if o.get("dir") == "in" and frame.get("type") == "MATCH_SNAPSHOT":
            seat = frame.get("seat")
            state = frame.get("state") or {}
            kind, body = sent_board(state, streams.setdefault(seat, mw.Stream()))
            boards += 1
            if rebuilt:
                page = page_board(kind, body, pages.setdefault(seat, mw.PageModel()))
                if page != state:
                    mismatches.append((seat, state.get("stateRevision")))
                frame["state"] = page
            elif kind == "MATCH_DELTA":
                # As on the wire: the delta's fields where the board was (the seat kept, to say whose).
                o["frame"] = {"type": kind, "seat": seat, **body}
            else:
                frame["state"] = body
        out.append(json.dumps(o))
    return out, boards, mismatches


def main(argv):
    rebuilt = "--rebuilt" in argv
    args = [a for a in argv if a != "--rebuilt"]
    if len(args) != 2:
        sys.exit(__doc__)
    src, dst = Path(args[0]), Path(args[1])
    dst.mkdir(parents=True, exist_ok=True)
    files = sorted(src.glob("*.jsonl"))
    boards, bad = 0, []
    for f in files:
        out, n, mismatches = rewrite(f.read_text(encoding="utf-8").splitlines(), rebuilt)
        boards += n
        bad += [(f.name, s, r) for s, r in mismatches]
        (dst / f.name).write_text("\n".join(out) + "\n", encoding="utf-8")
    how = "as the page rebuilds them" if rebuilt else "as sent"
    print(f"{len(files)} traces, {boards} boards, written {how} to {dst}")
    if bad:
        print(f"WRONG: {len(bad)} board(s) rebuilt differently from the worker's; first: {bad[0]}")
        return 1
    return 0


def self_test():
    """On a made-up stream: as sent, the second board is a delta naming only what changed and
    the history entry the page lacks; rebuilt equals the worker's; a broken rebuild is caught."""
    def board(rev, payments, tapped):
        return {"dir": "in", "frame": {"type": "MATCH_SNAPSHOT", "seat": 1, "state": {
            "stateRevision": rev, "gameEpoch": 1, "turn": 1, "payments": payments,
            "battlefield": [{"id": f"card:{i}", "tapped": tapped and i == 1} for i in range(1, 12)]}}}
    lines = [json.dumps(board(1, [{"n": 1}], False)), json.dumps(board(2, [{"n": 1}, {"n": 2}], True)),
             json.dumps({"dir": "out", "frame": {"type": "DECISION_RESPONSE"}})]
    sent, n, _ = rewrite(lines)
    second = json.loads(sent[1])["frame"]
    page, _, mismatches = rewrite(lines, rebuilt=True)
    results = {
        "two boards read": n == 2,
        "as sent: the first board whole": json.loads(sent[0])["frame"]["type"] == "MATCH_SNAPSHOT",
        "as sent: then a delta, only the tapped card and the new payment": second.get("type") == "MATCH_DELTA"
        and second.get("lists") == {"battlefield": {"put": [{"id": "card:1", "tapped": True}]}}
        and second.get("payments") == [{"n": 2}] and second.get("kept") == {"payments": 1},
        "rebuilt: equals the worker's board": not mismatches
        and json.loads(page[1])["frame"]["state"] == json.loads(lines[1])["frame"]["state"],
        "other lines copied unchanged": sent[2] == lines[2],
    }
    real = mw.rebuild
    mw.rebuild = lambda s, h: dict(s)          # a page that forgets what it held
    try:
        _, _, broken = rewrite(lines, rebuilt=True)
    finally:
        mw.rebuild = real
    results["a broken rebuild is caught"] = bool(broken)
    print(json.dumps(results, indent=1))
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(self_test() if sys.argv[1:] == ["--self-test"] else main(sys.argv[1:]))
