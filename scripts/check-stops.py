"""Priority stops: one rule, and nothing but passing. Spec 0035 (was PHASE_07 §7.53, AMENDMENT 13).

    python -I scripts/check-stops.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is its own small game against Forge, both seats following
the one stops rule the server turns on for every player (spec 0035).

  quiet      an eight-turn game asks fewer priority questions than a game
             without the rule, and none with an empty stack outside the
             rule's moments (your Main 1 and 2, after you attack, after
             blocks; on their turn before they attack, after they attack,
             after blocks, their end step) -- while the land drops and the
             attack question still happen
  respond    seat 1 casts Lightning Bolt; seat 2, holding a Bolt and an
             untapped Mountain, is asked (a response is never skipped)
  nothing    the same Bolt, but seat 2 holds only creatures and lands: it
             is passed for, not asked
  window     spec 0005: seat 1 casts Lightning Bolt with another Bolt and a
             Mountain left: it is asked again with its OWN Bolt on the
             stack, the question marked as a response window, and passing
             resolves it; seat 2 (nothing to respond with) is not asked
  window-none  the same Bolt with nothing left to respond with: passed for,
             no window (respond above: the OPPONENT's Bolt is never a window)
  end-step   F-0035-A: seat 2 holds Ambush Viper (flash); seat 1 never
             attacks: seat 2 is asked at seat 1's end step and casts it --
             and not before seat 1's combat, when nothing could attack; seat
             1 (lands only) is never asked on seat 2's turn
  before-attack  F-0035-B: seat 1 has Grizzly Bears; seat 2, holding Bolt,
             is asked before the attack only while a Bear could attack, and
             its Bolt there kills one
  upkeep-only  F-0035-C: Augur of Skulls ("sacrifice: discard two, only
             during your upkeep") is offered in its controller's upkeep, and
             used; no upkeep stop before there is one
  altar      F-0035-D: seat 2 has Ashnod's Altar and a Bear and nothing it
             could cast: seat 1's Bolt at the Bear asks seat 2, the Altar
             among its options
  force      F-0035-E: seat 2 holds only Force of Will and no land: seat 1's
             Bolt asks seat 2 (the free cost, exiling a blue card)
  ninjutsu   F-0035-F: seat 1 attacks with a Ninja nobody can block: after
             blocks it is asked, a Ninjutsu among its options

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]

# Spec 0035: the moments the rule stops at with an empty stack, by whose
# turn it is (a card that works only in one step adds that step).
OWN_STOPS = {"MAIN1", "COMBAT_DECLARE_ATTACKERS", "COMBAT_DECLARE_BLOCKERS", "MAIN2"}
THEIR_STOPS = {"COMBAT_BEGIN", "COMBAT_DECLARE_ATTACKERS", "COMBAT_DECLARE_BLOCKERS", "END_OF_TURN"}
RED = [("Mountain", 24), ("Raging Goblin", 12), ("Lightning Bolt", 12), ("Shock", 12)]
BEARS = [("Forest", 30), ("Grizzly Bears", 30)]
BOLTS = [("Mountain", 30), ("Lightning Bolt", 30)]


def trace_for(name):
    if not TRACES:
        return ""
    if TRACES.endswith(".jsonl"):
        return TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    return os.path.join(TRACES, f"stops-{name}.jsonl")


def game(name, seat1, seat2, stops=True):
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace_for(name),
                stops={1: True, 2: True} if stops else None)


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def where(g, f):
    st = g.state.get(f["authorisedSeat"]) or {}
    return st.get("turn"), st.get("phase"), bool(st.get("stack")), st.get("activeSeat")


def priority(f):
    return f.get("kind") == "chooseSpellAbilityToPlay"


def cast(g, f, name):
    """Cast `name` from hand, when Forge says it can be paid for now."""
    o = g.option(f, name=name, zone="hand", land=False)
    if o and any(x["actionId"] == o and x.get("payable") is False for x in f["options"]):
        return None
    return o


def target(f, object_id):
    return next((o["actionId"] for o in f.get("options", []) if o.get("objectId") == object_id), DEFAULT)


def survey(stops):
    g = game("quiet" if stops else "quiet-all", RED, RED, stops)
    asked = []
    drops = {"held": set(), "played": set()}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat = f["authorisedSeat"]
        asked.append((f.get("kind"), phase, stack, seat == active))
        if priority(f):
            # A land drop is owed whenever the active player holds a
            # Mountain in a main phase: stops must never skip it.
            hand = (g.state.get(seat) or {}).get("hand", [])
            if seat == active and str(phase).startswith("MAIN") \
                    and any(c.get("name") == "Mountain" for c in hand):
                drops["held"].add((seat, turn))
            land = g.play_land(f)
            if land:
                drops["played"].add((seat, turn))
                return land
            if f["authorisedSeat"] == active and str(phase).startswith("MAIN"):
                goblin = g.option(f, name="Raging Goblin", zone="hand", land=False)
                if goblin:
                    return goblin
            return None
        return DEFAULT

    g.run(policy, max_turn=8)
    g.drops = drops
    return g, asked


def quiet():
    g_all, all_asked = survey(False)
    g, asked = survey(True)
    prio = [a for a in asked if a[0] == "chooseSpellAbilityToPlay"]
    prio_all = [a for a in all_asked if a[0] == "chooseSpellAbilityToPlay"]

    def step(a):
        return f"{a[1]} ({'own' if a[3] else 'their'} turn)"

    bad = collections.Counter(step(a) for a in prio
                              if not a[2] and a[1] not in (OWN_STOPS if a[3] else THEIR_STOPS))
    kinds = collections.Counter(a[0] for a in asked)
    found = {"priority asked, without the rule": len(prio_all), "priority asked, with the rule": len(prio),
             "with the rule, empty stack, by step": dict(collections.Counter(step(a) for a in prio if not a[2])),
             "with the rule, something on the stack": sum(1 for a in prio if a[2]),
             "asked outside the rule's moments": dict(bad), "turns": g.turn,
             "other questions": {k: v for k, v in kinds.items() if k != "chooseSpellAbilityToPlay"},
             "lands": len(g.mine(1, name="Mountain")) + len(g.mine(2, name="Mountain")),
             "land drops missed (seat, turn)": sorted(g.drops["held"] - g.drops["played"]),
             "stopped": g.stopped_badly() or g_all.stopped_badly()}
    if g.turn < 8:
        return "inconclusive", "the game did not reach turn 8", found
    problems = [found["stopped"]] if found["stopped"] else []
    if bad:
        problems.append(f"asked outside the rule's moments: {dict(bad)}")
    if not len(prio) < len(prio_all):
        problems.append(f"the rule should ask fewer priority questions: {len(prio)} vs {len(prio_all)}")
    # Not a fixed count: a shuffle can deal few Mountains (CI once saw
    # 5 in 8 turns). What stops must not do is skip a drop that was owed.
    if found["land drops missed (seat, turn)"] or found["lands"] < 3:
        problems.append(f"the land drops should still happen: {found['lands']} Mountains in play, "
                        f"missed {found['land drops missed (seat, turn)']}")
    if not kinds.get("declareAttackers"):
        problems.append("the attack question should still be asked")
    return result(problems, f"{len(prio)} priority questions instead of {len(prio_all)} in {g.turn} turns; none "
                            f"outside the rule's moments; lands played and attacks asked", found)


def bolt_game(name, seat2, wait_for_answer=False):
    g = game(name, BOLTS, seat2)
    st = {"cast": False, "seat2_on_stack": 0, "seat2_asked_after": 0}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat, kind = f["authorisedSeat"], f.get("kind")
        if st["cast"] and seat == 2 and kind == "chooseSpellAbilityToPlay":
            st["seat2_asked_after"] += 1
            if stack:
                st["seat2_on_stack"] += 1
                # Spec 0005: the OPPONENT's spell is never a response window.
                st.setdefault("seat2_window", []).append(f.get("window") is True)
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            # Only once seat 2 really could answer: a Bolt in hand and an
            # untapped Mountain. A shuffle that leaves it without either is
            # correctly not stopped for -- CI once failed on exactly that.
            hand2 = (g.state.get(2) or {}).get("hand", [])
            can_answer = not wait_for_answer or (
                any(c.get("name") == "Lightning Bolt" for c in hand2) and bool(g.untapped_lands(2)))
            if seat == 1 and not st["cast"] and turn >= 3 and not stack and can_answer:
                bolt = g.option(f, name="Lightning Bolt", zone="hand", land=False)
                if bolt:
                    st["cast"] = True
                    st["cast_turn"] = turn
                    return bolt
            return None
        if kind == "chooseTargetsFor" and seat == 1:
            bob = next((o["actionId"] for o in f.get("options", []) if "Bob" in (o.get("label") or "")), None)
            return bob or DEFAULT
        return DEFAULT

    def until(g):
        return st["cast"] and g.turn >= max(5, st.get("cast_turn", 0) + 2)

    g.run(policy, until=until, max_turn=14)
    return g, st


def respond():
    g, st = bolt_game("respond", BOLTS, wait_for_answer=True)
    found = dict(st, stopped=g.stopped_badly())
    if not st["cast"]:
        return "inconclusive", "seat 1 never cast Lightning Bolt", found
    problems = [found["stopped"]] if found["stopped"] else []
    if st["seat2_on_stack"] < 1:
        problems.append("seat 2, holding a Bolt, was not asked while the Bolt was on the stack")
    if any(st.get("seat2_window", [])):
        problems.append("the opponent's Bolt was marked as a response window (spec 0005: only your own)")
    return result(problems, "seat 2 was asked with the Bolt on the stack, holding a Bolt of its own", found)


def nothing():
    g, st = bolt_game("nothing", BEARS)
    found = dict(st, stopped=g.stopped_badly())
    if not st["cast"]:
        return "inconclusive", "seat 1 never cast Lightning Bolt", found
    problems = [found["stopped"]] if found["stopped"] else []
    if st["seat2_on_stack"]:
        problems.append(f"seat 2 had nothing to respond with and was asked {st['seat2_on_stack']} time(s)")
    return result(problems, "seat 2, holding only creatures and lands, was passed for while the Bolt resolved", found)


def window(spare):
    """Spec 0005: your own spell on top is a response window, when you could respond."""
    g = game("window" if spare else "window-none", BOLTS, BEARS)
    st = {"cast": None, "own_stack_asks": [], "seat2_asks": 0, "after": None}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat, kind = f["authorisedSeat"], f.get("kind")
        if kind == "chooseTargetsFor" and seat == 1:
            return target(f, "player:2")
        if kind != "chooseSpellAbilityToPlay":
            return DEFAULT
        if st["cast"] is not None and stack:
            if seat == 1:
                st["own_stack_asks"].append(f.get("window") is True)
            else:
                st["seat2_asks"] += 1
            return None  # let the countdown run out: pass
        land = g.play_land(f)
        if land:
            return land
        untapped = [c for c in g.mine(1, name="Mountain") if not c.get("tapped")]
        bolts = [c for c in g.zone(1, "hand") if c.get("name") == "Lightning Bolt"]
        # With a spare: two Mountains and two Bolts (one left to respond with).
        # Without: exactly one untapped Mountain, so nothing is left after it.
        ready = (len(untapped) >= 2 and len(bolts) >= 2) if spare else (len(untapped) == 1 and bolts)
        if seat == 1 and st["cast"] is None and seat == active and ready:
            o = g.option(f, name="Lightning Bolt", zone="hand", land=False)
            if o:
                st["cast"] = turn
                st["life"] = (g.player(1, 2) or {}).get("life")
            return o
        return None

    def until(g):
        stack = g.state.get(1, {}).get("stack")
        if st["cast"] is not None and stack:
            st["seen"] = True
        if st.get("seen") and not stack and st["after"] is None:
            st["after"] = (g.player(1, 2) or {}).get("life")
        return st["after"] is not None

    g.run(policy, until=until, max_turn=14)
    found = {"cast on turn": st["cast"], "seat 1 asked with its own Bolt on top (window?)": st["own_stack_asks"],
             "seat 2 asked about it": st["seat2_asks"], "life": [st.get("life"), st["after"]],
             "stopped": g.stopped_badly()}
    if st["cast"] is None or st["after"] is None:
        return "inconclusive", "seat 1 never cast the Bolt it needed to", found
    problems = [found["stopped"]] if found["stopped"] else []
    if spare and st["own_stack_asks"] != [True]:
        problems.append(f"with a Bolt to spare, seat 1 should be asked once, as a window: {st['own_stack_asks']}")
    if not spare and st["own_stack_asks"]:
        problems.append(f"with nothing to respond with, seat 1 should be passed for: {st['own_stack_asks']}")
    if st["seat2_asks"]:
        problems.append("seat 2 has nothing to respond with: it should not be asked")
    if st.get("life") is not None and st["after"] != st["life"] - 3:
        problems.append(f"passing should resolve the Bolt: life {st.get('life')} -> {st['after']}")
    return result(problems, "own Bolt on top, a Bolt to spare: one question, marked as a response window; "
                  "passing resolved it" if spare else
                  "own Bolt on top, nothing to respond with: passed for, no window", found)


def end_step():
    """F-0035-A: a flash creature at the opponent's end step, when they did not attack."""
    g = game("end-step", [("Forest", 60)], [("Forest", 30), ("Ambush Viper", 30)])
    st = {"seat2_on_their_turn": collections.Counter(), "seat1_on_their_turn": 0, "cast": None}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat = f["authorisedSeat"]
        if not priority(f):
            return DEFAULT
        if seat != active and not stack:
            if seat == 2:
                st["seat2_on_their_turn"][phase] += 1
                if phase == "END_OF_TURN" and st["cast"] is None:
                    viper = g.option(f, name="Ambush Viper", zone="hand", land=False)
                    if viper:
                        st["cast"] = turn
                        return viper
            else:
                st["seat1_on_their_turn"] += 1
        return g.play_land(f)

    g.run(policy, until=lambda g: st["cast"] is not None and bool(g.mine(2, name="Ambush Viper")), max_turn=10)
    found = {"seat 2 asked on seat 1's turn, by step": dict(st["seat2_on_their_turn"]),
             "seat 1 asked on seat 2's turn": st["seat1_on_their_turn"], "Viper cast on turn": st["cast"],
             "Vipers in play": len(g.mine(2, name="Ambush Viper")), "stopped": g.stopped_badly()}
    if st["cast"] is None:
        return "inconclusive", "seat 2 never reached seat 1's end step with a Viper it could cast", found
    problems = [found["stopped"]] if found["stopped"] else []
    other = {k: v for k, v in st["seat2_on_their_turn"].items() if k != "END_OF_TURN"}
    if other:
        problems.append(f"seat 1 never attacks: seat 2 should be asked only at its end step: {other}")
    if st["seat1_on_their_turn"]:
        problems.append(f"seat 1 holds only lands: asked {st['seat1_on_their_turn']} time(s) on seat 2's turn")
    if not found["Vipers in play"]:
        problems.append("the Viper cast at the end step did not arrive")
    return result(problems, "asked at the opponent's end step, and only there; the flash creature arrived", found)


def before_attack():
    """F-0035-B: Bolt before they attack, and only while something could attack."""
    g = game("before-attack", BEARS, BOLTS)
    st = {"asked": 0, "asked_with_nothing_able": 0, "bolted": None, "bears_before": None, "aim": None}

    def able(g):
        return [c for c in g.mine(1, name="Grizzly Bears") if not c.get("tapped") and not c.get("sick")]

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat, kind = f["authorisedSeat"], f.get("kind")
        if kind == "chooseTargetsFor" and seat == 2 and st["aim"]:
            return target(f, st["aim"])
        if not priority(f):
            return DEFAULT
        if seat == 2 and active == 1 and phase == "COMBAT_BEGIN" and not stack:
            st["asked"] += 1
            bears = able(g)
            if not bears:
                st["asked_with_nothing_able"] += 1
            elif st["bolted"] is None:
                bolt = g.option(f, name="Lightning Bolt", zone="hand", land=False)
                if bolt:
                    st["bolted"], st["aim"] = turn, bears[0]["id"]
                    st["bears_before"] = len(g.mine(1, name="Grizzly Bears"))
                    return bolt
        if seat == 1 and str(phase).startswith("MAIN"):
            return g.play_land(f) or cast(g, f, "Grizzly Bears")
        return g.play_land(f)

    def until(g):
        return st["bolted"] is not None and g.turn > st["bolted"]

    g.run(policy, until=until, max_turn=12)
    found = dict(st, bears_after=len(g.mine(1, name="Grizzly Bears")), stopped=g.stopped_badly())
    if st["bolted"] is None:
        return "inconclusive", "seat 2 never had a Bolt before seat 1 could attack", found
    problems = [found["stopped"]] if found["stopped"] else []
    if st["asked_with_nothing_able"]:
        problems.append(f"asked before combat {st['asked_with_nothing_able']} time(s) when nothing could attack")
    if found["bears_after"] != st["bears_before"] - 1:
        problems.append(f"the Bolt before combat should kill a Bear: {st['bears_before']} -> {found['bears_after']}")
    return result(problems, "asked before the attack only while a Bear could attack; the Bolt there killed one", found)


def upkeep_only():
    """F-0035-C: an ability that works only in your upkeep is offered there."""
    g = game("upkeep-only", [("Swamp", 30), ("Augur of Skulls", 30)], [("Forest", 60)])
    st = {"upkeep_asks_without": 0, "upkeep_offers": 0, "used": None}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat, kind = f["authorisedSeat"], f.get("kind")
        if kind == "chooseTargetsFor" and seat == 1:
            return target(f, "player:2")
        if not priority(f) or seat != 1:
            return DEFAULT
        if phase == "UPKEEP" and active == 1 and not stack:
            if not g.mine(1, name="Augur of Skulls"):
                st["upkeep_asks_without"] += 1
            discard = g.option(f, contains="discards", name="Augur of Skulls", zone="battlefield")
            if discard:
                st["upkeep_offers"] += 1
                if st["used"] is None:
                    st["used"] = turn
                    return discard
            return None
        if active == 1 and str(phase).startswith("MAIN"):
            land = g.play_land(f)
            if land:
                return land
            if not g.mine(1, name="Augur of Skulls"):
                return cast(g, f, "Augur of Skulls")
        return None

    def until(g):
        state = g.state.get(1, {})
        return st["used"] is not None and not state.get("stack") and state.get("phase") not in ("UPKEEP", None)

    g.run(policy, until=until, max_turn=10)
    found = dict(st, augur_in_graveyard=len(g.mine(1, "graveyard", name="Augur of Skulls")),
                 stopped=g.stopped_badly())
    if st["used"] is None:
        return "inconclusive", "seat 1 never reached an upkeep with Augur of Skulls in play", found
    problems = [found["stopped"]] if found["stopped"] else []
    if st["upkeep_asks_without"]:
        problems.append(f"asked in its upkeep {st['upkeep_asks_without']} time(s) with no Augur in play")
    if not found["augur_in_graveyard"]:
        problems.append("the Augur's upkeep ability should have been used (Augur sacrificed)")
    return result(problems, "Augur of Skulls' upkeep-only ability was offered in the upkeep and used; "
                            "no upkeep stop before there was one", found)


def stack_answer(name, seat2, offered, needs=()):
    """Seat 1 Bolts seat 2's creature (seat 2 itself when it has none): is
    seat 2 asked while the Bolt is on the stack, with `offered` among its
    options? `needs`: cards seat 2 must have in play first."""
    g = game(name, BOLTS, seat2)
    st = {"cast": None, "asked": [], "aim": None}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat, kind = f["authorisedSeat"], f.get("kind")
        if kind == "chooseTargetsFor" and seat == 1:
            return target(f, st["aim"])
        if not priority(f):
            return DEFAULT
        if seat == 2:
            if st["cast"] is not None and stack:
                st["asked"].append(g.labels(f))
                return None
            if active == 2 and str(phase).startswith("MAIN"):
                land = g.play_land(f)
                if land:
                    return land
                for card in needs:
                    if not g.mine(2, name=card):
                        o = cast(g, f, card)
                        if o:
                            return o
            return None
        land = g.play_land(f)
        if land:
            return land
        ready = all(g.mine(2, name=card) for card in needs)
        if st["cast"] is None and active == 1 and not stack and turn >= 2 and ready:
            bolt = g.option(f, name="Lightning Bolt", zone="hand", land=False)
            if bolt:
                bears = g.mine(2, name="Grizzly Bears")
                st["aim"] = bears[0]["id"] if bears else "player:2"
                st["cast"] = turn
                return bolt
        return None

    g.run(policy, until=lambda g: st["cast"] is not None and g.turn > st["cast"], max_turn=14)
    found = {"Bolt cast on turn": st["cast"], "seat 2 asked with the Bolt on the stack": st["asked"],
             "stopped": g.stopped_badly()}
    if st["cast"] is None:
        return "inconclusive", "seat 1 never cast its Bolt at the moment it needed", found
    problems = [found["stopped"]] if found["stopped"] else []
    if not any(any(offered in label for label in labels) for labels in st["asked"]):
        problems.append(f"seat 2 should be asked while the Bolt is on the stack, {offered} among its options")
    return result(problems, f"seat 2 was asked with the Bolt on the stack, {offered} among its options", found)


def ninjutsu():
    """F-0035-F: Ninjutsu after blocks on your turn."""
    g = game("ninjutsu", [("Island", 36), ("Ninja of the Deep Hours", 24)], [("Forest", 60)])
    st = {"attacked": None, "asked_after_blocks": [], "offered": False}

    def policy(g, f):
        turn, phase, stack, active = where(g, f)
        seat, kind = f["authorisedSeat"], f.get("kind")
        if seat != 1:
            return DEFAULT
        if kind == "declareAttackers":
            if st["attacked"] == turn:
                return None  # one Ninja attacks; the rest stay home
            ninja = next((o["actionId"] for o in f.get("options", [])
                          if (o.get("label") or "").startswith("Ninja")), None)
            if ninja:
                st["attacked"] = turn
            return ninja
        if not priority(f):
            return DEFAULT
        if phase == "COMBAT_DECLARE_BLOCKERS" and active == 1 and not stack:
            st["asked_after_blocks"].append(turn)
            if any("Ninjutsu" in label for label in g.labels(f)):
                st["offered"] = True
            return None
        land = g.play_land(f)
        if land:
            return land
        if active == 1 and str(phase).startswith("MAIN") and not g.mine(1, name="Ninja of the Deep Hours"):
            return cast(g, f, "Ninja of the Deep Hours")
        return None

    g.run(policy, until=lambda g: st["offered"] or (st["attacked"] and g.turn > st["attacked"] + 1), max_turn=12)
    found = dict(st, stopped=g.stopped_badly())
    if st["attacked"] is None:
        return "inconclusive", "seat 1 never attacked with a Ninja", found
    problems = [found["stopped"]] if found["stopped"] else []
    if not st["offered"]:
        problems.append("after blocks, with a Ninja unblocked and another in hand, Ninjutsu should be offered")
    return result(problems, "asked after blocks with an unblocked Ninja, Ninjutsu among the options", found)


SCENARIOS = {"quiet": quiet, "respond": respond, "nothing": nothing,
             "window": lambda: window(True), "window-none": lambda: window(False),
             "end-step": end_step, "before-attack": before_attack, "upkeep-only": upkeep_only,
             "altar": lambda: stack_answer("altar", [("Forest", 20), ("Ashnod's Altar", 10), ("Grizzly Bears", 30)],
                                           "Ashnod", needs=("Ashnod's Altar", "Grizzly Bears")),
             "force": lambda: stack_answer("force", [("Force of Will", 60)], "Force of Will"),
             "ninjutsu": ninjutsu}

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
