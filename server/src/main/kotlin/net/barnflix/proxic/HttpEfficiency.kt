package net.barnflix.proxic

import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.withCharset
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.plugins.compression.Compression
import io.ktor.server.plugins.compression.condition
import io.ktor.server.plugins.compression.gzip
import io.ktor.server.plugins.compression.matchContentType
import io.ktor.server.plugins.compression.minimumSize
import io.ktor.server.request.httpMethod
import io.ktor.server.request.path
import io.ktor.server.response.ApplicationSendPipeline
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

// Phase 11, step 2 (P11-E3, E4, E17): what the server sends, and for how
// long anyone may keep it. The game and lobby sockets are not here (D2).
//
// E4 -- gzip for text: the built JavaScript, CSS, SVG and the page, and
// the JSON lists. Never pictures or fonts (WebP, JPEG, PNG and woff2 are
// compressed already: gzip would cost CPU for nothing).
//
// BREACH (a secret beside attacker-chosen text in one compressed body,
// guessed from the compressed size) is checked per route in the phase
// paper's E4 As built. In short: no body we compress carries a secret.
// The session and CSRF tokens travel only in cookies and headers, never a
// body. The bodies that DO carry one -- a device link's token, a device
// code, an invitation link, a reset -- are all answers to a POST, or under
// /api/auth, and none of those is compressed. Only a GET is.

/** Never compressed, whatever their type: sign-in and account answers, mail settings, the Deck Builder's. */
private val NEVER_COMPRESSED = listOf("/api/auth", "/api/admin/email", "/api/deck-builder", "/api/health", "/ws")

/** Below this a gzip header and the CPU cost more than they save. */
private const val MIN_COMPRESSED_BYTES = 1024L

internal fun compressible(
    method: HttpMethod,
    path: String,
): Boolean = method == HttpMethod.Get && NEVER_COMPRESSED.none { path == it || path.startsWith("$it/") }

fun Application.installHttpEfficiency() {
    install(Compression) {
        gzip {
            minimumSize(MIN_COMPRESSED_BYTES)
            // The types worth compressing; everything else (pictures, fonts) goes as it is.
            matchContentType(
                ContentType.Text.Html,
                ContentType.Text.CSS,
                ContentType.Text.JavaScript,
                ContentType.Application.JavaScript,
                ContentType.Application.Json,
                ContentType.Image.SVG,
            )
            condition { compressible(request.httpMethod, request.path()) }
        }
    }
    keepNoApiAnswer()
    // Ktor's Compression doesn't say Vary here: without it, a shared cache
    // (Cloudflare) could hand a gzipped sign-in file to a browser that
    // didn't ask for gzip.
    sendPipeline.intercept(ApplicationSendPipeline.After) {
        if (!compressible(call.request.httpMethod, call.request.path())) return@intercept
        val vary = call.response.headers.values(HttpHeaders.Vary)
        if (vary.none { it.contains(HttpHeaders.AcceptEncoding, ignoreCase = true) }) {
            call.response.headers.append(HttpHeaders.Vary, HttpHeaders.AcceptEncoding)
        }
    }
}

/**
 * P11-E17 -- an /api answer is kept by nobody unless its route says
 * otherwise (a picture, kept by the viewer's own browser for a year, and
 * the deck rules, `private, no-cache`). Each answer is one person's: a
 * shared cache (Cloudflare) must never hand it to someone else, and the
 * browser has no reason to keep a list it asks for again anyway.
 */
private fun Application.keepNoApiAnswer() {
    sendPipeline.intercept(ApplicationSendPipeline.After) {
        val path = call.request.path()
        if (path != "/api" && !path.startsWith("/api/")) return@intercept
        if (call.response.headers.contains(HttpHeaders.CacheControl)) return@intercept
        call.response.headers.append(HttpHeaders.CacheControl, "private, no-store")
    }
}

private fun sha256Hex(bytes: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
    return digest.joinToString("") { "%02x".format(it) }
}

private const val TAG_HEX = 32
private const val BUILD_TAG_HEX = 16

/**
 * P11-E16 -- which build served the page, without naming it: the first
 * hex of SHA-256 of the build id, written into the page as
 * `<meta name="proxic-build">`. The page's "a new version is ready" check
 * (PageNotices.tsx) compares it with `/api/version`'s build id, hashed the
 * same way, so it needs no request of its own when the page opens. A
 * stranger learns only that the page changed with a build, which the
 * page's own ETag says already. Null when the build has no id (locally,
 * PROXIC_BUILD_ID unset): no meta, and the page asks on opening as before.
 */
internal fun buildTag(buildId: String? = BuildInfo.buildId): String? {
    val id = buildId ?: return null
    return sha256Hex(id.toByteArray()).take(BUILD_TAG_HEX)
}

private class Page(val stamp: Pair<Long, Long>, val bytes: ByteArray, val tag: String)

/** index.html as sent, by its file's size and time (the file changes only with a new build). */
private val pages = ConcurrentHashMap<String, Page>()

internal fun pageBytes(
    file: File,
    build: String? = buildTag(),
): Pair<ByteArray, String> {
    val stamp = file.length() to file.lastModified()
    val known = pages[file.path]
    if (known != null && known.stamp == stamp) return known.bytes to known.tag
    val html = file.readText()
    val sent =
        if (build == null || !html.contains("</head>")) {
            html
        } else {
            html.replaceFirst("</head>", "<meta name=\"proxic-build\" content=\"$build\" /></head>")
        }
    val bytes = sent.toByteArray()
    // Weak: the same page sent gzipped is other bytes, the same page.
    val tag = "W/\"" + sha256Hex(bytes).take(TAG_HEX) + "\""
    pages[file.path] = Page(stamp, bytes, tag)
    return bytes to tag
}

/**
 * P11-E3 -- the app's page (index.html): asked for again every time
 * (`no-cache`: it names this build's scripts, and a kept copy named the
 * last build's, 2026-10-21), but with a validator, so an unchanged page
 * is a 304 and no body. The page is the same for everyone: it carries
 * nothing of the person asking.
 */
suspend fun ApplicationCall.respondPage(file: File) {
    val (bytes, tag) = pageBytes(file)
    response.headers.append(HttpHeaders.CacheControl, "no-cache")
    response.headers.append(HttpHeaders.ETag, tag)
    val asked = request.headers[HttpHeaders.IfNoneMatch]
    val same =
        asked?.split(',')?.any {
            val one = it.trim()
            one == "*" || one.removePrefix("W/") == tag.removePrefix("W/")
        } == true
    if (same) {
        respond(HttpStatusCode.NotModified)
    } else {
        respondBytes(bytes, ContentType.Text.Html.withCharset(Charsets.UTF_8))
    }
}
