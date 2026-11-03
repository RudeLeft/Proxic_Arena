package net.barnflix.proxic

import io.ktor.server.application.ApplicationStopped
import io.ktor.server.application.log
import io.ktor.server.routing.Route
import io.ktor.server.routing.application

// Wiring for spec 0054's idle-room sweep. Split from Application.kt, which
// detekt counts by function; it is the same kind of code as the rest of
// that file.

/**
 * §5.124-§5.126, spec 0054 — idle rooms close. Not housekeeping: nothing
 * else closes a room, so without it they stay forever. Split out of
 * Application.kt's databaseRoutes at detekt's limits.
 */
internal fun Route.startRoomMaintenance(
    config: ServerConfig,
    database: Database,
    lobby: net.barnflix.proxic.lobby.LobbyService,
    presence: net.barnflix.proxic.room.Presence,
) {
    net.barnflix.proxic.room.RoomTimeouts.active = config.roomTimeouts
    val roomMaintenance =
        net.barnflix.proxic.room.RoomMaintenance(
            database.dataSource(),
            lobby,
            application.log,
            presence = presence,
            // The lobby's chat limiter rides this tick rather
            // than owning a second scheduled executor.
            alsoSweep = {
                lobby.sweep()
                // §7.56 — game records are kept for a bounded time.
                val gone = config.gameRecords().sweep()
                if (gone > 0) application.log.info("deleted $gone game record(s) past their keep date")
            },
        )
    roomMaintenance.start()
    application.environment.monitor.subscribe(ApplicationStopped) {
        roomMaintenance.stop()
    }
}
