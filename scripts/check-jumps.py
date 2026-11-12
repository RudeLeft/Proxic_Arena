"""Phase 10 -- the "nothing jumps" check (P10-R1), kept from A-01's audit.

    python -I scripts/check-jumps.py <Lab traces dir> <recordings dir>

Reads the frame recordings frontend/tools/jumps/jumps.spec.ts made of the
same traces, follows each CARD (whatever element draws it: on the table, in
a hand, being cast, its flight, its stack entry, a leaving ghost) frame by
frame, board to board, and lists what the game says happened against what
was drawn: a card that jumped (one frame covering most of a long path),
popped in or faded in on the spot, blinked out, changed form with no
animation, or moved without being shown at all. Writes
<recordings>/report2.json and prints a summary by kind of move.

Each kind found was confirmed by eye at a tenth of the speed in A-01 (the
spec's JUMPS_CLIPS mode); a new kind needs the same look before it is
believed."""
import glob
import json
import math
import os
import sys
from collections import Counter, defaultdict

AUDIT, REC = sys.argv[1], sys.argv[2]
VISIBLE = 0.15
HANDOVER = 12


def boards(trace, seat):
    out, prev = [], None
    for line in open(os.path.join(AUDIT, trace), encoding="utf-8"):
        try:
            r = json.loads(line)
        except ValueError:
            continue
        f = r.get("frame") or {}
        if f.get("type") != "MATCH_SNAPSHOT" or f.get("seat") != seat:
            continue
        s = f["state"]
        sig = json.dumps([s.get(k) for k in ("battlefield", "hand", "graveyard", "exile", "stack", "otherHands", "casting")]
                         + [[p.get("life"), p.get("handCount"), p.get("libraryCount"), p.get("poison"), p.get("counters")] for p in s["players"]],
                         sort_keys=True)
        if sig == prev:
            continue
        prev = sig
        out.append(s)
    return out


def where(s):
    at = {}
    for c in s.get("battlefield") or []:
        at[c["id"]] = {"zone": "battlefield", "seat": c.get("seat"), "name": c.get("name"), "down": c.get("faceDown"),
                       "tapped": c.get("tapped"), "token": c.get("token"), "on": c.get("attachedTo")}
    for z in ("casting", "hand", "graveyard", "exile"):
        for c in s.get(z) or []:
            at.setdefault(c["id"], {"zone": z, "seat": c.get("seat"), "name": c.get("name"), "down": c.get("faceDown"),
                                    "token": c.get("token")})
    for e in s.get("stack") or []:
        if e.get("kind") == "spell" and e.get("source"):
            at.setdefault(e["source"], {"zone": "stack", "seat": e.get("controller"), "name": e.get("name")})
    return at


def events(a, b):
    A, B = where(a), where(b)
    ev = []
    for i, x in A.items():
        y = B.get(i)
        if y is None:
            ev.append((f"{x['zone']}->{'nowhere (token)' if x.get('token') else 'hidden (library or a hand)'}", i, x["name"]))
        elif y["zone"] != x["zone"]:
            ev.append((f"{x['zone']}->{y['zone']}", i, y["name"]))
        elif x["zone"] == "battlefield":
            if x["seat"] != y["seat"]:
                ev.append(("battlefield: changed sides", i, y["name"]))
            if x["name"] != y["name"] or x["down"] != y["down"]:
                ev.append(("battlefield: changed form", i, f"{x['name']} -> {y['name']}"))
            if x.get("on") != y.get("on"):
                ev.append(("battlefield: attached/unattached", i, y["name"]))
    for i, y in B.items():
        if i not in A:
            src = "new token or copy" if y.get("token") else "hidden (library or a hand)"
            ev.append((f"{src}->{y['zone']}", i, y["name"]))
    left = [e for e in ev if e[0].startswith("battlefield->")]
    if len(left) >= 3:
        ev.append(("many left the battlefield at once", "", f"{len(left)}"))
    return ev


def thing_of(key, stack_card):
    k = key.split("#")[0]
    if k.startswith("player:") or k == "__gap":
        return None
    for p in ("ghost:", "flight:", "cast:"):
        if k.startswith(p):
            k = k[len(p):]
    if k.startswith("stack:"):
        return stack_card.get(k) or k
    return k


def handed_over(th, points, *frames):
    """Spec 0072 -- a card back of a hidden hand that appears or goes where,
    at that very frame, another card is drawn (within HANDOVER px): one back
    handed over to another element at the same spot, not a pop or a blink.
    The backs of a hidden hand are anonymous by design (no hidden id: the
    page numbers them by place), so when the other player casts from the
    middle of the fan, the backs after it close the gap and the LAST number
    is the one that goes; and their cancelled spell lands on the fan's new
    last back, taking over from it in one frame (the flight goes and the
    back is drawn in the same frame, so the frame before is read too). Only
    hand-overs to or from a hidden-hand back are excused."""
    mine = str(th).startswith("hidden-hand:")
    return any(other != th and (mine or str(other).startswith("hidden-hand:"))
               and math.hypot(a[0] - b[0], a[1] - b[1]) <= HANDOVER
               for seen in frames for other, pts in seen.items() for a in pts for b in points)


def analyse(file, trace, seat):
    mine = boards(trace + ".jsonl", seat)
    rows = defaultdict(list)
    for line in open(file, encoding="utf-8"):
        try:
            r = json.loads(line)
        except ValueError:
            continue
        rows[int(r["m"] or 0)].append(r)
    stack_card = {}
    for s in mine:
        for e in s.get("stack") or []:
            if e.get("kind") == "spell" and e.get("source"):
                stack_card[e["id"]] = e["source"]
    cur = {}  # element key -> last row
    out = []
    for i in range(len(mine)):
        rs = sorted(rows.get(i, []), key=lambda r: r["t"])
        ev = events(mine[i - 1], mine[i]) if i else []
        A = where(mine[i - 1]) if i else {}
        B = where(mine[i])
        names = {e[1]: e[2] for e in ev}
        gaps = {r["t"] for r in rs if r["id"] == "__gap"}

        def vis():
            pts = defaultdict(list)
            for k, r in cur.items():
                t = thing_of(k, stack_card)
                if t and r.get("o", 0) >= VISIBLE:
                    pts[t].append((r["x"], r["y"], r["o"], k))
            return pts

        before = vis()
        first_seen = {}
        steps = defaultdict(list)
        path = Counter()
        appeared = {}
        vanished = {}
        frames = []
        by_t = defaultdict(list)
        for r in rs:
            if r["id"] != "__gap":
                by_t[r["t"]].append(r)
        prev = before
        for t in sorted(by_t):
            gone_here = []
            new_here = []
            for r in by_t[t]:
                if r.get("gone"):
                    if r["id"] in cur:
                        gone_here.append(cur.pop(r["id"]))
                else:
                    if r["id"] not in cur:
                        new_here.append(r)
                    cur[r["id"]] = r
            now = vis()
            for th in set(prev) | set(now):
                p, q = prev.get(th, []), now.get(th, [])
                if p and q:
                    d = min(math.hypot(a[0] - b[0], a[1] - b[1]) for a in p for b in q)
                    path[th] += d
                    if d > 0:
                        # Spec 0074 -- a hidden-hand back taking the place of
                        # the back two or more along when several leave the
                        # middle of the fan (their discards): the backs are
                        # anonymous, so the one numbered k is drawn from where
                        # the back after the gap was, while the cards leaving
                        # are drawn where it was. Handed over at both ends in
                        # that very frame, as handed_over() reads a pop.
                        swapped = (str(th).startswith("hidden-hand:") and handed_over(th, q, prev)
                                   and handed_over(th, p, now))
                        steps[th].append((d, t, t in gaps or swapped))
                elif q and not p:
                    if not handed_over(th, q, now, prev):
                        appeared.setdefault(th, (t, q))
                elif p and not q:
                    if handed_over(th, p, now, prev):
                        vanished.pop(th, None)
                    else:
                        vanished[th] = (t, p)
            prev = now
        found = []
        for th, ss in steps.items():
            for d, t, gap in ss:
                if d > 100 and d > 0.5 * path[th] and not gap:
                    found.append(("jumped", th, f"{round(d)} px in one frame"))
                    break
        for th, (t, q) in appeared.items():
            if th in before:
                continue
            settled_moves = path[th]
            o = max(x[2] for x in q)
            in_a = A.get(th, {}).get("zone") == "battlefield" and B.get(th, {}).get("zone") == "battlefield"
            if settled_moves < 20 and not in_a:
                if o >= 0.9:
                    found.append(("popped in", th, f"at full strength, no movement ({q[0][3]})"))
                else:
                    found.append(("faded in on the spot", th, f"came from nowhere ({q[0][3]})"))
        for th, (t, p) in vanished.items():
            if th in prev:
                continue
            o = max(x[2] for x in p)
            still = B.get(th, {}).get("zone") == "battlefield"
            if o >= 0.5 and not still:
                found.append(("blinked out", th, f"gone at {round(o * 100)}% strength ({p[0][3]})"))
        # A move the player never sees at all: no element drew the card
        # at any moment of the change (a mill, a discard, a card exiled
        # from a graveyard) -- only a pile's number changed.
        seen_any = set(before) | set(appeared) | set(vanished) | set(steps) | set(vis())
        for e in ev:
            if e[1] and "->" in e[0] and e[1] not in seen_any and e[0] != "hidden (library or a hand)->hand":
                found.append(("not shown at all", e[1], e[0]))
        for e in ev:
            if e[0] == "battlefield: changed form" and path[e[1]] < 5:
                found.append(("changed form, no animation", e[1], e[2]))
        out.append({"board": i, "events": ev, "found": found, "names": names, "dropped": len(gaps)})
    return out


summary = defaultdict(Counter)
examples = defaultdict(list)
report = []
for file in sorted(glob.glob(os.path.join(REC, "*.seat*.jsonl"))):
    name = os.path.basename(file)
    trace, seat = name.rsplit(".seat", 1)
    seat = int(seat.split(".")[0])
    for b in analyse(file, trace, seat):
        for kind, _, _ in b["events"]:
            summary[kind]["boards"] += 1
        for prob, th, detail in b["found"]:
            kinds = [e[0] for e in b["events"] if e[1] == th] or ["(nothing changed in the game: layout only)"]
            # Starting your own cast rises from the card you clicked; the
            # replay clicks nothing, so the page can't know which.
            kinds = [k + " (own cast: replay can't click, check live)" if k == "hand->casting" else k for k in kinds]
            for k in kinds:
                summary[k][prob] += 1
                ex = examples[(k, prob)]
                if len(ex) < 8:
                    ex.append({"trace": trace, "seat": seat, "board": b["board"], "card": b["names"].get(th, th), "detail": detail})
        report.append({"trace": trace, "seat": seat, **b})

json.dump({"boards": report, "summary": {k: dict(v) for k, v in summary.items()},
           "examples": {f"{k[0]} | {k[1]}": v for k, v in examples.items()}},
          open(os.path.join(REC, "report2.json"), "w", encoding="utf-8"), indent=1)
for k, v in sorted(summary.items(), key=lambda kv: -kv[1]["boards"]):
    print(f"{k:44} {dict(v)}")
