"""P11-R4's Lab gate for P11-D4 (spec 0117): each page is sent only what changed.

    python -I scripts/check-deltas.py <traces folder> <out folder>
    python -I scripts/check-deltas.py --self-test

A Lab trace is the WORKER's output: every board whole, per seat, and the
public view (seat 0) while someone watches. The Arena Server sends each
connection a MATCH_DELTA made from the board THAT connection was last sent
(BoardStream.kt, BoardDelta.kt), and the page rebuilds the whole board from
its own (frontend delta.ts, match.ts). Lab games never pass through the
server, so this replays every seat's stream and the public one through the
Python copy of the server's rule (`measure-wire.py` `Stream`: full board
first, deltas after, the checkpoint at each new turn, the epoch rule, P11-D3's
history trimming) and the page's (`PageModel`), and for every board:

  (a) the board the page rebuilds must equal the worker's board: 0 mismatches;
  (b) every card id a delta names (`card:`, `stack:`, `known:`, `copying:`)
      must be named by that stream's base or its new board (P11-R4: "a delta
      may name a card id only if the seat's previous view or its new view
      names it");
  (c) a board sent whole for a new connection, a new game or a new turn (the
      checkpoint) carries every history list whole: nothing the page held is
      relied on;
  (d) HID-004: a game with boards and no delta fails (a gate that compared
      nothing would pass). The deltas per stream are printed.

P11-D6 (spec 0119) adds a RESUME pass: on every stream, at every
RESUME_EVERY-th board, the page's line dies and it misses the next MISSED
boards (the server still sent them: they are in that seat's kept boards,
the last REPLAY_KEPT, SeatReplay.kt); then it comes back naming the board it
holds, exactly as the server would answer: found in the seat's OWN kept list,
the boards after it through a NEW connection's stream (the first whole, then
deltas), or, not found, today's whole board. Every board the page rebuilds
from a catch-up must equal the worker's board for that seat (a), every id a
catch-up delta names must be in its base or its board (b), and the first
catch-up board must go whole. HID-004 again: the resumes and catch-up boards
per stream are printed, and a stream long enough to be cut that never was
fails.

It writes every trace again to <out folder> with each board AS THE PAGE
REBUILT IT, and the hidden checks then run over that folder exactly as over
the Lab's (check-snapshot-first, check-hidden-hands, check-hidden-log,
check-hidden-tops, check-hidden-mulligans, check-hidden-information,
check-kinds, check-wording --res): they must pass with the same counts.

--self-test holds the Python copy to the server's and the page's: the shared
fixtures in protocol/fixtures/delta/ (boards from three Lab traces, each
diff, and what one connection is sent) must be made and applied exactly, and
each planted fault must be caught.

Exit 0 when every check holds, 1 naming the first that does not.
"""
import importlib.util
import json
import re
import sys
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "measure_wire", Path(__file__).resolve().parent / "measure-wire.py")
mw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mw)

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "protocol" / "fixtures" / "delta"
TYPED = re.compile(r"^(card|stack|known|copying):")
WHOLE_REASONS = ("first", "epoch", "turn")
RESUME_EVERY = 7   # spec 0119: the line dies at every 7th board of a stream
MISSED = 3         # and the page misses this many boards before it comes back
REPLAY_KEPT = 40   # SeatReplay.kt: the boards each seat keeps


def ids(value, out=None):
    """Every typed id a JSON value names, under any key."""
    out = set() if out is None else out
    if isinstance(value, str):
        if TYPED.match(value):
            out.add(value)
    elif isinstance(value, list):
        for x in value:
            ids(x, out)
    elif isinstance(value, dict):
        for x in value.values():
            ids(x, out)
    return out


class Plants:
    """Faults planted on purpose (the self-test's bites, and --plant on real traces)."""
    other_seat_base = False     # a seat's delta made from the other seat's last board
    public_from_seat1 = False   # the public view's delta made from seat 1's board
    drop_moved = False          # `drop` keeps the id of an item that only moved
    no_checkpoint_reset = False  # the checkpoint keeps the history the page held
    resume_other_seat = False    # spec 0119: a resume reads the other seat's kept boards
    resume_public_seat1 = False  # spec 0119: a spectator resumed from seat 1's list
    resume_any_seat = False      # spec 0119: a resume point found in any seat's list
    catchup_first_delta = False  # spec 0119: the catch-up's first board sent as a delta
    seat1_short = False          # (not a fault) seat 1 keeps one board: its resume finds nothing


def stream_for(seat):
    s = mw.Stream(reset_on_checkpoint=not Plants.no_checkpoint_reset)
    return s


_diff = mw.diff


def planted_diff(base, board):
    d = _diff(base, board)
    if Plants.drop_moved:
        for k, p in (d.get("lists") or {}).items():
            if "order" in p:
                moved = [x for x in p["order"] if x not in (p.get("drop") or [])]
                if moved:
                    p.setdefault("drop", []).append(moved[0])
    return d


def point(board):
    return (board or {}).get("gameEpoch"), (board or {}).get("stateRevision")


def kept_for(rings, seat):
    """The kept list a resume of [seat] reads: its own (planted: another's)."""
    if Plants.resume_other_seat and seat in (1, 2):
        return rings.get(3 - seat, [])
    if Plants.resume_public_seat1 and seat == 0:
        return rings.get(1, [])
    return rings.get(seat, [])


def resume(seat, page, rings, pending, streams, problems, counts):
    """The page of [seat] comes back holding page.base: SeatReplay's answer, sent through a new stream."""
    held = point(page.base)
    kept = kept_for(rings, seat)
    at = max((i for i, b in enumerate(kept) if point(b) == held), default=-1)
    if at < 0 and Plants.resume_any_seat:
        for other in sorted(rings):
            found = max((i for i, b in enumerate(rings[other]) if point(b) == held), default=-1)
            if found >= 0:
                kept, at = rings[other], found
                break
    stream = streams[seat] = stream_for(seat)
    counts["resumes"][seat] = counts["resumes"].get(seat, 0) + 1
    after = kept[at + 1:] if at >= 0 else kept[-1:]
    if at < 0:
        # Not kept: today's whole board, the newest; the boards between are never drawn.
        counts["whole"][seat] = counts["whole"].get(seat, 0) + 1
        pending = pending[-1:]
    if Plants.catchup_first_delta and at >= 0:
        stream.base = kept[at]
    for i, (o, sent) in enumerate(zip(pending, after)):
        frame = o["frame"]
        state = frame.get("state") or {}
        rev = state.get("stateRevision")
        base = stream.base
        kind, body, why = stream.step(sent)
        if i == 0 and kind != "MATCH_SNAPSHOT":
            problems.append(f"seat {seat} rev {rev}: a catch-up's first board went as a delta")
        if kind == "MATCH_DELTA":
            extra = sorted(ids({k: v for k, v in body.items() if k != "whole"}) - (ids(base) | ids(sent)))
            if extra:
                problems.append(f"seat {seat} rev {rev}: a catch-up delta names {extra[:3]}, in neither its base nor its board")
        rebuilt = page.take(kind, body)
        if rebuilt != state:
            problems.append(f"seat {seat} rev {rev}: the catch-up rebuilt a board that is not the worker's")
        counts["caught"][seat] = counts["caught"].get(seat, 0) + 1
        frame["state"] = rebuilt if rebuilt is not None else state
    if len(after) < len(pending):
        # Not kept (today's whole board): the boards between are never drawn; as the worker made them.
        pass


def rewrite(lines, resume_every=None):
    """Trace lines -> (lines with each board as the page rebuilt it, problems, deltas per stream, boards).

    [resume_every] (spec 0119): every so many boards a stream's page misses MISSED
    and comes back (`resume`); the counts are in rewrite.counts after a run.
    """
    streams, pages, last_any = {}, {}, {}
    out, problems = [], []
    deltas, boards = {}, 0
    rings, seen, missing, pending = {}, {}, {}, {}
    counts = {"resumes": {}, "caught": {}, "whole": {}}
    rewrite.counts = counts
    mw.diff = planted_diff
    try:
        for line in lines:
            try:
                o = json.loads(line)
            except ValueError:
                out.append(line)
                continue
            frame = o.get("frame") or {}
            if not (o.get("dir") == "in" and frame.get("type") == "MATCH_SNAPSHOT"):
                out.append(line)
                continue
            seat = frame.get("seat")
            state = frame.get("state") or {}
            boards += 1
            stream = streams.setdefault(seat, stream_for(seat))
            page = pages.setdefault(seat, mw.PageModel())
            if resume_every:
                # SeatReplay: every board this seat is sent is kept (the last REPLAY_KEPT).
                ring = rings.setdefault(seat, [])
                ring.append(state)
                del ring[:-(1 if seat == 1 and Plants.seat1_short else REPLAY_KEPT)]
                seen[seat] = seen.get(seat, 0) + 1
                if not missing.get(seat) and seen[seat] % resume_every == 0 and page.base is not None:
                    missing[seat] = MISSED
                if missing.get(seat):
                    # The line is dead: sent, kept, never read. Filled in when the page comes back.
                    missing[seat] -= 1
                    pending.setdefault(seat, []).append(o)
                    out.append(o)
                    continue
                if pending.get(seat):
                    resume(seat, page, rings, pending.pop(seat), streams, problems, counts)
                    stream = streams[seat]
            # The stream's own last board: what this viewer was really sent before.
            base = stream.base
            # Planted: the base taken from another stream's board of the same round
            # (the same revision, so the delta still "fits" the page's base).
            other = (3 - seat) if Plants.other_seat_base and seat in (1, 2) else (
                1 if Plants.public_from_seat1 and seat == 0 else None)
            if other is not None and stream.base is not None:
                twin = last_any.get(other, {}).get(stream.base.get("stateRevision"))
                if twin is not None:
                    stream.base = twin
            kind, body, why = stream.step(state)
            rev = state.get("stateRevision")
            if kind == "MATCH_DELTA":
                deltas[seat] = deltas.get(seat, 0) + 1
                named = ids({k: v for k, v in body.items() if k != "whole"})
                allowed = ids(base) | ids(state)
                extra = sorted(named - allowed)
                if extra:
                    problems.append(f"seat {seat} rev {rev}: the delta names {extra[:3]}, in neither its base nor its board")
            elif why in WHOLE_REASONS and "kept" in body:
                problems.append(f"seat {seat} rev {rev}: a {why} board relies on history the page held ({body['kept']})")
            rebuilt = page.take(kind, body)
            if rebuilt != state:
                problems.append(f"seat {seat} rev {rev}: the page rebuilt a board that is not the worker's"
                                + (" (it had to ask for a full board)" if rebuilt is None else ""))
            kept = last_any.setdefault(seat, {})
            kept[rev] = state
            for r in [r for r in kept if r != rev and len(kept) > 2]:
                kept.pop(r, None)
            frame["state"] = rebuilt if rebuilt is not None else state
            out.append(json.dumps(o))
        # The trace ended with a page still away: it comes back now.
        for seat in list(pending):
            resume(seat, pages[seat], rings, pending.pop(seat), streams, problems, counts)
    finally:
        mw.diff = _diff
    return [x if isinstance(x, str) else json.dumps(x) for x in out], problems, deltas, boards


def main(argv):
    if len(argv) != 2:
        sys.exit(__doc__)
    src, dst = Path(argv[0]), Path(argv[1])
    dst.mkdir(parents=True, exist_ok=True)
    files = sorted(src.glob("*.jsonl"))
    total, total_deltas, bad = 0, 0, []
    total_resumes, total_caught = 0, 0
    for f in files:
        lines = f.read_text(encoding="utf-8").splitlines()
        out, problems, deltas, boards = rewrite(lines, RESUME_EVERY)
        counts = rewrite.counts
        (dst / f.name).write_text("\n".join(out) + "\n", encoding="utf-8")
        total += boards
        total_deltas += sum(deltas.values())
        total_resumes += sum(counts["resumes"].values())
        total_caught += sum(counts["caught"].values())
        name = lambda s: "public" if s == 0 else f"seat {s}"
        streams = ", ".join(f"{name(s)} {n}" for s, n in sorted(deltas.items()))
        resumed = ", ".join(f"{name(s)} {n} ({counts['caught'].get(s, 0)} boards)"
                            for s, n in sorted(counts["resumes"].items()))
        print(f"{f.stem}: {boards} boards, deltas {streams or 'none'}; resumes {resumed or 'none'}")
        if boards and not deltas:
            problems.append("boards but no delta: the gate compared nothing (HID-004)")
        # HID-004 (spec 0119): a stream long enough to be cut that never was resumed.
        per = {}
        for line in lines:
            try:
                fr = json.loads(line).get("frame") or {}
            except ValueError:
                continue
            if fr.get("type") == "MATCH_SNAPSHOT":
                per[fr.get("seat")] = per.get(fr.get("seat"), 0) + 1
        for s, n in per.items():
            if n > RESUME_EVERY + MISSED and not counts["caught"].get(s):
                problems.append(f"{name(s)}: {n} boards and no catch-up board: the resume pass compared nothing (HID-004)")
        bad += [f"{f.name}: {p}" for p in problems]
    print(f"{len(files)} traces, {total} boards, {total_deltas} sent as deltas, {total_resumes} resumes "
          f"({total_caught} catch-up boards), rebuilt as the page does to {dst}")
    if bad:
        print(f"WRONG: {len(bad)} problem(s); first: {bad[0]}")
        return 1
    print("OK: every board rebuilt equals the worker's, every delta names only ids its two boards name")
    return 0


def fixture_problems(doc):
    """The shared fixture against this copy: each diff, each apply, each step sent, each rebuild."""
    problems = []
    boards = doc["boards"]
    for i, (a, b) in enumerate(zip(boards, boards[1:])):
        d = mw.diff(a, b)
        if d != doc["diffs"][i]:
            problems.append(f"diff {i} is not the fixture's")
        if mw.apply(a, d) != {k: v for k, v in b.items() if k not in mw.NOT_PATCHED}:
            problems.append(f"apply {i} does not make the next board")
    stream, page = mw.Stream(), mw.PageModel()
    for i, (board, (kind, body)) in enumerate(zip(boards, doc["sent"])):
        k, sent, _ = stream.step(board)
        if [k, sent] != [kind, body]:
            problems.append(f"sent {i} is not the fixture's")
        if page.take(kind, body) != board:
            problems.append(f"rebuilt {i} is not the board")
    return problems


def self_test():
    results = {}
    docs = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(FIXTURES.glob("*.json"))}
    results["three fixtures"] = sorted(docs) == ["big-combat", "hand-bounce", "karn-restart"]
    for name, doc in docs.items():
        problems = fixture_problems(doc)
        results[f"{name}: made and applied as the fixture says"] = not problems
        if problems:
            print(name, problems[:3])
    karn = docs.get("karn-restart", {})
    results["karn-restart: the new game's first board goes whole"] = "epoch" in karn.get("reasons", {})
    lists = [d.get("lists", {}) for doc in docs.values() for d in doc["diffs"]]
    results["the fixtures patch lists by item"] = any(lists)

    # Random boards: every rebuild exact.
    import random
    rnd = random.Random(117)
    ok = True
    for _ in range(300):
        def card(i):
            return {"id": f"card:{i}", "tapped": rnd.random() < 0.5, "n": rnd.randint(0, 3)}
        a = {"stateRevision": 1, "gameEpoch": 1, "turn": 1,
             "battlefield": [card(i) for i in rnd.sample(range(12), rnd.randint(0, 8))],
             "players": [{"seat": 1, "life": rnd.randint(1, 20)}, {"seat": 2, "life": 20}]}
        b = json.loads(json.dumps(a))
        b["stateRevision"] = 2
        bf = b["battlefield"]
        rnd.shuffle(bf) if rnd.random() < 0.3 else None
        if bf and rnd.random() < 0.5:
            bf.pop(rnd.randrange(len(bf)))
        if rnd.random() < 0.5:
            bf.insert(rnd.randint(0, len(bf)), card(20 + rnd.randint(0, 5)) | {"id": f"card:{40 + _}"})
        if bf and rnd.random() < 0.5:
            bf[0]["tapped"] = not bf[0]["tapped"]
        if rnd.random() < 0.3:
            b["players"][0]["life"] -= 1
        if rnd.random() < 0.2:
            b["extra"] = [1, 2]
        if rnd.random() < 0.2:
            del b["players"]
        d = mw.diff(a, b)
        if mw.apply(a, d) != b:
            ok = False
    results["300 random board pairs round-trip"] = ok

    # The planted faults, each on the fixtures' streams written as a trace (two seats and the public view).
    def trace():
        # One made-up game, both seats and the public view, round by round:
        # each seat's own hand, and an exiled card only seat 1 may see.
        lines = []
        for r in range(1, 9):
            for seat in (1, 2, 0):
                board = {"stateRevision": r, "gameEpoch": 1, "turn": 1, "seat": seat,
                         "battlefield": [{"id": "card:1", "tapped": r % 2 == 0},
                                         {"id": "card:2", "tapped": r % 3 == 0}],
                         "exile": ([{"id": "known:5", "name": "Opt"}] if seat == 1 else [])
                         + [{"id": "card:9", "name": "Bear"}],
                         "graveyard": [{"id": f"card:{100 + i}", "name": "Forest"} for i in range(20)],
                         "players": [{"seat": 1, "life": 20 - r}, {"seat": 2, "life": 20}]}
                if seat:
                    board["hand"] = [{"id": f"card:{10 * seat + i}"} for i in range(r % 3 + 1)]
                lines.append(json.dumps({"dir": "in", "frame": {"type": "MATCH_SNAPSHOT", "seat": seat,
                                                                 "state": board}}))
        return lines

    _, clean, deltas, _ = rewrite(trace())
    results["clean: no problem, deltas on every stream"] = not clean and set(deltas) == {0, 1, 2}
    # Spec 0119: the resume pass, clean, cuts every stream and rebuilds every board exactly.
    _, clean, _, _ = rewrite(trace(), 3)
    caught = rewrite.counts["caught"]
    results["resume, clean: no problem, catch-up boards on every stream"] = (
        not clean and set(caught) == {0, 1, 2})
    Plants.seat1_short = True
    _, clean, _, _ = rewrite(trace(), 3)
    Plants.seat1_short = False
    results["resume, not kept: today's whole board, no problem"] = (
        not clean and rewrite.counts["whole"].get(1, 0) > 0)
    for plant in ("resume_other_seat", "resume_public_seat1", "resume_any_seat", "catchup_first_delta"):
        setattr(Plants, plant, True)
        try:
            # The any-seat fault shows when seat 1's own list no longer reaches its
            # page's board (only the other seat's list has that revision).
            Plants.seat1_short = plant == "resume_any_seat"
            _, problems, _, _ = rewrite(trace(), 3)
        finally:
            setattr(Plants, plant, False)
            Plants.seat1_short = False
        results[f"planted, caught: {plant}"] = bool(problems)
    for plant in ("other_seat_base", "public_from_seat1", "drop_moved", "no_checkpoint_reset"):
        setattr(Plants, plant, True)
        try:
            lines = trace() if plant != "no_checkpoint_reset" else (
                [json.dumps({"dir": "in", "frame": {"type": "MATCH_SNAPSHOT", "seat": 2, "state": b}})
                 for b in docs["hand-bounce"]["boards"]])
            if plant == "drop_moved":
                # an item that only moved: the same card, last in place of first
                a = docs["big-combat"]["boards"][3]
                b = json.loads(json.dumps(a))
                b["stateRevision"] = a["stateRevision"] + 1
                b["battlefield"] = b["battlefield"][1:] + b["battlefield"][:1]
                lines = [json.dumps({"dir": "in", "frame": {"type": "MATCH_SNAPSHOT", "seat": 1, "state": x}})
                         for x in (a, b)]
            _, problems, _, _ = rewrite(lines)
        finally:
            setattr(Plants, plant, False)
        results[f"planted, caught: {plant}"] = bool(problems)
    print(json.dumps(results, indent=1))
    return 0 if all(results.values()) else 1


def planted(argv):
    """--plant <fault> <traces> <out>: the gate run with one fault planted (it must fail)."""
    setattr(Plants, argv[0], True)
    return main(argv[1:])


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        sys.exit(self_test())
    if sys.argv[1:2] == ["--plant"]:
        sys.exit(planted(sys.argv[2:]))
    sys.exit(main(sys.argv[1:]))
