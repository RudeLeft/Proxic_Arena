package net.barnflix.proxic.admin

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.auth.Delivery
import net.barnflix.proxic.auth.InviteDesk
import net.barnflix.proxic.auth.InviteView
import net.barnflix.proxic.auth.NewInvite
import net.barnflix.proxic.auth.Role
import java.util.UUID

// Inviting someone — spec 0014 (owner 2026-10-25). Administrators only.
//
// The link's code is shown once, to the administrator who made it, so a
// link that did not arrive (no email account set up, a spam folder) can
// still be sent by hand. It is never stored readable and never listed.

@Serializable
data class InviteRequest(val email: String = "", val role: String = "PLAYER")

@Serializable
data class InvitesResponse(val invites: List<InviteView>, val emailReady: Boolean)

@Serializable
data class InviteSent(
    val email: String,
    /** The link, this once: to copy when it was not emailed, or to send again by hand. */
    val link: String,
    val emailed: Boolean,
    val expiresAt: String,
    /** Why the email did not go, when it was tried and failed. */
    val emailProblem: String? = null,
)

fun Route.adminInviteRoutes(admin: AdminServices) {
    val desk = admin.inviteDesk ?: return

    get("/invites") {
        call.asAdmin(admin) ?: return@get
        call.respond(InvitesResponse(desk.invites.recent(), desk.emailReady()))
    }

    post("/invites") {
        val by = call.asAdmin(admin) ?: return@post
        val body = runCatching { call.receive<InviteRequest>() }.getOrNull()
        val role = Role.entries.firstOrNull { it.name == body?.role }
        if (body == null || role == null) {
            return@post call.respond(
                HttpStatusCode.BadRequest,
                ErrorResponse("INVALID_REQUEST", "Expected an email address and PLAYER or ADMIN.", null),
            )
        }
        val invite =
            desk.invites.create(body.email, role, by.user.userId)
                ?: return@post call.respond(
                    HttpStatusCode.UnprocessableEntity,
                    ErrorResponse("INVALID_EMAIL", "That is not an email address.", null),
                )
        val actions = admin.records.actions
        actions.record(by.user.userId, by.user.username, AdminAction.INVITE_SENT, invite.email, "role=$role")
        call.respond(HttpStatusCode.Created, sent(desk, invite, by.user.displayName))
    }

    post("/invites/{inviteId}/resend") {
        val by = call.asAdmin(admin) ?: return@post
        val id = call.parameters["inviteId"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
        val invite =
            id?.let { desk.invites.resend(it, by.user.userId) }
                ?: return@post call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("INVITE_NOT_FOUND", "No such invitation.", null),
                )
        admin.records.actions.record(by.user.userId, by.user.username, AdminAction.INVITE_RESENT, invite.email)
        call.respond(sent(desk, invite, by.user.displayName))
    }

    post("/invites/{inviteId}/cancel") {
        val by = call.asAdmin(admin) ?: return@post
        val id = call.parameters["inviteId"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
        if (id == null || !desk.invites.cancel(id)) {
            return@post call.respond(
                HttpStatusCode.NotFound,
                ErrorResponse("INVITE_NOT_FOUND", "That invitation has already ended.", null),
            )
        }
        admin.records.actions.record(by.user.userId, by.user.username, AdminAction.INVITE_CANCELLED, id.toString())
        call.respond(HttpStatusCode.NoContent)
    }
}

/** The answer to an invite: the link this once, and whether it was emailed (off the request thread). */
private suspend fun sent(
    desk: InviteDesk,
    invite: NewInvite,
    inviter: String,
): InviteSent {
    val delivery = withContext(Dispatchers.IO) { desk.deliver(invite, inviter) }
    return InviteSent(
        email = invite.email,
        link = desk.linkFor(invite.token),
        emailed = delivery == Delivery.Sent,
        expiresAt = invite.expiresAt.toString(),
        emailProblem = (delivery as? Delivery.Failed)?.why,
    )
}
