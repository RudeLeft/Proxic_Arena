package net.barnflix.proxic.auth

import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.header
import io.ktor.server.response.respond
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.ServerConfig

// The gates — PHASE_03 §3.38, §3.43, §3.19, §3.50–§3.53.
//
// Who is this, may they do it, and did this request really come from
// our own page. Every protected route in the application goes through
// these four functions, which is why they are worth having in one
// place rather than scattered among the handlers they guard.
//
// Split from AuthRoutes.kt when detekt found that file past its
// function limit.

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
 * Require an ADMIN session, or answer and return null.
 *
 * §3.19, §3.155 -- the role is read from the SESSION, re-resolved
 * from the database on this request. Never from a request body, a
 * header or a WebSocket frame: a client that can state its own role
 * has no role at all.
 *
 * 403 and not 401 for a signed-in non-admin, because the caller is
 * known and signing in again will not help. 401 for nobody, because
 * signing in might.
 *
 * No route uses this yet, and that is deliberate rather than an
 * oversight: Phase 3 keeps account administration in `arena-admin`,
 * behind host access, so there is no admin HTTP surface to guard
 * (see docs/architecture/AUTHORIZATION.md). The gate exists, and is
 * tested, so that the first admin endpoint cannot be written without
 * one.
 */
suspend fun ApplicationCall.requireAdmin(sessions: Sessions): Principal? {
    val principal = requireAuth(sessions) ?: return null
    if (principal.user.role != Role.ADMIN) {
        respond(
            HttpStatusCode.Forbidden,
            ErrorResponse("FORBIDDEN", "That action needs an administrator account.", null),
        )
        return null
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
internal fun ApplicationCall.originAcceptable(config: ServerConfig): Boolean {
    val origin = request.header(HttpHeaders.Origin) ?: return true
    if (origin == config.publicOrigin) return true

    val host = request.header(HttpHeaders.Host) ?: return false
    // A browser's Origin carries no port when it is the default for
    // the scheme, so both forms are compared.
    return origin == "http://$host" || origin == "https://$host"
}
