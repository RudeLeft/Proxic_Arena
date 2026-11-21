"""Soulbond pairs on the board -- spec 0111 (owner 2026-11-19b, canvas "1" A).

    python -I scripts/check-soulbond.py <worker.jar> <res-root> [trace-dir|trace.jsonl] [scenario...]

A paired creature's snapshot entry carries `pairedWith`, its partner's id
(ViewerSnapshot#pairedWith: Forge's Card#getPairedWith, only while both
cards are on the battlefield). Alice (seat 1) pairs; Bob (seat 2) kills.
Somebody watches from the start, so the public view (seat 0) is read too.

F-0111-A -- the pair, in every seat's frames (1, 2 and the public view):

  pair          Elder Cathar, then Tandem Lookout: its soulbond trigger
                (Forge's own questions, answered yes and Elder Cathar) pairs
                them; both carry `pairedWith` naming the other.
  two-pairs     the pair above, then Wolfir Silverheart (no unpaired
                creature: no pair), then Chapel Geist enters and Wolfir's
                soulbond pairs them: two pairs at once, each naming its own
                partner, and Chapel Geist is 6/7.
  partner-dies  the pair above; Bob's Lightning Bolt kills Elder Cathar:
                from then on no card names it and Tandem Lookout carries no
                `pairedWith`; then Chapel Geist enters and Lookout pairs
                again, with it.

F-0111-B -- hidden information, over every frame of every scenario: a
`pairedWith` sits only on a battlefield card of that frame, names a card on
that frame's battlefield, and its partner names it back; no `pairedWith`
anywhere else in a frame (a report window's card, a reveal, a zone).

  face-down     Alice casts Willbender face down, then Tandem Lookout pairs
                with it: both carry `pairedWith`; Bob's and the public view's
                frames show it only as "Face-down" and never say
                "Willbender"; Alice's say what it is (HID-003, both halves).
  token-dies    Raise the Alarm's Soldier tokens, then Tandem Lookout pairs
                with one; Alice casts Fling at Bob, sacrificing that token.
                Forge keeps a token's link after it leaves
                (GameAction#changeZone unpairs only the survivor for a real
                token): no frame may carry that link, and Lookout is shown
                unpaired. Measured: no frame of this game was sent while the
                token still held it (the sacrifice is paid last and the token
                is gone before the next question), so the battlefield guard's
                bite (HID-004) is the worker's PairedWithTest, which moves
                Forge's own cards between Forge's own zones.

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]

# What each card costs: {land name: coloured pips}, and its total.
COSTS = {
    "Elder Cathar": ({"Plains": 1}, 3),
    "Tandem Lookout": ({"Island": 1}, 3),
    "Chapel Geist": ({"Plains": 2}, 3),
    "Wolfir Silverheart": ({"Forest": 2}, 5),
    "Raise the Alarm": ({"Plains": 1}, 2),
    "Willbender": ({}, 3),  # face down: {3}
    "Lightning Bolt": ({"Mountain": 1}, 1),
    "Fling": ({"Mountain": 1}, 2),
}
BOB = [("Mountain", 30), ("Lightning Bolt", 30)]
BOB_DEAL = {"hand": ["Mountain"] * 4 + ["Lightning Bolt"] * 3, "top": ["Mountain"] * 8}
DEBUG = bool(os.environ.get("SOULBOND_DEBUG"))


def game(name, seat1, seat2, deal):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"soulbond-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal)


class Watch:
    """Every snapshot each seat (and the public view) was sent, once each, in order."""

    def __init__(self, g):
        self.g = g
        self.seen = {0: {}, 1: {}, 2: {}}

    def see(self):
        for seat in (0, 1, 2):
            s = self.g.state.get(seat)
            if s and s.get("stateRevision") not in self.seen[seat]:
                self.seen[seat][s.get("stateRevision")] = s

    def boards(self, seat):
        return list(self.seen[seat].values())


def can_pay(g, seat, card):
    pips, total = COSTS[card]
    lands = g.untapped_lands(seat)
    if len(lands) < total:
        return False
    return all(len([c for c in lands if c.get("name") == land]) >= n for land, n in pips.items())


def from_hand(g, f, name, face_down=False):
    """The option that casts [name] from the asked seat's hand (face down, if asked)."""
    seat = f["authorisedSeat"]
    for o in f["options"]:
        label = o.get("label") or ""
        if o.get("payable") is False or "Play land" in label:
            continue
        if ("face down" in label.lower()) != face_down:
            continue
        cid = card_of(o.get("actionId"))
        if any(c.get("id") == cid and c.get("name") == name for c in g.zone(seat, "hand")):
            return o["actionId"]
    return None


def on_table(g, viewer, name, owner=1):
    return g.zone(viewer, "battlefield", owner=owner, name=name)


def pair_of(board, card_id):
    c = next((c for c in board.get("battlefield") or [] if c.get("id") == card_id), None)
    return c.get("pairedWith") if c else None


def soulbond_answer(g, f, st, partner):
    """Forge's soulbond questions: yes, and the partner named [partner] (by id on the asked seat's board)."""
    kind, labels = f.get("kind"), g.labels(f)
    text = (f.get("prompt") or "") + " " + " ".join(labels)
    if DEBUG:
        print("ASK", f["authorisedSeat"], kind, repr(f.get("prompt")), labels[:8], flush=True)
    if f["authorisedSeat"] != 1:
        return None
    if "pair" in text.lower() or "soulbond" in text.lower():
        st["asked"].append((kind, f.get("prompt"), labels[:6]))
        st["answered"] = g.turn
        want = [c["id"] for c in g.zone(1, "battlefield", owner=1) if partner and c.get("name") == partner
                or partner == "Face-down" and c.get("faceDown")]
        for o in f.get("options") or []:
            if o.get("objectId") in want or card_of(o.get("actionId")) in want:
                return o["actionId"]
        yes = next((o["actionId"] for o in f.get("options") or [] if (o.get("label") or "").lower().startswith("yes")),
                   None)
        if yes:
            return yes
    return None


def option_for(f, card_id):
    return next((o["actionId"] for o in f.get("options") or []
                 if card_id and (o.get("objectId") == card_id or card_of(o.get("actionId")) == card_id)), None)


def sequence_policy(order, partners, kill=None):
    """Alice casts [order] one at a time, each once she can pay; her soulbond questions are
    answered with [partners][the creature that just entered]. kill="bolt": Bob bolts the
    paired partner once both players' boards show it paired; kill="fling": Alice casts Fling
    at Bob, sacrificing the paired partner (the last of [order])."""

    def policy(g, f, st):
        seat, kind = f["authorisedSeat"], f.get("kind")
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if (g.state.get(seat) or {}).get("stack"):
                return None
            victim = st.get("victim")
            shown = victim and all(pair_of(g.state.get(s) or {}, victim) for s in (1, 2))
            if seat == 1:
                for name in order:
                    if name in st["cast"]:
                        continue
                    if name == "Fling" and not shown:
                        return None
                    if not can_pay(g, 1, name):
                        return None
                    o = from_hand(g, f, name, face_down=name == "Willbender")
                    if o and name == "Fling":
                        st["killing"] = True
                    return o
                return None
            if kill == "bolt" and not st["killed"] and shown and can_pay(g, 2, "Lightning Bolt"):
                o = from_hand(g, f, "Lightning Bolt")
                if o:
                    st["killing"] = True
                return o
            return None
        if st.get("killing") and not st["killed"]:
            # Bob's Bolt at the partner; Alice's Fling at Bob, the partner sacrificed.
            if kind == "chooseTargetsFor" and seat == 2:
                o = option_for(f, st["victim"])
                if o:
                    st["killed"] = True
                    return o
            if kind == "chooseTargetsFor" and seat == 1:
                o = next((o["actionId"] for o in f.get("options") or [] if (o.get("label") or "") == "Bob"), None)
                if o:
                    return o
            if kind == "CostSacrifice" and seat == 1:
                o = option_for(f, st["victim"])
                if o:
                    st["killed"] = True
                    return o
        partner = partners.get(st["last_entered"]) if st.get("last_entered") else None
        answer = soulbond_answer(g, f, st, partner)
        if answer:
            return answer
        return DEFAULT

    return policy


SCENARIOS = {
    "pair": {
        "alice": [("Plains", 20), ("Island", 20), ("Elder Cathar", 10), ("Tandem Lookout", 10)],
        "deal": {"hand": ["Plains", "Island", "Plains", "Elder Cathar", "Tandem Lookout", "Plains", "Island"],
                 "top": ["Plains", "Island", "Plains", "Island", "Plains"]},
        "order": ["Elder Cathar", "Tandem Lookout"],
        "partners": {"Tandem Lookout": "Elder Cathar"},
        "pairs": [("Tandem Lookout", "Elder Cathar")],
    },
    "two-pairs": {
        "alice": [("Plains", 15), ("Island", 10), ("Forest", 15), ("Elder Cathar", 5), ("Tandem Lookout", 5),
                  ("Wolfir Silverheart", 5), ("Chapel Geist", 5)],
        "deal": {"hand": ["Plains", "Island", "Forest", "Elder Cathar", "Tandem Lookout", "Wolfir Silverheart",
                          "Chapel Geist"],
                 "top": ["Forest", "Plains", "Plains", "Island", "Plains", "Forest"]},
        "order": ["Elder Cathar", "Tandem Lookout", "Wolfir Silverheart", "Chapel Geist"],
        "partners": {"Tandem Lookout": "Elder Cathar", "Chapel Geist": "Wolfir Silverheart",
                     "Wolfir Silverheart": "Chapel Geist"},
        "pairs": [("Tandem Lookout", "Elder Cathar"), ("Wolfir Silverheart", "Chapel Geist")],
        "geist": (6, 7),
    },
    "partner-dies": {
        "alice": [("Plains", 20), ("Island", 20), ("Elder Cathar", 10), ("Tandem Lookout", 5), ("Chapel Geist", 5)],
        "deal": {"hand": ["Plains", "Island", "Plains", "Elder Cathar", "Tandem Lookout", "Chapel Geist", "Plains"],
                 "top": ["Island", "Plains", "Plains", "Island", "Plains", "Plains"]},
        "order": ["Elder Cathar", "Tandem Lookout", "Chapel Geist"],
        "partners": {"Tandem Lookout": "Elder Cathar", "Chapel Geist": "Tandem Lookout"},
        "pairs": [("Tandem Lookout", "Elder Cathar")],
        "kill": "bolt",
        "again": ("Tandem Lookout", "Chapel Geist"),
    },
    "face-down": {
        "alice": [("Island", 40), ("Willbender", 10), ("Tandem Lookout", 10)],
        "deal": {"hand": ["Island", "Island", "Island", "Willbender", "Tandem Lookout", "Island", "Island"],
                 "top": ["Island"] * 6},
        "order": ["Willbender", "Tandem Lookout"],
        "partners": {"Tandem Lookout": "Face-down"},
        "pairs": [("Tandem Lookout", "Face-down")],
        "secret": "Willbender",
    },
    "token-dies": {
        "alice": [("Plains", 15), ("Island", 15), ("Mountain", 10), ("Raise the Alarm", 7), ("Tandem Lookout", 7),
                  ("Fling", 6)],
        "deal": {"hand": ["Plains", "Island", "Mountain", "Raise the Alarm", "Tandem Lookout", "Fling", "Plains"],
                 "top": ["Island", "Mountain", "Plains", "Island", "Plains"]},
        "order": ["Raise the Alarm", "Tandem Lookout", "Fling"],
        "partners": {"Tandem Lookout": "Soldier Token"},
        "pairs": [("Tandem Lookout", "Soldier Token")],
        "kill": "fling",
    },
}


def names(board):
    return {c.get("id"): c.get("name") for c in board.get("battlefield") or []}


def stray_links(obj, path="", out=None):
    """Every `pairedWith` in a frame outside its battlefield list."""
    out = [] if out is None else out
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "pairedWith" and not path.startswith("battlefield["):
                out.append(path or "(top)")
            if not (path == "" and k == "battlefield"):
                stray_links(v, f"{path}.{k}" if path else k, out)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            stray_links(v, f"{path}[{i}]", out)
    return out


def run(name):
    sc = SCENARIOS[name]
    g = game(name, sc["alice"], BOB, {1: sc["deal"], 2: BOB_DEAL})
    w = Watch(g)
    st = {"cast": set(), "killed": False, "asked": [], "last_entered": None, "watched": False, "paired": None,
          "gone": None, "again": None, "victim": None, "entered": set(),
          "answered": None}
    policy = sequence_policy(sc["order"], sc["partners"], sc.get("kill"))

    def wrapped(g, f):
        if not st["watched"]:
            g.send({"protocolVersion": 1, "type": "WATCHED", "messageId": str(uuid.uuid4()), "on": True})
            st["watched"] = True
        return policy(g, f, st)

    def until(g):
        w.see()
        mine = g.state.get(1) or {}
        for c in mine.get("battlefield") or []:
            if c.get("seat") == 1 and c.get("id") not in st["entered"]:
                st["entered"].add(c.get("id"))
                if c.get("kind") == "creature" or c.get("faceDown"):
                    nm = "Face-down" if c.get("faceDown") else c.get("name")
                    st["last_entered"] = nm
                    if nm in sc["partners"] or any(nm == b for _, b in sc["pairs"]):
                        pass
            if c.get("seat") == 1 and c.get("name") in sc["order"]:
                st["cast"].add(c.get("name"))
        if any(c.get("seat") == 1 and c.get("name") == "Soldier Token" or c.get("seat") == 1 and c.get("token")
               for c in mine.get("battlefield") or []):
            st["cast"].add("Raise the Alarm")
        if any(c.get("faceDown") for c in mine.get("battlefield") or []):
            st["cast"].add("Willbender")
        # The pairs, on every view.
        if st["paired"] is None and all(pairs_shown(g.state.get(s) or {}, sc["pairs"]) for s in (0, 1, 2)):
            st["paired"] = g.turn
        if st["paired"] is not None and sc.get("kill") and st["victim"] is None:
            for a, b in sc["pairs"]:
                ids = ids_of(mine, a, b)
                if ids:
                    st["victim"] = ids[1]
        if st["killed"]:
            st["cast"].add("Fling")
        if st["victim"] and st["gone"] is None and st["killed"]:
            if all(not any(c.get("id") == st["victim"] for c in (g.state.get(s) or {}).get("battlefield") or [])
                   for s in (0, 1, 2)):
                st["gone"] = g.turn
        if sc.get("again") and st["gone"] is not None and st["again"] is None \
                and all(pairs_shown(g.state.get(s) or {}, [sc["again"]]) for s in (0, 1, 2)):
            st["again"] = g.turn
        # The pair was answered and never showed on every view: judged below (WRONG).
        if st["paired"] is None and len(st["asked"]) >= len(sc["pairs"]) and st["answered"] is not None \
                and g.turn > st["answered"] + 2:
            return True
        if sc.get("again"):
            done = st["again"]
        elif sc.get("kill"):
            done = st["gone"]
        elif sc.get("geist"):
            done = st["paired"]
        else:
            done = st["paired"]
        return done is not None and g.turn > done

    g.run(wrapped, until=until, max_turn=16)
    w.see()
    return g, w, st


def ids_of(board, a, b):
    """The ids of the pair (a, b) on [board], when a carries pairedWith naming b."""
    for c in board.get("battlefield") or []:
        if c.get("seat") != 1 or c.get("name") != a or not c.get("pairedWith"):
            continue
        partner = next((p for p in board.get("battlefield") or [] if p.get("id") == c["pairedWith"]), None)
        if partner is None:
            continue
        if (b == "Face-down" and partner.get("faceDown")) or partner.get("name") == b \
                or (b == "Soldier Token" and partner.get("token")):
            return c["id"], partner["id"]
    return None


def pairs_shown(board, pairs):
    for a, b in pairs:
        ids = ids_of(board, a, b)
        if not ids or pair_of(board, ids[1]) != ids[0]:
            return False
    return True


def judge(name, g, w, st):
    sc = SCENARIOS[name]
    found = {"paired": st["paired"], "gone": st["gone"], "again": st["again"], "asked": st["asked"][:4],
             "stopped": g.stopped_badly(), "frames": {s: len(w.boards(s)) for s in (0, 1, 2)}}
    problems = [found["stopped"]] if found["stopped"] else []
    if not st["asked"]:
        return "inconclusive", f"Forge never asked to pair (cast {sorted(st['cast'])})", found
    if st["paired"] is None:
        # F-0111-A: Forge paired them (its question answered), and no view showed both naming each other.
        return "wrong", "the pair was made but never showed on every view, each card naming the other", found
    if sc.get("kill") and st["gone"] is None:
        return "inconclusive", "the partner never died", found
    if sc.get("again") and st["again"] is None:
        return "inconclusive", "Tandem Lookout never paired again", found
    if not w.boards(0):
        return "inconclusive", "no public view was sent", found
    links = 0
    for seat in (0, 1, 2):
        for board in w.boards(seat):
            rev = board.get("stateRevision")
            bf = {c.get("id"): c for c in board.get("battlefield") or []}
            # F-0111-B: only on a battlefield card, naming a battlefield card, both ways.
            for c in bf.values():
                p = c.get("pairedWith")
                if not p:
                    continue
                links += 1
                if p not in bf:
                    problems.append(f"seat {seat} rev {rev}: {c.get('name')} names {p}, not on this board")
                elif bf[p].get("pairedWith") != c.get("id"):
                    problems.append(f"seat {seat} rev {rev}: {c.get('name')}'s partner {p} does not name it back")
                if c.get("phasedOut") or (bf.get(p) or {}).get("phasedOut"):
                    problems.append(f"seat {seat} rev {rev}: a phased-out card is paired")
            stray = stray_links(board)
            if stray:
                problems.append(f"seat {seat} rev {rev}: `pairedWith` outside the battlefield: {stray[:3]}")
            # F-0111-A (partner-dies, token-dies): once gone, nobody names the dead partner.
            if st["victim"] and st["gone"] is not None and st["victim"] not in bf:
                if "pairedWith" in json.dumps(board) and st["victim"] in [x.get("pairedWith") for x in bf.values()]:
                    problems.append(f"seat {seat} rev {rev}: a card still names the dead partner")
            secret = sc.get("secret")
            if secret:
                down = [c for c in bf.values() if c.get("faceDown")]
                text = json.dumps(board)
                if seat != 1 and down and secret in text:
                    problems.append(f"seat {seat} rev {rev}: a frame says {secret!r} while it is face down")
                if seat == 1 and down and not any(c.get("name") == secret for c in down):
                    problems.append(f"seat 1 rev {rev}: Alice is not told her own face-down card is {secret}")
    # F-0111-A: after the kill, Tandem Lookout is unpaired until it pairs again.
    if st["gone"] is not None:
        for seat in (0, 1, 2):
            after = [b for b in w.boards(seat) if st["victim"] not in {c.get("id") for c in b.get("battlefield") or []}
                     and b.get("turn", 0) >= st["gone"]]
            lone = [b for b in after if any(c.get("name") == "Tandem Lookout" and not c.get("pairedWith")
                                            for c in b.get("battlefield") or [])]
            if not lone:
                problems.append(f"seat {seat}: Tandem Lookout is never shown unpaired after its partner died")
    if sc.get("geist"):
        for seat in (0, 1, 2):
            shown = [(c.get("power"), c.get("toughness")) for b in w.boards(seat) for c in b.get("battlefield") or []
                     if c.get("name") == "Chapel Geist" and c.get("pairedWith")]
            if sc["geist"] not in shown:
                problems.append(f"seat {seat}: a paired Chapel Geist is {sc['geist']}: {sorted(set(shown))[:3]}")
    found["links"] = links
    ok = "the pair on every view, on battlefield cards only, both ways"
    return ("wrong", "; ".join(problems[:8]), found) if problems else ("ok", ok, found)


if __name__ == "__main__":
    worst = 0
    for name in SCENARIOS:
        if ONLY and name not in ONLY:
            continue
        verdict_, message, found = judge(name, *run(name))
        code = {"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_]
        worst = 1 if 1 in (worst, code) else max(worst, code)
        print(f"{name}: {verdict_.upper()}: {message}")
        print("  " + json.dumps(found, default=str)[:3000])
        sys.stdout.flush()
    sys.exit(worst)
