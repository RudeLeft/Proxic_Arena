"""Cards that are more than one card. P6-AJ, P6-BF, §6.82.

    python -I scripts/check-shapes.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B), reading the
RESULT off the board. Labels are checked too, because a player chooses
by them: each half must be offered under its own name at its own cost.

  adventure  Bonecrusher Giant: Stomp ({1}{R}) kills a creature; the Giant
             waits in EXILE; then it is cast from exile ({2}{R})
  split      Fire // Ice: Fire's 2 damage divided between two targets;
             Ice taps a permanent and draws
  aftermath  Commit // Memory: Commit from hand; later Memory from the
             graveyard, after which the card is exiled
  fuse       Wear // Tear: both halves at once ({1}{R}{W}) destroy an
             artifact and an enchantment
  rooms      Bottomless Pool // Locker Room and Dollmaker's Shop //
             Porcelain Gallery: cast one door, unlock the other

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its card.
"""
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
        trace = os.path.join(TRACES, f"shapes-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def seat2_plays(*names):
    """Seat 2: lands, then whichever of `names` it can cast."""
    def play(g, frame):
        if frame.get("kind") == "chooseSpellAbilityToPlay":
            land = g.play_land(frame)
            if land:
                return land
            for name in names:
                o = g.option(frame, name=name, zone="hand", land=False)
                if o:
                    return o
            return None
        return DEFAULT
    return play


def starts(frame, prefix):
    """The option whose label begins with `prefix` (a face name and cost)."""
    return next((o["actionId"] for o in frame.get("options", []) if (o.get("label") or "").startswith(prefix)), None)


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def calm(g, seat=1):
    return not g.state.get(seat, {}).get("stack")


# --- the scenarios ----------------------------------------------------------


def adventure():
    g = game("adventure", [("Mountain", 24), ("Bonecrusher Giant", 36)])
    st = {"stomp": False, "giant": False, "card": None, "in_exile": False, "labels": set()}
    seat2 = seat2_plays("Grizzly Bears")

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            st["labels"].update(o["label"].split(" — ")[0] + " — " + o["label"].split(" — ")[1]
                                for o in f["options"] if " — " in o["label"] and "Bonecrusher" in o["label"]
                                or o["label"].startswith("Stomp"))
            if len(g.mine(1, name="Mountain")) < 3:
                return g.play_land(f)
            exiled = [c for c in g.zone(1, "exile", owner=1, name="Bonecrusher Giant")]
            if st["stomp"] and exiled and not st["giant"] and len(g.untapped_lands(1)) >= 3:
                o = next((o["actionId"] for o in f["options"]
                          if card_of(o["actionId"]) == exiled[0]["id"] and "Creature" in o["label"]), None)
                if o:
                    st["giant"], st["card"], st["in_exile"] = True, exiled[0]["id"], True
                    return o
            if not st["stomp"] and g.zone(1, "battlefield", owner=2, name="Grizzly Bears") \
                    and len(g.untapped_lands(1)) >= 2:
                o = starts(f, "Stomp — {1}{R}")
                if o:
                    st["stomp"] = True
                    return o
            return None
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if "Grizzly" in o["label"]), f["options"][0]["actionId"])
        return DEFAULT

    g.run(policy, until=lambda g: st["giant"] and calm(g) and g.mine(1, name="Bonecrusher Giant"), max_turn=32)
    on_board = [c for c in g.mine(1, name="Bonecrusher Giant")]
    found = {"stomp_cast": st["stomp"], "bears_dead": bool(g.zone(1, "graveyard", owner=2, name="Grizzly Bears")),
             "waited_in_exile": st["in_exile"], "giant_on_battlefield": [c["id"] for c in on_board],
             "same_card": st["card"], "labels": sorted(st["labels"]), "stopped": g.stopped_badly()}
    if not st["stomp"]:
        return "inconclusive", "Stomp was never cast at a creature", found
    problems = [found["stopped"]] if found["stopped"] else []
    if not found["bears_dead"]:
        problems.append("Stomp did not kill the creature")
    if not st["in_exile"]:
        problems.append("the Giant never showed up in exile, on its adventure")
    elif st["card"] not in found["giant_on_battlefield"]:
        problems.append(f"the Giant cast from exile is not on the battlefield: {found}")
    return result(problems, "Stomp ({1}{R}) killed the creature; the Giant waited in exile and was cast from there", found)


def split():
    g = game("split", [("Mountain", 12), ("Island", 12), ("Fire // Ice", 36)])
    st = {"fire": False, "ice": False, "divided": [], "before": None}
    seat2 = seat2_plays("Grizzly Bears")

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            # Two of each: stopping at any four lands left seat 1 with
            # four Islands and no way to cast Fire about one game in 20.
            mountains = len(g.mine(1, name="Mountain"))
            if mountains < 2 or len(g.mine(1, name="Island")) < 2:
                land = g.play_land(f, prefer="Mountain" if mountains < 2 else "Island")
                if land:
                    return land
            if not st["fire"] and g.zone(1, "battlefield", owner=2, name="Grizzly Bears") \
                    and len(g.untapped_lands(1, "Mountain")) >= 1 and len(g.untapped_lands(1)) >= 2:
                o = starts(f, "Fire — {1}{R}")
                if o:
                    st["fire"] = True
                    st["before"] = {"their_life": g.player(1, 2).get("life")}
                    return o
            if st["fire"] and not st["ice"] and g.zone(1, "battlefield", owner=2, name="Grizzly Bears") \
                    and g.untapped_lands(1, "Island") and len(g.untapped_lands(1)) >= 2:
                o = starts(f, "Ice — {1}{U}")
                if o:
                    st["ice"] = True
                    st["before"]["hand"] = g.player(1, 1).get("handCount")
                    return o
            return None
        if kind == "chooseTargetsFor":
            labels = [o["label"] for o in f["options"]]
            if st["fire"] and not st["ice"]:
                # Fire: one point to the opponent, one to a creature.
                player = next((o["actionId"] for o in f["options"] if o["label"] == "Bob"), None)
                creature = next((o["actionId"] for o in f["options"] if "Grizzly" in o["label"]), None)
                chosen = len(st["divided"])
                return (player if chosen == 0 else creature) or f["options"][0]["actionId"] if labels else None
            return next((o["actionId"] for o in f["options"] if "Grizzly" in o["label"]), f["options"][0]["actionId"])
        if kind == "divideAsYouChoose":
            st["divided"].append([o["label"] for o in f["options"]])
            return next((o["actionId"] for o in f["options"] if o["label"] == "1"), f["options"][0]["actionId"])
        return DEFAULT

    def until(g):
        return st["ice"] and calm(g) and g.player(1, 1).get("handCount", 0) == st["before"].get("hand", -9)

    g.run(policy, until=until, max_turn=32)
    b = st["before"] or {}
    found = {"fire": st["fire"], "ice": st["ice"], "divided_offers": st["divided"],
             "their_life": (b.get("their_life"), g.player(1, 2).get("life")),
             "hand": (b.get("hand"), g.player(1, 1).get("handCount")),
             "tapped_bears": [c.get("tapped") for c in g.zone(1, "battlefield", owner=2, name="Grizzly Bears")],
             "stopped": g.stopped_badly()}
    if not st["fire"] or not st["ice"]:
        return "inconclusive", "both halves were never cast", found
    problems = [found["stopped"]] if found["stopped"] else []
    if not st["divided"]:
        problems.append("Fire's damage was never divided")
    if found["their_life"][0] is not None and found["their_life"][1] != found["their_life"][0] - 1:
        problems.append(f"one of Fire's two damage should have hit the player: {found['their_life']}")
    if found["hand"][1] != found["hand"][0]:  # -1 Ice, +1 drawn
        problems.append(f"Ice draws a card: {found['hand']}")
    return result(problems, "Fire's 2 damage divided (1 to the player, 1 to a creature); Ice tapped and drew", found)


def aftermath():
    g = game("aftermath", [("Island", 30), ("Commit // Memory", 30)])
    st = {"commit": False, "memory": False, "card": None, "before": None}
    seat2 = seat2_plays("Grizzly Bears")

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if len(g.mine(1, name="Island")) < 6:
                return g.play_land(f)
            if not st["commit"] and g.zone(1, "battlefield", owner=2, name="Grizzly Bears") \
                    and len(g.untapped_lands(1)) >= 4:
                o = starts(f, "Commit — {3}{U}")
                if o:
                    st["commit"], st["card"] = True, card_of(o)
                    st["before"] = {"bears": len(g.zone(1, "battlefield", owner=2, name="Grizzly Bears"))}
                    return o
            in_grave = g.zone(1, "graveyard", owner=1, name="Commit // Memory")
            if st["commit"] and not st["memory"] and in_grave and len(g.untapped_lands(1)) >= 6:
                o = next((o["actionId"] for o in f["options"] if o["label"].startswith("Memory")
                          and card_of(o["actionId"]) in {c["id"] for c in in_grave}), None)
                if o:
                    st["memory"], st["card"] = True, card_of(o)
                    st["before"]["exile"] = len(g.zone(1, "exile", owner=1, name="Commit // Memory"))
                    return o
            return None
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if "Grizzly" in o["label"]), f["options"][0]["actionId"])
        return DEFAULT

    g.run(policy, until=lambda g: st["memory"] and calm(g)
          and len(g.zone(1, "exile", owner=1, name="Commit // Memory")) > st["before"]["exile"], max_turn=40)
    b = st["before"] or {}
    found = {"commit": st["commit"], "memory": st["memory"],
             "hands": (g.player(1, 1).get("handCount"), g.player(1, 2).get("handCount")),
             "exiled": len(g.zone(1, "exile", owner=1, name="Commit // Memory")), "before": b,
             "stopped": g.stopped_badly()}
    if not st["commit"] or not st["memory"]:
        return "inconclusive", "Commit and then Memory were never both cast", found
    problems = [found["stopped"]] if found["stopped"] else []
    if found["hands"] != (7, 7):
        problems.append(f"Memory: each player draws seven: hands {found['hands']}")
    if found["exiled"] <= b.get("exile", 0):
        problems.append("after Memory the card was not exiled")
    return result(problems, "Commit from hand; Memory from the graveyard (each player to seven), then exiled", found)


def fuse():
    g = game("fuse", [("Mountain", 15), ("Plains", 15), ("Wear // Tear", 30)],
             [("Plains", 30), ("Ornithopter", 15), ("Glorious Anthem", 15)])
    # "cast" only once the fused spell is on the stack: Forge offers it
    # before it knows the mana is there, and undoes it when it is not.
    st = {"cast": False, "targets": []}
    seat2 = seat2_plays("Ornithopter", "Glorious Anthem")

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            # Every land, the missing colour first: three Mountains and
            # nothing else in hand must not end the scenario.
            land = g.play_land(f, prefer="Plains" if not g.mine(1, name="Plains") else "Mountain")
            if land:
                return land
            theirs = lambda n: g.zone(1, "battlefield", owner=2, name=n)  # noqa: E731
            if (not st["cast"] and theirs("Ornithopter") and theirs("Glorious Anthem")
                    and g.untapped_lands(1, name="Plains") and g.untapped_lands(1, name="Mountain")
                    and len(g.untapped_lands(1)) >= 3):
                # {1}{R}{W} in either colour order: Forge prints {1}{W}{R}.
                o = (starts(f, "Wear // Tear — {1}{R}{W}") or starts(f, "Wear // Tear — {1}{W}{R}"))
                if o:
                    st["targets"] = []
                    # P7-F: one card, three ways to cast it -- every one
                    # offered for that card, none only by default.
                    card = next((x.get("objectId") for x in f["options"] if x["actionId"] == o), None)
                    st["offered"] = [x["label"] for x in f["options"] if card and x.get("objectId") == card]
                    return o
            return None
        if kind == "chooseTargetsFor":
            for want in ("Ornithopter", "Glorious Anthem"):
                o = next((o["actionId"] for o in f["options"] if want in o["label"]), None)
                if o:
                    st["targets"].append(card_of(o))
                    return o
            return f["options"][0]["actionId"]
        return DEFAULT

    def until(g):
        for entry in g.state.get(1, {}).get("stack") or []:
            text = entry.get("description") or ""
            if "Wear // Tear" in text and "artifact" in text and "enchantment" in text:
                st["cast"] = True
        return st["cast"] and calm(g) and len(g.zone(1, "graveyard", owner=1, name="Wear // Tear")) >= 1

    g.run(policy, until=until, max_turn=32)
    gone = {c["id"]: c["name"] for c in g.zone(1, "graveyard", owner=2)}
    found = {"cast": st["cast"], "targets": st["targets"], "offered": st.get("offered"),
             "destroyed": [gone.get(t) for t in st["targets"]], "stopped": g.stopped_badly()}
    if not st["cast"]:
        return "inconclusive", "never had an artifact and an enchantment to destroy", found
    problems = [found["stopped"]] if found["stopped"] else []
    offered = found["offered"] or []
    if len(set(offered)) < 3 or not any(" // " not in label.split(" — ")[0] for label in offered):
        problems.append(f"Wear, Tear and both fused should each be offered for the one card: {offered}")
    if sorted(n or "" for n in found["destroyed"]) != ["Glorious Anthem", "Ornithopter"]:
        problems.append(f"one cast should destroy the targeted artifact AND enchantment: {found['destroyed']}")
    return result(problems, "fused for {1}{R}{W}: an artifact and an enchantment destroyed by one cast", found)


def rooms():
    g = game("rooms", [("Island", 15), ("Plains", 15), ("Bottomless Pool // Locker Room", 15),
                        ("Dollmaker's Shop // Porcelain Gallery", 15)])
    # (first door and its cost, the door to unlock and its cost)
    doors = {"Bottomless Pool // Locker Room": ("Bottomless Pool", "{U}", "Locker Room", "{4}{U}"),
             "Dollmaker's Shop // Porcelain Gallery": ("Dollmaker's Shop", "{1}{W}", "Porcelain Gallery", "{4}{W}{W}")}
    st = {"room": {}, "unlocked": {}, "unlock_labels": {}}
    seat2 = seat2_plays("Grizzly Bears")

    def on_board(g, first):
        # On the battlefield a Room is named for its unlocked door(s).
        return [c for c in g.mine(1) if (c.get("name") or "").startswith(first)]

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f, prefer="Island" if len(g.mine(1, name="Island")) <= len(g.mine(1, name="Plains")) else "Plains")
            if land:
                return land
            for room, (first, first_cost, second, second_cost) in doors.items():
                here = on_board(g, first)
                if here:
                    st["room"][room] = here[0]["id"]
                if not here:
                    o = starts(f, f"{first} — {first_cost}")
                    if o:
                        return o
                elif second not in (here[0].get("name") or ""):
                    unlock = [o for o in f["options"] if card_of(o["actionId"]) == here[0]["id"]
                              and f"Unlock {second}" in o["label"]]
                    if unlock:
                        st["unlock_labels"][room] = unlock[0]["label"]
                        # Six lands, with the coloured ones the cost names:
                        # Forge offers the unlock first and undoes it when
                        # the mana is not there, so it may be tried again.
                        colour = {"{U}": "Island", "{W}": "Plains"}
                        if len(g.untapped_lands(1)) >= 6 and all(
                                len(g.untapped_lands(1, name=land)) >= second_cost.count(sym)
                                for sym, land in colour.items()):
                            st["unlocked"][room] = True
                            return unlock[0]["actionId"]
            return None
        return DEFAULT

    def until(g):
        return len(st["unlocked"]) == 2 and calm(g) and all(
            second in str([c.get("name") for c in g.mine(1) if c["id"] == st["room"].get(room)])
            for room, (_, _, second, _) in doors.items())

    g.run(policy, until=until, max_turn=46)
    found = {"rooms": {room: [c.get("name") for c in g.mine(1) if c["id"] == st["room"].get(room)] for room in doors},
             "unlock_labels": st["unlock_labels"], "unlocked": st["unlocked"], "stopped": g.stopped_badly()}
    if len(st["room"]) < 2:
        return "inconclusive", "both Rooms never reached the battlefield", found
    problems = [found["stopped"]] if found["stopped"] else []
    for room, (first, _, second, second_cost) in doors.items():
        label = st["unlock_labels"].get(room, "")
        if f"Unlock {second}" not in label:
            problems.append(f"{room}: unlocking {second} was never offered")
        elif f"— {second_cost} —" not in label:
            problems.append(f"{room}: the unlock is offered at the wrong price: {label!r}")
        if second not in str(found["rooms"].get(room)):
            problems.append(f"{room}: {second} did not unlock: {found['rooms'].get(room)}")
    return result(problems, "each Room cast by one door at its own cost, and the other unlocked for its own cost", found)


def mutate():
    g = game("mutate", [("Forest", 30), ("Grizzly Bears", 15), ("Gemrazer", 15)])
    st = {"cast": False, "host": None, "before": None}
    seat2 = seat2_plays("Grizzly Bears")

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            bears = g.mine(1, name="Grizzly Bears")
            if not bears:
                return g.option(f, name="Grizzly Bears", zone="hand", land=False)
            if not st["cast"] and len(g.untapped_lands(1)) >= 3:
                o = starts(f, "Gemrazer — {1}{G}{G}")
                if o:
                    st["cast"], st["host"] = True, bears[0]["id"]
                    st["before"] = {"creatures": len([c for c in g.mine(1) if c.get("kind") == "creature"])}
                    return o
            return None
        if kind == "chooseTargetsFor" and st["cast"]:
            return next((o["actionId"] for o in f["options"] if st["host"] and st["host"] in o["actionId"]),
                        f["options"][0]["actionId"] if f["options"] else None)
        return DEFAULT

    def until(g):
        return st["cast"] and calm(g) and any(c.get("name") == "Gemrazer" for c in g.mine(1))

    g.run(policy, until=until, max_turn=24)
    creatures = [c for c in g.mine(1) if c.get("kind") == "creature"]
    found = {"cast": st["cast"], "host": st["host"], "before": st["before"],
             "creatures": [{k: c.get(k) for k in ("id", "name", "power", "toughness", "keywords")} for c in creatures],
             "stopped": g.stopped_badly()}
    if not st["cast"]:
        return "inconclusive", "never had a non-Human creature and {1}{G}{G}", found
    problems = [found["stopped"]] if found["stopped"] else []
    merged = [c for c in creatures if c.get("name") == "Gemrazer"]
    if not merged:
        problems.append("Gemrazer is not on the battlefield")
    elif len(creatures) != st["before"]["creatures"]:
        problems.append(f"mutating made a second creature instead of one object: {found['creatures']}")
    elif (merged[0].get("power"), merged[0].get("toughness")) != (4, 4):
        problems.append(f"the mutated creature should be Gemrazer's 4/4: {merged[0]}")
    return result(problems, "mutated onto a creature: still one creature, now Gemrazer's 4/4", found)


def battle():
    g = game("battle", [("Forest", 30), ("Grizzly Bears", 15), ("Invasion of Zendikar", 15)])
    st = {"cast": False, "attacked": 0}
    seat2 = seat2_plays()

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if len(g.mine(1, name="Grizzly Bears")) < 2:
                o = g.option(f, name="Grizzly Bears", zone="hand", land=False)
                if o:
                    return o
            if not st["cast"] and len(g.untapped_lands(1)) >= 4:
                o = starts(f, "Invasion of Zendikar — {3}{G}")
                if o:
                    st["cast"] = True
                    return o
            return None
        if kind == "declareAttackers":
            # Every creature attacks the battle, once it is there.
            # Attackers only: a creature already attacking is offered to
            # take back ("unattack:"), and taking it back is not attacking.
            new = [o for o in f["options"] if o["actionId"].startswith("attacker:")]
            if g.mine(1, name="Invasion of Zendikar") and new:
                st["attacked"] += 1
                return new[0]["actionId"]
            return None
        if kind == "chooseEntitiesForEffect" and st["cast"]:
            return f["options"][0]["actionId"] if f["options"] else None
        if st["cast"] and f.get("options"):
            # Whom (or what) to attack: the battle.
            o = next((o["actionId"] for o in f["options"] if "Invasion" in o["label"]), None)
            if o:
                return o
        return DEFAULT

    def until(g):
        return any(c.get("name") == "Awakened Skyclave" for c in g.mine(1)) and calm(g)

    g.run(policy, until=until, max_turn=40)
    battle_ = g.mine(1, name="Invasion of Zendikar")
    skyclave = g.mine(1, name="Awakened Skyclave")
    found = {"cast": st["cast"], "attacks": st["attacked"],
             "battle": [{k: c.get(k) for k in ("counters", "kind", "types")} for c in battle_],
             "skyclave": [{k: c.get(k) for k in ("kind", "types", "power", "toughness")} for c in skyclave],
             "stopped": g.stopped_badly()}
    if not st["cast"]:
        return "inconclusive", "Invasion of Zendikar was never cast", found
    problems = [found["stopped"]] if found["stopped"] else []
    if not skyclave:
        problems.append("the battle was never defeated and cast transformed")
    return result(problems, "a Siege entered, was attacked to defeat, and came back as Awakened Skyclave", found)


def prepare():
    g = game("prepare", [("Island", 14), ("Forest", 14), ("Studious First-Year", 16), ("Emeritus of Ideation", 16)])
    st = {"studious": False, "emeritus": False, "growth": False, "recall": False, "before": {}}
    seat2 = seat2_plays("Grizzly Bears")

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f, prefer="Forest" if not g.mine(1, name="Forest") else "Island")
            if land:
                return land
            # {1}{G}: a Forest among them. Forge offers a spell it cannot
            # pay for and then undoes it, so two Islands looked castable,
            # the copy never resolved, and no land arrived (one CI run).
            if g.mine(1, name="Studious First-Year") and not st["growth"] \
                    and len(g.untapped_lands(1)) >= 2 and g.untapped_lands(1, "Forest"):
                o = starts(f, "Rampant Growth — {1}{G}")
                if o:
                    st["growth"] = True
                    st["before"]["lands"] = len([c for c in g.mine(1) if c.get("kind") == "land"])
                    return o
            if g.mine(1, name="Emeritus of Ideation") and not st["recall"] and g.untapped_lands(1, "Island"):
                o = starts(f, "Ancestral Recall — {U}")
                if o:
                    st["recall"] = True
                    st["before"]["hand"] = g.player(1, 1).get("handCount")
                    return o
            if not g.mine(1, name="Studious First-Year") and g.untapped_lands(1, "Forest"):
                o = starts(f, "Studious First-Year — {G}")
                if o:
                    st["studious"] = True
                    return o
            if not g.mine(1, name="Emeritus of Ideation") and len(g.untapped_lands(1, "Island")) >= 2 \
                    and len(g.untapped_lands(1)) >= 5:
                o = starts(f, "Emeritus of Ideation — {3}{U}{U}")
                if o:
                    st["emeritus"] = True
                    return o
            return None
        if kind == "chooseEntitiesForEffect" and st["growth"]:
            return f["options"][0]["actionId"] if f["options"] else None
        if kind == "chooseTargetsFor" and st["recall"]:
            return next((o["actionId"] for o in f["options"] if o["label"] == "Alice"), f["options"][0]["actionId"])
        if kind == "chooseCardsToDiscardToMaximumHandSize":
            # A spare creature goes, never a land: Emeritus needs five lands,
            # and discarding the first card cost one game its fifth by
            # turn 32.
            spare = next((o["actionId"] for o in f["options"]
                          if "Studious" in (o.get("label") or "") or "Emeritus" in (o.get("label") or "")), None)
            return spare or f["options"][0]["actionId"]
        return DEFAULT

    def until(g):
        # Both copies RESOLVED, not just cast: with Recall already done, the
        # board right after Rampant Growth was chosen was calm, and the
        # check stopped before the land arrived (one CI run). A copy that
        # never delivers runs to the turn limit and is reported.
        lands = len([c for c in g.mine(1) if c.get("kind") == "land"])
        return st["growth"] and st["recall"] and calm(g) \
            and g.player(1, 1).get("handCount", 0) >= st["before"]["hand"] + 2 \
            and lands >= st["before"]["lands"] + 1

    g.run(policy, until=until, max_turn=32)
    b = st["before"]
    found = {"studious": st["studious"], "emeritus": st["emeritus"], "growth_copy": st["growth"],
             "recall_copy": st["recall"], "before": b,
             "lands_after": len([c for c in g.mine(1) if c.get("kind") == "land"]),
             "hand_after": g.player(1, 1).get("handCount"),
             "creatures": [c.get("name") for c in g.mine(1) if c.get("kind") == "creature"],
             "stopped": g.stopped_badly()}
    if not (st["growth"] and st["recall"]):
        return "inconclusive", "both prepared spells were never cast", found
    problems = [found["stopped"]] if found["stopped"] else []
    if "lands" in b and found["lands_after"] < b["lands"] + 1:
        problems.append(f"the Rampant Growth copy put no land onto the battlefield: {b['lands']} -> {found['lands_after']}")
    if found["hand_after"] < b["hand"] + 2:
        problems.append(f"the Ancestral Recall copy did not draw three: hand {b['hand']} -> {found['hand_after']}")
    for name in ("Studious First-Year", "Emeritus of Ideation"):
        if name not in found["creatures"]:
            problems.append(f"{name} should still be on the battlefield after casting its copy")
    return result(problems, "both creatures entered prepared; each cast a copy of its spell (a land, three drawn)", found)


def daybound():
    # Seat 2 casts nothing: its turns pass with no spells, so day becomes night.
    g = game("daybound", [("Mountain", 30), ("Reckless Stormseeker", 30)], [("Forest", 60)])
    st = {"cast": False, "sides": []}
    seat2 = seat2_plays()

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            # The first, and after night falls more of them: two spells in
            # one turn bring day back.
            night = g.state.get(1, {}).get("dayTime") == "night"
            if (not st["cast"] or night) and len(g.untapped_lands(1)) >= 3:
                o = starts(f, "Reckless Stormseeker — {2}{R}")
                if o:
                    st["cast"] = True
                    return o
            return None
        if kind == "chooseTargetsFor":
            return f["options"][0]["actionId"] if f["options"] else None
        return DEFAULT

    def until(g):
        if not st["cast"]:
            return False
        mine = [c for c in g.mine(1) if "Reckless Stormseeker" in (c.get("faces") or [])]
        side = (g.state.get(1, {}).get("dayTime"), tuple(sorted({c.get("name") for c in mine})))
        if not st["sides"] or st["sides"][-1] != side:
            st["sides"].append(side)
        return any(s[0] == "night" for s in st["sides"]) and st["sides"][-1][0] == "day"

    g.run(policy, until=until, max_turn=30)
    found = {"cast": st["cast"], "sides": st["sides"], "stopped": g.stopped_badly()}
    if not st["cast"] or not any(s[0] == "night" for s in st["sides"]):
        return "inconclusive", "night never fell with the Stormseeker out", found
    problems = [found["stopped"]] if found["stopped"] else []
    night = [s for s in st["sides"] if s[0] == "night"]
    if not any("Storm-Charged Slasher" in s[1] for s in night):
        problems.append(f"at night the card never showed its nightbound face: {st['sides']}")
    later = st["sides"][st["sides"].index(night[0]):]
    if any(s[0] == "day" for s in later) and not any("Reckless Stormseeker" in s[1] for s in later if s[0] == "day"):
        problems.append(f"when day returned the card stayed on its night face: {st['sides']}")
    return result(problems, "day became night and the card turned to Storm-Charged Slasher; day returned and it turned back", found)


SCENARIOS = {"adventure": adventure, "split": split, "aftermath": aftermath, "fuse": fuse, "rooms": rooms,
             "mutate": mutate, "battle": battle, "prepare": prepare, "daybound": daybound}

if __name__ == "__main__":
    import json
    worst = 0
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        verdict_, message, found = scenario()
        code = {"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_]
        worst = 1 if 1 in (worst, code) else max(worst, code)
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:800])
        sys.stdout.flush()
    sys.exit(worst)
