package net.barnflix.proxic

import io.ktor.client.request.get
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Security headers and CSP — PHASE_03 §3.99–§3.103.
 *
 * The failure these guard against is quiet: a header that stops being
 * sent is invisible until something exploits its absence. §3.102 asks
 * for a test that detects the headers going missing, and §3.103 for a
 * policy no stricter than the app can actually run under — so the
 * relaxations are asserted too, and a change that silently widens the
 * policy fails here rather than in production.
 */
class SecurityHeadersTest {
    private fun withStatic(dir: File): ServerConfig =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = null,
            forgeWorkerJar = null,
            dataRoot = "build/test-data",
            staticRoot = dir.path,
        )

    private fun builtFrontend(): File {
        val dir = File("build/test-static-headers")
        dir.mkdirs()
        File(dir, "index.html").writeText("<!doctype html><div id=root></div>")
        File(dir, "assets").mkdirs()
        File(dir, "assets/app.js").writeText("export const x = 1;")
        return dir
    }

    private fun assertProtected(
        response: HttpResponse,
        where: String,
    ) {
        assertEquals("nosniff", response.headers["X-Content-Type-Options"], where)
        assertEquals("DENY", response.headers["X-Frame-Options"], where)
        assertEquals(
            "strict-origin-when-cross-origin",
            response.headers["Referrer-Policy"],
            where,
        )
        assertTrue(
            response.headers["Content-Security-Policy"]?.contains("default-src 'self'") == true,
            "$where: ${response.headers["Content-Security-Policy"]}",
        )
    }

    /**
     * §3.102 — every response, not just the HTML page.
     *
     * An API response is the one most likely to be fetched, framed or
     * sniffed, and a static asset is the one most likely to be served
     * by a code path that forgot the headers.
     */
    @Test
    fun `the headers are on the page, the API and the assets alike`() =
        testApplication {
            val dir = builtFrontend()
            application { module(withStatic(dir)) }

            assertProtected(client.get("/"), "the app page")
            assertProtected(client.get("/play"), "a client-side route")
            assertProtected(client.get("/assets/app.js"), "a built asset")
            assertProtected(client.get("/api/version"), "the version API")
            assertProtected(client.get("/api/health/ready"), "the readiness API")
        }

    /**
     * Error responses too.
     *
     * A 404 that renders attacker-controlled text with no nosniff is
     * exactly the response an injection wants, and error paths are
     * where a response-header plugin is most often bypassed.
     */
    @Test
    fun `an error response is protected as well`() =
        testApplication {
            val dir = builtFrontend()
            application { module(withStatic(dir)) }

            val missing = client.get("/api/nope")
            assertEquals(HttpStatusCode.NotFound, missing.status)
            assertProtected(missing, "a 404")

            // A missing asset, which is answered by the static
            // path rather than StatusPages -- a different code path
            // reaching the same 404.
            val asset = client.get("/assets/app-missing.js")
            assertEquals(HttpStatusCode.NotFound, asset.status)
            assertProtected(asset, "a missing asset")
        }

    /**
     * §3.103 — the relaxations are deliberate and bounded.
     *
     * Each assertion here is a decision recorded as a test: widening
     * the policy to 'unsafe-eval', inline script or a remote origin
     * must be a visible change, not a quiet one.
     */
    @Test
    fun `the policy allows what the app needs and nothing more`() {
        val policy = contentSecurityPolicy()

        // What the app genuinely needs.
        assertTrue(policy.contains("style-src 'self' 'unsafe-inline'"), policy)
        assertTrue(policy.contains("worker-src 'self' blob:"), policy)
        assertTrue(policy.contains("img-src 'self' data: blob:"), policy)
        assertTrue(policy.contains("connect-src 'self'"), policy)

        // What it must never need. 'unsafe-inline' in script-src would
        // make the whole policy decorative.
        assertFalse(policy.contains("script-src 'self' 'unsafe-inline'"), policy)
        assertFalse(policy.contains("unsafe-eval"), policy)
        assertTrue(policy.contains("object-src 'none'"), policy)
        assertTrue(policy.contains("frame-ancestors 'none'"), policy)
        assertTrue(policy.contains("base-uri 'self'"), policy)
        assertTrue(policy.contains("form-action 'self'"), policy)

        // No remote origin is permitted anywhere in the policy.
        assertFalse(policy.contains("http://"), policy)
        assertFalse(policy.contains("https://"), policy)
        assertFalse(policy.contains("*"), policy)
    }

    /**
     * §3.99 — Cloudflare's behaviour is preserved.
     *
     * The tunnel terminates TLS and owns HSTS. Sending our own HSTS
     * from behind it would either duplicate Cloudflare's or, worse,
     * contradict it — and an HSTS header served over the plain-HTTP
     * LAN port (owner decision D2) is ignored anyway.
     */
    @Test
    fun `no HSTS is sent from behind the tunnel`() =
        testApplication {
            val dir = builtFrontend()
            application { module(withStatic(dir)) }
            assertEquals(null, client.get("/").headers["Strict-Transport-Security"])
        }
}
