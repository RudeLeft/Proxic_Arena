package net.barnflix.proxic.admin

import org.slf4j.LoggerFactory
import java.util.UUID
import javax.sql.DataSource

// Every admin action, recorded — PHASE_07 §7.67, owner decision 16:
// who, what, to which account or room, when; in the server log and in
// the database. The record is written AFTER the action succeeded, so
// it never claims something that did not happen, and a failure to
// write it never undoes the action (the log line is still there).
//
// Never a password, in any form: a password reset is recorded as
// having happened, and that is all.

enum class AdminAction {
    CREATE_ACCOUNT,
    DISABLE_ACCOUNT,
    ENABLE_ACCOUNT,
    MAKE_ADMIN,
    MAKE_PLAYER,
    RESET_PASSWORD,
    SIGN_OUT_EVERYWHERE,
    FORCE_CLOSE_ROOM,

    // Spec 0014 — invitations.
    INVITE_SENT,
    INVITE_RESENT,
    INVITE_CANCELLED,
    EMAIL_SETTINGS_SAVED,
    EMAIL_SETTINGS_REMOVED,

    // Spec 0026 — RESET_PASSWORD above stays for the records already
    // written; no route sets a password now.
    PASSWORD_RESET_SENT,
    EMAIL_CHANGED,
}

class AdminActions(private val dataSource: DataSource) {
    private val log = LoggerFactory.getLogger(AdminActions::class.java)

    fun record(
        adminUserId: UUID,
        adminUsername: String,
        action: AdminAction,
        target: String,
        detail: String? = null,
    ) {
        log.info(
            "admin action={} by={} target={}{}",
            action.name,
            adminUsername,
            target,
            detail?.let { " detail=$it" } ?: "",
        )
        runCatching {
            dataSource.connection.use { connection ->
                connection.prepareStatement(
                    "INSERT INTO admin_action (admin_user_id, action, target, detail) VALUES (?, ?, ?, ?)",
                ).use {
                    it.setObject(1, adminUserId)
                    it.setString(2, action.name)
                    it.setString(3, target)
                    it.setString(4, detail)
                    it.executeUpdate()
                }
            }
        }.onFailure { log.warn("an admin action was not recorded: {}", it.toString()) }
    }
}
