package net.barnflix.proxic.deck

import org.slf4j.Logger
import java.awt.Color
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.File
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
     * Makes the missing copies, once, in the background; returns at once:
     * the close-up copies (spec 0015) and the JPEG table copies (spec
     * 0051, replacing the PNG ones) for pictures imported before them.
     * Each picture is decoded once, and only when it lacks one.
     */
    fun fillInBackground(
        store: ArtStore,
        log: Logger,
    ) {
        thread(name = "picture-copy-fill", isDaemon = true) {
            var made = 0
            store.originalFiles.forEach { original ->
                if (!store.needsCopies(original)) return@forEach
                val sha = original.nameWithoutExtension
                runCatching { ImageIO.read(original)?.let { store.makeCopies(sha, it, original) } }
                    .onSuccess { if (!store.needsCopies(original)) made++ }
                    .onFailure { log.warn("picture copies for {} not made: {}", sha, it.javaClass.simpleName) }
            }
            if (made > 0) log.info("picture copies: made for {} pictures imported earlier", made)
        }
    }
}
