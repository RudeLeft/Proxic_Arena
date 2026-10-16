package net.barnflix.proxic.auth

import org.bouncycastle.crypto.generators.Argon2BytesGenerator
import org.bouncycastle.crypto.params.Argon2Parameters
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

// Password hashing — PHASE_03 §3.11–§3.17.
//
// Argon2id through BouncyCastle. §3.12 forbids implementing the
// primitive by hand, which is not a style preference: a hand-rolled
// KDF is the single worst thing in this specification to get subtly
// wrong, and the mistake is invisible until someone has the database.

/**
 * An encoded Argon2id hash, in the standard PHC string format.
 *
 * ```text
 * $argon2id$v=19$m=65536,t=3,p=1$<salt>$<hash>
 * ```
 *
 * The parameters travel WITH the hash, so raising them later does
 * not invalidate existing passwords: an old hash still verifies
 * against its own cost, and §3.105's upgrade path re-hashes it on
 * the next successful login.
 */
object PasswordHasher {
    /**
     * Cost parameters (§3.13).
     *
     * ```text
     * [BENCHMARK] 2026-10-16, this development machine, JIT warm
     *             m=65536 (64 MB), t=3, p=1
     *             median 99 ms, samples 89/91/99/100/103
     * ```
     *
     * 64 MB and three passes is the OWASP-recommended Argon2id
     * floor. ~100 ms is slow enough to make offline cracking
     * expensive and fast enough that a login does not feel stalled.
     *
     * The Unraid host is slower than this machine, so the real cost
     * there is higher — which is the safe direction. §3.13 asks for
     * benchmarking on the deployment hardware; that measurement
     * belongs in the Phase 3 gate, and raising these numbers later
     * costs nothing because the parameters are encoded per hash.
     */
    private const val MEMORY_KIB = 65_536
    private const val ITERATIONS = 3
    private const val PARALLELISM = 1

    /** 16 bytes is the Argon2 recommendation; unique per hash (§3.14). */
    private const val SALT_BYTES = 16

    /** 32 bytes of output. */
    private const val HASH_BYTES = 32

    /** §3.15 — length only. No composition rules. */
    const val MIN_PASSWORD_LENGTH = 12
    const val MAX_PASSWORD_LENGTH = 1024

    private val random = SecureRandom()
    private val encoder: Base64.Encoder = Base64.getEncoder().withoutPadding()
    private val decoder: Base64.Decoder = Base64.getDecoder()

    /**
     * Why a password is unacceptable, or null when it is fine.
     *
     * §3.15 forbids composition rules — "must contain uppercase" and
     * friends push people toward `Password1!` and away from length,
     * which is the only property that reliably helps.
     */
    fun rejectionReason(password: String): String? =
        when {
            password.length < MIN_PASSWORD_LENGTH ->
                "A password must be at least $MIN_PASSWORD_LENGTH characters."

            // §3.16: whitespace is NOT stripped — a space is a character
            // like any other, and trimming would silently change the
            // password someone chose. But an all-whitespace password is
            // a mistake, not a choice.
            password.isBlank() -> "A password cannot be only whitespace."

            // An unbounded password is a denial-of-service vector:
            // Argon2 cost grows with input, and §3.15 asks for at least
            // 128 accepted. 1024 is well past any real passphrase.
            password.length > MAX_PASSWORD_LENGTH ->
                "A password may be at most $MAX_PASSWORD_LENGTH characters."

            else -> null
        }

    /** Hash a password with a fresh random salt (§3.14). */
    fun hash(password: String): String {
        val salt = ByteArray(SALT_BYTES).also(random::nextBytes)
        val hash = derive(password, salt, MEMORY_KIB, ITERATIONS, PARALLELISM)
        return "\$argon2id\$v=19\$m=$MEMORY_KIB,t=$ITERATIONS,p=$PARALLELISM" +
            "\$${encoder.encodeToString(salt)}\$${encoder.encodeToString(hash)}"
    }

    /**
     * Verify a password against an encoded hash.
     *
     * Returns false for a malformed hash rather than throwing: a
     * corrupt row must fail the login, not 500 the server (§3.104).
     */
    fun verify(
        password: String,
        encoded: String,
    ): Boolean {
        val parsed = parse(encoded) ?: return false
        val candidate =
            derive(
                password,
                parsed.salt,
                parsed.memoryKib,
                parsed.iterations,
                parsed.parallelism,
            )
        // Constant-time. A byte-by-byte comparison that returns early
        // leaks how much of the hash matched, which is measurable
        // over enough attempts.
        return MessageDigest.isEqual(candidate, parsed.hash)
    }

    /**
     * Does this hash use weaker parameters than we now use (§3.105)?
     *
     * The caller re-hashes on the next successful login, which is the
     * only moment the plaintext is available.
     */
    fun needsRehash(encoded: String): Boolean {
        val parsed = parse(encoded) ?: return true
        return parsed.memoryKib < MEMORY_KIB ||
            parsed.iterations < ITERATIONS ||
            parsed.parallelism != PARALLELISM
    }

    private fun derive(
        password: String,
        salt: ByteArray,
        memoryKib: Int,
        iterations: Int,
        parallelism: Int,
    ): ByteArray {
        val parameters =
            Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
                .withVersion(Argon2Parameters.ARGON2_VERSION_13)
                .withMemoryAsKB(memoryKib)
                .withIterations(iterations)
                .withParallelism(parallelism)
                .withSalt(salt)
                .build()
        val generator = Argon2BytesGenerator().apply { init(parameters) }
        val out = ByteArray(HASH_BYTES)
        generator.generateBytes(password.toCharArray(), out)
        return out
    }

    private data class Parsed(
        val memoryKib: Int,
        val iterations: Int,
        val parallelism: Int,
        val salt: ByteArray,
        val hash: ByteArray,
    )

    private fun parse(encoded: String): Parsed? =
        runCatching {
            val parts = encoded.split("$")
            // ["", "argon2id", "v=19", "m=...,t=...,p=...", salt, hash]
            if (parts.size != 6 || parts[1] != "argon2id") return null
            val costs =
                parts[3].split(",").associate {
                    val (key, value) = it.split("=")
                    key to value.toInt()
                }
            Parsed(
                memoryKib = costs.getValue("m"),
                iterations = costs.getValue("t"),
                parallelism = costs.getValue("p"),
                salt = decoder.decode(parts[4]),
                hash = decoder.decode(parts[5]),
            )
        }.getOrNull()
}
