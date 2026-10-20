"""No opponent's hand on the wire, over whole games. P6-G.

    python -I scripts/check-hidden-hands.py <trace.jsonl>...

PHASE_06 P6-G: "Opponent hand identities do not leak through:
snapshot, event, available actions, decision payload, asset URLs,
logs returned to browser." Required evidence: a run.

Reads worker protocol traces (every check-*.py script writes one) and
compares, round by round, what each seat was sent with what was in
every OTHER seat's hand at that moment -- read from that seat's own
snapshot of the same revision, the one place a hand is legitimately
named. A hidden card's id is never sent (an id on the wire is a card
that can be followed), so the test is by id:

  snapshot    no card in another seat's hand appears in this seat's
              snapshot, in any zone -- except `otherHands`, which is
              Forge's own permission (Mindslaver, a revealed hand)
  questions   no option offered to this seat names such a card
  events      no notice to this seat names a card that is ONLY in an
              opponent's hand: no copy of that name is anywhere this
              seat can see, and none was revealed to it

Asset URLs are attached by the server to cards a snapshot names, and
logs (the worker's stderr) are never sent to a browser at all; both
follow from the first line, and are held by MatchArtTest and the
routes respectively.

Exit 0 when nothing leaked, 1 when something did, 2 when the traces
held no hands to protect.
"""
import json
import re
import sys
from collections import Counter

CARD = re.compile(r"card:(\d+)")


def ids_in(node, skip=("otherHands",)):
    found = set()

    def walk(n):
        if isinstance(n, dict):
            value = n.get("id")
            if isinstance(value, str) and CARD.fullmatch(value):
                found.add(value)
            for key, child in n.items():
                if key not in skip:
                    walk(child)
        elif isinstance(n, list):
            for child in n:
                walk(child)

    walk(node)
    return found


def names_in(state):
    """Every card name this seat can see, anywhere -- including hands it was shown."""
    names = set()
    for zone in ("hand", "battlefield", "graveyard", "exile", "stack", "otherHands"):
        for c in state.get(zone, []) or []:
            if isinstance(c, dict) and c.get("name"):
                names.add(c["name"])
    return names


def check(path, totals, leaks):
    rounds = {}          # revision -> seat -> state
    latest = {}          # seat -> state
    revealed = {}        # seat -> names ever shown to it in otherHands
    for number, line in enumerate(open(path, encoding="utf-8"), 1):
        entry = json.loads(line)
        if entry.get("dir") != "in":
            continue
        frame = entry["frame"]
        kind = frame.get("type")
        if kind == "MATCH_SNAPSHOT":
            state = frame.get("state") or {}
            seat = state.get("seat")
            rev = state.get("stateRevision")
            rounds.setdefault(rev, {})[seat] = state
            latest[seat] = state
            revealed.setdefault(seat, set()).update(
                c.get("name") for c in state.get("otherHands", []) if c.get("name"))
            round_ = rounds[rev]
            # Compare every pair in the round, once both are in.
            for viewer, view in round_.items():
                for other, theirs in round_.items():
                    if other == viewer or (rev, viewer, other) in totals["_done"]:
                        continue
                    totals["_done"].add((rev, viewer, other))
                    hand = {c["id"] for c in theirs.get("hand", [])}
                    allowed = {c["id"] for c in view.get("otherHands", [])}
                    totals["snapshots compared"] += 1
                    totals["hand cards protected"] += len(hand)
                    for card in (ids_in(view) & hand) - allowed:
                        leaks.append(f"{path}:{number} rev {rev}: seat {viewer}'s snapshot carries "
                                     f"{card}, in seat {other}'s hand")
                    if viewer == view.get("seat"):
                        only_hidden = {c["name"] for c in theirs.get("hand", [])} \
                            - names_in(view) - revealed.get(viewer, set())
                        for text in view.get("notices", []):
                            for name in only_hidden:
                                if name and re.search(rf"\b{re.escape(name)}\b", text):
                                    leaks.append(f"{path}:{number} rev {rev}: seat {viewer} told "
                                                 f"{text!r}, naming {name} from seat {other}'s hand")
            continue
        if kind != "DECISION_REQUEST":
            continue
        seat = frame["authorisedSeat"]
        totals["questions"] += 1
        view = latest.get(seat, {})
        allowed = {c["id"] for c in view.get("otherHands", [])}
        for other, theirs in latest.items():
            if other == seat:
                continue
            hand = {c["id"] for c in theirs.get("hand", [])}
            for option in frame.get("options", []):
                for n in CARD.findall(option.get("actionId") or ""):
                    card = f"card:{n}"
                    if card in hand and card not in allowed:
                        leaks.append(f"{path}:{number} decision {frame.get('decisionId')} "
                                     f"({frame.get('kind')}) to seat {seat} offers {card} "
                                     f"from seat {other}'s hand: {option.get('label')!r}")


def main():
    totals, leaks = Counter(), []
    totals["_done"] = set()
    for path in sys.argv[1:]:
        check(path, totals, leaks)
    del totals["_done"]
    for key in sorted(totals):
        print(f"{key}: {totals[key]}")
    if not totals["hand cards protected"]:
        print("INCONCLUSIVE: no hands in the traces")
        sys.exit(2)
    if leaks:
        for leak in leaks[:20]:
            print("WRONG:", leak)
        print(f"WRONG: {len(leaks)} leak(s)")
        sys.exit(1)
    print(f"OK: {totals['hand cards protected']} hand-card sightings, compared round by round, "
          f"and no other seat was sent one it was not shown by Forge")


main()
