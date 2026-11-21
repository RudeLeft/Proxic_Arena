package net.barnflix.proxic

import net.barnflix.proxic.auth.AccountEmails
import net.barnflix.proxic.auth.DisplayNames
import net.barnflix.proxic.auth.PasswordHasher
import net.barnflix.proxic.auth.Usernames
import net.barnflix.proxic.match.LaunchError
import net.barnflix.proxic.room.Room
import net.barnflix.proxic.room.RoomMember
import net.barnflix.proxic.room.RoomStatus
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Spec 0114, F-0114-A -- the server's sentences that need no database:
 * the count and wait words, the account rules, a room's name, the
 * launch refusals and the password-reset email.
 */
class Words0114Test {
    @Test
    fun `numbers in words to ten, digits above`() {
        assertEquals("one", PlayerWords.number(1))
        assertEquals("ten", PlayerWords.number(10))
        assertEquals("11", PlayerWords.number(11))
        assertEquals("1,000", PlayerWords.number(1000))
        assertEquals("one copy", PlayerWords.count(1, "copy", "copies"))
        assertEquals("two copies", PlayerWords.count(2, "copy", "copies"))
    }

    @Test
    fun `W2-114 to W2-116 a wait is said, never in seconds`() {
        assertEquals("a few seconds", PlayerWords.waitWords(1))
        assertEquals("a few seconds", PlayerWords.waitWords(30))
        assertEquals("a minute", PlayerWords.waitWords(61))
        assertEquals("about two minutes", PlayerWords.waitWords(120))
        assertEquals("about 15 minutes", PlayerWords.waitWords(900))
        assertEquals("about an hour", PlayerWords.waitWords(3600))
        assertEquals("about two hours", PlayerWords.waitWords(7200))
    }

    @Test
    fun `sizes in whole MB, rounded up`() {
        assertEquals("150 MB", PlayerWords.megabytes(150L * 1024 * 1024))
        assertEquals("151 MB", PlayerWords.megabytes(150L * 1024 * 1024 + 1))
    }

    @Test
    fun `W2-109 to W2-113 the account rules`() {
        assertEquals("A username must be at least three characters long.", Usernames.rejectionReason("ab"))
        assertEquals(
            "A username can use only letters, numbers, dots (.), underscores (_) and hyphens (-).",
            Usernames.rejectionReason("no spaces"),
        )
        assertEquals("A display name can be at most 12 characters.", DisplayNames.rejectionReason("A".repeat(13)))
        assertEquals("A password must be at least 12 characters long.", PasswordHasher.rejectionReason("short"))
        assertEquals("A password can't be only spaces.", PasswordHasher.rejectionReason(" ".repeat(14)))
    }

    private fun room(vararg members: RoomMember) =
        Room(UUID.randomUUID(), UUID.randomUUID(), "open-format", 2, RoomStatus.OPEN, 1, members.toList())

    @Test
    fun `W2-118 a room with no host is "A room"`() {
        assertEquals("A room", room().displayName())
        val pat = RoomMember(UUID.randomUUID(), "pat", "Pat", 1, null, null, false, true)
        assertEquals("Pat's room", room(pat).displayName())
    }

    @Test
    fun `W2-120 and W2-158 the launch refusals name the button`() {
        assertEquals("SETUP_NOT_FOUND", LaunchError.SetupNotFound.code)
        assertEquals("That match is no longer being set up. Press Start match again.", LaunchError.SetupNotFound.detail)
        assertEquals("SETUP_NOT_READY", LaunchError.SetupNotReady.code)
        assertEquals("Something changed. Press Start match again.", LaunchError.SetupNotReady.detail)
    }

    @Test
    fun `W2-152 the reset email says one hour in words`() {
        val email =
            AccountEmails.passwordReset(
                "pat",
                "https://arena.example/reset#x",
                Instant.parse("2026-11-20T12:00:00Z"),
                "https://arena.example",
            )
        assertTrue(email.text.contains("This link works once and runs out in one hour, on "), email.text)
        assertTrue(email.html.contains("This link works once and runs out in one hour, on "), email.html)
        assertFalse(email.text.contains("1 hour") || email.html.contains("1 hour"))
    }
}
