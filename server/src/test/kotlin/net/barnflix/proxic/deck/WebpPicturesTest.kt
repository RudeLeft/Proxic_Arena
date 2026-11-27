package net.barnflix.proxic.deck

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.slf4j.LoggerFactory
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.file.Files
import java.util.concurrent.TimeUnit
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.imageio.ImageIO
import kotlin.random.Random
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Spec 0121 -- card pictures as WebP at quality 80: the table's copy and the
 * close-up (F-0121-A), the order they are served in and what happens with no
 * encoder (F-0121-B), the one-time pass over the pictures stored before
 * (F-0121-C), and the Deck Builder side left alone (F-0121-F).
 *
 * Most of it runs with a stand-in encoder (this PC has no `cwebp`; the owner
 * decides whether to install it), which writes a WebP header of the size it
 * was given and keeps the pixels it was handed. The tests that need the real
 * `cwebp` run in CI (the server-tests job installs Ubuntu's `webp`) and skip
 * here; CI fails a skip it does not expect (ci/check-skips.sh).
 */
class WebpPicturesTest {
    private val dir = Files.createTempDirectory("webp").toFile()
    private val logs = ListAppender<ILoggingEvent>().also { it.start() }

    init {
        (LoggerFactory.getLogger(ArtStore::class.java) as Logger).addAppender(logs)
    }

    @AfterTest
    fun tidy() {
        (LoggerFactory.getLogger(ArtStore::class.java) as Logger).detachAppender(logs)
        dir.deleteRecursively()
    }

    /** Writes a real WebP header (VP8X) of the size it is handed, and keeps the pixels. */
    private class StandIn : WebpEncoder {
        val handed = mutableListOf<BufferedImage>()

        override fun encode(
            image: BufferedImage,
            target: File,
        ) {
            handed += image
            target.parentFile.mkdirs()
            val header =
                ByteBuffer.allocate(HEADER).order(ByteOrder.LITTLE_ENDIAN).apply {
                    put("RIFF".toByteArray())
                    putInt(HEADER - 8)
                    put("WEBPVP8X".toByteArray())
                    putInt(10)
                    putInt(0)
                    put24(image.width - 1)
                    put24(image.height - 1)
                }
            target.writeBytes(header.array())
        }

        private fun ByteBuffer.put24(value: Int) {
            put(value.toByte())
            put((value shr 8).toByte())
            put((value shr 16).toByte())
        }

        companion object {
            const val HEADER = 30
        }
    }

    private val missing = WebpEncoder { _, _ -> throw EncoderMissing("not here") }
    private val broken = WebpEncoder { _, _ -> error("the encoder fell over") }

    /** A card-shaped scan: noisy art, a red border, see-through corners. */
    private fun scan(
        width: Int = 744,
        height: Int = 1040,
        art: Int = 90,
    ): BufferedImage {
        val image = BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB)
        val random = Random(width + art)
        for (y in 0 until height) {
            for (x in 0 until width) {
                val border = x < 30 || y < 30 || x >= width - 30 || y >= height - 30
                val rgb = if (border) Color(160, 20, 20).rgb else Color(random.nextInt(256), art, 140).rgb
                image.setRGB(x, y, rgb)
            }
        }
        for (y in 0 until 12) for (x in 0 until 12) image.setRGB(x, y, 0)
        return image
    }

    private fun png(
        name: String,
        image: BufferedImage = scan(),
    ) = File(dir, name).also { ImageIO.write(image, "png", it) }

    private fun jpeg(
        name: String,
        image: BufferedImage = scan(),
    ) = File(dir, name).also { ZoomCopy.write(image, it) }

    private fun isRed(rgb: Int) = Color(rgb).let { it.red > 120 && it.green < 70 && it.blue < 70 }

    // --- F-0121-A: both copies, from either kind of original --------------

    @Test
    fun `F-0121-A a PNG, a JPEG and an art crop each get a 384-wide table WebP and a full-size close-up WebP`() {
        val encoder = StandIn()
        val store = ArtStore(File(dir, "data"), encoder)
        val sources = listOf(png("card.png"), jpeg("card.jpg", scan(art = 30)), jpeg("crop.jpg", scan(626, 457)))
        for (source in sources) {
            val before = source.readBytes()
            val sha = assertIs<ArtResult.Ok>(store.store(source, "real_cards/${source.name}")).art.sha256
            val original = store.originalPath(sha)
            val width = ImageIO.read(original).width

            val table = assertNotNull(store.fileFor(sha, closeUp = false))
            assertEquals(store.copies.webp(sha, closeUp = false), table, "${source.name}: the table's WebP is served")
            assertEquals(384, webpSize(table)!!.first, "${source.name}: 384 wide")
            val closeUp = assertNotNull(store.fileFor(sha, closeUp = true))
            assertEquals(store.copies.webp(sha, closeUp = true), closeUp, "${source.name}: the close-up's WebP")
            assertEquals(width, webpSize(closeUp)!!.first, "${source.name}: full size")

            assertTrue(original.readBytes().contentEquals(before), "${source.name}: the original is kept as it came")
            assertEquals(source.extension, original.extension)
            assertFalse(store.zoomPath(sha).isFile, "${source.name}: no JPEG close-up made")
            val folder = File(dir, "data/art/display/${sha.substring(0, 2)}")
            val leftovers = folder.listFiles()!!.filter { it.extension == "jpg" || it.name.endsWith(".part") }
            assertTrue(leftovers.isEmpty(), "no JPEG table copy: $leftovers")
            assertFalse(store.needsCopies(original), "${source.name}: done")
        }
        // The PNG's see-through corners take its border colour, in both copies.
        val (pngTable, pngCloseUp) = encoder.handed.take(2)
        assertTrue(isRed(pngTable.getRGB(1, 1)) && isRed(pngCloseUp.getRGB(1, 1)), "corners filled with the border")
        assertEquals(BufferedImage.TYPE_INT_RGB, pngCloseUp.type, "opaque pixels go to the encoder")
    }

    @Test
    fun `F-0121-A a narrow picture's table copy keeps its width, and a copy no lighter is not kept`() {
        val store = ArtStore(File(dir, "data"), StandIn())
        val small = png("small.png", scan(300, 220))
        val sha = assertIs<ArtResult.Ok>(store.store(small, "art_crops/small.png")).art.sha256
        assertEquals(300, webpSize(store.fileFor(sha, closeUp = false)!!)!!.first)

        // An encoder whose answer is heavier than the original: not kept, and not tried again.
        var asked = 0
        val heavy =
            WebpEncoder { _, target ->
                asked++
                target.parentFile.mkdirs()
                target.writeBytes(ByteArray(5_000_000))
            }
        val heavyStore = ArtStore(File(dir, "heavy"), heavy)
        val heavySource = jpeg("h.jpg")
        val heavySha = assertIs<ArtResult.Ok>(heavyStore.store(heavySource, "real_cards/h.jpg")).art.sha256
        val heavyOriginal = heavyStore.originalPath(heavySha)
        assertEquals(heavyOriginal, heavyStore.fileFor(heavySha, closeUp = true), "the original serves")
        assertEquals(heavyStore.originalPath(heavySha), heavyStore.fileFor(heavySha, closeUp = false))
        assertFalse(heavyStore.needsCopies(heavyStore.originalPath(heavySha)), "tried, and marked")
        assertEquals(2, asked)
        heavyStore.store(heavySource, "real_cards/h.jpg")
        assertEquals(2, asked, "stored again: not encoded again")
    }

    // --- F-0121-B: the order, and no encoder ---------------------------------

    @Test
    fun `F-0121-B fileFor serves the WebP copy, then the older JPEG or PNG copy, then the original`() {
        val store = ArtStore(File(dir, "data"), StandIn())
        val sha = assertIs<ArtResult.Ok>(store.store(png("card.png"), "real_cards/card.png")).art.sha256
        val shard = sha.substring(0, 2)
        val oldTable = File(dir, "data/art/display/$shard/$sha.jpg").apply { writeBytes(byteArrayOf(1)) }
        val oldPng = File(dir, "data/art/display/$shard/$sha.png").apply { writeBytes(byteArrayOf(2)) }
        val oldZoom = store.zoomPath(sha).apply { parentFile.mkdirs() }.apply { writeBytes(byteArrayOf(3)) }

        assertEquals(store.copies.webp(sha, closeUp = false), store.fileFor(sha, closeUp = false))
        assertEquals(store.copies.webp(sha, closeUp = true), store.fileFor(sha, closeUp = true))
        store.copies.webp(sha, closeUp = false).delete()
        store.copies.webp(sha, closeUp = true).delete()
        assertEquals(oldTable, store.fileFor(sha, closeUp = false), "then the JPEG table copy")
        assertEquals(oldZoom, store.fileFor(sha, closeUp = true), "then the JPEG close-up")
        oldTable.delete()
        oldZoom.delete()
        assertEquals(oldPng, store.fileFor(sha, closeUp = false), "then a pre-0051 PNG table copy")
        oldPng.delete()
        assertEquals(store.originalPath(sha), store.fileFor(sha, closeUp = false), "then the original")
        assertEquals(store.originalPath(sha), store.fileFor(sha, closeUp = true))
        assertNull(store.fileFor("0".repeat(64), closeUp = false), "nothing for an unknown picture")
    }

    @Test
    fun `F-0121-B a failing encoder leaves the import accepted with today's JPEG copies, and says so`() {
        val store = ArtStore(File(dir, "data"), broken)
        val sha = assertIs<ArtResult.Ok>(store.store(png("card.png"), "real_cards/card.png")).art.sha256
        assertEquals("jpg", store.fileFor(sha, closeUp = false)!!.extension, "today's JPEG table copy")
        assertEquals(store.zoomPath(sha), store.fileFor(sha, closeUp = true), "today's JPEG close-up")
        assertTrue(store.needsCopies(store.originalPath(sha)), "the WebP copies are still owed")
        val warned = logs.list.filter { it.formattedMessage.contains("was not made (the encoder fell over)") }
        assertEquals(2, warned.size, "both copies logged: ${logs.list.map { it.formattedMessage }}")
        assertTrue(File(dir, "data/art").walkTopDown().none { it.name.endsWith(".part") || it.extension == "webp" })

        val jpegStore = ArtStore(File(dir, "jpeg"), missing)
        val jpegSha = assertIs<ArtResult.Ok>(jpegStore.store(jpeg("card.jpg"), "real_cards/card.jpg")).art.sha256
        assertEquals("jpg", jpegStore.fileFor(jpegSha, closeUp = false)!!.extension)
        val jpegOriginal = jpegStore.originalPath(jpegSha)
        assertEquals(jpegOriginal, jpegStore.fileFor(jpegSha, closeUp = true), "a JPEG is its own close-up")
    }

    @Test
    fun `F-0121-B a missing cwebp is found once, logged, and every picture keeps its JPEG copies`() {
        val absent = CwebpEncoder(command = "proxic-no-such-cwebp-${System.nanoTime()}")
        assertFalse(absent.available)
        val store = ArtStore(File(dir, "data"), absent)
        val sha = assertIs<ArtResult.Ok>(store.store(png("card.png"), "real_cards/card.png")).art.sha256
        assertEquals("jpg", store.fileFor(sha, closeUp = false)!!.extension)
        assertEquals(store.zoomPath(sha), store.fileFor(sha, closeUp = true))
        val report = ZoomCopy.fill(store, LoggerFactory.getLogger(ArtStore::class.java))
        assertEquals(0, report.made, "with no encoder the one-time pass makes nothing")
        assertTrue(logs.list.any { it.formattedMessage.contains("the encoder is missing") }, "and says why")
    }

    // --- F-0121-C: the one-time pass -----------------------------------------

    @Test
    fun `F-0121-C pictures stored before get WebP copies from their originals, once, and old copies go after`() {
        val data = File(dir, "data")
        // Stored before spec 0121: today's JPEG copies.
        val before = ArtStore(data, missing)
        val pngSha = assertIs<ArtResult.Ok>(before.store(png("card.png"), "real_cards/card.png")).art.sha256
        val jpegSource = jpeg("card.jpg", scan(art = 30))
        val jpegSha = assertIs<ArtResult.Ok>(before.store(jpegSource, "real_cards/card.jpg")).art.sha256
        val pngTable = before.fileFor(pngSha, closeUp = false)!!
        val jpegTable = before.fileFor(jpegSha, closeUp = false)!!
        val pngZoom = before.zoomPath(pngSha)
        assertTrue(pngTable.extension == "jpg" && jpegTable.extension == "jpg" && pngZoom.isFile)
        // The old JPEG copies are made BLUE: what the pass is handed shows where it read from.
        for (old in listOf(pngTable, jpegTable, pngZoom)) {
            val blue = BufferedImage(ImageIO.read(old).width, ImageIO.read(old).height, BufferedImage.TYPE_INT_RGB)
            for (x in 0 until blue.width) for (y in 0 until blue.height) blue.setRGB(x, y, Color.BLUE.rgb)
            ImageIO.write(blue, "jpg", old)
        }
        val originals = listOf(pngSha, jpegSha).associateWith { before.originalPath(it).readBytes() }

        val encoder = StandIn()
        val after = ArtStore(data, encoder)
        val log = LoggerFactory.getLogger(ArtStore::class.java)
        val report = ZoomCopy.fill(after, log)

        assertEquals(2, report.looked)
        assertEquals(2, report.made)
        assertEquals(0, report.failed)
        assertEquals(3, report.oldCopiesRemoved, "the two JPEG table copies and the JPEG close-up")
        for (sha in listOf(pngSha, jpegSha)) {
            assertEquals(after.copies.webp(sha, closeUp = false), after.fileFor(sha, closeUp = false))
            assertEquals(after.copies.webp(sha, closeUp = true), after.fileFor(sha, closeUp = true))
            assertTrue(after.originalPath(sha).readBytes().contentEquals(originals.getValue(sha)), "original untouched")
        }
        assertFalse(pngTable.isFile || jpegTable.isFile || pngZoom.isFile, "the older copies are gone")
        // From the originals: never the blue old copies (a third squeeze).
        assertTrue(
            encoder.handed.none { image ->
                Color(image.getRGB(image.width / 2, image.height / 2)).let { it.blue > 200 && it.red < 60 }
            },
            "made from the originals",
        )
        assertEquals(4, encoder.handed.size)
        assertTrue(
            logs.list.any { it.formattedMessage.matches(PASS_LOG) },
            logs.list.joinToString { it.formattedMessage },
        )

        val again = ZoomCopy.fill(after, log)
        assertEquals(0, again.looked, "a second start finds nothing to do")
        assertEquals(4, encoder.handed.size, "and encodes nothing")
    }

    @Test
    fun `F-0121-C the pass keeps an older copy when the WebP copy could not be made`() {
        val data = File(dir, "data")
        val stored = ArtStore(data, missing).store(png("card.png"), "real_cards/card.png")
        val sha = assertIs<ArtResult.Ok>(stored).art.sha256
        val report = ZoomCopy.fill(ArtStore(data, broken), LoggerFactory.getLogger(ArtStore::class.java))
        assertEquals(1, report.failed)
        assertEquals(0, report.oldCopiesRemoved)
        assertEquals("jpg", ArtStore(data, missing).fileFor(sha, closeUp = false)!!.extension, "still served")
    }

    // --- F-0121-F: the Deck Builder side is unchanged ------------------------

    @Test
    fun `F-0121-F a package with a WebP card picture is still refused, with today's words`() {
        val zip = File(dir, "Deck.zip")
        ZipOutputStream(zip.outputStream()).use { out ->
            out.putNextEntry(ZipEntry("Deck.txt"))
            out.write("60 Mountain\n".toByteArray())
            out.closeEntry()
            out.putNextEntry(ZipEntry("real_cards/Mountain [SET].webp"))
            out.write(ByteArray(40))
            out.closeEntry()
        }
        val refused = assertIs<PackageResult.Rejected>(PackageInspector.inspect(zip))
        assertEquals("UNEXPECTED_ENTRY", refused.code)
        assertEquals(
            "This deck file has a file Arena doesn't expect: \"real_cards/Mountain [SET].webp\". " +
                "Export the deck again.",
            refused.detail,
        )
        assertEquals(listOf("png", "jpeg"), PackageLimits.PICTURE_FORMATS, "what /api/deck-rules says")
    }

    // --- the real encoder (CI and the Docker stacks) -------------------------

    @Test
    fun `F-0121-A the real cwebp writes decodable WebP at quality 80, method 4, with no metadata`() {
        val real = CwebpEncoder.shared
        assumeTrue(real.available, "SKIPPED: cwebp is not installed here (CI's server-tests job installs it)")
        val store = ArtStore(File(dir, "data"), real)
        for (source in listOf(png("card.png"), jpeg("card.jpg"))) {
            val sha = assertIs<ArtResult.Ok>(store.store(source, "real_cards/${source.name}")).art.sha256
            val table = store.fileFor(sha, closeUp = false)!!
            val closeUp = store.fileFor(sha, closeUp = true)!!
            assertEquals("webp" to "webp", table.extension to closeUp.extension)
            assertEquals(384 to 536, webpSize(table))
            assertEquals(744 to 1040, webpSize(closeUp))
            assertTrue(closeUp.length() < source.length(), "lighter than the original")
            assertTrue(decodes(closeUp) && decodes(table), "dwebp decodes both")

            // The same pixels through cwebp by hand, with the spec's settings, give the same bytes.
            val pixels = ZoomCopy.opaque(ImageIO.read(store.originalPath(sha)), 744)
            val ppm = File(dir, "by-hand.ppm").also { CwebpEncoder.writePpm(pixels, it) }
            val byHand = File(dir, "by-hand.webp")
            run("cwebp", "-quiet", "-q", "80", "-m", "4", "-metadata", "none", ppm.path, "-o", byHand.path)
            assertTrue(byHand.readBytes().contentEquals(closeUp.readBytes()), "quality 80, method 4, no metadata")
            assertFalse(String(closeUp.readBytes(), Charsets.ISO_8859_1).contains("EXIF"), "no metadata")
        }
    }

    private fun decodes(webp: File): Boolean {
        val out = File(dir, "decoded.png")
        out.delete()
        return run("dwebp", "-quiet", webp.path, "-o", out.path) && ImageIO.read(out) != null
    }

    private companion object {
        val PASS_LOG = Regex(".*made for 2 of 2 pictures.*3 older copies removed.*ms a picture.*")
    }

    private fun run(vararg command: String): Boolean {
        val process = ProcessBuilder(*command).redirectErrorStream(true).start()
        process.inputStream.readAllBytes()
        return process.waitFor(60, TimeUnit.SECONDS) && process.exitValue() == 0
    }
}
