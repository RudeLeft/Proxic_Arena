package net.barnflix.proxic.worker.game;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Spec 0108, item 11 -- why a spell with nothing to target is not offered, in Forge's own target words. */
class WhyNotTest {

    @Test
    void theReasonIsForgesTargetPrompt() {
        assertEquals("There's no attacking creature to target.",
                WhyNot.noTargetWords("Select target attacking creature"));
        assertEquals("There's no Vampire, Werewolf, or Zombie to target.",
                WhyNot.noTargetWords("Select target Vampire, Werewolf, or Zombie"));
        assertEquals("There's no creature you control to target.",
                WhyNot.noTargetWords("Select target creature you control"));
        // Forge's script shorthand said in words first (spec 0057).
        assertEquals("There's no nonland permanent to target.",
                WhyNot.noTargetWords("Select target Permanent.nonLand"));
    }

    @Test
    void otherwiseItSaysSoPlainly() {
        assertEquals(WhyNot.NOTHING_TO_TARGET, "There's nothing it can target right now.");
        assertEquals(WhyNot.NOTHING_TO_TARGET, WhyNot.noTargetWords(null));
        assertEquals(WhyNot.NOTHING_TO_TARGET, WhyNot.noTargetWords("Select any target"));
        assertEquals(WhyNot.NOTHING_TO_TARGET, WhyNot.noTargetWords("Choose a creature to sacrifice"));
        assertEquals(WhyNot.NOTHING_TO_TARGET, WhyNot.noTargetWords("Select target creature (with power 2 or less)"));
        assertEquals(WhyNot.NOTHING_TO_TARGET, WhyNot.noTargetWords("Select target "));
        assertEquals(WhyNot.NOTHING_TO_TARGET, WhyNot.noTargetWords("Select target a creature"));
        assertEquals(WhyNot.NOTHING_TO_TARGET, WhyNot.noTargetWords("Select target creature with mana value 3 - or less"));
    }
}
