package net.barnflix.proxic.deck

import org.slf4j.Logger
import java.util.UUID
import javax.sql.DataSource
import kotlin.concurrent.thread

// The one-time fill of card categories — PHASE_07 Amendment 10.
//
// Decks imported before V011 have no LAND / CREATURE / SPELL on their
// entries. The server does not own a card database (ARCH-001), so the
// answer is asked of Forge, the same way an import asks it: one worker
// per deck, one deck at a time, in the background after startup. A
// worker costs ~600 MB while it runs, so never two at once.
//
// Once every entry has a category this finds nothing and costs one
// query per start. A deck Forge cannot answer for (a worker that will
// not start) is left as it is: the page shows those cards in an
// unsorted band, and the next start tries again.

class DeckCategoryFill(
    private val dataSource: DataSource,
    private val resolver: CardResolver,
    private val log: Logger,
) {
    @Volatile private var stopping = false

    /** Starts the fill on a background thread; returns at once. */
    fun start() {
        thread(name = "deck-category-fill", isDaemon = true) {
            runCatching { fillAll() }
                .onFailure { log.warn("deck category fill stopped: {}", it.toString()) }
        }
    }

    fun stop() {
        stopping = true
    }

    /** Fills every deck that needs it. Returns how many decks were filled. */
    fun fillAll(): Int {
        var filled = 0
        for (deckId in decksNeedingIt()) {
            if (stopping) break
            if (!fill(deckId)) {
                // Forge did not answer: no point asking for the next
                // deck either. The next start tries again.
                log.warn("deck category fill: Forge did not answer for deck {}; stopping", deckId)
                break
            }
            filled++
        }
        if (filled > 0) log.info("deck category fill: {} deck(s) sorted", filled)
        return filled
    }

    private fun decksNeedingIt(): List<UUID> =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "SELECT DISTINCT deck_id FROM deck_entry WHERE card_category IS NULL",
            ).use { statement ->
                statement.executeQuery().use { rows ->
                    buildList { while (rows.next()) add(rows.getObject(1, UUID::class.java)) }
                }
            }
        }

    /** True when Forge answered for at least one card of [deckId]. */
    private fun fill(deckId: UUID): Boolean {
        val entries =
            dataSource.connection.use { connection ->
                connection.prepareStatement(
                    """
                    SELECT line_number, quantity, card_name, set_code, collector_number, source_text
                      FROM deck_entry
                     WHERE deck_id = ? AND card_category IS NULL
                     ORDER BY line_number
                    """.trimIndent(),
                ).use { statement ->
                    statement.setObject(1, deckId)
                    statement.executeQuery().use { rows ->
                        buildList {
                            while (rows.next()) {
                                add(
                                    DeckEntry(
                                        quantity = rows.getInt(2),
                                        name = rows.getString(3),
                                        setCode = rows.getString(4),
                                        collectorNumber = rows.getString(5),
                                        sourceText = rows.getString(6),
                                        lineNumber = rows.getInt(1),
                                    ),
                                )
                            }
                        }
                    }
                }
            }
        if (entries.isEmpty()) return true

        val categories =
            resolver.resolve(entries)
                .mapNotNull { resolution -> resolution.category?.let { resolution.name.lowercase() to it } }
                .toMap()
        if (categories.isEmpty()) return false

        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "UPDATE deck_entry SET card_category = ? " +
                    "WHERE deck_id = ? AND line_number = ? AND card_category IS NULL",
            ).use { statement ->
                for (entry in entries) {
                    val category = categories[entry.name.lowercase()] ?: continue
                    statement.setString(1, category)
                    statement.setObject(2, deckId)
                    statement.setInt(3, entry.lineNumber)
                    statement.addBatch()
                }
                statement.executeBatch()
            }
        }
        return true
    }
}
