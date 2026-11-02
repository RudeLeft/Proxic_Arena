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
    decks: Map<Int, Map<String, String>>,
) {
    /**
     * The same, findable by the name FORGE uses.
     *
     * A double-faced card is stored as written, "A // B", and Forge
     * names only the face that is up (§2.42). So each "A // B" is
     * also filed under "A". Not under "B": the stored image is the
     * front, and a transformed card wearing it would be showing the
     * wrong card.
     */
    private val bySeat: Map<Int, Map<String, String>> =
        decks.mapValues { (_, entries) ->
            val names = entries.filterKeys { !it.startsWith(PRINTING) }
            // P6-BD, owner decision 2026-10-20 -- each PRINTING its own
            // picture. Filed as "printing:SET/NUM|front name", so a
            // printing only matches while its FRONT face is up: a
            // two-faced card has one printing for both faces, and a
            // transformed one must not wear its front's picture.
            val printings =
                entries.filterKeys { it.startsWith(PRINTING) }.mapKeys { (key, _) ->
                    key.substringBefore("|") + "|" + frontFaceOf(key.substringAfter("|"))
                }
            names + names.mapKeys { (name, _) -> frontFaceOf(name) }.filterKeys { it !in names } + printings
        }

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
     * A token wears a token picture a deck in this match brought (spec
     * 0022, amending §6.128); none otherwise. Still no lookup outside the
     * match: that is the dependency §6.128 exists to forbid.
     */
    fun annotate(
        state: JsonObject,
        viewerSeat: Int,
    ): JsonObject {
        val allowed = shown.computeIfAbsent(viewerSeat) { ConcurrentHashMap.newKeySet() }

        fun cards(value: kotlinx.serialization.json.JsonElement?): JsonArray? =
            (value as? JsonArray)?.let { cards ->
                JsonArray(cards.map { card(it.jsonObject, allowed) })
            }

        fun zone(key: String): JsonArray? = cards(state[key])

        return buildJsonObject {
            state.forEach { (key, value) ->
                val rewritten =
                    when (key) {
                        // Spec 0042 / 0045 -- the card being cast wears its
                        // picture too; it had none (missed in 0042).
                        // Spec 0049 -- and every other place a card is
                        // named to this viewer: an opponent's hand Forge
                        // lets them see, the graveyards, exile. They had
                        // no pictures, so a revealed hand, a graveyard
                        // card looked at, a Reanimate target were bare.
                        "battlefield", "hand", "casting", "otherHands", "graveyard", "exile" -> zone(key)
                        "stack" -> (value as? JsonArray)?.map { stackArt(it.jsonObject, allowed) }?.let(::JsonArray)
                        // Spec 0045 -- the cards Forge showed this seat.
                        "reveal" ->
                            (value as? JsonObject)?.let { reveal ->
                                buildJsonObject {
                                    reveal.forEach { (k, v) -> put(k, if (k == "cards") cards(v) ?: v else v) }
                                }
                            }
                        else -> null
                    }
                put(key, rewritten ?: value)
            }
        }
    }

    /**
     * Spec 0001 D3 — the same, for the cards a question shows the asked
     * player (a scry's, a surveil's top cards): sending them is what lets
     * that seat fetch their pictures, as for anything else it is shown.
     */
    fun annotateCards(
        cards: List<JsonObject>,
        viewerSeat: Int,
    ): List<JsonObject> {
        val allowed = shown.computeIfAbsent(viewerSeat) { ConcurrentHashMap.newKeySet() }
        return cards.map { card(it, allowed) }
    }

    private fun card(
        entry: JsonObject,
        allowed: MutableSet<String>,
    ): JsonObject {
        // §6.124 — a card the viewer may not identify carries no
        // reference. `known` is the worker's own answer to "may
        // this viewer see what this is".
        if (entry["known"]?.jsonPrimitive?.booleanOrNull != true) {
            return entry
        }
        val name = entry["name"]?.jsonPrimitive?.content ?: return entry
        // Spec 0022, amending §6.128 -- a token wears only a TOKEN picture,
        // never a card's or a face's of the same name (§7.59).
        if (entry["token"]?.jsonPrimitive?.booleanOrNull == true) return tokenArt(entry, name, allowed)
        // The art belongs to the deck of whoever OWNS the card,
        // not the viewer: that is the whole reason §6.122 exists
        // as a match-scoped route rather than a Deck Depot one.
        // Spec 0049 -- the owner, not `seat`: `seat` is the CONTROLLER,
        // and a creature taken with Control Magic was looked for in the
        // thief's deck. `seat` only for a snapshot from before `owner`.
        val owner = seatOf(entry, "owner") ?: seatOf(entry, "seat") ?: return entry
        // The exact printing first, when the deck carried art for
        // it; the name otherwise, as before.
        val printing = entry["printing"]?.jsonPrimitive?.content
        // §7.59 — a face that is not a front (a card turned over) has its
        // own picture when the deck carried one, by that face's name;
        // otherwise none -- never the front's.
        val art = bySeat[owner] ?: return entry
        val asset =
            printing?.let { art["$PRINTING$it|$name"] } ?: art[name] ?: art[FACE + name.lowercase()] ?: return entry
        return wearing(entry, asset, cropIn(art, name), allowed)
    }

    /**
     * Spec 0051 -- the art crop filed under [name] (the face that is up, so
     * a card turned over never borrows its front's), or its front face's.
     */
    private fun cropIn(
        art: Map<String, String>,
        name: String,
    ): String? = art[CROP + name.lowercase()] ?: art[CROP + frontFaceOf(name).lowercase()]

    /**
     * [entry] with its picture and, when its deck brought one, its art crop
     * (spec 0051): both authorised, because both are now in front of the
     * viewer. A crop goes only where its picture goes.
     */
    private fun wearing(
        entry: JsonObject,
        asset: String,
        crop: String?,
        allowed: MutableSet<String>,
    ): JsonObject {
        allowed.add(asset)
        crop?.let(allowed::add)
        return buildJsonObject {
            entry.forEach { (key, value) -> put(key, value) }
            put("art", JsonPrimitive(asset))
            crop?.let { put("crop", JsonPrimitive(it)) }
        }
    }

    /**
     * Spec 0022 (owner S4) — a token's picture, by name only: from the deck
     * of the seat that controls it, then from the other seats', so Sam's
     * Ape from Pat's Pongify wears the Ape picture Pat brought.
     *
     * Forge names most tokens "Ape Token" and some by their own name
     * ("Avacyn"); a deck lists them as cards are printed, "Ape". So the name
     * matches as it is or without " Token". A token is on the table for
     * everyone, so its picture reveals nothing that is hidden.
     */
    private fun tokenArt(
        entry: JsonObject,
        name: String,
        allowed: MutableSet<String>,
    ): JsonObject {
        val controller = entry["seat"]?.jsonPrimitive?.content?.toIntOrNull() ?: return entry
        val keys =
            listOf(name, name.removeSuffix(TOKEN_SUFFIX))
                .map { TOKEN + it.substringBefore(" // ").trim().lowercase() }
                .distinct()
        val seats = listOf(controller) + bySeat.keys.filter { it != controller }.sorted()
        val (art, key) =
            seats.firstNotNullOfOrNull { seat ->
                bySeat[seat]?.let { art -> keys.firstOrNull { it in art }?.let { art to it } }
            } ?: return entry
        // Spec 0051 -- the crop the same deck brought for that token picture.
        return wearing(entry, art.getValue(key), art[CROP + key.removePrefix(TOKEN)], allowed)
    }

    /**
     * PHASE_07 (owner 2026-10-21) — a spell on the stack is drawn as its
     * card, so it wears its picture: from the deck of whoever owns the
     * card (spec 0049; it was the controller, and a spell cast from an
     * opponent's library is the caster's spell but the opponent's card).
     * The stack names an object only as this viewer may know it (a
     * face-down spell is "Face-down" to the opponent), so what is not
     * theirs to know matches nothing here.
     */
    private fun stackArt(
        entry: JsonObject,
        allowed: MutableSet<String>,
    ): JsonObject {
        val name = entry["name"]?.jsonPrimitive?.content ?: return entry
        val owner = seatOf(entry, "owner") ?: seatOf(entry, "controller") ?: return entry
        val art = bySeat[owner] ?: return entry
        val asset = art[name] ?: art[FACE + name.lowercase()] ?: return entry
        return wearing(entry, asset, cropIn(art, name), allowed)
    }

    /**
     * Spec 0052 — every picture this match's decks brought (cards, faces,
     * tokens, art crops), so the weekly clean-up never deletes one a game
     * in progress may still show.
     */
    fun pictures(): Set<String> = bySeat.values.flatMapTo(mutableSetOf()) { it.values }

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

    companion object {
        /** The key prefix [MatchRecords] files a printing's art under. */
        const val PRINTING = "printing:"

        /** A face's own picture (a back face), by its lowercase name (§7.59). */
        const val FACE = "face:"

        /** A token picture, by the token's lowercase name (spec 0022). */
        const val TOKEN = "token:"

        /** A picture's art crop, by the picture's lowercase name (spec 0051). */
        const val CROP = "crop:"

        /** How Forge ends most token names: "Ape Token". */
        private const val TOKEN_SUFFIX = " Token"

        private fun frontFaceOf(name: String): String = name.substringBefore(" // ").trim()

        /** A seat number the worker put on [entry] under [key]; 0 (nobody's) counts as none. */
        private fun seatOf(
            entry: JsonObject,
            key: String,
        ): Int? = entry[key]?.jsonPrimitive?.content?.toIntOrNull()?.takeIf { it > 0 }
    }
}
