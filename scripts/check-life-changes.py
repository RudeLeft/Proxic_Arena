"""Spec 0077 -- every life change is told with its kind, amount and source,
and an infect hit is poison, never life (Mechanics Lab, Layer B).

    python -I scripts/check-life-changes.py <worker.jar> <res-root> [trace] [scenario...]

Each scenario is a real game against the worker; what it checks is read
from the snapshots both seats were sent (`life`: {key, changes: [{player,
kind, amount, source?, combat?}]}, protocol/README.md), never inferred:

  bolt      Lightning Bolt at Bob: one "damage" change, 3, from the Bolt;
            the round's damage wave hits Bob for 3; Bob's life 20 -> 17
  sign      Sign in Blood on Alice herself: one "loss" of 2 from the spell,
            and no damage dealt to her
  warden    Soul Warden, then three creatures: three "gain" changes of 1,
            each from Soul Warden, Alice's life 23
  merchant  Gray Merchant of Asphodel with devotion to black 5 (Bog Imp,
            Hypnotic Specter, itself): Bob's "loss" of 5 and Alice's "gain"
            of 5, both from the Merchant, in one round
  infect    Glistener Elves attack until Bob has 10 poison: every change to
            Bob is "poison" (combat, from an Elf), never damage or loss; each
            Elf's hit on Bob in the damage wave says `infect`; Bob's life
            stays 20; the game ends, Alice the winner (a loss by poison)

Both seats are sent the same changes (life is public). Exit 0 when every
scenario held, 1 when one did not, 2 when one never reached its point.
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


def game(name, seat1, seat2, deal=None):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"life-{name}.jsonl")
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

    def rounds(self, seat):
        """Each round's `life` this seat was sent, in order."""
        return [s["life"] for s in self.seen[seat].values() if s.get("life")]

    def changes(self, seat):
        return [c for r in self.rounds(seat) for c in r.get("changes", [])]

    def hits(self, seat):
        return [h for s in self.seen[seat].values() for h in ((s.get("damage") or {}).get("hits") or [])]

    def life(self, seat, of):
        snaps = list(self.seen[seat].values())
        p = next((p for p in (snaps[-1] if snaps else {}).get("players", []) if p.get("seat") == of), {})
        return p.get("life")

    def same(self):
        """Both seats were sent the same rounds (sources may only go, never differ)."""
        a, b = self.rounds(1), self.rounds(2)
        strip = lambda rs: [(r["key"], [(c["player"], c["kind"], c["amount"]) for c in r["changes"]]) for r in rs]  # noqa: E731
        return strip(a) == strip(b)


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def caster(order, target=None):
    """A policy: Alice plays a land, then the first card of [order] she can pay for; targets [target]."""

    def policy(g, f):
        kind = f.get("kind")
        seat = f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if seat != 1 or (g.state.get(1) or {}).get("stack"):
                return None
            for name in order:
                o = next((o for o in f["options"]
                          if o.get("payable") is not False and "Play land" not in (o.get("label") or "")
                          and any(c.get("id") == card_of(o.get("actionId")) and c.get("name") == name
                                  for c in g.zone(1, "hand"))), None)
                if o:
                    return o["actionId"]
            return None
        if kind == "chooseTargetsFor" and target is not None:
            return next((o["actionId"] for o in f["options"] if o.get("objectId") == target), DEFAULT)
        return DEFAULT

    return policy


def run(name, seat1, deal, order, target, until, max_turn=30):
    g = game(name, seat1, [("Island", 60)], deal={1: deal})
    w = Watch(g)

    def done(g):
        w.see()
        return until(w)

    g.run(caster(order, target), until=done, max_turn=max_turn)
    w.see()
    return g, w


def kinds(changes, player):
    return [(c["kind"], c["amount"]) for c in changes if c["player"] == player]


def bolt():
    g, w = run("bolt", [("Mountain", 30), ("Lightning Bolt", 30)],
               {"hand": ["Mountain", "Mountain", "Lightning Bolt"], "top": ["Mountain"] * 3},
               ["Lightning Bolt"], "player:2", lambda w: any(c["player"] == 2 for c in w.changes(1)) and w.changes(2))
    changes = w.changes(1)
    found = {"changes": changes, "hits": w.hits(1), "bob": w.life(1, 2), "stopped": g.stopped_badly()}
    told = [c for c in changes if c["player"] == 2]
    if not told:
        return "inconclusive", "the Bolt never hit Bob", found
    problems = [found["stopped"]] if found["stopped"] else []
    c = told[0]
    bolt_ids = {h["source"] for h in w.hits(1) if h.get("target") == {"player": 2}}
    if (c["kind"], c["amount"]) != ("damage", 3):
        problems.append(f"Bolt to Bob should be damage 3: {c}")
    if c.get("source") not in bolt_ids or not bolt_ids:
        problems.append(f"its source should be the Bolt, as the damage wave names it ({bolt_ids}): {c}")
    if c.get("combat"):
        problems.append(f"a spell's damage is not combat's: {c}")
    if not w.same():
        problems.append("both seats should be told the same changes")
    return result(problems, "Bolt to Bob: damage 3 from the Bolt, told to both seats", found)


def sign():
    g, w = run("sign", [("Swamp", 30), ("Sign in Blood", 30)],
               {"hand": ["Swamp", "Swamp", "Swamp", "Sign in Blood"], "top": ["Swamp"] * 3},
               ["Sign in Blood"], "player:1", lambda w: any(c["player"] == 1 for c in w.changes(1)) and w.changes(2))
    changes = w.changes(1)
    found = {"changes": changes, "hits": w.hits(1), "stopped": g.stopped_badly()}
    told = [c for c in changes if c["player"] == 1]
    if not told:
        return "inconclusive", "Sign in Blood never resolved", found
    problems = [found["stopped"]] if found["stopped"] else []
    if kinds(told, 1)[:1] != [("loss", 2)]:
        problems.append(f"Sign in Blood should be a loss of 2: {told}")
    sib = {c["id"] for s in w.seen[1].values() for c in (s.get("graveyard") or []) if c.get("name") == "Sign in Blood"}
    if told[0].get("source") not in sib:
        problems.append(f"its source should be the Sign in Blood ({sib}): {told[0]}")
    if any(h.get("target") == {"player": 1} for h in w.hits(1)):
        problems.append("a loss is not damage: no hit on Alice")
    if not w.same():
        problems.append("both seats should be told the same changes")
    return result(problems, "Sign in Blood: a loss of 2, from the spell, no damage", found)


def warden():
    g, w = run("warden", [("Plains", 24), ("Soul Warden", 18), ("Savannah Lions", 18)],
               {"hand": ["Plains", "Soul Warden", "Savannah Lions", "Savannah Lions", "Savannah Lions", "Plains"],
                "top": ["Plains"] * 4},
               ["Soul Warden", "Savannah Lions"], None,
               lambda w: len([c for c in w.changes(1) if c["kind"] == "gain"]) >= 3 and len(w.changes(2)) >= 3)
    gains = [c for c in w.changes(1) if c["kind"] == "gain"]
    found = {"gains": gains, "alice": w.life(1, 1), "stopped": g.stopped_badly()}
    if len(gains) < 3:
        return "inconclusive", "three creatures never entered under Soul Warden", found
    problems = [found["stopped"]] if found["stopped"] else []
    wardens = {c["id"] for s in w.seen[1].values() for c in (s.get("battlefield") or []) if c.get("name") == "Soul Warden"}
    for c in gains[:3]:
        if (c["player"], c["amount"]) != (1, 1) or c.get("source") not in wardens:
            problems.append(f"each gain is Alice's 1, from Soul Warden ({wardens}): {c}")
    if [c for c in w.changes(1) if c["kind"] != "gain"]:
        problems.append(f"only gains: {w.changes(1)}")
    if w.life(1, 1) != 23:
        problems.append(f"Alice's life should be 23: {w.life(1, 1)}")
    if not w.same():
        problems.append("both seats should be told the same changes")
    return result(problems, "Soul Warden x3: three gains of 1, each from Soul Warden; life 23", found)


def merchant():
    g, w = run("merchant", [("Swamp", 30), ("Bog Imp", 10), ("Hypnotic Specter", 10), ("Gray Merchant of Asphodel", 10)],
               {"hand": ["Swamp", "Swamp", "Swamp", "Bog Imp", "Hypnotic Specter", "Gray Merchant of Asphodel", "Swamp"],
                "top": ["Swamp"] * 6},
               ["Bog Imp", "Hypnotic Specter", "Gray Merchant of Asphodel"], None,
               lambda w: any(c["player"] == 2 for c in w.changes(1)) and w.changes(2), max_turn=24)
    found = {"rounds": w.rounds(1), "lives": [w.life(1, 1), w.life(1, 2)], "stopped": g.stopped_badly()}
    rounds = [r for r in w.rounds(1) if any(c["player"] == 2 for c in r["changes"])]
    if not rounds:
        return "inconclusive", "Gray Merchant never drained", found
    problems = [found["stopped"]] if found["stopped"] else []
    drain = rounds[0]["changes"]
    gm = {c["id"] for s in w.seen[1].values() for c in (s.get("battlefield") or [])
          if c.get("name") == "Gray Merchant of Asphodel"}
    if kinds(drain, 2) != [("loss", 5)] or kinds(drain, 1) != [("gain", 5)]:
        problems.append(f"one round: Bob loses 5 and Alice gains 5: {drain}")
    if any(c.get("source") not in gm for c in drain):
        problems.append(f"both from the Merchant ({gm}): {drain}")
    if found["lives"] != [25, 15]:
        problems.append(f"lives should be 25 and 15: {found['lives']}")
    if not w.same():
        problems.append("both seats should be told the same changes")
    return result(problems, "Gray Merchant (devotion 5): Bob loses 5, Alice gains 5, one round, one source", found)


def infect():
    def policy(g, f):
        if f.get("kind") == "declareAttackers" and f["authorisedSeat"] == 1:
            attacking = {c["id"] for c in g.mine(1) if c.get("attacking")}
            return next((o["actionId"] for o in f["options"] if o["actionId"].startswith("attacker:")
                         and card_of(o["actionId"]) not in attacking), None)
        return caster(["Glistener Elf"])(g, f)

    g = game("infect", [("Forest", 30), ("Glistener Elf", 30)], [("Island", 60)],
             deal={1: {"hand": ["Forest", "Glistener Elf", "Glistener Elf", "Glistener Elf", "Glistener Elf", "Forest", "Forest"],
                       "top": ["Forest", "Glistener Elf", "Glistener Elf", "Forest"]}})
    w = Watch(g)
    g.run(policy, until=lambda g: (w.see(), False)[1], max_turn=30)
    w.see()
    to_bob = [c for c in w.changes(1) if c["player"] == 2]
    bob_hits = [h for h in w.hits(1) if h.get("target") == {"player": 2}]
    # Each round's poison, beside the Elves that hit Bob in that round's wave.
    by_round = []
    for s in w.seen[1].values():
        told = [c for c in ((s.get("life") or {}).get("changes") or []) if c["player"] == 2]
        hit = {h["source"] for h in ((s.get("damage") or {}).get("hits") or []) if h.get("target") == {"player": 2}}
        if told:
            by_round.append((told, hit))
    poison = sum(c["amount"] for c in to_bob if c["kind"] == "poison")
    elves = {c["id"] for s in w.seen[1].values() for c in (s.get("battlefield") or []) if c.get("name") == "Glistener Elf"}
    ended = g.ended or {}
    found = {"to_bob": to_bob, "bob_hits": bob_hits, "poison": poison, "bob": w.life(1, 2),
             "ended": {k: ended.get(k) for k in ("outcome", "winningSeat", "lossReason")},
             "stopped": g.stopped_badly()}
    if poison < 10:
        return "inconclusive", f"Bob reached only {poison} poison", found
    problems = [found["stopped"]] if found["stopped"] else []
    if [c for c in to_bob if c["kind"] != "poison"]:
        problems.append(f"an infect hit is poison, never life: {to_bob}")
    for told, hit in by_round:
        for c in told:
            # Forge gives a step's poison in one go: named when one Elf gave it all.
            want = next(iter(hit)) if len(hit) == 1 else None
            if not c.get("combat") or c.get("source") != want or (want and want not in elves):
                problems.append(f"each poison is combat's, named by its one Elf ({hit}): {c}")
    if not bob_hits or any(not h.get("infect") for h in bob_hits):
        problems.append(f"each Elf's hit on Bob says infect: {bob_hits}")
    if found["bob"] != 20:
        problems.append(f"Bob's life should stay 20: {found['bob']}")
    if found["ended"] != {"outcome": "WINNER", "winningSeat": 1, "lossReason": "Poisoned"}:
        problems.append(f"the game should end with Alice the winner, Bob poisoned: {found['ended']}")
    if not w.same():
        problems.append("both seats should be told the same changes")
    return result(problems, f"infect: {poison} poison to Bob from the Elves, life 20 throughout, the game over", found)


SCENARIOS = {"bolt": bolt, "sign": sign, "warden": warden, "merchant": merchant, "infect": infect}

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
