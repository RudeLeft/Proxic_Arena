"""A coin flip: Forge flips, the player calls, everyone is told. P6-AM, §6.89.

    python -I scripts/check-coin-flip.py <worker.jar> <res-root> [trace] [scenario...]

  krark  Krark, the Thumbless: every instant or sorcery its controller
         casts is flipped for. The player CALLS (heads or tails) and
         FORGE flips; spec 0075 (owner 2026-11-12): the outcome is told to
         both players in the report window ("Alice flipped a coin and
         won." / "You flipped a coin and won.", a coin picture), no grey
         line to anyone; a lost flip
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
import re
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
        trace = os.path.join(TRACES, f"coin-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace, deal=deal)


def seat2_bears(g, frame):
    if frame.get("kind") == "chooseSpellAbilityToPlay":
        return g.play_land(frame) or (g.option(frame, name="Grizzly Bears", zone="hand", land=False)
                                      if len(g.untapped_lands(2)) >= 2 else None)
    return DEFAULT


TOLD = {1: [], 2: []}     # every flip report each seat was sent (spec 0075), one per report
KEYS = {1: set(), 2: set()}
GREY = {1: [], 2: []}     # any grey line about a flip: none may come (spec 0075)
LAST = {1: [], 2: []}     # the notices window in that seat's previous board


def follow(g):
    """Each new report window that tells a flip; and any grey flip line."""
    for seat in (1, 2):
        s = g.state.get(seat, {})
        a = s.get("action")
        if a and a.get("key") not in KEYS[seat] and "flipped a coin" in (a.get("said") or ""):
            KEYS[seat].add(a.get("key"))
            TOLD[seat].append(a)
        now = s.get("notices") or []
        prev = LAST[seat]
        overlap = next((m for m in range(min(len(prev), len(now)), -1, -1) if now[:m] == prev[len(prev) - m:]), 0)
        GREY[seat].extend(n for n in now[overlap:] if "flip" in n)
        LAST[seat] = list(now)


def flips(g, seat):
    return TOLD[seat]


def krark():
    # The deal: Krark on turn 2 and Bolts to cast with him out. The flips
    # themselves are Forge's coin, not the deal.
    g = game("krark", [("Mountain", 24), ("Krark, the Thumbless", 8), ("Lightning Bolt", 28)],
             deal={1: {"hand": ["Mountain", "Mountain", "Mountain", "Krark, the Thumbless",
                                "Lightning Bolt", "Lightning Bolt", "Lightning Bolt"],
                       "top": ["Mountain", "Lightning Bolt"] * 3}})
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
    told = {seat: [a.get("said") for a in flips(g, seat)] for seat in (1, 2)}
    found = {"calls": st["calls"], "told": told, "grey": GREY, "bolts": len(st["bolts"]),
             "new_targets": len(st["new_targets"]), "refused": g.refused, "stopped": g.stopped_badly()}
    if len(st["calls"]) < 4:
        return "inconclusive", "never cast four instants with Krark out", found
    problems = [found["stopped"]] if found["stopped"] else []
    if any(c["labels"] != ["Heads", "Tails"] for c in st["calls"]):
        problems.append(f"the player calls heads or tails: {st['calls']}")
    if len(told[2]) < len(st["calls"]):
        problems.append(f"each flip's outcome must reach the other player: {len(st['calls'])} calls, told {told[2]}")
    if len(told[1]) < len(st["calls"]):
        problems.append(f"the flipper is shown each own flip too (owner 2026-11-12): {told[1]}")
    if any(not re.match(r"^You flipped a coin and (won|lost)\.$", n or "") for n in told[1]):
        problems.append(f"the flipper's window says 'You flipped ...': {told[1]}")
    if [n.split()[-1] for n in told[1]] != [n.split()[-1] for n in told[2]][:len(told[1])]:
        problems.append(f"a flip is public: both read the same outcome: {told}")
    if GREY[1] or GREY[2]:
        problems.append(f"no grey line repeats a flip (spec 0075): {GREY}")
    if any(not re.match(r"^Alice flipped a coin and (won|lost)\.$", n or "") for n in told[2]):
        problems.append(f"the window says who flipped and how it went: {told[2]}")
    if any(not any(m.get("kind") == "coin" for m in a.get("marks") or []) for a in flips(g, 2)):
        problems.append(f"each flip's window carries a coin picture: {[a.get('marks') for a in flips(g, 2)]}")
    won = [n for n in told[2] if n and n.endswith("won.")]
    lost = [n for n in told[2] if n and n.endswith("lost.")]
    if len(st["new_targets"]) != len(won):
        problems.append(f"each won flip copies the spell, and the copy's new target is the player's choice: "
                        f"{len(won)} won, asked {len(st['new_targets'])} times")
    dupes = found["refused"]
    if dupes < len(st["calls"]):
        problems.append(f"every second call must be refused: {len(st['calls'])} calls, {dupes} refused")
    return result(problems, f"{len(st['calls'])} calls, each refused when answered again; Forge's outcomes told "
                            f"to both players in the report window ({len(won)} won: copied, new target asked; "
                            f"{len(lost)} lost)", found)


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
