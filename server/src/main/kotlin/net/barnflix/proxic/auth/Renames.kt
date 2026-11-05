package net.barnflix.proxic.auth

import java.util.UUID
import javax.sql.DataSource

/**
 * Spec 0041 Amendment 3 — an administrator renames a player (owner
 * 2026-11-04). Only the display name changes, never the username, and
 * the player is told once (V038's `renamed_notice`).
 */
class Renames(private val dataSource: DataSource) {
    /** Who was renamed, and from what. */
    data class Renamed(val username: String, val was: String)

    /**
     * Rename [userId] to [name] (already checked by [DisplayNames]); null
     * when there is no such account. [tell] leaves the notice for the
     * player -- not when an administrator renames themselves.
     */
    fun rename(
        userId: UUID,
        name: String,
        tell: Boolean,
    ): Renamed? =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                UPDATE app_user u
                   SET display_name = ?,
                       renamed_notice = CASE WHEN ? THEN ? ELSE u.renamed_notice END
                  FROM (SELECT user_id, display_name FROM app_user WHERE user_id = ? FOR UPDATE) old
                 WHERE u.user_id = old.user_id
                RETURNING u.username, old.display_name
                """.trimIndent(),
            ).use {
                it.setString(1, name)
                it.setBoolean(2, tell)
                it.setString(3, name)
                it.setObject(4, userId)
                it.executeQuery().use { rows ->
                    if (rows.next()) Renamed(rows.getString(1), rows.getString(2)) else null
                }
            }
        }

    /** The name the player has yet to be told, taken: told once. Null when there is none. */
    fun takeNotice(userId: UUID): String? =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                UPDATE app_user u
                   SET renamed_notice = NULL
                  FROM (SELECT user_id, renamed_notice FROM app_user
                         WHERE user_id = ? AND renamed_notice IS NOT NULL FOR UPDATE) old
                 WHERE u.user_id = old.user_id
                RETURNING old.renamed_notice
                """.trimIndent(),
            ).use {
                it.setObject(1, userId)
                it.executeQuery().use { rows -> if (rows.next()) rows.getString(1) else null }
            }
        }
}
