package net.barnflix.proxic.deck

import net.barnflix.proxic.auth.AccountStatus
import net.barnflix.proxic.auth.Usernames
import java.util.UUID
import javax.sql.DataSource

// Deck sharing — PHASE_04 §4.18–§4.35, §4.99, §4.100.
//
// Sharing is a row, not a copy (§4.19): the deck, its entries and
// its artwork stay exactly where they were, owned by exactly who
// owned them. Everything here manipulates one small table.

/**
 * Who a deck is shared with (§4.99).
 *
 * Returned to the OWNER only. A recipient has no need of the
 * sharing graph, and handing it over would tell them who else uses
 * this server.
 */
data class ShareRecipient(
    val userId: UUID,
    val username: String,
    val displayName: String,
    val sharedAt: String,
)

/** What a share attempt did, or why it did nothing (§4.101). */
sealed interface ShareResult {
    data class Created(val recipient: ShareRecipient) : ShareResult

    /** §4.33 — asking twice is not an error worth punishing. */
    data class AlreadyShared(val recipient: ShareRecipient) : ShareResult

    data class Rejected(val code: String, val detail: String) : ShareResult
}

class DeckSharing(
    private val dataSource: DataSource,
    private val authorization: DeckAuthorization,
) {
    /**
     * Share a deck with a user, named by username (§4.29, §4.32).
     *
     * The caller must own the deck; the route checks that first and
     * this re-checks, because §4.45's "one authorization service"
     * only holds if the service itself does not take permission on
     * trust from its caller.
     */
    fun share(
        deckId: UUID,
        ownerId: UUID,
        rawUsername: String,
    ): ShareResult {
        if (!authorization.accessFor(ownerId, deckId).mayManage()) {
            return ShareResult.Rejected("DECK_OWNER_REQUIRED", "Only the owner can share this deck.")
        }

        val username = rawUsername.trim()
        if (username.isEmpty()) {
            return ShareResult.Rejected("SHARE_USER_NOT_FOUND", "Enter the username to share with.")
        }

        val recipient =
            findUser(username)
                ?: return ShareResult.Rejected(
                    "SHARE_USER_NOT_FOUND",
                    "No account named \"$username\".",
                )

        // §4.27 — the owner already has it, and a share row to
        // themselves would make accessFor ambiguous.
        if (recipient.userId == ownerId) {
            return ShareResult.Rejected(
                "CANNOT_SHARE_WITH_OWNER",
                "This deck is already yours.",
            )
        }

        // §4.28 — no NEW share to a disabled account. An existing
        // one survives the account being disabled and works again if
        // it is re-enabled; that is the account's state talking, not
        // the share's.
        if (recipient.status != AccountStatus.ACTIVE) {
            return ShareResult.Rejected(
                "SHARE_USER_DISABLED",
                "That account is disabled.",
            )
        }

        existingShare(deckId, recipient.userId)?.let { return ShareResult.AlreadyShared(it) }

        return dataSource.connection.use { connection ->
            connection.prepareStatement(
                "INSERT INTO deck_share (share_id, deck_id, shared_with_user_id, created_by_user_id) " +
                    "VALUES (?, ?, ?, ?) ON CONFLICT (deck_id, shared_with_user_id) DO NOTHING",
            ).use { statement ->
                statement.setObject(1, UUID.randomUUID())
                statement.setObject(2, deckId)
                statement.setObject(3, recipient.userId)
                statement.setObject(4, ownerId)
                statement.executeUpdate()
            }
            // ON CONFLICT DO NOTHING rather than a second check:
            // two share requests racing both pass a check-then-insert,
            // and §4.104 asks for that case to end in one row rather
            // than an error. The row is read back so the answer
            // describes what IS, not what we tried to write.
            val stored = existingShare(deckId, recipient.userId)
            if (stored == null) {
                ShareResult.Rejected("SHARE_FAILED", "That share could not be created.")
            } else {
                ShareResult.Created(stored)
            }
        }
    }

    /**
     * §4.34, §4.35 — revoke by recipient, which is what the owner's
     * UI actually knows. Idempotent: revoking a share that is not
     * there is a success, because the end state is the one asked for.
     */
    fun revoke(
        deckId: UUID,
        ownerId: UUID,
        recipientId: UUID,
    ): ShareResult? {
        if (!authorization.accessFor(ownerId, deckId).mayManage()) {
            return ShareResult.Rejected("DECK_OWNER_REQUIRED", "Only the owner can manage this deck.")
        }
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "DELETE FROM deck_share WHERE deck_id = ? AND shared_with_user_id = ?",
            ).use { statement ->
                statement.setObject(1, deckId)
                statement.setObject(2, recipientId)
                statement.executeUpdate()
            }
        }
        return null
    }

    /** §4.99 — for the owner's eyes only; the route enforces that. */
    fun recipientsOf(deckId: UUID): List<ShareRecipient> =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT u.user_id, u.username, u.display_name, s.created_at
                  FROM deck_share s
                  JOIN app_user u ON u.user_id = s.shared_with_user_id
                 WHERE s.deck_id = ?
                 ORDER BY s.created_at
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, deckId)
                statement.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) {
                            add(
                                ShareRecipient(
                                    userId = rows.getObject(1, UUID::class.java),
                                    username = rows.getString(2),
                                    displayName = rows.getString(3),
                                    sharedAt = rows.getTimestamp(4).toInstant().toString(),
                                ),
                            )
                        }
                    }
                }
            }
        }

    private fun existingShare(
        deckId: UUID,
        recipientId: UUID,
    ): ShareRecipient? = recipientsOf(deckId).firstOrNull { it.userId == recipientId }

    private data class FoundUser(val userId: UUID, val status: AccountStatus)

    /**
     * Exact username lookup, normalized the way accounts are (§4.29).
     *
     * §4.30/§4.31: this is not a directory. It answers "does THIS
     * name exist" for a name the owner already typed, and returns
     * only what sharing needs. There is no listing endpoint and no
     * prefix search, so it cannot be walked to enumerate accounts.
     */
    private fun findUser(username: String): FoundUser? =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "SELECT user_id, status FROM app_user WHERE username_normalized = ?",
            ).use { statement ->
                statement.setString(1, Usernames.normalize(username))
                statement.executeQuery().use { rows ->
                    if (!rows.next()) {
                        null
                    } else {
                        FoundUser(
                            rows.getObject(1, UUID::class.java),
                            AccountStatus.valueOf(rows.getString(2)),
                        )
                    }
                }
            }
        }
}
