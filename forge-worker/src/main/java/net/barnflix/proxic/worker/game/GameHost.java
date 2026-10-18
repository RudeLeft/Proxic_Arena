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
    public record Result(String kind, int winningSeat, int turn) {}

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
                                // §6.15, §6.162 — a crashed game is a
                                // reported result, never a silent hang.
                                failure.set(t);
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
    void publishDecision(DecisionGate.Pending pending, java.util.Map<String, String> labels) {
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
            result = new Result("FAILED", 0, turn());
        } else if (finishedGame.getOutcome() == null) {
            result = new Result("NONE", 0, turn());
        } else if (finishedGame.getOutcome().isDraw()) {
            result = new Result("DRAW", 0, turn());
        } else {
            result = new Result(
                    "WINNER",
                    seatOf(finishedGame.getOutcome().getWinningLobbyPlayer()),
                    turn());
        }
        try {
            endSink.accept(result);
        } catch (RuntimeException e) {
            // Nothing useful to do here: the server will notice the
            // worker has stopped talking either way.
            System.err.println("proxic: could not publish the result: " + e);
        }
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
