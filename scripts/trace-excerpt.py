"""Cut the part of a worker protocol trace that is the evidence.

    python -I scripts/trace-excerpt.py <trace.jsonl> <out.json> <start-pattern> <end-pattern> <card-name>...

A full trace is a whole game -- a megabyte, mostly lands. The
acceptance tests ask for a protocol trace OF THE THING, so this
keeps the frames from the first one matching <start-pattern> to the
first after it matching <end-pattern>, and trims every snapshot in
between to the cards named. Patterns are regular expressions over
the frame's JSON text.

The check scripts write the full trace; this is what gets committed.
"""
import json
import re
import sys

path, out_path, start, end, *names = sys.argv[1:]
wanted = set(names)


def trim(state):
    out = {k: state.get(k) for k in ("seat", "gameEpoch", "turn", "phase", "activeSeat", "notices", "players")}
    for zone in ("battlefield", "hand", "graveyard", "stack"):
        cards = [c for c in state.get(zone, []) if c.get("name") in wanted or zone == "stack"]
        if cards:
            out[zone] = cards
    return out


frames = [json.loads(line) for line in open(path, encoding="utf-8")]
keep, on = [], False
for entry in frames:
    text = json.dumps(entry["frame"])
    if not on and re.search(start, text):
        on = True
    if not on:
        continue
    frame = dict(entry["frame"])
    if frame.get("type") == "MATCH_SNAPSHOT":
        frame["state"] = trim(frame.get("state") or {})
    keep.append({"dir": entry["dir"], "frame": frame})
    if len(keep) > 1 and re.search(end, text):
        break

with open(out_path, "w", encoding="utf-8", newline="\n") as out:
    json.dump(keep, out, indent=1, ensure_ascii=False)
    out.write("\n")
print(f"{len(keep)} frames -> {out_path}")
