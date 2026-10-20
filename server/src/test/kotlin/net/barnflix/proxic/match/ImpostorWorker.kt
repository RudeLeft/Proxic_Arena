package net.barnflix.proxic.match

import java.io.File
import java.util.UUID
import java.util.jar.Attributes
import java.util.jar.JarEntry
import java.util.jar.JarOutputStream
import java.util.jar.Manifest
import javax.tools.ToolProvider
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/**
 * A worker that is not Forge, for tests that need a REAL process.
 *
 * Compiled here with the JDK's own compiler and packaged as a jar the
 * server launches exactly as it launches the real one. It:
 *
 *  - writes its pid, then every line the server sends it, to the file
 *    named by its one argument (the slot where the real worker takes
 *    its resource root);
 *  - prints [greeting] as its first frame;
 *  - when START_GAME arrives, prints each of [afterStart], waiting
 *    [pauseMillis] before every one after the first: a result must
 *    not land while the start it follows is still being recorded,
 *    which real Forge -- with a game in between -- never does;
 *  - never exits on its own, even when its stdin closes -- so if it
 *    is gone, the server stopped it.
 *
 * Frames are JSON text; [frame] escapes one for the Java source.
 */
object ImpostorWorker {
    fun frame(json: String): String = json.replace("\\", "\\\\").replace("\"", "\\\"")

    fun jar(
        scratch: File,
        greeting: String,
        afterStart: List<String> = emptyList(),
        pauseMillis: Long = 0,
    ): File {
        val replies =
            afterStart.joinToString(" Thread.sleep(${pauseMillis}L); ") {
                "System.out.println(\"${frame(it)}\"); System.out.flush();"
            }
        val source =
            """
            import java.io.*;
            import java.nio.file.*;

            public class Impostor {
                public static void main(String[] args) throws Exception {
                    Writer heard = Files.newBufferedWriter(Paths.get(args[0]));
                    heard.write("pid " + ProcessHandle.current().pid() + "\n");
                    heard.flush();
                    System.out.println("Read cards: 0 files");
                    System.out.println("${frame(greeting)}");
                    System.out.flush();
                    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
                    String line;
                    while ((line = in.readLine()) != null) {
                        heard.write(line);
                        heard.write("\n");
                        heard.flush();
                        if (line.contains("START_GAME")) {
                            $replies
                            System.out.flush();
                        }
                    }
                    // stdin closed: stay anyway. Only the server may end this.
                    Thread.sleep(Long.MAX_VALUE);
                }
            }
            """.trimIndent()

        val dir = File(scratch, "impostor-${UUID.randomUUID()}").apply { mkdirs() }
        val java = File(dir, "Impostor.java").apply { writeText(source) }
        val compiler = assertNotNull(ToolProvider.getSystemJavaCompiler(), "tests need a JDK, not a JRE")
        assertEquals(0, compiler.run(null, null, null, "-d", dir.path, java.path), "the impostor did not compile")

        val manifest =
            Manifest().apply {
                mainAttributes[Attributes.Name.MANIFEST_VERSION] = "1.0"
                mainAttributes[Attributes.Name.MAIN_CLASS] = "Impostor"
            }
        val jar = File(dir, "impostor.jar")
        JarOutputStream(jar.outputStream(), manifest).use { out ->
            out.putNextEntry(JarEntry("Impostor.class"))
            out.write(File(dir, "Impostor.class").readBytes())
            out.closeEntry()
        }
        return jar
    }

    /** The impostor's pid, from the first line it wrote. */
    fun pidOf(heard: File): Long? =
        heard.takeIf { it.isFile }?.readLines()?.firstOrNull { it.startsWith("pid ") }
            ?.removePrefix("pid ")?.trim()?.toLongOrNull()

    /** Everything the server sent it, in order. */
    fun linesHeard(heard: File): List<String> {
        if (!heard.isFile) return emptyList()
        return heard.readLines().filterNot { it.startsWith("pid ") }
    }
}
