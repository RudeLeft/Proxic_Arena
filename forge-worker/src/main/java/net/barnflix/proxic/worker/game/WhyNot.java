package net.barnflix.proxic.worker.game;

import forge.game.card.Card;
import forge.game.keyword.Keyword;
import forge.game.player.Player;

/**
 * Why a card the player clicked cannot do anything right now -- PHASE_07
 * §7.61 B7, owner decision 2026-10-21 ("Give the reason").
 *
 * Forge decides what is offered; it does not say why something is NOT.
 * So these sentences are read off Forge's own facts about the card --
 * tapped, summoning sick, defender, land drops left, sorcery timing --
 * and never decide anything: a card offered stays offered whatever this
 * says, and one not offered stays unclickable. When no fact explains
 * it, the sentence says so plainly rather than guessing.
 */
final class WhyNot {

    private WhyNot() {
    }

    /** A creature of the attacking player that is not offered as an attacker. */
    static String attack(Card creature) {
        if (creature.isTapped()) {
            return "Tapped — it can't attack.";
        }
        if (creature.hasSickness()) {
            return "Came in this turn — it can't attack yet.";
        }
        if (creature.hasKeyword(Keyword.DEFENDER)) {
            return "Has defender — it can't attack.";
        }
        return "It can't attack right now.";
    }

    /** A creature of the defending player that is not offered as a blocker. */
    static String block(Card creature) {
        if (creature.isTapped()) {
            return "Tapped — it can't block.";
        }
        return "It can't block any of the attackers.";
    }

    /**
     * Phase 9 W-16 -- an activated ability of a permanent the player
     * controls that Forge does not offer now: why, from Forge's facts
     * (loyalty, once a turn, timing, tapped).
     */
    static String ability(forge.game.spellability.SpellAbility sa, Card card, Player player) {
        if (sa.isPwAbility()) {
            if (card.getPlaneswalkerAbilityActivated() > 0) {
                return "Once each turn — already used this turn.";
            }
            if (!player.canCastSorcery()) {
                return "Only in your main phase, with nothing on the stack.";
            }
            if (sa.getPayCosts() != null) {
                for (forge.game.cost.CostPart part : sa.getPayCosts().getCostParts()) {
                    if (part instanceof forge.game.cost.CostRemoveCounter remove
                            && remove.counter != null
                            && remove.counter.is(forge.game.card.CounterEnumType.LOYALTY)) {
                        Integer needed = remove.convertAmount();
                        int has = card.getCurrentLoyalty();
                        if (needed != null && needed > has) {
                            return "Needs " + needed + " loyalty (it has " + has + ").";
                        }
                    }
                }
            }
        }
        if (sa.getPayCosts() != null && sa.getPayCosts().hasTapCost()) {
            if (card.isTapped()) {
                return "It's tapped.";
            }
            if (card.isCreature() && card.hasSickness()) {
                return "Came in this turn — it can't tap yet.";
            }
        }
        if (sa.getRestrictions() != null && sa.getRestrictions().isSorcerySpeed()
                && !player.canCastSorcery()) {
            return "Only in your main phase, with nothing on the stack.";
        }
        return "It can't be used right now.";
    }

    /** A card in hand with nothing offered for it. */
    static String play(Card card, Player player) {
        if (card.isLand()) {
            if (player.getLandsPlayedThisTurn() >= player.getMaxLandPlays()) {
                return "You've already played a land this turn.";
            }
            if (!player.canCastSorcery()) {
                return "Lands are played in your main phase, with nothing on the stack.";
            }
            return "It can't be played right now.";
        }
        boolean instantSpeed = card.isInstant() || card.hasKeyword(Keyword.FLASH);
        if (!instantSpeed && !player.canCastSorcery()) {
            return "Only in your main phase, with nothing on the stack.";
        }
        return "It can't be cast right now.";
    }
}
