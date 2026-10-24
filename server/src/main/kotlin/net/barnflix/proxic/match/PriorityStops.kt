package net.barnflix.proxic.match

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.put
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import net.barnflix.proxic.BuildInfo
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.PRINCIPAL_KEY
import java.util.UUID
import javax.sql.DataSource

// Priority stops — PHASE_07 §7.53, AMENDMENT 13.
//
// The steps where a player is asked "act or pass?". Everywhere else the
// worker passes priority for them, as MTG Arena does; nothing but a
// priority pass is ever automatic. The player's own setting, kept here
// and handed to the worker with each seat (START_GAME) or mid-game
// (STOPS).

/** The steps Forge gives priority in, by Forge's own names. */
val PRIORITY_STEPS: List<String> =
    listOf(
        "UPKEEP",
        "DRAW",
        "MAIN1",
        "COMBAT_BEGIN",
        "COMBAT_DECLARE_ATTACKERS",
        "COMBAT_DECLARE_BLOCKERS",
        "COMBAT_FIRST_STRIKE_DAMAGE",
        "COMBAT_DAMAGE",
        "COMBAT_END",
        "MAIN2",
        "END_OF_TURN",
        "CLEANUP",
    )

@Serializable
data class StopSettings(
    val own: List<String>,
    val opponent: List<String>,
    /**
     * Spec 0004 — Hold priority: asked after your own spell, ability or
     * trigger goes on the stack, instead of passed for. On until turned off.
     */
    val hold: Boolean = false,
) {
    companion object {
        /**
         * AMENDMENT 13, owner 2026-10-21 ("Arena-style"): your main phases
         * and the combat steps once there is a combat, each only when you
         * have something to do; something the opponent put on the stack
         * stops you whenever you could respond (the worker's rule, not a
         * step).
         */
        val DEFAULT =
            StopSettings(
                own = listOf("MAIN1", "COMBAT_DECLARE_BLOCKERS", "MAIN2"),
                opponent = listOf("COMBAT_DECLARE_ATTACKERS", "COMBAT_DECLARE_BLOCKERS"),
            )
    }

    /** Only Forge's step names, each once, in turn order. */
    fun cleaned(): StopSettings? {
        if ((own + opponent).any { it !in PRIORITY_STEPS }) return null
        return StopSettings(
            PRIORITY_STEPS.filter { it in own },
            PRIORITY_STEPS.filter { it in opponent },
            hold,
        )
    }
}

class StopStore(
    private val dataSource: DataSource,
) {
    fun get(userId: UUID): StopSettings =
        dataSource.connection.use { connection ->
            connection.prepareStatement("SELECT own, opponent, hold FROM player_stops WHERE user_id = ?").use {
                it.setObject(1, userId)
                it.executeQuery().use { row ->
                    if (!row.next()) return StopSettings.DEFAULT
                    StopSettings(namesOf(row.getString(1)), namesOf(row.getString(2)), row.getBoolean(3))
                }
            }
        }

    fun put(
        userId: UUID,
        settings: StopSettings,
    ) {
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "INSERT INTO player_stops (user_id, own, opponent, hold) VALUES (?, ?, ?, ?) " +
                    "ON CONFLICT (user_id) DO UPDATE SET own = EXCLUDED.own, " +
                    "opponent = EXCLUDED.opponent, hold = EXCLUDED.hold, updated_at = now()",
            ).use {
                it.setObject(1, userId)
                it.setString(2, settings.own.joinToString(","))
                it.setString(3, settings.opponent.joinToString(","))
                it.setBoolean(4, settings.hold)
                it.executeUpdate()
            }
        }
    }

    private fun namesOf(text: String?): List<String> =
        text
            .orEmpty()
            .split(',')
            .map { it.trim() }
            .filter { it in PRIORITY_STEPS }
}

/**
 * GET and PUT /api/matches/stops — your own stops, behind the /api/matches
 * gate (a session and the CSRF check). A change mid-game is also sent on
 * the match socket (STOPS), which applies it to the game in progress.
 */
fun Route.stopRoutes(store: StopStore) {
    get("/matches/stops") {
        call.respond(store.get(call.attributes[PRINCIPAL_KEY].user.userId))
    }
    put("/matches/stops") {
        val settings =
            runCatching { call.receive<StopSettings>() }.getOrNull()?.cleaned()
                ?: return@put call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_STOPS", "Those are not step names.", null),
                )
        store.put(call.attributes[PRINCIPAL_KEY].user.userId, settings)
        call.respond(settings)
    }
}

/** `{own: [...], opponent: [...], hold: bool}`, as the worker reads it. */
fun stopsJson(settings: StopSettings): JsonObject =
    buildJsonObject {
        putJsonArray("own") { settings.own.forEach { add(it) } }
        putJsonArray("opponent") { settings.opponent.forEach { add(it) } }
        put("hold", settings.hold)
    }

private fun workerFrame(
    type: String,
    seat: Int,
    stops: StopSettings?,
): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", type)
        put("messageId", UUID.randomUUID().toString())
        put("seat", seat)
        stops?.let {
            put("own", stopsJson(it)["own"]!!)
            put("opponent", stopsJson(it)["opponent"]!!)
            put("hold", it.hold)
        }
    }

/**
 * A player changed their stops mid-game (§7.53): applied to the game in
 * progress, for their OWN seat, resolved from the session.
 */
fun MatchRuntime.applyStops(
    matchId: UUID,
    userId: UUID,
    settings: StopSettings,
) {
    val running = liveMatch(matchId) ?: return
    val seat = running.seatOf(userId) ?: return
    running.worker.forward(workerFrame("STOPS", seat, settings), "stops")
}

/** §7.53 extra — "Pass until end of turn", for the player's own seat. */
fun MatchRuntime.passTurn(
    matchId: UUID,
    userId: UUID,
) {
    val running = liveMatch(matchId) ?: return
    val seat = running.seatOf(userId) ?: return
    running.worker.forward(workerFrame("PASS_TURN", seat, null), "a pass to the end of the turn")
}
