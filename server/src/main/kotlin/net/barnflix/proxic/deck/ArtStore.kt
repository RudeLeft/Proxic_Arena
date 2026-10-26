package net.barnflix.proxic.deck

import java.awt.image.BufferedImage
import java.io.File
import java.security.MessageDigest
import javax.imageio.ImageIO

// Validated, de-duplicated card art — PHASE_02 §2.53, §2.57, §2.134,
// §2.135.
//
// Art is CONTENT-ADDRESSED: one file per distinct image, shared by
// every deck that uses it. §2.57 describes art living under each
// deck's directory; §2.135 (added 2026-10-15) supersedes that for
// storage, because every deck containing Lightning Bolt would
// otherwise carry its own copy and five players with several decks
// each is tens of gigabytes of identical files.
//
// De-duplication is STORAGE ONLY. Access stays per match and per
// viewer (Phase 6 §6.122); nothing here grants a player the ability
// to enumerate art they have no right to see.

data class StoredArt(
    val sha256: String,
    val byteSize: Long,
    val width: Int,
    val height: Int,
)

sealed interface ArtResult {
    data class Ok(val art: StoredArt) : ArtResult

    data class Rejected(val code: String, val detail: String) : ArtResult
}

class ArtStore(dataRoot: File) {
    private val originals = File(dataRoot, "art/original")
    private val display = File(dataRoot, "art/display")

    /** Spec 0015 — the close-up copies (JPEG), for the zoom views. */
    private val zoom = File(dataRoot, "art/zoom")

    /**
     * Display derivative width.
     *
     * §2.134 measured the problem: sources are 745x1040 and a card
     * draws at 97.5x136.5 on a 1920x1080 battlefield. The cost being
     * avoided is DECODE, not disk — the old project spent 82 ms a
     * frame rebuilding card faces and capped the client at 12 fps.
     *
     * The sizes that matter:
     *
     * ```text
     *   1920x1080 card   97.5 x 136.5      2x = 195 x 273
     *   2560x1440 card  130.0 x 182.0      2x = 260 x 364
     *   source                             745 x 1040  (0.77 MP)
     * ```
     *
     * 384 covers 2x on a 1440p board with headroom, and is 0.21 MP —
     * **3.7x fewer pixels** than the source.
     *
     * A first attempt used 512, which was only 2x fewer pixels and,
     * measured, produced 585-974 KB files: BIGGER than the four
     * sources that were already small. Java's PNG writer is not
     * clever, so a generous width buys nothing and costs disk.
     *
     * The ORIGINAL is kept for the zoom view, which is the one place
     * the extra pixels are actually seen.
     */
    private val displayWidth = 384

    /**
     * Validate a PNG and store it, returning its content hash.
     *
     * §2.53: the extension is not trusted. The bytes are decoded,
     * and a file that does not decode is rejected — which also means
     * a "PNG" that is really a script or a payload never reaches
     * disk under a name the browser might serve.
     */
    fun store(
        source: File,
        member: String,
    ): ArtResult {
        if (source.length() > PackageLimits.MAX_ENTRY_BYTES) {
            return ArtResult.Rejected(
                "IMAGE_TOO_LARGE",
                "\"$member\" is ${source.length()} bytes.",
            )
        }

        // Magic bytes first: cheap, and refuses the obvious case
        // before handing anything to an image decoder.
        val header = ByteArray(PNG_HEADER_BYTES)
        val headerRead = source.inputStream().use { it.readNBytes(header, 0, header.size) }
        if (headerRead < PNG_MAGIC.size || !header.copyOf(PNG_MAGIC.size).contentEquals(PNG_MAGIC)) {
            return ArtResult.Rejected("NOT_A_PNG", "\"$member\" is not a PNG.")
        }

        // The size, from the header, BEFORE decoding (2026-10-22 review).
        // A PNG of one colour compresses about a thousand to one, so a
        // file well under the byte limit can claim 40,000 x 40,000 and
        // decode to gigabytes -- the server's memory, for everyone.
        val claimed = dimensionsOf(header, headerRead)
        if (claimed == null || !reasonable(claimed.first, claimed.second)) {
            val size = claimed?.let { "${it.first}x${it.second}" } ?: "of no readable size"
            return ArtResult.Rejected("UNREASONABLE_DIMENSIONS", "\"$member\" is $size.")
        }

        val image: BufferedImage =
            runCatching { ImageIO.read(source) }.getOrNull()
                ?: return ArtResult.Rejected("UNDECODABLE_IMAGE", "\"$member\" could not be decoded.")

        if (!reasonable(image.width, image.height)) {
            return ArtResult.Rejected(
                "UNREASONABLE_DIMENSIONS",
                "\"$member\" is ${image.width}x${image.height}.",
            )
        }

        val sha = sha256(source)
        val target = pathFor(originals, sha)

        // Already stored by another deck, or by this one: content
        // addressing makes the write idempotent, which is what lets
        // a failed import leave art behind harmlessly.
        if (!target.isFile) {
            target.parentFile.mkdirs()
            source.copyTo(target, overwrite = true)
        }

        val derivative = pathFor(display, sha)
        if (!derivative.isFile) {
            runCatching { writeDisplayDerivative(image, derivative) }
                .onFailure {
                    // A missing derivative is a performance problem,
                    // not a failed import: the original can still be
                    // served while this is investigated.
                    derivative.delete()
                }
            // If the derivative is no smaller, it is pure cost on
            // disk — the decode saving still applies, but there is
            // no reason to keep a file BIGGER than the thing it
            // replaces. Measured: this happens for sources that are
            // already small.
            if (derivative.isFile && derivative.length() >= target.length()) {
                derivative.delete()
            }
        }

        // Spec 0015 — the close-up copy, so a zoom does not wait on the scan.
        val closeUp = zoomPath(sha)
        if (!closeUp.isFile) runCatching { ZoomCopy.write(image, closeUp) }.onFailure { closeUp.delete() }

        return ArtResult.Ok(StoredArt(sha, target.length(), image.width, image.height))
    }

    /** Where a hash lives, fanned out so no directory holds 100,000 files. */
    fun pathFor(
        root: File,
        sha256: String,
    ): File = File(File(root, sha256.substring(0, 2)), "$sha256.png")

    fun originalPath(sha256: String): File = pathFor(originals, sha256)

    fun displayPath(sha256: String): File = pathFor(display, sha256)

    fun zoomPath(sha256: String): File = File(File(zoom, sha256.substring(0, 2)), "$sha256.jpg")

    /**
     * The file to serve: for the table, the display copy; for a close-up
     * (spec 0015), the light JPEG copy. Either falls back to the original
     * scan, which is what exists when a copy was not made.
     */
    fun fileFor(
        sha256: String,
        closeUp: Boolean,
    ): File? {
        val copy = if (closeUp) zoomPath(sha256) else displayPath(sha256)
        return copy.takeIf { it.isFile } ?: originalPath(sha256).takeIf { it.isFile }
    }

    /** Every original scan, for filling in close-up copies made after it. */
    val originalFiles: Sequence<File>
        get() = originals.walkTopDown().filter { it.isFile && it.extension == "png" }

    private fun writeDisplayDerivative(
        image: BufferedImage,
        target: File,
    ) {
        if (image.width <= displayWidth) {
            // Already small enough; a derivative would be larger than
            // the original for no gain.
            return
        }
        val height = (image.height.toDouble() * displayWidth / image.width).toInt().coerceAtLeast(1)
        val scaled = BufferedImage(displayWidth, height, BufferedImage.TYPE_INT_ARGB)
        val graphics = scaled.createGraphics()
        try {
            graphics.setRenderingHint(
                java.awt.RenderingHints.KEY_INTERPOLATION,
                java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR,
            )
            graphics.drawImage(image, 0, 0, displayWidth, height, null)
        } finally {
            graphics.dispose()
        }
        target.parentFile.mkdirs()
        ImageIO.write(scaled, "png", target)
    }

    private fun reasonable(
        width: Int,
        height: Int,
    ) = width in MIN_DIMENSION..MAX_DIMENSION && height in MIN_DIMENSION..MAX_DIMENSION

    /** Width and height from the IHDR chunk, which a PNG must begin with; null if it does not. */
    private fun dimensionsOf(
        header: ByteArray,
        length: Int,
    ): Pair<Int, Int>? {
        if (length < PNG_HEADER_BYTES) return null
        val chunk = String(header, IHDR_TYPE_AT, IHDR.length, Charsets.US_ASCII)
        if (chunk != IHDR) return null
        val buffer = java.nio.ByteBuffer.wrap(header)
        return buffer.getInt(IHDR_WIDTH_AT) to buffer.getInt(IHDR_WIDTH_AT + Int.SIZE_BYTES)
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { stream ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = stream.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    companion object {
        private val PNG_MAGIC =
            byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10)

        /** Signature, IHDR length and type, width, height. */
        private const val PNG_HEADER_BYTES = 24
        private const val IHDR = "IHDR"
        private const val IHDR_TYPE_AT = 12
        private const val IHDR_WIDTH_AT = 16

        /** A card image smaller than this is not a card image. */
        private const val MIN_DIMENSION = 50

        /** 745x1040 is the observed source; this leaves generous room. */
        private const val MAX_DIMENSION = 4000

        /** SHA-256 of a byte stream, for the package checksum (§2.72). */
        fun sha256Of(file: File): String = ArtStore(File(".")).sha256(file)
    }
}
