package net.barnflix.proxic.deck

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.DeviceLinks
import net.barnflix.proxic.auth.User
import net.barnflix.proxic.auth.bearerToken
import net.barnflix.proxic.auth.clientSource
import java.util.UUID
import javax.sql.DataSource

// /api/deck-builder — spec 0022.
//
// What a linked computer's device token opens besides the deck rules:
//
//   GET  /api/deck-builder/deck-names       your decks' names
//   POST /api/deck-builder/pictures/known   which pictures your decks hold
//   POST /api/deck-builder/decks            send a deck, as the browser's import
//
// A device token only: a browser has its own import. A stranger, or a
// session cookie without a token, gets the gate's own "Sign in to
// continue". No CSRF: nothing here reads a cookie, and a page on another
// site cannot set an Authorization header on a cross-site request.

@Serializable
data class DeckNamesResponse(val names: List<String>)

@Serializable
data class PicturesKnownRequest(val sha256: List<String>)

@Serializable
data class PicturesKnownResponse(val known: List<String>)

/** The most hashes one question may ask about: a package's picture limit. */
private val MAX_ASKED = PackageLimits.MAX_IMAGE_COUNT

private val HASH = Regex("^[0-9a-f]{64}$")

fun Route.deckBuilderRoutes(
    config: ServerConfig,
    dataSource: DataSource,
    devices: DeviceLinks,
    importer: DeckImporter,
    importEnabled: Boolean,
) {
    route("/deck-builder") {
        get("/deck-names") {
            val user = linked(devices) ?: return@get
            val names = withContext(Dispatchers.IO) { deckNames(dataSource, user.userId) }
            call.respond(DeckNamesResponse(names))
        }

        post("/pictures/known") {
            val user = linked(devices) ?: return@post
            val asked = runCatching { call.receive<PicturesKnownRequest>() }.getOrNull()?.sha256
            if (asked == null || asked.size > MAX_ASKED || asked.any { !HASH.matches(it) }) {
                return@post call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_REQUEST", "Ask about up to $MAX_ASKED picture hashes.", null),
                )
            }
            val known = withContext(Dispatchers.IO) { ownedPictures(dataSource, user.userId, asked.toSet()) }
            call.respond(PicturesKnownResponse(asked.distinct().filter { it in known }))
        }

        post("/decks") {
            val user = linked(devices) ?: return@post
            handleImport(config, importer, importEnabled, user.userId)
        }
    }
}

/** The linked computer's account, or null after answering a stranger. */
private suspend fun ImportContext.linked(devices: DeviceLinks): User? {
    val from = call.clientSource()
    val user = call.bearerToken()?.let { token -> withContext(Dispatchers.IO) { devices.authenticate(token, from) } }
    if (user == null) {
        call.respond(
            HttpStatusCode.Unauthorized,
            ErrorResponse("UNAUTHENTICATED", "Sign in to continue.", null),
        )
    }
    return user
}

/** [ownerUserId]'s deck names, as the Deck Depot lists them. */
internal fun deckNames(
    dataSource: DataSource,
    ownerUserId: UUID,
): List<String> =
    dataSource.connection.use { connection ->
        connection.prepareStatement(
            "SELECT display_name FROM imported_deck WHERE owner_user_id = ? ORDER BY lower(display_name)",
        ).use { statement ->
            statement.setObject(1, ownerUserId)
            statement.executeQuery().use { rows ->
                buildList { while (rows.next()) add(rows.getString(1)) }
            }
        }
    }
