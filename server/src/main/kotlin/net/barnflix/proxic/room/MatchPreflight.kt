package net.barnflix.proxic.room

import net.barnflix.proxic.deck.CardResolver
import net.barnflix.proxic.deck.DeckEntry
import net.barnflix.proxic.deck.OpenFormat
import net.barnflix.proxic.deck.ParsedDeck
import java.util.UUID
import javax.sql.DataSource

// Pre-match deck validation — PHASE_05 §5.92, §5.95–§5.99.
//
// Two checks, and the split between them is the Forge boundary.
//
//   Open Format legality  →  PROXIC's, by the amended §2.45
//   the deck builds       →  FORGE's, and only Forge's
//
// §5.95 forbids Arena from implementing Magic deck-format rules and
// §5.96 requires a Forge preflight. The amended §2.45 settles which
// is which: Forge's `DeckFormat.Constructed` has no maximum deck
// size and permits a sideboard, so Open Format's 60–65-and-no-
// sideboard bounds CANNOT be delegated — they are Proxic's policy,
// not Magic's rules. Everything from the first untap step onward
// stays Forge's, exclusively.
//
// NO §5.97 CONFLICT TO REPORT. §5.97 asks for a stop-and-report if
// the accepted Forge boundary cannot do a required pre-match check
// without launching a real game. It can: the Phase 2 worker already
// answers BUILD_DECK, which constructs the deck from Forge's own
// card pool and names what it could not resolve, with no game
// started. What it costs is a JVM — see [validate].
//
// §2.45 says Open Format is enforced "at import and again at match
// setup". This is that second place, and it re-reads the stored
// deck rather than trusting the import verdict: a Forge pin can
// change between the two, and a deck that imported last year is not
// evidence about today.

/** §5.100 — the per-player answer, in that section's vocabulary. */
enum class DeckVerdict {
    VALID,

    /** Proxic's Open Format bounds. The detail says which one. */
    INVALID_FOR_PRESET,

    /** Forge could not build it: a card no longer resolves. */
    FORGE_RESOLUTION_ERROR,

    /** The deck is gone, or the share was revoked (§5.50). */
    ACCESS_REVOKED,
}

data class DeckCheck(
    val verdict: DeckVerdict,
    /**
     * For the OWNING player only.
     *
     * §5.101: other players learn that somebody needs attention,
     * never what is wrong with their deck. The routes enforce that
     * by where they send this, and the text here is written on the
     * assumption it reaches exactly one person.
     */
    val detail: String,
) {
    val ok: Boolean get() = verdict == DeckVerdict.VALID
}

/**
 * The seam, so the setup rules can be tested without a JVM.
 *
 * Narrow on purpose: one question, one answer. A wider interface
 * would invite a test double that disagrees with the real thing in
 * ways nobody notices.
 */
fun interface DeckPreflight {
    fun validate(deckId: UUID): DeckCheck
}

class MatchPreflight(
    private val dataSource: DataSource,
    private val resolver: CardResolver,
) : DeckPreflight {
    /**
     * Check one player's deck, from stored state only.
     *
     * Spawns a Forge worker, which costs ~611 MB and ~2.8 s (Phase
     * 0A). That is a real price and it is paid deliberately: this
     * runs once when a host prepares a match, not per request, and
     * §5.93 is explicit that preparation must revalidate rather
     * than trust an earlier answer. Phase 6 owns per-match worker
     * lifecycle and will have one running anyway.
     */
    override fun validate(deckId: UUID): DeckCheck {
        val entries = entriesOf(deckId) ?: return gone()
        if (entries.isEmpty()) return gone()

        // Proxic's free half first: a deck illegal whatever Forge says
        // does not need a JVM to be told so.
        OpenFormat.certainViolations(ParsedDeck(null, entries)).takeIf { it.isNotEmpty() }?.let { certain ->
            return DeckCheck(DeckVerdict.INVALID_FOR_PRESET, certain.joinToString("; ") { it.detail })
        }

        // Then Forge's, since Phase 8 Amendment 3: which cards are
        // Contraptions or Attractions -- outside the 60–65 -- is Forge's
        // reading of the card. §5.99 — the message that reaches a
        // browser is ours; Forge's own diagnostics, paths and traces are
        // not forwarded.
        val built =
            runCatching { resolver.buildDeck(entries) }.getOrNull()
                ?: return DeckCheck(
                    DeckVerdict.FORGE_RESOLUTION_ERROR,
                    "The deck could not be checked right now. Try again in a moment.",
                )

        val violations = OpenFormat.validate(ParsedDeck(null, entries), built.sections)
        if (violations.isNotEmpty()) {
            return DeckCheck(
                DeckVerdict.INVALID_FOR_PRESET,
                violations.joinToString("; ") { it.detail },
            )
        }

        if (built.unresolved.isNotEmpty()) {
            val names = built.unresolved.take(MAX_NAMED).joinToString(", ")
            val more = built.unresolved.size - MAX_NAMED
            return DeckCheck(
                DeckVerdict.FORGE_RESOLUTION_ERROR,
                if (more > 0) {
                    "Not supported yet: $names and $more more."
                } else {
                    "Not supported yet: $names."
                },
            )
        }

        return DeckCheck(DeckVerdict.VALID, "")
    }

    private fun gone() =
        DeckCheck(
            DeckVerdict.ACCESS_REVOKED,
            "That deck is no longer available to you. Choose another.",
        )

    /** Null when the deck does not exist at all. */
    private fun entriesOf(deckId: UUID): List<DeckEntry>? =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT quantity, card_name, set_code, collector_number,
                       source_text, line_number
                  FROM deck_entry
                 WHERE deck_id = ?
                 ORDER BY line_number
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, deckId)
                statement.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) {
                            add(
                                DeckEntry(
                                    quantity = rows.getInt(1),
                                    name = rows.getString(2),
                                    setCode = rows.getString(3),
                                    collectorNumber = rows.getString(4),
                                    sourceText = rows.getString(5),
                                    lineNumber = rows.getInt(6),
                                ),
                            )
                        }
                    }
                }
            }
        }

    private companion object {
        /** Enough to act on, short enough not to be a wall of text. */
        const val MAX_NAMED = 3
    }
}
