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
                    labels.put(back, "Stop attacking with " + describe(creature));
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
        // Spec 0097, item 5 -- on the combat button, where the player acted
        // (the attackers stay selected): the words of the question asked again.
        host.offerRefused(actedForSeat, ATTACK_REFUSED);
        return false;
    }

    /** Spec 0097, item 5 -- the canvas's words for a refused attack. */
    static final String ATTACK_REFUSED =
            "That attack breaks a rule: a creature must attack, or one can't attack alone. Change your attackers.";

    /**
     * A refused block in Forge's own reason; Forge names cards with their
     * game id ("Boggart Brute (38)"), the player sees names.
     */
    static String blockRefused(String problem) {
        return blockRefused(problem, java.util.Set.of());
    }

    private static final java.util.regex.Pattern TOO_FEW =
            java.util.regex.Pattern.compile("^(.+?) cannot be blocked with (\\d+) creatures you've assigned\\.?$");

    /**
     * Spec 0113 (W1-264, W1-336) -- Forge's reason, without its card numbers;
     * a menace attacker blocked by one creature ([menace] the attackers with
     * menace, by name): "Boggart Brute has menace: block it with two or more
     * creatures." Too few blockers otherwise: "... can't be blocked by just
     * one creature."
     */
    static String blockRefused(String problem, java.util.Set<String> menace) {
        String plain = problem.replaceAll("\\s\\(\\d+\\)", "").trim();
        java.util.regex.Matcher few = TOO_FEW.matcher(plain);
        if (few.matches()) {
            String attacker = few.group(1).trim();
            int n = Integer.parseInt(few.group(2));
            if (menace.contains(attacker)) {
                return attacker + " has menace: block it with two or more creatures.";
            }
            return "Not allowed: " + attacker + " can't be blocked by " + (n == 1 ? "just one creature"
                    : "only " + PlainWords.count(n, "creature")) + ".";
        }
        return "Not allowed: " + plain;
    }

    /** Forge's verdict on the whole block, with Forge's own reason when it refuses. */
    private boolean blocksAccepted(Combat combat, Player defender) {
        String problem = CombatUtil.validateBlocks(combat, defender);
        if (problem == null) {
            return true;
        }
        java.util.Set<String> menace = new java.util.HashSet<>();
        for (Card attacker : combat.getAttackers()) {
            if (attacker.hasKeyword(forge.game.keyword.Keyword.MENACE)) {
                menace.add(attacker.getName());
            }
        }
        // Spec 0097, item 5 -- on the combat button, as the attack's.
        host.offerRefused(actedForSeat, blockRefused(problem, menace));
        // Spec 0125, item 1 -- refused for menace: every board, once (the
        // attacker's menace square pops on both screens at the refusal).
        Integer attackerId = BlockRefusals.menaceAttacker(problem, id -> combat.getAttackers().stream()
                .anyMatch(a -> a.getId() == id && a.hasKeyword(forge.game.keyword.Keyword.MENACE)));
        if (attackerId != null) {
            List<Integer> blockers = new ArrayList<>();
            for (Card attacker : combat.getAttackers()) {
                if (attacker.getId() == attackerId) {
                    combat.getBlockers(attacker).forEach(b -> blockers.add(b.getId()));
                }
            }
            host.offerBlockRefused(new BlockRefusals.Refused(attackerId, blockers));
        }
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
                    labels.put(back, "Stop blocking with " + describe(creature));
                }
                if (!offered(creature, combat)) {
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

    /** Whether the declare-blockers decision offers [creature] as a blocker (Forge's CombatUtil#canBlock). */
    static boolean offered(Card creature, Combat combat) {
        return CombatUtil.canBlock(creature, combat);
    }

    /**
     * Spec 0101, item 3 (Decided 1) -- while blockers are to be declared
     * ([open]: attackers declared, blocks not yet), the creatures the game
     * offers the defending player as blockers, as the declare-blockers
     * decision offers them ({@link #offered}), and those already blocking:
     * ["card:N", ...] for every viewer. Public: the board is seen by all.
     */
    static com.google.gson.JsonArray candidatesJson(forge.game.Game game, boolean open) {
        com.google.gson.JsonArray out = new com.google.gson.JsonArray();
        Combat combat = open ? game.getCombat() : null;
        if (combat == null || combat.getAttackers().isEmpty()) {
            return out;
        }
        try {
            for (Player defender : combat.getDefendingPlayers()) {
                for (Card creature : defender.getCardsIn(ZoneType.Battlefield)) {
                    if (creature.isPhasedOut()) {
                        continue;
                    }
                    if (combat.isBlocking(creature) || offered(creature, combat)) {
                        out.add("card:" + creature.getId());
                    }
                }
            }
        } catch (RuntimeException e) {
            System.err.println("proxic: blocker candidates not read: " + e);
        }
        return out;
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
     * every answer is final on its own.
     *
     * Spec 0107 (owner Q5b, 2026-11-19) is the one exception: a
     * trampler's split is made for its player (lethal to each
     * blocker, the rest to the defender) unless they changed it
     * with "Change split" at declare blockers; the button is there
     * whenever trample can carry damage over, so the choice stays
     * theirs. Every other split is asked as before.
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

        // Spec 0107 (owner Q5b: the one exception to "you always choose") --
        // a trampler its own player assigns: the split is made for them,
        // unless they changed it with "Change split" and that still fits.
        Combat combat = attacker.getGame().getCombat();
        if (trampleOver && !divides && !blockers.isEmpty() && combat != null && ownAttacker(attacker)) {
            DamagePlans.Plan plan = host.plans().take(actedForSeat, attacker.getId(), combat);
            java.util.Map<Card, Integer> made = null;
            if (plan != null && plan.fits(combat, attacker, blockers, damage)) {
                made = new java.util.HashMap<>();
                for (Card blocker : blockers) {
                    made.put(blocker, plan.toBlockers().getOrDefault(blocker.getId(), 0));
                }
                if (plan.toDefender() > 0) {
                    made.put(null, plan.toDefender());
                }
            } else if (plan == null && automatic(attacker, blockers, damage)) {
                made = usualSplit(attacker, blockers, damage);
            }
            // A plan that no longer fits (an Elf died: Heedless One hits for
            // less) is asked again below, filled in with the usual split
            // (spec 0107, item 7; owner decision default).
            if (made != null) {
                keptOnBlockers(attacker, blockers, damage, made, defender);
                return made;
            }
            java.util.Map<Card, Integer> asked = ask(attacker, blockers, damage, defender, assigned, true, false);
            keptOnBlockers(attacker, blockers, damage, asked, defender);
            return asked;
        }
        return ask(attacker, blockers, damage, defender, assigned, trampleOver, divides);
    }

    /** Today's damage question (item 5's one window), one point at a time. */
    private java.util.Map<Card, Integer> ask(Card attacker, forge.game.card.CardCollectionView blockers, int damage,
            GameEntity defender, java.util.Map<Card, Integer> assigned, boolean trampleOver, boolean divides)
            throws InterruptedException {
        com.google.gson.JsonObject how = new com.google.gson.JsonObject();
        how.add("damage", fightJson(attacker, blockers, damage, defender, trampleOver, divides));
        com.google.gson.JsonObject before = host.arrange();
        host.arranging(how);
        try {
            return assignByPoint(attacker, blockers, damage, defender, assigned, trampleOver, divides);
        } finally {
            host.arranging(before);
        }
    }

    /**
     * Owner 2026-11-01 (item 5) -- the whole fight, for the page's one
     * window: how much there is, each blocker in Forge's order with
     * what it still needs to die (Forge's own reading, allLethal), and
     * whether the player can take some (trample, or a creature that
     * divides as it chooses). The questions stay one point at a time;
     * the page answers them from the split the player made.
     */
    static com.google.gson.JsonObject fightJson(Card attacker, Iterable<Card> blockers, int damage,
            GameEntity defender, boolean trampleOver, boolean divides) {
        com.google.gson.JsonObject fight = new com.google.gson.JsonObject();
        fight.addProperty("damage", damage);
        fight.addProperty("attacker", "card:" + attacker.getId());
        com.google.gson.JsonArray order = new com.google.gson.JsonArray();
        for (Card blocker : blockers) {
            com.google.gson.JsonObject one = new com.google.gson.JsonObject();
            one.addProperty("card", "card:" + blocker.getId());
            one.addProperty("lethal", lethal(attacker, blocker));
            order.add(one);
        }
        fight.add("blockers", order);
        if (trampleOver) {
            fight.addProperty("trample", true);
        } else if (divides && defender != null) {
            fight.addProperty("divides", true);
        }
        return fight;
    }

    /** Spec 0107 -- "Change split": a priority option per trampler that can trample over. */
    static final String SPLIT = "split:card:";

    /** Spec 0107 -- the attacker is its own player's to assign (not Defensive Formation's defender). */
    private boolean ownAttacker(Card attacker) {
        Player controller = attacker.getController();
        return controller != null && controller.getView().equals(viewer);
    }

    /**
     * Spec 0107 -- the split is made without asking: when the trampler can
     * trample over (its damage beats its blockers' total lethal: the same
     * test as the stop that offers "Change split"), or when one blocker
     * takes it all (no excess, one blocker: there is nothing to choose).
     * Two or more blockers and no excess: which of them dies is a real
     * choice with no "Change split" offered, so it is asked as today.
     */
    static boolean automatic(Card attacker, forge.game.card.CardCollectionView blockers, int damage) {
        return damage > totalLethal(attacker, blockers) || blockers.size() == 1;
    }

    /** What all of [blockers] still need to die from [attacker], together. */
    static int totalLethal(Card attacker, Iterable<Card> blockers) {
        int total = 0;
        for (Card blocker : blockers) {
            total += lethal(attacker, blocker);
        }
        return total;
    }

    /**
     * Spec 0107 (Q5b) -- the usual split: each blocker in Forge's order its
     * lethal (deathtouch 1, damage already marked counted: {@link #lethal},
     * Forge's own reading), the rest to the defender. Lethal-first holds by
     * construction (CR 702.19c), and Forge checks the map it is given.
     */
    static java.util.Map<Card, Integer> usualSplit(Card attacker, Iterable<Card> blockers, int damage) {
        java.util.Map<Card, Integer> out = new java.util.HashMap<>();
        int left = damage;
        for (Card blocker : blockers) {
            int give = Math.min(lethal(attacker, blocker), left);
            out.put(blocker, give);
            left -= give;
        }
        // Something left means every blocker got its whole lethal: the rest
        // tramples over (a null key is Forge's "the defender").
        if (left > 0) {
            out.put(null, left);
        }
        return out;
    }

    /** Spec 0107 -- the usual split as the page reads it: {"blockers": [n...], "player": n}. */
    static com.google.gson.JsonObject usualJson(Card attacker, Iterable<Card> blockers, int damage) {
        java.util.Map<Card, Integer> split = usualSplit(attacker, blockers, damage);
        com.google.gson.JsonObject out = new com.google.gson.JsonObject();
        com.google.gson.JsonArray each = new com.google.gson.JsonArray();
        for (Card blocker : blockers) {
            each.add(split.getOrDefault(blocker, 0));
        }
        out.add("blockers", each);
        out.addProperty("player", split.getOrDefault(null, 0));
        return out;
    }

    /**
     * Spec 0107 -- the attackers [player] may change the split of now: on its
     * own turn, at declare blockers, each of its attackers with trample that
     * is blocked and whose damage beats its blockers' total lethal (it can
     * trample over). Only the public board: trample, the blocks, power and
     * damage marked -- never a hand (Risks 2).
     */
    static List<Card> trampleSplits(Player player, forge.game.Game game) {
        List<Card> out = new ArrayList<>();
        if (game.getPhaseHandler().getPhase() != forge.game.phase.PhaseType.COMBAT_DECLARE_BLOCKERS
                || !player.equals(game.getPhaseHandler().getPlayerTurn())) {
            return out;
        }
        Combat combat = game.getCombat();
        if (combat == null) {
            return out;
        }
        try {
            for (Card attacker : combat.getAttackers()) {
                if (!player.equals(attacker.getController())
                        || !attacker.hasKeyword(forge.game.keyword.Keyword.TRAMPLE)
                        || !combat.isBlocked(attacker) || combat.getDefenderByAttacker(attacker) == null) {
                    continue;
                }
                forge.game.card.CardCollectionView blockers = combat.getBlockers(attacker);
                if (blockers.isEmpty()
                        || attacker.getNetCombatDamage() <= totalLethal(attacker, blockers)) {
                    continue;
                }
                out.add(attacker);
            }
        } catch (RuntimeException e) {
            System.err.println("proxic: trample splits not read: " + e);
        }
        return out;
    }

    /** Spec 0107 -- the "Change split" option's fight: today's, plus the split made for the player. */
    static com.google.gson.JsonObject splitFight(Card attacker, Combat combat) {
        forge.game.card.CardCollectionView blockers = combat.getBlockers(attacker);
        int damage = attacker.getNetCombatDamage();
        com.google.gson.JsonObject fight =
                fightJson(attacker, blockers, damage, combat.getDefenderByAttacker(attacker), true, false);
        fight.add("usual", usualJson(attacker, blockers, damage));
        return fight;
    }

    /**
     * Spec 0107 -- "Change split" chosen: today's damage question for
     * [attacker], asked now; the answer is kept (DamagePlans) for damage.
     * Nothing goes to Forge: it is not a game action.
     */
    void changeSplit(Card attacker, Combat combat) throws InterruptedException {
        forge.game.card.CardCollectionView blockers = combat.getBlockers(attacker);
        int damage = attacker.getNetCombatDamage();
        GameEntity defender = combat.getDefenderByAttacker(attacker);
        java.util.Map<Card, Integer> answer =
                ask(attacker, blockers, damage, defender, new java.util.HashMap<>(), true, false);
        java.util.Map<Integer, Integer> toBlockers = new java.util.HashMap<>();
        List<Integer> ids = new ArrayList<>();
        for (Card blocker : blockers) {
            ids.add(blocker.getId());
            toBlockers.put(blocker.getId(), answer.getOrDefault(blocker, 0));
        }
        host.plans().put(actedForSeat, attacker.getId(),
                new DamagePlans.Plan(combat, ids, damage, toBlockers, answer.getOrDefault(null, 0)));
    }

    /**
     * Spec 0107 (Q5c A) -- trample was possible and the extra was kept on
     * the blockers (only through a changed split): the defending player's
     * report (ActionReports, TRAMPLE_KEPT).
     */
    private void keptOnBlockers(Card attacker, forge.game.card.CardCollectionView blockers, int damage,
            java.util.Map<Card, Integer> split, GameEntity defender) {
        int excess = damage - totalLethal(attacker, blockers);
        int over = split.getOrDefault(null, 0);
        if (excess <= 0 || over >= excess) {
            return;
        }
        ActionReports reports = host.actions();
        Player defending = defender instanceof Player p ? p
                : defender instanceof Card c ? c.getController() : null;
        if (reports != null && defending != null) {
            reports.trampleKept(attacker, blockers, split, defending, damage);
        }
    }

    /** What [blocker] still needs to die from [attacker] -- as allLethal reads it. */
    static int lethal(Card attacker, Card blocker) {
        int need = Math.max(0, blocker.getLethalDamage());
        if (blocker.isPlaneswalker()) {
            return blocker.getCurrentLoyalty();
        }
        if (attacker.hasKeyword(forge.game.keyword.Keyword.DEATHTOUCH)) {
            return Math.min(need, 1);
        }
        return need;
    }

    /** The questions themselves, one point at a time. */
    private java.util.Map<Card, Integer> assignByPoint(
            Card attacker,
            forge.game.card.CardCollectionView blockers,
            int damage,
            GameEntity defender,
            java.util.Map<Card, Integer> assigned,
            boolean trampleOver,
            boolean divides) throws InterruptedException {
        for (int point = 0; point < damage; point++) {
            LinkedHashMap<String, Card> byId = new LinkedHashMap<>();
            LinkedHashMap<String, String> labels = new LinkedHashMap<>();
            for (Card blocker : blockers) {
                String id = "damage:card:" + blocker.getId();
                byId.put(id, blocker);
                labels.put(id, describe(blocker)
                        + " · " + assigned.getOrDefault(blocker, 0) + " damage so far");
            }
            // A null key is Forge's way of saying "the defending player".
            // Trample reaches them only once every blocker has lethal
            // damage (CR 702.19c) -- Forge takes whatever map it is given,
            // and its own screen enforces this (VAssignCombatDamage
            // .canAssignTo), so this must. A creature that divides its
            // damage as it chooses may give the player any of it.
            if ((trampleOver && allLethal(attacker, blockers, assigned)) || (divides && defender != null)) {
                labels.put("damage:defender", String.valueOf(defender)
                        // Spec 0113 (W1-221) -- "(trample)" only when it is trample.
                        + " · " + assigned.getOrDefault(null, 0) + " damage so far"
                        + (trampleOver && allLethal(attacker, blockers, assigned) ? " (trample)" : ""));
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
        return ViewerSnapshot.nameFor(creature, viewer) + " (" + creature.getNetPower() + "/"
                + creature.getNetToughness()
                + (creature.isTapped() ? ", tapped)" : ")");
    }
}
