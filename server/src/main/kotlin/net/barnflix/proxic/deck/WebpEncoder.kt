package net.barnflix.proxic.deck

import org.slf4j.LoggerFactory
import java.awt.image.BufferedImage
import java.io.File
import java.nio.file.Files
import java.util.concurrent.TimeUnit

// Card pictures as WebP at quality 80 -- spec 0121 (Phase 11 P11-E11, owner
// 2026-11-27: "I honestly cannot tell at 80").
//
// Java's ImageIO has no WebP writer, so the pictures are made by libwebp's
// own `cwebp` tool (Alpine's libwebp-tools in the runtime image, pinned with
// it; Ubuntu's `webp` package in CI), run as a separate process for each
// picture. A crash or a hang in native code then stays in that process and
// never takes the server and its live games with it; libwebp gets Alpine's
// security fixes with the image instead of being frozen inside a jar; and no
// native library is loaded into the JVM. Rejected: a Java library wrapping
// libwebp (native code in the server's process, a third-party binary to vet,
// and glibc builds that do not load on Alpine's musl).

/** Writes a picture as WebP; throws when it could not. */
fun interface WebpEncoder {
    /** [image] (opaque, already scaled) as a WebP at [target], whole or not at all. */
    fun encode(
        image: BufferedImage,
        target: File,
    )
}

/** The encoder is not on this machine: every picture keeps today's JPEG copies (spec 0121 scope 5). */
class EncoderMissing(message: String) : Exception(message)

/**
 * libwebp's `cwebp`, one child process per picture: quality 80, method 4
 * (method 6 saved about 2% more for 70% more time, research 2026-11-27), no
 * metadata, at a low priority (`nice`) and with a time limit. The pixels go
 * to it as a PPM file in the temporary folder (a tmpfs in the container), the
 * answer to a `.part` file renamed when whole, as [ZoomCopy.write] does.
 */
class CwebpEncoder(
    private val command: String = "cwebp",
    private val timeoutSeconds: Long = TIMEOUT_SECONDS,
) : WebpEncoder {
    private val log = LoggerFactory.getLogger(CwebpEncoder::class.java)

    /** Whether `cwebp` answered when first asked: asked once, so a missing one costs nothing per picture. */
    val available: Boolean by lazy {
        val answered =
            runCatching {
                val process =
                    ProcessBuilder(command, "-version")
                        .redirectErrorStream(true)
                        .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                        .start()
                process.waitFor(VERSION_TIMEOUT_SECONDS, TimeUnit.SECONDS) && process.exitValue() == 0
            }.getOrDefault(false)
        if (!answered) {
            log.warn("the picture encoder ({}) is missing: card pictures get JPEG copies, not WebP", command)
        }
        answered
    }

    override fun encode(
        image: BufferedImage,
        target: File,
    ) {
        if (!available) throw EncoderMissing("$command is not installed")
        target.parentFile.mkdirs()
        val pixels = Files.createTempFile("proxic-picture-", ".ppm").toFile()
        val partial = File(target.parentFile, "${target.name}.part")
        try {
            writePpm(image, pixels)
            val arguments =
                niceCommand() +
                    listOf(command, "-quiet", "-q", "$QUALITY", "-m", "$METHOD", "-metadata", "none") +
                    listOf(pixels.absolutePath, "-o", partial.absolutePath)
            val process =
                ProcessBuilder(arguments)
                    .redirectErrorStream(true)
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                    .start()
            if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                process.destroyForcibly()
                error("$command took longer than $timeoutSeconds s")
            }
            check(process.exitValue() == 0) { "$command failed (exit ${process.exitValue()})" }
            check(partial.isFile && partial.length() > 0) { "$command wrote nothing" }
            // Whole or not at all: a half-written copy must never be served.
            check(partial.renameTo(target)) { "could not move the copy into place" }
        } finally {
            pixels.delete()
            partial.delete()
        }
    }

    companion object {
        /** The owner's quality, for all three kinds of picture (2026-11-27). */
        const val QUALITY = 80

        /** libwebp's default effort; 6 saved about 2% for 70% more time. */
        const val METHOD = 4

        /** A close-up takes about 0.1 s; a minute means something is wrong. */
        const val TIMEOUT_SECONDS = 60L

        private const val VERSION_TIMEOUT_SECONDS = 10L

        /** Below the server's own threads: a game's turn never waits on a picture. */
        private const val NICENESS = 10

        /** The one the server uses: asked once whether it is there. */
        val shared: CwebpEncoder by lazy { CwebpEncoder() }

        private fun niceCommand(): List<String> =
            listOf("/usr/bin/nice", "/bin/nice")
                .firstOrNull { File(it).canExecute() }
                ?.let { listOf(it, "-n", "$NICENESS") }
                .orEmpty()

        /** [image] as a binary PPM (P6): what `cwebp` reads with no library besides its own. */
        internal fun writePpm(
            image: BufferedImage,
            file: File,
        ) {
            val width = image.width
            val height = image.height
            val row = IntArray(width)
            file.outputStream().buffered().use { out ->
                out.write("P6\n$width $height\n255\n".toByteArray(Charsets.US_ASCII))
                val bytes = ByteArray(width * RGB)
                for (y in 0 until height) {
                    image.getRGB(0, y, width, 1, row, 0, width)
                    for (x in 0 until width) {
                        val rgb = row[x]
                        bytes[x * RGB] = (rgb shr RED_SHIFT).toByte()
                        bytes[x * RGB + 1] = (rgb shr GREEN_SHIFT).toByte()
                        bytes[x * RGB + 2] = rgb.toByte()
                    }
                    out.write(bytes)
                }
            }
        }

        private const val RGB = 3
        private const val RED_SHIFT = 16
        private const val GREEN_SHIFT = 8
    }
}

/** A WebP file's width and height from its header (VP8, VP8L or VP8X); null if it is not one. */
fun webpSize(file: File): Pair<Int, Int>? {
    val header = file.inputStream().use { it.readNBytes(WEBP_HEADER_BYTES) }
    if (header.size < WEBP_HEADER_BYTES) return null
    val ascii = { at: Int -> String(header, at, 4, Charsets.US_ASCII) }
    if (ascii(0) != "RIFF" || ascii(8) != "WEBP") return null
    val u = { at: Int -> header[at].toInt() and 0xff }
    val u24 = { at: Int -> u(at) or (u(at + 1) shl 8) or (u(at + 2) shl 16) }
    return when (ascii(12)) {
        // Lossy: the frame's start code, then 14-bit width and height.
        "VP8 " -> ((u(26) or (u(27) shl 8)) and 0x3fff) to ((u(28) or (u(29) shl 8)) and 0x3fff)
        // Lossless: a signature byte, then 14 bits each, less one.
        "VP8L" -> {
            val bits = u(21) or (u(22) shl 8) or (u(23) shl 16) or (u(24) shl 24)
            ((bits and 0x3fff) + 1) to (((bits shr 14) and 0x3fff) + 1)
        }
        // Extended: 24 bits each, less one.
        "VP8X" -> (u24(24) + 1) to (u24(27) + 1)
        else -> null
    }
}

private const val WEBP_HEADER_BYTES = 30
