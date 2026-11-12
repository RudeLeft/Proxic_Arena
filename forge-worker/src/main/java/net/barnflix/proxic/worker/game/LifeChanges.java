package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Spec 0077 (owner 2026-11-12, canvas life-1112) -- every change to a
 * player's life or poison since the last snapshot round, in the order Forge
 * made them, each with its kind, amount and source:
 *
 *   {player, kind, amount, source?, combat?}
 *
 *   kind     "damage"  life lost to damage (CR 120.3a): Forge reported the
 *                      hit (GameEventPlayerDamaged) before the life it took
 *                      (Player.processDamage -> GameEventPlayerLivesChanged)
 *            "loss"    life lost that was not damage (Sign in Blood, Gray
 *                      Merchant, paying life)
 *            "gain"    life gained (Soul Warden, lifelink, Gray Merchant)
 *            "poison"  poison counters given (infect, toxic); never life
 *   amount   always above 0
 *   source   "card:N": the damage's source; for a gain, a lifelinker's own
 *            hits (as CombatDamage.gainedFrom); otherwise the card whose
 *            spell or ability was resolving. Absent when Forge does not say.
 *   combat   true when it happened in a combat damage step's damage (the
 *            page plays those with the fights, spec 0067)
 *
 * The bug this fixes: Forge sends an infect hit as GameEventPlayerDamaged
 * with infect=true and gives poison, not life (Player.addDamageAfterPrevention);
 * the worker dropped the flag, so the page took it for life damage. A hit
 * with infect is never counted as damage here, and the poison it gives
 * names it as its source (Forge gives the poison after the hits, in one go:
 * named when one card gave it all).
 *
 * All public: life and poison are both players' to see (CR 119, 122), and a
 * source is an id only -- HiddenIds.strip removes it, per seat, when the card
 * is by then in a zone that seat cannot see (HID-001, HID-005).
 */
final class LifeChanges {

    /** Non-infect damage dealt to each seat that Forge has not yet taken from its life. */
    private final Map<Integer, Integer> pendingDamage = new HashMap<>();
    /** ...and the sources it came from, in order. */
    private final Map<Integer, Set<String>> pendingSources = new HashMap<>();
    /**
     * The sources of each seat's hits since its poison was last given:
     * Forge gives a damage event's poison (infect, toxic) in one go AFTER its
     * hits (the GameEntityCounterTable is applied at the end of
     * GameAction.dealDamage), so the poison is named by these when one
     * creature or spell gave it all.
     */
    private final Map<Integer, Set<String>> hitBy = new HashMap<>();
    /** ...and whether any of them was infect (then only infect hits name it). */
    private final Map<Integer, Set<String>> infectBy = new HashMap<>();
    private final List<JsonObject> changes = new ArrayList<>();

    /** A hit on [seat] (GameEventPlayerDamaged). */
    synchronized void damaged(int seat, String source, int amount, boolean infect, boolean combat) {
        if (amount <= 0) {
            return;
        }
        if (source != null) {
            hitBy.computeIfAbsent(seat, s -> new LinkedHashSet<>()).add(source);
        }
        if (infect) {
            // CR 120.3b: infect damage to a player is poison counters, not life.
            Set<String> by = infectBy.computeIfAbsent(seat, s -> new LinkedHashSet<>());
            if (source != null) {
                by.add(source);
            }
            return;
        }
        pendingDamage.merge(seat, amount, Integer::sum);
        if (source != null) {
            pendingSources.computeIfAbsent(seat, s -> new LinkedHashSet<>()).add(source);
        }
    }

    /**
     * [seat]'s life went from [oldLife] to [newLife] (GameEventPlayerLivesChanged).
     * [gainSource] names a lifelink gain's source; [resolving] is the card
     * whose spell or ability is resolving, or null.
     */
    synchronized void lives(int seat, int oldLife, int newLife, String gainSource, String resolving, boolean combat) {
        int change = newLife - oldLife;
        if (change == 0) {
            return;
        }
        if (change > 0) {
            changes.add(change(seat, "gain", change, gainSource != null ? gainSource : resolving, combat));
            return;
        }
        int lost = -change;
        Integer pending = pendingDamage.remove(seat);
        Set<String> sources = pendingSources.remove(seat);
        if (pending != null && pending > 0) {
            // Player.processDamage: all the damage dealt at once, taken as one loss.
            changes.add(change(seat, "damage", lost, only(sources), combat));
            return;
        }
        changes.add(change(seat, "loss", lost, resolving, combat));
    }

    /** [seat] was given [amount] poison counters (GameEventPlayerPoisoned); a removal is not told. */
    synchronized void poisoned(int seat, int amount, boolean combat) {
        Set<String> infecting = infectBy.remove(seat);
        Set<String> hits = hitBy.remove(seat);
        if (amount <= 0) {
            return;
        }
        String source = infecting != null ? only(infecting) : only(hits);
        changes.add(change(seat, "poison", amount, source, combat));
    }

    private static String only(Set<String> sources) {
        return sources != null && sources.size() == 1 ? sources.iterator().next() : null;
    }

    /** The round's changes as sent, {key, changes}, or null when there were none; then empty. */
    synchronized JsonObject flush(String key) {
        // A round's hits never name a later round's poison.
        hitBy.clear();
        infectBy.clear();
        if (changes.isEmpty()) {
            return null;
        }
        JsonObject out = new JsonObject();
        out.addProperty("key", key);
        JsonArray list = new JsonArray();
        changes.forEach(list::add);
        out.add("changes", list);
        changes.clear();
        return out;
    }

    synchronized boolean isEmpty() {
        return changes.isEmpty();
    }

    /** A new game (a restart): nothing from the old one carries over. */
    synchronized void clear() {
        changes.clear();
        pendingDamage.clear();
        pendingSources.clear();
        hitBy.clear();
        infectBy.clear();
    }

    private static JsonObject change(int seat, String kind, int amount, String source, boolean combat) {
        JsonObject change = new JsonObject();
        change.addProperty("player", seat);
        change.addProperty("kind", kind);
        change.addProperty("amount", amount);
        if (source != null) {
            change.addProperty("source", source);
        }
        if (combat) {
            change.addProperty("combat", true);
        }
        return change;
    }
}
