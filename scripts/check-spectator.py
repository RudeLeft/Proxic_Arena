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
    g = Game(DECK, DECK, jar=JAR, res=RES, trace=trace)
    st = {"watched": False, "early": 0, "frames": 0, "problems": [], "morph": False}

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
        return st["morph"] and st["frames"] > 40

    g.run(policy, until=until, max_turn=16)
    found = {k: st[k] for k in ("watched", "early", "frames", "morph")}
    found["problems"] = st["problems"][:6]
    found["stopped"] = g.stopped_badly()
    if not st["watched"] or st["frames"] == 0 or not st["morph"]:
        return "inconclusive", "no face-down creature while watched", found
    problems = st["problems"] + ([found["stopped"]] if found["stopped"] else [])
    if st["early"]:
        problems.append(f"{st['early']} public frames before anybody watched")
    ok = f"{st['frames']} public frames: no hand, no hand card, face-down cards unnamed"
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
