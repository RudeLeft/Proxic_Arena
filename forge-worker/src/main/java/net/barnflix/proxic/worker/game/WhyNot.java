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
