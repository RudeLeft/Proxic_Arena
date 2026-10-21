"""State Forge keeps beyond the cards, shown to the players. P6-AO, §6.97.

    python -I scripts/check-tracked-state.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B), reading
the RESULT off the board -- the player's counters, designations and
command zone, and the card marks -- from both seats where it is public.

  marvel      Aetherworks Marvel: energy from Harnessed Lightning (the
              player chooses how much to pay: none); six paid to look
              at the top six and cast one without paying its mana cost
  ring        Call of the Ring: the Ring tempts its controller each
              upkeep (counted); the chosen Ring-bearer is marked, and
              "you may pay 2 life to draw" is the player's choice --
              taken once, declined once
  meren       Meren of Clan Nel Toth: a creature sacrificed gives an
              experience counter; at the end step a creature card with
              mana value <= experience comes back to the battlefield
  initiative  White Plume Adventurer: the initiative; the Undercity in
              the command zone with the room its marker is in, the
              next room chosen by the player (Lost Well: scry 2)

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
        trace = os.path.join(TRACES, f"tracked-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def seat2_bears(g, frame):
    if frame.get("kind") == "chooseSpellAbilityToPlay":
        return g.play_land(frame) or (g.option(frame, name="Grizzly Bears", zone="hand", land=False)
                                      if len(g.untapped_lands(2)) >= 2 else None)
    return DEFAULT


def cast(g, frame, name, contains=None):
    return g.option(frame, name=name, zone="hand", contains=contains, land=False)


def pick(frame, text):
    """The option whose label contains `text`."""
    return next((o["actionId"] for o in frame.get("options", []) if text in (o.get("label") or "")), None)


def discard_spare(frame, keep):
    """At hand size: the card with the most copies beyond what the scenario
    still needs (`keep`: name -> copies worth holding). Discarding the
    first card threw away exactly the cards scenarios were waiting for --
    every Harnessed Lightning in one game, every Llanowar Elves in another."""
    labels = [(o["actionId"], o.get("label") or "") for o in frame["options"]]
    names = [next((n for n in keep if label.startswith(n)), label) for _, label in labels]
    held = {n: names.count(n) for n in names}
    surplus = [(held[n] - keep.get(n, 0), i) for i, n in enumerate(names)]
    _, best = max(surplus, key=lambda s: (s[0], -s[1]))
    return labels[best][0]


def counter(g, seat, name, viewer=1):
    for c in g.player(viewer, seat).get("counters") or []:
        if c.get("name") == name:
            return c.get("count")
    return 0


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


# --- the scenarios ----------------------------------------------------------


def marvel():
    # Marvel-heavy: with 6 of 60 it was sometimes never drawn by turn 40
    # (energy piled up to 30, unused).
    g = game("marvel", [("Mountain", 22), ("Aetherworks Marvel", 10), ("Harnessed Lightning", 12),
                        ("Shivan Dragon", 16)])
    st = {"paid": [], "activated": None, "chosen": None, "mana_asked_after": 0, "offered": None}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if st["activated"] is None and g.mine(1, name="Aetherworks Marvel") and counter(g, 1, "ENERGY") >= 6:
                o = pick(f, "top six")
                if o:
                    st["activated"] = {"energy": counter(g, 1, "ENERGY"), "turn": g.turn,
                                       "library": g.player(1, 1).get("libraryCount")}
                    return o
            if not g.mine(1, name="Aetherworks Marvel"):
                o = cast(g, f, "Aetherworks Marvel")
                if o:
                    return o
            if st["activated"] is None and g.zone(1, "battlefield", owner=2, name="Grizzly Bears"):
                return cast(g, f, "Harnessed Lightning")
            return None
        if kind == "chooseCardsToDiscardToMaximumHandSize":
            # Lightning is the only energy; a Dragon in hand is never cast.
            have_marvel = bool(g.mine(1, name="Aetherworks Marvel"))
            return discard_spare(f, {"Harnessed Lightning": 4, "Mountain": 1,
                                     "Aetherworks Marvel": 0 if have_marvel else 1, "Shivan Dragon": 0})
        if kind == "chooseNumber":
            # "Pay any amount of {E}": none -- the player's choice, kept.
            st["paid"].append([o.get("label") for o in f["options"]])
            return pick(f, "0") if any(o.get("label") == "0" for o in f["options"]) else DEFAULT
        if kind == "chooseSingleEntityForEffect" and st["activated"] and st["chosen"] is None:
            st["offered"] = [o.get("label") for o in f["options"]]
            o = pick(f, "Shivan Dragon")
            if o:
                st["chosen"] = card_of(o)
                return o
            # No Dragon in this top six (about one game in eight): decline,
            # and activate again on a later turn with six more energy.
            st["activated"] = None
            st["offered"] = None
            return None
        if kind == "applyManaToCost" and st["chosen"] not in (None, "none"):
            st["mana_asked_after"] += 1
        return DEFAULT

    def until(g):
        # An activation that never showed its six cards (Forge undid it) is
        # tried again later, rather than waited on until the turn limit.
        a = st["activated"]
        if a and st["chosen"] is None and st["offered"] is None and g.turn > a["turn"] + 1:
            st["activated"] = None
        return st["chosen"] not in (None, "none") and not g.state.get(1, {}).get("stack") \
            and any(c["id"] == st["chosen"] for c in g.mine(1))

    # Room for a second activation when the first top six had no Dragon.
    g.run(policy, until=until, max_turn=60)
    a = st["activated"] or {}
    found = {"pay_choices": st["paid"][:3], "activated": a, "offered": st["offered"], "chosen": st["chosen"],
             "energy_after": counter(g, 1, "ENERGY"), "energy_seen_by_opponent": counter(g, 1, "ENERGY", viewer=2),
             "library_after": g.player(1, 1).get("libraryCount"),
             "on_battlefield": any(c["id"] == st["chosen"] for c in g.mine(1)),
             "mana_asked_after": st["mana_asked_after"], "stopped": g.stopped_badly()}
    if not a or st["chosen"] in (None, "none"):
        return "inconclusive", "never had six energy with a Shivan Dragon in the top six", found
    problems = [found["stopped"]] if found["stopped"] else []
    if not any("0" in labels for labels in st["paid"]):
        problems.append(f"'pay any amount of energy' should offer none: {st['paid'][:2]}")
    if found["energy_after"] != a["energy"] - 6:
        problems.append(f"six energy paid: {a['energy']} -> {found['energy_after']}")
    if found["energy_seen_by_opponent"] != found["energy_after"]:
        problems.append(f"energy is public: the opponent sees {found['energy_seen_by_opponent']}")
    if not found["on_battlefield"]:
        problems.append("the Dragon chosen from the top six did not reach the battlefield")
    if st["mana_asked_after"]:
        problems.append(f"cast without paying its mana cost, yet mana was asked for {st['mana_asked_after']} times")
    if found["library_after"] != a["library"] - 1:
        problems.append(f"one card leaves the library, five go to the bottom: {a['library']} -> {found['library_after']}")
    return result(problems, f"energy shown to both players ({a['energy']}); six paid; Shivan Dragon cast from "
                            f"the top six with no mana asked; the rest went back", found)


def ring():
    g = game("ring", [("Swamp", 24), ("Call of the Ring", 14), ("Walking Corpse", 22)])
    st = {"bearer_questions": [], "bearer": None, "pay": [], "tempted": []}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        prompt = f.get("prompt") or ""
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            # Two creatures FIRST: with one, Forge makes it the Ring-bearer
            # without asking (nothing to choose), and the check that the
            # player chooses had nothing to see (one run in 30).
            if len(g.mine(1, name="Walking Corpse")) < 2:
                return cast(g, f, "Walking Corpse")
            if not g.mine(1, name="Call of the Ring"):
                return cast(g, f, "Call of the Ring")
            return None
        if "Ring-bearer" in prompt:
            st["bearer_questions"].append([o.get("label") for o in f["options"]])
            # The LAST creature offered: not simply the default.
            o = f["options"][-1]["actionId"]
            st["bearer"] = card_of(o)
            return o
        if kind in ("confirmPayment", "confirmAction", "chooseBinary") and ("2 life" in prompt or any(
                "2 life" in (o.get("label") or "") for o in f["options"])):
            yes = len(st["pay"]) == 0
            st["pay"].append({"kind": kind, "prompt": prompt, "labels": [o.get("label") for o in f["options"]],
                              "yes": yes, "life": g.player(1, 1).get("life")})
            # One button, "Pay the cost"; declining is passing.
            return f["options"][0]["actionId"] if yes else None
        return DEFAULT

    def until(g):
        t = g.player(1, 1).get("ringTempted") or 0
        if not st["tempted"] or st["tempted"][-1][1] != t:
            st["tempted"].append((g.turn, t))
        return t >= 2 and len(st["pay"]) >= 2 and not g.state.get(1, {}).get("stack")

    # Room for a late Call of the Ring: it waits for two creatures, then
    # tempts only from the next upkeep.
    g.run(policy, until=until, max_turn=50)
    marked = [c["id"] for c in g.mine(1) if c.get("ringBearer")]
    marked_for_opponent = [c["id"] for c in g.zone(2, "battlefield", owner=1) if c.get("ringBearer")]
    me = g.player(1, 1)
    found = {"tempted": st["tempted"], "bearer": st["bearer"], "marked": marked,
             "marked_for_opponent": marked_for_opponent, "command": me.get("command"),
             "pay": st["pay"], "life_hand_now": (me.get("life"), me.get("handCount")),
             "bearer_questions": st["bearer_questions"][:3], "stopped": g.stopped_badly()}
    if (me.get("ringTempted") or 0) < 2 or len(st["pay"]) < 2:
        return "inconclusive", "the Ring never tempted twice with a creature to bear it", found
    problems = [found["stopped"]] if found["stopped"] else []
    counts = [t for _, t in st["tempted"] if t]
    if counts[:2] != [1, 2]:
        problems.append(f"each temptation should be counted, one at a time: {st['tempted']}")
    if not any(len(q) > 1 for q in st["bearer_questions"]):
        problems.append(f"the Ring-bearer should be the player's choice among creatures: {st['bearer_questions']}")
    if marked != [st["bearer"]]:
        problems.append(f"exactly the chosen creature should be marked Ring-bearer: chose {st['bearer']}, marked {marked}")
    if marked_for_opponent != marked:
        problems.append(f"the Ring-bearer is public: the opponent sees {marked_for_opponent}")
    if "The Ring" not in (me.get("command") or []):
        problems.append(f"the Ring should be in the command zone: {me.get('command')}")
    # Nothing else costs life here (seat 2 never attacks): 20, paid 2
    # once, declined once.
    if [p["life"] for p in st["pay"][:2]] != [20, 18] or me.get("life") != 18:
        problems.append(f"2 life paid once and not again: {[p['life'] for p in st['pay']]} -> {me.get('life')}")
    return result(problems, f"tempted {counts[:2]}; the chosen Ring-bearer marked for both players; "
                            f"paying 2 life to draw asked each time, taken then declined", found)


def meren():
    # Meren-heavy: with 8 of 60 it was once never drawn by the turn limit.
    g = game("meren", [("Swamp", 13), ("Forest", 13), ("Meren of Clan Nel Toth", 12), ("Llanowar Elves", 12),
                       ("Bone Splinters", 10)])
    st = {"splinters": False, "sacrificed": None, "experience_after": None, "meren_target": None,
          "asked": []}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f, prefer="Swamp" if not g.mine(1, name="Swamp") else "Forest")
            if land:
                return land
            if not g.mine(1, name="Meren of Clan Nel Toth"):
                o = cast(g, f, "Meren of Clan Nel Toth")
                if o:
                    return o
            if (g.mine(1, name="Meren of Clan Nel Toth") and g.mine(1, name="Llanowar Elves")
                    and g.zone(1, "battlefield", owner=2, name="Grizzly Bears") and not st["sacrificed"]
                    and g.untapped_lands(1, name="Swamp")):
                o = cast(g, f, "Bone Splinters")
                if o:
                    st["splinters"] = True
                    return o
            if not g.mine(1, name="Llanowar Elves"):
                return cast(g, f, "Llanowar Elves")
            return None
        if st["splinters"] and kind not in ("applyManaToCost", "confirmPayment"):
            st["asked"].append((kind, f.get("prompt"), [o.get("label") for o in f.get("options", [])][:6]))
        if kind == "chooseTargetsFor":
            if st["sacrificed"] and g.zone(1, "graveyard", owner=1, name="Llanowar Elves"):
                o = pick(f, "Llanowar Elves")
                if o:
                    st["meren_target"] = card_of(o)
                    return o
            o = pick(f, "Grizzly Bears")
            return o or DEFAULT
        if kind == "chooseCardsToDiscardToMaximumHandSize":
            have_meren = bool(g.mine(1, name="Meren of Clan Nel Toth"))
            return discard_spare(f, {"Llanowar Elves": 2, "Bone Splinters": 2,
                                     "Meren of Clan Nel Toth": 0 if have_meren else 1,
                                     "Swamp": 1, "Forest": 1})
        if kind == "CostSacrifice" and st["sacrificed"] is None and pick(f, "Llanowar Elves"):
            o = pick(f, "Llanowar Elves")
            st["sacrificed"] = card_of(o)
            return o
        return DEFAULT

    def until(g):
        if st["sacrificed"] and st["experience_after"] is None and counter(g, 1, "EXPERIENCE"):
            st["experience_after"] = counter(g, 1, "EXPERIENCE")
        return st["meren_target"] is not None and not g.state.get(1, {}).get("stack") and any(
            c.get("name") == "Llanowar Elves" for c in g.mine(1)) and not g.zone(1, "graveyard", owner=1,
                                                                                name="Llanowar Elves")

    g.run(policy, until=until, max_turn=40)
    found = {"sacrificed": st["sacrificed"], "experience": counter(g, 1, "EXPERIENCE"),
             "experience_seen_by_opponent": counter(g, 1, "EXPERIENCE", viewer=2),
             "meren_target": st["meren_target"],
             "elves_on_battlefield": [c["id"] for c in g.mine(1, name="Llanowar Elves")],
             "elves_in_graveyard": [c["id"] for c in g.zone(1, "graveyard", owner=1, name="Llanowar Elves")],
             "asked": st["asked"][:8], "stopped": g.stopped_badly()}
    if not st["sacrificed"] or not st["meren_target"]:
        return "inconclusive", "never sacrificed an Elf with Meren out and reached the end step", found
    problems = [found["stopped"]] if found["stopped"] else []
    if found["experience"] != 1:
        problems.append(f"one creature died: experience should be 1, is {found['experience']}")
    if found["experience_seen_by_opponent"] != found["experience"]:
        problems.append(f"experience is public: the opponent sees {found['experience_seen_by_opponent']}")
    if not found["elves_on_battlefield"] or found["elves_in_graveyard"]:
        problems.append("Llanowar Elves (mana value 1 <= 1 experience) should return to the battlefield")
    return result(problems, "an Elf sacrificed: one experience counter, shown to both players; at the end step "
                            "Meren returned it (mana value 1) to the battlefield", found)


def initiative():
    g = game("initiative", [("Plains", 30), ("White Plume Adventurer", 30)])
    st = {"rooms": [], "room_question": None, "scry": [], "searched": False}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if not g.mine(1, name="White Plume Adventurer"):
                return cast(g, f, "White Plume Adventurer")
            return None
        if kind == "chooseSingleSpellForEffect" and st["room_question"] is None:
            st["room_question"] = [o.get("label") for o in f["options"]]
            return pick(f, "Scry 2") or DEFAULT
        if kind in ("chooseEntitiesForEffect", "arrangeForScry", "willPutCardOnTop") and "croll" not in kind \
                and ("Scry" in (f.get("prompt") or "") or kind != "chooseEntitiesForEffect"):
            st["scry"].append((kind, f.get("prompt"), [o.get("label") for o in f["options"]]))
            return DEFAULT
        return DEFAULT

    def until(g):
        for cmd in g.player(1, 1).get("command") or []:
            if "Undercity" in cmd and (not st["rooms"] or st["rooms"][-1] != cmd):
                st["rooms"].append(cmd)
        return len(st["rooms"]) >= 2 and st["scry"] and not g.state.get(1, {}).get("stack")

    g.run(policy, until=until, max_turn=24)
    me, seen_by_2 = g.player(1, 1), g.player(2, 1)
    found = {"rooms": st["rooms"], "room_question": st["room_question"], "scry": st["scry"][:4],
             "designations": me.get("designations"), "opponent_sees": (seen_by_2.get("designations"),
                                                                       seen_by_2.get("command")),
             "stopped": g.stopped_badly()}
    if len(st["rooms"]) < 2:
        return "inconclusive", "never ventured twice", found
    problems = [found["stopped"]] if found["stopped"] else []
    if "initiative" not in (me.get("designations") or []):
        problems.append(f"seat 1 should have the initiative: {me.get('designations')}")
    if "initiative" not in (seen_by_2.get("designations") or []):
        problems.append(f"the initiative is public: the opponent sees {seen_by_2.get('designations')}")
    if st["rooms"][0] != "Undercity (room: Secret Entrance)":
        problems.append(f"taking the initiative ventures into the Undercity's first room: {st['rooms']}")
    if not st["room_question"] or len(st["room_question"]) != 2:
        problems.append(f"the next room should be the player's choice of two: {st['room_question']}")
    if "Lost Well" not in st["rooms"][-1]:
        problems.append(f"the room chosen (Lost Well) should be shown: {st['rooms']}")
    if not st["scry"]:
        problems.append("Lost Well's scry 2 was never asked")
    if seen_by_2.get("command") != me.get("command"):
        problems.append(f"the dungeon is public: the opponent sees {seen_by_2.get('command')}")
    return result(problems, f"the initiative and the dungeon shown to both players; rooms {st['rooms']}; "
                            f"the next room chosen by the player; Lost Well's scry asked", found)


SCENARIOS = {"marvel": marvel, "ring": ring, "meren": meren, "initiative": initiative}

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
            print("  " + json.dumps(found, default=str)[:1500])
        sys.stdout.flush()
    sys.exit(worst)
