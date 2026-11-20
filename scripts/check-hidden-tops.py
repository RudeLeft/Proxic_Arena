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
             report, or as text in Forge's own wording, "Name (48)", a stack
             entry's description): an id is a live handle on a card in a library
  known top  spec 0103: the cards a player put on top of its own library in
             its own order (`knownTop`) reach that player alone -- never the
             other seat, never the public view (seat 0) -- every one its own
             card, `known`, under a stand-in id ("known:SEAT:I", never a
             card's own: a library card's id is a live handle); and in a round
             that shuffled that library, it has none
  reports    every card a report shows (`action.cards`, and each gathered
             report's), for every seat, carries the report's own id
             ("action:N:I"), never a card's; a card hidden from that seat
             carries nothing that names it (no name, picture, type, cost or
             numbers -- only that it is face down, whose, and where it went,
             in the snapshot's own anonymous shape: "Face-down", "unknown");
             the gathered reports are each their own (distinct keys), oldest
             first, all older than the one in full
  table link spec 0103, items 1-2 (owner option A, 2026-11-18): a report card
             may carry `table`, the id of that card on the table -- only when
             the same snapshot's own board lists (battlefield, hand,
             otherHands, casting, graveyard, exile, command, libraryTop) hold
             that card, and never on a card hidden from the reader; any other
             card id in a report's cards is still a leak
  reasons    spec 0104: a question's `arrange.why` (why each card shown with
             it cannot be chosen: "mana value 1") names only cards in that
             question's own `looking`, each another seat's card the asked
             seat was shown (its last board's otherHands, seen, or Forge's delayed
             reveal in the prompt); no board, for any seat, carries such
             reasons (they travel with the question, to the chooser alone)

    python -I scripts/check-hidden-tops.py --self-test

checks the table-link rule itself on made-up boards: a link to a card on
the table passes; a link to a card in a library (in no board list) fails.

Exit 0 when nothing leaked, 1 when something did, 2 when the traces held
no library top card, no known top and no gathered report to check.
"""
import json
import re
import sys
from collections import defaultdict

CARD = re.compile(r"card:\d+")
# A card's id in Forge's wording: "Name (48)" -- a word, a space, the number.
TEXT_ID = re.compile(r"[\w'] \((\d+)\)")
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
        elif isinstance(n, str):
            # Forge's own wording names a card by its id as text ("Sensei's
            # Divining Top (48) - Look at..."): the same handle (2026-11-16).
            found.update(f"card:{m.group(1)}" for m in TEXT_ID.finditer(n))

    walk(node)
    return found


BOARD = ("battlefield", "hand", "otherHands", "casting", "graveyard", "exile", "command", "libraryTop")


def board_ids(state):
    """The ids of the cards a snapshot's own board lists hold (each entry's own id)."""
    return {c.get("id") for z in BOARD for c in (state.get(z) or []) if isinstance(c, dict)}


def report_problems(state, r):
    """What is wrong with one report's cards in [state] (a reader's snapshot)."""
    problems = []
    shown = board_ids(state)
    for c in r.get("cards") or []:
        if not str(c.get("id", "")).startswith(f"{r.get('key')}:"):
            problems.append(f"report card id {c.get('id')} is not the report's")
        if c.get("known") is False and (set(c) - HIDDEN_KEYS or c.get("name", "Face-down") != "Face-down"
                                        or c.get("kind", "unknown") != "unknown"):
            problems.append(f"a hidden report card carries {sorted(set(c) - HIDDEN_KEYS)} name {c.get('name')!r}")
        # Spec 0103 (owner option A): `table` only to a card this board shows.
        link = c.get("table")
        if link is not None and (link not in shown or c.get("known") is not True):
            problems.append(f"a report card links {link!r}, which this board does not show")
        rest = {k: v for k, v in c.items() if k != "table"}
        if CARD.search(json.dumps(rest)):
            problems.append("a report's cards name a card id")
    return problems


def why_problems(question, before):
    """Spec 0104 -- a question's `arrange.why` (why each shown card cannot be
    chosen) names only cards in the question's own `looking`, each another
    seat's card the asked seat was shown: in its last board's otherHands
    (Forge revealed it), or named in the question's prompt (Forge's delayed
    reveal, Castigate)."""
    why = (question.get("arrange") or {}).get("why")
    if not why:
        return []
    seat = question.get("authorisedSeat")
    looking = {c.get("id"): c for c in question.get("looking") or []}
    # Revealed to it (SeenHands marks them `seen`), not merely looked at for this very question.
    seen = {c.get("id") for c in (before or {}).get("otherHands") or [] if c.get("seen") is True}
    prompt = question.get("prompt") or ""
    problems = []
    for cid in why:
        c = looking.get(cid)
        if c is None:
            problems.append(f"a reason for {cid}, which the question does not show")
            continue
        if c.get("owner", c.get("seat")) == seat:
            problems.append(f"a reason for {cid}, the asked seat's own card")
        if cid not in seen and (c.get("name") or "\0") not in prompt:
            problems.append(f"a reason for {cid} ({c.get('name')}), a card Forge did not show seat {seat}")
    return problems


def self_test():
    """The table-link rule on made-up boards: on the table passes, in a library fails."""
    card = {"id": "action:1:0", "known": True, "name": "Island", "seat": 2, "to": "battlefield"}
    ok = {"battlefield": [{"id": "card:5"}]}
    good = report_problems(ok, {"key": "action:1", "cards": [dict(card, table="card:5")]})
    # A Brainstorm put back: the card is in a library -- in no board list.
    library = report_problems({"battlefield": []}, {"key": "action:1", "cards": [dict(card, table="card:30", to="top")]})
    hidden = report_problems(ok, {"key": "action:1", "cards": [
        {"id": "action:1:0", "known": False, "faceDown": True, "seat": 2, "table": "card:5"}]})
    stack = report_problems({"stack": [{"id": "stack:1", "source": "card:9"}]},
                            {"key": "action:1", "cards": [dict(card, table="card:9")]})
    # Spec 0104: a reason for a card Bob's hand showed Alice passes; for one it never showed, fails.
    bolt = {"id": "card:7", "owner": 2, "seat": 2, "name": "Lightning Bolt", "known": True}
    asked = {"authorisedSeat": 1, "prompt": "Exile ...", "looking": [bolt],
             "arrange": {"zone": "hand", "why": {"card:7": "mana value 1"}}}
    shown_ok = why_problems(asked, {"otherHands": [dict(bolt, seen=True)]})
    unshown = why_problems(asked, {"otherHands": [bolt]})
    results = {"on the table passes": not good, "a library card fails": bool(library),
               "a hidden card's link fails": bool(hidden), "a stack source fails": bool(stack),
               "a reason for a shown card passes": not shown_ok, "a reason for an unshown card fails": bool(unshown)}
    print(json.dumps(results, indent=1))
    return 0 if all(results.values()) else 1


def rounds(paths):
    """{(trace, revision): {seat: state}}, and {(trace, revision, seat): card ids
    Forge put in that seat's questions after that board (its options and the
    cards it is looking at), until that seat's next board."""
    out = defaultdict(dict)
    asked = defaultdict(set)
    WHY.clear()
    for path in paths:
        last = {}
        board = {}
        for line in open(path, encoding="utf-8"):
            try:
                r = json.loads(line)
            except ValueError:
                continue
            f = r.get("frame") or {}
            if f.get("type") == "DECISION_REQUEST":
                seat = f.get("authorisedSeat")
                # Spec 0104: the reasons sent with this question, against the board before it.
                if (f.get("arrange") or {}).get("why"):
                    WHY.append((path, f.get("stateVersion"), len(f["arrange"]["why"]),
                                why_problems(f, board.get(seat))))
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
            board[f.get("seat")] = s
    return out, asked


# Spec 0104: (trace, version, reasons, problems) for every question that sent reasons.
WHY = []


def reasons_in(node):
    """A reasons map (`why` holding card ids) anywhere in a board: never sent there."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "why" and isinstance(v, dict) and any(CARD.fullmatch(str(x)) for x in v):
                return True
            if reasons_in(v):
                return True
    elif isinstance(node, list):
        return any(reasons_in(v) for v in node)
    return False


def main(paths):
    problems = []
    tops = gathered = cards = known = 0
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
        for seat, s in seats.items():
            for c in s.get("knownTop") or []:
                known += 1
                owner = c.get("owner", c.get("seat"))
                if seat == 0 or owner != seat:
                    problems.append(f"{path} r{rev}: seat {seat} sent seat {owner}'s known library top ({c.get('name')})")
                if not str(c.get("id", "")).startswith(f"known:{seat}:"):
                    problems.append(f"{path} r{rev}: seat {seat}: a known top card carries id {c.get('id')!r}")
                if c.get("known") is not True:
                    problems.append(f"{path} r{rev}: seat {seat}: a known top card is not known")
            if s.get("knownTop") and seat in (s.get("shuffles") or []):
                problems.append(f"{path} r{rev}: seat {seat}: a known top survived its library's shuffle")
        all_tops = {cid for m in sent.values() for cid in m}
        for seat, s in seats.items():
            if reasons_in(s):
                problems.append(f"{path} r{rev}: seat {seat}: a board carries a question's reasons (why)")
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
                cards += len(r.get("cards") or [])
                problems.extend(f"{path} r{rev}: seat {seat}: {p}" for p in report_problems(s, r))
    reasons = 0
    for path, version, n, found in WHY:
        reasons += n
        problems.extend(f"{path} v{version}: {p}" for p in found)
    print(json.dumps({"library top cards sent": tops, "known top cards sent": known,
                      "gathered reports": gathered, "report cards": cards, "reasons sent (spec 0104)": reasons,
                      "problems": problems[:40]}, indent=1))
    if problems:
        return 1
    return 0 if (tops or gathered or known or reasons) else 2


if __name__ == "__main__":
    sys.exit(self_test() if sys.argv[1:] == ["--self-test"] else main(sys.argv[1:]))
