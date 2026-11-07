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
  trample         a Colossal Dreadmaw (6/6 trample) blocked by one Grizzly
                  Bears: the defending player is offered only once the
                  Bears has lethal damage (CR 702.19c) -- points 1 and 2
                  go to the Bears, then every point the player is offered
                  is taken: the Bears dies, the player loses 4; the fight
                  says 6 damage, trample, the Bears needing 2; the wave's
                  fight is the Dreadmaw and the Bears, with 2 to the Bears
                  and 4 to the player
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


def game(name, seat1, seat2=BEARS):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"combat-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


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


def trample():
    g = game("trample", [("Forest", 30), ("Colossal Dreadmaw", 30)])
    w = Waves(g)
    st = {"attacked": False, "blockers": [], "asked": [], "after": None, "life": None, "bears_before": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "assignCombatDamage":
            st.setdefault("fights", []).append((f.get("arrange") or {}).get("damage"))
            ids = [o["actionId"] for o in f["options"]]
            st["asked"].append((seat, "damage:defender" in ids))
            return "damage:defender" if "damage:defender" in ids else ids[0]
        if k == "declareAttackers":
            return attack(g, f, st, "Colossal Dreadmaw", 1) if seat == 1 else None
        if k == "declareBlockers":
            return block(g, f, st, 1) if seat == 2 else None
        if k == "chooseSpellAbilityToPlay" and stack_empty(g):
            name = "Colossal Dreadmaw" if seat == 1 else "Grizzly Bears"
            return g.play_land(f) or (None if st["attacked"] else cast(g, f, name))
        return DEFAULT

    def until(g):
        w.see()
        if st["asked"] and stack_empty(g) and st["after"] is None and g.state.get(1, {}).get("phase") in (
                "COMBAT_END", "MAIN2", "END_OF_TURN", "CLEANUP"):
            st["after"] = {"life": (g.player(1, 2) or {}).get("life"),
                           "grave": sorted(c["id"] for c in g.zone(1, "graveyard", owner=2))}
        return st["after"] is not None and settled(g, w)

    g.run(policy, until=until, max_turn=30)
    found = {"blockers": st["blockers"], "asked": st["asked"], "life": st["life"], "after": st["after"],
             "waves": w.combat(1), "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "the Colossal Dreadmaw was never blocked by one Bears", found
    problems = []
    offered = [has for _, has in st["asked"]]
    if offered[:2] != [False, False]:
        problems.append(f"the player was offered before the Bears had lethal damage: {offered}")
    if not all(offered[2:]):
        problems.append(f"after lethal on the Bears, the player should be offered every point: {offered}")
    if st["blockers"] and st["blockers"][0] not in st["after"]["grave"]:
        problems.append(f"the Bears had lethal damage, but it is not in the graveyard: {st['after']}")
    if st["life"] is not None and st["after"]["life"] != st["life"] - 4:
        problems.append(f"6 trample over a 2/2: the player loses 4, {st['life']} -> {st['after']['life']}")
    fight = (st.get("fights") or [None])[0] or {}
    if fight.get("damage") != 6 or fight.get("trample") is not True             or [b.get("lethal") for b in fight.get("blockers", [])] != [2]:
        problems.append(f"the fight says 6 damage, trample, the Bears needing 2: {fight}")
    # Phase 10 A-13: trample's excess is a hit on the player, in the same fight.
    problems += w.problems()
    waves = w.combat(1)
    wave = waves[0] if len(waves) == 1 else {}
    fights = wave.get("fights") or []
    maw = fights[0].get("attacker") if len(fights) == 1 else None
    bears = st["blockers"][0] if st["blockers"] else None
    if wave.get("combat") != "regular" or w.names.get(maw) != "Colossal Dreadmaw" \
            or fights[0].get("blockers") != [bears] or fights[0].get("defender") != {"player": 2}:
        problems.append(f"one regular wave, one fight: the Dreadmaw at player 2, blocked by the Bears: {waves}")
    elif hits_of(wave) != sorted([(maw, to_card(bears), 2), (maw, to_player(2), 4), (bears, to_card(maw), 2)]):
        problems.append(f"the wave's hits: 2 to the Bears, 4 trampling over to player 2, 2 back: {wave}")
    return outcome(problems, "Colossal Dreadmaw: 2 to the Bears first (lethal), then 4 trampled over to the "
                             "player; the wave tells both in the one fight", found)


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
             [("Plains", 30), ("Benalish Faithbonder", 15), ("Savannah Lions", 15)], [("Forest", 60)])
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


SCENARIOS = {"double-block": double_block, "trample": trample, "wolf-yes": lambda: wolf(True), "wolf-no": lambda: wolf(False),
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
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_])
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:1200])
        sys.stdout.flush()
    # A wrong answer outranks a game that never got there.
    sys.exit(1 if 1 in codes else max(codes, default=0))
