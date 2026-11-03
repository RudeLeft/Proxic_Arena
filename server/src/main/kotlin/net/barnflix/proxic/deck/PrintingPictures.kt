package net.barnflix.proxic.deck

import java.util.Locale

// Spec 0053 -- each printing of a card keeps its own picture. A package may
// bring, beside a card's picture (`real_cards/<Name> [SET].jpg`, the name's),
// a picture of one printing (`real_cards/<Name> [SET-NUM].jpg`) and its art
// crop; a deck line wears its own printing's when there is one.

/**
 * Spec 0053 -- `real_cards/Mountain [DD1-59].jpg` -> `mountain [dd1-59]`: the
 * picture of one printing, by its set code and collector number (a set code
 * never holds a `-`, so the first one splits them). Null for a plain `[SET]`
 * picture, which is the name's.
 */
internal fun printingKeyOf(member: String): String? {
    val stem = member.substringAfterLast('/').replace(PICTURE_EXTENSION, "").trim()
    if (!stem.endsWith("]")) return null
    val printing = stem.substringAfterLast(" [", "").removeSuffix("]")
    if (!printing.contains('-')) return null
    return printingKey(frontNameOf(member), printing.substringBefore('-'), printing.substringAfter('-'))
}

/** Spec 0053 -- the key a printing's own picture and art crop are filed under. */
internal fun printingKey(
    front: String,
    set: String,
    number: String,
): String = "${front.trim()} [$set-$number]".lowercase(Locale.ROOT)

/** Spec 0053 -- whether a picture key is a printing's rather than a name's. */
internal fun isPrintingKey(key: String): Boolean = key.endsWith("]") && key.contains(" [")

/** A package member's key: its printing's (spec 0053), or its name's. */
internal fun pictureKeyOf(member: String): String = printingKeyOf(member) ?: frontNameOf(member)

/**
 * The picture a deck line wears: its own printing's when the package brought
 * one (spec 0053), so four Mountain printings look like four Mountains;
 * otherwise the name's, as before.
 */
internal fun pictureFor(
    art: Map<String, StoredArt>,
    entry: DeckEntry,
): StoredArt? {
    val set = entry.setCode
    val number = entry.collectorNumber
    val own = if (set != null && number != null) art[printingKey(entry.frontFaceName, set, number)] else null
    return own ?: art[entry.frontFaceName.lowercase()]
}
