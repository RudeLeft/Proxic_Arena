package net.barnflix.proxic

/**
 * Build and version facts, in ONE place.
 *
 * `PHASE_01` §1.25: "Do not manually duplicate the Forge hash in
 * unrelated source files." Every endpoint, log line and diagnostic
 * reads it from here.
 *
 * The Forge commit is the pin accepted at the Phase 0A gate
 * (`docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md`). If it ever
 * disagrees with what the worker actually runs, that is a bug worth
 * failing readiness over, not a cosmetic mismatch — so the worker
 * reports its own and the two are compared rather than assumed equal.
 */
object BuildInfo {
    const val PROXIC_VERSION = "0.1.0"

    /** `PHASE_01` §1.32. */
    const val PROTOCOL_VERSION = 1

    /** forge-2.0.15, accepted 2026-10-15. */
    const val FORGE_COMMIT = "4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676"
    const val FORGE_RELEASE = "forge-2.0.15"

    val javaVersion: String get() = System.getProperty("java.version") ?: "unknown"

    /** Set by CI when available; absent locally rather than faked. */
    val buildId: String? get() = System.getenv("PROXIC_BUILD_ID")
}
