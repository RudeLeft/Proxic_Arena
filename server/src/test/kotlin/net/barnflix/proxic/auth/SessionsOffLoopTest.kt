package net.barnflix.proxic.auth

import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * A session check never holds the thread that asked (AuthGates
 * `authenticateOffLoop`).
 *
 * Found on spec 0119's slow-link test (RUN 2026-11-27, stack B): a WebSocket's
 * handler runs on its connection's Netty event loop, which other connections
 * share. Its session check (a query and an UPDATE, so a commit) ran on that
 * thread, so while the database was slow -- commits of 1-5 s in WALSync,
 * waits of 10 s for a pool connection -- a live game on the same loop got no
 * messages and no beats, and its page gave up on the silence (4001) and came
 * back. Here the "event loop" is one thread with a beat of its own on it, and
 * the database is made slow by holding the session's row.
 */
class SessionsOffLoopTest {
    private var container: FreshDatabase? = null
    private var database: Database? = null
    private lateinit var accounts: Accounts
    private lateinit var sessions: Sessions

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
                    dataRoot = "build/test-data",
                    databasePasswordValue = container!!.password,
                    databaseUserValue = container!!.username,
                ),
            )!!.also { it.migrate() }
        sessions = Sessions(database!!.dataSource())
        accounts = Accounts(database!!.dataSource(), sessions)
    }

    @AfterTest
    fun stop() {
        database?.close()
        container?.stop()
    }

    @Test
    fun `a slow session check leaves the asking thread free for the other connections on it`() {
        accounts.createUser("RudeLeft", "a perfectly fine passphrase", Role.ADMIN)
        val token = (accounts.login("RudeLeft", "a perfectly fine passphrase") as LoginResult.Success).token

        // The database made slow: another transaction holds the session's
        // row (as a commit stuck in WALSync does), so the check's UPDATE waits.
        val held = CountDownLatch(1)
        val holder =
            Thread {
                database!!.dataSource().connection.use { connection ->
                    connection.autoCommit = false
                    connection.createStatement().use { it.execute("SELECT 1 FROM user_session FOR UPDATE") }
                    held.countDown()
                    Thread.sleep(HOLD_MS)
                    connection.commit()
                }
            }.apply { start() }
        assertTrue(held.await(10, TimeUnit.SECONDS), "the row was not taken")

        val loop = Executors.newSingleThreadExecutor().asCoroutineDispatcher()
        try {
            val beats = AtomicInteger()
            val started = System.nanoTime()
            val principal =
                runBlocking {
                    withContext(loop) {
                        // Another connection's beat, on the same thread.
                        val beat =
                            launch {
                                while (true) {
                                    delay(BEAT_MS)
                                    beats.incrementAndGet()
                                }
                            }
                        val answer = sessions.authenticateOffLoop(token)
                        beat.cancelAndJoin()
                        answer
                    }
                }
            val waitedMs = (System.nanoTime() - started) / 1_000_000
            assertNotNull(principal, "the session is still good")
            assertTrue(waitedMs >= HOLD_MS / 2, "the check did wait for the database ($waitedMs ms)")
            // Before the fix: 0 (the thread was inside the query the whole time).
            assertTrue(
                beats.get() >= (waitedMs / BEAT_MS) / 2,
                "the other connection's beat ran ${beats.get()} times in $waitedMs ms",
            )
        } finally {
            loop.close()
            holder.join()
        }
    }

    @Test
    fun `every session check in the server goes through authenticateOffLoop`() {
        // TEST-010: production calls it. The only direct call of
        // Sessions.authenticate is the helper's own.
        val direct =
            File("src/main/kotlin")
                .walkTopDown()
                .filter { it.isFile && it.extension == "kt" }
                .flatMap { file ->
                    file.readLines().mapIndexedNotNull { i, line ->
                        val code = line.substringBefore("//")
                        "${file.name}:${i + 1}".takeIf { DIRECT.containsMatchIn(code) }
                    }
                }.toList()
        assertEquals(emptyList(), direct, "a session check on the asking thread")
        val gates = File("src/main/kotlin/net/barnflix/proxic/auth/AuthGates.kt").readText()
        assertTrue(gates.contains("withContext(Dispatchers.IO) { authenticate(token) }"), "the helper moves the check")
        val socket = File("src/main/kotlin/net/barnflix/proxic/auth/UserSocket.kt").readText()
        assertTrue(socket.contains("sessions.authenticateOffLoop(token)"), "the lobby socket's 30 s re-check")
    }

    private companion object {
        const val HOLD_MS = 1_500L
        const val BEAT_MS = 50L
        val DIRECT = Regex("""\bsessions\.authenticate\(""")
    }
}
