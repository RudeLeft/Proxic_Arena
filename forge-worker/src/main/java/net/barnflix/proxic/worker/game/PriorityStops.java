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

        boolean somethingToDo = false;
        // A card that only works in this step (Forge's own "ActivationPhases"
        // restriction: "only during your upkeep", "only during combat"):
        // this step is its only chance (spec 0035, gap 3).
        boolean onlyNow = false;
        for (Map.Entry<String, SpellAbility> option : options.entrySet()) {
            SpellAbility sa = option.getValue();
            if (sa.isManaAbility()) {
                // Tapping a land with nothing to spend the mana on is never
                // a reason to stop: mana empties between steps. Sacrificing
                // for mana is (Ashnod's Altar), while something on the stack
                // could be answered by it (spec 0035, gap 4).
                if (stackFull && sa.getPayCosts() != null
                        && sa.getPayCosts().hasSpecificCostType(CostSacrifice.class)) {
                    somethingToDo = true;
                }
                continue;
            }
            if (!sa.isLandAbility() && unpayable.contains(option.getKey())) {
                continue;
            }
            somethingToDo = true;
            Set<PhaseType> phases = sa.getRestrictions() == null ? null : sa.getRestrictions().getPhases();
            if (phases != null && !phases.isEmpty() && phase != null && phases.contains(phase)) {
                onlyNow = true;
            }
        }
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
}
