"""A coin flip: Forge flips, the player calls, everyone is told. P6-AM, §6.89.

    python -I scripts/check-coin-flip.py <worker.jar> <res-root> [trace] [scenario...]

  krark  Krark, the Thumbless: every instant or sorcery its controller
         casts is flipped for. The player CALLS (heads or tails) and
         FORGE flips; the outcome is told to both players; a lost flip
         returns the spell to its owner's hand, a won one copies it
         (and the copy's new target is the player's choice). Each call
         is answered TWICE -- the first answer, then a different call
         -- and the second must be refused: an answer cannot reroll.

Reconnecting is P6-S/P6-T's (the pending call stays the same question,
answered once); this check covers the duplicate.

Exit 0 when the scenario held, 1 when it did not, 2 when it never
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
        trace = os.path.join(TRACES, f"coin-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def seat2_bears(g, frame):
    if frame.get("kind") == "chooseSpellAbilityToPlay":
        return g.play_land(frame) or (g.option(frame, name="Grizzly Bears", zone="hand", land=False)
                                      if len(g.untapped_lands(2)) >= 2 else None)
    return DEFAULT


TOLD = {1: [], 2: []}     # every flip notice each seat was sent, repeats included
LAST = {1: [], 2: []}     # the notices window in that seat's previous board


def follow(g):
    """Notices are a rolling window; collect what each board appended."""
    for seat in (1, 2):
        now = g.state.get(seat, {}).get("notices") or []
        prev = LAST[seat]
        overlap = next((m for m in range(min(len(prev), len(now)), -1, -1) if now[:m] == prev[len(prev) - m:]), 0)
        TOLD[seat].extend(n for n in now[overlap:] if "the flip" in n)
        LAST[seat] = list(now)


def flips(g, seat):
    return TOLD[seat]


def krark():
    g = game("krark", [("Mountain", 24), ("Krark, the Thumbless", 8), ("Lightning Bolt", 28)])
    st = {"bolts": [], "calls": [], "new_targets": []}

    def policy(g, f):
        if f["authorisedSeat"] == 2:
            return seat2_bears(g, f)
        kind = f.get("kind")
        prompt = f.get("prompt") or ""
        if kind == "chooseSpellAbilityToPlay":
            land = g.play_land(f)
            if land:
                return land
            if not g.mine(1, name="Krark, the Thumbless"):
                return g.option(f, name="Krark, the Thumbless", zone="hand", land=False)
            if len(st["calls"]) < 4 and not g.state.get(1, {}).get("stack") and g.untapped_lands(1):
                o = g.option(f, name="Lightning Bolt", zone="hand", land=False)
                if o:
                    st["bolts"].append({"card": card_of(o), "turn": g.turn})
                return o
            return None
        if kind == "chooseBinary" and "coin" in prompt.lower():
            labels = {o.get("label"): o["actionId"] for o in f["options"]}
            first, second = labels.get("Heads"), labels.get("Tails")
            st["calls"].append({"labels": sorted(labels), "flips_told_before": len(flips(g, 1))})
            # The real answer, sent here; the harness then sends the
            # SECOND, different call, which must be refused.
            g.answer(f, first)
            return second
        if kind == "chooseTargetsFor":
            if prompt.startswith("New target"):
                st["new_targets"].append([o.get("label") for o in f["options"]])
            # Bob, never Alice: a won flip's copy must not end the game early.
            return next((o["actionId"] for o in f["options"] if o.get("label") == "Bob"), DEFAULT)
        return DEFAULT

    def until(g):
        follow(g)
        # The duplicate call's refusal can arrive after the next board,
        # so wait for every refusal too, or the last one goes uncounted.
        return (len(st["calls"]) >= 4 and not g.state.get(1, {}).get("stack")
                and len(TOLD[2]) >= len(st["calls"]) and g.refused >= len(st["calls"]))

    g.run(policy, until=until, max_turn=40)
    told = {seat: flips(g, seat) for seat in (1, 2)}
    found = {"calls": st["calls"], "told": told, "bolts": len(st["bolts"]), "new_targets": len(st["new_targets"]),
             "refused": g.refused, "stopped": g.stopped_badly()}
    if len(st["calls"]) < 4:
        return "inconclusive", "never cast four instants with Krark out", found
    problems = [found["stopped"]] if found["stopped"] else []
    if any(c["labels"] != ["Heads", "Tails"] for c in st["calls"]):
        problems.append(f"the player calls heads or tails: {st['calls']}")
    if len(told[1]) < len(st["calls"]):
        problems.append(f"each flip's outcome must reach the player: {len(st['calls'])} calls, told {told[1]}")
    outcome = lambda texts: ["win" if " win" in n else "lose" for n in texts]  # noqa: E731
    if outcome(told[2]) != outcome(told[1]):
        problems.append(f"a flip is public: the opponent was told {told[2]}, the flipper {told[1]}")
    won = [n for n in told[1] if "win" in n.lower()]
    lost = [n for n in told[1] if "lose" in n.lower()]
    if any(": You " not in n for n in told[1]) or any(": Alice " not in n for n in told[2]):
        problems.append(f"each player is told who flipped: {told}")
    if len(st["new_targets"]) != len(won):
        problems.append(f"each won flip copies the spell, and the copy's new target is the player's choice: "
                        f"{len(won)} won, asked {len(st['new_targets'])} times")
    dupes = found["refused"]
    if dupes < len(st["calls"]):
        problems.append(f"every second call must be refused: {len(st['calls'])} calls, {dupes} refused")
    return result(problems, f"{len(st['calls'])} calls, each refused when answered again; Forge's outcomes told "
                            f"to both players ({len(won)} won: copied, new target asked; {len(lost)} lost)", found)


def result(problems, ok, found):
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


SCENARIOS = {"krark": krark}

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
