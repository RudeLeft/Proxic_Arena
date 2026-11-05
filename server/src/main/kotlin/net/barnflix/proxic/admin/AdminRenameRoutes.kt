package net.barnflix.proxic.admin

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.application.log
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.put
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.auth.AuthEvent
import net.barnflix.proxic.auth.AuthResult
import net.barnflix.proxic.auth.DisplayNameRequest
import net.barnflix.proxic.auth.DisplayNames
import net.barnflix.proxic.auth.authEvent

// Spec 0041 Amendment 3 — an administrator renames a player (owner
// 2026-11-04, canvas choices A/A).
//
//   PUT /api/admin/accounts/{userId}/display-name   {"displayName": "…"}
//
// Only the display name; the username a player signs in with never
// changes. The same 1-12 rule as sign-up. Everybody's Players list
// changes at once, and the player is told once ("An administrator
// changed your display name to …"), now or when they next connect.

fun Route.adminRenameRoutes(admin: AdminServices) {
    put("/accounts/{userId}/display-name") {
        val by = call.asAdmin(admin) ?: return@put
        val userId = call.userIdParam() ?: return@put
        val renames =
            admin.renames
                ?: return@put call.respond(
                    HttpStatusCode.ServiceUnavailable,
                    ErrorResponse("NO_DATABASE", "Renaming needs the database.", null),
                )
        val name =
            runCatching { call.receive<DisplayNameRequest>() }.getOrNull()?.displayName?.trim()
                ?: return@put call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_REQUEST", "Expected a display name.", null),
                )
        DisplayNames.rejectionReason(name)?.let { refused ->
            return@put call.respond(
                HttpStatusCode.UnprocessableEntity,
                ErrorResponse("INVALID_DISPLAY_NAME", refused, null),
            )
        }
        val renamed =
            renames.rename(userId, name, tell = userId != by.user.userId)
                ?: return@put call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("ACCOUNT_NOT_FOUND", "No such account.", null),
                )
        admin.records.actions.record(
            by.user.userId,
            by.user.username,
            AdminAction.DISPLAY_NAME_CHANGED,
            renamed.username,
            "from=${renamed.was}; to=$name",
        )
        call.application.log.authEvent(
            AuthEvent.DISPLAY_NAME_CHANGED,
            AuthResult.SUCCESS,
            username = renamed.username,
            userId = userId,
            detail = "by=${by.user.username}",
        )
        call.respond(DoneResponse(renamed.username, "${renamed.was} is now $name."))
        admin.accountsChanged()
        admin.renamed(userId)
    }
}
