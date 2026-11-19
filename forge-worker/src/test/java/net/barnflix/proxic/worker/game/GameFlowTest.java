package net.barnflix.proxic.worker.game;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.List;

/**
 * Spec 0089 -- an extra combat's report (F-0089-C) and an umbra destroyed
 * instead of its creature (F-0089-D): who is told, in their words, and the
 * survivor the page draws the shield for (the umbra has no report window
 * since 2026-11-18, owner). The games themselves are
 * scripts/check-game-flow.py (Aurelia, Relentless Assault; Hyena Umbra and
 * Wrath of God), from both seats.
 */
class GameFlowTest {

    private static final String ALICE = "Alice";
    private static final String BOB = "Bob";

    @Test
    void anExtraCombatIsToldOnlyToThePlayerWhoDidNotPlayTheCard() {
        // F-0089-C, Amendment 1 (owner 2026-11-15): Alice's Aurelia -- Bob's window, not hers.
        assertFalse(ActionReports.tells(ActionReports.Kind.EXTRA_COMBAT, ALICE, ALICE, ALICE, ALICE));
        assertTrue(ActionReports.tells(ActionReports.Kind.EXTRA_COMBAT, BOB, ALICE, ALICE, ALICE));
        // A combat Alice gave Bob's turn: Bob is told, Alice (who played it) is not.
        assertTrue(ActionReports.tells(ActionReports.Kind.EXTRA_COMBAT, BOB, BOB, BOB, ALICE));
        assertFalse(ActionReports.tells(ActionReports.Kind.EXTRA_COMBAT, ALICE, BOB, BOB, ALICE));
    }

    @Test
    void theExtraCombatSentenceIsTheCanvasOneInTheReadersWords() {
        assertEquals("Extra combat: Alice attacks again.", ActionReports.extraCombatWords("Alice"));
        assertEquals("Extra combat: you attack again.", ActionReports.extraCombatWords(null));
    }

    @Test
    void anUmbraDestroyedInsteadHasNoReportWindow() {
        // Owner 2026-11-18 (spec 0101's rule for every survive look): the umbra's
        // shield on the table shows it; no report window for either player. The
        // game itself (no "instead of" report to either seat) is
        // scripts/check-game-flow.py's umbra scenario.
        for (ActionReports.Kind kind : ActionReports.Kind.values()) {
            assertFalse(kind.name().contains("UMBRA"), "a report kind for the umbra: " + kind);
        }
        for (java.lang.reflect.Method method : ActionReports.class.getDeclaredMethods()) {
            assertFalse(method.getName().toLowerCase(java.util.Locale.ROOT).contains("umbra"),
                    "ActionReports makes an umbra report: " + method.getName());
        }
    }

    @Test
    void anUmbraSurvivorNamesTheAuraDestroyedInstead() {
        JsonArray survived = Survivors.survivedJson(List.of(
                new Survivors.Survived(8, "umbra", 12),
                new Survivors.Survived(9, "regenerated")));
        JsonObject umbra = survived.get(0).getAsJsonObject();
        assertEquals("card:8", umbra.get("card").getAsString());
        assertEquals("umbra", umbra.get("how").getAsString());
        assertEquals("card:12", umbra.get("by").getAsString());
        // Any other survivor has no `by`.
        assertFalse(survived.get(1).getAsJsonObject().has("by"));
    }

    @Test
    void noReplacementIsNoUmbra() {
        assertNull(Survivors.umbraSave(null));
    }
}
