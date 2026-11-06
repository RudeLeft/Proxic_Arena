package net.barnflix.proxic.admin

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import net.barnflix.proxic.ErrorResponse

// Spec 0056 — "Update waiting", from the Admin page's Server tab.
//
// GET says whether it is on and which games are still being played (who,
// and the turn when the board has said); POST {on} switches it. Both are
// administrators only, and the switch is CSRF-checked like every admin
// change (asAdmin). A switch that changed something is recorded.

internal fun Route.adminUpdateRoutes(admin: AdminServices) {
    get("/update-waiting") {
        call.asAdmin(admin) ?: return@get
        call.respond(UpdateWaitingView(admin.updateWaiting.on, admin.runningGames()))
    }
    post("/update-waiting") {
        val by = call.asAdmin(admin) ?: return@post
        val on =
            runCatching { call.receive<UpdateWaitingRequest>() }.getOrNull()?.on
                ?: return@post call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_REQUEST", "Expected on: true or false.", null),
                )
        if (admin.updateWaiting.set(on)) {
            admin.records.actions.record(
                by.user.userId,
                by.user.username,
                if (on) AdminAction.UPDATE_WAITING_ON else AdminAction.UPDATE_WAITING_OFF,
                "server",
                "gamesRunning=${admin.runningGames().size}",
            )
        }
        call.respond(UpdateWaitingView(admin.updateWaiting.on, admin.runningGames()))
    }
}
