package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Phase 10 A-13: a combat damage step's wave says which step, who fought whom, and the life gained. */
class CombatDamageTest {

    private static JsonObject hit(String source, String target, int amount) {
        JsonObject to = new JsonObject();
        to.addProperty("object", target);
        JsonObject hit = new JsonObject();
        hit.addProperty("source", source);
        hit.add("target", to);
        hit.addProperty("amount", amount);
        return hit;
    }

    private static JsonObject player(int seat) {
        JsonObject to = new JsonObject();
        to.addProperty("player", seat);
        return to;
    }

    @Test
    void onlyTheTwoDamageStepsDealCombatDamage() {
        assertEquals("first-strike", CombatDamage.stepOf(forge.game.phase.PhaseType.COMBAT_FIRST_STRIKE_DAMAGE));
        assertEquals("regular", CombatDamage.stepOf(forge.game.phase.PhaseType.COMBAT_DAMAGE));
        assertEquals(null, CombatDamage.stepOf(forge.game.phase.PhaseType.COMBAT_END));
        assertEquals(null, CombatDamage.stepOf(forge.game.phase.PhaseType.MAIN2));
    }

    @Test
    void aCombatWaveCarriesItsStepFightsAndGains() {
        JsonArray fights = new JsonArray();
        fights.add(CombatDamage.fight("card:1", player(2), List.of("card:7", "card:8")));
        JsonObject wave = CombatDamage.wave("damage:9", List.of(hit("card:1", "card:7", 3)), "regular", fights,
                List.of(CombatDamage.gain(1, 3, "card:1")));
        assertEquals("damage:9", wave.get("key").getAsString());
        assertEquals("regular", wave.get("combat").getAsString());
        JsonObject fight = wave.getAsJsonArray("fights").get(0).getAsJsonObject();
        assertEquals("card:1", fight.get("attacker").getAsString());
        assertEquals(2, fight.getAsJsonObject("defender").get("player").getAsInt());
        assertEquals(2, fight.getAsJsonArray("blockers").size());
        assertEquals("card:7", fight.getAsJsonArray("blockers").get(0).getAsString());
        JsonObject gain = wave.getAsJsonArray("gains").get(0).getAsJsonObject();
        assertEquals(1, gain.get("player").getAsInt());
        assertEquals(3, gain.get("amount").getAsInt());
        assertEquals("card:1", gain.get("source").getAsString());
    }

    @Test
    void aSpellsWaveIsJustItsHits() {
        JsonObject wave = CombatDamage.wave("damage:3", List.of(hit("card:4", "card:5", 3)), null, null, List.of());
        assertEquals(1, wave.getAsJsonArray("hits").size());
        assertFalse(wave.has("combat"));
        assertFalse(wave.has("fights"));
        assertFalse(wave.has("gains"));
    }

    @Test
    void aGainIsNamedOnlyWhenItIsExactlyWhatItsSourceDealt() {
        List<JsonObject> hits = List.of(hit("card:1", "card:7", 2), hit("card:1", "card:8", 1), hit("card:2", "card:9", 4));
        assertTrue(CombatDamage.gainedFrom(hits, "card:1", 3), "lifelink: 2 + 1 dealt, 3 gained");
        assertFalse(CombatDamage.gainedFrom(hits, "card:1", 6), "a doubled gain is not named");
        assertFalse(CombatDamage.gainedFrom(hits, "card:3", 3), "a source that dealt nothing");
        assertFalse(CombatDamage.gainedFrom(hits, null, 3));
        assertFalse(CombatDamage.gain(2, 4, null).has("source"));
    }
}
