package net.barnflix.proxic.auth

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.ServerConfig

// The sign-up page's two questions — spec 0014 (owner 2026-10-25).
//
// The only account routes a stranger can reach (SignedInGate lets these
// two through): "is this link alive?" and "make my account". Both are
// throttled like sign-in, and every dead or wrong link gets the same
// answer, so a guesser learns nothing.

@Serializable
data class JoinPeekRequest(val token: String = "")

@Serializable
data class JoinPeekResponse(val email: String, val invitedBy: String, val suggestedUsername: String)

@Serializable
data class JoinRequest(
    val token: String = "",
    val username: String = "",
    val displayName: String = "",
    val password: String = "",
)

/** Sends invitations and makes their links: the Admin page's half. */
class InviteDesk(
    val invites: Invites,
    private val mailer: Mailer,
    /** Whether an email account is set up now; without one the Admin page copies the link. */
    private val emailReady: () -> Boolean,
    private val publicOrigin: String,
) {
    /** The code goes after "#": a browser never sends it to the server or to Cloudflare's logs. */
    fun linkFor(token: String): String = "${publicOrigin.trimEnd('/')}/join#$token"

    fun emailReady(): Boolean = emailReady.invoke()

    /** Emails the link when it can. */
    fun deliver(invite: NewInvite): Delivery {
        val link = linkFor(invite.token)
        return mailer.send(
            invite.email,
            InviteEmail.SUBJECT,
            InviteEmail.text(link, invite.expiresAt, publicOrigin),
            InviteEmail.html(link, invite.expiresAt, publicOrigin),
            listOf(InviteEmail.logo),
        )
    }

    /** The Email tab's "Send a test email". */
    fun test(to: String): Delivery =
        mailer.send(
            to,
            "Proxic Arena: test email",
            "This is a test from Proxic Arena's Admin page. The email account works.",
            "<p>This is a test from Proxic Arena's Admin page. The email account works.</p>",
            emptyList(),
        )
}

private val INVALID = ErrorResponse("INVITE_INVALID", "This invitation is no longer valid.", null)

/** The throttle's key for the sign-up page: one per client, whatever the link. */
private const val JOIN_KEY = "<join>"

fun Route.joinRoutes(
    config: ServerConfig,
    invites: Invites,
    throttle: LoginThrottle,
    signIns: SignInLog? = null,
) {
    route("/auth/join") {
        post("/peek") {
            if (!call.joinAllowed(config, throttle)) return@post
            val token = runCatching { call.receive<JoinPeekRequest>() }.getOrNull()?.token.orEmpty()
            val peek = invites.peek(token)
            if (peek == null) {
                throttle.recordFailure(call.clientSource(), JOIN_KEY)
                return@post call.respond(HttpStatusCode.Gone, INVALID)
            }
            call.respond(JoinPeekResponse(peek.email, peek.invitedBy, peek.suggestedUsername))
        }

        post {
            if (!call.joinAllowed(config, throttle)) return@post
            val body =
                runCatching { call.receive<JoinRequest>() }.getOrNull()
                    ?: return@post call.respond(
                        HttpStatusCode.BadRequest,
                        ErrorResponse("INVALID_REQUEST", "Expected a username and password.", null),
                    )
            when (val result = invites.join(body.token, body.username, body.displayName, body.password)) {
                JoinResult.Invalid -> {
                    throttle.recordFailure(call.clientSource(), JOIN_KEY)
                    call.respond(HttpStatusCode.Gone, INVALID)
                }

                is JoinResult.Refused ->
                    call.respond(HttpStatusCode.UnprocessableEntity, ErrorResponse(result.code, result.detail, null))

                is JoinResult.Joined -> {
                    signIns?.record(SignInKind.SIGNED_IN, result.user.username, call.clientSource())
                    call.issueSession(
                        config,
                        LoginResult.Success(Principal(result.user, result.sessionId), result.token),
                    )
                    call.respond(HttpStatusCode.Created, MeResponse(true, result.user.view()))
                }
            }
        }
    }
}

/**
 * The same origin check and throttle as signing in; answers for itself
 * when it refuses. [key] keeps the join page's and the reset page's
 * failures apart (spec 0026).
 */
internal suspend fun ApplicationCall.joinAllowed(
    config: ServerConfig,
    throttle: LoginThrottle,
    key: String = JOIN_KEY,
): Boolean {
    if (!originAcceptable(config)) {
        respond(
            HttpStatusCode.Forbidden,
            ErrorResponse("BAD_ORIGIN", "That request came from an unexpected origin.", null),
        )
        return false
    }
    val wait = throttle.retryAfter(clientSource(), key) ?: return true
    response.headers.append("Retry-After", wait.toString())
    respond(
        HttpStatusCode.TooManyRequests,
        ErrorResponse("TOO_MANY_ATTEMPTS", "Too many tries. Try again in $wait seconds.", null),
    )
    return false
}
