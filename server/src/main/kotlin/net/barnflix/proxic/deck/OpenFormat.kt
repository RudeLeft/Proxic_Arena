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
 * Phase 8 Amendment 3 (owner, 2026-10-23): Contraptions and Attractions
 * (the Un-sets) go to their own small decks, sorted by card type -- as
 * Forge reads the card -- and are not in the 60–65 or the copy count.
 * Each such deck follows its own Constructed rule, as Forge has it: at
 * least 15 Contraptions or 10 Attractions, one copy of each.
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

    /** Phase 8 Amendment 3 — the side decks, and the least each may hold. */
    val SIDE_DECKS = mapOf("CONTRAPTIONS" to 15, "ATTRACTIONS" to 10)

    /** Phase 8 Amendment 3 — a side deck holds one copy of each card. */
    const val SIDE_DECK_MAX_COPIES = 1

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
    internal val BASIC_LAND_NAMES =
        setOf(
            "plains", "island", "swamp", "mountain", "forest", "wastes",
            "snow-covered plains", "snow-covered island", "snow-covered swamp",
            "snow-covered mountain", "snow-covered forest", "snow-covered wastes",
        )

    fun isBasicLand(name: String): Boolean = name.substringBefore(" // ").trim().lowercase() in BASIC_LAND_NAMES

    /**
     * The violations that hold whatever Forge says about the cards, so a
     * deck can be refused before Forge is asked (which costs a worker).
     * Taking cards out to a contraption or attraction deck only makes the
     * main deck smaller, so "too few" stands; more than 4 copies breaks
     * the main deck's limit and the side decks' one-of alike. Only "too
     * many" waits for Forge: those extra cards may be Contraptions.
     */
    fun certainViolations(deck: ParsedDeck): List<DeckViolation> {
        val forgeDecides = "DECK_TOO_LARGE"
        return validate(deck).filterNot { it.code == forgeDecides }
    }

    /**
     * Every violation, not just the first.
     *
     * A player fixing one problem at a time, with an upload between
     * each, is a worse experience than one list of everything wrong.
     */
    fun validate(
        deck: ParsedDeck,
        /** Card name (any case) to CONTRAPTIONS or ATTRACTIONS, as Forge reads it; absent is the main deck. */
        sections: Map<String, String> = emptyMap(),
    ): List<DeckViolation> {
        val violations = mutableListOf<DeckViolation>()
        val sectionOf = sections.mapKeys { it.key.lowercase() }
        val (sideEntries, mainEntries) = deck.entries.partition { it.name.lowercase() in sectionOf }

        SIDE_DECKS.forEach { (section, least) ->
            val cards = sideEntries.filter { sectionOf[it.name.lowercase()] == section }
            if (cards.isEmpty()) return@forEach
            val word = if (section == "CONTRAPTIONS") "Contraption" else "Attraction"
            val total = cards.sumOf { it.quantity }
            if (total < least) {
                violations +=
                    DeckViolation(
                        "${section}_DECK_TOO_SMALL",
                        "A ${word.lowercase()} deck needs at least $least ${word}s, or none; this deck has $total.",
                    )
            }
            cards.groupBy { it.name.lowercase() }.forEach { (_, same) ->
                val copies = same.sumOf { it.quantity }
                if (copies > SIDE_DECK_MAX_COPIES) {
                    violations +=
                        DeckViolation(
                            "TOO_MANY_COPIES",
                            "A ${word.lowercase()} deck allows one copy of each; this deck has $copies of " +
                                "\"${same.first().name}\".",
                            same.first().lineNumber,
                        )
                }
            }
        }

        val total = mainEntries.sumOf { it.quantity }
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
        mainEntries
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
