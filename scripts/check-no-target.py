"""Spec 0108 -- a spell with nothing to target is not offered, and says why;
no Forge "(Targeting: [[...]])" note on the stack (Mechanics Lab, Layer B).

    python -I scripts/check-no-target.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker. What it checks is read
from the questions and the snapshots both seats were sent, never inferred:

  rebuke-none       Alice's main phase, three untapped Plains, Rebuke in
                    hand, nothing attacking: no Rebuke among her options
                    (never, on either turn, while nothing attacks), and the
                    question's `unavailable` gives each Rebuke "There's no
                    attacking creature to target." (F-0108-C)
  rebuke-attacker   Bob's Grizzly Bears attack: Rebuke is offered to Alice;
                    she casts it at the Bears, pays, and the Bears go to
                    Bob's graveyard (and before the attack it was not offered)
  aura-none         Pacifism with no creature on the table: not offered, its
                    reason one of the no-target sentences (Forge's own target
                    words for an Aura's enchant target)
  charm-other-mode  Izzet Charm with nothing to counter and no creature:
                    still offered (its draw mode), and cast
  up-to-one         Plunge into Winter ("tap up to one target creature") with
                    no creature: still offered, and cast (it reaches the
                    graveyard)
  rebuke-stops      F-0108-D: both seats on the stops rule; Alice holds only
                    Rebuke and Plains, nothing ever attacks: she is never
                    asked on Bob's turn (as with lands only, check-stops
                    end-step), and Rebuke is never among her options
  slayer            F-0108-E: Alice's Slayer of the Wicked, its trigger aimed
                    at Bob's Butcher Ghoul (a Zombie), copied by her Strionic
                    Resonator; Bob answers with Stifle. Both seats' stack
                    plates read the trigger's sentence whole, ending
                    "...or Zombie."; the copy's description too; Stifle's
                    target buttons ("on the stack: ...") carry no Forge note

Over every scenario's frames, both seats: no stack `description`, no
`copying` description and no option label carries "Targeting:", "[[" or a
"([" list (F-0108-E).

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

NO_ATTACKER = "There's no attacking creature to target."
NO_TARGET_WORDS = ("There's no ", "There's nothing it can target right now.")
FORGE_NOTES = ("Targeting:", "[[", "([")


def game(name, seat1, seat2, deal=None, stops=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"no-target-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal, stops=stops)


class Watch:
    """Every snapshot and question each seat was sent, once each, in order."""

    def __init__(self, g):
        self.g = g
        self.seen = {1: {}, 2: {}}
        self.questions = []

    def see(self):
        for seat in (1, 2):
            s = self.g.state.get(seat)
            if s and s.get("stateRevision") not in self.seen[seat]:
                self.seen[seat][s.get("stateRevision")] = s

    def ask(self, f):
        self.questions.append(f)

    def boards(self, seat):
        return list(self.seen[seat].values())


def notes(w):
    """F-0108-E: every stack, copy and option text carrying a Forge note, from both seats."""
    bad = []
    for seat in (1, 2):
        for b in w.boards(seat):
            for e in (b.get("stack") or []) + (b.get("copying") or []):
                d = e.get("description") or ""
                if any(n in d for n in FORGE_NOTES):
                    bad.append((seat, "stack", d))
    for f in w.questions:
        for o in f.get("options") or []:
            label = o.get("label") or ""
            if any(n in label for n in FORGE_NOTES):
                bad.append((f["authorisedSeat"], "option", label))
    return bad


def result(problems, ok, found, w=None):
    if found.get("stopped"):
        problems = problems + [found["stopped"]]
    if w is not None:
        bad = notes(w)
        if bad:
            problems = problems + [f"F-0108-E: Forge's note reached a seat: {bad[:4]}"]
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def stack_of(g, seat):
    return (g.state.get(seat) or {}).get("stack") or []


def offered(g, f, name):
    """The options of [f] for a card named [name] in the asked seat's hand."""
    seat = f["authorisedSeat"]
    ids = {c.get("id") for c in g.zone(seat, "hand", name=name)}
    return [o for o in f.get("options") or [] if card_of(o.get("actionId")) in ids
            and "Play land" not in (o.get("label") or "")]


def attacking(g, seat):
    return [c for c in g.zone(seat, "battlefield") if c.get("attacking")]


def plains(n):
    return ["Plains"] * n


# --- Rebuke -------------------------------------------------------------------------------


def rebuke_none():
    st = {"checked": 0, "offered": [], "reasons": [], "frames": 0}

    def policy(g, f):
        w.ask(f)
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay" and seat == 1:
            if not attacking(g, 1):
                bad = offered(g, f, "Rebuke")
                if bad:
                    st["offered"].append((g.turn, [o.get("label") for o in bad]))
            if (g.state.get(1) or {}).get("activeSeat") == 1 and len(g.untapped_lands(1)) >= 3 \
                    and not stack_of(g, 1) and g.mine(1, "hand", name="Rebuke"):
                why = f.get("unavailable") or {}
                for c in g.mine(1, "hand", name="Rebuke"):
                    st["reasons"].append(why.get(c["id"]))
                st["checked"] += 1
            return g.play_land(f)
        if kind == "chooseSpellAbilityToPlay":
            return g.play_land(f) or (None if g.mine(2, name="Grizzly Bears") else cast_named(g, f, "Grizzly Bears"))
        return DEFAULT

    g = game("rebuke-none", [("Plains", 40), ("Rebuke", 20)], [("Forest", 40), ("Grizzly Bears", 20)],
             deal={1: {"hand": plains(3) + ["Rebuke"] * 3 + ["Plains"], "top": plains(10)},
                   2: {"hand": ["Forest"] * 3 + ["Grizzly Bears"] * 4, "top": ["Forest"] * 10}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["checked"] >= 3)[1], max_turn=10)
    w.see()
    found = {"stopped": g.stopped_badly(), "checked": st["checked"], "reasons": st["reasons"][:6],
             "offered": st["offered"][:4]}
    if not st["checked"]:
        return "inconclusive", "Alice never had three untapped Plains with Rebuke in hand", found
    problems = []
    if st["offered"]:
        problems.append(f"F-0108-C: Rebuke offered with nothing attacking: {st['offered'][:3]}")
    if any(r != NO_ATTACKER for r in st["reasons"]):
        problems.append(f"F-0108-C: the reason is {NO_ATTACKER!r}: {sorted(set(map(str, st['reasons'])))}")
    return result(problems, f"Rebuke with nothing attacking: never offered; each copy's reason {NO_ATTACKER!r} "
                            f"({st['checked']} questions)", found, w)


def cast_named(g, f, name):
    for o in offered(g, f, name):
        if o.get("payable") is not False:
            return o["actionId"]
    return None


def rebuke_attacker():
    st = {"early": [], "cast": None, "bears": None, "attacked": False, "target": None}

    def policy(g, f):
        w.ask(f)
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "declareAttackers":
            # Only when Alice could pay for Rebuke (three untapped Plains, as
            # Bob sees them), every turn until she has cast it.
            ready = len([c for c in g.zone(2, "battlefield", owner=1)
                         if c.get("kind") == "land" and not c.get("tapped")]) >= 3
            if seat != 2 or st["cast"] is not None or not ready:
                return None
            o = next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith("Grizzly Bears")),
                     None)
            st["attacked"] = st["attacked"] or bool(o)
            return o
        if kind == "declareBlockers":
            return None
        if kind == "chooseTargetsFor" and seat == 1 and st["cast"]:
            st["target"] = [(o.get("actionId"), o.get("label")) for o in f["options"]]
            return next((o["actionId"] for o in f["options"] if card_of(o.get("actionId")) == st["bears"]), DEFAULT)
        if kind == "chooseSpellAbilityToPlay" and seat == 1:
            rebukes = offered(g, f, "Rebuke")
            hit = attacking(g, 1)
            if not hit:
                if rebukes:
                    st["early"].append((g.turn, (g.state.get(1) or {}).get("phase")))
                return g.play_land(f)
            if st["cast"] is None and rebukes and len(g.untapped_lands(1)) >= 3:
                st["cast"], st["bears"] = g.turn, hit[0]["id"]
                return rebukes[0]["actionId"]
            return None
        if kind == "chooseSpellAbilityToPlay":
            if stack_of(g, 2):
                return None
            return g.play_land(f) or (None if g.mine(2, name="Grizzly Bears") else cast_named(g, f, "Grizzly Bears"))
        return DEFAULT

    def until(g):
        w.see()
        return st["bears"] is not None and any(c.get("id") == st["bears"]
                                               for c in g.zone(1, "graveyard", owner=2))

    g = game("rebuke-attacker", [("Plains", 40), ("Rebuke", 20)], [("Forest", 40), ("Grizzly Bears", 20)],
             deal={1: {"hand": plains(3) + ["Rebuke"] * 3 + ["Plains"], "top": plains(10)},
                   2: {"hand": ["Forest"] * 3 + ["Grizzly Bears"] * 4, "top": ["Forest"] * 10}})
    w = Watch(g)
    g.run(policy, until=until, max_turn=12)
    w.see()
    found = {"stopped": g.stopped_badly(), "cast": st["cast"], "target": st["target"], "early": st["early"][:4]}
    if not st["attacked"]:
        return "inconclusive", "the Bears never attacked", found
    problems = []
    if st["early"]:
        problems.append(f"Rebuke offered before anything attacked: {st['early'][:3]}")
    if st["cast"] is None:
        problems.append("F-0108-C: with the Bears attacking, Rebuke was never offered")
    elif not until(g):
        problems.append(f"the Bears are not in Bob's graveyard (target question: {st['target']})")
    return result(problems, "Bears attacking: Rebuke offered, cast at them, the Bears destroyed", found, w)


# --- the other kinds ----------------------------------------------------------------------


def stays_offered(name, label, seat1, deal1, card, seat2, deal2, lands_needed, to_grave=True):
    st = {"offered": 0, "cast": None, "why": []}

    def policy(g, f):
        w.ask(f)
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay" and seat == 1:
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, 1) or len(g.untapped_lands(1)) < lands_needed:
                return None
            options = offered(g, f, card)
            if options:
                st["offered"] += 1
                if st["cast"] is None:
                    st["cast"] = (g.turn, options[0]["actionId"], [c["id"] for c in g.mine(1, "hand", name=card)])
                    return options[0]["actionId"]
            elif g.mine(1, "hand", name=card):
                st["why"].append((f.get("unavailable") or {}).get(g.mine(1, "hand", name=card)[0]["id"]))
            return None
        if kind == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if kind == "chooseModeForAbility" and seat == 1:
            return next((o["actionId"] for o in f["options"] if "Draw" in (o.get("label") or "")), DEFAULT)
        return DEFAULT

    def until(g):
        w.see()
        return st["cast"] is not None and not stack_of(g, 1) and (
            not to_grave or any(c.get("name") == card for c in g.mine(1, "graveyard")))

    g = game(name, seat1, seat2, deal={1: deal1, 2: deal2})
    w = Watch(g)
    g.run(policy, until=until, max_turn=10)
    w.see()
    found = {"stopped": g.stopped_badly(), "offered": st["offered"], "cast": st["cast"], "why": st["why"][:3]}
    if not st["offered"] and not st["why"]:
        return "inconclusive", f"Alice never had {lands_needed} lands with {card} in hand", found
    problems = []
    if not st["offered"]:
        problems.append(f"UI-002: {card} is not offered ({st['why'][:2]})")
    elif to_grave and not until(g):
        problems.append(f"{card} was offered but not cast (not in her graveyard)")
    return result(problems, label, found, w)


def aura_none():
    st = {"offered": [], "why": []}

    def policy(g, f):
        w.ask(f)
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay" and seat == 1:
            land = g.play_land(f)
            if land:
                return land
            now = g.state.get(1) or {}
            mine = now.get("activeSeat") == 1 and now.get("phase") in ("MAIN1", "MAIN2") and not stack_of(g, 1)
            if mine and len(g.untapped_lands(1)) >= 2 and g.mine(1, "hand", name="Pacifism"):
                if offered(g, f, "Pacifism"):
                    st["offered"].append(g.turn)
                why = f.get("unavailable") or {}
                st["why"] += [why.get(c["id"]) for c in g.mine(1, "hand", name="Pacifism")]
            return None
        if kind == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        return DEFAULT

    g = game("aura-none", [("Plains", 40), ("Pacifism", 20)], [("Island", 60)],
             deal={1: {"hand": plains(3) + ["Pacifism"] * 4, "top": plains(10)},
                   2: {"hand": ["Island"] * 7, "top": ["Island"] * 10}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), len(st["why"]) >= 8)[1], max_turn=8)
    w.see()
    found = {"stopped": g.stopped_badly(), "offered": st["offered"], "why": sorted(set(map(str, st["why"])))}
    if not st["why"] and not st["offered"]:
        return "inconclusive", "Alice never had two lands with Pacifism in hand", found
    problems = []
    if st["offered"]:
        problems.append(f"F-0108-C: Pacifism offered with no creature to enchant: turns {st['offered'][:3]}")
    if any(not (r or "").startswith(NO_TARGET_WORDS) for r in st["why"]):
        problems.append(f"F-0108-C: the reason is a no-target sentence: {found['why']}")
    return result(problems, f"Pacifism with no creature: not offered, {found['why']}", found, w)


def charm_other_mode():
    return stays_offered(
        "charm-other-mode", "Izzet Charm with nothing to counter and no creature: offered, cast for its draw mode",
        [("Island", 20), ("Mountain", 20), ("Izzet Charm", 20)],
        {"hand": ["Island", "Mountain", "Island", "Mountain", "Izzet Charm", "Izzet Charm", "Island"],
         "top": ["Mountain", "Island"] * 6},
        "Izzet Charm", [("Plains", 60)], {"hand": plains(7), "top": plains(10)}, 2)


def up_to_one():
    return stays_offered(
        "up-to-one", "Plunge into Winter (up to one target) with no creature: offered and cast",
        [("Plains", 40), ("Plunge into Winter", 20)],
        {"hand": plains(3) + ["Plunge into Winter"] * 3 + ["Plains"], "top": plains(10)},
        "Plunge into Winter", [("Island", 60)], {"hand": ["Island"] * 7, "top": ["Island"] * 10}, 2)


def rebuke_stops():
    st = {"theirs": [], "offered": [], "asked": 0}

    def policy(g, f):
        w.ask(f)
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay" and seat == 1:
            st["asked"] += 1
            s = g.state.get(1) or {}
            if s.get("activeSeat") == 2 and not stack_of(g, 1):
                st["theirs"].append((g.turn, s.get("phase")))
            if offered(g, f, "Rebuke"):
                st["offered"].append(g.turn)
            return g.play_land(f)
        if kind == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        return DEFAULT

    g = game("rebuke-stops", [("Plains", 40), ("Rebuke", 20)], [("Forest", 60)],
             deal={1: {"hand": plains(3) + ["Rebuke"] * 4, "top": plains(10)},
                   2: {"hand": ["Forest"] * 7, "top": ["Forest"] * 10}},
             stops={1: True, 2: True})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), False)[1], max_turn=8)
    w.see()
    found = {"stopped": g.stopped_badly(), "asked": st["asked"], "theirs": st["theirs"][:6],
             "offered": st["offered"][:4], "turn": g.turn}
    if g.turn < 6:
        return "inconclusive", "the game ended before turn 6", found
    problems = []
    if st["theirs"]:
        problems.append(f"F-0108-D: Alice was stopped on Bob's turn for a Rebuke she can't cast: {st['theirs'][:4]}")
    if st["offered"]:
        problems.append(f"F-0108-D: Rebuke offered with nothing attacking: {st['offered'][:3]}")
    if not st["asked"]:
        problems.append("Alice was never asked at all (her own main phase stops are the rule's)")
    return result(problems, f"Rebuke and Plains only: never stopped on Bob's turn ({st['asked']} questions, "
                            "all on her own turn)", found, w)


# --- Slayer of the Wicked's trigger on the stack ---------------------------------------------

SLAYER_SAYS = "you may destroy target Vampire, Werewolf, or Zombie."


def slayer():
    st = {"resonator": False, "slayer": None, "copied": False, "stifle": None, "labels": [], "ghoul": None,
          "trigger_target": None}

    def policy(g, f):
        w.ask(f)
        kind, seat = f.get("kind"), f["authorisedSeat"]
        trigger = [e for e in stack_of(g, seat) if e.get("name") == "Slayer of the Wicked"
                   and e.get("kind") == "trigger"]
        if kind == "chooseSpellAbilityToPlay" and seat == 1:
            if trigger and not st["copied"]:
                o = next((o["actionId"] for o in f["options"]
                          if card_of(o.get("actionId")) in {c["id"] for c in g.mine(1, name="Strionic Resonator")}),
                         None)
                if o and len(g.untapped_lands(1)) >= 2:
                    st["copied"] = True
                    return o
                return None
            if stack_of(g, 1):
                return None
            land = g.play_land(f)
            if land:
                return land
            if not st["resonator"] and len(g.untapped_lands(1)) >= 2:
                o = cast_named(g, f, "Strionic Resonator")
                st["resonator"] = bool(o)
                return o
            ghoul = g.zone(1, "battlefield", owner=2, name="Butcher Ghoul")
            if st["resonator"] and st["slayer"] is None and ghoul and len(g.untapped_lands(1)) >= 6:
                o = cast_named(g, f, "Slayer of the Wicked")
                if o:
                    st["slayer"], st["ghoul"] = g.turn, ghoul[0]["id"]
                return o
            return None
        if kind == "chooseTargetsFor" and seat == 1:
            # The trigger's target, the copy's (the same Ghoul), the Resonator's (the trigger).
            ghoul = next((o["actionId"] for o in f["options"] if card_of(o.get("actionId")) == st["ghoul"]), None)
            if ghoul:
                st["trigger_target"] = ghoul
                return ghoul
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay" and seat == 2:
            # Once the copy is on the stack: its button and the trigger's.
            copy = any(e.get("copy") for e in stack_of(g, 2))
            if trigger and copy and st["stifle"] is None:
                o = cast_named(g, f, "Stifle")
                st["stifle"] = bool(o) or None
                return o
            if stack_of(g, 2):
                return None
            land = g.play_land(f, prefer="Island" if not g.mine(2, name="Island") else "Swamp")
            if land:
                return land
            if not g.mine(2, name="Butcher Ghoul") and len(g.untapped_lands(2)) >= 3:
                return cast_named(g, f, "Butcher Ghoul")
            return None
        if kind == "chooseTargetsFor" and seat == 2:
            st["labels"] = [o.get("label") for o in f["options"]]
            return next((o["actionId"] for o in f["options"]
                         if (o.get("label") or "").startswith("on the stack: When Slayer")), DEFAULT)
        return DEFAULT

    def until(g):
        w.see()
        return st["stifle"] and not stack_of(g, 1) and not stack_of(g, 2)

    g = game("slayer", [("Plains", 40), ("Strionic Resonator", 10), ("Slayer of the Wicked", 10)],
             [("Swamp", 25), ("Island", 15), ("Butcher Ghoul", 10), ("Stifle", 10)],
             deal={1: {"hand": plains(4) + ["Strionic Resonator", "Slayer of the Wicked", "Plains"],
                       "top": plains(12)},
                   2: {"hand": ["Swamp", "Island", "Swamp", "Butcher Ghoul", "Stifle", "Stifle", "Swamp"],
                       "top": ["Island", "Swamp"] * 6}})
    w = Watch(g)
    g.run(policy, until=until, max_turn=16)
    w.see()
    plates = {}
    for seat in (1, 2):
        plates[seat] = sorted({e.get("description") for b in w.boards(seat)
                               for e in (b.get("stack") or []) + (b.get("copying") or [])
                               if e.get("name") == "Slayer of the Wicked" and e.get("kind") == "trigger"})
    found = {"stopped": g.stopped_badly(), "slayer": st["slayer"], "copied": st["copied"],
             "stifle": st["stifle"], "plates": plates, "labels": st["labels"]}
    if st["slayer"] is None:
        return "inconclusive", "Slayer of the Wicked was never cast with the Ghoul on the table", found
    if not st["stifle"]:
        return "inconclusive", "Stifle was never cast at the trigger", found
    problems = []
    for seat in (1, 2):
        if not plates[seat]:
            problems.append(f"seat {seat} was never shown the trigger on the stack")
        for d in plates[seat]:
            text = (d or "").split(" [")[0]
            if not text.endswith(SLAYER_SAYS):
                problems.append(f"F-0108-E: seat {seat}'s plate reads the sentence whole: {d!r}")
    if not any((b.get("copying") or []) or any(e.get("copy") for e in b.get("stack") or [])
               for b in w.boards(1)):
        problems.append("the trigger was never copied (no copy entry)")
    stacked = [x for x in st["labels"] if (x or "").startswith("on the stack: When Slayer")]
    if len(stacked) < 2:
        problems.append(f"Stifle's target buttons: the trigger and its copy: {st['labels']}")
    return result(problems, "Slayer's trigger, its copy and Stifle's target buttons: the sentence whole, no "
                            "Forge note, both seats", found, w)


SCENARIOS = {"rebuke-none": rebuke_none, "rebuke-attacker": rebuke_attacker, "aura-none": aura_none,
             "charm-other-mode": charm_other_mode, "up-to-one": up_to_one, "rebuke-stops": rebuke_stops,
             "slayer": slayer}

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
            print("  " + json.dumps(found, default=str)[:3000])
        else:
            print("  " + json.dumps(found, default=str)[:1200])
        sys.stdout.flush()
    sys.exit(worst)
