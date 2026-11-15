"""Spec 0089 -- game end, the opening hand and mulligans, extra combat, umbra
saves and tokens many at once (Mechanics Lab, Layer B).

    python -I scripts/check-game-flow.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker. What it checks is read from
the snapshots BOTH seats were sent and the GAME_ENDED frame -- what the page
needs to play each moment, never inferred:

  bolt        F-0089-A: Alice's Lightning Bolts until Bob is dead. Both seats
              were sent the board the Bolt killed him on: his life at 0 or
              less, and that round's `life` holds the Bolt's 3 to him (the
              hit the page lands before the banner); then GAME_ENDED, Alice
              the winner, lossReason LifeReachedZero
  poison      F-0089-A: Glistener Elves until Bob has 10 poison: both seats
              were sent the board with his 10 (the badge's tenth notch) and
              that round's poison change; Poisoned; his life never moved
  concede     F-0089-A: Bob concedes in his first main phase: GAME_ENDED
              names him (concededSeat 2), Alice the winner, and no board
              before it changed anyone's life (no hit to play)
  mulligan    F-0089-B: Alice mulligans once and puts one card on the
              bottom. Both seats were told, in order: 7 library -> hand (the
              deal), 7 hand -> library "shuffled" with her library shuffled
              (the riffle) and 7 library -> hand (dealt again) in one round,
              then 1 hand -> library "bottom". Bob was told every move with
              no card in it, never a name or an id of her hand; Alice keeps 6
  aurelia     F-0089-C: Aurelia, the Warleader attacks: when the second
              combat begins Bob gets a report -- "Extra combat: Alice attacks
              again." -- with Aurelia's picture, once; Alice, who played the
              card, gets none (Amendment 1, owner 2026-11-15)
  relentless  F-0089-C: Raging Goblin attacks, then Relentless Assault in the
              second main phase: the same report at the extra combat, with
              Relentless Assault (in Alice's graveyard)
  umbra       F-0089-D: Alice's Grizzly Bears wear Hyena Umbra (a second Bears
              beside them, Bob's Savannah Lions); Bob's Wrath of God: both
              seats were told survived {Bears, "umbra", by the Umbra}, those
              Bears still there (the others and the Lions gone), the Umbra ->
              graveyard (destroyed); Bob's report "Hyena Umbra was destroyed
              instead of Alice's Grizzly Bears." with the Umbra's picture;
              Alice is told nothing
  krenko      F-0089-E: Krenko, Mob Boss doubling: an activation that makes
              more than 8 Goblins at once -- both seats told every one in the
              same round (nowhere -> battlefield, each its own new id on the
              table): the page plays them in waves of 8
  scute       F-0089-E: Scute Swarm with six lands: each landfall trigger
              copies Scute Swarm. Forge resolves each Scute's trigger on its
              own: both seats are told each copy; the most made in one round
              is recorded (as many as one trigger makes)

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its point.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, HOLD, Game, card_of  # noqa: E402

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
        trace = os.path.join(TRACES, f"flow-{name}.jsonl")
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

    def listed(self, seat, key):
        return [e for s in self.boards(seat) for e in (s.get(key) or [])]

    def actions(self, seat):
        out = []
        for s in self.boards(seat):
            a = s.get("action")
            if not a:
                continue
            for one in [*(a.get("gathered") or []), a]:
                one = {k: v for k, v in one.items() if k != "gathered"}
                if one not in out:
                    out.append(one)
        return out


def player(board, seat):
    return next((p for p in board.get("players", []) if p.get("seat") == seat), {})


def poison(p):
    return next((c.get("count", 0) for c in p.get("counters") or [] if (c.get("name") or "").upper() == "POISON"), 0)


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def stack_of(g, seat):
    return (g.state.get(seat) or {}).get("stack") or []


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


def attack_all(g, f):
    """Every attacker not yet declared, one at a time; then done."""
    attacking = {c["id"] for c in g.mine(1) if c.get("attacking")}
    return next((o["actionId"] for o in f["options"] if o["actionId"].startswith("attacker:")
                 and card_of(o["actionId"]) not in attacking), None)


def ended(g):
    e = g.ended or {}
    return {k: e.get(k) for k in ("outcome", "winningSeat", "concededSeat", "lossReason")}


# --- F-0089-A ---------------------------------------------------------------------------------

def bolt():
    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat != 1 or stack_of(g, 1):
                return None
            return named(g, f, "Lightning Bolt")
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if o.get("objectId") == "player:2"), DEFAULT)
        return DEFAULT

    g = game("bolt", [("Mountain", 24), ("Lightning Bolt", 36)], [("Island", 60)],
             deal={1: {"hand": ["Mountain", "Lightning Bolt", "Lightning Bolt", "Lightning Bolt", "Lightning Bolt",
                                "Lightning Bolt", "Lightning Bolt"],
                       "top": ["Mountain", "Lightning Bolt", "Mountain", "Lightning Bolt", "Mountain"]}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), False)[1], max_turn=30)
    w.see()
    found = {"ended": ended(g), "stopped": g.stopped_badly()}
    if not g.ended:
        return "inconclusive", "Bob never died", found
    problems = [found["stopped"]] if found["stopped"] else []
    if found["ended"] != {"outcome": "WINNER", "winningSeat": 1, "concededSeat": None,
                          "lossReason": "LifeReachedZero"}:
        problems.append(f"Alice wins, Bob's life reached zero: {found['ended']}")
    for seat in (1, 2):
        last = w.boards(seat)[-1]
        bob = player(last, 2)
        found[f"last{seat}"] = {"life": bob.get("life"), "changes": (last.get("life") or {}).get("changes")}
        if (bob.get("life") or 1) > 0:
            problems.append(f"seat {seat}: the last board shows Bob dead (life <= 0): {bob.get('life')}")
        blow = [c for c in (last.get("life") or {}).get("changes") or [] if c.get("player") == 2]
        if not blow or blow[-1].get("kind") != "damage" or blow[-1].get("amount") != 3:
            problems.append(f"seat {seat}: the last board's round holds the Bolt's 3 to Bob: {blow}")
    return result(problems, "lethal Bolt: both seats sent the killing board (life <= 0, the Bolt's 3 in its "
                            "round), then GAME_ENDED LifeReachedZero", found)


def poison_():
    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "declareAttackers" and seat == 1:
            return attack_all(g, f)
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat != 1 or stack_of(g, 1):
                return None
            return named(g, f, "Glistener Elf")
        return DEFAULT

    g = game("poison", [("Forest", 30), ("Glistener Elf", 30)], [("Island", 60)],
             deal={1: {"hand": ["Forest", "Glistener Elf", "Glistener Elf", "Glistener Elf", "Glistener Elf", "Forest",
                                "Forest"],
                       "top": ["Forest", "Glistener Elf", "Glistener Elf", "Forest"]}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), False)[1], max_turn=30)
    w.see()
    found = {"ended": ended(g), "stopped": g.stopped_badly()}
    if not g.ended:
        return "inconclusive", "Bob never reached 10 poison", found
    problems = [found["stopped"]] if found["stopped"] else []
    if found["ended"] != {"outcome": "WINNER", "winningSeat": 1, "concededSeat": None, "lossReason": "Poisoned"}:
        problems.append(f"Alice wins, Bob poisoned: {found['ended']}")
    for seat in (1, 2):
        last = w.boards(seat)[-1]
        bob = player(last, 2)
        found[f"last{seat}"] = {"poison": poison(bob), "life": bob.get("life"),
                                "changes": (last.get("life") or {}).get("changes")}
        if poison(bob) < 10:
            problems.append(f"seat {seat}: the last board shows Bob's tenth poison counter: {poison(bob)}")
        if bob.get("life") != 20:
            problems.append(f"seat {seat}: Bob's life stays 20: {bob.get('life')}")
        blow = [c for c in (last.get("life") or {}).get("changes") or [] if c.get("player") == 2]
        if not blow or blow[-1].get("kind") != "poison":
            problems.append(f"seat {seat}: the last board's round holds the poison that killed him: {blow}")
    return result(problems, "tenth poison counter: both seats sent the board with 10 and the round's poison, then "
                            "GAME_ENDED Poisoned", found)


def concede():
    st = {"sent": False}

    def policy(g, f):
        if st["sent"]:
            return HOLD
        if f.get("kind") == "chooseSpellAbilityToPlay" and f["authorisedSeat"] == 2 and g.turn >= 2:
            g.concede(2)
            st["sent"] = True
            return HOLD
        if f.get("kind") == "chooseSpellAbilityToPlay":
            return g.play_land(f)
        return DEFAULT

    g = game("concede", [("Mountain", 60)], [("Island", 60)])
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), False)[1], max_turn=6)
    w.see()
    found = {"ended": ended(g), "sent": st["sent"], "stopped": g.stopped_badly()}
    if not st["sent"] or not g.ended:
        return "inconclusive", "Bob never conceded", found
    problems = [found["stopped"]] if found["stopped"] else []
    if found["ended"].get("winningSeat") != 1 or found["ended"].get("concededSeat") != 2:
        problems.append(f"Alice wins, Bob conceded: {found['ended']}")
    for seat in (1, 2):
        changed = [c for s in w.boards(seat) for c in ((s.get("life") or {}).get("changes") or [])]
        lives = [player(w.boards(seat)[-1], p).get("life") for p in (1, 2)]
        if changed or lives != [20, 20]:
            problems.append(f"seat {seat}: nobody's life changed (no hit to play): {changed} {lives}")
    return result(problems, "a concession: GAME_ENDED names Bob, no life changed", found)


# --- F-0089-B ---------------------------------------------------------------------------------

def mulligan():
    st = {"mulliganed": False, "kept": False, "tucked": None}

    def policy(g, f):
        kind = f.get("kind")
        if kind == "mulliganKeepHand" and f["authorisedSeat"] == 1:
            if not st["mulliganed"]:
                st["mulliganed"] = True
                return "mulligan:again"
            st["kept"] = True
            return "mulligan:keep"
        if kind == "tuckCardsViaMulligan":
            pick = f["options"][-1]["actionId"]
            st["tucked"] = card_of(pick)
            return pick
        return DEFAULT

    deck = [("Island", 24), ("Grizzly Bears", 18), ("Lightning Bolt", 18)]
    g = game("mulligan", deck, deck)
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), False)[1] or (st["kept"] and g.turn >= 1), max_turn=2)
    w.see()
    found = {"tucked": st["tucked"], "kept": st["kept"], "stopped": g.stopped_badly()}
    if not st["kept"] or not st["tucked"]:
        return "inconclusive", "Alice never mulliganed, put back and kept", found
    problems = [found["stopped"]] if found["stopped"] else []
    alice_hands = set()
    for s in w.boards(1):
        alice_hands.update(c["id"] for c in s.get("hand") or [])
    told = {}
    for seat in (1, 2):
        rounds = []
        for s in w.boards(seat):
            mine = [m for m in s.get("moves") or [] if 1 in (m["from"].get("seat"), m["to"].get("seat"))
                    and "hand" in (m["from"]["zone"], m["to"]["zone"])]
            if mine:
                rounds.append({"moves": mine, "shuffles": s.get("shuffles")})
        told[seat] = rounds
        shape = [[(m["from"]["zone"], m["to"]["zone"], m.get("where")) for m in r["moves"]] for r in rounds]
        found[f"rounds{seat}"] = [[f"{a}->{b}{':' + c if c else ''}" for a, b, c in r] for r in shape]
        deal = ("library", "hand", None)
        want = [[deal] * 7, [("hand", "library", "shuffled")] * 7 + [deal] * 7, [("hand", "library", "bottom")]]
        if shape[:3] != want:
            problems.append(f"seat {seat}: dealt 7, swept back 7 shuffled and dealt 7, 1 to the bottom: "
                            f"{found[f'rounds{seat}'][:3]}")
        if len(rounds) > 1 and 1 not in (rounds[1]["shuffles"] or []):
            problems.append(f"seat {seat}: the mulligan's round says her library was shuffled: {rounds[1]['shuffles']}")
        last = w.boards(seat)[-1]
        if player(last, 1).get("handCount") != 6:
            problems.append(f"seat {seat}: Alice keeps 6: {player(last, 1).get('handCount')}")
    # Bob sees backs only: no card in any of her hand's moves, no id of her hand anywhere.
    for r in told[2]:
        for m in r["moves"]:
            if m.get("card") or m.get("name"):
                problems.append(f"Bob was told which card moved: {m}")
    for s in w.boards(2):
        text = json.dumps(s)
        leaked = [cid for cid in alice_hands if f'"{cid}"' in text]
        if leaked:
            problems.append(f"Bob's board names a card of Alice's hand: {leaked[:3]}")
            break
        if s.get("otherHands"):
            problems.append(f"Bob is shown Alice's hand: {s['otherHands']}")
            break
    return result(problems, "a mulligan: dealt, swept back (shuffled) and dealt again in one round, one to the "
                            "bottom; Bob told every move as a back", found)


# --- F-0089-C ---------------------------------------------------------------------------------

def extra(name, deck, deal, card, cast_main2=None):
    st = {"attacks": 0, "cast": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "declareAttackers" and seat == 1:
            return attack_all(g, f)
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat != 1 or stack_of(g, 1):
                return None
            phase = (g.state.get(1) or {}).get("phase")
            if cast_main2 and phase == "MAIN2" and not st["cast"] and g.mine(1, name="Raging Goblin"):
                o = named(g, f, cast_main2)
                st["cast"] = bool(o)
                return o
            for creature in ("Aurelia, the Warleader", "Raging Goblin"):
                if creature in [c for c, *_ in deck] and not g.mine(1, name=creature):
                    o = named(g, f, creature)
                    if o:
                        return o
            return None
        return DEFAULT

    g = game(name, deck, [("Island", 60)], deal={1: deal})
    w = Watch(g)

    def second_combat(seat):
        """The board a combat begins on, after one already this turn (the game's own phases), or None."""
        seen = {}
        for s in w.boards(seat):
            if s.get("phase") != "COMBAT_BEGIN":
                if (s.get("phase") or "").startswith("COMBAT_") or s.get("phase") == "MAIN2":
                    seen.setdefault(s.get("turn"), "combat")
                continue
            if seen.get(s.get("turn")) == "combat":
                return s
        return None

    def until(g):
        w.see()
        # Reached: both seats' boards show the second combat beginning, and a
        # few boards after it (the report comes with its first board).
        return all(second_combat(s) is not None and len(w.boards(s)) > w.boards(s).index(second_combat(s)) + 2
                   for s in (1, 2))

    g.run(policy, until=until, max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat, words in ((1, None), (2, "Extra combat: Alice attacks again.")):
        # One report (by its key), however many boards carry it.
        told = list({a.get("key"): a for a in w.actions(seat)
                     if (a.get("said") or "").startswith("Extra combat")}.values())
        found[f"reports{seat}"] = told
        if second_combat(seat) is None:
            return "inconclusive", f"seat {seat} never reached the extra combat", found
        # Amendment 1 (owner 2026-11-15): Alice played the card; she is not told.
        if words is None:
            if told:
                problems.append(f"seat {seat} played the card and is told of its extra combat: {told[:1]}")
            continue
        if not told:
            problems.append(f"seat {seat}: a second combat began this turn and nobody said so")
            continue
        a = told[0]
        if len(told) != 1:
            problems.append(f"seat {seat}: told once: {told}")
        if a.get("said") != words:
            problems.append(f"seat {seat}: says {words!r}: {a.get('said')!r}")
        if a.get("source") != card or a.get("by") != 1:
            problems.append(f"seat {seat}: Alice's, by {card}: {a.get('by')} {a.get('source')}")
        cards = a.get("cards") or []
        if not cards or cards[0].get("name") != card:
            problems.append(f"seat {seat}: with {card}'s picture: {cards}")
        # Told as the extra combat begins: the board it first came on is in combat, after a first one.
        first = next(s for s in w.boards(seat) if s.get("action") and (s["action"].get("said") or "").startswith("Extra"))
        found[f"phase{seat}"] = first.get("phase")
        if not (first.get("phase") or "").startswith("COMBAT"):
            problems.append(f"seat {seat}: told when the extra combat begins: {first.get('phase')}")
    return result(problems, f"{card}: an extra combat, told at its start to Bob only (Amendment 1), with the card",
                  found)


def aurelia():
    return extra("aurelia", [("Mountain", 15), ("Plains", 15), ("Aurelia, the Warleader", 30)],
                 {"hand": ["Mountain", "Plains", "Mountain", "Plains", "Mountain", "Plains", "Aurelia, the Warleader"],
                  "top": ["Mountain", "Plains"] * 4}, "Aurelia, the Warleader")


def relentless():
    return extra("relentless", [("Mountain", 24), ("Raging Goblin", 18), ("Relentless Assault", 18)],
                 {"hand": ["Mountain", "Mountain", "Raging Goblin", "Mountain", "Mountain", "Relentless Assault",
                           "Raging Goblin"], "top": ["Mountain"] * 6},
                 "Relentless Assault", cast_main2="Relentless Assault")


# --- F-0089-D ---------------------------------------------------------------------------------

def umbra():
    st = {"wrath": False, "umbra": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if stack_of(g, seat):
                return None
            if seat == 1:
                # Two Bears (one to wear the Umbra, one for the wipe to take).
                if len(g.mine(1, name="Grizzly Bears")) < 2:
                    o = named(g, f, "Grizzly Bears")
                    if o or not g.mine(1, name="Grizzly Bears"):
                        return o
                if not st["umbra"]:
                    o = named(g, f, "Hyena Umbra")
                    st["umbra"] = bool(o)
                    return o
                return None
            if not g.mine(2, name="Savannah Lions"):
                return named(g, f, "Savannah Lions")
            if not st["wrath"] and st["umbra"] and g.zone(2, "battlefield", name="Hyena Umbra") \
                    and len(g.untapped_lands(2)) >= 4:
                o = named(g, f, "Wrath of God")
                st["wrath"] = bool(o)
                return o
            return None
        if kind == "chooseTargetsFor" and seat == 1:
            bears = g.mine(1, name="Grizzly Bears")
            return next((o["actionId"] for o in f["options"] if bears and o.get("objectId") == bears[0]["id"]), DEFAULT)
        return DEFAULT

    g = game("umbra", [("Forest", 12), ("Plains", 12), ("Grizzly Bears", 18), ("Hyena Umbra", 18)],
             [("Plains", 30), ("Savannah Lions", 10), ("Wrath of God", 20)],
             deal={1: {"hand": ["Forest", "Plains", "Grizzly Bears", "Hyena Umbra", "Forest", "Grizzly Bears",
                                "Hyena Umbra"], "top": ["Plains", "Forest"] * 3},
                   2: {"hand": ["Plains"] * 4 + ["Savannah Lions", "Wrath of God", "Wrath of God"],
                       "top": ["Plains"] * 6}})
    w = Watch(g)

    def resolved(seat):
        """The Wrath has resolved: it lies in Bob's graveyard (the game's own board)."""
        return any(c.get("name") == "Wrath of God" for s in w.boards(seat) for c in s.get("graveyard") or [])

    def until(g):
        w.see()
        return all(resolved(s) for s in (1, 2)) and all(not stack_of(g, s) for s in (1, 2))

    g.run(policy, until=until, max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly(), "wrath": st["wrath"]}
    problems = [found["stopped"]] if found["stopped"] else []
    for seat in (1, 2):
        surv = [x for x in w.listed(seat, "survived") if x.get("how") == "umbra"]
        found[f"survived{seat}"] = surv
        if not resolved(seat):
            return "inconclusive", f"seat {seat} never saw the Wrath resolve (cast {st['wrath']})", found
        if not surv:
            problems.append(f"seat {seat}: the Wrath resolved and no umbra was told destroyed instead")
            continue
        last = w.boards(seat)[-1].get("battlefield") or []
        bears = [c["id"] for c in last if c.get("name") == "Grizzly Bears"]
        umbras = [c["id"] for s in w.boards(seat) for c in s.get("battlefield") or [] if c.get("name") == "Hyena Umbra"]
        if not bears or surv[0].get("card") != bears[-1]:
            problems.append(f"seat {seat}: the survivor is the Bears: {surv} / {bears[-1:]}")
        if not umbras or surv[0].get("by") != umbras[-1]:
            problems.append(f"seat {seat}: destroyed instead: the Umbra ({umbras[-1:]}): {surv}")
        if len(bears) != 1:
            problems.append(f"seat {seat}: the Umbra's Bears are still on the table, the other Bears gone: {bears}")
        if any(c.get("name") == "Savannah Lions" for c in last):
            problems.append(f"seat {seat}: the Wrath took Bob's Savannah Lions")
        if any(c.get("name") == "Hyena Umbra" for c in last):
            problems.append(f"seat {seat}: the Umbra is gone")
        gone = [m for m in w.listed(seat, "moves") if umbras and m.get("card") == umbras[-1]
                and m["from"]["zone"] == "battlefield" and m["to"]["zone"] == "graveyard"]
        if not gone or gone[0].get("why") != "destroyed":
            problems.append(f"seat {seat}: the Umbra is destroyed, to the graveyard: {gone}")
        reports = [a for a in w.actions(seat) if "instead of" in (a.get("said") or "")]
        found[f"reports{seat}"] = reports
        if seat == 1 and reports:
            problems.append(f"Alice is not told of her own Umbra: {reports}")
        if seat == 2:
            if len(reports) != 1 or reports[0].get("said") != "Hyena Umbra was destroyed instead of Alice's Grizzly Bears.":
                problems.append(f"Bob's report says the Umbra was destroyed instead: {reports}")
            elif (reports[0].get("cards") or [{}])[0].get("name") != "Hyena Umbra" \
                    or reports[0]["cards"][0].get("to") != "graveyard" or reports[0].get("by") != 1:
                problems.append(f"Bob's report shows Alice's Hyena Umbra, to the graveyard: {reports[0]}")
    return result(problems, "Hyena Umbra: survived 'umbra' by the Umbra, the Bears stay, the Umbra destroyed; "
                            "Bob's report", found)


# --- F-0089-E ---------------------------------------------------------------------------------

def made(w, seat, name):
    """Each round's tokens of [name] this seat was told arrived (nowhere -> battlefield)."""
    out = []
    for s in w.boards(seat):
        table = {c["id"]: c for c in s.get("battlefield") or []}
        new = [m for m in s.get("moves") or [] if m["from"]["zone"] == "nowhere" and m["to"]["zone"] == "battlefield"
               and m.get("card") in table and name in (table[m["card"]].get("name") or "")]
        if new:
            out.append([m["card"] for m in new])
    return out


def krenko():
    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat != 1 or stack_of(g, 1):
                return None
            for o in f.get("options", []):
                label = o.get("label") or ""
                if label.startswith("Krenko, Mob Boss") and "Create" in label and o.get("payable", True):
                    return o["actionId"]
            if not g.mine(1, name="Krenko, Mob Boss"):
                return named(g, f, "Krenko, Mob Boss")
            return None
        if kind in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    g = game("krenko", [("Mountain", 30), ("Krenko, Mob Boss", 30)], [("Island", 60)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Krenko, Mob Boss"] * 3, "top": ["Mountain"] * 8}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(any(len(r) > 8 for r in made(w, s, "Goblin")) for s in (1, 2))

    g.run(policy, until=until, max_turn=24)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    sizes = {}
    for seat in (1, 2):
        rounds = made(w, seat, "Goblin")
        sizes[seat] = [len(r) for r in rounds]
        found[f"rounds{seat}"] = sizes[seat]
        if not any(n > 8 for n in sizes[seat]):
            return "inconclusive", f"seat {seat} never saw more than 8 Goblins at once: {sizes[seat]}", found
        for r in rounds:
            if len(set(r)) != len(r):
                problems.append(f"seat {seat}: each Goblin its own id: {r}")
    if sizes[1] != sizes[2]:
        problems.append(f"both seats told the same Goblins each round: {sizes}")
    return result(problems, f"Krenko: {max(sizes[1])} Goblins in one round, each told to both seats (waves of 8)",
                  found)


def scute():
    st = {"cast": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat != 1 or stack_of(g, 1) or st["cast"]:
                return None
            o = named(g, f, "Scute Swarm")
            st["cast"] = bool(o)
            return o
        if kind in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    g = game("scute", [("Forest", 40), ("Scute Swarm", 20)], [("Island", 60)],
             deal={1: {"hand": ["Forest"] * 6 + ["Scute Swarm"], "top": ["Forest"] * 14}})
    w = Watch(g)

    def until(g):
        w.see()
        return all(sum(len(r) for r in made(w, s, "Scute Swarm")) >= 8 for s in (1, 2))

    g.run(policy, until=until, max_turn=26)
    w.see()
    found = {"stopped": g.stopped_badly()}
    problems = [found["stopped"]] if found["stopped"] else []
    sizes = {}
    for seat in (1, 2):
        sizes[seat] = [len(r) for r in made(w, seat, "Scute Swarm")]
        found[f"rounds{seat}"] = sizes[seat]
        if sum(sizes[seat]) < 8:
            return "inconclusive", f"seat {seat} saw only {sum(sizes[seat])} Scute Swarm copies", found
    if sizes[1] != sizes[2]:
        problems.append(f"both seats told the same copies each round: {sizes}")
    return result(problems, f"Scute Swarm: {sum(sizes[1])} copies, at most {max(sizes[1])} in one round (one per "
                            f"trigger), each told to both seats", found)


SCENARIOS = {"bolt": bolt, "poison": poison_, "concede": concede, "mulligan": mulligan, "aurelia": aurelia,
             "relentless": relentless, "umbra": umbra, "krenko": krenko, "scute": scute}

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
