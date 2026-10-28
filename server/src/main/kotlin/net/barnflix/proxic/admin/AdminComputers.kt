package net.barnflix.proxic.admin

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import java.util.UUID
import javax.sql.DataSource

// The Admin page's Computers tab — spec 0027 (owner 2026-10-28).
//
// Every computer linked to the Deck Builder, for every player, and Remove.
// Remove ends the link exactly as the player's own Remove on the Account
// page does (spec 0021): the Deck Builder is refused on its next use and
// says so. Nothing secret is listed; Arena keeps only a hash of a link's
// token, never the token.
//
//   GET  /api/admin/computers
//   POST /api/admin/computers/{deviceId}/remove

@Serializable
data class AdminComputerView(
    val deviceId: String,
    val userId: String,
    val username: String,
    val displayName: String,
    /** The name the player gave the computer when linking it. */
    val name: String,
    val linkedAt: String,
    val lastUsedAt: String? = null,
    /** Owner decision 1: the address it last connected from, as Sign-ins shows. */
    val lastUsedFrom: String? = null,
)

@Serializable
data class AdminComputersResponse(val computers: List<AdminComputerView>)

class AdminComputers(private val dataSource: DataSource) {
    /** Every live link, most recently used first; never used ones last, newest link first. */
    fun list(): List<AdminComputerView> =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT d.device_id, u.user_id, u.username, u.display_name, d.name,
                       d.created_at, d.last_used_at, d.last_used_from
                  FROM device_link d
                  JOIN app_user u ON u.user_id = d.user_id
                 WHERE d.revoked_at IS NULL
                 ORDER BY d.last_used_at DESC NULLS LAST, d.created_at DESC
                """.trimIndent(),
            ).use { statement ->
                statement.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) {
                            add(
                                AdminComputerView(
                                    deviceId = rows.getObject(1, UUID::class.java).toString(),
                                    userId = rows.getObject(2, UUID::class.java).toString(),
                                    username = rows.getString(3),
                                    displayName = rows.getString(4),
                                    name = rows.getString(5),
                                    linkedAt = rows.getTimestamp(6).toInstant().toString(),
                                    lastUsedAt = rows.getTimestamp(7)?.toInstant()?.toString(),
                                    lastUsedFrom = rows.getString(8),
                                ),
                            )
                        }
                    }
                }
            }
        }

    /** Ends one link; the player's username and the computer's name, or null when it was already gone. */
    fun remove(deviceId: UUID): Pair<String, String>? =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                UPDATE device_link d SET revoked_at = now()
                  FROM app_user u
                 WHERE d.device_id = ? AND d.revoked_at IS NULL AND u.user_id = d.user_id
                RETURNING u.username, d.name
                """.trimIndent(),
            ).use {
                it.setObject(1, deviceId)
                it.executeQuery().use { rows -> if (rows.next()) rows.getString(1) to rows.getString(2) else null }
            }
        }
}

private val GONE = ErrorResponse("COMPUTER_NOT_FOUND", "That computer is no longer linked.", null)

fun Route.adminComputerRoutes(admin: AdminServices) {
    get("/computers") {
        call.asAdmin(admin) ?: return@get
        val computers = admin.computers ?: return@get call.respond(AdminComputersResponse(emptyList()))
        call.respond(AdminComputersResponse(computers.list()))
    }

    post("/computers/{deviceId}/remove") {
        val by = call.asAdmin(admin) ?: return@post
        val deviceId =
            call.parameters["deviceId"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@post call.respond(HttpStatusCode.NotFound, GONE)
        val (username, name) =
            admin.computers?.remove(deviceId)
                ?: return@post call.respond(HttpStatusCode.NotFound, GONE)
        // Who removed which computer from whose account (§7.67); the
        // computer's name, never anything that could use the link.
        admin.records.actions.record(
            by.user.userId,
            by.user.username,
            AdminAction.COMPUTER_REMOVED,
            username,
            "computer=$name",
        )
        call.respond(DoneResponse(username, "$name is no longer linked to $username."))
    }
}
