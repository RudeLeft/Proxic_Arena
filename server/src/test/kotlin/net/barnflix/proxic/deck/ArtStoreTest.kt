package net.barnflix.proxic.deck

import java.awt.image.BufferedImage
import java.io.File
import java.nio.ByteBuffer
import javax.imageio.ImageIO
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * A picture's size is read from its header before it is decoded —
 * 2026-10-22 review.
 *
 * A PNG of one colour compresses about a thousand to one, so a file
 * far under the byte limit can claim 40,000 x 40,000 and decode to
 * gigabytes. Each hostile case has its negative control: a real card-
 * sized picture still stores.
 */
class ArtStoreTest {
    private val root = File("build/test-art-store").apply { mkdirs() }
    private val store = ArtStore(root)

    private fun file(name: String) = File(root, name).apply { parentFile.mkdirs() }

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
        return file("claims-${width}x$height.png").apply { writeBytes(bytes) }
    }

    @Test
    fun `a picture claiming an enormous size is refused before it is decoded`() {
        // Undecodable past its header: had the decoder run first, the
        // answer would be UNDECODABLE_IMAGE, not the size.
        val result = store.store(headerOnly(40_000, 40_000), "Bomb.png")
        assertIs<ArtResult.Rejected>(result)
        assertEquals("UNREASONABLE_DIMENSIONS", result.code)
    }

    @Test
    fun `a file that is not a PNG is refused as one`() {
        val result = store.store(file("script.png").apply { writeText("<script>alert(1)</script>") }, "x.png")
        assertIs<ArtResult.Rejected>(result)
        assertEquals("NOT_A_PNG", result.code)
    }

    @Test
    fun `a card-sized picture still stores`() {
        val png = file("card.png")
        ImageIO.write(BufferedImage(745, 1040, BufferedImage.TYPE_INT_RGB), "png", png)
        val result = store.store(png, "Card.png")
        assertIs<ArtResult.Ok>(result)
        assertEquals(745 to 1040, result.art.width to result.art.height)
    }
}
