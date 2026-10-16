package net.barnflix.proxic.deck

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import net.barnflix.proxic.ErrorResponse
import java.util.UUID

// Deck sharing routes — PHASE_04 §4.29–§4.35, §4.99, §4.100.
//
// Split from DeckRoutes.kt when detekt found `deckRoutes` past its
// length and complexity limits.
//
// Every route here answers the same way to someone with no access:
// 404, never 403 (§4.65). The one deliberate exception is a share
// RECIPIENT asking who else holds the deck — they can see the deck,
// so a 404 would be a lie they could disprove (§4.71).

fun Route.shareRoutes(
    authorization: DeckAuthorization,
    sharing: DeckSharing,
) {
    // §4.32 — share with a named user.
    post("/{deckId}/shares") {
        val deckId =
            deckIdOrNull() ?: return@post call.respond(
                HttpStatusCode.BadRequest,
                ErrorResponse("INVALID_DECK_ID", "That is not a deck id.", null),
            )

        // §4.65 before anything else: a stranger must not be
        // able to probe which deck ids exist by watching whether
        // sharing fails differently.
        if (!authorization.accessFor(callerId(), deckId).mayView()) {
            return@post call.respond(
                HttpStatusCode.NotFound,
                ErrorResponse("DECK_NOT_FOUND", "No such deck.", null),
            )
        }

        val body =
            runCatching { call.receive<ShareRequest>() }.getOrNull()
                ?: return@post call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_REQUEST", "Expected a username.", null),
                )

        when (val result = sharing.share(deckId, callerId(), body.username)) {
            // §4.33 — asking twice is idempotent, and says so
            // with 200 rather than 201.
            is ShareResult.AlreadyShared ->
                call.respond(HttpStatusCode.OK, result.recipient.view())

            is ShareResult.Created ->
                call.respond(HttpStatusCode.Created, result.recipient.view())

            is ShareResult.Rejected ->
                call.respond(
                    when (result.code) {
                        "DECK_OWNER_REQUIRED" -> HttpStatusCode.Forbidden
                        "SHARE_USER_NOT_FOUND" -> HttpStatusCode.NotFound
                        else -> HttpStatusCode.UnprocessableEntity
                    },
                    ErrorResponse(result.code, result.detail, null),
                )
        }
    }

    // §4.99 — who holds this deck. The OWNER only: a recipient
    // has no need of the sharing graph, and it would tell them
    // who else uses this server.
    get("/{deckId}/shares") {
        val deckId =
            deckIdOrNull() ?: return@get call.respond(
                HttpStatusCode.BadRequest,
                ErrorResponse("INVALID_DECK_ID", "That is not a deck id.", null),
            )

        when (authorization.accessFor(callerId(), deckId)) {
            DeckAccess.NO_ACCESS ->
                return@get call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("DECK_NOT_FOUND", "No such deck.", null),
                )

            // §4.71 — the recipient can see the deck, so 403
            // rather than a 404 that they could disprove.
            DeckAccess.SHARED ->
                return@get call.respond(
                    HttpStatusCode.Forbidden,
                    ErrorResponse(
                        "DECK_OWNER_REQUIRED",
                        "Only the owner can see who this deck is shared with.",
                        null,
                    ),
                )

            DeckAccess.OWNER -> Unit
        }

        val recipients = sharing.recipientsOf(deckId).map { it.view() }
        call.respond(ShareListResponse(recipients, recipients.size))
    }

    // §4.34 — revoke by recipient id, which is what the owner's
    // UI holds after listing.
    delete("/{deckId}/shares/{userId}") {
        val deckId =
            deckIdOrNull() ?: return@delete call.respond(
                HttpStatusCode.BadRequest,
                ErrorResponse("INVALID_DECK_ID", "That is not a deck id.", null),
            )
        val recipientId =
            call.parameters["userId"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@delete call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_USER_ID", "That is not a user id.", null),
                )

        if (!authorization.accessFor(callerId(), deckId).mayView()) {
            return@delete call.respond(
                HttpStatusCode.NotFound,
                ErrorResponse("DECK_NOT_FOUND", "No such deck.", null),
            )
        }

        val refusal = sharing.revoke(deckId, callerId(), recipientId)
        if (refusal is ShareResult.Rejected) {
            return@delete call.respond(
                HttpStatusCode.Forbidden,
                ErrorResponse(refusal.code, refusal.detail, null),
            )
        }
        // Idempotent: revoking a share that is not there leaves
        // the state the caller asked for (§4.34).
        call.respond(HttpStatusCode.NoContent)
    }
}
