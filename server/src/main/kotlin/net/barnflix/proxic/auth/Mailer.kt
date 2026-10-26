package net.barnflix.proxic.auth

import jakarta.mail.Authenticator
import jakarta.mail.Message
import jakarta.mail.PasswordAuthentication
import jakarta.mail.Session
import jakarta.mail.Transport
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeBodyPart
import jakarta.mail.internet.MimeMessage
import jakarta.mail.internet.MimeMultipart
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.Properties

// The invitation email — spec 0014 (owner 2026-10-25).
//
// Any ordinary email account over SMTP (a Gmail app password, or a sending
// service on the owner's domain). Its settings come from the server's
// environment, typed by the owner on Unraid; the password is never logged.
// With none set, nothing is sent and the Admin page offers the link to copy.

/** SMTP settings. `toString` hides the password, as ServerConfig does. */
class MailConfig(
    val host: String?,
    val port: Int,
    val username: String?,
    private val password: String?,
    /** "Proxic Arena <invites@example.com>". */
    val from: String?,
    /** "starttls" (port 587, the default) or "ssl" (port 465). */
    val security: String,
) {
    val configured: Boolean get() = !host.isNullOrBlank() && !from.isNullOrBlank()

    fun password(): String? = password

    override fun toString(): String =
        "MailConfig(host=${host ?: "<unset>"}, port=$port, security=$security, " +
            "username=${username ?: "<unset>"}, password=${if (password.isNullOrBlank()) "<unset>" else "<set>"})"

    companion object {
        private const val STARTTLS_PORT = 587

        fun fromEnvironment(getenv: (String) -> String? = System::getenv): MailConfig =
            MailConfig(
                host = getenv("PROXIC_SMTP_HOST")?.takeIf { it.isNotBlank() },
                port = getenv("PROXIC_SMTP_PORT")?.toIntOrNull() ?: STARTTLS_PORT,
                username = getenv("PROXIC_SMTP_USERNAME")?.takeIf { it.isNotBlank() },
                password = getenv("PROXIC_SMTP_PASSWORD")?.takeIf { it.isNotBlank() },
                from = getenv("PROXIC_SMTP_FROM")?.takeIf { it.isNotBlank() },
                security = getenv("PROXIC_SMTP_SECURITY")?.lowercase(Locale.ROOT) ?: "starttls",
            )
    }
}

/** What became of one email. */
sealed interface Delivery {
    data object Sent : Delivery

    /** No email account is set up. */
    data object NotSetUp : Delivery

    /** Why, in words an administrator can act on; never a password. */
    data class Failed(val why: String) : Delivery
}

/** Sends one email. */
fun interface Mailer {
    fun send(
        to: String,
        subject: String,
        text: String,
        html: String,
    ): Delivery

    companion object {
        /** No email account set up: nothing is sent. */
        val NONE = Mailer { _, _, _, _ -> Delivery.NotSetUp }
    }
}

/** SMTP with whichever settings are current when it sends (the Email tab's, else the settings file's). */
class SmtpMailer(
    private val settings: () -> MailConfig,
    private val log: org.slf4j.Logger,
) : Mailer {
    override fun send(
        to: String,
        subject: String,
        text: String,
        html: String,
    ): Delivery {
        val config = settings()
        if (!config.configured) return Delivery.NotSetUp
        val properties =
            Properties().apply {
                put("mail.smtp.host", config.host)
                put("mail.smtp.port", config.port.toString())
                put("mail.smtp.auth", (config.username != null).toString())
                put("mail.smtp.connectiontimeout", TIMEOUT_MS)
                put("mail.smtp.timeout", TIMEOUT_MS)
                put("mail.smtp.writetimeout", TIMEOUT_MS)
                if (config.security == "ssl") {
                    put("mail.smtp.ssl.enable", "true")
                } else {
                    put("mail.smtp.starttls.enable", "true")
                    put("mail.smtp.starttls.required", "true")
                }
                put("mail.smtp.ssl.checkserveridentity", "true")
            }
        val session =
            Session.getInstance(
                properties,
                object : Authenticator() {
                    override fun getPasswordAuthentication(): PasswordAuthentication =
                        PasswordAuthentication(config.username, config.password())
                },
            )
        return try {
            val message =
                MimeMessage(session).apply {
                    setFrom(InternetAddress(config.from))
                    setRecipients(Message.RecipientType.TO, InternetAddress.parse(to, true))
                    setSubject(subject, "UTF-8")
                    setContent(
                        MimeMultipart("alternative").apply {
                            addBodyPart(MimeBodyPart().apply { setText(text, "UTF-8") })
                            addBodyPart(MimeBodyPart().apply { setContent(html, "text/html; charset=UTF-8") })
                        },
                    )
                }
            Transport.send(message)
            Delivery.Sent
        } catch (e: jakarta.mail.MessagingException) {
            // Why, for whoever runs the server; never the password, never the link.
            log.warn("email to {} not sent: {}", to.substringAfter('@'), e.javaClass.simpleName)
            Delivery.Failed(reasonFor(e))
        }
    }

    private companion object {
        const val TIMEOUT_MS = "15000"

        /** The cause in words, from the kind of failure; the server's own text can echo a username. */
        fun reasonFor(e: jakarta.mail.MessagingException): String {
            val causes = generateSequence<Throwable>(e) { it.cause }.toList()
            return when {
                e is jakarta.mail.AuthenticationFailedException ->
                    "The email server refused the username or password. For Gmail, use an app password."
                causes.any { it is java.net.UnknownHostException } ->
                    "Couldn't find that email server. Check its address."
                causes.any { it is java.net.ConnectException || it is java.net.SocketTimeoutException } ->
                    "Couldn't reach the email server. Check the address, the port and the security choice."
                causes.any { it is javax.net.ssl.SSLException } ->
                    "The secure connection failed. Port 587 goes with STARTTLS, port 465 with SSL."
                e is jakarta.mail.SendFailedException -> "The email server refused that address."
                else -> "The email server refused the message (${e.javaClass.simpleName})."
            }
        }
    }
}

/** The invitation itself, in plain text and simple HTML. */
object InviteEmail {
    private val WHEN = DateTimeFormatter.ofPattern("EEEE d MMMM 'at' HH:mm z", Locale.ENGLISH)

    fun subject(inviter: String): String = "$inviter invited you to Proxic Arena"

    fun text(
        inviter: String,
        link: String,
        expiresAt: Instant,
    ): String =
        """
        You're invited to Proxic Arena.

        $inviter invited you to play Magic on Proxic Arena. Choose a username and password to create your account:

        $link

        This link works once and expires on ${WHEN.format(expiresAt.atZone(ZoneId.of("UTC")))}.
        If you weren't expecting this, ignore it and nothing happens.
        """.trimIndent()

    fun html(
        inviter: String,
        link: String,
        expiresAt: Instant,
    ): String {
        val who = escape(inviter)
        val href = escape(link)
        val until = escape(WHEN.format(expiresAt.atZone(ZoneId.of("UTC"))))
        return """
            <div style="font-family:Segoe UI,Arial,sans-serif;color:#22262c;max-width:520px;line-height:1.55">
              <h1 style="font-size:22px;margin:0 0 12px">You're invited to Proxic Arena</h1>
              <p>$who invited you to play Magic on Proxic Arena. Choose a username and password to create your account.</p>
              <p><a href="$href" style="display:inline-block;padding:12px 22px;background:#c8892f;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:3px">Create my account</a></p>
              <p style="font-size:12px;color:#6a6f77">This link works once and expires on $until. If you weren't expecting this, ignore it and nothing happens.</p>
              <p style="font-size:12px;color:#6a6f77;word-break:break-all">$href</p>
            </div>
            """.trimIndent()
    }

    private fun escape(value: String): String =
        value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
}
