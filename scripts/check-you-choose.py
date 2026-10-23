"""Questions a card puts to its player: the answer is what happens. PHASE_08 P8-E.

    python -I scripts/check-you-choose.py <worker.jar> <res-root> [trace-dir] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B), answers
with the LAST option offered so no default could pass for the player,
and checks the result on the board:

  brave           Brave the Elements: "choose a colour" (Forge asks it as
                  chooseColors, one or more) -- the player's white
                  creatures gain protection from exactly that colour
  gods-willing    Gods Willing: "protection from what?"
                  (chooseProtectionType) -- the target gains protection
                  from exactly that colour; then its scry 1 is asked
  pioneer-yes     Elvish Pioneer: "use the triggered ability?"
                  (confirmTrigger) -- Yes: a basic land from the hand
                  enters the battlefield tapped
  pioneer-no      the same, No: no land enters, the hand keeps it
  clone-yes       Clone: "enter as a copy?" (confirmReplacementEffect) --
                  Yes, then the opponent's Grizzly Bears: Clone is a
                  Grizzly Bears, under its caster's control
  clone-no        the same, No: Clone enters as a 0/0 and dies
  venture         Nadaar, Selfless Paladin: which dungeon
                  (chooseSingleCardFace) -- the one picked is in the
                  command zone, shown to both players
  blaze           Blaze: X (announceRequirements) -- X = 2, not the first
                  value offered; the opponent loses exactly 2 life
  axe             Lightning Axe: discard a card, or pay {5}
                  (getAbilityToPlay) -- discard; then which card (the
                  LAST): that card is in the graveyard
  axe-five        the same, pay {5} (the LAST option): nothing discarded
  reckoning       Divine Reckoning: each player chooses a creature they
                  control (chooseCardsForEffect) -- each keeps exactly
                  the one they picked, and only their own were offered
  sting           Lethal Sting: put a -1/-1 counter on a creature you
                  control, as a cost (CostPutCounter) -- on the one picked
  converge        Painful Truths paid with Reflecting Pool: colour or
                  colourless (chooseColorAllowColorless) -- blue, so
                  converge counts two colours: lose 2, draw 2
  echo-pay        Goblin War Buggy's echo (payCostToPreventEffect): the
                  mana question says "Echo for Goblin War Buggy" and what
                  passing does; paid, the Buggy stays
  echo-no         the same, passed: the Buggy is sacrificed
  cascade-yes     Bloodbraid Elf's cascade (playSaFromPlayEffect): Yes, and
                  the Grizzly Bears it revealed is cast for free
  cascade-no      the same, No: nothing is cast
  spellskite      Spellskite against Arc Lightning on two Lions (chooseTarget):
                  the LAST target offered is changed to Spellskite
  vote            Council's Judgment (vote): both players vote for the LAST
                  Bears offered; that one is exiled, the other stays
  blackmail       Blackmail: the opponent picks the three to reveal (the LAST
                  three); the caster chooses from exactly those, and that
                  one is discarded
  piles           Fact or Fiction: the opponent puts one card in pile 1; the
                  caster chooses pile 2 (the LAST answer) and gets exactly
                  its four cards
  gift            Alchemist's Gift: deathtouch or lifelink -- Lifelink (the
                  LAST): the Bears has lifelink, not deathtouch
  elspeth         Elspeth Resplendent's +1: which kind of counter
                  (chooseCounterType) -- the LAST, and the creature has
                  that keyword, and no other offered
  guildmage       Zameck Guildmage: remove a +1/+1 counter from a creature
                  you control, as a cost (CostRemoveCounter) -- from the
                  one picked; the other keeps its counter

Every question is asked of the right player only (the caster), and the
cross-game checks (check-hidden-hands, check-snapshot-first) read these
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


BASICS = {"Plains", "Island", "Swamp", "Mountain", "Forest"}


class LandKeeper(Game):
    """Discards down to hand size from the spells, keeping the lands: the
    harness's first-card default threw lands away, and a game stuck short
    of mana never reaches the card it exists for."""

    def default(self, frame):
        if frame.get("kind") == "chooseCardsToDiscardToMaximumHandSize":
            spare = [o for o in frame.get("options", []) if (o.get("label") or "") not in BASICS]
            if spare:
                return spare[0]["actionId"]
        return super().default(frame)


def game(name, seat1, seat2=BEARS):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"you-choose-{name}.jsonl")
    return LandKeeper(seat1, seat2, jar=JAR, res=RES, trace=trace)


def stack_empty(g):
    return not g.state.get(1, {}).get("stack") and not g.state.get(2, {}).get("stack")


def cast(g, f, name):
    o = g.option(f, name=name, zone="hand", land=False)
    if o and any(x["actionId"] == o and x.get("payable") is False for x in f["options"]):
        return None
    return o


def creature(g, name):
    return next((c for c in g.mine(1, name=name)), None)


def protection(g, name):
    c = creature(g, name)
    return [k for k in (c or {}).get("keywords", []) or [] if "rotection" in k]


def protect(name, spell, kind):
    """Cast `spell` on/for seat 1's Savannah Lions; answer `kind` with the last colour offered."""
    g = game(name, [("Plains", 24), ("Savannah Lions", 18), (spell, 18)])
    st = {"cast": False, "asked": [], "picked": None, "after": None}

    def policy(g, f):
        k = f.get("kind")
        if k == kind:
            st["asked"].append((f["authorisedSeat"], [o.get("label") for o in f["options"]]))
            st["picked"] = f["options"][-1].get("label")
            return f["options"][-1]["actionId"]
        if f["authorisedSeat"] == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            if not st["cast"] and creature(g, "Savannah Lions") and cast(g, f, spell):
                st["cast"] = True
                return cast(g, f, spell)
            return g.play_land(f) or cast(g, f, "Savannah Lions")
        if k == "chooseTargetsFor" and f["authorisedSeat"] == 1:
            return next((o["actionId"] for o in f["options"] if "Savannah Lions" in (o.get("label") or "")), DEFAULT)
        if k == "willPutCardOnTop":
            return f["options"][0]["actionId"]
        return DEFAULT

    def until(g):
        if st["picked"] and stack_empty(g) and st["after"] is None:
            st["after"] = protection(g, "Savannah Lions")
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"asked": st["asked"], "picked": st["picked"], "protection": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", f"{spell} never asked {kind}", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the opponent was asked about seat 1's spell")
    if len(st["asked"][0][1]) < 2:
        problems.append(f"only {st['asked'][0][1]} offered: no choice to prove")
    # Exactly Forge's words for it, as the board shows them.
    if st["after"] != [f"Protection from {st['picked'].lower()}"]:
        problems.append(f"picked {st['picked']!r}, but the Lions have {st['after']}")
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", f"{spell}: the colour picked, {st['picked']}, is the protection the Lions have", found)


def pioneer(yes):
    g = game(f"pioneer-{'yes' if yes else 'no'}", [("Forest", 36), ("Elvish Pioneer", 24)])
    st = {"cast": False, "asked": [], "before": None, "after": None}

    def lands(seat=1):
        return [c["id"] for c in g.mine(seat) if c.get("kind") == "land"]

    def hand_lands():
        return [c["id"] for c in g.zone(1, "hand") if c.get("name") == "Forest"]

    def policy(g, f):
        k = f.get("kind")
        if k == "confirmTrigger":
            st["asked"].append((f["authorisedSeat"], f.get("prompt")))
            st["before"] = {"lands": lands(), "hand": hand_lands()}
            return "confirm:yes" if yes else "confirm:no"
        if k == "chooseSingleEntityForEffect" and st["asked"] and f["authorisedSeat"] == 1:
            # Yes, then which basic land from the hand: a Forest.
            return next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith("Forest")), DEFAULT)
        if f["authorisedSeat"] == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            # Cast it while holding a Forest to put in, with this turn's land already played.
            if not st["cast"] and hand_lands() and len(lands()) >= 1 and not g.option(f, land=True):
                o = cast(g, f, "Elvish Pioneer")
                if o:
                    st["cast"] = True
                    return o
            return g.play_land(f)
        return DEFAULT

    def until(g):
        if st["asked"] and stack_empty(g) and st["after"] is None:
            st["after"] = {"lands": lands(), "hand": hand_lands(),
                           "tapped": [c["id"] for c in g.mine(1) if c.get("kind") == "land" and c.get("tapped")]}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"asked": st["asked"], "before": st["before"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Elvish Pioneer's trigger was never asked about", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the opponent was asked about seat 1's trigger")
    new = [c for c in st["after"]["lands"] if c not in st["before"]["lands"]]
    if yes:
        if len(new) != 1:
            problems.append(f"said Yes, but {len(new)} lands entered")
        elif new[0] not in st["before"]["hand"]:
            problems.append(f"the land that entered, {new[0]}, was not one from the hand")
        elif new[0] not in st["after"]["tapped"]:
            problems.append("the land entered untapped; the card says tapped")
    elif new:
        problems.append(f"said No, but {new} entered")
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "Elvish Pioneer: Yes put a Forest from the hand onto the battlefield tapped" if yes
         else "Elvish Pioneer: No, and nothing entered", found)


def outcome(problems, ok, found):
    if found.get("stopped"):
        problems = problems + [found["stopped"]]
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def theirs(g, name):
    """The opponent's `name` creatures, as seat 1 sees them."""
    return [c for c in g.zone(1, "battlefield", owner=2) if c.get("name") == name]


def seat2_bears(g, f):
    """The opponent plays lands and Grizzly Bears: something to aim at."""
    return g.play_land(f) or (cast(g, f, "Grizzly Bears") if stack_empty(g) else None)


def counters_of(c):
    return {k["name"]: k["count"] for k in (c or {}).get("counters", []) or []}


def clone(yes):
    g = game(f"clone-{'yes' if yes else 'no'}", [("Island", 30), ("Clone", 30)])
    st = {"clone": None, "asked": [], "copied": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "confirmReplacementEffect":
            st["asked"].append((seat, [o.get("label") for o in f["options"]]))
            return "confirm:yes" if yes else "confirm:no"
        if k == "chooseSingleEntityForEffect" and st["asked"] and seat == 1:
            o = next((o for o in f["options"] if (o.get("label") or "").startswith("Grizzly Bears")), None)
            st["copied"] = o and card_of(o["actionId"])
            return o["actionId"] if o else DEFAULT
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return seat2_bears(g, f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if stack_empty(g) and st["clone"] is None and theirs(g, "Grizzly Bears"):
                o = cast(g, f, "Clone")
                if o:
                    st["clone"] = card_of(o)
                    return o
            return g.play_land(f) if stack_empty(g) else None
        return DEFAULT

    def until(g):
        if st["asked"] and stack_empty(g) and st["after"] is None:
            st["after"] = {"mine": [(c["id"], c.get("name")) for c in g.mine(1) if c.get("kind") == "creature"],
                           "grave": [c["id"] for c in g.zone(1, "graveyard", owner=1, name="Clone")]}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"clone": st["clone"], "asked": st["asked"], "copied": st["copied"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Clone never asked whether to copy", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the opponent was asked about seat 1's Clone")
    mine = dict(st["after"]["mine"])
    if yes:
        if mine.get(st["clone"]) != "Grizzly Bears":
            problems.append(f"said Yes and picked the Bears, but seat 1's creatures are {st['after']['mine']}")
    elif st["clone"] in mine or st["clone"] not in st["after"]["grave"]:
        problems.append(f"said No: Clone should enter as a 0/0 and die, but {st['after']}")
    return outcome(problems, "Clone: Yes, and it is a Grizzly Bears under its caster's control" if yes
                  else "Clone: No, and it entered as a 0/0 and died", found)


def venture():
    g = game("venture", [("Plains", 30), ("Nadaar, Selfless Paladin", 30)])
    st = {"asked": [], "picked": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseSingleCardFace":
            st["asked"].append((seat, [o.get("label") for o in f["options"]]))
            if st["picked"] is None:
                st["picked"] = f["options"][-1].get("label")
            return f["options"][-1]["actionId"]
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            return g.play_land(f) or (None if g.mine(1, name="Nadaar, Selfless Paladin")
                                      else cast(g, f, "Nadaar, Selfless Paladin"))
        return DEFAULT

    def until(g):
        if st["picked"] and stack_empty(g) and st["after"] is None:
            views = {seat: (g.player(seat, 1) or {}).get("command") for seat in (1, 2)}
            st["since"] = st.get("since") or g.turn
            # Each player's board arrives separately: wait for both to show it.
            if all(any(st["picked"] in str(c) for c in v or []) for v in views.values()) or g.turn > st["since"] + 1:
                st["after"] = views
        return st["after"] is not None

    g.run(policy, until=until, max_turn=14)
    found = {"asked": st["asked"], "picked": st["picked"], "command": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Nadaar never ventured", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the opponent was asked which dungeon")
    if len(st["asked"][0][1]) < 2:
        problems.append(f"only {st['asked'][0][1]} offered")
    for seat, command in (st["after"] or {}).items():
        if not any(st["picked"] in str(c) for c in command or []):
            problems.append(f"picked {st['picked']!r}, but seat {seat} sees {command}")
    return outcome(problems, f"Nadaar: the dungeon picked, {st['picked']}, is in the command zone for both players",
                  found)


def blaze():
    g = game("blaze", [("Mountain", 36), ("Blaze", 24)])
    st = {"cast": False, "asked": [], "x": None, "before": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "announceRequirements":
            st["asked"].append((seat, [o["actionId"] for o in f["options"]]))
            if "number:2" in [o["actionId"] for o in f["options"]]:
                st["x"] = 2
                return "number:2"
            return DEFAULT
        if k == "chooseTargetsFor" and seat == 1:
            return next((o["actionId"] for o in f["options"] if o.get("label") == "Bob"), DEFAULT)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            if not st["cast"] and len(g.untapped_lands(1)) >= 4 and cast(g, f, "Blaze"):
                st["cast"], st["before"] = card_of(cast(g, f, "Blaze")), (g.player(1, 2) or {}).get("life")
                return cast(g, f, "Blaze")
            return g.play_land(f)
        return DEFAULT

    def until(g):
        # X is chosen while casting, before the spell is on the stack: wait
        # for THIS Blaze to resolve, into the graveyard (another may have
        # been discarded down to hand size).
        resolved = any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if st["x"] and resolved and stack_empty(g) and st["after"] is None:
            st["after"] = (g.player(1, 2) or {}).get("life")
        return st["after"] is not None

    g.run(policy, until=until, max_turn=12)
    found = {"asked": st["asked"], "x": st["x"], "life": [st["before"], st["after"]], "stopped": g.stopped_badly()}
    if not st["x"]:
        return "inconclusive", "Blaze never asked for X with 2 on offer", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the opponent was asked for X")
    if st["asked"][0][1][0] == "number:2":
        problems.append("2 was the first value offered: picking it proves nothing")
    if st["before"] is None or st["after"] != st["before"] - 2:
        problems.append(f"X = 2, but the opponent's life went {st['before']} -> {st['after']}")
    return outcome(problems, "Blaze: X = 2 chosen, and the opponent lost exactly 2 life", found)


def axe(pay=False):
    """pay=False: discard a card (the first option). pay=True: pay {5}, the
    LAST option -- so a worker that takes the first could not pass both."""
    g = game("axe-five" if pay else "axe", [("Mountain", 36), ("Lightning Axe", 24)])
    st = {"cast": False, "abilities": [], "discard": [], "discarded": None, "target": None, "after": None,
          "axes": [], "grave_before": []}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "getAbilityToPlay":
            st["abilities"].append((seat, [o.get("label") or "" for o in f["options"]]))
            want = "{5}" if pay else "iscard"
            return next((o["actionId"] for o in f["options"]
                         if want in (o.get("label") or "").split("(Additional cost:")[-1]), DEFAULT)
        if k == "chooseCardsToDiscardToMaximumHandSize" and seat == 1:
            # Down to seven: spare Axes go, the Mountains the {5} needs stay.
            return next((o["actionId"] for o in f["options"] if o.get("label") == "Lightning Axe"), DEFAULT)
        if k == "CostDiscard":
            st["discard"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"])))
            st["discarded"] = card_of(f["options"][-1]["actionId"])
            return f["options"][-1]["actionId"]
        if k == "chooseTargetsFor" and seat == 1:
            o = next((o for o in f["options"] if (o.get("label") or "").startswith("Grizzly Bears")), None)
            st["target"] = o and card_of(o["actionId"])
            return o["actionId"] if o else DEFAULT
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return seat2_bears(g, f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            ready = len(g.untapped_lands(1)) >= 6 if pay else len(g.zone(1, "hand")) >= 3
            if not st["cast"] and theirs(g, "Grizzly Bears") and ready:
                o = cast(g, f, "Lightning Axe")
                if o:
                    st["cast"], st["axes"] = True, [card_of(o)]
                    st["grave_before"] = [c["id"] for c in g.zone(1, "graveyard", owner=1)]
                    return o
            return g.play_land(f)
        return DEFAULT

    def until(g):
        # The Axe that was CAST, resolved: another may have been discarded
        # down to hand size earlier, and would look the same.
        resolved = st["axes"] and any(c["id"] == st["axes"][0] for c in g.zone(1, "graveyard", owner=1))
        if (st["discarded"] or pay) and resolved and stack_empty(g) and st["after"] is None:
            st["after"] = {"grave": [c["id"] for c in g.zone(1, "graveyard", owner=1)],
                           "hand": [c["id"] for c in g.zone(1, "hand")],
                           "bears": [c["id"] for c in g.zone(1, "graveyard", owner=2)]}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {k: st[k] for k in ("abilities", "discard", "discarded", "target", "after")}
    found["stopped"] = g.stopped_badly()
    if not st["abilities"] or not st["after"] or (not pay and not st["discarded"]):
        return "inconclusive", "Lightning Axe never asked which additional cost, or which card", found
    problems = []
    if any(seat != 1 for seat, _ in st["abilities"] + st["discard"]):
        problems.append("the opponent was asked about seat 1's Lightning Axe")
    if len(st["abilities"][0][1]) != 2:
        problems.append(f"expected discard or pay {{5}}: {st['abilities'][0][1]}")
    if pay:
        others = [c for c in st["after"]["grave"] if c not in st["axes"] and c not in st["grave_before"]]
        if st["discard"] or others:
            problems.append(f"paid {{5}}, but a card was discarded: {st['discard']} {others}")
    elif st["discarded"] not in st["after"]["grave"] or st["discarded"] in st["after"]["hand"]:
        problems.append(f"picked {st['discarded']} to discard, but {st['after']}")
    if st["target"] not in st["after"]["bears"]:
        problems.append(f"the Bears {st['target']} should have died to the Axe")
    return outcome(problems, "Lightning Axe: paid {5}, nothing discarded, the Bears died" if pay
                   else "Lightning Axe: discard chosen, the card picked was discarded, the Bears died", found)


def reckoning():
    g = game("reckoning", [("Plains", 28), ("Savannah Lions", 18), ("Divine Reckoning", 14)])
    st = {"cast": False, "asked": [], "after": None}

    def creatures(seat):
        return sorted(c["id"] for c in g.zone(seat, "battlefield", owner=seat) if c.get("kind") == "creature")

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k in ("chooseSingleEntityForEffect", "chooseEntitiesForEffect") and st["cast"]:
            st["asked"].append({"seat": seat, "kind": k, "offered": sorted(card_of(o["actionId"]) for o in f["options"]),
                                "own": creatures(seat), "picked": card_of(f["options"][-1]["actionId"])})
            return f["options"][-1]["actionId"]
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return seat2_bears(g, f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            if not st["cast"] and len(creatures(1)) >= 2 and len(creatures(2)) >= 2:
                o = cast(g, f, "Divine Reckoning")
                if o:
                    st["cast"] = True
                    return o
            return g.play_land(f) or (cast(g, f, "Savannah Lions") if len(creatures(1)) < 3 else None)
        return DEFAULT

    def until(g):
        if len(st["asked"]) >= 2 and stack_empty(g) and st["after"] is None:
            # Both sides as seat 1's board shows them: seat 2's own view may
            # not have caught up with the snapshot that just arrived.
            st["after"] = {seat: sorted(c["id"] for c in g.zone(1, "battlefield", owner=seat)
                                        if c.get("kind") == "creature") for seat in (1, 2)}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"asked": st["asked"], "after": st["after"], "stopped": g.stopped_badly()}
    if len(st["asked"]) < 2:
        return "inconclusive", "Divine Reckoning never asked both players", found
    problems = []
    for q in st["asked"]:
        if q["offered"] != q["own"]:
            problems.append(f"seat {q['seat']} was offered {q['offered']}, not exactly its creatures {q['own']}")
        if len(q["offered"]) < 2:
            problems.append(f"seat {q['seat']} had no real choice: {q['offered']}")
        if st["after"][q["seat"]] != [q["picked"]]:
            problems.append(f"seat {q['seat']} picked {q['picked']}, but kept {st['after'][q['seat']]}")
    if sorted(q["seat"] for q in st["asked"]) != [1, 2]:
        problems.append(f"each player should be asked once: {[q['seat'] for q in st['asked']]}")
    return outcome(problems, "Divine Reckoning: each player chose among their own creatures and kept exactly that one",
                  found)


def sting():
    g = game("sting", [("Swamp", 24), ("Walking Corpse", 20), ("Lethal Sting", 16)])
    st = {"cast": False, "asked": [], "picked": None, "after": None, "target": None}

    def mine():
        return {c["id"]: c for c in g.mine(1) if c.get("kind") == "creature"}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostPutCounter":
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"]), sorted(mine())))
            st["picked"] = card_of(f["options"][-1]["actionId"])
            return f["options"][-1]["actionId"]
        if k == "chooseTargetsFor" and seat == 1:
            o = next((o for o in f["options"] if (o.get("label") or "").startswith("Grizzly Bears")), None)
            st["target"] = o and card_of(o["actionId"])
            return o["actionId"] if o else DEFAULT
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return seat2_bears(g, f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            if not st["cast"] and len(mine()) >= 2 and theirs(g, "Grizzly Bears"):
                o = cast(g, f, "Lethal Sting")
                if o:
                    st["cast"] = card_of(o)
                    return o
            return g.play_land(f) or (cast(g, f, "Walking Corpse") if len(mine()) < 3 else None)
        return DEFAULT

    def until(g):
        sting_done = any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if st["picked"] and sting_done and stack_empty(g) and st["after"] is None:
            st["after"] = {cid: (counters_of(c), c.get("power"), c.get("toughness")) for cid, c in mine().items()}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"asked": st["asked"], "picked": st["picked"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Lethal Sting's counter cost was never asked", found
    problems = []
    seat, offered, own = st["asked"][0]
    if seat != 1:
        problems.append("the opponent was asked where seat 1's cost counter goes")
    if offered != own or len(offered) < 2:
        problems.append(f"offered {offered}, not exactly seat 1's creatures {own} (two or more)")
    for cid, (counters, power, toughness) in st["after"].items():
        has = sum(counters.values())
        if cid == st["picked"] and (has != 1 or (power, toughness) != (1, 1)):
            problems.append(f"the counter should be on {cid}, a 1/1 now: {counters} {power}/{toughness}")
        if cid != st["picked"] and has:
            problems.append(f"{cid} was not picked, but has {counters}")
    return outcome(problems, "Lethal Sting: the -1/-1 counter went on the creature picked, and no other", found)


def guildmage():
    g = game("guildmage", [("Forest", 14), ("Island", 14), ("Servant of the Scale", 20), ("Zameck Guildmage", 12)])
    st = {"used": False, "asked": [], "picked": None, "after": None, "hand": None}

    def servants():
        return {c["id"]: c for c in g.mine(1, name="Servant of the Scale")}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostRemoveCounter":
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"]),
                                sorted(cid for cid, c in servants().items() if counters_of(c))))
            st["picked"] = card_of(f["options"][-1]["actionId"])
            return f["options"][-1]["actionId"]
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            if not st["used"] and len(servants()) >= 2 and g.mine(1, name="Zameck Guildmage"):
                o = g.option(f, name="Zameck Guildmage", zone="battlefield", contains="raw")
                if o and not any(x["actionId"] == o and x.get("payable") is False for x in f["options"]):
                    st["used"], st["hand"] = True, len(g.zone(1, "hand"))
                    return o
            land = g.play_land(f, prefer="Island" if not g.mine(1, name="Island") else None)
            if land:
                return land
            if not g.mine(1, name="Zameck Guildmage") and cast(g, f, "Zameck Guildmage"):
                return cast(g, f, "Zameck Guildmage")
            return cast(g, f, "Servant of the Scale") if len(servants()) < 3 else None
        return DEFAULT

    def until(g):
        if st["picked"] and stack_empty(g) and st["after"] is None:
            st["after"] = {"servants": {cid: counters_of(c) for cid, c in servants().items()},
                           "grave": [c["id"] for c in g.zone(1, "graveyard", owner=1)],
                           "hand": len(g.zone(1, "hand"))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"asked": st["asked"], "picked": st["picked"], "after": st["after"], "hand_before": st["hand"],
             "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Zameck Guildmage's counter cost was never asked", found
    problems = []
    seat, offered, with_counters = st["asked"][0]
    if seat != 1:
        problems.append("the opponent was asked about seat 1's cost")
    if len(offered) < 2 or not set(with_counters) <= set(offered):
        problems.append(f"offered {offered}: every Servant with a counter {with_counters} should be, two or more")
    after = st["after"]
    # A Servant is a 0/0 with its counter: losing it, it dies.
    if st["picked"] in after["servants"] or st["picked"] not in after["grave"]:
        problems.append(f"the counter should have come off {st['picked']} (a 0/0 then, so dead): {after}")
    if any(not c for c in after["servants"].values()):
        problems.append(f"a Servant not picked lost its counter: {after['servants']}")
    if after["hand"] != (st["hand"] or 0) + 1:
        problems.append(f"the Guildmage should have drawn a card: hand {st['hand']} -> {after['hand']}")
    return outcome(problems, "Zameck Guildmage: the counter came off the Servant picked (which died), and a card "
                            "was drawn", found)


def elspeth():
    g = game("elspeth", [("Plains", 30), ("Savannah Lions", 16), ("Elspeth Resplendent", 14)])
    st = {"used": False, "asked": [], "picked": None, "lions": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseCounterType":
            st["asked"].append((seat, [o.get("label") for o in f["options"]]))
            st["picked"] = f["options"][-1].get("label")
            return f["options"][-1]["actionId"]
        if k == "chooseTargetsFor" and seat == 1 and st["used"]:
            o = next((o for o in f["options"] if card_of(o["actionId"]) == st["lions"]), None)
            return o["actionId"] if o else DEFAULT
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            lions = g.mine(1, name="Savannah Lions")
            if not st["used"] and lions and g.mine(1, name="Elspeth Resplendent"):
                o = next((o["actionId"] for o in f["options"]
                          if (o.get("label") or "").startswith("Elspeth Resplendent") and "+1" in (o.get("label") or "")),
                         None)
                if o:
                    st["used"], st["lions"] = True, lions[0]["id"]
                    return o
            land = g.play_land(f)
            if land:
                return land
            if not g.mine(1, name="Elspeth Resplendent") and lions and cast(g, f, "Elspeth Resplendent"):
                return cast(g, f, "Elspeth Resplendent")
            return None if lions else cast(g, f, "Savannah Lions")
        return DEFAULT

    def until(g):
        if st["picked"] and stack_empty(g) and st["after"] is None:
            c = next((c for c in g.mine(1) if c["id"] == st["lions"]), None)
            st["after"] = c and {"keywords": c.get("keywords"), "counters": counters_of(c),
                                 "pt": (c.get("power"), c.get("toughness"))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"asked": st["asked"], "picked": st["picked"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Elspeth's +1 never asked which kind of counter", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the opponent was asked about seat 1's counter")
    if len(st["asked"][0][1]) < 2:
        problems.append(f"no real choice: {st['asked'][0][1]}")
    after = st["after"] or {}
    if st["picked"] not in (after.get("keywords") or []):
        problems.append(f"picked {st['picked']!r}, but the Lions have {after.get('keywords')}")
    others = [o for o in st["asked"][0][1] if o != st["picked"] and o in (after.get("keywords") or [])]
    if others:
        problems.append(f"the Lions also have {others}, which were not picked")
    if after.get("pt") != (3, 2):
        problems.append(f"the +1/+1 counter should make the Lions 3/2: {after.get('pt')}")
    return outcome(problems, f"Elspeth's +1: the counter picked, {st['picked']}, is the keyword the Lions gained", found)


def converge():
    """Painful Truths, converge: draw X, lose X, X = colours of mana spent.
    Paid Swamp {B}, Reflecting Pool, Wastes {C}: the Pool's colour is the
    whole difference -- blue makes X 2; colourless (the first option) or
    black makes it 1."""
    g = game("converge", [("Swamp", 10), ("Island", 10), ("Wastes", 10), ("Reflecting Pool", 10),
                          ("Painful Truths", 20)])
    st = {"cast": None, "asked": [], "picked": None, "before": None, "after": None}
    order = ["Reflecting Pool", "Swamp", "Island", "Wastes"]

    def lands():
        return {c.get("name") for c in g.mine(1) if c.get("kind") == "land"}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if seat != 1:
            return DEFAULT
        # The page asks it as chooseColor, with "Colourless" among the answers.
        if k == "chooseColor" and "Colourless" in [o.get("label") for o in f["options"]]:
            st["asked"].append((seat, k, [o.get("label") for o in f["options"]]))
            o = next((o for o in f["options"] if o.get("label") == "blue"), None)
            st["picked"] = o and "blue"
            return o["actionId"] if o else DEFAULT
        if k == "applyManaToCost" and st["cast"]:
            # {B} from the Swamp, then the Pool, then the Wastes' {C}: never the Island.
            for want in ("Swamp", "Reflecting Pool", "Wastes"):
                o = next((o for o in f["options"] if (o.get("label") or "").startswith(want)), None)
                if o:
                    return o["actionId"]
            return DEFAULT
        if k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            for land in order:
                if land not in lands():
                    o = g.option(f, name=land, land=True)
                    if o:
                        return o
            untapped = {c.get("name") for c in g.untapped_lands(1)}
            if not st["cast"] and set(order) <= lands() and {"Swamp", "Reflecting Pool", "Wastes"} <= untapped:
                o = cast(g, f, "Painful Truths")
                if o:
                    st["cast"] = card_of(o)
                    me = g.player(1, 1) or {}
                    st["before"] = {"life": me.get("life"), "hand": len(g.zone(1, "hand"))}
                    return o
            return g.play_land(f)
        return DEFAULT

    def until(g):
        done = st["cast"] and any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if done and stack_empty(g) and st["after"] is None:
            me = g.player(1, 1) or {}
            st["after"] = {"life": me.get("life"), "hand": len(g.zone(1, "hand"))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"asked": st["asked"], "picked": st["picked"], "before": st["before"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["picked"]:
        return "inconclusive", "Reflecting Pool never asked colour or colourless while paying", found
    problems = []
    seat, kind, labels = next(a for a in st["asked"] if "Colourless" in a[2])
    if seat != 1:
        problems.append("the opponent was asked about seat 1's mana")
    if labels[0] != "Colourless" or "blue" not in labels:
        problems.append(f"expected colourless or a colour, blue among them: {labels}")
    before, after = st["before"], st["after"] or {}
    # The Truths left the hand (-1) and drew X = 2 (+2).
    if after.get("life") != before["life"] - 2 or after.get("hand") != before["hand"] - 1 + 2:
        problems.append(f"blue makes X = 2 (lose 2, draw 2): life {before['life']} -> {after.get('life')}, "
                        f"hand {before['hand']} -> {after.get('hand')}")
    return outcome(problems, "Reflecting Pool: blue picked over colourless, so converge counted two colours "
                             "-- 2 life lost, 2 cards drawn", found)


def echo(pay):
    """Goblin War Buggy, echo {1}{R}: at its controller's next upkeep, pay
    or it is sacrificed (payCostToPreventEffect). The mana question says
    what it is for."""
    g = game(f"echo-{'pay' if pay else 'no'}", [("Mountain", 36), ("Goblin War Buggy", 24)])
    st = {"buggy": None, "cast_turn": None, "prompts": [], "declined": False, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        prompt = f.get("prompt") or ""
        if k == "applyManaToCost" and "Echo" in prompt:
            st["prompts"].append((seat, prompt))
            if pay:
                return DEFAULT
            st["declined"] = True
            return None
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            if st["buggy"] is None:
                o = cast(g, f, "Goblin War Buggy")
                if o:
                    st["buggy"], st["cast_turn"] = card_of(o), g.turn
                    return o
            return g.play_land(f)
        return DEFAULT

    def until(g):
        # Asked, or its controller's next turn is over without asking.
        overdue = st["cast_turn"] is not None and g.turn >= st["cast_turn"] + 3
        if (st["prompts"] or overdue) and stack_empty(g) and st["after"] is None                 and g.state.get(1, {}).get("phase") != "UPKEEP":
            st["after"] = {"on": any(c["id"] == st["buggy"] for c in g.mine(1)),
                           "grave": any(c["id"] == st["buggy"] for c in g.zone(1, "graveyard", owner=1))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {"buggy": st["buggy"], "prompts": st["prompts"][:2], "after": st["after"], "stopped": g.stopped_badly()}
    if st["buggy"] is None:
        return "inconclusive", "Goblin War Buggy was never cast", found
    if not st["prompts"]:
        return outcome([f"its next upkeep went by and its echo was never asked: {st['after']}"], "", found)
    problems = []
    if any(seat != 1 for seat, _ in st["prompts"]):
        problems.append("the opponent was asked to pay seat 1's echo")
    if "Goblin War Buggy" not in st["prompts"][0][1] or "sacrificed" not in st["prompts"][0][1]:
        problems.append(f"the question should say whose echo and what passing does: {st['prompts'][0][1]!r}")
    after = st["after"] or {}
    if pay and not after.get("on"):
        problems.append(f"echo paid, but the Buggy is gone: {after}")
    if not pay and (after.get("on") or not after.get("grave")):
        problems.append(f"echo not paid, so the Buggy should be sacrificed: {after}")
    return outcome(problems, "echo paid, and the Buggy stays" if pay else "echo not paid, and the Buggy was sacrificed",
                   found)


def cascade(yes):
    """Bloodbraid Elf, cascade: the Grizzly Bears it reveals may be cast
    without paying (playSaFromPlayEffect, through Forge's Play effect)."""
    g = game(f"cascade-{'yes' if yes else 'no'}",
             [("Mountain", 14), ("Forest", 14), ("Bloodbraid Elf", 12), ("Grizzly Bears", 20)])
    st = {"elf": None, "asked": [], "before": None, "after": None}

    def bears():
        return sorted(c["id"] for c in g.mine(1, name="Grizzly Bears"))

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "confirmAction" and st["elf"] and seat == 1 and "Grizzly Bears" in " ".join(
                o.get("label") or "" for o in f["options"]):
            st["asked"].append((seat, [o.get("label") for o in f["options"]]))
            return next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith("Yes")), DEFAULT) \
                if yes else next((o["actionId"] for o in f["options"] if o.get("label") == "No"), None)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f, prefer="Forest" if not g.mine(1, name="Forest") else "Mountain")
            if land:
                return land
            if st["elf"] is None:
                o = cast(g, f, "Bloodbraid Elf")
                if o:
                    st["elf"], st["before"] = card_of(o), bears()
                    return o
            return None
        return DEFAULT

    def until(g):
        elf_down = st["elf"] and any(c["id"] == st["elf"] for c in g.mine(1))
        if st["asked"] and elf_down and stack_empty(g) and st["after"] is None:
            st["after"] = bears()
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {"asked": st["asked"], "before": st["before"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Bloodbraid Elf's cascade never offered a Grizzly Bears", found
    problems = []
    new = [b for b in st["after"] if b not in (st["before"] or [])]
    if yes and len(new) != 1:
        problems.append(f"said Yes: the revealed Bears should be cast, new Bears {new}")
    if not yes and new:
        problems.append(f"said No: no Bears should be cast, but {new} arrived")
    return outcome(problems, "cascade: Yes, and the revealed Grizzly Bears was cast for free" if yes
                   else "cascade: No, and nothing was cast", found)


def spellskite():
    """Seat 2's Arc Lightning splits 3 damage among seat 1's creatures;
    seat 1 answers with Spellskite: which target to change (chooseTarget).
    The LAST offered keeps its damage off; Spellskite takes it instead."""
    g = game("spellskite", [("Plains", 30), ("Spellskite", 10), ("Savannah Lions", 20)],
             [("Mountain", 34), ("Arc Lightning", 26)])
    st = {"arc": False, "skite": False, "asked": [], "picked": None, "after": None, "targets": []}

    def mine():
        return {c["id"]: c for c in g.mine(1) if c.get("kind") == "creature"}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseTarget":
            st["asked"].append((seat, [o.get("label") for o in f["options"]], f.get("prompt")))
            st["picked"] = card_of(f["options"][-1]["actionId"])
            return f["options"][-1]["actionId"]
        if seat == 2:
            if k == "chooseSpellAbilityToPlay":
                lions = [c for c in g.zone(2, "battlefield", owner=1) if c.get("name") == "Savannah Lions"]
                if not st["arc"] and len(lions) >= 2 and g.zone(2, "battlefield", owner=1, name="Spellskite")                         and stack_empty(g) and cast(g, f, "Arc Lightning"):
                    st["arc"] = True
                    return cast(g, f, "Arc Lightning")
                return g.play_land(f) if stack_empty(g) else None
            if k == "chooseTargetsFor" and st["arc"]:
                # Seat 1's Lions, one each: two targets, so there is a choice.
                lions = [o for o in f["options"] if (o.get("label") or "").startswith("Savannah Lions")
                         and card_of(o["actionId"]) not in st["targets"]]
                if lions and len(st["targets"]) < 2:
                    st["targets"].append(card_of(lions[0]["actionId"]))
                    return lions[0]["actionId"]
                return None
            return DEFAULT
        if k == "chooseSpellAbilityToPlay":
            stack = g.state.get(1, {}).get("stack") or []
            if st["arc"] and not st["skite"] and any("Arc Lightning" in (e.get("name") or "") for e in stack):
                o = g.option(f, name="Spellskite", zone="battlefield")
                if o:
                    st["skite"] = True
                    return o
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if not g.mine(1, name="Spellskite") and cast(g, f, "Spellskite"):
                return cast(g, f, "Spellskite")
            return cast(g, f, "Savannah Lions") if len(g.mine(1, name="Savannah Lions")) < 2 else None
        if k == "chooseTargetsFor" and st["skite"]:
            # The spell on the stack, not the card: changing a card's targets does nothing.
            return next((o["actionId"] for o in f["options"]
                         if (o.get("label") or "").startswith("on the stack: Arc Lightning")), DEFAULT)
        return DEFAULT

    def until(g):
        arc_done = any(c.get("name") == "Arc Lightning" for c in g.zone(1, "graveyard", owner=2))
        if st["asked"] and arc_done and stack_empty(g) and st["after"] is None:
            st["after"] = {"creatures": {cid: (c.get("name"), c.get("damage")) for cid, c in mine().items()},
                           "grave": [c["id"] for c in g.zone(1, "graveyard", owner=1)]}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"targets": st["targets"], "asked": st["asked"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Spellskite never asked which target to change", found
    problems = []
    if any(seat != 1 for seat, _, _ in st["asked"]):
        problems.append("the opponent was asked about seat 1's Spellskite")
    if len(st["asked"][0][1]) < 2:
        problems.append(f"two targets, two options: {st['asked'][0][1]}")
    after = st["after"]
    skite = [v for v in after["creatures"].values() if v[0] == "Spellskite"]
    if not skite or not skite[0][1]:
        problems.append(f"Spellskite should take the changed damage: {after}")
    # The other Lion took its share (1 or 2 of 3, a 2/1 dies); one Lion was spared.
    # The Lion picked lives; the other took its share and died (a 2/1).
    spared = st["picked"]
    other = [t for t in st["targets"] if t != spared]
    if spared not in after["creatures"]:
        problems.append(f"the Lion picked, {spared}, should be spared: {after}")
    if any(t in after["creatures"] for t in other):
        problems.append(f"the Lion not picked, {other}, kept its damage and should have died: {after}")
    return outcome(problems, "Spellskite: the target picked was changed to Spellskite, which took the damage", found)


def vote():
    """Council's Judgment: each player votes for a nonland permanent the
    caster does not control (vote, through "choose one"). Both vote for the
    LAST Bears offered; that one is exiled, the other stays."""
    g = game("vote", [("Plains", 30), ("Council's Judgment", 30)])
    st = {"cast": None, "votes": [], "picked": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseSingleEntityForEffect" and st["cast"] and "ote" in (f.get("prompt") or ""):
            offered = sorted(card_of(o["actionId"]) for o in f["options"])
            st["votes"].append((seat, offered, f.get("prompt")))
            st["picked"] = card_of(f["options"][-1]["actionId"])
            return f["options"][-1]["actionId"]
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or (cast(g, f, "Grizzly Bears") if stack_empty(g) else None)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if st["cast"] is None and len(theirs(g, "Grizzly Bears")) >= 2:
                o = cast(g, f, "Council's Judgment")
                if o:
                    st["cast"] = card_of(o)
                    st["bears"] = sorted(c["id"] for c in theirs(g, "Grizzly Bears"))
                    return o
            return None
        return DEFAULT

    def until(g):
        resolved = st["cast"] and any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if st["votes"] and resolved and stack_empty(g) and st["after"] is None:
            st["after"] = {"bears": sorted(c["id"] for c in theirs(g, "Grizzly Bears")),
                           "exile": [c["id"] for c in g.zone(1, "exile", owner=2)]}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {"votes": st["votes"], "picked": st["picked"], "after": st["after"], "stopped": g.stopped_badly()}
    if len(st["votes"]) < 2 or not st["after"]:
        return "inconclusive", "Council's Judgment never had both players vote", found
    problems = []
    if sorted(seat for seat, _, _ in st["votes"]) != [1, 2]:
        problems.append(f"each player votes once: {[s for s, _, _ in st['votes']]}")
    for seat, offered, _ in st["votes"]:
        if len(offered) < 2:
            problems.append(f"seat {seat} had no real vote: {offered}")
    for seat, _, prompt in st["votes"]:
        if prompt != "Council's Judgment: vote for one":
            problems.append(f"seat {seat}'s question should name the card and say vote, nothing more: {prompt!r}")
    if st["picked"] not in st["after"]["exile"] or st["picked"] in st["after"]["bears"]:
        problems.append(f"both voted for {st['picked']}: it should be exiled: {st['after']}")
    if len(st["after"]["bears"]) < 1:
        problems.append(f"the Bears nobody voted for should stay: {st['after']}")
    return outcome(problems, "Council's Judgment: both players voted, and the Bears they voted for was exiled", found)


def blackmail():
    """Blackmail: the opponent reveals three cards from their hand
    (chooseCardsToRevealFromHand, asked of THEM) -- the LAST three offered --
    and the caster picks one of exactly those to be discarded."""
    g = game("blackmail", [("Swamp", 30), ("Blackmail", 30)],
             [("Forest", 30), ("Grizzly Bears", 15), ("Giant Growth", 15)])
    st = {"cast": None, "asked": [], "revealed": [], "chooser": [], "hand": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseCardsToRevealFromHand":
            left = [o["actionId"] for o in f["options"] if card_of(o["actionId"]) not in st["revealed"]]
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            st["revealed"].append(card_of(left[-1]))
            return left[-1]
        if seat == 1 and st["revealed"] and f.get("options") and all(
                card_of(o["actionId"]) for o in f["options"]) and k != "chooseSpellAbilityToPlay":
            st["chooser"].append((k, sorted(card_of(o["actionId"]) for o in f["options"])))
            return f["options"][-1]["actionId"]
        if seat == 1 and k == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if o.get("objectId") == "player:2"), DEFAULT)
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return None
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if st["cast"] is None:
                o = cast(g, f, "Blackmail")
                if o:
                    st["cast"] = card_of(o)
                    st["hand"] = sorted(c["id"] for c in g.zone(2, "hand"))
                    return o
            return None
        return DEFAULT

    def until(g):
        resolved = st["cast"] and any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if st["asked"] and resolved and stack_empty(g) and st["after"] is None:
            st["after"] = sorted(c["id"] for c in g.zone(1, "graveyard", owner=2))
        return st["after"] is not None

    g.run(policy, until=until, max_turn=10)
    found = {"asked": st["asked"], "revealed": st["revealed"], "chooser": st["chooser"], "discarded": st["after"],
             "stopped": g.stopped_badly()}
    if not st["asked"] or st["after"] is None:
        return "inconclusive", "Blackmail never had its target reveal", found
    problems = []
    if any(seat != 2 for seat, _, _ in st["asked"]):
        problems.append("the caster was asked which of the opponent's cards to reveal")
    if len(st["asked"]) != 3 or len(set(st["revealed"])) != 3:
        problems.append(f"three cards, one question each: {st['revealed']}")
    if st["asked"][0][1] != st["hand"]:
        problems.append(f"offered {st['asked'][0][1]}, not exactly the opponent's hand {st['hand']}")
    if not st["chooser"] or sorted(st["chooser"][0][1]) != sorted(st["revealed"]):
        problems.append(f"the caster should choose from exactly the revealed three: {st['chooser']}")
    if len(st["after"]) != 1 or st["after"][0] not in st["revealed"]:
        problems.append(f"one of the revealed cards should be discarded: {st['after']}")
    return outcome(problems, "Blackmail: the opponent revealed the three picked, and one of those was discarded",
                   found)


def piles():
    """Fact or Fiction: the opponent separates the top five into two piles
    (one card into pile 1), and the caster chooses (chooseCardsPile) --
    pile 2, the LAST answer. Exactly pile 2's four cards reach the hand;
    pile 1's card goes to the graveyard. Each answer names its cards."""
    g = game("piles", [("Island", 30), ("Fact or Fiction", 30)])
    st = {"cast": None, "five": None, "pile1": [], "asked": [], "hand": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseEntitiesForEffect" and seat == 2 and st["cast"]:
            if st["five"] is None:
                st["five"] = sorted(card_of(o["actionId"]) for o in f["options"])
            if not st["pile1"]:
                st["pile1"].append(card_of(f["options"][0]["actionId"]))
                return f["options"][0]["actionId"]
            return None
        if k == "chooseCardsPile":
            st["asked"].append((seat, [o.get("label") for o in f["options"]], f.get("prompt")))
            st["hand"] = sorted(c["id"] for c in g.zone(1, "hand"))
            return f["options"][-1]["actionId"]
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if st["cast"] is None:
                o = cast(g, f, "Fact or Fiction")
                if o:
                    st["cast"] = card_of(o)
                    return o
            return None
        return DEFAULT

    def until(g):
        resolved = st["cast"] and any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if st["asked"] and resolved and stack_empty(g) and st["after"] is None:
            st["after"] = {"hand": sorted(c["id"] for c in g.zone(1, "hand")),
                           "grave": sorted(c["id"] for c in g.zone(1, "graveyard", owner=1))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {"five": st["five"], "pile1": st["pile1"], "asked": st["asked"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"] or not st["five"]:
        return "inconclusive", "Fact or Fiction never reached its piles", found
    problems = []
    seat, labels, prompt = st["asked"][0]
    if seat != 1:
        problems.append("the separating player was asked to choose the pile")
    if len(labels) != 2 or not labels[0].startswith("Pile 1: ") or not labels[1].startswith("Pile 2: ") \
            or len(labels[1].split(", ")) != 4 or "(" in "".join(labels):
        problems.append(f"two answers naming one card and four cards, no internal numbers: {labels}")
    pile2 = [c for c in st["five"] if c not in st["pile1"]]
    if any(c not in st["after"]["hand"] for c in pile2) or len(st["after"]["hand"]) != len(st["hand"]) + 4:
        problems.append(f"pile 2 {pile2} should be exactly what reached the hand: {st['hand']} -> {st['after']['hand']}")
    if st["pile1"][0] not in st["after"]["grave"]:
        problems.append(f"pile 1 {st['pile1']} should be in the graveyard: {st['after']['grave']}")
    return outcome(problems, "Fact or Fiction: pile 2 chosen, its four cards reached the hand, pile 1 went "
                             "to the graveyard", found)


def gift():
    """Alchemist's Gift on seat 1's own Bears: "your choice of deathtouch or
    lifelink" (chooseKeywordForPump) -- Lifelink, the LAST answer. The Bears
    is a 3/3 with lifelink and without deathtouch."""
    g = game("gift", [("Swamp", 20), ("Forest", 16), ("Grizzly Bears", 12), ("Alchemist's Gift", 12)])
    st = {"cast": None, "bears": None, "asked": [], "after": None}

    def keywords(c):
        return [k.lower() for k in (c or {}).get("keywords", []) or []]

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseKeywordForPump":
            st["asked"].append((seat, [o.get("label") for o in f["options"]], f.get("prompt")))
            return f["options"][-1]["actionId"]
        if k == "chooseTargetsFor" and seat == 1:
            return next((o["actionId"] for o in f["options"] if o.get("objectId") == st["bears"]), DEFAULT)
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            bears = g.mine(1, name="Grizzly Bears")
            if not bears:
                return cast(g, f, "Grizzly Bears")
            if st["cast"] is None:
                o = cast(g, f, "Alchemist's Gift")
                if o:
                    st["cast"], st["bears"] = card_of(o), bears[0]["id"]
                    return o
            return None
        return DEFAULT

    def until(g):
        resolved = st["cast"] and any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if st["asked"] and resolved and stack_empty(g) and st["after"] is None:
            bear = next((c for c in g.mine(1) if c["id"] == st["bears"]), {})
            st["after"] = {"keywords": keywords(bear), "pt": (bear.get("power"), bear.get("toughness"))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=12)
    found = {"asked": st["asked"], "bears": st["bears"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Alchemist's Gift never asked which keyword", found
    problems = []
    seat, labels, prompt = st["asked"][0]
    if seat != 1:
        problems.append("the opponent was asked which keyword seat 1's spell grants")
    if labels != ["Deathtouch", "Lifelink"]:
        problems.append(f"one answer per keyword: {labels}")
    if prompt != "Alchemist's Gift: choose what Grizzly Bears gains.":
        problems.append(f"the question should name the card and the creature: {prompt!r}")
    kws = st["after"]["keywords"]
    if "lifelink" not in kws or "deathtouch" in kws or st["after"]["pt"] != (3, 3):
        problems.append(f"chose Lifelink: a 3/3 with lifelink, no deathtouch: {st['after']}")
    return outcome(problems, "Alchemist's Gift: Lifelink chosen, and the Bears gained exactly that", found)


SCENARIOS = {"brave": lambda: protect("brave", "Brave the Elements", "chooseColors"),
             "gods-willing": lambda: protect("gods-willing", "Gods Willing", "chooseProtectionType"),
             "pioneer-yes": lambda: pioneer(True), "pioneer-no": lambda: pioneer(False),
             "clone-yes": lambda: clone(True), "clone-no": lambda: clone(False), "venture": venture,
             "blaze": blaze, "axe": axe, "axe-five": lambda: axe(True), "reckoning": reckoning, "sting": sting, "guildmage": guildmage,
             "elspeth": elspeth, "converge": converge,
             "echo-pay": lambda: echo(True), "echo-no": lambda: echo(False),
             "cascade-yes": lambda: cascade(True), "cascade-no": lambda: cascade(False),
             "spellskite": spellskite, "vote": vote, "blackmail": blackmail, "piles": piles, "gift": gift}

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
    sys.exit(1 if 1 in codes else max(codes, default=0))
