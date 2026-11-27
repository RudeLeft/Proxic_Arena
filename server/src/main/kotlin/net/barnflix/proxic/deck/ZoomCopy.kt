package net.barnflix.proxic.deck

import org.slf4j.Logger
import java.awt.Color
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.File
import java.lang.management.ManagementFactory
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import kotlin.concurrent.thread

// The close-up copy of a card picture — spec 0015 (owner 2026-10-26) —
// and, scaled, its table copy (spec 0051).
//
// The zoom views showed the original scan, a ~1.5 MB PNG that arrives in
// pieces, so the browser painted it top to bottom. This is the same picture
// at the same size as a JPEG, about seven times lighter. A JPEG has no
// see-through corners, so they are filled with the card's own border
// colour; both zoom views round the corners anyway. Made at import, and once
// in the background for pictures imported before this existed.
//
// Spec 0121 (owner 2026-11-27): both copies are WebP at quality 80 now, made
// from the same scaled, corner-filled pixels ([writeWebp]); the JPEG writer
// stays for when the WebP encoder fails or is missing.

object ZoomCopy {
    private const val QUALITY = 0.88f

    /** How far in from the left edge, as a share of the width, the border colour is read. */
    private const val BORDER_AT = 0.02

    /**
     * [image] as a JPEG at [target], [width] pixels wide (its own width by
     * default; spec 0051's table copy asks for 384), corners filled.
     */
    fun write(
        image: BufferedImage,
        target: File,
        width: Int = image.width,
    ) {
        val opaque = opaque(image, width)
        target.parentFile.mkdirs()
        val writer = ImageIO.getImageWritersByFormatName("jpeg").next()
        try {
            val partial = File(target.parentFile, "${target.name}.part")
            ImageIO.createImageOutputStream(partial).use { out ->
                writer.output = out
                val params =
                    writer.defaultWriteParam.apply {
                        compressionMode = ImageWriteParam.MODE_EXPLICIT
                        compressionQuality = QUALITY
                        progressiveMode = ImageWriteParam.MODE_DEFAULT
                    }
                writer.write(null, IIOImage(opaque, null, null), params)
            }
            // Whole or not at all: a half-written copy must never be served.
            partial.renameTo(target)
        } finally {
            writer.dispose()
        }
    }

    /**
     * Spec 0121 -- [image] as a WebP at quality 80 at [target], [width]
     * pixels wide, corners filled, by [encoder]: the same pixels the JPEG
     * copy is made from.
     */
    fun writeWebp(
        image: BufferedImage,
        target: File,
        encoder: WebpEncoder,
        width: Int = image.width,
    ) = encoder.encode(opaque(image, width), target)

    /**
     * [image] scaled to [width] (bilinear), on an opaque canvas filled with
     * the card's border colour, so see-through corners take that colour.
     */
    internal fun opaque(
        image: BufferedImage,
        width: Int,
    ): BufferedImage {
        val height = (image.height.toDouble() * width / image.width).toInt().coerceAtLeast(1)
        val border = Color(image.getRGB((image.width * BORDER_AT).toInt(), image.height / 2), true)
        val opaque = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        val graphics = opaque.createGraphics()
        try {
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
            graphics.color = Color(border.red, border.green, border.blue)
            graphics.fillRect(0, 0, width, height)
            graphics.drawImage(image, 0, 0, width, height, null)
        } finally {
            graphics.dispose()
        }
        return opaque
    }

    /**
     * Makes the missing copies, once, in the background; returns at once.
     * Since spec 0121 these are the WebP copies (table and close-up) for the
     * pictures stored before them, each made FROM THE ORIGINAL -- never from
     * an older JPEG copy, which would squeeze it a third time -- one picture
     * at a time, on a low-priority thread with the encoder below the games
     * (`nice`). The older copy of the same kind goes only once the WebP one
     * exists ([ArtStore.makeCopies]). Logs how many it made, and the time per
     * picture (P11-R5). A second start finds nothing to do. With no encoder
     * on the machine it does nothing and says so: every picture then keeps
     * the copies it has.
     */
    fun fillInBackground(
        store: ArtStore,
        log: Logger,
    ) {
        thread(name = "picture-copy-fill", isDaemon = true, priority = Thread.MIN_PRIORITY) {
            fill(store, log)
        }
    }

    /** What one pass did (spec 0121, P11-R5). */
    data class FillReport(
        val looked: Int,
        val made: Int,
        val failed: Int,
        val oldCopiesRemoved: Int,
        val millis: Long,
    )

    /** The pass itself, on the caller's thread (the background thread, or a test). */
    fun fill(
        store: ArtStore,
        log: Logger,
    ): FillReport {
        val waiting = store.originalFiles.filter { store.needsCopies(it) }.toList()
        if (waiting.isEmpty()) return FillReport(0, 0, 0, 0, 0)
        if (!store.copies.encoderReady) {
            log.warn("picture copies: {} pictures wait for WebP copies, but the encoder is missing", waiting.size)
            return FillReport(waiting.size, 0, 0, 0, 0)
        }
        var made = 0
        var failed = 0
        val oldBefore = waiting.sumOf { store.copies.oldCopiesOf(it.nameWithoutExtension) }
        val started = System.nanoTime()
        val threadCpu = ManagementFactory.getThreadMXBean()
        val ownBefore = threadCpu.currentThreadCpuTime
        val childBefore = childCpuMillis()
        waiting.forEach { original ->
            val sha = original.nameWithoutExtension
            runCatching { ImageIO.read(original)?.let { store.makeCopies(sha, it, original) } }
                .onFailure { log.warn("picture copies for {} not made: {}", sha, it.javaClass.simpleName) }
            if (store.needsCopies(original)) failed++ else made++
        }
        val millis = (System.nanoTime() - started) / NANOS_PER_MILLI
        // P11-R5: CPU, not only time. This thread's (decoding, scaling) and
        // the encoder processes' (children reaped meanwhile; Linux only).
        val ownMillis = (threadCpu.currentThreadCpuTime - ownBefore) / NANOS_PER_MILLI
        val childMillis = childBefore?.let { before -> childCpuMillis()?.minus(before) }
        val removed = oldBefore - waiting.sumOf { store.copies.oldCopiesOf(it.nameWithoutExtension) }
        log.info(
            "picture copies: WebP copies made for {} of {} pictures stored earlier ({} failed), " +
                "{} older copies removed, in {} ms: {} ms a picture; CPU {} ms here + {} ms encoding: {} ms a picture",
            made,
            waiting.size,
            failed,
            removed,
            millis,
            millis / waiting.size,
            ownMillis,
            childMillis ?: "?",
            (ownMillis + (childMillis ?: 0)) / waiting.size,
        )
        return FillReport(waiting.size, made, failed, removed, millis)
    }

    /**
     * CPU used by this process's finished children (the encoder runs), in ms:
     * fields 16 and 17 of /proc/self/stat (cutime, cstime) in clock ticks,
     * 100 a second on Linux. Null where there is no /proc (a Windows test run).
     */
    private fun childCpuMillis(): Long? =
        runCatching {
            val fields = File("/proc/self/stat").readText().substringAfterLast(')').trim().split(' ')
            // After the name: field 3 is fields[0], so cutime (16) and cstime (17) are 13 and 14.
            (fields[CUTIME].toLong() + fields[CSTIME].toLong()) * MILLIS_PER_TICK
        }.getOrNull()

    private const val NANOS_PER_MILLI = 1_000_000L
    private const val CUTIME = 13
    private const val CSTIME = 14
    private const val MILLIS_PER_TICK = 10L
}
