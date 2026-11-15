"""Spec 0086 -- player counts, the monarch and the initiative, dungeons,
emblems, turns starting and mana coming into the pool (Mechanics Lab,
Layer B).

    python -I scripts/check-players.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker. What it checks is read
from the snapshots both seats were sent -- a player's `counters`,
`designations`, `command`, `commandIds`, `manaPool` and `manaFrom`, the
`emblems` list, a stack entry's `from` and `source`, the `action` report
and whose turn it is -- never inferred:

  energy      Aether Hub (+1 energy), then Harnessed Lightning at Bob's
              Bears: +3, then 3 paid as it resolves; both seats see the
              counts, and the spell was on the stack as the energy went
              (F-0086-A)
  two-kinds   Servant of the Conduit enters with Ezuri out: 2 energy and an
              experience counter, both seats (F-0086-A)
  monarch     Bob's Thorn of the Black Rose makes him the monarch; Alice's
              Bears hit him and she becomes it; her end-step draw is a
              trigger `from` "monarch" (F-0086-B)
  initiative  Bob's White Plume Adventurer takes the initiative; Alice's
              Bears hit him and she takes it: the venture is a trigger
              `from` "initiative", and the Undercity is in her command
              zone (F-0086-B, F-0086-C)
  dungeon     Fates' Reversal three times: Alice ventures into Tomb of
              Annihilation, steps room to room (each room's trigger's source
              is the dungeon's id in `commandIds`), and completes it: Bob's
              report says so with the dungeon's map; Alice gets none
              (F-0086-C)
  emblem      Sorin, Lord of Innistrad's -2: the ability on the stack is
              Sorin's; then the emblem is in `emblems`, made by Sorin, in
              Alice's command zone, both seats (F-0086-D)
  extra-turn  Time Warp: the next turn is Alice's again, and its report
              ("Extra turn: this is Alice's turn again.", Time Warp's card)
              reaches Bob at its start, once, and Alice (who cast it) never
              (spec 0086 Amendment 4, owner 2026-11-15; spec 0088: it then stays
              until closed, through the next turn line); ordinary turns
              change hands with no such report (F-0086-E)
  mana        A Swamp's black floated, Dark Ritual paid from it and its
              three black, Hypnotic Specter paid from those: `manaFrom` says
              the Swamp, then Dark Ritual (n 3), both seats (F-0086-F)
  pool-lost   A black floated and kept: at the end of the step it is gone
              with no payment (Amendment 1's grey -N)

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
BEARS = [("Forest", 30), ("Grizzly Bears", 30)]


def game(name, seat1, seat2=BEARS, deal=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"players-{name}.jsonl")
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
                self.seen[seat][s.get("stateRevision")] = json.loads(json.dumps(s))

    def boards(self, seat):
        return list(self.seen[seat].values())


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def player(board, seat):
    return next((p for p in board.get("players") or [] if p.get("seat") == seat), {})


def counter(board, seat, name):
    for c in player(board, seat).get("counters") or []:
        if str(c.get("name")).upper() == name:
            return c.get("count")
    return 0


def pick(f, text):
    return next((o["actionId"] for o in f.get("options", []) if text in (o.get("label") or "")), None)


def cast(g, f, name):
    return g.option(f, name=name, zone="hand", land=False)


def stack_of(g, seat=1):
    return (g.state.get(seat) or {}).get("stack") or []


def changes(values):
    """[1, 1, 4, 4, 1] -> [1, 4, 1]: each value once per run."""
    out = []
    for v in values:
        if not out or out[-1] != v:
            out.append(v)
    return out


def attack_all(g, f, seat=1):
    attacking = {c["id"] for c in g.mine(seat) if c.get("attacking")}
    return next((o["actionId"] for o in f["options"] if o["actionId"].startswith("attacker:")
                 and card_of(o["actionId"]) not in attacking), None)


def pay_with(g, f, land):
    """A payment question answered with an untapped [land] (never a source that costs energy)."""
    ids = {c["id"] for c in g.mine(f["authorisedSeat"])
           if (c.get("name") == land if land else c.get("kind") == "land")}
    return next((o["actionId"] for o in f.get("options", []) if card_of(o["actionId"]) in ids), DEFAULT)


def caster(seat, names, until_n=None):
    """A seat that plays a land and casts the first of [names] it can, the stack empty."""
    def step(g, f):
        if f.get("kind") != "chooseSpellAbilityToPlay" or f["authorisedSeat"] != seat:
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        if stack_of(g, seat):
            return None
        for name in names:
            if until_n is not None and len(g.mine(seat, name=name)) >= until_n:
                continue
            o = cast(g, f, name)
            if o:
                return o
        return None
    return step


# --- energy -------------------------------------------------------------------------------------


def energy():
    st = {"cast": False}

    def policy(g, f):
        w.see()
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            return caster(2, ["Grizzly Bears"])(g, f)
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f, prefer="Aether Hub") if not g.mine(1, name="Aether Hub") else g.play_land(f)
            if land:
                return land
            if not st["cast"] and not stack_of(g) and g.zone(1, "battlefield", owner=2, name="Grizzly Bears") \
                    and len(g.untapped_lands(1)) >= 2:
                o = cast(g, f, "Harnessed Lightning")
                if o:
                    st["cast"] = True
                    return o
            return None
        if kind == "applyManaToCost":
            return pay_with(g, f, "Mountain")
        if kind == "chooseNumber":
            return pick(f, "3") if any(o.get("label") == "3" for o in f["options"]) else DEFAULT
        if kind == "chooseTargetsFor":
            bears = {c["id"] for c in g.zone(1, "battlefield", owner=2, name="Grizzly Bears")}
            return next((o["actionId"] for o in f["options"] if o.get("objectId") in bears), DEFAULT)
        return DEFAULT

    g = game("energy", [("Mountain", 24), ("Aether Hub", 12), ("Harnessed Lightning", 24)],
             deal={1: {"hand": ["Aether Hub", "Mountain", "Mountain", "Harnessed Lightning", "Harnessed Lightning",
                                "Mountain", "Mountain"]},
                   2: {"hand": ["Forest", "Forest", "Grizzly Bears", "Grizzly Bears", "Forest", "Forest", "Forest"]}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["cast"] and not stack_of(g)
                                   and bool(g.zone(2, "graveyard", owner=1, name="Harnessed Lightning")))[1],
          max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "cast": st["cast"]}
    if not st["cast"]:
        return "inconclusive", "Harnessed Lightning was never cast", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        boards = w.boards(seat)
        seq = changes([counter(b, 1, "ENERGY") for b in boards])
        found[f"energy seat {seat}"] = seq
        if seq[:2] != [0, 1] or seq[-1] != 1:
            problems.append(f"seat {seat}: Aether Hub's +1, then back to 1 after paying 3: {seq}")
        # The board where it went down from 4 (or from 1 after +3 unseen): the spell was there.
        paid = [i for i in range(1, len(boards)) if counter(boards[i], 1, "ENERGY") < counter(boards[i - 1], 1, "ENERGY")]
        if not paid:
            problems.append(f"seat {seat}: never saw the energy paid")
        else:
            before = boards[paid[0] - 1]
            names = [s.get("name") for s in before.get("stack") or []]
            found[f"stack as paid, seat {seat}"] = names
            if "Harnessed Lightning" not in names and "Harnessed Lightning" not in [
                    (before.get("casting") or [{}])[0].get("name") if before.get("casting") else None]:
                problems.append(f"seat {seat}: the energy was paid for Harnessed Lightning on the stack: {names}")
    if 4 not in found["energy seat 1"]:
        problems.append(f"Alice should see the 3 gained before paying (4): {found['energy seat 1']}")
    return result(problems, "energy +1, +3, -3 sent to both seats; paid while Harnessed Lightning was on the stack", found)


def two_kinds():
    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return DEFAULT
        if f.get("kind") == "applyManaToCost":
            return pay_with(g, f, None)
        ezuri = bool(g.mine(1, name="Ezuri, Claw of Progress"))
        if f.get("kind") == "chooseSpellAbilityToPlay" and not g.play_land(f)                 and len(g.untapped_lands(1)) < (2 if ezuri else 4):
            return None
        names = ["Servant of the Conduit"] if ezuri else ["Ezuri, Claw of Progress"]
        return caster(1, names, until_n=1)(g, f)

    # Ezuri is {2}{G}{U}.
    g = game("two-kinds", [("Forest", 12), ("Island", 12), ("Ezuri, Claw of Progress", 18),
                           ("Servant of the Conduit", 18)], [("Swamp", 60)],
             deal={1: {"hand": ["Forest", "Island", "Forest", "Ezuri, Claw of Progress", "Servant of the Conduit",
                                "Island", "Forest"], "top": ["Forest", "Island"] * 3}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), counter(g.state.get(2) or {}, 1, "EXPERIENCE") > 0
                                   and counter(g.state.get(2) or {}, 1, "ENERGY") > 0
                                   and not stack_of(g))[1], max_turn=12)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    if not any(g.mine(1, name=n) for n in ["Servant of the Conduit"]):
        return "inconclusive", "Servant of the Conduit never entered", found
    for seat in (1, 2):
        both = [b for b in w.boards(seat) if counter(b, 1, "ENERGY") == 2 and counter(b, 1, "EXPERIENCE") == 1]
        found[f"both kinds, seat {seat}"] = len(both)
        if not both:
            problems.append(f"seat {seat}: 2 energy and 1 experience together were never sent: "
                            f"{player(w.boards(seat)[-1], 1).get('counters')}")
    return result(problems, "2 energy and 1 experience, both seats", found)


# --- the monarch and the initiative -----------------------------------------------------------


def holder_changes(boards, name):
    return changes([next((p["seat"] for p in b.get("players") or [] if name in (p.get("designations") or [])), 0)
                    for b in boards])


def designated(boards, name):
    return [(s, b.get("turn"), b.get("phase")) for b in boards for s in b.get("stack") or [] if s.get("from") == name]


def monarch():
    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return caster(2, ["Thorn of the Black Rose"], until_n=1)(g, f)
        if f.get("kind") == "declareAttackers":
            monarch_now = "monarch" in (g.player(1, 2).get("designations") or [])
            return attack_all(g, f) if monarch_now else None
        return caster(1, ["Grizzly Bears"], until_n=2)(g, f)

    g = game("monarch", BEARS, [("Swamp", 30), ("Thorn of the Black Rose", 30)],
             deal={1: {"hand": ["Forest", "Forest", "Grizzly Bears", "Grizzly Bears", "Forest", "Forest", "Forest"]},
                   2: {"hand": ["Swamp", "Swamp", "Swamp", "Swamp", "Thorn of the Black Rose", "Swamp", "Swamp"]}})
    w = Watch(g)

    def until(g):
        w.see()
        return any(s.get("from") == "monarch" and s.get("controller") == 1 for s in stack_of(g, 2))

    g.run(policy, until=until, max_turn=16)
    for _ in range(1):
        w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        boards = w.boards(seat)
        holders = holder_changes(boards, "monarch")
        found[f"monarch, seat {seat}"] = holders
        draws = designated(boards, "monarch")
        found[f"monarch triggers, seat {seat}"] = draws[:4]
        if holders[-2:] != [2, 1]:
            return ("inconclusive" if seat == 1 and 1 not in holders else "wrong",
                    f"seat {seat}: the monarch should pass from Bob to Alice: {holders}", found)
        if not any(s for b in boards for s in b.get("stack") or []
                   if s.get("from") == "monarch" and s.get("controller") == 1 and b.get("phase") == "END_OF_TURN"):
            problems.append(f"seat {seat}: Alice's end-step draw should be a trigger from the monarch: {draws}")
    return result(problems, "the monarch passed from Bob to Alice for both seats; her end-step draw is the monarch's", found)


def initiative():
    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return caster(2, ["White Plume Adventurer"], until_n=1)(g, f)
        if f.get("kind") == "declareAttackers":
            theirs = "initiative" in (g.player(1, 2).get("designations") or [])
            return attack_all(g, f) if theirs else None
        return caster(1, ["Grizzly Bears"], until_n=2)(g, f)

    g = game("initiative", BEARS, [("Plains", 30), ("White Plume Adventurer", 30)],
             deal={1: {"hand": ["Forest", "Forest", "Grizzly Bears", "Grizzly Bears", "Forest", "Forest", "Forest"]},
                   2: {"hand": ["Plains", "Plains", "Plains", "White Plume Adventurer", "Plains", "Plains", "Plains"]}})
    w = Watch(g)

    def until(g):
        w.see()
        me = g.player(2, 1)
        return "initiative" in (me.get("designations") or []) and any("Undercity" in c for c in me.get("command") or []) \
            and not stack_of(g, 2)

    g.run(policy, until=until, max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        boards = w.boards(seat)
        holders = holder_changes(boards, "initiative")
        found[f"initiative, seat {seat}"] = holders
        if holders[-2:] != [2, 1]:
            return ("inconclusive" if 1 not in holders else "wrong",
                    f"seat {seat}: the initiative should pass from Bob to Alice: {holders}", found)
        ventures = [s for s in designated(boards, "initiative")]
        found[f"initiative triggers, seat {seat}"] = ventures[:4]
        if not any(s for b in boards for s in b.get("stack") or [] if s.get("from") == "initiative"
                   and s.get("controller") == 1):
            problems.append(f"seat {seat}: Alice's venture should be a trigger from the initiative")
        last = player(boards[-1], 1)
        ids, cmd = last.get("commandIds") or [], last.get("command") or []
        if len(ids) != len(cmd) or not all(i.startswith("card:") for i in ids):
            problems.append(f"seat {seat}: one id per command piece: {cmd} {ids}")
    return result(problems, "the initiative passed from Bob to Alice; her venture is the initiative's, both seats", found)


# --- the dungeon ---------------------------------------------------------------------------------


def dungeon():
    st = {"casts": 0}

    def policy(g, f):
        w.see()
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if not stack_of(g) and len(g.untapped_lands(1)) >= 2:
                o = cast(g, f, "Fates' Reversal")  # {1}{B}
                if o:
                    st["casts"] += 1
                    return o
            return None
        # Which dungeon, and which room next: Tomb of Annihilation, by Oubliette.
        for text in ("Tomb of Annihilation", "Oubliette"):
            o = pick(f, text)
            if o:
                return o
        return DEFAULT

    g = game("dungeon", [("Swamp", 30), ("Fates' Reversal", 30)], [("Island", 60)],
             deal={1: {"hand": ["Swamp", "Swamp", "Fates' Reversal", "Fates' Reversal", "Fates' Reversal",
                                "Swamp", "Swamp"], "top": ["Swamp", "Fates' Reversal"] * 4}})
    w = Watch(g)

    def until(g):
        w.see()
        return bool(g.player(2, 1).get("dungeonsCompleted")) and not stack_of(g)

    g.run(policy, until=until, max_turn=18)
    w.see()
    found = {"stopped": g.stopped_badly(), "casts": st["casts"],
             "completed": g.player(2, 1).get("dungeonsCompleted")}
    if not found["completed"]:
        return "inconclusive", "the dungeon was never completed", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        boards = w.boards(seat)
        rooms = changes([c for b in boards for c in (player(b, 1).get("command") or []) if "Tomb" in c])
        found[f"rooms, seat {seat}"] = rooms
        if len(rooms) < 3:
            problems.append(f"seat {seat}: the marker should step room by room: {rooms}")
        # Each room's trigger comes from the dungeon card in the command zone.
        room_sources = set()
        for b in boards:
            ids = set(player(b, 1).get("commandIds") or [])
            for s in b.get("stack") or []:
                if s.get("kind") == "trigger" and s.get("source") in ids:
                    room_sources.add(s.get("source"))
        found[f"room triggers from the dungeon, seat {seat}"] = sorted(room_sources)
        if not room_sources:
            problems.append(f"seat {seat}: a room's trigger should name the dungeon card in commandIds")
        reports = [b["action"] for b in boards if (b.get("action") or {}).get("marks")
                   and any(m.get("kind") == "dungeon" for m in b["action"]["marks"])]
        found[f"dungeon reports, seat {seat}"] = [r.get("said") for r in reports[:1]]
        if seat == 2:
            if not reports:
                problems.append("Bob was not told Alice completed the dungeon")
            elif reports[0].get("said") != "Alice completed Tomb of Annihilation." \
                    or reports[0]["marks"][0].get("dungeon") != "Tomb of Annihilation":
                problems.append(f"Bob's report: {reports[0]}")
        elif reports:
            problems.append(f"Alice completed it herself: no report for her, got {reports[0].get('said')}")
    return result(problems, "the dungeon stepped room by room, its rooms' triggers name its card; "
                            "completing it was told to Bob alone", found)


# --- the emblem ----------------------------------------------------------------------------------


def emblem():
    st = {"used": False, "sorin": None}

    def policy(g, f):
        w.see()
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g):
                return None
            sorin = g.mine(1, name="Sorin, Lord of Innistrad")
            if not sorin:
                return cast(g, f, "Sorin, Lord of Innistrad")
            st["sorin"] = sorin[0]["id"]
            if not st["used"]:
                o = next((o["actionId"] for o in f["options"] if card_of(o["actionId"]) == st["sorin"]
                          and "emblem" in (o.get("label") or "").lower()), None)
                if o:
                    st["used"] = True
                    return o
            return None
        return DEFAULT

    g = game("emblem", [("Plains", 15), ("Swamp", 15), ("Sorin, Lord of Innistrad", 30)], [("Island", 60)],
             deal={1: {"hand": ["Plains", "Swamp", "Plains", "Swamp", "Sorin, Lord of Innistrad",
                                "Sorin, Lord of Innistrad", "Plains"]}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["used"] and not stack_of(g)
                                   and bool((g.state.get(2) or {}).get("emblems")))[1], max_turn=12)
    w.see()
    found = {"stopped": g.stopped_badly(), "sorin": st["sorin"]}
    if not st["used"]:
        return "inconclusive", "Sorin's -2 was never used", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        boards = w.boards(seat)
        ability = [s for b in boards for s in b.get("stack") or [] if s.get("source") == st["sorin"]
                   and s.get("kind") == "ability"]
        if not ability:
            problems.append(f"seat {seat}: the -2 should be on the stack, from Sorin")
        last = boards[-1]
        emblems = last.get("emblems") or []
        found[f"emblems, seat {seat}"] = emblems
        mine = [e for e in emblems if e.get("seat") == 1 and e.get("from") == st["sorin"]
                and e.get("name") == "Sorin, Lord of Innistrad" and e.get("known") is True]
        if len(mine) != 1:
            problems.append(f"seat {seat}: one emblem of Alice's, made by Sorin: {emblems}")
        elif mine[0]["id"] not in (player(last, 1).get("commandIds") or []):
            problems.append(f"seat {seat}: the emblem's id is in Alice's command zone: "
                            f"{player(last, 1).get('commandIds')}")
        # Not on the board before the ability resolved.
        first = next((i for i, b in enumerate(boards) if b.get("emblems")), None)
        if first is not None and first > 0 and not any(s.get("source") == st["sorin"]
                                                       for s in boards[first - 1].get("stack") or []) \
                and not any(s.get("source") == st["sorin"] for b in boards[max(0, first - 3):first]
                            for s in b.get("stack") or []):
            problems.append(f"seat {seat}: the emblem should follow Sorin's ability on the stack")
    return result(problems, "Sorin's -2 on the stack from Sorin; the emblem sent with its maker, both seats", found)


# --- turns ---------------------------------------------------------------------------------------


def extra_turn():
    st = {"cast_turn": None}

    def policy(g, f):
        w.see()
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2 or kind != "chooseSpellAbilityToPlay":
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        if st["cast_turn"] is None and not stack_of(g) and len(g.untapped_lands(1)) >= 5:
            o = cast(g, f, "Time Warp")
            if o:
                st["cast_turn"] = g.turn
                return o
        return None

    g = game("extra-turn", [("Island", 30), ("Time Warp", 30)],
             deal={1: {"hand": ["Island"] * 5 + ["Time Warp"] * 2, "top": ["Island"] * 4}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["cast_turn"] is not None and g.turn >= st["cast_turn"] + 2)[1],
          max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly(), "cast on turn": st["cast_turn"]}
    if st["cast_turn"] is None:
        return "inconclusive", "Time Warp was never cast", found
    problems = [found["stopped"]] if found["stopped"] else []
    extra = st["cast_turn"] + 1
    for seat in (1, 2):
        boards = w.boards(seat)
        turns = changes([(b.get("turn"), b.get("activeSeat")) for b in boards if b.get("turn")])
        found[f"turns, seat {seat}"] = turns
        if (st["cast_turn"], 1) not in turns or (extra, 1) not in turns:
            problems.append(f"seat {seat}: turn {extra} should be Alice's again: {turns}")
        said = "Extra turn: this is Alice's turn again."
        reports = [b["action"] for b in boards if (b.get("action") or {}).get("said", "").startswith("Extra turn")]
        at = [b.get("turn") for b in boards if (b.get("action") or {}).get("said", "").startswith("Extra turn")]
        found[f"extra-turn reports, seat {seat}"] = sorted(set(at))
        # Spec 0086, Amendment 4 (owner 2026-11-15): whoever played the card
        # is not told -- Alice cast Time Warp, so only Bob gets the window
        # (anywhere in it: the newest or gathered).
        everywhere = [a for b in boards for a in [b.get("action") or {}, *((b.get("action") or {}).get("gathered") or [])]
                      if (a.get("said") or "").startswith("Extra turn")]
        if seat == 1:
            if everywhere:
                problems.append(f"seat 1 cast Time Warp and is told of its extra turn: {everywhere[:1]}")
            continue
        if not reports or reports[0].get("said") != said:
            problems.append(f"seat {seat}: the extra turn's report should say {said!r}: {reports[:1]}")
        # Spec 0088 (Q2 A): a report is no longer cleared at the turn line --
        # it stays until closed, so the one report, told at the extra turn's
        # start, may still be there on the turn after.
        elif min(at) != extra or len({r.get("key") for r in reports}) != 1:
            problems.append(f"seat {seat}: told once, from turn {extra}: turns {sorted(set(at))}, "
                            f"reports {sorted({r.get('key') for r in reports})}")
        elif [c.get("name") for c in reports[0].get("cards") or []] != ["Time Warp"]:
            problems.append(f"seat {seat}: the report shows Time Warp: {reports[0].get('cards')}")
    return result(problems, "Time Warp's extra turn is Alice's again, told at its start to Bob only (Amendment 4)",
                  found)


# --- mana -------------------------------------------------------------------------------------


def mana():
    st = {"floated": False, "ritual": False, "specter": False}

    def policy(g, f):
        w.see()
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2:
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            if len(g.mine(1, name="Swamp")) < 3:
                land = g.play_land(f)
                if land:
                    return land
                return None
            if stack_of(g):
                return None
            if not st["floated"]:
                o = next((o["actionId"] for o in f["options"] if "Add {B}" in (o.get("label") or "")), None)
                if o:
                    st["floated"] = True
                    return o
            if st["floated"] and not st["ritual"]:
                o = cast(g, f, "Dark Ritual")
                if o:
                    st["ritual"] = True
                    return o
            if st["ritual"] and not st["specter"] and (g.player(1, 1).get("manaPool") or {}).get("B", 0) >= 3:
                o = cast(g, f, "Hypnotic Specter")
                if o:
                    st["specter"] = True
                    return o
            return None
        if kind == "applyManaToCost":
            o = next((o["actionId"] for o in f.get("options", []) if o["actionId"].startswith("mana:pool:")), None)
            return o or DEFAULT
        return DEFAULT

    g = game("mana", [("Swamp", 30), ("Dark Ritual", 15), ("Hypnotic Specter", 15)], [("Island", 60)],
             deal={1: {"hand": ["Swamp", "Dark Ritual", "Hypnotic Specter", "Hypnotic Specter", "Swamp",
                                "Swamp", "Swamp"], "top": ["Swamp"] * 4}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["specter"] and not stack_of(g)
                                   and bool(g.zone(2, "battlefield", owner=1, name="Hypnotic Specter")))[1],
          max_turn=12)
    w.see()
    found = {"stopped": g.stopped_badly(), **st}
    if not st["specter"]:
        return "inconclusive", "never cast Hypnotic Specter from Dark Ritual's mana", found
    problems = [found["stopped"]] if found["stopped"] else []
    swamps = {c["id"] for c in g.mine(1, name="Swamp")}
    rituals = {c.get("source") or c.get("id") for b in w.boards(1) for z in ("stack", "graveyard")
               for c in b.get(z) or [] if c.get("name") == "Dark Ritual"}
    for seat in (1, 2):
        froms = changes([json.dumps(player(b, 1).get("manaFrom")) for b in w.boards(seat)
                         if player(b, 1).get("manaFrom")])
        runs = [json.loads(x) for x in froms]
        found[f"manaFrom, seat {seat}"] = runs
        swamp_run = [r for r in runs if len(r) == 1 and r[0].get("colour") == "B" and r[0].get("n") == 1
                     and r[0].get("from") in swamps]
        ritual_run = [r for r in runs if len(r) == 1 and r[0].get("colour") == "B" and r[0].get("n") == 3
                      and r[0].get("from") in rituals]
        if not swamp_run:
            problems.append(f"seat {seat}: the Swamp's black should come from the Swamp: {runs}")
        if not ritual_run:
            problems.append(f"seat {seat}: Dark Ritual's three should come from Dark Ritual ({rituals}): {runs}")
    return result(problems, "each floating mana names the card that made it (Swamp, Dark Ritual x3), both seats", found)


def pool_lost():
    st = {"floated_turn": None}

    def policy(g, f):
        w.see()
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 2 or kind != "chooseSpellAbilityToPlay":
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        if st["floated_turn"] is None and len(g.mine(1, name="Swamp")) >= 2 and not stack_of(g):
            o = next((o["actionId"] for o in f["options"] if "Add {B}" in (o.get("label") or "")), None)
            if o:
                st["floated_turn"] = g.turn
                return o
        return None

    g = game("pool-lost", [("Swamp", 60)], [("Island", 60)])
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["floated_turn"] is not None and g.turn > st["floated_turn"])[1],
          max_turn=10)
    w.see()
    found = {"stopped": g.stopped_badly(), "floated on turn": st["floated_turn"]}
    if st["floated_turn"] is None:
        return "inconclusive", "never floated a mana", found
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        boards = w.boards(seat)
        had = [i for i, b in enumerate(boards) if (player(b, 1).get("manaPool") or {}).get("B")]
        if not had:
            problems.append(f"seat {seat}: the floating black was never sent")
            continue
        after = boards[had[-1] + 1] if had[-1] + 1 < len(boards) else None
        found[f"after, seat {seat}"] = after and (after.get("phase"), player(after, 1).get("manaPool"))
        if after is None or player(after, 1).get("manaPool"):
            problems.append(f"seat {seat}: the pool should empty at the end of the step")
        elif any(p.get("seat") == 1 and p.get("n", 0) > max((q.get("n", 0) for q in boards[had[-1]].get("payments") or []),
                                                               default=0)
                 for p in after.get("payments") or []):
            problems.append(f"seat {seat}: nothing paid with it; it was lost")
    return result(problems, "the floating black was lost at the end of the step, with no payment, both seats", found)


SCENARIOS = {"energy": energy, "two-kinds": two_kinds, "monarch": monarch, "initiative": initiative,
             "dungeon": dungeon, "emblem": emblem, "extra-turn": extra_turn, "mana": mana, "pool-lost": pool_lost}

if __name__ == "__main__":
    worst = 0
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        result_, message, found = scenario()
        code = {"ok": 0, "inconclusive": 2, "wrong": 1}[result_]
        worst = max(worst, code) if worst != 1 else 1
        print(f"{name}: {result_.upper()}: {message}")
        if result_ != "ok":
            print("  " + json.dumps(found, default=str)[:1500])
        sys.stdout.flush()
    sys.exit(worst)
