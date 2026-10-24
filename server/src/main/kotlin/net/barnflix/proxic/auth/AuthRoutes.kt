package net.barnflix.proxic.auth

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.application.log
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
data class LogoutAllResponse(val revokedSessions: Int)

@Serializable
data class DisplayNameRequest(val displayName: String = "")

/** Spec 0006 — "avatar-01".."avatar-50", or null for the default picture. */
@Serializable
data class AvatarRequest(val avatar: String? = null)

@Serializable
data class PasswordChangeRequest(
    val currentPassword: String = "",
    val newPassword: String = "",
)

fun Route.authRoutes(
    config: ServerConfig,
    accounts: Accounts,
    sessions: Sessions,
    throttle: LoginThrottle,
    // PHASE_07 §7.67 — the copy of each attempt the Admin page reads.
    signIns: SignInLog? = null,
    // Spec 0006 — told when a name or an avatar others see changes.
    changes: AccountChanges = AccountChanges(),
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
                // §3.94 — a throttled attempt is its own event. It
                // is the one that says somebody is TRYING.
                call.application.log.authEvent(
                    AuthEvent.LOGIN_THROTTLED,
                    AuthResult.REFUSED,
                    username = body.username.trim().lowercase(),
                )
                signIns?.record(SignInKind.THROTTLED, body.username, source)
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
                    call.application.log.authEvent(
                        AuthEvent.LOGIN_SUCCESS,
                        AuthResult.SUCCESS,
                        username = result.principal.user.username,
                        userId = result.principal.user.userId,
                        sessionId = result.principal.sessionId,
                    )
                    signIns?.record(SignInKind.SIGNED_IN, result.principal.user.username, source)
                    call.issueSession(config, result)
                    call.respond(HttpStatusCode.OK, MeResponse(true, result.principal.user.view()))
                }

                else -> {
                    throttle.recordFailure(source, body.username)
                    // §3.96 — the ATTEMPTED name is recorded, which
                    // is what makes a brute-force attempt legible.
                    // The password is not, not even its length.
                    call.application.log.authEvent(
                        AuthEvent.LOGIN_FAILURE,
                        AuthResult.FAILURE,
                        username = body.username.trim().lowercase(),
                    )
                    signIns?.record(SignInKind.FAILED, body.username, source)
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
            call.principal(sessions)?.let {
                sessions.revokeSession(it.sessionId)
                call.application.log.authEvent(
                    AuthEvent.LOGOUT,
                    AuthResult.SUCCESS,
                    username = it.user.username,
                    userId = it.user.userId,
                    sessionId = it.sessionId,
                )
            }
            call.clearSession(config)
            call.respond(HttpStatusCode.NoContent)
        }

        post("/logout-all") {
            // §3.34 -- end every session this user holds, on every
            // device, including this one.
            //
            // Distinct from /logout, which ends only the session
            // that made the request. This is what someone reaches
            // for after using a shared computer, and the whole point
            // is that it reaches the sessions they can no longer
            // get at.
            //
            // It mutates, so it is behind CSRF; and it needs a
            // session, because "revoke everything" must name WHOSE
            // everything, and the only trustworthy answer is the
            // caller's own session (never a username in the body).
            if (!call.csrfOk(config)) return@post
            val principal = call.requireAuth(sessions) ?: return@post
            val revoked = sessions.revokeAllForUser(principal.user.userId)
            call.application.log.authEvent(
                AuthEvent.LOGOUT_EVERYWHERE,
                AuthResult.SUCCESS,
                username = principal.user.username,
                userId = principal.user.userId,
                sessionId = principal.sessionId,
                detail = "sessions=$revoked",
            )
            call.clearSession(config)
            call.respond(LogoutAllResponse(revoked))
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

        // §3.35-§3.38 -- the routes that change an account live
        // in AccountRoutes.kt. Split out when detekt found this
        // function past its complexity threshold: the answer to a
        // route table that has outgrown one function is a second
        // function, not a higher threshold.
        accountRoutes(config, accounts, sessions, changes)
    }
}

internal fun User.view() =
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

internal fun ApplicationCall.clearSession(config: ServerConfig) {
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
        // The DEFAULT encoding, not RAW.
        //
        // Ktor appends an `$x-enc=` marker so it can decode the value
        // later, and it does so for the default encoding too -- the
        // real header reads `...; SameSite=Lax; $x-enc=URI_ENCODING`.
        // An earlier version of this comment claimed the default
        // avoided the marker; the acceptance pass read the live
        // header and found otherwise.
        //
        // It is harmless: an unknown cookie attribute is ignored by
        // every browser, and the VALUE is untouched -- session and
        // CSRF tokens are base64url, which URI encoding leaves
        // alone, which is why the cookie the browser sends back
        // still matches the hash in the database.
        //
        // RAW is still the wrong choice: it would stop Ktor
        // normalising anything, for no gain on values that need no
        // encoding.
    )
}
