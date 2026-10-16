package net.barnflix.proxic.deck

//
// The Deck Builder decklist, parsed — PHASE_02 §2.39–§2.43.
//
// Grammar, observed from a real export rather than assumed
// (`docs/research/phase-02/DECK_BUILDER_EXPORT_INSPECTION.md`):
//
// ```text
// // Basic_Mono_Red_65_Card_Deck (commander)
//
// 4 Fiery Temper [INR:154]
// 25 Mountain [FRA:287]
// 4 Reckless Stormseeker // Storm-Charged Slasher [MID:157]
// ```
//
// UTF-8, no BOM, LF line endings.
//

/** One parsed line. [sourceText] is kept verbatim (§2.42). */
data class DeckEntry(
    val quantity: Int,
    val name: String,
    val setCode: String?,
    val collectorNumber: String?,
    val sourceText: String,
    val lineNumber: Int,
) {
    /**
     * The face the artwork is filed under.
     *
     * The exporter files one image per distinct FRONT face name, so
     * `Reckless Stormseeker // Storm-Charged Slasher` arrives as
     * `Reckless Stormseeker [MID].png`. The back face has no image
     * at all (inspection finding 3).
     */
    val frontFaceName: String get() = name.substringBefore(" // ").trim()

    val isMultiFace: Boolean get() = name.contains(" // ")
}

data class ParsedDeck(
    val declaredName: String?,
    val entries: List<DeckEntry>,
) {
    val totalCards: Int get() = entries.sumOf { it.quantity }
}

sealed interface DeckParseResult {
    data class Ok(val deck: ParsedDeck) : DeckParseResult

    /** [line] is 1-based, or 0 when the problem is the file itself. */
    data class Invalid(val reason: String, val line: Int) : DeckParseResult
}

object DeckListParser {
    /**
     * `<quantity> <card name> [<SET>:<COLLECTOR>]`
     *
     * The bracketed part is optional because the exporter omits the
     * set code when a card has none — it writes `<Name>.png` rather
     * than `<Name> [SET].png` in exactly that case, so the deck line
     * can lack it too.
     *
     * The name is non-greedy up to the final bracket, because a card
     * name may itself contain brackets in principle and the LAST
     * group is the printing.
     */
    private val LINE = Regex("""^(\d+)\s+(.+?)(?:\s+\[([^:\]]+)(?::([^\]]+))?])?$""")

    private const val MAX_QUANTITY = 1000

    /**
     * Parse decklist text. Never throws; a bad file is a result.
     *
     * The header's format label is deliberately NOT read. A real
     * export of a 65-card mono-red deck declared "(commander)"
     * (inspection finding 1) — the label reflects a Deck Builder
     * setting, not legality, and Commander is out of scope. Legality
     * is Proxic's own determination (§2.45).
     */
    fun parse(text: String): DeckParseResult {
        // Tolerate CRLF even though the exporter writes LF: a package
        // can be hand-edited on Windows, and failing on a line ending
        // would be a baffling error for a file that looks identical.
        val lines = text.replace("\r\n", "\n").replace('\r', '\n').split('\n')

        var declaredName: String? = null
        val entries = mutableListOf<DeckEntry>()

        lines.forEachIndexed { index, raw ->
            val lineNumber = index + 1
            val line = raw.trim()
            when {
                line.isEmpty() -> Unit

                line.startsWith("//") -> {
                    // First comment is the deck name; the trailing
                    // "(format)" is stripped and discarded.
                    if (declaredName == null) {
                        declaredName =
                            line.removePrefix("//").trim()
                                .substringBeforeLast(" (").trim()
                                .ifEmpty { null }
                    }
                }

                else -> {
                    val match =
                        LINE.matchEntire(line)
                            ?: return DeckParseResult.Invalid(
                                "line is not '<quantity> <card name> [SET:NUMBER]'",
                                lineNumber,
                            )
                    val quantity =
                        match.groupValues[1].toIntOrNull()
                            ?: return DeckParseResult.Invalid("quantity is not a number", lineNumber)
                    // §2.43: a quantity of zero is not a card, and an
                    // absurd one is a resource question, not a deck.
                    if (quantity <= 0) {
                        return DeckParseResult.Invalid("quantity must be at least 1", lineNumber)
                    }
                    if (quantity > MAX_QUANTITY) {
                        return DeckParseResult.Invalid(
                            "quantity $quantity exceeds the sane maximum of $MAX_QUANTITY",
                            lineNumber,
                        )
                    }
                    val name = match.groupValues[2].trim()
                    if (name.isEmpty()) {
                        return DeckParseResult.Invalid("card name is empty", lineNumber)
                    }
                    entries +=
                        DeckEntry(
                            quantity = quantity,
                            name = name,
                            setCode = match.groupValues[3].takeIf { it.isNotEmpty() },
                            collectorNumber = match.groupValues[4].takeIf { it.isNotEmpty() },
                            sourceText = raw,
                            lineNumber = lineNumber,
                        )
                }
            }
        }

        if (entries.isEmpty()) {
            return DeckParseResult.Invalid("the decklist contains no cards", 0)
        }
        return DeckParseResult.Ok(ParsedDeck(declaredName, entries))
    }
}
