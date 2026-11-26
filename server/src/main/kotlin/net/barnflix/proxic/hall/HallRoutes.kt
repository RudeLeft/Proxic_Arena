package net.barnflix.proxic.hall

import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import net.barnflix.proxic.PRINCIPAL_KEY
import java.time.Instant
import java.util.UUID

// GET /api/hall — spec 0018. Signed-in players only (the /api gate puts
// the caller in PRINCIPAL_KEY): the same Hall for everybody, plus the
// caller's own rival.

fun Route.hallRoutes(
    /** P11-E10 — kept in memory, dropped when a game ends or an account changes. */
    source: HallCache,
    /** P11-E2 — the avatars of these players whose accounts are active (null: the default). */
    avatars: (Collection<UUID>) -> Map<UUID, String?> = { emptyMap() },
) {
    get("/hall") {
        val viewer = call.attributes[PRINCIPAL_KEY].user.userId
        val view = source.hall().view(Instant.now(), viewer)
        val named = view.named().mapNotNull { runCatching { UUID.fromString(it) }.getOrNull() }
        call.respond(view.copy(avatars = avatars(named).mapKeys { it.key.toString() }))
    }
}
