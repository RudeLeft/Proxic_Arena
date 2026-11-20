package net.barnflix.proxic.worker.game;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import forge.game.zone.ZoneType;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Spec 0104 -- you always choose: the pure parts of the change. The game
 * itself (Alice asked with one option, the hand shown, Bob's window, the
 * reveal kept) is the Lab's, `check-always-choose.py`.
 */
class AlwaysChooseTest {

    private static final String ALICE = "Alice";
    private static final String BOB = "Bob";

    @Test
    void aHandExileIsToldToTheHandsOwnerOnlyNeverTheChooser() {
        // F-0104-D: Alice's Appetite for Brains takes Bob's Hill Giant.
        assertTrue(ActionReports.tells(ActionReports.Kind.HAND_EXILE, BOB, ALICE, BOB, ALICE));
        assertFalse(ActionReports.tells(ActionReports.Kind.HAND_EXILE, ALICE, ALICE, BOB, ALICE));
        // Her own card, by her own effect: nobody.
        assertFalse(ActionReports.tells(ActionReports.Kind.HAND_EXILE, ALICE, ALICE, ALICE, ALICE));
        assertFalse(ActionReports.tells(ActionReports.Kind.HAND_EXILE, BOB, ALICE, ALICE, ALICE));
    }

    @Test
    void theVictimsWords() {
        assertEquals("Alice exiled your Hill Giant.",
                ActionReports.handExileWords("Alice", "your", "Hill Giant", ZoneType.Exile));
        assertEquals("Alice exiled your Lightning Bolt.",
                ActionReports.handExileWords("Alice", "your", "Lightning Bolt", null));
        assertEquals("Alice put your Hill Giant into your graveyard.",
                ActionReports.handExileWords("Alice", "your", "Hill Giant", ZoneType.Graveyard));
    }

    @Test
    void whyAShownCardCannotBeChosenIsSaidFromItsOwnValues() {
        // F-0104-C: Appetite's Card.cmcGE4 on Lightning Bolt, on Island.
        assertEquals("mana value 1", NotChosen.reason("cmcGE4", false, 1));
        assertEquals("mana value 2", NotChosen.reason("cmcGE4", false, 2));
        assertEquals("a land", NotChosen.reason("cmcGE4", true, 0));
        // Castigate's Card.nonLand on Island; Kitesail Freebooter's nonCreature.
        assertEquals("a land", NotChosen.reason("nonLand", true, 0));
        assertEquals("a creature", NotChosen.reason("nonCreature", false, 2));
        // A test there are no words for: as the page said before.
        assertEquals(NotChosen.CANT, NotChosen.reason("IsRemembered", false, 3));
        assertEquals("can't be chosen", NotChosen.CANT);
        assertEquals(NotChosen.CANT, NotChosen.why(null, null));
    }

    @Test
    void thePromptIsTheEffectsOwnWordsWhole() {
        assertEquals("Appetite for Brains: You choose a card from it with mana value 4 or greater and exile that card.",
                MatchController.choiceWords(
                        "You choose a card from it with mana value 4 or greater and exile that card.",
                        "Appetite for Brains", false));
        // Not cut at the first sentence, as a target's prompt is.
        assertEquals("Divine Reckoning: Each player chooses a creature they control. Destroy the rest.",
                MatchController.choiceWords("Each player chooses a creature they control. Destroy the rest.",
                        "Divine Reckoning", false));
        // An ability's cost is not what is chosen for.
        assertEquals("Elvish Visionary: Return a card.",
                MatchController.choiceWords("{T}: Return a card", "Elvish Visionary", true));
        assertNull(MatchController.choiceWords("", "Anything", false));
        assertNull(MatchController.choiceWords(null, "Anything", false));
    }

    @Test
    void aFreeCastOfAnAdventureCardAsksForTheHalfEvenWithOne() {
        // Owner 2026-11-19, "Ask her too": cascade (DigUntil, then Play) into Brazen Borrower.
        java.util.List<forge.game.ability.ApiType> cascade =
                List.of(forge.game.ability.ApiType.DigUntil, forge.game.ability.ApiType.Play);
        assertTrue(MatchController.asksForTheHalf(true, cascade));
        // Not an adventure card, or not a free cast (the card clicked in hand): the click was the choice.
        assertFalse(MatchController.asksForTheHalf(false, cascade));
        assertFalse(MatchController.asksForTheHalf(true, List.of(forge.game.ability.ApiType.DigUntil)));
        assertFalse(MatchController.asksForTheHalf(true, List.of()));
    }

    @Test
    void aRevealClosesWithTheReportsCloseMessage() {
        // F-0104-F: closing up to a stamp closes the reveal stamped at or below it.
        assertTrue(Causes.closes(3, 3));
        assertTrue(Causes.closes(2, 5));
        assertFalse(Causes.closes(6, 5));
    }

    @Test
    void thePlayLogNamesTheChooserAndWhoseHand() {
        // F-0104-D: "Alice exiled Hill Giant from Bob's hand (Appetite for Brains)".
        JsonObject giant = new JsonObject();
        giant.addProperty("name", "Hill Giant");
        JsonArray line = PlayLog.handExile(new PlayLog.Chooser(1, "Appetite for Brains"), 2, List.<JsonElement>of(giant));
        assertEquals(1, line.get(0).getAsJsonObject().get("player").getAsInt());
        assertEquals(" exiled ", line.get(1).getAsString());
        assertEquals("Hill Giant", line.get(2).getAsJsonObject().get("name").getAsString());
        assertEquals(" from ", line.get(3).getAsString());
        assertEquals(2, line.get(4).getAsJsonObject().get("player").getAsInt());
        assertEquals("'s hand (Appetite for Brains)", line.get(5).getAsString());
    }
}
