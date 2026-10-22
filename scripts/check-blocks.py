"""Blocks the rules forbid are refused, with Forge's reason. Owner 2026-10-21.

    python -I scripts/check-blocks.py <worker.jar> <res-root> [trace] [scenario...]

Forge's own player interface checks a whole block before accepting it
(CombatUtil.validateBlocks) and says why when it is wrong; Forge's game
loop does not check it again. So the check is the controller's job, and
the first version here skipped it: one creature could block a creature
with menace.

  menace    Boggart Brute (menace) attacks; the defender blocks with one
            Grizzly Bears and says "done". Forge's reason reaches the
            defender ("... cannot be blocked with 1 creatures ..."), they
            are asked again, take the Bear back out and are done; the
            lone block never stands, and the Brute's damage reaches the
            player.

Exit 0 when every scenario held, 1 when one did not, 2 when one never
reached its moment.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game  # noqa: E402

JAR, RES = sys.argv[1], sys.argv[2]
ARG = sys.argv[3] if len(sys.argv) > 3 else ""
TRACES = ARG if ARG and (os.path.isdir(ARG) or ARG.endswith(".jsonl")) else None
ONLY = [a for a in sys.argv[3:] if a != TRACES]
BRUTE = "Boggart Brute"


def game(name, seat1, seat2):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"blocks-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def cast(g, frame, name):
    return g.option(frame, name=name, zone="hand", land=False)


def menace():
    g = game("menace", [("Mountain", 30), (BRUTE, 30)], [("Forest", 30), ("Grizzly Bears", 30)])
    st = {"attacked": False, "blocked": 0, "asked_again": 0, "notes": [], "blocks_seen": None,
          "life_before": None, "life_after": None, "done": False, "took_back": False}

    def policy(g, f):
        kind, seat = f.get("kind"), f["authorisedSeat"]
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            return cast(g, f, BRUTE if seat == 1 else "Grizzly Bears")
        if kind == "declareAttackers" and seat == 1:
            ready = any(c.get("name") == BRUTE and not c.get("sick") for c in g.mine(1))
            bears = any(c.get("name") == "Grizzly Bears" and not c.get("tapped") for c in g.mine(2))
            if st["attacked"] or not ready or not bears:
                return None
            st["attacked"] = True
            st["life_before"] = (g.player(1, 2) or {}).get("life")
            return next((o["actionId"] for o in f["options"] if BRUTE in (o.get("label") or "")), None)
        if kind == "declareBlockers" and seat == 2 and st["attacked"] and not st["done"]:
            if st["blocked"] == 0:
                # One Bear, alone, in front of the menace creature.
                o = next((o["actionId"] for o in f["options"]
                          if (o.get("label") or "").startswith("Grizzly Bears")), None)
                if o:
                    st["blocked"] = 1
                    return o
            # "Done blocking". Refused, the defender is asked again: take
            # the Bear back out ("unblock:"), then done.
            if st["blocked"] >= 1:
                st["asked_again"] += 1
                back = next((o["actionId"] for o in f["options"]
                             if o["actionId"].startswith("unblock:")), None)
                if st["asked_again"] >= 2 and back and not st["took_back"]:
                    st["took_back"] = True
                    return back
                if st["asked_again"] > 6:
                    st["done"] = True
                return None
            return None
        if kind in ("declareAttackers", "declareBlockers"):
            return None
        return DEFAULT

    def until(g):
        c = (g.state.get(1) or {}).get("combat")
        if c and c.get("blocks") and st["blocks_seen"] is None:
            st["blocks_seen"] = c.get("blocks")
        if st["attacked"] and not c and st["life_before"] is not None and st["life_after"] is None \
                and (g.state.get(1) or {}).get("phase") in ("MAIN2", "END_OF_TURN", "CLEANUP"):
            st["life_after"] = (g.player(1, 2) or {}).get("life")
        return st["life_after"] is not None

    g.run(policy, until=until, max_turn=24)
    st["notes"] = list(g.notices.get(2, []))
    found = {k: st[k] for k in ("blocked", "asked_again", "took_back", "notes", "blocks_seen", "life_before", "life_after")}
    found["stopped"] = g.stopped_badly()
    if not st["attacked"] or st["blocked"] == 0:
        return "inconclusive", "never had the Brute attacking into a Bear", found
    problems = []
    told = [n for n in st["notes"] if "cannot be blocked with" in n]
    if not told:
        problems.append("the defender was never told why the lone block is not allowed")
    if not st["took_back"]:
        problems.append("after the refusal the defender was never offered taking the Bear back")
    # The lone block IS shown while it is being declared (the defender
    # sees their own draft); what must not happen is that it stands --
    # which the damage below decides.
    if st["life_before"] is not None and st["life_after"] is not None \
            and st["life_before"] - st["life_after"] != 3:
        problems.append(f"the Brute's 3 damage should reach the player: life {st['life_before']} -> "
                        f"{st['life_after']}")
    if problems:
        return "wrong", "; ".join(problems), found
    return "ok", "a lone block of a menace creature is refused with Forge's reason; 3 damage to the player", found


SCENARIOS = {"menace": menace}

if __name__ == "__main__":
    worst = 0
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        status, text, found = scenario()
        print(f"--- {name}")
        print(json.dumps(found, indent=2, ensure_ascii=False, default=str))
        print(f"{status.upper()}: {text}")
        worst = max(worst, {"ok": 0, "wrong": 1, "inconclusive": 2}[status])
    sys.exit(worst)
