"""Surveil: the cards go where the player put them. Phase 8 Part 1 (spec 0001).

    python -I scripts/check-surveil.py <worker.jar> <res-root> [trace-dir] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B), and proves
the answer by what is DRAWN next, never by the question merely being
asked -- the trap check-library-order.py documents for scry: hand Forge
the right order the wrong way round and the other card is drawn, every
time, with nothing to say so.

  consider-top        Consider, surveil 1, "Keep it on top": Consider's
                      own draw is that card  (F-0001-E)
  consider-graveyard  the same, "Put it into your graveyard": it is in
                      the graveyard, and the card drawn is another  (F-0001-E)
  fame-away           Price of Fame, surveil 2: the LAST card offered to
                      the graveyard, the other kept -- the next draw is
                      the kept one  (F-0001-F)
  fame-order          the same, none to the graveyard, then the LAST card
                      offered on top -- the next two draws are that card,
                      then the other  (F-0001-F)
  preordain-order     scry, moved to the same look (0001 D3): Preordain,
                      scry 2, none to the bottom, the LAST offered on top
                      -- its own draw is that card

Every scenario also checks spec 0001 D3 and HID: each surveil question
carries the cards as pictures (`looking`, names known) to the surveilling
player, and the other player is sent none of them -- no `looking`, no
named sighting -- while they are in the library (F-0001-G).

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
SURVEIL = "arrangeForSurveil"
# Scry asks the same shape under its own name (spec 0001 D3).
LOOKING = {SURVEIL, "arrangeForScry", "willPutCardOnTop"}
BEARS = [("Forest", 30), ("Grizzly Bears", 30)]


def trace_of(name):
    if not TRACES:
        return ""
    if TRACES.endswith(".jsonl"):
        return TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    return os.path.join(TRACES, f"surveil-{name}.jsonl")


def hand_ids(g, seat=1):
    return [c["id"] for c in g.zone(seat, "hand")]


def stack_empty(g):
    return not g.state.get(1, {}).get("stack") and not g.state.get(2, {}).get("stack")


class Watch:
    """The surveil questions, what they showed, and seat 1's draws after them."""

    def __init__(self):
        self.questions = []      # (prompt, option ids, looking entries)
        self.looked = set()      # every card id seat 1 was shown
        self.answered = False
        self.drawn = []          # card ids that reached seat 1's hand after the surveil
        self.hand = None         # seat 1's hand when the surveil was answered

    def asked(self, g, f):
        looking = f.get("looking") or []
        self.questions.append((f.get("prompt") or "", [o["actionId"] for o in f["options"]], looking))
        self.looked |= {c.get("id") for c in looking}
        self.hand = hand_ids(g)

    def follow(self, g):
        """Called on every snapshot: note what seat 1 draws once the surveil is done."""
        if not self.answered or not stack_empty(g):
            return
        for cid in hand_ids(g):
            if cid not in self.hand and cid not in self.drawn:
                self.drawn.append(cid)

    def shown_problems(self, seat=1):
        problems = []
        for prompt, options, looking in self.questions:
            if not looking:
                problems.append(f"{prompt!r} showed no cards")
                continue
            if any(not c.get("known") or not c.get("name") or c.get("name") == "Face-down" for c in looking):
                problems.append(f"{prompt!r} showed a card nameless to the surveilling player")
            if any(c.get("seat") != seat for c in looking):
                problems.append(f"{prompt!r} showed a card that is not the surveilling player's")
            ids = {c.get("id") for c in looking}
            stray = [o for o in options if card_of(o) and card_of(o) not in ids]
            if stray:
                problems.append(f"{prompt!r} offered cards it did not show: {stray}")
        return problems


def leaks(trace, looked):
    """HID: seat 2 is never sent a looked-at card by name while it is hidden.

    Read from the trace -- what actually went out. A card in seat 1's
    graveyard or on the battlefield is public; anywhere else seat 2 must
    not be told what it is."""
    if not trace or not os.path.exists(trace):
        return ["no trace to check for leaks (pass a trace directory)"]
    found = []
    for line in open(trace, encoding="utf-8"):
        record = json.loads(line)
        frame = record.get("frame") or {}
        if record.get("dir") != "in":
            continue
        if frame.get("type") == "DECISION_REQUEST" and frame.get("authorisedSeat") == 2 and frame.get("looking"):
            found.append(f"seat 2 was asked a question showing {[c.get('name') for c in frame['looking']]}")
        if frame.get("type") == "MATCH_SNAPSHOT" and (frame.get("state") or {}).get("seat") == 2:
            state = frame["state"]
            for zone in ("hand", "otherHands"):
                for c in state.get(zone, []) or []:
                    if c.get("id") in looked and c.get("known"):
                        found.append(f"seat 2 saw {c.get('name')} ({c['id']}) in {zone}")
    return found


def run(name, seat1, answer, done, seat2=BEARS, max_turn=24):
    """Seat 1 casts the surveil card once; `answer(g, frame, watch)` answers its questions."""
    trace = trace_of(name)
    g = Game(seat1, seat2, jar=JAR, res=RES, trace=trace)
    watch = Watch()
    st = {"cast": False}
    spell = seat1[1][0]

    def policy(g, f):
        kind = f.get("kind")
        if kind in LOOKING:
            watch.asked(g, f)
            choice = answer(g, f, watch)
            return choice
        if f["authorisedSeat"] == 2 and kind == "chooseSpellAbilityToPlay":
            # Something for Price of Fame to destroy.
            bears = g.option(f, name="Grizzly Bears", zone="hand", land=False)
            payable = bears and not any(x["actionId"] == bears and x.get("payable") is False for x in f["options"])
            return g.play_land(f) or (bears if payable and stack_empty(g) else None)
        if f["authorisedSeat"] == 1 and kind == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            # Once, and only once both seats have something to aim at.
            if not st["cast"] and (spell == "Consider" or any(c.get("kind") == "creature" for c in g.mine(2))):
                o = g.option(f, name=spell, zone="hand", land=False)
                if o and not any(x["actionId"] == o and x.get("payable") is False for x in f["options"]):
                    st["cast"] = True
                    return o
            return g.play_land(f)
        return DEFAULT

    def until(g):
        if watch.questions and not watch.answered and stack_empty(g):
            watch.answered = True
        watch.follow(g)
        return done(g, watch)

    g.run(policy, until=until, max_turn=max_turn)
    return g, watch, trace


def verdict_of(g, watch, trace, problems, ok):
    found = {"questions": [(p, o, [(c.get("id"), c.get("name")) for c in lk]) for p, o, lk in watch.questions],
             "drawn": watch.drawn, "graveyard": [(c["id"], c.get("name")) for c in g.zone(1, "graveyard", owner=1)],
             "stopped": g.stopped_badly()}
    if not watch.questions:
        return "inconclusive", "the surveil was never asked", found
    problems = watch.shown_problems() + leaks(trace, watch.looked) + problems
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


CONSIDER = [("Island", 40), ("Consider", 20)]


def consider(keep):
    label = "Keep it on top" if keep else "Put it into your graveyard"

    def answer(g, f, watch):
        return next(o["actionId"] for o in f["options"] if o.get("label") == label)

    g, watch, trace = run(f"consider-{'top' if keep else 'graveyard'}", CONSIDER, answer,
                          lambda g, w: w.answered and len(w.drawn) >= 1)
    if not watch.questions or len(watch.drawn) < 1:
        return verdict_of(g, watch, trace, [], "")
    looked = watch.questions[0][2][0]["id"]
    grave = {c["id"] for c in g.zone(1, "graveyard", owner=1)}
    problems = []
    if keep and watch.drawn[0] != looked:
        problems.append(f"kept {looked} on top, but Consider drew {watch.drawn[0]}")
    if not keep and looked not in grave:
        problems.append(f"put {looked} into the graveyard, but it is not there")
    if not keep and watch.drawn[0] == looked:
        problems.append("the card put into the graveyard was drawn")
    return verdict_of(g, watch, trace, problems,
                      "Consider: the card kept on top was the card drawn" if keep
                      else "Consider: the card sent away is in the graveyard; another was drawn")


FAME = [("Swamp", 28), ("Price of Fame", 32)]


def fame(order):
    """order=False: one to the graveyard (the LAST offered), one kept.
    order=True: none to the graveyard, then the LAST offered goes on top."""
    picks = {"away": None, "top": None}

    def answer(g, f, watch):
        prompt = f.get("prompt") or ""
        if "click any cards" in prompt:
            if order or picks["away"]:
                return None  # done choosing
            picks["away"] = card_of(f["options"][-1]["actionId"])
            return f["options"][-1]["actionId"]
        picks["top"] = card_of(f["options"][-1]["actionId"])
        return f["options"][-1]["actionId"]

    need = 2 if order else 1
    g, watch, trace = run(f"fame-{'order' if order else 'away'}", FAME, answer,
                          lambda g, w: w.answered and len(w.drawn) >= need)
    if not watch.questions or len(watch.drawn) < need:
        return verdict_of(g, watch, trace, [], "")
    shown = [c["id"] for c in watch.questions[0][2]]
    grave = {c["id"] for c in g.zone(1, "graveyard", owner=1)}
    problems = []
    if len(shown) != 2:
        problems.append(f"surveil 2 showed {len(shown)} cards")
    elif order:
        other = next(c for c in shown if c != picks["top"])
        if picks["top"] is None:
            problems.append("the order was never asked")
        elif watch.drawn[:2] != [picks["top"], other]:
            problems.append(f"put {picks['top']} on top of {other}, but drew {watch.drawn[:2]}")
    else:
        kept = next(c for c in shown if c != picks["away"])
        if picks["away"] not in grave:
            problems.append(f"put {picks['away']} into the graveyard, but it is not there")
        if watch.drawn[0] != kept:
            problems.append(f"kept {kept}, but drew {watch.drawn[0]}")
        if any("Which goes on top" in p for p, _, _ in watch.questions):
            problems.append("asked the order of a single card")
    return verdict_of(g, watch, trace, problems,
                      "Price of Fame: the two cards drawn next came in the order chosen" if order
                      else "Price of Fame: the card sent away is in the graveyard; the kept one was drawn next")


def preordain():
    picks = {"top": None}

    def answer(g, f, watch):
        if "click any cards" in (f.get("prompt") or ""):
            return None  # none to the bottom
        picks["top"] = card_of(f["options"][-1]["actionId"])
        return f["options"][-1]["actionId"]

    g, watch, trace = run("preordain-order", [("Island", 40), ("Preordain", 20)], answer,
                          lambda g, w: w.answered and len(w.drawn) >= 1)
    if not watch.questions or not watch.drawn:
        return verdict_of(g, watch, trace, [], "")
    problems = []
    if picks["top"] is None:
        problems.append("the order was never asked")
    elif watch.drawn[0] != picks["top"]:
        problems.append(f"put {picks['top']} on top, but Preordain drew {watch.drawn[0]}")
    return verdict_of(g, watch, trace, problems, "Preordain: scry shows the cards, and the one put on top was drawn")


SCENARIOS = {"consider-top": lambda: consider(True), "consider-graveyard": lambda: consider(False),
             "fame-away": lambda: fame(False), "fame-order": lambda: fame(True), "preordain-order": preordain}

if __name__ == "__main__":
    codes = []
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        result, message, found = scenario()
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[result])
        print(f"{name}: {result.upper()}: {message}")
        if result != "ok":
            print("  " + json.dumps(found, default=str)[:1200])
        sys.stdout.flush()
    # A wrong answer outranks a game that never got there.
    sys.exit(1 if 1 in codes else max(codes, default=0))
