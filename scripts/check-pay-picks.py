"""Spec 0070: a cost paid card by card shows what is picked so far, a pick can be taken back, and the other player sees nothing until it is paid.

    python -I scripts/check-pay-picks.py <worker.jar> <res-root> [trace] [scenario...]

  voice     Voice of the Woods, "tap five untapped Elves you control"
            (CostTapType): six Elves out. Three picked, the SECOND taken
            back, then three more (never the one taken back). Every
            question after a pick carries exactly the picks so far, in
            order, with TAP and a lean (F-0070-A); the card taken back is
            offered again and is not in the list (F-0070-B); the five
            picked are tapped once paid, the one taken back is not, and
            the 7/7 is made. Nothing is tapped before it is paid.
  fireblast Fireblast for two Mountains instead of its mana (CostSacrifice):
            the first Mountain picked is taken back, then two others --
            those two are sacrificed, the first stays; the list says
            SACRIFICE and does not lean.

In both, F-0070-D: only the paying seat is ever sent the picks (a
DECISION_REQUEST with `picking` to seat 1 alone, and no take-back id in
any frame for seat 2), and seat 2's board shows no seat-1 card tapped
or gone while the picking goes on.

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
F, M, I = "Forest", "Mountain", "Island"
ELVES = {"Llanowar Elves", "Elvish Mystic", "Fyndhorn Elves", "Voice of the Woods"}


def deal(hand, top=()):
    return {"hand": list(hand), "top": list(top)}


class LandKeeper(Game):
    """Discards down to hand size from the spells, keeping the lands."""

    def default(self, frame):
        if frame.get("kind") == "chooseCardsToDiscardToMaximumHandSize":
            spare = [o for o in frame.get("options", []) if (o.get("label") or "") not in (F, M, I)]
            if spare:
                return spare[0]["actionId"]
        return super().default(frame)


def trace_path(name):
    if not TRACES:
        return tempfile.mktemp(suffix=f"-pay-{name}.jsonl")
    if TRACES.endswith(".jsonl"):
        return TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    return os.path.join(TRACES, f"pay-{name}.jsonl")


def stack_empty(g):
    return not g.state.get(1, {}).get("stack") and not g.state.get(2, {}).get("stack")


def cast(g, f, name):
    o = g.option(f, name=name, zone="hand", land=False)
    if o and any(x["actionId"] == o and x.get("payable") is False for x in f["options"]):
        return None
    return o


def seat2_policy(g, f):
    # Seat 2 only plays lands: nothing of its own to get in the way.
    if f.get("kind") == "chooseSpellAbilityToPlay":
        return g.play_land(f)
    return DEFAULT


def leaks(path):
    """F-0070-D over the whole trace: who was sent the picks."""
    problems, asked = [], 0
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            if row.get("dir") != "in":
                continue
            frame = row["frame"]
            text = json.dumps(frame)
            kind = frame.get("type")
            if kind == "DECISION_REQUEST" and "picking" in frame:
                asked += 1
                if frame.get("authorisedSeat") != 1:
                    problems.append(f"picks sent to seat {frame.get('authorisedSeat')}")
                # The take-backs are answers, never options on the wire.
                if any((o.get("actionId") or "").startswith("unpick:") for o in frame.get("options", [])):
                    problems.append("a take-back was sent as an option")
            if kind == "MATCH_SNAPSHOT" and ("unpick:" in text or '"picking"' in text):
                problems.append(f"a snapshot for seat {frame.get('seat')} names the picks")
            if kind not in ("DECISION_REQUEST", "MATCH_SNAPSHOT") and "unpick:" in text:
                problems.append(f"a {kind} frame names a take-back")
            if kind == "DECISION_REQUEST" and frame.get("authorisedSeat") == 2 and "unpick:" in text:
                problems.append("seat 2 was sent a take-back id")
    return problems, asked


def summary(f):
    p = f.get("picking") or {}
    return {"prompt": f.get("prompt"),
            "offered": [card_of(o["actionId"]) for o in f["options"] if card_of(o["actionId"])],
            "word": p.get("word"), "lean": p.get("lean", False),
            "picked": [x.get("objectId") for x in p.get("picked", [])],
            "takeBacks": [x.get("actionId") for x in p.get("picked", [])]}


def check_questions(questions, answers, word, lean):
    """After every answer, the next question lists exactly the picks so far."""
    problems = []
    expect = []
    for i, q in enumerate(questions):
        if q["picked"] != expect:
            problems.append(f"question {i + 1} lists {q['picked']}, the picks so far are {expect}")
        if q["word"] != word:
            problems.append(f"question {i + 1} says {q['word']!r}, not {word!r}")
        if bool(q["lean"]) != lean:
            problems.append(f"question {i + 1}: lean {q['lean']}, expected {lean}")
        if any(cid in q["offered"] for cid in expect):
            problems.append(f"question {i + 1} offers a card already picked")
        if q["takeBacks"] != ["unpick:" + cid for cid in expect]:
            problems.append(f"question {i + 1}: take-backs {q['takeBacks']}")
        if i < len(answers):
            kind, cid = answers[i]
            if kind == "pick":
                expect = expect + [cid]
            else:
                expect = [x for x in expect if x != cid]
                # The card taken back is offered again at once.
                if i + 1 < len(questions) and cid not in questions[i + 1]["offered"]:
                    problems.append(f"{cid} taken back is not offered again")
    return problems


def voice():
    hand = ["Voice of the Woods", "Llanowar Elves", "Llanowar Elves", "Elvish Mystic", F, F, F]
    top = ["Fyndhorn Elves", F, "Llanowar Elves", F, "Elvish Mystic", F, F, F]
    g = LandKeeper([(F, 24), ("Llanowar Elves", 12), ("Elvish Mystic", 12), ("Fyndhorn Elves", 8),
                    ("Voice of the Woods", 4)], [(I, 60)],
                   jar=JAR, res=RES, trace=trace_path("voice"), deal={1: deal(hand, top)})
    st = {"used": False, "questions": [], "answers": [], "before": None, "after": None,
          "early": [], "token": None, "taken": None}

    def elves(g, seat=1, viewer=1):
        return [c for c in g.zone(viewer, "battlefield", owner=seat) if c.get("name") in ELVES]

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            return seat2_policy(g, f)
        if k == "CostTapType" and st["used"]:
            q = summary(f)
            st["questions"].append(q)
            n = len(st["answers"])
            if n == 3 and len(q["picked"]) >= 2:
                # The SECOND pick taken back -- by its take-back answer.
                taken = q["picked"][1]
                st["taken"] = taken
                st["answers"].append(("back", taken))
                return "unpick:" + taken
            cards = [o for o in f["options"] if card_of(o["actionId"]) and card_of(o["actionId"]) != st["taken"]]
            pick = cards[-1]["actionId"]
            st["answers"].append(("pick", card_of(pick)))
            return pick
        if k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            ready = [c for c in elves(g) if not c.get("tapped")]
            if not st["used"] and len(ready) >= 6 and g.mine(1, name="Voice of the Woods"):
                o = g.option(f, name="Voice of the Woods", zone="battlefield")
                if o:
                    st["used"] = True
                    st["before"] = sorted(c["id"] for c in ready)
                    return o
            land = g.play_land(f)
            if land:
                return land
            if st["used"]:
                return None
            if not g.mine(1, name="Voice of the Woods"):
                o = cast(g, f, "Voice of the Woods")
                if o:
                    return o
            if len(elves(g)) < 6:
                for name in ("Llanowar Elves", "Elvish Mystic", "Fyndhorn Elves"):
                    o = cast(g, f, name)
                    if o:
                        return o
            return None
        return DEFAULT

    def until(g):
        if st["used"] and st["after"] is None:
            tokens = [c for c in g.mine(1) if c.get("name") not in ELVES and c.get("kind") == "creature"]
            # While picking (fewer than five picked): no seat-1 Elf is
            # tapped, in either seat's view -- nothing sideways until paid.
            picks = []
            for kind, cid in st["answers"]:
                picks = picks + [cid] if kind == "pick" else [x for x in picks if x != cid]
            if len(picks) < 5:
                for viewer in (1, 2):
                    tapped = [c["id"] for c in elves(g, 1, viewer) if c.get("tapped") and c["id"] in st["before"]]
                    if tapped:
                        st["early"].append((viewer, tapped))
            if tokens and all(any(c.get("name") not in ELVES and c.get("kind") == "creature"
                                  for c in g.zone(v, "battlefield", owner=1)) for v in (1, 2)):
                st["token"] = tokens[0].get("pt") or tokens[0].get("name")
                st["after"] = {v: {"tapped": sorted(c["id"] for c in elves(g, 1, v) if c.get("tapped")),
                                   "untapped": sorted(c["id"] for c in elves(g, 1, v) if not c.get("tapped"))}
                               for v in (1, 2)}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"before": st["before"], "questions": st["questions"], "answers": st["answers"],
             "after": st["after"], "token": st["token"], "stopped": g.stopped_badly()}
    if not st["questions"]:
        return "inconclusive", "Voice of the Woods' cost was never paid card by card", found
    problems = check_questions(st["questions"], st["answers"], "TAP", True)
    if st["taken"] is None:
        problems.append("no pick could be taken back (the question listed no picks)")
    picks = []
    for kind, cid in st["answers"]:
        picks = picks + [cid] if kind == "pick" else [x for x in picks if x != cid]
    found["paid"] = sorted(picks)
    if len(picks) != 5:
        problems.append(f"five Elves should pay, picked {picks}")
    if st["after"] is None:
        problems.append("the cost was never paid (no 7/7)")
    else:
        for v in (1, 2):
            if not set(picks) <= set(st["after"][v]["tapped"]):
                problems.append(f"seat {v} sees {st['after'][v]['tapped']} tapped, picked {sorted(picks)}")
            if st["taken"] not in st["after"][v]["untapped"]:
                problems.append(f"the Elf taken back {st['taken']} should stay untapped (seat {v}'s view)")
    if st["early"]:
        problems.append(f"an Elf was tapped before the cost was paid: {st['early']}")
    more, asked = leaks(g.trace.name if g.trace else trace_path("voice"))
    problems += more
    found["asked with picks"] = asked
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else (
        "ok", "Voice of the Woods: each pick listed at once with TAP and a lean, the one taken back freed and "
              "offered again, five tapped only when paid, seat 2 sent nothing", found)


def fireblast():
    hand = [M, M, M, M, "Fireblast", "Fireblast", M]
    g = LandKeeper([(M, 40), ("Fireblast", 20)], [(I, 60)],
                   jar=JAR, res=RES, trace=trace_path("fireblast"), deal={1: deal(hand, [M, M, M])})
    st = {"used": False, "questions": [], "answers": [], "before": None, "after": None, "taken": None,
          "early": [], "labels": None}

    def mountains(g, viewer=1):
        return [c for c in g.zone(viewer, "battlefield", owner=1) if c.get("name") == M]

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            return seat2_policy(g, f)
        if k == "CostSacrifice" and st["used"]:
            q = summary(f)
            st["questions"].append(q)
            n = len(st["answers"])
            if n == 1 and q["picked"]:
                taken = q["picked"][0]
                st["taken"] = taken
                st["answers"].append(("back", taken))
                return "unpick:" + taken
            cards = [o for o in f["options"] if card_of(o["actionId"]) and card_of(o["actionId"]) != st["taken"]]
            pick = cards[-1]["actionId"] if n else f["options"][-1]["actionId"]
            st["answers"].append(("pick", card_of(pick)))
            return pick
        if k == "chooseTargetsFor" and st["used"]:
            o = next((o for o in f["options"] if o.get("objectId") == "player:2"), None)
            return o["actionId"] if o else DEFAULT
        if k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            ready = mountains(g)
            if not st["used"] and len(ready) >= 4:
                ids = {c["id"] for c in g.mine(1, "hand", name="Fireblast")}
                alt = [o for o in f["options"] if card_of(o["actionId"]) in ids
                       and "acrific" in (o.get("label") or "")]
                st["labels"] = [o.get("label") for o in f["options"] if card_of(o["actionId"]) in ids]
                if alt:
                    st["used"] = True
                    st["before"] = sorted(c["id"] for c in ready)
                    return alt[0]["actionId"]
            return None
        return DEFAULT

    def until(g):
        if st["used"] and len([a for a in st["answers"] if a[0] == "pick"]) >= 3 and stack_empty(g):
            views = {v: sorted(c["id"] for c in mountains(g, v)) for v in (1, 2)}
            if views[1] == views[2] and len(views[1]) < len(st["before"]):
                st["after"] = views
        elif st["used"] and st["before"]:
            for v in (1, 2):
                gone = sorted(set(st["before"]) - {c["id"] for c in mountains(g, v)})
                if gone and len([a for a in st["answers"] if a[0] == "pick"]) < 3:
                    st["early"].append((v, gone))
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {"before": st["before"], "labels": st["labels"], "questions": st["questions"],
             "answers": st["answers"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["questions"]:
        return "inconclusive", "Fireblast's sacrifice was never paid card by card", found
    problems = check_questions(st["questions"], st["answers"], "SACRIFICE", False)
    if st["taken"] is None:
        problems.append("no pick could be taken back (the question listed no picks)")
    picks = []
    for kind, cid in st["answers"]:
        picks = picks + [cid] if kind == "pick" else [x for x in picks if x != cid]
    found["paid"] = sorted(picks)
    if st["after"] is None:
        problems.append("the Mountains were never sacrificed")
    else:
        for v in (1, 2):
            if set(picks) & set(st["after"][v]):
                problems.append(f"seat {v} still sees a sacrificed Mountain: {sorted(set(picks) & set(st['after'][v]))}")
            if st["taken"] not in st["after"][v]:
                problems.append(f"the Mountain taken back {st['taken']} should stay (seat {v}'s view)")
    if st["early"]:
        problems.append(f"a Mountain left before the cost was paid: {st['early']}")
    more, asked = leaks(g.trace.name if g.trace else trace_path("fireblast"))
    problems += more
    found["asked with picks"] = asked
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else (
        "ok", "Fireblast: SACRIFICE listed at once, no lean, the Mountain taken back stayed, the two picked "
              "were sacrificed, seat 2 sent nothing", found)


SCENARIOS = {"voice": voice, "fireblast": fireblast}

if __name__ == "__main__":
    results = {}
    worst = 0
    for name, run in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        verdict_, words, found = run()
        results[name] = {"verdict": verdict_, "says": words, "found": found}
        worst = max(worst, {"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_] if worst != 1 else 1)
        if verdict_ == "wrong":
            worst = 1
    print(json.dumps(results, indent=2, ensure_ascii=False, default=str))
    for name, r in results.items():
        print(f"{name}: {r['verdict'].upper()} -- {r['says']}")
    sys.exit(worst)
