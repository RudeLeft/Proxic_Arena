package net.barnflix.proxic.worker.game;

import forge.game.GameEntity;
import forge.game.card.Card;
import forge.game.combat.Combat;
import forge.game.combat.CombatUtil;
import forge.game.player.Player;
import forge.game.zone.ZoneType;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;

/**
 * Attacking and blocking — PHASE_06 §6.94, §6.50, FORGE-RULE.
 *
 * Combat is the part of Magic with the most choices per turn and
 * the fewest that a client may make on a player's behalf. Who
 * attacks, who they attack, and who blocks what are all the
 * player's; whether any of it is LEGAL is Forge's, through
 * `CombatUtil.canAttack` and `CombatUtil.canBlock`. Nothing here
 * reasons about flying, menace, defender, summoning sickness or
 * tap state — asking Forge is both correct and shorter.
 *
 * Declared one creature at a time rather than as a set. That is
 * how a player does it, it needs no new protocol shape, and each
 * answer is final on its own: a half-made attack cannot be
 * submitted. "Done" ends the step, which is why these decisions
 * are NOT mandatory — declining to attack is a real and common
 * answer.
 *
 * Forge's own human input re-checks legality as each attacker is
 * added, because adding one can make another illegal. This does
 * the same by rebuilding the candidate list every round.
 */
final class CombatChoices {

    private final GameHost host;
    private final int actedForSeat;
    private final int authorisedSeat;
    /** Whose question it is: names follow what THEY may know (P6-I). */
    private final forge.game.player.PlayerView viewer;

    CombatChoices(GameHost host, int actedForSeat, int authorisedSeat, forge.game.player.PlayerView viewer) {
        this.host = host;
        this.actedForSeat = actedForSeat;
        this.authorisedSeat = authorisedSeat;
        this.viewer = viewer;
    }

    /**
     * Who attacks, and what they attack.
     *
     * Two questions per attacker, and the second is skipped when
     * there is only one thing to attack — which in a two-player
     * game is almost always true, so it is almost always one
     * click per creature.
     */
    void declareAttackers(Player attacker, Combat combat) throws InterruptedException {
        List<GameEntity> defenders = new ArrayList<>();
        combat.getDefenders().forEach(defenders::add);
        if (defenders.isEmpty()) {
            return;
        }

        while (true) {
            LinkedHashMap<String, Card> byId = new LinkedHashMap<>();
            LinkedHashMap<String, String> labels = new LinkedHashMap<>();
            for (Card creature : attacker.getCardsIn(ZoneType.Battlefield)) {
                if (combat.isAttacking(creature)) {
                    continue;
                }
                // FORGE decides whether it can attack anything at
                // all. Re-asked every round because declaring one
                // attacker can change the answer for another.
                boolean canAttackSomething =
                        defenders.stream().anyMatch(d -> CombatUtil.canAttack(creature, d));
                if (!canAttackSomething) {
                    continue;
                }
                String id = "attacker:card:" + creature.getId();
                byId.put(id, creature);
                labels.put(id, describe(creature));
            }
            if (byId.isEmpty()) {
                return;
            }
            // PHASE_07 AMENDMENT 13 — "All attack", as MTG Arena has: every
            // creature still offered, in one answer. Last, and naming no
            // card, so an answer that takes the first option, or picks a
            // creature by its card, means what it always meant.
            java.util.List<String> offered = new ArrayList<>(byId.keySet());
            if (byId.size() >= 2) {
                offered.add(ALL_ATTACK);
                labels.put(ALL_ATTACK, "All attack");
            }

            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            "declareAttackers",
                            offered,
                            false,
                            "Choose a creature to attack with, or pass to stop attacking.",
                            pending -> host.publishDecision(pending, labels));

            if (DecisionGate.PASS.equals(choice)) {
                // Done attacking. Not an error and not a
                // failure: most turns end here.
                return;
            }
            if (ALL_ATTACK.equals(choice)) {
                // Each as if chosen one by one: Forge still decides whom
                // each may attack, and asks when there is a choice.
                for (Card each : byId.values()) {
                    GameEntity defender = chooseDefender(each, defenders);
                    if (defender != null && !combat.isAttacking(each)) {
                        combat.addAttacker(each, defender);
                    }
                }
                continue;
            }
            Card chosen = byId.get(choice);
            if (chosen == null) {
                return;
            }

            GameEntity defender = chooseDefender(chosen, defenders);
            if (defender == null) {
                continue;
            }
            combat.addAttacker(chosen, defender);
        }
    }

    /** AMENDMENT 13 — every creature still offered attacks, in one answer. */
    static final String ALL_ATTACK = "attackers:all";

    /** Which player or planeswalker this creature attacks. */
    private GameEntity chooseDefender(Card attacker, List<GameEntity> defenders)
            throws InterruptedException {
        List<GameEntity> legal = new ArrayList<>();
        for (GameEntity defender : defenders) {
            if (CombatUtil.canAttack(attacker, defender)) {
                legal.add(defender);
            }
        }
        if (legal.isEmpty()) {
            return null;
        }
        // One legal defender is not a choice. In a two-player
        // game with no planeswalkers that is every attack.
        if (legal.size() == 1) {
            return legal.get(0);
        }

        LinkedHashMap<String, GameEntity> byId = new LinkedHashMap<>();
        LinkedHashMap<String, String> labels = new LinkedHashMap<>();
        for (GameEntity defender : legal) {
            String id = (defender instanceof Card card)
                    ? "defender:card:" + card.getId()
                    : "defender:player:" + defender.getId();
            byId.put(id, defender);
            labels.put(id, String.valueOf(defender));
        }
        String choice =
                host.gate().ask(
                        actedForSeat,
                        authorisedSeat,
                        "chooseDefender",
                        new ArrayList<>(byId.keySet()),
                        true,
                        "What does " + attacker.getName() + " attack?",
                        pending -> host.publishDecision(pending, labels));
        return byId.get(choice);
    }

    /**
     * Who blocks what.
     *
     * The attacker is chosen first and then the blocker, because
     * that is the question a defending player actually asks:
     * "what do I do about THAT one". Forge decides whether the
     * block is legal.
     */
    void declareBlockers(Player defender, Combat combat) throws InterruptedException {
        while (true) {
            List<Card> attackers = new ArrayList<>(combat.getAttackers());
            if (attackers.isEmpty()) {
                return;
            }

            LinkedHashMap<String, Card> blockerById = new LinkedHashMap<>();
            LinkedHashMap<String, String> labels = new LinkedHashMap<>();
            for (Card creature : defender.getCardsIn(ZoneType.Battlefield)) {
                if (!CombatUtil.canBlock(creature, combat)) {
                    continue;
                }
                String id = "blocker:card:" + creature.getId();
                blockerById.put(id, creature);
                labels.put(id, describe(creature));
            }
            if (blockerById.isEmpty()) {
                return;
            }

            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            "declareBlockers",
                            new ArrayList<>(blockerById.keySet()),
                            false,
                            "Choose a creature to block with, or pass to take the damage.",
                            pending -> host.publishDecision(pending, labels));

            if (DecisionGate.PASS.equals(choice)) {
                return;
            }
            Card blocker = blockerById.get(choice);
            if (blocker == null) {
                return;
            }

            Card blocked = chooseWhatToBlock(blocker, attackers, combat);
            if (blocked != null) {
                combat.addBlocker(blocked, blocker);
            }
        }
    }

    private Card chooseWhatToBlock(Card blocker, List<Card> attackers, Combat combat)
            throws InterruptedException {
        LinkedHashMap<String, Card> byId = new LinkedHashMap<>();
        LinkedHashMap<String, String> labels = new LinkedHashMap<>();
        for (Card attacker : attackers) {
            if (!CombatUtil.canBlock(attacker, blocker, combat)) {
                continue;
            }
            String id = "blocked:card:" + attacker.getId();
            byId.put(id, attacker);
            labels.put(id, describe(attacker));
        }
        if (byId.isEmpty()) {
            return null;
        }
        if (byId.size() == 1) {
            return byId.values().iterator().next();
        }

        String choice =
                host.gate().ask(
                        actedForSeat,
                        authorisedSeat,
                        "chooseBlockTarget",
                        new ArrayList<>(byId.keySet()),
                        true,
                        "What does " + blocker.getName() + " block?",
                        pending -> host.publishDecision(pending, labels));
        return byId.get(choice);
    }

    /**
     * How much damage goes where — §6.94.
     *
     * Only a choice in the cases Forge says it is: trample with
     * somewhere for the excess to go, more than one blocker, or
     * a creature that divides its damage as you choose. One
     * blocker and no trample is not a choice, and Forge's own
     * human path assigns it without asking — ported exactly,
     * including that a null key means the defending player.
     *
     * When it IS a choice, it is asked ONE POINT AT A TIME.
     * That is more questions than a "distribute 5 among these"
     * widget would be, and it needs no new protocol shape, and
     * every answer is final on its own. It also makes the
     * lethal-damage decision explicit rather than assumed: this
     * never quietly assigns "just enough to kill" on the
     * player's behalf, because how much to leave over is
     * precisely what a player is deciding.
     */
    java.util.Map<Card, Integer> assignCombatDamage(
            Card attacker,
            forge.game.card.CardCollectionView blockers,
            int damage,
            GameEntity defender,
            boolean overrideOrder) throws InterruptedException {
        java.util.Map<Card, Integer> assigned = new java.util.HashMap<>();

        boolean trampleOver =
                attacker.hasKeyword(forge.game.keyword.Keyword.TRAMPLE) && defender != null;
        boolean divides = attacker.hasKeyword(
                "You may assign CARDNAME's combat damage divided as you choose among "
                        + "defending player and/or any number of creatures they control.")
                && overrideOrder && blockers.size() > 0;
        boolean aChoice = trampleOver || blockers.size() > 1 || divides;

        if (!aChoice) {
            // Forge's own else-branch: all of it to the single
            // blocker, or to the defender when unblocked.
            assigned.put(blockers.isEmpty() ? null : blockers.get(0), damage);
            return assigned;
        }

        for (int point = 0; point < damage; point++) {
            LinkedHashMap<String, Card> byId = new LinkedHashMap<>();
            LinkedHashMap<String, String> labels = new LinkedHashMap<>();
            for (Card blocker : blockers) {
                String id = "damage:card:" + blocker.getId();
                byId.put(id, blocker);
                labels.put(id, describe(blocker)
                        + " — " + assigned.getOrDefault(blocker, 0) + " so far");
            }
            if (trampleOver) {
                // A null key is Forge's way of saying "the
                // defending player", and trample is the only
                // reason it is on offer.
                labels.put("damage:defender", String.valueOf(defender)
                        + " — " + assigned.getOrDefault(null, 0) + " so far (trample)");
            }

            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            "assignCombatDamage",
                            new ArrayList<>(labels.keySet()),
                            true,
                            "Assign damage " + (point + 1) + " of " + damage
                                    + " from " + attacker.getName() + ".",
                            pending -> host.publishDecision(pending, labels));

            if ("damage:defender".equals(choice)) {
                assigned.merge(null, 1, Integer::sum);
                continue;
            }
            Card target = byId.get(choice);
            if (target == null) {
                // Mandatory, so this means the board moved. Put
                // the rest where it certainly can go.
                target = blockers.isEmpty() ? null : blockers.get(0);
            }
            assigned.merge(target, 1, Integer::sum);
        }
        return assigned;
    }

    /** A creature, as a player needs to see it in combat. */
    private String describe(Card creature) {
        return ViewerSnapshot.nameFor(creature, viewer) + " — " + creature.getNetPower() + "/"
                + creature.getNetToughness()
                + (creature.isTapped() ? " (tapped)" : "");
    }
}
