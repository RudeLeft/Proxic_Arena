package net.barnflix.proxic

import java.util.Properties

/**
 * Build and version facts, in ONE place.
 *
 * `PHASE_01` §1.25: "Do not manually duplicate the Forge hash in
 * unrelated source files." These values are generated at build time
 * from `forge-pin.properties` at the repository root — the same file
 * the Maven `forge-worker` build reads. Neither side hardcodes the
 * commit, so the server's claim and the worker's claim cannot drift
 * apart because somebody edited one of them.
 *
 * If the running worker ever reports a different commit, that is a
 * bug worth failing readiness over, not a cosmetic mismatch (§1.61).
 * The worker therefore reports its own and the two are COMPARED
 * rather than assumed equal.
 */
object BuildInfo {
    private val props: Properties = Properties().apply {
        val stream = BuildInfo::class.java.classLoader
            .getResourceAsStream("build-info.properties")
        // A missing resource means the build is broken. Defaulting
        // would produce a server that cheerfully reports a Forge
        // commit nobody generated.
            ?: error("build-info.properties is missing; the build did not generate it")
        stream.use { load(it) }
    }

    private fun required(key: String): String =
        props.getProperty(key) ?: error("build-info.properties has no '$key'")

    val PROXIC_VERSION: String = required("proxic.version")

    /** `PHASE_01` §1.32. */
    val PROTOCOL_VERSION: Int = required("protocol.version").toInt()

    val FORGE_COMMIT: String = required("forge.commit")
    val FORGE_RELEASE: String = required("forge.release")

    val javaVersion: String get() = System.getProperty("java.version") ?: "unknown"

    /** Set by CI when available; absent locally rather than faked. */
    val buildId: String? get() = System.getenv("PROXIC_BUILD_ID")
}
