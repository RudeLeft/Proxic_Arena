"""Spec 0083 -- the polish items the worker tells the page (Mechanics Lab,
Layer B).

    python -I scripts/check-polish.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is its own small game; what it checks is read from the
snapshots both seats were sent (protocol/README.md), never inferred:

  hit           Shock at Bob's Hill Giant (it survives, damaged), then
                Lightning Bolt at Bob: the round's damage wave names the
                Giant (a spell's hit, not combat's) and Bob's shield; the
                page cracks both (F-0083-A)
  leeches       Alice's Glistener Elves give Bob poison counters; she casts
                Leeches at Bob: his poison goes to 0 and he takes that much
                damage, in both seats' boards (F-0083-D)
  chancellor    Bob reveals Chancellor of the Annex from his opening hand:
                Alice is shown it in the report window (`reveal`: by Bob,
                from Chancellor of the Annex, one sentence, the card), not
                a grey "Looking at ..." notice; Bob is told nothing
                (F-0083-E)
  split-second  Sudden Shock at Bob's Grizzly Bears: its stack entry says
                `splitSecond`, never `cantBeCountered`, to both seats
                (F-0083-F)
  uncounterable Abrupt Decay at Bob's Grizzly Bears: its stack entry says
                `cantBeCountered`, never `splitSecond`, to both seats
                (F-0083-F)

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
BEARS = [("Forest", 30), ("Grizzly Bears", 30)]
BEARS_DEAL = {"hand": ["Forest"] * 3 + ["Grizzly Bears"] * 4, "top": ["Forest", "Grizzly Bears"] * 4}


def game(name, seat1, seat2=BEARS, deal=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"polish-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal)


class Watch:
    """Every snapshot each seat was sent, once each, in order."""

    def __init__(self, g):
        self.g = g
        self.seen = {1: {}, 2: {}}

    def see(self):
        for seat in (1, 2):
            s = self.g.state.get(seat)
            if s and s.get("stateRevision") not in self.seen[seat]:
                self.seen[seat][s.get("stateRevision")] = s

    def boards(self, seat):
        return list(self.seen[seat].values())


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def player(s, seat):
    return next((p for p in (s or {}).get("players", []) if p.get("seat") == seat), {})


def poison(s, seat):
    return next((c.get("count", 0) for c in player(s, seat).get("counters", []) or []
                 if (c.get("name") or "").upper() == "POISON"), 0)


def cast(g, f, name, seat=1):
    """The option casting `name` from `seat`'s hand, when it can be paid."""
    return next((o["actionId"] for o in f["options"]
                 if o.get("payable") is not False and "Play land" not in (o.get("label") or "")
                 and any(c.get("id") == card_of(o.get("actionId")) and c.get("name") == name
                         for c in g.zone(seat, "hand"))), None)


def target(f, ref):
    return next((o["actionId"] for o in f.get("options", []) if o.get("objectId") == ref), None)


# --- the scenarios ----------------------------------------------------------


def hit():
    """Shock at the Hill Giant (survives), then Lightning Bolt at Bob."""
    g = game("hit", [("Mountain", 30), ("Shock", 15), ("Lightning Bolt", 15)], [("Mountain", 30), ("Hill Giant", 30)],
             deal={1: {"hand": ["Mountain", "Mountain", "Shock", "Lightning Bolt", "Mountain", "Mountain", "Mountain"],
                       "top": ["Mountain"] * 6},
                   2: {"hand": ["Mountain"] * 4 + ["Hill Giant"] * 3, "top": ["Mountain"] * 6}})
    w = Watch(g)
    st = {"shocked": None, "bolted": False}

    def giant(g):
        return next((c for c in g.zone(1, "battlefield", owner=2) if c.get("name") == "Hill Giant"), None)

    def policy(g, f):
        seat = f["authorisedSeat"]
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 2:
                return cast(g, f, "Hill Giant", 2) if not g.zone(2, "stack") else None
            if g.zone(1, "stack"):
                return None
            hg = giant(g)
            if hg and st["shocked"] is None:
                o = cast(g, f, "Shock")
                if o:
                    st["shocked"] = hg["id"]
                    return o
            if st["shocked"] and not st["bolted"] and (hg or {}).get("damage"):
                o = cast(g, f, "Lightning Bolt")
                if o:
                    st["bolted"] = True
                    return o
            return None
        if kind == "chooseTargetsFor" and seat == 1:
            want = "player:2" if st["bolted"] else st["shocked"]
            return target(f, want) or DEFAULT
        return DEFAULT

    def until(g):
        w.see()
        return st["bolted"] and all(any(h.get("target") == {"player": 2}
                                        for s in w.boards(seat) for h in ((s.get("damage") or {}).get("hits") or []))
                                    for seat in (1, 2))

    g.run(policy, until=until, max_turn=24)
    w.see()
    hits = {seat: [h for s in w.boards(seat) for h in ((s.get("damage") or {}).get("hits") or [])] for seat in (1, 2)}
    waves = [s.get("damage") for s in w.boards(1) if s.get("damage")]
    found = {"shocked": st["shocked"], "bolted": st["bolted"], "hits": hits[1],
             "combat": [wv.get("combat") for wv in waves], "stopped": g.stopped_badly()}
    if not st["shocked"] or not st["bolted"]:
        return "inconclusive", "the Shock and the Bolt were never both cast", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        if not any(h.get("target") == {"object": st["shocked"]} and h.get("amount") == 2 for h in hits[seat]):
            problems.append(f"seat {seat}: the Shock's 2 on the Hill Giant is not in a damage wave: {hits[seat]}")
        if not any(h.get("target") == {"player": 2} and h.get("amount") == 3 for h in hits[seat]):
            problems.append(f"seat {seat}: the Bolt's 3 at Bob is not in a damage wave: {hits[seat]}")
    if any(c for c in found["combat"]):
        problems.append(f"a spell's damage wave is not combat's: {found['combat']}")
    if not giant(g):
        problems.append("the Hill Giant should have survived the Shock")
    return result(problems, "Shock at the Hill Giant and Bolt at Bob: both a spell's hit, told to both seats", found)


def leeches():
    """Alice's Elves poison Bob; then Leeches at Bob."""
    g = game("leeches", [("Forest", 14), ("Plains", 16), ("Glistener Elf", 15), ("Leeches", 15)], [("Island", 60)],
             deal={1: {"hand": ["Forest", "Glistener Elf", "Glistener Elf", "Plains", "Plains", "Leeches", "Plains"],
                       "top": ["Forest", "Plains", "Forest", "Plains", "Forest", "Plains"]}})
    w = Watch(g)
    st = {"cast": False, "before": None}

    def policy(g, f):
        seat = f["authorisedSeat"]
        kind = f.get("kind")
        if seat == 2:
            return DEFAULT
        s = g.state.get(1) or {}
        if kind == "declareAttackers":
            if poison(s, 2) >= 2:
                return None
            attacking = {c["id"] for c in g.mine(1) if c.get("attacking")}
            return next((o["actionId"] for o in f["options"] if o["actionId"].startswith("attacker:")
                         and card_of(o["actionId"]) not in attacking), None)
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f, prefer="Plains" if len(g.mine(1, name="Plains")) < 3 else None)
            if land:
                return land
            if s.get("stack"):
                return None
            if poison(s, 2) >= 2 and not st["cast"]:
                o = cast(g, f, "Leeches")
                if o and len(g.untapped_lands(1, name="Plains")) >= 2 and len(g.untapped_lands(1)) >= 3:
                    st["cast"] = True
                    st["before"] = {"poison": poison(s, 2), "life": player(s, 2).get("life")}
                    return o
            if poison(s, 2) < 2:
                return cast(g, f, "Glistener Elf")
            return None
        if kind == "chooseTargetsFor":
            return target(f, "player:2") or DEFAULT
        return DEFAULT

    def until(g):
        w.see()
        return st["cast"] and all(poison(g.state.get(seat), 2) == 0 for seat in (1, 2)) \
            and all(not (g.state.get(seat) or {}).get("stack") for seat in (1, 2))

    g.run(policy, until=until, max_turn=30)
    w.see()
    after = {seat: {"poison": poison(g.state.get(seat), 2), "life": player(g.state.get(seat), 2).get("life")}
             for seat in (1, 2)}
    found = {"before": st["before"], "after": after, "stopped": g.stopped_badly()}
    if not st["cast"]:
        return "inconclusive", "Leeches was never cast at a poisoned Bob", found
    problems = [found["stopped"]] if found["stopped"] else []
    n = st["before"]["poison"]
    for seat in (1, 2):
        if after[seat]["poison"] != 0:
            problems.append(f"seat {seat}: Bob still has poison {after[seat]['poison']}")
        if after[seat]["life"] != st["before"]["life"] - n:
            problems.append(f"seat {seat}: Bob's life should be {st['before']['life'] - n}: {after[seat]['life']}")
    return result(problems, f"Leeches: Bob's {n} poison counters removed, {n} damage dealt, in both seats' boards", found)


def chancellor():
    """Bob reveals Chancellor of the Annex from his opening hand."""
    g = game("chancellor", [("Plains", 60)], [("Plains", 30), ("Chancellor of the Annex", 30)],
             deal={2: {"hand": ["Chancellor of the Annex", "Plains", "Plains", "Plains", "Plains", "Plains", "Plains"]}})
    w = Watch(g)
    st = {"offered": [], "taken": False}

    def policy(g, f):
        if f.get("kind") == "chooseSaToActivateFromOpeningHand":
            st["offered"].append((f["authorisedSeat"], [o.get("label") for o in f.get("options", [])]))
            if f["authorisedSeat"] == 2 and not st["taken"]:
                o = next((o["actionId"] for o in f.get("options", []) if "Chancellor" in (o.get("label") or "")), None)
                if o:
                    st["taken"] = True
                    return o
            return None
        return DEFAULT

    def until(g):
        w.see()
        return g.turn >= 2

    g.run(policy, until=until, max_turn=3)
    w.see()
    reveals = {seat: [s["reveal"] for s in w.boards(seat) if s.get("reveal")] for seat in (1, 2)}
    looking = {seat: [n for n in g.notices.get(seat, []) if "Looking at" in n or "Chancellor" in n] for seat in (1, 2)}
    shown = [r for r in reveals[1] if any((c.get("name") or "") == "Chancellor of the Annex" for c in r.get("cards", []))]
    found = {"offered": st["offered"], "taken": st["taken"], "reveals": {k: v[:3] for k, v in reveals.items()},
             "notices": looking, "stopped": g.stopped_badly()}
    if not st["taken"]:
        return "inconclusive", "Bob was never offered the Chancellor's reveal", found
    problems = [found["stopped"]] if found["stopped"] else []
    if looking[1]:
        problems.append(f"Alice was told in a grey notice: {looking[1]}")
    if not shown:
        problems.append(f"Alice was never shown the Chancellor in the report window: {reveals[1][:3]}")
    else:
        r = shown[0]
        if r.get("by") != 2 or r.get("source") != "Chancellor of the Annex" or not r.get("said"):
            problems.append(f"the report should say who (Bob), what (the Chancellor) and one sentence: {r}")
    if any(any((c.get("name") or "") == "Chancellor of the Annex" for c in r.get("cards", [])) for r in reveals[2]):
        problems.append("Bob was shown his own reveal")
    return result(problems, "the Chancellor's opening-hand reveal reaches Alice's report window, no grey notice", found)


def stack_marks(name, seat1, deal, card):
    """[card] cast at Bob's Grizzly Bears: each seat's stack entries for it."""
    g = game(name, seat1, BEARS, deal={1: deal, 2: BEARS_DEAL})
    w = Watch(g)
    st = {"cast": False}

    def policy(g, f):
        seat = f["authorisedSeat"]
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 2:
                return next((o["actionId"] for o in f["options"] if o.get("payable") is not False
                             and any(c.get("id") == card_of(o.get("actionId")) and c.get("name") == "Grizzly Bears"
                                     for c in g.zone(2, "hand"))), None) if not g.zone(2, "stack") else None
            bears = [c for c in g.zone(1, "battlefield", owner=2) if c.get("name") == "Grizzly Bears"]
            if bears and not st["cast"] and not g.zone(1, "stack"):
                o = cast(g, f, card)
                if o:
                    st["cast"] = True
                    st["at"] = bears[0]["id"]
                    return o
            return None
        if kind == "chooseTargetsFor" and seat == 1:
            return target(f, st.get("at")) or DEFAULT
        return DEFAULT

    def until(g):
        w.see()
        return st["cast"] and any(e.get("name") == card for s in w.boards(2) for e in s.get("stack") or []) \
            and not (g.state.get(1) or {}).get("stack")

    g.run(policy, until=until, max_turn=20)
    w.see()
    entries = {seat: [e for s in w.boards(seat) for e in s.get("stack") or [] if e.get("name") == card]
               for seat in (1, 2)}
    others = {seat: [e for s in w.boards(seat) for e in s.get("stack") or [] if e.get("name") != card]
              for seat in (1, 2)}
    return g, st, entries, others


def split_second():
    g, st, entries, others = stack_marks(
        "split-second", [("Mountain", 30), ("Sudden Shock", 30)],
        {"hand": ["Mountain", "Mountain", "Sudden Shock", "Mountain", "Sudden Shock", "Mountain", "Mountain"],
         "top": ["Mountain"] * 6}, "Sudden Shock")
    found = {"entries": {k: v[:2] for k, v in entries.items()}, "stopped": g.stopped_badly()}
    if not st["cast"] or not entries[1] or not entries[2]:
        return "inconclusive", "Sudden Shock never reached the stack", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        if not all(e.get("splitSecond") is True for e in entries[seat]):
            problems.append(f"seat {seat}: Sudden Shock's stack entry should say splitSecond: {entries[seat][:1]}")
        if any(e.get("cantBeCountered") for e in entries[seat]):
            problems.append(f"seat {seat}: Sudden Shock can be countered: {entries[seat][:1]}")
        if any(e.get("splitSecond") or e.get("cantBeCountered") for e in others[seat]):
            problems.append(f"seat {seat}: another stack entry is marked: {others[seat][:2]}")
    return result(problems, "Sudden Shock on the stack: splitSecond, to both seats", found)


def uncounterable():
    g, st, entries, others = stack_marks(
        "uncounterable", [("Swamp", 15), ("Forest", 15), ("Abrupt Decay", 30)],
        {"hand": ["Swamp", "Forest", "Abrupt Decay", "Swamp", "Abrupt Decay", "Forest", "Swamp"],
         "top": ["Forest", "Swamp"] * 3}, "Abrupt Decay")
    found = {"entries": {k: v[:2] for k, v in entries.items()}, "stopped": g.stopped_badly()}
    if not st["cast"] or not entries[1] or not entries[2]:
        return "inconclusive", "Abrupt Decay never reached the stack", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        if not all(e.get("cantBeCountered") is True for e in entries[seat]):
            problems.append(f"seat {seat}: Abrupt Decay's stack entry should say cantBeCountered: {entries[seat][:1]}")
        if any(e.get("splitSecond") for e in entries[seat]):
            problems.append(f"seat {seat}: Abrupt Decay has no split second: {entries[seat][:1]}")
        if any(e.get("splitSecond") or e.get("cantBeCountered") for e in others[seat]):
            problems.append(f"seat {seat}: another stack entry is marked: {others[seat][:2]}")
    return result(problems, "Abrupt Decay on the stack: cantBeCountered, to both seats", found)


SCENARIOS = {"hit": hit, "leeches": leeches, "chancellor": chancellor, "split-second": split_second,
             "uncounterable": uncounterable}

if __name__ == "__main__":
    worst = 0
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        verdict_, message, found = scenario()
        code = {"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_]
        worst = 1 if 1 in (worst, code) else max(worst, code)
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:1500])
        sys.stdout.flush()
    sys.exit(worst)
