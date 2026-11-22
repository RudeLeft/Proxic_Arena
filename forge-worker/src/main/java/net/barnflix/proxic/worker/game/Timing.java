package net.barnflix.proxic.worker.game;

import java.io.PrintStream;
import java.time.Instant;

/**
 * TEST ONLY -- Phase 11 P11-D0, "where the time goes, end to end".
 *
 * Timing marks on the worker's side of one moment: an answer read
 * ({@code rx}), taken by the gate ({@code gate}), Forge's thread waking
 * with it ({@code wake}), each board round ({@code pub}) and each seat's
 * board in it ({@code seat}: Forge's per-viewer view, the history added,
 * the hidden ids removed, the frame written), a question built
 * ({@code ask}) and every frame written ({@code sent}, with its ordinal
 * among frames of its type, which the server's own marks count the same
 * way: the pipe keeps the order). The kit's timeline measure
 * (frontend/tools/measure/timeline.spec.ts) reads them back.
 *
 * Off unless the environment says {@code PROXIC_TEST_TIMING=true}, which
 * only docker-compose.local.yml sets (the worker inherits the server's
 * environment; scripts/check-test-switch.py keeps it out of production).
 * Off, every call is a test of one boolean: nothing is written and
 * nothing a player sees or is sent changes. On, each mark is one line on
 * stderr (the match's worker log, MatchWorker's stderrTarget):
 *
 * <pre>proxic-timing {"ev":"seat","t":1732200000123456,"rev":41,"seat":1,...}</pre>
 *
 * Times are microseconds since the epoch (the container's clock, which
 * the server's marks share); durations are microseconds.
 */
public final class Timing {

    /** The switch: the environment variable, "true" to turn the marks on. */
    public static final String ENV = "PROXIC_TEST_TIMING";

    /** Every mark's line starts with this. */
    public static final String PREFIX = "proxic-timing ";

    private static volatile boolean on = "true".equalsIgnoreCase(System.getenv(ENV));

    private static volatile PrintStream out = System.err;

    private Timing() {
    }

    /** Whether marks are being written. */
    public static boolean on() {
        return on;
    }

    /** For tests: turn the marks on or off, writing to [to]. */
    static void use(boolean enabled, PrintStream to) {
        on = enabled;
        out = to;
    }

    /** Now, in microseconds since the epoch; 0 while off (so a guarded start costs nothing). */
    public static long now() {
        if (!on) {
            return 0L;
        }
        Instant instant = Instant.now();
        return instant.getEpochSecond() * 1_000_000L + instant.getNano() / 1_000L;
    }

    /** A mark at this moment: [fields] are name, value pairs (numbers or plain strings). */
    public static void mark(String event, Object... fields) {
        if (!on) {
            return;
        }
        markAt(event, now(), fields);
    }

    /** A mark at [t] (microseconds since the epoch). */
    public static void markAt(String event, long t, Object... fields) {
        if (!on) {
            return;
        }
        out.println(line(event, t, fields));
    }

    /** One mark's line, without writing it. */
    static String line(String event, long t, Object... fields) {
        StringBuilder s = new StringBuilder(PREFIX.length() + 48 + fields.length * 12);
        s.append(PREFIX).append("{\"ev\":");
        quote(s, event);
        s.append(",\"t\":").append(t);
        for (int i = 0; i + 1 < fields.length; i += 2) {
            s.append(',');
            quote(s, String.valueOf(fields[i]));
            s.append(':');
            Object value = fields[i + 1];
            if (value == null) {
                s.append("null");
            } else if (value instanceof Number || value instanceof Boolean) {
                s.append(value);
            } else {
                quote(s, value.toString());
            }
        }
        return s.append('}').toString();
    }

    private static void quote(StringBuilder s, String text) {
        s.append('"');
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '"' || c == '\\') {
                s.append('\\').append(c);
            } else if (c < 0x20) {
                s.append(' ');
            } else {
                s.append(c);
            }
        }
        s.append('"');
    }
}
