package net.barnflix.proxic.worker;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * The Forge worker process — PHASE_01 §1.63–§1.67.
 *
 * Phase 1 scope only (§1.64): bootstrap verification, version
 * reporting, startup, shutdown, a health handshake, and resource
 * availability. No gameplay is exposed. The real game protocol is
 * Phase 6's to specify, and this deliberately does not pre-empt it.
 *
 * TRANSPORT: line-delimited JSON on stdin/stdout, one object per
 * line. Chosen because it is the simplest thing a parent process can
 * supervise, and because Phase 0A proved process isolation is what
 * protects the server: one worker killed mid-run left the others
 * untouched.
 *
 * Two Phase 0A lessons are implemented here rather than rediscovered:
 *
 * 1. FORGE PRINTS TO STDOUT. Anything Forge or a dependency logs
 *    would land in the middle of the protocol stream and corrupt it.
 *    The original stdout is captured for protocol use and
 *    {@code System.out} is then pointed at stderr, so stray output is
 *    merely noisy instead of fatal.
 *
 * 2. STDOUT IS BLOCK-BUFFERED when it is a pipe, and an abrupt exit
 *    discards whatever is buffered. In Phase 0A a watchdog's entire
 *    report vanished this way, which looked identical to the watchdog
 *    never running. Every protocol line is flushed explicitly, and
 *    shutdown never uses {@code Runtime.halt()}.
 */
public final class WorkerMain {

    private static final Gson GSON = new Gson();

    /** The real stdout, reserved for protocol frames. */
    private static PrintStream protocol;

    public static void main(String[] args) throws Exception {
        protocol = new PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.out),
                false, StandardCharsets.UTF_8);
        // See (1) above.
        System.setOut(new PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.err),
                true, StandardCharsets.UTF_8));

        File resRoot = resolveResRoot(args);

        // Announced unprompted, so a parent that spawns the worker
        // learns what it got without having to ask first (§1.65).
        sendReady(resRoot);

        BufferedReader in = new BufferedReader(
                new InputStreamReader(System.in, StandardCharsets.UTF_8));
        String line;
        while ((line = in.readLine()) != null) {
            if (line.isBlank()) {
                continue;
            }
            if (!handle(line, resRoot)) {
                break;
            }
        }
        // Clean shutdown (§1.64): fall off the end of main so the JVM
        // exits normally and buffers flush.
        protocol.flush();
    }

    /**
     * @return false when the worker should stop.
     */
    private static boolean handle(String line, File resRoot) {
        JsonObject request;
        try {
            request = JsonParser.parseString(line).getAsJsonObject();
        } catch (RuntimeException e) {
            send(error("MALFORMED_MESSAGE", "not a JSON object"));
            return true;
        }

        String type = request.has("type") ? request.get("type").getAsString() : "";
        String messageId = request.has("messageId") ? request.get("messageId").getAsString() : null;

        switch (type) {
            case "PING" -> {
                JsonObject pong = frame("PONG", messageId);
                send(pong);
            }
            case "VERSION" -> sendReady(resRoot);
            case "VERIFY_RESOURCES" -> {
                JsonObject response = frame("RESOURCES", messageId);
                JsonObject checks = new JsonObject();
                for (Map.Entry<String, String> entry
                        : new ForgeResources(resRoot).inspect().entrySet()) {
                    checks.addProperty(entry.getKey(), entry.getValue());
                }
                response.add("checks", checks);
                response.addProperty("usable", new ForgeResources(resRoot).usable());
                send(response);
            }
            case "SHUTDOWN" -> {
                send(frame("SHUTTING_DOWN", messageId));
                return false;
            }
            default -> send(error("UNKNOWN_TYPE", type));
        }
        return true;
    }

    private static void sendReady(File resRoot) {
        JsonObject ready = frame("WORKER_READY", null);
        ready.addProperty("forgeCommit", WorkerInfo.forgeCommit());
        ready.addProperty("forgeRelease", WorkerInfo.forgeRelease());
        ready.addProperty("workerVersion", WorkerInfo.workerVersion());
        ready.addProperty("javaVersion", System.getProperty("java.version"));
        ready.addProperty("pid", ProcessHandle.current().pid());

        ForgeResources resources = new ForgeResources(resRoot);
        ready.addProperty("resourcesUsable", resources.usable());
        if (!resources.usable()) {
            // Named, not just flagged: "resources missing" without
            // WHICH one is a support ticket rather than an answer.
            ready.addProperty("resourceProblems", String.join(",", resources.problems()));
        }
        send(ready);
    }

    private static JsonObject frame(String type, String correlatesTo) {
        JsonObject frame = new JsonObject();
        frame.addProperty("protocolVersion", WorkerInfo.protocolVersion());
        frame.addProperty("type", type);
        if (correlatesTo != null) {
            frame.addProperty("messageId", correlatesTo);
        }
        return frame;
    }

    private static JsonObject error(String code, String detail) {
        JsonObject frame = frame("ERROR", null);
        frame.addProperty("errorCode", code);
        frame.addProperty("detail", detail);
        return frame;
    }

    private static void send(JsonObject frame) {
        protocol.print(GSON.toJson(frame));
        protocol.print('\n');
        // See (2) above. Without this the parent can wait forever for
        // a line that was written and never left the buffer.
        protocol.flush();
    }

    /**
     * Forge's resource root: the first argument, else PROXIC_FORGE_RES.
     * Absent rather than guessed — a default pointing at a directory
     * that happens to exist would report healthy nonsense.
     */
    private static File resolveResRoot(String[] args) {
        if (args.length > 0 && !args[0].isBlank()) {
            return new File(args[0]);
        }
        String env = System.getenv("PROXIC_FORGE_RES");
        return (env == null || env.isBlank()) ? null : new File(env);
    }
}
