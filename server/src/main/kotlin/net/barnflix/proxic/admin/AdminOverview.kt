package net.barnflix.proxic.admin

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import java.time.Instant

// The Admin page's numbers in one small answer -- PHASE_11 P11-E7.
//
// The page used to read all seven lists (about 76 KB) on every visit and
// every 30 s, just to draw the five tiles and the tab counts. Now it reads
// the open tab's list and this: the same numbers, counted here from the same
// lists by the same rules as the page counted them (admin.ts `overview`,
// `signInsByPerson`), plus the server's state (the Server tab and the alert
// on its tab) and how long game records are kept.
//
// "Today" is the viewer's own day: the page says when it began (`since`,
// an instant), as it did when it counted for itself.

@Serializable
data class AdminOverview(
    val accounts: Int,
    val disabled: Int,
    val rooms: Int,
    val playing: Int,
    /** The recent matches the Games tab lists. */
    val games: Int,
    val gamesToday: Int,
    val didNotStart: Int,
    /** The names tried in the last 24 hours, as the Sign-ins tab groups them. */
    val signInNames: Int,
    val signedInToday: Int,
    val failedToday: Int,
    val reports: Int,
    val newReports: Int,
    val computers: Int,
    val keepDays: Long,
    val server: ServerStateView,
)

/** The counts, from the lists the tabs show. */
fun adminOverview(
    admin: AdminServices,
    since: Instant,
): AdminOverview {
    val accounts = admin.adminAccounts.list()
    val rooms = admin.rooms.list()
    val matches = admin.records.matches.list()
    val signIns = admin.records.signIns.recent()
    val reports = admin.reports?.list()
    val today = { at: String -> !Instant.parse(at).isBefore(since) }
    val gamesToday = matches.filter { today(it.createdAt) }
    val signInsToday = signIns.filter { today(it.at) }
    return AdminOverview(
        accounts = accounts.count { it.status == "ACTIVE" },
        disabled = accounts.count { it.status == "DISABLED" },
        rooms = rooms.size,
        playing = rooms.count { it.room.status == "IN_MATCH" },
        games = matches.size,
        gamesToday = gamesToday.size,
        didNotStart = gamesToday.count { it.status == "FAILED_STARTUP" },
        signInNames = signIns.map { it.username.lowercase() }.toSet().size,
        signedInToday = signInsToday.count { it.kind == "SIGNED_IN" },
        failedToday = signInsToday.count { it.kind != "SIGNED_IN" },
        reports = reports?.reports?.size ?: 0,
        newReports = reports?.newCount ?: 0,
        computers = admin.computers?.list()?.size ?: 0,
        keepDays = admin.records.matches.keepDays,
        server = admin.serverState(),
    )
}

fun Route.adminOverviewRoute(admin: AdminServices) {
    get("/overview") {
        call.asAdmin(admin) ?: return@get
        val since =
            call.request.queryParameters["since"]?.let { runCatching { Instant.parse(it) }.getOrNull() }
                ?: return@get call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_SINCE", "Say when the day began, as an instant.", null),
                )
        call.respond(adminOverview(admin, since))
    }
}
