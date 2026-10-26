package net.barnflix.proxic.auth

import kotlinx.serialization.Serializable
import java.nio.ByteBuffer
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import javax.sql.DataSource

// The email account, set on the Admin page — spec 0014 amendment 1
// (owner 2026-10-25).
//
// The Email tab's settings win over the server's settings file
// (PROXIC_SMTP_*), which stays as a fallback. The password goes one way:
// it is sealed with AES-256-GCM under a key derived from the server's
// session secret, stored sealed, opened only to send, and never returned
// to a page or written to a log.

/** What the Email tab shows: everything but the password, which is only "saved" or not. */
@Serializable
data class MailSettingsView(
    val host: String = "",
    val port: Int = DEFAULT_PORT,
    val security: String = "starttls",
    val username: String = "",
    val from: String = "",
    val passwordSaved: Boolean = false,
    /** ADMIN (the Email tab), SERVER (the settings file) or NONE. */
    val source: String = "NONE",
    val updatedAt: String? = null,
)

/** What the Email tab saves. A null [password] keeps the saved one; "" removes it. */
@Serializable
data class MailSettingsInput(
    val host: String = "",
    val port: Int = DEFAULT_PORT,
    val security: String = "starttls",
    val username: String = "",
    val from: String = "",
    val password: String? = null,
)

private const val DEFAULT_PORT = 587

/** AES-256-GCM, keyed from the server's secret. A sealed value is nonce + ciphertext. */
class SecretBox(secret: String) {
    private val key = SecretKeySpec(derive(secret), "AES")
    private val random = SecureRandom()

    fun seal(plain: String): ByteArray {
        val nonce = ByteArray(NONCE_BYTES).also(random::nextBytes)
        val cipher = Cipher.getInstance(ALGORITHM)
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, nonce))
        val sealed = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return ByteBuffer.allocate(nonce.size + sealed.size).put(nonce).put(sealed).array()
    }

    /** Null when it cannot be opened: the server's secret changed since it was saved. */
    fun open(sealed: ByteArray): String? =
        runCatching {
            val nonce = sealed.copyOfRange(0, NONCE_BYTES)
            val cipher = Cipher.getInstance(ALGORITHM)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, nonce))
            String(cipher.doFinal(sealed, NONCE_BYTES, sealed.size - NONCE_BYTES), Charsets.UTF_8)
        }.getOrNull()

    private companion object {
        const val ALGORITHM = "AES/GCM/NoPadding"
        const val NONCE_BYTES = 12
        const val TAG_BITS = 128

        /** A key for this one purpose, never the secret itself. */
        fun derive(secret: String): ByteArray =
            Mac.getInstance("HmacSHA256").run {
                init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
                doFinal("proxic mail settings v1".toByteArray(Charsets.UTF_8))
            }
    }
}

sealed interface MailSave {
    data object Saved : MailSave

    data class Refused(val detail: String) : MailSave
}

/** The Email tab's settings, and which settings the mailer uses now. */
class MailSettings(
    private val dataSource: DataSource,
    /** The server's session secret; without one no password can be sealed. */
    secret: String?,
    /** The settings file's PROXIC_SMTP_*, the fallback. */
    private val fallback: MailConfig,
) {
    private val box = secret?.takeIf { it.isNotBlank() }?.let(::SecretBox)

    /** The settings the mailer uses now: the Email tab's, else the settings file's. */
    fun current(): MailConfig = stored()?.first ?: fallback

    fun view(): MailSettingsView {
        stored()?.let { (config, updatedAt) ->
            return MailSettingsView(
                host = config.host.orEmpty(),
                port = config.port,
                security = config.security,
                username = config.username.orEmpty(),
                from = config.from.orEmpty(),
                passwordSaved = config.password() != null,
                source = "ADMIN",
                updatedAt = updatedAt,
            )
        }
        if (!fallback.configured) return MailSettingsView()
        return MailSettingsView(
            host = fallback.host.orEmpty(),
            port = fallback.port,
            security = fallback.security,
            username = fallback.username.orEmpty(),
            from = fallback.from.orEmpty(),
            passwordSaved = fallback.password() != null,
            source = "SERVER",
        )
    }

    fun save(
        input: MailSettingsInput,
        by: UUID,
    ): MailSave {
        problem(input)?.let { return MailSave.Refused(it) }
        val sealed: ByteArray? =
            when {
                input.password == null -> storedSealed()
                input.password.isEmpty() -> null
                else -> box?.seal(input.password) ?: return MailSave.Refused(NO_SECRET)
            }
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                INSERT INTO mail_settings (id, host, port, security, username, from_address, password_sealed, updated_at, updated_by)
                VALUES (1, ?, ?, ?, ?, ?, ?, now(), ?)
                ON CONFLICT (id) DO UPDATE SET host = EXCLUDED.host, port = EXCLUDED.port,
                    security = EXCLUDED.security, username = EXCLUDED.username,
                    from_address = EXCLUDED.from_address, password_sealed = EXCLUDED.password_sealed,
                    updated_at = now(), updated_by = EXCLUDED.updated_by
                """.trimIndent(),
            ).use {
                it.setString(1, input.host.trim())
                it.setInt(2, input.port)
                it.setString(3, input.security)
                it.setString(4, input.username.trim().ifEmpty { null })
                it.setString(5, input.from.trim())
                it.setBytes(6, sealed)
                it.setObject(7, by)
                it.executeUpdate()
            }
        }
        return MailSave.Saved
    }

    /** Back to the settings file (or to no email at all). */
    fun clear() {
        dataSource.connection.use { connection ->
            connection.createStatement().use { it.executeUpdate("DELETE FROM mail_settings") }
        }
    }

    private fun problem(input: MailSettingsInput): String? =
        when {
            input.host.isBlank() -> "Enter the email server's address, e.g. smtp.gmail.com."
            input.port !in 1..MAX_PORT -> "The port is a number from 1 to 65535 (usually 587)."
            input.security !in setOf("starttls", "ssl") -> "Choose STARTTLS (port 587) or SSL (port 465)."
            input.from.isBlank() -> "Enter who the email comes from, e.g. Proxic Arena <you@gmail.com>."
            runCatching { jakarta.mail.internet.InternetAddress(input.from.trim(), true) }.isFailure ->
                "\"From\" must be an email address, e.g. Proxic Arena <you@gmail.com>."
            else -> null
        }

    private fun storedSealed(): ByteArray? =
        dataSource.connection.use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery("SELECT password_sealed FROM mail_settings WHERE id = 1").use { rows ->
                    if (rows.next()) rows.getBytes(1) else null
                }
            }
        }

    private fun stored(): Pair<MailConfig, String>? =
        dataSource.connection.use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery(
                    "SELECT host, port, security, username, from_address, password_sealed, updated_at " +
                        "FROM mail_settings WHERE id = 1",
                ).use { rows ->
                    if (!rows.next()) return null
                    val password = rows.getBytes(6)?.let { sealed -> box?.open(sealed) }
                    MailConfig(
                        host = rows.getString(1),
                        port = rows.getInt(2),
                        username = rows.getString(4),
                        password = password,
                        from = rows.getString(5),
                        security = rows.getString(3),
                    ) to rows.getTimestamp(7).toInstant().toString()
                }
            }
        }

    private companion object {
        const val MAX_PORT = 65535
        const val NO_SECRET = "This server has no PROXIC_SESSION_SECRET, so it cannot store a password safely."
    }
}
