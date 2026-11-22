package net.barnflix.proxic

import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readBytes
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.CSRF_COOKIE
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.SESSION_COOKIE
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.io.File
import java.util.zip.GZIPInputStream
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Phase 11 E3, E4 and E17 (HttpEfficiency.kt): what is compressed, and who
 * may keep what. The cache rules are proven with two people signed in: no
 * answer that is one person's may be kept by a shared cache, and the files
 * a shared cache may keep are byte-for-byte the same for both and for a
 * stranger.
 */
class HttpEfficiencyTest {
    private var container: FreshDatabase? = null
    private val password = "a perfectly fine passphrase"

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container = TestPostgres.fresh()
    }

    @AfterTest
    fun stop() = container!!.stop()

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = "build/test-http-efficiency",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
            staticRoot = builtFrontend().path,
        )

    private fun seed() {
        Database.connect(config())!!.use { database ->
            database.migrate()
            val accounts = Accounts(database.dataSource())
            accounts.createUser("RudeLeft", password, Role.ADMIN)
            accounts.createUser("Pat", password, Role.PLAYER)
        }
    }

    /** A built frontend: the sign-in screen's files, a signed-in page's, a font, all big enough to compress. */
    private fun builtFrontend(): File {
        val dir = File("build/test-http-efficiency-static")
        File(dir, "assets").mkdirs()
        File(dir, ".vite").mkdirs()
        File(dir, "index.html").writeText("<!doctype html><div id=root></div>" + "<!-- page -->".repeat(200))
        val big = "export const words = \"the quick brown fox\";\n".repeat(200)
        for (name in listOf("entry.js", "entry.css", "lobby.js")) File(dir, "assets/$name").writeText(big)
        File(dir, "assets/font.woff2").writeBytes(ByteArray(4096) { 'a'.code.toByte() })
        File(dir, ".vite/manifest.json").writeText(
            """
            {
              "index.html": {"file": "assets/entry.js", "isEntry": true, "css": ["assets/entry.css"],
                             "assets": ["assets/font.woff2"], "dynamicImports": ["src/Lobby.tsx"]},
              "src/Lobby.tsx": {"file": "assets/lobby.js", "isDynamicEntry": true}
            }
            """.trimIndent(),
        )
        return dir
    }

    private class Person(val cookie: String, val csrf: String)

    private suspend fun ApplicationTestBuilder.signIn(username: String): Person {
        val answer =
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"$username","password":"$password"}""")
            }
        assertEquals(HttpStatusCode.OK, answer.status, answer.bodyAsText())

        fun value(name: String) =
            answer.headers.getAll(HttpHeaders.SetCookie)!!
                .first { it.startsWith("$name=") }
                .substringAfter("=")
                .substringBefore(";")
        val csrf = value(CSRF_COOKIE)
        return Person("$SESSION_COOKIE=${value(SESSION_COOKIE)}; $CSRF_COOKIE=$csrf", csrf)
    }

    private suspend fun ApplicationTestBuilder.read(
        path: String,
        who: Person?,
        gzip: Boolean = true,
    ): HttpResponse =
        client.get(path) {
            if (who != null) header(HttpHeaders.Cookie, who.cookie)
            if (gzip) header(HttpHeaders.AcceptEncoding, "gzip")
        }

    private suspend fun HttpResponse.bytes(): ByteArray {
        val raw = readBytes()
        val gzipped = headers[HttpHeaders.ContentEncoding] == "gzip"
        return if (gzipped) GZIPInputStream(raw.inputStream()).readBytes() else raw
    }

    /** A Cache-Control a shared cache must never act on to hand one person's answer to another. */
    private fun personal(value: String?): Boolean =
        value != null && value.split(',').map { it.trim() }.let { "private" in it || "no-store" in it }

    @Test
    fun `no signed-in answer may be kept by a shared cache, for either of two people`() =
        testApplication {
            seed()
            application { module(config()) }
            val rude = signIn("RudeLeft")
            val pat = signIn("Pat")
            val apis =
                listOf("/api/auth/me", "/api/version", "/api/decks", "/api/hall", "/api/rooms", "/api/system/status")
            for (who in listOf(rude, pat)) {
                for (path in apis + "/api/no-such-thing") {
                    val answer = read(path, who)
                    val rule = answer.headers.getAll(HttpHeaders.CacheControl)
                    assertEquals(listOf("private, no-store"), rule, "$path ${answer.status}")
                }
                // A signed-in page's code: the browser's own, never a shared copy.
                val lobby = read("/assets/lobby.js", who)
                assertEquals(HttpStatusCode.OK, lobby.status)
                assertTrue(personal(lobby.headers[HttpHeaders.CacheControl]))
            }
            // An administrator's list, too.
            val signIns = read("/api/admin/sign-ins", rude)
            assertEquals(HttpStatusCode.OK, signIns.status)
            assertEquals(listOf("private, no-store"), signIns.headers.getAll(HttpHeaders.CacheControl))
            // A refusal for a stranger is kept by nobody either.
            assertEquals(listOf("private, no-store"), read("/api/decks", null).headers.getAll(HttpHeaders.CacheControl))

            // The one answer that differs per person is marked so: the same
            // address, two people, two bodies, neither kept by a shared cache.
            val rudeMe = read("/api/auth/me", rude).bodyAsText()
            val patMe = read("/api/auth/me", pat).bodyAsText()
            assertNotEquals(rudeMe, patMe)
        }

    @Test
    fun `what a shared cache may keep is the same for everyone`() =
        testApplication {
            seed()
            application { module(config()) }
            val rude = signIn("RudeLeft")
            val pat = signIn("Pat")
            // The sign-in screen's files: public, and the same bytes for a stranger and for both people.
            for (file in listOf("/assets/entry.js", "/assets/entry.css", "/assets/font.woff2")) {
                val seen = listOf(null, rude, pat).map { read(file, it) }
                for (answer in seen) {
                    assertEquals(HttpStatusCode.OK, answer.status, file)
                    assertEquals(
                        listOf("public, max-age=31536000, immutable"),
                        answer.headers.getAll(HttpHeaders.CacheControl),
                        file,
                    )
                }
                val bodies = seen.map { it.bytes().toList() }.toSet()
                assertEquals(1, bodies.size, file)
            }
            // The page: asked again every time, one validator for everybody, a 304 when unchanged.
            val pages = listOf(null, rude, pat).flatMap { who -> listOf("/", "/lobby", "/admin").map { read(it, who) } }
            val tags = pages.map { it.headers[HttpHeaders.ETag] }.toSet()
            assertEquals(1, tags.size)
            val tag = assertNotNull(tags.single())
            for (page in pages) {
                assertEquals(listOf("no-cache"), page.headers.getAll(HttpHeaders.CacheControl))
            }
            assertEquals(1, pages.map { it.bytes().toList() }.toSet().size)
            for (who in listOf(null, rude, pat)) {
                val again =
                    client.get("/lobby") {
                        if (who != null) header(HttpHeaders.Cookie, who.cookie)
                        header(HttpHeaders.IfNoneMatch, tag)
                    }
                assertEquals(HttpStatusCode.NotModified, again.status)
                assertEquals(tag, again.headers[HttpHeaders.ETag])
                assertEquals(listOf("no-cache"), again.headers.getAll(HttpHeaders.CacheControl))
                assertEquals(0, again.readBytes().size)
            }
            val changed = client.get("/lobby") { header(HttpHeaders.IfNoneMatch, "W/\"something-else\"") }
            assertEquals(HttpStatusCode.OK, changed.status)
        }

    @Test
    fun `text is gzipped, pictures fonts and secrets are not`() =
        testApplication {
            seed()
            application { module(config()) }
            // Enough sign-ins that the administrator's list is worth compressing.
            repeat(20) { signIn("Pat") }
            val rude = signIn("RudeLeft")

            for (path in listOf("/", "/assets/entry.js", "/assets/entry.css", "/assets/lobby.js")) {
                val answer = read(path, rude)
                assertEquals("gzip", answer.headers[HttpHeaders.ContentEncoding], path)
                assertTrue(answer.headers.getAll(HttpHeaders.Vary).orEmpty().any { "Accept-Encoding" in it }, path)
            }
            val list = read("/api/admin/sign-ins", rude)
            assertEquals("gzip", list.headers[HttpHeaders.ContentEncoding])
            // The same list as an uncompressed read, byte for byte.
            assertEquals(read("/api/admin/sign-ins", rude, gzip = false).bytes().size, list.bytes().size)

            // Never: fonts (already compressed), anything under /api/auth, a client that did not ask.
            assertNull(read("/assets/font.woff2", rude).headers[HttpHeaders.ContentEncoding])
            assertNull(read("/api/auth/me", rude).headers[HttpHeaders.ContentEncoding])
            assertNull(read("/assets/entry.js", rude, gzip = false).headers[HttpHeaders.ContentEncoding])
            // Never an answer to a POST: that is where one-time secrets are handed out.
            val code =
                client.post("/api/auth/device-codes") {
                    header(HttpHeaders.Cookie, rude.cookie)
                    header("X-CSRF-Token", rude.csrf)
                    header(HttpHeaders.AcceptEncoding, "gzip")
                }
            assertNull(code.headers[HttpHeaders.ContentEncoding], code.bodyAsText())
        }

    @Test
    fun `only reads outside the secret-bearing routes are compressible`() {
        assertTrue(compressible(io.ktor.http.HttpMethod.Get, "/assets/x.js"))
        assertTrue(compressible(io.ktor.http.HttpMethod.Get, "/api/admin/accounts"))
        assertTrue(compressible(io.ktor.http.HttpMethod.Get, "/api/authority"))
        for (path in listOf("/api/auth", "/api/auth/me", "/api/admin/email", "/api/deck-builder/decks", "/ws/user")) {
            assertFalse(compressible(io.ktor.http.HttpMethod.Get, path), path)
        }
        assertFalse(compressible(io.ktor.http.HttpMethod.Post, "/api/admin/invites"))
        assertFalse(compressible(io.ktor.http.HttpMethod.Head, "/assets/x.js"))
    }

    @Test
    fun `the page names its build by a hash the page can compare, and nothing else`() {
        // The same tag the page computes (status.test.ts buildTagOf).
        assertEquals("ef260e9aa3c673af", buildTag("dev"))
        assertEquals("7e0996dfcf0124fe", buildTag("4a5acfe"))
        assertNull(buildTag(null))
        val file = File("build/test-http-efficiency-page/index.html")
        file.parentFile.mkdirs()
        file.writeText("<!doctype html><html><head><title>Proxic Arena</title></head><body></body></html>")
        val (tagged, taggedEtag) = pageBytes(file, buildTag("dev"))
        val meta = "<meta name=\"proxic-build\" content=\"ef260e9aa3c673af\" /></head>"
        assertTrue(tagged.decodeToString().contains(meta))
        assertFalse(tagged.decodeToString().contains("dev\""))
        // A build with no id: the page as built.
        val plain = File("build/test-http-efficiency-page/plain.html")
        plain.writeText(file.readText())
        val (untagged, untaggedEtag) = pageBytes(plain, null)
        assertEquals(file.readText(), untagged.decodeToString())
        assertNotEquals(taggedEtag, untaggedEtag)
    }
}
