package net.barnflix.proxic.admin

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.AccountStatus
import net.barnflix.proxic.auth.DisplayNames
import net.barnflix.proxic.auth.Principal
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.Sessions
import net.barnflix.proxic.auth.SignInLog
import net.barnflix.proxic.auth.SignInView
import net.barnflix.proxic.auth.csrfOk
import net.barnflix.proxic.auth.requireAdmin
import net.barnflix.proxic.report.adminReportRoutes
import java.util.UUID

// The Admin page's API — PHASE_07 §7.67, Amendment 9.
//
// AMENDS PHASE 3, which kept account administration on the host only
// (`arena-admin`, which stays). Every route here asks the SESSION
// whether the caller is an administrator, every time (§3.19): the
// page hiding its link from players is the courtesy, this is the
// protection. A player gets 403 from every one of them.
//
// Accepted trade-off, owner decision 15, recorded so it is a decision
// and not a discovery: no password re-entry and no home-network
// restriction, so a browser left signed in as an administrator can
// change accounts.

@Serializable
data class CreateAccountRequest(
    val username: String = "",
    val displayName: String = "",
    val password: String = "",
    val role: String = "PLAYER",
)

@Serializable
data class StatusRequest(val status: String = "")

@Serializable
data class RoleRequest(val role: String = "")

/** Spec 0026 — an account's email address, from the Admin page. */
@Serializable
data class AccountEmailRequest(val email: String = "")

@Serializable
data class AccountsResponse(val accounts: List<AdminAccountView>)

@Serializable
data class SignInsResponse(val events: List<SignInView>)

@Serializable
data class DoneResponse(val username: String, val detail: String)

/** What is written down: admin actions, and the sign-in attempts the page reads. */
class AdminRecords(
    val actions: AdminActions,
    val signIns: SignInLog,
    /** PHASE_07 §7.56 — recent matches and their game records. */
    val matches: AdminMatches,
)

/** Everything an admin route needs, in one place, so the route table reads. */
class AdminServices(
    val config: ServerConfig,
    val sessions: Sessions,
    val adminAccounts: AdminAccounts,
    val rooms: AdminRooms,
    val records: AdminRecords,
    val serverState: () -> ServerStateView,
    /** An account was created, disabled or enabled: the lobby's lists change. */
    val accountsChanged: suspend () -> Unit = {},
    /** Spec 0014 — invitations; none without a database. */
    val inviteDesk: net.barnflix.proxic.auth.InviteDesk? = null,
    /** Spec 0014 amendment 1 — the Email tab's settings. */
    val mailSettings: net.barnflix.proxic.auth.MailSettings? = null,
    /** Spec 0026 — password resets by email; none without a database. */
    val resetDesk: net.barnflix.proxic.auth.ResetDesk? = null,
    /** Spec 0027 — every linked computer; none without a database. */
    val computers: AdminComputers? = null,
    /** Spec 0039 — players' reports of problems and ideas; none without a database. */
    val reports: net.barnflix.proxic.report.Reports? = null,
)

fun Route.adminRoutes(admin: AdminServices) {
    route("/admin") {
        get("/accounts") {
            call.asAdmin(admin) ?: return@get
            call.respond(AccountsResponse(admin.adminAccounts.list()))
        }
        post("/accounts") { createAccount(admin) }
        put("/accounts/{userId}/status") { changeStatus(admin) }
        put("/accounts/{userId}/role") { changeRole(admin) }
        // Spec 0026 — a reset link by email; there is no route that sets a password.
        adminResetRoutes(admin)
        // Spec 0027 — the Computers tab.
        adminComputerRoutes(admin)
        post("/accounts/{userId}/sign-out") { signOut(admin) }

        get("/rooms") {
            call.asAdmin(admin) ?: return@get
            call.respond(AdminRoomsResponse(admin.rooms.list()))
        }
        post("/rooms/{roomId}/close") { forceClose(admin) }

        adminInviteRoutes(admin)
        adminEmailRoutes(admin)
        // Spec 0039 — the Reports tab.
        adminReportRoutes(admin)

        get("/server") {
            call.asAdmin(admin) ?: return@get
            call.respond(admin.serverState())
        }
        get("/sign-ins") {
            call.asAdmin(admin) ?: return@get
            call.respond(SignInsResponse(admin.records.signIns.recent()))
        }

        get("/matches") {
            call.asAdmin(admin) ?: return@get
            call.respond(AdminMatchesResponse(admin.records.matches.list(), admin.records.matches.keepDays))
        }
        get("/matches/{matchId}/record") {
            call.asAdmin(admin) ?: return@get
            val matchId =
                call.parameters["matchId"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                    ?: return@get call.respond(
                        HttpStatusCode.BadRequest,
                        ErrorResponse("INVALID_MATCH_ID", "That is not a match id.", null),
                    )
            admin.records.matches.download(call, matchId)
        }
    }
}

/** An administrator, from the session; CSRF on anything that changes something. */
internal suspend fun ApplicationCall.asAdmin(admin: AdminServices): Principal? {
    val principal = requireAdmin(admin.sessions) ?: return null
    if (!csrfOk(admin.config)) return null
    return principal
}

internal suspend fun ApplicationCall.userIdParam(): UUID? =
    parameters["userId"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
        ?: run {
            respond(HttpStatusCode.NotFound, ErrorResponse("ACCOUNT_NOT_FOUND", "No such account.", null))
            null
        }

/** Spec 0011 — the changes that alter who is listed in the lobby (creating one says so itself). */
private val LIST_CHANGES = setOf(AdminAction.DISABLE_ACCOUNT, AdminAction.ENABLE_ACCOUNT)

/** Turn an account change into an answer, recording it when it happened. */
internal suspend fun ApplicationCall.answer(
    admin: AdminServices,
    by: Principal,
    change: AdminChange,
    action: AdminAction,
    detail: String? = null,
) {
    when (change) {
        AdminChange.NotFound ->
            respond(HttpStatusCode.NotFound, ErrorResponse("ACCOUNT_NOT_FOUND", "No such account.", null))

        is AdminChange.Refused ->
            respond(
                if (change.code == "LAST_ADMIN") HttpStatusCode.Conflict else HttpStatusCode.UnprocessableEntity,
                ErrorResponse(change.code, change.detail, null),
            )

        is AdminChange.Done -> {
            admin.records.actions.record(by.user.userId, by.user.username, action, change.username, detail)
            respond(DoneResponse(change.username, detail ?: action.name))
            if (action in LIST_CHANGES) admin.accountsChanged()
        }
    }
}

private suspend fun io.ktor.util.pipeline.PipelineContext<Unit, ApplicationCall>.createAccount(admin: AdminServices) {
    val by = call.asAdmin(admin) ?: return
    val body =
        runCatching { call.receive<CreateAccountRequest>() }.getOrNull()
            ?: return call.respond(
                HttpStatusCode.BadRequest,
                ErrorResponse("INVALID_REQUEST", "Expected a username, display name, password and role.", null),
            )
    val role = Role.entries.firstOrNull { it.name == body.role } ?: Role.PLAYER
    val displayName = body.displayName.trim()
    DisplayNames.rejectionReason(displayName)?.let { refused ->
        return call.respond(
            HttpStatusCode.UnprocessableEntity,
            ErrorResponse("INVALID_DISPLAY_NAME", refused, null),
        )
    }
    if (admin.adminAccounts.accounts.findByUsername(body.username) != null) {
        return call.respond(
            HttpStatusCode.Conflict,
            ErrorResponse("USERNAME_TAKEN", "There is already an account called ${body.username.trim()}.", null),
        )
    }
    val created =
        try {
            admin.adminAccounts.accounts.createUser(body.username, body.password, role, displayName)
        } catch (e: IllegalArgumentException) {
            // The username and password rules explain themselves (§3.5, §3.30).
            return call.respond(
                HttpStatusCode.UnprocessableEntity,
                ErrorResponse("INVALID_ACCOUNT", e.message ?: "That account cannot be created.", null),
            )
        }
    admin.records.actions.record(
        by.user.userId,
        by.user.username,
        AdminAction.CREATE_ACCOUNT,
        created.username,
        "role=$role",
    )
    call.respond(HttpStatusCode.Created, DoneResponse(created.username, "created"))
    admin.accountsChanged()
}

private suspend fun io.ktor.util.pipeline.PipelineContext<Unit, ApplicationCall>.changeStatus(admin: AdminServices) {
    val by = call.asAdmin(admin) ?: return
    val userId = call.userIdParam() ?: return
    val status =
        runCatching { call.receive<StatusRequest>() }.getOrNull()?.status
            ?.let { s -> AccountStatus.entries.firstOrNull { it.name == s } }
            ?: return call.respond(
                HttpStatusCode.BadRequest,
                ErrorResponse("INVALID_REQUEST", "Expected ACTIVE or DISABLED.", null),
            )
    val action = if (status == AccountStatus.DISABLED) AdminAction.DISABLE_ACCOUNT else AdminAction.ENABLE_ACCOUNT
    call.answer(admin, by, admin.adminAccounts.setStatus(userId, status), action)
}

private suspend fun io.ktor.util.pipeline.PipelineContext<Unit, ApplicationCall>.changeRole(admin: AdminServices) {
    val by = call.asAdmin(admin) ?: return
    val userId = call.userIdParam() ?: return
    val role =
        runCatching { call.receive<RoleRequest>() }.getOrNull()?.role
            ?.let { r -> Role.entries.firstOrNull { it.name == r } }
            ?: return call.respond(
                HttpStatusCode.BadRequest,
                ErrorResponse("INVALID_REQUEST", "Expected ADMIN or PLAYER.", null),
            )
    val action = if (role == Role.ADMIN) AdminAction.MAKE_ADMIN else AdminAction.MAKE_PLAYER
    call.answer(admin, by, admin.adminAccounts.setRole(userId, role), action)
}

private suspend fun io.ktor.util.pipeline.PipelineContext<Unit, ApplicationCall>.signOut(admin: AdminServices) {
    val by = call.asAdmin(admin) ?: return
    val userId = call.userIdParam() ?: return
    val (change, revoked) = admin.adminAccounts.signOutEverywhere(userId)
    call.answer(admin, by, change, AdminAction.SIGN_OUT_EVERYWHERE, "sessions=$revoked")
}

private suspend fun io.ktor.util.pipeline.PipelineContext<Unit, ApplicationCall>.forceClose(admin: AdminServices) {
    val by = call.asAdmin(admin) ?: return
    val roomId =
        call.parameters["roomId"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
            ?: return call.respond(HttpStatusCode.NotFound, ErrorResponse("ROOM_NOT_FOUND", "No such room.", null))
    val closed =
        admin.rooms.forceClose(roomId)
            ?: return call.respond(HttpStatusCode.NotFound, ErrorResponse("ROOM_NOT_FOUND", "No such room.", null))
    admin.records.actions.record(
        by.user.userId,
        by.user.username,
        AdminAction.FORCE_CLOSE_ROOM,
        roomId.toString(),
        "name=${closed.name}; matchEnded=${closed.matchEnded}",
    )
    val detail = if (closed.matchEnded) "closed; the match ended with no winner" else "closed"
    call.respond(DoneResponse(closed.name, detail))
}
