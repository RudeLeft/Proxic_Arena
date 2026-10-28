package net.barnflix.proxic.auth

import kotlinx.serialization.Serializable
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.Locale
import java.util.UUID
import javax.sql.DataSource

// Accounts by invitation — spec 0014 (owner 2026-10-25).
//
// "No self-registration" became "by invitation only": an administrator
// invites an email address, and the person behind it chooses their own
// username and password. The link's code is 256 random bits; only its
// SHA-256 is kept (§3.21, as with session tokens). A link works once,
// for 48 hours, and is dead the moment it is used, cancelled or replaced.
// Every way a link can fail answers the same "no longer valid", so a
// guesser learns nothing.

/** One invitation, as the Admin page lists it. */
@Serializable
data class InviteView(
    val inviteId: String,
    val email: String,
    val role: String,
    val invitedBy: String,
    val createdAt: String,
    val expiresAt: String,
    /** WAITING, JOINED, CANCELLED or EXPIRED. */
    val state: String,
    /** The account it made, when JOINED. */
    val joinedAs: String? = null,
)

/** What the sign-up page may show about a live link. */
data class InvitePeek(val email: String, val invitedBy: String, val suggestedUsername: String)

/** A new invitation, and the one-time link code only its creator is ever shown. */
data class NewInvite(val inviteId: UUID, val email: String, val token: String, val expiresAt: Instant)

sealed interface JoinResult {
    data class Joined(val user: User, val sessionId: UUID, val token: String) : JoinResult

    /** Used, cancelled, replaced, expired or never real: all the same. */
    data object Invalid : JoinResult

    data class Refused(val code: String, val detail: String) : JoinResult
}

class Invites(
    private val dataSource: DataSource,
    private val accounts: Accounts,
    private val sessions: Sessions,
    private val clock: () -> Instant = Instant::now,
) {
    /** A new invitation for [email], or null when the address is not one. */
    fun create(
        email: String,
        role: Role,
        invitedBy: UUID,
    ): NewInvite? {
        val address = Emails.normalize(email) ?: return null
        val token = SessionTokens.generate()
        val inviteId = UUID.randomUUID()
        val expiresAt = clock().plus(LIFETIME)
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "INSERT INTO account_invite (invite_id, token_hash, email, role, invited_by, created_at, expires_at) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
            ).use {
                it.setObject(1, inviteId)
                it.setString(2, SessionTokens.hash(token))
                it.setString(3, address)
                it.setString(4, role.name)
                it.setObject(5, invitedBy)
                it.setTimestamp(6, Timestamp.from(clock()))
                it.setTimestamp(7, Timestamp.from(expiresAt))
                it.executeUpdate()
            }
        }
        return NewInvite(inviteId, address, token, expiresAt)
    }

    /** Ends a waiting invitation. False when it had already ended. */
    fun cancel(inviteId: UUID): Boolean =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "UPDATE account_invite SET cancelled_at = ? " +
                    "WHERE invite_id = ? AND used_at IS NULL AND cancelled_at IS NULL",
            ).use {
                it.setTimestamp(1, Timestamp.from(clock()))
                it.setObject(2, inviteId)
                it.executeUpdate() == 1
            }
        }

    /** A fresh link for the same address and role; the old one dies. Null when there is none to resend. */
    fun resend(
        inviteId: UUID,
        by: UUID,
    ): NewInvite? {
        val old = find(inviteId) ?: return null
        if (old.state == "JOINED") return null
        cancel(inviteId)
        return create(old.email, Role.valueOf(old.role), by)
    }

    /** The latest invitations, newest first (the Admin page). */
    fun recent(): List<InviteView> = views("ORDER BY i.created_at DESC LIMIT $RECENT") {}

    private fun find(inviteId: UUID): InviteView? {
        val found = views("WHERE i.invite_id = ?") { it.setObject(1, inviteId) }
        return found.firstOrNull()
    }

    private fun views(
        tail: String,
        bind: (java.sql.PreparedStatement) -> Unit,
    ): List<InviteView> =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT i.invite_id, i.email, i.role, b.display_name, i.created_at, i.expires_at,
                       i.used_at, i.cancelled_at, u.display_name
                  FROM account_invite i
                  JOIN app_user b ON b.user_id = i.invited_by
                  LEFT JOIN app_user u ON u.user_id = i.used_by
                 $tail
                """.trimIndent(),
            ).use { statement ->
                bind(statement)
                statement.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) {
                            val expires = rows.getTimestamp(6).toInstant()
                            val state =
                                when {
                                    rows.getTimestamp(7) != null -> "JOINED"
                                    rows.getTimestamp(8) != null -> "CANCELLED"
                                    !expires.isAfter(clock()) -> "EXPIRED"
                                    else -> "WAITING"
                                }
                            add(
                                InviteView(
                                    inviteId = rows.getString(1),
                                    email = rows.getString(2),
                                    role = rows.getString(3),
                                    invitedBy = rows.getString(4),
                                    createdAt = rows.getTimestamp(5).toInstant().toString(),
                                    expiresAt = expires.toString(),
                                    state = state,
                                    joinedAs = rows.getString(9),
                                ),
                            )
                        }
                    }
                }
            }
        }

    /** What the sign-up page shows for a live link; null for every other link. */
    fun peek(token: String): InvitePeek? =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT i.email, b.display_name
                  FROM account_invite i
                  JOIN app_user b ON b.user_id = i.invited_by
                 WHERE i.token_hash = ? AND i.used_at IS NULL AND i.cancelled_at IS NULL AND i.expires_at > ?
                """.trimIndent(),
            ).use {
                it.setString(1, SessionTokens.hash(token))
                it.setTimestamp(2, Timestamp.from(clock()))
                it.executeQuery().use { rows ->
                    if (!rows.next()) return null
                    val email = rows.getString(1)
                    InvitePeek(email, rows.getString(2), suggestedUsername(email))
                }
            }
        }

    /**
     * Makes the account and spends the link, or refuses with the reason
     * the person can fix (a taken username, a short password). The link is
     * claimed in one statement, so two tabs racing for it cannot both win;
     * a refusal after the claim gives it back.
     */
    fun join(
        token: String,
        username: String,
        displayName: String,
        password: String,
    ): JoinResult {
        Usernames.rejectionReason(username)?.let { return JoinResult.Refused("INVALID_USERNAME", it) }
        PasswordHasher.rejectionReason(password)?.let { return JoinResult.Refused("WEAK_PASSWORD", it) }
        if (accounts.findByUsername(username) != null) {
            return JoinResult.Refused("USERNAME_TAKEN", "That username is taken. Try another.")
        }
        val claimed = claim(token) ?: return JoinResult.Invalid
        val user =
            try {
                accounts.createUser(username, password, claimed.second, displayName.trim().take(MAX_NAME))
            } catch (e: IllegalArgumentException) {
                release(claimed.first)
                return JoinResult.Refused("INVALID_ACCOUNT", e.message ?: "That account cannot be created.")
            } catch (e: java.sql.SQLException) {
                // The unique username, taken between the check and the insert.
                release(claimed.first)
                return JoinResult.Refused("USERNAME_TAKEN", "That username is taken. Try another.")
            }
        dataSource.connection.use { connection ->
            connection.prepareStatement("UPDATE account_invite SET used_by = ? WHERE invite_id = ?").use {
                it.setObject(1, user.userId)
                it.setObject(2, claimed.first)
                it.executeUpdate()
            }
            // Spec 0026 — the invitation's address is where a password reset goes.
            connection.prepareStatement(
                "UPDATE app_user SET email = (SELECT email FROM account_invite WHERE invite_id = ?) WHERE user_id = ?",
            ).use {
                it.setObject(1, claimed.first)
                it.setObject(2, user.userId)
                it.executeUpdate()
            }
        }
        val (sessionId, sessionToken) = sessions.open(user.userId)
        return JoinResult.Joined(user, sessionId, sessionToken)
    }

    private fun claim(token: String): Pair<UUID, Role>? =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "UPDATE account_invite SET used_at = ? " +
                    "WHERE token_hash = ? AND used_at IS NULL AND cancelled_at IS NULL AND expires_at > ? " +
                    "RETURNING invite_id, role",
            ).use {
                it.setTimestamp(1, Timestamp.from(clock()))
                it.setString(2, SessionTokens.hash(token))
                it.setTimestamp(3, Timestamp.from(clock()))
                it.executeQuery().use { rows ->
                    if (rows.next()) rows.getObject(1, UUID::class.java) to Role.valueOf(rows.getString(2)) else null
                }
            }
        }

    private fun release(inviteId: UUID) {
        dataSource.connection.use { connection ->
            connection.prepareStatement("UPDATE account_invite SET used_at = NULL WHERE invite_id = ?").use {
                it.setObject(1, inviteId)
                it.executeUpdate()
            }
        }
    }

    companion object {
        /** G2 — how long a link works. */
        val LIFETIME: Duration = Duration.ofHours(48)
        private const val RECENT = 50
        private const val MAX_NAME = 40
        private const val MIN_USERNAME = 3
        private const val MAX_USERNAME = 32

        /** "sam.o'neil+x@example.com" -> "sam.oneilx": the part before @, as a username may be. */
        fun suggestedUsername(email: String): String {
            val local = email.substringBefore('@').filter { it.isLetterOrDigit() || it in "._-" }
            val ascii = local.filter { it.code < 128 }.take(MAX_USERNAME)
            return if (ascii.length >= MIN_USERNAME) ascii else ""
        }
    }
}

/** Email addresses: checked for shape, compared in lower case. */
object Emails {
    private val SHAPE = Regex("^[^@\\s]{1,64}@[^@\\s.]+(\\.[^@\\s.]+)+$")
    private const val MAX = 254

    fun normalize(email: String): String? {
        val trimmed = email.trim().lowercase(Locale.ROOT)
        return trimmed.takeIf { it.length <= MAX && SHAPE.matches(it) }
    }
}
