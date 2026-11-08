package net.barnflix.proxic.worker.game;

import forge.game.Game;
import forge.game.combat.Combat;
import forge.game.combat.CombatUtil;
import forge.game.cost.CostSacrifice;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;

import java.util.Collection;
import java.util.Map;
import java.util.Set;

/**
 * Priority stops — spec 0035 (was PHASE_07 §7.53, AMENDMENT 13).
 *
 * Whether a player is ASKED a priority question, or passed for. Forge
 * offers priority at almost every step of every turn, and an untapped
 * land always has something to offer (tap it for mana), so without
 * this both players answered about eighteen questions a turn, five in
 * six of them at a moment where nothing could matter (measured on a
 * real eight-turn game, 2026-10-21).
 *
 * Two rules keep this inside FORGE-RULE:
 *
 *  1. Only a PRIORITY PASS is ever automatic. This is consulted by the
 *     priority question alone; targets, payments, blocks, modes and
 *     every other question are always asked.
 *  2. ONE RULE for every player (owner 2026-10-29, replacing per-step
 *     settings): never pass a moment where the player holds something
 *     they could play and the moment can matter. A seat the rule is not
 *     on for is asked every time -- what every Mechanics Lab check that
 *     drives the worker directly still gets.
 *
 * Nothing here decides what is legal. The options are Forge's; this
 * only decides whether to show them now.
 */
public final class PriorityStops {

    /** The moments of your own turn the rule stops at, with something to do. */
    private static final Set<PhaseType> OWN = Set.of(
            PhaseType.MAIN1,
            PhaseType.COMBAT_DECLARE_ATTACKERS,
            PhaseType.COMBAT_DECLARE_BLOCKERS,
            PhaseType.MAIN2);

    /** The moments of the opponent's turn the rule stops at, with something to do. */
    private static final Set<PhaseType> OPPONENT = Set.of(
            PhaseType.COMBAT_BEGIN,
            PhaseType.COMBAT_DECLARE_ATTACKERS,
            PhaseType.COMBAT_DECLARE_BLOCKERS,
            PhaseType.END_OF_TURN);

    private final Set<Integer> ruled = java.util.concurrent.ConcurrentHashMap.newKeySet();

    /** The rule applies to `seat` (the server sends it for every player). */
    public void follow(int seat) {
        ruled.add(seat);
    }

    /** Any seat follows the rule: the board then hears of every step, asked or not. */
    public boolean active() {
        return !ruled.isEmpty();
    }

    /**
     * Spec 0005 -- this priority question is a response window: the seat
     * follows the rule (the page knows how to count down), answers for
     * itself, and the top of the stack is its OWN spell, ability or
     * trigger. Never for the opponent's: those are always asked plainly.
     */
    boolean responseWindow(int seat, Player player, Game game, boolean controlled) {
        if (!ruled.contains(seat) || controlled || game.getStack().isEmpty()) {
            return false;
        }
        SpellAbility top = game.getStack().peekAbility();
        return top != null && player.equals(top.getActivatingPlayer());
    }

    /**
     * Whether to ask `seat` this priority question.
     *
     * @param controlled the question is answered by somebody else
     *                   (Mindslaver): always asked, never passed for
     * @param options    what Forge offers right now
     * @param unpayable  which of them Forge's payment check says cannot be
     *                   paid now (§7.54); a hint for "anything to do"
     */
    boolean shouldAsk(int seat, Player player, Game game, boolean controlled,
                      Map<String, SpellAbility> options, Collection<String> unpayable) {
        if (!ruled.contains(seat) || controlled) {
            return true;
        }
        boolean stackFull = !game.getStack().isEmpty();
        PhaseType phase = game.getPhaseHandler().getPhase();

        int todo = somethingToDo(options, unpayable, stackFull, phase);
        boolean somethingToDo = todo > 0;
        // A card that only works in this step (Forge's own "ActivationPhases"
        // restriction: "only during your upkeep", "only during combat"):
        // this step is its only chance (spec 0035, gap 3).
        boolean onlyNow = todo > 1;
        if (!somethingToDo) {
            return false;
        }

        // Something on the stack: anything you could do is a reason to ask,
        // whoever put it there -- the opponent's always plainly, your own as
        // a response window (spec 0005) the page counts down.
        if (stackFull || onlyNow || phase == null) {
            return true;
        }

        boolean ownTurn = player.equals(game.getPhaseHandler().getPlayerTurn());
        if (!(ownTurn ? OWN : OPPONENT).contains(phase)) {
            return false;
        }
        // A combat step only matters when there is a combat.
        if (phase == PhaseType.COMBAT_DECLARE_ATTACKERS || phase == PhaseType.COMBAT_DECLARE_BLOCKERS) {
            Combat combat = game.getCombat();
            return combat != null && !combat.getAttackers().isEmpty();
        }
        // Before they attack only matters when something could attack.
        if (phase == PhaseType.COMBAT_BEGIN) {
            return CombatUtil.canAttack(game.getPhaseHandler().getPlayerTurn());
        }
        return true;
    }

    /**
     * 0 when nothing offered is worth stopping for, 1 when something is, 2
     * when one of those works only in this step.
     */
    private static int somethingToDo(Map<String, SpellAbility> options, Collection<String> unpayable,
                                     boolean stackFull, PhaseType phase) {
        int todo = 0;
        for (Map.Entry<String, SpellAbility> option : options.entrySet()) {
            SpellAbility sa = option.getValue();
            if (sa.isManaAbility()) {
                // Tapping a land with nothing to spend the mana on is never
                // a reason to stop: mana empties between steps. Sacrificing
                // for mana is (Ashnod's Altar), while something on the stack
                // could be answered by it (spec 0035, gap 4).
                if (stackFull && sa.getPayCosts() != null
                        && sa.getPayCosts().hasSpecificCostType(CostSacrifice.class)) {
                    todo = Math.max(todo, 1);
                }
                continue;
            }
            if (!sa.isLandAbility() && unpayable.contains(option.getKey())) {
                continue;
            }
            todo = Math.max(todo, 1);
            Set<PhaseType> phases = sa.getRestrictions() == null ? null : sa.getRestrictions().getPhases();
            if (phases != null && !phases.isEmpty() && phase != null && phases.contains(phase)) {
                todo = 2;
            }
        }
        return todo;
    }

    /**
     * Spec 0061, item 2 -- how long the page sees each step of a turn passed
     * for its player because nothing could be played: the steps move where
     * the player can see them instead of jumping to the end in a tenth of a
     * second. Within the brief's "0.4 s at most" (the canvas played them at
     * about half a second); only on that player's own turn, only while the
     * stack is empty, so the opponent's turn and every question are as fast
     * as before.
     */
    public static final long STEP_PAUSE_MS = 400;

    /** Spec 0061, item 2 -- seat to the turn number it is being passed for. */
    private final Map<Integer, Integer> passingTurn = new java.util.concurrent.ConcurrentHashMap<>();

    /**
     * Spec 0061, item 2 -- this priority question was NOT asked (shouldAsk
     * said no). If it is the seat's own Main 1, with an empty stack and
     * nothing it could play, its turn is being passed for it: the words to
     * tell it, once ("Nothing you can play this turn -- 1 land, no land in
     * hand. Passing your turn."), and the rest of the turn's steps pause
     * (pausing). Null otherwise. Words only: nothing here decides anything.
     */
    String passedTurn(int seat, Player player, Game game, boolean controlled,
                      Map<String, SpellAbility> options, Collection<String> unpayable) {
        if (!ruled.contains(seat) || controlled || !game.getStack().isEmpty()) {
            return null;
        }
        PhaseType phase = game.getPhaseHandler().getPhase();
        if (phase != PhaseType.MAIN1 || !player.equals(game.getPhaseHandler().getPlayerTurn())
                || somethingToDo(options, unpayable, false, phase) > 0) {
            return null;
        }
        int turn = game.getPhaseHandler().getTurn();
        if (Integer.valueOf(turn).equals(passingTurn.put(seat, turn))) {
            return null; // said already
        }
        int lands = player.getLandsInPlay().size();
        int inHand = 0;
        for (forge.game.card.Card card : player.getCardsIn(forge.game.zone.ZoneType.Hand)) {
            if (card.isLand()) {
                inHand++;
            }
        }
        return nothingToPlay(lands, inHand, player.getLandsPlayedThisTurn() > 0,
                CombatUtil.canAttack(player));
    }

    /** Spec 0061, item 2 -- the seat's own turn is being passed for it now: pause at this step. */
    boolean pausing(int seat, Player player, Game game) {
        PhaseType phase = game.getPhaseHandler().getPhase();
        if (phase == PhaseType.UPKEEP || phase == PhaseType.DRAW) {
            // A new turn (or a restarted game's: Karn counts turns from 1
            // again): whatever was being passed is over.
            passingTurn.remove(seat);
            return false;
        }
        Integer passing = passingTurn.get(seat);
        return passing != null && passing == game.getPhaseHandler().getTurn()
                && player.equals(game.getPhaseHandler().getPlayerTurn())
                && game.getStack().isEmpty();
    }

    /**
     * Spec 0061, item 2 -- the notice, in the approved words, adapted to the
     * case: how many lands, and why no land comes from the hand (none there,
     * or the land for the turn already played). "Passing your turn" stays
     * true when a creature could attack: that question is still asked.
     */
    static String nothingToPlay(int lands, int landsInHand, boolean landPlayed, boolean canAttack) {
        String have = lands == 0 ? "No lands" : lands == 1 ? "1 land" : lands + " lands";
        String hand = landsInHand == 0
                ? "no land in hand"
                : landPlayed ? "you've already played a land this turn" : "no land you can play";
        return "Nothing you can play this turn -- " + have + ", " + hand + ". Passing your turn"
                + (canAttack ? " (you can still attack)." : ".");
    }
}
