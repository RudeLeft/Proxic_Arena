package net.barnflix.proxic.worker.game;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Spec 0113 F-0113-B -- safety net 2, the worker cleanup
 * ({@link PlainWords#tidy}), and the number-and-article helper it and
 * every sentence builder share.
 */
class TidyTest {

    @Test
    void aCardNumberIsStrippedButACardsOwnBracketsStay() {
        assertEquals("Grizzly Bears", PlainWords.tidy("Grizzly Bears (68)"));
        assertEquals("Pay for Monitor Monitor", PlainWords.tidy("Pay for Monitor Monitor (38)\n"));
        assertEquals("Change the target of Lightning Bolt?", PlainWords.tidy("Change the target of Lightning Bolt (9)?"));
        assertEquals("Hazmat Suit (Used) enters.", PlainWords.tidy("Hazmat Suit (Used) enters."));
        // A number in brackets after a word that is not a name is a value, not a card number.
        assertEquals("Exchange the roll of 5 with power (5) or toughness (3)?",
                PlainWords.tidy("Exchange the roll of 5 with power (5) or toughness (3)?"));
        // Brackets that hold more than digits are words, not a card number.
        assertEquals("Choose a card to put back (2 to go).", PlainWords.tidy("Choose a card to put back (2 to go)."));
    }

    @Test
    void theMaybePluralGoesByTheCountBesideIt() {
        assertEquals("Up to one more card can be selected.",
                PlainWords.tidy("Up to 1 more card(s) can be selected."));
        assertEquals("one more card", PlainWords.tidy("1 more card(s)"));
        assertEquals("Select two cards of same color to reveal.",
                PlainWords.tidy("Select 2 card(s) of same color to reveal."));
        assertEquals("Do you want to draw a card?", PlainWords.tidy("Do you want to draw a card(s)?"));
        assertEquals("Choose 12 cards", PlainWords.tidy("Choose 12 card(s)"));
        // No count beside it: the plural.
        assertEquals("Alice picked cards from Bob's library:",
                PlainWords.tidy("Alice picked card(s) from Bob's library:"));
        assertEquals("Choose cards to put into hand", PlainWords.tidy("Choose card(s) to put into hand"));
        assertEquals("two cards left", PlainWords.tidy("2 card(s) left"));
    }

    @Test
    void forgesBrokenPluralsAreLeftToTheirOwnRows() {
        // "Elfs" is Forge's own cost text; the table row for it (W1-338) fixes it,
        // not the cleanup, which never guesses at a word.
        assertEquals("Tap five untapped Elfs you control", PlainWords.tidy("Tap five untapped Elfs you control"));
    }

    @Test
    void aJoiningDashBecomesAColonButATypeLineKeepsThePrintedDash() {
        assertEquals("Goblin Bangchuckers: Call coin flip", PlainWords.tidy("Goblin Bangchuckers - Call coin flip"));
        assertEquals("Leyline of the Void: If a card would be put into an opponent's graveyard",
                PlainWords.tidy("Leyline of the Void - If a card would be put into an opponent's graveyard"));
        assertEquals("Creature — Goblin", PlainWords.tidy("Creature - Goblin"));
        assertEquals("Legendary Creature — Human Knight", PlainWords.tidy("Legendary Creature - Human Knight"));
        assertEquals("Artifact Creature — Golem", PlainWords.tidy("Artifact Creature - Golem"));
        // Inside a card's own name, never.
        assertEquals("Look at Tempest - Storm (2).",
                PlainWords.tidy("Look at Tempest - Storm (2).", List.of("Tempest - Storm (2)")));
        // Hyphenated words are not joiners.
        assertEquals("a face-down card", PlainWords.tidy("a face-down card"));
        assertEquals("-1/-1", PlainWords.tidy("-1/-1"));
    }

    @Test
    void aDungeonRoomsStackWordsDropForgesLabel() {
        assertEquals("Lost Well: Scry 2. (Leads to: Arena, Stash)", PlainWords.stackDescription(
                "Lost Well — Scry 2. (Leads to: Arena, Stash) [Room: Lost Well]", "Lost Well"));
    }

    @Test
    void spacesAreCollapsedAndTrimmed() {
        assertEquals("Untap two tapped creatures you control",
                PlainWords.tidy("Untap two  tapped creatures you control"));
        assertEquals("Choose a source", PlainWords.tidy("Choose a source "));
        assertEquals("Transformed cards in Alice's battlefield",
                PlainWords.tidy("Transformed cards in  Alice's battlefield"));
        assertEquals("Draw a card.", PlainWords.tidy("Draw a card ."));
        assertNull(PlainWords.tidy(null));
        assertEquals("", PlainWords.tidy(""));
    }

    @Test
    void numbersOneToTenAreWordsInSentences() {
        assertEquals("zero", PlainWords.number(0));
        assertEquals("one", PlainWords.number(1));
        assertEquals("ten", PlainWords.number(10));
        assertEquals("11", PlainWords.number(11));
        assertEquals("-3", PlainWords.number(-3));
        assertEquals("Seven", PlainWords.capitalNumber(7));
        assertEquals("two cards", PlainWords.count(2, "card"));
        assertEquals("one card", PlainWords.count(1, "card"));
        assertEquals("12 Goblin tokens", PlainWords.count(12, "Goblin token"));
        assertEquals("a card", PlainWords.some(1, "card"));
        assertEquals("three charge counters", PlainWords.count(3, "charge counter"));
    }

    @Test
    void theArticleGoesByTheFirstSound() {
        assertEquals("an Island", PlainWords.withArticle("Island"));
        assertEquals("a Forest", PlainWords.withArticle("Forest"));
        assertEquals("an Elf Warrior token", PlainWords.some(1, "Elf Warrior token"));
        assertEquals("a +1/+1 counter", PlainWords.withArticle("+1/+1 counter"));
        assertEquals("a one-eyed giant", PlainWords.withArticle("one-eyed giant"));
        assertEquals("an 8/8", PlainWords.withArticle("8/8"));
        assertEquals("Elves", PlainWords.plural("Elf"));
        assertEquals("creatures", PlainWords.plural("creature"));
        assertEquals("A, B and C", PlainWords.and(List.of("A", "B", "C")));
        assertEquals("A or B", PlainWords.or(List.of("A", "B")));
    }
}
