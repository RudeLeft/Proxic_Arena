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
 *
 * And it checks the WHOLE declaration when the player says "done",
 * as Forge's human input does (CombatUtil.validateAttackers and
 * validateBlocks) -- Forge's game loop does not check blocks again.
 * Without it one creature could block a creature with menace (owner
 * report, 2026-10-21). A declaration Forge refuses is not taken:
 * Forge's reason goes to the player, who is asked again and may take
 * any creature back out of combat ("unattack:" / "unblock:" options,
 * also a click on that creature on the board).
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
            LinkedHashMap<String, Card> takeBack = new LinkedHashMap<>();
            java.util.Map<String, String> why = new java.util.HashMap<>();
            for (Card creature : attacker.getCardsIn(ZoneType.Battlefield)) {
                if (combat.isAttacking(creature)) {
                    String back = UNATTACK + creature.getId();
                    takeBack.put(back, creature);
                    labels.put(back, "Stop attacking — " + describe(creature));
                    continue;
                }
                // FORGE decides whether it can attack anything at
                // all. Re-asked every round because declaring one
                // attacker can change the answer for another.
                boolean canAttackSomething =
                        defenders.stream().anyMatch(d -> CombatUtil.canAttack(creature, d));
                if (!canAttackSomething) {
                    if (creature.isCreature()) {
                        why.put("card:" + creature.getId(), WhyNot.attack(creature));
                    }
                    continue;
                }
                String id = "attacker:card:" + creature.getId();
                byId.put(id, creature);
                labels.put(id, describe(creature));
            }
            if (byId.isEmpty() && takeBack.isEmpty()) {
                // Nothing to attack with and nothing declared: no question.
                return;
            }
            // Spec 0042 (owner 2026-10-30): nothing more to add is not
            // "done". The last creature declared can still be taken back,
            // so the question stays open until the player says so -- with
            // one possible attacker the first click used to be final.
            // PHASE_07 AMENDMENT 13 — "All attack", as MTG Arena has: every
            // creature still offered, in one answer. Last, and naming no
            // card, so an answer that takes the first option, or picks a
            // creature by its card, means what it always meant.
            java.util.List<String> offered = new ArrayList<>(byId.keySet());
            if (byId.size() >= 2) {
                offered.add(ALL_ATTACK);
                labels.put(ALL_ATTACK, "All attack");
            }
            // Last, so the first option is still an attacker.
            offered.addAll(takeBack.keySet());
            host.offerUnavailable(why);

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
                // failure: most turns end here -- once Forge agrees.
                if (attacksAccepted(combat)) {
                    return;
                }
                continue;
            }
            if (takeBack.containsKey(choice)) {
                combat.removeFromCombat(takeBack.get(choice));
                continue;
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

    /** Take a creature back out of the attack, or out of a block. */
    static final String UNATTACK = "unattack:card:";
    static final String UNBLOCK = "unblock:card:";

    /**
     * Forge's verdict on the whole attack. Forge gives no reason for
     * a refused attack (its own loop says only "Attack declaration
     * invalid"), so the player is told what kinds of rule it is.
     */
    private boolean attacksAccepted(Combat combat) {
        if (CombatUtil.validateAttackers(combat)) {
            return true;
        }
        host.note(actedForSeat,
                "That attack breaks a rule — a creature that must attack, or one that can't"
                        + " attack alone. Change your attackers.");
        return false;
    }

    /** Forge's verdict on the whole block, with Forge's own reason when it refuses. */
    private boolean blocksAccepted(Combat combat, Player defender) {
        String problem = CombatUtil.validateBlocks(combat, defender);
        if (problem == null) {
            return true;
        }
        // Forge names cards with their game id ("Boggart Brute (38)");
        // the player sees names.
        host.note(actedForSeat, "Not allowed: " + problem.replaceAll("\\s\\(\\d+\\)", ""));
        return false;
    }

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
            labels.put(id, defender instanceof Card card ? ViewerSnapshot.nameFor(card, viewer) : String.valueOf(defender));
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
            LinkedHashMap<String, Card> takeBack = new LinkedHashMap<>();
            java.util.Map<String, String> why = new java.util.HashMap<>();
            for (Card creature : defender.getCardsIn(ZoneType.Battlefield)) {
                boolean blocking = combat.isBlocking(creature);
                if (blocking) {
                    String back = UNBLOCK + creature.getId();
                    takeBack.put(back, creature);
                    labels.put(back, "Stop blocking — " + describe(creature));
                }
                if (!CombatUtil.canBlock(creature, combat)) {
                    if (!blocking && creature.isCreature()) {
                        why.put("card:" + creature.getId(), WhyNot.block(creature));
                    }
                    continue;
                }
                String id = "blocker:card:" + creature.getId();
                blockerById.put(id, creature);
                labels.put(id, describe(creature));
            }
            if (blockerById.isEmpty() && takeBack.isEmpty()) {
                return;
            }
            // Spec 0042: open until the player says so, as for attacks.

            java.util.List<String> offered = new ArrayList<>(blockerById.keySet());
            // Last, so the first option is still a blocker.
            offered.addAll(takeBack.keySet());
            host.offerUnavailable(why);
            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            "declareBlockers",
                            offered,
                            false,
                            "Choose a creature to block with, or pass to take the damage.",
                            pending -> host.publishDecision(pending, labels));

            if (DecisionGate.PASS.equals(choice)) {
                if (blocksAccepted(combat, defender)) {
                    return;
                }
                continue;
            }
            if (takeBack.containsKey(choice)) {
                combat.undoBlockingAssignment(takeBack.get(choice));
                continue;
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
            // A null key is Forge's way of saying "the defending player".
            // Trample reaches them only once every blocker has lethal
            // damage (CR 702.19c) -- Forge takes whatever map it is given,
            // and its own screen enforces this (VAssignCombatDamage
            // .canAssignTo), so this must. A creature that divides its
            // damage as it chooses may give the player any of it.
            if ((trampleOver && allLethal(attacker, blockers, assigned)) || (divides && defender != null)) {
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

    /**
     * Every blocker has been assigned lethal damage -- Forge's own reading
     * (VAssignCombatDamage.getDamageToKill): what it still needs to die,
     * after damage already marked; 1 from a deathtouch attacker (CR
     * 702.2c); a planeswalker's loyalty.
     */
    static boolean allLethal(Card attacker, forge.game.card.CardCollectionView blockers,
            java.util.Map<Card, Integer> assigned) {
        boolean deathtouch = attacker.hasKeyword(forge.game.keyword.Keyword.DEATHTOUCH);
        for (Card blocker : blockers) {
            int lethal = Math.max(0, blocker.getLethalDamage());
            if (blocker.isPlaneswalker()) {
                lethal = blocker.getCurrentLoyalty();
            } else if (deathtouch) {
                lethal = Math.min(lethal, 1);
            }
            if (assigned.getOrDefault(blocker, 0) < lethal) {
                return false;
            }
        }
        return true;
    }

    /** A creature, as a player needs to see it in combat. */
    private String describe(Card creature) {
        return ViewerSnapshot.nameFor(creature, viewer) + " — " + creature.getNetPower() + "/"
                + creature.getNetToughness()
                + (creature.isTapped() ? " (tapped)" : "");
    }
}
