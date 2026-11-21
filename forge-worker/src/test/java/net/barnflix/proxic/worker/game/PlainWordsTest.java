package net.barnflix.proxic.worker.game;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/** Spec 0057 -- the game's words as a player reads them. */
class PlainWordsTest {

    // --- item 1: Allosaurus Rider, and Forge's script shorthand ------------------------

    @Test
    void anAlternativeCostReadsAsTheReminder() {
        // Forge's cost part says "Exile two Card.Green cards from your hand".
        assertEquals("Exile two green cards from your hand instead of paying {5}{G}{G}",
                PlainWords.insteadOf(List.of("Exile two Card.Green cards from your hand"), "{5}{G}{G}"));
        assertEquals("Pay 1 life and exile a blue card from your hand instead of paying {3}{U}{U}",
                PlainWords.insteadOf(List.of("Pay 1 life", "Exile a Card.Blue card from your hand"), "{3}{U}{U}"));
        assertEquals("Pay {R} instead of paying {4}{R}{R}", PlainWords.insteadOf(List.of("{R}"), "{4}{R}{R}"));
    }

    @Test
    void scriptShorthandNeverReachesAPlayer() {
        assertEquals("exile two green cards from your hand",
                PlainWords.humanise("exile two Card.Green cards from your hand"));
        assertEquals("Discard a red card", PlainWords.humanise("Discard a Card.Red card"));
        assertEquals("Sacrifice an Elf creature you control", PlainWords.humanise("Sacrifice an Creature.Elf+YouCtrl"));
        assertEquals("Exile a nonland permanent", PlainWords.humanise("Exile a Permanent.nonLand"));
        assertEquals("Tap an untapped creature you control", PlainWords.humanise("Tap an Creature.untapped+YouCtrl"));
        assertEquals("a creature with mana value 3 or less", PlainWords.humanise("a Creature.cmcLE3"));
        assertEquals("other creatures with flying", PlainWords.humanise("Creature.Other+withFlying creatures"));
        assertFalse(PlainWords.humanise("As an additional cost, exile two Card.Green cards.").contains("Card."));
    }

    @Test
    void ordinaryWordsAreLeftAlone() {
        assertEquals("Draw a card. Then discard a card.", PlainWords.humanise("Draw a card. Then discard a card."));
        assertEquals("B.F.M. (Big Furry Monster)", PlainWords.humanise("B.F.M. (Big Furry Monster)"));
        assertEquals("Mr. Orfeo, the Boulder", PlainWords.humanise("Mr. Orfeo, the Boulder"));
        assertEquals("{1}{G}", PlainWords.humanise("{1}{G}"));
    }

    // --- item 3: a cost you chose to pay ----------------------------------------------

    @Test
    void theButtonIsTheCostsAction() {
        assertEquals("Sacrifice", PlainWords.costAct("Sacrifice Elvish Eulogist?"));
        assertEquals("Exile", PlainWords.costAct("Exile Grizzly Bears?"));
        assertEquals("Discard", PlainWords.costAct("Discard your hand (3 cards)?"));
        assertEquals("Pay 2 life", PlainWords.costAct("Pay 2 life? You have 20."));
        assertEquals("Pay 3 energy", PlainWords.costAct("Pay 3 energy? You have 4."));
        assertEquals("Take 2 damage", PlainWords.costAct("Have Gutless Ghoul deal 2 damage to you?"));
        assertEquals("Pay", PlainWords.costAct("Somebody: get two counters?"));
    }

    @Test
    void theLineIsTheAbilitysEffect() {
        assertEquals("You gain 1 life for each Elf card in your graveyard.",
                PlainWords.effectWords("You gain 1 life for each Elf card in your graveyard.", "Elvish Eulogist"));
        assertEquals("You gain 1 life for each Elf card in your graveyard.",
                PlainWords.effectWords("Sacrifice CARDNAME: You gain 1 life for each Elf card in your graveyard.",
                        "Elvish Eulogist"));
        assertEquals("Draw a card.", PlainWords.effectWords("({R}, Discard this card: Draw a card.)", "Forgotten Cave"));
    }

    // --- item 5: play it, or throw it away for something --------------------------------

    @Test
    void discardingSaysWhatIsLost() {
        assertEquals("Discard Forgotten Cave and draw a card. You won't have it as a land.",
                PlainWords.discardLine("Forgotten Cave", "Draw a card.", true));
        assertEquals("Discard Krosan Tusker and draw a card. You won't cast it.",
                PlainWords.discardLine("Krosan Tusker", "Draw a card.", false));
        assertEquals("Discard Twisted Abomination and search your library for a Swamp card, reveal it, put it into "
                        + "your hand, then shuffle. You won't cast it.",
                PlainWords.discardLine("Twisted Abomination", PlainWords.effectWords(
                        "({2}, Discard this card: Search your library for a Swamp card, reveal it, put it into your "
                                + "hand, then shuffle.)", "Twisted Abomination"), false));
        assertEquals("Cycle it instead", PlainWords.discardTitle("cycling", "Cycling"));
        assertEquals("Swampcycle it instead", PlainWords.discardTitle("landcycling", "Swampcycling"));
        assertEquals("Channel instead", PlainWords.discardTitle("channel", "Channel —"));
    }

    // --- item 7: a reveal paid as a cost ----------------------------------------------

    @Test
    void aCostRevealSaysWhoWhatAndWhy() {
        assertEquals("Pat revealed Llanowar Elves from their hand.",
                PlainWords.revealSaid("Pat", List.of("Llanowar Elves"), "hand"));
        assertEquals("to cast Wren's Run Vanquisher for {1}{G} instead of {4}{G}",
                PlainWords.revealWhy("Wren's Run Vanquisher", true, "{1}{G}", "{4}{G}"));
        assertEquals("to pay for Wren's Run Vanquisher",
                PlainWords.revealWhy("Wren's Run Vanquisher", true, "{1}{G}", null));
        assertEquals("to pay for Kindred Dominance", PlainWords.revealWhy("Kindred Dominance", false, null, null));
    }
    // --- spec 0058, item 3: Gempalm Incinerator's X, counted --------------------------

    @Test
    void aCountedXIsFilledInAndSaysWhatWasCounted() {
        String said = MatchController.triggerEffect("When you cycle CARDNAME, you may have it deal X damage to target "
                + "creature, where X is the number of Goblins on the battlefield.", "Gempalm Incinerator");
        assertEquals("Gempalm Incinerator may deal X damage to target creature, where X is the number of Goblins "
                + "on the battlefield.", said);
        assertEquals("Gempalm Incinerator may deal 3 damage to target creature (3 Goblins on the battlefield).",
                PlainWords.countedX(said, 3, false));
        assertEquals("Gempalm Incinerator may deal 1 damage to target creature (1 Goblin).",
                PlainWords.countedX(said, 1, true));
        assertEquals("deal 3 damage to a creature (3 Goblins)",
                PlainWords.thenWords(PlainWords.countedX(said, 3, true), "Gempalm Incinerator"));
        // A target used as a noun keeps it (owner walk-through 2026-11-21, Spellskite).
        assertEquals("Change a target of a spell or ability to Spellskite",
                PlainWords.thenWords("Change a target of target spell or ability to Spellskite.", null));
        // Nothing says what X counts: unchanged. A mana {X} is never touched.
        assertEquals("Deal X damage.", PlainWords.countedX("Deal X damage.", 3, false));
        assertEquals("Pay {X}: it gets +2/+2 (2 Elves you control).",
                PlainWords.countedX("Pay {X}: it gets +X/+X, where X is the number of Elves you control.", 2, false));
    }

    // --- spec 0108, item 12: Forge's code notes on a stack entry ------------------------

    @Test
    void theTargetingNoteLeavesTheStackWords() {
        String slayer = "When Slayer of the Wicked enters, you may destroy target Vampire, Werewolf, or Zombie.";
        // The nested-list form WrappedAbility prints.
        assertEquals("Slayer of the Wicked (65) - " + slayer,
                PlainWords.stackText("Slayer of the Wicked (65) - " + slayer + " (Targeting: [[Butcher Ghoul (66)]])"));
        // Before the trigger's cause, which the page strips itself.
        assertEquals(slayer + " [Slayer of the Wicked (65)]",
                PlainWords.stackText(slayer + " (Targeting: [[Butcher Ghoul (66)]]) [Slayer of the Wicked (65)]"));
        // Two targets, and the plain form some effects add.
        assertEquals("deal 1 damage", PlainWords.stackText("deal 1 damage (Targeting: [[Pat, Grizzly Bears (12)]])"));
        assertEquals("Lightning Bolt deals 3 damage to any target.",
                PlainWords.stackText("Lightning Bolt deals 3 damage to any target. (Targeting: Pat)"));
    }

    @Test
    void theRememberedListGoesToo() {
        assertEquals("Whenever a Goblin dies, create a token.",
                PlainWords.stackText("Whenever a Goblin dies, create a token. ([Goblin Token (70)])"));
        assertEquals("Do it.", PlainWords.stackText("Do it. ([Goblin Token (70), Pat]) (Targeting: [[Pat]])"));
    }

    @Test
    void otherBracketsStay() {
        assertEquals("B.F.M. (Big Furry Monster) attacks.", PlainWords.stackText("B.F.M. (Big Furry Monster) attacks."));
        assertEquals("Grizzly Bears (12) - Draw a card.", PlainWords.stackText("Grizzly Bears (12) - Draw a card."));
        assertEquals("Unclosed (Targeting: [[Pat]", PlainWords.stackText("Unclosed (Targeting: [[Pat]"));
        assertEquals(null, PlainWords.stackText(null));
    }
}
