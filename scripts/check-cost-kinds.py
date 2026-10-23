"""Costs built in Phase 8: what the player picks is what pays. PHASE_08 P8-F.

    python -I scripts/check-cost-kinds.py <worker.jar> <res-root> [trace-dir] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B), answers
with options no default would take, and checks the board:

  tap-two     Diversionary Tactics, "tap two untapped creatures you
              control" (CostTapType): three Lions offered, the LAST two
              picked are the two tapped, the third stays untapped; the
              target is tapped
  atoll-pay   Coral Atoll enters (chooseCardsForCost): the LAST untapped
              Island offered goes back to hand, and the Atoll stays; the
              question says what it takes, with the number filled in
  atoll-no    the same, declined: the Atoll is sacrificed
  chalice     Everflowing Chalice, multikicker (chooseNumberForKeywordCost):
              kicked twice -- two charge counters
  offspring-yes  Rust-Shield Rampager, offspring (the same question, yes or
              no): a 1/1 token copy enters
  offspring-no   the same, no: no token
  gush        Gush instead of its mana (CostReturn): the two Islands picked
              (the LAST each time) go back to hand, the third stays
  manamorphose  Manamorphose (specifyManaCombo): blue then black -- the pool
              holds exactly those
  charge      Charge of the Forever-Beast (CostReveal): the LAST creature
              offered is revealed, and deals exactly its power
  draw-yes    Academy Wall's loot (CostDraw, a yes or no): yes draws a card
  draw-no     the same, no: nothing drawn
  exert-yes   Steward of Solidarity's ability, exert it (CostExert, a yes
              or no): a Warrior token, and the Steward stays tapped next turn
  exert-no    the same, no: no token, nothing tapped
  behold      Champion of the Clachan, behold a Kithkin and exile it
              (CostBeholdExile): every other Kithkin on the battlefield and
              in hand offered; the LAST is exiled, the rest stay
  evidence    Forensic Researcher, collect evidence 3: the LAST graveyard
              card each time, Done once the total is 3 -- exactly those
              are exiled, and the Bears is tapped
  blight      Sting-Slinger, blight 1 (CostBlight): the LAST creature
              offered gets the -1/-1 counter, the opponent loses 2
  salvo-yes   Blazing Salvo, unless its controller takes 5 (CostDamage,
              asked of THAT player): yes -- 5 life lost, the Bears lives
  salvo-no    the same, no: the Bears dies, no life lost
  untap       Patrol Signaler's {Q} (CostUntap, nothing asked): it untaps
              and makes a token
  mill-yes    Sinister Concoction's mill (CostMill, a yes or no): yes --
              one card milled, the Bears destroyed
  mill-no     the same, no -- asked before the sacrifice and discard: nothing
              milled, nothing destroyed, the Concoction kept
  forage      Bushy Bodyguard forages from the graveyard (CostForage): the
              LAST three offered are exiled; two +1/+1 counters
  gain-life   Invigorate's alternative cost (CostGainLife): the opponent,
              by name, gains 3; nothing tapped; the Bears +4/+4
  to-library  Leashling (CostPutCardToLib): the LAST card in hand goes on
              top -- and is the next draw; Leashling returns
  untap-type  Halo Fountain (CostUntapType): the LAST of two tapped Lions
              untaps, the other stays tapped, a Citizen made
  reduction   Urza's Filter: the whole {2} off, nothing asked
  gift-yes    Blooming Blast, gift promised (CostPromiseGift, one opponent:
              no question): a Treasure for them, and 3 damage
  gift-no     the same, not promised: neither
  counter-yes Moonlit Lamenter, remove a counter from this creature
              (CostRemoveAnyCounter, a yes or no): the counter gone, a draw
  counter-no  the same, no: neither
  counter-pick  Fain, the Broker, a counter from a creature you control: the
              LAST Lamenter offered loses its counter, a Treasure made
  from-exile  Wasteland Strangler (CostExiledMoveToGrave): the LAST exiled
              Bears goes to the graveyard, the other stays exiled
  unattach-yes  Leonin Bola (CostUnattach, a yes or no): yes -- unattached,
              the Bears tapped
  unattach-no the same, no: still attached, nothing tapped
  from-stack  Nivmagus Elemental (CostExileFromStack): its own Bolt exiled
              from the stack -- no damage, two counters
  creature-type  Caller of the Hunt (CostChooseCreatureType): Bear chosen
              with two Bears out -- a 2/2
  add-mana    Braid of Fire's upkeep (CostAddMana, nothing to choose):
              paid, it stays
  flip-yes    Karplusan Minotaur's upkeep (CostFlipCoin, a yes or no): it stays
  flip-no     the same, no: it is sacrificed
  gain-control  Herald of Leshrac's upkeep (CostGainControl, through
              chooseCardsForCost): the LAST land
              of the opponent's becomes seat 1's
  roll-dice   Clay Golem (CostRollDice, a yes or no): monstrous with 1-8
              counters
  crew        Smuggler's Copter, crew 1 (CostTapType, total power): the
              LAST Lion offered crews it, then Done -- that Lion is tapped,
              the others are not, and the Copter is a creature

Only the paying player is asked; the cross-game checks read these traces
in CI.

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
    """Discards down to hand size from the spells, keeping the lands."""

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
        trace = os.path.join(TRACES, f"cost-{name}.jsonl")
    return LandKeeper(seat1, seat2, jar=JAR, res=RES, trace=trace)


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


def lions(g):
    return {c["id"]: c for c in g.mine(1, name="Savannah Lions")}


def tap_two():
    g = game("tap-two", [("Plains", 30), ("Savannah Lions", 18), ("Diversionary Tactics", 12)])
    st = {"used": False, "asked": [], "picked": [], "target": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostTapType":
            offered = [card_of(o["actionId"]) for o in f["options"] if card_of(o["actionId"])]
            st["asked"].append((seat, sorted(offered), f.get("prompt")))
            pick = f["options"][-1]["actionId"]
            st["picked"].append(card_of(pick))
            return pick
        if k == "chooseTargetsFor" and seat == 1 and st["used"]:
            o = next((o for o in f["options"] if (o.get("label") or "").startswith("Grizzly Bears")), None)
            st["target"] = o and card_of(o["actionId"])
            return o["actionId"] if o else DEFAULT
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or (cast(g, f, "Grizzly Bears") if stack_empty(g) else None)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            ready = [c for c in lions(g).values() if not c.get("tapped")]
            bears = [c for c in g.zone(1, "battlefield", owner=2, name="Grizzly Bears") if not c.get("tapped")]
            if not st["used"] and len(ready) >= 3 and bears and g.mine(1, name="Diversionary Tactics"):
                o = g.option(f, name="Diversionary Tactics", zone="battlefield")
                if o:
                    st["used"], st["before"] = True, sorted(c["id"] for c in ready)
                    return o
            land = g.play_land(f)
            if land:
                return land
            if not g.mine(1, name="Diversionary Tactics") and len(lions(g)) >= 3:
                o = cast(g, f, "Diversionary Tactics")
                if o:
                    return o
            return cast(g, f, "Savannah Lions") if len(lions(g)) < 3 else None
        return DEFAULT

    def until(g):
        if len(st["picked"]) >= 2 and stack_empty(g) and st["after"] is None:
            st["after"] = {"tapped": sorted(cid for cid, c in lions(g).items() if c.get("tapped")),
                           "untapped": sorted(cid for cid, c in lions(g).items() if not c.get("tapped")),
                           "target_tapped": any(c["id"] == st["target"] and c.get("tapped")
                                                for c in g.zone(1, "battlefield", owner=2))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"asked": st["asked"], "picked": st["picked"], "target": st["target"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if len(st["picked"]) < 2:
        return "inconclusive", "Diversionary Tactics' tap cost was never asked twice", found
    problems = []
    if any(seat != 1 for seat, _, _ in st["asked"]):
        problems.append("the opponent was asked to pay seat 1's cost")
    if len(st["asked"][0][1]) < 3:
        problems.append(f"three untapped Lions should be offered: {st['asked'][0][1]}")
    after = st["after"]
    if sorted(st["picked"]) != after["tapped"]:
        problems.append(f"picked {sorted(st['picked'])} to tap, but tapped are {after['tapped']}")
    if not after["untapped"]:
        problems.append("the Lion not picked should stay untapped")
    if not after["target_tapped"]:
        problems.append(f"the target Bears {st['target']} should be tapped")
    return outcome(problems, "Diversionary Tactics: the two Lions picked paid the cost, the third stayed untapped, "
                             "and the target was tapped", found)


def crew():
    g = game("crew", [("Plains", 30), ("Savannah Lions", 18), ("Smuggler's Copter", 12)])
    st = {"used": False, "asked": [], "picked": None, "copter": None, "after": None, "turn": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostTapType":
            labels = [o.get("label") for o in f["options"]]
            st["asked"].append((seat, labels, f.get("prompt")))
            if st["picked"] is None:
                lion = [o for o in f["options"] if card_of(o["actionId"])][-1]
                st["picked"] = card_of(lion["actionId"])
                return lion["actionId"]
            return "cost:done"
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            copters = g.mine(1, name="Smuggler's Copter")
            ready = [c for c in lions(g).values() if not c.get("tapped")]
            if not st["used"] and copters and len(ready) >= 2:
                o = g.option(f, name="Smuggler's Copter", zone="battlefield", contains="Crew")
                if o:
                    st["used"], st["copter"], st["turn"] = True, copters[0]["id"], g.turn
                    return o
            land = g.play_land(f)
            if land:
                return land
            if not copters and cast(g, f, "Smuggler's Copter"):
                return cast(g, f, "Smuggler's Copter")
            return cast(g, f, "Savannah Lions") if len(lions(g)) < 2 else None
        return DEFAULT

    def until(g):
        # Crew's cost is paid before the ability is on the stack: wait for
        # the Copter to become a creature, or for the turn to move on.
        copter = next((c for c in g.mine(1) if c["id"] == st["copter"]), {})
        done = copter.get("kind") == "creature" or (st["turn"] is not None and g.turn > st["turn"])
        if st["picked"] and done and stack_empty(g) and st["after"] is None:
            st["after"] = {"tapped": sorted(cid for cid, c in lions(g).items() if c.get("tapped")),
                           "copter": copter.get("kind")}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"asked": st["asked"][:3], "picked": st["picked"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["picked"]:
        return "inconclusive", "Smuggler's Copter was never crewed", found
    problems = []
    if any(seat != 1 for seat, _, _ in st["asked"]):
        problems.append("the opponent was asked to crew seat 1's Copter")
    if len(st["asked"]) < 2 or "Done" not in st["asked"][1][1]:
        problems.append(f"after one Lion (power 2 >= 1) the crew should offer Done: {st['asked'][:2]}")
    if st["after"]["tapped"] != [st["picked"]]:
        problems.append(f"crewed with {st['picked']}, but tapped are {st['after']['tapped']}")
    if st["after"]["copter"] != "creature":
        problems.append(f"the crewed Copter should be a creature: {st['after']['copter']}")
    return outcome(problems, "Smuggler's Copter: crewed by the Lion picked, which alone is tapped; the Copter is a "
                             "creature", found)


def atoll(pay):
    """Coral Atoll enters: return an untapped Island you control, or it is
    sacrificed (chooseCardsForCost, optional)."""
    g = game(f"atoll-{'pay' if pay else 'no'}", [("Island", 40), ("Coral Atoll", 20)])
    st = {"atoll": None, "asked": [], "picked": None, "islands": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseCardsForCost":
            offered = sorted(card_of(o["actionId"]) for o in f["options"])
            st["asked"].append((seat, offered, f.get("prompt")))
            if not pay:
                return None
            st["picked"] = card_of(f["options"][-1]["actionId"])
            return f["options"][-1]["actionId"]
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            untapped = [c for c in g.mine(1, name="Island") if not c.get("tapped")]
            if st["atoll"] is None and len(untapped) >= 2:
                o = g.option(f, name="Coral Atoll", land=True)
                if o:
                    st["atoll"], st["islands"] = card_of(o), sorted(c["id"] for c in untapped)
                    return o
            return g.option(f, name="Island", land=True)
        return DEFAULT

    def until(g):
        if st["asked"] and stack_empty(g) and st["after"] is None:
            st["after"] = {"atoll": any(c["id"] == st["atoll"] for c in g.mine(1)),
                           "atoll_grave": any(c["id"] == st["atoll"] for c in g.zone(1, "graveyard", owner=1)),
                           "hand": [c["id"] for c in g.zone(1, "hand")],
                           "islands": sorted(c["id"] for c in g.mine(1, name="Island"))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=12)
    found = {"asked": st["asked"], "picked": st["picked"], "islands_before": st["islands"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Coral Atoll's return cost was never asked", found
    problems = []
    seat, offered, prompt = st["asked"][0]
    if seat != 1:
        problems.append("the opponent was asked to pay seat 1's Coral Atoll")
    if offered != st["islands"]:
        problems.append(f"offered {offered}, not exactly the untapped Islands {st['islands']}")
    if "%d" in (prompt or "") or "Island" not in (prompt or ""):
        problems.append(f"the question should say what it takes, filled in: {prompt!r}")
    after = st["after"]
    if pay:
        if not after["atoll"] or st["picked"] not in after["hand"] or st["picked"] in after["islands"]:
            problems.append(f"returned {st['picked']}: it should be in hand and the Atoll kept: {after}")
    elif after["atoll"] or not after["atoll_grave"]:
        problems.append(f"declined: Coral Atoll should be sacrificed: {after}")
    return outcome(problems, "Coral Atoll: the Island picked went back to hand, and the Atoll stayed" if pay
                   else "Coral Atoll: declined, and the Atoll was sacrificed", found)


def counters_of(c):
    return {k["name"]: k["count"] for k in (c or {}).get("counters", []) or []}


def chalice():
    """Everflowing Chalice, multikicker {2}: kicked twice (not the first
    count offered, 0), it enters with two charge counters."""
    g = game("chalice", [("Plains", 40), ("Everflowing Chalice", 20)])
    st = {"cast": None, "asked": [], "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseNumberForKeywordCost":
            ids = [o["actionId"] for o in f["options"]]
            st["asked"].append((seat, ids, f.get("prompt")))
            return "number:2" if "number:2" in ids else DEFAULT
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if st["cast"] is None and len(g.untapped_lands(1)) >= 4:
                o = cast(g, f, "Everflowing Chalice")
                if o:
                    st["cast"] = card_of(o)
                    return o
            return None
        return DEFAULT

    def until(g):
        chalice = next((c for c in g.mine(1) if c["id"] == st["cast"]), None)
        if st["asked"] and chalice and stack_empty(g) and st["after"] is None:
            st["after"] = counters_of(chalice)
        return st["after"] is not None

    g.run(policy, until=until, max_turn=14)
    found = {"asked": st["asked"], "counters": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Everflowing Chalice never asked how many times to kick", found
    problems = []
    seat, ids, _ = st["asked"][0]
    if seat != 1:
        problems.append("the opponent was asked about seat 1's multikicker")
    if ids[0] != "number:0" or "number:2" not in ids:
        problems.append(f"0 first, 2 among the counts: {ids}")
    if (st["after"] or {}).get("CHARGE") != 2:
        problems.append(f"kicked twice, so two charge counters: {st['after']}")
    return outcome(problems, "Everflowing Chalice: kicked twice, and it entered with two charge counters", found)


def offspring(yes):
    """Rust-Shield Rampager, offspring {2}: yes or no (Forge's addKeywordCost,
    max 1) -- yes makes a 1/1 token copy when it enters."""
    g = game(f"offspring-{'yes' if yes else 'no'}", [("Forest", 36), ("Rust-Shield Rampager", 24)])
    st = {"cast": None, "asked": [], "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseNumberForKeywordCost":
            st["asked"].append((seat, [o.get("label") for o in f["options"]]))
            return "confirm:yes" if yes else "confirm:no"
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if st["cast"] is None and len(g.untapped_lands(1)) >= 6:
                o = cast(g, f, "Rust-Shield Rampager")
                if o:
                    st["cast"] = card_of(o)
                    return o
            return None
        return DEFAULT

    def until(g):
        landed = any(c["id"] == st["cast"] for c in g.mine(1))
        if st["asked"] and landed and stack_empty(g) and st["after"] is None:
            st["after"] = [(c["id"], c.get("power"), c.get("toughness")) for c in g.mine(1, name="Rust-Shield Rampager")
                           if c.get("token")]
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {"asked": st["asked"], "tokens": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Rust-Shield Rampager never asked about offspring", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the opponent was asked about seat 1's offspring")
    tokens = st["after"] or []
    if yes and [(p, t) for _, p, t in tokens] != [(1, 1)]:
        problems.append(f"offspring paid: one 1/1 token copy, got {tokens}")
    if not yes and tokens:
        problems.append(f"offspring not paid: no token, got {tokens}")
    return outcome(problems, "offspring paid, and a 1/1 token copy entered" if yes
                   else "offspring not paid, and no token", found)


def gush():
    """Gush instead of its mana: return two Islands you control (CostReturn).
    Three Islands out; the LAST offered each time go back to hand, the
    third stays; Gush draws two."""
    g = game("gush", [("Island", 36), ("Gush", 24)])
    st = {"cast": None, "asked": [], "picked": [], "islands": None, "hand": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostReturn":
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            st["picked"].append(card_of(f["options"][-1]["actionId"]))
            return f["options"][-1]["actionId"]
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            islands = g.mine(1, name="Island")
            if st["cast"] is None and len(islands) >= 3:
                alt = [o for o in f["options"] if (o.get("label") or "").startswith("Gush")
                       and "return two Islands" in (o.get("label") or "")]
                if alt:
                    st["cast"] = card_of(alt[0]["actionId"])
                    st["islands"] = sorted(c["id"] for c in islands)
                    st["hand"] = len(g.zone(1, "hand"))
                    return alt[0]["actionId"]
            return g.play_land(f)
        return DEFAULT

    def until(g):
        resolved = st["cast"] and any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if len(st["picked"]) >= 2 and resolved and stack_empty(g) and st["after"] is None:
            st["after"] = {"islands": sorted(c["id"] for c in g.mine(1, name="Island")),
                           "hand": [c["id"] for c in g.zone(1, "hand")]}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=12)
    found = {"asked": st["asked"], "picked": st["picked"], "islands_before": st["islands"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if len(st["picked"]) < 2 or not st["after"]:
        return "inconclusive", "Gush's return cost was never asked twice", found
    problems = []
    if any(seat != 1 for seat, _, _ in st["asked"]):
        problems.append("the opponent was asked to pay seat 1's Gush")
    if st["asked"][0][1] != st["islands"]:
        problems.append(f"offered {st['asked'][0][1]}, not exactly the Islands {st['islands']}")
    if "two Islands" not in (st["asked"][0][2] or ""):
        problems.append(f"the question should say what it takes: {st['asked'][0][2]!r}")
    after = st["after"]
    if any(i not in after["hand"] or i in after["islands"] for i in st["picked"]):
        problems.append(f"returned {st['picked']}: both should be in hand, off the battlefield: {after}")
    kept = [i for i in st["islands"] if i not in st["picked"]]
    if any(i not in after["islands"] for i in kept):
        problems.append(f"{kept} were not picked and should stay on the battlefield")
    # Gush left the hand (-1), two Islands came back (+2), two cards drawn (+2).
    if len(after["hand"]) != st["hand"] - 1 + 2 + 2:
        problems.append(f"hand {st['hand']} -> {len(after['hand'])}: Gush, two Islands back, two drawn")
    return outcome(problems, "Gush: the two Islands picked went back to hand, the third stayed, and two cards "
                             "were drawn", found)


def manamorphose():
    """Manamorphose: two mana in any combination (specifyManaCombo). Blue,
    then black (white is first) -- the pool then holds exactly those."""
    g = game("manamorphose", [("Mountain", 20), ("Forest", 20), ("Manamorphose", 20)])
    st = {"cast": None, "asked": [], "after": None}
    want = ["blue", "black"]

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "specifyManaCombo":
            labels = [o.get("label") for o in f["options"]]
            st["asked"].append((seat, labels, f.get("prompt")))
            colour = want[min(len(st["asked"]) - 1, 1)]
            return next((o["actionId"] for o in f["options"] if o.get("label") == colour), DEFAULT)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f, prefer="Forest" if not g.mine(1, name="Forest") else "Mountain")
            if land:
                return land
            if st["cast"] is None:
                o = cast(g, f, "Manamorphose")
                if o:
                    st["cast"] = card_of(o)
                    return o
            return None
        return DEFAULT

    def until(g):
        resolved = st["cast"] and any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if len(st["asked"]) >= 2 and resolved and stack_empty(g) and st["after"] is None:
            st["after"] = (g.player(1, 1) or {}).get("manaPool") or {}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=12)
    found = {"asked": st["asked"], "pool": st["after"], "stopped": g.stopped_badly()}
    if len(st["asked"]) < 2:
        return "inconclusive", "Manamorphose never asked both colours", found
    problems = []
    if any(seat != 1 for seat, _, _ in st["asked"]):
        problems.append("the opponent was asked about seat 1's mana")
    if st["asked"][0][1][:1] == ["blue"] or "blue" not in st["asked"][0][1]:
        problems.append(f"the five colours, blue not first: {st['asked'][0][1]}")
    if st["after"] != {"U": 1, "B": 1}:
        problems.append(f"blue then black picked, so the pool should be one of each: {st['after']}")
    return outcome(problems, "Manamorphose: blue and black picked, and exactly those are floating", found)


def charge():
    """Charge of the Forever-Beast: reveal a creature card from your hand
    (CostReveal); damage equal to its power to Indomitable Ancients (2/10,
    so it lives and shows the damage). The opponent is told the card."""
    g = game("charge", [("Forest", 26), ("Charge of the Forever-Beast", 14), ("Grizzly Bears", 10),
                        ("Hill Giant", 10)], [("Plains", 30), ("Indomitable Ancients", 30)])
    st = {"cast": None, "asked": [], "picked": None, "power": None, "target": None, "after": None}
    POWER = {"Grizzly Bears": 2, "Hill Giant": 3}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostReveal":
            st["asked"].append((seat, [(card_of(o["actionId"]), o.get("label")) for o in f["options"]]))
            # A creature NOT named like the first offered: a worker that took
            # the first would deal a different amount.
            first = f["options"][0].get("label")
            last = [o for o in f["options"] if o.get("label") != first][-1]
            st["picked"], st["power"], st["name"] = card_of(last["actionId"]), POWER.get(last.get("label")), last.get("label")
            return last["actionId"]
        if k == "chooseTargetsFor" and seat == 1:
            o = next((o for o in f["options"] if (o.get("label") or "").startswith("Indomitable Ancients")), None)
            st["target"] = o and card_of(o["actionId"])
            return o["actionId"] if o else DEFAULT
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or (cast(g, f, "Indomitable Ancients") if stack_empty(g) else None)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            names = {c.get("name") for c in g.zone(1, "hand")}
            ancients = g.zone(1, "battlefield", owner=2, name="Indomitable Ancients")
            if st["cast"] is None and ancients and {"Grizzly Bears", "Hill Giant"} <= names:
                o = cast(g, f, "Charge of the Forever-Beast")
                if o:
                    st["cast"] = card_of(o)
                    return o
            return None
        return DEFAULT

    def until(g):
        resolved = st["cast"] and any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if st["picked"] and resolved and stack_empty(g) and st["after"] is None:
            target = next((c for c in g.zone(1, "battlefield", owner=2) if c["id"] == st["target"]), {})
            st["after"] = {"damage": target.get("damage"), "told": g.notices.get(2, [])}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"asked": st["asked"], "picked": st["picked"], "power": st["power"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["after"]:
        return "inconclusive", "Charge of the Forever-Beast never resolved with a reveal asked", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the opponent was asked to reveal seat 1's card")
    if len({label for _, label in st["asked"][0][1]}) < 2:
        problems.append(f"a real choice of creatures: {st['asked'][0][1]}")
    if not any(st["name"] in n for n in st["after"]["told"]):
        problems.append(f"a revealed card is shown to the other player: seat 2 was not told {st['name']}")
    if st["after"]["damage"] != st["power"]:
        problems.append(f"revealed power {st['power']}, but the Ancients took {st['after']['damage']}")
    return outcome(problems, f"Charge of the Forever-Beast: the creature revealed (power {st['power']}) dealt "
                             "exactly that much", found)


def academy_wall(yes):
    """Academy Wall: casting an instant, you may draw a card (CostDraw, a
    yes or no), then discard one. Yes: the library is one card smaller;
    no: unchanged."""
    g = game(f"draw-{'yes' if yes else 'no'}", [("Island", 30), ("Academy Wall", 10), ("Unsummon", 20)])
    st = {"cast": None, "asked": [], "library": None, "after": None}

    def library():
        return (g.player(1, 1) or {}).get("libraryCount")

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "confirmPayment" and seat == 1 and "draw" in (f.get("prompt") or ""):
            st["asked"].append((seat, f.get("prompt")))
            st["library"] = library()
            return "confirm:yes" if yes else None
        if k == "confirmTrigger" and seat == 1:
            return "confirm:yes"
        if k == "chooseTargetsFor" and seat == 1:
            return next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith("Grizzly Bears")),
                        DEFAULT)
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or (cast(g, f, "Grizzly Bears") if stack_empty(g) else None)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if not g.mine(1, name="Academy Wall"):
                return cast(g, f, "Academy Wall")
            bears = g.zone(1, "battlefield", owner=2, name="Grizzly Bears")
            if st["cast"] is None and bears:
                o = cast(g, f, "Unsummon")
                if o:
                    st["cast"] = card_of(o)
                    return o
            return None
        return DEFAULT

    def until(g):
        resolved = st["cast"] and any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if st["asked"] and resolved and stack_empty(g) and st["after"] is None:
            st["after"] = library()
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {"asked": st["asked"], "library": [st["library"], st["after"]], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Academy Wall's draw cost was never asked", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the opponent was asked about seat 1's draw cost")
    want = st["library"] - 1 if yes else st["library"]
    if st["after"] != want:
        problems.append(f"{'paid' if yes else 'declined'}: library {st['library']} -> {st['after']}, expected {want}")
    return outcome(problems, "Academy Wall: paid, and a card was drawn" if yes
                   else "Academy Wall: declined, and nothing was drawn", found)


def steward(yes):
    """Steward of Solidarity: {T}, exert it: create a 1/1 Warrior (CostExert,
    a yes or no on the card itself). Yes: a token, and the Steward stays
    tapped through seat 1's next untap. No: no token, the Steward untapped."""
    g = game(f"exert-{'yes' if yes else 'no'}", [("Plains", 36), ("Steward of Solidarity", 24)])
    st = {"used": None, "asked": [], "turn": None, "made": None, "after": None}

    def tokens():
        return sorted(c["id"] for c in g.mine(1) if c.get("token"))

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "confirmPayment" and "Exert" in (f.get("prompt") or ""):
            st["asked"].append((seat, f.get("prompt")))
            return "confirm:yes" if yes else None
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            ready = [c for c in g.mine(1, name="Steward of Solidarity") if not c.get("sick") and not c.get("tapped")]
            if st["used"] is None and ready:
                o = g.option(f, name="Steward of Solidarity", zone="battlefield")
                if o:
                    st["used"], st["turn"] = ready[0]["id"], g.turn
                    return o
            land = g.play_land(f)
            if land:
                return land
            return None if g.mine(1, name="Steward of Solidarity") else cast(g, f, "Steward of Solidarity")
        return DEFAULT

    def until(g):
        phase = g.state.get(1, {}).get("phase")
        steward = next((c for c in g.mine(1) if c["id"] == st["used"]), {})
        if st["asked"] and st["made"] is None and stack_empty(g) and g.turn == st["turn"] and phase == "MAIN2":
            st["made"] = {"tokens": tokens(), "tapped": bool(steward.get("tapped"))}
        if st["made"] and st["after"] is None and g.turn >= st["turn"] + 2 and phase == "MAIN1":
            st["after"] = bool(steward.get("tapped"))
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {"asked": st["asked"], "made": st["made"], "tapped_next_turn": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or st["after"] is None:
        return "inconclusive", "Steward of Solidarity's exert cost was never asked", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the opponent was asked about seat 1's exert cost")
    if yes:
        if len(st["made"]["tokens"]) != 1:
            problems.append(f"exerted: one Warrior token, got {st['made']}")
        if st["after"] is not True:
            problems.append("exerted: the Steward stays tapped through the next untap step")
    else:
        if st["made"]["tokens"] or st["made"]["tapped"]:
            problems.append(f"declined: no token and the Steward untapped, got {st['made']}")
    return outcome(problems, "Steward of Solidarity: exerted, a Warrior made, and it stayed tapped" if yes
                   else "Steward of Solidarity: declined, nothing made, nothing tapped", found)


def behold():
    """Champion of the Clachan: as an additional cost, behold a Kithkin and
    exile it (CostBeholdExile). Offered: every Goldmeadow Harrier on seat
    1's battlefield and in its hand. The LAST one offered is exiled, the
    rest stay where they were, and the Champion resolves."""
    g = game("behold", [("Plains", 30), ("Goldmeadow Harrier", 18), ("Champion of the Clachan", 12)])
    st = {"cast": None, "asked": [], "picked": None, "kithkin": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostBehold":
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            # Every Kithkin seat 1 has -- the other Champions in hand are
            # Kithkin too -- except the Champion being cast.
            st["kithkin"] = sorted(c["id"] for c in g.mine(1) + g.zone(1, "hand")
                                   if "Kithkin" in (c.get("types") or "") and c["id"] != st["cast"])
            st["picked"] = card_of(f["options"][-1]["actionId"])
            return f["options"][-1]["actionId"]
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if st["cast"] is None and len(g.mine(1, name="Goldmeadow Harrier")) >= 2:
                o = cast(g, f, "Champion of the Clachan")
                if o:
                    st["cast"] = card_of(o)
                    return o
                return None
            return cast(g, f, "Goldmeadow Harrier")
        return DEFAULT

    def until(g):
        landed = st["cast"] and any(c["id"] == st["cast"] for c in g.mine(1))
        if st["asked"] and landed and stack_empty(g) and st["after"] is None:
            st["after"] = {"exile": sorted(c["id"] for c in g.zone(1, "exile", owner=1)),
                           "battlefield": sorted(c["id"] for c in g.mine(1)),
                           "hand": sorted(c["id"] for c in g.zone(1, "hand"))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {"asked": st["asked"], "picked": st["picked"], "kithkin": st["kithkin"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Champion of the Clachan never resolved after a behold", found
    problems = []
    seat, offered, prompt = st["asked"][0]
    if seat != 1:
        problems.append("the opponent was asked what seat 1 beholds")
    if offered != sorted(st["kithkin"]):
        problems.append(f"offered {offered}, not exactly seat 1's Kithkin on the battlefield and in hand {st['kithkin']}")
    if "Kithkin" not in (prompt or "") or "(" in (prompt or ""):
        problems.append(f"the question should say what to behold, plainly: {prompt!r}")
    after = st["after"]
    if after["exile"] != [st["picked"]]:
        problems.append(f"exactly the Kithkin picked, {st['picked']}, should be exiled: {after['exile']}")
    rest = [c for c in st["kithkin"] if c != st["picked"]]
    if any(c not in after["battlefield"] + after["hand"] for c in rest):
        problems.append(f"the others stay where they were: {rest} vs {after}")
    return outcome(problems, "Champion of the Clachan: the Kithkin picked was beheld and exiled, the rest stayed",
                   found)


def evidence():
    """Forensic Researcher, {T} + collect evidence 3: tap target creature you
    don't control (CostCollectEvidence). The graveyard holds four or more
    Opts (mana value 1): the LAST offered each time, until the total is 3,
    then Done. Exactly those three are exiled, the rest stay, and the
    Bears is tapped."""
    g = game("evidence", [("Island", 26), ("Opt", 20), ("Forensic Researcher", 14)])
    st = {"used": False, "asked": [], "picked": [], "grave": None, "bears": None, "after": None, "turn": None}

    def grave():
        return sorted(c["id"] for c in g.zone(1, "graveyard", owner=1))

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostCollectEvidence":
            cards = [o for o in f["options"] if card_of(o["actionId"])]
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in cards), f.get("prompt")))
            if len(st["picked"]) < 3:
                st["picked"].append(card_of(cards[-1]["actionId"]))
                return cards[-1]["actionId"]
            return "cost:done"
        if k == "chooseTargetsFor" and seat == 1 and st["used"]:
            return next((o["actionId"] for o in f["options"] if o.get("objectId") == st["bears"]), DEFAULT)
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or (cast(g, f, "Grizzly Bears") if stack_empty(g) else None)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            researchers = [c for c in g.mine(1, name="Forensic Researcher") if not c.get("sick") and not c.get("tapped")]
            bears = [c for c in g.zone(1, "battlefield", owner=2, name="Grizzly Bears") if not c.get("tapped")]
            opts = [c for c in g.zone(1, "graveyard", owner=1) if c.get("name") == "Opt"]
            if not st["used"] and researchers and bears and len(opts) >= 4:
                o = g.option(f, name="Forensic Researcher", zone="battlefield", contains="Tap target creature")
                if o:
                    st["used"], st["turn"], st["bears"], st["grave"] = True, g.turn, bears[0]["id"], grave()
                    return o
            land = g.play_land(f)
            if land:
                return land
            if not g.mine(1, name="Forensic Researcher"):
                o = cast(g, f, "Forensic Researcher")
                if o:
                    return o
            return None if st["used"] else cast(g, f, "Opt")
        return DEFAULT

    def until(g):
        bear = next((c for c in g.zone(1, "battlefield", owner=2) if c["id"] == st["bears"]), {})
        done = bear.get("tapped") or (st["turn"] is not None and g.turn > st["turn"])
        if st["picked"] and done and stack_empty(g) and st["after"] is None:
            st["after"] = {"grave": grave(), "exile": sorted(c["id"] for c in g.zone(1, "exile", owner=1)),
                           "bears_tapped": bool(bear.get("tapped"))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"asked": [(a, len(b), c) for a, b, c in st["asked"]], "picked": st["picked"], "grave": st["grave"],
             "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Forensic Researcher never collected evidence", found
    problems = []
    if any(seat != 1 for seat, _, _ in st["asked"]):
        problems.append("the opponent was asked what seat 1 collects")
    if st["asked"][0][1] != st["grave"]:
        problems.append(f"offered {st['asked'][0][1]}, not exactly seat 1's graveyard {st['grave']}")
    if len(st["asked"]) != 4 or "Done" not in (st["asked"][3][2] or "") or "Done" in (st["asked"][2][2] or ""):
        problems.append(f"three picks, and Done offered only once the total is 3: {found['asked']}")
    after = st["after"]
    if after["exile"] != sorted(st["picked"]):
        problems.append(f"exactly the three picked {st['picked']} should be exiled: {after['exile']}")
    if any(c not in after["grave"] for c in st["grave"] if c not in st["picked"]):
        problems.append(f"the rest of the graveyard stays: {st['grave']} -> {after['grave']}")
    if not after["bears_tapped"]:
        problems.append("the ability resolved, so the Bears is tapped")
    return outcome(problems, "Forensic Researcher: the three Opts picked were exiled, the rest stayed, the Bears "
                             "was tapped", found)


def blight():
    """Sting-Slinger, {1}{R} {T} blight 1: 2 damage to each opponent
    (CostBlight). Every creature seat 1 controls is offered; the LAST gets
    the -1/-1 counter, no other creature does, and the opponent loses 2."""
    g = game("blight", [("Mountain", 30), ("Hill Giant", 15), ("Sting-Slinger", 15)])
    st = {"used": False, "asked": [], "picked": None, "mine": None, "life": None, "after": None, "turn": None}

    def creatures():
        return sorted(c["id"] for c in g.mine(1) if c.get("kind") == "creature")

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostBlight":
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            st["mine"] = creatures()
            st["picked"] = card_of(f["options"][-1]["actionId"])
            return f["options"][-1]["actionId"]
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            slingers = [c for c in g.mine(1, name="Sting-Slinger") if not c.get("sick") and not c.get("tapped")]
            if not st["used"] and slingers and g.mine(1, name="Hill Giant") and len(g.untapped_lands(1)) >= 2:
                o = g.option(f, name="Sting-Slinger", zone="battlefield", contains="damage")
                if o:
                    st["used"], st["turn"] = True, g.turn
                    st["life"] = (g.player(1, 2) or {}).get("life")
                    return o
            land = g.play_land(f)
            if land:
                return land
            if st["used"]:
                return None
            if not g.mine(1, name="Sting-Slinger"):
                return cast(g, f, "Sting-Slinger")
            return None if g.mine(1, name="Hill Giant") else cast(g, f, "Hill Giant")
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        life = (g.player(1, 2) or {}).get("life")
        done = (st["life"] is not None and life is not None and life < st["life"]) or \
            (st["turn"] is not None and g.turn > st["turn"])
        if st["picked"] and done and stack_empty(g) and st["after"] is None:
            st["after"] = {"life": life, "counters": {c["id"]: {k["name"]: k["count"] for k in c.get("counters", []) or []}
                                                      for c in g.mine(1) if c.get("kind") == "creature"}}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"asked": st["asked"], "picked": st["picked"], "life": st["life"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Sting-Slinger never blighted", found
    problems = []
    seat, offered, prompt = st["asked"][0]
    if seat != 1:
        problems.append("the opponent was asked which of seat 1's creatures to blight")
    if offered != st["mine"] or len(offered) < 2:
        problems.append(f"offered {offered}, not exactly seat 1's creatures {st['mine']} (two or more)")
    if prompt != "Blight 1: put one -1/-1 counter on a creature you control.":
        problems.append(f"the question should say blight in plain words: {prompt!r}")
    counted = {cid: v.get("M1M1") for cid, v in st["after"]["counters"].items() if v.get("M1M1")}
    if counted != {st["picked"]: 1}:
        problems.append(f"exactly one -1/-1 counter, on {st['picked']}: {counted}")
    if st["life"] - st["after"]["life"] != 2:
        problems.append(f"the opponent loses 2: {st['life']} -> {st['after']['life']}")
    return outcome(problems, "Sting-Slinger: the creature picked got the -1/-1 counter, and the opponent lost 2",
                   found)


def salvo(yes):
    """Blazing Salvo: 3 damage to target creature unless its controller has
    it deal 5 damage to them (CostDamage, asked of THAT player). Yes: they
    lose 5 and the Bears lives. No: the Bears dies, no life lost."""
    g = game(f"salvo-{'yes' if yes else 'no'}", [("Mountain", 36), ("Blazing Salvo", 24)])
    st = {"cast": None, "bears": None, "asked": [], "life": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "confirmPayment" and "damage to you" in (f.get("prompt") or ""):
            st["asked"].append((seat, f.get("prompt")))
            st["life"] = (g.player(1, 2) or {}).get("life")
            return "confirm:yes" if yes else None
        if k == "chooseTargetsFor" and seat == 1:
            return next((o["actionId"] for o in f["options"] if o.get("objectId") == st["bears"]), DEFAULT)
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or (cast(g, f, "Grizzly Bears") if stack_empty(g) else None)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            bears = g.zone(1, "battlefield", owner=2, name="Grizzly Bears")
            if st["cast"] is None and bears:
                o = cast(g, f, "Blazing Salvo")
                if o:
                    st["cast"], st["bears"] = card_of(o), bears[0]["id"]
                    return o
            return None
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        resolved = st["cast"] and any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if st["asked"] and resolved and stack_empty(g) and st["after"] is None:
            st["after"] = {"life": (g.player(1, 2) or {}).get("life"),
                           "bears": any(c["id"] == st["bears"] for c in g.zone(1, "battlefield", owner=2))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=12)
    found = {"asked": st["asked"], "life": st["life"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Blazing Salvo's damage choice was never asked", found
    problems = []
    if [seat for seat, _ in st["asked"]] != [2]:
        problems.append(f"only the Bears' controller is asked, once: {st['asked']}")
    if st["asked"][0][1] != "Have Blazing Salvo deal 5 damage to you?":
        problems.append(f"the question should say what it costs: {st['asked'][0][1]!r}")
    lost = st["life"] - st["after"]["life"]
    if yes and (lost != 5 or not st["after"]["bears"]):
        problems.append(f"took it: 5 life lost and the Bears lives, got {lost} and {st['after']}")
    if not yes and (lost != 0 or st["after"]["bears"]):
        problems.append(f"declined: no life lost and the Bears dies, got {lost} and {st['after']}")
    return outcome(problems, "Blazing Salvo: took the 5, and the Bears lived" if yes
                   else "Blazing Salvo: declined, and the Bears died", found)


def signaler():
    """Patrol Signaler, {1}{W} {Q}: create a 1/1 Kithkin (CostUntap, nothing
    to ask). Tapped by attacking, then used: it untaps and the token is
    made."""
    g = game("untap", [("Plains", 36), ("Patrol Signaler", 24)], [("Forest", 60)])
    st = {"attacked": None, "used": False, "turn": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "declareAttackers" and seat == 1:
            ready = [c["id"] for c in g.mine(1, name="Patrol Signaler") if not c.get("sick") and not c.get("tapped")]
            if st["attacked"] or not ready:
                return None
            o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == ready[0]), None)
            if o:
                st["attacked"], st["turn"] = ready[0], g.turn
            return o
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            me = next((c for c in g.mine(1) if c["id"] == st["attacked"]), {})
            if st["attacked"] and not st["used"] and me.get("tapped") and g.turn == st["turn"] \
                    and len(g.untapped_lands(1)) >= 2:
                o = g.option(f, name="Patrol Signaler", zone="battlefield", contains="Kithkin")
                if o:
                    st["used"] = True
                    return o
            land = g.play_land(f)
            if land:
                return land
            return None if g.mine(1, name="Patrol Signaler") else cast(g, f, "Patrol Signaler")
        return DEFAULT

    def until(g):
        me = next((c for c in g.mine(1) if c["id"] == st["attacked"]), {})
        tokens = [c["id"] for c in g.mine(1) if c.get("token")]
        if st["used"] and stack_empty(g) and st["after"] is None and (tokens or g.turn > st["turn"]):
            st["after"] = {"tokens": tokens, "tapped": bool(me.get("tapped"))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {"attacked": st["attacked"], "used": st["used"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["used"] or not st["after"]:
        return "inconclusive", "Patrol Signaler was never tapped and then used", found
    problems = []
    if len(st["after"]["tokens"]) != 1 or st["after"]["tapped"]:
        problems.append(f"the untap cost paid: one token, and the Signaler untapped: {st['after']}")
    return outcome(problems, "Patrol Signaler: {Q} paid -- it untapped, and a Kithkin token was made", found)


def concoction(yes):
    """Sinister Concoction: {B}, pay 1 life, mill a card, discard a card,
    sacrifice it: destroy target creature. The mill (CostMill) is a yes or
    no. Yes: the library is one card smaller and the Bears is destroyed.
    No: nothing is milled, the Bears lives -- and, since the yes-or-no
    costs are asked before the point of no return (Phase 8 Amendment 2),
    the Concoction is still there and no card was discarded."""
    g = game(f"mill-{'yes' if yes else 'no'}", [("Swamp", 36), ("Sinister Concoction", 24)])
    st = {"used": False, "asked": [], "library": None, "bears": None, "after": None, "turn": None, "hand": None}

    def library():
        return (g.player(1, 1) or {}).get("libraryCount")

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        prompt = f.get("prompt") or ""
        if k == "confirmPayment" and prompt.startswith("Mill "):
            st["asked"].append((seat, prompt))
            st["library"] = library()
            st["hand"] = len(g.zone(1, "hand"))
            return "confirm:yes" if yes else None
        if k == "confirmPayment" and seat == 1:
            return "confirm:yes"
        if k == "CostDiscard" and seat == 1:
            return f["options"][0]["actionId"]
        if k == "chooseTargetsFor" and seat == 1:
            return next((o["actionId"] for o in f["options"] if o.get("objectId") == st["bears"]), DEFAULT)
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or (cast(g, f, "Grizzly Bears") if stack_empty(g) else None)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            bears = g.zone(1, "battlefield", owner=2, name="Grizzly Bears")
            # Seat 1's own main phase: no draw step between asking and reading.
            mine = g.state.get(1, {}).get("activeSeat") == 1 and g.state.get(1, {}).get("phase") in ("MAIN1", "MAIN2")
            if not st["used"] and mine and bears and g.mine(1, name="Sinister Concoction") and g.untapped_lands(1):
                o = g.option(f, name="Sinister Concoction", zone="battlefield")
                if o:
                    st["used"], st["bears"], st["turn"] = True, bears[0]["id"], g.turn
                    return o
            land = g.play_land(f)
            if land:
                return land
            return None if g.mine(1, name="Sinister Concoction") else cast(g, f, "Sinister Concoction")
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        gone = st["bears"] and not any(c["id"] == st["bears"] for c in g.zone(1, "battlefield", owner=2))
        # Declined: read at once, before a later draw changes the library.
        if st["asked"] and stack_empty(g) and st["after"] is None and (gone or not yes):
            st["after"] = {"library": library(), "bears_gone": bool(gone), "hand": len(g.zone(1, "hand")),
                           "concoction": bool(g.mine(1, name="Sinister Concoction"))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=12)
    found = {"asked": st["asked"], "library": st["library"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Sinister Concoction's mill was never asked", found
    problems = []
    if [seat for seat, _ in st["asked"]] != [1] or st["asked"][0][1] != "Mill one card?":
        problems.append(f"seat 1 alone, asked once, \"Mill one card?\": {st['asked']}")
    after = st["after"]
    if yes and (after["library"] != st["library"] - 1 or not after["bears_gone"] or after["concoction"]):
        problems.append(f"milled: library {st['library']} -> {after['library']}, the Bears destroyed, the "
                        f"Concoction sacrificed: {after}")
    if not yes and (after["library"] != st["library"] or after["bears_gone"] or not after["concoction"]
                    or after["hand"] != st["hand"]):
        problems.append(f"declined before the point of no return: nothing milled, the Bears alive, the Concoction "
                        f"kept, nothing discarded: hand {st['hand']} -> {after}")
    return outcome(problems, "Sinister Concoction: milled, and the Bears was destroyed" if yes
                   else "Sinister Concoction: declined -- nothing milled, nothing destroyed, nothing lost", found)


def forage():
    """Bushy Bodyguard enters; "you may forage" (yes); no Food, so exile
    three cards from the graveyard (CostForage): the LAST three offered.
    Exactly those are exiled, and the Bodyguard gets two +1/+1 counters."""
    g = game("forage", [("Forest", 30), ("Giant Growth", 18), ("Bushy Bodyguard", 12)])
    st = {"cast": None, "asked": [], "picked": [], "grave": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostForage":
            cards = [o for o in f["options"] if card_of(o["actionId"]) and card_of(o["actionId"]) not in st["picked"]]
            st["asked"].append((seat, len(f["options"]), f.get("prompt")))
            if st["grave"] is None:
                st["grave"] = sorted(c["id"] for c in g.zone(1, "graveyard", owner=1))
            st["picked"].append(card_of(cards[-1]["actionId"]))
            return cards[-1]["actionId"]
        if k == "confirmTrigger" and seat == 1:
            return "confirm:yes"
        if k == "chooseNumberForKeywordCost":
            return "confirm:no"
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or (cast(g, f, "Grizzly Bears") if stack_empty(g) else None)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            grave = g.zone(1, "graveyard", owner=1)
            if st["cast"] is None and len(grave) >= 4:
                o = cast(g, f, "Bushy Bodyguard")
                if o:
                    st["cast"] = card_of(o)
                return o
            # Fill the graveyard: Giant Growth on the opponent's Bears.
            if st["cast"] is None and g.zone(1, "battlefield", owner=2, name="Grizzly Bears"):
                return cast(g, f, "Giant Growth")
            return None
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        body = next((c for c in g.mine(1) if c["id"] == st["cast"]), None)
        if st["picked"] and body and stack_empty(g) and st["after"] is None:
            st["after"] = {"exile": sorted(c["id"] for c in g.zone(1, "exile", owner=1)),
                           "counters": {k["name"]: k["count"] for k in body.get("counters", []) or []}}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"asked": st["asked"], "picked": st["picked"], "grave": st["grave"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["picked"] or not st["after"]:
        return "inconclusive", "Bushy Bodyguard never foraged from the graveyard", found
    problems = []
    if any(seat != 1 for seat, _, _ in st["asked"]) or len(st["asked"]) != 3:
        problems.append(f"three picks, all seat 1's: {st['asked']}")
    if st["asked"][0][2] != "Forage: exile three cards from your graveyard. (3 more needed)" and \
            not (st["asked"][0][2] or "").startswith("Forage: exile three cards from your graveyard."):
        problems.append(f"the question should say what forage takes: {st['asked'][0][2]!r}")
    if st["after"]["exile"] != sorted(st["picked"]):
        problems.append(f"exactly the three picked {st['picked']} exiled: {st['after']['exile']}")
    if st["after"]["counters"].get("P1P1") != 2:
        problems.append(f"foraged, so two +1/+1 counters: {st['after']['counters']}")
    return outcome(problems, "Bushy Bodyguard: the three cards picked were exiled, and it got two counters", found)


def invigorate():
    """Invigorate's alternative cost -- an opponent gains 3 life instead of
    paying (CostGainLife): which opponent is asked. The opponent gains 3,
    no land is tapped for it, and the Bears gets +4/+4."""
    g = game("gain-life", [("Forest", 30), ("Grizzly Bears", 15), ("Invigorate", 15)])
    st = {"cast": None, "asked": [], "life": None, "lands": None, "bears": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostGainLife":
            st["asked"].append((seat, [o.get("label") for o in f["options"]], f.get("prompt")))
            st["life"] = (g.player(1, 2) or {}).get("life")
            return f["options"][-1]["actionId"]
        if k == "chooseTargetsFor" and seat == 1:
            return next((o["actionId"] for o in f["options"] if o.get("objectId") == st["bears"]), DEFAULT)
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            bears = g.mine(1, name="Grizzly Bears")
            if st["cast"] is None and bears:
                o = next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith("Invigorate")
                          and "life" in (o.get("label") or "")), None)
                if o:
                    st["cast"], st["bears"] = card_of(o), bears[0]["id"]
                    st["lands"] = len(g.untapped_lands(1))
                    return o
            land = g.play_land(f)
            if land:
                return land
            return None if bears else cast(g, f, "Grizzly Bears")
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        resolved = st["cast"] and any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if st["asked"] and resolved and stack_empty(g) and st["after"] is None:
            bear = next((c for c in g.mine(1) if c["id"] == st["bears"]), {})
            st["after"] = {"life": (g.player(1, 2) or {}).get("life"), "lands": len(g.untapped_lands(1)),
                           "pt": (bear.get("power"), bear.get("toughness"))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=12)
    found = {"asked": st["asked"], "life": st["life"], "lands": st["lands"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Invigorate was never cast for its alternative cost", found
    problems = []
    seat, labels, prompt = st["asked"][0]
    if seat != 1 or labels != ["Bob"] or prompt != "Invigorate: choose an opponent to gain 3 life.":
        problems.append(f"the caster chooses which opponent, by name: {st['asked']}")
    after = st["after"]
    if after["life"] - st["life"] != 3 or after["lands"] != st["lands"] or after["pt"] != (6, 6):
        problems.append(f"the opponent gains 3, no land tapped, the Bears 6/6: {st['life']} {st['lands']} -> {after}")
    return outcome(problems, "Invigorate: the opponent gained 3, nothing tapped, the Bears got +4/+4", found)


def leashling():
    """Leashling: put a card from your hand on top of your library: return
    it to hand (CostPutCardToLib). The LAST card offered goes on top: it
    leaves the hand, Leashling returns, and the next draw is that card."""
    g = game("to-library", [("Plains", 30), ("Leashling", 30)])
    st = {"used": False, "asked": [], "picked": None, "turn": None, "after": None, "drawn": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostPutCardToLib":
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            st["picked"] = card_of(f["options"][-1]["actionId"])
            return f["options"][-1]["actionId"]
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            if not st["used"] and g.mine(1, name="Leashling") and len(g.zone(1, "hand")) >= 2:
                o = g.option(f, name="Leashling", zone="battlefield", contains="Return")
                if o:
                    st["used"], st["turn"] = True, g.turn
                    return o
            land = g.play_land(f)
            if land:
                return land
            return None if g.mine(1, name="Leashling") or st["used"] else cast(g, f, "Leashling")
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        hand = [c["id"] for c in g.zone(1, "hand")]
        if st["picked"] and stack_empty(g) and st["after"] is None and not g.mine(1, name="Leashling"):
            st["after"] = {"picked_in_hand": st["picked"] in hand,
                           "leashling_in_hand": any(c.get("name") == "Leashling" for c in g.zone(1, "hand"))}
        if st["after"] and st["drawn"] is None and g.turn >= st["turn"] + 2 and \
                g.state.get(1, {}).get("phase") == "MAIN1":
            st["drawn"] = st["picked"] in hand
        return st["drawn"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"asked": st["asked"], "picked": st["picked"], "after": st["after"], "drawn": st["drawn"],
             "stopped": g.stopped_badly()}
    if not st["asked"] or st["drawn"] is None:
        return "inconclusive", "Leashling never returned itself", found
    problems = []
    if st["asked"][0][0] != 1 or st["asked"][0][2] != "Put a card from your hand on top of your library.":
        problems.append(f"seat 1 asked, in plain words: {st['asked']}")
    if st["after"]["picked_in_hand"] or not st["after"]["leashling_in_hand"]:
        problems.append(f"the card picked leaves the hand and Leashling returns: {st['after']}")
    if not st["drawn"]:
        problems.append("the card picked was put on top, so it is the next card drawn")
    return outcome(problems, "Leashling: the card picked went on top -- and was the next draw -- and Leashling "
                             "returned", found)


def fountain():
    """Halo Fountain, {W} {T}, untap a tapped creature you control: create a
    1/1 Citizen (CostUntapType). Two Lions tapped by attacking: the LAST
    offered untaps, the other stays tapped, and the token is made."""
    g = game("untap-type", [("Plains", 30), ("Savannah Lions", 18), ("Halo Fountain", 12)], [("Forest", 60)])
    st = {"attacked": [], "turn": None, "used": False, "asked": [], "picked": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostUntapType":
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            st["picked"] = card_of(f["options"][-1]["actionId"])
            return f["options"][-1]["actionId"]
        if k == "declareAttackers" and seat == 1:
            if st["turn"] is not None and g.turn != st["turn"]:
                return None
            ready = [c["id"] for c in g.mine(1, name="Savannah Lions") if not c.get("sick") and not c.get("tapped")]
            # The Fountain's {W} must still be there in the second main phase.
            spare = g.untapped_lands(1) and any(not c.get("tapped") for c in g.mine(1, name="Halo Fountain"))
            if not g.mine(1, name="Halo Fountain") or (not st["attacked"] and (len(ready) < 2 or not spare)):
                return None
            o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) in ready
                      and card_of(o["actionId"]) not in st["attacked"]), None)
            if o and len(st["attacked"]) < 2:
                st["attacked"].append(card_of(o))
                st["turn"] = g.turn
                return o
            return None
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            phase = g.state.get(1, {}).get("phase")
            if len(st["attacked"]) == 2 and not st["used"] and g.turn == st["turn"] and phase == "MAIN2":
                o = g.option(f, name="Halo Fountain", zone="battlefield", contains="Citizen")
                if o:
                    st["used"] = True
                    return o
            land = g.play_land(f)
            if land:
                return land
            if st["attacked"]:
                return None
            if not g.mine(1, name="Halo Fountain") and cast(g, f, "Halo Fountain"):
                return cast(g, f, "Halo Fountain")
            return cast(g, f, "Savannah Lions") if len(g.mine(1, name="Savannah Lions")) < 2 else None
        if k == "declareBlockers":
            return None
        return DEFAULT

    def until(g):
        tokens = [c for c in g.mine(1) if c.get("token")]
        if st["picked"] and stack_empty(g) and st["after"] is None and (tokens or g.turn > st["turn"]):
            st["after"] = {"tapped": {c["id"]: bool(c.get("tapped")) for c in g.mine(1, name="Savannah Lions")},
                           "tokens": len(tokens)}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"attacked": st["attacked"], "asked": st["asked"], "picked": st["picked"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Halo Fountain never untapped a creature", found
    problems = []
    seat, offered, prompt = st["asked"][0]
    if seat != 1 or offered != sorted(st["attacked"]):
        problems.append(f"offered {offered}, not exactly the two tapped Lions {st['attacked']}")
    other = [a for a in st["attacked"] if a != st["picked"]]
    tapped = st["after"]["tapped"]
    if tapped.get(st["picked"]) is not False or any(tapped.get(a) is not True for a in other) or st["after"]["tokens"] != 1:
        problems.append(f"{st['picked']} untapped, {other} still tapped, one token: {st['after']}")
    return outcome(problems, "Halo Fountain: the Lions picked untapped, the other stayed tapped, a Citizen made", found)


def urza_filter():
    """Urza's Filter: multicolored spells cost up to {2} less
    (chooseNumberForCostReduction: no question -- the whole reduction, as
    Forge's own screen does). Knight of Autumn ({1}{G}{W}) then taps only
    two lands."""
    g = game("reduction", [("Forest", 15), ("Plains", 15), ("Urza's Filter", 10), ("Knight of Autumn", 20)])
    st = {"cast": None, "lands": None, "after": None, "asked": []}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseNumberForCostReduction":
            st["asked"].append(seat)
        if k in ("chooseModeForAbility", "chooseSpellAbilitiesForEffect"):
            return DEFAULT
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if not g.mine(1, name="Urza's Filter"):
                return cast(g, f, "Urza's Filter")
            if st["cast"] is None:
                o = cast(g, f, "Knight of Autumn")
                if o:
                    st["cast"], st["lands"] = card_of(o), len(g.untapped_lands(1))
                    return o
            return None
        return DEFAULT

    def until(g):
        landed = st["cast"] and any(c["id"] == st["cast"] for c in g.mine(1))
        if landed and stack_empty(g) and st["after"] is None:
            st["after"] = len(g.untapped_lands(1))
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"lands": [st["lands"], st["after"]], "asked": st["asked"], "stopped": g.stopped_badly()}
    if st["after"] is None:
        return "inconclusive", "Knight of Autumn was never cast with Urza's Filter out", found
    problems = []
    if st["lands"] - st["after"] != 2:
        problems.append(f"the whole {{2}} off: two lands tapped, got {st['lands'] - st['after']}")
    if st["asked"]:
        problems.append(f"no question, as Forge's own screen: {st['asked']}")
    return outcome(problems, "Urza's Filter: the full {2} off -- Knight of Autumn tapped two lands, nothing asked",
                   found)


def gift(promise):
    """Blooming Blast: 2 damage to target creature; gift a Treasure -- if the
    gift was promised, 3 damage to that creature's controller too. The
    promise is the optional cost; with one opponent, who receives it
    (CostPromiseGift) needs no question. Promised: the opponent gets a
    Treasure and loses 3. Not: neither. The Bears dies either way."""
    g = game(f"gift-{'yes' if promise else 'no'}", [("Mountain", 36), ("Blooming Blast", 24)])
    st = {"cast": None, "bears": None, "offered": [], "asked_gift": [], "life": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseOptionalCosts" and seat == 1:
            st["offered"].append([o.get("label") for o in f["options"]])
            o = next((o["actionId"] for o in f["options"] if "ift" in (o.get("label") or "")), None)
            return o if promise and len(st["offered"]) == 1 else None
        if k == "CostPromiseGift":
            st["asked_gift"].append(seat)
            return DEFAULT
        if k == "chooseTargetsFor" and seat == 1:
            return next((o["actionId"] for o in f["options"] if o.get("objectId") == st["bears"]), DEFAULT)
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or (cast(g, f, "Grizzly Bears") if stack_empty(g) else None)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            bears = g.zone(1, "battlefield", owner=2, name="Grizzly Bears")
            if st["cast"] is None and bears:
                o = cast(g, f, "Blooming Blast")
                if o:
                    st["cast"], st["bears"] = card_of(o), bears[0]["id"]
                    st["life"] = (g.player(1, 2) or {}).get("life")
                    return o
            return None
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        resolved = st["cast"] and any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if resolved and stack_empty(g) and st["after"] is None:
            st["after"] = {"life": (g.player(1, 2) or {}).get("life"),
                           "treasures": len([c for c in g.zone(1, "battlefield", owner=2) if c.get("token")]),
                           "bears_dead": not any(c["id"] == st["bears"] for c in g.zone(1, "battlefield", owner=2))}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=12)
    found = {"offered": st["offered"], "asked_gift": st["asked_gift"], "life": st["life"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["offered"] or not st["after"]:
        return "inconclusive", "Blooming Blast was never cast with its gift offered", found
    problems = []
    if st["asked_gift"]:
        problems.append(f"one opponent: who receives the gift needs no question: {st['asked_gift']}")
    after, lost = st["after"], st["life"] - st["after"]["life"]
    if not after["bears_dead"]:
        problems.append("the Bears takes 2 and dies either way")
    if promise and (after["treasures"] != 1 or lost != 3):
        problems.append(f"promised: the opponent gets a Treasure and loses 3, got {after['treasures']} and {lost}")
    if not promise and (after["treasures"] != 0 or lost != 0):
        problems.append(f"not promised: no Treasure, no damage, got {after['treasures']} and {lost}")
    return outcome(problems, "Blooming Blast: gift promised -- a Treasure for the opponent, and 3 damage" if promise
                   else "Blooming Blast: no gift -- no Treasure, no damage to the player", found)


def lamenter(yes):
    """Moonlit Lamenter (enters with a -1/-1 counter), {1}{W} remove a
    counter from this creature: draw a card (CostRemoveAnyCounter, the card
    itself with one kind: a yes or no). Yes: the counter is gone and a card
    drawn. No: neither."""
    g = game(f"counter-{'yes' if yes else 'no'}", [("Plains", 36), ("Moonlit Lamenter", 24)])
    st = {"used": None, "asked": [], "hand": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "confirmPayment" and "counter from Moonlit Lamenter" in (f.get("prompt") or ""):
            st["asked"].append((seat, f.get("prompt")))
            st["hand"] = len(g.zone(1, "hand"))
            return "confirm:yes" if yes else None
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            mine = [c for c in g.mine(1, name="Moonlit Lamenter") if (c.get("counters") or [])]
            if st["used"] is None and mine and len(g.untapped_lands(1)) >= 2:
                o = g.option(f, name="Moonlit Lamenter", zone="battlefield", contains="Draw")
                if o:
                    st["used"] = mine[0]["id"]
                    return o
            return None if g.mine(1, name="Moonlit Lamenter") else cast(g, f, "Moonlit Lamenter")
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        if st["asked"] and stack_empty(g) and st["after"] is None:
            me = next((c for c in g.mine(1) if c["id"] == st["used"]), {})
            st["after"] = {"hand": len(g.zone(1, "hand")),
                           "counters": {k["name"]: k["count"] for k in me.get("counters", []) or []}}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=14)
    found = {"asked": st["asked"], "hand": st["hand"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Moonlit Lamenter never offered to remove its counter", found
    problems = []
    if st["asked"] != [(1, "Remove one counter from Moonlit Lamenter?")]:
        problems.append(f"seat 1 alone, asked once, plainly: {st['asked']}")
    after = st["after"]
    if yes and (after["counters"].get("M1M1") or after["hand"] != st["hand"] + 1):
        problems.append(f"removed: the counter gone and a card drawn: {st['hand']} -> {after}")
    if not yes and (after["counters"].get("M1M1") != 1 or after["hand"] != st["hand"]):
        problems.append(f"declined: the counter stays and nothing drawn: {st['hand']} -> {after}")
    return outcome(problems, "Moonlit Lamenter: the counter removed and a card drawn" if yes
                   else "Moonlit Lamenter: declined -- the counter stays, nothing drawn", found)


def fain():
    """Fain, the Broker: {T}, remove a counter from a creature you control:
    create a Treasure (CostRemoveAnyCounter). Two Moonlit Lamenters carry a
    -1/-1 counter each: the LAST offered loses its counter, the other
    keeps it, and a Treasure is made."""
    g = game("counter-pick", [("Plains", 18), ("Swamp", 18), ("Moonlit Lamenter", 14), ("Fain, the Broker", 10)])
    st = {"used": False, "asked": [], "picked": None, "turn": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostRemoveAnyCounter":
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            st["picked"] = card_of(f["options"][-1]["actionId"])
            return f["options"][-1]["actionId"]
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            ready = [c for c in g.mine(1, name="Fain, the Broker") if not c.get("sick") and not c.get("tapped")]
            if not st["used"] and ready and len(g.mine(1, name="Moonlit Lamenter")) >= 2:
                o = g.option(f, name="Fain, the Broker", zone="battlefield", contains="Treasure")
                if o:
                    st["used"], st["turn"] = True, g.turn
                    return o
            land = g.play_land(f)
            if land:
                return land
            if st["used"]:
                return None
            if not g.mine(1, name="Fain, the Broker") and cast(g, f, "Fain, the Broker"):
                return cast(g, f, "Fain, the Broker")
            if len(g.mine(1, name="Moonlit Lamenter")) >= 2:
                return None
            # From the hand only: a Lamenter on the battlefield offers its own
            # ability under the same name, and that would spend its counter.
            in_hand = {c["id"] for c in g.zone(1, "hand") if c.get("name") == "Moonlit Lamenter"}
            return next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) in in_hand
                         and o.get("payable") is not False), None)
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        tokens = [c for c in g.mine(1) if c.get("token")]
        if st["picked"] and stack_empty(g) and st["after"] is None and (tokens or g.turn > st["turn"]):
            st["after"] = {"counters": {c["id"]: {k["name"]: k["count"] for k in c.get("counters", []) or []}
                                        for c in g.mine(1, name="Moonlit Lamenter")},
                           "treasures": len(tokens)}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"asked": st["asked"], "picked": st["picked"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Fain never removed a counter", found
    problems = []
    seat, offered, prompt = st["asked"][0]
    lamenters = sorted(st["after"]["counters"])
    if seat != 1 or offered != lamenters:
        problems.append(f"offered {offered}, not exactly the Lamenters with counters {lamenters}")
    counters = st["after"]["counters"]
    other = [c for c in lamenters if c != st["picked"]]
    if counters.get(st["picked"], {}).get("M1M1") or any(counters[c].get("M1M1") != 1 for c in other):
        problems.append(f"{st['picked']} loses its counter, the other keeps it: {counters}")
    if st["after"]["treasures"] != 1:
        problems.append(f"one Treasure: {st['after']['treasures']}")
    return outcome(problems, "Fain: the counter came off the Lamenter picked, the other kept it, a Treasure made",
                   found)


def strangler():
    """Swords to Plowshares exiles two of the opponent's Bears; then Wasteland
    Strangler enters: "you may put a card an opponent owns from exile into
    its owner's graveyard" (CostExiledMoveToGrave). The LAST exiled Bears
    offered goes to the graveyard, the other stays in exile, and a third
    Bears gets -3/-3."""
    g = game("from-exile", [("Plains", 15), ("Swamp", 15), ("Swords to Plowshares", 14), ("Wasteland Strangler", 16)])
    st = {"swords": 0, "cast": None, "asked": [], "picked": None, "exiled": None, "target": None, "after": None}

    def theirs_bears():
        return [c["id"] for c in g.zone(1, "battlefield", owner=2, name="Grizzly Bears")]

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostExiledMoveToGrave":
            st["asked"].append((seat, sorted(card_of(o["actionId"]) for o in f["options"]), f.get("prompt")))
            st["exiled"] = sorted(c["id"] for c in g.zone(1, "exile", owner=2))
            st["picked"] = card_of(f["options"][-1]["actionId"])
            return f["options"][-1]["actionId"]
        if k == "confirmTrigger" and seat == 1:
            return "confirm:yes"
        if k == "chooseTargetsFor" and seat == 1:
            bears = theirs_bears()
            if st["cast"] and bears:
                st["target"] = bears[0]
            return next((o["actionId"] for o in f["options"] if o.get("objectId") in bears), DEFAULT)
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or (cast(g, f, "Grizzly Bears") if stack_empty(g) else None)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            exiled = len(g.zone(1, "exile", owner=2))
            if exiled < 2 and theirs_bears():
                return cast(g, f, "Swords to Plowshares")
            if exiled >= 2 and st["cast"] is None and theirs_bears():
                o = cast(g, f, "Wasteland Strangler")
                if o:
                    st["cast"] = card_of(o)
                return o
            return None
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        if st["picked"] and stack_empty(g) and st["after"] is None:
            st["after"] = {"grave": sorted(c["id"] for c in g.zone(1, "graveyard", owner=2)),
                           "exile": sorted(c["id"] for c in g.zone(1, "exile", owner=2)),
                           "target_alive": st["target"] in theirs_bears()}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=24)
    found = {"asked": st["asked"], "exiled": st["exiled"], "picked": st["picked"], "after": st["after"],
             "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Wasteland Strangler never processed an exiled card", found
    problems = []
    seat, offered, prompt = st["asked"][0]
    if seat != 1 or offered != st["exiled"] or len(offered) < 2:
        problems.append(f"offered {offered}, not exactly the opponent's exiled cards {st['exiled']} (two or more)")
    after = st["after"]
    if st["picked"] not in after["grave"] or st["picked"] in after["exile"]:
        problems.append(f"{st['picked']} goes from exile to the graveyard: {after}")
    if any(c not in after["exile"] for c in st["exiled"] if c != st["picked"]):
        problems.append(f"the other exiled card stays in exile: {after}")
    if after["target_alive"]:
        problems.append("the cost was paid, so the targeted Bears gets -3/-3 and dies")
    return outcome(problems, "Wasteland Strangler: the exiled Bears picked went to the graveyard, the other stayed",
                   found)


def bola(yes):
    """Leonin Bola on a Savannah Lions: "{T}, unattach Leonin Bola: tap target
    creature" (CostUnattach, one card: a yes or no). Yes: the Bears is
    tapped and the Bola unattached. No: neither."""
    g = game(f"unattach-{'yes' if yes else 'no'}", [("Plains", 30), ("Savannah Lions", 15), ("Leonin Bola", 15)])
    st = {"used": False, "asked": [], "bears": None, "turn": None, "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "confirmPayment" and "Unattach" in (f.get("prompt") or ""):
            st["asked"].append((seat, f.get("prompt")))
            return "confirm:yes" if yes else None
        if k == "chooseTargetsFor" and seat == 1:
            if st["used"]:
                return next((o["actionId"] for o in f["options"] if o.get("objectId") == st["bears"]), DEFAULT)
            return next((o["actionId"] for o in f["options"]
                         if any(c["id"] == o.get("objectId") for c in g.mine(1, name="Savannah Lions"))), DEFAULT)
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f) or (cast(g, f, "Grizzly Bears") if stack_empty(g) else None)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            bola_on = [c for c in g.mine(1, name="Leonin Bola") if c.get("attachedTo")]
            lions = [c for c in g.mine(1, name="Savannah Lions") if not c.get("sick") and not c.get("tapped")]
            bears = [c for c in g.zone(1, "battlefield", owner=2, name="Grizzly Bears") if not c.get("tapped")]
            if bola_on and lions and bears and not st["used"]:
                o = g.option(f, name="Savannah Lions", zone="battlefield", contains="Tap target")
                if o:
                    st["used"], st["bears"], st["turn"] = True, bears[0]["id"], g.turn
                    return o
            land = g.play_land(f)
            if land:
                return land
            if st["used"]:
                return None
            if not g.mine(1, name="Savannah Lions"):
                return cast(g, f, "Savannah Lions")
            if not g.mine(1, name="Leonin Bola"):
                return cast(g, f, "Leonin Bola")
            if not bola_on:
                return g.option(f, name="Leonin Bola", zone="battlefield", contains="Equip")
            return None
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        if st["asked"] and stack_empty(g) and st["after"] is None:
            bear = next((c for c in g.zone(1, "battlefield", owner=2) if c["id"] == st["bears"]), {})
            st["after"] = {"bears_tapped": bool(bear.get("tapped")),
                           "attached": bool([c for c in g.mine(1, name="Leonin Bola") if c.get("attachedTo")])}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"asked": st["asked"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Leonin Bola's unattach was never asked", found
    problems = []
    if st["asked"] != [(1, "Unattach Leonin Bola?")]:
        problems.append(f"seat 1 alone, asked once, plainly: {st['asked']}")
    after = st["after"]
    if yes and (not after["bears_tapped"] or after["attached"]):
        problems.append(f"unattached: the Bears tapped, the Bola off: {after}")
    if not yes and (after["bears_tapped"] or not after["attached"]):
        problems.append(f"declined: nothing tapped, the Bola still on: {after}")
    return outcome(problems, "Leonin Bola: unattached, and the Bears was tapped" if yes
                   else "Leonin Bola: declined -- still attached, nothing tapped", found)


def nivmagus():
    """Nivmagus Elemental: exile an instant or sorcery spell you control from
    the stack: two +1/+1 counters (CostExileFromStack). Seat 1's own
    Lightning Bolt, aimed at the opponent, is exiled from the stack: it
    deals nothing, and the Elemental gets its counters."""
    g = game("from-stack", [("Mountain", 18), ("Island", 12), ("Nivmagus Elemental", 12), ("Lightning Bolt", 18)],
             [("Forest", 60)])
    st = {"bolt": None, "used": False, "asked": [], "life": None, "after": None, "niv": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "CostExileFromStack":
            st["asked"].append((seat, [o.get("label") for o in f["options"]], f.get("prompt")))
            return f["options"][-1]["actionId"]
        if k == "chooseTargetsFor" and seat == 1:
            return next((o["actionId"] for o in f["options"] if o.get("objectId") == "player:2"), DEFAULT)
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            mine_on_stack = any(c.get("name") == "Lightning Bolt" and c.get("controller") == 1
                                for c in g.state.get(1, {}).get("stack") or [])
            if mine_on_stack and not st["used"]:
                o = g.option(f, name="Nivmagus Elemental", zone="battlefield", contains="Exile")
                if o:
                    st["used"] = True
                    st["niv"] = card_of(o)
                    return o
                return None
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if not g.mine(1, name="Nivmagus Elemental"):
                return cast(g, f, "Nivmagus Elemental")
            if st["bolt"] is None:
                o = cast(g, f, "Lightning Bolt")
                if o:
                    st["bolt"] = card_of(o)
                    st["life"] = (g.player(1, 2) or {}).get("life")
                return o
            return None
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        if st["asked"] and stack_empty(g) and st["after"] is None:
            niv = next((c for c in g.mine(1, name="Nivmagus Elemental")), {})
            st["after"] = {"life": (g.player(1, 2) or {}).get("life"),
                           "bolt_exiled": any(c["id"] == st["bolt"] for c in g.zone(1, "exile", owner=1)),
                           "counters": {k["name"]: k["count"] for k in niv.get("counters", []) or []}}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {"asked": st["asked"], "life": st["life"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Nivmagus Elemental never exiled a spell from the stack", found
    problems = []
    seat, labels, prompt = st["asked"][0]
    if seat != 1 or len(labels) != 1 or "Lightning Bolt" not in labels[0] or "(" in labels[0]:
        problems.append(f"seat 1 is offered its Lightning Bolt, named plainly: {st['asked'][0]}")
    after = st["after"]
    if not after["bolt_exiled"] or after["life"] != st["life"] or after["counters"].get("P1P1") != 2:
        problems.append(f"the Bolt exiled, no damage, two counters: {st['life']} {after}")
    return outcome(problems, "Nivmagus Elemental: the Bolt was exiled from the stack, and two counters landed", found)


def caller():
    """Caller of the Hunt: as an additional cost, choose a creature type
    (CostChooseCreatureType, through the type question); its power and
    toughness are the number of creatures of that type. Bear chosen with
    two Grizzly Bears out: Caller is a 2/2."""
    g = game("creature-type", [("Forest", 30), ("Grizzly Bears", 16), ("Caller of the Hunt", 14)], [("Island", 60)])
    st = {"cast": None, "asked": [], "after": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "chooseSomeType":
            st["asked"].append((seat, len(f["options"]), f.get("prompt")))
            return next((o["actionId"] for o in f["options"] if o.get("label") == "Bear"), DEFAULT)
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if len(g.mine(1, name="Grizzly Bears")) < 2:
                return cast(g, f, "Grizzly Bears")
            if st["cast"] is None:
                o = cast(g, f, "Caller of the Hunt")
                if o:
                    st["cast"] = card_of(o)
                return o
            return None
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        me = next((c for c in g.mine(1) if c["id"] == st["cast"]), None)
        died = any(c["id"] == st["cast"] for c in g.zone(1, "graveyard", owner=1))
        if st["asked"] and (me or died) and stack_empty(g) and st["after"] is None:
            st["after"] = ((me or {}).get("power", 0), (me or {}).get("toughness", 0),
                           len(g.mine(1, name="Grizzly Bears")))
        return st["after"] is not None

    g.run(policy, until=until, max_turn=16)
    found = {"asked": st["asked"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or not st["after"]:
        return "inconclusive", "Caller of the Hunt never asked for its creature type", found
    problems = []
    if any(seat != 1 for seat, _, _ in st["asked"]):
        problems.append("the opponent was asked seat 1's creature type")
    power, toughness, bears = st["after"]
    if (power, toughness) != (bears, bears):
        problems.append(f"Bear chosen with {bears} Bears out: a {bears}/{bears}, got {power}/{toughness}")
    return outcome(problems, f"Caller of the Hunt: Bear chosen, and it is a {power}/{toughness}", found)


def upkeep_game(name, deck, card, answer, extra=None, seat2=None):
    """Cast [card], then watch its first cumulative upkeep: [answer] the
    payment question (yes/no) and report whether [card] is still there
    once that upkeep has passed."""
    g = game(name, deck, seat2 or [("Forest", 60)])
    st = {"cast": None, "turn": None, "asked": [], "after": None, "extra": {}}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        prompt = f.get("prompt") or ""
        if extra:
            got = extra(g, f, st)
            if got is not None:
                return got
        # Forge's own yes or no carries its question on the Yes answer.
        said = prompt or ((f.get("options") or [{}])[0].get("label") or "")
        if k == "confirmPayment" and seat == 1 and st["cast"] and (card in said or "{R}" in said):
            st["asked"].append((seat, said))
            return "confirm:yes" if answer else None
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            if st["cast"] is None:
                o = cast(g, f, card)
                if o:
                    st["cast"], st["turn"] = card_of(o), g.turn
                return o
            return None
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        past = st["turn"] is not None and g.turn >= st["turn"] + 2 and \
            g.state.get(1, {}).get("phase") in ("MAIN1", "MAIN2")
        if st["asked"] and past and stack_empty(g) and st["after"] is None:
            st["after"] = any(c["id"] == st["cast"] for c in g.mine(1))
        return st["after"] is not None

    g.run(policy, until=until, max_turn=40)
    return g, st


def braid():
    """Braid of Fire's cumulative upkeep, "add {R}" (CostAddMana: nothing to
    choose once Forge has asked whether to pay). Paid: the Braid stays."""
    g, st = upkeep_game("add-mana", [("Mountain", 36), ("Braid of Fire", 24)], "Braid of Fire", True)
    found = {"asked": st["asked"], "stayed": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or st["after"] is None:
        return "inconclusive", "Braid of Fire's upkeep was never asked", found
    problems = [] if st["after"] else ["paid: Braid of Fire stays"]
    return outcome(problems, "Braid of Fire: its upkeep paid with {R}, and it stayed", found)


def minotaur(yes):
    """Karplusan Minotaur's cumulative upkeep, "flip a coin" (CostFlipCoin, a
    yes or no). Yes: it stays. No: it is sacrificed."""
    g, st = upkeep_game(f"flip-{'yes' if yes else 'no'}", [("Mountain", 36), ("Karplusan Minotaur", 24)],
                        "Karplusan Minotaur", yes)
    found = {"asked": st["asked"], "stayed": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or st["after"] is None:
        return "inconclusive", "Karplusan Minotaur's upkeep was never asked", found
    problems = []
    if st["asked"][0] != (1, "Flip one coin for Karplusan Minotaur?"):
        problems.append(f"the question says what it costs: {st['asked'][0]}")
    if st["after"] != yes:
        problems.append(f"{'flipped: it stays' if yes else 'declined: it is sacrificed'}, stayed={st['after']}")
    return outcome(problems, "Karplusan Minotaur: flipped, and it stayed" if yes
                   else "Karplusan Minotaur: declined, and it was sacrificed", found)


def herald():
    """Herald of Leshrac's cumulative upkeep: gain control of a land you
    don't control (CostGainControl -- Forge pays it at resolution through
    chooseCardsForCost). The LAST opponent's land offered becomes seat
    1's; the Herald stays."""
    def extra(g, f, st):
        if f.get("kind") == "chooseCardsForCost" and "gain control" in (f.get("prompt") or ""):
            st["extra"]["offered"] = sorted(card_of(o["actionId"]) for o in f["options"])
            st["extra"]["theirs"] = sorted(c["id"] for c in g.zone(1, "battlefield", owner=2) if c.get("kind") == "land")
            st["extra"]["picked"] = card_of(f["options"][-1]["actionId"])
            st["asked"].append((f["authorisedSeat"], f.get("prompt")))
            return f["options"][-1]["actionId"]
        return None
    # Seven mana: mostly Swamps, since the end-of-turn discard throws lands away.
    g, st = upkeep_game("gain-control", [("Swamp", 52), ("Herald of Leshrac", 8)], "Herald of Leshrac", True, extra)
    found = {"asked": st["asked"], "extra": st["extra"], "stayed": st["after"], "stopped": g.stopped_badly()}
    if not st["extra"] or st["after"] is None:
        return "inconclusive", "Herald of Leshrac's upkeep was never paid", found
    problems = []
    x = st["extra"]
    if x["offered"] != x["theirs"]:
        problems.append(f"offered {x['offered']}, not exactly the opponent's lands {x['theirs']}")
    if not any(c["id"] == x["picked"] for c in g.mine(1)):
        problems.append(f"{x['picked']} should now be seat 1's")
    if not st["after"]:
        problems.append("paid: the Herald stays")
    return outcome(problems, "Herald of Leshrac: the land picked became seat 1's, and the Herald stayed", found)


def golem():
    """Clay Golem, {6} and roll a d8: monstrosity X (CostRollDice, a yes or
    no). Yes: it becomes monstrous with 1 to 8 +1/+1 counters."""
    g = game("roll-dice", [("Plains", 40), ("Clay Golem", 20)], [("Forest", 60)])
    st = {"used": False, "asked": [], "golem": None, "after": None, "turn": None}

    def policy(g, f):
        k, seat = f.get("kind"), f["authorisedSeat"]
        if k == "confirmPayment" and "Roll" in (f.get("prompt") or ""):
            st["asked"].append((seat, f.get("prompt")))
            return "confirm:yes"
        if seat == 2 and k == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        if seat == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            land = g.play_land(f)
            if land:
                return land
            ready = [c for c in g.mine(1, name="Clay Golem") if not c.get("sick")]
            if not st["used"] and ready and len(g.untapped_lands(1)) >= 6:
                o = g.option(f, name="Clay Golem", zone="battlefield", contains="Monstrosity")
                if o:
                    st["used"], st["golem"], st["turn"] = True, ready[0]["id"], g.turn
                    return o
            return None if g.mine(1, name="Clay Golem") else cast(g, f, "Clay Golem")
        if k in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        if st["asked"] and stack_empty(g) and st["after"] is None:
            me = next((c for c in g.mine(1) if c["id"] == st["golem"]), {})
            st["after"] = {k["name"]: k["count"] for k in me.get("counters", []) or []}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=30)
    found = {"asked": st["asked"], "counters": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"] or st["after"] is None:
        return "inconclusive", "Clay Golem's die roll was never asked", found
    problems = []
    if st["asked"][0] != (1, "Roll one d8 for Clay Golem?"):
        problems.append(f"the question says what it costs: {st['asked'][0]}")
    if not 1 <= (st["after"].get("P1P1") or 0) <= 8:
        problems.append(f"monstrous: 1 to 8 +1/+1 counters, got {st['after']}")
    return outcome(problems, f"Clay Golem: rolled, and became monstrous with {st['after'].get('P1P1')} counters", found)


SCENARIOS = {"tap-two": tap_two, "crew": crew, "atoll-pay": lambda: atoll(True), "atoll-no": lambda: atoll(False),
             "chalice": chalice, "offspring-yes": lambda: offspring(True), "offspring-no": lambda: offspring(False),
             "gush": gush, "manamorphose": manamorphose, "charge": charge,
             "draw-yes": lambda: academy_wall(True), "draw-no": lambda: academy_wall(False),
             "exert-yes": lambda: steward(True), "exert-no": lambda: steward(False),
             "behold": behold, "evidence": evidence, "blight": blight,
             "salvo-yes": lambda: salvo(True), "salvo-no": lambda: salvo(False), "untap": signaler,
             "mill-yes": lambda: concoction(True), "mill-no": lambda: concoction(False), "forage": forage,
             "gain-life": invigorate, "to-library": leashling,
             "untap-type": fountain, "reduction": urza_filter,
             "gift-yes": lambda: gift(True), "gift-no": lambda: gift(False),
             "counter-yes": lambda: lamenter(True), "counter-no": lambda: lamenter(False), "counter-pick": fain,
             "from-exile": strangler, "unattach-yes": lambda: bola(True), "unattach-no": lambda: bola(False),
             "from-stack": nivmagus, "creature-type": caller,
             "add-mana": braid, "flip-yes": lambda: minotaur(True), "flip-no": lambda: minotaur(False),
             "gain-control": herald, "roll-dice": golem}

if __name__ == "__main__":
    codes = []
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        verdict_, message, found = scenario()
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_])
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:1200])
        sys.stdout.flush()
    sys.exit(1 if 1 in codes else max(codes, default=0))
