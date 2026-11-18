"""Spec 0101, item 1 -- the survive kinds the worker newly tells (Mechanics
Lab, Layer B). The older rows (regenerated, indestructible, umbra,
protection) are check-survivors.py's.

    python -I scripts/check-survive-rows.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker. What it checks is read
from the snapshots both seats were sent -- a permanent's `counters` and
`preventNext`, the round's `survived` and `left`, the damage wave's
prevented hits and their `by`, a stack entry's `ward` -- never inferred:

  shield-murder  Alice's Murder at Bob's Wingshield Agent (a shield
                 counter): survived "shield", the Agent still there, its
                 shield counter gone; no move off the table
  shield-bolt    Alice's Lightning Bolt at the Agent: a prevented hit
                 (amount 0, prevented 3, by "shield"); the Agent stays, its
                 counter gone
  prevent-next   Alice's Bolt at Bob's Grizzly Bears; Bob answers with
                 Healing Salve's "prevent the next 3": preventNext 3 on the
                 Bears while the Bolt waits, then a prevented hit (prevented
                 3, by "prevent-next") and no preventNext after
  ward           Alice's Bolt at Bob's Tomakul Honor Guard (ward {2}); she
                 does not pay: a stack entry with ward true (Bob's trigger),
                 then `left` names the Bolt's stack entry, countered, by the
                 Guard; the Bolt's move says countered; the Guard stays
  ward-paid      the same, and she pays {2}: the ward entry rises and
                 resolves, nothing is `left`, the Bolt resolves (the Guard
                 dies)
  blockers       (item 3) Bob's Grizzly Bears attack; Alice has Benalish
                 Knight untapped and Llanowar Elves tapped (they attacked in
                 her turn, no vigilance): `blockerCandidates`
                 names the Knight, never the Elves or Bob's cards, from the
                 attack until the blocks, to both; none after the blocks

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


def game(name, seat1, seat2, deal=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"survive-rows-{name}.jsonl")
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

    def cards(self, seat, name=None):
        return [c for s in self.boards(seat) for c in s.get("battlefield") or []
                if name is None or c.get("name") == name]

    def listed(self, seat, key):
        return [e for s in self.boards(seat) for e in (s.get(key) or [])]

    def hits(self, seat):
        out, keys = [], set()
        for s in self.boards(seat):
            d = s.get("damage")
            if d and d.get("key") not in keys:
                keys.add(d.get("key"))
                out.extend(d.get("hits") or [])
        return out

    def stacks(self, seat):
        return [e for s in self.boards(seat) for e in (s.get("stack") or [])]


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def named(g, f, name):
    """The option that casts [name] from the asked seat's hand."""
    seat = f["authorisedSeat"]
    for o in f["options"]:
        label = o.get("label") or ""
        if o.get("payable") is False or "Play land" in label:
            continue
        cid = card_of(o.get("actionId"))
        if any(c.get("id") == cid and c.get("name") == name for c in g.zone(seat, "hand")):
            return o["actionId"]
    return None


def stack_of(g, seat):
    return (g.state.get(seat) or {}).get("stack") or []


def target(f, card_id):
    return next((o["actionId"] for o in f["options"] if card_id and o.get("objectId") == card_id), None)


def first_id(cards):
    return cards[0]["id"] if cards else None


def shields(card):
    return sum(c.get("count", 0) for c in (card or {}).get("counters") or [] if c.get("name") == "SHIELD")


def last_card(w, seat, card_id):
    return next((c for c in (w.boards(seat)[-1].get("battlefield") or []) if c.get("id") == card_id), None)


def bob_creature_first(g, f, creature, land_name="Island"):
    """Seat 2's routine: lands, then [creature] once."""
    if f.get("kind") != "chooseSpellAbilityToPlay":
        return DEFAULT
    land = g.play_land(f)
    if land:
        return land
    if stack_of(g, 2):
        return None
    return None if g.mine(2, name=creature) else named(g, f, creature)


def at_bobs(g, f, spell, creature, st, lands=1, ready=lambda g: True):
    """Seat 1 casts [spell] at Bob's [creature] once (when [ready])."""
    kind = f.get("kind")
    if kind == "chooseSpellAbilityToPlay":
        land = g.play_land(f)
        if land:
            return land
        if stack_of(g, 1) or st["cast"]:
            return None
        if g.zone(1, "battlefield", owner=2, name=creature) and len(g.untapped_lands(1)) >= lands and ready(g):
            o = named(g, f, spell)
            st["cast"] = bool(o)
            return o
        return None
    if kind == "chooseTargetsFor":
        return target(f, first_id(g.zone(1, "battlefield", owner=2, name=creature))) or DEFAULT
    return DEFAULT


# --- shield counters ------------------------------------------------------------------


def shield(spell, land):
    st = {"cast": False}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return bob_creature_first(g, f, "Wingshield Agent")
        return at_bobs(g, f, spell, "Wingshield Agent", st, 3 if spell == "Murder" else 1)

    g = game("shield-murder" if spell == "Murder" else "shield-bolt", [(land, 30), (spell, 30)],
             [("Island", 40), ("Wingshield Agent", 20)],
             deal={1: {"hand": [land] * 4 + [spell] * 3, "top": [land] * 6},
                   2: {"hand": ["Island"] * 4 + ["Wingshield Agent"] * 3, "top": ["Island"] * 6}})
    w = Watch(g)

    def done(seat):
        if spell == "Murder":
            return any(x.get("how") == "shield" for x in w.listed(seat, "survived"))
        return any(h.get("by") == "shield" for h in w.hits(seat))

    def until(g):
        w.see()
        return all(done(s) for s in (1, 2)) and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        agents = w.cards(seat, "Wingshield Agent")
        if not done(seat) or not agents:
            return "inconclusive", f"seat {seat} never saw the shield used (cast {st['cast']})", found
        agent = agents[-1]["id"]
        found[f"counters{seat}"] = [c.get("counters") for c in agents[:1]] + [(last_card(w, seat, agent) or {})
                                                                                  .get("counters")]
        if shields(agents[0]) != 1:
            problems.append(f"seat {seat}: the Agent shows its shield counter first: {agents[0].get('counters')}")
        if spell == "Murder":
            surv = [x for x in w.listed(seat, "survived") if x.get("how") == "shield"]
            found[f"survived{seat}"] = surv
            if surv[0].get("card") != agent:
                problems.append(f"seat {seat}: the survivor is the Agent: {surv}")
            if any(x.get("card") == agent and x.get("how") != "shield" for x in w.listed(seat, "survived")):
                problems.append(f"seat {seat}: only Forge's way is told (shield), never another")
        else:
            hits = [h for h in w.hits(seat) if h.get("by") == "shield"]
            found[f"hits{seat}"] = hits
            if hits[0].get("target") != {"object": agent} or hits[0].get("prevented") != 3 or hits[0].get("amount"):
                problems.append(f"seat {seat}: the Bolt's 3 stopped by the shield (amount 0, prevented 3): {hits}")
        now = last_card(w, seat, agent)
        if not now or shields(now):
            problems.append(f"seat {seat}: the Agent stays, its shield counter used: {now}")
        if any(m.get("card") == agent and m.get("from", {}).get("zone") == "battlefield"
               for m in w.listed(seat, "moves")):
            problems.append(f"seat {seat}: the Agent never left the table")
    return result(problems, f"{spell} on Wingshield Agent: the shield counter used (" +
                  ("survived \"shield\"" if spell == "Murder" else "a prevented hit, by \"shield\"") +
                  "), the Agent stays, to both", found)


# --- prevent the next N --------------------------------------------------------------------


def prevent_next():
    st = {"cast": False, "salve": False, "mode": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            if kind == "chooseSpellAbilityToPlay":
                bolt = any(e.get("name") == "Lightning Bolt" for e in stack_of(g, 2))
                if bolt and not st["salve"] and g.untapped_lands(2, name="Plains"):
                    o = named(g, f, "Healing Salve")
                    st["salve"] = bool(o)
                    return o
                if stack_of(g, 2):
                    return None
                return bob_creature_first(g, f, "Grizzly Bears")
            if kind == "chooseModeForAbility":
                st["mode"] = True
                return next((o["actionId"] for o in f["options"] if "revent" in (o.get("label") or "")), DEFAULT)
            if kind == "chooseTargetsFor":
                return target(f, first_id(g.mine(2, name="Grizzly Bears"))) or DEFAULT
            return DEFAULT
        return at_bobs(g, f, "Lightning Bolt", "Grizzly Bears", st,
                       ready=lambda g: bool(g.untapped_lands(2, name="Plains")))

    g = game("prevent-next", [("Mountain", 30), ("Lightning Bolt", 30)],
             [("Forest", 20), ("Plains", 20), ("Grizzly Bears", 10), ("Healing Salve", 10)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Lightning Bolt"] * 3, "top": ["Mountain"] * 6},
                   2: {"hand": ["Forest", "Plains", "Forest", "Plains", "Grizzly Bears", "Healing Salve",
                                "Healing Salve"], "top": ["Forest", "Plains"] * 3}})
    w = Watch(g)

    def done(seat):
        return any(h.get("by") == "prevent-next" for h in w.hits(seat))

    def until(g):
        w.see()
        return all(done(s) for s in (1, 2)) and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "salve": st["salve"], "mode": st["mode"]}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        if not done(seat):
            return "inconclusive", f"seat {seat} never saw the prevented hit (cast {st['cast']}, salve " \
                                   f"{st['salve']})", found
        hits = [h for h in w.hits(seat) if h.get("by") == "prevent-next"]
        bears = hits[0].get("target", {}).get("object")
        found[f"hits{seat}"] = hits
        if hits[0].get("prevented") != 3 or hits[0].get("amount"):
            problems.append(f"seat {seat}: the Bolt's 3 prevented (amount 0, prevented 3): {hits}")
        waiting = [s for s in w.boards(seat) if any(c.get("id") == bears and c.get("preventNext") == 3
                                                   for c in s.get("battlefield") or [])
                   and any(e.get("name") == "Lightning Bolt" for e in s.get("stack") or [])]
        if not waiting:
            problems.append(f"seat {seat}: preventNext 3 on the Bears while the Bolt waits")
        now = last_card(w, seat, bears)
        found[f"bears{seat}"] = now
        if not now or now.get("preventNext"):
            problems.append(f"seat {seat}: the Bears stay, nothing left to prevent: {now}")
    return result(problems, "Healing Salve's prevent the next 3: preventNext 3 while the Bolt waits, a prevented "
                            "hit by \"prevent-next\", none left after, to both", found)


# --- ward -----------------------------------------------------------------------------------


def ward(pay):
    name = "ward-paid" if pay else "ward"
    st = {"cast": False, "asked": []}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            return bob_creature_first(g, f, "Tomakul Honor Guard", "Forest")
        if st["cast"] and kind not in ("chooseSpellAbilityToPlay", "chooseTargetsFor"):
            st["asked"].append(kind)
        # The ward trigger's "pay {2}?" (Forge's UnlessCost) is a mana
        # payment asked while the ward entry resolves: declined by passing.
        if not pay and kind == "applyManaToCost" and any(e.get("ward") for e in stack_of(g, 1)):
            return None
        return at_bobs(g, f, "Lightning Bolt", "Tomakul Honor Guard", st, 3)

    g = game(name, [("Mountain", 30), ("Lightning Bolt", 30)], [("Forest", 40), ("Tomakul Honor Guard", 20)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Lightning Bolt"] * 3, "top": ["Mountain"] * 6},
                   2: {"hand": ["Forest"] * 4 + ["Tomakul Honor Guard"] * 3, "top": ["Forest"] * 6}})
    w = Watch(g)

    def wards(seat):
        return [e for e in w.stacks(seat) if e.get("ward")]

    def done(seat):
        if not wards(seat):
            return False
        if pay:
            return any(m.get("from", {}).get("zone") == "stack" and m.get("to", {}).get("zone") == "graveyard"
                       and m.get("why") != "countered" for m in w.listed(seat, "moves"))
        return bool(w.listed(seat, "left"))

    def until(g):
        w.see()
        return all(done(s) for s in (1, 2)) and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "asked": sorted(set(st["asked"]))}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        if not done(seat):
            return "inconclusive", f"seat {seat} never saw the ward play out (cast {st['cast']})", found
        guard = first_id(w.cards(seat, "Tomakul Honor Guard"))
        bolt = next((e for e in w.stacks(seat) if e.get("name") == "Lightning Bolt"), None)
        found[f"ward{seat}"] = wards(seat)[:1]
        found[f"left{seat}"] = w.listed(seat, "left")
        if wards(seat)[0].get("source") != guard or wards(seat)[0].get("kind") != "trigger":
            problems.append(f"seat {seat}: the ward entry is the Guard's trigger: {wards(seat)[:1]}")
        if any(e.get("ward") for e in w.stacks(seat) if e.get("name") == "Lightning Bolt"):
            problems.append(f"seat {seat}: only the ward trigger is ward")
        if pay:
            if w.listed(seat, "left"):
                problems.append(f"seat {seat}: paid -- nothing left without resolving: {found[f'left{seat}']}")
            continue
        left = w.listed(seat, "left")
        if not bolt or left != [{"stack": bolt["id"], "why": "countered", "by": guard}]:
            problems.append(f"seat {seat}: left names the Bolt's entry, countered by the Guard: {left} / {bolt}")
        if not any(m.get("why") == "countered" and m.get("from", {}).get("zone") == "stack"
                   for m in w.listed(seat, "moves")):
            problems.append(f"seat {seat}: the Bolt's card move says countered")
        if not last_card(w, seat, guard):
            problems.append(f"seat {seat}: the Guard stays")
    return result(problems, "Tomakul Honor Guard's ward: a ward-true trigger, " +
                  ("paid: nothing left, the Bolt resolves" if pay else "the Bolt `left`, countered by the Guard") +
                  ", to both", found)


# --- blocker candidates (item 3) ------------------------------------------------------


def blockers():
    st = {"attacked": False, "elves": False, "blocked": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, seat):
                return None
            want = "Grizzly Bears" if seat == 2 else                 ("Llanowar Elves" if not g.mine(1, name="Llanowar Elves") else "Benalish Knight")
            return None if g.mine(seat, name=want) else named(g, f, want)
        if kind == "declareAttackers" and seat == 1:
            # The Elves attack once, so they are tapped on Bob's turn (vigilance-less).
            elves = [c for c in g.mine(1, name="Llanowar Elves") if not c.get("sick")]
            if st["elves"] or not elves or not g.mine(1, name="Benalish Knight"):
                return None
            st["elves"] = True
            return next((o["actionId"] for o in f["options"] if "Llanowar" in (o.get("label") or "")), None)
        if kind == "declareAttackers" and seat == 2:
            if st["attacked"] or not st["elves"]:
                return None
            ready = [c for c in g.mine(2, name="Grizzly Bears") if not c.get("sick")]
            if not ready or not any(c.get("tapped") for c in g.zone(2, "battlefield", owner=1,
                                                                   name="Llanowar Elves")):
                return None
            st["attacked"] = True
            return next((o["actionId"] for o in f["options"] if "Grizzly" in (o.get("label") or "")), None)
        if kind == "declareBlockers" and seat == 1:
            if not st["blocked"]:
                st["blocked"] = True
                return next((o["actionId"] for o in f["options"] if "Benalish" in (o.get("label") or "")), None)
            return None
        return DEFAULT

    # Alice's Elves come first, then her Knight; she attacks with the Elves
    # (Bob has no creature yet to block them); Bob's Bears come down after.
    g = game("blockers", [("Plains", 20), ("Forest", 20), ("Llanowar Elves", 10), ("Benalish Knight", 10)],
             [("Forest", 40), ("Grizzly Bears", 20)],
             deal={1: {"hand": ["Forest", "Plains", "Plains", "Llanowar Elves", "Benalish Knight", "Forest",
                                "Plains"], "top": ["Plains", "Forest"] * 4},
                   2: {"hand": ["Forest"] * 5 + ["Grizzly Bears"] * 2, "top": ["Forest"] * 8}})
    w = Watch(g)

    def until(g):
        w.see()
        return st["blocked"] and all(w.listed(s, "blockerCandidates") for s in (1, 2))             and all((w.boards(s)[-1].get("phase") or "").startswith(("COMBAT_END", "MAIN2", "END", "CLEANUP"))
                    or not (w.boards(s)[-1].get("phase") or "").startswith("COMBAT") for s in (1, 2))             and all(not w.boards(s)[-1].get("blockerCandidates") for s in (1, 2))

    g.run(policy, until=until, max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), **st}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        # Bob's attack (Alice's Elves' attack before it had Bob's Bears as candidates).
        theirs = [s for s in w.boards(seat) if s.get("blockerCandidates") and s.get("activeSeat") == 1]
        found[f"aliceAttack{seat}"] = sorted({i for s in theirs for i in s["blockerCandidates"]})
        told = [s for s in w.boards(seat) if s.get("blockerCandidates") and s.get("activeSeat") == 2]
        if not told:
            return "inconclusive", f"seat {seat} never saw blocker candidates ({st})", found
        knight = first_id(w.cards(seat, "Benalish Knight"))
        elves = first_id(w.cards(seat, "Llanowar Elves"))
        ids = {i for s in told for i in s["blockerCandidates"]}
        found[f"ids{seat}"] = sorted(ids)
        found[f"phases{seat}"] = sorted({s.get("phase") for s in told})
        if knight not in ids:
            problems.append(f"seat {seat}: the Knight is offered as a blocker: {ids}")
        if elves in ids:
            problems.append(f"seat {seat}: the tapped Elves are not offered: {ids}")
        bob = {c.get("id") for c in w.cards(seat) if c.get("seat") == 2}
        if any(i in bob for i in ids):
            problems.append(f"seat {seat}: never the attacker's own cards: {ids}")
        if not set(found[f"aliceAttack{seat}"]) <= bob:
            problems.append(f"seat {seat}: in Alice's attack, Bob's creatures only: {found[f'aliceAttack{seat}']}")
        if not set(found[f"phases{seat}"]) <= {"COMBAT_DECLARE_ATTACKERS", "COMBAT_DECLARE_BLOCKERS"}:
            problems.append(f"seat {seat}: only from the attack until the blocks: {found[f'phases{seat}']}")
    return result(problems, "Bob's attack: blockerCandidates names Alice's untapped Knight (not her tapped Elves) "
                            "from the attack to the blocks, to both", found)


SCENARIOS = {"shield-murder": lambda: shield("Murder", "Swamp"),
             "shield-bolt": lambda: shield("Lightning Bolt", "Mountain"),
             "prevent-next": prevent_next, "ward": lambda: ward(False), "ward-paid": lambda: ward(True),
             "blockers": blockers}

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
        sys.stdout.flush()
    sys.exit(worst)
