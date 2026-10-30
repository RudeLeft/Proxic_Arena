package net.barnflix.proxic.report

import io.ktor.http.ContentDisposition
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondFile
import io.ktor.server.response.respondOutputStream
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.PRINCIPAL_KEY
import net.barnflix.proxic.admin.AdminServices
import net.barnflix.proxic.admin.asAdmin

// Spec 0039 — sending a report (any signed-in player, behind the /api
// gate), and reading them (administrators only).

private val NO_REPORT = ErrorResponse("NO_REPORT", "There is no such report.", null)
private val BAD_REPORT = ErrorResponse("INVALID_REPORT", "That report could not be read.", null)
private val BAD_CHANGE = ErrorResponse("INVALID_REQUEST", "Expected a status or a note.", null)

/** POST /api/reports — a player sends a problem or an idea. */
fun Route.reportRoutes(reports: Reports) {
    post("/reports") {
        val submission =
            runCatching { call.receive<ReportSubmission>() }.getOrNull()
                ?: return@post call.respond(HttpStatusCode.BadRequest, BAD_REPORT)
        try {
            val number = reports.submit(call.attributes[PRINCIPAL_KEY].user.userId, submission)
            call.respond(HttpStatusCode.Created, ReportSent(number))
        } catch (refused: ReportRefused) {
            call.respond(
                HttpStatusCode.UnprocessableEntity,
                ErrorResponse("REPORT_REFUSED", refused.message ?: "Refused.", null),
            )
        }
    }
}

/** The report's number from the path, or a 404 already answered. */
private suspend fun ApplicationCall.reportNumber(): Int? {
    val number = parameters["number"]?.toIntOrNull()
    if (number == null) respond(HttpStatusCode.NotFound, NO_REPORT)
    return number
}

/** The Admin page's Reports tab: under /api/admin, administrators only. */
fun Route.adminReportRoutes(admin: AdminServices) {
    get("/reports") {
        call.asAdmin(admin) ?: return@get
        call.respond(admin.reports?.list() ?: ReportsResponse(emptyList(), 0))
    }
    get("/reports/{number}") {
        call.asAdmin(admin) ?: return@get
        val number = call.reportNumber() ?: return@get
        val report = admin.reports?.detail(number) ?: return@get call.respond(HttpStatusCode.NotFound, NO_REPORT)
        call.respond(report)
    }
    put("/reports/{number}") {
        call.asAdmin(admin) ?: return@put
        val number = call.reportNumber() ?: return@put
        val change =
            runCatching { call.receive<ReportChange>() }.getOrNull()
                ?: return@put call.respond(HttpStatusCode.BadRequest, BAD_CHANGE)
        val reports = admin.reports
        if (reports == null || !reports.change(number, change)) {
            return@put call.respond(HttpStatusCode.NotFound, NO_REPORT)
        }
        call.respond(reports.detail(number) ?: return@put call.respond(HttpStatusCode.NotFound, NO_REPORT))
    }
    delete("/reports/{number}") {
        call.asAdmin(admin) ?: return@delete
        val number = call.reportNumber() ?: return@delete
        if (admin.reports?.delete(number) != true) return@delete call.respond(HttpStatusCode.NotFound, NO_REPORT)
        call.respond(HttpStatusCode.NoContent)
    }
    adminReportDownloads(admin)
}

/** One file to read in the page, or the whole report as a zip. */
private fun Route.adminReportDownloads(admin: AdminServices) {
    get("/reports/{number}/files/{name}") {
        call.asAdmin(admin) ?: return@get
        val number = call.reportNumber() ?: return@get
        val file =
            admin.reports?.file(number, call.parameters["name"].orEmpty())
                ?: return@get call.respond(HttpStatusCode.NotFound, NO_REPORT)
        val type =
            when {
                file.name.endsWith(".png") -> ContentType.Image.PNG
                file.name.endsWith(".gz") -> ContentType.Application.GZip
                else -> ContentType.Text.Plain.withParameter("charset", "utf-8")
            }
        call.response.header(HttpHeaders.ContentType, type.toString())
        call.respondFile(file)
    }
    get("/reports/{number}/zip") {
        call.asAdmin(admin) ?: return@get
        val number = call.reportNumber() ?: return@get
        val reports = admin.reports
        if (reports?.detail(number) == null) return@get call.respond(HttpStatusCode.NotFound, NO_REPORT)
        call.response.header(
            HttpHeaders.ContentDisposition,
            ContentDisposition.Attachment
                .withParameter(ContentDisposition.Parameters.FileName, "proxic-report-$number.zip")
                .toString(),
        )
        call.respondOutputStream(ContentType.Application.Zip) { reports.zip(number, this) }
    }
}
