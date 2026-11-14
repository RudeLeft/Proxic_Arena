package net.barnflix.proxic.worker.game;

import forge.game.card.Card;
import forge.game.keyword.Keyword;
import forge.game.spellability.Spell;
import forge.game.spellability.SpellAbility;

/**
 * Spec 0083 (18 B) -- what a spell on the stack IS, as Forge's own rules
 * read it, for the page's gold-rimmed squares: split second and "can't be
 * countered". Nothing here decides a rule; each asks the method Forge's own
 * rules call.
 */
final class Polish {

    private Polish() {
    }

    /**
     * Split second: the keyword Forge's MagicStack#isSplitSecondOnStack reads
     * (the one that stops spells and abilities while it is on the stack).
     */
    static boolean splitSecond(Card source) {
        try {
            return source != null && source.hasKeyword(Keyword.SPLIT_SECOND);
        } catch (RuntimeException e) {
            return false;
        }
    }

    /**
     * "Can't be countered": Forge's Spell#isCounterableBy, the replacement
     * check (ReplacementType.Counter, CantHappen) its counterspells make
     * before they counter. Asked with no countering spell: an effect that
     * only stops SOME counterspells ("can't be countered by blue spells") is
     * not a mark the card wears, and a check that throws marks nothing.
     */
    static boolean cantBeCountered(SpellAbility sa) {
        if (!(sa instanceof Spell spell) || sa.getHostCard() == null) {
            return false;
        }
        try {
            return !spell.isCounterableBy(null);
        } catch (RuntimeException e) {
            return false;
        }
    }
}
