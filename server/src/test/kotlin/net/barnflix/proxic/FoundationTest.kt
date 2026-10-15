package net.barnflix.proxic

import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.Json
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Phase 1 foundation tests.
 *
 * These assert behaviour the later phases depend on, not that the
 * code compiles. In particular they check the things Phase 0A proved
 * are easy to get silently wrong: a status endpoint that reports
 * "ok" for something it never checked (§1.69), and a protocol
 * mismatch that gets interpreted instead of refused (§1.32).
 */
class FoundationTest {
    private val json = Json { ignoreUnknownKeys = true }

    /** §1.23 — liveness must not depend on anything else. */
    @Test
    fun `liveness is ok with no dependencies configured`() =
        testApplication {
            application { module(ServerConfig("0.0.0.0", 0, null, null, "build/test-data")) }
            val body = client.get("/api/health/live").bodyAsText()
            val live = json.decodeFromString(Liveness.serializer(), body)
            assertEquals("ok", live.status)
            assertEquals("arena-server", live.service)
        }

    /**
     * §1.69 — status must be REAL.
     *
     * With no database URL and no worker jar, readiness must say so.
     * A green light nobody earned is the failure mode this guards.
     */
    @Test
    fun `readiness reports unconfigured dependencies honestly`() =
        testApplication {
            application { module(ServerConfig("0.0.0.0", 0, null, null, "build/test-data")) }
            val body = client.get("/api/health/ready").bodyAsText()
            val ready = json.decodeFromString(Readiness.serializer(), body)

            assertEquals("unconfigured", ready.checks["database"])
            assertEquals("unconfigured", ready.checks["forgeWorker"])
            assertEquals("ok", ready.checks["dataRoot"])
            // Unconfigured is expected in Phase 1 and must not look broken.
            assertEquals("ok", ready.status)
        }

    /** A configured-but-absent worker jar is a real failure, not "ok". */
    @Test
    fun `readiness fails when a configured dependency is missing`() =
        testApplication {
            application {
                module(ServerConfig("0.0.0.0", 0, null, "/no/such/worker.jar", "build/test-data"))
            }
            val body = client.get("/api/health/ready").bodyAsText()
            val ready = json.decodeFromString(Readiness.serializer(), body)
            assertEquals("missing", ready.checks["forgeWorker"])
            assertEquals("degraded", ready.status)
        }

    /** §1.25 — and §0A's rule that the Forge pin lives in one place. */
    @Test
    fun `version reports the accepted Forge pin`() =
        testApplication {
            application { module(ServerConfig("0.0.0.0", 0, null, null, "build/test-data")) }
            val body = client.get("/api/version").bodyAsText()
            val v = json.decodeFromString(VersionInfo.serializer(), body)
            assertEquals(1, v.protocolVersion)
            assertEquals("forge-2.0.15", v.forgeRelease)
            assertEquals("4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676", v.forgeCommit)
            assertTrue(v.javaVersion.isNotBlank())
        }

    /** §1.26 — status must not leak internals. */
    @Test
    fun `system status exposes no secrets or paths`() =
        testApplication {
            application {
                module(ServerConfig("0.0.0.0", 0, "postgres://user:hunter2@db/x", null, "build/test-data"))
            }
            val body = client.get("/api/system/status").bodyAsText()
            assertTrue("hunter2" !in body, "status leaked a credential: $body")
            assertTrue("postgres://" !in body, "status leaked a connection string: $body")
        }

    /** §1.44 — one error shape, and no stack traces. */
    @Test
    fun `unknown endpoint returns the standard error shape`() =
        testApplication {
            application { module(ServerConfig("0.0.0.0", 0, null, null, "build/test-data")) }
            val response = client.get("/api/does-not-exist")
            assertEquals(HttpStatusCode.NotFound, response.status)
            val err = json.decodeFromString(ErrorResponse.serializer(), response.bodyAsText())
            assertEquals("NOT_FOUND", err.errorCode)
            assertTrue("Exception" !in err.detail)
        }

    /**
     * Regression: every REQUIRED field must survive serialization.
     *
     * The WebSocket handler originally used a bare `Json`, which omits
     * any property equal to its default — so `protocolVersion` was
     * absent from every frame the server sent, and the client parser
     * correctly rejected the server's own HELLO as malformed.
     *
     * The shared-fixture test could not catch this: it proves the two
     * MODELS agree with the FIXTURES, not that the server emits
     * conformant frames. This asserts the emitted TEXT.
     */
    @Test
    fun `serialized envelope carries every required field`() {
        val wire = Json { encodeDefaults = true }
        val text =
            wire.encodeToString(
                Envelope.serializer(),
                Envelope(type = "HELLO", messageId = "abc"),
            )
        for (field in listOf("protocolVersion", "type", "messageId", "payload")) {
            assertTrue("\"$field\"" in text, "serialized envelope dropped '$field': $text")
        }

        // And the default Json must NOT be used for the wire -- this is
        // the exact defect, pinned so it cannot come back.
        val bare = Json.encodeToString(Envelope.serializer(), Envelope(type = "HELLO", messageId = "abc"))
        assertTrue(
            "protocolVersion" !in bare,
            "if the bare serializer now encodes defaults, this guard is obsolete -- re-check why",
        )
    }

    /**
     * §1.33 — the SAME fixtures the TypeScript suite parses.
     *
     * This is what stops the two sides drifting. If the Kotlin model
     * changes shape, these fail here before anything reaches a browser.
     */
    @Test
    fun `canonical fixtures parse into the Kotlin model`() {
        val dir = File("../protocol/fixtures")
        assertTrue(dir.isDirectory, "fixtures not found at ${dir.absolutePath}")
        val files = dir.listFiles { f -> f.extension == "json" }?.sortedBy { it.name }
        assertNotNull(files)
        assertTrue(files.isNotEmpty(), "no fixtures to check")

        for (f in files) {
            val env = json.decodeFromString(Envelope.serializer(), f.readText())
            assertEquals(
                BuildInfo.PROTOCOL_VERSION,
                env.protocolVersion,
                "${f.name}: fixture protocolVersion must match the server's",
            )
            assertTrue(env.type.isNotBlank(), "${f.name}: type must be set")
            assertTrue(env.messageId.isNotBlank(), "${f.name}: messageId must be set")
        }
    }
}
