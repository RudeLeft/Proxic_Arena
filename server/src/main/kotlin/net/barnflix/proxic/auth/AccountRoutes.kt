package net.barnflix.proxic.auth

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.ServerConfig

// The routes that change an account — PHASE_03 §3.35–§3.38.
//
// Split from AuthRoutes.kt when detekt found `authRoutes` past its
// complexity threshold. The answer to a route table that has outgrown
// one function is a second function, not a higher threshold.

private const val MAX_DISPLAY_NAME = 64

fun Route.accountRoutes(
    config: ServerConfig,
    accounts: Accounts,
    sessions: Sessions,
) {
    post("/password") {
        // §3.35, §3.36.
        if (!call.csrfOk(config)) return@post
        val principal = call.requireAuth(sessions) ?: return@post
        val body =
            runCatching { call.receive<PasswordChangeRequest>() }.getOrNull()
                ?: return@post call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_REQUEST", "Expected a current and new password.", null),
                )

        // The current password is re-verified even though the caller
        // is authenticated: a borrowed session must not be enough to
        // take the account.
        if (accounts.login(principal.user.username, body.currentPassword) !is LoginResult.Success) {
            return@post call.respond(
                HttpStatusCode.Unauthorized,
                ErrorResponse("INVALID_CREDENTIALS", "That password is not correct.", null),
            )
        }
        PasswordHasher.rejectionReason(body.newPassword)?.let { reason ->
            return@post call.respond(
                HttpStatusCode.UnprocessableEntity,
                ErrorResponse("WEAK_PASSWORD", reason, null),
            )
        }

        accounts.changePassword(principal.user.userId, body.newPassword)
        // Every session died, including this one (§3.36), so the
        // cookie is cleared rather than left pointing at a revoked
        // session.
        call.clearSession(config)
        call.respond(HttpStatusCode.NoContent)
    }

    post("/display-name") {
        if (!call.csrfOk(config)) return@post
        val principal = call.requireAuth(sessions) ?: return@post
        val body =
            runCatching { call.receive<DisplayNameRequest>() }.getOrNull()
                ?: return@post call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_REQUEST", "Expected a display name.", null),
                )
        val name = body.displayName.trim()
        if (name.isEmpty() || name.length > MAX_DISPLAY_NAME) {
            return@post call.respond(
                HttpStatusCode.UnprocessableEntity,
                ErrorResponse(
                    "INVALID_DISPLAY_NAME",
                    "A display name is 1 to $MAX_DISPLAY_NAME characters.",
                    null,
                ),
            )
        }
        accounts.updateDisplayName(principal.user.userId, name)
        call.respond(MeResponse(true, principal.user.copy(displayName = name).view()))
    }
}
