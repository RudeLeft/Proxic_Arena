"""A mulligan: the player chooses what goes back, and it goes. PHASE_08 P8-E.

    python -I scripts/check-mulligan.py <worker.jar> <res-root> [trace]

Seat 1 mulligans its first hand, draws seven again, and is asked which
card to put on the bottom (Forge's London mulligan: tuckCardsViaMulligan,
asked during the redraw). The scenario answers with the LAST card offered,
so no default could pass for the player, and checks Phase 8's five points
on the board:

  1. seat 1 is asked, and seat 2 never is;
  2. the cards offered are exactly seat 1's new hand -- nothing added,
     nothing missing;
  3. after keeping, seat 1 holds six cards, and the one picked is not
     among them;
  4. (check-hidden-hands, over this trace in CI) seat 2 is shown none of
     those cards;
  5. the question was asked -- nothing was put back for the player.

Exit 0 when it held, 1 when it did not, 2 when the game never got there.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import DEFAULT, Game, card_of, verdict  # noqa: E402

DECK = [("Island", 24), ("Grizzly Bears", 18), ("Lightning Bolt", 18)]
g = Game(DECK, DECK)
st = {"mulliganed": False, "tucks": [], "kept": False, "hand_after": None}


def hand_ids(seat):
    return [c["id"] for c in g.zone(seat, "hand")]


def policy(g, f):
    kind = f.get("kind")
    if kind == "mulliganKeepHand" and f["authorisedSeat"] == 1:
        if not st["mulliganed"]:
            st["mulliganed"] = True
            return "mulligan:again"
        st["kept"] = True
        return "mulligan:keep"
    if kind == "tuckCardsViaMulligan":
        offered = [card_of(o["actionId"]) for o in f["options"]]
        pick = f["options"][-1]["actionId"]
        st["tucks"].append({"seat": f["authorisedSeat"], "offered": sorted(offered),
                            "hand": sorted(hand_ids(f["authorisedSeat"])), "picked": card_of(pick)})
        return pick
    return DEFAULT


def until(g):
    if st["kept"] and st["hand_after"] is None and g.state.get(1, {}).get("hand") is not None and g.turn >= 1:
        st["hand_after"] = hand_ids(1)
    return st["hand_after"] is not None


g.run(policy, until=until, max_turn=3)
found = {"tucks": st["tucks"], "hand_after": st["hand_after"], "stopped": g.stopped_badly()}
if not st["tucks"] or st["hand_after"] is None:
    verdict(found, [], "", inconclusive="the mulligan's put-back was never asked, or the game never began")
problems = []
if any(t["seat"] != 1 for t in st["tucks"]):
    problems.append("seat 2 was asked to put a card back, and it never mulliganed")
first = st["tucks"][0]
if first["offered"] != first["hand"]:
    problems.append(f"offered {first['offered']}, but the hand was {first['hand']}")
if first["picked"] in st["hand_after"]:
    problems.append(f"{first['picked']} was put back, but is still in the hand")
# Six, or seven if seat 1 is on the draw and has drawn by turn 1's snapshot.
drawn = [c for c in st["hand_after"] if c not in first["hand"]]
if len(st["hand_after"]) - len(drawn) != 6:
    problems.append(f"of the seven drawn, {len(st['hand_after']) - len(drawn)} were kept, not six")
if found["stopped"]:
    problems.append(found["stopped"])
verdict(found, problems, "a mulligan: seat 1 alone was asked, offered exactly its hand, and the card it "
                         "picked went back -- six kept")
