package net.barnflix.proxic.admin

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.auth.Emails
import net.barnflix.proxic.auth.ResetSend

// Spec 0026 — password resets and email addresses, from the Admin page.
//
// An administrator starts a reset; Arena emails the player a link and the
// player chooses their own password. The administrator never sees the link
// or a password (owner 2026-10-28: "I don't want to manage people's
// passwords"), so a reset that cannot be emailed is refused with the
// reason, never shown.
//
//   POST /api/admin/accounts/{userId}/password-reset
//   PUT  /api/admin/accounts/{userId}/email           {"email": "…"}

private val NOT_FOUND = ErrorResponse("ACCOUNT_NOT_FOUND", "No such account.", null)

fun Route.adminResetRoutes(admin: AdminServices) {
    post("/accounts/{userId}/password-reset") {
        val by = call.asAdmin(admin) ?: return@post
        val userId = call.userIdParam() ?: return@post
        val desk =
            admin.resetDesk
                ?: return@post call.respond(
                    HttpStatusCode.ServiceUnavailable,
                    ErrorResponse("EMAIL_NOT_SET_UP", "Password resets need the database.", null),
                )
        when (val sent = withContext(Dispatchers.IO) { desk.send(userId, by.user.userId) }) {
            ResetSend.NotFound -> call.respond(HttpStatusCode.NotFound, NOT_FOUND)
            is ResetSend.Refused ->
                call.respond(HttpStatusCode.UnprocessableEntity, ErrorResponse(sent.code, sent.detail, null))
            is ResetSend.Sent -> {
                val username = desk.addresses.user(userId)?.username.orEmpty()
                // Who and to which account; never the link (§7.67, spec 0026).
                admin.records.actions.record(
                    by.user.userId,
                    by.user.username,
                    AdminAction.PASSWORD_RESET_SENT,
                    username,
                    "to=${sent.to}",
                )
                call.respond(DoneResponse(username, "Reset email sent to ${sent.to}."))
            }
        }
    }

    put("/accounts/{userId}/email") {
        val by = call.asAdmin(admin) ?: return@put
        val userId = call.userIdParam() ?: return@put
        val desk =
            admin.resetDesk
                ?: return@put call.respond(
                    HttpStatusCode.ServiceUnavailable,
                    ErrorResponse("NO_DATABASE", "Email addresses need the database.", null),
                )
        val addresses = desk.addresses
        val user = addresses.user(userId) ?: return@put call.respond(HttpStatusCode.NotFound, NOT_FOUND)
        val email =
            runCatching { call.receive<AccountEmailRequest>() }.getOrNull()?.email
                ?.let(Emails::normalize)
                ?: return@put call.respond(
                    HttpStatusCode.UnprocessableEntity,
                    ErrorResponse("INVALID_EMAIL", "That is not an email address.", null),
                )
        val old = addresses.of(userId)
        addresses.set(userId, email)
        admin.records.actions.record(by.user.userId, by.user.username, AdminAction.EMAIL_CHANGED, user.username)
        // The old address is told, as when the player changes it.
        if (old != null && old != email) {
            call.application.launch(Dispatchers.IO) { desk.emailChanged(user, old) }
        }
        call.respond(DoneResponse(user.username, "Email address saved."))
    }
}
