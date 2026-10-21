package net.barnflix.proxic.deck

import java.sql.Connection
import java.util.UUID

// Deck names — PHASE_07 §7.65, owner decision 18.
//
// A player's deck names are unique to that player: an import or a
// rename that would repeat one of their names is refused and asks for
// another. "Burn" and "burn " are the same name to a person reading a
// list, so the comparison ignores case and surrounding spaces.
//
// Not a database constraint, deliberately: §7.65 leaves any duplicates
// that already exist as they are, and a unique index cannot be added
// over rows that break it. The check runs inside the writing
// transaction under a per-owner lock instead, so two imports racing
// each other cannot both take the same name.

object DeckNames {
    /** Long enough for any real deck name, short enough for a list row. */
    const val MAX_LENGTH = 80

    /**
     * A name a player typed, cleaned, or null when it cannot be one:
     * empty after trimming, too long, or carrying control characters
     * (a newline in a name breaks every list that shows it).
     */
    fun typed(raw: String): String? {
        val name = raw.trim()
        if (name.isEmpty() || name.length > MAX_LENGTH) return null
        if (name.any { it.isISOControl() }) return null
        return name
    }

    /**
     * A name taken from the package (its declared name, or the file
     * name), which nobody typed: cleaned the same way, and shortened
     * rather than refused, because the player did not choose it.
     */
    fun derived(raw: String): String {
        val name = raw.filterNot { it.isISOControl() }.trim().take(MAX_LENGTH).trim()
        return name.ifEmpty { "Imported deck" }
    }

    /**
     * Serialises name-claiming for one owner until the transaction
     * ends. An advisory lock rather than a row lock: nothing else
     * waits on it, and it needs no row that might not exist yet.
     */
    fun lockOwner(
        connection: Connection,
        ownerUserId: UUID,
    ) {
        connection.prepareStatement("SELECT pg_advisory_xact_lock(hashtextextended(?, 18))").use {
            it.setString(1, "deck-names:$ownerUserId")
            it.executeQuery().close()
        }
    }

    /** Whether [ownerUserId] already has a deck called [name], other than [except]. */
    fun taken(
        connection: Connection,
        ownerUserId: UUID,
        name: String,
        except: UUID? = null,
    ): Boolean =
        connection.prepareStatement(
            """
            SELECT 1 FROM imported_deck
             WHERE owner_user_id = ?
               AND lower(btrim(display_name)) = lower(btrim(?))
               AND (?::uuid IS NULL OR deck_id <> ?::uuid)
             LIMIT 1
            """.trimIndent(),
        ).use { statement ->
            statement.setObject(1, ownerUserId)
            statement.setString(2, name)
            statement.setObject(3, except)
            statement.setObject(4, except)
            statement.executeQuery().use { it.next() }
        }

    /** Whether [ownerUserId] already has a deck called [name] — its own connection. */
    fun taken(
        dataSource: javax.sql.DataSource,
        ownerUserId: UUID,
        name: String,
    ): Boolean = dataSource.connection.use { taken(it, ownerUserId, name) }

    /** The words a refusal carries, the same for import and rename. */
    fun takenMessage(name: String): String = "You already have a deck called \"$name\". Choose another name."
}
