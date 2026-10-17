package net.barnflix.proxic.auth

import net.barnflix.proxic.LogContext
import org.slf4j.Logger
import java.util.UUID

// Security-relevant authentication events — PHASE_03 §3.94–§3.97.
//
// Deferred at the Phase 3 gate and carried through Phases 4 and 5.
// What was there instead: two lines about WebSockets opening and
// closing, and nothing at all about signing in, signing out,
// changing a password, or an administrator disabling an account.
//
// The point of these is the question you cannot answer afterwards.
// "Did somebody sign in as RudeLeft at 3am?" has no answer without
// a record, and the moment you want the answer is the moment it is
// too late to start keeping one.
//
// WHAT IS NEVER WRITTEN HERE — §3.95, and this is the whole reason
// the events go through one function rather than being scattered as
// log calls:
//
//   password        not even its length
//   session token   the raw one; the id is fine, the token is not
//   CSRF token
//   password hash
//
// A `log.info("login for $username with $password")` at some call
// site is exactly the shape of mistake that one chokepoint prevents,
// and `AuthEventsTest` asserts the chokepoint holds.

/**
 * The events §3.94 names, plus the ones Phases 4 and 5 added.
 *
 * An enum rather than free text: a log you intend to search needs
 * stable tokens, and "login failed" / "failed login" / "LOGIN_FAIL"
 * in three files is a grep that misses things.
 */
enum class AuthEvent {
    LOGIN_SUCCESS,
    LOGIN_FAILURE,
    LOGIN_THROTTLED,
    LOGOUT,
    LOGOUT_EVERYWHERE,
    PASSWORD_CHANGED,
    DISPLAY_NAME_CHANGED,
    SESSION_REVOKED,
    SESSION_EXPIRED_IN_FLIGHT,
    USER_CREATED,
    USER_DISABLED,
    USER_ENABLED,
    ADMIN_PASSWORD_RESET,
}

/**
 * Write one event.
 *
 * [username] is the NORMALIZED one (§3.95), and §3.96 explicitly
 * permits recording it on a failure — the attempted name is what
 * makes a brute-force attempt legible, and it is not a secret.
 *
 * [userId] and [sessionId] are null where they are not known, which
 * is the honest state for a failed login: there may be no such user
 * to name.
 *
 * The request id and connection id are NOT parameters. They are
 * already in the MDC when a request or a socket is in scope, put
 * there by Ktor's CallId plugin and by the socket handler, and
 * passing them again would invite a call site to pass the wrong
 * one.
 */
fun Logger.authEvent(
    event: AuthEvent,
    result: AuthResult,
    username: String? = null,
    userId: UUID? = null,
    sessionId: UUID? = null,
    detail: String? = null,
) {
    LogContext.withFields(
        LogContext.SESSION_ID to sessionId?.toString(),
        LogContext.PLAYER_ID to userId?.toString(),
    ) {
        // One line, fixed shape, so it greps. The fields that vary
        // are named; the ones that are always in the MDC are added
        // by the layout.
        info(
            "auth event={} result={} username={}{}",
            event.name,
            result.name,
            username ?: "-",
            detail?.let { " detail=$it" } ?: "",
        )
    }
}

/** Did it work? §3.95 asks for a result alongside the event. */
enum class AuthResult {
    SUCCESS,
    FAILURE,
    REFUSED,
}
