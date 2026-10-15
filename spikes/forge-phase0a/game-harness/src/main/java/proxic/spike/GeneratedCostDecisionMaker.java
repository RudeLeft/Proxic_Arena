package proxic.spike;

import forge.game.card.Card;
import forge.game.cost.CostDecisionMakerBase;
import forge.game.cost.PaymentDecision;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;

/**
 * Phase 0A — GENERATED cost-decision visitor.
 *
 * CostPayment.payCost visits every cost part through ICostVisitor's
 * 40 kinds. Only CostPartMana is answered; every other kind returns
 * null, which is how a real implementation signals "I cannot decide
 * this cost" and makes the payment fail cleanly rather than silently
 * succeeding with the wrong thing.
 *
 * Unlike PlayerController's stubs, these must NOT throw: a returned
 * null is a legitimate, meaningful answer here. So they are recorded
 * instead, and the harness prints which cost kinds a real game asked
 * for but could not pay — the same measurement, without breaking the
 * contract of the interface.
 *
 * Generated from javap against forge-game-2.0.15.jar. Do not hand-edit.
 */
final class GeneratedCostDecisionMaker extends CostDecisionMakerBase {

    static final java.util.LinkedHashMap<String, Integer> UNSUPPORTED_COSTS =
            new java.util.LinkedHashMap<>();

    GeneratedCostDecisionMaker(Player player, boolean effect, SpellAbility ability, Card source) {
        super(player, effect, ability, source);
    }

    private static PaymentDecision unsupported(String kind) {
        UNSUPPORTED_COSTS.merge(kind, 1, Integer::sum);
        return null;
    }

    static void printUnsupported() {
        if (UNSUPPORTED_COSTS.isEmpty()) return;
        System.out.println();
        System.out.println("=== cost kinds asked for but not payable: "
                + UNSUPPORTED_COSTS.size() + " ===");
        UNSUPPORTED_COSTS.forEach((k, v) -> System.out.println("    " + v + "x  " + k));
    }

    @Override
    public boolean paysRightAfterDecision() {
        return true;
    }

    @Override
    public PaymentDecision visit(forge.game.cost.CostAddMana cost) { return unsupported("CostAddMana"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostBehold cost) { return unsupported("CostBehold"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostBeholdExile cost) { return unsupported("CostBeholdExile"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostBlight cost) { return unsupported("CostBlight"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostChooseColor cost) { return unsupported("CostChooseColor"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostChooseCreatureType cost) { return unsupported("CostChooseCreatureType"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostCollectEvidence cost) { return unsupported("CostCollectEvidence"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostDamage cost) { return unsupported("CostDamage"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostDiscard cost) { return unsupported("CostDiscard"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostDraw cost) { return unsupported("CostDraw"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostEnlist cost) { return unsupported("CostEnlist"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostExert cost) { return unsupported("CostExert"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostExile cost) { return unsupported("CostExile"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostExileFromStack cost) { return unsupported("CostExileFromStack"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostExiledMoveToGrave cost) { return unsupported("CostExiledMoveToGrave"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostFlipCoin cost) { return unsupported("CostFlipCoin"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostForage cost) { return unsupported("CostForage"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostGainControl cost) { return unsupported("CostGainControl"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostGainLife cost) { return unsupported("CostGainLife"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostMill cost) { return unsupported("CostMill"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostPartMana cost) {
        // Ignored by CostPartMana.payAsDecided, whose own comment says
        // "the whole payment is interactive!" -- it calls
        // PlayerController.payManaCost directly instead. This only has
        // to be NON-NULL, because CostPayment.payCost treats a null
        // decision as the entire payment having failed, which would
        // abort the cast before payManaCost ever ran.
        return PaymentDecision.number(0);
    }

    @Override
    public PaymentDecision visit(forge.game.cost.CostPayEnergy cost) { return unsupported("CostPayEnergy"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostPayLife cost) { return unsupported("CostPayLife"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostPayShards cost) { return unsupported("CostPayShards"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostPromiseGift cost) { return unsupported("CostPromiseGift"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostPutCardToLib cost) { return unsupported("CostPutCardToLib"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostPutCounter cost) { return unsupported("CostPutCounter"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostPutCounterYou cost) { return unsupported("CostPutCounterYou"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostRemoveAnyCounter cost) { return unsupported("CostRemoveAnyCounter"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostRemoveCounter cost) { return unsupported("CostRemoveCounter"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostReturn cost) { return unsupported("CostReturn"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostReveal cost) { return unsupported("CostReveal"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostRevealChosen cost) { return unsupported("CostRevealChosen"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostRollDice cost) { return unsupported("CostRollDice"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostSacrifice cost) { return unsupported("CostSacrifice"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostTap cost) { return unsupported("CostTap"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostTapType cost) { return unsupported("CostTapType"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostUnattach cost) { return unsupported("CostUnattach"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostUntap cost) { return unsupported("CostUntap"); }

    @Override
    public PaymentDecision visit(forge.game.cost.CostUntapType cost) { return unsupported("CostUntapType"); }
}
