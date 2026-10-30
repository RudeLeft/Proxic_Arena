package net.barnflix.proxic.report

import java.nio.file.Files
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals

/** Spec 0039 — a report's copy of a game still being played reads to its end. */
class RecordCopyTest {
    @Test
    fun `a record still being written is copied whole and closed`() {
        val dir = Files.createTempDirectory("record-copy").toFile()
        try {
            val live = dir.resolve("live.jsonl.gz")
            // As the game record writes: flushed line by line, not yet closed.
            val writer = GZIPOutputStream(live.outputStream(), true).bufferedWriter()
            writer.write("{\"line\":1}\n{\"line\":2}\n")
            writer.flush()
            val copy = dir.resolve("copy.jsonl.gz")
            copyRecordSealed(live, copy)
            writer.close()

            val text = GZIPInputStream(copy.inputStream()).bufferedReader().readText()
            assertEquals("{\"line\":1}\n{\"line\":2}\n", text)
        } finally {
            dir.deleteRecursively()
        }
    }
}
