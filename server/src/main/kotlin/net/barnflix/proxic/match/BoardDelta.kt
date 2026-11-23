package net.barnflix.proxic.match

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// P11-D4 (spec 0117, 2026-11-23) -- each page is sent only what changed.
//
// A delta says how one whole board becomes the next, as JSON and nothing
// else (ARCH-005: it knows keys, lists and ids, never cards or rules):
//
//   set    {key: value}  top-level keys whose value changed (or appeared), whole
//   unset  [key]         top-level keys the new board no longer has
//   lists  {key: {put, drop, order?}}  a top-level list patched by item, when
//          every entry of the old list and the new one is an object with a
//          unique `id` (the zones, the stack), or, with no `id`, a unique
//          `seat` (players). `put`: each item new or changed, whole, in the
//          new list's order. `drop`: the keys of items gone, in the old
//          order. `order`: every key in the new order, only when it is not
//          the default (the kept items in their old order, then the new ones
//          in `put`'s order).
//
// Nothing finer than one item: a changed card goes whole (STUB-005). The
// history lists (payments, rolls, notices) are never in a delta's set,
// unset or lists: they keep P11-D3's `kept` rule, and their fields ride
// beside it (BoardHistory). Two values are equal when their JSON is equal,
// ignoring key order (JsonObject equality is map equality).
//
// Hidden information (P11-R4): [diff] reads only its two boards, both a
// board the connection was or would be sent whole. Every id a delta names
// is in `put` (so in the new board), in `drop` (so in the base) or in
// `order` (so in the new board). Kept in step with the page
// (frontend/src/delta.ts) and the Lab gate (scripts/check-deltas.py) by the
// shared fixtures in protocol/fixtures/delta/.

object BoardDelta {
    const val SET = "set"
    const val UNSET = "unset"
    const val LISTS = "lists"
    const val PUT = "put"
    const val DROP = "drop"
    const val ORDER = "order"

    /** Keys a delta never patches: the history lists (P11-D3) and their `kept`. */
    private val NOT_PATCHED: Set<String> = HISTORY_KEYS.toSet() + KEPT_KEY

    /** How [base] becomes [board], for every key but the history lists: {set?, unset?, lists?}. */
    fun diff(
        base: JsonObject,
        board: JsonObject,
    ): JsonObject {
        val set = linkedMapOf<String, JsonElement>()
        val lists = linkedMapOf<String, JsonElement>()
        for ((key, value) in board) {
            if (key in NOT_PATCHED) continue
            val old = base[key]
            if (old == value) continue
            val by = if (old is JsonArray && value is JsonArray) keyedBy(old, value) else null
            if (old == null || by == null) {
                set[key] = value
            } else {
                lists[key] = patch(old as JsonArray, value as JsonArray, by)
            }
        }
        val unset = base.keys.filter { it !in NOT_PATCHED && it !in board }
        return buildJsonObject {
            if (set.isNotEmpty()) put(SET, JsonObject(set))
            if (unset.isNotEmpty()) put(UNSET, JsonArray(unset.map { kotlinx.serialization.json.JsonPrimitive(it) }))
            if (lists.isNotEmpty()) put(LISTS, JsonObject(lists))
        }
    }

    /**
     * [base] with [delta] applied, for every key but the history lists; those
     * (and `kept`) are taken from the delta as sent, for [BoardHistory.rebuild]
     * to finish. Throws [IllegalArgumentException] on a delta that does not
     * fit its base (a key to patch the base lacks, an order naming a key that
     * is not there).
     */
    fun apply(
        base: JsonObject,
        delta: JsonObject,
    ): JsonObject {
        val out = linkedMapOf<String, JsonElement>()
        for ((key, value) in base) if (key !in NOT_PATCHED) out[key] = value
        (delta[UNSET] as? JsonArray)?.forEach { out.remove(text(it)) }
        (delta[SET] as? JsonObject)?.forEach { (key, value) -> out[key] = value }
        (delta[LISTS] as? JsonObject)?.forEach { (key, value) ->
            val old = base[key] as? JsonArray ?: throw IllegalArgumentException("no list $key to patch")
            out[key] = applyList(old, value as? JsonObject ?: throw IllegalArgumentException("patch $key"))
        }
        for (key in NOT_PATCHED) delta[key]?.let { out[key] = it }
        return JsonObject(out)
    }

    /** "id" or "seat" when both lists are keyed by it (every entry an object, each key unique), else null. */
    fun keyedBy(
        old: JsonArray,
        now: JsonArray,
    ): String? {
        val all = old + now
        if (all.any { it !is JsonObject }) return null
        val objects = all.map { it as JsonObject }
        val by =
            when {
                objects.all { "id" in it } -> "id"
                objects.none { "id" in it } && objects.all { "seat" in it } -> "seat"
                else -> return null
            }

        fun unique(list: JsonArray) = list.map { (it as JsonObject)[by] }.toSet().size == list.size
        return by.takeIf { unique(old) && unique(now) }
    }

    private fun patch(
        old: JsonArray,
        now: JsonArray,
        by: String,
    ): JsonObject {
        val had = old.associateBy { (it as JsonObject)[by]!! }
        val nowKeys = now.map { (it as JsonObject)[by]!! }
        val nowSet = nowKeys.toSet()
        val put = now.filter { item -> had[(item as JsonObject)[by]!!] != item }
        val drop = old.map { (it as JsonObject)[by]!! }.filter { it !in nowSet }
        val kept = old.map { (it as JsonObject)[by]!! }.filter { it in nowSet }
        val added = nowKeys.filter { it !in had }
        return buildJsonObject {
            if (put.isNotEmpty()) put(PUT, JsonArray(put))
            if (drop.isNotEmpty()) put(DROP, JsonArray(drop))
            if (kept + added != nowKeys) put(ORDER, JsonArray(nowKeys))
        }
    }

    private fun applyList(
        old: JsonArray,
        patch: JsonObject,
    ): JsonArray {
        val put = (patch[PUT] as? JsonArray).orEmpty()
        val by = keyedBy(old, JsonArray(put)) ?: throw IllegalArgumentException("a list that is not keyed")

        fun keyOf(item: JsonElement) = (item as JsonObject)[by]!!
        val drop = (patch[DROP] as? JsonArray).orEmpty().toSet()
        val putBy = put.associateBy(::keyOf)
        val oldKeys = old.map(::keyOf).toSet()
        val kept = old.filter { keyOf(it) !in drop }.map { putBy[keyOf(it)] ?: it }
        val items = kept + put.filter { keyOf(it) !in oldKeys }
        val order = patch[ORDER] as? JsonArray ?: return JsonArray(items)
        val byKey = items.associateBy(::keyOf)
        require(order.size == items.size && order.all { it in byKey }) { "an order that does not fit" }
        return JsonArray(order.map { byKey.getValue(it) })
    }

    private fun text(element: JsonElement): String = (element as kotlinx.serialization.json.JsonPrimitive).content
}
