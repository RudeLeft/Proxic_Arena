package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Spec 0077 -- each life change is told with its kind (damage, loss, gain,
 * poison), amount and source, in the order Forge's events make them; an
 * infect hit is poison, never life (the bug: GameHost dropped Forge's flag).
 */
class LifeChangesTest {

    private static JsonArray changes(LifeChanges life) {
        JsonObject out = life.flush("life:7");
        assertEquals("life:7", out.get("key").getAsString());
        return out.getAsJsonArray("changes");
    }

    private static void is(JsonObject change, int player, String kind, int amount, String source) {
        assertEquals(player, change.get("player").getAsInt(), change.toString());
        assertEquals(kind, change.get("kind").getAsString(), change.toString());
        assertEquals(amount, change.get("amount").getAsInt(), change.toString());
        if (source == null) {
            assertFalse(change.has("source"), change.toString());
        } else {
            assertEquals(source, change.get("source").getAsString(), change.toString());
        }
    }

    @Test
    void lightningBoltToTheFaceIsDamageFromTheBolt() {
        LifeChanges life = new LifeChanges();
        // Forge: the hit (GameEventPlayerDamaged), then processDamage's life change.
        life.damaged(2, "card:41", 3, false, false);
        life.lives(2, 20, 17, null, "card:41", false);
        JsonArray out = changes(life);
        assertEquals(1, out.size());
        is(out.get(0).getAsJsonObject(), 2, "damage", 3, "card:41");
        assertFalse(out.get(0).getAsJsonObject().has("combat"));
    }

    @Test
    void signInBloodIsALossFromTheSpell() {
        LifeChanges life = new LifeChanges();
        life.lives(1, 20, 18, null, "card:12", false);
        is(changes(life).get(0).getAsJsonObject(), 1, "loss", 2, "card:12");
    }

    @Test
    void threeSoulWardenTriggersAreThreeGainsInOrder() {
        LifeChanges life = new LifeChanges();
        life.lives(1, 20, 21, null, "card:5", false);
        life.lives(1, 21, 22, null, "card:5", false);
        life.lives(1, 22, 23, null, "card:5", false);
        JsonArray out = changes(life);
        assertEquals(3, out.size());
        for (int i = 0; i < 3; i++) {
            is(out.get(i).getAsJsonObject(), 1, "gain", 1, "card:5");
        }
    }

    @Test
    void grayMerchantDrainsALossAndAGain() {
        LifeChanges life = new LifeChanges();
        life.lives(2, 20, 15, null, "card:9", false);
        life.lives(1, 20, 25, null, "card:9", false);
        JsonArray out = changes(life);
        is(out.get(0).getAsJsonObject(), 2, "loss", 5, "card:9");
        is(out.get(1).getAsJsonObject(), 1, "gain", 5, "card:9");
    }

    @Test
    void anInfectHitIsPoisonNamedByItsSourceAndNeverLife() {
        LifeChanges life = new LifeChanges();
        // Forge: the hit (GameEventPlayerDamaged, infect), then the counter
        // table's poison (GameEventPlayerPoisoned) -- and no life change.
        life.damaged(2, "card:30", 3, true, true);
        life.poisoned(2, 3, true);
        JsonArray out = changes(life);
        assertEquals(1, out.size(), "no damage or loss for an infect hit: " + out);
        is(out.get(0).getAsJsonObject(), 2, "poison", 3, "card:30");
        assertTrue(out.get(0).getAsJsonObject().get("combat").getAsBoolean());
        // A later loss of life is not taken for that hit's damage.
        life.lives(2, 20, 18, null, "card:12", false);
        is(changes(life).get(0).getAsJsonObject(), 2, "loss", 2, "card:12");
    }

    @Test
    void severalInfectAttackersGivePoisonInOneGoNamedByNone() {
        LifeChanges life = new LifeChanges();
        life.damaged(2, "card:30", 1, true, true);
        life.damaged(2, "card:31", 1, true, true);
        life.damaged(2, "card:32", 1, true, true);
        life.poisoned(2, 3, true);
        JsonArray out = changes(life);
        assertEquals(1, out.size());
        is(out.get(0).getAsJsonObject(), 2, "poison", 3, null);
    }

    @Test
    void toxicIsDamageAndPoisonFromTheSameAttacker() {
        LifeChanges life = new LifeChanges();
        life.damaged(2, "card:33", 2, false, true);
        life.lives(2, 20, 18, null, null, true);
        life.poisoned(2, 1, true);
        JsonArray out = changes(life);
        is(out.get(0).getAsJsonObject(), 2, "damage", 2, "card:33");
        is(out.get(1).getAsJsonObject(), 2, "poison", 1, "card:33");
    }

    @Test
    void aRoundsHitsNeverNameALaterRoundsPoison() {
        LifeChanges life = new LifeChanges();
        life.damaged(2, "card:33", 2, false, false);
        life.lives(2, 20, 18, null, null, false);
        changes(life);
        life.poisoned(2, 1, false);
        is(changes(life).get(0).getAsJsonObject(), 2, "poison", 1, null);
    }

    @Test
    void lifelinkNamesItsSourceAndSeveralSourcesNameNone() {
        LifeChanges life = new LifeChanges();
        life.damaged(2, "card:1", 2, false, true);
        life.damaged(2, "card:2", 3, false, true);
        life.lives(1, 20, 23, "card:2", null, true);
        life.lives(2, 20, 15, null, null, true);
        JsonArray out = changes(life);
        is(out.get(0).getAsJsonObject(), 1, "gain", 3, "card:2");
        is(out.get(1).getAsJsonObject(), 2, "damage", 5, null);
    }

    @Test
    void nothingChangedSendsNothingAndARestartForgetsAll() {
        LifeChanges life = new LifeChanges();
        assertNull(life.flush("life:1"));
        life.poisoned(1, -2, false);
        assertTrue(life.isEmpty(), "poison removed is not told");
        life.damaged(1, "card:4", 2, false, false);
        life.clear();
        life.lives(1, 20, 18, null, null, false);
        is(changes(life).get(0).getAsJsonObject(), 1, "loss", 2, null);
    }
}
