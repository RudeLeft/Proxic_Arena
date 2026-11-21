package net.barnflix.proxic.deck

import java.awt.image.BufferedImage
import java.io.File
import java.nio.ByteBuffer
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.imageio.ImageIO
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * Spec 0114, F-0114-A -- the exact words of the deck import's sentences a
 * player reads (the Deck Depot and the Deck Builder show the server's
 * `detail` and problems word for word), with their codes unchanged
 * (PROTO-006). The rows that need a database or the worker are in
 * [Words0114ImportTest]; these need neither.
 */
class Words0114DeckTest {
    private val root = File("build/test-words-0114").apply { mkdirs() }

    private fun tmp(name: String): File = File(root, name).apply { parentFile.mkdirs() }

    private fun zipOf(
        name: String,
        vararg members: Pair<String, ByteArray>,
    ): File {
        val file = tmp(name)
        ZipOutputStream(file.outputStream()).use { out ->
            for ((member, bytes) in members) {
                out.putNextEntry(ZipEntry(member))
                out.write(bytes)
                out.closeEntry()
            }
        }
        return file
    }

    private fun inspected(file: File): PackageResult.Rejected {
        val result = PackageInspector.inspect(file)
        return assertIs<PackageResult.Rejected>(result)
    }

    private fun invalid(text: String): DeckParseResult.Invalid {
        val result = DeckListParser.parse(text)
        return assertIs<DeckParseResult.Invalid>(result)
    }

    private val deckText = "Deck.txt" to "// Deck\n\n60 Mountain [FRA:287]\n".toByteArray()

    // --- the deck list (W2-092..W2-097) ------------------------------

    @Test
    fun `W2-092 a line that is not a count and a name`() {
        val bad = invalid("// Deck\n\nLightning Bolt\n")
        assertEquals(
            "This line should be a number of copies and then a card name, for example \"4 Lightning Bolt\".",
            bad.reason,
        )
        assertEquals(3, bad.line)
    }

    @Test
    fun `W2-093 a count too long to be a number`() {
        assertEquals("The number of copies is missing or is not a number.", invalid("99999999999 Mountain\n").reason)
    }

    @Test
    fun `W2-094 no copies`() {
        assertEquals("A card needs at least one copy.", invalid("0 Mountain\n").reason)
    }

    @Test
    fun `W2-095 too many copies on one line`() {
        assertEquals("5,000 copies is too many; a line can have at most 1,000.", invalid("5000 Mountain\n").reason)
    }

    @Test
    fun `W2-091 and W2-097 a list with no cards`() {
        val empty = invalid("// Nothing here\n")
        assertEquals("The deck list has no cards in it.", empty.reason)
        assertEquals(0, empty.line)
    }

    // --- Open Format (W2-103..W2-105) ---------------------------------

    private fun entry(
        quantity: Int,
        name: String,
        line: Int,
    ) = DeckEntry(quantity, name, null, null, "$quantity $name", line)

    @Test
    fun `W2-105 five copies of a card`() {
        val deck = ParsedDeck(null, listOf(entry(55, "Mountain", 1), entry(5, "Lightning Bolt", 2)))
        val violation = OpenFormat.validate(deck).single()
        assertEquals("TOO_MANY_COPIES", violation.code)
        assertEquals(
            "Open Format allows at most four copies of \"Lightning Bolt\". This deck has five.",
            violation.detail,
        )
    }

    @Test
    fun `too few cards, with a big count in digits`() {
        val violation = OpenFormat.validate(ParsedDeck(null, listOf(entry(52, "Mountain", 1)))).single()
        assertEquals("DECK_TOO_SMALL", violation.code)
        assertEquals("Open Format requires at least 60 cards. This deck has 52.", violation.detail)
    }

    @Test
    fun `W2-103 and W2-104 a Contraption deck`() {
        val deck =
            ParsedDeck(
                null,
                listOf(entry(60, "Mountain", 1), entry(2, "Auto-Key", 2), entry(1, "Boomflinger", 3)),
            )
        val sections = mapOf("Auto-Key" to "CONTRAPTIONS", "Boomflinger" to "CONTRAPTIONS")
        val words = OpenFormat.validate(deck, sections).associate { it.code to it.detail }
        assertEquals(
            "A Contraption deck needs at least 15 Contraptions, or none. This deck has three.",
            words["CONTRAPTIONS_DECK_TOO_SMALL"],
        )
        assertEquals(
            "A Contraption deck can have only one copy of each card. This deck has two copies of \"Auto-Key\".",
            words["TOO_MANY_COPIES"],
        )
    }

    @Test
    fun `an Attraction deck counts in words`() {
        val deck = ParsedDeck(null, listOf(entry(60, "Mountain", 1), entry(1, "Balloon Stand", 2)))
        val detail = OpenFormat.validate(deck, mapOf("Balloon Stand" to "ATTRACTIONS")).single().detail
        assertEquals("An Attraction deck needs at least ten Attractions, or none. This deck has one.", detail)
    }

    // --- the rules engine's answers (W2-001, W2-101) ------------------

    @Test
    fun `W2-001 and W2-101 fixed words for each status, never the engine's`() {
        assertEquals("Arena doesn't know this card yet.", CardResolution.wordsFor(CardResolution.Status.NOT_FOUND))
        assertEquals(
            "Arena doesn't have this printing of this card.",
            CardResolution.wordsFor(CardResolution.Status.PRINTING_MISMATCH),
        )
        assertEquals(
            "The cards could not be checked just now.",
            CardResolution.wordsFor(CardResolution.Status.UNAVAILABLE),
        )
        assertEquals(null, CardResolution.wordsFor(CardResolution.Status.RESOLVED))
    }

    // --- pictures (W2-086, W2-087) ------------------------------------

    private val store = ArtStore(File(root, "art"))

    private fun png(
        width: Int,
        height: Int,
    ): File {
        val file = tmp("pic-${width}x$height.png")
        ImageIO.write(BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", file)
        return file
    }

    /** A PNG signature and an IHDR claiming [width] x [height], and nothing after it. */
    private fun headerOnly(
        width: Int,
        height: Int,
    ): File {
        val bytes =
            ByteBuffer.allocate(24)
                .put(byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10))
                .putInt(13)
                .put("IHDR".toByteArray(Charsets.US_ASCII))
                .putInt(width)
                .putInt(height)
                .array()
        return tmp("claims-${width}x$height.png").apply { writeBytes(bytes) }
    }

    private fun refused(
        file: File,
        member: String,
    ) = assertIs<ArtResult.Rejected>(store.store(file, member))

    @Test
    fun `W2-087 not a picture, named by its card`() {
        val result = refused(tmp("script.png").apply { writeText("<script>") }, "real_cards/Lightning Bolt [M10].png")
        assertEquals("NOT_A_PICTURE", result.code)
        assertEquals("The picture for Lightning Bolt is not a PNG or JPEG file.", result.detail)
    }

    @Test
    fun `W2-087 too big and too small, in pixels`() {
        val big = refused(headerOnly(9000, 9000), "real_cards/Foo.png")
        assertEquals("UNREASONABLE_DIMENSIONS", big.code)
        assertEquals("The picture for Foo is too big (9000 by 9000 pixels).", big.detail)
        val small = refused(png(10, 10), "art_crops/Foo [ABC].jpg")
        assertEquals("The picture for Foo is too small (10 by 10 pixels).", small.detail)
    }

    @Test
    fun `W2-087 no size, and a picture that will not open`() {
        val header = byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10)
        val noSize = refused(tmp("short.png").apply { writeBytes(header) }, "x/Foo.png")
        assertEquals("UNREASONABLE_DIMENSIONS", noSize.code)
        assertEquals("The picture for Foo has no size we can read.", noSize.detail)
        val broken = refused(headerOnly(100, 140), "real_cards/Foo.png")
        assertEquals("UNDECODABLE_IMAGE", broken.code)
        assertEquals("The picture for Foo could not be opened.", broken.detail)
    }

    // --- the deck file (W2-121..W2-134) --------------------------------

    @Test
    fun `W2-134 no deck file`() {
        val result = inspected(File(root, "never-sent.zip"))
        assertEquals("NOT_A_FILE", result.code)
        assertEquals("No deck file arrived. Try sending it again.", result.detail)
    }

    @Test
    fun `W2-127 not a zip`() {
        val result = inspected(tmp("plain.zip").apply { writeText("hello") })
        assertEquals("NOT_A_ZIP", result.code)
        assertEquals(
            "That file isn't a deck file Arena can open. Export the deck again from the Deck Builder.",
            result.detail,
        )
    }

    @Test
    fun `W2-121 too big a deck file, in MB`() {
        val file = tmp("huge.zip")
        java.io.RandomAccessFile(file, "rw").use { it.setLength(PackageLimits.MAX_ARCHIVE_BYTES + 20L * 1024 * 1024) }
        try {
            val result = inspected(file)
            assertEquals("ARCHIVE_TOO_LARGE", result.code)
            assertEquals("This deck file is too big (170 MB). The most Arena takes is 150 MB.", result.detail)
        } finally {
            file.delete()
        }
    }

    @Test
    fun `W2-123 too many files inside`() {
        val members = (1..PackageLimits.MAX_ENTRIES + 1).map { "real_cards/c$it.png" to ByteArray(1) }
        val result = inspected(zipOf("many.zip", *members.toTypedArray()))
        assertEquals("TOO_MANY_ENTRIES", result.code)
        assertEquals("This deck file has too many files inside it (601; the most is 600).", result.detail)
    }

    @Test
    fun `W2-124 one file too big`() {
        val result = inspected(zipOf("big-entry.zip", deckText, "real_cards/Foo.png" to ByteArray(17 * 1024 * 1024)))
        assertEquals("ENTRY_TOO_LARGE", result.code)
        assertEquals("One of the files inside this deck file is too big (17 MB; the most is 16 MB).", result.detail)
    }

    @Test
    fun `W2-125 too big once unpacked`() {
        val zeros = ByteArray(16 * 1024 * 1024 - 1)
        val members = (1..13).map { "real_cards/c$it.png" to zeros }
        val result = inspected(zipOf("expands.zip", deckText, *members.toTypedArray()))
        assertEquals("UNCOMPRESSED_TOO_LARGE", result.code)
        assertEquals("This deck file is too big once unpacked (more than 200 MB).", result.detail)
    }

    @Test
    fun `W2-126 unpacks to far more than its size`() {
        val result = inspected(zipOf("ratio.zip", deckText, "real_cards/Foo.png" to ByteArray(4 * 1024 * 1024)))
        assertEquals("COMPRESSION_RATIO", result.code)
        assertEquals(
            "This deck file unpacks to far more than its size, so Arena won't open it. Export the deck again.",
            result.detail,
        )
    }

    @Test
    fun `W2-128 two files with one name`() {
        val result =
            inspected(
                zipOf(
                    "dupe.zip",
                    deckText,
                    "real_cards/Foo.png" to ByteArray(4),
                    "real_cards/foo.png" to ByteArray(4),
                ),
            )
        assertEquals("DUPLICATE_PATH", result.code)
        assertEquals(
            "This deck file has two files with the same name (\"real_cards/Foo.png\" and \"real_cards/foo.png\"). " +
                "Export the deck again.",
            result.detail,
        )
    }

    @Test
    fun `W2-129 a file Arena does not expect`() {
        val result = inspected(zipOf("odd.zip", deckText, "notes.md" to ByteArray(4)))
        assertEquals("UNEXPECTED_ENTRY", result.code)
        assertEquals(
            "This deck file has a file Arena doesn't expect: \"notes.md\". Export the deck again.",
            result.detail,
        )
    }

    @Test
    fun `W2-130 and W2-131 no deck list, or two`() {
        val none = inspected(zipOf("none.zip", "real_cards/Foo.png" to ByteArray(4)))
        assertEquals("NO_DECK_LIST", none.code)
        assertEquals("This deck file has no deck list in it.", none.detail)
        val two = inspected(zipOf("two.zip", deckText, "Other.txt" to "1 Mountain\n".toByteArray()))
        assertEquals("MULTIPLE_DECK_LISTS", two.code)
        assertEquals("This deck file has two deck lists in it. It should have one.", two.detail)
    }

    @Test
    fun `W2-132 a path that is not safe`() {
        val result = inspected(zipOf("unsafe.zip", deckText, "../evil.txt" to ByteArray(4)))
        assertEquals("UNSAFE_PATH", result.code)
        assertEquals(
            "This deck file can't be opened safely. Export the deck again from the Deck Builder.",
            result.detail,
        )
    }

    @Test
    fun `W2-133 too many pictures`() {
        val members = (1..PackageLimits.MAX_IMAGE_COUNT + 1).map { "real_cards/c$it.png" to ByteArray(1) }
        val result = inspected(zipOf("pictures.zip", deckText, *members.toTypedArray()))
        assertEquals("TOO_MANY_IMAGES", result.code)
        assertEquals("This deck file has 501 pictures; the most a deck can have is 500.", result.detail)
    }

    @Test
    fun `an empty deck file`() {
        val result = inspected(zipOf("empty.zip"))
        assertEquals("EMPTY_ARCHIVE", result.code)
        assertEquals("This deck file is empty. Export the deck again.", result.detail)
    }

    @Test
    fun `W2-137 the deck name rule`() {
        assertEquals("A deck name can be up to 80 characters, on one line.", DeckNames.RULE)
    }
}
