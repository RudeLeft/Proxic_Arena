package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.List;

/**
 * Phase 10 A-13 (Amendment 15) -- a combat damage step's damage, told
 * plainly, so the page can play one fight at a time without guessing.
 *
 * The round's damage wave (PHASE_07 §7.61 B13: {key, hits}) gains, when it is
 * the damage a combat damage step dealt:
 *
 *   combat   "first-strike" or "regular" -- which step dealt it
 *   fights   Forge's combat as it stood when the step began, before anyone
 *            died: [{attacker, defender: {player} | {object}, blockers: [...]}],
 *            the blockers in Forge's damage-assignment order. The board
 *            snapshot that carries the wave has already lost the dead (Forge
 *            takes a creature out of combat as it leaves the battlefield), so
 *            this is the only place that still says who fought whom.
 *   gains    life gained while that damage was dealt (lifelink, CR 702.15):
 *            [{player, amount, source?}] -- the source named only when the
 *            gain followed that source's own hits and equals their total.
 *
 * and a hit gains `deathtouch: true` when Forge marked the damage as
 * deathtouch damage (GameEventCardDamaged.DamageType.Deathtouch).
 *
 * Everything here is public: combat and damage are seen by both players
 * (§7.61 B4, B13), and an id is all a face-down creature is named by.
 */
final class CombatDamage {

    private CombatDamage() {
    }

    /** The step a TurnPhase begins, or null for one that deals no combat damage. */
    static String stepOf(forge.game.phase.PhaseType phase) {
        if (phase == forge.game.phase.PhaseType.COMBAT_FIRST_STRIKE_DAMAGE) {
            return "first-strike";
        }
        if (phase == forge.game.phase.PhaseType.COMBAT_DAMAGE) {
            return "regular";
        }
        return null;
    }

    /** One fight: an attacker, what it attacks, and its blockers. */
    static JsonObject fight(String attacker, JsonObject defender, List<String> blockers) {
        JsonObject fight = new JsonObject();
        fight.addProperty("attacker", attacker);
        fight.add("defender", defender);
        JsonArray list = new JsonArray();
        blockers.forEach(list::add);
        fight.add("blockers", list);
        return fight;
    }

    /**
     * Whether a life gain of [gained] is [source]'s lifelink: the total
     * damage [source] dealt in [hits] is exactly what was gained. Forge
     * gains a lifelinker's life right after that source's own damage
     * (GameAction.dealDamage), so the caller asks this of the source of the
     * last hit recorded; a replacement that changed the amount (a doubler)
     * leaves the gain unnamed rather than misnamed.
     */
    static boolean gainedFrom(List<JsonObject> hits, String source, int gained) {
        if (source == null || gained <= 0) {
            return false;
        }
        int dealt = 0;
        for (JsonObject hit : hits) {
            if (hit.has("source") && source.equals(hit.get("source").getAsString())) {
                dealt += hit.get("amount").getAsInt();
            }
        }
        return dealt == gained;
    }

    /** A life gained: by whom, how much, and from what when that is known. */
    static JsonObject gain(int seat, int amount, String source) {
        JsonObject gain = new JsonObject();
        gain.addProperty("player", seat);
        gain.addProperty("amount", amount);
        if (source != null) {
            gain.addProperty("source", source);
        }
        return gain;
    }

    /** The wave as sent: the hits, and for combat damage its step, fights and gains. */
    static JsonObject wave(String key, List<JsonObject> hits, String step, JsonArray fights, List<JsonObject> gains) {
        JsonObject damage = new JsonObject();
        damage.addProperty("key", key);
        JsonArray list = new JsonArray();
        hits.forEach(list::add);
        damage.add("hits", list);
        if (step != null) {
            damage.addProperty("combat", step);
            damage.add("fights", fights == null ? new JsonArray() : fights.deepCopy());
            if (!gains.isEmpty()) {
                JsonArray gained = new JsonArray();
                gains.forEach(gained::add);
                damage.add("gains", gained);
            }
        }
        return damage;
    }
}
