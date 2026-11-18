"""Spec 0088 -- triggers from anywhere, reports that stay and gather, the top
of the library (Mechanics Lab, Layer B).

    python -I scripts/check-anywhere.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker. What it checks is read
from the snapshots BOTH seats were sent -- the stack's entries and their
`source`, where that card lies on the same board, the round's `moves`, the
report (`action`, its `gathered` rows), and a library's top card
(`libraryTop`, its `public` and `uses`) -- never inferred:

  solemn    F-0088-A: Bob's Murder kills Alice's Solemn Simulacrum: on the
            board its "draw a card" trigger arrives, the trigger's source is
            Solemn, lying in Alice's graveyard, both seats -- where the page
            raises it from
  cascade   F-0088-A: Alice casts Bloodbraid Elf: its cascade trigger's
            source is the Elf, the spell on the stack under it, both seats
  cycling   F-0088-A: Alice cycles Gempalm Incinerator: Bob's board names the
            card going from Alice's hand to her graveyard (cycled), and the
            cycling ability and the "when you cycle" trigger both have it as
            their source, lying in her graveyard, both seats
  unearth   F-0088-A: Dregscape Zombie's Unearth: the ability's source is the
            Zombie, in Alice's graveyard and usable (0087's fan), both seats
  opt       F-0088-B: Bob's Opt in Alice's end step: Alice is sent its report;
            when Bob's turn begins she is still sent it (Q2 A: no turn line
            clears it), and once she closes it (REPORTS_CLOSED, as the server
            sends it) it is gone for her; Bob is never sent his own
  fetch     F-0088-C: Bob cracks Polluted Delta and Flooded Strand, then casts
            Consider: Alice is sent ONE report, the surveil in full, with the
            two searches gathered under it, oldest first, each with its own
            key, words and cards; a card hidden from her carries no name and
            every card id is the report's own ("action:N:I"), never a card's.
            Amendment 1: two more Considers -- never more than three older
            reports, and the first search has dropped off
  courser   F-0088-D: Courser of Kruphix: both seats are sent Alice's top
            card, the same card, `public`; a land on top is usable by Alice
            (`uses`) in both views; she plays it from there (library ->
            battlefield, both seats); nothing for Bob's own library
  citadel   F-0088-D: Bolas's Citadel: Alice is sent her top card, usable by
            her, not `public`; Bob is never sent it, nor its id anywhere;
            Alice casts it from the top (library -> stack, both seats)

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its point.
"""
import json
import os
import re
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
BEARS = [("Forest", 30), ("Grizzly Bears", 30)]
BEARS_DEAL = {"hand": ["Forest"] * 3 + ["Grizzly Bears"] * 4, "top": ["Forest", "Grizzly Bears"] * 4}
CARD = re.compile(r"card:\d+")


def game(name, seat1, seat2=BEARS, deal=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"anywhere-{name}.jsonl")
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


def calm(g, seat=1):
    return not (g.state.get(seat) or {}).get("stack")


def lies(board, card_id):
    """Where [card_id] is on this board: a zone name, "stack" for a spell, or None."""
    for zone in ("battlefield", "hand", "otherHands", "graveyard", "exile", "casting"):
        if any(c.get("id") == card_id for c in board.get(zone) or []):
            return zone
    if any(e.get("kind") == "spell" and e.get("source") == card_id for e in board.get("stack") or []):
        return "stack"
    return None


def entry_of(board, zone, card_id):
    return next((c for c in board.get(zone) or [] if c.get("id") == card_id), None)


def option_for(f, card_id, contains=None, without=None):
    for o in f.get("options", []):
        label = o.get("label") or ""
        if card_of(o.get("actionId")) != card_id and o.get("objectId") != card_id:
            continue
        if contains and contains not in label:
            continue
        if without and without in label:
            continue
        return o["actionId"]
    return None


def hand_option(g, f, name, contains=None, without=None):
    for c in g.mine(f["authorisedSeat"], zone="hand", name=name):
        o = option_for(f, c["id"], contains, without)
        if o:
            return o
    return None


def hand_land(g, f):
    return g.option(f, zone="hand", land=True)


def seat2_plays(*names):
    def play(g, f):
        if f.get("kind") == "chooseSpellAbilityToPlay":
            land = hand_land(g, f)
            if land:
                return land
            for name in names:
                o = g.option(f, name=name, zone="hand", land=False)
                if o:
                    return o
            return None
        return DEFAULT
    return play


def first_option(f):
    return f["options"][0]["actionId"] if f.get("options") else None


def risen(w, card_id, kinds, zone_ok, problems, what):
    """Both seats were sent a board where a stack entry of one of [kinds] has
    [card_id] as its source, and on that same board the card lies where
    [zone_ok] says. Returns {seat: board index} of the first such board."""
    at = {}
    for seat in (1, 2):
        for i, b in enumerate(w.boards(seat)):
            if any(e.get("kind") in kinds and e.get("source") == card_id for e in b.get("stack") or []) \
                    and zone_ok(lies(b, card_id), b):
                at[seat] = i
                break
        else:
            problems.append(f"seat {seat}: never sent {what}")
    return at


# --- F-0088-A: triggers from anywhere --------------------------------------------------------------


def solemn():
    st = {"murder": False, "solemn": None}

    def policy(g, f):
        w.see()
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 1:
            if kind == "chooseSpellAbilityToPlay":
                land = hand_land(g, f)
                if land:
                    return land
                if calm(g) and len(g.untapped_lands(1)) >= 4 and not g.mine(1, name="Solemn Simulacrum"):
                    return hand_option(g, f, "Solemn Simulacrum")
                return None
            return DEFAULT
        if kind == "chooseSpellAbilityToPlay":
            land = hand_land(g, f)
            if land:
                return land
            sol = g.zone(2, "battlefield", owner=1, name="Solemn Simulacrum")
            if sol and not st["murder"] and calm(g, 2) and len(g.untapped_lands(2)) >= 3:
                o = hand_option(g, f, "Murder")
                if o:
                    st["murder"], st["solemn"] = True, sol[0]["id"]
                    return o
            return None
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if "Solemn" in (o.get("label") or "")), first_option(f))
        return DEFAULT

    g = game("solemn", [("Mountain", 30), ("Solemn Simulacrum", 30)], [("Swamp", 30), ("Murder", 30)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Solemn Simulacrum"] * 3, "top": ["Mountain"] * 6},
                   2: {"hand": ["Swamp"] * 4 + ["Murder"] * 3, "top": ["Swamp"] * 6}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["solemn"] is not None and calm(g)
                                   and any(c["id"] == st["solemn"] for c in g.zone(1, "graveyard")))[1], max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly(), "solemn": st["solemn"]}
    if st["solemn"] is None:
        return "inconclusive", "Murder was never cast on Solemn", found
    problems = [found["stopped"]] if found["stopped"] else []
    found["boards"] = risen(w, st["solemn"], ("trigger",), lambda z, b: z == "graveyard", problems,
                            "Solemn's trigger while Solemn lies in the graveyard")
    return result(problems, "Solemn's death trigger sourced from Solemn, in Alice's graveyard, both seats", found)


def cascade():
    st = {"elf": None}

    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return seat2_plays()(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = hand_land(g, f)
            if land:
                return land
            if st["elf"] is None and calm(g) and len(g.untapped_lands(1)) >= 4:
                for c in g.mine(1, zone="hand", name="Bloodbraid Elf"):
                    o = option_for(f, c["id"])
                    if o:
                        st["elf"] = c["id"]
                        return o
            return None
        return DEFAULT

    g = game("cascade", [("Mountain", 15), ("Forest", 15), ("Bloodbraid Elf", 15), ("Grizzly Bears", 15)],
             deal={1: {"hand": ["Mountain", "Forest", "Mountain", "Forest", "Bloodbraid Elf", "Bloodbraid Elf",
                                "Mountain"],
                       "top": ["Forest", "Mountain", "Forest", "Grizzly Bears", "Grizzly Bears", "Grizzly Bears"]},
                   2: BEARS_DEAL})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["elf"] is not None and calm(g)
                                   and any(c["id"] == st["elf"] for c in g.mine(1)))[1], max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "elf": st["elf"]}
    if st["elf"] is None:
        return "inconclusive", "Bloodbraid Elf was never cast", found
    problems = [found["stopped"]] if found["stopped"] else []
    found["boards"] = risen(w, st["elf"], ("trigger",), lambda z, b: z == "stack", problems,
                            "the cascade trigger while the Elf is the spell under it")
    return result(problems, "cascade's trigger sourced from the Elf on the stack, both seats", found)


def cycling():
    st = {"gem": None}

    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return seat2_plays("Grizzly Bears")(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = hand_land(g, f)
            if land:
                return land
            bears = g.zone(1, "battlefield", owner=2, name="Grizzly Bears")
            if st["gem"] is None and calm(g) and bears and len(g.untapped_lands(1)) >= 2:
                for c in g.mine(1, zone="hand", name="Gempalm Incinerator"):
                    o = option_for(f, c["id"], contains="ycl")
                    if o:
                        st["gem"] = c["id"]
                        return o
            return None
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if "Bears" in (o.get("label") or "")), first_option(f))
        # "You may have it deal X damage": yes.
        if st["gem"] and f.get("options") and kind not in ("declareAttackers", "declareBlockers"):
            yes = next((o["actionId"] for o in f["options"] if (o.get("label") or "").lower() in ("yes", "ok")), None)
            if yes:
                return yes
        return DEFAULT

    g = game("cycling", [("Mountain", 30), ("Gempalm Incinerator", 30)],
             deal={1: {"hand": ["Mountain"] * 4 + ["Gempalm Incinerator"] * 3, "top": ["Mountain"] * 6},
                   2: BEARS_DEAL})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["gem"] is not None and calm(g)
                                   and any(c["id"] == st["gem"] for c in g.zone(1, "graveyard")))[1], max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "gempalm": st["gem"]}
    if st["gem"] is None:
        return "inconclusive", "Gempalm Incinerator was never cycled", found
    problems = [found["stopped"]] if found["stopped"] else []
    gem = st["gem"]
    found["ability"] = risen(w, gem, ("ability",), lambda z, b: z == "graveyard", problems,
                             "the cycling ability while Gempalm lies in the graveyard")
    found["trigger"] = risen(w, gem, ("trigger",), lambda z, b: z == "graveyard", problems,
                             "the 'when you cycle' trigger while Gempalm lies in the graveyard")
    named = any(m.get("card") == gem and m.get("from", {}).get("zone") == "hand"
                and m.get("to", {}).get("zone") == "graveyard" for b in w.boards(2) for m in b.get("moves") or [])
    if not named:
        problems.append("seat 2: never told Gempalm went from Alice's hand to her graveyard")
    return result(problems, "cycling: Bob told the card left Alice's hand; its ability and trigger sourced from it", found)


def unearth():
    st = {"looted": False, "zombie": None}

    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return seat2_plays("Grizzly Bears")(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = hand_land(g, f)
            if land:
                return land
            if not calm(g):
                return None
            if not st["looted"] and g.untapped_lands(1, name="Mountain"):
                o = hand_option(g, f, "Faithless Looting", without="Flashback")
                if o:
                    st["looted"] = True
                    return o
            grave = g.mine(1, zone="graveyard", name="Dregscape Zombie")
            if grave and st["zombie"] is None and g.untapped_lands(1, name="Swamp"):
                o = option_for(f, grave[0]["id"], contains="Unearth") or option_for(f, grave[0]["id"])
                if o:
                    st["zombie"] = grave[0]["id"]
                    return o
            return None
        zombies = {c["id"] for c in g.mine(1, zone="hand", name="Dregscape Zombie")}
        o = next((o["actionId"] for o in f.get("options", []) if card_of(o.get("actionId")) in zombies
                  or o.get("objectId") in zombies), None)
        if st["looted"] and o and "iscard" in (f.get("prompt") or "").lower() + str(kind).lower():
            return o
        return DEFAULT

    g = game("unearth", [("Mountain", 14), ("Swamp", 14), ("Faithless Looting", 12), ("Dregscape Zombie", 20)],
             deal={1: {"hand": ["Mountain", "Swamp", "Faithless Looting", "Dregscape Zombie", "Dregscape Zombie",
                                "Swamp", "Mountain"], "top": ["Swamp", "Mountain"] * 4}, 2: BEARS_DEAL})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["zombie"] is not None and calm(g)
                                   and any(c["id"] == st["zombie"] for c in g.mine(1)))[1], max_turn=14)
    w.see()
    found = {"stopped": g.stopped_badly(), "zombie": st["zombie"]}
    if st["zombie"] is None:
        return "inconclusive", "no Zombie was unearthed", found
    problems = [found["stopped"]] if found["stopped"] else []
    z = st["zombie"]

    def in_fan(zone, b):
        e = entry_of(b, "graveyard", z)
        return zone == "graveyard" and e is not None and any(u.get("seat") == 1 for u in e.get("uses") or [])

    found["boards"] = risen(w, z, ("ability",), in_fan, problems, "Unearth while the Zombie stands in the fan")
    return result(problems, "Unearth sourced from the Zombie, usable in Alice's graveyard, both seats", found)


# --- F-0088-B: a report from the end of a turn stays --------------------------------------------------


def action_of(board):
    return board.get("action") or None


def all_reports(board):
    a = action_of(board)
    if not a:
        return []
    return list(a.get("gathered") or []) + [a]


def opt():
    st = {"opt_turn": None, "closed": None, "sent": False}

    def policy(g, f):
        w.see()
        kind, seat = f.get("kind"), f["authorisedSeat"]
        s = g.state.get(2) or {}
        if seat == 2 and kind == "chooseSpellAbilityToPlay":
            land = hand_land(g, f)
            if land and s.get("activeSeat") == 2:
                return land
            if st["opt_turn"] is None and s.get("activeSeat") == 1 and s.get("phase") == "END_OF_TURN" \
                    and calm(g, 2) and g.untapped_lands(2):
                o = hand_option(g, f, "Opt")
                if o:
                    st["opt_turn"] = g.turn
                    return o
            return None
        if seat == 2:
            return DEFAULT
        return seat2_plays("Grizzly Bears")(g, f)

    def until(g):
        w.see()
        if st["opt_turn"] is None:
            return False
        a = (g.state.get(1) or {}).get("turn", 0)
        mine = [r for r in all_reports(g.state.get(1) or {}) if "scried" in (r.get("said") or "")]
        if a >= st["opt_turn"] + 1 and mine and not st["sent"] and (g.state.get(1) or {}).get("phase") == "MAIN1":
            # Close it as the server would: the seat, the newest stamp shown.
            st["closed"] = action_of(g.state[1]).get("stamp")
            g.send({"protocolVersion": 1, "type": "REPORTS_CLOSED", "messageId": str(uuid.uuid4()),
                    "seat": 1, "upTo": st["closed"]})
            st["sent"] = True
            return False
        return st["sent"] and a >= st["opt_turn"] + 2

    g = game("opt", BEARS, [("Island", 30), ("Opt", 30)],
             deal={1: BEARS_DEAL, 2: {"hand": ["Island"] * 4 + ["Opt"] * 3, "top": ["Island", "Opt"] * 6}})
    w = Watch(g)
    g.run(policy, until=until, max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly(), "opt on turn": st["opt_turn"], "closed up to": st["closed"]}
    if st["opt_turn"] is None:
        return "inconclusive", "Bob never cast Opt in Alice's end step", found
    problems = [found["stopped"]] if found["stopped"] else []
    t0 = st["opt_turn"]
    a = w.boards(1)
    first = next((i for i, b in enumerate(a) if any("scried" in (r.get("said") or "") for r in all_reports(b))), None)
    if first is None:
        return result(problems + ["Alice was never sent the Opt report"], "", found)
    key = next(r["key"] for r in all_reports(a[first]) if "scried" in (r.get("said") or ""))
    found["report"] = key
    next_turn = [b for b in a if b.get("turn") == t0 + 1]
    if not next_turn:
        problems.append("the game never reached Bob's turn")
    held = [b for b in next_turn if any(r.get("key") == key for r in all_reports(b))]
    found["boards of Bob's turn still with it"] = f"{len(held)} of {len(next_turn)}"
    if next_turn and not held:
        problems.append("the report was gone when Bob's turn began")
    if st["closed"] is None:
        problems.append("the report was never closed (the scenario stopped early)")
    else:
        later = [b for b in a if b.get("turn", 0) >= t0 + 2]
        still = [b for b in later if any(r.get("key") == key for r in all_reports(b))]
        if not later:
            problems.append("no board after the close")
        elif still:
            problems.append(f"after Alice closed it the report was still sent ({len(still)} boards)")
    if any("scried" in (r.get("said") or "") for b in w.boards(2) for r in all_reports(b)):
        problems.append("Bob was sent a report of his own Opt")
    return result(problems, "Opt's report stayed through the turn line until Alice closed it; Bob never sent it", found)


# --- F-0088-C: several reports gather in one window ---------------------------------------------------


def fetch():
    st = {"cracked": [], "consider": 0}

    def policy(g, f):
        w.see()
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if seat == 1:
            return seat2_plays("Grizzly Bears")(g, f)
        if kind == "chooseSpellAbilityToPlay":
            if not calm(g, 2):
                return None
            for name in ("Polluted Delta", "Flooded Strand"):
                for c in g.mine(2, name=name):
                    if c["id"] not in st["cracked"]:
                        o = option_for(f, c["id"])
                        if o:
                            st["cracked"].append(c["id"])
                            return o
            land = hand_land(g, f)
            if land and (g.state[2].get("activeSeat") == 2):
                hand = g.mine(2, zone="hand")
                order = ["Polluted Delta", "Flooded Strand", "Island", "Swamp"]
                for name in order:
                    o = g.option(f, name=name, zone="hand", land=True)
                    if o:
                        return o
                return land
            if len(st["cracked"]) == 2 and st["consider"] < 3 and g.untapped_lands(2, name="Island"):
                o = hand_option(g, f, "Consider")
                if o:
                    st["consider"] += 1
                    return o
            return None
        if kind in ("declareAttackers", "declareBlockers"):
            return None
        # The searches (an Island, then a Swamp), the surveil (into the graveyard): the first offered.
        if f.get("options") and kind not in ("chooseSpellAbilityToPlay",):
            return first_option(f) if kind != "mulliganKeepHand" else DEFAULT
        return DEFAULT

    def until(g):
        w.see()
        return st["consider"] >= 3 and calm(g, 2) and calm(g, 1) and \
            sum("surveil" in (r.get("said") or "") for r in all_reports(g.state.get(1) or {})) >= 3

    g = game("fetch", BEARS, [("Island", 19), ("Swamp", 19), ("Polluted Delta", 1), ("Flooded Strand", 1),
                              ("Consider", 20)],
             deal={1: BEARS_DEAL,
                   2: {"hand": ["Polluted Delta", "Flooded Strand", "Island", "Consider", "Consider", "Swamp", "Island"],
                       "top": ["Consider", "Island", "Consider", "Island", "Consider", "Island"]}})
    w = Watch(g)
    g.run(policy, until=until, max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly(), "cracked": st["cracked"], "consider": st["consider"]}
    if st["consider"] < 3:
        return "inconclusive", "Bob never cracked both fetch lands and cast Consider three times", found
    problems = [found["stopped"]] if found["stopped"] else []
    # F-0088-C: the first surveil's window, the two searches under it.
    last = next((b for b in w.boards(1) if any("surveil" in (r.get("said") or "")
                                               for r in all_reports(b))), None)
    if last is None:
        return result(problems + ["Alice was never sent the surveil report"], "", found)
    a = action_of(last)
    rows = a.get("gathered") or []
    found["window"] = [(r.get("source"), r.get("said")) for r in rows] + [(a.get("source"), a.get("said"))]
    searches = [r for r in rows if "searched" in (r.get("said") or "")]
    if "surveil" not in (a.get("said") or ""):
        problems.append(f"the newest report in full is not Consider's surveil: {a.get('said')}")
    if [r.get("source") for r in searches] != ["Polluted Delta", "Flooded Strand"]:
        problems.append(f"the two searches are not gathered under it: {found['window']}")
    stamps = [r.get("stamp") or 0 for r in rows] + [a.get("stamp") or 0]
    if stamps != sorted(stamps) or len(set(stamps)) != len(stamps):
        problems.append(f"the window's reports are not oldest first, each its own: {stamps}")
    if len({r.get("key") for r in rows + [a]}) != len(rows) + 1:
        problems.append("two gathered reports share a key")
    for r in rows + [a]:
        for c in r.get("cards") or []:
            if not str(c.get("id", "")).startswith("action:"):
                problems.append(f"a report card carries a card's own id: {c.get('id')}")
            if c.get("known") is False and c.get("name") not in (None, "", "Face-down"):
                problems.append(f"a hidden report card is named: {c}")
        # Spec 0103 (owner option A, 2026-11-18): a known card's `table` link is
        # allowed to a card this board shows; any other card id is a leak.
        shown = {c.get("id") for z in ("battlefield", "hand", "otherHands", "casting", "graveyard",
                                      "exile", "command", "libraryTop") for c in (last.get(z) or [])}
        for c in r.get("cards") or []:
            link = c.get("table")
            if link is not None and (link not in shown or c.get("known") is not True):
                problems.append(f"a report card links {link}, which this board does not show")
        if CARD.search(json.dumps([{k: v for k, v in c.items() if k != "table"} for c in r.get("cards") or []])):
            problems.append("a report's cards name a card id")
    if any("searched" in (r.get("said") or "") or "surveil" in (r.get("said") or "")
           for b in w.boards(2) for r in all_reports(b)):
        problems.append("Bob was sent a report of his own search or surveil")
    # Amendment 1 (owner, "keep only 3 rows"): never more than three older
    # reports; with five, the first search has dropped off.
    most = max(len((action_of(b) or {}).get("gathered") or []) for b in w.boards(1))
    found["most rows sent"] = most
    if most > 3:
        problems.append(f"a window was sent {most} older reports (at most 3)")
    final = action_of(w.boards(1)[-1]) or {}
    frows = final.get("gathered") or []
    found["final window"] = [r.get("source") for r in frows] + [final.get("source")]
    if [r.get("source") for r in frows] != ["Flooded Strand", "Consider", "Consider"] or final.get("source") != "Consider":
        problems.append(f"five reports: the first search should have dropped off, three rows left: {found['final window']}")
    return result(problems, "one window: Consider's surveil in full over the two searches; with five reports, "
                            "three rows (the first search dropped off)", found)


# --- F-0088-D: the top of the library ---------------------------------------------------------------


def tops(board, seat):
    return [c for c in board.get("libraryTop") or [] if c.get("owner", c.get("seat")) == seat]


def uses(entry):
    return [(u.get("seat"), u.get("how")) for u in (entry or {}).get("uses") or []]


def courser():
    st = {"courser": False, "played": None}

    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return seat2_plays("Grizzly Bears")(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if not calm(g):
                return None
            if st["courser"] and st["played"] is None:
                top = tops(g.state.get(1) or {}, 1)
                if top and uses(top[0]) == [(1, "cast")]:
                    o = option_for(f, top[0]["id"])
                    if o:
                        st["played"] = top[0]["id"]
                        return o
            if not st["courser"] and len(g.untapped_lands(1)) >= 3:
                o = hand_option(g, f, "Courser of Kruphix")
                if o:
                    st["courser"] = True
                    return o
            if not st["courser"]:
                return hand_land(g, f)
            return None
        return DEFAULT

    g = game("courser", [("Forest", 30), ("Courser of Kruphix", 15), ("Grizzly Bears", 15)],
             deal={1: {"hand": ["Forest"] * 3 + ["Courser of Kruphix"] * 2 + ["Grizzly Bears"] * 2,
                       "top": ["Grizzly Bears", "Grizzly Bears", "Grizzly Bears", "Forest", "Grizzly Bears",
                               "Forest", "Forest", "Grizzly Bears"]},
                   2: BEARS_DEAL})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["played"] is not None and calm(g)
                                   and any(c["id"] == st["played"] for c in g.mine(1)))[1], max_turn=16)
    w.see()
    found = {"stopped": g.stopped_badly(), "courser": st["courser"], "played from the top": st["played"]}
    if not st["courser"]:
        return "inconclusive", "Courser was never cast", found
    problems = [found["stopped"]] if found["stopped"] else []
    by_rev = {seat: {b.get("stateRevision"): b for b in w.boards(seat)} for seat in (1, 2)}
    seen_public = 0
    for rev, a in by_rev[1].items():
        b = by_rev[2].get(rev)
        if not b or not any(c.get("name") == "Courser of Kruphix" for c in a.get("battlefield") or []):
            continue
        ta, tb = tops(a, 1), tops(b, 1)
        if not ta or not tb:
            problems.append(f"revision {rev}: Courser out but the top card was not sent to "
                            f"{'Alice' if not ta else 'Bob'}")
            break
        if ta[0].get("id") != tb[0].get("id") or not ta[0].get("public") or not tb[0].get("public"):
            problems.append(f"revision {rev}: the two seats were not sent the same public top card")
            break
        if uses(ta[0]) != uses(tb[0]):
            problems.append(f"revision {rev}: the seats were told different uses: {uses(ta[0])} / {uses(tb[0])}")
            break
        if (ta[0].get("kind") == "land") != (uses(ta[0]) == [(1, "cast")]):
            problems.append(f"revision {rev}: a {ta[0].get('kind')} on top with uses {uses(ta[0])}")
            break
        if tops(a, 2) or tops(b, 2):
            problems.append(f"revision {rev}: Bob's own top card was sent")
            break
        seen_public += 1
    found["boards with the public top card"] = seen_public
    if seen_public == 0:
        problems.append("never a board with Courser out and the top card sent")
    if st["played"] is None:
        problems.append("Alice never played a land from the top")
    else:
        for seat in (1, 2):
            if not any(m.get("card") == st["played"] and m.get("from", {}).get("zone") == "library"
                       and m.get("to", {}).get("zone") == "battlefield" for b in w.boards(seat) for m in b.get("moves") or []):
                problems.append(f"seat {seat}: never told the land went from the library to the battlefield")
    return result(problems, "Courser: the same public top card to both seats, a land usable; played from the top", found)


def citadel():
    st = {"citadel": False, "cast": None}

    def policy(g, f):
        w.see()
        if f["authorisedSeat"] == 2:
            return seat2_plays("Grizzly Bears")(g, f)
        kind = f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            if not calm(g):
                return None
            if st["citadel"] and st["cast"] is None:
                top = tops(g.state.get(1) or {}, 1)
                if top and top[0].get("name") == "Lightning Bolt" and uses(top[0]) == [(1, "cast")]:
                    o = option_for(f, top[0]["id"])
                    if o:
                        st["cast"] = top[0]["id"]
                        return o
            land = hand_land(g, f)
            if land:
                return land
            if not st["citadel"] and len(g.untapped_lands(1)) >= 6:
                o = hand_option(g, f, "Bolas's Citadel")
                if o:
                    st["citadel"] = True
                    return o
            return None
        if kind == "chooseTargetsFor":
            return next((o["actionId"] for o in f["options"] if "Bob" in (o.get("label") or "")), first_option(f))
        return DEFAULT

    g = game("citadel", [("Swamp", 30), ("Bolas's Citadel", 15), ("Lightning Bolt", 15)],
             deal={1: {"hand": ["Swamp"] * 6 + ["Bolas's Citadel"], "top": ["Swamp"] * 2 + ["Lightning Bolt"] * 10},
                   2: BEARS_DEAL})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), st["cast"] is not None and calm(g)
                                   and any(c["id"] == st["cast"] for c in g.zone(1, "graveyard")))[1], max_turn=20)
    w.see()
    found = {"stopped": g.stopped_badly(), "citadel": st["citadel"], "cast from the top": st["cast"]}
    if not st["citadel"]:
        return "inconclusive", "the Citadel was never cast", found
    problems = [found["stopped"]] if found["stopped"] else []
    a_tops = [t for b in w.boards(1) for t in tops(b, 1)]
    found["Alice's top cards seen"] = len(a_tops)
    if not a_tops:
        problems.append("Alice was never sent her top card")
    elif any(t.get("public") for t in a_tops):
        problems.append("the Citadel's top card was marked public")
    elif not any(uses(t) == [(1, "cast")] for t in a_tops):
        problems.append("Alice's top card was never usable by her")
    ids = {t.get("id") for t in a_tops}
    for b in w.boards(2):
        if b.get("libraryTop"):
            problems.append(f"Bob was sent a library top card: {b.get('libraryTop')}")
            break
        text = json.dumps({k: v for k, v in b.items() if k not in ("graveyard", "stack", "battlefield", "exile")})
        leaked = [i for i in ids if i and i != st["cast"] and f'"{i}"' in text]
        if leaked:
            problems.append(f"Bob's board names Alice's library card id {leaked[0]}")
            break
    if st["cast"] is None:
        problems.append("Alice never cast from the top")
    else:
        for seat in (1, 2):
            if not any(m.get("card") == st["cast"] and m.get("from", {}).get("zone") == "library"
                       and m.get("to", {}).get("zone") == "stack" for b in w.boards(seat) for m in b.get("moves") or []):
                problems.append(f"seat {seat}: never told the Bolt went from the library to the stack")
    return result(problems, "Citadel: Alice alone sent her top card, usable; cast from there; Bob sent nothing", found)


SCENARIOS = {"solemn": solemn, "cascade": cascade, "cycling": cycling, "unearth": unearth, "opt": opt,
             "fetch": fetch, "courser": courser, "citadel": citadel}

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
