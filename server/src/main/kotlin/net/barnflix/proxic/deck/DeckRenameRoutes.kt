package net.barnflix.proxic.deck

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.patch
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import java.util.UUID
import javax.sql.DataSource

// Renaming a deck — PHASE_07 §7.65, owner decisions 17 and 18.
//
// The owner only, to a name they do not already use. Allowed while
// the deck is selected in a room, because a room, a setup and a match
// all refer to the deck by id: the name is a label, and changing it
// moves nothing. A room holding the deck is told, so its members see
// the new name without waiting for some other change.

@Serializable
data class RenameRequest(val displayName: String = "")

@Serializable
data class RenamedResponse(val deckId: String, val displayName: String)

private sealed interface RenameResult {
    data object Renamed : RenameResult

    data object Gone : RenameResult

    data object Taken : RenameResult
}

fun Route.renameRoute(
    dataSource: DataSource,
    authorization: DeckAuthorization,
    deckAccess: DeckAccessListener = DeckAccessListener.NONE,
) {
    patch("/{deckId}") {
        val deckId =
            deckIdOrNull() ?: return@patch call.respond(
                HttpStatusCode.BadRequest,
                ErrorResponse("INVALID_DECK_ID", "That is not a deck id.", null),
            )

        // The same three answers as delete (§4.65, §4.66): a stranger
        // learns nothing, a recipient is told it is not theirs.
        val owner = callerId()
        when (authorization.accessFor(owner, deckId)) {
            DeckAccess.NO_ACCESS ->
                return@patch call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("DECK_NOT_FOUND", "No such deck.", null),
                )

            DeckAccess.SHARED ->
                return@patch call.respond(
                    HttpStatusCode.Forbidden,
                    ErrorResponse("DECK_OWNER_REQUIRED", "Only the owner can rename this deck.", null),
                )

            DeckAccess.OWNER -> Unit
        }

        val body =
            runCatching { call.receive<RenameRequest>() }.getOrNull()
                ?: return@patch call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_REQUEST", "Expected a deck name.", null),
                )
        val name =
            DeckNames.typed(body.displayName) ?: return@patch call.respond(
                HttpStatusCode.UnprocessableEntity,
                ErrorResponse(
                    "INVALID_DECK_NAME",
                    "A deck name is 1 to ${DeckNames.MAX_LENGTH} characters on one line.",
                    null,
                ),
            )

        when (rename(dataSource, owner, deckId, name)) {
            RenameResult.Gone ->
                call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("DECK_NOT_FOUND", "No such deck.", null),
                )

            RenameResult.Taken ->
                call.respond(
                    HttpStatusCode.Conflict,
                    ErrorResponse("DECK_NAME_TAKEN", DeckNames.takenMessage(name), null),
                )

            RenameResult.Renamed -> {
                deckAccess.deckRenamed(deckId)
                call.respond(RenamedResponse(deckId.toString(), name))
            }
        }
    }
}

/**
 * One transaction under the owner's name lock, so a rename and an
 * import racing for the same name cannot both win. Renaming a deck to
 * its own name in different capitals is allowed: the deck itself is
 * not a clash.
 */
private fun rename(
    dataSource: DataSource,
    owner: UUID,
    deckId: UUID,
    name: String,
): RenameResult =
    dataSource.connection.use { connection ->
        connection.autoCommit = false
        try {
            DeckNames.lockOwner(connection, owner)
            if (DeckNames.taken(connection, owner, name, except = deckId)) {
                connection.rollback()
                return@use RenameResult.Taken
            }
            val updated =
                connection.prepareStatement(
                    "UPDATE imported_deck SET display_name = ? WHERE deck_id = ? AND owner_user_id = ?",
                ).use {
                    it.setString(1, name)
                    it.setObject(2, deckId)
                    it.setObject(3, owner)
                    it.executeUpdate()
                }
            connection.commit()
            if (updated == 0) RenameResult.Gone else RenameResult.Renamed
        } catch (e: java.sql.SQLException) {
            connection.rollback()
            throw e
        }
    }
