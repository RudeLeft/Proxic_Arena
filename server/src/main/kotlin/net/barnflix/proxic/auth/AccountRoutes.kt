package net.barnflix.proxic.auth

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.application.log
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.ServerConfig

// The routes that change an account — PHASE_03 §3.35–§3.38.
//
// Split from AuthRoutes.kt when detekt found `authRoutes` past its
// complexity threshold. The answer to a route table that has outgrown
// one function is a second function, not a higher threshold.

private const val MAX_DISPLAY_NAME = 64

/** Spec 0006 — the owner's set: avatar-01 .. avatar-50 (as the database's CHECK). */
private val AVATAR = Regex("^avatar-(0[1-9]|[1-4][0-9]|50)$")

fun Route.accountRoutes(
    config: ServerConfig,
    accounts: Accounts,
    sessions: Sessions,
    changes: AccountChanges,
    // Spec 0026 — the "password was changed" and "email was changed" notices.
    resets: ResetDesk? = null,
) {
    resets?.let { accountEmailRoutes(config, accounts, sessions, it) }

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
        // §3.94 — the event, never the password. Every session died
        // with it (§3.36), which is itself worth recording.
        call.application.log.authEvent(
            AuthEvent.PASSWORD_CHANGED,
            AuthResult.SUCCESS,
            username = principal.user.username,
            userId = principal.user.userId,
            sessionId = principal.sessionId,
        )
        resets?.let { desk -> call.application.launch(Dispatchers.IO) { desk.passwordChanged(principal.user) } }
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
        call.application.log.authEvent(
            AuthEvent.DISPLAY_NAME_CHANGED,
            AuthResult.SUCCESS,
            username = principal.user.username,
            userId = principal.user.userId,
        )
        changes.changed()
        call.respond(MeResponse(true, principal.user.copy(displayName = name).view()))
    }

    // Spec 0006 — your avatar, from the owner's set; everybody's Players
    // list is told, so it shows at once.
    post("/avatar") {
        if (!call.csrfOk(config)) return@post
        val principal = call.requireAuth(sessions) ?: return@post
        val avatar =
            runCatching { call.receive<AvatarRequest>() }.getOrNull()?.avatar
                ?.takeIf { it.matches(AVATAR) }
                ?: return@post call.respond(
                    HttpStatusCode.UnprocessableEntity,
                    ErrorResponse("INVALID_AVATAR", "Choose one of the pictures.", null),
                )
        accounts.updateAvatar(principal.user.userId, avatar)
        changes.changed()
        call.respond(HttpStatusCode.NoContent)
    }
}

@Serializable
data class EmailView(val email: String?)

@Serializable
data class EmailChangeRequest(val email: String = "", val currentPassword: String = "")

/**
 * Spec 0026 — your email address, where a password reset goes. Changing it
 * takes your current password, as changing the password does: a borrowed
 * session must not be enough to redirect the account's resets. The old
 * address is told.
 */
private fun Route.accountEmailRoutes(
    config: ServerConfig,
    accounts: Accounts,
    sessions: Sessions,
    resets: ResetDesk,
) {
    val addresses = resets.addresses
    get("/email") {
        val principal = call.requireAuth(sessions) ?: return@get
        call.respond(EmailView(addresses.of(principal.user.userId)))
    }

    post("/email") {
        if (!call.csrfOk(config)) return@post
        val principal = call.requireAuth(sessions) ?: return@post
        val body =
            runCatching { call.receive<EmailChangeRequest>() }.getOrNull()
                ?: return@post call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_REQUEST", "Expected an email address and your password.", null),
                )
        // Checked by signing in again, as the password change does; the
        // session that makes is ended at once.
        val check = accounts.login(principal.user.username, body.currentPassword)
        if (check !is LoginResult.Success) {
            return@post call.respond(
                HttpStatusCode.Unauthorized,
                ErrorResponse("INVALID_CREDENTIALS", "That password is not correct.", null),
            )
        }
        sessions.revokeSession(check.principal.sessionId)
        val email =
            Emails.normalize(body.email)
                ?: return@post call.respond(
                    HttpStatusCode.UnprocessableEntity,
                    ErrorResponse("INVALID_EMAIL", "That is not an email address.", null),
                )
        val old = addresses.of(principal.user.userId)
        addresses.set(principal.user.userId, email)
        if (old != null && old != email) {
            call.application.launch(Dispatchers.IO) { resets.emailChanged(principal.user, old) }
        }
        call.respond(EmailView(email))
    }
}
