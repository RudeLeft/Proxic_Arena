package net.barnflix.proxic.deck

/**
 * Open Format legality — PHASE_02 §2.44, §2.45.
 *
 * The only play mode (owner decision 2026-10-15,
 * `docs/architecture/OPEN_FORMAT.md`):
 *
 * ```text
 * 60–65 cards
 * at most 4 copies of any one card
 * basic lands unlimited
 * no sideboard
 * 2 players
 * ```
 *
 * §2.45: legality is **Proxic's own determination**. Forge's
 * `DeckFormat` is not consulted, and the decklist's own header is
 * not trusted — a real export of a 65-card mono-red deck declared
 * itself "(commander)".
 *
 * Every violation is REPORTED. A deck is never silently trimmed to
 * fit: a player receiving a quietly-corrected deck is exactly the
 * divergence this project keeps finding (§2.94).
 */

data class DeckViolation(
    val code: String,
    val detail: String,
    /** 1-based line in the decklist, or 0 for a whole-deck rule. */
    val line: Int = 0,
)

object OpenFormat {
    const val MIN_CARDS = 60
    const val MAX_CARDS = 65
    const val MAX_COPIES = 4

    /**
     * The five basic land names.
     *
     * Deliberately a name list and not Forge's
     * `DeckFormat.canHaveAnyNumberOf()`. That helper also returns
     * true for cards reading "A deck can have any number of cards
     * named CARDNAME" — Relentless Rats, Shadowborn Apostle,
     * Persistent Petitioners, Dragon's Approach — and the owner
     * confirmed on 2026-10-15 that those are **not** exempt. Calling
     * it would silently permit a deck nobody chose.
     *
     * Snow-covered basics are basic lands and are included. Wastes
     * is a basic land type and is included.
     */
    private val BASIC_LAND_NAMES =
        setOf(
            "plains", "island", "swamp", "mountain", "forest", "wastes",
            "snow-covered plains", "snow-covered island", "snow-covered swamp",
            "snow-covered mountain", "snow-covered forest", "snow-covered wastes",
        )

    fun isBasicLand(name: String): Boolean = name.substringBefore(" // ").trim().lowercase() in BASIC_LAND_NAMES

    /**
     * Every violation, not just the first.
     *
     * A player fixing one problem at a time, with an upload between
     * each, is a worse experience than one list of everything wrong.
     */
    fun validate(deck: ParsedDeck): List<DeckViolation> {
        val violations = mutableListOf<DeckViolation>()

        val total = deck.totalCards
        if (total < MIN_CARDS) {
            violations +=
                DeckViolation(
                    "DECK_TOO_SMALL",
                    "Open Format requires at least $MIN_CARDS cards; this deck has $total.",
                )
        }
        if (total > MAX_CARDS) {
            violations +=
                DeckViolation(
                    "DECK_TOO_LARGE",
                    "Open Format allows at most $MAX_CARDS cards; this deck has $total.",
                )
        }

        // Copies are counted across LINES, not per line: the same card
        // can legitimately appear twice with different printings, and
        // three plus two is still five copies.
        deck.entries
            .filterNot { isBasicLand(it.name) }
            .groupBy { it.name.lowercase() }
            .forEach { (_, sameCard) ->
                val copies = sameCard.sumOf { it.quantity }
                if (copies > MAX_COPIES) {
                    violations +=
                        DeckViolation(
                            "TOO_MANY_COPIES",
                            "Open Format allows at most $MAX_COPIES copies of " +
                                "\"${sameCard.first().name}\"; this deck has $copies.",
                            sameCard.first().lineNumber,
                        )
                }
            }

        return violations
    }
}
