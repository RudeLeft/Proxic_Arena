package net.barnflix.proxic.worker.game;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/** Spec 0055: a target question says what it is for, in plain words. */
class TargetWordsTest {

    @Test
    void aTriggerSaysItsEffectNotItsCondition() {
        assertEquals("Boggart Shenanigans may deal 1 damage to target player or planeswalker.",
                MatchController.triggerEffect("Whenever another Goblin you control is put into a graveyard from the "
                        + "battlefield, you may have CARDNAME deal 1 damage to target player or planeswalker.",
                        "Boggart Shenanigans"));
        assertEquals("Target creature you control gets +2/+0 and gains trample until end of turn.",
                MatchController.triggerEffect("At the beginning of combat on your turn, target creature you control "
                        + "gets +2/+0 and gains trample until end of turn.", "Storm-Charged Slasher"));
        assertEquals("Karplusan Minotaur deals 1 damage to any target.",
                MatchController.triggerEffect("Whenever you win a coin flip, CARDNAME deals 1 damage to any target. "
                        + "Then something else.", "Karplusan Minotaur"));
    }

    @Test
    void nothingToSayIsEmpty() {
        assertEquals("", MatchController.triggerEffect(null, "X"));
        assertEquals("", MatchController.triggerEffect("Whenever something happens", "X"));
    }

    @Test
    void itIsTheCardsName() {
        assertEquals("Mogg Fanatic deals 1 damage to any target.",
                MatchController.plainSubject("It deals 1 damage to any target.", "Mogg Fanatic"));
        assertEquals("Destroy target creature.", MatchController.plainSubject("Destroy target creature.", "Murder"));
    }

    @Test
    void targetsAreNamesAndTwinsAreToldApartByOrder() {
        assertEquals(List.of("Glistener Elf", "Storm-Charged Slasher (first)", "Storm-Charged Slasher (second)", "Bob"),
                MatchController.targetLabels(List.of("Glistener Elf", "Storm-Charged Slasher", "Storm-Charged Slasher", "Bob")));
    }

    /**
     * Spec 0058, item 2 (VEND-004): the reflective call that names the cards
     * changing a cost -- CostAdjustment.checkRequirement(SpellAbility,
     * StaticAbility) -- still exists in this Forge. If a Forge update removes
     * it, costs still show, unnamed; this fails so somebody notices.
     */
    @Test
    void forgeStillHasTheCostTest() {
        assertNotNull(MatchController.COST_APPLIES);
    }
}
