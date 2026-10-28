package net.barnflix.proxic.auth

import java.security.SecureRandom
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

// A computer linked to an account — spec 0021 (owner 2026-10-27).
//
// The Deck Builder is not a browser: it cannot hold a session cookie or
// answer a CSRF check, and it must never be given the player's password.
// So the player makes a one-time code on the Account page (signed in, in
// the browser), types it into the Deck Builder, and the Deck Builder
// trades it for a device token. That token may download the deck rules
// and nothing else (DeckRulesRoutes is its only reader).
//
// Codes and tokens are kept only as SHA-256s, as session tokens are
// (§3.21). A token is 256 random bits, so a fast hash is enough; a code
// is short enough to type, so it lives ten minutes, works once, and the
// route that takes it is throttled like sign-in.

object DevicePolicy {
    val CODE_LIFETIME: Duration = Duration.ofMinutes(10)

    /** Eight characters, shown as two groups of four. */
    const val CODE_LENGTH = 8

    /** No 0/O, 1/I/L: a code is read off one screen and typed on another. */
    const val CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

    /** A computer's name, as the player typed it in the Deck Builder. */
    const val MAX_NAME = 64
}

/** A fresh code, shown once on the Account page. */
data class DeviceCode(val code: String, val expiresAt: Instant)

/** A linked computer, as its owner sees it in the list. */
data class LinkedDevice(
    val deviceId: UUID,
    val name: String,
    val createdAt: Instant,
    val lastUsedAt: Instant?,
)

/** A code traded for a token: the token is shown to the Deck Builder once. */
data class NewDeviceLink(val user: User, val token: String)

class DeviceLinks(
    private val dataSource: DataSource,
    private val clock: () -> Instant = Instant::now,
) {
    private val random = SecureRandom()

    /** Make a code for [userId], replacing any unused one they had. */
    fun makeCode(userId: UUID): DeviceCode {
        val code =
            buildString {
                repeat(DevicePolicy.CODE_LENGTH) {
                    append(DevicePolicy.CODE_ALPHABET[random.nextInt(DevicePolicy.CODE_ALPHABET.length)])
                }
            }
        val expiresAt = clock().plus(DevicePolicy.CODE_LIFETIME)
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                connection.prepareStatement(
                    "DELETE FROM device_code WHERE user_id = ? AND used_at IS NULL",
                ).use {
                    it.setObject(1, userId)
                    it.executeUpdate()
                }
                connection.prepareStatement(
                    "INSERT INTO device_code (code_hash, user_id, expires_at) VALUES (?, ?, ?)",
                ).use {
                    it.setString(1, SessionTokens.hash(code))
                    it.setObject(2, userId)
                    it.setTimestamp(3, Timestamp.from(expiresAt))
                    it.executeUpdate()
                }
                connection.commit()
            } catch (e: java.sql.SQLException) {
                connection.rollback()
                throw e
            } finally {
                connection.autoCommit = true
            }
        }
        return DeviceCode("${code.take(4)}-${code.drop(4)}", expiresAt)
    }

    /**
     * Trade a code for a token, or null for every kind of failure.
     *
     * Wrong, expired, already used, or the account disabled: one answer,
     * so a guesser learns nothing. Claiming the code is one statement, so
     * two computers cannot both use it.
     */
    fun link(
        typed: String,
        deviceName: String,
    ): NewDeviceLink? {
        val code = normalize(typed) ?: return null
        val name = deviceName.trim().take(DevicePolicy.MAX_NAME).ifBlank { "Deck Builder" }
        dataSource.connection.use { connection ->
            val userId =
                connection.prepareStatement(
                    "UPDATE device_code SET used_at = now() " +
                        "WHERE code_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id",
                ).use {
                    it.setString(1, SessionTokens.hash(code))
                    it.setTimestamp(2, Timestamp.from(clock()))
                    it.executeQuery().use { rows -> if (rows.next()) rows.getObject(1, UUID::class.java) else null }
                } ?: return null
            val user = activeUser(connection, userId) ?: return null
            val token = SessionTokens.generate()
            connection.prepareStatement(
                "INSERT INTO device_link (device_id, user_id, name, token_hash) VALUES (?, ?, ?, ?)",
            ).use {
                it.setObject(1, UUID.randomUUID())
                it.setObject(2, userId)
                it.setString(3, name)
                it.setString(4, SessionTokens.hash(token))
                it.executeUpdate()
            }
            return NewDeviceLink(user, token)
        }
    }

    /**
     * The account behind a device token, or null; notes when it was last
     * used, and [from] where (spec 0027, the Admin page's Computers tab).
     */
    fun authenticate(
        token: String,
        from: String? = null,
    ): User? {
        if (token.isBlank()) return null
        dataSource.connection.use { connection ->
            val found =
                connection.prepareStatement(
                    "SELECT d.device_id, d.user_id FROM device_link d " +
                        "JOIN app_user u ON u.user_id = d.user_id " +
                        "WHERE d.token_hash = ? AND d.revoked_at IS NULL AND u.status = 'ACTIVE'",
                ).use {
                    it.setString(1, SessionTokens.hash(token))
                    it.executeQuery().use { rows ->
                        if (rows.next()) {
                            rows.getObject(1, UUID::class.java) to rows.getObject(2, UUID::class.java)
                        } else {
                            null
                        }
                    }
                } ?: return null
            connection.prepareStatement(
                "UPDATE device_link SET last_used_at = now(), last_used_from = ? WHERE device_id = ?",
            ).use {
                it.setString(1, from)
                it.setObject(2, found.first)
                it.executeUpdate()
            }
            return activeUser(connection, found.second)
        }
    }

    /** The player's own linked computers, newest first. */
    fun list(userId: UUID): List<LinkedDevice> =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "SELECT device_id, name, created_at, last_used_at FROM device_link " +
                    "WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC",
            ).use {
                it.setObject(1, userId)
                it.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) {
                            add(
                                LinkedDevice(
                                    deviceId = rows.getObject(1, UUID::class.java),
                                    name = rows.getString(2),
                                    createdAt = rows.getTimestamp(3).toInstant(),
                                    lastUsedAt = rows.getTimestamp(4)?.toInstant(),
                                ),
                            )
                        }
                    }
                }
            }
        }

    /** Remove one of the player's own computers. False when it is not theirs, or already gone. */
    fun remove(
        userId: UUID,
        deviceId: UUID,
    ): Boolean =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "UPDATE device_link SET revoked_at = now() " +
                    "WHERE device_id = ? AND user_id = ? AND revoked_at IS NULL",
            ).use {
                it.setObject(1, deviceId)
                it.setObject(2, userId)
                it.executeUpdate() == 1
            }
        }

    private fun activeUser(
        connection: java.sql.Connection,
        userId: UUID,
    ): User? =
        connection.prepareStatement(
            "SELECT user_id, username, display_name, role, status FROM app_user " +
                "WHERE user_id = ? AND status = 'ACTIVE'",
        ).use {
            it.setObject(1, userId)
            it.executeQuery().use { rows ->
                if (!rows.next()) return null
                User(
                    userId = rows.getObject(1, UUID::class.java),
                    username = rows.getString(2),
                    displayName = rows.getString(3),
                    role = Role.valueOf(rows.getString(4)),
                    status = AccountStatus.valueOf(rows.getString(5)),
                )
            }
        }

    companion object {
        /** A typed code as stored: upper case, letters and digits only; null when it cannot be one. */
        fun normalize(typed: String): String? {
            val code = typed.uppercase().filter { it.isLetterOrDigit() }
            return code.takeIf {
                it.length == DevicePolicy.CODE_LENGTH && it.all { c -> c in DevicePolicy.CODE_ALPHABET }
            }
        }
    }
}
