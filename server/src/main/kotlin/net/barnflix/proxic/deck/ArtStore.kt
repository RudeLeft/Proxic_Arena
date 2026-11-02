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
     *
     * Spec 0051: the copy is a JPEG now (ZoomCopy's writer, scaled), not
     * a PNG: 384 wide either way, a fraction of the bytes.
     */
    private val displayWidth = 384

    /**
     * Validate a PNG or a JPEG and store it, returning its content hash.
     *
     * §2.53: the extension is not trusted. The bytes are decoded,
     * and a file that does not decode is rejected — which also means
     * a "PNG" that is really a script or a payload never reaches
     * disk under a name the browser might serve.
     *
     * Spec 0051: a JPEG is accepted as well (the Deck Builder's light
     * card pictures and Scryfall's art crops). A JPEG original IS its own
     * close-up: it is served as it came, with no second encode. And a
     * picture already stored with its copies is recognised by its hash
     * before anything is decoded: identical bytes were decoded and
     * checked when they first came.
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
        val kind =
            when {
                headerRead >= PNG_MAGIC.size && header.copyOf(PNG_MAGIC.size).contentEquals(PNG_MAGIC) -> PNG
                headerRead >= JPEG_MAGIC.size && header.copyOf(JPEG_MAGIC.size).contentEquals(JPEG_MAGIC) -> JPEG
                else -> return ArtResult.Rejected("NOT_A_PICTURE", "\"$member\" is not a PNG or a JPEG.")
            }

        // The size, from the header, BEFORE decoding (2026-10-22 review).
        // A picture of one colour compresses about a thousand to one, so a
        // file well under the byte limit can claim 40,000 x 40,000 and
        // decode to gigabytes -- the server's memory, for everyone. A
        // JPEG's size is read by the decoder's reader without decoding.
        val claimed = if (kind == PNG) dimensionsOf(header, headerRead) else jpegDimensionsOf(source)
        if (claimed == null || !reasonable(claimed.first, claimed.second)) {
            val size = claimed?.let { "${it.first}x${it.second}" } ?: "of no readable size"
            return ArtResult.Rejected("UNREASONABLE_DIMENSIONS", "\"$member\" is $size.")
        }

        val sha = sha256(source)
        val target = File(File(originals, sha.substring(0, 2)), "$sha.$kind")
        if (target.isFile && !needsCopies(target)) {
            return ArtResult.Ok(StoredArt(sha, target.length(), claimed.first, claimed.second))
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

        // Already stored by another deck, or by this one: content
        // addressing makes the write idempotent, which is what lets
        // a failed import leave art behind harmlessly. Through a
        // partial file, so a half-written original is never served.
        if (!target.isFile) {
            target.parentFile.mkdirs()
            val partial = File(target.parentFile, "${target.name}.part")
            source.copyTo(partial, overwrite = true)
            partial.renameTo(target)
        }

        makeCopies(sha, image, target)

        return ArtResult.Ok(StoredArt(sha, target.length(), image.width, image.height))
    }

    /**
     * The table's copy and, for a PNG, the close-up copy, each only when
     * missing. Shared with the background fill for pictures stored before
     * a copy existed.
     */
    internal fun makeCopies(
        sha: String,
        image: BufferedImage,
        original: File,
    ) {
        // Spec 0051: the table's copy is a JPEG, 384 wide. It was a PNG
        // of 340-555 KB -- heavier than the full-size close-up -- whose
        // see-through corners the table never shows.
        val derivative = jpegDisplayPath(sha)
        if (!derivative.isFile && image.width > displayWidth) {
            runCatching { ZoomCopy.write(image, derivative, displayWidth) }
                .onFailure {
                    // A missing derivative is a performance problem,
                    // not a failed import: the original can still be
                    // served while this is investigated.
                    derivative.delete()
                }
            // If the derivative is no smaller, it is pure cost on
            // disk: the original is served instead.
            if (derivative.isFile && derivative.length() >= original.length()) {
                derivative.delete()
            }
            // The PNG copy it replaces, from before spec 0051.
            if (derivative.isFile) pathFor(display, sha).delete()
        }

        // Spec 0015 — the close-up copy, so a zoom does not wait on the
        // scan. A JPEG original is already that copy.
        val closeUp = zoomPath(sha)
        if (original.extension == PNG && !closeUp.isFile) {
            runCatching { ZoomCopy.write(image, closeUp) }.onFailure { closeUp.delete() }
        }
    }

    /**
     * Whether a stored original still lacks a copy it should have: a PNG
     * without its JPEG table copy (spec 0051) or its close-up (spec 0015).
     * A JPEG original gets its copy when it is stored, and one that came
     * out no smaller than the original is not made again.
     */
    internal fun needsCopies(original: File): Boolean {
        if (original.extension != PNG) return !original.isFile
        val sha = original.nameWithoutExtension
        return !jpegDisplayPath(sha).isFile && pathFor(display, sha).isFile || !zoomPath(sha).isFile
    }

    /** Where a hash's PNG lives, fanned out so no directory holds 100,000 files. */
    fun pathFor(
        root: File,
        sha256: String,
    ): File = File(File(root, sha256.substring(0, 2)), "$sha256.png")

    /** The stored original, a PNG or (spec 0051) a JPEG; the PNG's path when neither exists. */
    fun originalPath(sha256: String): File {
        val png = pathFor(originals, sha256)
        val jpeg = File(png.parentFile, "$sha256.$JPEG")
        return if (!png.isFile && jpeg.isFile) jpeg else png
    }

    /** The table's copy: a JPEG since spec 0051, a PNG before; the JPEG's path when neither exists. */
    fun displayPath(sha256: String): File {
        val jpeg = jpegDisplayPath(sha256)
        val png = pathFor(display, sha256)
        return if (!jpeg.isFile && png.isFile) png else jpeg
    }

    private fun jpegDisplayPath(sha256: String): File = File(File(display, sha256.substring(0, 2)), "$sha256.$JPEG")

    fun zoomPath(sha256: String): File = File(File(zoom, sha256.substring(0, 2)), "$sha256.jpg")

    /**
     * The file to serve: for the table, the display copy; for a close-up
     * (spec 0015), the light JPEG copy. Either falls back to the original,
     * which is what exists when a copy was not made -- and, for a JPEG
     * original (spec 0051), is the close-up itself.
     */
    fun fileFor(
        sha256: String,
        closeUp: Boolean,
    ): File? {
        val copy = if (closeUp) zoomPath(sha256).takeIf { it.isFile } else displayPath(sha256).takeIf { it.isFile }
        return copy ?: originalPath(sha256).takeIf { it.isFile }
    }

    /** Every original, PNG or JPEG, for filling in copies made after it. */
    val originalFiles: Sequence<File>
        get() = originals.walkTopDown().filter { it.isFile && (it.extension == PNG || it.extension == JPEG) }

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

        /** Spec 0051 -- a JPEG begins with its start-of-image marker and a segment marker. */
        private val JPEG_MAGIC = byteArrayOf(-1, -40, -1)

        private const val PNG = "png"
        private const val JPEG = "jpg"

        /** Signature, IHDR length and type, width, height. */
        private const val PNG_HEADER_BYTES = 24
        private const val IHDR = "IHDR"
        private const val IHDR_TYPE_AT = 12
        private const val IHDR_WIDTH_AT = 16

        /** A card image smaller than this is not a card image. */
        private const val MIN_DIMENSION = 50

        /** 745x1040 is the observed source; this leaves generous room. */
        private const val MAX_DIMENSION = 4000

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

        /** A JPEG's width and height as its header says, read without decoding the picture; null if unreadable. */
        private fun jpegDimensionsOf(source: File): Pair<Int, Int>? =
            runCatching {
                ImageIO.createImageInputStream(source).use { input ->
                    val reader = ImageIO.getImageReaders(input).asSequence().firstOrNull() ?: return null
                    try {
                        reader.input = input
                        reader.getWidth(0) to reader.getHeight(0)
                    } finally {
                        reader.dispose()
                    }
                }
            }.getOrNull()

        /** SHA-256 of a byte stream, for the package checksum (§2.72). */
        fun sha256Of(file: File): String = ArtStore(File(".")).sha256(file)
    }
}
