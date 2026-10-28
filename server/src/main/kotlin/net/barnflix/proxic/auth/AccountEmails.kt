package net.barnflix.proxic.auth

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// The emails Arena sends about an account — specs 0014 and 0026.
//
// One frame for all of them: the logo on a dark band, a white card, the
// server's address underneath. Tables and inline styles, which is what
// mail programs (Outlook above all) draw reliably; the logo travels inside
// the email (`cid:`), so it shows without fetching anything. Every name,
// address and link that reaches the HTML goes through [EmailFrame.escape].

/** The parts every account email shares. */
object EmailFrame {
    private val WHEN = DateTimeFormatter.ofPattern("EEEE d MMMM 'at' HH:mm z", Locale.ENGLISH)

    const val LOGO_ID = "proxic-arena-logo"

    /** The wordmark on the header's colour, 560x187 for a 280px slot on sharp screens. */
    val logo: InlineImage by lazy {
        val bytes =
            checkNotNull(EmailFrame::class.java.getResourceAsStream("/email/invite-logo.png")) {
                "email/invite-logo.png is missing from the server's resources"
            }.use { it.readBytes() }
        InlineImage(LOGO_ID, bytes)
    }

    /** The whole page around [rows], each a `<tr>` already escaped. */
    fun page(
        title: String,
        preview: String,
        origin: String,
        rows: String,
    ): String {
        val home = escape(host(origin))
        return """
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="color-scheme" content="light">
            <title>${escape(title)}</title>
            </head>
            <body style="margin:0;padding:0;background:#eceef1">
            <div style="display:none;max-height:0;overflow:hidden">${escape(preview)}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eceef1">
              <tr><td align="center" style="padding:28px 12px">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
                  <tr><td align="center" style="background:#121519;padding:26px 24px 22px;border-bottom:3px solid #c8892f;border-radius:6px 6px 0 0">
                    <img src="cid:$LOGO_ID" width="280" height="93" alt="Proxic Arena" style="display:block;width:280px;max-width:100%;height:auto;border:0;color:#e0a44a;font-size:24px;font-weight:bold">
                  </td></tr>
            $rows
                  <tr><td align="center" style="padding:18px 12px 0;font-size:12px;color:#8a8f98">Proxic Arena &middot; $home</td></tr>
                </table>
              </td></tr>
            </table>
            </body>
            </html>
            """.trimIndent()
    }

    /** The gold button. */
    fun button(
        label: String,
        href: String,
    ): String =
        "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>" +
            "<td style=\"background:#c8892f;border-radius:4px\"><a href=\"${escape(href)}\" " +
            "style=\"display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;" +
            "font-weight:bold;font-size:16px\">${escape(label)}</a></td></tr></table>"

    /** A username, set apart so it is easy to read and copy. */
    fun username(name: String): String =
        "<span style=\"display:inline-block;padding:2px 10px;background:#f1ece2;border:1px solid #e3d8c3;" +
            "border-radius:4px;font-weight:bold;color:#14171b\">${escape(name)}</span>"

    fun until(at: Instant): String = WHEN.format(at.atZone(ZoneId.of("UTC")))

    /** `proxic.barnflix.net` for `https://proxic.barnflix.net`. */
    fun host(origin: String): String = origin.trimEnd('/').substringAfter("://").substringBefore('/')

    fun escape(value: String): String =
        value
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
}

/** One email: what [Mailer.send] needs besides the address. */
data class AccountEmail(val subject: String, val text: String, val html: String) {
    val images: List<InlineImage> get() = listOf(EmailFrame.logo)
}

/**
 * Spec 0026 — the emails about a password and an address. They name the
 * username (the player may have forgotten that too), never a password.
 */
object AccountEmails {
    private const val CARD = "background:#ffffff;padding:36px 40px 28px"
    private const val NOTE =
        "background:#f6f4ef;padding:20px 40px 22px;border-top:1px solid #ebe5d8;border-radius:0 0 6px 6px"
    private const val H1 = "margin:0 0 14px;font-size:24px;line-height:1.3;color:#14171b"
    private const val BODY = "margin:0 0 18px;font-size:16px;line-height:1.6;color:#22262c"
    private const val SMALL = "font-size:13px;line-height:1.6;color:#4b5058"
    private const val FINE = "margin:0;font-size:12px;line-height:1.6;color:#6a6f77"

    fun passwordReset(
        username: String,
        link: String,
        expiresAt: Instant,
        origin: String,
    ): AccountEmail {
        val until = EmailFrame.until(expiresAt)
        val text =
            """
            Reset your password

            A password reset was started for your Proxic Arena account.

            Your username is $username

            Choose a new password:

            $link

            This link works once and expires in 1 hour, on $until.

            Didn't ask for this? You can ignore this email. Your password stays the same until someone uses the link.
            """.trimIndent()
        val rows =
            "<tr><td style=\"$CARD\">" +
                "<h1 style=\"$H1\">Reset your password</h1>" +
                "<p style=\"$BODY\">A password reset was started for your Proxic Arena account.</p>" +
                "<p style=\"margin:0 0 24px;font-size:16px;line-height:1.6;color:#22262c\">Your username is " +
                "${EmailFrame.username(username)}</p>" +
                EmailFrame.button("Choose a new password", link) +
                "<p style=\"margin:14px 0 0;font-size:13px;line-height:1.5;color:#6a6f77\">This link works once " +
                "and expires in 1 hour, on ${EmailFrame.escape(until)}.</p>" +
                "</td></tr>" +
                "<tr><td style=\"$NOTE\">" +
                "<p style=\"margin:0 0 10px;$SMALL\"><strong>Didn't ask for this?</strong> You can ignore this " +
                "email. Your password stays the same until someone uses the link.</p>" +
                "<p style=\"$FINE\">Button not working? Paste this into your browser:<br>" +
                "<span style=\"word-break:break-all;color:#22262c\">${EmailFrame.escape(link)}</span></p>" +
                "</td></tr>"
        return AccountEmail(
            "Reset your Proxic Arena password",
            text,
            EmailFrame.page("Reset your Proxic Arena password", "Choose a new password for $username.", origin, rows),
        )
    }

    fun passwordChanged(
        username: String,
        at: Instant,
        origin: String,
    ): AccountEmail {
        val time = EmailFrame.until(at)
        val text =
            """
            Your password was changed

            The password for your Proxic Arena account $username was changed on $time.

            For your safety, every device that was signed in has been signed out. Sign in again with your new password.

            Wasn't you? Tell the person who runs your Proxic Arena right away.
            """.trimIndent()
        val rows =
            "<tr><td style=\"$CARD\">" +
                "<h1 style=\"$H1\">Your password was changed</h1>" +
                "<p style=\"$BODY\">The password for your Proxic Arena account ${EmailFrame.username(username)} " +
                "was changed on ${EmailFrame.escape(time)}.</p>" +
                "<p style=\"margin:0;font-size:16px;line-height:1.6;color:#22262c\">For your safety, every device " +
                "that was signed in has been signed out. Sign in again with your new password.</p>" +
                "</td></tr>" +
                "<tr><td style=\"$NOTE\"><p style=\"margin:0;$SMALL\"><strong>Wasn't you?</strong> Tell the person " +
                "who runs your Proxic Arena right away.</p></td></tr>"
        return AccountEmail(
            "Your Proxic Arena password was changed",
            text,
            EmailFrame.page(
                "Your Proxic Arena password was changed",
                "The password for $username was changed.",
                origin,
                rows,
            ),
        )
    }

    /** To the OLD address, so a change made with a borrowed session doesn't go unnoticed. */
    fun emailChanged(
        username: String,
        at: Instant,
        origin: String,
    ): AccountEmail {
        val time = EmailFrame.until(at)
        val text =
            """
            Your email address was changed

            The email address for your Proxic Arena account $username was changed on $time. Password resets now go to the new address, not this one.

            Wasn't you? Tell the person who runs your Proxic Arena right away.
            """.trimIndent()
        val rows =
            "<tr><td style=\"$CARD\">" +
                "<h1 style=\"$H1\">Your email address was changed</h1>" +
                "<p style=\"margin:0;font-size:16px;line-height:1.6;color:#22262c\">The email address for your " +
                "Proxic Arena account ${EmailFrame.username(username)} was changed on " +
                "${EmailFrame.escape(time)}. Password resets now go to the new address, not this one.</p>" +
                "</td></tr>" +
                "<tr><td style=\"$NOTE\"><p style=\"margin:0;$SMALL\"><strong>Wasn't you?</strong> Tell the person " +
                "who runs your Proxic Arena right away.</p></td></tr>"
        return AccountEmail(
            "Your Proxic Arena email address was changed",
            text,
            EmailFrame.page(
                "Your Proxic Arena email address was changed",
                "The email address for $username was changed.",
                origin,
                rows,
            ),
        )
    }
}
