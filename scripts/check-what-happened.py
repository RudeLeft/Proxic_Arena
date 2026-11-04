"""Seeing what happened: counters' origins, why a trigger triggered, an empty library, reveals. Spec 0045.

    python -I scripts/check-what-happened.py <worker.jar> <res-root> [trace-dir] [scenario...]

  counters    Soul Warden out, then Ajani's Pridemate: while Pridemate's
              lifegain trigger waits on the stack it says why ("... gained
              1 life (Soul Warden)"), and once it resolves Pridemate's
              +1/+1 counter says where it came from (Pridemate's trigger,
              Soul Warden named)
  decking     seat 1 starts with 9 cards: the game ends with Forge's reason
              for the loss, Milled
  ringleader  Goblin Ringleader reveals the top four: the OTHER seat gets
              the four cards face up, titled by Ringleader, and once it has
              resolved each says where it went -- Goblins to the hand, the
              rest to the bottom. The caster chose the bottom order and is
              sent no reveal for it (PHASE_09 Amendment 13, item 7)

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


def game(name, one, two):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"what-happened-{name}.jsonl")
    return Game(one, two, jar=JAR, res=RES, trace=trace)


def stack_empty(g):
    return not g.state.get(1, {}).get("stack") and not g.state.get(2, {}).get("stack")


def counters():
    g = game("counters", [("Plains", 24), ("Soul Warden", 18), ("Ajani's Pridemate", 18)], [("Forest", 60)])
    st = {"cast": False, "why": [], "card": None}

    def policy(g, f):
        if f["authorisedSeat"] != 1 or f.get("kind") != "chooseSpellAbilityToPlay" or not stack_empty(g):
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        if not g.mine(1, name="Soul Warden"):
            return g.option(f, name="Soul Warden", zone="hand", land=False)
        # {1}{W}: only with two Plains to tap (an unaffordable cast is
        # offered and then cancelled).
        if not st["cast"] and len([c for c in g.mine(1, name="Plains") if not c.get("tapped")]) >= 2:
            o = g.option(f, name="Ajani's Pridemate", zone="hand", land=False)
            if o:
                st["cast"] = True
            return o
        return None

    def until(g):
        for entry in g.state.get(1, {}).get("stack") or []:
            if entry.get("name") == "Ajani's Pridemate" and entry.get("kind") == "trigger" and entry.get("why"):
                if entry["why"] not in st["why"]:
                    st["why"].append(entry["why"])
        mate = g.mine(1, name="Ajani's Pridemate")
        if mate and mate[0].get("counters") and stack_empty(g):
            st["card"] = {k: mate[0].get(k) for k in ("power", "toughness", "counters", "counterFrom")}
            return True
        return False

    g.run(policy, until=until, max_turn=14)
    found = {"why": st["why"], "card": st["card"], "stopped": g.stopped_badly()}
    if st["card"] is None:
        return "inconclusive", "Pridemate never got a counter with Soul Warden out", found
    problems = [found["stopped"]] if found["stopped"] else []
    if not any("gained 1 life" in w and "Soul Warden" in w for w in st["why"]):
        problems.append(f"Pridemate's trigger did not say why (gained 1 life, Soul Warden): {st['why']}")
    origins = st["card"].get("counterFrom") or []
    if not any(o.get("counter") == "P1P1" and "Ajani's Pridemate's trigger" in o.get("from", "")
               and "Soul Warden" in o.get("from", "") for o in origins):
        problems.append(f"the +1/+1 counter did not say where it came from: {origins}")
    ok = f"the trigger said why ({st['why'][0] if st['why'] else ''}); the counter said where from"
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


def decking():
    g = game("decking", [("Plains", 9)], [("Forest", 60)])
    g.run(lambda g, f: DEFAULT, max_turn=14)
    ended = g.ended or {}
    found = {"ended": {k: ended.get(k) for k in ("outcome", "winningSeat", "turn", "lossReason")},
             "stopped": g.stopped_badly()}
    if not ended:
        return "inconclusive", "the game did not end", found
    if ended.get("lossReason") != "Milled" or ended.get("winningSeat") != 2:
        return "wrong", f"expected seat 2 to win with seat 1 Milled: {found['ended']}", found
    return "ok", f"seat 1 lost on turn {ended.get('turn')}, Forge's reason Milled", found


def ringleader():
    deck = [("Mountain", 24), ("Goblin Ringleader", 12), ("Raging Goblin", 12), ("Shock", 12)]
    g = game("ringleader", deck, [("Forest", 60)])
    st = {"cast": False, "reveals": {}}

    def policy(g, f):
        if f["authorisedSeat"] != 1 or f.get("kind") != "chooseSpellAbilityToPlay" or not stack_empty(g):
            return DEFAULT
        land = g.play_land(f)
        if land:
            return land
        if not st["cast"]:
            o = g.option(f, name="Goblin Ringleader", zone="hand", land=False)
            if o and not any(x["actionId"] == o and x.get("payable") is False for x in f["options"]):
                st["cast"] = True
                return o
        return None

    def until(g):
        for seat in (1, 2):
            reveal = g.state.get(seat, {}).get("reveal")
            if reveal:
                st["reveals"][seat] = reveal
        settled = [s for s, r in st["reveals"].items() if all(c.get("to") for c in r.get("cards", []))]
        return st["cast"] and 2 in settled

    g.run(policy, until=until, max_turn=14)
    found = {seat: {"title": r.get("title"), "cards": [(c.get("name"), c.get("known"), c.get("to"))
                                                       for c in r.get("cards", [])]}
             for seat, r in st["reveals"].items()}
    found["stopped"] = g.stopped_badly()
    if not st["cast"] or 2 not in st["reveals"]:
        return "inconclusive", "Ringleader never revealed to the other seat", found
    problems = [found["stopped"]] if found["stopped"] else []
    if 1 in st["reveals"]:
        problems.append(f"seat 1 cast it and chose, and was still sent a reveal: {st['reveals'][1].get('title')!r}")
    for seat, reveal in st["reveals"].items():
        cards = reveal.get("cards", [])
        if not (reveal.get("title") or "").startswith("Goblin Ringleader"):
            problems.append(f"seat {seat}: titled {reveal.get('title')!r}")
        if not 1 <= len(cards) <= 4:
            problems.append(f"seat {seat}: {len(cards)} cards revealed")
        for c in cards:
            goblin = c.get("name") in ("Goblin Ringleader", "Raging Goblin")
            if not c.get("known"):
                problems.append(f"seat {seat}: a revealed card was not face up: {c.get('name')}")
            if c.get("to") != ("hand" if goblin else "bottom"):
                problems.append(f"seat {seat}: {c.get('name')} went {c.get('to')}")
    ok = "the other seat saw the four cards, each marked hand or bottom; the caster was sent none"
    return ("wrong", "; ".join(problems), found) if problems else ("ok", ok, found)


SCENARIOS = {"counters": counters, "decking": decking, "ringleader": ringleader}

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
