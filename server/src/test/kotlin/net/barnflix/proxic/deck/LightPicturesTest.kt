package net.barnflix.proxic.deck

import java.awt.Color
import java.awt.image.BufferedImage
import java.io.File
import java.nio.file.Files
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.imageio.ImageIO
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Spec 0051 — light pictures: a JPEG card picture or art crop is
 * accepted and served as it came for a close-up, the table's copy is a
 * 384-wide JPEG, and the pictures stored before get one, once, with
 * their originals untouched (F-0051-C, F-0051-D).
 */
class LightPicturesTest {
    /** A card-shaped scan: noisy art, a red border and see-through corners. */
    private fun scan(
        width: Int = 744,
        height: Int = 1040,
    ): BufferedImage {
        val image = BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB)
        val random = Random(width)
        for (y in 0 until height) {
            for (x in 0 until width) {
                val border = x < 30 || y < 30 || x >= width - 30 || y >= height - 30
                val rgb = if (border) Color(160, 20, 20).rgb else Color(random.nextInt(256), 90, 140).rgb
                image.setRGB(x, y, rgb)
            }
        }
        for (y in 0 until 12) for (x in 0 until 12) image.setRGB(x, y, 0)
        return image
    }

    private fun jpeg(
        dir: File,
        name: String,
        image: BufferedImage,
    ): File = File(dir, name).also { ZoomCopy.write(image, it) }

    @Test
    fun `a JPEG card picture is stored, is its own close-up, and gets a 384-wide JPEG table copy`() {
        val dir = Files.createTempDirectory("light").toFile()
        val store = ArtStore(File(dir, "data"))
        val source = jpeg(dir, "card.jpg", scan())

        val stored = store.store(source, "real_cards/Card [SET].jpg")
        assertIs<ArtResult.Ok>(stored)
        val sha = stored.art.sha256

        val original = store.originalPath(sha)
        assertEquals("jpg", original.extension, "the original keeps its own format")
        assertTrue(original.readBytes().contentEquals(source.readBytes()), "stored as it came")
        assertEquals(original, store.fileFor(sha, closeUp = true), "the JPEG is its own close-up")
        assertFalse(store.zoomPath(sha).isFile, "no second encode")

        val table = assertNotNull(store.fileFor(sha, closeUp = false))
        assertEquals("jpg", table.extension)
        assertEquals(384, ImageIO.read(table).width)
        assertTrue(table.length() < original.length())
    }

    @Test
    fun `an art crop smaller than the table copy would be is served as it came`() {
        val dir = Files.createTempDirectory("crop").toFile()
        val store = ArtStore(File(dir, "data"))
        val crop = jpeg(dir, "crop.jpg", scan(300, 220))

        val stored = assertIs<ArtResult.Ok>(store.store(crop, "art_crops/Card [SET].jpg"))
        assertEquals(store.originalPath(stored.art.sha256), store.fileFor(stored.art.sha256, closeUp = false))
    }

    @Test
    fun `a PNG gets a JPEG table copy and its close-up, as before`() {
        val dir = Files.createTempDirectory("png").toFile()
        val store = ArtStore(File(dir, "data"))
        val source = File(dir, "card.png").also { ImageIO.write(scan(), "png", it) }

        val sha = assertIs<ArtResult.Ok>(store.store(source, "real_cards/Card [SET].png")).art.sha256
        assertEquals("png", store.originalPath(sha).extension)
        assertEquals("jpg", store.fileFor(sha, closeUp = false)!!.extension)
        assertEquals(store.zoomPath(sha), store.fileFor(sha, closeUp = true))
        assertFalse(store.needsCopies(store.originalPath(sha)))
    }

    @Test
    fun `a picture stored before spec 0051 gets its JPEG table copy once, and its original is untouched`() {
        val dir = Files.createTempDirectory("old").toFile()
        val store = ArtStore(File(dir, "data"))
        val source = File(dir, "card.png").also { ImageIO.write(scan(), "png", it) }
        val sha = assertIs<ArtResult.Ok>(store.store(source, "real_cards/Card [SET].png")).art.sha256
        // As it was before: a PNG table copy, no JPEG one.
        store.fileFor(sha, closeUp = false)!!.delete()
        val oldCopy = store.pathFor(File(dir, "data/art/display"), sha)
        oldCopy.parentFile.mkdirs()
        ImageIO.write(scan(384, 536), "png", oldCopy)
        val original = store.originalPath(sha)
        val before = original.readBytes()
        assertTrue(store.needsCopies(original))
        assertEquals(oldCopy, store.fileFor(sha, closeUp = false), "the old copy serves meanwhile")

        store.makeCopies(sha, ImageIO.read(original), original)

        assertEquals("jpg", store.fileFor(sha, closeUp = false)!!.extension)
        assertFalse(oldCopy.isFile, "the PNG copy it replaces is gone")
        assertTrue(original.readBytes().contentEquals(before), "the original is untouched")
        assertFalse(store.needsCopies(original), "made once")
    }

    @Test
    fun `a package may carry JPEG pictures and art crops`() {
        val dir = Files.createTempDirectory("pkg").toFile()
        val picture = jpeg(dir, "p.jpg", scan()).readBytes()
        val zip = File(dir, "Deck.zip")
        ZipOutputStream(zip.outputStream()).use { out ->
            fun put(
                name: String,
                bytes: ByteArray,
            ) {
                out.putNextEntry(ZipEntry(name))
                out.write(bytes)
                out.closeEntry()
            }
            put("Deck.txt", "60 Mountain\n".toByteArray())
            put("real_cards/Mountain [SET].jpg", picture)
            put("art_crops/Mountain [SET].jpg", picture)
        }
        val inspected = assertIs<PackageResult.Ok>(PackageInspector.inspect(zip)).inspected
        assertEquals(listOf("real_cards/Mountain [SET].jpg"), inspected.imageEntries)
        assertEquals(listOf("art_crops/Mountain [SET].jpg"), inspected.cropEntries)

        assertEquals("mountain", frontNameOf("art_crops/Mountain [SET].jpg"))
        assertEquals("mountain", frontNameOf("real_cards/Mountain [SET].jpeg"))
        assertEquals("reckless stormseeker", frontNameOf("real_cards/Reckless Stormseeker [MID].png"))
        val sha = "a".repeat(64)
        val named = picturesNamed("""{"art_crops/Mountain [SET].jpg":"$sha"}""".toByteArray())
        assertEquals(mapOf("art_crops/Mountain [SET].jpg" to sha), named)
    }

    @Test
    fun `an art crop must be a JPEG, as Scryfall serves them`() {
        val dir = Files.createTempDirectory("pkg").toFile()
        val zip = File(dir, "Deck.zip")
        ZipOutputStream(zip.outputStream()).use { out ->
            out.putNextEntry(ZipEntry("Deck.txt"))
            out.write("60 Mountain\n".toByteArray())
            out.closeEntry()
            out.putNextEntry(ZipEntry("art_crops/Mountain [SET].png"))
            out.write(ByteArray(10))
            out.closeEntry()
        }
        val refused = assertIs<PackageResult.Rejected>(PackageInspector.inspect(zip))
        assertEquals("UNEXPECTED_ENTRY", refused.code)
    }
}
