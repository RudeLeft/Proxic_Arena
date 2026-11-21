package net.barnflix.proxic

import kotlinx.serialization.json.JsonObject
import net.barnflix.proxic.auth.SmtpMailer
import net.barnflix.proxic.auth.signedOutWords
import net.barnflix.proxic.report.ReportDetail
import net.barnflix.proxic.report.ReportReadme
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Spec 0115 (F-0115-A) -- the admin and owner-only sentences the server
 * writes that need no database (docs/features/wording/0115-wording-table.md).
 * The routes' sentences are in `admin/Words0115RoutesTest`; the
 * command line's in `auth/AdminToolTest`; the reset and email-settings
 * refusals in `auth/PasswordResetTest` and `auth/MailSettingsTest`.
 */
class Words0115Test {
    @Test
    fun `W3-024 a refused message never names the exception class`() {
        val refused = jakarta.mail.MessagingException("552 message too big")
        assertEquals(
            "The email server refused the message. Check the settings and try again.",
            SmtpMailer.reasonFor(refused),
        )
        // Even a class it has no words for.
        val odd = jakarta.mail.internet.ParseException("odd")
        val words = SmtpMailer.reasonFor(odd)
        assertFalse(words.contains("Exception"), words)
        assertFalse(words.contains("("), words)
    }

    @Test
    fun `W3-018 and W3-032 signing out says how many devices, in words`() {
        assertEquals("Signed Pat out of one device.", signedOutWords("Pat", 1))
        assertEquals("Signed Pat out of three devices.", signedOutWords("Pat", 3))
        assertEquals("Signed Pat out of 12 devices.", signedOutWords("Pat", 12))
        assertEquals("Pat was not signed in anywhere.", signedOutWords("Pat", 0))
    }

    @Test
    fun `W3-034 a report's README says its status in lower-case words`() {
        fun readme(status: String) =
            ReportReadme.of(
                ReportDetail(
                    number = 7,
                    kind = "IDEA",
                    status = status,
                    summary = "s",
                    username = "Pat",
                    createdAt = "2026-11-21T10:00:00Z",
                    answers = JsonObject(emptyMap()),
                    context = JsonObject(emptyMap()),
                    matchId = null,
                    adminNote = "",
                    files = emptyList(),
                ),
            )
        assertTrue(readme("NEW").contains("Status: new."), readme("NEW"))
        assertTrue(readme("WONT_FIX").contains("Status: won't fix."), readme("WONT_FIX"))
        assertEquals("seen", ReportReadme.statusWords("SEEN"))
        assertEquals("planned", ReportReadme.statusWords("PLANNED"))
        assertFalse(readme("NEW").contains("NEW."))
    }
}
