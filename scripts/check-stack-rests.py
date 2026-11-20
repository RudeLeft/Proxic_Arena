"""Spec 0105 -- the stack always shows: a spell, ability or trigger nobody can
answer rests on the stack before it resolves (Mechanics Lab).

    python -I scripts/check-stack-rests.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is its own small game against Forge, both seats following the
one stops rule the server turns on for every player (spec 0035) unless it
says otherwise. Every trace line carries `t`, when the Lab read or sent it
(lab.py), and the timings below are measured on those.

  victim-unanswered  F-0105-A: Alice casts Victim of Night at Bob's Grizzly
             Bears; Bob holds only Bears and Forests. One board shows it on
             the stack with `rest` {ms: 5600, arriveMs: 3100}, the same on
             both seats' boards and nothing else in it; the board that has it
             gone (resolved: the Bears dead, the spell in her graveyard) comes
             no sooner than 5600 ms after the rest board
  victim-stops-off   F-0105-A: the same game with neither seat on the stops
             rule (every question asked; the Lab passes): no `rest` anywhere,
             and the spell is gone within 1.5 s of first being shown
  answerable F-0105-B: Bob holds Counterspell with two Islands up; Alice casts
             Grizzly Bears: Bob is asked with it on top (as today), passes,
             and it never rests (it showed: somebody was asked)
  own-window F-0105-B: Alice casts Lightning Bolt at Bob holding another and a
             Mountain: she is asked about her own Bolt as a response window
             ("Resolves in 5"), lets it run out (passes): no rest after
  three-triggers  F-0105-C: Bitterblossom, Sulfuric Vortex and Phyrexian Arena
             in play; at Alice's upkeep the three triggers, nobody able to
             answer: the top rests 3200 ms (700 + 2500), then 800, then 800
  let-it-all-resolve  F-0105-C: the same upkeep with a Lightning Bolt in
             Alice's hand and her Mountains up: she is asked about each trigger
             (the page's "Let it all resolve" answers each of those questions
             with a pass: spec 0043), and none of them rests
  no-stack   F-0105-D: Forests only; Alice plays her lands and taps a Forest
             for mana at priority: no rest anywhere (neither uses the stack)

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
SCRATCH = tempfile.mkdtemp(prefix="stack-rests-")

REST_MS, REST_NEXT_MS, ARRIVE_SPELL_MS, ARRIVE_ABILITY_MS = 2500, 800, 3100, 700


def trace_for(name):
    """Always a trace: the timings are measured on it."""
    if TRACES and TRACES.endswith(".jsonl"):
        return TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    return os.path.join(TRACES or SCRATCH, f"stack-rests-{name}.jsonl")


def game(name, seat1, seat2, deal=None, stops=True):
    path = trace_for(name)
    g = Game(seat1, seat2, jar=JAR, res=RES, trace=path,
             stops={1: True, 2: True} if stops else None, deal=deal or {})
    g.path = path
    return g


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def where(g, f):
    st = g.state.get(f["authorisedSeat"]) or {}
    return st.get("turn"), st.get("phase"), st.get("stack") or [], st.get("activeSeat")


def priority(f):
    return f.get("kind") == "chooseSpellAbilityToPlay"


def payable(f, o):
    return o and not any(x["actionId"] == o and x.get("payable") is False for x in f["options"])


def boards(path):
    """Every board in the trace, in order: (t, seat, state)."""
    out = []
    for line in open(path, encoding="utf-8"):
        try:
            r = json.loads(line)
        except ValueError:
            continue
        f = r.get("frame") or {}
        if r.get("dir") == "in" and f.get("type") == "MATCH_SNAPSHOT":
            out.append((r.get("t"), f.get("seat"), f.get("state") or {}))
    return out


def rests(path):
    """Every resting stack entry, first board first: [{id, name, kind, rest, t, turn, phase, seats,
    index, others}] -- `others` the keys a rest carries besides ms and arriveMs, `index` its place."""
    found = {}
    for t, seat, s in boards(path):
        for i, e in enumerate(s.get("stack") or []):
            if "rest" not in e:
                continue
            r = found.setdefault(e["id"], {"id": e["id"], "name": e.get("name"), "kind": e.get("kind"),
                                           "controller": e.get("controller"), "rest": e["rest"], "t": t,
                                           "turn": s.get("turn"), "phase": s.get("phase"), "seats": set(),
                                           "index": i, "differs": False,
                                           "others": sorted(set(e["rest"]) - {"ms", "arriveMs"})})
            r["seats"].add(seat)
            r["index"] = max(r["index"], i)
            if e["rest"] != r["rest"]:
                r["differs"] = True
    return sorted(found.values(), key=lambda r: r["t"])


def gone_after(path, entry, t0):
    """When the first board after t0 no longer shows `entry` on the stack."""
    for t, seat, s in boards(path):
        if t is not None and t >= t0 and not any(e.get("id") == entry for e in s.get("stack") or []):
            return t
    return None


def first_shown(path, name):
    for t, seat, s in boards(path):
        for e in s.get("stack") or []:
            if e.get("name") == name:
                return t, e["id"]
    return None, None


def rest_problems(r, ms, arrive):
    out = []
    if r["rest"] != {"ms": ms, "arriveMs": arrive}:
        out.append(f"{r['name']} rested {r['rest']}, expected ms {ms}, arriveMs {arrive}")
    if r["others"] or r["differs"]:
        out.append(f"{r['name']}'s rest carries {r['others']} or differs between boards")
    if r["seats"] != {1, 2}:
        out.append(f"{r['name']}'s rest reached seats {sorted(r['seats'])}, not both")
    if r["index"] != 0:
        out.append(f"{r['name']} rested below the top of the stack")
    return out


VICTIM = {1: {"hand": ["Swamp"] * 5 + ["Victim of Night"] * 2, "top": ["Swamp"] * 4},
          2: {"hand": ["Forest"] * 4 + ["Grizzly Bears"] * 3, "top": ["Forest"] * 4}}


def victim_game(name, stops):
    g = game(name, [("Swamp", 40), ("Victim of Night", 20)], [("Forest", 40), ("Grizzly Bears", 20)],
             deal=VICTIM, stops=stops)
    st = {"cast": None, "aim": None}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat, kind = f["authorisedSeat"], f.get("kind")
        if kind == "chooseTargetsFor" and seat == 1 and st["aim"]:
            return next((o["actionId"] for o in f.get("options", []) if o.get("objectId") == st["aim"]), DEFAULT)
        if not priority(f):
            return DEFAULT
        if seat == 2:
            if active == 2 and str(phase).startswith("MAIN") and not stack:
                land = g.play_land(f)
                if land:
                    return land
                if not g.mine(2, name="Grizzly Bears"):
                    o = g.option(f, name="Grizzly Bears", zone="hand", land=False)
                    if payable(f, o):
                        return o
            return None
        if active == 1 and str(phase).startswith("MAIN") and not stack:
            land = g.play_land(f)
            if land:
                return land
            bears = g.zone(1, "battlefield", owner=2, name="Grizzly Bears")
            if st["cast"] is None and bears and turn >= 5:
                o = g.option(f, name="Victim of Night", zone="hand", land=False)
                if payable(f, o):
                    st["cast"], st["aim"] = turn, bears[0]["id"]
                    return o
        return None

    def until(g):
        s = g.state.get(1) or {}
        return st["cast"] is not None and not s.get("stack") and \
            any(c.get("name") == "Victim of Night" for c in g.mine(1, "graveyard"))

    g.run(policy, until=until, max_turn=12)
    return g, st


def victim_unanswered():
    g, st = victim_game("victim-unanswered", True)
    all_rests = rests(g.path)
    victim = next((r for r in all_rests if r["name"] == "Victim of Night"), None)
    found = {"cast on turn": st["cast"], "rests": [{k: (sorted(v) if isinstance(v, set) else v)
                                                    for k, v in r.items()} for r in all_rests],
             "stopped": g.stopped_badly()}
    if st["cast"] is None:
        return "inconclusive", "Alice never cast Victim of Night at the Bears", found
    problems = [found["stopped"]] if found["stopped"] else []
    if victim is None:
        problems.append("Victim of Night never rested on the stack")
        return result(problems, "", found)
    problems += rest_problems(victim, ARRIVE_SPELL_MS + REST_MS, ARRIVE_SPELL_MS)
    gone = gone_after(g.path, victim["id"], victim["t"])
    found["ms from the rest board to the board without it"] = None if gone is None else gone - victim["t"]
    if gone is None or gone - victim["t"] < ARRIVE_SPELL_MS + REST_MS:
        problems.append(f"it resolved {found['ms from the rest board to the board without it']} ms after "
                        f"the rest board, sooner than {ARRIVE_SPELL_MS + REST_MS}")
    found["Bears left on Bob's battlefield"] = len(g.zone(1, "battlefield", owner=2, name="Grizzly Bears"))
    if found["Bears left on Bob's battlefield"]:
        problems.append("the Bears should be destroyed")
    return result(problems, f"Victim of Night rested {victim['rest']} on both boards and resolved "
                            f"{found['ms from the rest board to the board without it']} ms later", found)


def victim_stops_off():
    g, st = victim_game("victim-stops-off", False)
    all_rests = rests(g.path)
    t0, entry = first_shown(g.path, "Victim of Night")
    gone = gone_after(g.path, entry, t0) if entry else None
    found = {"cast on turn": st["cast"], "rests": len(all_rests),
             "ms on the stack": None if gone is None or t0 is None else gone - t0, "stopped": g.stopped_badly()}
    if st["cast"] is None or entry is None:
        return "inconclusive", "Alice never cast Victim of Night at the Bears", found
    problems = [found["stopped"]] if found["stopped"] else []
    if all_rests:
        problems.append(f"no seat follows the stops rule: nothing should rest ({len(all_rests)} did)")
    if found["ms on the stack"] is None or found["ms on the stack"] >= 1500:
        problems.append(f"with no rest it should resolve at once, not {found['ms on the stack']} ms later")
    return result(problems, f"stops off: no rest, gone {found['ms on the stack']} ms after it showed", found)


def answerable():
    g = game("answerable", [("Forest", 40), ("Grizzly Bears", 20)], [("Island", 40), ("Counterspell", 20)],
             deal={1: {"hand": ["Forest"] * 4 + ["Grizzly Bears"] * 3, "top": ["Forest"] * 4},
                   2: {"hand": ["Island"] * 4 + ["Counterspell"] * 3, "top": ["Island"] * 4}})
    st = {"cast": None, "asked_on_top": 0}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat = f["authorisedSeat"]
        if not priority(f):
            return DEFAULT
        if seat == 2:
            if st["cast"] is not None and stack and stack[0].get("name") == "Grizzly Bears":
                st["asked_on_top"] += 1
                return None  # Bob looks, and lets it resolve
            return g.play_land(f) if active == 2 and not stack else None
        if active == 1 and str(phase).startswith("MAIN") and not stack:
            land = g.play_land(f)
            if land:
                return land
            ready = len(g.untapped_lands(2)) >= 2 and g.zone(2, "hand", name="Counterspell")
            if st["cast"] is None and ready:
                o = g.option(f, name="Grizzly Bears", zone="hand", land=False)
                if payable(f, o):
                    st["cast"] = turn
                    return o
        return None

    g.run(policy, until=lambda g: st["cast"] is not None and bool(g.mine(1, name="Grizzly Bears")), max_turn=12)
    bears = [r for r in rests(g.path) if r["name"] == "Grizzly Bears" and r["controller"] == 1]
    found = {"cast on turn": st["cast"], "Bob asked with the Bears on top": st["asked_on_top"],
             "Bears rests": len(bears), "Bears in play": len(g.mine(1, name="Grizzly Bears")),
             "stopped": g.stopped_badly()}
    if st["cast"] is None:
        return "inconclusive", "Alice never cast the Bears while Bob held Counterspell with two Islands", found
    problems = [found["stopped"]] if found["stopped"] else []
    if not st["asked_on_top"]:
        problems.append("Bob, holding Counterspell with the mana, should be asked")
    if bears:
        problems.append("Bob was asked: the Bears should not rest afterwards (it showed)")
    if not found["Bears in play"]:
        problems.append("the Bears should resolve")
    return result(problems, "Bob was asked about the Bears, passed, and it resolved with no rest", found)


def own_window():
    g = game("own-window", [("Mountain", 30), ("Lightning Bolt", 30)], [("Forest", 60)],
             deal={1: {"hand": ["Mountain"] * 3 + ["Lightning Bolt"] * 4, "top": ["Mountain"] * 3}})
    st = {"cast": None, "windows": [], "life": None, "after": None}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat = f["authorisedSeat"]
        if f.get("kind") == "chooseTargetsFor" and seat == 1:
            return next((o["actionId"] for o in f.get("options", []) if o.get("objectId") == "player:2"), DEFAULT)
        if not priority(f):
            return DEFAULT
        if st["cast"] is not None and stack:
            if seat == 1:
                st["windows"].append(f.get("window") is True)
            return None  # the countdown runs out
        if seat != 1 or active != 1 or stack:
            return None
        land = g.play_land(f)
        if land:
            return land
        untapped = g.untapped_lands(1, name="Mountain")
        if st["cast"] is None and len(untapped) >= 2 and len(g.zone(1, "hand", name="Lightning Bolt")) >= 2:
            o = g.option(f, name="Lightning Bolt", zone="hand", land=False)
            if o:
                st["cast"], st["life"] = turn, (g.player(1, 2) or {}).get("life")
                return o
        return None

    def until(g):
        if st["cast"] is not None and not (g.state.get(1) or {}).get("stack"):
            st["after"] = (g.player(1, 2) or {}).get("life")
            return st["after"] != st["life"]
        return False

    g.run(policy, until=until, max_turn=12)
    bolts = [r for r in rests(g.path) if r["name"] == "Lightning Bolt"]
    found = {"cast on turn": st["cast"], "asked about her own Bolt (window?)": st["windows"],
             "life": [st["life"], st["after"]], "Bolt rests": len(bolts), "stopped": g.stopped_badly()}
    if st["cast"] is None:
        return "inconclusive", "Alice never cast a Bolt with another and a Mountain to spare", found
    problems = [found["stopped"]] if found["stopped"] else []
    if True not in st["windows"]:
        problems.append("Alice should be asked about her own Bolt as a response window")
    if bolts:
        problems.append("her response window ran out: the Bolt should not rest afterwards")
    if st["life"] is not None and st["after"] != st["life"] - 3:
        problems.append(f"the Bolt should resolve: life {st['life']} -> {st['after']}")
    return result(problems, "a response window on her own Bolt, passed: it resolved with no rest", found)


ENCHANTMENTS = ["Bitterblossom", "Sulfuric Vortex", "Phyrexian Arena"]
# Mountain, Swamp, Mountain, Swamp on her turns 1, 3, 5, 7: Bitterblossom on
# 3 ({1}{B}), Sulfuric Vortex on 5 ({1}{R}{R}), Phyrexian Arena on 7 ({1}{B}{B}).
LANDS = {1: "Mountain", 3: "Swamp", 5: "Mountain", 7: "Swamp"}


def upkeep_game(name, bolt):
    deck = [("Mountain", 24), ("Swamp", 24), ("Bitterblossom", 4), ("Sulfuric Vortex", 4),
            ("Phyrexian Arena", 4)] + ([("Lightning Bolt", 4)] if bolt else [])
    top = (["Lightning Bolt"] if bolt else []) + ["Swamp", "Mountain"] * 4
    g = game(name, deck, [("Forest", 60)],
             deal={1: {"hand": ["Mountain", "Swamp", "Mountain", "Swamp"] + ENCHANTMENTS, "top": top}})
    st = {"all_three_turn": None, "asked": [], "done": False}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat = f["authorisedSeat"]
        if not priority(f):
            return DEFAULT
        if seat != 1:
            return None
        if stack:
            if st["all_three_turn"] == turn and phase == "UPKEEP":
                st["asked"].append((stack[0].get("name"), f.get("window") is True))
            return None  # "Let it all resolve": the page passes each question
        if active != 1 or not str(phase).startswith("MAIN"):
            return None
        land = g.play_land(f, prefer=LANDS.get(turn))
        if land:
            return land
        for name in ENCHANTMENTS:
            if not g.mine(1, name=name):
                o = g.option(f, name=name, zone="hand", land=False)
                if payable(f, o):
                    return o
        return None

    def until(g):
        s = g.state.get(1) or {}
        turn, phase = s.get("turn"), s.get("phase")
        if st["all_three_turn"] is None and s.get("activeSeat") == 1 and phase in ("UNTAP", "UPKEEP") \
                and all(g.mine(1, name=n) for n in ENCHANTMENTS) and not s.get("stack"):
            st["all_three_turn"] = turn
        return st["all_three_turn"] is not None and turn == st["all_three_turn"] \
            and phase not in ("UNTAP", "UPKEEP") and not s.get("stack")

    g.run(policy, until=until, max_turn=14)
    upkeep = [r for r in rests(g.path) if r["turn"] == st["all_three_turn"] and r["phase"] == "UPKEEP"
              and r["kind"] == "trigger"]
    return g, st, upkeep


def three_triggers():
    g, st, upkeep = upkeep_game("three-triggers", bolt=False)
    found = {"turn with all three": st["all_three_turn"],
             "upkeep rests": [(r["name"], r["rest"]) for r in upkeep], "stopped": g.stopped_badly()}
    if st["all_three_turn"] is None:
        return "inconclusive", "Alice never reached an upkeep with all three enchantments", found
    problems = [found["stopped"]] if found["stopped"] else []
    want = [ARRIVE_ABILITY_MS + REST_MS, REST_NEXT_MS, REST_NEXT_MS]
    if [r["rest"]["ms"] for r in upkeep] != want:
        problems.append(f"the three triggers should rest {want} ms: {[r['rest'] for r in upkeep]}")
    for r, arrive in zip(upkeep, [ARRIVE_ABILITY_MS, 0, 0]):
        problems += rest_problems(r, r["rest"]["ms"], arrive)
    # Each rest really held the game: the next one comes no sooner than its ms.
    for a, b in zip(upkeep, upkeep[1:]):
        if b["t"] - a["t"] < a["rest"]["ms"]:
            problems.append(f"{b['name']} rested {b['t'] - a['t']} ms after {a['name']}, sooner than {a['rest']['ms']}")
    found["ms between the rests"] = [b["t"] - a["t"] for a, b in zip(upkeep, upkeep[1:])]
    return result(problems, f"three triggers: rests {[r['rest']['ms'] for r in upkeep]} ms, "
                            f"{found['ms between the rests']} ms apart", found)


def let_it_all_resolve():
    g, st, upkeep = upkeep_game("let-it-all-resolve", bolt=True)
    found = {"turn with all three": st["all_three_turn"], "asked in that upkeep (top, window?)": st["asked"],
             "upkeep rests": [(r["name"], r["rest"]) for r in upkeep], "stopped": g.stopped_badly()}
    if st["all_three_turn"] is None:
        return "inconclusive", "Alice never reached an upkeep with all three enchantments", found
    if not any(n == "Lightning Bolt" for n in [c.get("name") for c in g.zone(1, "hand")]):
        return "inconclusive", "Alice held no Lightning Bolt in that upkeep", found
    problems = [found["stopped"]] if found["stopped"] else []
    if len(st["asked"]) < 3:
        problems.append(f"holding a Bolt, Alice should be asked about each trigger: {st['asked']}")
    if upkeep:
        problems.append(f"answered by passing ('Let it all resolve'): nothing should rest: {found['upkeep rests']}")
    return result(problems, f"asked about each trigger ({len(st['asked'])}), passed each: no rests", found)


def no_stack():
    g = game("no-stack", [("Forest", 60)], [("Forest", 60)])
    st = {"tapped": 0, "lands": 0}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        if not priority(f):
            return DEFAULT
        if f["authorisedSeat"] == 1 and active == 1 and not stack:
            # Asked for the land drop: first a Forest tapped for mana (a mana
            # ability, played at priority), then the land.
            mana = next((o["actionId"] for o in f.get("options", []) if "Add {G}" in (o.get("label") or "")), None)
            if mana and st["tapped"] < 2 and st["tapped"] < st["lands"]:
                st["tapped"] += 1
                return mana
            land = g.play_land(f)
            if land:
                st["lands"] += 1
                return land
        return g.play_land(f)

    g.run(policy, max_turn=6)
    all_rests = rests(g.path)
    found = {"lands played": st["lands"], "Forests tapped for mana": st["tapped"], "rests": len(all_rests),
             "stopped": g.stopped_badly()}
    if not st["lands"] or not st["tapped"]:
        return "inconclusive", "Alice never played a land and tapped one for mana", found
    problems = [found["stopped"]] if found["stopped"] else []
    if all_rests:
        problems.append("a land drop and a mana ability never use the stack: nothing should rest")
    return result(problems, f"{st['lands']} land drops and {st['tapped']} mana abilities: no rest", found)


SCENARIOS = {"victim-unanswered": victim_unanswered, "victim-stops-off": victim_stops_off,
             "answerable": answerable, "own-window": own_window, "three-triggers": three_triggers,
             "let-it-all-resolve": let_it_all_resolve, "no-stack": no_stack}

if __name__ == "__main__":
    worst = 0
    for name, run in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        status, text, found = run()
        print(f"--- {name}")
        print(json.dumps(found, indent=2, ensure_ascii=False, default=str))
        print(f"{status.upper()}: {text}")
        worst = max(worst, {"ok": 0, "wrong": 1, "inconclusive": 2}[status])
    sys.exit(worst)
