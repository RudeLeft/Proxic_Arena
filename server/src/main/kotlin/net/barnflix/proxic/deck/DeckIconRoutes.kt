package net.barnflix.proxic.deck

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.put
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import javax.sql.DataSource

// A deck's icon — spec 0012 (owner 2026-10-25).
//
// The owner picks one of the 100 icons, or none to go back to the
// suggestion from the deck's colours. Somebody the deck is shared with
// sees the owner's choice and may not change it; a stranger learns
// nothing, as with rename and delete (§4.65, §4.66).

@Serializable
data class IconRequest(val icon: String? = null)

@Serializable
data class IconResponse(val deckId: String, val icon: String?)

fun Route.iconRoute(
    dataSource: DataSource,
    authorization: DeckAuthorization,
) {
    put("/{deckId}/icon") {
        val deckId =
            deckIdOrNull() ?: return@put call.respond(
                HttpStatusCode.BadRequest,
                ErrorResponse("INVALID_DECK_ID", "That is not a deck id.", null),
            )
        when (authorization.accessFor(callerId(), deckId)) {
            DeckAccess.NO_ACCESS ->
                return@put call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("DECK_NOT_FOUND", "No such deck.", null),
                )

            DeckAccess.SHARED ->
                return@put call.respond(
                    HttpStatusCode.Forbidden,
                    ErrorResponse("DECK_OWNER_REQUIRED", "Only the owner can change this deck's icon.", null),
                )

            DeckAccess.OWNER -> Unit
        }

        val icon =
            runCatching { call.receive<IconRequest>() }.getOrNull()?.icon
                .also { chosen ->
                    if (chosen != null && chosen !in DeckIcons.NAMES) {
                        return@put call.respond(
                            HttpStatusCode.UnprocessableEntity,
                            ErrorResponse("INVALID_ICON", "That is not one of the deck icons.", null),
                        )
                    }
                }

        dataSource.connection.use { connection ->
            connection.prepareStatement("UPDATE imported_deck SET icon = ? WHERE deck_id = ?").use {
                it.setString(1, icon)
                it.setObject(2, deckId)
                it.executeUpdate()
            }
        }
        call.respond(IconResponse(deckId.toString(), icon))
    }
}
