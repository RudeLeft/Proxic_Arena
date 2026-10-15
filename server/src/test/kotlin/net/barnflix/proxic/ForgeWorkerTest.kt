package net.barnflix.proxic

import org.junit.jupiter.api.Assumptions.assumeTrue
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Forge worker handshake and failure handling — PHASE_01 §1.65,
 * §1.66, and acceptance tests P1-J / P1-K.
 *
 * §1.66 lists five failures the server must survive: worker could
 * not start, worker exited unexpectedly, worker incompatible, Forge
 * resources missing, protocol mismatch. Each one is asserted here to
 * produce a DISTINCT state, because "the worker is unhappy" is not
 * an operator-actionable answer — a wrong jar and a stopped jar
 * need different responses.
 *
 * Tests needing the built worker jar are SKIPPED with a reason when
 * it is absent (`cd forge-worker && mvn package`), never silently
 * passed.
 */
class ForgeWorkerTest {
    private val workerJar = File("../forge-worker/target/forge-worker-0.1.0.jar")
    private val resRoot = File("../spikes/forge-phase0a/forge-upstream/forge-gui/res")

    private fun config(
        jar: String?,
        res: String?,
    ) = ServerConfig(
        host = "0.0.0.0",
        port = 0,
        databaseUrl = null,
        forgeWorkerJar = jar,
        dataRoot = "build/test-data",
        forgeResRoot = res,
    )

    // --- failures that need no worker jar ---------------------------

    @Test
    fun `no worker configured is unconfigured, not a failure`() {
        val worker = ForgeWorker(config(null, null))
        assertEquals(ForgeWorker.Result.Unconfigured, worker.probe())
        assertEquals("unconfigured", worker.state())
    }

    /** §1.66 "worker could not start". */
    @Test
    fun `a configured jar that does not exist is missing`() {
        val worker = ForgeWorker(config("/no/such/worker.jar", null))
        assertEquals(ForgeWorker.Result.Missing, worker.probe())
        assertEquals("missing", worker.state())
    }

    /** §1.66 "worker exited unexpectedly" / never spoke. */
    @Test
    fun `a jar that is not a worker does not hang the server`() {
        // A valid jar file that exits immediately: `java -jar` on a
        // file with no Main-Class fails fast. The server must notice
        // rather than block forever on readLine().
        val junk = File("build/not-a-worker.jar")
        junk.parentFile.mkdirs()
        ZipOutputStream(junk.outputStream()).use { it.putNextEntry(ZipEntry("nothing.txt")) }

        val worker = ForgeWorker(config(junk.path, null))
        val result = worker.probe(timeoutSeconds = 20)
        assertTrue(result is ForgeWorker.Result.Unreachable, "got $result")
        assertEquals("unreachable", worker.state())
    }

    // --- failures that need the real worker jar ---------------------

    private fun requireWorker() {
        assumeTrue(
            workerJar.isFile,
            "SKIPPED: build the worker first (cd forge-worker && mvn package)",
        )
    }

    /** P1-J — a real handshake against the real worker. */
    @Test
    fun `a real worker reports the pinned Forge commit`() {
        requireWorker()
        assumeTrue(resRoot.isDirectory, "SKIPPED: no Forge resource checkout present")

        val worker = ForgeWorker(config(workerJar.path, resRoot.path))
        val result = worker.probe()
        assertTrue(result is ForgeWorker.Result.Ready, "got $result")
        result as ForgeWorker.Result.Ready
        // The point of §1.61: the worker's OWN claim is compared, not
        // assumed equal to ours.
        assertEquals(BuildInfo.FORGE_COMMIT, result.forgeCommit)
        assertEquals("ok", worker.state())
    }

    /** §1.66 "Forge resources missing". */
    @Test
    fun `a worker without Forge data reports resources-missing, not ok`() {
        requireWorker()
        val worker = ForgeWorker(config(workerJar.path, "/no/such/res"))
        val result = worker.probe()
        assertTrue(result is ForgeWorker.Result.ResourcesMissing, "got $result")
        assertEquals("resources-missing", worker.state())
    }

    /**
     * §1.61, §1.66 "worker incompatible".
     *
     * Builds a worker jar whose declared commit differs by one
     * character. This is the scenario §1.61 names: a jar built
     * against another checkout is otherwise indistinguishable from a
     * current one, and must not silently become the production
     * build.
     */
    @Test
    fun `a worker built against another Forge commit is refused`() {
        requireWorker()
        val tampered = File("build/worker-wrong-commit.jar")
        rewriteWorkerInfo(workerJar, tampered, BuildInfo.FORGE_COMMIT.dropLast(1) + "0")

        val worker = ForgeWorker(config(tampered.path, resRoot.path))
        val result = worker.probe()
        assertTrue(result is ForgeWorker.Result.Incompatible, "got $result")
        assertEquals("incompatible", worker.state())
        // The detail must name what is wrong; "incompatible" alone
        // sends an operator reading source code.
        assertTrue((result as ForgeWorker.Result.Incompatible).detail.contains("commit"))
    }

    /** §1.66 "protocol mismatch", same mechanism. */
    @Test
    fun `a worker speaking another protocol version is refused`() {
        requireWorker()
        val tampered = File("build/worker-wrong-protocol.jar")
        rewriteWorkerInfo(workerJar, tampered, BuildInfo.FORGE_COMMIT, protocol = 99)

        val worker = ForgeWorker(config(tampered.path, resRoot.path))
        val result = worker.probe()
        assertTrue(result is ForgeWorker.Result.Incompatible, "got $result")
        assertTrue((result as ForgeWorker.Result.Incompatible).detail.contains("protocol"))
    }

    /** Readiness must surface the worker state, not invent one. */
    @Test
    fun `readiness degrades when the worker is incompatible`() {
        requireWorker()
        val tampered = File("build/worker-wrong-commit.jar")
        rewriteWorkerInfo(workerJar, tampered, BuildInfo.FORGE_COMMIT.dropLast(1) + "0")

        val config = config(tampered.path, resRoot.path)
        val worker = ForgeWorker(config).also { it.probe() }
        val readiness = HealthChecks(config, null, worker).readiness()

        assertEquals("incompatible", readiness.checks["forgeWorker"])
        assertEquals("degraded", readiness.status)
    }

    /** Copy the jar, replacing the single properties entry. */
    private fun rewriteWorkerInfo(
        source: File,
        destination: File,
        commit: String,
        protocol: Int = BuildInfo.PROTOCOL_VERSION,
    ) {
        destination.parentFile.mkdirs()
        ZipFile(source).use { zip ->
            ZipOutputStream(destination.outputStream()).use { out ->
                for (entry in zip.entries()) {
                    if (entry.isDirectory) continue
                    out.putNextEntry(ZipEntry(entry.name))
                    if (entry.name == "worker-info.properties") {
                        out.write(
                            """
                            proxic.version=${BuildInfo.PROXIC_VERSION}
                            protocol.version=$protocol
                            forge.commit=$commit
                            forge.release=${BuildInfo.FORGE_RELEASE}
                            """.trimIndent().toByteArray(),
                        )
                    } else {
                        zip.getInputStream(entry).use { it.copyTo(out) }
                    }
                    out.closeEntry()
                }
            }
        }
    }
}
