package net.barnflix.proxic.auth

import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

// Password reset by email — spec 0026 (owner 2026-10-28).
//
// An administrator sends a reset; the player gets a link that works once,
// for an hour, and chooses their own password. The administrator never
// sees the link or a password. Only the SHA-256 of the link's code is
// stored, as for sessions and invitations, and it rides after "#", so no
// server or proxy log sees it.
//
// A link ends once, by whichever comes first: using it, a newer reset for
// the same account, or the password changing some other way
// ([Accounts.changePassword] cancels it).

/** What became of "Send password reset". */
sealed interface ResetSend {
    /** [to] is the address with most of it hidden: "p•••@gmail.com". */
    data class Sent(val to: String) : ResetSend

    data object NotFound : ResetSend

    data class Refused(val code: String, val detail: String) : ResetSend
}

/** What became of the link. */
sealed interface ResetResult {
    data class Done(val user: User, val sessionId: UUID, val token: String) : ResetResult

    /** Used, cancelled, expired, disabled or never real: all the same. */
    data object Invalid : ResetResult

    data class Refused(val code: String, val detail: String) : ResetResult
}

class PasswordResets(
    private val dataSource: DataSource,
    private val accounts: Accounts,
    private val sessions: Sessions,
    private val clock: () -> Instant = Instant::now,
) {
    private val addresses = EmailAddresses(dataSource)

    /** How many resets this account was sent since [since]. */
    fun sentSince(
        userId: UUID,
        since: Instant,
    ): Int =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "SELECT count(*) FROM password_reset WHERE user_id = ? AND created_at > ?",
            ).use {
                it.setObject(1, userId)
                it.setTimestamp(2, Timestamp.from(since))
                it.executeQuery().use { rows -> if (rows.next()) rows.getInt(1) else 0 }
            }
        }

    /** A new link for [userId]; any earlier one dies. Returns the code and when it expires. */
    fun create(
        userId: UUID,
        requestedBy: UUID?,
    ): Pair<String, Instant> {
        val token = SessionTokens.generate()
        val now = clock()
        val expiresAt = now.plus(LIFETIME)
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "UPDATE password_reset SET cancelled_at = ? " +
                    "WHERE user_id = ? AND used_at IS NULL AND cancelled_at IS NULL",
            ).use {
                it.setTimestamp(1, Timestamp.from(now))
                it.setObject(2, userId)
                it.executeUpdate()
            }
            connection.prepareStatement(
                "INSERT INTO password_reset (reset_id, user_id, token_hash, requested_by, created_at, expires_at) " +
                    "VALUES (?, ?, ?, ?, ?, ?)",
            ).use {
                it.setObject(1, UUID.randomUUID())
                it.setObject(2, userId)
                it.setString(3, SessionTokens.hash(token))
                it.setObject(4, requestedBy)
                it.setTimestamp(5, Timestamp.from(now))
                it.setTimestamp(6, Timestamp.from(expiresAt))
                it.executeUpdate()
            }
        }
        return token to expiresAt
    }

    /** Forgets a link that was never delivered. */
    fun discard(token: String) {
        dataSource.connection.use { connection ->
            connection.prepareStatement("DELETE FROM password_reset WHERE token_hash = ?").use {
                it.setString(1, SessionTokens.hash(token))
                it.executeUpdate()
            }
        }
    }

    /** The username a live link is for, so the page can show it; null for any link that won't work. */
    fun peek(token: String): String? {
        if (token.isBlank()) return null
        val userId = live(token) ?: return null
        return addresses.user(userId)?.takeIf { it.status == AccountStatus.ACTIVE }?.username
    }

    /**
     * Sets the password and spends the link. The link is claimed in one
     * statement, so two tabs racing for it cannot both win. A weak password
     * is refused before the claim, so the player can try again.
     */
    fun redeem(
        token: String,
        password: String,
    ): ResetResult {
        if (token.isBlank()) return ResetResult.Invalid
        PasswordHasher.rejectionReason(password)?.let { return ResetResult.Refused("WEAK_PASSWORD", it) }
        val userId = claim(token) ?: return ResetResult.Invalid
        val user =
            addresses.user(userId)?.takeIf { it.status == AccountStatus.ACTIVE }
                ?: return ResetResult.Invalid
        // Ends every session (§3.36) and any other reset link.
        accounts.changePassword(userId, password)
        val (sessionId, sessionToken) = sessions.open(userId)
        return ResetResult.Done(user, sessionId, sessionToken)
    }

    private fun live(token: String): UUID? =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "SELECT user_id FROM password_reset " +
                    "WHERE token_hash = ? AND used_at IS NULL AND cancelled_at IS NULL AND expires_at > ?",
            ).use {
                it.setString(1, SessionTokens.hash(token))
                it.setTimestamp(2, Timestamp.from(clock()))
                it.executeQuery().use { rows -> if (rows.next()) rows.getObject(1, UUID::class.java) else null }
            }
        }

    private fun claim(token: String): UUID? =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "UPDATE password_reset SET used_at = ? " +
                    "WHERE token_hash = ? AND used_at IS NULL AND cancelled_at IS NULL AND expires_at > ? " +
                    "RETURNING user_id",
            ).use {
                it.setTimestamp(1, Timestamp.from(clock()))
                it.setString(2, SessionTokens.hash(token))
                it.setTimestamp(3, Timestamp.from(clock()))
                it.executeQuery().use { rows -> if (rows.next()) rows.getObject(1, UUID::class.java) else null }
            }
        }

    companion object {
        /** How long a link works. */
        val LIFETIME: Duration = Duration.ofHours(1)

        /** At most one reset per account in this long… */
        val SPACING: Duration = Duration.ofMinutes(5)

        /** …and this many a day. */
        const val PER_DAY = 5

        /** "pat@gmail.com" -> "p•••@gmail.com": enough to recognise, not enough to collect. */
        fun mask(email: String): String {
            val local = email.substringBefore('@')
            return "${local.take(1)}•••@${email.substringAfter('@')}"
        }
    }
}

/**
 * The emails half of spec 0026: sends the reset link and the notices.
 * Like [InviteDesk], it is what the routes call; [PasswordResets] is the
 * storage.
 */
class ResetDesk(
    val resets: PasswordResets,
    val addresses: EmailAddresses,
    private val mailer: Mailer,
    /** Whether an email account is set up now. */
    private val emailReady: () -> Boolean,
    private val publicOrigin: String,
    private val clock: () -> Instant = Instant::now,
) {
    private val log = org.slf4j.LoggerFactory.getLogger(ResetDesk::class.java)

    /** The code goes after "#": a browser never sends it to the server or to Cloudflare's logs. */
    fun linkFor(token: String): String = "${publicOrigin.trimEnd('/')}/reset#$token"

    /** "Send password reset" on the Admin page. Blocking: call it off the request thread. */
    fun send(
        userId: UUID,
        by: UUID?,
    ): ResetSend {
        val user = addresses.user(userId) ?: return ResetSend.NotFound
        if (user.status != AccountStatus.ACTIVE) {
            return ResetSend.Refused("ACCOUNT_DISABLED", "${user.username} is disabled. Enable the account first.")
        }
        val email =
            addresses.of(userId)
                ?: return ResetSend.Refused("NO_EMAIL", "${user.username} has no email address. Add one first.")
        if (!emailReady()) {
            return ResetSend.Refused("EMAIL_NOT_SET_UP", "No email account is set up. Add one on the Email tab.")
        }
        val now = clock()
        if (resets.sentSince(userId, now.minus(PasswordResets.SPACING)) > 0) {
            return ResetSend.Refused(
                "TOO_SOON",
                "A reset was sent to ${user.username} in the last 5 minutes. " +
                    "Wait a few minutes before sending another.",
            )
        }
        if (resets.sentSince(userId, now.minus(Duration.ofDays(1))) >= PasswordResets.PER_DAY) {
            return ResetSend.Refused(
                "TOO_MANY",
                "${user.username} has been sent ${PasswordResets.PER_DAY} resets today. Try again tomorrow.",
            )
        }
        val (token, expiresAt) = resets.create(userId, by)
        val message = AccountEmails.passwordReset(user.username, linkFor(token), expiresAt, publicOrigin)
        val delivery = mailer.send(email, message.subject, message.text, message.html, message.images)
        // A link nobody received is no use to anyone, and must not count against the limit.
        if (delivery != Delivery.Sent) resets.discard(token)
        return when (delivery) {
            Delivery.Sent -> ResetSend.Sent(PasswordResets.mask(email))
            Delivery.NotSetUp ->
                ResetSend.Refused("EMAIL_NOT_SET_UP", "No email account is set up. Add one on the Email tab.")
            is Delivery.Failed -> ResetSend.Refused("EMAIL_FAILED", "The email didn't go: ${delivery.why}")
        }
    }

    /** After every password change. Best effort: a notice that fails is logged, not shown. */
    fun passwordChanged(user: User) {
        val to = addresses.of(user.userId) ?: return
        notify(to, AccountEmails.passwordChanged(user.username, clock(), publicOrigin))
    }

    /** To the address that was replaced. */
    fun emailChanged(
        user: User,
        oldEmail: String,
    ) {
        notify(oldEmail, AccountEmails.emailChanged(user.username, clock(), publicOrigin))
    }

    private fun notify(
        to: String,
        email: AccountEmail,
    ) {
        val delivery = mailer.send(to, email.subject, email.text, email.html, email.images)
        if (delivery is Delivery.Failed) log.warn("account notice not sent: {}", delivery.why)
    }
}
