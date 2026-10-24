package net.barnflix.proxic.worker.game;

import forge.game.Game;
import forge.game.combat.Combat;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;

import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Priority stops — PHASE_07 §7.53, AMENDMENT 13.
 *
 * Whether a player is ASKED a priority question, or passed for. Forge
 * offers priority at almost every step of every turn, and an untapped
 * land always has something to offer (tap it for mana), so without
 * this both players answered about eighteen questions a turn, five in
 * six of them at a moment where nothing could matter (measured on a
 * real eight-turn game, 2026-10-21).
 *
 * Two rules keep this inside FORGE-RULE (§7.53):
 *
 *  1. Only a PRIORITY PASS is ever automatic. This is consulted by the
 *     priority question alone; targets, payments, blocks, modes and
 *     every other question are always asked.
 *  2. The stops are the PLAYER's setting, sent by the server. A seat
 *     with no settings is asked every time -- today's behaviour, and
 *     what every Mechanics Lab check that drives the worker directly
 *     still gets.
 *
 * Nothing here decides what is legal. The options are Forge's; this
 * only decides whether to show them now.
 */
public final class PriorityStops {

    /** The steps a player stops at, on their own turn and on the opponent's. */
    public record Settings(Set<String> own, Set<String> opponent) {
        public Settings {
            own = Set.copyOf(own);
            opponent = Set.copyOf(opponent);
        }
    }

    private final Map<Integer, Settings> bySeat = new ConcurrentHashMap<>();
    /** Seat -> the turn it passed to the end of ("Pass until end of turn"). */
    private final Map<Integer, Integer> passedTurn = new ConcurrentHashMap<>();

    public void set(int seat, Settings settings) {
        bySeat.put(seat, settings);
    }

    /** Any seat has settings: the board then hears of every step, asked or not. */
    public boolean active() {
        return !bySeat.isEmpty();
    }

    /** §7.53 extra — no more stops for `seat` this turn, unless the opponent acts. */
    public void passTurn(int seat, int turn) {
        passedTurn.put(seat, turn);
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
    /**
     * Spec 0005 -- this priority question is a response window: the seat
     * plays with stops (the page knows how to count down), answers for
     * itself, and the top of the stack is its OWN spell, ability or
     * trigger. Never for the opponent's: those are always asked plainly.
     */
    boolean responseWindow(int seat, Player player, Game game, boolean controlled) {
        if (!bySeat.containsKey(seat) || controlled || game.getStack().isEmpty()) {
            return false;
        }
        SpellAbility top = game.getStack().peekAbility();
        return top != null && player.equals(top.getActivatingPlayer());
    }

    boolean shouldAsk(int seat, Player player, Game game, boolean controlled,
                      Map<String, SpellAbility> options, Collection<String> unpayable) {
        Settings settings = bySeat.get(seat);
        if (settings == null || controlled) {
            return true;
        }
        boolean somethingToDo = false;
        for (Map.Entry<String, SpellAbility> option : options.entrySet()) {
            SpellAbility sa = option.getValue();
            // Tapping a land with nothing to spend the mana on is never
            // a reason to stop: mana empties between steps.
            if (sa.isManaAbility()) {
                continue;
            }
            if (sa.isLandAbility() || !unpayable.contains(option.getKey())) {
                somethingToDo = true;
                break;
            }
        }

        // Something on the stack: a response is never skipped -- when the
        // OPPONENT put it there and there is something to respond with.
        // Your own spell or trigger is asked too (CR 117.3c), as a response
        // window (spec 0005): the page counts down and passes for you if
        // you let it run out (Phase 8 Amendment 4) -- see responseWindow.
        if (!game.getStack().isEmpty()) {
            return somethingToDo;
        }

        Integer passed = passedTurn.get(seat);
        if (passed != null && passed == game.getPhaseHandler().getTurn()) {
            return false;
        }

        PhaseType phase = game.getPhaseHandler().getPhase();
        if (phase == null) {
            return true;
        }
        boolean ownTurn = player.equals(game.getPhaseHandler().getPlayerTurn());
        Set<String> stops = ownTurn ? settings.own() : settings.opponent();
        if (!stops.contains(phase.name())) {
            return false;
        }
        // A combat step only matters when there is a combat.
        if (phase == PhaseType.COMBAT_DECLARE_ATTACKERS || phase == PhaseType.COMBAT_DECLARE_BLOCKERS
                || phase == PhaseType.COMBAT_FIRST_STRIKE_DAMAGE || phase == PhaseType.COMBAT_DAMAGE) {
            Combat combat = game.getCombat();
            if (combat == null || combat.getAttackers().isEmpty()) {
                return false;
            }
        }
        return somethingToDo;
    }
}
