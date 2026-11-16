package net.barnflix.proxic.match

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.PRINCIPAL_KEY
import net.barnflix.proxic.ServerConfig
import java.io.File
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// TEST ONLY -- spec 0098, exact test games.
//
// The Mechanics Lab deals set cards (the worker's `labDeal`, accepted only
// by a worker started with --lab-deal); browser tests had no way to, so a
// game spec waited on the shuffle and failed when it never dealt the card
// (match-loyalty, match-ring: ROADMAP's flakes). This lets a browser test
// queue a deal for the NEXT match between two named accounts.
//
// Off unless PROXIC_TEST_DEALS=true, which only docker-compose.local.yml
// and docker-compose.ci.yml set (scripts/check-test-switch.py fails CI if
// the production compose files or the Dockerfile ever do). Off, none of
// this exists: no store, no route (POST /api/matches/test-deal is a 404),
// and the worker is started without --lab-deal, so it refuses any deal.
//
// Why an endpoint and not a field on the match start: §6.10 says the
// browser supplies ONLY the setup id when it starts a match -- not seats,
// not decks, not Forge options. A deal field on that request would put a
// Forge option into the production request body, switch or not. A route
// that is not mounted is no API surface at all.
//
// Hidden information is unchanged (HID-001..005): the deal only orders a
// library before the opening hand is drawn; what each seat is then sent is
// Forge's per-viewer answer, as in every game.

/** One seat's deal, by card name: the opening hand, then the draws after it, in order. */
@Serializable
data class SeatDeal(val hand: List<String> = emptyList(), val top: List<String> = emptyList())

@Serializable
data class TestDealSeat(
    val username: String = "",
    val hand: List<String> = emptyList(),
    val top: List<String> = emptyList(),
)

@Serializable
data class TestDealRequest(val players: List<TestDealSeat> = emptyList())

/** The deals queued for the next match between two accounts; one each pair, taken once. */
class TestDeals(
    private val clock: () -> Instant = Instant::now,
    /** A deal nobody's match took (a test that failed before Start) is forgotten. */
    private val keep: Duration = Duration.ofMinutes(KEEP_MINUTES),
) {
    private data class Pending(val deals: Map<UUID, SeatDeal>, val at: Instant)

    private val pending = ConcurrentHashMap<Set<UUID>, Pending>()

    /** Queue [deals] (account -> its seat's deal) for the next match these accounts play together. */
    fun queue(deals: Map<UUID, SeatDeal>) {
        val now = clock()
        pending.entries.removeIf { it.value.at.plus(keep).isBefore(now) }
        if (pending.size >= MAX_PENDING) pending.clear()
        pending[deals.keys] = Pending(deals.toMap(), now)
    }

    /** The deal queued for a match between exactly [accounts], removed; null when none (or too old). */
    fun take(accounts: Set<UUID>): Map<UUID, SeatDeal>? {
        val found = pending.remove(accounts) ?: return null
        return found.deals.takeIf { !found.at.plus(keep).isBefore(clock()) }
    }

    companion object {
        const val KEEP_MINUTES = 10L
        const val MAX_PENDING = 64
        const val MAX_HAND = 7
        const val MAX_TOP = 60
        const val MAX_NAME = 200
        const val SEATS = 2
    }
}

/** Why [request] cannot be queued, or null when it can. */
internal fun testDealProblem(request: TestDealRequest): String? {
    val names = request.players.map { it.username.trim().lowercase(java.util.Locale.ROOT) }
    return when {
        request.players.size != TestDeals.SEATS -> "A test deal names the two players of one match."
        names.toSet().size != names.size || names.any { it.isEmpty() } -> "Two different usernames."
        request.players.any { it.hand.size > TestDeals.MAX_HAND } -> "At most seven cards for a hand."
        request.players.any { it.top.size > TestDeals.MAX_TOP } -> "At most sixty cards for the top."
        request.players.any { seat -> (seat.hand + seat.top).any { it.isBlank() || it.length > TestDeals.MAX_NAME } } ->
            "Every card is named."
        else -> null
    }
}

/**
 * POST /api/matches/test-deal -- mounted ONLY when the switch is on
 * (Application.kt). Signed in and CSRF-checked like every /api/matches
 * route; the caller must be one of the two players named.
 */
fun Route.testDealRoute(
    deals: TestDeals,
    userIdOf: (String) -> UUID?,
) {
    route("/matches") {
        post("/test-deal") {
            val body =
                runCatching { call.receive<TestDealRequest>() }.getOrNull()
                    ?: return@post call.respond(
                        HttpStatusCode.BadRequest,
                        ErrorResponse("INVALID_REQUEST", "Expected two players' deals.", call.callId),
                    )
            testDealProblem(body)?.let {
                return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("INVALID_REQUEST", it, call.callId))
            }
            val ids = body.players.map { userIdOf(it.username) }
            if (ids.any { it == null }) {
                return@post call.respond(
                    HttpStatusCode.UnprocessableEntity,
                    ErrorResponse("NO_SUCH_PLAYER", "No such player.", call.callId),
                )
            }
            val caller = call.attributes[PRINCIPAL_KEY].user.userId
            if (caller !in ids) {
                return@post call.respond(
                    HttpStatusCode.Forbidden,
                    ErrorResponse("NOT_YOUR_MATCH", "A test deal is for a match you play in.", call.callId),
                )
            }
            deals.queue(body.players.zip(ids).associate { (seat, id) -> id!! to SeatDeal(seat.hand, seat.top) })
            call.respond(HttpStatusCode.NoContent)
        }
    }
}

/**
 * The deal a browser test queued for a match between exactly these players,
 * attached to their seats. No store (the switch off, as in production): the
 * seats as they are.
 */
internal fun TestDeals?.dealTo(
    match: Match,
    seats: List<WorkerSeat>,
    log: org.slf4j.Logger,
): List<WorkerSeat> {
    val deals = this?.take(match.participants.map { it.userId }.toSet()) ?: return seats
    val accountOf = match.participants.associate { it.seatNumber to it.userId }
    log.warn("match ${match.matchId}: TEST DEAL (PROXIC_TEST_DEALS) for ${deals.size} seats")
    return seats.map { seat -> seat.copy(deal = accountOf[seat.seatNumber]?.let { deals[it] }) }
}

/**
 * The worker's command line: `java -jar <jar> [res]`, and -- only with
 * spec 0098's test switch on -- `--lab-deal`, without which the worker
 * refuses any deal (LAB_DEAL_REFUSED).
 */
internal fun workerCommand(
    config: ServerConfig,
    jar: File,
): List<String> =
    buildList {
        add(javaExecutable())
        add("-jar")
        add(jar.absolutePath)
        config.forgeResRoot?.let { add(it) }
        if (config.testDeals) add("--lab-deal")
    }
