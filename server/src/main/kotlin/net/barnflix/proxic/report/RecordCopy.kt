package net.barnflix.proxic.report

import java.io.EOFException
import java.io.File
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream

/**
 * A copy of a game record that can be read to its end — spec 0039.
 *
 * A game still being played has a record still being written: flushed, but
 * with no gzip ending, so it unpacks with "unexpected end of file". The
 * copy keeps every line written so far and closes it properly.
 */
internal fun copyRecordSealed(
    from: File,
    to: File,
) {
    GZIPOutputStream(to.outputStream()).use { out ->
        GZIPInputStream(from.inputStream()).use { input ->
            val buffer = ByteArray(BUFFER)
            try {
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    out.write(buffer, 0, read)
                }
            } catch (_: EOFException) {
                // The record's end is not written yet: what was read is the record so far.
            }
        }
    }
}

private const val BUFFER = 64 * 1024
