package net.barnflix.proxic.worker.game;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * Spec 0080 -- flicker as one move, phasing and survivors told, prevented
 * damage put into the wave where it would have landed.
 */
class SurvivorsTest {

    private static JsonObject player(int seat) {
        JsonObject t = new JsonObject();
        t.addProperty("player", seat);
        return t;
    }

    private static JsonObject object(String id) {
        JsonObject t = new JsonObject();
        t.addProperty("object", id);
        return t;
    }

    private static JsonObject hit(String source, JsonObject target, int amount) {
        JsonObject h = new JsonObject();
        h.addProperty("source", source);
        h.add("target", target);
        h.addProperty("amount", amount);
        return h;
    }

    @Test
    void ephemerateIsOneMoveByWayOfExile() {
        // F-0080-A: battlefield -> exile -> battlefield, the same id, one round.
        List<Moves.Move> moves = List.of(
                new Moves.Move(30, "battlefield", 2, "exile", 2, false, null),
                new Moves.Move(30, "exile", 2, "battlefield", 2, false, null));
        List<Moves.Move> told = Moves.flickers(moves);
        assertEquals(1, told.size());
        for (Integer viewer : new Integer[] {1, 2, null}) {
            JsonArray out = Moves.forViewer(told, viewer);
            assertEquals(1, out.size());
            JsonObject m = out.get(0).getAsJsonObject();
            assertEquals("card:30", m.get("card").getAsString());
            assertEquals("flickered", m.get("why").getAsString());
            assertEquals("battlefield", m.getAsJsonObject("from").get("zone").getAsString());
            assertEquals("battlefield", m.getAsJsonObject("to").get("zone").getAsString());
            assertEquals("exile", m.getAsJsonObject("via").get("zone").getAsString());
            assertEquals(2, m.getAsJsonObject("via").get("seat").getAsInt());
        }
    }

    @Test
    void flickerwispsLaterReturnKeepsItsTwoMoves() {
        // Exiled this round, nothing back yet: unchanged.
        List<Moves.Move> out = List.of(new Moves.Move(31, "battlefield", 1, "exile", 1, false, null));
        assertEquals(out, Moves.flickers(out));
        // Back in a later round: just a return from exile.
        List<Moves.Move> back = List.of(new Moves.Move(31, "exile", 1, "battlefield", 1, false, null));
        assertEquals(back, Moves.flickers(back));
        // A card exiled and another returned are two moves.
        List<Moves.Move> two = List.of(
                new Moves.Move(32, "battlefield", 1, "exile", 1, false, null),
                new Moves.Move(33, "exile", 1, "battlefield", 1, false, null));
        assertEquals(2, Moves.flickers(two).size());
    }

    @Test
    void holyDayPutsEachPreventedHitWhereItWouldHaveLanded() {
        // F-0080-E: two attackers, all of it prevented: no real hit at all.
        List<Survivors.Pending> pending = List.of(
                new Survivors.Pending(new Object(), "card:5", player(2), 2, 0),
                new Survivors.Pending(new Object(), "card:6", player(2), 3, 0));
        List<JsonObject> wave = Survivors.withPrevented(new ArrayList<>(), pending);
        assertEquals(2, wave.size());
        assertEquals(0, wave.get(0).get("amount").getAsInt());
        assertEquals(2, wave.get(0).get("prevented").getAsInt());
        assertEquals("card:5", wave.get(0).get("source").getAsString());
        assertEquals(3, wave.get(1).get("prevented").getAsInt());
    }

    @Test
    void aPartlyPreventedHitKeepsWhatGotThrough() {
        // "Prevent the next 2": a 3-point hit dealt 1.
        List<JsonObject> hits = new ArrayList<>(List.of(hit("card:7", object("card:9"), 1)));
        List<Survivors.Pending> pending = List.of(new Survivors.Pending(new Object(), "card:7", object("card:9"), 3, 0));
        List<JsonObject> wave = Survivors.withPrevented(hits, pending);
        assertEquals(2, wave.size());
        assertEquals(2, wave.get(0).get("prevented").getAsInt());
        assertEquals(1, wave.get(1).get("amount").getAsInt());
        assertFalse(wave.get(1).has("prevented"));
    }

    @Test
    void nothingPreventedAddsNothing() {
        // The replacement was chosen but the damage went through (it could not be prevented).
        List<JsonObject> hits = new ArrayList<>(List.of(hit("card:7", player(1), 3)));
        List<Survivors.Pending> pending = List.of(new Survivors.Pending(new Object(), "card:7", player(1), 3, 0));
        assertEquals(1, Survivors.withPrevented(hits, pending).size());
    }

    @Test
    void phasesAndSurvivorsAreToldOnceEach() {
        JsonArray phased = Survivors.phasedJson(List.of(new Survivors.Phase(4, true), new Survivors.Phase(5, false)));
        assertEquals("card:4", phased.get(0).getAsJsonObject().get("card").getAsString());
        assertTrue(phased.get(0).getAsJsonObject().get("out").getAsBoolean());
        assertFalse(phased.get(1).getAsJsonObject().get("out").getAsBoolean());
        JsonArray survived = Survivors.survivedJson(List.of(
                new Survivors.Survived(8, "indestructible"),
                new Survivors.Survived(8, "indestructible"),
                new Survivors.Survived(9, "regenerated")));
        assertEquals(2, survived.size());
        assertEquals("regenerated", survived.get(1).getAsJsonObject().get("how").getAsString());
    }

    @Test
    void phasedOutBobsBoardIsToldToBothButNotToBobAlone() {
        // F-0080-B: Bob's Teferi's Protection -- Alice's window; Bob did it to himself.
        assertTrue(ActionReports.tells(ActionReports.Kind.PHASE, "Alice", "Bob", "Bob", "Bob"));
        assertFalse(ActionReports.tells(ActionReports.Kind.PHASE, "Bob", "Bob", "Bob", "Bob"));
        // Alice phases Bob's creature out: both.
        assertTrue(ActionReports.tells(ActionReports.Kind.PHASE, "Bob", "Alice", "Bob", "Alice"));
    }

    @Test
    void lifeThatCannotChangeIsSaidInTheReadersWords() {
        // Teferi's Protection: Alice reads Bob's; Bob would read his own.
        assertEquals("Bob's life can't change.", ActionReports.lifeWords("Bob"));
        assertEquals("Your life can't change.", ActionReports.lifeWords(null));
    }

    @Test
    void noEffectNoLifeSentence() {
        // No effect card (Slip Out the Back's phasing): nothing held, nothing said.
        assertFalse(ActionReports.lifeHeldBy(null, null, null));
    }

    /**
     * VEND-004 -- the reflective read of Forge's damage replacement list. If
     * Forge renames it, prevented damage goes untold; this fails so somebody
     * notices.
     */
    @Test
    void forgeStillHasTheDamageList() {
        assertNotNull(Survivors.DAMAGE_LIST);
    }
}
