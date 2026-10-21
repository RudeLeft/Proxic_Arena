package net.barnflix.proxic.auth

import kotlinx.serialization.Serializable
import org.slf4j.LoggerFactory
import java.time.Duration
import javax.sql.DataSource

// Sign-in activity an administrator can read — PHASE_07 §7.67,
// Amendment 9 (with the address each attempt came from).
//
// A second copy of what AuthEvents already logs, for one reason: the
// log is readable by whoever can reach the container, and the Admin
// page is for the person who runs the server from a browser. The log
// line is still written; this never replaces it.
//
// Never stores a password in any form (§3.95). The username is the
// normalized one that was TRIED, which §3.96 permits on a failure.

enum class SignInKind { SIGNED_IN, FAILED, THROTTLED }

@Serializable
data class SignInView(
    val at: String,
    val kind: String,
    val username: String,
    /** False when the name matched no account ("No such account"). */
    val known: Boolean,
    val address: String? = null,
)

class SignInLog(private val dataSource: DataSource) {
    private val log = LoggerFactory.getLogger(SignInLog::class.java)

    /**
     * Record one attempt. Never throws: a sign-in must not fail
     * because its audit row could not be written, and the log line
     * (AuthEvents) is already there.
     */
    fun record(
        kind: SignInKind,
        username: String,
        address: String?,
    ) {
        runCatching {
            dataSource.connection.use { connection ->
                connection.prepareStatement(
                    """
                    INSERT INTO sign_in_event (kind, username, user_id, address)
                    VALUES (?, ?, (SELECT user_id FROM app_user WHERE username_normalized = ?), ?)
                    """.trimIndent(),
                ).use {
                    val normalized = Usernames.normalize(username)
                    it.setString(1, kind.name)
                    it.setString(2, normalized)
                    it.setString(3, normalized)
                    it.setString(4, address?.take(MAX_ADDRESS))
                    it.executeUpdate()
                }
            }
        }.onFailure { log.warn("a sign-in record was not written: {}", it.toString()) }
    }

    /** The last [window] of attempts, newest first, at most [limit]. */
    fun recent(
        window: Duration = Duration.ofHours(24),
        limit: Int = 200,
    ): List<SignInView> =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT at, kind, username, user_id IS NOT NULL, address
                  FROM sign_in_event
                 WHERE at > now() - ?::interval
                 ORDER BY at DESC, event_id DESC
                 LIMIT ?
                """.trimIndent(),
            ).use { statement ->
                statement.setString(1, "${window.seconds} seconds")
                statement.setInt(2, limit)
                statement.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) {
                            add(
                                SignInView(
                                    at = rows.getTimestamp(1).toInstant().toString(),
                                    kind = rows.getString(2),
                                    username = rows.getString(3),
                                    known = rows.getBoolean(4),
                                    address = rows.getString(5),
                                ),
                            )
                        }
                    }
                }
            }
        }

    /** Forget attempts older than [retention]; a diagnostics window, not an archive. */
    fun purge(retention: Duration = Duration.ofDays(30)): Int =
        dataSource.connection.use { connection ->
            connection.prepareStatement("DELETE FROM sign_in_event WHERE at < now() - ?::interval").use {
                it.setString(1, "${retention.seconds} seconds")
                it.executeUpdate()
            }
        }

    private companion object {
        /** An IPv6 address with a zone is under 64; anything longer is not an address. */
        const val MAX_ADDRESS = 64
    }
}
