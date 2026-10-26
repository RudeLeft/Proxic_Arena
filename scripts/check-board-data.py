"""What the board is told, decided by Forge -- PHASE_07 §7.61 B1-B4, B6,
B11-B13 (Mechanics Lab, Layer B).

    python -I scripts/check-board-data.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker; every field it checks is
read from the snapshots both seats were sent, never inferred.

  combat     White Knight (first strike) and Savannah Lions attack; a
             Grizzly Bear blocks the Knight. `combat` names each attacker's target and
             the block; damage arrives as two waves -- first strike, then
             regular -- each exactly what Forge dealt; `prioritySeat` is
             the seat being asked, every time.
  stack      Lightning Bolt at the opponent, answered by Counterspell:
             each stack entry's name, controller, kind and targets -- the
             Counterspell's target is the Bolt on the stack. Mana left
             floating shows in the pool, to both players.
  tokens     Raise the Alarm's Soldiers carry `token`; every permanent's
             `enteredAt` follows the order it arrived in.
  facedown   a morph cast face down: on the stack the opponent is shown
             "Face-down", never its name -- in the entry's name or its
             description -- while its controller is shown the card.
  afford     B8: Shivan Dragon is offered `payable: false` below six
             Mountains, Fling without two Mountains AND a creature to
             sacrifice -- exactly, on every offer.
  options    B5 over every question above: each option's `objectId` is
             the card, stack entry or player (by seat) it is about.

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its point.
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


def game(name, seat1, seat2):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"board-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def cast(g, frame, name, contains=None):
    return g.option(frame, name=name, zone="hand", contains=contains, land=False)


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


WATCHES = []


class Watch:
    """Every snapshot each seat was sent, and every question, in order."""

    def __init__(self, g):
        self.g = g
        WATCHES.append(self)
        self.revisions = {1: -1, 2: -1}
        self.snaps = {1: [], 2: []}
        self.priority_wrong = []
        self.priority_checked = 0
        self.objects_checked = 0
        self.objects_wrong = []

    def see(self):
        for seat in (1, 2):
            s = self.g.state.get(seat)
            if s and s.get("stateRevision") != self.revisions[seat]:
                self.revisions[seat] = s.get("stateRevision")
                self.snaps[seat].append(s)

    def twin(self, snap):
        """Seat 2's snapshot of the same round as seat 1's `snap`: each
        seat's arrives separately, so "seat 2's latest" can be a round
        behind."""
        rev = snap.get("stateRevision")
        return next((s for s in self.snaps[2] if s.get("stateRevision") == rev), None)

    def asked(self, frame):
        # B5, on every question: each option names what it is about --
        # the card, stack entry or player in its id, a player by SEAT.
        for o in frame.get("options", []):
            want = None
            for kind in ("card", "stack"):
                tail = o["actionId"].rsplit(f"{kind}:", 1)
                if len(tail) == 2 and tail[1].isdigit() and o["actionId"].endswith(f"{kind}:{tail[1]}"):
                    want = f"{kind}:{tail[1]}"
            if ":player:" in o["actionId"] or o["actionId"].startswith("player:"):
                want = {"Alice": "player:1", "Bob": "player:2"}.get(o.get("label"), "player:?")
            got = o.get("objectId")
            if want == "player:?":
                ok = isinstance(got, str) and got in ("player:1", "player:2")
            else:
                ok = got == want
            self.objects_checked += 1
            if not ok:
                self.objects_wrong.append((frame.get("kind"), o["actionId"], o.get("label"), got))
        # B1: a priority question goes to the seat the snapshot says holds
        # priority (other questions -- targets, blocks -- need not).
        if frame.get("kind") != "chooseSpellAbilityToPlay":
            return
        seat = frame["authorisedSeat"]
        s = self.g.state.get(seat) or {}
        self.priority_checked += 1
        if s.get("prioritySeat") != frame.get("actedForSeat"):
            self.priority_wrong.append((s.get("turn"), s.get("phase"), s.get("prioritySeat"), seat))


def card_named(snap, name):
    return [c for c in snap.get("battlefield", []) if c.get("name") == name]


# --- combat ---------------------------------------------------------------------


def combat():
    g = game("combat",
             # Mono-white: White Knight's {W}{W} beside a green card left
             # seat 1 with one Plains and no Knight for 30 turns.
             [("Plains", 24), ("White Knight", 18), ("Savannah Lions", 18)],
             [("Forest", 30), ("Grizzly Bears", 30)])
    w = Watch(g)
    st = {"attacked": False, "blocked": None, "combat_seen": None, "blocks_seen": None, "waves": []}

    def policy(g, f):
        w.see()
        w.asked(f)
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            names = ["White Knight", "Savannah Lions"] if seat == 1 else ["Grizzly Bears"]
            for name in names:
                o = cast(g, f, name)
                if o:
                    return o
            return None
        if kind == "declareAttackers" and seat == 1:
            # Attack with a Knight and Lions together, once both are ready.
            mine = g.mine(1)
            ready = (any(c.get("name") == "White Knight" and not c.get("sick") for c in mine)
                     and any(c.get("name") == "Savannah Lions" and not c.get("sick") for c in mine))
            if not ready or st["attacked"] == "done":
                return None
            st["attacked"] = True
            return f["options"][0]["actionId"] if f.get("options") else None
        if kind == "declareAttackers":
            return None
        if kind == "declareBlockers" and seat == 2 and st["blocked"] is None:
            # One Bear blocks: then, asked which attacker, the Knight.
            o = f["options"][0]["actionId"] if f.get("options") else None
            if o:
                st["blocked"] = "choosing"
            return o
        if kind == "declareBlockers":
            return None
        if st["blocked"] == "choosing" and seat == 2 and f.get("options"):
            knight = next((o["actionId"] for o in f["options"] if "White Knight" in (o.get("label") or "")), None)
            if knight:
                st["blocked"] = knight
                return knight
        return DEFAULT

    def until(g):
        w.see()
        s1 = g.state.get(1) or {}
        c = s1.get("combat")
        if c and st["combat_seen"] is None and len(c.get("attackers", [])) >= 2:
            st["combat_seen"] = c
        if c and c.get("blocks") and st["blocks_seen"] is None:
            st["blocks_seen"] = c
        if st["attacked"] is True and not c and st["combat_seen"]:
            st["attacked"] = "done"
        for seat in (1, 2):
            d = (g.state.get(seat) or {}).get("damage")
            if d and (seat, d["key"]) not in [(x[0], x[1]["key"]) for x in st["waves"]]:
                st["waves"].append((seat, d, s1.get("phase")))
        return st["attacked"] == "done" and st["blocks_seen"] is not None

    g.run(policy, until=until, max_turn=30)
    s1 = g.state.get(1) or {}
    found = {"combat": st["combat_seen"], "blocks": st["blocks_seen"],
             "waves": [(seat, d, phase) for seat, d, phase in st["waves"]][:6],
             "priority_checked": w.priority_checked, "priority_wrong": w.priority_wrong[:5],
             "stopped": g.stopped_badly()}
    # Which card is which, for a failure report (CI 2026-10-21: one run
    # showed a single merged wave, and ids alone could not say whether the
    # Knight had attacked at all).
    found["names"] = {c["id"]: c.get("name") for seat in (1, 2)
                      for zone in ("battlefield", "graveyard", "exile")
                      for c in (g.state.get(seat) or {}).get(zone, []) or [] if c.get("id")}
    if not st["combat_seen"] or not st["blocks_seen"]:
        return "inconclusive", "never attacked with a Knight and Lions and saw a block", found
    problems = [found["stopped"]] if found["stopped"] else []
    if w.priority_wrong:
        problems.append(f"prioritySeat should be the seat asked: {w.priority_wrong[:3]}")
    if w.priority_checked < 10:
        problems.append(f"too few priority questions checked: {w.priority_checked}")
    names = {c["id"]: c.get("name") for snap in w.snaps[1] for c in snap.get("battlefield", [])}
    # Every creature that attacked, as Forge recorded them by the blocks
    # (attackers are declared one at a time, so the record grows).
    attackers = st["blocks_seen"]["attackers"]
    kinds = [names.get(a["id"]) for a in attackers]
    if "White Knight" not in kinds or any(k not in ("White Knight", "Savannah Lions") for k in kinds):
        problems.append(f"combat should list the attacking Knight and Lions: {attackers}")
    if any(a.get("target") != {"player": 2} for a in attackers):
        problems.append(f"each attacker attacks player 2: {attackers}")
    block = st["blocks_seen"]["blocks"]
    if len(block) != 1 or names.get(block[0]["attacker"]) != "White Knight" \
            or names.get(block[0]["blocker"]) != "Grizzly Bears":
        problems.append(f"one Bear should block the Knight: {block}")
    # Both seats get the same combat (it is public).
    s2_combat = [snap.get("combat") for snap in w.snaps[2] if snap.get("combat")]
    if not any(c == st["blocks_seen"] for c in s2_combat):
        problems.append("seat 2 should be shown the same combat")
    # Two waves, seen by seat 1: first strike -- EVERY attacking White
    # Knight (the blocked one into the Bear, any other into player 2) --
    # then regular: the Lions into player 2. More than one Knight can
    # attack (CI 2026-10-21 saw two, and Forge rightly dealt both first).
    mine = [d for seat, d, _ in st["waves"] if seat == 1]
    knight = block[0]["attacker"]
    bear_blocker = block[0]["blocker"]
    knights = [a["id"] for a in attackers if names.get(a["id"]) == "White Knight"]
    lions = [a["id"] for a in attackers if names.get(a["id"]) != "White Knight"]
    first = next((d for d in mine if any(h.get("source") == knight for h in d["hits"])), None)
    regular = next((d for d in mine if any(h.get("source") in lions for h in d["hits"])), None)
    want_first = sorted(
        [{"source": knight, "target": {"object": bear_blocker}, "amount": 2}]
        + [{"source": k, "target": {"player": 2}, "amount": 2} for k in knights if k != knight],
        key=json.dumps)
    if not first or sorted(first["hits"], key=json.dumps) != want_first:
        problems.append(f"the first-strike wave should be each Knight's 2 (the blocked one's to the Bear): {first}")
    want = sorted(({"source": b, "target": {"player": 2}, "amount": 2} for b in lions), key=json.dumps)
    if not regular or sorted(regular["hits"], key=json.dumps) != want:
        problems.append(f"the regular wave should be each attacking Lions' 2 to player 2: {regular}")
    if first and regular and first["key"] == regular["key"]:
        problems.append("first strike and regular damage should be separate waves")
    theirs = [d for seat, d, _ in st["waves"] if seat == 2]
    if [d["key"] for d in theirs] != [d["key"] for d in mine]:
        problems.append(f"both seats are sent the same waves: {[d['key'] for d in mine]} vs {[d['key'] for d in theirs]}")
    return result(problems, f"combat and the block from Forge's own record; first strike then regular damage "
                            f"as two waves; prioritySeat right on {w.priority_checked} questions", found)


# --- stack and mana -------------------------------------------------------------


def stack():
    g = game("stack", [("Mountain", 30), ("Lightning Bolt", 30)], [("Island", 30), ("Counterspell", 30)])
    w = Watch(g)
    st = {"bolt": None, "countered": False, "both": None, "floated": False, "pool": None}

    def policy(g, f):
        w.see()
        w.asked(f)
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        on_stack = (g.state.get(seat) or {}).get("stack") or []
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat == 1:
                untapped = g.untapped_lands(1, name="Mountain")
                # Float one red mana once, with three Mountains out.
                if not st["floated"] and not on_stack and len(untapped) >= 3 and st["both"]:
                    o = next((o["actionId"] for o in f["options"]
                              if "Add {R}" in (o.get("label") or "")), None)
                    if o:
                        st["floated"] = True
                        return o
                # A Bolt whenever the stack is empty, until one has been
                # answered by a Counterspell (seat 2 needs two Islands).
                if st["both"] is None and not on_stack and len(untapped) >= 1:
                    o = cast(g, f, "Lightning Bolt")
                    if o:
                        st["bolt"] = "cast"
                        return o
                return None
            if seat == 2 and on_stack and st["both"] is None \
                    and len(g.untapped_lands(2, name="Island")) >= 2:
                o = cast(g, f, "Counterspell")
                if o:
                    st["countered"] = True
                    return o
            return None
        if kind == "chooseTargetsFor":
            if seat == 1:
                return next((o["actionId"] for o in f["options"] if o.get("label") == "Bob"), DEFAULT)
            return next((o["actionId"] for o in f["options"] if "Lightning Bolt" in (o.get("label") or "")), DEFAULT)
        return DEFAULT

    def until(g):
        w.see()
        s = g.state.get(1) or {}
        if len(s.get("stack") or []) >= 2 and st["both"] is None:
            st["both"] = s
        if st["floated"] and st["pool"] is None:
            me1 = next((p for p in s.get("players", []) if p.get("seat") == 1), {})
            if me1.get("manaPool"):
                st["pool"] = s
        # Done once seat 2's copies of both rounds have arrived too.
        return st["both"] is not None and st["pool"] is not None \
            and w.twin(st["both"]) is not None and w.twin(st["pool"]) is not None

    g.run(policy, until=until, max_turn=30)
    if st["both"] and st["pool"] and w.twin(st["both"]) and w.twin(st["pool"]):
        pool_of = lambda snap: next((p for p in snap.get("players", []) if p.get("seat") == 1), {}).get("manaPool")  # noqa: E731
        st["both"] = {"seat1": st["both"].get("stack"), "seat2": w.twin(st["both"]).get("stack")}
        st["pool"] = {"seat1": pool_of(st["pool"]), "seat2": pool_of(w.twin(st["pool"]))}
    else:
        st["both"] = st["pool"] = None
    found = {"stack": st["both"], "pool": st["pool"], "stopped": g.stopped_badly()}
    if not st["both"] or not st["pool"]:
        return "inconclusive", "never had a Bolt and its Counterspell on the stack, and floating mana", found
    problems = [found["stopped"]] if found["stopped"] else []
    top, bottom = st["both"]["seat1"][0], st["both"]["seat1"][1]
    want_bottom = {"name": "Lightning Bolt", "controller": 1, "kind": "spell", "targets": [{"player": 2}]}
    want_top = {"name": "Counterspell", "controller": 2, "kind": "spell", "targets": [{"object": bottom["id"]}]}
    for want, got, which in ((want_bottom, bottom, "the Bolt"), (want_top, top, "the Counterspell")):
        for k, v in want.items():
            if got.get(k) != v:
                problems.append(f"{which}'s {k} should be {v}: {got.get(k)}")
        if not str(got.get("source", "")).startswith("card:"):
            problems.append(f"{which} should name its source card: {got}")
    if st["both"]["seat2"] != st["both"]["seat1"]:
        problems.append(f"both seats should be shown the same stack: {st['both']['seat2']}")
    if st["pool"]["seat1"] != {"R": 1} or st["pool"]["seat2"] != {"R": 1}:
        problems.append(f"one floating red mana, shown to both players: {st['pool']}")
    return result(problems, "the Bolt targets player 2, the Counterspell targets the Bolt on the stack; names, "
                            "controllers and kinds from Forge; floating {R} shown to both", found)


# --- tokens and arrival order ------------------------------------------------------


def tokens():
    g = game("tokens", [("Plains", 24), ("Raise the Alarm", 36)], [("Forest", 30), ("Grizzly Bears", 30)])
    w = Watch(g)
    st = {"raised": 0}

    def policy(g, f):
        w.see()
        w.asked(f)
        kind = f.get("kind")
        if f["authorisedSeat"] == 2:
            return (g.play_land(f) if kind == "chooseSpellAbilityToPlay" else DEFAULT)
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            # {1}{W} with two Plains untapped: Forge offers a spell it
            # cannot pay for and then undoes it, so offered is not cast.
            soldiers = [c for c in g.mine(1) if "Soldier" in (c.get("name") or "")]
            if len(soldiers) < 4 and not (g.state.get(1) or {}).get("stack") \
                    and len(g.untapped_lands(1, name="Plains")) >= 2:
                o = cast(g, f, "Raise the Alarm")
                if o:
                    st["raised"] += 1
                    return o
            return None
        return DEFAULT

    def until(g):
        w.see()
        s = g.state.get(1) or {}
        soldiers = [c for c in s.get("battlefield", []) if c.get("seat") == 1 and "Soldier" in (c.get("name") or "")]
        plains = [c for c in s.get("battlefield", []) if c.get("name") == "Plains" and c.get("seat") == 1]
        return len(soldiers) >= 4 and len(plains) >= 5 and not s.get("stack") \
            and bool(w.snaps[1]) and w.twin(w.snaps[1][-1]) is not None

    g.run(policy, until=until, max_turn=30)
    s = g.state.get(1) or {}
    mine = [c for c in s.get("battlefield", []) if c.get("seat") == 1]
    soldiers = [c for c in mine if "Soldier" in (c.get("name") or "")]
    found = {"soldiers": [(c["id"], c.get("token"), c.get("enteredAt")) for c in soldiers],
             "plains": [(c["id"], c.get("token"), c.get("enteredAt")) for c in mine if c.get("name") == "Plains"],
             "stopped": g.stopped_badly()}
    if len(soldiers) < 4:
        return "inconclusive", "never made four Soldier tokens", found
    problems = [found["stopped"]] if found["stopped"] else []
    if any(c.get("token") is not True for c in soldiers):
        problems.append(f"every Soldier is a token: {found['soldiers']}")
    if any("token" in c for c in mine if c.get("name") == "Plains"):
        problems.append("a Plains is not a token")
    # Arrival order: the first time each permanent was seen, in snapshot
    # order, never contradicts its enteredAt.
    first_seen = []
    for snap in w.snaps[1]:
        for c in snap.get("battlefield", []):
            if c.get("seat") == 1 and c["id"] not in [x[0] for x in first_seen]:
                first_seen.append((c["id"], c.get("enteredAt")))
    stamps = [t for _, t in first_seen]
    if any(t is None for t in stamps):
        problems.append("every permanent carries enteredAt")
    elif any(b < a for a, b in zip(stamps, stamps[1:])):
        problems.append(f"enteredAt should follow arrival order: {first_seen}")
    twin = w.twin(w.snaps[1][-1]) or {}
    theirs = {c["id"]: c.get("enteredAt") for c in twin.get("battlefield", [])}
    if not twin or any(theirs.get(c["id"]) != c.get("enteredAt") for c in w.snaps[1][-1]["battlefield"]):
        problems.append("seat 2 is shown the same enteredAt")
    return result(problems, f"{len(soldiers)} Soldier tokens flagged token, no Plains; enteredAt follows the order "
                            f"{len(first_seen)} permanents arrived in, the same for both seats", found)


# --- a face-down spell on the stack ---------------------------------------------------


def facedown():
    g = game("facedown", [("Island", 24), ("Willbender", 36)], [("Forest", 30), ("Grizzly Bears", 30)])
    w = Watch(g)
    st = {"cast": False, "seen": None}

    def policy(g, f):
        w.see()
        w.asked(f)
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if seat == 2:
            if kind == "chooseSpellAbilityToPlay" and (g.state.get(2) or {}).get("stack") and st["seen"] is None:
                st["seen"] = {"seat2": (g.state.get(2) or {}).get("stack"),
                              "seat1": (g.state.get(1) or {}).get("stack")}
            return g.play_land(f) if kind == "chooseSpellAbilityToPlay" else DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if not st["cast"] and len(g.untapped_lands(1)) >= 3:
                o = next((o["actionId"] for o in f["options"] if "face down" in (o.get("label") or "")
                          and "{3}" in (o.get("label") or "")), None)
                if o:
                    st["cast"] = True
                    return o
            return None
        return DEFAULT

    g.run(policy, until=lambda g: (w.see(), st["seen"] is not None)[1], max_turn=20)
    found = {"seen": st["seen"], "stopped": g.stopped_badly()}
    if not st["seen"]:
        return "inconclusive", "the opponent never had priority with the face-down spell on the stack", found
    problems = [found["stopped"]] if found["stopped"] else []
    theirs = st["seen"]["seat2"][0]
    mine = (st["seen"]["seat1"] or [{}])[0]
    if "Willbender" in json.dumps(st["seen"]["seat2"]):
        problems.append(f"seat 2 must not be told the face-down spell's name: {theirs}")
    if theirs.get("name") != "Face-down" or theirs.get("description") != "Face-down spell":
        problems.append(f"seat 2 is shown a face-down spell: {theirs}")
    if "Willbender" not in (mine.get("name") or ""):
        problems.append(f"its controller is shown the card: {mine}")
    if theirs.get("id") != mine.get("id") or theirs.get("controller") != 1:
        problems.append("the same stack entry, controller 1, for both")
    return result(problems, "on the stack, seat 2 sees \"Face-down\" (name and description); seat 1 sees Willbender",
                  found)


# --- what can be paid (B8) -----------------------------------------------------------


def afford():
    # Shivan Dragon: a mana cost ({4}{R}{R}). Fling: {1}{R} AND sacrifice a
    # creature -- a cost that is not mana. Neither is ever cast here but
    # the Dragon; the scenario only reads how each is offered.
    g = game("afford", [("Mountain", 24), ("Shivan Dragon", 18), ("Fling", 18)],
             [("Forest", 30), ("Grizzly Bears", 30)])
    w = Watch(g)
    st = {"checked": {"Shivan Dragon": [0, 0], "Fling": [0, 0]}, "wrong": [], "cast": False}

    def policy(g, f):
        w.see()
        w.asked(f)
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if seat == 2:
            return g.play_land(f) if kind == "chooseSpellAbilityToPlay" else DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            s = g.state.get(1) or {}
            if not s.get("stack"):
                mountains = len(g.untapped_lands(1, name="Mountain"))
                creatures = [c for c in g.mine(1) if c.get("kind") == "creature"]
                rule = {"Shivan Dragon": mountains >= 6, "Fling": mountains >= 2 and bool(creatures)}
                # The spell in hand, by card id: once a Dragon is on the
                # battlefield its firebreathing ("Shivan Dragon -- {R}: ...")
                # is offered too, payable with one Mountain, and a label
                # match judged it by the spell's six (CI, 2026-10-26).
                hand = {c.get("id"): c.get("name") for c in g.mine(1, "hand")}
                for o in f["options"]:
                    label = o.get("label") or ""
                    name = hand.get(card_of(o.get("actionId")))
                    if name in rule and "Play land" not in label:
                        can = rule[name]
                        shown = o.get("payable", True)
                        st["checked"][name][0 if can else 1] += 1
                        if shown != can:
                            st["wrong"].append((s.get("turn"), name, mountains, len(creatures), shown))
            # No seventh Mountain before the Dragon: casting it must tap
            # out, or Fling (needing two) was never seen unaffordable with
            # a creature to sacrifice -- inconclusive in CI, 2026-10-21.
            land = g.play_land(f) if st["cast"] or len(g.mine(1, name="Mountain")) < 6 else None
            if land:
                return land
            # Cast the first Dragon once it can be paid, so Fling then has
            # something to sacrifice.
            if not st["cast"] and len(g.untapped_lands(1, name="Mountain")) >= 6:
                o = cast(g, f, "Shivan Dragon")
                if o:
                    st["cast"] = True
                    return o
            return None
        return DEFAULT

    def until(g):
        w.see()
        c = st["checked"]
        return all(c[name][0] >= 1 and c[name][1] >= 1 for name in c)

    g.run(policy, until=until, max_turn=40)
    found = {"checked": st["checked"], "wrong": st["wrong"][:6], "stopped": g.stopped_badly()}
    c = st["checked"]
    if not all(c[name][0] >= 1 and c[name][1] >= 1 for name in c):
        return "inconclusive", "never saw each card both affordable and not", found
    problems = [found["stopped"]] if found["stopped"] else []
    if st["wrong"]:
        problems.append(f"payable should be exactly what the costs allow: {st['wrong'][:4]}")
    return result(problems, f"Shivan Dragon dimmed below six Mountains, Fling dimmed without a creature to "
                            f"sacrifice or two Mountains -- exactly, on {sum(sum(v) for v in c.values())} offers", found)


def options_everywhere():
    """B5 and B1 over every question every scenario above was asked."""
    checked = sum(w.objects_checked for w in WATCHES)
    wrong = [x for w in WATCHES for x in w.objects_wrong]
    prio = [x for w in WATCHES for x in w.priority_wrong]
    found = {"objects_checked": checked, "objects_wrong": wrong[:6], "priority_wrong": prio[:6]}
    if checked < 100:
        return "inconclusive", f"too few options checked: {checked}", found
    problems = []
    if wrong:
        problems.append(f"each option names its object (players by seat): {wrong[:4]}")
    if prio:
        problems.append(f"prioritySeat is the seat asked: {prio[:4]}")
    return result(problems, f"objectId right on {checked} options in every scenario", found)


SCENARIOS = {"combat": combat, "stack": stack, "tokens": tokens, "facedown": facedown,
             "afford": afford, "options": options_everywhere}

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
            print("  " + json.dumps(found, default=str)[:2000])
        sys.stdout.flush()
    sys.exit(worst)
