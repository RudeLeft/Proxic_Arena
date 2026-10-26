package net.barnflix.proxic.auth

import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.ApplicationCallPipeline
import io.ktor.server.application.call
import io.ktor.server.application.log
import io.ktor.server.request.httpMethod
import io.ktor.server.request.path
import io.ktor.server.response.respond
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.barnflix.proxic.ErrorResponse
import java.io.File

// Signed in, or the sign-in screen and nothing else — owner 2026-10-24.
//
// "The only thing people can see if they are not logged in is the login
// screen." One gate in front of every request, before any route:
//
//   - the app's page (any address that is not a file) -- it is the
//     sign-in screen for a stranger;
//   - the built files the sign-in screen needs, named by the build's own
//     manifest -- and no other built file;
//   - POST /api/auth/login; GET /api/auth/me, which tells a stranger
//     nothing (204); POST /api/auth/logout, a quiet 204 either way;
//   - POST /api/auth/join and /join/peek, an invitation link's sign-up
//     page (spec 0014);
//   - the health checks, from inside the server's own box only (Docker's
//     check); from anywhere else they do not exist.
//
// Everything else answers a stranger the same "Sign in to continue"
// (401), whether or not it exists, so nobody can map what is behind the
// door. The lobby and game sockets are left to their own check, which
// closes with "authentication required" and sends nothing: a 401 at the
// door would read to a signed-out page as a dropped connection, and it
// would keep retrying instead of stopping.

/** Which built files the sign-in screen needs: the entry, its imports, their styles, fonts and images. */
internal fun signInFiles(staticRoot: File): Set<String>? {
    val manifest = File(staticRoot, ".vite/manifest.json")
    if (!manifest.isFile) return null
    val chunks = Json.parseToJsonElement(manifest.readText()).jsonObject
    val files = mutableSetOf<String>()
    val seen = mutableSetOf<String>()

    fun walk(key: String) {
        if (!seen.add(key)) return
        val chunk = chunks[key] as? JsonObject ?: return
        chunk["file"]?.jsonPrimitive?.content?.let { files += "/$it" }
        for (list in listOf("css", "assets")) {
            chunk[list]?.jsonArray?.forEach { files += "/${it.jsonPrimitive.content}" }
        }
        chunk["imports"]?.jsonArray?.forEach { walk(it.jsonPrimitive.content) }
    }
    chunks.entries
        .filter { (_, chunk) -> (chunk as? JsonObject)?.get("isEntry")?.jsonPrimitive?.content == "true" }
        .forEach { (key, _) -> walk(key) }
    return files
}

/** POSTs a stranger may make: sign in, sign out, and an invitation's sign-up page (spec 0014). */
private val OPEN_POSTS = setOf("/api/auth/login", "/api/auth/logout", "/api/auth/join", "/api/auth/join/peek")

/** Sign in, "who am I" (which tells a stranger nothing), sign out, and the sign-up page's two questions. */
private fun ApplicationCall.isOpenAccountRoute(path: String): Boolean =
    path == "/api/auth/me" || (path in OPEN_POSTS && request.httpMethod == HttpMethod.Post)

private val LOOPBACK = setOf("127.0.0.1", "::1", "0:0:0:0:0:0:0:1", "localhost")

/** From inside the box: the TCP peer, never a forwarded header a client can write. */
private fun ApplicationCall.fromInside(): Boolean = request.local.remoteHost in LOOPBACK

fun Application.installSignedInGate(
    sessions: Sessions,
    staticRoot: File,
) {
    val publicFiles = signInFiles(staticRoot)
    if (publicFiles == null) {
        log.warn("no build manifest under {}: built files are served to signed-in visitors only", staticRoot)
    }

    intercept(ApplicationCallPipeline.Plugins) {
        val path = call.request.path()
        when {
            // The build's manifest and anything else hidden: never served.
            path.split('/').any { it.startsWith(".") && it.length > 1 } -> {
                call.respond(HttpStatusCode.NotFound, ErrorResponse("NOT_FOUND", "No such page.", null))
                finish()
            }
            // Docker's own check runs inside the box; from outside there is none.
            path.startsWith("/api/health/") -> {
                if (!call.fromInside()) {
                    call.respond(HttpStatusCode.NotFound, ErrorResponse("NOT_FOUND", "No such page.", null))
                    finish()
                }
            }
            call.isOpenAccountRoute(path) -> Unit
            path == "/api" || path.startsWith("/api/") || path == "/ws/system" -> {
                if (call.principal(sessions) == null) {
                    call.respond(
                        HttpStatusCode.Unauthorized,
                        ErrorResponse("UNAUTHENTICATED", "Sign in to continue.", null),
                    )
                    finish()
                }
            }
            path.startsWith("/assets/") -> {
                val public = publicFiles?.contains(path) == true
                if (!public) {
                    if (call.principal(sessions) == null) {
                        call.respond(HttpStatusCode.NotFound, ErrorResponse("NOT_FOUND", "No such page.", null))
                        finish()
                    } else {
                        // Kept by the browser, never by Cloudflare: a shared
                        // copy would hand a signed-in page to a stranger.
                        call.response.headers.append(
                            HttpHeaders.CacheControl,
                            "private, max-age=31536000, immutable",
                        )
                    }
                }
            }
            else -> Unit
        }
    }
}
