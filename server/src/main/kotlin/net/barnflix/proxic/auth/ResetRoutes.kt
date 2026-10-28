package net.barnflix.proxic.auth

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.ServerConfig

// The page behind a password reset link — spec 0026. Mounted under
// /api/auth beside the join page's routes, and guarded the same way: a
// stranger reaches it (the gate lets it through), so it gets the sign-in
// route's origin check and throttle, and every bad link the same answer.
//
//   POST /api/auth/reset/peek   whether the link still works (204); it does
//                               not say whose account it is (owner 2026-10-28)
//   POST /api/auth/reset        the new password; signs the player in

@Serializable
data class ResetPeekRequest(val token: String = "")

@Serializable
data class ResetRequest(val token: String = "", val password: String = "")

private val RESET_INVALID =
    ErrorResponse(
        "RESET_INVALID",
        "This reset link no longer works. Ask the person who runs your Proxic Arena for a new one.",
        null,
    )

/** The throttle's key for the reset page: one per client, whatever the link. */
private const val RESET_KEY = "<reset>"

fun Route.resetRoutes(
    config: ServerConfig,
    desk: ResetDesk,
    throttle: LoginThrottle,
    signIns: SignInLog? = null,
) {
    route("/auth/reset") {
        post("/peek") {
            if (!call.joinAllowed(config, throttle, RESET_KEY)) return@post
            val token = runCatching { call.receive<ResetPeekRequest>() }.getOrNull()?.token.orEmpty()
            if (desk.resets.peek(token) == null) {
                throttle.recordFailure(call.clientSource(), RESET_KEY)
                return@post call.respond(HttpStatusCode.Gone, RESET_INVALID)
            }
            call.respond(HttpStatusCode.NoContent)
        }

        post {
            if (!call.joinAllowed(config, throttle, RESET_KEY)) return@post
            val body =
                runCatching { call.receive<ResetRequest>() }.getOrNull()
                    ?: return@post call.respond(
                        HttpStatusCode.BadRequest,
                        ErrorResponse("INVALID_REQUEST", "Expected a new password.", null),
                    )
            when (val result = desk.resets.redeem(body.token, body.password)) {
                ResetResult.Invalid -> {
                    throttle.recordFailure(call.clientSource(), RESET_KEY)
                    call.respond(HttpStatusCode.Gone, RESET_INVALID)
                }

                is ResetResult.Refused ->
                    call.respond(HttpStatusCode.UnprocessableEntity, ErrorResponse(result.code, result.detail, null))

                is ResetResult.Done -> {
                    signIns?.record(SignInKind.SIGNED_IN, result.user.username, call.clientSource())
                    call.application.launch(Dispatchers.IO) { desk.passwordChanged(result.user) }
                    call.issueSession(
                        config,
                        LoginResult.Success(Principal(result.user, result.sessionId), result.token),
                    )
                    call.respond(MeResponse(true, result.user.view()))
                }
            }
        }
    }
}
