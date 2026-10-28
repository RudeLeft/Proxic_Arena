package net.barnflix.proxic.admin

import kotlinx.serialization.Serializable
import net.barnflix.proxic.auth.AccountStatus
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.Sessions
import java.sql.Connection
import java.util.UUID
import javax.sql.DataSource

// Accounts, as the Admin page manages them — PHASE_07 §7.67, owner
// decisions 15 and 16. Amendment 9's "the administrator types a new
// password" is gone: spec 0026 sends the player a reset link instead.
//
// The one rule here that is not Phase 3's: THE LAST ACTIVE
// ADMINISTRATOR CANNOT BE DISABLED OR DEMOTED, by anyone, themselves
// included. The page does not offer the control; this refuses it
// anyway, because a page is not the protection (§7.62). It is checked
// inside the transaction that makes the change, with every active
// administrator's row locked, so two administrators disabling each
// other at the same moment cannot leave the server with none.

@Serializable
data class AdminAccountView(
    val userId: String,
    val username: String,
    val displayName: String,
    val role: String,
    val status: String,
    /** Live sessions: not revoked, not expired. */
    val sessions: Int,
    val lastSignInAt: String? = null,
    /** The only active administrator: no Disable, no Make player. */
    val lastAdmin: Boolean = false,
    /** Spec 0026 — where a password reset goes; null when there is none. */
    val email: String? = null,
    /** Spec 0027 — computers linked to the Deck Builder. */
    val computers: Int = 0,
)

/** What an account change came to. */
sealed interface AdminChange {
    data class Done(val username: String) : AdminChange

    data object NotFound : AdminChange

    data class Refused(val code: String, val detail: String) : AdminChange
}

class AdminAccounts(
    private val dataSource: DataSource,
    /** Phase 3's accounts: creating one, and its username and password rules. */
    val accounts: Accounts,
    private val sessions: Sessions,
) {
    fun list(): List<AdminAccountView> =
        dataSource.connection.use { connection ->
            val admins = activeAdmins(connection, lock = false)
            connection.prepareStatement(
                """
                SELECT u.user_id, u.username, u.display_name, u.role, u.status,
                       (SELECT count(*) FROM user_session s
                         WHERE s.user_id = u.user_id AND s.revoked_at IS NULL AND s.expires_at > now()),
                       (SELECT max(e.at) FROM sign_in_event e
                         WHERE e.user_id = u.user_id AND e.kind = 'SIGNED_IN'),
                       u.email,
                       (SELECT count(*) FROM device_link d
                         WHERE d.user_id = u.user_id AND d.revoked_at IS NULL)
                  FROM app_user u
                 ORDER BY u.status = 'ACTIVE' DESC, u.role = 'ADMIN' DESC, lower(u.display_name)
                """.trimIndent(),
            ).use { statement ->
                statement.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) {
                            val userId = rows.getObject(1, UUID::class.java)
                            add(
                                AdminAccountView(
                                    userId = userId.toString(),
                                    username = rows.getString(2),
                                    displayName = rows.getString(3),
                                    role = rows.getString(4),
                                    status = rows.getString(5),
                                    sessions = rows.getInt(6),
                                    lastSignInAt = rows.getTimestamp(7)?.toInstant()?.toString(),
                                    lastAdmin = admins == listOf(userId),
                                    email = rows.getString(8),
                                    computers = rows.getInt(9),
                                ),
                            )
                        }
                    }
                }
            }
        }

    /** Enable or disable. Disabling ends every session (§3.110's tool did the same). */
    fun setStatus(
        userId: UUID,
        status: AccountStatus,
    ): AdminChange {
        val change =
            guarded(userId, losesAdmin = status == AccountStatus.DISABLED) { connection ->
                connection.prepareStatement("UPDATE app_user SET status = ? WHERE user_id = ?").use {
                    it.setString(1, status.name)
                    it.setObject(2, userId)
                    it.executeUpdate()
                }
            }
        if (change is AdminChange.Done && status == AccountStatus.DISABLED) sessions.revokeAllForUser(userId)
        return change
    }

    /** Make an administrator, or a player. The server re-reads the role on every request (§3.19). */
    fun setRole(
        userId: UUID,
        role: Role,
    ): AdminChange =
        guarded(userId, losesAdmin = role == Role.PLAYER) { connection ->
            connection.prepareStatement("UPDATE app_user SET role = ? WHERE user_id = ?").use {
                it.setString(1, role.name)
                it.setObject(2, userId)
                it.executeUpdate()
            }
        }

    /** End every session this account has, on every device. */
    fun signOutEverywhere(userId: UUID): Pair<AdminChange, Int> {
        val username = usernameOf(userId) ?: return AdminChange.NotFound to 0
        return AdminChange.Done(username) to sessions.revokeAllForUser(userId)
    }

    private fun usernameOf(userId: UUID): String? =
        dataSource.connection.use { connection ->
            connection.prepareStatement("SELECT username FROM app_user WHERE user_id = ?").use {
                it.setObject(1, userId)
                it.executeQuery().use { rows -> if (rows.next()) rows.getString(1) else null }
            }
        }

    /**
     * One change to one account, refused when it would leave no active
     * administrator. [losesAdmin] says whether this change takes an
     * administrator away (disable, demote) if the target is one.
     */
    private fun guarded(
        userId: UUID,
        losesAdmin: Boolean,
        change: (Connection) -> Unit,
    ): AdminChange =
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                // Locks every active administrator's row first, so a
                // concurrent change to another one waits for this.
                val admins = activeAdmins(connection, lock = true)
                val username =
                    connection.prepareStatement("SELECT username FROM app_user WHERE user_id = ? FOR UPDATE").use {
                        it.setObject(1, userId)
                        it.executeQuery().use { rows -> if (rows.next()) rows.getString(1) else null }
                    }
                val result =
                    when {
                        username == null -> AdminChange.NotFound
                        losesAdmin && admins == listOf(userId) ->
                            AdminChange.Refused(
                                "LAST_ADMIN",
                                "$username is the only active administrator. Make somebody else one first.",
                            )
                        else -> {
                            change(connection)
                            AdminChange.Done(username)
                        }
                    }
                connection.commit()
                result
            } catch (e: java.sql.SQLException) {
                connection.rollback()
                throw e
            }
        }

    private fun activeAdmins(
        connection: Connection,
        lock: Boolean,
    ): List<UUID> =
        connection.prepareStatement(
            "SELECT user_id FROM app_user WHERE role = 'ADMIN' AND status = 'ACTIVE' ORDER BY user_id" +
                if (lock) " FOR UPDATE" else "",
        ).use { statement ->
            statement.executeQuery().use { rows ->
                buildList { while (rows.next()) add(rows.getObject(1, UUID::class.java)) }
            }
        }
}
