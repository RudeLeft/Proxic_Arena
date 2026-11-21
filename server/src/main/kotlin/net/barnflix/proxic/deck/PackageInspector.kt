package net.barnflix.proxic.deck

import net.barnflix.proxic.PlayerWords
import java.io.File
import java.util.Locale
import java.util.zip.ZipFile

// Deck package safety — PHASE_02 §2.26–§2.38.
//
// This class ONLY INSPECTS. It opens the archive, reads the central
// directory, and decides whether the package is acceptable; it
// writes nothing to disk. Extraction is a separate step that runs
// only after this says yes, so a hostile archive is refused before
// any of it lands anywhere.
//
// Everything here is checked against the archive's own metadata
// first, because a check performed during extraction has already
// let the bytes through.

/** What the package contains, once it has been accepted. */
data class InspectedPackage(
    val deckTextEntry: String,
    val imageEntries: List<String>,
    /** Spec 0022 -- `pictures.json`, the pictures sent before, or null. */
    val picturesEntry: String? = null,
    val compressedBytes: Long,
    val uncompressedBytes: Long,
    /** Spec 0051 -- `art_crops/<Name> [SET].jpg`: Scryfall's crop of a card's art, for the table. */
    val cropEntries: List<String> = emptyList(),
)

sealed interface PackageResult {
    data class Ok(val inspected: InspectedPackage) : PackageResult

    data class Rejected(val code: String, val detail: String) : PackageResult
}

object PackageInspector {
    /** Where the exporter files artwork. */
    private const val ART_DIRECTORY = "real_cards/"

    /** Spec 0051 -- where it files each picture's art crop. */
    const val CROP_DIRECTORY = "art_crops/"

    /** Spec 0022 -- names the pictures a package leaves out because Arena holds them. */
    const val PICTURES_ENTRY = "pictures.json"

    /**
     * Inspect an uploaded archive.
     *
     * Never throws: a malformed upload is a [PackageResult.Rejected],
     * because a stack trace escaping into the import endpoint would
     * be both a 500 and an information leak (§2.76).
     */
    fun inspect(archive: File): PackageResult {
        if (!archive.isFile) {
            return PackageResult.Rejected("NOT_A_FILE", NO_DECK_FILE)
        }
        if (archive.length() > PackageLimits.MAX_ARCHIVE_BYTES) {
            return PackageResult.Rejected(
                "ARCHIVE_TOO_LARGE",
                "This deck file is too big (${PlayerWords.megabytes(archive.length())}). " +
                    "The most Arena takes is ${PlayerWords.megabytes(PackageLimits.MAX_ARCHIVE_BYTES)}.",
            )
        }

        // §2.27 — a .zip extension is not evidence. ZipFile fails on
        // anything that is not actually a ZIP, which is the check.
        return runCatching { ZipFile(archive).use(::examine) }
            .getOrElse {
                PackageResult.Rejected(
                    "NOT_A_ZIP",
                    "That file isn't a deck file Arena can open. Export the deck again from the Deck Builder.",
                )
            }
    }

    private fun examine(zip: ZipFile): PackageResult {
        val entries = zip.entries().toList()

        if (entries.size > PackageLimits.MAX_ENTRIES) {
            return PackageResult.Rejected(
                "TOO_MANY_ENTRIES",
                "This deck file has too many files inside it (${PlayerWords.number(entries.size)}; " +
                    "the most is ${PlayerWords.number(PackageLimits.MAX_ENTRIES)}).",
            )
        }
        if (entries.isEmpty()) {
            return PackageResult.Rejected("EMPTY_ARCHIVE", "This deck file is empty. Export the deck again.")
        }

        var compressed = 0L
        var uncompressed = 0L
        val deckTexts = mutableListOf<String>()
        val images = mutableListOf<String>()
        var pictures: String? = null
        val normalised = mutableMapOf<String, String>()

        for (entry in entries) {
            val name = entry.name

            // Per-entry safety lives in its own function: this loop
            // had grown past what detekt would accept, and the
            // entry rules are a separate concern from the
            // whole-archive totals below.
            entryRejection(entry)?.let { return it }

            if (entry.isDirectory) continue

            if (entry.size > PackageLimits.MAX_ENTRY_BYTES) {
                return PackageResult.Rejected(
                    "ENTRY_TOO_LARGE",
                    entryTooLarge(entry.size),
                )
            }

            compressed += entry.compressedSize.coerceAtLeast(0)
            uncompressed += entry.size.coerceAtLeast(0)

            if (uncompressed > PackageLimits.MAX_UNCOMPRESSED_BYTES) {
                return PackageResult.Rejected(
                    "UNCOMPRESSED_TOO_LARGE",
                    "This deck file is too big once unpacked " +
                        "(more than ${PlayerWords.megabytes(PackageLimits.MAX_UNCOMPRESSED_BYTES)}).",
                )
            }

            // §2.34, §2.35 — two entries that normalise to the same
            // effective path are ambiguous. Case-insensitively,
            // because the exporter runs on Windows and the server on
            // Linux: an archive that is fine on one is ambiguous on
            // the other, and the importer must not behave
            // differently by platform.
            val key = name.lowercase(Locale.ROOT)
            val previous = normalised.put(key, name)
            if (previous != null) {
                return PackageResult.Rejected(
                    "DUPLICATE_PATH",
                    "This deck file has two files with the same name (\"$previous\" and \"$name\"). " +
                        "Export the deck again.",
                )
            }

            when (memberKind(name)) {
                MemberKind.PICTURES -> pictures = name
                MemberKind.DECK_TEXT -> deckTexts += name
                MemberKind.IMAGE -> images += name
                // §2.32 — nested archives are not extracted, and are
                // not silently ignored either: an unexpected member
                // means this is not the package we think it is.
                null -> return PackageResult.Rejected(
                    "UNEXPECTED_ENTRY",
                    "This deck file has a file Arena doesn't expect: \"$name\". Export the deck again.",
                )
            }
        }

        ratioRejection(compressed, uncompressed)?.let { return it }

        if (images.size > PackageLimits.MAX_IMAGE_COUNT) {
            return PackageResult.Rejected(
                "TOO_MANY_IMAGES",
                "This deck file has ${PlayerWords.number(images.size)} pictures; the most a deck can have is " +
                    "${PlayerWords.number(PackageLimits.MAX_IMAGE_COUNT)}.",
            )
        }

        // Exactly one decklist. Finding it by EXTENSION rather than
        // by name: the exporter names it from the deck, and the
        // archive from wherever it was saved, so the two match only
        // by coincidence (inspection finding 4).
        return when (deckTexts.size) {
            1 ->
                PackageResult.Ok(
                    InspectedPackage(
                        deckTextEntry = deckTexts.single(),
                        imageEntries = images.filterNot { it.startsWith(CROP_DIRECTORY) },
                        cropEntries = images.filter { it.startsWith(CROP_DIRECTORY) },
                        picturesEntry = pictures,
                        compressedBytes = compressed,
                        uncompressedBytes = uncompressed,
                    ),
                )

            0 ->
                PackageResult.Rejected(
                    "NO_DECK_LIST",
                    "This deck file has no deck list in it.",
                )

            else ->
                PackageResult.Rejected(
                    "MULTIPLE_DECK_LISTS",
                    "This deck file has ${PlayerWords.number(deckTexts.size)} deck lists in it. It should have one.",
                )
        }
    }

    /**
     * The checks that depend on ONE entry, in the order that refuses
     * the cheapest-to-detect problems first.
     *
     * Returns null when the entry is acceptable.
     */
    private fun entryRejection(entry: java.util.zip.ZipEntry): PackageResult.Rejected? {
        // §2.28 — no entry may escape the staging directory. Checked
        // on the RAW name before any normalisation, so a clever
        // encoding cannot slip past a tidied version.
        if (isUnsafePath(entry.name)) {
            return PackageResult.Rejected(
                "UNSAFE_PATH",
                CANNOT_OPEN_SAFELY,
            )
        }
        // §2.33 — anything other than stored or deflated, which
        // includes encrypted entries. The exporter uses deflate.
        if (entry.method != java.util.zip.ZipEntry.STORED &&
            entry.method != java.util.zip.ZipEntry.DEFLATED
        ) {
            return PackageResult.Rejected(
                "UNSUPPORTED_COMPRESSION",
                CANNOT_OPEN_SAFELY,
            )
        }
        if (!entry.isDirectory && entry.size > PackageLimits.MAX_ENTRY_BYTES) {
            return PackageResult.Rejected(
                "ENTRY_TOO_LARGE",
                entryTooLarge(entry.size),
            )
        }
        return null
    }

    /**
     * §2.28, §2.29 — reject anything that could write outside the
     * staging directory, or that is filesystem indirection.
     *
     * Java's ZipFile does not expose symlink entries as links, but a
     * ZIP can carry a Unix mode saying so. Rather than trust mode
     * bits, the importer only ever accepts the member shapes it
     * expects ([memberKind]) — a root `.txt`, a root `pictures.json`
     * (spec 0022), a `.png`, `.jpg` or `.jpeg` directly inside
     * `real_cards`, and a `.jpg` or `.jpeg` directly inside
     * `art_crops` (spec 0051) — so a symlink entry is refused by
     * [examine] as an unexpected file regardless of what its
     * attributes claim.
     */
    private fun isUnsafePath(name: String): Boolean {
        if (name.isEmpty()) return true
        if (name.startsWith("/") || name.startsWith("\\")) return true
        // Windows drive letter or UNC.
        if (name.length > 1 && name[1] == ':') return true
        val parts = name.split('/', '\\')
        if (parts.any { it == ".." }) return true
        // A NUL is never legitimate and truncates paths in C layers.
        if (name.contains('\u0000')) return true
        return false
    }

    /**
     * §2.31 — ratio, the signal absolute size misses. A 1 MB archive
     * expanding to 4 GB passes every size check in [examine].
     */
    private fun ratioRejection(
        compressed: Long,
        uncompressed: Long,
    ): PackageResult.Rejected? {
        if (compressed <= 0) return null
        val ratio = uncompressed.toDouble() / compressed.toDouble()
        if (ratio <= PackageLimits.MAX_COMPRESSION_RATIO) return null
        return PackageResult.Rejected(
            "COMPRESSION_RATIO",
            "This deck file unpacks to far more than its size, so Arena won't open it. Export the deck again.",
        )
    }

    /** Spec 0114 (W2-134): no file arrived, or it could not be read. */
    const val NO_DECK_FILE = "No deck file arrived. Try sending it again."

    /** Spec 0114 (W2-132): an unsafe path or an unknown compression, said without the security words. */
    private const val CANNOT_OPEN_SAFELY =
        "This deck file can't be opened safely. Export the deck again from the Deck Builder."

    /** Spec 0114 (W2-124). */
    private fun entryTooLarge(size: Long) =
        "One of the files inside this deck file is too big (${PlayerWords.megabytes(size)}; " +
            "the most is ${PlayerWords.megabytes(PackageLimits.MAX_ENTRY_BYTES)})."

    private enum class MemberKind { DECK_TEXT, IMAGE, PICTURES }

    /** What a member is, or null for anything a package never holds. */
    private fun memberKind(name: String): MemberKind? =
        when {
            name.equals(PICTURES_ENTRY, ignoreCase = true) -> MemberKind.PICTURES
            isDeckText(name) -> MemberKind.DECK_TEXT
            isImage(name) -> MemberKind.IMAGE
            else -> null
        }

    /** The decklist: a `.txt` at the archive ROOT, not nested. */
    private fun isDeckText(name: String): Boolean = !name.contains('/') && name.lowercase(Locale.ROOT).endsWith(".txt")

    /**
     * Artwork: `real_cards/<something>.png`, one level deep -- or `.jpg`, or
     * an art crop, `art_crops/<something>.jpg` (spec 0051).
     */
    private fun isImage(name: String): Boolean =
        isPictureIn(ART_DIRECTORY, name, IMAGE_EXTENSIONS) || isPictureIn(CROP_DIRECTORY, name, CROP_EXTENSIONS)

    /** A file directly inside [directory] ending in one of [extensions]. */
    internal fun isPictureIn(
        directory: String,
        name: String,
        extensions: List<String>,
    ): Boolean {
        if (!name.startsWith(directory)) return false
        val remainder = name.removePrefix(directory)
        return remainder.isNotEmpty() &&
            !remainder.contains('/') &&
            extensions.any { remainder.lowercase(Locale.ROOT).endsWith(it) }
    }

    /** A card picture: a PNG, or (spec 0051) a JPEG. */
    internal val IMAGE_EXTENSIONS = listOf(".png", ".jpg", ".jpeg")

    /** An art crop: Scryfall serves them as JPEGs only. */
    internal val CROP_EXTENSIONS = listOf(".jpg", ".jpeg")
}
