package net.barnflix.proxic.auth

import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import javax.sql.DataSource
import kotlin.system.exitProcess

// Account administration — PHASE_03 §3.56–§3.64, §3.110, §3.150.
//
// The only way an account comes into existence. §3.57 forbids
// shipping or auto-creating default credentials, and §3.112 forbids
// an open registration API, so this tool IS the registration path.
//
// Run in the deployed container:
//
//   docker compose exec arena-server /app/bin/arena-admin user create
//
// §3.58 is the rule that shapes it: a password must never appear in
// command-line arguments, shell history, Compose YAML or Git. So it
// is never accepted as an argument — only read interactively, and
// only from a real terminal.

/**
 * The outcome of one command, as a value.
 *
 * Returning rather than exiting lets the whole tool be tested
 * without a subprocess, which is what makes §3.139's "a password on
 * the command line is refused" a real assertion instead of a
 * promise.
 */
data class AdminResult(val exitCode: Int, val message: String) {
    companion object {
        fun ok(message: String) = AdminResult(0, message)

        fun failure(message: String) = AdminResult(1, message)
    }
}

/** Reads a password without echoing it. Replaced in tests. */
fun interface PasswordPrompt {
    /** Null when no interactive terminal is available. */
    fun read(prompt: String): CharArray?
}

object ConsolePasswordPrompt : PasswordPrompt {
    override fun read(prompt: String): CharArray? {
        // System.console() is null when stdin is a pipe or a file,
        // which is exactly the case where a password would end up
        // in a script or a log. Refusing there is deliberate.
        val console = System.console() ?: return null
        return console.readPassword(prompt)
    }
}

class AdminTool(
    private val accounts: Accounts,
    private val sessions: Sessions,
    private val dataSource: DataSource,
    private val prompt: PasswordPrompt = ConsolePasswordPrompt,
) {
    fun run(args: List<String>): AdminResult {
        // §3.58, §3.139 — a password given as an argument is
        // REFUSED, not used and warned about. Warning would leave it
        // in shell history and in whatever logged the command line,
        // and the account would exist with a compromised password.
        // Exactly `--password` or `--password=...`, NOT a prefix
        // match: `--password-stdin` also starts with "--password",
        // and the first version of this guard refused the very
        // automation path it was meant to leave open.
        args.firstOrNull { it == "--password" || it.startsWith("--password=") }?.let {
            return AdminResult.failure(
                "Refusing: a password must not be passed on the command line.\n" +
                    "It would be kept in shell history and in process listings.\n" +
                    "Run the command without it and type the password when asked.",
            )
        }

        return when (args.firstOrNull()) {
            "create" -> create(args.drop(1))
            "list" -> list()
            "disable" -> setStatus(args.drop(1), AccountStatus.DISABLED)
            "enable" -> setStatus(args.drop(1), AccountStatus.ACTIVE)
            "set-password" -> setPassword(args.drop(1))
            "revoke-sessions" -> revokeSessions(args.drop(1))
            else -> AdminResult.failure(USAGE)
        }
    }

    private fun create(args: List<String>): AdminResult {
        val username =
            args.getOrNull(0)
                ?: return AdminResult.failure("Usage: create <username> [--admin] [--name <display>]")
        val role = if (args.contains("--admin")) Role.ADMIN else Role.PLAYER
        val displayName = args.indexOf("--name").let { if (it >= 0) args.getOrNull(it + 1) else null }

        Usernames.rejectionReason(username)?.let { return AdminResult.failure(it) }
        if (accounts.findByUsername(username) != null) {
            // §3.60. Named plainly here: this is an operator at a
            // terminal, not a login form, so there is no
            // username-enumeration concern to balance.
            return AdminResult.failure("A user named \"$username\" already exists.")
        }

        val password =
            (
                if (args.contains("--password-stdin")) {
                    readPasswordFromStdin()
                } else {
                    readNewPassword()
                }
            ) ?: return AdminResult.failure(NO_TERMINAL)
        PasswordHasher.rejectionReason(password)?.let { return AdminResult.failure(it) }

        val user = accounts.createUser(username, password, role, displayName ?: username)
        return AdminResult.ok("Created ${user.username} (${user.role}) ${user.userId}")
    }

    private fun list(): AdminResult {
        val rows = StringBuilder("username              role    status    sessions\n")
        dataSource.connection.use { connection ->
            connection.createStatement().executeQuery(
                """
                SELECT u.username, u.role, u.status,
                       (SELECT count(*) FROM user_session s
                        WHERE s.user_id = u.user_id
                          AND s.revoked_at IS NULL AND s.expires_at > now())
                FROM app_user u ORDER BY u.username
                """.trimIndent(),
            ).use { result ->
                while (result.next()) {
                    rows.append(
                        "%-21s %-7s %-9s %d%n".format(
                            result.getString(1),
                            result.getString(2),
                            result.getString(3),
                            result.getInt(4),
                        ),
                    )
                }
            }
        }
        return AdminResult.ok(rows.toString().trimEnd())
    }

    private fun setStatus(
        args: List<String>,
        status: AccountStatus,
    ): AdminResult {
        val username = args.firstOrNull() ?: return AdminResult.failure("Usage: disable <username>")
        val user =
            accounts.findByUsername(username)
                ?: return AdminResult.failure("No user named \"$username\".")

        // §3.110 — refuse to leave the installation with no usable
        // administrator. An operator who locks themselves out has no
        // second tool to recover with: this IS the recovery tool.
        if (status == AccountStatus.DISABLED &&
            user.role == Role.ADMIN &&
            activeAdminCount() <= 1
        ) {
            return AdminResult.failure(
                "Refusing: \"$username\" is the only active administrator.\n" +
                    "Create another admin first, or this installation would have none.",
            )
        }

        accounts.setStatus(user.userId, status)
        val note = if (status == AccountStatus.DISABLED) " and their sessions were revoked" else ""
        return AdminResult.ok("${user.username} is now $status$note.")
    }

    private fun setPassword(args: List<String>): AdminResult {
        val username =
            args.firstOrNull()
                ?: return AdminResult.failure("Usage: set-password <username>")
        val user =
            accounts.findByUsername(username)
                ?: return AdminResult.failure("No user named \"$username\".")

        val password =
            (
                if (args.contains("--password-stdin")) {
                    readPasswordFromStdin()
                } else {
                    readNewPassword()
                }
            ) ?: return AdminResult.failure(NO_TERMINAL)
        PasswordHasher.rejectionReason(password)?.let { return AdminResult.failure(it) }

        accounts.changePassword(user.userId, password)
        // §3.36 — changePassword revokes every session, and the
        // operator should be told rather than discover it when
        // someone is signed out.
        return AdminResult.ok("Password changed for ${user.username}; all sessions revoked.")
    }

    private fun revokeSessions(args: List<String>): AdminResult {
        val username =
            args.firstOrNull()
                ?: return AdminResult.failure("Usage: revoke-sessions <username>")
        val user =
            accounts.findByUsername(username)
                ?: return AdminResult.failure("No user named \"$username\".")
        val revoked = sessions.revokeAllForUser(user.userId)
        return AdminResult.ok("Revoked $revoked session(s) for ${user.username}.")
    }

    /**
     * Read a password from stdin, for automation (`--password-stdin`).
     *
     * §3.58 forbids a password in command-line ARGUMENTS, shell
     * history, Compose YAML and Git, and PREFERS interactive input.
     * It does not forbid stdin, and stdin is the established secure
     * automation channel — `docker login --password-stdin` exists
     * for exactly this reason.
     *
     * The difference matters: an argument is visible in `ps`, in
     * shell history and in any process-listing log. A pipe is
     * visible to nothing but the two processes.
     *
     * This exists because the browser end-to-end tests (§3.140)
     * need an account, and the alternative was a test-only
     * bootstrap credential — which §3.57 forbids outright, and
     * rightly.
     */
    private fun readPasswordFromStdin(): String? =
        generateSequence(::readlnOrNull)
            .firstOrNull()
            ?.trim()
            ?.takeIf { it.isNotEmpty() }

    /** Ask twice; a typo in a password nobody can see is a lockout. */
    private fun readNewPassword(): String? {
        val first = prompt.read("New password: ") ?: return null
        val second = prompt.read("Repeat password: ") ?: return null
        val password = String(first)
        val repeat = String(second)
        first.fill('\u0000')
        second.fill('\u0000')
        if (password != repeat) return ""
        return password
    }

    private fun activeAdminCount(): Int =
        dataSource.connection.use { connection ->
            connection.createStatement().executeQuery(
                "SELECT count(*) FROM app_user WHERE role = 'ADMIN' AND status = 'ACTIVE'",
            ).use {
                it.next()
                it.getInt(1)
            }
        }

    companion object {
        private const val NO_TERMINAL =
            "No interactive terminal. Run this with `docker compose exec` (not `-T`), " +
                "so a password can be typed rather than piped."

        private val USAGE =
            """
            arena-admin <command>

              create <username> [--admin] [--name <display name>]
              list
              disable <username>
              enable <username>
              set-password <username>
              revoke-sessions <username>

            Passwords are typed when asked for, and are never
            accepted as arguments (PHASE_03 §3.58).

            For automation, `--password-stdin` reads the password
            from a pipe. An argument is visible in `ps` and in shell
            history; a pipe is not.
            """.trimIndent()
    }
}

/** Entry point for the `arena-admin` script in the image. */
fun main(args: Array<String>) {
    val config = ServerConfig.fromEnvironment()
    val database = Database.connect(config)
    if (database == null) {
        System.err.println("No database configured. Set PROXIC_DATABASE_URL.")
        exitProcess(78)
    }
    database.use {
        val sessions = Sessions(it.dataSource())
        val tool = AdminTool(Accounts(it.dataSource(), sessions), sessions, it.dataSource())
        val result = tool.run(args.toList())
        if (result.exitCode == 0) println(result.message) else System.err.println(result.message)
        exitProcess(result.exitCode)
    }
}
