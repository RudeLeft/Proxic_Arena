package net.barnflix.proxic.lobby

import java.util.UUID
import javax.sql.DataSource

// Everybody who could be in the lobby — PHASE_07 Amendment 11.
//
// The Players list shows every active account, offline ones greyed,
// so a host can see that parsley exists and is not here. Names only:
// the same two names the Deck Depot's share list already gives an
// owner (Amendment 10). A disabled account is not listed -- it cannot
// sign in, so it is nobody you could play.
//
// Read on each connect rather than cached: a handful of rows, and a
// cache would be one more thing to forget to clear when the Admin
// page creates an account.

class AccountNames(private val dataSource: DataSource) {
    fun active(): List<PresenceEntry> =
        dataSource.connection.use { connection ->
            // Spec 0009 — the latest activity of any session they still have,
            // for "last seen"; none after signing out everywhere.
            connection.prepareStatement(
                """
                SELECT u.user_id, u.username, u.display_name, u.avatar,
                       (SELECT max(s.last_active_at) FROM user_session s WHERE s.user_id = u.user_id)
                  FROM app_user u
                 WHERE u.status = 'ACTIVE'
                 ORDER BY lower(u.display_name), u.username_normalized
                """.trimIndent(),
            ).use { statement ->
                statement.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) {
                            val userId = rows.getObject(1, UUID::class.java)
                            add(
                                PresenceEntry(
                                    userId,
                                    rows.getString(2),
                                    rows.getString(3),
                                    rows.getString(4),
                                    lastSeenAt = rows.getTimestamp(5)?.toInstant()?.toString(),
                                ),
                            )
                        }
                    }
                }
            }
        }
}
