package net.barnflix.proxic.deck

import org.junit.jupiter.api.Assumptions.assumeTrue
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Deck package safety — PHASE_02 §2.26–§2.38.
 *
 * These matter more than they would otherwise: PHASE 2 AMENDMENT 1
 * puts import on a public endpoint with no authentication, so these
 * checks are the only thing standing between a stranger and the
 * disk.
 *
 * Every hostile case is paired with the negative control that says
 * the inspector has not simply become "reject everything" — the
 * real export, and a minimal valid package, must both be ACCEPTED.
 */
class PackageInspectorTest {
    private val realExport = File("../Test Deck/Basic_Mono_Red_65_Card_Deck.zip")

    private fun tmp(name: String): File = File("build/test-packages/$name").apply { parentFile.mkdirs() }

    /** Build an archive from literal entry names and contents. */
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

    private fun validPackage(name: String = "valid.zip"): File =
        zipOf(
            name,
            "My Deck.txt" to "// My Deck\n\n60 Mountain [FRA:287]\n".toByteArray(),
            "real_cards/Mountain [FRA].png" to ByteArray(2048) { it.toByte() },
        )

    private fun rejection(file: File): PackageResult.Rejected {
        val result = PackageInspector.inspect(file)
        assertTrue(result is PackageResult.Rejected, "expected rejection, got $result")
        return result as PackageResult.Rejected
    }

    // --- negative controls: these MUST be accepted -------------------

    @Test
    fun `the real Deck Builder export is accepted`() {
        assumeTrue(realExport.isFile, "SKIPPED: no real export (see PHASE_02 §2.3)")

        val result = PackageInspector.inspect(realExport)
        assertTrue(result is PackageResult.Ok, "the real export was rejected: $result")
        val inspected = (result as PackageResult.Ok).inspected

        assertEquals("Basic_Mono_Red_65_Card_Deck.txt", inspected.deckTextEntry)
        assertEquals(11, inspected.imageEntries.size)
        assertTrue(inspected.imageEntries.all { it.startsWith("real_cards/") })
    }

    @Test
    fun `a minimal valid package is accepted`() {
        val result = PackageInspector.inspect(validPackage())
        assertTrue(result is PackageResult.Ok, "got $result")
    }

    // --- §2.27 archive type -----------------------------------------

    @Test
    fun `a file named zip that is not a zip is refused`() {
        val notZip = tmp("liar.zip").apply { writeText("I am definitely a ZIP archive, honest") }
        assertEquals("NOT_A_ZIP", rejection(notZip).code)
    }

    // --- §2.28, §2.29 path safety -----------------------------------

    @Test
    fun `entries that escape the staging directory are refused`() {
        val backslash = 92.toChar()
        for (path in listOf(
            "../evil.txt",
            "../../etc/passwd",
            "/etc/passwd",
            "C:${backslash}Windows${backslash}evil.txt",
            "real_cards/../../evil.png",
            "..$backslash..${backslash}evil.txt",
        )) {
            val archive =
                zipOf(
                    "escape.zip",
                    "My Deck.txt" to "// D\n\n60 Mountain [FRA:1]\n".toByteArray(),
                    path to ByteArray(16),
                )
            assertEquals("UNSAFE_PATH", rejection(archive).code, "path: $path")
        }
    }

    // --- §2.34, §2.35 duplicate and case-colliding paths -------------

    @Test
    fun `two entries differing only by case are refused`() {
        // Legal on Linux, ambiguous on Windows. The importer must not
        // behave differently depending on where it runs.
        val archive =
            zipOf(
                "case.zip",
                "My Deck.txt" to "// D\n\n60 Mountain [FRA:1]\n".toByteArray(),
                "real_cards/Lightning Bolt [2X2].png" to ByteArray(16),
                "real_cards/lightning bolt [2x2].png" to ByteArray(16),
            )
        assertEquals("DUPLICATE_PATH", rejection(archive).code)
    }

    // --- §2.31 compression ratio ------------------------------------

    @Test
    fun `a zip bomb is refused by its ratio, not its size`() {
        // 8 MB of zeroes compresses to a few kilobytes. Every size
        // limit in PackageLimits passes; the ratio does not.
        val archive =
            zipOf(
                "bomb.zip",
                "My Deck.txt" to "// D\n\n60 Mountain [FRA:1]\n".toByteArray(),
                "real_cards/bomb [X].png" to ByteArray(8 * 1024 * 1024),
            )
        assertTrue(
            archive.length() < 1024 * 1024,
            "the bomb should be small on disk: ${archive.length()}",
        )
        assertEquals("COMPRESSION_RATIO", rejection(archive).code)
    }

    // --- §2.32 nested archives and stray files -----------------------

    @Test
    fun `a nested archive is refused rather than extracted`() {
        val archive =
            zipOf(
                "nested.zip",
                "My Deck.txt" to "// D\n\n60 Mountain [FRA:1]\n".toByteArray(),
                "real_cards/inner.zip" to ByteArray(64),
            )
        assertEquals("UNEXPECTED_ENTRY", rejection(archive).code)
    }

    @Test
    fun `an unexpected file anywhere is refused`() {
        for (member in listOf("run.sh", "real_cards/notes.txt", "nested/deck.txt", ".env")) {
            val archive =
                zipOf(
                    "stray.zip",
                    "My Deck.txt" to "// D\n\n60 Mountain [FRA:1]\n".toByteArray(),
                    member to ByteArray(16),
                )
            assertEquals("UNEXPECTED_ENTRY", rejection(archive).code, "member: $member")
        }
    }

    // --- the decklist itself ----------------------------------------

    @Test
    fun `a package with no decklist is refused`() {
        val archive = zipOf("nolist.zip", "real_cards/Mountain [FRA].png" to ByteArray(16))
        assertEquals("NO_DECK_LIST", rejection(archive).code)
    }

    @Test
    fun `a package with two decklists is refused`() {
        // Ambiguous: importing the wrong one silently would give the
        // player a deck they did not build.
        val archive =
            zipOf(
                "twolists.zip",
                "Deck A.txt" to "// A\n\n60 Mountain [FRA:1]\n".toByteArray(),
                "Deck B.txt" to "// B\n\n60 Forest [FRA:2]\n".toByteArray(),
            )
        assertEquals("MULTIPLE_DECK_LISTS", rejection(archive).code)
    }

    @Test
    fun `an empty archive is refused`() {
        assertEquals("EMPTY_ARCHIVE", rejection(zipOf("empty.zip")).code)
    }

    @Test
    fun `too many entries is refused`() {
        val members =
            buildList {
                add("My Deck.txt" to "// D\n\n60 Mountain [FRA:1]\n".toByteArray())
                repeat(PackageLimits.MAX_ENTRIES + 1) {
                    add("real_cards/card $it [X].png" to ByteArray(8))
                }
            }
        assertEquals("TOO_MANY_ENTRIES", rejection(zipOf("many.zip", *members.toTypedArray())).code)
    }

    // --- §2.76 error safety -----------------------------------------

    @Test
    fun `rejection detail never leaks a filesystem path`() {
        // The detail goes to the client (§2.76). It may name an
        // entry INSIDE the archive, which the uploader already knows,
        // but never where the server put the upload.
        val notZip = tmp("secret-location.zip").apply { writeText("nope") }
        val detail = rejection(notZip).detail
        assertTrue(!detail.contains("build"), detail)
        assertTrue(!detail.contains(":"), detail)
    }
}
