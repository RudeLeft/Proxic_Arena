"""Every permanent has a row on the board, over whole games. PHASE_07 P7-C.

    python -I scripts/check-kinds.py <trace.jsonl>...

P7-C: "Every permanent type in the Mechanics Lab corpus has a defined
zone." The board places a permanent by the `kind` the worker sends --
creature, land or other, read from Forge's CURRENT characteristics
(§6.84, never the name) -- and a face-down permanent is "unknown", which
the board puts in the noncreature row (§7.10). So the test is over what
Forge actually put on battlefields, in every Mechanics Lab game:

  kind     every battlefield card in every snapshot, to both seats, has
           one of creature, land, other or (face down) unknown
  agrees   for a card whose type line the viewer is shown, the kind is
           the one that type line says: Creature -> creature, else
           Land -> land, else other -- including after a type changes
           (Blood Moon, an animated land, a reconfigured Equipment)

Exit 0 when every permanent had a row, 1 when one did not, 2 when the
traces held no battlefield at all.
"""
import json
import sys
from collections import Counter

ROWS = {"creature", "land", "other", "unknown"}


def expected(types):
    if "Creature" in types.split():
        return "creature"
    if "Land" in types.split():
        return "land"
    return "other"


def check(path, totals, problems, seen_names):
    for number, line in enumerate(open(path, encoding="utf-8"), 1):
        entry = json.loads(line)
        if entry.get("dir") != "in":
            continue
        frame = entry["frame"]
        if frame.get("type") != "MATCH_SNAPSHOT":
            continue
        for card in (frame.get("state") or {}).get("battlefield", []) or []:
            totals["battlefield sightings"] += 1
            kind = card.get("kind")
            if kind not in ROWS:
                problems.append(f"{path}:{number}: {card.get('name')!r} has no row (kind {kind!r})")
                continue
            types = card.get("types") or ""
            if kind == "unknown" or not types:
                totals["face down or unnamed"] += 1
                continue
            seen_names.add(card.get("name"))
            if kind != expected(types.replace("—", " ")):
                problems.append(f"{path}:{number}: {card.get('name')!r} is {kind!r} but its type line says "
                                f"{types!r}")
            else:
                totals[f"{kind} rows"] += 1


def main():
    totals, problems, names = Counter(), [], set()
    for path in sys.argv[1:]:
        check(path, totals, problems, names)
    for key in sorted(totals):
        print(f"{key}: {totals[key]}")
    print(f"distinct permanents seen: {len(names)}")
    if not totals["battlefield sightings"]:
        print("INCONCLUSIVE: no battlefield in the traces")
        sys.exit(2)
    if problems:
        for problem in problems[:20]:
            print("WRONG:", problem)
        print(f"WRONG: {len(problems)} permanent(s) without the row their type says")
        sys.exit(1)
    print(f"OK: {len(names)} different permanents, {totals['battlefield sightings']} sightings, each with "
          f"the row its current type line says")


main()
