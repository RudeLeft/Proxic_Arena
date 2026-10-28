package net.barnflix.proxic.auth

import java.security.MessageDigest
import java.security.SecureRandom
import java.sql.Connection
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.Locale
import java.util.UUID
import javax.sql.DataSource

// Accounts and sessions — PHASE_03 §3.2–§3.37.
//
// Everything that touches a password hash or a session token lives
// here, so there is one place to read when asking "can this leak?".

enum class Role { PLAYER, ADMIN }

enum class AccountStatus { ACTIVE, DISABLED }

data class User(
    val userId: UUID,
    val username: String,
    val displayName: String,
    val role: Role,
    val status: AccountStatus,
)

/** The authenticated caller (§3.38). */
data class Principal(
    val user: User,
    val sessionId: UUID,
)

object Usernames {
    /**
     * §3.5 — the canonical form uniqueness and login compare against.
     *
     * `Locale.ROOT` deliberately: Turkish locales lower-case `I` to
     * a dotless `ı`, so a server configured with a Turkish locale
     * would normalise "RUDELEFT" differently from this one. A
     * username that depends on the server's locale is a username
     * that stops working when the host changes.
     */
    fun normalize(username: String): String = username.trim().lowercase(Locale.ROOT)

    /** §3.4 — length and shape only. */
    fun rejectionReason(username: String): String? {
        val trimmed = username.trim()
        return when {
            trimmed.length < 3 -> "A username must be at least 3 characters."
            trimmed.length > 32 -> "A username may be at most 32 characters."
            !trimmed.matches(Regex("[A-Za-z0-9._-]+")) ->
                "A username may contain only letters, digits, dot, underscore and hyphen."

            else -> null
        }
    }
}

object SessionPolicy {
    /** §3.27 — idle and absolute, both enforced. */
    val IDLE = Duration.ofDays(7)
    val ABSOLUTE = Duration.ofDays(30)

    /** §3.20 — 256 bits from a CSPRNG. */
    const val TOKEN_BYTES = 32
}

/**
 * Session tokens.
 *
 * The browser holds the token; the database holds only its SHA-256
 * (§3.21). A database dump must not hand over live sessions.
 *
 * SHA-256 and not Argon2: this is a 256-bit random value, not a
 * password. There is nothing to brute-force, and a session lookup
 * happens on every request — a 100 ms KDF per request would be a
 * self-inflicted denial of service.
 */
object SessionTokens {
    private val random = SecureRandom()
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    fun generate(): String = encoder.encodeToString(ByteArray(SessionPolicy.TOKEN_BYTES).also(random::nextBytes))

    fun hash(token: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(token.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}

sealed interface LoginResult {
    data class Success(val principal: Principal, val token: String) : LoginResult

    /**
     * §3.42, §3.43, §3.44 — ONE failure for every reason.
     *
     * Unknown username, wrong password and disabled account are
     * indistinguishable to the caller. Distinguishing them is a
     * username-enumeration oracle, and "that account is disabled"
     * tells an attacker the name is real.
     */
    data object Failed : LoginResult

    /** §3.46 — throttled, not locked (§3.47). */
    data class TooManyAttempts(val retryAfterSeconds: Long) : LoginResult
}

class Accounts(
    private val dataSource: DataSource,
    private val sessions: Sessions = Sessions(dataSource),
) {
    // §3.94 — the account-changing events live HERE rather than at
    // each caller. These operations have one implementation and
    // several callers (the admin CLI, the account page, and
    // whatever Phase 6 adds), and an event attached to callers is
    // an event some caller forgets. Seven defects this phase were
    // that exact shape.
    private val log: org.slf4j.Logger = org.slf4j.LoggerFactory.getLogger(Accounts::class.java)

    /**
     * A hash to verify against when the username does not exist.
     *
     * §3.44: a login for an unknown user must take comparable time
     * to one for a known user. Without this, "wrong password" takes
     * ~100 ms and "no such user" returns instantly, and the
     * difference is measurable over a few hundred attempts — which
     * turns a generic error message into a username oracle anyway.
     */
    private val dummyHash: String by lazy {
        PasswordHasher.hash("a password nobody has, for timing only")
    }

    fun createUser(
        username: String,
        password: String,
        role: Role,
        displayName: String = username.trim(),
    ): User {
        Usernames.rejectionReason(username)?.let { throw IllegalArgumentException(it) }
        PasswordHasher.rejectionReason(password)?.let { throw IllegalArgumentException(it) }

        val user =
            User(
                userId = UUID.randomUUID(),
                username = username.trim(),
                displayName = displayName.ifBlank { username.trim() },
                role = role,
                status = AccountStatus.ACTIVE,
            )
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "INSERT INTO app_user (user_id, username, username_normalized, display_name, " +
                    "password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ).use { statement ->
                statement.setObject(1, user.userId)
                statement.setString(2, user.username)
                statement.setString(3, Usernames.normalize(username))
                statement.setString(4, user.displayName)
                statement.setString(5, PasswordHasher.hash(password))
                statement.setString(6, user.role.name)
                statement.setString(7, user.status.name)
                statement.executeUpdate()
            }
        }
        log.authEvent(
            AuthEvent.USER_CREATED,
            AuthResult.SUCCESS,
            username = user.username,
            userId = user.userId,
            detail = "role=${user.role}",
        )
        return user
    }

    /**
     * Verify a password and open a session.
     *
     * The returned token is the ONLY time it exists outside the
     * browser; the database stores its hash.
     */
    fun login(
        username: String,
        password: String,
    ): LoginResult {
        val normalized = Usernames.normalize(username)

        dataSource.connection.use { connection ->
            val row = findForLogin(connection, normalized)

            // §3.44 — do the same work either way. The result is
            // discarded; the TIME is the point.
            val storedHash = row?.passwordHash ?: dummyHash
            val passwordMatches = PasswordHasher.verify(password, storedHash)

            if (row == null || !passwordMatches) return LoginResult.Failed
            // §3.108 — a disabled account fails exactly like a wrong
            // password. Saying "disabled" confirms the name exists.
            if (row.user.status != AccountStatus.ACTIVE) return LoginResult.Failed

            // §3.105 — the only moment the plaintext is available.
            if (PasswordHasher.needsRehash(storedHash)) {
                updatePasswordHash(connection, row.user.userId, PasswordHasher.hash(password))
            }

            val (sessionId, token) = sessions.open(row.user.userId)
            return LoginResult.Success(Principal(row.user, sessionId), token)
        }
    }

    /**
     * §3.35, §3.36 — change a password and revoke every session.
     *
     * Revoking is the point: a password change is what someone does
     * when they think a session is compromised, and leaving the old
     * sessions alive would make the change cosmetic.
     */
    fun changePassword(
        userId: UUID,
        newPassword: String,
    ) {
        PasswordHasher.rejectionReason(newPassword)?.let { throw IllegalArgumentException(it) }
        dataSource.connection.use { connection ->
            updatePasswordHash(connection, userId, PasswordHasher.hash(newPassword))
            // Spec 0026 — a reset link sent before this change is dead now.
            connection.prepareStatement(
                "UPDATE password_reset SET cancelled_at = now() " +
                    "WHERE user_id = ? AND used_at IS NULL AND cancelled_at IS NULL",
            ).use {
                it.setObject(1, userId)
                it.executeUpdate()
            }
        }
        val revoked = sessions.revokeAllForUser(userId)
        log.authEvent(
            AuthEvent.PASSWORD_CHANGED,
            AuthResult.SUCCESS,
            userId = userId,
            detail = "sessionsRevoked=$revoked",
        )
    }

    fun setStatus(
        userId: UUID,
        status: AccountStatus,
    ) {
        dataSource.connection.use { connection ->
            connection.prepareStatement("UPDATE app_user SET status = ? WHERE user_id = ?")
                .use {
                    it.setString(1, status.name)
                    it.setObject(2, userId)
                    it.executeUpdate()
                }
        }
        // §3.37 — a disabled account's sessions end immediately,
        // not whenever they happen to expire.
        val revoked =
            if (status == AccountStatus.DISABLED) sessions.revokeAllForUser(userId) else 0
        log.authEvent(
            if (status == AccountStatus.DISABLED) AuthEvent.USER_DISABLED else AuthEvent.USER_ENABLED,
            AuthResult.SUCCESS,
            userId = userId,
            detail = "sessionsRevoked=$revoked",
        )
    }

    /** Spec 0014 — invitations make accounts here, and open their first session. */
    fun invites(): Invites = Invites(dataSource, this, sessions)

    fun findByUsername(username: String): User? =
        dataSource.connection.use { connection ->
            findForLogin(connection, Usernames.normalize(username))?.user
        }

    fun updateDisplayName(
        userId: UUID,
        displayName: String,
    ) {
        dataSource.connection.use { connection ->
            connection.prepareStatement("UPDATE app_user SET display_name = ? WHERE user_id = ?")
                .use {
                    it.setString(1, displayName.trim())
                    it.setObject(2, userId)
                    it.executeUpdate()
                }
        }
    }

    /** Spec 0006 — one of the owner's 132 avatars ("avatar-07"), or null for the default. */
    fun updateAvatar(
        userId: UUID,
        avatar: String?,
    ) {
        dataSource.connection.use { connection ->
            connection.prepareStatement("UPDATE app_user SET avatar = ? WHERE user_id = ?").use {
                it.setString(1, avatar)
                it.setObject(2, userId)
                it.executeUpdate()
            }
        }
    }

    private data class LoginRow(val user: User, val passwordHash: String)

    private fun findForLogin(
        connection: Connection,
        normalized: String,
    ): LoginRow? =
        connection.prepareStatement(
            "SELECT user_id, username, display_name, role, status, password_hash " +
                "FROM app_user WHERE username_normalized = ?",
        ).use { statement ->
            statement.setString(1, normalized)
            statement.executeQuery().use { rows ->
                if (!rows.next()) return null
                LoginRow(
                    user =
                        User(
                            userId = rows.getObject(1, UUID::class.java),
                            username = rows.getString(2),
                            displayName = rows.getString(3),
                            role = Role.valueOf(rows.getString(4)),
                            status = AccountStatus.valueOf(rows.getString(5)),
                        ),
                    passwordHash = rows.getString(6),
                )
            }
        }

    private fun updatePasswordHash(
        connection: Connection,
        userId: UUID,
        hash: String,
    ) {
        connection.prepareStatement(
            "UPDATE app_user SET password_hash = ?, password_changed_at = now() WHERE user_id = ?",
        ).use {
            it.setString(1, hash)
            it.setObject(2, userId)
            it.executeUpdate()
        }
    }
}

/**
 * Session lifecycle — PHASE_03 §3.25–§3.37.
 *
 * Separated from [Accounts] because detekt was right that one class
 * was doing two jobs: who someone IS, and whether a particular
 * browser is still allowed to act as them. They change for
 * different reasons.
 */
class Sessions(private val dataSource: DataSource) {
    /**
     * Resolve a token to its principal, or null.
     *
     * Enforces revocation, absolute expiry and idle expiry, and
     * refreshes `last_active_at` (§3.30). Every check is in SQL so
     * an expired session cannot be used by a caller that forgot to
     * look.
     */
    fun authenticate(token: String): Principal? {
        val tokenHash = SessionTokens.hash(token)
        dataSource.connection.use { connection ->
            val sql =
                """
                SELECT s.session_id, u.user_id, u.username, u.display_name, u.role, u.status
                FROM user_session s
                JOIN app_user u ON u.user_id = s.user_id
                WHERE s.token_sha256 = ?
                  AND s.revoked_at IS NULL
                  AND s.expires_at > now()
                  AND s.last_active_at > now() - ?::interval
                  AND u.status = 'ACTIVE'
                """.trimIndent()
            val principal =
                connection.prepareStatement(sql).use { statement ->
                    statement.setString(1, tokenHash)
                    statement.setString(2, "${SessionPolicy.IDLE.toDays()} days")
                    statement.executeQuery().use { rows ->
                        if (!rows.next()) return null
                        Principal(
                            user =
                                User(
                                    userId = rows.getObject(2, UUID::class.java),
                                    username = rows.getString(3),
                                    displayName = rows.getString(4),
                                    role = Role.valueOf(rows.getString(5)),
                                    status = AccountStatus.valueOf(rows.getString(6)),
                                ),
                            sessionId = rows.getObject(1, UUID::class.java),
                        )
                    }
                }

            connection.prepareStatement(
                "UPDATE user_session SET last_active_at = now() WHERE session_id = ?",
            ).use {
                it.setObject(1, principal.sessionId)
                it.executeUpdate()
            }

            return principal
        }
    }

    /** §3.33 — this session only. */
    fun revokeSession(sessionId: UUID) {
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "UPDATE user_session SET revoked_at = now() " +
                    "WHERE session_id = ? AND revoked_at IS NULL",
            ).use {
                it.setObject(1, sessionId)
                it.executeUpdate()
            }
        }
    }

    /**
     * §3.34, §3.36, §3.37 — every session this user holds.
     *
     * Spec 0021: and every computer they linked. Signing out everywhere,
     * an administrator's sign-out, a disabled account and a new password
     * all come through here, and each must end a device token as surely
     * as a session. Returns the sessions ended, as before.
     */
    fun revokeAllForUser(userId: UUID): Int =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "UPDATE device_link SET revoked_at = now() " +
                    "WHERE user_id = ? AND revoked_at IS NULL",
            ).use {
                it.setObject(1, userId)
                it.executeUpdate()
            }
            connection.prepareStatement(
                "UPDATE user_session SET revoked_at = now() " +
                    "WHERE user_id = ? AND revoked_at IS NULL",
            ).use {
                it.setObject(1, userId)
                it.executeUpdate()
            }
        }

    /** §3.90 — sessions that can never be used again. */
    fun purgeExpiredSessions(): Int =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "DELETE FROM user_session WHERE expires_at < now() - interval '30 days'",
            ).use { it.executeUpdate() }
        }

    /** Open a session and return the token. Called only by [Accounts.login]. */
    internal fun open(userId: UUID): Pair<UUID, String> {
        val token = SessionTokens.generate()
        val sessionId = UUID.randomUUID()
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "INSERT INTO user_session (session_id, user_id, token_sha256, expires_at) " +
                    "VALUES (?, ?, ?, ?)",
            ).use { statement ->
                statement.setObject(1, sessionId)
                statement.setObject(2, userId)
                statement.setString(3, SessionTokens.hash(token))
                statement.setTimestamp(
                    4,
                    Timestamp.from(Instant.now().plus(SessionPolicy.ABSOLUTE)),
                )
                statement.executeUpdate()
            }
        }
        return sessionId to token
    }
}
