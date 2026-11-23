"""The shape of every board a seat is sent, over whole games -- PHASE_06
§6.41, §6.42, §6.46; AGENTS HID-001, HID-003. P11-B4 (2026-11-22).

    python -I scripts/check-hidden-information.py <trace.jsonl>...
    python -I scripts/check-hidden-information.py --self-test

Reads worker protocol traces (every check-*.py scenario writes one) and
holds, for EVERY board sent to every seat -- both players and the public
view (seat 0) -- the rules that need no other seat's board to check:

  own hand    `hand` is the viewer's own: every card in it is the viewer's
              (`seat` and `owner`), and the public view has no hand, no
              otherHands and no knownTop at all
  no lists    no board carries a library, and no player entry carries a
              hand, a library or a card list: only counts travel
              (`handCount`, `libraryCount`, `life`, each one present)
  no identity a card the viewer may not identify (`known` false), in ANY
              list of the board, is "Face-down" and carries only the public
              facts of a face-down card (UNKNOWN_KEYS: whose, where, tapped,
              in combat, its 2/2 and the like) -- never a printing, a cost,
              rules text, a base P/T, faces or a picture's owner. A new key
              on such a card fails here until someone decides it is public
  typed ids   every object a board lists has a typed id (§6.46): `card:` in
              the card lists, `stack:` on the stack, `known:` in knownTop,
              `copying:` in copying -- a bare number is no object
  revision    each seat's `stateRevision` never goes backwards (§6.41)

The rules that compare one seat's board with another's -- a card in the
other seat's hand, the library's top, the play log, the opening deal, the
question before its board -- are the other hidden checks'
(check-hidden-hands, check-hidden-tops, check-hidden-log,
check-hidden-mulligans, check-snapshot-first). Until P11-B4 this script
played its own 400-decision game (burn or green, the first option every
time) and checked only the battlefield and the hand; every Lab game's
trace is far wider, so it reads those instead.

A page receives the boards rewritten (P11-D3: history lists sent once;
P11-D4: deltas). `scripts/as-sent-traces.py` writes a trace folder again
as the page receives it, or as the page rebuilds it; every hidden check
reads either (P11-R4).

Exit 0 when every board held, 1 when one did not, 2 when the traces held no
boards (the check proved nothing, HID-004).
"""
import json
import sys

# The public facts of a card the viewer may not identify (RUN over the 1.75.0
# release run's 432 traces: face-down morphs and manifests on the battlefield
# or being cast, foretold and Gonti/hideaway cards in exile), and what a
# face-down permanent can publicly have on it.
UNKNOWN_KEYS = {
    "id", "known", "name", "seat", "owner", "kind", "types", "faceDown",
    "tapped", "sick", "attacking", "blocking", "damage", "enteredAt",
    "power", "toughness", "pairedWith", "foretold", "uses", "counters",
    "attachedTo", "attachedToPlayer", "phasedOut",
}
ID_PREFIX = {"stack": "stack:", "knownTop": "known:", "copying": "copying:"}
PRIVATE_LISTS = ("hand", "otherHands", "knownTop")


def card_lists(state):
    """Every top-level list in a board whose entries are objects with an id."""
    for key, value in state.items():
        if isinstance(value, list) and any(isinstance(c, dict) and "id" in c for c in value):
            yield key, [c for c in value if isinstance(c, dict)]


def board_problems(seat, state):
    """Everything wrong with one board sent to `seat` (0 = the public view)."""
    problems = []
    if state.get("seat") not in (None, seat):
        problems.append(f"seat {seat} was sent seat {state.get('seat')}'s board")

    for card in state.get("hand") or []:
        if seat == 0:
            break
        if card.get("seat") != seat or card.get("owner") != seat:
            problems.append(f"seat {seat}'s hand holds a card of seat {card.get('seat')}/owner "
                            f"{card.get('owner')}: {card.get('id')}")
    if seat == 0:
        for key in PRIVATE_LISTS:
            if state.get(key):
                problems.append(f"the public view was sent {key}")

    for forbidden in ("library", "libraries"):
        if forbidden in state:
            problems.append(f"seat {seat} was sent {forbidden} contents")
    for player in state.get("players") or []:
        for forbidden in ("hand", "library", "cards"):
            if forbidden in player:
                problems.append(f"seat {seat} was sent {forbidden} contents for seat {player.get('seat')}")
        for required in ("life", "handCount", "libraryCount"):
            if required not in player:
                problems.append(f"seat {seat}'s entry for seat {player.get('seat')} is missing {required}")

    for key, cards in card_lists(state):
        prefix = ID_PREFIX.get(key, "card:")
        for card in cards:
            if not str(card.get("id", "")).startswith(prefix):
                problems.append(f"seat {seat}: untyped id in {key}: {card.get('id')!r}")
            if card.get("known") is False:
                if card.get("name") not in (None, "Face-down"):
                    problems.append(f"seat {seat} was told the name of a card it may not see, in {key}: "
                                    f"{card.get('id')} {card.get('name')!r}")
                extra = sorted(set(card) - UNKNOWN_KEYS)
                if extra:
                    problems.append(f"seat {seat}: a card it may not see carries {extra}, in {key}: {card.get('id')}")
    return problems


def check(paths):
    problems, boards, cards, unknown = [], 0, 0, 0
    for path in paths:
        last = {}
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    o = json.loads(line)
                except ValueError:
                    continue
                frame = o.get("frame") or {}
                if o.get("dir") != "in" or frame.get("type") != "MATCH_SNAPSHOT":
                    continue
                seat = frame.get("seat")
                state = frame.get("state") or {}
                boards += 1
                for _, listed in card_lists(state):
                    cards += len(listed)
                    unknown += sum(1 for c in listed if c.get("known") is False)
                where = path.replace("\\", "/").rsplit("/", 1)[-1]
                problems += [f"{where}: {p}" for p in board_problems(seat, state)]
                revision = state.get("stateRevision")
                if revision is not None:
                    if seat in last and revision < last[seat]:
                        problems.append(f"{where}: seat {seat}'s revision went backwards: {last[seat]} -> {revision}")
                    last[seat] = revision
    return problems, {"traces": len(paths), "boards": boards, "cards": cards, "unknown cards": unknown}


def self_test():
    """Each rule on made-up boards: a clean board passes, each planted leak fails."""
    me = {"id": "card:1", "seat": 1, "owner": 1, "known": True, "name": "Island"}
    morph = {"id": "card:9", "seat": 2, "owner": 2, "known": False, "name": "Face-down",
             "kind": "creature", "types": "Creature", "power": 2, "toughness": 2, "faceDown": True}
    players = [{"seat": 1, "life": 20, "handCount": 1, "libraryCount": 50},
               {"seat": 2, "life": 20, "handCount": 0, "libraryCount": 50}]
    clean = {"seat": 1, "stateRevision": 5, "hand": [me], "battlefield": [morph],
             "stack": [{"id": "stack:3", "source": "card:9"}], "players": players}
    public = {"seat": 0, "stateRevision": 5, "battlefield": [morph], "players": players}

    def fails(viewer, **change):
        board = dict(clean if viewer else public, **change)
        return bool(board_problems(viewer, board))

    def theirs():
        return dict(me, id="card:2", seat=2, owner=2)

    results = {
        "a clean board passes": not board_problems(1, clean),
        "a clean public board passes": not board_problems(0, public),
        "the other seat's card in my hand fails": fails(1, hand=[me, theirs()]),
        "a stolen card in my hand (owner theirs) fails": fails(1, hand=[dict(me, owner=2)]),
        "a hand in the public view fails": fails(0, hand=[me]),
        "otherHands in the public view fails": fails(0, otherHands=[theirs()]),
        "a library list fails": fails(1, library=[me]),
        "a player's hand list fails": fails(1, players=[dict(players[0], hand=[me]), players[1]]),
        "a player without libraryCount fails": fails(1, players=[{"seat": 1, "life": 20, "handCount": 1}]),
        "an unknown card's name fails": fails(1, battlefield=[dict(morph, name="Willbender")]),
        "an unknown card's printing fails": fails(1, battlefield=[dict(morph, printing="LGN-58")]),
        "an unknown card in exile with a cost fails": fails(1, exile=[dict(morph, manaCost="{1}{U}")]),
        "an untyped card id fails": fails(1, battlefield=[dict(morph, id=9)]),
        "a card id on the stack fails": fails(1, stack=[{"id": "card:3"}]),
        "another seat's board fails": fails(1, seat=2),
    }
    import os
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        def run(revisions):
            p = os.path.join(tmp, "t.jsonl")
            with open(p, "w", encoding="utf-8") as f:
                for r in revisions:
                    board = dict(clean, stateRevision=r)
                    f.write(json.dumps({"dir": "in", "frame": {"type": "MATCH_SNAPSHOT", "seat": 1,
                                                               "state": board}}) + "\n")
            return check([p])[0]
        results["revisions going up pass"] = not run([3, 4, 4, 7])
        results["a revision going backwards fails"] = bool(run([3, 7, 6]))
    print(json.dumps(results, indent=1))
    return 0 if all(results.values()) else 1


def main(paths):
    if not paths:
        sys.exit(__doc__)
    problems, counts = check(paths)
    print(json.dumps(counts))
    if counts["boards"] == 0:
        print("INCONCLUSIVE: the traces held no boards")
        return 2
    if problems:
        print(f"WRONG: {len(problems)} problem(s)")
        for p in list(dict.fromkeys(problems))[:40]:
            print("  ", p)
        return 1
    print(f"OK: {counts['boards']} boards, {counts['cards']} cards ({counts['unknown cards']} the viewer may not "
          "see): every hand its viewer's own, only counts for libraries, nothing naming an unseen card, "
          "every id typed, no revision backwards")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if sys.argv[1:] == ["--self-test"] else main(sys.argv[1:]))
