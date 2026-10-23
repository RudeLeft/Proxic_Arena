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


def game(name, seat1, seat2=BEARS):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"you-choose-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


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
    g = game(f"pioneer-{'yes' if yes else 'no'}", [("Forest", 30), ("Elvish Pioneer", 30)])
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
            st["after"] = {seat: (g.player(seat, 1) or {}).get("command") for seat in (1, 2)}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=12)
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
    g = game("blaze", [("Mountain", 30), ("Blaze", 30)])
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
                st["cast"], st["before"] = True, (g.player(1, 2) or {}).get("life")
                return cast(g, f, "Blaze")
            return g.play_land(f)
        return DEFAULT

    def until(g):
        # X is chosen while casting, before the spell is on the stack: wait
        # for Blaze to resolve, into the graveyard.
        resolved = g.zone(1, "graveyard", owner=1, name="Blaze")
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
    g = game("axe-five" if pay else "axe", [("Mountain", 30), ("Lightning Axe", 30)])
    st = {"cast": False, "abilities": [], "discard": [], "discarded": None, "target": None, "after": None,
          "axes": []}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "getAbilityToPlay":
            st["abilities"].append((seat, [o.get("label") or "" for o in f["options"]]))
            want = "{5}" if pay else "iscard"
            return next((o["actionId"] for o in f["options"]
                         if want in (o.get("label") or "").split("(Additional cost:")[-1]), DEFAULT)
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
                    return o
            return g.play_land(f)
        return DEFAULT

    def until(g):
        if (st["discarded"] or pay) and st["cast"] and g.zone(1, "graveyard", owner=1, name="Lightning Axe")                 and stack_empty(g) and st["after"] is None:
            st["after"] = {"grave": [c["id"] for c in g.zone(1, "graveyard", owner=1)],
                           "hand": [c["id"] for c in g.zone(1, "hand")],
                           "bears": [c["id"] for c in g.zone(1, "graveyard", owner=2)]}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
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
        others = [c for c in st["after"]["grave"] if c not in st["axes"]]
        if st["discard"] or others:
            problems.append(f"paid {{5}}, but a card was discarded: {st['discard']} {others}")
    elif st["discarded"] not in st["after"]["grave"] or st["discarded"] in st["after"]["hand"]:
        problems.append(f"picked {st['discarded']} to discard, but {st['after']}")
    if st["target"] not in st["after"]["bears"]:
        problems.append(f"the Bears {st['target']} should have died to the Axe")
    return outcome(problems, "Lightning Axe: paid {5}, nothing discarded, the Bears died" if pay
                   else "Lightning Axe: discard chosen, the card picked was discarded, the Bears died", found)


def reckoning():
    g = game("reckoning", [("Plains", 24), ("Savannah Lions", 20), ("Divine Reckoning", 16)])
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
            st["after"] = {1: creatures(1), 2: creatures(2)}
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
                    st["cast"] = True
                    return o
            return g.play_land(f) or (cast(g, f, "Walking Corpse") if len(mine()) < 3 else None)
        return DEFAULT

    def until(g):
        if st["picked"] and g.zone(1, "graveyard", owner=1, name="Lethal Sting") and stack_empty(g)                 and st["after"] is None:
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


SCENARIOS = {"brave": lambda: protect("brave", "Brave the Elements", "chooseColors"),
             "gods-willing": lambda: protect("gods-willing", "Gods Willing", "chooseProtectionType"),
             "pioneer-yes": lambda: pioneer(True), "pioneer-no": lambda: pioneer(False),
             "clone-yes": lambda: clone(True), "clone-no": lambda: clone(False), "venture": venture,
             "blaze": blaze, "axe": axe, "axe-five": lambda: axe(True), "reckoning": reckoning, "sting": sting, "guildmage": guildmage}

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
