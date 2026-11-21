"""Spec 0100 -- what a spell's caster chose, sent on its stack entry.

    python -I scripts/check-spell-choices.py <worker.jar> <res-root> [trace-dir] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B). The spell
waits on the stack while the other seat holds priority, and the check reads
its stack entry off BOTH seats' snapshots (they must be identical: these
are choices announced as it is cast, CR 601.2b-c):

  kicked     Burst Lightning, kicked, at Bob's Grizzly Bears:
             extra ["kicked"], the Bears its target
  overload   Cyclonic Rift, overloaded: extra ["overloaded"], no targets,
             `hits` = every nonland permanent Bob controls (Forge's own
             filter for the overloaded effect, Decided 1)
  evoke      Mulldrifter, evoked: extra ["evoked"]
  curse      Bob's Curse of the Pierced Heart on Alice: on the battlefield
             its card carries attachedToPlayer 1 for both seats; at Alice's
             upkeep its trigger's source is that card
  spellskite Alice's Lightning Bolt at Bob's Bears; Bob activates
             Spellskite: the Bolt now aims at Spellskite, and ALICE gets the
             report "Bob changed your Lightning Bolt's target to
             Spellskite." with both pictures; Bob gets no such report
  swat       the same with Bob's Deflecting Swat, the new target Alice
             herself: "Bob changed your Lightning Bolt's target to you."
  own-swat   Alice redirects her OWN Bolt with her own Deflecting Swat: no
             change-of-target report for anyone

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]

BEARS = [("Forest", 30), ("Grizzly Bears", 30)]
BEARS_DEAL = {"hand": ["Forest", "Forest", "Forest", "Grizzly Bears", "Grizzly Bears"], "top": ["Forest"] * 3}


def game(name, seat1, seat2=BEARS, hand=None, top=None, deal2=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"spell-choices-{name}.jsonl")
    deal = {1: {"hand": hand or [], "top": top or []}}
    if deal2 is not None:
        deal[2] = deal2
    elif seat2 is BEARS:
        deal[2] = BEARS_DEAL
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal)


def stack(g, seat):
    return g.state.get(seat, {}).get("stack") or []


def stack_empty(g):
    return not stack(g, 1) and not stack(g, 2)


def cast(g, f, name, contains=None):
    o = g.option(f, name=name, zone="hand", contains=contains, land=False)
    if o and any(x["actionId"] == o and x.get("payable") is False for x in f["options"]):
        return None
    return o


def outcome(problems, ok, found):
    if found.get("stopped"):
        problems = problems + [found["stopped"]]
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


FIELDS = ("x", "modes", "extra", "kicks", "hits", "targets")


def watch(g, st, name):
    """Keep each seat's first sight of `name`'s spell on the stack."""
    for seat in (1, 2):
        for e in stack(g, seat):
            if e.get("name") == name and e.get("kind") == "spell" and seat not in st["seen"]:
                st["seen"][seat] = {k: e.get(k) for k in FIELDS} | {"id": e.get("id")}


def same(st, problems):
    """Both seats saw the entry, with the same fields."""
    if set(st["seen"]) != {1, 2}:
        problems.append(f"both seats should see the spell on the stack: {sorted(st['seen'])}")
        return None
    if st["seen"][1] != st["seen"][2]:
        problems.append(f"both seats get identical fields: {st['seen'][1]} / {st['seen'][2]}")
    return st["seen"][1]


def hold(g, f):
    """Seat 2 holds priority while a spell waits (so each seat gets a snapshot of it)."""
    return None


# --- the scenarios ----------------------------------------------------------


def kicked():
    g = game("kicked", [("Mountain", 40), ("Burst Lightning", 20)],
             hand=["Mountain"] * 5 + ["Burst Lightning"] * 2, top=["Mountain"] * 4)
    st = {"cast": False, "seen": {}, "bears": None, "offered": []}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            if k == "chooseSpellAbilityToPlay":
                return g.play_land(f) or cast(g, f, "Grizzly Bears") if stack_empty(g) else None
            return DEFAULT
        if k == "chooseSpellAbilityToPlay":
            bears = g.zone(1, "battlefield", owner=2, name="Grizzly Bears")
            if not st["cast"] and bears and len(g.untapped_lands(1)) >= 5:
                o = cast(g, f, "Burst Lightning")
                if o:
                    st["cast"] = True
                    st["bears"] = bears[0]["id"]
                    return o
            return g.play_land(f) if stack_empty(g) else None
        if k == "chooseOptionalCosts" and st["cast"]:
            st["offered"].append([o.get("label") for o in f["options"]])
            return next((o["actionId"] for o in f["options"] if "icker" in (o.get("label") or "")),
                        f["options"][0]["actionId"])
        if k == "chooseTargetsFor" and st["cast"]:
            return next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == st["bears"]), DEFAULT)
        return DEFAULT

    def until(g):
        watch(g, st, "Burst Lightning")
        return len(st["seen"]) == 2

    g.run(policy, until=until, max_turn=20)
    found = {"seen": st["seen"], "offered": st["offered"], "stopped": g.stopped_badly()}
    if not st["seen"]:
        return "inconclusive", "Burst Lightning was never kicked onto the stack", found
    problems = []
    e = same(st, problems) or {}
    if e.get("extra") != ["kicked"]:
        problems.append(f"extra should be [kicked]: {e.get('extra')}")
    if [t.get("object") for t in e.get("targets") or []] != [st["bears"]]:
        problems.append(f"its target, the Bears {st['bears']}: {e.get('targets')}")
    if e.get("x") is not None or e.get("modes") is not None or e.get("hits") is not None:
        problems.append(f"no X, modes or hits on a plain kicked spell: {e}")
    return outcome(problems, "Burst Lightning kicked: extra [kicked] for both seats", found)


def overload():
    g = game("overload", [("Island", 40), ("Cyclonic Rift", 20)],
             hand=["Island"] * 6 + ["Cyclonic Rift"] * 1, top=["Island"] * 6)
    st = {"cast": False, "seen": {}, "theirs": None, "labels": []}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            if k == "chooseSpellAbilityToPlay":
                return g.play_land(f) or cast(g, f, "Grizzly Bears") if stack_empty(g) else None
            return DEFAULT
        if k == "chooseSpellAbilityToPlay":
            bears = g.zone(1, "battlefield", owner=2, name="Grizzly Bears")
            if not st["cast"] and len(bears) >= 2 and len(g.untapped_lands(1)) >= 7:
                st["labels"] = [o.get("label") for o in f["options"] if "Cyclonic" in (o.get("label") or "")]
                o = next((o["actionId"] for o in f["options"] if "Cyclonic" in (o.get("label") or "")
                          and "verload" in (o.get("label") or "") and o.get("payable") is not False), None)
                if o:
                    st["cast"] = True
                    st["theirs"] = sorted(c["id"] for c in g.zone(1, "battlefield", owner=2)
                                          if c.get("kind") != "land")
                    return o
            return g.play_land(f) if stack_empty(g) else None
        return DEFAULT

    def until(g):
        watch(g, st, "Cyclonic Rift")
        return len(st["seen"]) == 2

    g.run(policy, until=until, max_turn=26)
    found = {"seen": st["seen"], "theirs": st["theirs"], "labels": st["labels"], "stopped": g.stopped_badly()}
    if not st["seen"]:
        return "inconclusive", "Cyclonic Rift was never overloaded onto the stack", found
    problems = []
    e = same(st, problems) or {}
    if e.get("extra") != ["overloaded"]:
        problems.append(f"extra should be [overloaded]: {e.get('extra')}")
    if e.get("targets"):
        problems.append(f"overloaded, it targets nothing: {e.get('targets')}")
    if sorted(e.get("hits") or []) != st["theirs"]:
        problems.append(f"hits should be Bob's nonland permanents {st['theirs']}: {e.get('hits')}")
    return outcome(problems, f"Cyclonic Rift overloaded: extra [overloaded], hits {len(st['theirs'] or [])} "
                             "nonland permanents, no targets", found)


def evoke():
    g = game("evoke", [("Island", 40), ("Mulldrifter", 20)],
             hand=["Island"] * 4 + ["Mulldrifter"] * 2, top=["Island"] * 4)
    st = {"cast": False, "seen": {}, "labels": []}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            if k == "chooseSpellAbilityToPlay":
                return g.play_land(f) or cast(g, f, "Grizzly Bears") if stack_empty(g) else None
            return DEFAULT
        if k == "chooseSpellAbilityToPlay":
            if not st["cast"] and len(g.untapped_lands(1)) >= 3:
                st["labels"] = [o.get("label") for o in f["options"] if "Mulldrifter" in (o.get("label") or "")]
                o = next((o["actionId"] for o in f["options"] if "Mulldrifter" in (o.get("label") or "")
                          and "voke" in (o.get("label") or "") and o.get("payable") is not False), None)
                if o:
                    st["cast"] = True
                    return o
            return g.play_land(f) if stack_empty(g) else None
        return DEFAULT

    def until(g):
        watch(g, st, "Mulldrifter")
        return len(st["seen"]) == 2

    g.run(policy, until=until, max_turn=20)
    found = {"seen": st["seen"], "labels": st["labels"], "stopped": g.stopped_badly()}
    if not st["seen"]:
        return "inconclusive", "Mulldrifter was never evoked onto the stack", found
    problems = []
    e = same(st, problems) or {}
    if e.get("extra") != ["evoked"]:
        problems.append(f"extra should be [evoked]: {e.get('extra')}")
    return outcome(problems, "Mulldrifter evoked: extra [evoked] for both seats", found)


def curse():
    g = game("curse", [("Forest", 30), ("Grizzly Bears", 30)],
             [("Mountain", 40), ("Curse of the Pierced Heart", 20)],
             hand=["Forest"] * 4 + ["Grizzly Bears"] * 3, top=["Forest"] * 4,
             deal2={"hand": ["Mountain"] * 4 + ["Curse of the Pierced Heart"] * 2, "top": ["Mountain"] * 4})
    st = {"cast": False, "card": {}, "trigger": {}, "target_labels": [], "watched": False}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        # Somebody watches: the public view (seat 0) is sent too.
        if not st["watched"] and g.turn >= 2:
            g.send({"protocolVersion": 1, "type": "WATCHED", "messageId": str(uuid.uuid4()), "on": True})
            st["watched"] = True
        if seat == 1:
            if k == "chooseSpellAbilityToPlay":
                return g.play_land(f) if stack_empty(g) else None
            return DEFAULT
        if k == "chooseSpellAbilityToPlay":
            if not st["cast"] and len(g.untapped_lands(2)) >= 2 and stack_empty(g):
                o = cast(g, f, "Curse of the Pierced Heart")
                if o:
                    st["cast"] = True
                    return o
            return g.play_land(f) if stack_empty(g) else None
        if k == "chooseTargetsFor" and st["cast"] and not st["card"]:
            st["target_labels"] = [o.get("label") for o in f["options"]]
            return next((o["actionId"] for o in f["options"] if o.get("label") == "Alice"), DEFAULT)
        return DEFAULT

    def until(g):
        for seat in (0, 1, 2):
            for c in g.zone(seat, "battlefield", name="Curse of the Pierced Heart"):
                st["card"].setdefault(seat, {"id": c.get("id"), "attachedToPlayer": c.get("attachedToPlayer"),
                                             "attachedTo": c.get("attachedTo"), "seat": c.get("seat")})
            for e in stack(g, seat):
                if e.get("kind") == "trigger" and e.get("name") == "Curse of the Pierced Heart":
                    st["trigger"].setdefault(seat, {"source": e.get("source"), "targets": e.get("targets")})
        return len(st["card"]) == 3 and len(st["trigger"]) == 2

    g.run(policy, until=until, max_turn=24)
    found = {"card": st["card"], "trigger": st["trigger"], "labels": st["target_labels"],
             "stopped": g.stopped_badly()}
    if len(st["card"]) < 3:
        return "inconclusive", "Bob's Curse never reached the battlefield in all three views", found
    problems = []
    # Seat 0 is the public view a spectator is sent (spec 0047): the same seat.
    for seat in (0, 1, 2):
        c = st["card"][seat]
        if c["attachedToPlayer"] != 1:
            problems.append(f"seat {seat}: the Curse should carry attachedToPlayer 1: {c}")
        if c["attachedTo"] is not None:
            problems.append(f"seat {seat}: attachedTo stays a card's id, none here: {c}")
        if c["seat"] != 2:
            problems.append(f"seat {seat}: the Curse stays Bob's: {c}")
    if len(st["trigger"]) < 2:
        problems.append(f"its upkeep trigger, on both seats: {st['trigger']}")
    elif any(t["source"] != st["card"][1]["id"] for t in st["trigger"].values()):
        problems.append(f"the trigger's source is the Curse's card: {st['trigger']}")
    return outcome(problems, "Curse of the Pierced Heart on Alice: attachedToPlayer 1 for both seats and the public view; "
                             "its upkeep trigger comes from that card", found)


def actions(g, seat):
    a = g.state.get(seat, {}).get("action")
    if not a:
        return []
    return [a] + list(a.get("gathered") or [])


def redirect(name, by, aim_self=False):
    """Alice's Bolt at Bob's Bears; then `by` changes its target."""
    swat = by != "Spellskite"
    own = by == "own"
    seat2 = BEARS if own else [("Forest", 20), ("Mountain", 20), (by, 20), ("Grizzly Bears", 20)]
    deal2 = BEARS_DEAL if own else {"hand": ["Forest", "Mountain", "Forest", "Grizzly Bears", by, "Mountain", by],
                                    "top": ["Mountain", "Forest", "Mountain"]}
    deck1 = [("Mountain", 40), ("Lightning Bolt", 10)] + ([("Deflecting Swat", 10)] if own else [])
    hand1 = ["Mountain"] * 4 + ["Lightning Bolt"] * 2 + ["Deflecting Swat" if own else "Mountain"]
    g = game(name, deck1, seat2, hand=hand1, top=["Mountain"] * 6, deal2=deal2)
    st = {"bolt": False, "changed": False, "bears": None, "skite": None, "after": {}, "reports": {1: [], 2: []},
          "asked": []}
    actor = 1 if own else 2

    def ready(g):
        bears = g.zone(1, "battlefield", owner=2, name="Grizzly Bears")
        if own:
            return bears and len(g.untapped_lands(1)) >= 4
        skite = g.zone(1, "battlefield", owner=2, name="Spellskite")
        lands2 = len(g.untapped_lands(2))
        return bears and len(g.untapped_lands(1)) >= 1 and (skite if not swat else lands2 >= 3)

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseSpellAbilityToPlay":
            bolt_up = any(e.get("name") == "Lightning Bolt" and e.get("kind") == "spell" for e in stack(g, seat))
            if seat == actor and st["bolt"] and not st["changed"] and bolt_up and len(stack(g, seat)) == 1:
                o = (g.option(f, name="Spellskite", zone="battlefield") if not swat
                     else cast(g, f, "Deflecting Swat"))
                if o:
                    st["changed"] = True
                    return o
            if seat == 1 and not st["bolt"] and stack_empty(g) and ready(g):
                o = cast(g, f, "Lightning Bolt")
                if o:
                    st["bolt"] = True
                    st["bears"] = g.zone(1, "battlefield", owner=2, name="Grizzly Bears")[0]["id"]
                    return o
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if seat == 2 and not own and not swat and not g.mine(2, name="Spellskite"):
                return cast(g, f, "Spellskite")
            if seat == 2 and len(g.mine(2, name="Grizzly Bears")) < 1:
                return cast(g, f, "Grizzly Bears")
            return None
        if k == "chooseTargetsFor" and st["bolt"] and not st["changed"] and seat == 1:
            return next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == st["bears"]), DEFAULT)
        if k == "chooseTargetsFor" and st["changed"]:
            st["asked"].append((seat, f.get("prompt"), [o.get("label") for o in f["options"]]))
            if swat:
                # Deflecting Swat's own target: the Bolt on the stack; then
                # the Bolt's new target: Alice herself (Bob's swat) or
                # Bob (Alice's own).
                o = next((o["actionId"] for o in f["options"]
                          if (o["actionId"].startswith("target:stack:") and "Lightning Bolt" in (o.get("label") or ""))), None)
                if o:
                    return o
                want = "Bob" if own else "Alice"
                return next((o["actionId"] for o in f["options"] if o.get("label") == want), DEFAULT)
            return next((o["actionId"] for o in f["options"]
                         if (o["actionId"].startswith("target:stack:") and "Lightning Bolt" in (o.get("label") or ""))), DEFAULT)
        if k == "confirmAction" and st["changed"]:
            st["asked"].append((seat, k, f.get("prompt"), [o.get("label") for o in f["options"]]))
            return f["options"][0]["actionId"]
        return DEFAULT

    def until(g):
        for seat in (1, 2):
            for e in stack(g, seat):
                if e.get("name") == "Lightning Bolt" and e.get("kind") == "spell" and st["changed"] \
                        and len(stack(g, seat)) == 1:
                    st["after"][seat] = e.get("targets")
            for a in actions(g, seat):
                seen = [r.get("key") for r in st["reports"][seat]]
                if "changed" in (a.get("said") or "") and a.get("key") not in seen:
                    st["reports"][seat].append(a)
        return st["changed"] and stack_empty(g) and any(
            c.get("name") == "Lightning Bolt" for c in g.zone(1, "graveyard", owner=1))

    g.run(policy, until=until, max_turn=24)
    skite = g.zone(1, "battlefield", owner=2, name="Spellskite")
    found = {"after": st["after"], "reports": st["reports"], "asked": st["asked"], "bears": st["bears"],
             "skite": skite and skite[0]["id"], "stopped": g.stopped_badly()}
    if not st["changed"]:
        return "inconclusive", f"{by} never changed the Bolt's target", found
    return found


def spellskite():
    found = redirect("spellskite", "Spellskite")
    if isinstance(found, tuple):
        return found
    problems = []
    skite = found["skite"]
    for seat in (1, 2):
        if [t.get("object") for t in found["after"].get(seat) or []] != [skite]:
            problems.append(f"seat {seat}: the Bolt should now aim at Spellskite {skite}: {found['after'].get(seat)}")
    r1, r2 = found["reports"][1], found["reports"][2]
    want = "Bob changed your Lightning Bolt's target to Spellskite."
    if len(r1) != 1 or r1[0].get("said") != want:
        problems.append(f"Alice, the caster, gets one report {want!r}: {[r.get('said') for r in r1]}")
    elif [c.get("name") for c in r1[0].get("cards") or []] != ["Lightning Bolt", "Spellskite"]:
        problems.append(f"its pictures: the Bolt, then Spellskite: {r1[0].get('cards')}")
    elif any(str(c.get("id", "")).startswith("card:") for c in r1[0].get("cards") or []):
        problems.append(f"a report's pictures never carry a card's own id: {r1[0].get('cards')}")
    elif r1[0].get("by") != 2 or r1[0].get("source") != "Spellskite":
        problems.append(f"by Bob, from Spellskite: {r1[0].get('by')}, {r1[0].get('source')}")
    if r2:
        problems.append(f"Bob, who did it, gets no report: {[r.get('said') for r in r2]}")
    return outcome(problems, f"Spellskite: the Bolt's target became Spellskite; Alice told {want!r}; Bob not told",
                   found)


def swat():
    found = redirect("swat", "Deflecting Swat")
    if isinstance(found, tuple):
        return found
    problems = []
    for seat in (1, 2):
        if [t.get("player") for t in found["after"].get(seat) or []] != [1]:
            problems.append(f"seat {seat}: the Bolt should now aim at Alice: {found['after'].get(seat)}")
    r1, r2 = found["reports"][1], found["reports"][2]
    want = "Bob changed your Lightning Bolt's target to you."
    if len(r1) != 1 or r1[0].get("said") != want:
        problems.append(f"Alice gets one report {want!r}: {[r.get('said') for r in r1]}")
    if r2:
        problems.append(f"Bob, who did it, gets no report: {[r.get('said') for r in r2]}")
    return outcome(problems, f"Deflecting Swat: the Bolt turned on Alice; Alice told {want!r}; Bob not told", found)


def own_swat():
    found = redirect("own-swat", "own")
    if isinstance(found, tuple):
        return found
    problems = []
    for seat in (1, 2):
        if [t.get("player") for t in found["after"].get(seat) or []] != [2]:
            problems.append(f"seat {seat}: Alice's own Swat turned her Bolt on Bob: {found['after'].get(seat)}")
    if found["reports"][1] or found["reports"][2]:
        problems.append(f"your own spell redirected: no report for anyone: {found['reports']}")
    return outcome(problems, "Alice's own Deflecting Swat on her own Bolt: the target changed, no report", found)


SCENARIOS = {"kicked": kicked, "overload": overload, "evoke": evoke, "curse": curse,
             "spellskite": spellskite, "swat": swat, "own-swat": own_swat}

if __name__ == "__main__":
    codes = []
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        for _ in range(3):
            verdict_, message, found = scenario()
            if verdict_ != "inconclusive":
                break
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_])
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:2500])
        sys.stdout.flush()
    sys.exit(1 if 1 in codes else max(codes, default=0))
