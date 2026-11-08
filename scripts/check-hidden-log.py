"""Spec 0064 -- the play log names nothing a seat may not see, over whole games.

    python -I scripts/check-hidden-log.py <trace.jsonl>...

Reads worker protocol traces (every check-*.py scenario writes one) and,
for every `playLog` line a seat is sent, checks it against what that SAME
seat's own snapshots show -- the one place Forge's visibility has already
been applied (HID-001, HID-002):

  names     every card a line names is a name that seat's own snapshots
            have named by then (any zone, its own hand, otherHands, the
            stack, the card being cast, what Forge showed it in a reveal
            or a report) -- the log can't be the first to name a card
  ids       no card a line points at (`id`) is in another seat's hand at
            that revision, unless Forge let this seat see it (otherHands);
            no card the seat's own snapshot of that revision shows as
            unknown (face down to it) is named by a line
  timing    every line arrives in the snapshot of the revision it carries,
            never in an earlier one: the board shows the event first or
            with it (HID-005)
  seats     lines are numbered per seat without gaps, and a line is never
            sent to a spectator (seat 0)

Exit 0 when nothing leaked, 1 when something did, 2 when the traces held
no play log at all.
"""
import json
import sys
from collections import Counter

ZONES = ("hand", "battlefield", "graveyard", "exile", "stack", "otherHands", "casting")


def seen_names(state):
    names = set()
    for zone in ZONES:
        for c in state.get(zone, []) or []:
            if not isinstance(c, dict):
                continue
            if c.get("name") and c.get("name") != "Face-down" and (zone == "stack" or c.get("known", True)):
                names.add(c["name"])
            for part in c.get("merged", []) or []:
                if isinstance(part, dict) and part.get("name"):
                    names.add(part["name"])
    for key in ("reveal", "action"):
        shown = state.get(key) or {}
        for c in shown.get("cards", []) or []:
            if isinstance(c, dict) and c.get("name") and c.get("name") != "Face-down":
                names.add(c["name"])
    return names


def own_name(name):
    # A face-down card named to its controller: "Willbender (face down)" in a stack entry.
    return name[: -len(" (face down)")] if name.endswith(" (face down)") else name


def check(path, totals, problems):
    known = {}        # seat -> names its snapshots have named so far
    ids = {}          # seat -> card ids its snapshots have carried so far (zones and moves)
    numbers = {}      # seat -> last line number
    rounds = {}       # revision -> seat -> state
    for number, raw in enumerate(open(path, encoding="utf-8"), 1):
        entry = json.loads(raw)
        if entry.get("dir") != "in":
            continue
        frame = entry["frame"]
        if frame.get("type") != "MATCH_SNAPSHOT":
            continue
        state = frame.get("state") or {}
        seat = state.get("seat")
        rev = state.get("stateRevision")
        rounds.setdefault(rev, {})[seat] = state
        names = known.setdefault(seat, set())
        names.update(own_name(n) for n in seen_names(state))
        carried = ids.setdefault(seat, set())
        carried.update(c.get("id") for zone in ZONES for c in state.get(zone, []) or [] if isinstance(c, dict))
        carried.update(m.get("card") for m in state.get("moves", []) or [] if isinstance(m, dict))
        lines = state.get("playLog") or []
        if lines and (seat == 0 or state.get("spectator")):
            problems.append(f"{path}:{number}: a spectator's snapshot carries play log lines")
        unknown = {c.get("id") for zone in ZONES for c in state.get(zone, []) or []
                   if isinstance(c, dict) and c.get("known") is False}
        for line in lines:
            totals["lines"] += 1
            n = line.get("n")
            if numbers.get(seat) is not None and n != numbers[seat] + 1:
                problems.append(f"{path}:{number}: seat {seat} line {n} after {numbers[seat]}")
            numbers[seat] = n
            if line.get("rev") != rev:
                problems.append(f"{path}:{number}: seat {seat} line {n} carries rev {line.get('rev')}, "
                                f"sent in the snapshot of rev {rev}")
            for part in line.get("parts", []) or []:
                if not isinstance(part, dict) or not part.get("name"):
                    continue
                totals["cards named"] += 1
                if part["name"] not in names:
                    problems.append(f"{path}:{number}: seat {seat} line {n} names {part['name']!r}, which "
                                    f"no snapshot of seat {seat} has named: {line}")
                if part.get("id") in unknown:
                    problems.append(f"{path}:{number}: seat {seat} line {n} names {part.get('id')}, which "
                                    f"its own board shows face down to it: {line}")
            if line.get("private"):
                totals["private lines"] += 1
        # Ids against the other seats' hands, once the round is complete.
        for viewer, view in rounds[rev].items():
            for other, theirs in rounds[rev].items():
                if other == viewer or ("ids", rev, viewer, other) in totals["_done"]:
                    continue
                totals["_done"].add(("ids", rev, viewer, other))
                hand = {c.get("id") for c in theirs.get("hand", []) or []}
                allowed = {c.get("id") for c in view.get("otherHands", []) or []}
                for line in view.get("playLog") or []:
                    for part in line.get("parts", []) or []:
                        if isinstance(part, dict) and part.get("id") in hand - allowed:
                            # A card can be named publicly and then be in a hand by the
                            # time the round is sent (bounced in the same round): that
                            # line was written while it was public, and the board was
                            # sent the same id (its move). Only an id this seat's own
                            # snapshots never carried counts.
                            if part.get("id") not in ids.get(viewer, set()):
                                problems.append(f"{path}:{number}: seat {viewer} line {line.get('n')} points "
                                                f"at {part['id']}, in seat {other}'s hand: {line}")
                            else:
                                totals["named while public, in a hand by the round's end"] += 1


def main():
    totals, problems = Counter(), []
    totals["_done"] = set()
    for path in sys.argv[1:]:
        check(path, totals, problems)
    del totals["_done"]
    for key in sorted(totals):
        print(f"{key}: {totals[key]}")
    if not totals["lines"]:
        print("INCONCLUSIVE: no play log lines in the traces")
        sys.exit(2)
    if problems:
        for problem in problems[:20]:
            print("WRONG:", problem)
        print(f"WRONG: {len(problems)} problem(s)")
        sys.exit(1)
    print(f"OK: {totals['lines']} play log lines, {totals['cards named']} cards named, "
          f"each one a card that seat's own snapshots named")


main()
