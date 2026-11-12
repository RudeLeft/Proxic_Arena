package net.barnflix.proxic.worker.game;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Spec 0061 -- nothing thrown away by one click; say why a card left. The
 * words the worker writes (items 2, 4, 5), as plain functions. Items 1 and 3
 * (the missing play's reason, the discard count) are driven against Forge by
 * the Mechanics Lab (scripts/check-thrown-away.py).
 */
class ThrownAwayTest {

    // --- item 2: a turn passed for you says so ---------------------------------------

    @Test
    void theOwnersGameOneLandNoLandInHand() {
        assertEquals("Nothing you can play this turn -- 1 land, no land in hand. Passing your turn.",
                PriorityStops.nothingToPlay(1, 0, false, false));
    }

    @Test
    void thePassedTurnSaysWhyNoLandComesFromTheHand() {
        assertEquals("Nothing you can play this turn -- 3 lands, you've already played a land this turn."
                + " Passing your turn.", PriorityStops.nothingToPlay(3, 2, true, false));
        assertEquals("Nothing you can play this turn -- No lands, no land in hand. Passing your turn.",
                PriorityStops.nothingToPlay(0, 0, false, false));
        assertEquals("Nothing you can play this turn -- 2 lands, no land in hand. Passing your turn"
                + " (you can still attack).", PriorityStops.nothingToPlay(2, 0, false, true));
    }

    @Test
    void eachPassedStepPausesNoMoreThanTheBriefAllows() {
        assertEquals(400, PriorityStops.STEP_PAUSE_MS);
    }

    // --- item 4: every card going to a graveyard says why ----------------------------

    private static String[] reason(String from, boolean discarded, boolean cycled, boolean cleanup,
                                   String counteredBy, boolean sacrificed, boolean destroyed, boolean creature) {
        return Moves.graveReason(new Moves.GraveFacts(from, discarded, cycled, cleanup, counteredBy,
                sacrificed, destroyed, creature));
    }

    @Test
    void theCanvasFourReasons() {
        assertArrayEquals(new String[] {"cycled", "Cycled"},
                reason("hand", true, true, false, null, false, false, false));
        assertArrayEquals(new String[] {"discarded", "Discarded: too many cards"},
                reason("hand", true, false, true, null, false, false, true));
        assertArrayEquals(new String[] {"countered", "Countered by Counterspell"},
                reason("stack", false, false, false, "Counterspell", false, false, false));
        // Spec 0066, item 6: a creature Forge destroyed (Shock's lethal damage)
        // has no words -- the shatter shows it -- and A-00's why stays.
        assertArrayEquals(new String[] {"destroyed", null},
                reason("battlefield", false, false, false, null, false, true, true));
    }

    @Test
    void theOtherReasons() {
        assertArrayEquals(new String[] {"discarded", "Discarded"},
                reason("hand", true, false, false, null, false, false, false));
        // Spec 0066, item 6: from the battlefield, the why with no words.
        assertArrayEquals(new String[] {"sacrificed", null},
                reason("battlefield", false, false, false, null, true, false, true));
        assertArrayEquals(new String[] {"died", null},
                reason("battlefield", false, false, false, null, false, false, true));
        assertArrayEquals(new String[] {"destroyed", null},
                reason("battlefield", false, false, false, null, false, true, false));
    }

    @Test
    void nothingIsSaidWithoutAFact() {
        // A spell that resolved, a card milled, an Aura that fell off.
        assertNull(reason("stack", false, false, false, null, false, false, false));
        assertNull(reason("library", false, false, false, null, false, false, true));
        assertNull(reason("battlefield", false, false, false, null, false, false, false));
        // A hand card that went to the graveyard without a discard (Forge's own record).
        assertNull(reason("hand", false, false, true, null, false, false, true));
    }

    @Test
    void theTagTravelsWithANamedMoveOnly() {
        Moves.Move cycled = new Moves.Move(62, "hand", 2, "graveyard", 2, false, null)
                .withSaid("cycled", "Cycled", "Forgotten Cave");
        JsonObject mine = Moves.forViewer(List.of(cycled), 2).get(0).getAsJsonObject();
        assertEquals("cycled", mine.get("why").getAsString());
        assertEquals("Cycled", mine.get("said").getAsString());
        // The name is for what the game tells the players, never the move.
        assertFalse(mine.has("name"));
        JsonObject theirs = Moves.forViewer(List.of(cycled), 1).get(0).getAsJsonObject();
        assertEquals("Cycled", theirs.get("said").getAsString(), "a graveyard is public");
        Moves.Move hidden = new Moves.Move(5, "library", 2, "other", 2, false, null)
                .withSaid("discarded", "Discarded", "Secret");
        assertFalse(Moves.forViewer(List.of(hidden), 1).get(0).getAsJsonObject().has("said"));
    }

    // --- item 5: the payment window says what it's for ---------------------------------

    @Test
    void payToCycleForgottenCave() {
        assertArrayEquals(new String[] {"to cycle Forgotten Cave",
            "Then Forgotten Cave goes to your graveyard and you draw a card."},
                PlainWords.payFor("cycling", "Forgotten Cave", "Draw a card."));
    }

    @Test
    void otherAbilitiesSayWhatTheyDo() {
        assertArrayEquals(new String[] {"to equip a creature with Bonesplitter", null},
                PlainWords.payFor("equip", "Bonesplitter", "Attach to target creature you control."));
        assertArrayEquals(new String[] {"to draw a card with Jayemdae Tome", null},
                PlainWords.payFor("other", "Jayemdae Tome", "Draw a card."));
        // Words that don't read on after "to": the card's ability, its words under it.
        assertArrayEquals(new String[] {"for Prodigal Sorcerer's ability",
            "Prodigal Sorcerer deals 1 damage to any target."},
                PlainWords.payFor("other", "Prodigal Sorcerer", "Prodigal Sorcerer deals 1 damage to any target."));
    }
}
