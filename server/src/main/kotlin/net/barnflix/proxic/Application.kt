package net.barnflix.proxic

import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.http.content.*
import io.ktor.server.netty.*
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

    embeddedServer(Netty, port = config.port, host = config.host) {
        module(config)
    }.start(wait = true)
}

/** Counts connections so logs can be correlated (§1.30). */
private val connectionSequence = AtomicLong(0)

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
    }

    install(WebSockets) {
        // Ktor 2.x takes java.time.Duration here, not kotlin.time.
        pingPeriod = Duration.ofSeconds(15)
        timeout = Duration.ofSeconds(30)
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
        webSocket("/ws/system") {
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
                LogContext.withFields(LogContext.CONNECTION_ID to connectionId) {
                    application.log.info("ws close")
                }
            }
        }

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
