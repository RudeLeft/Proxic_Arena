package net.barnflix.proxic

import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Configuration, secrets and static serving — PHASE_01 §1.27, §1.45–§1.47.
 *
 * The failures these guard against are all silent: a secret printed
 * into a log, a production server that boots happily with no session
 * secret, and an API typo answered with the React page instead of a
 * 404.
 */
class ConfigAndStaticTest {

    private fun env(vars: Map<String, String>): ServerConfig =
        ServerConfig.fromEnvironment { vars[it] }

    @Test
    fun `secrets never appear in the config's string form`() {
        val config = env(
            mapOf(
                "PROXIC_SESSION_SECRET" to "s3cr3t-session-value",
                "POSTGRES_PASSWORD" to "hunter2-the-password",
                "PROXIC_DATABASE_URL" to "jdbc:postgresql://proxic:pgpw@db:5432/proxic",
            )
        )
        val text = config.toString()
        // Logging a config object is routine; leaking it must not be.
        assertFalse(text.contains("s3cr3t-session-value"), text)
        assertFalse(text.contains("hunter2-the-password"), text)
        assertFalse(text.contains("pgpw"), text)
        // ...but it must still be useful for diagnosis.
        assertTrue(text.contains("db:5432"), text)
    }

    @Test
    fun `no secret is defaulted to a working value`() {
        val bare = env(emptyMap())
        assertEquals(null, bare.sessionSecret())
        assertEquals(null, bare.databasePassword())
        assertEquals(null, bare.databaseUrl)
    }

    @Test
    fun `production refuses to start without a real session secret`() {
        assertTrue(
            env(mapOf("APP_ENV" to "production")).startupProblems()
                .any { it.contains("SESSION_SECRET") }
        )
        // The placeholder from .env.example looks configured and is not.
        val placeholder = env(
            mapOf(
                "APP_ENV" to "production",
                "PROXIC_SESSION_SECRET" to "changeme",
                "PROXIC_DATABASE_URL" to "jdbc:postgresql://db:5432/proxic",
            )
        )
        assertTrue(placeholder.startupProblems().any { it.contains("placeholder") })

        val good = env(
            mapOf(
                "APP_ENV" to "production",
                "PROXIC_SESSION_SECRET" to "a3f1c0de9b77412f8a21c6d4e0b5937a",
                "PROXIC_DATABASE_URL" to "jdbc:postgresql://db:5432/proxic",
            )
        )
        assertEquals(emptyList(), good.startupProblems())
    }

    @Test
    fun `development starts unconfigured, because Phase 1 legitimately is`() {
        assertEquals(emptyList(), env(emptyMap()).startupProblems())
    }

    // --- §1.27 static serving and SPA fallback ----------------------

    private fun withStatic(dir: File): ServerConfig = ServerConfig(
        host = "0.0.0.0",
        port = 0,
        databaseUrl = null,
        forgeWorkerJar = null,
        dataRoot = "build/test-data",
        staticRoot = dir.path,
    )

    private fun builtFrontend(): File {
        val dir = File("build/test-static")
        dir.mkdirs()
        File(dir, "index.html").writeText("<!doctype html><title>Proxic</title><div id=root></div>")
        File(dir, "assets").mkdirs()
        File(dir, "assets/app.js").writeText("export const x = 1;")
        return dir
    }

    @Test
    fun `a client-side route resolves to the React app, not a 404`() = testApplication {
        val dir = builtFrontend()
        application { module(withStatic(dir)) }
        for (route in listOf("/", "/play", "/settings", "/deep/nested/route")) {
            val r = client.get(route)
            assertEquals(HttpStatusCode.OK, r.status, "route $route")
            assertTrue(r.bodyAsText().contains("id=root"), "route $route served the app")
        }
    }

    @Test
    fun `built assets are served as files`() = testApplication {
        val dir = builtFrontend()
        application { module(withStatic(dir)) }
        val r = client.get("/assets/app.js")
        assertEquals(HttpStatusCode.OK, r.status)
        assertTrue(r.bodyAsText().contains("export const x"))
    }

    /**
     * The fallback must not swallow API or WebSocket paths (§1.27).
     *
     * Answering /api/nope with index.html gives a client HTML where it
     * expected JSON — a typo'd endpoint becomes a confusing success
     * instead of a clean 404.
     */
    @Test
    fun `SPA fallback does not swallow api or ws paths`() = testApplication {
        val dir = builtFrontend()
        application { module(withStatic(dir)) }
        for (route in listOf("/api/nope", "/api/health/nope", "/ws/nope")) {
            val r = client.get(route)
            assertEquals(HttpStatusCode.NotFound, r.status, "route $route")
            assertFalse(r.bodyAsText().contains("id=root"), "route $route leaked the app")
        }
    }

    /**
     * A traversal attempt must not escape the static root.
     *
     * Negative control included: the same helper DOES return a file
     * for a legitimate asset, so a null here means the guard fired
     * rather than the helper being broken.
     */
    @Test
    fun `static resolution cannot escape the static root`() {
        val dir = builtFrontend()
        assertTrue(resolveStaticFile(dir, "/assets/app.js")!!.isFile)
        for (attempt in listOf(
            "/../../settings.gradle.kts",
            "/../../../Windows/win.ini",
            "/assets/../../build.gradle.kts",
        )) {
            assertEquals(null, resolveStaticFile(dir, attempt), attempt)
        }
    }

    /**
     * A missing build asset is a 404, not the SPA page.
     *
     * Found by driving the running server: /assets/app-missing.js
     * answered 200 text/html. The browser then reports a syntax error
     * inside the bundle, and a stale cached page looks like a code
     * bug for as long as it takes to notice the content type.
     */
    @Test
    fun `a missing build asset 404s instead of returning the app`() = testApplication {
        val dir = builtFrontend()
        application { module(withStatic(dir)) }
        val missing = client.get("/assets/app-missing.js")
        assertEquals(HttpStatusCode.NotFound, missing.status)
        assertFalse(missing.bodyAsText().contains("id=root"))
        // Negative control: the asset that DOES exist still serves.
        assertEquals(HttpStatusCode.OK, client.get("/assets/app.js").status)
    }

    /** An unbuilt frontend is its own state, not a missing route (§1.71). */
    @Test
    fun `an unbuilt frontend says so instead of 404`() = testApplication {
        application { module(withStatic(File("build/no-such-frontend"))) }
        val r = client.get("/play")
        assertEquals(HttpStatusCode.ServiceUnavailable, r.status)
        assertTrue(r.bodyAsText().contains("FRONTEND_NOT_BUILT"))
    }
}
