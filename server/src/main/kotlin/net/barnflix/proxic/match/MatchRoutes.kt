package net.barnflix.proxic.match

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondFile
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.util.pipeline.PipelineContext
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.PRINCIPAL_KEY
import java.util.UUID

// Match routes — PHASE_06 §6.10, §6.11, §6.114.
//
// Two endpoints. Starting a match, and finding the one you are in.
//
// §6.10 is the rule that shapes the request body: the browser
// supplies ONLY the setup reference. Not participants, not seats,
// not deck ids, not the player count, not the preset, not Forge
// options. All of those come from the immutable Phase 5 setup,
// because a client that can name its own seat can name somebody
// else's — and because the whole value of freezing a setup is lost
// if the launch can contradict it.
//
// Everything about WHO MAY lives in MatchLauncher, inside the
// transaction that claims. These handlers parse, call, and map the
// answer to a status code.

private const val MATCH_ID = "matchId"

@Serializable
data class LaunchRequest(val setupId: String = "")

@Serializable
data class MatchParticipantView(
    val userId: String,
    val seatNumber: Int,
    val displayName: String,
    /**
     * §5.47's rule, carried into the match: your own deck by name,
     * everybody else's as a fact. The lobby settled this and a
     * match is not a reason to unsettle it — if anything the stakes
     * are higher, because this is the moment somebody would most
     * like to know what they are about to face.
     */
    val deckName: String? = null,
)

@Serializable
data class MatchView(
    val matchId: String,
    val roomId: String,
    val status: String,
    val presetId: String,
    val participants: List<MatchParticipantView>,
)

@Serializable
data class MatchResponse(val match: MatchView)

/** §6.114 — null is a real answer: you are in no match. */
@Serializable
data class CurrentMatchResponse(val match: MatchView? = null)

/** Built per viewer, for the reason [MatchParticipantView] gives. */
private fun Match.viewFor(viewerId: UUID): MatchView =
    MatchView(
        matchId = matchId.toString(),
        roomId = roomId.toString(),
        status = status.name,
        presetId = presetId,
        participants =
            participants.map { participant ->
                MatchParticipantView(
                    userId = participant.userId.toString(),
                    seatNumber = participant.seatNumber,
                    displayName = participant.displayName,
                    deckName = participant.deckName.takeIf { participant.userId == viewerId },
                )
            },
    )

fun Route.matchRoutes(
    launcher: MatchLauncher,
    matches: MatchStore,
    starter: MatchStarter = MatchStarter.NONE,
    rooms: net.barnflix.proxic.room.RoomService? = null,
    roomAnnouncer: net.barnflix.proxic.room.RoomAnnouncer =
        net.barnflix.proxic.room.SilentAnnouncer,
    matchAnnouncer: MatchAnnouncer = MatchAnnouncer.NONE,
    control: MatchControl = MatchControl.NONE,
    assets: MatchAssets = MatchAssets.NONE,
    artStore: net.barnflix.proxic.deck.ArtStore? = null,
) {
    route("/matches") {
        matchAssetRoute(assets, artStore)

        // §6.10, §6.11 — the host starts it.
        post {
            val body =
                runCatching { call.receive<LaunchRequest>() }.getOrNull()
                    ?: return@post respondBadRequest("Expected a setup id.")
            val setupId =
                runCatching { UUID.fromString(body.setupId) }.getOrNull()
                    ?: return@post respondBadRequest("That is not a setup id.")

            when (val result = launcher.launch(setupId, callerId())) {
                is LaunchResult.Refused -> respondRefusal(result.error)
                is LaunchResult.Launched -> {
                    // TELL THE OTHER PLAYER. The room just became
                    // IN_MATCH and a match exists; without this
                    // their lobby still shows a prepared room and
                    // they would have to refresh to find out a
                    // match had started. Found by the audit that
                    // followed the "leave room" bug.
                    rooms?.find(result.match.roomId)?.let { roomAnnouncer.roomChanged(it) }
                    matchAnnouncer.matchChanged(result.match, null, null)

                    // §6.17 — the answer is LAUNCHING. Forge starts
                    // behind it, and the match becomes RUNNING when
                    // it does. Waiting here would hold the request
                    // open across a JVM spawn.
                    starter.begin(result.match)
                    call.respond(
                        HttpStatusCode.Created,
                        MatchResponse(result.match.viewFor(callerId())),
                    )
                }
            }
        }

        // §6.114 — what a page asks on load, so a refresh puts you
        // back into the match rather than outside it.
        get("/current") {
            val match = matches.activeMatchOf(callerId())
            call.respond(CurrentMatchResponse(match?.viewFor(callerId())))
        }

        /**
         * §6.162 — the escape hatch.
         *
         * A match that has stopped responding leaves its room
         * locked IN_MATCH: §6.152 means no lobby action can end
         * it, so until this existed the players could not leave,
         * close, or prepare again until the 24-hour sweep. That
         * happened twice in testing.
         *
         * ANY PARTICIPANT may do it, not just the host. The
         * trapped case is precisely the one where somebody's
         * browser or connection is gone, and a host-only hatch
         * would be shut exactly when it is needed. The tradeoff
         * is that one player can end the other's game, and it is
         * worth taking because nothing is at stake in the
         * result: §6.153 forbids declaring the opponent the
         * winner, so an abandoned match records no winner at all.
         * There is nothing to gain by abandoning a game you are
         * losing.
         */
        post("/{$MATCH_ID}/abandon") {
            val matchId =
                call.parameters[MATCH_ID]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                    ?: return@post respondBadRequest("That is not a match id.")

            val match = matches.find(matchId)
            // A match you are not in and one that does not exist
            // are the same answer (§4.65).
            if (match == null || match.participants.none { it.userId == callerId() }) {
                return@post call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("MATCH_NOT_FOUND", "No such match.", call.callId),
                )
            }
            if (match.status != MatchStatus.LAUNCHING && match.status != MatchStatus.RUNNING) {
                return@post call.respond(
                    HttpStatusCode.Conflict,
                    ErrorResponse(
                        "MATCH_NOT_RUNNING",
                        "That match is already over.",
                        call.callId,
                    ),
                )
            }

            control.abandon(match)
            call.respond(
                MatchResponse(
                    match.copy(status = MatchStatus.TERMINATED).viewFor(callerId()),
                ),
            )
        }

        // §6.108 — participants only. Knowing a match id is not
        // sufficient, and there is no spectator access in Phase 6.
        get("/{$MATCH_ID}") {
            val matchId =
                call.parameters[MATCH_ID]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                    ?: return@get respondBadRequest("That is not a match id.")

            val match = matches.find(matchId)
            // §4.65's lesson for the fifth phase running: a match
            // you are not in and a match that does not exist are
            // the same answer.
            if (match == null || match.participants.none { it.userId == callerId() }) {
                return@get call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("MATCH_NOT_FOUND", "No such match.", call.callId),
                )
            }
            call.respond(MatchResponse(match.viewFor(callerId())))
        }
    }
}

// --- plumbing ---------------------------------------------------------------

private typealias Handler = PipelineContext<Unit, ApplicationCall>

private fun Handler.callerId(): UUID = call.attributes[PRINCIPAL_KEY].user.userId

private suspend fun Handler.respondBadRequest(detail: String) {
    call.respond(
        HttpStatusCode.BadRequest,
        ErrorResponse("INVALID_REQUEST", detail, call.callId),
    )
}

private suspend fun Handler.respondRefusal(error: LaunchError) {
    val status =
        when (error) {
            // A setup you may not launch and one that was never
            // issued are the same answer.
            LaunchError.SetupNotFound -> HttpStatusCode.NotFound

            // §6.11 — you are allowed to ask; you are not the host.
            LaunchError.HostRequired -> HttpStatusCode.Forbidden

            // The request was well formed and the world disagrees.
            LaunchError.AlreadyLaunched,
            LaunchError.SetupNotReady,
            -> HttpStatusCode.Conflict

            // Understood, and cannot be carried out as asked.
            is LaunchError.RevalidationFailed -> HttpStatusCode.UnprocessableEntity
        }
    call.respond(status, ErrorResponse(error.code, error.detail, call.callId))
}

/**
 * §6.122 — the match-scoped artwork route, on its own.
 *
 * Extracted because matchRoutes was over detekt's complexity
 * ceiling with it inlined, and because it is a different kind of
 * thing from the rest of that file: everything else there changes
 * a match, and this only reads an image.
 */
private fun Route.matchAssetRoute(
    assets: MatchAssets,
    artStore: net.barnflix.proxic.deck.ArtStore?,
) {
    // §6.122 — match-scoped artwork.
    //
    // A player may legally see an opponent's card during a
    // match without gaining any access to that opponent's
    // deck, so this cannot be the Deck Depot route with a
    // different name. What it serves is decided by what the
    // viewer's own snapshots have already shown them, which is
    // §6.129: seeing one card does not open the package.
    //
    // §6.123 — the reference is a content hash, never a path,
    // a deck id or an index into anything. The shape is
    // validated before it is used, so traversal is impossible
    // whatever arrives.
    get("/{matchId}/assets/{assetId}") {
        val assetId = call.parameters["assetId"].orEmpty()
        if (!assetId.matches(Regex("[0-9a-f]{64}"))) {
            return@get call.respond(
                HttpStatusCode.BadRequest,
                ErrorResponse("INVALID_ASSET_ID", "That is not an asset id.", null),
            )
        }
        val matchId =
            call.parameters["matchId"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@get call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_MATCH_ID", "That is not a match id.", null),
                )

        // §4.65's rule, for the sixth phase running: an asset
        // you may not see and one that does not exist are the
        // same answer. A 403 here would confirm that a
        // particular image is in an opponent's deck, which is
        // most of what §6.129 is protecting.
        if (!assets.mayFetch(matchId, callerId(), assetId)) {
            return@get call.respond(
                HttpStatusCode.NotFound,
                ErrorResponse("ASSET_NOT_FOUND", "No such asset.", null),
            )
        }

        val store =
            artStore
                ?: return@get call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("ASSET_NOT_FOUND", "No such asset.", null),
                )
        // The table gets the 384-px copy made at import (§2.134); the close-up
        // asks for the full scan (?size=full, PHASE_07 AMENDMENT 8), under the
        // same authorisation -- a size is no more visible than its picture.
        val full = call.request.queryParameters["size"] == "full"
        val file =
            store.fileFor(assetId, closeUp = full)
                ?: return@get call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("ASSET_NOT_FOUND", "No such asset.", null),
                )

        // `private`, for the reason the Deck Depot route gives:
        // Cloudflare sits in front of this server and a shared
        // cache would serve one viewer's authorised image to
        // somebody who was never shown it. The viewer's own
        // browser may keep it, because an asset id is a content
        // hash and those bytes cannot come to mean something
        // else.
        call.response.header(
            io.ktor.http.HttpHeaders.CacheControl,
            "private, max-age=31536000, immutable",
        )
        call.respondFile(file)
    }
}
