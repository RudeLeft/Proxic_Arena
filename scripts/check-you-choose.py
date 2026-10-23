"""Colours, protection and "you may" triggers: the player's answer is what happens. PHASE_08 P8-E.

    python -I scripts/check-you-choose.py <worker.jar> <res-root> [trace-dir] [scenario...]

Each scenario is its own small game (Mechanics Lab, Layer B), answers
with the LAST option offered so no default could pass for the player,
and checks the result on the board:

  brave           Brave the Elements: "choose a colour" (Forge asks it as
                  chooseColors, one or more) -- the player's white
                  creatures gain protection from exactly that colour
  gods-willing    Gods Willing: "protection from what?"
                  (chooseProtectionType) -- the target gains protection
                  from exactly that colour; then its scry 1 is asked
  pioneer-yes     Elvish Pioneer: "use the triggered ability?"
                  (confirmTrigger) -- Yes: a basic land from the hand
                  enters the battlefield tapped
  pioneer-no      the same, No: no land enters, the hand keeps it

Every question is asked of the right player only (the caster), and the
cross-game checks (check-hidden-hands, check-snapshot-first) read these
traces in CI.

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
BEARS = [("Forest", 30), ("Grizzly Bears", 30)]


def game(name, seat1, seat2=BEARS):
    if not TRACES:
        trace = ""
    elif TRACES.endswith(".jsonl"):
        trace = TRACES[: -len(".jsonl")] + f"-{name}.jsonl"
    else:
        trace = os.path.join(TRACES, f"you-choose-{name}.jsonl")
    return Game(seat1, seat2, jar=JAR, res=RES, trace=trace)


def stack_empty(g):
    return not g.state.get(1, {}).get("stack") and not g.state.get(2, {}).get("stack")


def cast(g, f, name):
    o = g.option(f, name=name, zone="hand", land=False)
    if o and any(x["actionId"] == o and x.get("payable") is False for x in f["options"]):
        return None
    return o


def creature(g, name):
    return next((c for c in g.mine(1, name=name)), None)


def protection(g, name):
    c = creature(g, name)
    return [k for k in (c or {}).get("keywords", []) or [] if "rotection" in k]


def protect(name, spell, kind):
    """Cast `spell` on/for seat 1's Savannah Lions; answer `kind` with the last colour offered."""
    g = game(name, [("Plains", 24), ("Savannah Lions", 18), (spell, 18)])
    st = {"cast": False, "asked": [], "picked": None, "after": None}

    def policy(g, f):
        k = f.get("kind")
        if k == kind:
            st["asked"].append((f["authorisedSeat"], [o.get("label") for o in f["options"]]))
            st["picked"] = f["options"][-1].get("label")
            return f["options"][-1]["actionId"]
        if f["authorisedSeat"] == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            if not st["cast"] and creature(g, "Savannah Lions") and cast(g, f, spell):
                st["cast"] = True
                return cast(g, f, spell)
            return g.play_land(f) or cast(g, f, "Savannah Lions")
        if k == "chooseTargetsFor" and f["authorisedSeat"] == 1:
            return next((o["actionId"] for o in f["options"] if "Savannah Lions" in (o.get("label") or "")), DEFAULT)
        if k == "willPutCardOnTop":
            return f["options"][0]["actionId"]
        return DEFAULT

    def until(g):
        if st["picked"] and stack_empty(g) and st["after"] is None:
            st["after"] = protection(g, "Savannah Lions")
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"asked": st["asked"], "picked": st["picked"], "protection": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", f"{spell} never asked {kind}", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the opponent was asked about seat 1's spell")
    if len(st["asked"][0][1]) < 2:
        problems.append(f"only {st['asked'][0][1]} offered: no choice to prove")
    # Exactly Forge's words for it, as the board shows them.
    if st["after"] != [f"Protection from {st['picked'].lower()}"]:
        problems.append(f"picked {st['picked']!r}, but the Lions have {st['after']}")
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", f"{spell}: the colour picked, {st['picked']}, is the protection the Lions have", found)


def pioneer(yes):
    g = game(f"pioneer-{'yes' if yes else 'no'}", [("Forest", 30), ("Elvish Pioneer", 30)])
    st = {"cast": False, "asked": [], "before": None, "after": None}

    def lands(seat=1):
        return [c["id"] for c in g.mine(seat) if c.get("kind") == "land"]

    def hand_lands():
        return [c["id"] for c in g.zone(1, "hand") if c.get("name") == "Forest"]

    def policy(g, f):
        k = f.get("kind")
        if k == "confirmTrigger":
            st["asked"].append((f["authorisedSeat"], f.get("prompt")))
            st["before"] = {"lands": lands(), "hand": hand_lands()}
            return "confirm:yes" if yes else "confirm:no"
        if k == "chooseSingleEntityForEffect" and st["asked"] and f["authorisedSeat"] == 1:
            # Yes, then which basic land from the hand: a Forest.
            return next((o["actionId"] for o in f["options"] if (o.get("label") or "").startswith("Forest")), DEFAULT)
        if f["authorisedSeat"] == 1 and k == "chooseSpellAbilityToPlay":
            if not stack_empty(g):
                return None
            # Cast it while holding a Forest to put in, with this turn's land already played.
            if not st["cast"] and hand_lands() and len(lands()) >= 1 and not g.option(f, land=True):
                o = cast(g, f, "Elvish Pioneer")
                if o:
                    st["cast"] = True
                    return o
            return g.play_land(f)
        return DEFAULT

    def until(g):
        if st["asked"] and stack_empty(g) and st["after"] is None:
            st["after"] = {"lands": lands(), "hand": hand_lands(),
                           "tapped": [c["id"] for c in g.mine(1) if c.get("kind") == "land" and c.get("tapped")]}
        return st["after"] is not None

    g.run(policy, until=until, max_turn=20)
    found = {"asked": st["asked"], "before": st["before"], "after": st["after"], "stopped": g.stopped_badly()}
    if not st["asked"]:
        return "inconclusive", "Elvish Pioneer's trigger was never asked about", found
    problems = []
    if any(seat != 1 for seat, _ in st["asked"]):
        problems.append("the opponent was asked about seat 1's trigger")
    new = [c for c in st["after"]["lands"] if c not in st["before"]["lands"]]
    if yes:
        if len(new) != 1:
            problems.append(f"said Yes, but {len(new)} lands entered")
        elif new[0] not in st["before"]["hand"]:
            problems.append(f"the land that entered, {new[0]}, was not one from the hand")
        elif new[0] not in st["after"]["tapped"]:
            problems.append("the land entered untapped; the card says tapped")
    elif new:
        problems.append(f"said No, but {new} entered")
    if found["stopped"]:
        problems.append(found["stopped"])
    return ("wrong", "; ".join(problems), found) if problems else \
        ("ok", "Elvish Pioneer: Yes put a Forest from the hand onto the battlefield tapped" if yes
         else "Elvish Pioneer: No, and nothing entered", found)


SCENARIOS = {"brave": lambda: protect("brave", "Brave the Elements", "chooseColors"),
             "gods-willing": lambda: protect("gods-willing", "Gods Willing", "chooseProtectionType"),
             "pioneer-yes": lambda: pioneer(True), "pioneer-no": lambda: pioneer(False)}

if __name__ == "__main__":
    codes = []
    for name, scenario in SCENARIOS.items():
        if ONLY and name not in ONLY:
            continue
        result, message, found = scenario()
        codes.append({"ok": 0, "inconclusive": 2, "wrong": 1}[result])
        print(f"{name}: {result.upper()}: {message}")
        if result != "ok":
            print("  " + json.dumps(found, default=str)[:1200])
        sys.stdout.flush()
    sys.exit(1 if 1 in codes else max(codes, default=0))
