package net.barnflix.proxic.auth

import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The administration tool — PHASE_03 §3.56–§3.64, §3.110, §3.139.
 *
 * This tool is the only way an account comes into existence, and
 * the only way to recover one. Both facts make its refusals more
 * important than its successes.
 */
class AdminToolTest {
    private var container: PostgreSQLContainer<*>? = null
    private var database: Database? = null
    private lateinit var tool: AdminTool
    private lateinit var accounts: Accounts
    private lateinit var sessions: Sessions

    /**
     * A prompt that answers from a script.
     *
     * It REPEATS its last answer rather than running out. The first
     * version returned null once exhausted, so a test that created
     * two accounts silently got "no interactive terminal" for the
     * second — the failure looked like a product bug and was a
     * harness bug.
     */
    private class ScriptedPrompt(private vararg val answers: String) : PasswordPrompt {
        private var index = 0

        override fun read(prompt: String): CharArray? {
            val answer = answers.getOrNull(index) ?: answers.last()
            index++
            return answer.toCharArray()
        }
    }

    /** Always answers the same password; for tests that create several users. */
    private class FixedPrompt(private val password: String) : PasswordPrompt {
        override fun read(prompt: String): CharArray = password.toCharArray()
    }

    private val goodPassword = "a perfectly fine passphrase"

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            PostgreSQLContainer("postgres:16.4-alpine")
                .withDatabaseName("proxic_test")
                .withUsername("proxic")
                .withPassword("test-only-not-a-secret")
                .also { it.start() }

        database =
            Database.connect(
                ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = container!!.jdbcUrl,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-data",
                    databasePasswordValue = container!!.password,
                    databaseUserValue = container!!.username,
                ),
            )!!.also { it.migrate() }

        sessions = Sessions(database!!.dataSource())
        accounts = Accounts(database!!.dataSource(), sessions)
        tool = toolWith(FixedPrompt(goodPassword))
    }

    private fun toolWith(prompt: PasswordPrompt) = AdminTool(accounts, sessions, database!!.dataSource(), prompt)

    @AfterTest
    fun stop() {
        database?.close()
        container?.stop()
    }

    // --- §3.58, §3.139: the refusal that matters most ---------------

    @Test
    fun `a password on the command line is REFUSED, not used`() {
        // §3.139. Refused rather than accepted-with-a-warning: a
        // warning leaves the password in shell history and in every
        // process listing, and the account exists with a
        // compromised password from its first second.
        for (args in listOf(
            listOf("create", "RudeLeft", "--password", "hunter2"),
            listOf("create", "RudeLeft", "--password=hunter2"),
            listOf("set-password", "RudeLeft", "--password", "hunter2"),
        )) {
            val result = tool.run(args)
            assertEquals(1, result.exitCode, "accepted: $args")
            assertTrue(result.message.contains("command line"), result.message)
            // Nothing was created along the way.
            assertNull(accounts.findByUsername("RudeLeft"), "a user was created anyway")
        }
    }

    @Test
    fun `without a terminal the tool refuses rather than reading a pipe`() {
        // A prompt that cannot reach a terminal returns null. Piping
        // a password in is exactly the case §3.58 excludes, because
        // it means the password came from a file or a script.
        val piped = toolWith { null }
        val result = piped.run(listOf("create", "RudeLeft", "--admin"))
        assertEquals(1, result.exitCode)
        assertTrue(result.message.contains("interactive terminal"), result.message)
        assertNull(accounts.findByUsername("RudeLeft"))
    }

    @Test
    fun `a mistyped repeat does not create the account`() {
        // A typo in a password nobody can see is a lockout, so the
        // tool asks twice and refuses a mismatch.
        val mismatched = toolWith(ScriptedPrompt(goodPassword, "something else entirely"))
        val result = mismatched.run(listOf("create", "RudeLeft", "--admin"))
        assertEquals(1, result.exitCode)
        assertNull(accounts.findByUsername("RudeLeft"))
    }

    // --- creating accounts ------------------------------------------

    @Test
    fun `create makes an account that can log in`() {
        val result = tool.run(listOf("create", "RudeLeft", "--admin"))
        assertEquals(0, result.exitCode, result.message)

        val user = assertNotNull(accounts.findByUsername("RudeLeft"))
        assertEquals(Role.ADMIN, user.role)
        assertTrue(accounts.login("RudeLeft", goodPassword) is LoginResult.Success)
    }

    @Test
    fun `a user created without --admin is a player`() {
        tool.run(listOf("create", "Player"))
        assertEquals(Role.PLAYER, accounts.findByUsername("Player")?.role)
    }

    @Test
    fun `duplicates, bad names and weak passwords are refused`() {
        // §3.60.
        assertEquals(0, tool.run(listOf("create", "RudeLeft", "--admin")).exitCode)

        assertEquals(1, tool.run(listOf("create", "RudeLeft")).exitCode, "duplicate accepted")
        assertEquals(1, tool.run(listOf("create", "rudeleft")).exitCode, "case variant accepted")
        assertEquals(1, tool.run(listOf("create", "has spaces")).exitCode)

        val weak = toolWith(ScriptedPrompt("short", "short"))
        assertEquals(1, weak.run(listOf("create", "Another")).exitCode, "weak password accepted")
        assertNull(accounts.findByUsername("Another"))
    }

    // --- §3.110: not leaving the installation unusable --------------

    @Test
    fun `the last active administrator cannot be disabled`() {
        // §3.110. There is no second tool to recover with: THIS is
        // the recovery tool, so locking yourself out of it is
        // unrecoverable short of editing the database by hand.
        tool.run(listOf("create", "RudeLeft", "--admin"))

        val result = tool.run(listOf("disable", "RudeLeft"))
        assertEquals(1, result.exitCode, "the only admin was disabled")
        assertTrue(result.message.contains("only active administrator"), result.message)
        assertEquals(AccountStatus.ACTIVE, accounts.findByUsername("RudeLeft")?.status)
    }

    @Test
    fun `an administrator can be disabled once another exists`() {
        // The negative control: a refusal that always refuses would
        // pass the test above and make the tool useless.
        tool.run(listOf("create", "RudeLeft", "--admin"))
        tool.run(listOf("create", "Second", "--admin"))

        assertEquals(0, tool.run(listOf("disable", "RudeLeft")).exitCode)
        assertEquals(AccountStatus.DISABLED, accounts.findByUsername("RudeLeft")?.status)
    }

    @Test
    fun `disabling a player is never blocked`() {
        tool.run(listOf("create", "RudeLeft", "--admin"))
        tool.run(listOf("create", "Player"))
        assertEquals(0, tool.run(listOf("disable", "Player")).exitCode)
    }

    // --- sessions ---------------------------------------------------

    @Test
    fun `disabling a user ends their sessions`() {
        tool.run(listOf("create", "RudeLeft", "--admin"))
        tool.run(listOf("create", "Player"))
        val token = (accounts.login("Player", goodPassword) as LoginResult.Success).token
        assertNotNull(sessions.authenticate(token))

        tool.run(listOf("disable", "Player"))
        assertNull(sessions.authenticate(token))
    }

    @Test
    fun `set-password changes the password and revokes sessions`() {
        tool.run(listOf("create", "Player"))
        val token = (accounts.login("Player", goodPassword) as LoginResult.Success).token

        val changed = toolWith(ScriptedPrompt("a different long passphrase", "a different long passphrase"))
        val result = changed.run(listOf("set-password", "Player"))
        assertEquals(0, result.exitCode, result.message)
        assertTrue(result.message.contains("sessions revoked"), result.message)

        assertNull(sessions.authenticate(token))
        assertTrue(accounts.login("Player", "a different long passphrase") is LoginResult.Success)
    }

    @Test
    fun `revoke-sessions signs a user out everywhere`() {
        // §3.34 — the operator's version of "sign out everywhere",
        // for when a session is suspected rather than known bad.
        tool.run(listOf("create", "Player"))
        val tokens =
            (1..3).map {
                (accounts.login("Player", goodPassword) as LoginResult.Success).token
            }

        val result = tool.run(listOf("revoke-sessions", "Player"))
        assertEquals(0, result.exitCode)
        assertTrue(result.message.contains("3"), result.message)
        assertTrue(tokens.all { sessions.authenticate(it) == null })
    }

    // --- listing and usage ------------------------------------------

    @Test
    fun `list shows accounts without showing hashes`() {
        tool.run(listOf("create", "RudeLeft", "--admin"))
        val result = tool.run(listOf("list"))

        assertEquals(0, result.exitCode)
        assertTrue(result.message.contains("RudeLeft"))
        assertTrue(result.message.contains("ADMIN"))
        // A password hash in terminal output ends up in scrollback,
        // screenshots and support threads.
        assertTrue(!result.message.contains("argon2"), result.message)
        assertTrue(!result.message.contains(goodPassword), result.message)
    }

    @Test
    fun `an unknown command explains itself`() {
        val result = tool.run(listOf("wibble"))
        assertEquals(1, result.exitCode)
        assertTrue(result.message.contains("arena-admin"), result.message)
        assertTrue(result.message.contains("create"), result.message)
    }

    @Test
    fun `commands against a missing user fail cleanly`() {
        for (args in listOf(
            listOf("disable", "nobody"),
            listOf("enable", "nobody"),
            listOf("set-password", "nobody"),
            listOf("revoke-sessions", "nobody"),
        )) {
            val result = tool.run(args)
            assertEquals(1, result.exitCode, "$args")
            assertTrue(result.message.contains("No user named"), result.message)
        }
    }
}
