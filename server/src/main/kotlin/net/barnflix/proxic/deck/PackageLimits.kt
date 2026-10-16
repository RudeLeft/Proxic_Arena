package net.barnflix.proxic.deck

/**
 * Deck package resource limits — PHASE_02 §2.30, §2.31.
 *
 * §2.30 says to measure real exports and leave a safety margin, and
 * explicitly not to pick arbitrary tiny values. These come from the
 * real export inspected on 2026-10-15
 * (`docs/research/phase-02/DECK_BUILDER_EXPORT_INSPECTION.md`):
 *
 * ```text
 * 12,404,818 bytes uncompressed, 12 entries, 11 PNGs
 * largest PNG 1.77 MB, median 1.5 MB
 * compression ratio 1.0001
 * ```
 *
 * These limits matter more than they otherwise would: PHASE 2
 * AMENDMENT 1 enables import on a public endpoint with no
 * authentication, so they are the only thing bounding a hostile
 * upload. They are not a formality.
 */
object PackageLimits {
    /**
     * Largest accepted upload.
     *
     * A 65-card deck of entirely distinct cards is ~65 images at
     * ~1.1 MB, so ~70 MB is a plausible honest maximum. 150 MB is
     * roughly double that: generous enough that a legitimate deck is
     * never refused, small enough that filling a disk takes
     * deliberate effort rather than one request.
     */
    const val MAX_ARCHIVE_BYTES: Long = 150L * 1024 * 1024

    /** Uncompressed total. PNGs do not compress, so this is close to the above. */
    const val MAX_UNCOMPRESSED_BYTES: Long = 200L * 1024 * 1024

    /**
     * Compression ratio ceiling.
     *
     * The real export measured **1.0001** — PNG data is already
     * compressed, so an honest package is barely smaller than its
     * contents. A ratio above 10 is therefore not a well-packed
     * deck; it is compressed nothing, which is what a zip bomb is.
     *
     * This is a far better signal than absolute size alone: a 1 MB
     * archive expanding to 4 GB passes every size check and fails
     * this one.
     */
    const val MAX_COMPRESSION_RATIO: Double = 10.0

    /** One deck list, up to ~65 distinct images, plus margin. */
    const val MAX_ENTRIES: Int = 300

    /** Largest single member. The biggest PNG observed was 1.77 MB. */
    const val MAX_ENTRY_BYTES: Long = 16L * 1024 * 1024

    /**
     * The decklist is text: 365 bytes for 65 cards.
     *
     * 1 MB is three orders of magnitude of headroom and still
     * refuses a "deck list" that is actually a payload.
     */
    const val MAX_DECK_TEXT_BYTES: Long = 1L * 1024 * 1024

    /** 65 distinct cards is the format maximum; margin for art variants. */
    const val MAX_IMAGE_COUNT: Int = 200
}
