package net.barnflix.proxic.deck

import org.slf4j.LoggerFactory
import java.awt.image.BufferedImage
import java.io.File

/**
 * A stored picture's copies -- the table's copy in [display] and the
 * close-up in [zoom] -- for [ArtStore]: which files they are, and making them.
 *
 * Spec 0121 (owner 2026-11-27): both are WebP at quality 80, made by
 * [encoder] from the decoded original. A copy no smaller than the original is
 * not kept: the original is served instead, and a `<sha>.nowebp` mark says it
 * was tried, so it is not tried again. Once a WebP copy exists, the older
 * copy of the same kind (spec 0051's JPEG, or a pre-0051 PNG table copy) is
 * deleted. If the encoder fails or is missing, the import still succeeds and
 * spec 0051's JPEG copies are made as before, and it is logged: a missing
 * copy is a performance problem, not a failed send.
 */
internal class PictureCopies(
    private val display: File,
    private val zoom: File,
    private val encoder: WebpEncoder,
    /** The table copy's width (ArtStore's 384); a narrower picture keeps its own. */
    private val tableWidth: Int,
) {
    private val log = LoggerFactory.getLogger(ArtStore::class.java)

    /** Each copy only when missing (or not yet tried, for a WebP one). */
    fun make(
        sha: String,
        image: BufferedImage,
        original: File,
    ) {
        if (!done(display, sha)) {
            val width = minOf(tableWidth, image.width)
            val made =
                webpCopy(sha, "table", webp(sha, closeUp = false), original) { target ->
                    ZoomCopy.writeWebp(image, target, encoder, width)
                }
            if (made) {
                jpegTable(sha).delete()
                pngTable(sha).delete()
            } else if (!done(display, sha)) {
                jpegTableCopy(sha, image, original)
            }
        }

        val closeUp = jpegCloseUp(sha)
        if (!done(zoom, sha)) {
            val made =
                webpCopy(sha, "close-up", webp(sha, closeUp = true), original) { target ->
                    ZoomCopy.writeWebp(image, target, encoder)
                }
            if (made) {
                closeUp.delete()
            } else if (!done(zoom, sha) && original.extension == "png" && !closeUp.isFile) {
                // Spec 0015's JPEG close-up, as before; a JPEG original is its own.
                runCatching { ZoomCopy.write(image, closeUp) }.onFailure { closeUp.delete() }
            }
        }
    }

    /**
     * Whether a stored original still lacks a copy: since spec 0121, until
     * both WebP copies exist (or were found no lighter than the original).
     * Also true for a missing original, which [ArtStore.store] then writes.
     */
    fun needed(original: File): Boolean {
        if (!original.isFile) return true
        val sha = original.nameWithoutExtension
        return !done(display, sha) || !done(zoom, sha)
    }

    /** Whether the WebP encoder is on this machine (the one-time pass asks before it starts). */
    val encoderReady: Boolean get() = (encoder as? CwebpEncoder)?.available ?: true

    /** How many older copies (JPEG, or a pre-0051 PNG table copy) a picture still has, for the pass's log. */
    fun oldCopiesOf(sha: String): Int = listOf(jpegTable(sha), pngTable(sha), jpegCloseUp(sha)).count { it.isFile }

    /** Spec 0121's WebP copy: the close-up's, or the table's. */
    fun webp(
        sha: String,
        closeUp: Boolean,
    ): File = file(if (closeUp) zoom else display, sha, WEBP)

    /** Spec 0051's JPEG table copy. */
    fun jpegTable(sha: String): File = file(display, sha, "jpg")

    /** The PNG table copy from before spec 0051. */
    fun pngTable(sha: String): File = file(display, sha, "png")

    /** Spec 0015's JPEG close-up (since spec 0121 made only when the WebP one cannot be). */
    fun jpegCloseUp(sha: String): File = file(zoom, sha, "jpg")

    /**
     * One WebP copy at [target], by [write]: true when it exists and is
     * lighter than the original. No lighter: deleted, and marked as tried.
     * Failed: false, logged, and nothing left behind.
     */
    private fun webpCopy(
        sha: String,
        kind: String,
        target: File,
        original: File,
        write: (File) -> Unit,
    ): Boolean {
        val failure = runCatching { write(target) }.exceptionOrNull()
        if (failure != null) {
            target.delete()
            // A missing encoder is said once, by the encoder; anything else each time.
            if (failure !is EncoderMissing) {
                log.warn(
                    "the WebP {} copy of picture {} was not made ({}); a JPEG copy is used",
                    kind,
                    sha,
                    failure.message,
                )
            }
            return false
        }
        if (target.isFile && target.length() >= original.length()) {
            target.delete()
            File(target.parentFile, "$sha.$NO_WEBP").createNewFile()
        }
        return target.isFile
    }

    /** Spec 0051's JPEG table copy, made since spec 0121 only when the WebP one could not be. */
    private fun jpegTableCopy(
        sha: String,
        image: BufferedImage,
        original: File,
    ) {
        val derivative = jpegTable(sha)
        if (derivative.isFile || image.width <= tableWidth) return
        runCatching { ZoomCopy.write(image, derivative, tableWidth) }.onFailure { derivative.delete() }
        // If the derivative is no smaller, it is pure cost on disk: the
        // original is served instead.
        if (derivative.isFile && derivative.length() >= original.length()) derivative.delete()
        // The PNG copy it replaces, from before spec 0051.
        if (derivative.isFile) pngTable(sha).delete()
    }

    /** A kind of copy is done: its WebP exists, or one was found no lighter than the original. */
    private fun done(
        root: File,
        sha: String,
    ): Boolean = file(root, sha, WEBP).isFile || file(root, sha, NO_WEBP).isFile

    companion object {
        /** Spec 0121 -- the mark that a WebP copy was made and was no lighter than the original. */
        const val NO_WEBP = "nowebp"

        private const val WEBP = "webp"

        /** A hash's file in [root], fanned out by its first two characters. */
        private fun file(
            root: File,
            sha: String,
            extension: String,
        ): File = File(File(root, sha.substring(0, 2)), "$sha.$extension")
    }
}
