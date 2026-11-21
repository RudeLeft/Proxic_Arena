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

    // Spec 0097, item 2: said on the act button ("Nothing to play · 1 land, no
    // land in hand"), so the worker sends only the why.
    @Test
    void theOwnersGameOneLandNoLandInHand() {
        assertEquals("One land; no land in hand", PriorityStops.nothingToPlay(1, 0, false));
    }

    @Test
    void thePassedTurnSaysWhyNoLandComesFromTheHand() {
        assertEquals("Three lands; a land already played this turn", PriorityStops.nothingToPlay(3, 2, true));
        assertEquals("No lands; no land in hand", PriorityStops.nothingToPlay(0, 0, false));
        assertEquals("Two lands; no land you can play", PriorityStops.nothingToPlay(2, 1, false));
    }

    @Test
    void eachPassedStepPausesNoMoreThanTheBriefAllows() {
        assertEquals(400, PriorityStops.STEP_PAUSE_MS);
    }

    // --- item 4: every card going to a graveyard says why ----------------------------

    private static String reason(String from, boolean discarded, boolean cycled, boolean cleanup,
                                   String counteredBy, boolean sacrificed, boolean destroyed, boolean creature) {
        return Moves.graveReason(new Moves.GraveFacts(from, discarded, cycled, cleanup, counteredBy,
                sacrificed, destroyed, creature));
    }

    // Spec 0097, item 9: the why only -- the word tags are gone.
    @Test
    void theCanvasFourReasons() {
        assertEquals("cycled", reason("hand", true, true, false, null, false, false, false));
        assertEquals("discarded", reason("hand", true, false, true, null, false, false, true));
        assertEquals("countered", reason("stack", false, false, false, "Counterspell", false, false, false));
        // Spec 0066, item 6: a creature Forge destroyed (Shock's lethal damage):
        // the shatter shows it, and A-00's why stays.
        assertEquals("destroyed", reason("battlefield", false, false, false, null, false, true, true));
    }

    @Test
    void theOtherReasons() {
        assertEquals("discarded", reason("hand", true, false, false, null, false, false, false));
        assertEquals("sacrificed", reason("battlefield", false, false, false, null, true, false, true));
        assertEquals("died", reason("battlefield", false, false, false, null, false, false, true));
        assertEquals("destroyed", reason("battlefield", false, false, false, null, false, true, false));
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
    void theWhyTravelsWithANamedMoveAndNoWordTag() {
        Moves.Move cycled = new Moves.Move(62, "hand", 2, "graveyard", 2, false, null)
                .withWhy("cycled", "Forgotten Cave");
        JsonObject mine = Moves.forViewer(List.of(cycled), 2).get(0).getAsJsonObject();
        assertEquals("cycled", mine.get("why").getAsString());
        // Spec 0097, item 9: no word pill rides on the card any more.
        assertFalse(mine.has("said"));
        // The name is for what the game tells the players, never the move.
        assertFalse(mine.has("name"));
        JsonObject theirs = Moves.forViewer(List.of(cycled), 1).get(0).getAsJsonObject();
        assertEquals("cycled", theirs.get("why").getAsString(), "a graveyard is public");
        assertFalse(theirs.has("said"));
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
