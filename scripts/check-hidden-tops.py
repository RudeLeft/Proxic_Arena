"""Spec 0088 -- a library's top card and the gathered reports, over whole
games: nothing hidden on the wire (AGENTS HID-001, HID-003, HID-005).

    python -I scripts/check-hidden-tops.py <trace.jsonl>...

Reads worker protocol traces (every check-*.py script writes one) and
compares, round by round (one stateRevision), what each seat was sent:

  top        a library's top card (`libraryTop`) is sent to a seat other
             than its owner only when it is `public` (Courser of Kruphix's
             "play with the top card revealed"), or when Forge is showing
             that seat the very card in that round's question (Fact or
             Fiction's five, which the other player splits while they are
             still on top of the library); a top card only its owner may
             look at (Bolas's Citadel's) is sent to the owner alone; a top
             card is never sent to a seat that may not identify it
  top id     a top card's id never reaches a seat that was not sent that
             top card, under ANY key (a move, a payment, a play log line, a
             report): an id is a live handle on a card in a library
  reports    every card a report shows (`action.cards`, and each gathered
             report's), for every seat, carries the report's own id
             ("action:N:I"), never a card's; a card hidden from that seat
             carries nothing that names it (no name, picture, type, cost or
             numbers -- only that it is face down, whose, and where it went,
             in the snapshot's own anonymous shape: "Face-down", "unknown");
             the gathered reports are each their own (distinct keys), oldest
             first, all older than the one in full

Exit 0 when nothing leaked, 1 when something did, 2 when the traces held
no library top card and no gathered report to check.
"""
import json
import re
import sys
from collections import defaultdict

CARD = re.compile(r"card:\d+")
# What a card hidden from the reader may carry: that it is face down, whose,
# where it went -- and the snapshot's own anonymous card shape (describe():
# "Face-down", kind "unknown", its owner, when it arrived, tapped).
HIDDEN_KEYS = {"faceDown", "known", "seat", "owner", "id", "to", "toSaid", "enteredAt", "tapped", "name", "kind"}


def ids_in(node, skip=("libraryTop",)):
    found = set()

    def walk(n, key=None):
        if isinstance(n, dict):
            for k, v in n.items():
                if k not in skip:
                    walk(v, k)
        elif isinstance(n, list):
            for v in n:
                walk(v, key)
        elif isinstance(n, str) and CARD.fullmatch(n):
            found.add(n)

    walk(node)
    return found


def rounds(paths):
    """{(trace, revision): {seat: state}}, and {(trace, revision, seat): card ids
    Forge put in that seat's questions after that board (its options and the
    cards it is looking at), until that seat's next board."""
    out = defaultdict(dict)
    asked = defaultdict(set)
    for path in paths:
        last = {}
        for line in open(path, encoding="utf-8"):
            try:
                r = json.loads(line)
            except ValueError:
                continue
            f = r.get("frame") or {}
            if f.get("type") == "DECISION_REQUEST":
                seat = f.get("authorisedSeat")
                if seat in last:
                    ids = {o.get("objectId") for o in f.get("options") or []}
                    ids |= {c.get("id") for c in f.get("looking") or []}
                    asked[(path, last[seat], seat)] |= {i for i in ids if i}
                continue
            if f.get("type") != "MATCH_SNAPSHOT":
                continue
            s = f.get("state") or {}
            out[(path, s.get("stateRevision"))][f.get("seat")] = s
            last[f.get("seat")] = s.get("stateRevision")
    return out, asked


def main(paths):
    problems = []
    tops = gathered = cards = 0
    boards, asked = rounds(paths)
    for (path, rev), seats in boards.items():
        sent = {seat: {c.get("id"): c for c in (s.get("libraryTop") or [])} for seat, s in seats.items()}
        for seat, s in seats.items():
            for cid, c in sent[seat].items():
                tops += 1
                # Sent only to a seat that may see it: never as a nameless card
                # (that would be a hidden library card's id on the wire).
                if c.get("known") is not True:
                    problems.append(f"{path} r{rev}: seat {seat} sent a library top card it may not see ({cid})")
                owner = c.get("owner", c.get("seat"))
                shown = cid in asked.get((path, rev, seat), set())
                if owner != seat and not c.get("public") and not shown:
                    problems.append(f"{path} r{rev}: seat {seat} sent seat {owner}'s top card, not public, not asked about")
                if owner != seat and c.get("public") and owner in sent and cid not in sent[owner]:
                    problems.append(f"{path} r{rev}: seat {seat} sent a public top card its owner was not")
        all_tops = {cid for m in sent.values() for cid in m}
        for seat, s in seats.items():
            leaked = (ids_in(s) & all_tops) - set(sent[seat])
            for cid in sorted(leaked):
                problems.append(f"{path} r{rev}: seat {seat} named library top card {cid} it was not shown")
            a = s.get("action")
            if not a:
                continue
            rows = a.get("gathered") or []
            gathered += len(rows)
            keys = [r.get("key") for r in rows + [a]]
            if len(set(keys)) != len(keys):
                problems.append(f"{path} r{rev}: seat {seat}: two gathered reports share a key: {keys}")
            stamps = [r.get("stamp") or 0 for r in rows + [a]]
            if stamps != sorted(stamps) or len(set(stamps)) != len(stamps):
                problems.append(f"{path} r{rev}: seat {seat}: the window is not oldest first: {stamps}")
            for r in rows + [a]:
                if r is not a and r.get("gathered"):
                    problems.append(f"{path} r{rev}: seat {seat}: a gathered report gathers others")
                for c in r.get("cards") or []:
                    cards += 1
                    if not str(c.get("id", "")).startswith(f"{r.get('key')}:"):
                        problems.append(f"{path} r{rev}: seat {seat}: report card id {c.get('id')} is not the report's")
                    if c.get("known") is False and (set(c) - HIDDEN_KEYS or c.get("name", "Face-down") != "Face-down"
                                                    or c.get("kind", "unknown") != "unknown"):
                        problems.append(f"{path} r{rev}: seat {seat}: a hidden report card carries "
                                        f"{sorted(set(c) - HIDDEN_KEYS)} name {c.get('name')!r}")
                if CARD.search(json.dumps(r.get("cards") or [])):
                    problems.append(f"{path} r{rev}: seat {seat}: a report's cards name a card id")
    print(json.dumps({"library top cards sent": tops, "gathered reports": gathered, "report cards": cards,
                      "problems": problems[:40]}, indent=1))
    if problems:
        return 1
    return 0 if (tops or gathered) else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
