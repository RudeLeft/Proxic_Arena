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
    fun `the email carries the link, escapes it, and names no one (owner 2026-10-28)`() {
        val at = Instant.parse("2026-10-27T20:15:00Z")
        val link = "https://proxic.barnflix.net/join#abc"
        assertEquals("Your invitation to Proxic Arena", InviteEmail.SUBJECT)
        val text = InviteEmail.text(link, at, ORIGIN)
        assertTrue(text.contains(link))
        assertTrue(InviteEmail.html("https://x/join#a\"><b>", at, ORIGIN).contains("#a&quot;&gt;&lt;b&gt;"))
        for (body in listOf(text, InviteEmail.html(link, at, ORIGIN))) {
            assertFalse(body.contains("invited you"), "who sent it is not named")
            assertFalse(body.contains("weren't expecting"), "no \"ignore this\" footer")
        }
    }

    @Test
    fun `the email points at the newest Deck Builder and says how to link a computer (owner 2026-10-28)`() {
        val at = Instant.parse("2026-10-27T20:15:00Z")
        val link = "https://arena.example.org/join#abc"
        val latest = "https://github.com/RudeLeft/Proxic_Deck_Builder/releases/latest"
        for (body in listOf(InviteEmail.text(link, at, ORIGIN), InviteEmail.html(link, at, ORIGIN))) {
            assertTrue(body.contains(latest), "always the newest release, never a pinned version")
            // The words on the buttons the steps name, in both apps.
            for (words in listOf("Link a computer", "Proxic Arena Export", "Link code", "Send to Arena")) {
                assertTrue(body.contains(words), words)
            }
            assertTrue(body.contains("https://arena.example.org/account"), "this Arena's Account page")
            assertTrue(body.contains("arena.example.org"), "this Arena's address, for the Deck Builder")
        }
    }

    @Test
    fun `the logo travels inside the email and the HTML shows it by content id (owner 2026-10-28)`() {
        val logo = InviteEmail.logo
        val png = byteArrayOf(0x89.toByte(), 'P'.code.toByte(), 'N'.code.toByte(), 'G'.code.toByte())
        assertTrue(logo.bytes.size in 1_000..100_000, "a real picture, small enough to email: ${logo.bytes.size}")
        assertTrue(logo.bytes.copyOf(4).contentEquals(png))
        val html = InviteEmail.html("https://x/join#a", Instant.EPOCH, ORIGIN)
        assertTrue(html.contains("src=\"cid:${logo.contentId}\""))

        val part = SmtpMailer.htmlPart(html, listOf(logo))
        val related = part.content as jakarta.mail.internet.MimeMultipart
        assertTrue(related.contentType.startsWith("multipart/related"), related.contentType)
        assertEquals(2, related.count)
        assertEquals("<${logo.contentId}>", (related.getBodyPart(1) as jakarta.mail.internet.MimeBodyPart).contentID)
    }

    private companion object {
        const val ORIGIN = "https://arena.example.org"
    }
}
