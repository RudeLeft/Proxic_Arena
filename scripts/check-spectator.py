"""What a spectator is sent: the public table and nothing else. Spec 0047.

    python -I scripts/check-spectator.py <worker.jar> <res-root> [trace-dir] [scenario...]

  public   a game with morphs (face-down creatures), instants held in hand
           and libraries full of cards; the server says "somebody is
           watching" (WATCHED) after the opening hands. From then on the
           public view (seat 0) arrives every round, and in it:
             - no hand cards and no other-hand cards at all;
             - no card id that is in either player's hand that round;
             - no name of a face-down creature (it is "Face-down");
             - both players' life, counts and the battlefield are there.
           Before WATCHED, nothing was sent as seat 0 (an unwatched game
           builds nothing extra).
           Spec 0067 -- and the public play log (F-0067-E): the first
           public view brings the game's log from its first line (written
           while nobody watched), and no line names a card in a hand, a
           face-down card, or anything Forge showed one seat alone; none
           is marked private; draws read "drew a card".

The cross-game check-hidden-hands.py reads these recordings too, and
compares seat 0's frames with each player's hand round by round.

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
DECK = [("Island", 24), ("Willbender", 18), ("Opt", 18)]


def public():
    trace = "" if not TRACES else (
        TRACES[: -len(".jsonl")] + "-public.jsonl" if TRACES.endswith(".jsonl")
        else os.path.join(TRACES, "spectator-public.jsonl"))
    # The deal: three Islands and a Willbender to cast face down, each seat.
    hand = {"hand": ["Island"] * 4 + ["Willbender", "Willbender", "Opt"]}
    g = Game(DECK, DECK, jar=JAR, res=RES, trace=trace, deal={1: hand, 2: hand})
    st = {"watched": False, "early": 0, "frames": 0, "problems": [], "morph": False,
          "lines": {}, "first": None, "drew": 0, "downCast": 0, "shown": set()}

    def policy(g, f):
        if not st["watched"] and g.turn >= 2:
            g.send({"protocolVersion": 1, "type": "WATCHED", "messageId": str(uuid.uuid4()), "on": True})
            st["watched"] = True
        if f.get("kind") != "chooseSpellAbilityToPlay":
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        # Willbender face down (morph {3}): a face-down creature on the table.
        o = g.option(f, name="Willbender", contains="face down")
        if o and len([c for c in g.mine(f["authorisedSeat"], name="Island") if not c.get("tapped")]) >= 3:
            return o
        return None

    def until(g):
        public = g.state.get(0)
        if public is None:
            return False
        if not st["watched"]:
            st["early"] += 1
            return False
        st["frames"] += 1
        hands = set()
        for seat in (1, 2):
            hands |= {c["id"] for c in (g.state.get(seat, {}).get("hand") or [])}
        if public.get("hand") or public.get("otherHands"):
            st["problems"].append(f"turn {g.turn}: the public view carries a hand")
        text = json.dumps(public)
        for card in hands:
            if f'"{card}"' in text:
                st["problems"].append(f"turn {g.turn}: the public view names {card}, in a hand")
        for c in public.get("battlefield") or []:
            if c.get("faceDown"):
                st["morph"] = True
                if c.get("name") != "Face-down" or c.get("known"):
                    st["problems"].append(f"turn {g.turn}: a face-down card is named {c.get('name')!r}")
        if not public.get("spectator") or public.get("seat") != 0 or len(public.get("players") or []) != 2:
            st["problems"].append(f"turn {g.turn}: not a public view: seat {public.get('seat')}")
        # Spec 0067 -- the public play log: only what every player may see.
        for zone in ("battlefield", "graveyard", "exile", "stack", "command"):
            for c in public.get(zone) or []:
                if c.get("name") and not c.get("faceDown") and c.get("known", True):
                    st["shown"].add(c["name"])
        for line in public.get("playLog") or []:
            n = line.get("n")
            if n in st["lines"]:
                continue
            if st["first"] is None:
                st["first"] = n
            st["lines"][n] = line
            words = "".join(p if isinstance(p, str) else p.get("name", "") for p in line.get("parts") or [])
            if line.get("private"):
                st["problems"].append(f"turn {g.turn}: a public line is private: {words!r}")
            if " drew a card" in words or " drew " in words and " cards" in words:
                st["drew"] += 1
            if "a face-down spell" in words:
                st["downCast"] += 1
            for part in line.get("parts") or []:
                if not isinstance(part, dict):
                    continue
                if part.get("id") in hands:
                    st["problems"].append(f"turn {g.turn}: a public line carries {part.get('id')}, in a hand")
                if part.get("faceDown"):
                    st["problems"].append(f"turn {g.turn}: a public line names a face-down card: {words!r}")
                if part.get("name") and part["name"] not in st["shown"]:
                    st["problems"].append(
                        f"turn {g.turn}: a public line names {part['name']!r}, never face up on the public table")
                if " drew " in words and part.get("name"):
                    st["problems"].append(f"turn {g.turn}: a public line names a drawn card: {words!r}")
        return st["morph"] and st["frames"] > 40 and st["downCast"] > 0

    g.run(policy, until=until, max_turn=16)
    found = {k: st[k] for k in ("watched", "early", "frames", "morph", "first", "drew", "downCast")}
    found["lines"] = len(st["lines"])
    found["problems"] = st["problems"][:6]
    found["stopped"] = g.stopped_badly()
    if not st["watched"] or st["frames"] == 0 or not st["morph"]:
        return "inconclusive", "no face-down creature while watched", found
    problems = st["problems"] + ([found["stopped"]] if found["stopped"] else [])
    if st["early"]:
        problems.append(f"{st['early']} public frames before anybody watched")
    if st["first"] != 1:
        problems.append(f"the public log began at line {st['first']}, not at the game's first")
    if st["drew"] == 0:
        problems.append("no public line said a player drew a card")
    ok = (f"{st['frames']} public frames: no hand, no hand card, face-down cards unnamed; "
          f"{len(st['lines'])} public log lines from line 1 ({st['drew']} draws as 'a card', "
          f"{st['downCast']} face-down casts unnamed)")
    return ("wrong", "; ".join(problems[:6]), found) if problems else ("ok", ok, found)


SCENARIOS = {"public": public}

if __name__ == "__main__":
    codes = []
    for name, run in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        for _ in range(3):
            verdict_, message, found = run()
            if verdict_ != "inconclusive":
                break
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[verdict_])
        print(f"{name}: {verdict_.upper()}: {message}")
        if verdict_ != "ok":
            print("  " + json.dumps(found, default=str)[:1500])
        sys.stdout.flush()
    sys.exit(1 if 1 in codes else max(codes, default=0))
