package net.barnflix.proxic.worker;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
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

    /** Forge's card database, loaded lazily on first use. */
    private static ForgeRuntime runtime;

    public static void main(String[] args) throws Exception {
        protocol = new PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.out),
                false, StandardCharsets.UTF_8);
        // See (1) above.
        System.setOut(new PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.err),
                true, StandardCharsets.UTF_8));

        File resRoot = resolveResRoot(args);
        runtime = new ForgeRuntime(resRoot);

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
            case "RESOLVE_CARDS" -> {
                // PHASE_02 2.46-2.49. The first request that needs
                // the card database pays the ~2.8 s load; a worker
                // only asked for its version never does.
                JsonObject response = frame("CARDS_RESOLVED", messageId);
                JsonArray out = new JsonArray();
                try {
                    JsonArray requested = request.getAsJsonArray("cards");
                    for (int i = 0; i < requested.size(); i++) {
                        JsonObject one = requested.get(i).getAsJsonObject();
                        String name = one.get("name").getAsString();
                        String set = one.has("set") && !one.get("set").isJsonNull()
                                ? one.get("set").getAsString() : null;
                        String number = one.has("number") && !one.get("number").isJsonNull()
                                ? one.get("number").getAsString() : null;

                        ForgeRuntime.Resolution resolution = runtime.resolve(name, set, number);
                        JsonObject item = new JsonObject();
                        item.addProperty("name", name);
                        item.addProperty("status", resolution.status);
                        if (resolution.detail != null) {
                            item.addProperty("detail", resolution.detail);
                        }
                        if (resolution.actualSet != null) {
                            item.addProperty("actualSet", resolution.actualSet);
                            item.addProperty("actualNumber", resolution.actualNumber);
                        }
                        if (resolution.category != null) {
                            item.addProperty("category", resolution.category);
                        }
                        out.add(item);
                    }
                    response.add("cards", out);
                    send(response);
                } catch (RuntimeException e) {
                    // A malformed request, or Forge failing to load,
                    // must not kill the worker: the parent is waiting
                    // on a line and would hang (1.66).
                    send(error("RESOLVE_FAILED", e.getClass().getSimpleName()));
                }
            }
            case "BUILD_DECK" -> {
                // PHASE_02 2.92-2.94: prove an imported deck becomes
                // a Forge deck, and report what FORGE sees.
                try {
                    JsonArray requested = request.getAsJsonArray("cards");
                    java.util.List<ForgeRuntime.DeckRequest> entries = new java.util.ArrayList<>();
                    for (int i = 0; i < requested.size(); i++) {
                        JsonObject one = requested.get(i).getAsJsonObject();
                        entries.add(new ForgeRuntime.DeckRequest(
                                one.get("name").getAsString(),
                                one.has("set") && !one.get("set").isJsonNull()
                                        ? one.get("set").getAsString() : null,
                                one.has("number") && !one.get("number").isJsonNull()
                                        ? one.get("number").getAsString() : null,
                                one.get("quantity").getAsInt()));
                    }

                    ForgeRuntime.DeckBuild built = runtime.buildDeck(entries);
                    JsonObject response = frame("DECK_BUILT", messageId);
                    response.addProperty("totalCards", built.totalCards);
                    JsonObject counts = new JsonObject();
                    built.countsByName.forEach(counts::addProperty);
                    response.add("countsByName", counts);
                    JsonArray unresolved = new JsonArray();
                    built.unresolved.forEach(unresolved::add);
                    response.add("unresolved", unresolved);
                    send(response);
                } catch (RuntimeException e) {
                    send(error("BUILD_FAILED", e.getClass().getSimpleName()));
                }
            }
            case "START_GAME" -> {
                // PHASE_06 §6.17, §6.20 — LAUNCHING to RUNNING.
                //
                // The answer is sent only once the game has reached
                // its first priority window. A worker that replied
                // as soon as the game was CONSTRUCTED would report
                // RUNNING for a game that throws during its first
                // upkeep, which is the §6.17 distinction between
                // LAUNCHING and RUNNING made meaningless.
                try {
                    JsonArray players = request.getAsJsonArray("players");
                    java.util.List<net.barnflix.proxic.worker.game.GameHost.Seat> seats =
                            new java.util.ArrayList<>();
                    JsonArray unresolvedAll = new JsonArray();

                    for (int i = 0; i < players.size(); i++) {
                        JsonObject seat = players.get(i).getAsJsonObject();
                        java.util.List<ForgeRuntime.DeckRequest> entries =
                                new java.util.ArrayList<>();
                        JsonArray cards = seat.getAsJsonArray("cards");
                        for (int c = 0; c < cards.size(); c++) {
                            JsonObject one = cards.get(c).getAsJsonObject();
                            entries.add(new ForgeRuntime.DeckRequest(
                                    one.get("name").getAsString(),
                                    one.has("set") && !one.get("set").isJsonNull()
                                            ? one.get("set").getAsString() : null,
                                    one.has("number") && !one.get("number").isJsonNull()
                                            ? one.get("number").getAsString() : null,
                                    one.get("quantity").getAsInt()));
                        }
                        String name = seat.get("displayName").getAsString();
                        // §6.36 — the SERVER's seat number travels
                        // with the seat. Falling back to the array
                        // index keeps an older server working, but
                        // an explicit number is what the protocol
                        // routes on: display names are not unique.
                        int seatNumber = seat.has("seatNumber")
                                ? seat.get("seatNumber").getAsInt() : i + 1;
                        ForgeRuntime.BuiltDeck built =
                                runtime.buildDeckObject(entries, name + "'s deck");
                        built.unresolved.forEach(unresolvedAll::add);
                        seats.add(new net.barnflix.proxic.worker.game.GameHost.Seat(
                                name, seatNumber, built.deck));
                    }

                    // A deck Forge could not fully build is not a
                    // deck to start a match with. Phase 5's
                    // preflight should have caught this; if it
                    // reaches here, something changed in between
                    // and starting anyway would be playing a game
                    // with cards missing.
                    if (unresolvedAll.size() > 0) {
                        JsonObject failed = error("DECK_UNRESOLVED", "cards did not resolve");
                        failed.add("unresolved", unresolvedAll);
                        send(failed);
                        break;
                    }

                    GAME = new net.barnflix.proxic.worker.game.GameHost();
                    // §6.99 — a decision becomes a frame. Sent from
                    // Forge's own thread, inside the blocked call,
                    // so this writes and returns rather than waiting
                    // for anything.
                    GAME.onDecision((pending, labels) -> {
                        JsonObject ask = frame("DECISION_REQUEST", null);
                        ask.addProperty("decisionId", pending.decisionId());
                        // §6.38 — BOTH seats. The server needs the
                        // second one to decide whose connection may
                        // answer, and must not infer it from the
                        // first (§6.37).
                        ask.addProperty("actedForSeat", pending.actedForSeat());
                        ask.addProperty("authorisedSeat", pending.authorisedSeat());
                        ask.addProperty("kind", pending.kind());
                        ask.addProperty("stateVersion", pending.stateVersion());
                        // §6.70 — which game of the match this question is in.
                        ask.addProperty("gameEpoch", GAME.epoch());
                        // Some decisions have no "no" -- discarding
                        // to hand size is the plain case. The client
                        // must not offer a Pass the gate will refuse.
                        ask.addProperty("mandatory", pending.mandatory());
                        // Forge's own wording, when it has any.
                        if (pending.prompt() != null && !pending.prompt().isBlank()) {
                            ask.addProperty("prompt", pending.prompt());
                        }
                        JsonArray options = new JsonArray();
                        if (pending.searchable()) {
                            // Too many to send (naming any card is
                            // ~30,000). The player searches them with
                            // DECISION_SEARCH; the gate holds them all.
                            ask.addProperty("searchable", true);
                            ask.addProperty("optionCount", pending.options().size());
                            ask.add("options", options);
                            send(ask);
                            return;
                        }
                        for (String id : pending.options()) {
                            JsonObject option = new JsonObject();
                            option.addProperty("actionId", id);
                            option.addProperty("label", labels.get(id));
                            // §7.61 B5 -- what this option is about.
                            String object = GAME.objectIdOf(id);
                            if (object != null) {
                                option.addProperty("objectId", object);
                            }
                            // §7.61 B8 -- present only when Forge says it
                            // cannot be paid now (dimmed, still choosable).
                            if (!GAME.payable(id)) {
                                option.addProperty("payable", false);
                            }
                            options.add(option);
                        }
                        ask.add("options", options);
                        send(ask);
                    });
                    // §6.40 — one snapshot per viewer, and the
                    // seat it is for is on the frame. The server
                    // routes it to that seat and nobody else.
                    GAME.onSnapshot((seat, snapshot) -> {
                        JsonObject frame = frame("MATCH_SNAPSHOT", null);
                        frame.addProperty("seat", seat);
                        frame.add("state", snapshot);
                        send(frame);
                    });
                    // §6.151 — the ending is ANNOUNCED, not polled.
                    // The server has a sequence to run when a game
                    // finishes (persist the result, give the room
                    // back, shut the worker down) and it cannot run
                    // any of it if it has to ask.
                    GAME.onEnded(result -> {
                        JsonObject ended = frame("GAME_ENDED", null);
                        ended.addProperty("outcome", result.kind());
                        // §6.149 — a SEAT. Forge names the winning
                        // player, and a display name is not an
                        // identity.
                        if ("WINNER".equals(result.kind())) {
                            ended.addProperty("winningSeat", result.winningSeat());
                        }
                        ended.addProperty("turn", result.turn());
                        addCounters(ended);
                        // §6.105, §6.106 — the evidence travels
                        // with the ending. Safe text only: a
                        // method name and a message, never a
                        // stack trace or game state.
                        if (result.detail() != null) {
                            ended.addProperty("detail", result.detail());
                        }
                        // P6-AP — Forge's own words for why it ended.
                        if (result.reason() != null) {
                            ended.addProperty("reason", result.reason());
                        }
                        // §7.55 — the seat that conceded, from Forge.
                        if (result.concededSeat() > 0) {
                            ended.addProperty("concededSeat", result.concededSeat());
                        }
                        send(ended);
                    });
                    GAME.start(seats, request.has("matchId")
                            ? request.get("matchId").getAsString() : "match");

                    // WAITED FOR ON ANOTHER THREAD, and that is not
                    // tidiness. This method runs on the only thread
                    // that reads stdin, so waiting here stops the
                    // worker answering anything until the game is
                    // RUNNING -- and RUNNING means the first
                    // priority window, which is AFTER the mulligans.
                    //
                    // A pregame question therefore deadlocked the
                    // match outright: the game thread blocked on an
                    // answer, and the only thread that could read
                    // that answer was blocked waiting for the game.
                    // Nothing in the logs, no exception, just 120
                    // seconds of silence and GAME_START_FAILED. It
                    // went unnoticed because no decision was ever
                    // raised before the first priority window until
                    // mulligans became real decisions.
                    final String startId = messageId;
                    Thread announce = new Thread(() -> {
                        try {
                            // §6.29: "Human gameplay decisions do not use
                            // this startup timeout." The budget is FORGE's
                            // time: it runs only while nobody is being
                            // asked anything. A player thinking over a
                            // mulligan for three minutes is a player, not a
                            // hung start -- and counting it once failed a
                            // real match mid-mulligan (CI, Delver spec,
                            // 2026-10-20). Configurable for tests.
                            long budget = java.util.concurrent.TimeUnit.SECONDS.toNanos(
                                    Long.getLong("proxic.startBudgetSeconds", 120L));
                            long last = System.nanoTime();
                            boolean running;
                            while (!(running = GAME.awaitRunning(250,
                                    java.util.concurrent.TimeUnit.MILLISECONDS))) {
                                if (GAME.failure() != null) {
                                    break;
                                }
                                long now = System.nanoTime();
                                if (GAME.gate().pending() == null) {
                                    budget -= now - last;
                                }
                                last = now;
                                if (budget <= 0) {
                                    break;
                                }
                            }
                            if (!running) {
                                Throwable failure = GAME.failure();
                                send(error("GAME_START_FAILED", failure == null
                                        ? "no priority window within the start budget"
                                        : failure.getClass().getSimpleName()));
                                return;
                            }
                            JsonObject started = frame("GAME_STARTED", startId);
                            started.addProperty("turn", GAME.turn());
                            send(started);
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                        }
                    }, "proxic-started");
                    announce.setDaemon(true);
                    announce.start();
                } catch (RuntimeException e) {
                    send(error("GAME_START_FAILED", e.getClass().getSimpleName()));
                }
            }
            case "DECISION_RESPONSE" -> {
                // §6.101-§6.104 — every check happens in the gate,
                // BEFORE the value can reach the blocked waiter. A
                // late or duplicated answer that slipped through
                // would not be ignored; it would become the answer
                // to whatever Forge asks next.
                if (GAME == null) {
                    send(error("NO_GAME", "no game has been started"));
                    break;
                }
                net.barnflix.proxic.worker.game.DecisionGate.Response answer =
                        new net.barnflix.proxic.worker.game.DecisionGate.Response(
                                request.get("decisionId").getAsLong(),
                                request.get("seat").getAsInt(),
                                request.get("stateVersion").getAsLong(),
                                request.has("actionId") && !request.get("actionId").isJsonNull()
                                        ? request.get("actionId").getAsString() : null);

                net.barnflix.proxic.worker.game.DecisionGate.Reject refused =
                        GAME.gate().submit(answer);
                if (refused == null) {
                    JsonObject ok = frame("DECISION_ACCEPTED", messageId);
                    ok.addProperty("decisionId", answer.decisionId());
                    send(ok);
                } else {
                    JsonObject no = error("DECISION_REFUSED", refused.name());
                    no.addProperty("decisionId", answer.decisionId());
                    send(no);
                }
            }
            case "DECISION_SEARCH" -> {
                // P6-AG — search a question's options rather than
                // send them all. NOT an answer: it changes nothing in
                // the game and the gate is not touched. `seat` is the
                // server's, resolved from the authenticated user.
                if (GAME == null) {
                    send(error("NO_GAME", "no game has been started"));
                    break;
                }
                long decisionId = request.get("decisionId").getAsLong();
                net.barnflix.proxic.worker.game.GameHost.Found found =
                        GAME.search(decisionId, request.get("seat").getAsInt(),
                                request.has("query") ? request.get("query").getAsString() : "");
                if (found == null) {
                    JsonObject no = error("SEARCH_REFUSED", "not the searchable question outstanding");
                    no.addProperty("decisionId", decisionId);
                    send(no);
                    break;
                }
                JsonObject reply = frame("DECISION_OPTIONS", messageId);
                reply.addProperty("decisionId", decisionId);
                reply.addProperty("seat", request.get("seat").getAsInt());
                reply.addProperty("query", request.has("query") ? request.get("query").getAsString() : "");
                reply.addProperty("total", found.total());
                JsonArray options = new JsonArray();
                found.options().forEach((id, label) -> {
                    JsonObject option = new JsonObject();
                    option.addProperty("actionId", id);
                    option.addProperty("label", label);
                    options.add(option);
                });
                reply.add("options", options);
                send(reply);
            }
            case "CONCEDE" -> {
                // PHASE_07 §7.55 — `seat` is the server's, resolved
                // from the authenticated user. Forge's concession;
                // the game then ends through GAME_ENDED as any other.
                if (GAME == null) {
                    send(error("NO_GAME", "no game has been started"));
                    break;
                }
                int seat = request.get("seat").getAsInt();
                String refused = GAME.concede(seat);
                if (refused == null) {
                    JsonObject ok = frame("CONCEDE_ACCEPTED", messageId);
                    ok.addProperty("seat", seat);
                    send(ok);
                } else {
                    JsonObject no = error("CONCEDE_REFUSED", refused);
                    no.addProperty("seat", seat);
                    send(no);
                }
            }
            case "GAME_RESULT" -> {
                // Diagnostics for this slice: wait for the game to
                // finish and report what FORGE said (§6.149). Both
                // seats pass priority until a decision protocol
                // exists, so a game ends by decking -- a weak game
                // and a strong proof that Forge ran it.
                try {
                    if (GAME == null) {
                        send(error("NO_GAME", "no game has been started"));
                        break;
                    }
                    int seconds = request.has("timeoutSeconds")
                            ? request.get("timeoutSeconds").getAsInt() : 300;
                    boolean finished =
                            GAME.awaitFinished(seconds, java.util.concurrent.TimeUnit.SECONDS);
                    JsonObject result = frame("GAME_RESULT", messageId);
                    result.addProperty("finished", finished);
                    result.addProperty("turn", GAME.turn());
                    result.addProperty("outcome",
                            GAME.outcome() == null ? "none" : GAME.outcome());
                    if (GAME.failure() != null) {
                        result.addProperty("failure", GAME.failure().getClass().getSimpleName());
                    }
                    // Same counters as the ending carries, because a
                    // game that has NOT ended is exactly when they
                    // are wanted: a survey asks "what has been
                    // reached so far" without needing somebody to
                    // win first. `timeoutSeconds: 0` makes this an
                    // immediate read rather than a wait.
                    addCounters(result);
                    send(result);
                } catch (InterruptedException e) {
                    send(error("GAME_RESULT_FAILED", "interrupted"));
                }
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

    /**
     * The game this worker is running, if any.
     *
     * One per process, because Phase 0A chose one JVM per match and
     * nothing here should quietly make that untrue.
     */
    private static net.barnflix.proxic.worker.game.GameHost GAME;

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

    /**
     * Write one frame.
     *
     * SYNCHRONIZED since Phase 6: the game runs on its own thread
     * and publishes DECISION_REQUEST from inside Forge's blocked
     * call, while the main thread answers commands. Two unguarded
     * writers on one stdout interleave, and half a JSON object
     * followed by half another is not a frame anybody can parse —
     * it would look like a protocol bug on the server.
     */
    private static synchronized void send(JsonObject frame) {
        protocol.print(GSON.toJson(frame));
        protocol.print('\n');
        // See (2) above. Without this the parent can wait forever for
        // a line that was written and never left the buffer.
        protocol.flush();
    }

    /**
     * What this run has been ASKED FOR — §6.105, §6.106.
     *
     * Three counts, and the difference between them is the point.
     * `asked` is every decision the adapter ANSWERED: evidence of
     * what works. `stubsReached` and `costsReached` are decision
     * kinds the adapter does NOT implement. On a normal run those
     * two are empty, because reaching one throws and the match
     * fails loudly with the method name.
     *
     * Under -Dproxic.survey=true they are the whole point: nothing
     * throws, the run continues past the first wall, and what comes
     * back is a measured list of what is still missing instead of
     * the one thing that happened to come first. A surveyed run's
     * GAME RESULT IS MEANINGLESS — returning a default to the engine
     * is not answering it — so this sizes remaining work and proves
     * nothing about correctness.
     */
    private static void addCounters(JsonObject frame) {
        JsonObject stubs = new JsonObject();
        net.barnflix.proxic.worker.game.GeneratedControllerBase.REACHED_STUBS
                .forEach(stubs::addProperty);
        frame.add("stubsReached", stubs);
        JsonObject costs = new JsonObject();
        net.barnflix.proxic.worker.game.GeneratedCostDecisionBase.REACHED_COSTS
                .forEach(costs::addProperty);
        frame.add("costsReached", costs);
        JsonObject asked = new JsonObject();
        if (GAME != null) {
            GAME.decisionCounts().forEach(asked::addProperty);
        }
        frame.add("asked", asked);
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
