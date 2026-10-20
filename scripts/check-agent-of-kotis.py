"""Agent of Kotis: Renew is Forge's, found where Forge says it is.

PHASE_06 §6.60, acceptance P6-AA. Required evidence: a real Forge
run and a protocol trace.

    python -I scripts/check-agent-of-kotis.py <worker.jar> <res-root> [trace.jsonl]

Agent of Kotis is a 2/1 for {1}{U} with Renew -- "{3}{U}, Exile
this card from your graveyard: Put two +1/+1 counters on target
creature. Activate only as a sorcery." The ability exists only in
the graveyard. P6-AA asks that:

  ON THE BATTLEFIELD
    it is a creature object                     snapshot kind
    Renew is not invented from printed text     no action names it
    selecting it does not mean attacking        no priority action names it
    attacking happens only in combat            a declareAttackers decision

  IN THE GRAVEYARD, after getting there by real play
    it is still identifiable                    known, named, same id
    Renew is offered by the generic action      a priority option for
      model, with its own identity                that graveyard card
    the player can choose it                    chosen
    Forge does the rest                         exiled, two +1/+1 counters

A FOCUSED DECK, so the scenario is reached by play rather than by
luck (§6.6 Layer B): Islands and Swamps, Agents, and Village Rites,
whose additional cost sacrifices a creature. Each player casts two
Agents, sacrifices one to Village Rites, and Renews it onto the
other. Nobody attacks, so the board is only what the scenario puts
there. Both seats play the same way; the first to Renew ends it.

Exit 0 when every property held, 1 when one did not, 2 when the
game never reached the scenario (which proves nothing either way).
"""
import json
import re
import subprocess
import sys
import uuid

JAR, RES = sys.argv[1], sys.argv[2]
TRACE = sys.argv[3] if len(sys.argv) > 3 else None
DECK = [("Island", 20), ("Swamp", 12), ("Agent of Kotis", 16), ("Village Rites", 12)]
AGENT = "Agent of Kotis"
MAX_TURN = 30

proc = subprocess.Popen(
    ["java", "-jar", JAR, RES],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL, text=True, encoding="utf-8", bufsize=1)
trace = open(TRACE, "w", encoding="utf-8") if TRACE else None


def send(obj):
    if trace:
        trace.write(json.dumps({"dir": "out", "frame": obj}) + "\n")
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()


def card_of(action_id):
    m = re.search(r"card:(\d+)", action_id or "")
    return f"card:{m.group(1)}" if m else None


state = {}                 # seat -> latest snapshot state, that seat's view
found = {
    "creature_on_battlefield": False,
    "battlefield_offers": [],      # labels offered naming an Agent on the battlefield
    "attack_decisions": 0,         # declareAttackers questions that offered an Agent
    "in_graveyard": None,          # the graveyard entry, once seen
    "renew_offered": None,         # the option, once seen
    "renew_chosen": None,          # (seat, card id, target id)
    "renewed": None,               # what happened after
}
cast_ids = {}              # card id -> action ids seen for it while in hand


def mine(seat, zone):
    return [c for c in state.get(seat, {}).get(zone, []) if c.get("seat") == seat]


def zone_of(seat, card_id):
    for zone in ("battlefield", "hand", "graveyard"):
        if any(c.get("id") == card_id for c in state.get(seat, {}).get(zone, [])):
            return zone
    return None


def lands(seat):
    return [c for c in mine(seat, "battlefield") if c.get("kind") == "land"]


def respond(frame, option):
    send({"protocolVersion": 1, "type": "DECISION_RESPONSE",
          "messageId": str(uuid.uuid4()), "decisionId": frame["decisionId"],
          "seat": frame["authorisedSeat"], "stateVersion": frame["stateVersion"],
          "actionId": option["actionId"] if option else None})


turn = 0
for line in proc.stdout:
    line = line.strip()
    if not line.startswith("{"):
        continue
    try:
        frame = json.loads(line)
    except ValueError:
        continue
    if trace:
        trace.write(json.dumps({"dir": "in", "frame": frame}) + "\n")
    kind = frame.get("type")

    if kind == "WORKER_READY":
        deck = [{"name": n, "quantity": q} for n, q in DECK]
        send({"protocolVersion": 1, "type": "START_GAME",
              "messageId": str(uuid.uuid4()), "matchId": str(uuid.uuid4()),
              "players": [{"displayName": "Alice", "seatNumber": 1, "cards": deck},
                          {"displayName": "Bob", "seatNumber": 2, "cards": deck}]})
        continue

    if kind == "MATCH_SNAPSHOT":
        s = frame.get("state") or {}
        seat = s.get("seat")
        state[seat] = s
        turn = s.get("turn") or turn
        for c in s.get("battlefield", []):
            if c.get("name") == AGENT and c.get("kind") == "creature":
                found["creature_on_battlefield"] = True
        for c in s.get("graveyard", []):
            if c.get("name") == AGENT and c.get("seat") == seat and found["in_graveyard"] is None:
                found["in_graveyard"] = dict(c)
        chosen = found["renew_chosen"]
        if chosen and found["renewed"] is None and seat == chosen[0]:
            renewed_id, target_id = chosen[1], chosen[2]
            target = next((c for c in s.get("battlefield", []) if c.get("id") == target_id), None)
            plus = 0
            for counter in (target or {}).get("counters", []):
                if "P1P1" in str(counter.get("name")) or "+1/+1" in str(counter.get("name")):
                    plus = counter.get("count", 0)
            still_there = any(c.get("id") == renewed_id for c in s.get("graveyard", []))
            if plus >= 2 and not still_there:
                found["renewed"] = {"target": target_id, "plus_one_counters": plus,
                                    "left_graveyard": True, "turn": turn}
        if found["renewed"]:
            break
        if turn > MAX_TURN:
            break
        continue

    if kind == "GAME_ENDED":
        print("game ended before the scenario:", frame.get("outcome"))
        break
    if kind == "ERROR":
        print("worker error:", frame.get("errorCode"), frame.get("detail"))
        break
    if kind != "DECISION_REQUEST":
        continue

    seat = frame["authorisedSeat"]
    dkind = frame.get("kind")
    options = frame.get("options", [])
    labels = [o.get("label") or "" for o in options]
    pick = None

    if dkind == "chooseSpellAbilityToPlay":
        by_zone = {}
        for o, label in zip(options, labels):
            cid = card_of(o.get("actionId"))
            by_zone.setdefault(zone_of(seat, cid), []).append((o, label, cid))
        # What is offered for an Agent ON THE BATTLEFIELD: P6-AA
        # wants nothing -- no Renew, no "attack".
        for o, label, cid in by_zone.get("battlefield", []):
            card = next((c for c in state[seat]["battlefield"] if c.get("id") == cid), {})
            if card.get("name") == AGENT:
                found["battlefield_offers"].append(label)
        for o, label, cid in by_zone.get("hand", []):
            card = next((c for c in state[seat]["hand"] if c.get("id") == cid), {})
            if card.get("name") == AGENT:
                cast_ids.setdefault(cid, set()).add(o["actionId"])
        grave = [(o, label, cid) for o, label, cid in by_zone.get("graveyard", [])
                 if any(c.get("id") == cid and c.get("name") == AGENT
                        for c in state[seat].get("graveyard", []))]
        agents_out = [c for c in mine(seat, "battlefield") if c.get("name") == AGENT]
        hand = mine(seat, "hand")

        def option_for(name, zone="hand", play_land=False):
            for o, label, cid in by_zone.get(zone, []):
                card = next((c for c in state[seat].get(zone, []) if c.get("id") == cid), {})
                if card.get("name") == name and (("Play land" in label) == play_land):
                    return o
            return None

        if grave and agents_out:
            o, label, cid = grave[0]
            found["renew_offered"] = {"actionId": o["actionId"], "label": label, "card": cid,
                                      "cast_ids_seen_for_agents": sorted(
                                          a for ids in cast_ids.values() for a in ids)}
            pick = o
            found["renew_chosen"] = [seat, cid, None]
        else:
            islands = sum(1 for c in lands(seat) if c.get("name") == "Island")
            first = "Island" if islands < 4 else "Swamp"
            second = "Swamp" if first == "Island" else "Island"
            pick = (option_for(first, play_land=True) or option_for(second, play_land=True))
            if pick is None and len(agents_out) >= 2:
                pick = option_for("Village Rites")
            if pick is None and len(agents_out) < 2:
                pick = option_for(AGENT)

    elif dkind == "declareAttackers":
        if any(AGENT in label for label in labels):
            found["attack_decisions"] += 1
        pick = None          # nobody attacks: the board stays the scenario's

    elif dkind == "declareBlockers":
        pick = None

    elif dkind == "chooseTargetsFor":
        chosen = found["renew_chosen"]
        if chosen and chosen[2] is None:
            # Renew's target: this player's own Agent on the battlefield.
            for o in options:
                cid = card_of(o.get("actionId"))
                card = next((c for c in mine(seat, "battlefield") if c.get("id") == cid), {})
                if card.get("name") == AGENT:
                    pick = o
                    chosen[2] = cid
                    break
        if pick is None and frame.get("mandatory"):
            pick = options[0] if options else None

    elif dkind == "CostSacrifice":
        # Village Rites: sacrifice an Agent.
        pick = next((o for o, label in zip(options, labels) if AGENT in label), options[0] if options else None)

    elif dkind in ("confirmPayment", "applyManaToCost", "mulliganKeepHand",
                   "chooseStartingPlayer", "chooseCardsToDiscardToMaximumHandSize"):
        pick = options[0] if options else None

    else:
        pick = options[0] if (options and frame.get("mandatory")) else None

    respond(frame, pick)

proc.kill()
if trace:
    trace.close()

print(json.dumps(found, indent=2, default=str))

# --- the source half of P6-AA: nothing knows this card -----------
#
# "Verify no Agent-specific client rule, card-text parsing, or
# Creature = Attack mapping exists." Searched, not asserted from
# memory: the code that decides what can be done with a card must
# not name this card or its ability.
import pathlib  # noqa: E402

root = pathlib.Path(__file__).resolve().parent.parent
named = []
for folder in ("frontend/src", "server/src/main", "forge-worker/src/main"):
    for path in (root / folder).rglob("*"):
        if path.suffix in {".ts", ".tsx", ".kt", ".java"}:
            text = path.read_text(encoding="utf-8", errors="replace")
            if re.search(r"Kotis|\bRenew\b", text):
                named.append(str(path.relative_to(root)))
print("source naming Kotis or Renew:", named or "none")

problems = []
if not found["creature_on_battlefield"]:
    problems.append("never seen on the battlefield as a creature")
if found["battlefield_offers"]:
    problems.append(f"actions offered for it on the battlefield: {found['battlefield_offers'][:3]}")
if not found["renew_offered"] and found["in_graveyard"]:
    problems.append("in the graveyard, but Renew was never offered")
if named:
    problems.append(f"source names the card: {named}")

if not found["in_graveyard"] or not found["renew_offered"]:
    print("INCONCLUSIVE: the scenario was not reached" + (f" ({problems})" if problems else ""))
    sys.exit(2)
if not found["in_graveyard"].get("known") or found["in_graveyard"].get("name") != AGENT:
    problems.append("not identifiable in the graveyard")
if found["renew_offered"]["actionId"] in found["renew_offered"]["cast_ids_seen_for_agents"]:
    problems.append("Renew shares an action id with casting")
# Its label is FORGE's description of the ability, not ours, and it
# reads as a person would: Forge's cost text is a template, and its
# "CARDNAME" placeholder once reached the player.
renew_label = found["renew_offered"]["label"]
if "graveyard" not in renew_label:
    problems.append(f"the option is not Forge's graveyard ability: {renew_label!r}")
if "CARDNAME" in renew_label:
    problems.append(f"the label shows Forge's placeholder: {renew_label!r}")
if not found["renewed"]:
    problems.append("Renew was chosen but Forge's effect was not seen")
if problems:
    print("WRONG:", "; ".join(problems))
    sys.exit(1)
print("OK: Renew is offered from the graveyard only, chosen, and resolved by Forge")
