package net.barnflix.proxic.hall

import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import net.barnflix.proxic.PRINCIPAL_KEY
import java.time.Instant

// GET /api/hall — spec 0018. Signed-in players only (the /api gate puts
// the caller in PRINCIPAL_KEY): the same Hall for everybody, plus the
// caller's own rival.

fun Route.hallRoutes(source: HallGameSource) {
    get("/hall") {
        val viewer = call.attributes[PRINCIPAL_KEY].user.userId
        call.respond(source.hall().view(Instant.now(), viewer))
    }
}
