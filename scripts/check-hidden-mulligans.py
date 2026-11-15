"""Spec 0089 (F-0089-B) -- the opening hand and mulligans show the other
player card backs only, over whole games.

    python -I scripts/check-hidden-mulligans.py <trace.jsonl>...

Before the first turn each player is dealt seven, may sweep them back into
the library and be dealt seven again, and puts cards on the bottom. The page
deals, sweeps and puts back the other player's cards as backs (spec 0089
item 2), from the round's moves. Reads worker protocol traces (every
check-*.py script writes one) and holds, for every board sent before the
first turn, from BOTH seats (HID-003):

  backs       every move into or out of another seat's hand that this seat
              is told carries no card and no name -- a back going or coming --
              unless it lands face up in a public zone of that same board
              (a Leyline begun on the battlefield): counted as "revealed"
  no ids      no id of a card in another seat's hand (read from that seat's
              own board of the same round) appears anywhere in this seat's
              board, under any key (otherHands, Forge's own permission, is
              never sent before the game: it is checked to be empty)
  the same    this seat is told as many of the other seat's hand moves as
              that seat is told of its own: every back goes and comes
  own cards   the other half (HID-003): a seat's own deal names its own
              cards -- some move library -> its hand carries a card that is
              in its hand

Exit 0 when nothing leaked, 1 when something did, 2 when the traces held no
opening moves to check (the guard never fired, HID-004).
"""
import json
import re
import sys

CARD = re.compile(r'"(card:\d+)"')
# Zones every seat sees. A hand card moving into one of them, and shown
# there in the same board, is revealed: naming it is not a leak.
PUBLIC = ("battlefield", "graveyard", "exile", "stack", "casting")


def boards(path):
    """Each seat's boards sent before the first turn, in order."""
    out = {}
    for line in open(path, encoding="utf-8"):
        try:
            r = json.loads(line)
        except ValueError:
            continue
        f = r.get("frame") or {}
        if r.get("dir") != "in" or f.get("type") != "MATCH_SNAPSHOT":
            continue
        s = f.get("state") or {}
        if s.get("turn") != 0 or s.get("spectator"):
            continue
        out.setdefault(s.get("seat"), []).append(s)
    return out


def hand_moves(board, owner):
    return [m for m in board.get("moves") or []
            if (m["from"]["zone"] == "hand" and m["from"].get("seat") == owner)
            or (m["to"]["zone"] == "hand" and m["to"].get("seat") == owner)]


def main(paths):
    problems, checked, own_named, traces, revealed = [], 0, 0, 0, 0
    for path in paths:
        seats = boards(path)
        if len(seats) < 2:
            continue
        traces += 1
        by_rev = {seat: {b.get("stateRevision"): b for b in bs} for seat, bs in seats.items()}
        told = {}
        for viewer, bs in seats.items():
            for b in bs:
                rev = b.get("stateRevision")
                for other in seats:
                    if other == viewer:
                        continue
                    moves = hand_moves(b, other)
                    told[(viewer, other)] = told.get((viewer, other), 0) + len(moves)
                    public = set()
                    for key in PUBLIC:
                        public.update(c.get("id") for c in b.get(key) or [])
                    for m in moves:
                        checked += 1
                        if not (m.get("card") or m.get("name")):
                            continue
                        if m["to"]["zone"] in PUBLIC and m.get("card") in public:
                            # Revealed: it lands face up in this same board
                            # (a Leyline begun on the battlefield, CI a03a3db).
                            revealed += 1
                            continue
                        problems.append(f"{path}: seat {viewer} was told which card of seat {other}'s hand "
                                        f"moved: {m}")
                    theirs = by_rev.get(other, {}).get(rev)
                    if theirs:
                        hidden = {c["id"] for c in theirs.get("hand") or []}
                        leaked = (hidden - public) & set(CARD.findall(json.dumps(b)))
                        if leaked:
                            problems.append(f"{path}: seat {viewer}'s board (revision {rev}) names cards of seat "
                                            f"{other}'s hand: {sorted(leaked)[:4]}")
                    if b.get("otherHands"):
                        problems.append(f"{path}: seat {viewer} is shown another hand before the game: "
                                        f"{b['otherHands']}")
                # The other half: a seat's own deal names its own cards.
                mine = {c["id"] for c in b.get("hand") or []}
                own_named += sum(1 for m in hand_moves(b, viewer)
                                 if m["from"]["zone"] == "library" and m.get("card") in mine)
        for (viewer, other), n in told.items():
            own = told.get((other, other))
            if own is None:
                own = sum(len(hand_moves(b, other)) for b in seats[other])
            if n != own:
                problems.append(f"{path}: seat {viewer} was told {n} of seat {other}'s hand moves, seat {other} "
                                f"was told {own}")
    print(json.dumps({"traces": traces, "moves checked": checked, "own cards named": own_named,
                      "revealed": revealed}))
    if problems:
        for p in problems[:20]:
            print("WRONG:", p)
        return 1
    if checked == 0 or own_named == 0:
        print("INCONCLUSIVE: no opening hand moves to check")
        return 2
    print(f"OK: {checked} opening moves of the other player's hand over {traces} games, every one a back; "
          f"{own_named} of a seat's own deal named to it; {revealed} revealed face up in the same board")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
