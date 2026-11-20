"""Combat damage the attacking player decides: it lands where they said. PHASE_08 P8-E.

    python -I scripts/check-combat-choices.py <worker.jar> <res-root> [trace-dir] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B):

  double-block    a Hill Giant blocked by two Grizzly Bears: its player
                  assigns the damage one point at a time
                  (assignCombatDamage) and puts every point on the LAST
                  Bears offered -- that one dies, the other is untouched.
                  Each question carries the whole fight for the page's one
                  window (owner item 5): 3 damage, both Bears needing 2.
                  Phase 10 A-13: the damage wave says so -- "regular",
                  one fight (the Giant, both Bears), every hit
  trample-auto    spec 0107: a Colossal Dreadmaw (6/6 trample) blocked by one
                  Grizzly Bears; its seat follows the stops rule and is asked
                  at declare blockers only for "Change split" (the option
                  carries the fight: 6, the Bears needing 2, the usual 2 and
                  4); passed: no damage question, the Bears dies, the player
                  loses 4, nobody is told anything; the wave as A-13's
  trample-kept    the same, "Change split" chosen and every point put on the
                  Bears (the player offered only once it has lethal, CR
                  702.19c): asked at declare blockers, never at damage; the
                  player loses nothing and seat 2 alone is told "Alice put all
                  six on your Grizzly Bears; none trampled over."
  trample-unblocked  the Dreadmaw unblocked: no "Change split", no question, 6
  trample-two-blockers  the Dreadmaw blocked by a Bears and a Llanowar Elves:
                  2 and 1, 3 to the player, no question
  trample-elf-dies  Heedless One (five Elves) and an Elves attack; the Elves
                  dies to a White Knight's first strike: 4 now, so 2 and 2
  trample-elf-plan  the same with a plan made at 5: asked again at damage,
                  filled in from 4
  trample-deathtouch  Typhoid Rats with Rancor (3/1 deathtouch, trample) into a
                  Wall of Wood: 1 and 2, no question
  wolf-yes        Lone Wolf, blocked: "assign its damage as though it
                  weren't blocked?" (confirmStaticApplication) -- Yes: the
                  defending player loses 2, the blocker takes nothing
  wolf-no         the same, No: the blocker takes the 2 and dies, the
                  defending player loses nothing

  exert-last      two Glory-Bound Initiates attack: "Exert which
                  attackers?" (exertAttackers) -- the LAST one, then Done:
                  7 damage, 4 life, and next turn that one alone stays tapped
                  (A-13: unblocked, each hits the player; the 4 gained is
                  told as lifelink from the exerted one)
  exert-none      the same, Done at once: 6 damage, nothing gained, both untap
  first-strike    Phase 10 A-13: a White Knight (first strike) blocked by a
                  Grizzly Bears: a "first-strike" wave with the Knight's 2 to
                  the Bears and the fight; the dead Bears deals nothing after
  planeswalker    Phase 10 A-13: a Grizzly Bears attacks Liliana of the Veil,
                  unblocked: the wave's fight is at her, and her 2 damage is
                  a hit (Forge sends no event for it; the worker reads it
                  from Forge's damage history)
  deathtouch      Phase 10 A-13: a Vampire Nighthawk (deathtouch, lifelink)
                  blocked by a Giant Spider: its hit is marked deathtouch, the
                  2 life gained names it, and the Spider dies
  enlist-last     a Faithbonder attacks: "Enlist with which attackers?" --
                  it; the creature to tap (CostEnlist) -- the LAST at home:
                  1 + its power in damage, and only it tapped
  enlist-none     the same, none enlisted: 1 damage, nothing else tapped
  prison-pay      Ghostly Prison: a Bears attacks only if {2} is paid
                  (payCombatCost); the mana question names it -- paid: 2 damage
  prison-no       the same, passed: it does not attack

Only the attacking player is asked; the cross-game checks read these
traces in CI.

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
WALLS = [("Forest", 30), ("Wall of Wood", 30)]


LANDS = {"Forest", "Mountain", "Plains", "Island", "Swamp"}


def curve(deck):
    """The Lab's deal (lab.py) for a lands-and-creatures deck: four lands
    and three of its first creature in hand, then more lands and creatures,
    so each seat has the board its fight needs on the first game (the
    shuffle once left a seat with no creature). Spells after the first are
    left to the shuffle; a scenario that needs one names it."""
    land = next(n for n, *_ in deck if n in LANDS)
    spells = [n for n, *_ in deck if n not in LANDS]
    return {"hand": [land] * 4 + [spells[0]] * 3, "top": [land] * 3 + [spells[0], land] * 3} if spells         else {"hand": [land] * 7, "top": [land] * 4}


def game(name, seat1, seat2=BEARS, deal=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"combat-{name}.jsonl")
    deal = deal or {1: curve(seat1), 2: curve(seat2)}
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal)


def stack_empty(g):
    return not g.state.get(1, {}).get("stack") and not g.state.get(2, {}).get("stack")


def cast(g, f, name):
    o = g.option(f, name=name, zone="hand", land=False)
    if o and any(x["actionId"] == o and x.get("payable") is False for x in f["options"]):
        return None
    return o


def outcome(problems, ok, found):
    if found.get("stopped"):
        problems = problems + [found["stopped"]]
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


class Waves:
    """Phase 10 A-13 -- every damage wave each seat was sent, and every
    card's name as either seat saw it (for a failure report)."""

    def __init__(self, g):
        self.g = g
        self.seen = {1: [], 2: []}
        self.names = {}

    def see(self):
        for seat in (1, 2):
            s = self.g.state.get(seat) or {}
            for zone in ("battlefield", "graveyard"):
                for c in s.get(zone) or []:
                    if c.get("id"):
                        self.names[c["id"]] = c.get("name")
            d = s.get("damage")
            if d and d.get("key") not in [x.get("key") for x in self.seen[seat]]:
                self.seen[seat].append(d)

    def combat(self, seat=1):
        return [d for d in self.seen[seat] if d.get("combat")]

    def problems(self):
        """Both seats are told the same combat waves (damage is public)."""
        mine, theirs = self.combat(1), self.combat(2)
        if [d["key"] for d in mine] != [d["key"] for d in theirs] or mine != theirs:
            return [f"both seats should be sent the same combat waves: {mine} vs {theirs}"]
        return []


def settled(g, w):
    """Both seats have been sent the same number of combat waves (seat 1's
    board arrives first), or the turn has moved on past combat."""
    later = g.state.get(1, {}).get("phase") in ("END_OF_TURN", "CLEANUP")
    return later or (bool(w.combat(1)) and len(w.combat(1)) == len(w.combat(2)))


def hits_of(wave):
    return sorted((h.get("source"), json.dumps(h.get("target"), sort_keys=True), h.get("amount"))
                  for h in wave.get("hits", []))


def to_card(card):
    return json.dumps({"object": card}, sort_keys=True)


def to_player(seat):
    return json.dumps({"player": seat}, sort_keys=True)


def bears_now(g):
    """Seat 2's Bears as SEAT 1's board shows them: the snapshot that just
    arrived is seat 1's, and seat 2's own view may not have caught up."""
    return sorted(c["id"] for c in g.zone(1, "battlefield", owner=2, name="Grizzly Bears"))


def ready(g, seat, name):
    return [c for c in g.mine(seat, name=name) if not c.get("sick") and not c.get("tapped")]


def attack(g, f, st, name, blockers_needed):
    """Seat 1 attacks once with `name`, when seat 2 has the blockers."""
    if st["attacked"] or not ready(g, 1, name) or len(ready(g, 2, "Grizzly Bears")) < blockers_needed:
        return None
    o = next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith(name)), None)
    if o:
        st["attacked"] = True
        st["life"] = (g.player(1, 2) or {}).get("life")
        st["bears_before"] = sorted(c["id"] for c in g.mine(2, name="Grizzly Bears"))
    return o


def block(g, f, st, count):
    """Seat 2 blocks with `count` Bears, one question each, then is done."""
    if not st["attacked"] or len(st["blockers"]) >= count:
        return None
    o = next((o for o in f["options"] if o["actionId"].startswith("blocker:")
              and card_of(o["actionId"]) not in st["blockers"]), None)
    if not o:
        return None
    st["blockers"].append(card_of(o["actionId"]))
    return o["actionId"]


def double_block():
    g = game("double-block", [("Mountain", 30), ("Hill Giant", 30)])
    w = Waves(g)
    st = {"attacked": False, "blockers": [], "asked": [], "picked": None, "after": None, "life": None,
          "bears_before": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "assignCombatDamage":
            st.setdefault("fights", []).append((f.get("arrange") or {}).get("damage"))
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"] if card_of(o["actionId"]))))
            st["picked"] = st["picked"] or card_of(f["options"][-1]["actionId"])
            return next(o["actionId"] for o in f["options"] if card_of(o["actionId"]) == st["picked"])
        if k == "declareAttackers":
            return attack(g, f, st, "Hill Giant", 2) if seat == 1 else None
        if k == "declareBlockers":
            return block(g, f, st, 2) if seat == 2 else None
        if k == "chooseSpellAbilityToPlay" and stack_empty(g):
            name = "Hill Giant" if seat == 1 else "Grizzly Bears"
            return g.play_land(f) or (None if st["attacked"] else cast(g, f, name))
        return DEFAULT

    def until(g):
        w.see()
        if st["asked"] and stack_empty(g) and st["after"] is None and g.state.get(1, {}).get("phase") in (
                "COMBAT_END", "MAIN2", "END_OF_TURN", "CLEANUP"):
            st["after"] = {"bears": bears_now(g), "grave": sorted(c["id"] for c in g.zone(1, "graveyard", owner=2))}
        return st["after"] is not None and settled(g, w)

    g.run(policy, until=until, max_turn=24)
    found = {"blockers": st["blockers"], "asked": st["asked"][:2], "points": len(st["asked"]),
             "picked": st["picked"], "after": st["after"], "waves": w.combat(1), "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "the Hill Giant was never double-blocked", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the defending player was asked to assign the attacker's damage")
    if sorted(st["asked"][0][1]) != sorted(st["blockers"]):
        problems.append(f"offered {st['asked'][0][1]}, not exactly the blockers {st['blockers']}")
    if len(st["asked"]) != 3:
        problems.append(f"a 3-power attacker should be asked 3 times, one point each: {len(st['asked'])}")
    fight = (st.get("fights") or [None])[0] or {}
    want = sorted(st["blockers"])
    got = sorted(b.get("card") for b in fight.get("blockers", []))
    if fight.get("damage") != 3 or got != want or any(b.get("lethal") != 2 for b in fight.get("blockers", []))             or fight.get("trample") or any(f != fight for f in st.get("fights", [])):
        problems.append(f"every question carries the fight: 3 damage, the two Bears needing 2 each: {st.get('fights')}")
    spared = [b for b in st["blockers"] if b != st["picked"]]
    after = st["after"] or {}
    if st["picked"] not in after.get("grave", []):
        problems.append(f"all 3 damage went to {st['picked']}, but it is not in the graveyard: {after}")
    if any(b not in after.get("bears", []) for b in spared):
        problems.append(f"{spared} took no damage, but did not survive: {after}")
    # Phase 10 A-13: the wave the page plays the fight from.
    problems += w.problems()
    waves = w.combat(1)
    wave = waves[0] if len(waves) == 1 else {}
    fights = wave.get("fights") or []
    giant = fights[0].get("attacker") if len(fights) == 1 else None
    if wave.get("combat") != "regular" or len(fights) != 1 or w.names.get(giant) != "Hill Giant" \
            or sorted(fights[0].get("blockers", [])) != sorted(st["blockers"]) \
            or fights[0].get("defender") != {"player": 2}:
        problems.append(f"one regular wave, one fight: the Hill Giant at player 2, blocked by both Bears: {waves}")
    else:
        want = sorted([(giant, to_card(st["picked"]), 3)] + [(b, to_card(giant), 2) for b in st["blockers"]])
        if hits_of(wave) != want:
            problems.append(f"the wave's hits: 3 to the Bears picked, 2 from each Bears to the Giant: {wave}")
    return outcome(problems, "the Hill Giant's player put every point on the Bears picked: that one died, the "
                             "other is untouched; the wave tells the one fight, both Bears in it", found)


class Trample:
    """Spec 0107 -- what one trample game saw: the stops that offered "Change
    split" (each split option's fight, the phase), every damage question
    (its phase and fight), and every report each seat was sent."""

    def __init__(self, g):
        self.g = g
        self.stops = []      # (seat, phase, [split options])
        self.questions = []  # (seat, phase, fight, offered the defender?)
        self.reports = {1: [], 2: []}

    def phase(self):
        return self.g.state.get(1, {}).get("phase")

    def see(self):
        for seat in (1, 2):
            board = self.g.state.get(seat) or {}
            a = board.get("action")
            for r in ([a] + list(a.get("gathered") or [])) if a else []:
                if r.get("said") and r["said"] not in self.reports[seat]:
                    self.reports[seat].append(r["said"])

    def splits(self, f):
        """The frame's "Change split" options (recorded when there are any)."""
        out = [o for o in f["options"] if o["actionId"].startswith("split:")]
        if f.get("kind") == "chooseSpellAbilityToPlay" and out:
            self.stops.append((f["authorisedSeat"], self.phase(), out))
        return out

    def question(self, f):
        ids = [o["actionId"] for o in f["options"]]
        self.questions.append((f["authorisedSeat"], self.phase(), (f.get("arrange") or {}).get("damage"),
                               "damage:defender" in ids))
        return ids

    def kept(self, seat):
        return [r for r in self.reports[seat] if "trampled over" in r]

    def problems(self, attacker, blockers):
        """Every stop's split option: no object of its own, its fight the
        attacker and these blockers, offered to seat 1 at declare blockers."""
        out = []
        if not self.stops:
            return ["the attacker's seat was never stopped at declare blockers with 'Change split'"]
        for seat, phase, options in self.stops:
            if seat != 1 or phase != "COMBAT_DECLARE_BLOCKERS":
                out.append(f"'Change split' offered to seat {seat} at {phase}")
            for o in options:
                fight = o.get("fight") or {}
                if o.get("objectId") or o.get("label") != "Change split" or fight.get("attacker") != attacker \
                        or sorted(b.get("card") for b in fight.get("blockers", [])) != sorted(blockers) \
                        or fight.get("trample") is not True:
                    out.append(f"the split option carries its fight, no object: {o}")
        return out


def stops_seen(t):
    return [(s, p, [o.get("fight") for o in os]) for s, p, os in t.stops]


def first_fight(t):
    return (t.stops[0][2][0].get("fight") or {}) if t.stops else {}


def trample_game(name, seat1, seat2=BEARS, deal=None, stops=None):
    g = game(name, seat1, seat2, deal=deal)
    if stops:
        g.stops = stops
    return g


def trample(change):
    """F-0107-A (change=False) and F-0107-B (change=True): a Colossal
    Dreadmaw (6/6 trample) blocked by a Grizzly Bears. Seat 1 follows the
    stops rule, so it is asked at declare blockers only because "Change
    split" is there. Passed: no damage question, 2 to the Bears and 4 to the
    player, and no report. Changed (every point on the Bears): the damage
    questions come at declare blockers (the player offered only once the
    Bears has lethal, CR 702.19c), none at damage; the player loses nothing
    and seat 2 alone is told why."""
    g = trample_game("trample-kept" if change else "trample-auto", [("Forest", 30), ("Colossal Dreadmaw", 30)],
                     stops={1: True})
    w = Waves(g)
    t = Trample(g)
    st = {"attacked": False, "blockers": [], "after": None, "life": None, "bears_before": None, "changed": False}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        t.see()
        if k == "assignCombatDamage":
            ids = t.question(f)
            # Changed: every point on the Bears, never the player.
            return next(i for i in ids if i != "damage:defender")
        if k == "declareAttackers":
            return attack(g, f, st, "Colossal Dreadmaw", 1) if seat == 1 else None
        if k == "declareBlockers":
            return block(g, f, st, 1) if seat == 2 else None
        splits = t.splits(f)
        if splits and change and not st["changed"]:
            st["changed"] = True
            return splits[0]["actionId"]
        if k == "chooseSpellAbilityToPlay" and stack_empty(g):
            name = "Colossal Dreadmaw" if seat == 1 else "Grizzly Bears"
            return g.play_land(f) or (None if st["attacked"] else cast(g, f, name))
        return DEFAULT

    def until(g):
        w.see()
        t.see()
        if st["blockers"] and stack_empty(g) and st["after"] is None and t.phase() in (
                "COMBAT_END", "MAIN2", "END_OF_TURN", "CLEANUP"):
            st["after"] = {"life": (g.player(1, 2) or {}).get("life"),
                           "grave": sorted(c["id"] for c in g.zone(1, "graveyard", owner=2))}
        # Seat 2's report comes once the damage step is over: wait until it has a later board.
        later = t.phase() in ("END_OF_TURN", "CLEANUP") or (t.phase() == "MAIN2" and (not change or t.kept(2)))
        return st["after"] is not None and settled(g, w) and later

    g.run(policy, until=until, max_turn=30)
    t.see()
    found = {"blockers": st["blockers"], "stops": stops_seen(t), "questions": t.questions, "life": st["life"],
             "after": st["after"], "reports": t.reports, "waves": w.combat(1), "stopped": g.stopped_badly()}
    if not st["blockers"] or not st["after"]:
        return "inconclusive", "the Colossal Dreadmaw was never blocked by one Bears", found
    problems = []
    bears = st["blockers"][0]
    maw = next((f.get("attacker") for d in w.combat(1) for f in d.get("fights", [])), None)
    problems += t.problems(maw, [bears])
    fight = first_fight(t)
    if fight.get("damage") != 6 or [b.get("lethal") for b in fight.get("blockers", [])] != [2] \
            or fight.get("usual") != {"blockers": [2], "player": 4}:
        problems.append(f"the split's fight: 6 damage, the Bears needing 2, the usual split 2 and 4: {fight}")
    if bears not in st["after"]["grave"]:
        problems.append(f"the Bears had lethal damage, but it is not in the graveyard: {st['after']}")
    at_damage = [q for q in t.questions if q[1] != "COMBAT_DECLARE_BLOCKERS"]
    if at_damage:
        problems.append(f"no damage question at damage (the split is made, or kept): {at_damage}")
    problems += w.problems()
    lost = (st["life"] or 0) - (st["after"]["life"] or 0)
    if change:
        offered = [q[3] for q in t.questions]
        if len(t.questions) != 6 or offered[:2] != [False, False] or not all(offered[2:]):
            problems.append(f"changed: six points asked at declare blockers, the player offered only once the "
                            f"Bears has lethal: {t.questions}")
        if lost != 0:
            problems.append(f"every point on the Bears: the player loses nothing, lost {lost}")
        want = "Alice put all six on your Grizzly Bears; none trampled over."
        if t.kept(2) != [want]:
            problems.append(f"seat 2 is told {want!r}: {t.reports[2]}")
        if t.kept(1):
            problems.append(f"the attacker's own seat is never told: {t.reports[1]}")
    else:
        if t.questions:
            problems.append(f"passed at the stop: never a damage question: {t.questions}")
        if lost != 4:
            problems.append(f"the usual split: 4 trampled over, lost {lost}")
        if t.kept(1) or t.kept(2):
            problems.append(f"the usual split: no report: {t.reports}")
        waves = w.combat(1)
        wave = waves[0] if len(waves) == 1 else {}
        if hits_of(wave) != sorted([(maw, to_card(bears), 2), (maw, to_player(2), 4), (bears, to_card(maw), 2)]):
            problems.append(f"the wave's hits: 2 to the Bears, 4 trampling over to player 2, 2 back: {wave}")
    return outcome(problems, ("Change split: all six on the Bears, asked at declare blockers; none trampled "
                              "over, and only seat 2 was told") if change else
                   ("passed at the trample stop: no question, the split made for the player, 2 to the Bears "
                    "and 4 trampled over"), found)


def trample_unblocked():
    """F-0107-F: a Colossal Dreadmaw nobody blocks: no "Change split", no
    damage question, all 6 to the player."""
    g = trample_game("trample-unblocked", [("Forest", 30), ("Colossal Dreadmaw", 30)])
    t = Trample(g)
    st = {"attacked": False, "after": None, "life": None, "turn": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        t.splits(f)
        if k == "assignCombatDamage":
            t.question(f)
            return DEFAULT
        if k == "declareAttackers":
            if seat != 1 or st["attacked"] or not ready(g, 1, "Colossal Dreadmaw"):
                return None
            o = next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith("Colossal")), None)
            if o:
                st["attacked"], st["turn"] = True, g.turn
                st["life"] = (g.player(1, 2) or {}).get("life")
            return o
        if k == "declareBlockers":
            return None
        if k == "chooseSpellAbilityToPlay" and stack_empty(g):
            return g.play_land(f) or (None if st["attacked"] or seat == 2 else cast(g, f, "Colossal Dreadmaw"))
        return DEFAULT

    def until(g):
        if st["attacked"] and st["after"] is None and g.turn == st["turn"] and t.phase() in ("MAIN2", "END_OF_TURN"):
            st["after"] = (g.player(1, 2) or {}).get("life")
        return st["after"] is not None

    g.run(policy, until=until, max_turn=30)
    found = {"stops": stops_seen(t), "questions": t.questions, "life": [st["life"], st["after"]],
             "stopped": g.stopped_badly()}
    if st["after"] is None:
        return "inconclusive", "the Colossal Dreadmaw never attacked", found
    problems = []
    if t.stops:
        problems.append(f"an unblocked trampler: no 'Change split': {t.stops}")
    if t.questions:
        problems.append(f"an unblocked trampler: no damage question: {t.questions}")
    if st["life"] - st["after"] != 6:
        problems.append(f"unblocked: all 6 to the player, lost {st['life'] - st['after']}")
    return outcome(problems, "an unblocked trampler: no stop, no question, 6 to the player", found)


def trample_two_blockers():
    """F-0107-C: a Colossal Dreadmaw blocked by a Grizzly Bears and a
    Llanowar Elves: the usual split is 2 and 1, the rest 3 to the player,
    no question."""
    seat2 = [("Forest", 30), ("Grizzly Bears", 15), ("Llanowar Elves", 15)]
    g = trample_game("trample-two-blockers", [("Forest", 30), ("Colossal Dreadmaw", 30)], seat2,
                     deal={1: curve([("Forest", 30), ("Colossal Dreadmaw", 30)]),
                           2: {"hand": ["Forest"] * 4 + ["Grizzly Bears", "Llanowar Elves", "Grizzly Bears"],
                               "top": ["Forest", "Llanowar Elves"] * 3}})
    w = Waves(g)
    t = Trample(g)
    st = {"attacked": False, "blockers": [], "names": {}, "after": None, "life": None}

    def ready_pair():
        return ready(g, 2, "Grizzly Bears") and ready(g, 2, "Llanowar Elves")

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        t.splits(f)
        if k == "assignCombatDamage":
            t.question(f)
            return DEFAULT
        if k == "declareAttackers":
            if seat != 1 or st["attacked"] or not ready(g, 1, "Colossal Dreadmaw") or not ready_pair():
                return None
            o = next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith("Colossal")), None)
            if o:
                st["attacked"] = True
                st["life"] = (g.player(1, 2) or {}).get("life")
            return o
        if k == "declareBlockers":
            if seat != 2 or not st["attacked"]:
                return None
            for name in ("Grizzly Bears", "Llanowar Elves"):
                if name in st["names"].values():
                    continue
                ids = [c["id"] for c in ready(g, 2, name)]
                o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) in ids
                          and o["actionId"].startswith("blocker:")), None)
                if o:
                    st["blockers"].append(card_of(o))
                    st["names"][card_of(o)] = name
                    return o
            return None
        if k == "chooseSpellAbilityToPlay" and stack_empty(g):
            if seat == 1:
                return g.play_land(f) or (None if st["attacked"] else cast(g, f, "Colossal Dreadmaw"))
            # One of each: an Elves that keeps paying for more is never untapped to block.
            land = g.play_land(f)
            if land or st["attacked"]:
                return land
            for name in ("Llanowar Elves", "Grizzly Bears"):
                if not g.mine(2, name=name):
                    return cast(g, f, name)
            return None
        return DEFAULT

    def until(g):
        w.see()
        if len(st["blockers"]) == 2 and stack_empty(g) and st["after"] is None and t.phase() in (
                "COMBAT_END", "MAIN2", "END_OF_TURN", "CLEANUP"):
            st["after"] = {"life": (g.player(1, 2) or {}).get("life"),
                           "grave": sorted(c["id"] for c in g.zone(1, "graveyard", owner=2))}
        return st["after"] is not None and settled(g, w)

    g.run(policy, until=until, max_turn=30)
    found = {"blockers": st["names"], "stops": stops_seen(t), "questions": t.questions, "life": st["life"],
             "after": st["after"], "waves": w.combat(1), "stopped": g.stopped_badly()}
    if len(st["blockers"]) != 2 or not st["after"]:
        return "inconclusive", "the Dreadmaw was never blocked by a Bears and an Elves", found
    problems = []
    maw = next((f.get("attacker") for d in w.combat(1) for f in d.get("fights", [])), None)
    problems += t.problems(maw, st["blockers"])
    fight = first_fight(t)
    lethal = sorted(b.get("lethal") for b in fight.get("blockers", []))
    usual = fight.get("usual") or {}
    if fight.get("damage") != 6 or lethal != [1, 2] or usual.get("player") != 3 \
            or sorted(usual.get("blockers") or []) != [1, 2]:
        problems.append(f"the split's fight: 6 damage, lethal 2 and 1, the usual split 2, 1 and 3: {fight}")
    if t.questions:
        problems.append(f"two blockers and trample: the split is made, never asked: {t.questions}")
    if (st["life"] or 0) - (st["after"]["life"] or 0) != 3:
        problems.append(f"2 and 1 to the blockers, 3 to the player: {st['life']} -> {st['after']['life']}")
    if any(b not in st["after"]["grave"] for b in st["blockers"]):
        problems.append(f"both blockers had lethal damage and died: {st['after']}")
    waves = w.combat(1)
    wave = waves[0] if len(waves) == 1 else {}
    on = sorted((st["names"].get(h["target"].get("object"), "player"), h["amount"]) for h in wave.get("hits", [])
                if h.get("source") == maw)
    if on != sorted([("Grizzly Bears", 2), ("Llanowar Elves", 1), ("player", 3)]):
        problems.append(f"the Dreadmaw's hits: 2 to the Bears, 1 to the Elves, 3 to the player: {on}")
    return outcome(problems, "two blockers: the split made for the player, 2 and 1, and 3 trampled over", found)


def trample_elf(plan):
    """F-0107-D: Heedless One (an Elf; power and toughness each the number of
    Elves on the battlefield, five) and a Llanowar Elves attack; a Grizzly
    Bears blocks Heedless One and a White Knight (first strike) the Elves.
    The Elves dies in the first-strike step, so Heedless One deals 4: the
    usual split becomes 2 and 2, no question (plan=False). With a plan made
    for 5 (plan=True: every point on the Bears), it no longer adds up, so
    the damage question is asked at damage, filled in from 4."""
    seat1 = [("Forest", 24), ("Llanowar Elves", 26), ("Heedless One", 10)]
    seat2 = [("Plains", 20), ("Forest", 10), ("White Knight", 15), ("Grizzly Bears", 15)]
    deal = {1: {"hand": ["Forest"] * 3 + ["Llanowar Elves"] * 3 + ["Heedless One"],
                "top": ["Forest", "Llanowar Elves", "Forest", "Llanowar Elves", "Forest", "Heedless One"]},
            2: {"hand": ["Plains"] * 3 + ["Forest"] * 2 + ["White Knight", "Grizzly Bears"],
                "top": ["Plains", "Forest", "White Knight", "Grizzly Bears", "Plains"]}}
    g = trample_game("trample-elf-plan" if plan else "trample-elf-dies", seat1, seat2, deal=deal)
    w = Waves(g)
    t = Trample(g)
    st = {"attackers": [], "blocks": {}, "pending": None, "after": None, "life": None, "changed": False,
          "turn": None}

    def elves():
        return [c for c in g.zone(1, "battlefield") if c.get("name") in ("Llanowar Elves", "Heedless One")]

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "assignCombatDamage":
            ids = t.question(f)
            if t.phase() == "COMBAT_DECLARE_BLOCKERS":
                return next(i for i in ids if i != "damage:defender")
            return "damage:defender" if "damage:defender" in ids else ids[0]
        if k == "declareAttackers":
            if seat != 1 or (st["turn"] is not None and g.turn != st["turn"]):
                return None
            heedless = ready(g, 1, "Heedless One")
            elf = ready(g, 1, "Llanowar Elves")
            if not st["attackers"]:
                if not heedless or not elf or len(elves()) != 5 or not ready(g, 2, "Grizzly Bears") \
                        or not ready(g, 2, "White Knight"):
                    return None
                pick = heedless[0]["id"]
            elif len(st["attackers"]) == 1:
                pick = next((c["id"] for c in elf if c["id"] not in st["attackers"]), None)
            else:
                return None
            o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == pick
                      and o["actionId"].startswith("attacker:")), None)
            if o:
                st["attackers"].append(pick)
                st["turn"] = g.turn
                st["life"] = st["life"] or (g.player(1, 2) or {}).get("life")
            return o
        if k == "declareBlockers":
            if seat != 2 or len(st["attackers"]) != 2:
                return None
            for name, target in (("Grizzly Bears", 0), ("White Knight", 1)):
                if name in st["blocks"]:
                    continue
                ids = [c["id"] for c in ready(g, 2, name)]
                o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) in ids
                          and o["actionId"].startswith("blocker:")), None)
                if o:
                    st["blocks"][name] = (card_of(o), st["attackers"][target])
                    st["pending"] = st["attackers"][target]
                    return o
            return None
        if k == "chooseBlockTarget" and seat == 2:
            return next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == st["pending"]),
                        f["options"][0]["actionId"])
        splits = t.splits(f)
        if splits and plan and not st["changed"]:
            st["changed"] = True
            return splits[0]["actionId"]
        if k == "chooseSpellAbilityToPlay" and stack_empty(g):
            land = g.play_land(f)
            if land or st["attackers"]:
                return land
            if seat == 1:
                if not g.mine(1, name="Heedless One"):
                    o = cast(g, f, "Heedless One")
                    if o:
                        return o
                return cast(g, f, "Llanowar Elves") if len(g.mine(1, name="Llanowar Elves")) < 4 else None
            if not g.mine(2, name="White Knight"):
                o = cast(g, f, "White Knight")
                if o:
                    return o
            return None if g.mine(2, name="Grizzly Bears") else cast(g, f, "Grizzly Bears")
        return DEFAULT

    def until(g):
        w.see()
        if len(st["blocks"]) == 2 and stack_empty(g) and st["after"] is None and g.turn == st["turn"] \
                and t.phase() in ("MAIN2", "END_OF_TURN", "CLEANUP"):
            st["after"] = {"life": (g.player(1, 2) or {}).get("life"),
                           "grave": sorted(c["id"] for c in g.zone(1, "graveyard", owner=2)),
                           "mine": sorted(c["id"] for c in g.zone(1, "graveyard", owner=1))}
        return st["after"] is not None and settled(g, w)

    g.run(policy, until=until, max_turn=30)
    found = {"attackers": st["attackers"], "blocks": st["blocks"], "stops": stops_seen(t),
             "questions": t.questions, "life": st["life"], "after": st["after"], "stopped": g.stopped_badly()}
    if len(st["blocks"]) != 2 or not st["after"]:
        return "inconclusive", "Heedless One and an Elves were never blocked by a Bears and a White Knight", found
    heedless, elf = st["attackers"]
    bears = st["blocks"]["Grizzly Bears"][0]
    if elf not in st["after"]["mine"]:
        return "inconclusive", f"the Elves did not die to first strike: {st['after']}", found
    problems = t.problems(heedless, [bears])
    fight = first_fight(t)
    if fight.get("damage") != 5 or fight.get("usual") != {"blockers": [2], "player": 3}:
        problems.append(f"at declare blockers Heedless One is 5: the usual split 2 and 3: {fight}")
    at_damage = [q for q in t.questions if q[1] != "COMBAT_DECLARE_BLOCKERS"]
    if plan:
        early = [q for q in t.questions if q[1] == "COMBAT_DECLARE_BLOCKERS"]
        if len(early) != 5:
            problems.append(f"Change split at 5: five points asked at declare blockers: {t.questions}")
        if not at_damage or any((q[2] or {}).get("damage") != 4 for q in at_damage) \
                or [b.get("lethal") for b in (at_damage[0][2] or {}).get("blockers", [])] != [2]:
            problems.append(f"the plan for 5 no longer adds up: asked again at damage, from 4, the Bears "
                            f"needing 2: {at_damage}")
    elif at_damage:
        problems.append(f"no plan: the new usual split is made, never asked: {at_damage}")
    if (st["life"] or 0) - (st["after"]["life"] or 0) != 2:
        problems.append(f"Heedless One is 4 at regular damage: 2 to the Bears, 2 to the player: "
                        f"{st['life']} -> {st['after']['life']}")
    if bears not in st["after"]["grave"]:
        problems.append(f"the Bears had lethal damage, but it is not in the graveyard: {st['after']}")
    return outcome(problems, ("a plan made at 5 no longer fit at 4: asked again at damage, filled in from 4"
                              if plan else "the Elf died first: the split made at 4, 2 and 2, no question"), found)


def trample_deathtouch():
    """F-0107-E: a Typhoid Rats (deathtouch) with Rancor (+2/+0, trample),
    3/1, blocked by a Wall of Wood (0/3): lethal is 1, so the split is 1 and
    2, no question. The Wall deals nothing, so the Rats lives (its squares
    are on the table for the page's pops, fixes0107screen.test.tsx)."""
    seat1 = [("Swamp", 15), ("Forest", 15), ("Typhoid Rats", 15), ("Rancor", 15)]
    deal = {1: {"hand": ["Swamp", "Forest", "Swamp", "Forest", "Typhoid Rats", "Rancor", "Typhoid Rats"],
                "top": ["Swamp", "Forest", "Rancor", "Swamp"]}, 2: curve(WALLS)}
    g = trample_game("trample-deathtouch", seat1, WALLS, deal=deal)
    w = Waves(g)
    t = Trample(g)
    st = {"attacked": False, "blockers": [], "after": None, "life": None, "bears_before": None}

    def rats():
        return g.mine(1, name="Typhoid Rats")

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        t.splits(f)
        if k == "assignCombatDamage":
            t.question(f)
            return DEFAULT
        if k == "chooseTargetsFor" and seat == 1:
            mine = [c["id"] for c in rats()]
            return next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) in mine), DEFAULT)
        if k == "declareAttackers":
            if seat != 1 or st["attacked"] or not g.mine(1, name="Rancor") or not ready(g, 1, "Typhoid Rats") \
                    or not ready(g, 2, "Wall of Wood"):
                return None
            o = next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith("Typhoid Rats")), None)
            if o:
                st["attacked"] = True
                st["life"] = (g.player(1, 2) or {}).get("life")
            return o
        if k == "declareBlockers":
            return block(g, f, st, 1) if seat == 2 else None
        if k == "chooseSpellAbilityToPlay" and stack_empty(g):
            if seat == 2:
                return g.play_land(f) or (None if st["attacked"] else cast(g, f, "Wall of Wood"))
            land = g.play_land(f)
            if land or st["attacked"]:
                return land
            if not rats():
                return cast(g, f, "Typhoid Rats")
            return None if g.mine(1, name="Rancor") else cast(g, f, "Rancor")
        return DEFAULT

    def until(g):
        w.see()
        if st["blockers"] and stack_empty(g) and st["after"] is None and t.phase() in (
                "COMBAT_END", "MAIN2", "END_OF_TURN", "CLEANUP"):
            st["after"] = {"life": (g.player(1, 2) or {}).get("life"),
                           "grave": sorted(c["id"] for c in g.zone(1, "graveyard", owner=2))}
        return st["after"] is not None and settled(g, w)

    g.run(policy, until=until, max_turn=30)
    found = {"blockers": st["blockers"], "stops": stops_seen(t), "questions": t.questions, "life": st["life"],
             "after": st["after"], "waves": w.combat(1), "stopped": g.stopped_badly()}
    if not st["blockers"] or not st["after"]:
        return "inconclusive", "the enchanted Typhoid Rats was never blocked by a Wall of Wood", found
    bears = st["blockers"][0]
    rat = next((f.get("attacker") for d in w.combat(1) for f in d.get("fights", [])), None)
    problems = t.problems(rat, [bears])
    fight = first_fight(t)
    if fight.get("damage") != 3 or [b.get("lethal") for b in fight.get("blockers", [])] != [1] \
            or fight.get("usual") != {"blockers": [1], "player": 2}:
        problems.append(f"deathtouch: the Wall needs 1; the usual split 1 and 2: {fight}")
    if t.questions:
        problems.append(f"deathtouch and trample: the split is made, never asked: {t.questions}")
    if (st["life"] or 0) - (st["after"]["life"] or 0) != 2:
        problems.append(f"1 to the Wall, 2 trampled over: {st['life']} -> {st['after']['life']}")
    if bears not in st["after"]["grave"]:
        problems.append(f"deathtouch: the Wall should be in the graveyard: {st['after']}")
    return outcome(problems, "deathtouch and trample: 1 to the Wall, 2 to the player, no question", found)


def wolf(yes):
    g = game(f"wolf-{'yes' if yes else 'no'}", [("Forest", 30), ("Lone Wolf", 30)])
    st = {"attacked": False, "blockers": [], "asked": [], "after": None, "life": None, "bears_before": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "confirmStaticApplication":
            st["asked"].append((seat, f.get("prompt")))
            return "confirm:yes" if yes else "confirm:no"
        if k == "declareAttackers":
            return attack(g, f, st, "Lone Wolf", 1) if seat == 1 else None
        if k == "declareBlockers":
            return block(g, f, st, 1) if seat == 2 else None
        if k == "chooseSpellAbilityToPlay" and stack_empty(g):
            name = "Lone Wolf" if seat == 1 else "Grizzly Bears"
            return g.play_land(f) or (None if st["attacked"] else cast(g, f, name))
        return DEFAULT

    def until(g):
        if st["asked"] and stack_empty(g) and st["after"] is None and g.state.get(1, {}).get("phase") in (
                "COMBAT_END", "MAIN2", "END_OF_TURN", "CLEANUP"):
            st["after"] = {"life": (g.player(1, 2) or {}).get("life"), "bears": bears_now(g)}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"blockers": st["blockers"], "asked": st["asked"], "life_before": st["life"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Lone Wolf was never blocked and asked", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the defending player was asked about Lone Wolf's damage")
    after = st["after"] or {}
    blocker = st["blockers"][0] if st["blockers"] else None
    if yes:
        if after.get("life") != (st["life"] or 0) - 2:
            problems.append(f"said Yes: the defender should lose 2, went {st['life']} -> {after.get('life')}")
        if blocker not in after.get("bears", []):
            problems.append(f"said Yes: the blocking Bears {blocker} should take nothing and live")
    else:
        if after.get("life") != st["life"]:
            problems.append(f"said No: the defender should lose nothing, went {st['life']} -> {after.get('life')}")
        if blocker in after.get("bears", []):
            problems.append(f"said No: the blocking Bears {blocker} should take 2 and die")
    return outcome(problems, "Lone Wolf: Yes, and its damage went to the player past the blocker" if yes
                   else "Lone Wolf: No, and its damage went to the blocker", found)


def exert(pick):
    """Two Glory-Bound Initiates (3/1; exerted: +1/+3 and lifelink) attack an
    empty board. "Exert which attackers?" (exertAttackers): the LAST one
    offered, then Done -- 4 + 3 damage and 4 life gained, and on seat 1's
    next turn that one is still tapped, the other untapped. Or none: 6
    damage, nothing gained."""
    g = game(f"exert-{'last' if pick else 'none'}", [("Plains", 30), ("Glory-Bound Initiate", 30)],
             [("Forest", 60)])
    w = Waves(g)
    st = {"attackers": [], "asked": [], "picked": None, "turn": None, "life": None,
          "combat": None, "after": None}

    def lives():
        return ((g.player(1, 1) or {}).get("life"), (g.player(1, 2) or {}).get("life"))

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "exertAttackers":
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            if pick and st["picked"] is None:
                st["picked"] = card_of(f["options"][-1]["actionId"])
                return f["options"][-1]["actionId"]
            return None
        if k == "declareAttackers" and seat == 1:
            if st["turn"] is not None and g.turn != st["turn"]:
                return None
            ready = [c["id"] for c in g.mine(1, name="Glory-Bound Initiate")
                     if not c.get("sick") and not c.get("tapped")]
            if len(ready) < 2 and not st["attackers"]:
                return None
            o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) in ready
                      and card_of(o["actionId"]) not in st["attackers"]), None)
            if o and len(st["attackers"]) < 2:
                st["attackers"].append(card_of(o))
                st["turn"], st["life"] = g.turn, st["life"] or lives()
                return o
            return None
        if seat == 1 and k == "chooseSpellAbilityToPlay" and stack_empty(g):
            return g.play_land(f) or (cast(g, f, "Glory-Bound Initiate")
                                      if len(g.mine(1, name="Glory-Bound Initiate")) < 2 else None)
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        return DEFAULT

    def until(g):
        w.see()
        phase = g.state.get(1, {}).get("phase")
        if st["asked"] and st["combat"] is None and g.turn == st["turn"] and phase in ("MAIN2", "END_OF_TURN"):
            st["combat"] = lives()
        if st["combat"] and st["after"] is None and g.turn >= st["turn"] + 2 and phase == "MAIN1":
            st["after"] = {c["id"]: bool(c.get("tapped")) for c in g.mine(1, name="Glory-Bound Initiate")
                           if c["id"] in st["attackers"]}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"attackers": st["attackers"], "asked": st["asked"], "picked": st["picked"],
             "life": [st["life"], st["combat"]], "tapped": st["after"], "waves": w.combat(1)[:2],
             "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "two Initiates never attacked and reached the next turn", found
    problems = []
    seat, offered, prompt = st["asked"][0]
    if seat != 1:
        problems.append("the defending player was asked which attackers to exert")
    if offered != sorted(st["attackers"]):
        problems.append(f"offered {offered}, not exactly the attackers {st['attackers']}")
    (me0, them0), (me1, them1) = st["life"], st["combat"]
    if pick:
        if (them0 - them1, me1 - me0) != (7, 4):
            problems.append(f"one exerted: 7 damage and 4 gained, got {them0 - them1} and {me1 - me0}")
        # Phase 10 A-13: unblocked, each Initiate hits player 2 in its own
        # fight; the 4 gained is the exerted one's lifelink, named.
        waves = [d for d in w.combat(1) if any(h.get("source") in st["attackers"] for h in d.get("hits", []))]
        wave = waves[0] if waves else {}
        fights = sorted((f.get("attacker"), json.dumps(f.get("defender")), tuple(f.get("blockers", [])))
                        for f in wave.get("fights", []))
        if fights != sorted((a, json.dumps({"player": 2}), ()) for a in st["attackers"]):
            problems.append(f"the wave's fights: each Initiate at player 2, unblocked: {wave}")
        if wave.get("gains") != [{"player": 1, "amount": 4, "source": st["picked"]}]:
            problems.append(f"the wave tells the 4 gained as {st['picked']}'s lifelink: {wave.get('gains')}")
        problems += w.problems()
        other = [a for a in st["attackers"] if a != st["picked"]]
        if st["after"].get(st["picked"]) is not True or any(st["after"].get(a) for a in other):
            problems.append(f"next turn {st['picked']} stays tapped, {other} untaps: {st['after']}")
    else:
        if (them0 - them1, me1 - me0) != (6, 0):
            problems.append(f"none exerted: 6 damage, nothing gained, got {them0 - them1} and {me1 - me0}")
        if any(st["after"].values()):
            problems.append(f"none exerted, so both untap: {st['after']}")
        if any(d.get("gains") for d in w.combat(1)):
            problems.append(f"none exerted: no lifelink, so no life gained in the waves: {w.combat(1)}")
    return outcome(problems, "exerted the Initiate picked: 7 damage, 4 life, and it stayed tapped" if pick
                   else "exerted none: 6 damage, both untapped", found)


def prison(pay):
    """Ghostly Prison on the defending side: a Bears attacks only if its
    player pays {2} (payCombatCost). The mana question names the attacker.
    Paid: 2 damage. Passed: it does not attack, no damage."""
    g = game(f"prison-{'pay' if pay else 'no'}", [("Forest", 30), ("Grizzly Bears", 30)],
             [("Plains", 30), ("Ghostly Prison", 30)])
    st = {"attacked": None, "prompts": [], "life": None, "turn": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        prompt = f.get("prompt") or ""
        if k == "applyManaToCost" and seat == 1 and "attack" in prompt:
            st["prompts"].append(prompt)
            return DEFAULT if pay else None
        if k == "declareAttackers" and seat == 1:
            ready = [c["id"] for c in g.mine(1, name="Grizzly Bears") if not c.get("sick") and not c.get("tapped")]
            lands = [c for c in g.mine(1, name="Forest") if not c.get("tapped")]
            prison_out = g.zone(1, "battlefield", owner=2, name="Ghostly Prison")
            if st["attacked"] or not ready or len(lands) < 2 or not prison_out:
                return None
            o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == ready[0]), None)
            if o:
                st["attacked"], st["turn"] = ready[0], g.turn
                st["life"] = (g.player(1, 2) or {}).get("life")
            return o
        if seat == 1 and k == "chooseSpellAbilityToPlay" and stack_empty(g):
            return g.play_land(f) or (None if g.mine(1, name="Grizzly Bears") else cast(g, f, "Grizzly Bears"))
        if seat == 2 and k == "chooseSpellAbilityToPlay" and stack_empty(g):
            return g.play_land(f) or (None if g.mine(2, name="Ghostly Prison") else cast(g, f, "Ghostly Prison"))
        if k == "declareBlockers":
            return None
        return DEFAULT

    def until(g):
        if st["attacked"] and st["after"] is None and g.turn == st["turn"] and \
                g.state.get(1, {}).get("phase") in ("MAIN2", "END_OF_TURN"):
            st["after"] = (g.player(1, 2) or {}).get("life")
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"attacked": st["attacked"], "prompts": st["prompts"], "life": [st["life"], st["after"]],
             "stopped": g.stopped_badly()}
    if not st["prompts"] or st["after"] is None:
        return "inconclusive", "a Bears never attacked into Ghostly Prison", found
    problems = []
    if not st["prompts"][0].startswith("Grizzly Bears attacks: pay its cost, or pass and it doesn't attack."):
        problems.append(f"the payment should name the attacker and say what passing does: {st['prompts'][0]!r}")
    lost = st["life"] - st["after"]
    if lost != (2 if pay else 0):
        problems.append(f"{'paid: 2' if pay else 'passed: no'} damage, got {lost}")
    return outcome(problems, "Ghostly Prison: paid, and the Bears hit for 2" if pay
                   else "Ghostly Prison: passed, and the Bears did not attack", found)


def enlist(pick):
    """One Benalish Faithbonder (1/3, enlist) attacks an empty board while a
    Savannah Lions and another Faithbonder stay home. "Enlist with which
    attackers?" (enlistAttackers) -- it, then Done; the creature to tap
    (CostEnlist) -- the LAST offered: the opponent loses 1 + its power, and
    only it is tapped. Or none: 1 damage, nothing else tapped."""
    g = game(f"enlist-{'last' if pick else 'none'}",
             [("Plains", 30), ("Benalish Faithbonder", 15), ("Savannah Lions", 15)], [("Forest", 60)],
             deal={1: {"hand": ["Plains"] * 4 + ["Benalish Faithbonder"] * 2 + ["Savannah Lions"],
                       "top": ["Plains"] * 4}, 2: curve([("Forest", 60)])})
    st = {"attacker": None, "asked": [], "helpers": None, "picked": None, "power": None, "turn": None,
          "life": None, "after": None}

    def ready():
        return [c for c in g.mine(1) if c.get("kind") == "creature" and not c.get("sick") and not c.get("tapped")]

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "enlistAttackers":
            st["asked"].append((seat, k, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            if pick and not any(a[1] == "enlistAttackers" for a in st["asked"][:-1]):
                return f["options"][-1]["actionId"]
            return None
        if k == "CostEnlist":
            st["asked"].append((seat, k, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            chosen = f["options"][-1]
            st["picked"] = card_of(chosen["actionId"])
            st["power"] = next((c.get("power") for c in g.mine(1) if c["id"] == st["picked"]), None)
            return chosen["actionId"]
        if k == "declareAttackers" and seat == 1:
            if st["attacker"]:
                return None
            bonders = [c["id"] for c in ready() if c.get("name") == "Benalish Faithbonder"]
            if not bonders or len(ready()) < 3:
                return None
            o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == bonders[0]), None)
            if o:
                st["attacker"], st["turn"] = bonders[0], g.turn
                st["helpers"] = sorted(c["id"] for c in ready() if c["id"] != bonders[0])
                st["life"] = (g.player(1, 2) or {}).get("life")
            return o
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay" and stack_empty(g):
            if st["attacker"]:
                return None
            land = g.play_land(f)
            if land:
                return land
            if len(g.mine(1, name="Benalish Faithbonder")) < 2:
                return cast(g, f, "Benalish Faithbonder")
            return None if g.mine(1, name="Savannah Lions") else cast(g, f, "Savannah Lions")
        return DEFAULT

    def until(g):
        if st["attacker"] and st["after"] is None and g.turn == st["turn"] and \
                g.state.get(1, {}).get("phase") in ("MAIN2", "END_OF_TURN"):
            st["after"] = {"life": (g.player(1, 2) or {}).get("life"),
                           "tapped": sorted(c["id"] for c in g.mine(1) if c.get("tapped") and c.get("kind") == "creature"
                                            and c["id"] != st["attacker"])}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"attacker": st["attacker"], "helpers": st["helpers"], "asked": st["asked"], "picked": st["picked"],
             "power": st["power"], "life": st["life"], "after": st["after"], "stopped": g.stopped_badly()}
    if not any(a[1] == "enlistAttackers" for a in st["asked"]) or not st["after"]:
        return "inconclusive", "a Faithbonder never attacked with creatures to enlist", found
    problems = []
    if any(seat != 1 for seat, _, _, _ in st["asked"]):
        problems.append("the defending player was asked about enlisting")
    first = next(a for a in st["asked"] if a[1] == "enlistAttackers")
    if first[2] != [st["attacker"]]:
        problems.append(f"offered {first[2]}, not exactly the attacking Faithbonder {st['attacker']}")
    lost = st["life"] - st["after"]["life"]
    if pick:
        cost = [a for a in st["asked"] if a[1] == "CostEnlist"]
        if not cost or cost[0][2] != st["helpers"]:
            problems.append(f"the creatures to tap should be exactly the ones at home {st['helpers']}: {cost}")
        if lost != 1 + (st["power"] or 0) or st["after"]["tapped"] != [st["picked"]]:
            problems.append(f"enlisted {st['picked']} (power {st['power']}): {1 + (st['power'] or 0)} damage and it "
                            f"alone tapped, got {lost} and {st['after']['tapped']}")
    elif lost != 1 or st["after"]["tapped"] or any(a[1] == "CostEnlist" for a in st["asked"]):
        problems.append(f"none enlisted: 1 damage, nothing else tapped, got {lost} and {st['after']['tapped']}")
    return outcome(problems, "enlisted the creature picked: its power added, and it alone tapped" if pick
                   else "enlisted none: 1 damage, nothing else tapped", found)


def first_strike():
    """Phase 10 A-13: a White Knight (2/2 first strike) blocked by a Grizzly
    Bears. The first-strike step's wave: "first-strike", the fight (the
    Knight, the Bears), the Knight's 2 to the Bears -- and the dead Bears
    deals nothing in the regular step."""
    g = game("first-strike", [("Plains", 30), ("White Knight", 30)])
    w = Waves(g)
    st = {"attacked": False, "blockers": [], "after": None, "life": None, "bears_before": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "declareAttackers":
            return attack(g, f, st, "White Knight", 1) if seat == 1 else None
        if k == "declareBlockers":
            return block(g, f, st, 1) if seat == 2 else None
        if k == "chooseSpellAbilityToPlay" and stack_empty(g):
            name = "White Knight" if seat == 1 else "Grizzly Bears"
            return g.play_land(f) or (None if st["attacked"] else cast(g, f, name))
        return DEFAULT

    def until(g):
        w.see()
        if st["blockers"] and stack_empty(g) and st["after"] is None and g.state.get(1, {}).get("phase") in (
                "MAIN2", "END_OF_TURN", "CLEANUP"):
            st["after"] = {"grave": sorted(c["id"] for c in g.zone(1, "graveyard", owner=2))}
        return st["after"] is not None and settled(g, w)

    g.run(policy, until=until, max_turn=24)
    found = {"blockers": st["blockers"], "after": st["after"], "waves": w.combat(1), "stopped": g.stopped_badly()}
    if not st["blockers"] or not st["after"]:
        return "inconclusive", "the White Knight was never blocked by a Bears", found
    problems = w.problems()
    bears = st["blockers"][0]
    first = [d for d in w.combat(1) if d.get("combat") == "first-strike"]
    wave = first[0] if len(first) == 1 else {}
    fights = wave.get("fights") or []
    knight = fights[0].get("attacker") if len(fights) == 1 else None
    if w.names.get(knight) != "White Knight" or fights[0].get("blockers") != [bears]:
        problems.append(f"one first-strike wave, its fight the Knight and the Bears: {w.combat(1)}")
    elif hits_of(wave) != [(knight, to_card(bears), 2)]:
        problems.append(f"the first-strike wave: the Knight's 2 to the Bears, nothing else: {wave}")
    if any(h.get("source") == bears for d in w.combat(1) for h in d.get("hits", [])):
        problems.append(f"the Bears died to first strike and must deal nothing: {w.combat(1)}")
    if bears not in st["after"]["grave"]:
        problems.append(f"the Bears took 2 first-strike damage, but is not in the graveyard: {st['after']}")
    return outcome(problems, "first strike: its own wave, the Knight's 2 to the Bears in the one fight; the "
                             "Bears dealt nothing", found)


def planeswalker():
    """Phase 10 A-13: a Grizzly Bears attacks Liliana of the Veil (3
    loyalty) and nobody blocks. The wave's one fight is the Bears at her,
    and her 2 damage is a hit -- Forge fires no damage event for a
    planeswalker that is not a creature, so the worker reads it from
    Forge's own damage record."""
    g = game("planeswalker", [("Forest", 30), ("Grizzly Bears", 30)], [("Swamp", 40), ("Liliana of the Veil", 20)])
    w = Waves(g)
    st = {"attacked": None, "walker": None, "after": None}

    def walker():
        return next((c["id"] for c in g.zone(1, "battlefield", owner=2, name="Liliana of the Veil")), None)

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "declareAttackers" and seat == 1:
            if st["attacked"] or not walker() or not ready(g, 1, "Grizzly Bears"):
                return None
            o = next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith("Grizzly Bears")), None)
            st["attacked"] = card_of(o) if o else None
            st["walker"] = walker()
            return o
        if k == "chooseDefender" and seat == 1:
            return next((o["actionId"] for o in f["options"] if o["actionId"] == f"defender:{st['walker']}"), None)
        if k == "declareBlockers":
            return None
        if k == "chooseSpellAbilityToPlay" and stack_empty(g):
            if seat == 2:
                return g.play_land(f) or (None if walker() else cast(g, f, "Liliana of the Veil"))
            return g.play_land(f) or (None if g.mine(1, name="Grizzly Bears") else cast(g, f, "Grizzly Bears"))
        return DEFAULT

    def until(g):
        w.see()
        if st["attacked"] and stack_empty(g) and st["after"] is None and g.state.get(1, {}).get("phase") in (
                "MAIN2", "END_OF_TURN", "CLEANUP"):
            st["after"] = True
        return st["after"] is not None and settled(g, w)

    g.run(policy, until=until, max_turn=24)
    found = {"attacked": st["attacked"], "walker": st["walker"], "waves": w.combat(1), "stopped": g.stopped_badly()}
    if not st["attacked"] or not st["walker"] or not st["after"]:
        return "inconclusive", "a Grizzly Bears never attacked Liliana of the Veil", found
    problems = w.problems()
    waves = [d for d in w.combat(1) if any(h.get("source") == st["attacked"] for h in d.get("hits", []))]
    wave = waves[0] if len(waves) == 1 else {}
    if [(f.get("attacker"), f.get("defender"), f.get("blockers")) for f in wave.get("fights", [])] != \
            [(st["attacked"], {"object": st["walker"]}, [])]:
        problems.append(f"one fight: the Bears at Liliana, unblocked: {w.combat(1)}")
    if hits_of(wave) != [(st["attacked"], to_card(st["walker"]), 2)]:
        problems.append(f"the Bears' 2 to Liliana is a hit in the wave: {wave}")
    return outcome(problems, "the Bears attacked Liliana: one fight at her, her 2 damage told from Forge's "
                             "damage record", found)


def deathtouch():
    """Phase 10 A-13: a Vampire Nighthawk (2/3 flying, deathtouch, lifelink)
    blocked by a Giant Spider (2/4 reach). The hit on the Spider is marked
    deathtouch, the 2 gained is named as the Nighthawk's lifelink, the
    Spider dies and the Nighthawk lives."""
    g = game("deathtouch", [("Swamp", 30), ("Vampire Nighthawk", 30)], [("Forest", 30), ("Giant Spider", 30)])
    w = Waves(g)
    st = {"attacked": False, "blockers": [], "after": None, "life": None, "bears_before": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "declareAttackers":
            if seat != 1 or st["attacked"] or not ready(g, 1, "Vampire Nighthawk") \
                    or not ready(g, 2, "Giant Spider"):
                return None
            o = next((o["actionId"] for o in f["options"]
                      if (o.get("label") or "").startswith("Vampire Nighthawk")), None)
            st["attacked"] = bool(o)
            return o
        if k == "declareBlockers":
            return block(g, f, st, 1) if seat == 2 else None
        if k == "chooseSpellAbilityToPlay" and stack_empty(g):
            name = "Vampire Nighthawk" if seat == 1 else "Giant Spider"
            return g.play_land(f) or (None if st["attacked"] else cast(g, f, name))
        return DEFAULT

    def until(g):
        w.see()
        if st["blockers"] and stack_empty(g) and st["after"] is None and g.state.get(1, {}).get("phase") in (
                "MAIN2", "END_OF_TURN", "CLEANUP"):
            st["after"] = {"grave": sorted(c["id"] for c in g.zone(1, "graveyard", owner=2))}
        return st["after"] is not None and settled(g, w)

    g.run(policy, until=until, max_turn=30)
    found = {"blockers": st["blockers"], "after": st["after"], "waves": w.combat(1), "stopped": g.stopped_badly()}
    if not st["blockers"] or not st["after"]:
        return "inconclusive", "the Vampire Nighthawk was never blocked by a Giant Spider", found
    problems = w.problems()
    spider = st["blockers"][0]
    waves = w.combat(1)
    wave = waves[0] if len(waves) == 1 else {}
    fights = wave.get("fights") or []
    hawk = fights[0].get("attacker") if len(fights) == 1 else None
    if w.names.get(hawk) != "Vampire Nighthawk" or fights[0].get("blockers") != [spider]:
        problems.append(f"one wave, its fight the Nighthawk and the Spider: {waves}")
    else:
        on_spider = [h for h in wave.get("hits", []) if h.get("source") == hawk]
        if [(h.get("target"), h.get("amount"), h.get("deathtouch")) for h in on_spider] != \
                [({"object": spider}, 2, True)]:
            problems.append(f"the Nighthawk's 2 to the Spider, marked deathtouch: {wave}")
        back = [h for h in wave.get("hits", []) if h.get("source") == spider]
        if [(h.get("target"), h.get("amount"), h.get("deathtouch")) for h in back] != [({"object": hawk}, 2, None)]:
            problems.append(f"the Spider's 2 back to the Nighthawk, not deathtouch: {wave}")
        if wave.get("gains") != [{"player": 1, "amount": 2, "source": hawk}]:
            problems.append(f"the 2 gained, named as the Nighthawk's lifelink: {wave.get('gains')}")
    if spider not in st["after"]["grave"]:
        problems.append(f"deathtouch: the Spider should be in the graveyard: {st['after']}")
    return outcome(problems, "deathtouch marked on the Nighthawk's hit, its lifelink named, the Spider dead",
                   found)


SCENARIOS = {"double-block": double_block, "trample-auto": lambda: trample(False),
             "trample-kept": lambda: trample(True), "trample-unblocked": trample_unblocked,
             "trample-two-blockers": trample_two_blockers, "trample-elf-dies": lambda: trample_elf(False),
             "trample-elf-plan": lambda: trample_elf(True), "trample-deathtouch": trample_deathtouch,
             "wolf-yes": lambda: wolf(True), "wolf-no": lambda: wolf(False),
             "exert-last": lambda: exert(True), "exert-none": lambda: exert(False),
             "prison-pay": lambda: prison(True), "prison-no": lambda: prison(False),
             "enlist-last": lambda: enlist(True), "enlist-none": lambda: enlist(False),
             "first-strike": first_strike, "deathtouch": deathtouch, "planeswalker": planeswalker}

if __name__ == "__main__":
    codes = []
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        # A game that never reached its moment proves nothing either way:
        # up to two more, each a fresh shuffle. A WRONG answer is final.
        for _ in range(3):
            verdict_, message, found = scenario()
            if verdict_ != "inconclusive":
                break
            print(f"{name}: never reached its moment ({message}); one more game")
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_])
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:1200])
        sys.stdout.flush()
    # A wrong answer outranks a game that never got there.
    sys.exit(1 if 1 in codes else max(codes, default=0))
