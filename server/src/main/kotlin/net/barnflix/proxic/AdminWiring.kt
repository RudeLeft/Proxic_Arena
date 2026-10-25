package net.barnflix.proxic

import io.ktor.server.application.ApplicationStopped
import io.ktor.server.application.log
import io.ktor.server.routing.Route
import io.ktor.server.routing.application

// Wiring for PHASE_07 §7.67's Admin API and the sign-in records it
// reads. Split from Application.kt, which detekt counts by function;
// it is the same kind of code as the rest of that file.

/** §3.90 -- expired rows are swept on a timer; PHASE_07 adds old sign-in records. */
internal fun Route.startSessionMaintenance(
    sessions: net.barnflix.proxic.auth.Sessions,
    throttle: net.barnflix.proxic.auth.LoginThrottle,
    signIns: net.barnflix.proxic.auth.SignInLog,
) {
    val maintenance =
        net.barnflix.proxic.auth.SessionMaintenance(
            sessions,
            throttle,
            application.log,
            alsoSweep = { signIns.purge() },
        )
    maintenance.start()
    application.environment.monitor.subscribe(ApplicationStopped) {
        maintenance.stop()
    }
}

/** What databaseRoutes already built, that the Admin API also needs. */
internal class AdminParts(
    val sessions: net.barnflix.proxic.auth.Sessions,
    val accounts: net.barnflix.proxic.auth.Accounts,
    val signIns: net.barnflix.proxic.auth.SignInLog,
    val rooms: net.barnflix.proxic.room.RoomService,
    val runtime: net.barnflix.proxic.match.MatchRuntime,
    val lobby: net.barnflix.proxic.lobby.LobbyService,
)

/** PHASE_07 §7.67 — the Admin API's dependencies, and the server state it reports. */
internal fun adminServices(
    config: ServerConfig,
    database: Database,
    health: HealthChecks,
    parts: AdminParts,
): net.barnflix.proxic.admin.AdminServices {
    val adminRooms =
        net.barnflix.proxic.admin.AdminRooms(
            parts.rooms,
            net.barnflix.proxic.match.MatchStore(database.dataSource()),
            parts.runtime,
            parts.lobby,
        )
    return net.barnflix.proxic.admin.AdminServices(
        config = config,
        sessions = parts.sessions,
        adminAccounts =
            net.barnflix.proxic.admin.AdminAccounts(database.dataSource(), parts.accounts, parts.sessions),
        records =
            net.barnflix.proxic.admin.AdminRecords(
                net.barnflix.proxic.admin.AdminActions(database.dataSource()),
                parts.signIns,
                net.barnflix.proxic.admin.AdminMatches(database.dataSource(), config.gameRecords()),
            ),
        rooms = adminRooms,
        accountsChanged = { parts.lobby.accountChanges?.changed() },
        serverState = {
            val status = health.systemStatus()
            net.barnflix.proxic.admin.ServerStateView(
                version = BuildInfo.PROXIC_VERSION + (BuildInfo.buildId?.let { " ($it)" } ?: ""),
                database =
                    if (status.database == "ok") database.serverVersion() ?: "PostgreSQL" else status.database,
                forgeWorker = status.forgeRuntime,
                gamesRunning = parts.runtime.runningCount,
                uptimeSeconds = java.lang.management.ManagementFactory.getRuntimeMXBean().uptime / 1000,
            )
        },
    )
}
