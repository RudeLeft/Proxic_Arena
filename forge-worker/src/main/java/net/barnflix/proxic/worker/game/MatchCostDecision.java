package net.barnflix.proxic.worker.game;

import forge.game.card.Card;
import forge.game.cost.CostPartMana;
import forge.game.cost.PaymentDecision;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;

/**
 * What a cost decides — PHASE_06 §6.91, §6.105.
 *
 * Forge asks this while paying for something. The generated base
 * refuses every cost type loudly, and this overrides only the ones
 * Proxic genuinely supports; anything else names itself and stops
 * the match rather than being paid by a guess.
 *
 * That looks drastic and is the smaller risk. A cost silently
 * "paid" by picking the first legal option is a game that looks
 * fine and is not Magic — the exact class of defect the old project
 * shipped, and the reason §6.105 lists "do not choose first option"
 * alongside "do not choose randomly".
 */
final class MatchCostDecision extends GeneratedCostDecisionBase {

    MatchCostDecision(Player player, boolean effect, SpellAbility ability, Card source) {
        super(player, effect, ability, source);
    }

    /**
     * MANA IS NOT PAID HERE.
     *
     * The one cost every spell has, and the visitor has nothing to
     * decide about it: Forge pays mana through its own payment
     * flow, which asks the controller separately. Both of Forge's
     * own implementations say exactly this — the AI returns
     * `PaymentDecision.number(0)` and the human controller does not
     * override the method at all.
     *
     * So this is a faithful port and not a shortcut. Returning
     * anything else here would be inventing an answer to a question
     * Forge did not ask.
     */
    @Override
    public PaymentDecision visit(CostPartMana cost) {
        return PaymentDecision.number(0);
    }

    /**
     * Pay each cost as it is decided, like a human and unlike the AI.
     *
     * Forge's human controller returns true and the AI returns
     * false. The difference matters when a cost is refused partway
     * through: paying as you go leaves the game in the state a
     * player would expect, which is what Proxic is modelling.
     */
    @Override
    public boolean paysRightAfterDecision() {
        return true;
    }
}
