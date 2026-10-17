package net.barnflix.proxic

import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.http.content.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.autohead.*
import io.ktor.server.plugins.callid.*
import io.ktor.server.plugins.callloging.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.serialization.json.Json
import net.barnflix.proxic.auth.Principal
import net.barnflix.proxic.auth.authRoutes
import net.barnflix.proxic.auth.csrfOk
import net.barnflix.proxic.auth.requireAuth
import net.barnflix.proxic.auth.userSocket
import net.barnflix.proxic.deck.deckRoutes
import net.barnflix.proxic.room.matchPresetRoutes
import net.barnflix.proxic.room.matchSetupRoutes
import net.barnflix.proxic.room.roomRoutes
import org.slf4j.event.Level
import java.io.File
import java.time.Duration
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import kotlin.system.exitProcess

/**
 * Arena Server — Phase 1 Application Foundation.
 *
 * What this process owns (`PHASE_01` §1.7): HTTP, WebSocket, static
 * serving, sessions and worker lifecycle. What it must never become:
 * a second Magic rules engine. It does not depend on Forge at all
 * (AGENTS ARCH-001) — the worker does, behind a process boundary.
 */
fun main() {
    val config = ServerConfig.fromEnvironment()

    // §1.46: a production run with a missing or placeholder secret
    // must not start. Failing here is loud and cheap; starting with
    // an insecure default is quiet and expensive.
    val problems = config.startupProblems()
    if (problems.isNotEmpty()) {
        System.err.println("Refusing to start in ${config.appEnv}:")
        problems.forEach { System.err.println("  - $it") }
        exitProcess(78) // EX_CONFIG
    }

    embeddedServer(
        Netty,
        configure = {
            // §1.100 — a connection that opens and then says nothing
            // holds a thread and a socket. These bound both ends.
            requestReadTimeoutSeconds = Limits.REQUEST_READ_TIMEOUT_SECONDS
            responseWriteTimeoutSeconds = Limits.RESPONSE_WRITE_TIMEOUT_SECONDS
        },
        port = config.port,
        host = config.host,
    ) {
        module(config)
    }.start(wait = true)
}

/** The authenticated caller, once a route has established one. */
val PRINCIPAL_KEY: io.ktor.util.AttributeKey<Principal> =
    io.ktor.util.AttributeKey("proxic.principal")

/** Counts connections so logs can be correlated (§1.30). */
private val connectionSequence = AtomicLong(0)

/**
 * Currently open /ws/system connections (§1.100).
 *
 * Separate from [connectionSequence], which only ever increases and
 * exists to name connections. This one goes down again, and a leak
 * here would quietly refuse every future connection.
 */
private val openConnections = java.util.concurrent.atomic.AtomicInteger(0)

/**
 * The ONE serializer used for WebSocket frames.
 *
 * `encodeDefaults = true` is load-bearing, not a style choice. The
 * default `Json` omits properties that equal their default, so
 * `Envelope.protocolVersion` — which always equals its default —
 * vanished from the wire. The server was emitting a HELLO that its
 * own client parser correctly rejected as malformed.
 *
 * Caught by driving the live server with a real WebSocket client. The
 * shared-fixture tests could not catch it: they prove the two MODELS
 * agree with the FIXTURES, not that the running server emits
 * conformant frames.
 */
private val wireJson =
    Json {
        encodeDefaults = true
        ignoreUnknownKeys = true
    }

/**
 * Compose the application: plugins, dependencies, routes.
 *
 * Split into three because the combined function was 170
 * lines and detekt was right about it: plugin configuration,
 * dependency startup and route declaration change for
 * different reasons and read better apart.
 */
fun Application.module(config: ServerConfig = ServerConfig.fromEnvironment()) {
    val dependencies = installPluginsAndDependencies(config)
    installRoutes(config, dependencies)
}

/** What the routes need, built once at startup. */
class Dependencies(
    val health: HealthChecks,
    val database: Database?,
    val forgeWorker: ForgeWorker,
)

private fun Application.installPluginsAndDependencies(config: ServerConfig): Dependencies {
    install(ContentNegotiation) {
        json(
            Json {
                prettyPrint = false
                encodeDefaults = true
                // An unknown field from a newer client must not 500 the
                // server; protocol version is what gates compatibility.
                ignoreUnknownKeys = true
            },
        )
    }

    // §1.43: every HTTP request carries an id, so a log line can be
    // traced to a request and later to a connection, session, player
    // and match.
    install(CallId) {
        header(HttpHeaders.XRequestId)
        generate { UUID.randomUUID().toString() }
        verify { it.isNotBlank() }
    }

    install(CallLogging) {
        level = Level.INFO
        callIdMdc("requestId")
        // §1.42: no println. Logback owns output.

        // Ktor colourises the status line by default, which reaches
        // for jansi, which unpacks a .so into /tmp and executes it.
        // /tmp is a noexec tmpfs on purpose (§1.59), so every startup
        // printed an UnsatisfiedLinkError stack trace -- alarming,
        // harmless, and the first thing anyone reads in a deployment
        // log.
        //
        // Colour in a container log is noise anyway: nothing reads
        // this on a terminal. Turning it off here is better than the
        // two things I tried first -- jansi has no `disable`
        // property, and excluding the library breaks CallLogging
        // outright (ClassNotFoundException: Ansi$Color).
        disableDefaultColors()
    }

    // §1.99, §1.100 — bounded HTTP body, before the bytes are read.
    install(BodySizeLimit)

    // Answer HEAD wherever GET is answered.
    //
    // Found on the first public deployment: GET / returned 200 and
    // HEAD / returned 404, because Ktor routes HEAD separately.
    // Uptime monitors and health checkers default to HEAD, so the
    // site would have been reported down while serving perfectly --
    // and a monitor that cries wolf is worse than no monitor.
    install(AutoHeadResponse)

    // §3.99-§3.101 -- nosniff, clickjacking, referrer and CSP on
    // every response, including error responses and static assets.
    install(SecurityHeaders)

    install(WebSockets) {
        // Ktor 2.x takes java.time.Duration here, not kotlin.time.
        pingPeriod = Duration.ofSeconds(Limits.WS_PING_SECONDS)
        timeout = Duration.ofSeconds(Limits.WS_TIMEOUT_SECONDS)
        // §1.100 — a hostile or broken client must not be able to
        // make the server allocate without bound. Idle sockets are
        // handled by the ping/timeout pair above: a peer that stops
        // answering pings is closed rather than held open forever.
        maxFrameSize = Limits.MAX_WS_FRAME_BYTES
    }

    // §1.44: one error shape, everywhere. A thrown exception must not
    // leak a stack trace to a client (§1.26, §2.76).
    install(StatusPages) {
        exception<Throwable> { call, cause ->
            val id = call.callId
            LogContext.withFields(LogContext.ERROR_CODE to "INTERNAL_ERROR") {
                call.application.log.error("unhandled error", cause)
            }
            call.respond(
                HttpStatusCode.InternalServerError,
                ErrorResponse(
                    errorCode = "INTERNAL_ERROR",
                    detail = "The server could not complete the request.",
                    requestId = id,
                ),
            )
        }
        status(HttpStatusCode.NotFound) { call, _ ->
            call.respond(
                HttpStatusCode.NotFound,
                ErrorResponse("NOT_FOUND", "No such endpoint.", call.callId),
            )
        }
    }

    // §1.36-§1.38. Null when no database is configured, which is a
    // supported Phase 1 state, not a failure.
    val database = Database.connect(config)

    if (database != null) {
        // A configured-but-unreachable database does NOT stop the
        // server: readiness answers 503 and the foundation UI shows
        // it as down, which is more useful than a process that will
        // not start. Nothing in Phase 1 reads or writes rows, so
        // there is no risk of running against unmigrated schema --
        // the phase that adds the first table must revisit this.
        runCatching { database.migrate() }
            .onFailure { log.error("database migration failed; continuing degraded", it) }
    }

    environment.monitor.subscribe(ApplicationStopped) { database?.close() }

    // §1.65 — one handshake at startup. A worker costs ~611 MB and
    // ~2.8 s, so probing per readiness request would be a
    // self-inflicted load generator; Phase 6 owns per-match spawning.
    val forgeWorker = ForgeWorker(config)
    forgeWorker.probe()

    val health = HealthChecks(config, database, forgeWorker)

    return Dependencies(health, database, forgeWorker)
}

private fun Application.installRoutes(
    config: ServerConfig,
    dependencies: Dependencies,
) {
    val health = dependencies.health
    routing {
        route("/api") {
            // §1.23 — alive, regardless of dependencies.
            get("/health/live") {
                call.respond(Liveness())
            }

            // §1.24 — can we actually do our job right now?
            get("/health/ready") {
                val result = health.readiness()
                val code =
                    if (result.status == "ok") {
                        HttpStatusCode.OK
                    } else {
                        HttpStatusCode.ServiceUnavailable
                    }
                call.respond(code, result)
            }

            // §1.25
            get("/version") {
                call.respond(VersionInfo())
            }

            // §1.26 — never secrets, never traces.
            get("/system/status") {
                call.respond(health.systemStatus())
            }
        }

        // §1.29 — infrastructure WebSocket. No Magic messages.
        // §1.29 handler lives in its own function: detekt was
        // right that installRoutes had grown past readable.
        systemWebSocket(config)

        // PHASE_02 onwards — everything that needs a database.
        // Registered only when one exists: every route in there
        // needs it, and a 404 is a better answer than a 500 for a
        // server that was never configured to store anything.
        //
        // Its own function because detekt was right that
        // installRoutes had grown past readable -- for the third
        // time, which is the point at which the seam is real.
        dependencies.database?.let { databaseRoutes(config, it) }

        // §1.27 — production static serving. In development Vite
        // serves the app and proxies here (§1.28), so this directory
        // legitimately does not exist and must not break startup.
        val staticDir = File(config.staticRoot)
        val indexHtml = File(staticDir, "index.html")

        // SPA fallback. React owns /play and /settings; there is no
        // file at either path, and a 404 would be wrong.
        //
        // The guard is the point: Ktor picks this wildcard for an
        // unmatched /api/* or /ws/* path too, and answering those with
        // index.html would hand a client HTML where it expected JSON
        // and turn a typo'd endpoint into a silent, confusing success.
        get("{...}") {
            val path = call.request.path()
            if (path.startsWith("/api") || path.startsWith("/ws")) {
                call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("NOT_FOUND", "No such endpoint.", call.callId),
                )
                return@get
            }
            // A real built file (/assets/index-abc.js, /favicon.ico)
            // is served as itself; everything else is a client-side
            // route and gets the app.
            val file = resolveStaticFile(staticDir, path)
            if (file != null) {
                call.respondFile(file)
            } else if (path.startsWith("/assets/")) {
                // A MISSING build asset must 404. Falling back to
                // index.html here answers a script request with HTML,
                // and the browser reports it as a syntax error in the
                // bundle -- a stale cached page looks like a code bug.
                call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("NOT_FOUND", "No such asset.", call.callId),
                )
            } else if (indexHtml.isFile) {
                call.respondFile(indexHtml)
            } else {
                // Honest about WHY, per §1.71: the frontend was never
                // built, which is not the same as a missing route.
                call.respond(
                    HttpStatusCode.ServiceUnavailable,
                    ErrorResponse(
                        "FRONTEND_NOT_BUILT",
                        "No built frontend at ${config.staticRoot}.",
                        call.callId,
                    ),
                )
            }
        }
    }
}

private suspend fun DefaultWebSocketServerSession.sendEnvelope(
    type: String,
    payload: Map<String, String>,
    correlatesTo: String? = null,
) {
    send(
        Frame.Text(
            wireJson.encodeToString(
                Envelope.serializer(),
                Envelope(
                    type = type,
                    messageId = correlatesTo ?: UUID.randomUUID().toString(),
                    payload = payload,
                ),
            ),
        ),
    )
}

/**
 * Resolve a request path to a file INSIDE the static root, or null.
 *
 * Canonical paths are compared rather than the requested string: a
 * request for `/../../etc/passwd` or an encoded equivalent must not
 * escape the directory, and string prefix checks on the raw path miss
 * that. Returning null for anything that escapes means a traversal
 * attempt degrades to the SPA fallback rather than serving a file.
 */
internal fun resolveStaticFile(
    root: File,
    requestPath: String,
): File? {
    if (!root.isDirectory) return null
    val relative = requestPath.trimStart('/')
    if (relative.isEmpty()) return null
    val candidate = File(root, relative)
    val canonicalRoot = root.canonicalFile
    val canonical = runCatching { candidate.canonicalFile }.getOrNull() ?: return null
    if (!canonical.toPath().startsWith(canonicalRoot.toPath())) return null
    return if (canonical.isFile) canonical else null
}

/**
 * Routes, sweeps and dependencies that need PostgreSQL.
 *
 * Accounts, decks, the authenticated socket, rooms and match
 * setup. Split out of [installRoutes] when that function passed
 * detekt's length limit for the third time.
 */
private fun Route.databaseRoutes(
    config: ServerConfig,
    database: Database,
) {
    val sessions = net.barnflix.proxic.auth.Sessions(database.dataSource())
    val accounts = net.barnflix.proxic.auth.Accounts(database.dataSource(), sessions)
    val throttle = net.barnflix.proxic.auth.LoginThrottle()

    // §3.90 -- expired rows are swept on a timer. The gate
    // audit found the purge existed and was never called.
    val maintenance =
        net.barnflix.proxic.auth.SessionMaintenance(
            sessions,
            throttle,
            application.log,
        )
    maintenance.start()
    application.environment.monitor.subscribe(ApplicationStopped) {
        maintenance.stop()
    }

    route("/api") {
        authRoutes(config, accounts, sessions, throttle)
    }

    // §3.77-§3.82 — the authenticated WebSocket. Outside
    // /api, beside /ws/system, which stays anonymous
    // infrastructure (§3.83).
    //
    // PHASE_05 — presence, invitations and chat ride on this
    // socket rather than a second endpoint (§5.66, and
    // carry-forward C3): authentication and the 30-second
    // revalidation already live here, and a second socket
    // would have to reimplement both.
    val roomService =
        net.barnflix.proxic.room.RoomService(
            database.dataSource(),
            net.barnflix.proxic.deck.DeckAuthorization(database.dataSource()),
        )
    val lobbyHub = net.barnflix.proxic.lobby.LobbyHub()
    val lobby = net.barnflix.proxic.lobby.LobbyService(lobbyHub, roomService)
    userSocket(sessions, lobby)

    route("/api") {
        // PHASE 3 AMENDMENT 1 (owner decision D1): every
        // deck endpoint requires a session. This ends the
        // anonymous access PHASE 2 AMENDMENT 1 allowed,
        // which existed only because there was no
        // authentication to require.
        //
        // Decks remain UNOWNED (§3.86): any signed-in user
        // sees all of them, and none belong to anybody
        // until Phase 4.
        //
        // PHASE_05 carry-forward C4: /api/rooms is gated the
        // same way rather than growing its own copy. Two
        // authentication gates is one gate and one future
        // oversight.
        intercept(io.ktor.server.application.ApplicationCallPipeline.Plugins) {
            val path = call.request.path()
            val guarded =
                path.startsWith("/api/decks") || path.startsWith("/api/rooms")
            if (!guarded) return@intercept
            val principal = call.requireAuth(sessions) ?: return@intercept finish()
            if (!call.csrfOk(config)) return@intercept finish()
            call.attributes.put(PRINCIPAL_KEY, principal)
        }

        // PHASE_05 §5.120, §5.122, §5.198, §5.213 — what a restart
        // has to put right: readiness nobody is behind, and a setup
        // frozen for players who have all gone. Before the routes
        // open, so no client is ever served a room claiming either.
        net.barnflix.proxic.room.RoomRecovery(database.dataSource(), application.log).recover()

        // PHASE_05 §5.124-§5.126, owner D4 — abandoned
        // rooms expire. Unlike the session sweep this is
        // not housekeeping: nothing else expires a room, so
        // if it stopped running they would stay joinable
        // forever.
        val roomMaintenance =
            net.barnflix.proxic.room.RoomMaintenance(
                database.dataSource(),
                lobby,
                application.log,
                // The lobby's chat limiter rides this tick rather
                // than owning a second scheduled executor.
                alsoSweep = lobby::sweep,
            )
        roomMaintenance.start()
        application.environment.monitor.subscribe(ApplicationStopped) {
            roomMaintenance.stop()
        }

        // PHASE_05 §5.14, §5.76-§5.81, §5.138, §5.139. The
        // lobby is the announcer: an HTTP response reaches
        // the caller, and the other members learn through
        // the socket they already hold.
        roomRoutes(roomService, lobby)

        // PHASE_05 §5.91-§5.117 — prepare and cancel a
        // match setup. Preparation starts nothing; it
        // validates and freezes the snapshot Phase 6 will
        // launch from.
        matchSetupRoutes(
            net.barnflix.proxic.room.MatchSetupService(
                database.dataSource(),
                net.barnflix.proxic.deck.DeckAuthorization(database.dataSource()),
                net.barnflix.proxic.room.MatchPreflight(
                    database.dataSource(),
                    net.barnflix.proxic.deck.CardResolver(config),
                ),
                lobbyHub,
            ),
            roomService,
            lobby,
        )

        // §5.37, §5.94 — the server says which presets
        // exist; a browser holding a stale list is
        // corrected rather than believed.
        matchPresetRoutes()

        deckRoutes(
            config = config,
            dataSource = database.dataSource(),
            // PHASE_05 §5.50, §5.51 — a deck deleted or a share
            // revoked reaches whoever is sitting in a lobby with it
            // selected. The §5.228 audit found RoomDeckWatch
            // written, tested and called by nothing; this is the
            // call it was missing.
            deckAccess =
                net.barnflix.proxic.room.RoomDeckAccess(
                    net.barnflix.proxic.room.RoomDeckWatch(
                        database.dataSource(),
                        net.barnflix.proxic.deck.DeckAuthorization(database.dataSource()),
                    ),
                    lobby,
                    net.barnflix.proxic.room.DeckRecipients(database.dataSource()),
                ),
            importer =
                net.barnflix.proxic.deck.DeckImporter(
                    config,
                    database.dataSource(),
                    net.barnflix.proxic.deck.CardResolver(config),
                ),
            // PHASE 2 AMENDMENT 1: on by default, by owner
            // decision, with the switch kept because the
            // endpoint is unauthenticated until Phase 3.
            importEnabled = config.deckImportEnabled,
        )
    }
}

/**
 * The infrastructure WebSocket (§1.29–§1.32, §1.100).
 *
 * Extracted from installRoutes because that function had grown
 * past 120 lines. The connection lifecycle, the protocol guard and
 * the ceiling belong together and read better on their own.
 */

private fun Route.systemWebSocket(config: ServerConfig) {
    webSocket("/ws/system") {
        // §1.100 — concurrent connection ceiling. Counted on
        // entry and released in the finally below, so a client
        // that disconnects rudely does not leak a slot.
        if (openConnections.incrementAndGet() > config.maxSystemConnections) {
            openConnections.decrementAndGet()
            application.log.warn("refusing ws: at the connection ceiling")
            close(CloseReason(CloseReason.Codes.TRY_AGAIN_LATER, "too many connections"))
            return@webSocket
        }

        val connectionId = "conn-${connectionSequence.incrementAndGet()}"
        // Wrapped around the LOG CALL, not the whole handler:
        // MDC is thread-local and this body suspends, so a value
        // set across a suspension point can resume on another
        // thread and attach itself to an unrelated connection's
        // lines (§1.41).
        LogContext.withFields(LogContext.CONNECTION_ID to connectionId) {
            application.log.info("ws open")
        }

        send(
            Frame.Text(
                wireJson.encodeToString(
                    Envelope.serializer(),
                    Envelope(
                        type = "HELLO",
                        messageId = UUID.randomUUID().toString(),
                        payload =
                            mapOf(
                                "serverVersion" to BuildInfo.PROXIC_VERSION,
                                "connectionId" to connectionId,
                            ),
                    ),
                ),
            ),
        )

        try {
            for (frame in incoming) {
                if (frame !is Frame.Text) continue
                val text = frame.readText()
                val msg =
                    runCatching {
                        wireJson.decodeFromString(Envelope.serializer(), text)
                    }.getOrNull()

                if (msg == null) {
                    sendEnvelope("ERROR", mapOf("errorCode" to "MALFORMED_MESSAGE"))
                    continue
                }
                // §1.32: a protocol mismatch fails clearly rather
                // than being guessed at.
                if (msg.protocolVersion != BuildInfo.PROTOCOL_VERSION) {
                    sendEnvelope(
                        "ERROR",
                        mapOf(
                            "errorCode" to "PROTOCOL_VERSION_MISMATCH",
                            "expected" to BuildInfo.PROTOCOL_VERSION.toString(),
                            "received" to msg.protocolVersion.toString(),
                        ),
                    )
                    close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "protocol version"))
                    return@webSocket
                }

                when (msg.type) {
                    "PING" -> sendEnvelope("PONG", emptyMap(), msg.messageId)
                    else ->
                        sendEnvelope(
                            "ERROR",
                            mapOf("errorCode" to "UNKNOWN_TYPE", "type" to msg.type),
                        )
                }
            }
        } finally {
            openConnections.decrementAndGet()
            LogContext.withFields(LogContext.CONNECTION_ID to connectionId) {
                application.log.info("ws close")
            }
        }
    }
}
