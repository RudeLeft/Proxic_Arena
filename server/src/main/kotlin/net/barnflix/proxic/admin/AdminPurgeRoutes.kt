package net.barnflix.proxic.admin

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.hall.HallGameSource
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import javax.sql.DataSource

// Spec 0048 (owner 2026-11-01) — the Admin "Belt and records" tab: the
// Belt as it stands and Reset the Belt (type RESET), and the purge, each
// previewed with its counts and done only when PURGE is typed. Every one
// is in the admin record.

/** The Belt, for the tab. */
@Serializable
data class AdminBeltView(
    val holder: String? = null,
    val since: String? = null,
    val defences: Int = 0,
    val defendBy: String? = null,
)

/** What to purge: "player" (with userId), "before" (with a date, yyyy-mm-dd) or "everything". */
@Serializable
data class PurgeRequest(
    val scope: String,
    val userId: String? = null,
    val before: String? = null,
    /** The typed word: PURGE (RESET for the Belt). */
    val confirm: String? = null,
)

/** The pieces the tab needs. */
class AdminRecordsDesk(
    val dataSource: DataSource,
    val purge: AdminPurge,
    val belt: BeltReset,
    val zone: ZoneId = ZoneId.systemDefault(),
)

fun Route.adminPurgeRoutes(admin: AdminServices) {
    val desk = admin.recordsDesk ?: return
    get("/belt") {
        call.asAdmin(admin) ?: return@get
        call.respond(beltView(desk))
    }
    post("/belt/reset") {
        val by = call.asAdmin(admin) ?: return@post
        val request = call.receive<PurgeRequest>()
        if (request.confirm != "RESET") return@post call.refuse("TYPE_TO_CONFIRM", "Type RESET to reset the Belt.")
        val at = desk.belt.reset(by.user.userId)
        admin.records.actions.record(by.user.userId, by.user.username, AdminAction.BELT_RESET, "belt", "at=$at")
        admin.accountsChanged()
        call.respond(beltView(desk))
    }
    post("/purge/preview") {
        call.asAdmin(admin) ?: return@post
        val scope = call.scopeOf(desk, call.receive()) ?: return@post
        call.respond(desk.purge.preview(scope))
    }
    post("/purge") {
        val by = call.asAdmin(admin) ?: return@post
        val request = call.receive<PurgeRequest>()
        val scope = call.scopeOf(desk, request) ?: return@post
        if (request.confirm != "PURGE") return@post call.refuse("TYPE_TO_CONFIRM", "Type PURGE to delete.")
        if (scope == PurgeScope.Everything) {
            val refused = desk.purge.preview(scope).refused
            if (refused != null) return@post call.refuse("GAME_RUNNING", refused)
            // Told, like any room an admin closes; then their rows go.
            admin.rooms.list().forEach { room -> admin.rooms.forceClose(UUID.fromString(room.room.roomId)) }
        }
        val done = desk.purge.purge(scope) ?: return@post call.refuse("GAME_RUNNING", "A game is being played.")
        admin.records.actions.record(
            by.user.userId,
            by.user.username,
            AdminAction.PURGE,
            request.scope,
            "userId=${request.userId}; before=${request.before}; games=${done.games}; decks=${done.decks}; " +
                "rooms=${done.rooms}; reports=${done.reports}; signIns=${done.signIns}",
        )
        admin.accountsChanged()
        call.respond(done)
    }
}

private fun beltView(desk: AdminRecordsDesk): AdminBeltView {
    val belt = HallGameSource(desk.dataSource).hall(desk.zone).belt(Instant.now())
    return AdminBeltView(
        holder = belt.holder?.let { nameOf(desk.dataSource, it) },
        since = belt.since?.toString(),
        defences = belt.defences,
        defendBy = belt.defendBy?.toString(),
    )
}

private fun nameOf(
    dataSource: DataSource,
    userId: UUID,
): String? =
    dataSource.connection.use { connection ->
        connection.prepareStatement("SELECT username FROM app_user WHERE user_id = ?").use { statement ->
            statement.setObject(1, userId)
            statement.executeQuery().use { rows -> if (rows.next()) rows.getString(1) else null }
        }
    }

/** The scope a request names, or a 400 said and null. */
private suspend fun ApplicationCall.scopeOf(
    desk: AdminRecordsDesk,
    request: PurgeRequest,
): PurgeScope? {
    val scope =
        when (request.scope) {
            "player" -> request.userId?.let { runCatching { UUID.fromString(it) }.getOrNull() }?.let(PurgeScope::Player)
            "before" ->
                request.before
                    ?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
                    ?.let { PurgeScope.Before(it.atStartOfDay(desk.zone).toInstant()) }
            "everything" -> PurgeScope.Everything
            else -> null
        }
    if (scope == null) refuse("INVALID_PURGE", "Choose a player, a date, or a fresh start.")
    return scope
}

private suspend fun ApplicationCall.refuse(
    code: String,
    detail: String,
) = respond(HttpStatusCode.BadRequest, ErrorResponse(code, detail, null))
