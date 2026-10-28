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

/** A picture the HTML shows as `cid:<contentId>`, carried inside the email itself. */
class InlineImage(val contentId: String, val bytes: ByteArray, val mimeType: String = "image/png")

/** Sends one email. */
fun interface Mailer {
    fun send(
        to: String,
        subject: String,
        text: String,
        html: String,
        images: List<InlineImage>,
    ): Delivery

    companion object {
        /** No email account set up: nothing is sent. */
        val NONE = Mailer { _, _, _, _, _ -> Delivery.NotSetUp }
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
        images: List<InlineImage>,
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
                            addBodyPart(htmlPart(html, images))
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

    internal companion object {
        private const val TIMEOUT_MS = "15000"

        /**
         * The HTML, with its pictures beside it in one multipart/related, so a
         * logo shows without the mail program fetching anything from the web.
         */
        fun htmlPart(
            html: String,
            images: List<InlineImage>,
        ): MimeBodyPart {
            val page = MimeBodyPart().apply { setContent(html, "text/html; charset=UTF-8") }
            if (images.isEmpty()) return page
            val related =
                MimeMultipart("related").apply {
                    addBodyPart(page)
                    for (image in images) {
                        addBodyPart(
                            MimeBodyPart().apply {
                                dataHandler =
                                    jakarta.activation.DataHandler(
                                        jakarta.mail.util.ByteArrayDataSource(image.bytes, image.mimeType),
                                    )
                                contentID = "<${image.contentId}>"
                                disposition = jakarta.mail.Part.INLINE
                                fileName = "${image.contentId}.png"
                            },
                        )
                    }
                }
            return MimeBodyPart().apply { setContent(related) }
        }

        /** The cause in words, from the kind of failure; the server's own text can echo a username. */
        private fun reasonFor(e: jakarta.mail.MessagingException): String {
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

/**
 * The invitation itself, in plain text and HTML — spec 0014, redone by the owner 2026-10-28.
 *
 * Besides the sign-up link it points at the newest Proxic Deck Builder
 * release and says how to link a computer, so a new player can bring their
 * decks on day one. The HTML is tables and inline styles, which is what
 * mail programs (Outlook above all) draw reliably; the logo travels inside
 * the email as [LOGO_ID], so it shows without fetching anything. It
 * does not name who sent the invitation (owner 2026-10-28).
 */
object InviteEmail {
    private val WHEN = DateTimeFormatter.ofPattern("EEEE d MMMM 'at' HH:mm z", Locale.ENGLISH)

    /** Always the newest release: GitHub redirects `latest` to it. */
    const val DECK_BUILDER_DOWNLOAD = "https://github.com/RudeLeft/Proxic_Deck_Builder/releases/latest"

    const val LOGO_ID = "proxic-arena-logo"

    /** The wordmark on the header's colour, 560x187 for a 280px slot on sharp screens. */
    val logo: InlineImage by lazy {
        val bytes =
            checkNotNull(InviteEmail::class.java.getResourceAsStream("/email/invite-logo.png")) {
                "email/invite-logo.png is missing from the server's resources"
            }.use { it.readBytes() }
        InlineImage(LOGO_ID, bytes)
    }

    const val SUBJECT = "Your invitation to Proxic Arena"

    fun text(
        link: String,
        expiresAt: Instant,
        origin: String,
    ): String {
        val home = origin.trimEnd('/')
        return """
            Welcome to Proxic Arena

            You have an invitation to play Magic on Proxic Arena.

            Create your account:

            $link

            This link works once and expires on ${until(expiresAt)}.


            BRING YOUR DECKS: GET PROXIC DECK BUILDER

            A free Windows app for building decks that can be imported into Proxic Arena to play.

            Download the latest version:
            $DECK_BUILDER_DOWNLOAD

            Choose the file ending in -windows.zip, unzip it and run ProxicDeckBuilder.exe. The first time, Windows may say "Windows protected your PC": click More info, then Run anyway.


            LINK YOUR COMPUTER TO ARENA (ONCE, AFTER YOU'VE CREATED YOUR ACCOUNT)

            1. Sign in to Proxic Arena, open your Account page ($home/account) and click Link a computer. It shows a short code.
            2. In the Deck Builder, click Proxic Arena Export at the top of the window.
            3. Type the code into Link code and click Link. The Arena address should read ${host(home)}; if it doesn't, click Change and enter $home.

            That's it. From then on, Send to Arena puts your decks straight into your Deck Depot.
            """.trimIndent()
    }

    fun html(
        link: String,
        expiresAt: Instant,
        origin: String,
    ): String {
        val home = origin.trimEnd('/')
        val href = escape(link)
        val account = escape("$home/account")
        val arena = escape(home)
        val arenaHost = escape(host(home))
        val expires = escape(until(expiresAt))
        val download = escape(DECK_BUILDER_DOWNLOAD)
        return """
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="color-scheme" content="light">
            <title>Welcome to Proxic Arena</title>
            </head>
            <body style="margin:0;padding:0;background:#eceef1">
            <div style="display:none;max-height:0;overflow:hidden">You have an invitation to play Magic on Proxic Arena.</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eceef1">
              <tr><td align="center" style="padding:28px 12px">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
                  <tr><td align="center" style="background:#121519;padding:26px 24px 22px;border-bottom:3px solid #c8892f;border-radius:6px 6px 0 0">
                    <img src="cid:$LOGO_ID" width="280" height="93" alt="Proxic Arena" style="display:block;width:280px;max-width:100%;height:auto;border:0;color:#e0a44a;font-size:24px;font-weight:bold">
                  </td></tr>
                  <tr><td style="background:#ffffff;padding:36px 40px 8px">
                    <h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;color:#14171b">Welcome to Proxic Arena</h1>
                    <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#22262c">You have an invitation to play Magic on Proxic Arena.</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                      <td style="background:#c8892f;border-radius:4px"><a href="$href" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px">Create my account</a></td>
                    </tr></table>
                    <p style="margin:14px 0 30px;font-size:13px;line-height:1.5;color:#6a6f77">This link works once and expires on $expires.</p>
                  </td></tr>
                  <tr><td style="background:#ffffff;padding:0 40px"><div style="border-top:1px solid #e3e5e9;height:1px;line-height:1px">&nbsp;</div></td></tr>
                  <tr><td style="background:#ffffff;padding:30px 40px 6px">
                    <p style="margin:0 0 6px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:#b0782a">Bring your decks</p>
                    <h2 style="margin:0 0 10px;font-size:19px;line-height:1.35;color:#14171b">Get Proxic Deck Builder</h2>
                    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#22262c">A free Windows app for building decks that can be imported into Proxic Arena to play.</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                      <td style="border:2px solid #121519;border-radius:4px"><a href="$download" style="display:inline-block;padding:11px 24px;color:#121519;text-decoration:none;font-weight:bold;font-size:15px">Download the latest Deck Builder</a></td>
                    </tr></table>
                    <p style="margin:14px 0 30px;font-size:13px;line-height:1.55;color:#6a6f77">Choose the file ending in <strong>-windows.zip</strong>, unzip it and run <strong>ProxicDeckBuilder.exe</strong>. The first time, Windows may say &ldquo;Windows protected your PC&rdquo;: click <strong>More info</strong>, then <strong>Run anyway</strong>.</p>
                  </td></tr>
                  <tr><td style="background:#f6f4ef;padding:28px 40px 18px;border-top:1px solid #ebe5d8">
                    <h2 style="margin:0 0 4px;font-size:19px;line-height:1.35;color:#14171b">Link your computer to Arena</h2>
                    <p style="margin:0 0 18px;font-size:14px;color:#6a6f77">You do this once, after you've created your account.</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      ${step(1, "Sign in to Proxic Arena, open your <a href=\"$account\" style=\"color:#9a6420;font-weight:bold\">Account page</a> and click <strong>Link a computer</strong>. It shows a short code.")}
                      ${step(2, "In the Deck Builder, click <strong>Proxic Arena Export</strong> at the top of the window.")}
                      ${step(3, "Type the code into <strong>Link code</strong> and click <strong>Link</strong>. The Arena address should read <strong>$arenaHost</strong>; if it doesn't, click <strong>Change</strong> and enter $arena.")}
                    </table>
                    <p style="margin:4px 0 0;font-size:14px;line-height:1.55;color:#22262c">That's it. From then on, <strong>Send to Arena</strong> puts your decks straight into your Deck Depot.</p>
                  </td></tr>
                  <tr><td style="background:#ffffff;padding:22px 40px 26px;border-radius:0 0 6px 6px;border-top:1px solid #e3e5e9">
                    <p style="margin:0;font-size:12px;line-height:1.5;color:#6a6f77">Button not working? Paste this into your browser:<br><span style="word-break:break-all;color:#22262c">$href</span></p>
                  </td></tr>
                  <tr><td align="center" style="padding:18px 12px 0;font-size:12px;color:#8a8f98">Proxic Arena &middot; $arenaHost</td></tr>
                </table>
              </td></tr>
            </table>
            </body>
            </html>
            """.trimIndent()
    }

    /** One numbered step of "Link your computer"; [body] is markup already escaped. */
    private fun step(
        n: Int,
        body: String,
    ): String =
        "<tr><td valign=\"top\" style=\"padding:0 12px 12px 0;width:28px\">" +
            "<div style=\"width:26px;height:26px;line-height:26px;border-radius:13px;background:#121519;" +
            "color:#e0a44a;font-weight:bold;font-size:13px;text-align:center\">$n</div></td>" +
            "<td valign=\"top\" style=\"padding:3px 0 12px 0;font-size:15px;line-height:1.55;color:#22262c\">" +
            "$body</td></tr>"

    private fun until(expiresAt: Instant): String = WHEN.format(expiresAt.atZone(ZoneId.of("UTC")))

    /** `proxic.barnflix.net` for `https://proxic.barnflix.net`. */
    private fun host(origin: String): String = origin.substringAfter("://").substringBefore('/')

    private fun escape(value: String): String =
        value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
}
