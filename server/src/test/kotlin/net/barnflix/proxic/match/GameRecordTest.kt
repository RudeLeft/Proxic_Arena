package net.barnflix.proxic.match

import org.slf4j.LoggerFactory
import java.io.File
import java.nio.file.Files
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.zip.GZIPInputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** PHASE_07 §7.56 — the game record file, and how long it is kept. */
class GameRecordTest {
    private val log = LoggerFactory.getLogger(GameRecordTest::class.java)

    /**
     * Every complete line. A record still being written has no gzip
     * trailer yet, so reading it ends in an EOF after the last line --
     * as `zcat` would say "unexpected end of file" after printing it all.
     */
    private fun lines(file: File): List<String> {
        val bytes = java.io.ByteArrayOutputStream()
        GZIPInputStream(file.inputStream()).use { input ->
            val chunk = ByteArray(CHUNK)
            try {
                while (true) {
                    val n = input.read(chunk)
                    if (n < 0) break
                    bytes.write(chunk, 0, n)
                }
            } catch (_: java.io.EOFException) {
                // the end of what has been written so far
            }
        }
        return bytes.toString(Charsets.UTF_8).lines().filter { it.isNotEmpty() }
    }

    private companion object {
        const val CHUNK = 512
    }

    @Test
    fun `every frame each way, and a note, in order with the time`() {
        val records = GameRecords(Files.createTempDirectory("records").toString())
        val matchId = UUID.randomUUID()
        val record = GameRecord.open(records, matchId, log)
        record.toWorker("""{"type":"DECISION_RESPONSE","decisionId":1,"actionId":"a"}""")
        record.fromWorker("""{"type":"DECISION_ACCEPTED","decisionId":"1"}""")
        record.note("""{"refusedAnswer":"STALE_DECISION"}""")
        // Readable BEFORE close: a server that died mid-match keeps its record.
        assertEquals(3, lines(records.fileFor(matchId)).size)
        record.close()

        val read = lines(records.fileFor(matchId))
        assertTrue(read[0].startsWith("{\"ms\":"), read[0])
        assertTrue(read[0].contains("\"from\":\"server\",\"frame\":{\"type\":\"DECISION_RESPONSE\""), read[0])
        assertTrue(read[1].contains("\"from\":\"worker\""), read[1])
        assertTrue(read[2].contains("\"from\":\"note\",\"frame\":{\"refusedAnswer\":\"STALE_DECISION\"}"), read[2])
    }

    @Test
    fun `a record past its keep date is deleted, a recent one is not`() {
        val records = GameRecords(Files.createTempDirectory("records").toString(), Duration.ofDays(30))
        val old = UUID.randomUUID()
        val recent = UUID.randomUUID()
        for (id in listOf(old, recent)) GameRecord.open(records, id, log).close()
        records.fileFor(old).setLastModified(Instant.now().minus(Duration.ofDays(31)).toEpochMilli())

        assertEquals(1, records.sweep())
        assertFalse(records.fileFor(old).exists())
        assertTrue(records.fileFor(recent).exists())
    }

    @Test
    fun `a record that cannot be written stays silent and never throws`() {
        val blocked = Files.createTempFile("not-a-directory", "")
        val record = GameRecord.open(GameRecords(blocked.toString()), UUID.randomUUID(), log)
        record.fromWorker("""{"type":"X"}""")
        record.close()
    }
}
