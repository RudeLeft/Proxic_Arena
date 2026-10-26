package net.barnflix.proxic.admin

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.auth.Delivery
import net.barnflix.proxic.auth.Emails
import net.barnflix.proxic.auth.MailSave
import net.barnflix.proxic.auth.MailSettingsInput

// The Email tab — spec 0014 amendment 1 (owner 2026-10-25). Administrators
// only. The password goes one way: saved or replaced here, never sent back
// (the view says only whether one is saved), never in the action record.

@Serializable
data class EmailTestRequest(val to: String = "")

@Serializable
data class EmailTestResult(val sent: Boolean, val detail: String)

fun Route.adminEmailRoutes(admin: AdminServices) {
    val settings = admin.mailSettings ?: return
    val desk = admin.inviteDesk ?: return

    get("/email") {
        call.asAdmin(admin) ?: return@get
        call.respond(settings.view())
    }

    put("/email") {
        val by = call.asAdmin(admin) ?: return@put
        val input =
            runCatching { call.receive<MailSettingsInput>() }.getOrNull()
                ?: return@put call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_REQUEST", "Expected the email account's settings.", null),
                )
        when (val result = settings.save(input, by.user.userId)) {
            is MailSave.Refused ->
                call.respond(
                    HttpStatusCode.UnprocessableEntity,
                    ErrorResponse("INVALID_EMAIL_SETTINGS", result.detail, null),
                )

            MailSave.Saved -> {
                // What changed, never the password: only whether one was set.
                val detail = "host=${input.host.trim()} password=${if (input.password == null) "kept" else "changed"}"
                val actions = admin.records.actions
                actions.record(by.user.userId, by.user.username, AdminAction.EMAIL_SETTINGS_SAVED, "email", detail)
                call.respond(settings.view())
            }
        }
    }

    delete("/email") {
        val by = call.asAdmin(admin) ?: return@delete
        settings.clear()
        admin.records.actions.record(by.user.userId, by.user.username, AdminAction.EMAIL_SETTINGS_REMOVED, "email")
        call.respond(settings.view())
    }

    post("/email/test") {
        call.asAdmin(admin) ?: return@post
        val to =
            runCatching { call.receive<EmailTestRequest>() }.getOrNull()?.to?.let(Emails::normalize)
                ?: return@post call.respond(
                    HttpStatusCode.UnprocessableEntity,
                    ErrorResponse("INVALID_EMAIL", "That is not an email address.", null),
                )
        val result =
            when (val delivery = withContext(Dispatchers.IO) { desk.test(to) }) {
                Delivery.Sent -> EmailTestResult(true, "Sent to $to. Check that inbox (and its spam folder).")
                Delivery.NotSetUp ->
                    EmailTestResult(false, "No email account is set up yet. Fill in the settings and save first.")
                is Delivery.Failed -> EmailTestResult(false, delivery.why)
            }
        call.respond(result)
    }
}
