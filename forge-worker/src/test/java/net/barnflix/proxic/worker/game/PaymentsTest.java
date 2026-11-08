package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Spec 0062: what each mana paid, told to each seat as far as it may know. */
class PaymentsTest {

    private static JsonObject only(JsonArray records) {
        assertEquals(1, records.size());
        return records.get(0).getAsJsonObject();
    }

    private static JsonObject mana(JsonObject record, int i) {
        return record.getAsJsonArray("mana").get(i).getAsJsonObject();
    }

    @Test
    void theCasterIsToldEverySymbolTheOthersOnlyColourAndSource() {
        Payments payments = new Payments();
        Object nekrataal = new Object();
        Payments.Payment p = payments.open(nekrataal, "{2}{B}{B}", false);
        payments.paid(1, p, "card:40", "cast", true, "{1}{B}{B}",
                List.of(new Payments.Mana("G", "1", "card:5")));

        JsonObject mine = only(payments.forViewer(1));
        assertEquals("{2}{B}{B}", mine.get("cost").getAsString());
        assertEquals("{1}{B}{B}", mine.get("owing").getAsString());
        assertEquals("G", mana(mine, 0).get("colour").getAsString());
        assertEquals("1", mana(mine, 0).get("shard").getAsString());
        assertEquals("card:5", mana(mine, 0).get("from").getAsString());

        for (Integer other : new Integer[] {2, null}) {
            JsonObject theirs = only(payments.forViewer(other));
            assertFalse(theirs.has("cost"), "the cost of a spell drawn face down stays hidden");
            assertFalse(theirs.has("owing"));
            assertFalse(mana(theirs, 0).has("shard"), "no symbol: it would tell the cost");
            assertEquals("G", mana(theirs, 0).get("colour").getAsString());
            assertEquals("card:5", mana(theirs, 0).get("from").getAsString());
            assertEquals("card:40", theirs.get("for").getAsString());
        }
    }

    @Test
    void anAbilityIsPublicToEveryone() {
        Payments payments = new Payments();
        Payments.Payment p = payments.open(new Object(), "{1}{G}", false);
        payments.paid(2, p, "card:9", "ability", false, "{1}", List.of(new Payments.Mana("G", "G", "card:3")));
        for (Integer viewer : new Integer[] {1, 2, null}) {
            JsonObject r = only(payments.forViewer(viewer));
            assertEquals("{1}{G}", r.get("cost").getAsString());
            assertEquals("G", mana(r, 0).get("shard").getAsString());
        }
    }

    @Test
    void solRingsTwoManaAreOneStepTwoBalls() {
        Payments payments = new Payments();
        Payments.Payment p = payments.open(new Object(), "{3}{R}", false);
        payments.paid(1, p, "card:1", "cast", true, "{1}{R}",
                List.of(new Payments.Mana("C", "1", "card:2"), new Payments.Mana("C", "1", "card:2")));
        JsonObject r = only(payments.forViewer(1));
        assertEquals(2, r.getAsJsonArray("mana").size());
        assertEquals("C", mana(r, 1).get("colour").getAsString());
    }

    @Test
    void numbersOnlyGrowAndOnlyTheLatestAreKept() {
        Payments payments = new Payments();
        Payments.Payment p = payments.open(new Object(), "{1}", false);
        for (int i = 0; i < Payments.KEPT + 5; i++) {
            payments.paid(1, p, "card:1", "ability", false, "{0}", List.of(new Payments.Mana("R", "1", "pool")));
        }
        JsonArray all = payments.forViewer(1);
        assertEquals(Payments.KEPT, all.size());
        assertEquals(Payments.KEPT + 5, all.get(all.size() - 1).getAsJsonObject().get("n").getAsInt());
        assertEquals(6, all.get(0).getAsJsonObject().get("n").getAsInt());
    }

    @Test
    void aStepThatPaidNothingIsNotRecorded() {
        Payments payments = new Payments();
        payments.paid(1, payments.open(new Object(), "{1}", false), "card:1", "ability", false, "{1}", List.of());
        assertEquals(0, payments.forViewer(1).size());
    }

    @Test
    void theManaAfterConvokeIsTheSamePaymentAndANewCastIsNot() {
        Payments payments = new Payments();
        Object loxodon = new Object();
        Payments.Payment convoked = payments.open(loxodon, "{4}{W}", true);
        assertSame(convoked, payments.open(loxodon, "{4}{W}", true), "each creature tapped: the same payment");
        Payments.Payment mana = payments.open(loxodon, "{1}", false);
        assertEquals(convoked.id(), mana.id());
        assertEquals("{4}{W}", mana.cost(), "the cost drawn is the one before convoke");
        assertNotEquals(convoked.id(), payments.open(loxodon, "{4}{W}", false).id(), "cast again: a new payment");
        assertNotEquals(convoked.id(), payments.open(new Object(), "{2}", false).id());
    }

    @Test
    void whichSymbolOneManaPaid() {
        assertEquals("1", Payments.shardPaid(List.of("1", "1", "B", "B"), List.of("1", "B", "B")));
        assertEquals("B", Payments.shardPaid(List.of("1", "B", "B"), List.of("1", "B")));
        assertEquals("1", Payments.shardPaid(List.of("1", "B"), List.of("B")), "the last mana too");
        // {2/W} paid with a mana that is not white: one generic more, the {2/W} gone.
        assertEquals("2/W", Payments.shardPaid(List.of("2/W"), List.of("1")));
        assertNull(Payments.shardPaid(List.of("1"), List.of("1")));
    }

    @Test
    void coloursAsPlayersReadThem() {
        assertEquals("W", Payments.colour(1));
        assertEquals("U", Payments.colour(2));
        assertEquals("B", Payments.colour(4));
        assertEquals("R", Payments.colour(8));
        assertEquals("G", Payments.colour(16));
        assertEquals("C", Payments.colour(32));
        assertEquals("C", Payments.colour(0));
        assertEquals("B", Payments.colourOfShard("B/P"));
        assertEquals("W", Payments.colourOfShard("2/W"));
        assertEquals("C", Payments.colourOfShard("C/P"));
        assertTrue(Payments.colourOfShard(null).equals("C"));
    }
}
