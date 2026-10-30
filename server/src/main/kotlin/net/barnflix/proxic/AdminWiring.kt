package net.barnflix.proxic

import io.ktor.server.application.ApplicationStopped
import io.ktor.server.application.log
import io.ktor.server.routing.Route
import io.ktor.server.routing.application
import net.barnflix.proxic.auth.SmtpMailer

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

/**
 * How an account is reached beyond the browser: the Email tab's settings
 * (spec 0014 amendment 1), password resets that send with them (spec 0026)
 * and linked computers (spec 0021).
 */
internal class AccountReach(
    val mail: net.barnflix.proxic.auth.MailSettings,
    val resets: net.barnflix.proxic.auth.ResetDesk,
    val devices: net.barnflix.proxic.auth.DeviceLinks,
) {
    val links = net.barnflix.proxic.auth.AccountLinks(devices, resets)
}

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
    // Its own copy: both read the same settings and rows, and hold nothing else.
    val reach = accountReach(config, database, parts.accounts, parts.sessions)
    val mail = reach.mail
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
        inviteDesk = inviteDesk(config, parts, mail),
        mailSettings = mail,
        resetDesk = reach.resets,
        computers = net.barnflix.proxic.admin.AdminComputers(database.dataSource()),
        // Spec 0039 — the Reports tab.
        reports = net.barnflix.proxic.report.Reports(database.dataSource(), config.dataRoot, config.gameRecords()),
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

/** Spec 0014 — invitations, emailed with the Email tab's account (else the settings file's). */
private fun inviteDesk(
    config: ServerConfig,
    parts: AdminParts,
    settings: net.barnflix.proxic.auth.MailSettings,
): net.barnflix.proxic.auth.InviteDesk {
    val log = org.slf4j.LoggerFactory.getLogger("net.barnflix.proxic.invites")
    val state = settings.view().source
    log.info("invitation email: {}", if (state == "NONE") "not set up; links are copied by hand" else "set up ($state)")
    return net.barnflix.proxic.auth.InviteDesk(
        invites = parts.accounts.invites(),
        mailer = SmtpMailer(settings::current, log),
        emailReady = { settings.current().configured },
        publicOrigin = config.publicOrigin,
    )
}

/** [AccountReach]: password resets are emailed with the same account as invitations. */
internal fun accountReach(
    config: ServerConfig,
    database: Database,
    accounts: net.barnflix.proxic.auth.Accounts,
    sessions: net.barnflix.proxic.auth.Sessions,
): AccountReach {
    val settings = mailSettings(config, database)
    val log = org.slf4j.LoggerFactory.getLogger("net.barnflix.proxic.resets")
    val desk =
        net.barnflix.proxic.auth.ResetDesk(
            resets = net.barnflix.proxic.auth.PasswordResets(database.dataSource(), accounts, sessions),
            addresses = net.barnflix.proxic.auth.EmailAddresses(database.dataSource()),
            mailer = SmtpMailer(settings::current, log),
            emailReady = { settings.current().configured },
            publicOrigin = config.publicOrigin,
        )
    return AccountReach(settings, desk, net.barnflix.proxic.auth.DeviceLinks(database.dataSource()))
}

/** Spec 0014 amendment 1 — the Email tab's settings, sealed with the server's secret. */
private fun mailSettings(
    config: ServerConfig,
    database: Database,
) = net.barnflix.proxic.auth.MailSettings(
    database.dataSource(),
    config.sessionSecret(),
    net.barnflix.proxic.auth.MailConfig.fromEnvironment(),
)
