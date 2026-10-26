package net.barnflix.proxic.auth

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Spec 0014 — the email account's settings, and the invitation's words. */
class MailConfigTest {
    private fun env(vararg pairs: Pair<String, String>): (String) -> String? = mapOf(*pairs)::get

    @Test
    fun `nothing set means no email, and links are copied by hand`() {
        val config = MailConfig.fromEnvironment(env())
        assertFalse(config.configured)
        assertEquals(587, config.port)
        assertEquals("starttls", config.security)
    }

    @Test
    fun `the password is never in the settings' printed form`() {
        val config =
            MailConfig.fromEnvironment(
                env(
                    "PROXIC_SMTP_HOST" to "smtp.example.com",
                    "PROXIC_SMTP_FROM" to "Proxic Arena <invites@example.com>",
                    "PROXIC_SMTP_PASSWORD" to "an-app-password-for-tests",
                ),
            )
        assertTrue(config.configured)
        assertFalse(config.toString().contains("an-app-password-for-tests"), config.toString())
        assertTrue(config.toString().contains("password=<set>"))
    }

    @Test
    fun `the email names the inviter, carries the link, and escapes what it shows`() {
        val at = Instant.parse("2026-10-27T20:15:00Z")
        val link = "https://proxic.barnflix.net/join#abc"
        assertEquals("Pat <3 invited you to Proxic Arena", InviteEmail.subject("Pat <3"))
        assertTrue(InviteEmail.text("Pat", link, at).contains(link))
        val html = InviteEmail.html("Pat <script>", link, at)
        assertFalse(html.contains("<script>"), "a display name is text, never markup")
        assertTrue(html.contains("Pat &lt;script&gt;"))
    }
}
