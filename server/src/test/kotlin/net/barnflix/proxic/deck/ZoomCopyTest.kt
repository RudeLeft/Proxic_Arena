package net.barnflix.proxic.deck

import java.awt.Color
import java.awt.image.BufferedImage
import java.io.File
import java.nio.file.Files
import javax.imageio.ImageIO
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** Spec 0015 — the close-up copy: the same picture, much lighter, and served for a zoom. */
class ZoomCopyTest {
    /** A card-shaped scan: noisy art (as real scans are), a red border, and see-through corners. */
    private fun scan(): BufferedImage {
        val image = BufferedImage(744, 1040, BufferedImage.TYPE_INT_ARGB)
        val random = Random(7)
        for (y in 0 until image.height) {
            for (x in 0 until image.width) {
                val border = x < 30 || y < 30 || x >= image.width - 30 || y >= image.height - 30
                val rgb = if (border) Color(160, 20, 20).rgb else Color(random.nextInt(256), 90, 140).rgb
                image.setRGB(x, y, rgb)
            }
        }
        for (y in 0 until 12) for (x in 0 until 12) image.setRGB(x, y, 0) // a see-through corner
        return image
    }

    @Test
    fun `the copy is the same size, much lighter, with the corners in the border colour`() {
        val dir = Files.createTempDirectory("zoom").toFile()
        val original = File(dir, "original.png").also { ImageIO.write(scan(), "png", it) }
        val copy = File(dir, "copy.jpg")
        ZoomCopy.write(ImageIO.read(original), copy)

        val read = assertNotNull(ImageIO.read(copy))
        assertEquals(744 to 1040, read.width to read.height)
        // Random noise is the worst case for a JPEG; real scans measured
        // about seven times lighter (Fiery Temper: 1.5 MB -> 216 KB).
        assertTrue(copy.length() * 2 < original.length(), "${copy.length()} vs ${original.length()}")
        val corner = Color(read.getRGB(2, 2))
        val bordered = corner.red > 120 && corner.green < 70 && corner.blue < 70
        assertTrue(bordered, "the corner took the border colour: $corner")
        assertTrue(dir.listFiles()!!.none { it.name.endsWith(".part") }, "no half-written file left")
    }

    @Test
    fun `a close-up is served the light copy, and the scan when there is none`() {
        val dir = Files.createTempDirectory("art").toFile()
        val store = ArtStore(dir)
        val png = File(dir, "card.png").also { ImageIO.write(scan(), "png", it) }
        val sha = (store.store(png, "card.png") as ArtResult.Ok).art.sha256

        assertEquals(store.zoomPath(sha), store.fileFor(sha, closeUp = true), "made at import")
        assertEquals(store.displayPath(sha), store.fileFor(sha, closeUp = false))
        store.zoomPath(sha).delete()
        assertEquals(store.originalPath(sha), store.fileFor(sha, closeUp = true), "falls back to the scan")
    }
}
