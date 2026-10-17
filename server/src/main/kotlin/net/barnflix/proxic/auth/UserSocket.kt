package net.barnflix.proxic.auth

import io.ktor.server.application.log
import io.ktor.server.routing.Route
import io.ktor.server.websocket.DefaultWebSocketServerSession
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import net.barnflix.proxic.BuildInfo
import net.barnflix.proxic.LogContext
import net.barnflix.proxic.lobby.LobbySocketHandler
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong

// The authenticated WebSocket — PHASE_03 §3.77–§3.82.
//
// A proof that the session cookie authenticates an upgrade, and
// that an authorised connection does not stay authorised forever.
// No gameplay messages (§3.79); those are Phase 6's.

private val userConnectionSequence = AtomicLong(0)

private val wireJson =
    Json {
        encodeDefaults = true
        ignoreUnknownKeys = true
    }

/**
 * How often an open connection is re-checked against the database.
 *
 * §3.81: a connection must not remain authorised after revocation,
 * account disable or absolute expiry. A WebSocket is long-lived by
 * nature, so "authorised at connect" is not good enough — the
 * interesting case is a session revoked WHILE someone is connected,
 * which is precisely what revocation is for.
 *
 * Thirty seconds is a compromise the specification explicitly
 * allows ("periodic session validation during heartbeat/activity is
 * acceptable"): short enough that a revoked session dies while the
 * operator is still watching, long enough that five connections do
 * not hammer the database.
 */
private const val REVALIDATE_SECONDS = 30L

/**
 * @param lobby PHASE_05 — presence, invitations and chat ride on
 *   THIS socket rather than a second endpoint. §5.66 permits it
 *   ("may follow established project conventions"), and the reason
 *   to take that permission is above: authentication and the
 *   30-second revalidation already live here, and a second socket
 *   would have to reimplement both. One of them would eventually
 *   drift.
 *
 *   Optional so Phase 3's socket tests still describe a socket with
 *   no lobby attached.
 */
fun Route.userSocket(
    sessions: Sessions,
    lobby: LobbySocketHandler? = null,
) {
    webSocket("/ws/user") {
        // §3.78 — the cookie that authenticates every other request
        // authenticates the upgrade too. Ktor exposes the request's
        // cookies on the session's call.
        val token = call.request.cookies[SESSION_COOKIE]
        val principal = token?.let { sessions.authenticate(it) }

        if (principal == null) {
            // §3.80 — refused, and told why in a way that does not
            // distinguish "no cookie" from "bad cookie".
            close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "authentication required"))
            return@webSocket
        }

        val connectionId = "uconn-${userConnectionSequence.incrementAndGet()}"
        // §3.82 — connection, session and user together. NEVER the
        // token: a log is the one place a session secret must not
        // reach, because logs are copied, shipped and kept.
        LogContext.withFields(
            LogContext.CONNECTION_ID to connectionId,
            LogContext.SESSION_ID to principal.sessionId.toString(),
            LogContext.PLAYER_ID to principal.user.userId.toString(),
        ) {
            call.application.log.info("authenticated ws open")
        }

        try {
            sendFrame(
                "HELLO",
                buildJsonObject {
                    put("connectionId", connectionId)
                    // Safe identity only (§3.79): who, not what they
                    // may do. Authorisation is never a client claim.
                    put("userId", principal.user.userId.toString())
                    put("username", principal.user.username)
                    put("displayName", principal.user.displayName)
                },
            )

            // Presence begins once the client has been greeted, so
            // a joining announcement never arrives before the
            // connection knows who it is.
            val session = lobby?.open(connectionId, principal.user, outgoing)

            while (true) {
                // The timeout IS the revalidation clock: a quiet
                // connection is re-checked on schedule rather than
                // only when the client happens to say something.
                // Three outcomes, and conflating two of them was a
                // bug: null means the revalidation timeout fired,
                // a CLOSED result means the peer has gone, and
                // anything else is a frame.
                //
                // The first version caught the close as an exception
                // and returned null, so the loop treated a dead
                // connection as a quiet one: it spun immediately,
                // re-queried the session on every pass, and never
                // reached its own cleanup. Found by a Phase 5
                // presence test waiting for a departure that was
                // never announced.
                val received =
                    withTimeoutOrNull(REVALIDATE_SECONDS * 1000) {
                        incoming.receiveCatching()
                    }
                if (received != null && received.isClosed) break

                val frame = received?.getOrNull()

                if (!stillAuthorised(sessions, token, principal.sessionId)) {
                    // §3.81.
                    sendFrame("SESSION_ENDED", buildJsonObject { put("reason", "revoked") })
                    close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "session ended"))
                    return@webSocket
                }

                if (frame == null) continue // the revalidation tick
                if (frame !is Frame.Text) continue

                val message =
                    runCatching {
                        wireJson.parseToJsonElement(frame.readText()) as JsonObject
                    }.getOrNull()
                val type = message?.get("type")?.toString()?.trim('"')
                when {
                    type == "PING" -> sendFrame("PONG", buildJsonObject {})

                    // The lobby owns everything else it recognises.
                    // It answers the client itself, because most of
                    // its replies go to OTHER connections too.
                    type != null && message != null && session?.handles(type) == true ->
                        session.handle(type, message)

                    else ->
                        sendFrame(
                            "ERROR",
                            buildJsonObject { put("errorCode", "UNKNOWN_TYPE") },
                        )
                }
            }
        } catch (expected: TimeoutCancellationException) {
            // The loop's own timeout escaping is not an error.
            call.application.log.debug("authenticated ws timeout", expected)
        } finally {
            // Presence must end even when the connection died badly:
            // a user who appears online forever is worse than one
            // who flickers, because somebody will try to invite
            // them.
            lobby?.close(connectionId, principal.user)
            LogContext.withFields(LogContext.CONNECTION_ID to connectionId) {
                call.application.log.info("authenticated ws close")
            }
        }
    }
}

/**
 * Is this connection still allowed?
 *
 * Re-resolved from the database rather than trusted from connect
 * time, and the session id is compared as well: a token that now
 * resolves to a DIFFERENT session is not this connection's session.
 */
private fun stillAuthorised(
    sessions: Sessions,
    token: String,
    sessionId: UUID,
): Boolean {
    val current = sessions.authenticate(token) ?: return false
    return current.sessionId == sessionId
}

private suspend fun DefaultWebSocketServerSession.sendFrame(
    type: String,
    payload: JsonObject,
) {
    val frame =
        buildJsonObject {
            put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
            put("type", type)
            put("messageId", UUID.randomUUID().toString())
            payload.forEach { (key, value) -> put(key, value) }
        }
    send(Frame.Text(wireJson.encodeToString(JsonObject.serializer(), frame)))
}
