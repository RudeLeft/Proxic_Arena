package net.barnflix.proxic.deck

import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.DeviceLinks
import net.barnflix.proxic.auth.Sessions
import net.barnflix.proxic.auth.bearerToken
import net.barnflix.proxic.auth.clientSource
import net.barnflix.proxic.auth.principal
import java.io.File

// GET /api/deck-rules — spec 0021.
//
// A signed-in browser OR a linked computer's device token (R2: signed-in
// players only). This is the one route a device token opens; nothing else
// reads one. A stranger gets the gate's own "Sign in to continue", so this
// route looks like every other closed door.
//
// The document is the same for everybody, so it carries an ETag: the Deck
// Builder sends back what it holds and gets 304 until Forge or the format
// changes. Never cached by Cloudflare (private), always revalidated.

/** The route as the server mounts it: its document built from this server's data root and worker. */
fun Route.deckRulesRoutes(
    config: ServerConfig,
    sessions: Sessions,
    devices: DeviceLinks,
) {
    val rules = DeckRules(File(config.dataRoot), CardResolver(config)::cardPool)
    deckRulesRoutes(rules, sessions, devices)
}

fun Route.deckRulesRoutes(
    rules: DeckRules,
    sessions: Sessions,
    devices: DeviceLinks,
) {
    get("/deck-rules") {
        val token = call.bearerToken()
        val allowed =
            if (token != null) {
                devices.authenticate(token, call.clientSource()) != null
            } else {
                call.principal(sessions) != null
            }
        if (!allowed) {
            return@get call.respond(
                HttpStatusCode.Unauthorized,
                ErrorResponse("UNAUTHENTICATED", "Sign in to continue.", null),
            )
        }

        // The first request asks a Forge worker, which blocks for seconds.
        val document =
            withContext(Dispatchers.IO) { rules.document() }
                ?: return@get call.respond(
                    HttpStatusCode.ServiceUnavailable,
                    ErrorResponse(
                        "RULES_UNAVAILABLE",
                        "The deck rules could not be prepared just now. Try again in a minute.",
                        null,
                    ),
                )

        val etag = "\"${document.version}\""
        call.response.headers.append(HttpHeaders.ETag, etag)
        call.response.headers.append(HttpHeaders.CacheControl, "private, no-cache")
        call.response.headers.append(HttpHeaders.Vary, "Accept-Encoding")
        if (call.request.header(HttpHeaders.IfNoneMatch) == etag) {
            return@get call.respond(HttpStatusCode.NotModified)
        }
        val acceptsGzip = call.request.header(HttpHeaders.AcceptEncoding)?.contains("gzip") == true
        if (acceptsGzip) {
            call.response.headers.append(HttpHeaders.ContentEncoding, "gzip")
            call.respondBytes(document.gzip, ContentType.Application.Json)
        } else {
            call.respondBytes(document.json, ContentType.Application.Json)
        }
    }
}
