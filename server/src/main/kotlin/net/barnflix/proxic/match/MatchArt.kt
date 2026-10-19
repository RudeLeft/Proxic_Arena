package net.barnflix.proxic.match

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.ConcurrentHashMap

/**
 * Which artwork a viewer may see, and may fetch — PHASE_06
 * §6.121–§6.131.
 *
 * The boundary Phase 6 owns is five steps:
 *
 *     game object → visible identity → asset identity
 *                 → viewer authorization → secure retrieval
 *
 * The first step is already done and is not repeated here. A
 * viewer's snapshot names a card ONLY when Forge says that viewer
 * may identify it (§6.42, §6.44), so this class never decides what
 * is visible — it decides what the already-visible thing looks
 * like. That is why §6.124 and §6.125 need no code of their own: a
 * hidden card arrives with `known: false` and no name, so there is
 * nothing to look up and no reference to send. An opponent cannot
 * ask for the front of a face-down card because they were never
 * told which card it is.
 *
 * THE AUTHORIZATION IS THE SNAPSHOT. A viewer may fetch exactly the
 * assets that have been put in front of them, because the set is
 * built BY sending them. §6.129 is the point: seeing one card of an
 * opponent's deck must not let you walk the rest of it, and a
 * viewer who has been shown four cards can fetch four assets.
 *
 * §6.130 falls out of the lifetime: this object lives with the
 * live match and dies with it, so the access does too. Nothing here
 * touches Deck Depot sharing.
 */
class MatchArt(
    /** Seat → (card name → content hash), from each seat's own deck. */
    private val bySeat: Map<Int, Map<String, String>>,
) {
    /**
     * Seat → the assets that seat has actually been shown.
     *
     * Accumulated rather than replaced per snapshot. A card that
     * has left the battlefield may still be on screen for a moment,
     * and a browser is allowed to re-fetch something it was shown
     * legitimately a turn ago. What it may never do is ask for
     * something it was never shown.
     */
    private val shown = ConcurrentHashMap<Int, MutableSet<String>>()

    /**
     * Put an asset reference on every card this viewer may identify.
     *
     * Returns the state unchanged when nothing matched, which is
     * the ordinary case for a deck imported without artwork — the
     * exporter omits art it could not fetch and the import succeeds
     * anyway (§2.x), so a missing reference is not an error and the
     * page falls back to its own presentation.
     *
     * Tokens get nothing, deliberately: a gameplay-created token is
     * not in anybody's deck package (§6.128), and inventing an
     * Internet lookup for one is the dependency that section exists
     * to forbid.
     */
    fun annotate(
        state: JsonObject,
        viewerSeat: Int,
    ): JsonObject {
        val allowed = shown.computeIfAbsent(viewerSeat) { ConcurrentHashMap.newKeySet() }

        fun card(entry: JsonObject): JsonObject {
            // §6.124 — a card the viewer may not identify carries no
            // reference. `known` is the worker's own answer to "may
            // this viewer see what this is".
            if (entry["known"]?.jsonPrimitive?.booleanOrNull != true) {
                return entry
            }
            val name = entry["name"]?.jsonPrimitive?.content ?: return entry
            // The art belongs to the deck of whoever OWNS the card,
            // not the viewer: that is the whole reason §6.122 exists
            // as a match-scoped route rather than a Deck Depot one.
            val owner = entry["seat"]?.jsonPrimitive?.content?.toIntOrNull() ?: return entry
            val asset = bySeat[owner]?.let { it[name] ?: it[frontFaceOf(name)] } ?: return entry

            allowed.add(asset)
            return buildJsonObject {
                entry.forEach { (key, value) -> put(key, value) }
                put("art", JsonPrimitive(asset))
            }
        }

        fun zone(key: String): JsonArray? =
            (state[key] as? JsonArray)?.let { cards ->
                JsonArray(cards.map { card(it.jsonObject) })
            }

        return buildJsonObject {
            state.forEach { (key, value) ->
                val rewritten = if (key == "battlefield" || key == "hand") zone(key) else null
                put(key, rewritten ?: value)
            }
        }
    }

    /**
     * §6.122, §6.129 — may this seat fetch this asset?
     *
     * Only what they have been shown. Not "is it in a deck in this
     * match", which would hand an opponent's whole package to
     * anybody who could guess a hash, and not "is it in MY deck",
     * which would refuse the opponent's creature sitting on the
     * battlefield in front of them.
     */
    fun mayFetch(
        viewerSeat: Int,
        assetId: String,
    ): Boolean = shown[viewerSeat]?.contains(assetId) == true

    private companion object {
        /**
         * A double-faced card is stored as written, "A // B", and
         * Forge names only the front (§2.42). Matching the whole
         * string first means a single-faced card never pays for
         * this.
         */
        fun frontFaceOf(name: String): String = name.substringBefore(" // ").trim()
    }
}
