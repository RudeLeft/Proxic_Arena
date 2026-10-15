package net.barnflix.proxic

import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.callid.*
import io.ktor.server.plugins.callloging.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.serialization.json.Json
import org.slf4j.event.Level
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import java.time.Duration

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
private val wireJson = Json {
    encodeDefaults = true
    ignoreUnknownKeys = true
}

fun Application.module(config: ServerConfig = ServerConfig.fromEnvironment()) {

    install(ContentNegotiation) {
        json(Json {
            prettyPrint = false
            encodeDefaults = true
            // An unknown field from a newer client must not 500 the
            // server; protocol version is what gates compatibility.
            ignoreUnknownKeys = true
        })
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
            call.application.log.error("unhandled error (requestId=$id)", cause)
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

    val health = HealthChecks(config)

    routing {
        route("/api") {

            // §1.23 — alive, regardless of dependencies.
            get("/health/live") {
                call.respond(Liveness())
            }

            // §1.24 — can we actually do our job right now?
            get("/health/ready") {
                val result = health.readiness()
                val code = if (result.status == "ok") HttpStatusCode.OK
                           else HttpStatusCode.ServiceUnavailable
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
            application.log.info("ws open connectionId=$connectionId")

            send(
                Frame.Text(
                    wireJson.encodeToString(
                        Envelope.serializer(),
                        Envelope(
                            type = "HELLO",
                            messageId = UUID.randomUUID().toString(),
                            payload = mapOf(
                                "serverVersion" to BuildInfo.PROXIC_VERSION,
                                "connectionId" to connectionId,
                            ),
                        ),
                    )
                )
            )

            try {
                for (frame in incoming) {
                    if (frame !is Frame.Text) continue
                    val text = frame.readText()
                    val msg = runCatching {
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
                        else -> sendEnvelope(
                            "ERROR",
                            mapOf("errorCode" to "UNKNOWN_TYPE", "type" to msg.type),
                        )
                    }
                }
            } finally {
                application.log.info("ws close connectionId=$connectionId")
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
            )
        )
    )
}
