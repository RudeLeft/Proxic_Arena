package net.barnflix.proxic.auth

import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.request.header
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.ServerConfig

// Authentication HTTP surface — PHASE_03 §3.19–§3.24, §3.41–§3.55.
//
// The browser holds exactly one credential: an HttpOnly cookie it
// cannot read (§3.24). Nothing here puts a token, a role or an
// authorisation claim anywhere JavaScript can reach — §3.19 is
// explicit that the browser is told WHO it is for display, never
// WHAT it may do.

const val SESSION_COOKIE = "proxicarena_session"
const val CSRF_COOKIE = "proxicarena_csrf"
const val CSRF_HEADER = "X-CSRF-Token"

@Serializable
data class LoginRequest(val username: String = "", val password: String = "")

@Serializable
data class UserView(
    val userId: String,
    val username: String,
    val displayName: String,
    val role: String,
)

@Serializable
data class MeResponse(val authenticated: Boolean, val user: UserView? = null)

@Serializable
data class DisplayNameRequest(val displayName: String = "")

@Serializable
data class PasswordChangeRequest(
    val currentPassword: String = "",
    val newPassword: String = "",
)

/** The principal for this call, or null (§3.38). */
suspend fun ApplicationCall.principal(sessions: Sessions): Principal? {
    val token = request.cookies[SESSION_COOKIE] ?: return null
    return sessions.authenticate(token)
}

/**
 * Require a session, or answer 401 and return null.
 *
 * §3.43: unauthenticated is 401. Not 403, which means "I know who
 * you are and you still may not", and not a redirect, which an API
 * client cannot follow usefully.
 */
suspend fun ApplicationCall.requireAuth(sessions: Sessions): Principal? {
    val principal = principal(sessions)
    if (principal == null) {
        respond(
            HttpStatusCode.Unauthorized,
            ErrorResponse("UNAUTHENTICATED", "Sign in to continue.", null),
        )
    }
    return principal
}

/**
 * §3.50–§3.53 — CSRF, plus an origin check.
 *
 * Double-submit: the token is in a readable cookie AND must be
 * echoed in a header. A cross-site attacker can cause the cookie to
 * be SENT but cannot read it to set the header, because the browser
 * refuses cross-origin reads.
 *
 * The origin check is a second, independent gate. Either alone has
 * known weaknesses; together they cover each other.
 *
 * Returns true when the request may proceed; otherwise it has
 * already been answered.
 */
suspend fun ApplicationCall.csrfOk(config: ServerConfig): Boolean {
    if (request.local.method !in MUTATING_METHODS) return true

    // §3.53 — the configured origin, or this request's own.
    if (!originAcceptable(config)) {
        respond(
            HttpStatusCode.Forbidden,
            ErrorResponse("BAD_ORIGIN", "That request came from an unexpected origin.", null),
        )
        return false
    }

    val cookie = request.cookies[CSRF_COOKIE]
    val header = request.header(CSRF_HEADER)
    // §3.51 — header only. A token accepted from a query string
    // ends up in logs, referrers and browser history.
    if (cookie.isNullOrBlank() || header.isNullOrBlank() || cookie != header) {
        respond(
            HttpStatusCode.Forbidden,
            ErrorResponse("CSRF_FAILED", "That request could not be verified.", null),
        )
        return false
    }
    return true
}

private val MUTATING_METHODS =
    setOf(
        HttpMethod.Post,
        HttpMethod.Put,
        HttpMethod.Patch,
        HttpMethod.Delete,
    )

/**
 * Is this request's `Origin` acceptable? (§3.53)
 *
 * Accepted when there is no Origin at all (a non-browser client,
 * which CSRF does not apply to), when it matches the configured
 * public origin, or when it matches THE ORIGIN THIS REQUEST WAS
 * SENT TO — which is the definition of same-origin.
 *
 * The last case is not a loosening. The first version compared only
 * against the configured origin, so the page served from
 * http://127.0.0.1:8080 could not log in to the server at
 * http://127.0.0.1:8080: every request from the application itself
 * was refused as foreign. It failed identically on the LAN port and
 * would fail on any future host.
 *
 * Found by a browser test, after the server suite passed: the test
 * engine sends no Origin header, so nothing below the browser could
 * have caught it.
 */
private fun ApplicationCall.originAcceptable(config: ServerConfig): Boolean {
    val origin = request.header(HttpHeaders.Origin) ?: return true
    if (origin == config.publicOrigin) return true

    val host = request.header(HttpHeaders.Host) ?: return false
    // A browser's Origin carries no port when it is the default for
    // the scheme, so both forms are compared.
    return origin == "http://$host" || origin == "https://$host"
}

fun Route.authRoutes(
    config: ServerConfig,
    accounts: Accounts,
    sessions: Sessions,
    throttle: LoginThrottle,
) {
    route("/auth") {
        post("/login") {
            // The login endpoint itself is NOT CSRF-protected: there
            // is no session yet, and the cookie the check relies on
            // is issued BY this endpoint. The origin check still
            // applies, and the throttle below is what makes forged
            // logins pointless.
            if (!call.originAcceptable(config)) {
                call.respond(
                    HttpStatusCode.Forbidden,
                    ErrorResponse("BAD_ORIGIN", "That request came from an unexpected origin.", null),
                )
                return@post
            }

            val body =
                runCatching { call.receive<LoginRequest>() }.getOrNull()
                    ?: return@post call.respond(
                        HttpStatusCode.BadRequest,
                        ErrorResponse("INVALID_REQUEST", "Expected a username and password.", null),
                    )

            val source = call.clientSource()
            throttle.retryAfter(source, body.username)?.let { seconds ->
                call.response.headers.append("Retry-After", seconds.toString())
                return@post call.respond(
                    HttpStatusCode.TooManyRequests,
                    ErrorResponse(
                        "TOO_MANY_ATTEMPTS",
                        "Too many sign-in attempts. Try again in $seconds seconds.",
                        null,
                    ),
                )
            }

            when (val result = accounts.login(body.username, body.password)) {
                is LoginResult.Success -> {
                    throttle.recordSuccess(source, body.username)
                    call.issueSession(config, result)
                    call.respond(HttpStatusCode.OK, MeResponse(true, result.principal.user.view()))
                }

                else -> {
                    throttle.recordFailure(source, body.username)
                    // §3.42, §3.43 — one message, one status, every
                    // time. 401 and nothing that distinguishes an
                    // unknown user from a wrong password.
                    call.respond(
                        HttpStatusCode.Unauthorized,
                        ErrorResponse(
                            "INVALID_CREDENTIALS",
                            "That username and password do not match.",
                            null,
                        ),
                    )
                }
            }
        }

        post("/logout") {
            // §3.33. Deliberately idempotent and always 204: telling
            // an unauthenticated caller "you were not signed in"
            // says more than it needs to, and the client's job is
            // the same either way.
            call.principal(sessions)?.let { sessions.revokeSession(it.sessionId) }
            call.clearSession(config)
            call.respond(HttpStatusCode.NoContent)
        }

        get("/me") {
            // §3.49 — an unauthenticated caller gets a documented
            // answer, not a 401. The page uses this to decide
            // whether to show a login form, and an error would make
            // "logged out" look like "broken".
            val principal = call.principal(sessions)
            call.respond(
                if (principal == null) {
                    MeResponse(false)
                } else {
                    MeResponse(true, principal.user.view())
                },
            )
        }

        post("/password") {
            // §3.35, §3.36.
            if (!call.csrfOk(config)) return@post
            val principal = call.requireAuth(sessions) ?: return@post
            val body =
                runCatching { call.receive<PasswordChangeRequest>() }.getOrNull()
                    ?: return@post call.respond(
                        HttpStatusCode.BadRequest,
                        ErrorResponse("INVALID_REQUEST", "Expected a current and new password.", null),
                    )

            // The current password is re-verified even though the
            // caller is authenticated: a borrowed session must not
            // be enough to take the account.
            if (accounts.login(principal.user.username, body.currentPassword) !is LoginResult.Success) {
                return@post call.respond(
                    HttpStatusCode.Unauthorized,
                    ErrorResponse("INVALID_CREDENTIALS", "That password is not correct.", null),
                )
            }
            PasswordHasher.rejectionReason(body.newPassword)?.let { reason ->
                return@post call.respond(
                    HttpStatusCode.UnprocessableEntity,
                    ErrorResponse("WEAK_PASSWORD", reason, null),
                )
            }

            accounts.changePassword(principal.user.userId, body.newPassword)
            // Every session died, including this one (§3.36), so the
            // cookie is cleared rather than left pointing at a
            // revoked session.
            call.clearSession(config)
            call.respond(HttpStatusCode.NoContent)
        }

        post("/display-name") {
            if (!call.csrfOk(config)) return@post
            val principal = call.requireAuth(sessions) ?: return@post
            val body =
                runCatching { call.receive<DisplayNameRequest>() }.getOrNull()
                    ?: return@post call.respond(
                        HttpStatusCode.BadRequest,
                        ErrorResponse("INVALID_REQUEST", "Expected a display name.", null),
                    )
            val name = body.displayName.trim()
            if (name.isEmpty() || name.length > 64) {
                return@post call.respond(
                    HttpStatusCode.UnprocessableEntity,
                    ErrorResponse("INVALID_DISPLAY_NAME", "A display name is 1 to 64 characters.", null),
                )
            }
            accounts.updateDisplayName(principal.user.userId, name)
            call.respond(MeResponse(true, principal.user.copy(displayName = name).view()))
        }
    }
}

private fun User.view() =
    UserView(
        userId = userId.toString(),
        username = username,
        displayName = displayName,
        // §3.19 — the role is sent for DISPLAY, and the server never
        // trusts it coming back. Authorisation is decided from the
        // session, every time.
        role = role.name,
    )

/**
 * The client's address, for throttling.
 *
 * §3.97: behind Cloudflare every request arrives from the tunnel,
 * so the socket address is the same for everybody. `CF-Connecting-IP`
 * is the real client — but it is a HEADER, and a header is only
 * trustworthy when nothing but the proxy can set it.
 *
 * Here that holds: the server is not reachable except through the
 * tunnel or the LAN port, and a LAN caller forging the header can
 * only throttle themselves differently.
 */
private fun ApplicationCall.clientSource(): String =
    request.header("CF-Connecting-IP")
        ?: request.header("X-Forwarded-For")?.substringBefore(',')?.trim()
        ?: request.local.remoteHost

private fun ApplicationCall.issueSession(
    config: ServerConfig,
    result: LoginResult.Success,
) {
    setSessionCookie(config, SESSION_COOKIE, result.token, httpOnly = true)
    // The CSRF token is deliberately READABLE by JavaScript: the
    // page must echo it in a header, which is the half a
    // cross-origin attacker cannot do.
    setSessionCookie(config, CSRF_COOKIE, SessionTokens.generate(), httpOnly = false)
}

private fun ApplicationCall.clearSession(config: ServerConfig) {
    for (name in listOf(SESSION_COOKIE, CSRF_COOKIE)) {
        response.cookies.append(
            name = name,
            value = "",
            maxAge = 0L,
            path = "/",
            secure = config.secureCookies,
            httpOnly = name == SESSION_COOKIE,
        )
    }
}

private fun ApplicationCall.setSessionCookie(
    config: ServerConfig,
    name: String,
    value: String,
    httpOnly: Boolean,
) {
    response.cookies.append(
        name = name,
        value = value,
        maxAge = SessionPolicy.ABSOLUTE.seconds,
        path = "/",
        // §3.23 — Secure stays on even though the tunnel origin is
        // HTTP. Dropping it because the ORIGIN is plain would send
        // the cookie in clear text on any future deployment that
        // is not behind a tunnel.
        secure = config.secureCookies,
        httpOnly = httpOnly,
        extensions = mapOf("SameSite" to "Lax"),
        // The DEFAULT encoding, not RAW. Ktor appends a `$x-enc=RAW`
        // marker to a raw cookie so it can decode it later, and that
        // marker ends up in the Set-Cookie header as an attribute no
        // browser asked for. Session and CSRF tokens are base64url,
        // which URI encoding leaves untouched, so the default costs
        // nothing and emits a clean header.
    )
}
