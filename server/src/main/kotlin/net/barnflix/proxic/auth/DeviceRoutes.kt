package net.barnflix.proxic.auth

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.request.header
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.ServerConfig
import java.util.UUID

// Linking a computer — spec 0021. Mounted under /api/auth beside the
// other account routes.
//
//   POST   /api/auth/device-codes   signed in, CSRF   make a code
//   GET    /api/auth/devices        signed in         your linked computers
//   DELETE /api/auth/devices/{id}   signed in, CSRF   remove one
//   POST   /api/auth/device-link    open, throttled   trade a code for a token
//
// The last is the only one a stranger reaches (SignedInGate lets it
// through), so it gets the sign-in route's origin check and throttle,
// and every failure the same answer.

@Serializable
data class DeviceCodeResponse(val code: String, val expiresAt: String)

@Serializable
data class DeviceView(val deviceId: String, val name: String, val createdAt: String, val lastUsedAt: String?)

@Serializable
data class DevicesResponse(val devices: List<DeviceView>)

@Serializable
data class DeviceLinkRequest(val code: String = "", val deviceName: String = "")

@Serializable
data class DeviceLinkResponse(val token: String, val user: UserView)

private val CODE_INVALID =
    ErrorResponse("CODE_INVALID", "That code is not valid. Make a new one on Arena's Account page.", null)

/** The throttle's key for linking: one per client, whatever the code. */
private const val LINK_KEY = "<device-link>"

/** The device token from `Authorization: Bearer`, or null. */
internal fun ApplicationCall.bearerToken(): String? =
    request.header("Authorization")
        ?.takeIf { it.startsWith("Bearer ", ignoreCase = true) }
        ?.substring("Bearer ".length)
        ?.trim()
        ?.takeIf { it.isNotEmpty() }

fun Route.deviceRoutes(
    config: ServerConfig,
    sessions: Sessions,
    devices: DeviceLinks,
    throttle: LoginThrottle,
) {
    post("/device-codes") {
        if (!call.csrfOk(config)) return@post
        val principal = call.requireAuth(sessions) ?: return@post
        val code = devices.makeCode(principal.user.userId)
        call.respond(DeviceCodeResponse(code.code, code.expiresAt.toString()))
    }

    get("/devices") {
        val principal = call.requireAuth(sessions) ?: return@get
        val list =
            devices.list(principal.user.userId).map {
                DeviceView(it.deviceId.toString(), it.name, it.createdAt.toString(), it.lastUsedAt?.toString())
            }
        call.respond(DevicesResponse(list))
    }

    delete("/devices/{deviceId}") {
        if (!call.csrfOk(config)) return@delete
        val principal = call.requireAuth(sessions) ?: return@delete
        val deviceId = runCatching { UUID.fromString(call.parameters["deviceId"]) }.getOrNull()
        // Not yours and not real are the same answer (§4.65's lesson).
        if (deviceId == null || !devices.remove(principal.user.userId, deviceId)) {
            return@delete call.respond(
                HttpStatusCode.NotFound,
                ErrorResponse("NOT_FOUND", "That computer is not linked to your account.", null),
            )
        }
        call.respond(HttpStatusCode.NoContent)
    }

    post("/device-link") {
        if (!call.originAcceptable(config)) {
            return@post call.respond(
                HttpStatusCode.Forbidden,
                ErrorResponse("BAD_ORIGIN", "That request came from an unexpected origin.", null),
            )
        }
        val source = call.clientSource()
        throttle.retryAfter(source, LINK_KEY)?.let { wait ->
            call.response.headers.append("Retry-After", wait.toString())
            return@post call.respond(
                HttpStatusCode.TooManyRequests,
                ErrorResponse("TOO_MANY_ATTEMPTS", "Too many tries. Try again in $wait seconds.", null),
            )
        }
        val body = runCatching { call.receive<DeviceLinkRequest>() }.getOrNull() ?: DeviceLinkRequest()
        val linked = devices.link(body.code, body.deviceName)
        if (linked == null) {
            throttle.recordFailure(source, LINK_KEY)
            return@post call.respond(HttpStatusCode.Gone, CODE_INVALID)
        }
        call.respond(HttpStatusCode.Created, DeviceLinkResponse(linked.token, linked.user.view()))
    }
}
