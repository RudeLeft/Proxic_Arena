package net.barnflix.proxic.deck

import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.http.content.LocalFileContent
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import net.barnflix.proxic.ErrorResponse
import java.io.File

// One address per picture — spec 0052 (owner D1, D2, 2026-11-01).
//
// A picture was fetched under the match or the deck it was shown in
// (/api/matches/{id}/assets/{sha}, /api/decks/{id}/assets/{sha}), so the
// same picture had a new address in every game and a browser downloaded
// it again each time: tens of MB a player a game, from the home server.
// Here it has one address, its content hash, for any signed-in player.
//
// What stays private: a player learns an address only by being shown the
// card -- a game names a picture only for a card the viewer may see
// (§6.124, spec 0049), a deck page only for a deck they may open. What the
// owner accepted (D1): once known, the address keeps working, for any
// signed-in player. The sign-in gate in front of every /api route is the
// check; this route is not exempted from it, so a stranger is refused
// before it runs (D2: nothing for Cloudflare to keep either).

/** GET /api/pictures/{sha}, and ?size=full for the close-up. */
fun Route.pictureRoutes(artStore: ArtStore) {
    get("/pictures/{sha}") {
        val sha = call.parameters["sha"].orEmpty()
        // A hash is 64 hex characters: validating the shape means no path
        // can be built from what was sent.
        val closeUp = call.request.queryParameters["size"] == "full"
        val file =
            sha.takeIf { HASH.matches(it) }?.let { artStore.fileFor(it, closeUp) }
                ?: return@get call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("PICTURE_NOT_FOUND", "No such picture.", null),
                )
        // `private`: Cloudflare sits in front of this server and must keep
        // no copy (D2). The viewer's own browser keeps it a year: the
        // address is a content hash, so its bytes never change.
        call.respondPicture(file)
    }
}

/**
 * Spec 0121 -- what a picture file is, said explicitly: a WebP copy, a JPEG
 * (an older copy, or an original), or a PNG. One answer for all three
 * picture addresses, so none can label a WebP as something else.
 */
fun pictureType(file: File): ContentType =
    when (file.extension) {
        "webp" -> WEBP
        "jpg", "jpeg" -> ContentType.Image.JPEG
        else -> ContentType.Image.PNG
    }

/**
 * Answer with a picture, for every picture address (spec 0052's one address
 * and the old per-match and per-deck ones): its type said explicitly, and
 * kept a year by the viewer's own browser and by nothing in between
 * (`private`). Same address, same picture: a browser that holds an older
 * JPEG of it keeps a valid copy (spec 0121).
 */
suspend fun ApplicationCall.respondPicture(file: File) {
    response.header(HttpHeaders.CacheControl, "private, max-age=31536000, immutable")
    respond(LocalFileContent(file, pictureType(file)))
}

private val WEBP = ContentType("image", "webp")

private val HASH = Regex("[0-9a-f]{64}")
