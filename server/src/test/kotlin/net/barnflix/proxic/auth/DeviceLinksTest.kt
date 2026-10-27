package net.barnflix.proxic.auth

import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/** Spec 0021 — codes and device tokens, below HTTP: expiry, the hash, and every way a token ends. */
class DeviceLinksTest {
    private var container: FreshDatabase? = null
    private var database: Database? = null
    private lateinit var accounts: Accounts
    private lateinit var pat: UUID

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container = TestPostgres.fresh()
        database =
            Database.connect(
                ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = container!!.jdbcUrl,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-device-links",
                    secureCookies = false,
                    sessionSecretValue = "test-only-session-secret-0123456789abcdef",
                    databasePasswordValue = container!!.password,
                    databaseUserValue = container!!.username,
                ),
            )!!
        database!!.migrate()
        accounts = Accounts(database!!.dataSource())
        pat = accounts.createUser("Pat", "a perfectly fine passphrase", Role.PLAYER).userId
    }

    @AfterTest
    fun stop() {
        database?.close()
        container!!.stop()
    }

    private fun links(at: Instant = Instant.now()) = DeviceLinks(database!!.dataSource()) { at }

    @Test
    fun `a code dies after ten minutes`() {
        val now = Instant.now()
        val code = links(now).makeCode(pat).code
        assertNull(links(now.plus(Duration.ofMinutes(11))).link(code, "late"))
        val fresh = links(now).makeCode(pat).code
        assertNotNull(links(now.plus(Duration.ofMinutes(9))).link(fresh, "in time"))
    }

    @Test
    fun `codes and tokens are kept only as hashes`() {
        val code = links().makeCode(pat).code
        val token = links().link(code, "desktop")!!.token
        database!!.dataSource().connection.use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery("SELECT code_hash FROM device_code").use { rows ->
                    rows.next()
                    assertEquals(SessionTokens.hash(code.replace("-", "")), rows.getString(1))
                }
                statement.executeQuery("SELECT token_hash FROM device_link").use { rows ->
                    rows.next()
                    assertEquals(SessionTokens.hash(token), rows.getString(1))
                }
            }
        }
    }

    @Test
    fun `a disabled account ends its tokens, and enabling it does not bring them back`() {
        val token = links().link(links().makeCode(pat).code, "desktop")!!.token
        assertNotNull(links().authenticate(token))
        accounts.setStatus(pat, AccountStatus.DISABLED)
        assertNull(links().authenticate(token))
        accounts.setStatus(pat, AccountStatus.ACTIVE)
        assertNull(links().authenticate(token), "revoked, not merely hidden while disabled")
    }

    @Test
    fun `a new password ends a linked computer, as it ends every session`() {
        val token = links().link(links().makeCode(pat).code, "desktop")!!.token
        accounts.changePassword(pat, "another perfectly fine passphrase")
        assertNull(links().authenticate(token))
    }

    @Test
    fun `a typed code is forgiving about case, spaces and the dash, and nothing else`() {
        assertEquals("K7QXM4PD", DeviceLinks.normalize(" k7qx-m4pd "))
        assertNull(DeviceLinks.normalize("K7QX-M4P"), "too short")
        assertNull(DeviceLinks.normalize("K7QX-M4P0"), "0 is not in the alphabet")
    }
}
