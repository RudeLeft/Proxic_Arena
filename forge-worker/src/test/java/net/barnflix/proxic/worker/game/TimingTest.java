package net.barnflix.proxic.worker.game;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** P11-D0 (test only) -- the timing marks: nothing while off, one JSON line each while on. */
class TimingTest {

    private final ByteArrayOutputStream written = new ByteArrayOutputStream();

    @AfterEach
    void off() {
        Timing.use(false, System.err);
    }

    @Test
    void offWritesNothingAndReadsNoClock() {
        Timing.use(false, new PrintStream(written, true, StandardCharsets.UTF_8));
        Timing.mark("seat", "rev", 3);
        Timing.markAt("pub", 12L, "rev", 3);
        assertEquals(0L, Timing.now());
        assertEquals("", written.toString(StandardCharsets.UTF_8));
    }

    @Test
    void onWritesOneParseableLinePerMark() {
        Timing.use(true, new PrintStream(written, true, StandardCharsets.UTF_8));
        long before = System.currentTimeMillis() * 1000L;
        Timing.mark("sent", "type", "MATCH_SNAPSHOT", "n", 4, "seat", 1, "rev", null, "ok", true);
        Timing.markAt("pub", 42L, "rev", 7L, "dur", 120L);
        String[] lines = written.toString(StandardCharsets.UTF_8).split("\\R");
        assertEquals(2, lines.length);
        for (String line : lines) {
            assertTrue(line.startsWith(Timing.PREFIX), line);
        }
        JsonObject first = JsonParser.parseString(lines[0].substring(Timing.PREFIX.length())).getAsJsonObject();
        assertEquals("sent", first.get("ev").getAsString());
        assertEquals("MATCH_SNAPSHOT", first.get("type").getAsString());
        assertEquals(4, first.get("n").getAsInt());
        assertTrue(first.get("rev").isJsonNull());
        assertTrue(first.get("ok").getAsBoolean());
        // Microseconds since the epoch, not milliseconds.
        long t = first.get("t").getAsLong();
        assertTrue(t >= before && t < before + 60_000_000L, "t=" + t);
        JsonObject second = JsonParser.parseString(lines[1].substring(Timing.PREFIX.length())).getAsJsonObject();
        assertEquals(42L, second.get("t").getAsLong());
        assertEquals(120L, second.get("dur").getAsLong());
    }

    @Test
    void quotesAndControlCharactersStayOneLine() {
        String line = Timing.line("ask", 1L, "why", "a \"quoted\"\nword\\");
        JsonObject parsed = JsonParser.parseString(line.substring(Timing.PREFIX.length())).getAsJsonObject();
        assertEquals("a \"quoted\" word\\", parsed.get("why").getAsString());
        assertTrue(!line.contains("\n"));
    }
}
