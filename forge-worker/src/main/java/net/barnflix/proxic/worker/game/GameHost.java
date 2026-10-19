package net.barnflix.proxic.worker.game;

import forge.LobbyPlayer;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameRules;
import forge.game.GameType;
import forge.game.Match;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * One Forge game, inside one worker — PHASE_06 §6.17, §6.20.
 *
 * `Match.startGame` BLOCKS for the whole game. It does not return
 * until somebody has won, and every decision in between is a call
 * back into a PlayerController on that same thread. So the game
 * gets a thread of its own and this class is the handle onto it.
 *
 * That single fact shapes the rest of Phase 6: a decision is not a
 * message the engine sends and forgets, it is a blocked call stack
 * waiting for an answer. Phase 0A's binding constraints — reject a
 * response BEFORE it reaches the waiter, keep both duplicate
 * defences — are about this stack.
 *
 * §6.17's statuses map onto what this exposes:
 *
 *   LAUNCHING        constructed, not yet past mulligans
 *   RUNNING          a seat has been offered priority
 *   ENDED            startGame returned and Forge reported an outcome
 *   FAILED_RUNTIME   startGame threw
 */
public final class GameHost {
    private final CountDownLatch running = new CountDownLatch(1);
    private final CountDownLatch finished = new CountDownLatch(1);
    private final AtomicReference<String> outcome = new AtomicReference<>();
    private final AtomicReference<Throwable> failure = new AtomicReference<>();

    private volatile Game game;
    private volatile Thread gameThread;

    /**
     * How a game ending leaves this class.
     *
     * Unprompted, because §6.151 is a sequence the SERVER has to
     * run -- persist the result, release the room, shut the worker
     * down -- and it cannot run any of it if it only learns the
     * game ended by asking. The first version had the result
     * available on request and nothing ever requested it, so a
     * finished game sat claiming to be running.
     */
    private volatile java.util.function.Consumer<Result> endSink = result -> { };

    public void onEnded(java.util.function.Consumer<Result> sink) {
        this.endSink = sink;
    }

    /**
     * What Forge said, as seats — §6.149.
     *
     * A SEAT, not a name. Forge identifies the winner by its
     * player's name, which in Arena is a display name and is not
     * unique; "winner: Pat" is not an answer when both players are
     * called Pat. `kind` is WINNER, DRAW, NONE or FAILED, and
     * nothing here is inferred from life totals or a dropped
     * connection.
     */
    public record Result(String kind, int winningSeat, int turn, String detail) {}

    /** §6.36's chain, the worker's link: Forge lobby player → seat. */
    private final java.util.Map<LobbyPlayer, Integer> seatOf =
            java.util.Collections.synchronizedMap(new java.util.IdentityHashMap<>());

    /**
     * Which seat a Forge player belongs to.
     *
     * -1 for anything this host did not seat, which is a loud
     * wrong answer rather than a plausible one: seat 0 would be
     * indistinguishable from the first real seat.
     */
    int seatOf(LobbyPlayer lobbyPlayer) {
        Integer seat = seatOf.get(lobbyPlayer);
        return seat == null ? -1 : seat;
    }

    /**
     * Construct the game and start it on its own thread.
     *
     * Returns as soon as the thread is started, NOT when the game
     * is running: the caller waits on {@link #awaitRunning} for
     * that. Conflating the two would report RUNNING for a game that
     * threw during its first upkeep.
     */
    public void start(List<Seat> seats, String matchName) {
        // A reached stub must fail THIS match, whatever Forge does
        // with the exception. Set per start, so the host that is
        // actually playing is the one that hears about it.
        GeneratedControllerBase.onStubReached(this::failUnsupported);

        List<RegisteredPlayer> registered = new ArrayList<>();
        for (Seat seat : seats) {
            LobbyPlayer lobby = new WorkerLobbyPlayer(seat.displayName, seat.seatNumber, this);
            // Identity, not equality. Two seats may carry the same
            // display name -- Arena only makes usernames unique --
            // and a map keyed on the name would collapse them into
            // one seat, which is how an answer reaches the wrong
            // player.
            seatOf.put(lobby, seat.seatNumber);
            registered.add(new RegisteredPlayer(seat.deck).setPlayer(lobby));
        }

        // §0.22's construction graph, as Phase 0A proved it.
        // GameType.Constructed because Open Format IS constructed
        // as far as Forge is concerned — the bounds Open Format adds
        // are Proxic's and were already enforced at import and at
        // preparation (FMT-002).
        GameRules rules = new GameRules(GameType.Constructed);
        rules.setGamesPerMatch(1);
        Match match = new Match(rules, registered, matchName);
        Game created = match.createGame();
        this.game = created;

        // NOTHING installs controllers here, deliberately. Forge
        // builds its own Player objects during createGame through
        // the IGameEntitiesFactory on each LobbyPlayer, so that is
        // where the controller goes. A loop over getPlayers() after
        // the fact looks equivalent, runs after Forge has already
        // decided what each player is, and silently misses
        // createMindSlaveController.

        Thread thread =
                new Thread(
                        () -> {
                            try {
                                match.startGame(created, null);
                                outcome.set(describeOutcome(created));
                            } catch (Throwable t) {
                                recordCrash(t);
                            } finally {
                                // Both latches, always. A game that
                                // threw during mulligans would
                                // otherwise leave a caller waiting
                                // on `running` forever, and "it
                                // hung" is the least useful failure
                                // a runtime can produce.
                                running.countDown();
                                finished.countDown();
                                // After the latches, so anything
                                // waiting on them is already free:
                                // the sink writes to a pipe and a
                                // slow reader must not hold them.
                                publishEnd(created);
                            }
                        },
                        "proxic-game-" + matchName);
        thread.setDaemon(true);
        this.gameThread = thread;
        thread.start();
    }

    private final java.util.Set<String> unsupported =
            java.util.Collections.synchronizedSet(new java.util.LinkedHashSet<>());

    /**
     * §6.189 — the game is spinning rather than progressing.
     *
     * Recorded as a failure before the controller throws, so the
     * reason survives: a bare exception out of the game thread
     * says "IllegalStateException" and nothing about why.
     */
    void failRunaway(String detail) {
        failure.compareAndSet(null, new IllegalStateException(detail));
    }

    /**
     * §6.105, §6.106 — Forge asked for an interaction this
     * adapter cannot represent.
     *
     * Recorded rather than relied upon to propagate. The adapter
     * throws as well, but Forge's effect and trigger code catches
     * exceptions in places this project does not control, and when
     * it does the game plays on with that rule silently skipped.
     * `publishEnd` reads this BEFORE the winner, so such a game is
     * reported FAILED with the method name instead of as a win.
     *
     * It does not stop the game where it stands: the remaining
     * decisions are still asked and answered, and the match fails
     * when the game thread finishes. Interrupting mid-effect would
     * unwind Forge from inside its own resolution, and a controller
     * that then threw at every subsequent decision is the §6.189
     * spin this project measures rather than invites.
     */
    /**
     * The game thread died — §6.15, §6.162.
     *
     * A crashed game is a reported result, never a silent hang.
     *
     * FIRST recorded reason wins, and a method rather than two
     * lines inside the thread's lambda so a test can reach it. A
     * plain `set` here would overwrite the reason the adapter took
     * care to record before throwing, which is the whole point of
     * failRunaway and failUnsupported: "mana payment made no
     * progress in 8 choices" and "Forge asked for
     * chooseCounterType" say why, and whatever exception surfaces
     * next out of Forge usually does not.
     */
    void recordCrash(Throwable t) {
        failure.compareAndSet(null, t);
    }

    void failUnsupported(String method) {
        failure.compareAndSet(null, new UnsupportedOperationException(
                "Forge asked for " + method + ", which this adapter does not implement"));
    }

    /**
     * What Forge TOLD a player — P6-AM, §6.131.
     *
     * A coin flip and a die roll are Forge's to make, not a
     * player's to choose, so the only thing the protocol owes is
     * showing the result. Forge announces it through
     * notifyOfValue, which was a no-op here: the game acted on a
     * flip the player never saw.
     *
     * Per SEAT, because a controller belongs to one player and
     * what it is told may be private — "you looked at X" is a
     * notice for exactly one person. Keyed that way, a notice
     * cannot reach anybody else by accident.
     *
     * Bounded, because a long game would otherwise carry a
     * transcript in every snapshot.
     */
    private final java.util.Map<Integer, java.util.Deque<String>> notices =
            new java.util.concurrent.ConcurrentHashMap<>();

    private static final int NOTICES_KEPT = 6;

    void note(int seat, String text) {
        if (text == null || text.isBlank()) {
            return;
        }
        java.util.Deque<String> queue =
                notices.computeIfAbsent(seat, key -> new java.util.ArrayDeque<>());
        synchronized (queue) {
            queue.addLast(text);
            while (queue.size() > NOTICES_KEPT) {
                queue.removeFirst();
            }
        }
    }

    java.util.List<String> noticesFor(int seat) {
        java.util.Deque<String> queue = notices.get(seat);
        if (queue == null) {
            return java.util.List.of();
        }
        synchronized (queue) {
            return new java.util.ArrayList<>(queue);
        }
    }

    /** §6.96 — a card Forge itself says it cannot play. */
    void noteUnsupported(String cardName) {
        unsupported.add(cardName);
    }

    public java.util.List<String> unsupportedCards() {
        synchronized (unsupported) {
            return new ArrayList<>(unsupported);
        }
    }

    private final DecisionGate gate = new DecisionGate();

    /** Where a published decision goes. Set by the worker's protocol. */
    private volatile java.util.function.BiConsumer<DecisionGate.Pending,
            java.util.Map<String, String>> publisher = (pending, labels) -> { };

    public DecisionGate gate() {
        return gate;
    }

    public void onDecision(
            java.util.function.BiConsumer<DecisionGate.Pending,
                    java.util.Map<String, String>> sink) {
        this.publisher = sink;
    }

    /**
     * §6.48 — the client is told about a decision it can act on.
     *
     * Called from Forge's thread, INSIDE the blocked call. Whatever
     * the publisher does must not block for long, or the game
     * thread is held by the transport rather than by the player.
     */
    /**
     * §6.189 — how many of each KIND have been asked.
     *
     * The section is explicit that this instrumentation is what
     * localised a measured infinite loop: "Only the ratio between
     * decision counts localised it -- chooseTargetsFor at 679,963
     * against payManaCost at 2." No error, no stub, no log line;
     * just two numbers that did not belong together.
     */
    private final java.util.Map<String, Integer> decisionCounts =
            java.util.Collections.synchronizedMap(new java.util.LinkedHashMap<>());

    /**
     * §6.189 — "count what is declined rather than dropping it
     * silently."
     *
     * An action that was offered, chosen, and achieved nothing.
     * A handful is ordinary; thousands is the runaway that
     * section was written about.
     */
    private final java.util.concurrent.atomic.AtomicInteger declinedActions =
            new java.util.concurrent.atomic.AtomicInteger();

    void noteDeclinedAction() {
        declinedActions.incrementAndGet();
    }

    public int declinedActions() {
        return declinedActions.get();
    }

    public java.util.Map<String, Integer> decisionCounts() {
        synchronized (decisionCounts) {
            return new java.util.LinkedHashMap<>(decisionCounts);
        }
    }

    /** Where a per-viewer snapshot goes. Set by the worker's protocol. */
    private volatile java.util.function.BiConsumer<Integer, com.google.gson.JsonObject>
            snapshotSink = (seat, snapshot) -> { };

    public void onSnapshot(
            java.util.function.BiConsumer<Integer, com.google.gson.JsonObject> sink) {
        this.snapshotSink = sink;
    }

    /**
     * §6.48 — STATE FIRST, THEN THE QUESTION.
     *
     * "A client must not receive an interaction referencing an
     * object it cannot identify from current state." A decision
     * names objects by id; if the browser has not been told what
     * those ids are, the only thing it can do is guess by name,
     * which §6.47 exists to forbid.
     *
     * Publishing here rather than at each call site is what makes
     * that an invariant instead of a convention: there is one
     * place a decision leaves this class, and the state goes out
     * of it first.
     */
    public void publishSnapshots() {
        Game current = game;
        if (current == null) {
            return;
        }
        long revision = gate.bumpStateVersion();
        for (Player player : current.getPlayers()) {
            Integer seat = seatOf.get(player.getLobbyPlayer());
            if (seat == null) {
                continue;
            }
            com.google.gson.JsonObject snapshot =
                    ViewerSnapshot.of(
                            current,
                            player,
                            seatsByPlayer(current),
                            revision,
                            noticesFor(seat));
            try {
                snapshotSink.accept(seat, snapshot);
            } catch (RuntimeException e) {
                // A transport problem must not stop the game.
                System.err.println("proxic: snapshot not delivered: " + e);
            }
        }
    }

    /** Forge player to Arena seat, rebuilt per snapshot round. */
    private java.util.Map<Player, Integer> seatsByPlayer(Game current) {
        java.util.Map<Player, Integer> map = new java.util.IdentityHashMap<>();
        for (Player player : current.getPlayers()) {
            Integer seat = seatOf.get(player.getLobbyPlayer());
            if (seat != null) {
                map.put(player, seat);
            }
        }
        return map;
    }

    void publishDecision(DecisionGate.Pending pending, java.util.Map<String, String> labels) {
        decisionCounts.merge(pending.kind(), 1, Integer::sum);
        // §6.48 — the state the question refers to, before it.
        publishSnapshots();
        publisher.accept(pending, labels);
    }

    /**
     * Tell whoever is listening how it finished.
     *
     * Never throws into the game thread's finally: a transport
     * problem must not become the reason the latches are the last
     * thing that happened.
     */
    private void publishEnd(Game finishedGame) {
        Result result;
        if (failure.get() != null) {
            // §6.154 — a crashed RUNNING game is FAILED_RUNTIME,
            // not a loss for anybody. Do not record a fake winner.
            //
            // §6.105, §6.106 — AND RECORD WHY. The commonest
            // cause by far is the adapter's deliberate loud
            // failure: Forge asked for an interaction this
            // protocol cannot represent, and the exception
            // message names the method. Without it the server
            // can only say "the game stopped", which is true,
            // useless, and indistinguishable from a crash.
            result = new Result("FAILED", 0, turn(), describeFailure());
        } else if (finishedGame.getOutcome() == null) {
            result = new Result("NONE", 0, turn(), null);
        } else if (finishedGame.getOutcome().isDraw()) {
            result = new Result("DRAW", 0, turn(), null);
        } else {
            result = new Result(
                    "WINNER",
                    seatOf(finishedGame.getOutcome().getWinningLobbyPlayer()),
                    turn(),
                    null);
        }
        try {
            endSink.accept(result);
        } catch (RuntimeException e) {
            // Nothing useful to do here: the server will notice the
            // worker has stopped talking either way.
            System.err.println("proxic: could not publish the result: " + e);
        }
    }

    /**
     * §6.106 — safe technical evidence, and nothing else.
     *
     * The exception's CLASS and MESSAGE. For the adapter's own
     * loud failure that message is "... does not implement
     * <method>", which is exactly §6.106's "source Forge
     * method/message" and is the single most useful fact there
     * is. No stack trace and no game state: §6.99 keeps Forge's
     * internals out of anything a player could see, and the
     * stack trace is in the worker's stderr log for whoever
     * needs it.
     */
    private String describeFailure() {
        Throwable failed = failure.get();
        if (failed == null) {
            return null;
        }
        String message = failed.getMessage();
        String detail = failed.getClass().getSimpleName()
                + (message == null ? "" : ": " + message);
        // §6.189 — the counts, because the ratio between them is
        // what names a runaway that reached no stub at all.
        if (!decisionCounts.isEmpty()) {
            detail = detail + " [asked: " + decisionCounts() + "]";
        }
        if (declinedActions.get() > 0) {
            detail = detail + " [declined: " + declinedActions.get() + "]";
        }
        // And which stubs were reached, since a game may touch
        // several before the one that threw.
        if (!GeneratedControllerBase.REACHED_STUBS.isEmpty()) {
            detail = detail + " [stubs reached: "
                    + String.join(", ", GeneratedControllerBase.REACHED_STUBS.keySet()) + "]";
        }
        return detail;
    }

    /** Called by the controller when a seat is first offered priority. */
    void markRunning() {
        running.countDown();
    }

    /**
     * Wait for the running milestone.
     *
     * Returns false on timeout rather than throwing: a worker that
     * cannot start a game must report FAILED_STARTUP, and an
     * exception here would be reported as something else.
     */
    public boolean awaitRunning(long timeout, TimeUnit unit) throws InterruptedException {
        return running.await(timeout, unit) && failure.get() == null;
    }

    public boolean awaitFinished(long timeout, TimeUnit unit) throws InterruptedException {
        return finished.await(timeout, unit);
    }

    public String outcome() {
        return outcome.get();
    }

    public Throwable failure() {
        return failure.get();
    }

    public int turn() {
        Game g = game;
        return g == null ? 0 : g.getPhaseHandler().getTurn();
    }

    /** Stop the game thread. Used when a match is terminated. */
    public void stop() {
        Thread t = gameThread;
        if (t != null) {
            t.interrupt();
        }
    }

    /**
     * §6.149 — what FORGE said, not what Arena concluded.
     *
     * `getRegisteredPlayers` rather than `getPlayers`: a player who
     * has lost and left is dropped from the latter, so the loser
     * would vanish from the report that exists to name them.
     */
    private static String describeOutcome(Game finishedGame) {
        if (finishedGame.getOutcome() == null) {
            return "none";
        }
        if (finishedGame.getOutcome().isDraw()) {
            return "draw";
        }
        return "winner:" + finishedGame.getOutcome().getWinningLobbyPlayer().getName();
    }

    /** A seat as the server hands it over. */
    public static final class Seat {
        public final String displayName;
        public final Deck deck;
        /**
         * The server's seat number, carried through unchanged.
         *
         * The ONLY identity the protocol routes on. Display names
         * are for humans to read and are not unique.
         */
        public final int seatNumber;

        public Seat(String displayName, int seatNumber, Deck deck) {
            this.displayName = displayName;
            this.seatNumber = seatNumber;
            this.deck = deck;
        }
    }
}
