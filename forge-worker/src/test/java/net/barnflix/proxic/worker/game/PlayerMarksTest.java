package net.barnflix.proxic.worker.game;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Spec 0086 -- where floating mana came from, extra turns and completed dungeons, as sent. */
class PlayerMarksTest {

    @Test
    void thePoolIsRunsOfOneColourFromOneCard() {
        // A Swamp's black, then Dark Ritual's three: two runs, the Ritual's of 3.
        List<PlayerMarks.Run> runs = PlayerMarks.runs(List.of(
                new String[] {"B", "card:1"},
                new String[] {"B", "card:7"},
                new String[] {"B", "card:7"},
                new String[] {"B", "card:7"}));
        assertEquals(List.of(new PlayerMarks.Run("B", "card:1", 1), new PlayerMarks.Run("B", "card:7", 3)), runs);
        // One card's two colours are two runs; a mana with no card is its own.
        assertEquals(List.of(new PlayerMarks.Run("R", "card:3", 1), new PlayerMarks.Run("G", "card:3", 1),
                        new PlayerMarks.Run("C", null, 2)),
                PlayerMarks.runs(List.of(new String[] {"R", "card:3"}, new String[] {"G", "card:3"},
                        new String[] {"C", null}, new String[] {"C", null})));
        assertTrue(PlayerMarks.runs(List.of()).isEmpty());
    }

    @Test
    void colourLettersAreThePools() {
        byte[] types = forge.card.mana.ManaAtom.MANATYPES;
        String[] letters = {"W", "U", "B", "R", "G", "C"};
        for (int i = 0; i < types.length; i++) {
            assertEquals(letters[i], PlayerMarks.letter(types[i]));
        }
    }

    @Test
    void anExtraTurnIsToldToTheOtherPlayerAndADungeonToTheOther() {
        assertEquals("Extra turn: this is Alice's turn again.", ActionReports.extraTurnWords("Alice"));
        assertEquals("Extra turn: this is your turn again.", ActionReports.extraTurnWords(null));
        // reader, actor (whose turn), subject, chooser (who played the card).
        // Amendment 4 (owner 2026-11-15): Alice's Time Warp -- Bob's window, not hers.
        assertFalse(ActionReports.tells(ActionReports.Kind.EXTRA_TURN, "alice", "alice", "alice", "alice"));
        assertTrue(ActionReports.tells(ActionReports.Kind.EXTRA_TURN, "bob", "alice", "alice", "alice"));
        // A turn Alice gave Bob: Bob is told, Alice (who played it) is not.
        assertTrue(ActionReports.tells(ActionReports.Kind.EXTRA_TURN, "bob", "bob", "bob", "alice"));
        assertFalse(ActionReports.tells(ActionReports.Kind.EXTRA_TURN, "alice", "bob", "bob", "alice"));
        assertTrue(ActionReports.tells(ActionReports.Kind.DUNGEON, "bob", "alice", "alice", "alice"));
        assertFalse(ActionReports.tells(ActionReports.Kind.DUNGEON, "alice", "alice", "alice", "alice"));
    }
}
