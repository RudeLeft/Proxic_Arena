package net.barnflix.proxic.deck

import java.util.UUID
import javax.sql.DataSource

// Deck authorization — PHASE_04 §4.41–§4.47, §4.67.
//
// ONE place that answers "may this user touch this deck". §4.45
// forbids scattering ownership comparisons across routes, and the
// reason is §4.67: horizontal authorization fails when one route out
// of eight forgets, and the forgetful route is never the one anybody
// tests.

/**
 * What a user may do with a deck (§4.41).
 *
 * Deliberately three states rather than a boolean. "May view" and
 * "may delete" are different questions with different answers for a
 * share recipient, and a boolean forces each caller to re-derive the
 * difference — which is how the answers drift apart.
 */
enum class DeckAccess {
    /** Uploaded it. May view, use, share, revoke and delete. */
    OWNER,

    /** Shared with them. May view and use; may not manage (§4.23). */
    SHARED,

    /** No relationship. Must not learn the deck exists (§4.65). */
    NO_ACCESS,

    ;

    /** §4.47 — owner and recipient alike may play it. */
    fun mayView(): Boolean = this != NO_ACCESS

    /** §4.46, §4.47 — the answer Phase 5/6 will ask for. */
    fun mayUse(): Boolean = this != NO_ACCESS

    /** §4.23, §4.80 — share, revoke, delete. Owner only. */
    fun mayManage(): Boolean = this == OWNER
}

/**
 * The authorization service (§4.45).
 *
 * Every answer comes from the database on the asking, never from a
 * cached map and never from anything the client said. A share
 * revoked a second ago must not still be in force.
 */
class DeckAuthorization(private val dataSource: DataSource) {
    /**
     * §4.45 — the single entry point.
     *
     * One statement, so a deck that is both owned and (somehow)
     * shared cannot produce two different answers depending on which
     * query ran first. Ownership wins, which matters for §4.27: a
     * share to the owner should never exist, and if one ever did,
     * the owner would not be demoted by it.
     */
    fun accessFor(
        userId: UUID,
        deckId: UUID,
    ): DeckAccess =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT CASE
                         WHEN d.owner_user_id = ? THEN 'OWNER'
                         WHEN s.share_id IS NOT NULL THEN 'SHARED'
                         ELSE 'NO_ACCESS'
                       END
                  FROM imported_deck d
                  LEFT JOIN deck_share s
                         ON s.deck_id = d.deck_id AND s.shared_with_user_id = ?
                 WHERE d.deck_id = ?
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, userId)
                statement.setObject(2, userId)
                statement.setObject(3, deckId)
                statement.executeQuery().use { rows ->
                    // No row at all means the deck does not exist,
                    // which the caller must not be able to tell apart
                    // from "not yours" (§4.65). Both are NO_ACCESS
                    // here, and both answer 404 at the route.
                    if (!rows.next()) DeckAccess.NO_ACCESS else DeckAccess.valueOf(rows.getString(1))
                }
            }
        }

    /**
     * May this user see this artwork, under this deck?
     *
     * PHASE 4 AMENDMENT 2. Two conditions, not one:
     *
     *   1. the caller may access the deck, AND
     *   2. the asset is actually referenced by that deck.
     *
     * The second is the part the URL shape only pretends to do. Art
     * is content-addressed and shared between decks (Phase 2), so
     * "is this asset yours" is not a meaningful question — the asset
     * id is a SHA-256 of image bytes that many decks may use. The
     * meaningful question is whether it belongs to a deck you may
     * see.
     *
     * Measured before this existed: a valid asset id requested under
     * a deck id that did not exist returned 200 and the whole image.
     */
    fun mayViewAsset(
        userId: UUID,
        deckId: UUID,
        assetSha256: String,
    ): Boolean {
        if (!accessFor(userId, deckId).mayView()) return false
        return dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT 1 FROM deck_entry
                 WHERE deck_id = ? AND art_sha256 = ?
                 LIMIT 1
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, deckId)
                statement.setString(2, assetSha256)
                statement.executeQuery().use { it.next() }
            }
        }
    }

    /**
     * May this user put this deck on a table? — §4.46, §4.47.
     *
     * Exposed by name because later phases are told to rely on it:
     * the lobby and the match runtime must ask the server whether a
     * deck may be used, and a browser saying it may is not an
     * answer. It is deliberately a thin wrapper over [accessFor] so
     * there is one rule, not two that drift.
     *
     * It does NOT consider format legality (§4.48). A deck you may
     * use can still be an illegal deck.
     */
    fun canUseDeck(
        userId: UUID,
        deckId: UUID,
    ): Boolean = accessFor(userId, deckId).mayUse()

    /** The decks this user owns (§4.58). */
    fun ownedBy(userId: UUID): List<UUID> =
        idsFrom(
            "SELECT deck_id FROM imported_deck WHERE owner_user_id = ? ORDER BY imported_at DESC",
            userId,
        )

    /** The decks shared with this user (§4.59). */
    fun sharedWith(userId: UUID): List<UUID> =
        idsFrom(
            """
            SELECT d.deck_id FROM imported_deck d
              JOIN deck_share s ON s.deck_id = d.deck_id
             WHERE s.shared_with_user_id = ?
             ORDER BY s.created_at DESC
            """.trimIndent(),
            userId,
        )

    private fun idsFrom(
        sql: String,
        userId: UUID,
    ): List<UUID> =
        dataSource.connection.use { connection ->
            connection.prepareStatement(sql).use { statement ->
                statement.setObject(1, userId)
                statement.executeQuery().use { rows ->
                    buildList { while (rows.next()) add(rows.getObject(1, UUID::class.java)) }
                }
            }
        }
}
