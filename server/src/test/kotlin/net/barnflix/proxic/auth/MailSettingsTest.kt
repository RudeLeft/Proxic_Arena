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
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Spec 0014 amendment 1 — the Email tab's settings: sealed, one way, and the settings file as a fallback. */
class MailSettingsTest {
    private var container: PostgreSQLContainer<*>? = null
    private var database: Database? = null
    private val secret = "test-only-session-secret-0123456789abcdef"
    private val appPassword = "abcd efgh ijkl mnop"

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            PostgreSQLContainer("postgres:16.15-alpine")
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
                    dataRoot = "build/test-mail-settings",
                    secureCookies = false,
                    databasePasswordValue = container!!.password,
                    databaseUserValue = container!!.username,
                ),
            )!!.also { it.migrate() }
        Accounts(database!!.dataSource()).createUser("RudeLeft", "a perfectly fine passphrase", Role.ADMIN)
    }

    @AfterTest
    fun stop() {
        database?.close()
        container!!.stop()
    }

    private fun admin() = Accounts(database!!.dataSource()).findByUsername("RudeLeft")!!.userId

    private fun settings(
        key: String? = secret,
        fallback: MailConfig = MailConfig.fromEnvironment { null },
    ) = MailSettings(database!!.dataSource(), key, fallback)

    private val gmail =
        MailSettingsInput(
            host = "smtp.gmail.com",
            port = 587,
            security = "starttls",
            username = "proxicarena@gmail.com",
            from = "Proxic Arena <proxicarena@gmail.com>",
            password = appPassword,
        )

    @Test
    fun `saved settings are used, and the password is sealed and never shown`() {
        assertIs<MailSave.Saved>(settings().save(gmail, admin()))
        val current = settings().current()
        assertTrue(current.configured)
        assertEquals(appPassword, current.password(), "opened to send")
        val view = settings().view()
        assertEquals("ADMIN", view.source)
        assertTrue(view.passwordSaved)
        assertFalse(view.toString().contains(appPassword), "the view never carries it")

        database!!.dataSource().connection.use { connection ->
            connection.createStatement().executeQuery("SELECT password_sealed FROM mail_settings").use { rows ->
                rows.next()
                assertFalse(String(rows.getBytes(1), Charsets.ISO_8859_1).contains(appPassword), "stored sealed")
            }
        }
    }

    @Test
    fun `a blank password keeps the saved one, an empty one removes it`() {
        settings().save(gmail, admin())
        settings().save(gmail.copy(host = "smtp.example.com", password = null), admin())
        assertEquals(appPassword, settings().current().password(), "kept")
        assertEquals("smtp.example.com", settings().current().host)
        settings().save(gmail.copy(password = ""), admin())
        assertNull(settings().current().password(), "removed")
    }

    @Test
    fun `another server secret cannot open it, and no secret cannot seal one`() {
        settings().save(gmail, admin())
        assertNull(settings(key = "a-different-secret-entirely-0123456789").current().password())
        val refused = assertIs<MailSave.Refused>(settings(key = null).save(gmail, admin()))
        assertTrue(refused.detail.contains("PROXIC_SESSION_SECRET"))
    }

    @Test
    fun `nonsense is refused, and removing falls back to the settings file`() {
        assertIs<MailSave.Refused>(settings().save(gmail.copy(host = " "), admin()))
        assertIs<MailSave.Refused>(settings().save(gmail.copy(port = 0), admin()))
        assertIs<MailSave.Refused>(settings().save(gmail.copy(from = "not an address"), admin()))

        val file =
            MailConfig.fromEnvironment(
                mapOf("PROXIC_SMTP_HOST" to "smtp.file.example", "PROXIC_SMTP_FROM" to "file@example.com")::get,
            )
        settings(fallback = file).save(gmail, admin())
        assertEquals("smtp.gmail.com", settings(fallback = file).current().host, "the Email tab wins")
        settings(fallback = file).clear()
        assertEquals("smtp.file.example", settings(fallback = file).current().host)
        assertEquals("SERVER", settings(fallback = file).view().source)
        assertEquals("NONE", settings().view().source)
    }

    @Test
    fun `a sealed value does not open if it was tampered with`() {
        val box = SecretBox(secret)
        val sealed = box.seal(appPassword)
        assertEquals(appPassword, box.open(sealed))
        sealed[sealed.size - 1] = (sealed[sealed.size - 1].toInt() xor 1).toByte()
        assertNull(box.open(sealed))
    }
}
