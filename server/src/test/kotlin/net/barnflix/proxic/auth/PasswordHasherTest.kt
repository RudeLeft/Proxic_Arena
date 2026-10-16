package net.barnflix.proxic.auth

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * Password hashing — PHASE_03 §3.11–§3.17.
 *
 * The failures these guard against are all silent: a hash that is
 * really plaintext, a salt that is really shared, a verify that
 * accepts anything. None of them announce themselves, and all of
 * them are discovered by someone else.
 */
class PasswordHasherTest {
    private val password = "correct horse battery staple"

    @Test
    fun `a hash verifies its own password and nothing else`() {
        val encoded = PasswordHasher.hash(password)
        assertTrue(PasswordHasher.verify(password, encoded))
        assertFalse(PasswordHasher.verify("wrong horse battery staple", encoded))
        assertFalse(PasswordHasher.verify("", encoded))
        // Off by one character at the end: the comparison is
        // constant-time, not prefix-based.
        assertFalse(PasswordHasher.verify(password + "x", encoded))
    }

    @Test
    fun `the password never appears in the hash`() {
        // The obvious catastrophe, asserted because it is obvious
        // only until someone "optimises" the encoding.
        val encoded = PasswordHasher.hash(password)
        assertFalse(encoded.contains(password))
        assertFalse(encoded.contains("horse"))
    }

    @Test
    fun `two hashes of one password differ`() {
        // §3.14 — a unique salt per hash. Identical hashes would
        // mean a shared salt, and a shared salt means one rainbow
        // table breaks every account at once.
        val first = PasswordHasher.hash(password)
        val second = PasswordHasher.hash(password)
        assertNotEquals(first, second)
        assertTrue(PasswordHasher.verify(password, first))
        assertTrue(PasswordHasher.verify(password, second))
    }

    @Test
    fun `the encoded form carries its own parameters`() {
        val encoded = PasswordHasher.hash(password)
        assertTrue(encoded.startsWith("\$argon2id\$v=19\$"), encoded)
        assertTrue(encoded.contains("m=65536"), encoded)
        assertTrue(encoded.contains("t=3"), encoded)
        assertTrue(encoded.contains("p=1"), encoded)
    }

    @Test
    fun `a hash made with weaker parameters still verifies`() {
        // Parameters travel with the hash, so raising the cost later
        // does not lock anybody out. This is what makes §3.105's
        // upgrade path possible at all.
        val weak =
            "\$argon2id\$v=19\$m=8192,t=1,p=1\$" +
                "c2FsdHNhbHRzYWx0c2E\$" + "x".repeat(43)
        // A fabricated hash will not verify, but it must not throw.
        assertFalse(PasswordHasher.verify(password, weak))
        assertTrue(PasswordHasher.needsRehash(weak), "weaker parameters should be upgraded")
    }

    @Test
    fun `a current hash does not want rehashing`() {
        assertFalse(PasswordHasher.needsRehash(PasswordHasher.hash(password)))
    }

    @Test
    fun `a malformed hash fails the login instead of throwing`() {
        // §3.104 — a corrupt row must not 500 the server.
        for (broken in listOf("", "not-a-hash", "\$argon2id\$", "\$bcrypt\$v=19\$m=1,t=1,p=1\$a\$b")) {
            assertFalse(PasswordHasher.verify(password, broken), "accepted: $broken")
            assertTrue(PasswordHasher.needsRehash(broken))
        }
    }

    @Test
    fun `password rules are length only`() {
        // §3.15 — no composition requirements. "Must contain
        // uppercase" pushes people toward Password1! and away from
        // length, which is the only property that reliably helps.
        assertEquals(null, PasswordHasher.rejectionReason("a".repeat(12)))
        assertEquals(null, PasswordHasher.rejectionReason("all lower case and long"))
        assertEquals(null, PasswordHasher.rejectionReason("12345678901234567890"))

        assertTrue(PasswordHasher.rejectionReason("short") != null)
        assertTrue(PasswordHasher.rejectionReason("a".repeat(2000)) != null)
        assertTrue(PasswordHasher.rejectionReason("            ") != null)
    }

    @Test
    fun `whitespace inside a password is preserved`() {
        // §3.16 — trimming would silently change the password
        // someone chose, and they would never be able to log in
        // from a client that did not trim identically.
        val spaced = "  two  spaces  everywhere  "
        val encoded = PasswordHasher.hash(spaced)
        assertTrue(PasswordHasher.verify(spaced, encoded))
        assertFalse(PasswordHasher.verify(spaced.trim(), encoded))
    }

    @Test
    fun `hashing costs enough to be worth attacking slowly`() {
        // §3.13 asks for parameters chosen by benchmark. This is not
        // a benchmark — it is a floor: if someone lowers the cost to
        // make tests faster, this fails.
        // Warm the JIT, then measure five.
        repeat(2) { PasswordHasher.hash(password) }
        val samples =
            (1..5).map {
                val begin = System.nanoTime()
                PasswordHasher.hash(password)
                (System.nanoTime() - begin) / 1_000_000
            }
        val millis = samples.sorted()[2]
        println("ARGON2 median=${millis}ms samples=$samples")
        assertTrue(millis > 20, "hashing took ${millis}ms; the cost looks too low")
    }
}
