package net.barnflix.proxic.worker.game;

import forge.LobbyPlayer;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameRules;
import forge.game.GameStage;
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
    /**
     * Spec 0047 -- somebody is watching: the public view is built with
     * every round. Off until the server says so, so an unwatched game
     * builds nothing extra.
     */
    private volatile boolean watched;

    /** Spec 0047 -- the seat number the public view is sent as. */
    public static final int PUBLIC_SEAT = 0;

    public void setWatched(boolean on) {
        watched = on;
        if (on) {
            publishSnapshots();
        }
    }

    /** Spec 0045 -- what caused what, for this game. */
    private volatile Causes causes;
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
    /**
     * `reason` — P6-AP: FORGE's own account of an ALTERNATE win, the
     * winner's PlayerOutcome ("has won due to effect of 'Laboratory
     * Maniac'"). Carried, never composed here: a result is Forge's,
     * and so is its explanation. Null for an ordinary win, where
     * Forge's sentence ("has won because all opponents have lost")
     * tells the players nothing the result does not.
     *
     * `lossReason` — spec 0045: why the loser lost, Forge's own
     * GameLossReason by its name (Milled, LifeReachedZero, Poisoned,
     * SpellEffect...). Null for an alternate win or a concession, which
     * say so already.
     */
    public record Result(String kind, int winningSeat, int turn, String detail, String reason,
                         int concededSeat, String lossReason) {
        public Result(String kind, int winningSeat, int turn, String detail) {
            this(kind, winningSeat, turn, detail, null, 0, null);
        }
    }

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
    /**
     * The rules every Proxic game is played under. One place, because
     * Phase 8's proofs that some of Forge's questions cannot arise read
     * them here (UnreachableQuestionsTest): no ante (Forge's default),
     * no legacy damage-assignment ordering of blockers (default off),
     * and one game per match, so Forge never offers sideboarding between
     * games.
     */
    static GameRules matchRules() {
        GameRules rules = new GameRules(GameType.Constructed);
        rules.setGamesPerMatch(1);
        return rules;
    }

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
        Match match = new Match(matchRules(), registered, matchName);
        Game created = match.createGame();
        this.game = created;
        // §6.70 — the game epoch, counted by FORGE's own event,
        // GameEventGameRestarted, which PhaseHandler fires when Karn
        // Liberated's ultimate resolves. Nothing here decides a
        // restart happened.
        created.subscribeToEvents(new EpochCounter());
        // Spec 0045 -- counters' origins, triggers' causes, reveals.
        Causes found = new Causes(created);
        this.causes = found;
        created.subscribeToEvents(found.new Listener());
        // Phase 9 Amendment 12 -- who did it, and what they did.
        created.subscribeToEvents(found.actions().new Listener());
        // §7.61 B13 -- damage as Forge dealt it, for the board's impact
        // and numbers (PHASE 7 AMENDMENT 4).
        created.subscribeToEvents(new DamageLog());
        // Phase 10 A-00 -- every card's move, where from, where to, why.
        created.subscribeToEvents(new MoveLog());

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
                "Forge asked for " + method + ", which this adapter does not implement" + whereNow()));
    }

    /**
     * When and from what a failure came, for the record (owner 2026-10-22).
     *
     * A game that stopped at Eldrazi Monument's upkeep trigger said only
     * "choosePermanentsToSacrifice"; finding the card took the game log.
     * Admins and logs only -- never the players' screen (owner). Nothing
     * hidden: the turn, the step, and what is on the stack, which both
     * players can see.
     */
    private String whereNow() {
        Game g = game;
        if (g == null) {
            return "";
        }
        StringBuilder b = new StringBuilder();
        try {
            forge.game.phase.PhaseHandler phase = g.getPhaseHandler();
            b.append(" -- turn ").append(phase.getTurn());
            if (phase.getPlayerTurn() != null) {
                b.append(", ").append(phase.getPlayerTurn().getName()).append("'s");
            }
            b.append(' ').append(phase.getPhase());
            forge.game.zone.MagicStack stack = g.getStack();
            if (!stack.isEmpty()) {
                forge.game.spellability.SpellAbility sa = stack.peekAbility();
                b.append(stack.isResolving() ? ", while resolving " : ", with on top of the stack ")
                        .append(sa.getHostCard() == null ? sa.toString() : sa.getHostCard().getName());
                if (sa.isTrigger()) {
                    b.append("'s trigger");
                } else if (sa.isActivatedAbility()) {
                    b.append("'s ability");
                }
                if (sa.getActivatingPlayer() != null) {
                    b.append(" (").append(sa.getActivatingPlayer().getName()).append(')');
                }
            }
        } catch (RuntimeException e) {
            // A description must never hide the failure it describes.
            b.append(" (where: unknown)");
        }
        return b.toString();
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
        // Spec 0057, item 1 -- never Forge's script shorthand.
        text = PlainWords.humanise(text);
        java.util.Deque<String> queue =
                notices.computeIfAbsent(seat, key -> new java.util.ArrayDeque<>());
        synchronized (queue) {
            queue.addLast(text);
            while (queue.size() > NOTICES_KEPT) {
                queue.removeFirst();
            }
        }
    }

    /**
     * Phase 9 W-17 (Amendment 19) -- the dice rolled lately, public: who
     * rolled, with which card, how many sides, the final results. Each
     * has a number that only grows, so a page tumbles a die once per roll
     * and both players see the same one. Bounded like the notices.
     */
    private final java.util.Deque<com.google.gson.JsonObject> rolls = new java.util.ArrayDeque<>();

    private int rollsSeen = 0;

    private static final int ROLLS_KEPT = 6;

    synchronized void rolled(int seat, forge.game.card.Card source, int sides, java.util.List<Integer> results) {
        com.google.gson.JsonObject roll = new com.google.gson.JsonObject();
        roll.addProperty("n", ++rollsSeen);
        roll.addProperty("seat", seat);
        if (source != null) {
            roll.addProperty("source", "card:" + source.getId());
            roll.addProperty("name", source.getName());
        }
        roll.addProperty("sides", sides);
        com.google.gson.JsonArray values = new com.google.gson.JsonArray();
        results.forEach(values::add);
        roll.add("results", values);
        rolls.addLast(roll);
        while (rolls.size() > ROLLS_KEPT) {
            rolls.removeFirst();
        }
    }

    private synchronized com.google.gson.JsonArray rollsSoFar() {
        com.google.gson.JsonArray out = new com.google.gson.JsonArray();
        rolls.forEach(roll -> out.add(roll.deepCopy()));
        return out;
    }

    /** Spec 0045 -- Forge showed this seat these cards (MatchController#reveal). */
    void revealed(int seat, java.util.List<Integer> cardIds, String forgeWords) {
        revealed(seat, cardIds, forgeWords, null);
    }

    /** Spec 0057, item 7 -- the same, with who revealed them and why (a cost). */
    void revealed(int seat, java.util.List<Integer> cardIds, String forgeWords, Causes.Told told) {
        Causes now = causes;
        if (now != null) {
            now.revealed(seat, cardIds, forgeWords, told);
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

    /** §7.53 — each player's stops: when they are asked, and when passed for. */
    private final PriorityStops stops = new PriorityStops();

    public PriorityStops stops() {
        return stops;
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

    /** PHASE_07 §7.56 — Forge's own game log, for the server's game record and
     *  nothing else (it can name hidden cards; no player is sent it). */
    private volatile java.util.function.Consumer<com.google.gson.JsonArray> logSink = entries -> { };

    private int logSent;

    public void onGameLog(java.util.function.Consumer<com.google.gson.JsonArray> sink) {
        this.logSink = sink;
    }

    /** What Forge has logged since the last call: once per question, and at the end. */
    synchronized void flushGameLog() {
        Game current = game;
        if (current == null) {
            return;
        }
        java.util.List<forge.game.GameLogEntry> all = current.getGameLog().getAllEntries();
        if (all.size() < logSent) {
            logSent = 0; // a new log (Karn's restart): from its start
        }
        if (all.size() == logSent) {
            return;
        }
        com.google.gson.JsonArray entries = new com.google.gson.JsonArray();
        for (forge.game.GameLogEntry entry : all.subList(logSent, all.size())) {
            com.google.gson.JsonObject line = new com.google.gson.JsonObject();
            line.addProperty("type", String.valueOf(entry.type()));
            line.addProperty("message", entry.message());
            entries.add(line);
        }
        logSent = all.size();
        logSink.accept(entries);
    }

    /** Where a step change goes (MATCH_STEP). Set by the worker's protocol. */
    private volatile java.util.function.Consumer<com.google.gson.JsonObject> stepSink = step -> { };

    public void onStep(java.util.function.Consumer<com.google.gson.JsonObject> sink) {
        this.stepSink = sink;
    }

    /**
     * PHASE_07 AMENDMENT 13 — the game moved to another step, and nobody is
     * asked anything there (stops). Only what the step bar shows: turn,
     * step, whose turn, who holds priority -- all public, the same for
     * every seat. A whole board per step cost a full snapshot per viewer
     * per step, and with thousands of tokens (Krenko, Mob Boss) each one
     * is large; the board itself goes out when something asks.
     */
    private void publishStep(Game current) {
        com.google.gson.JsonObject step = new com.google.gson.JsonObject();
        forge.game.phase.PhaseHandler ph = current.getPhaseHandler();
        java.util.Map<Player, Integer> seats = seatsByPlayer(current);
        step.addProperty("turn", ph.getTurn());
        step.addProperty("phase", ph.getPhase() == null ? "" : ph.getPhase().toString());
        Player active = ph.getPlayerTurn();
        step.addProperty("activeSeat", active == null ? 0 : seats.getOrDefault(active, 0));
        Player priority = ph.getPriorityPlayer();
        step.addProperty("prioritySeat", priority == null ? 0 : seats.getOrDefault(priority, 0));
        step.addProperty("gameEpoch", epoch.get());
        try {
            stepSink.accept(step);
        } catch (RuntimeException e) {
            System.err.println("proxic: step not delivered: " + e);
        }
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
    /**
     * §6.70, §6.71 — which Forge game this is, within one match.
     *
     * Forge restarts IN PLACE (RestartGameEffect): the same Game
     * object, and card id numbers carried over -- its own
     * Card.resetUniqueNumber() call is commented out. So `card:45`
     * after a restart can be the same physical card in a different
     * game. The epoch is what tells the two apart, on every snapshot
     * and every question; decision ids keep rising across it, so no
     * question or answer from before a restart can match one after.
     */
    private final java.util.concurrent.atomic.AtomicInteger epoch =
            new java.util.concurrent.atomic.AtomicInteger(1);

    public int epoch() {
        return epoch.get();
    }

    /**
     * Damage dealt since the last snapshot round, as Forge reported it.
     * Snapshots go out with every question and each combat damage step
     * gives priority, so one round's hits are one wave: the first-strike
     * step and the regular step arrive separately (PHASE 7 AMENDMENT 7).
     */
    private final java.util.List<com.google.gson.JsonObject> damageDealt =
            java.util.Collections.synchronizedList(new java.util.ArrayList<>());

    private final class DamageLog {
        @com.google.common.eventbus.Subscribe
        public void on(forge.game.event.GameEvent event) {
            if (event instanceof forge.game.event.GameEventTurnPhase step) {
                // Snapshots go out with questions, and a combat where nobody
                // can do anything asks none: the blocks were never shown and
                // first-strike and regular damage arrived as one wave (found
                // by check-board-data.py). So each combat damage step, and
                // the end of combat, sends the board as it stands -- the
                // blocks, then each step's damage as its own wave.
                forge.game.phase.PhaseType phase = step.phase();
                boolean combatStep = phase == forge.game.phase.PhaseType.COMBAT_FIRST_STRIKE_DAMAGE
                        || phase == forge.game.phase.PhaseType.COMBAT_DAMAGE
                        || phase == forge.game.phase.PhaseType.COMBAT_END;
                if (combatStep || !damageDealt.isEmpty()) {
                    publishSnapshots();
                    // Phase 10 A-13: a damage step begins -- Forge's combat as
                    // it stands now, before anyone dies, is who fights whom.
                    beginDamageStep(CombatDamage.stepOf(phase));
                } else if (stops.active()) {
                    // AMENDMENT 13: with stops, most steps ask nobody, so each
                    // step is announced -- the step bar walks through them
                    // instead of jumping from one question to the next. Just
                    // the step, not the whole board (publishStep).
                    Game current = game;
                    if (current != null) {
                        publishStep(current);
                    }
                }
                return;
            }
            if (event instanceof forge.game.event.GameEventSpellResolved && damageStep != null) {
                // Something resolved: the step's combat damage, if any, is long
                // dealt (all of it prevented, else it was sent at the first
                // priority). What follows is not combat damage.
                synchronized (damageDealt) {
                    if (damageDealt.isEmpty()) {
                        beginDamageStep(null);
                    }
                }
                return;
            }
            if (event instanceof forge.game.event.GameEventCardDamaged hit && hit.amount() > 0) {
                com.google.gson.JsonObject target = new com.google.gson.JsonObject();
                target.addProperty("object", "card:" + hit.card().getId());
                com.google.gson.JsonObject entry = record(hit.source(), target, hit.amount());
                if (hit.type() == forge.game.event.GameEventCardDamaged.DamageType.Deathtouch) {
                    entry.addProperty("deathtouch", true);
                }
            } else if (event instanceof forge.game.event.GameEventPlayerLivesChanged lives
                    && lives.newLives() > lives.oldLives() && damageStep != null) {
                // Phase 10 A-13: lifelink -- Forge gains the life right after
                // the lifelinker's own damage (GameAction.dealDamage), so the
                // source is the last hit's, when its controller gained exactly
                // what it dealt; otherwise the gain is told without a source.
                Game current = game;
                if (current == null) {
                    return;
                }
                for (Player player : current.getRegisteredPlayers()) {
                    if (player.getId() != lives.player().getId()) {
                        continue;
                    }
                    Integer seat = seatOf.get(player.getOriginalLobbyPlayer());
                    int gained = lives.newLives() - lives.oldLives();
                    String source = null;
                    forge.game.card.CardView last = lastSource;
                    if (last != null && last.getController() != null
                            && last.getController().getId() == player.getId()) {
                        synchronized (damageDealt) {
                            if (CombatDamage.gainedFrom(damageDealt, "card:" + last.getId(), gained)) {
                                source = "card:" + last.getId();
                            }
                        }
                    }
                    lifeGained.add(CombatDamage.gain(seat == null ? 0 : seat, gained, source));
                }
            } else if (event instanceof forge.game.event.GameEventPlayerDamaged hit && hit.amount() > 0) {
                Game current = game;
                if (current == null) {
                    return;
                }
                for (Player player : current.getRegisteredPlayers()) {
                    if (player.getId() == hit.target().getId()) {
                        Integer seat = seatOf.get(player.getOriginalLobbyPlayer());
                        com.google.gson.JsonObject target = new com.google.gson.JsonObject();
                        target.addProperty("player", seat == null ? 0 : seat);
                        record(hit.source(), target, hit.amount());
                    }
                }
            }
        }

        private com.google.gson.JsonObject record(
                forge.game.card.CardView source, com.google.gson.JsonObject target, int amount) {
            com.google.gson.JsonObject entry = new com.google.gson.JsonObject();
            if (source != null) {
                entry.addProperty("source", "card:" + source.getId());
            }
            entry.add("target", target);
            entry.addProperty("amount", amount);
            damageDealt.add(entry);
            lastSource = source;
            return entry;
        }
    }

    /**
     * Phase 10 A-13 (Amendment 15) -- the combat damage step under way:
     * "first-strike" or "regular" from the moment it begins until its damage
     * is sent, else null. Its damage is the first wave sent after it begins
     * (the step deals all of it at once, before anyone gets priority); the
     * questions Forge asks while assigning it carry no damage yet.
     */
    private volatile String damageStep;
    /** Forge's combat when the step began: who fights whom (CombatDamage). */
    private com.google.gson.JsonArray stepFights;
    /** Each attacker of a planeswalker or battle, and how much damage history it had then. */
    private final java.util.Map<forge.game.card.Card, Integer> walkerAttackers = new java.util.IdentityHashMap<>();
    /** Life gained while the step's damage was dealt (lifelink). */
    private final java.util.List<com.google.gson.JsonObject> lifeGained =
            java.util.Collections.synchronizedList(new java.util.ArrayList<>());
    /** The source of the last hit recorded: a lifelink gain follows its source's hits. */
    private volatile forge.game.card.CardView lastSource;

    private void beginDamageStep(String step) {
        damageStep = null;
        stepFights = null;
        walkerAttackers.clear();
        lifeGained.clear();
        lastSource = null;
        Game current = game;
        forge.game.combat.Combat combat = current == null ? null : current.getCombat();
        if (step == null || combat == null || combat.getAttackers().isEmpty()) {
            return;
        }
        java.util.Map<Player, Integer> seats = seatsByPlayer(current);
        com.google.gson.JsonArray fights = new com.google.gson.JsonArray();
        for (forge.game.card.Card attacker : combat.getAttackers()) {
            forge.game.GameEntity defender = combat.getDefenderByAttacker(attacker);
            com.google.gson.JsonObject target = new com.google.gson.JsonObject();
            if (defender instanceof Player player) {
                target.addProperty("player", seats.getOrDefault(player, 0));
            } else if (defender instanceof forge.game.card.Card card) {
                target.addProperty("object", "card:" + card.getId());
                // Forge fires no damage event for a planeswalker or battle that
                // is not a creature (Card.addDamageAfterPrevention only removes
                // counters), so its hits are read from Forge's own damage record.
                walkerAttackers.put(attacker, attacker.getDamageHistory().getAllDmgInstances().size());
            }
            java.util.List<String> blockers = new java.util.ArrayList<>();
            for (forge.game.card.Card blocker : combat.getBlockers(attacker)) {
                blockers.add("card:" + blocker.getId());
            }
            fights.add(CombatDamage.fight("card:" + attacker.getId(), target, blockers));
        }
        stepFights = fights;
        damageStep = step;
    }

    /**
     * Phase 10 A-13 -- combat damage to a planeswalker or battle that is not a
     * creature, from each of its attackers' damage history (Forge's record:
     * CardDamageHistory.getAllDmgInstances, and Game.getDamageLKI for what
     * each instance hit). Public API, no reflection. A creature (a
     * planeswalker made one) has its hit already, from GameEventCardDamaged.
     */
    private void walkerHits(Game current) {
        for (java.util.Map.Entry<forge.game.card.Card, Integer> entry : walkerAttackers.entrySet()) {
            forge.game.card.Card attacker = entry.getKey();
            java.util.List<org.apache.commons.lang3.tuple.Pair<Integer, Boolean>> dealt =
                    attacker.getDamageHistory().getAllDmgInstances();
            for (int i = entry.getValue(); i < dealt.size(); i++) {
                org.apache.commons.lang3.tuple.Pair<Integer, Boolean> instance = dealt.get(i);
                if (!Boolean.TRUE.equals(instance.getRight())) {
                    continue;
                }
                org.apache.commons.lang3.tuple.Pair<forge.game.card.Card, forge.game.GameEntity> what =
                        current.getDamageLKI(instance);
                if (what != null && what.getRight() instanceof forge.game.card.Card hit && !hit.isCreature()) {
                    com.google.gson.JsonObject target = new com.google.gson.JsonObject();
                    target.addProperty("object", "card:" + hit.getId());
                    com.google.gson.JsonObject one = new com.google.gson.JsonObject();
                    one.addProperty("source", "card:" + attacker.getId());
                    one.add("target", target);
                    one.addProperty("amount", instance.getLeft());
                    damageDealt.add(one);
                }
            }
            entry.setValue(dealt.size());
        }
    }

    /**
     * Phase 10 A-00 -- the cards moved since the last snapshot round, as
     * Forge moved them (Moves). Sent with the round's snapshots, each seat
     * told only what it may see, then cleared.
     */
    private final java.util.List<Moves.Move> movesMade =
            java.util.Collections.synchronizedList(new java.util.ArrayList<>());
    /** Sacrificed cards: Forge says so just BEFORE it moves them. */
    private final java.util.Set<Integer> sacrificing =
            java.util.Collections.synchronizedSet(new java.util.HashSet<>());

    private final class MoveLog {
        @com.google.common.eventbus.Subscribe
        public void on(forge.game.event.GameEvent event) {
            if (event instanceof forge.game.event.GameEventCardSacrificed sacrificed && sacrificed.card() != null) {
                sacrificing.add(sacrificed.card().getId());
            } else if (event instanceof forge.game.event.GameEventShuffle shuffle && shuffle.player() != null) {
                // Phase 10 A-14: Forge shuffled a library after cards went
                // into it this round (Chaos Warp: moved, then shuffled).
                Moves.shuffled(movesMade, seatOfPlayer(shuffle.player()));
            } else if (event instanceof forge.game.event.GameEventCardChangeZone moved && moved.card() != null) {
                forge.game.card.CardView card = moved.card();
                String from = Moves.zoneName(moved.from() == null ? null : moved.from().zoneType());
                String to = Moves.zoneName(moved.to() == null ? null : moved.to().zoneType());
                String why = null;
                if ("battlefield".equals(from)) {
                    // Forge marks a destroyed card (and one put into the
                    // graveyard by the rules, and a sacrificed one) before
                    // moving it.
                    if (sacrificing.remove(card.getId())) {
                        why = "sacrificed";
                    } else if (card.wasDestroyed()) {
                        why = "destroyed";
                    }
                }
                Moves.Move move = new Moves.Move(card.getId(), from, seatOfZone(moved.from()), to,
                        seatOfZone(moved.to()), card.isFaceDown(), why);
                if ("library".equals(to)) {
                    move = move.withWhere(libraryPlace(moved.to(), card.getId()));
                }
                movesMade.add(move);
            }
        }
    }

    /**
     * Phase 10 A-10 -- each card that is part of a permanent on the
     * battlefield, mapped to that permanent: a melded permanent's partner
     * (Forge's `getMeldedWith`, set by MeldEffect before the melded card
     * returns), and a mutated permanent's other cards (`getMergedCards`,
     * set by MutateEffect, over or under). Read as the round is sent, so
     * the merge has finished whatever order Forge fired its moves in (a
     * meld's partner is exiled before Forge records the meld).
     */
    private static java.util.Map<Integer, Integer> mergedInto(Game current) {
        java.util.Map<Integer, Integer> hostOf = new java.util.HashMap<>();
        for (Player player : current.getRegisteredPlayers()) {
            for (forge.game.card.Card permanent : player.getCardsIn(forge.game.zone.ZoneType.Battlefield)) {
                forge.game.card.Card partner = permanent.getMeldedWith();
                if (partner != null) {
                    hostOf.put(partner.getId(), permanent.getId());
                }
                if (permanent.hasMergedCard()) {
                    for (forge.game.card.Card part : permanent.getMergedCards()) {
                        if (part.getId() != permanent.getId()) {
                            hostOf.put(part.getId(), permanent.getId());
                        }
                    }
                }
            }
        }
        return hostOf;
    }

    /** The Arena seat whose zone this is (a battlefield, a hand...). */
    private Integer seatOfZone(forge.game.zone.ZoneView zone) {
        return zone == null ? null : seatOfPlayer(zone.player());
    }

    /** The Arena seat of this Forge player. */
    private Integer seatOfPlayer(forge.game.player.PlayerView view) {
        Player player = playerOf(view);
        return player == null ? null : seatOf.get(player.getOriginalLobbyPlayer());
    }

    private Player playerOf(forge.game.player.PlayerView view) {
        Game current = game;
        if (view == null || current == null) {
            return null;
        }
        for (Player player : current.getRegisteredPlayers()) {
            if (player.getId() == view.getId()) {
                return player;
            }
        }
        return null;
    }

    /**
     * Phase 10 A-14 -- "top" or "bottom": where the card is in the library
     * Forge just put it in, read from that library as Forge reports the
     * move (the card is already in it: GameAction adds it, then fires the
     * event, on the same thread). Null anywhere else, or if not found.
     */
    private String libraryPlace(forge.game.zone.ZoneView zone, int cardId) {
        Player owner = zone == null ? null : playerOf(zone.player());
        if (owner == null) {
            return null;
        }
        forge.game.card.CardCollectionView library =
                owner.getZone(forge.game.zone.ZoneType.Library).getCards(false);
        for (int i = 0; i < library.size(); i++) {
            if (library.get(i).getId() == cardId) {
                return Moves.libraryPlace(i, library.size());
            }
        }
        return null;
    }

    /** Forge's event bus calls this; Guava finds it by the annotation. */
    private final class EpochCounter {
        @com.google.common.eventbus.Subscribe
        public void on(forge.game.event.GameEvent event) {
            // The RESTART event, not GameEventGameStarted: the first
            // version counted starts, and the play-or-draw question
            // is asked (with a snapshot) before Forge fires the first
            // one, so the opening board said "game 0".
            if (event instanceof forge.game.event.GameEventGameRestarted) {
                int now = epoch.incrementAndGet();
                // Both players are told, in words: the board they were
                // looking at is gone, not rearranged.
                for (Integer seat : seatOf.values()) {
                    note(seat, "The game restarted. This is game " + now + " of the match.");
                }
            }
        }
    }

    public void publishSnapshots() {
        Game current = game;
        if (current == null) {
            return;
        }
        long revision = gate.bumpStateVersion();
        // B13: this round's damage, sent once, to every seat (damage is
        // public). The key is the round's, so a board plays it once.
        com.google.gson.JsonObject damage = null;
        String step = damageStep;
        if (step != null) {
            walkerHits(current);
        }
        synchronized (damageDealt) {
            if (!damageDealt.isEmpty()) {
                // Phase 10 A-13: a damage step's own damage says so, with who
                // fought whom and the life it gained; the step is then over
                // (a spell cast later in the step is a wave of its own).
                java.util.List<com.google.gson.JsonObject> gains;
                synchronized (lifeGained) {
                    gains = java.util.List.copyOf(lifeGained);
                }
                damage = CombatDamage.wave("damage:" + revision, damageDealt, step, stepFights, gains);
                damageDealt.clear();
                if (step != null) {
                    beginDamageStep(null);
                }
            }
        }
        // Phase 10 A-00: this round's moves, each seat its own view of them.
        java.util.List<Moves.Move> moved;
        synchronized (movesMade) {
            moved = java.util.List.copyOf(movesMade);
            movesMade.clear();
        }
        // Phase 10 A-10: what merged into what, from Forge's own state.
        moved = Moves.withInto(moved, mergedInto(current));
        sacrificing.clear();
        // REGISTERED players, not getPlayers(): Forge removes a player
        // who has lost, so the final board went to the winner alone
        // and showed the winner alone. Measured, P6-AP.
        for (Player player : current.getRegisteredPlayers()) {
            // The player's OWN seat, by its ORIGINAL lobby player.
            // getLobbyPlayer() is the CURRENT controller's: under
            // Mindslaver the controlled player was filed under the
            // master's seat, so the master got two snapshots per
            // round -- one built from the controlled player's view --
            // and the controlled player got none. Measured, P6-U.
            Integer seat = seatOf.get(player.getOriginalLobbyPlayer());
            if (seat == null) {
                continue;
            }
            com.google.gson.JsonObject snapshot =
                    ViewerSnapshot.of(
                            current,
                            player,
                            seatsByPlayer(current),
                            revision,
                            noticesFor(seat),
                            epoch.get(),
                            causes);
            if (damage != null) {
                snapshot.add("damage", damage.deepCopy());
            }
            snapshot.add("rolls", rollsSoFar());
            if (!moved.isEmpty()) {
                snapshot.add("moves", Moves.forViewer(moved, seat));
            }
            try {
                snapshotSink.accept(seat, snapshot);
            } catch (RuntimeException e) {
                // A transport problem must not stop the game.
                System.err.println("proxic: snapshot not delivered: " + e);
            }
        }
        // Spec 0047 -- the public view, for spectators, as seat 0: built
        // with no viewer, so it holds only what every player can see.
        if (watched) {
            com.google.gson.JsonObject everyone = ViewerSnapshot.of(
                    current, null, seatsByPlayer(current), revision, java.util.List.of(), epoch.get(), causes);
            if (damage != null) {
                everyone.add("damage", damage.deepCopy());
            }
            everyone.add("rolls", rollsSoFar());
            if (!moved.isEmpty()) {
                everyone.add("moves", Moves.forViewer(moved, null));
            }
            try {
                snapshotSink.accept(PUBLIC_SEAT, everyone);
            } catch (RuntimeException e) {
                System.err.println("proxic: public snapshot not delivered: " + e);
            }
        }
    }

    /** Forge player to Arena seat, rebuilt per snapshot round. */
    private java.util.Map<Player, Integer> seatsByPlayer(Game current) {
        java.util.Map<Player, Integer> map = new java.util.IdentityHashMap<>();
        for (Player player : current.getRegisteredPlayers()) {
            Integer seat = seatOf.get(player.getOriginalLobbyPlayer());
            if (seat != null) {
                map.put(player, seat);
            }
        }
        return map;
    }

    /**
     * The options of the searchable question outstanding, if any.
     *
     * Kept here rather than sent: naming a card offers ~30,000
     * names, and the player is shown only what they search for.
     */
    private volatile Searchable searchable;

    private record Searchable(long decisionId, int authorisedSeat,
                              java.util.List<String> ids, java.util.List<String> labels,
                              java.util.List<String> folded) {}

    /** What a search found: at most {@link #SEARCH_LIMIT}, and how many there were. */
    public record Found(java.util.LinkedHashMap<String, String> options, int total) {}

    public static final int SEARCH_LIMIT = 50;

    /**
     * Phase 9 W-12 (Amendment 16) -- a card name's mana cost and type line,
     * from Forge's card data, so a search result reads "Goblin Guide {R} ·
     * Creature — Goblin Scout". Null for a name Forge has no card for.
     */
    public static String[] cardFacts(String name) {
        forge.item.PaperCard paper = name == null ? null
                : forge.StaticData.instance().getCommonCards().getCard(name);
        if (paper == null) {
            return null;
        }
        forge.card.CardRules rules = paper.getRules();
        String cost = rules.getManaCost() == null || rules.getManaCost().isNoCost()
                ? null : rules.getManaCost().toString();
        String types = rules.getType() == null ? null : rules.getType().toString().replace(" - ", " \u2014 ");
        return new String[] {cost, types};
    }

    /**
     * Search the outstanding question's options — P6-AG.
     *
     * Null when there is nothing to search: no such question, or
     * the seat asking is not the one authorised to answer it. The
     * server checks both first; this is the gate's side of it, for
     * the same reason the gate re-checks every answer.
     *
     * Ranked as a person expects a card search to rank: the exact
     * name, then names that START with the text, then a word in
     * the name that starts with it, then anywhere. Case and accents
     * are ignored, so "mjolnir" finds Mjölnir and "oin" finds Óin.
     */
    public Found search(long decisionId, int seat, String query) {
        Searchable current = searchable;
        DecisionGate.Pending pending = gate.pending();
        if (current == null || pending == null
                || current.decisionId() != decisionId || pending.decisionId() != decisionId
                || current.authorisedSeat() != seat) {
            return null;
        }
        String needle = fold(query == null ? "" : query.trim());
        java.util.LinkedHashMap<String, String> found = new java.util.LinkedHashMap<>();
        if (needle.isEmpty()) {
            return new Found(found, 0);
        }
        java.util.List<java.util.List<Integer>> tiers = new java.util.ArrayList<>();
        for (int i = 0; i < 4; i++) {
            tiers.add(new java.util.ArrayList<>());
        }
        for (int i = 0; i < current.folded().size(); i++) {
            String name = current.folded().get(i);
            int at = name.indexOf(needle);
            if (at < 0) {
                continue;
            }
            int tier = name.equals(needle) ? 0
                    : at == 0 ? 1
                    : !Character.isLetterOrDigit(name.charAt(at - 1)) ? 2
                    : 3;
            tiers.get(tier).add(i);
        }
        int total = 0;
        for (java.util.List<Integer> tier : tiers) {
            total += tier.size();
            for (int i : tier) {
                if (found.size() < SEARCH_LIMIT) {
                    found.put(current.ids().get(i), current.labels().get(i));
                }
            }
        }
        return new Found(found, total);
    }

    /** Lower case, accents removed: what a search compares. */
    static String fold(String text) {
        return java.text.Normalizer.normalize(text, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(java.util.Locale.ROOT);
    }

    /** B8: the options of the question about to be asked that Forge says
     *  cannot be paid now. Set on the game thread just before the ask,
     *  read by the publisher on the same thread, cleared after. */
    private volatile java.util.Set<String> unpayable = java.util.Set.of();

    void offerUnpayable(java.util.Set<String> ids) {
        unpayable = ids;
    }

    public boolean payable(String actionId) {
        return !unpayable.contains(actionId);
    }

    /** Owner 2026-10-21 — what each offered spell costs right now, as Forge works it out. */
    private volatile java.util.Map<String, String> costs = java.util.Map.of();

    void offerCosts(java.util.Map<String, String> byId) {
        costs = byId;
    }

    public String costOf(String actionId) {
        return costs.get(actionId);
    }

    /** Spec 0057, item 5 -- what each option of a play-or-discard card does with it. Same lifetime. */
    private volatile java.util.Map<String, com.google.gson.JsonObject> uses = java.util.Map.of();

    void offerUses(java.util.Map<String, com.google.gson.JsonObject> byId) {
        uses = byId;
    }

    public com.google.gson.JsonObject useOf(String actionId) {
        return uses.get(actionId);
    }

    /**
     * Spec 0057, item 7 -- a reveal about to be made as a COST: the cards the
     * payer chose, who pays, and for what. Forge shows them to the other
     * players right after (CostReveal), and their controllers word that
     * reveal from this. Cleared with the next question.
     */
    record CostReveal(java.util.Set<Integer> cards, Player payer, forge.game.spellability.SpellAbility ability) {}

    private volatile CostReveal costReveal;

    void payingByReveal(Iterable<forge.game.card.Card> cards, Player payer,
            forge.game.spellability.SpellAbility ability) {
        java.util.Set<Integer> ids = new java.util.HashSet<>();
        cards.forEach(card -> ids.add(card.getId()));
        costReveal = ids.isEmpty() ? null : new CostReveal(ids, payer, ability);
    }

    /** The cost reveal these cards are, or null. */
    CostReveal costRevealOf(java.util.Collection<Integer> cardIds) {
        CostReveal now = costReveal;
        return now != null && !cardIds.isEmpty() && now.cards().containsAll(cardIds) ? now : null;
    }

    /** B7, owner 2026-10-21 -- why each of the player's cards that is NOT
     *  offered cannot act now, by object id ("card:N"). Same lifetime as
     *  the two above: set before the ask, cleared after it is published. */
    private volatile java.util.Map<String, String> unavailable = java.util.Map.of();

    void offerUnavailable(java.util.Map<String, String> byObject) {
        unavailable = byObject;
    }

    public java.util.Map<String, String> unavailable() {
        return unavailable;
    }

    /** Phase 9 W-16 -- each permanent's abilities NOT offered now, by
     *  object id: [label, why] pairs. Same lifetime as unavailable. */
    private volatile java.util.Map<String, java.util.List<String[]>> notNow = java.util.Map.of();

    void offerNotNow(java.util.Map<String, java.util.List<String[]>> byObject) {
        notNow = byObject;
    }

    public java.util.Map<String, java.util.List<String[]>> notNow() {
        return notNow;
    }

    /** Phase 9 Amendment 13 (items 8, 9) -- the mana still due, "{1}{R}", for
     *  the payment question it was set for; null otherwise. */
    private volatile String owing;

    void offerOwing(String symbols) {
        owing = symbols;
    }

    public String owing() {
        return owing;
    }

    /**
     * Owner 2026-10-22 -- what a question that can be backed out of is
     * ABOUT: the spell or ability being cast, paid for or targeted, so the
     * page's Cancel says what backing out undoes ("Cancel Lightning Bolt --
     * back to your hand"). The asking player's own spell, sent to that
     * player only. Same lifetime as the three above.
     */
    private volatile com.google.gson.JsonObject subject = null;

    void offerSubject(forge.game.spellability.SpellAbility sa) {
        offerSubject(sa, null);
    }

    /**
     * The same, for a question about ANOTHER player's card (an Edict asks
     * its target): named as [viewer] may know it, so a face-down source
     * stays "Face-down" (P6-I). Null: the asker's own card, its real name.
     */
    void offerSubject(forge.game.spellability.SpellAbility sa, forge.game.player.PlayerView viewer) {
        if (sa == null || sa.getHostCard() == null) {
            subject = null;
            return;
        }
        forge.game.card.Card card = sa.getHostCard();
        com.google.gson.JsonObject about = new com.google.gson.JsonObject();
        about.addProperty("name", viewer == null ? card.getName() : ViewerSnapshot.nameFor(card, viewer));
        about.addProperty("kind", sa.isSpell() ? "spell" : sa.isTrigger() ? "trigger" : "ability");
        // Spec 0057, item 6 -- WHICH card, so the window can sit by it: a
        // card on the battlefield (public), or the asker's own in hand.
        forge.game.zone.ZoneType zone = card.getZone() == null ? null : card.getZone().getZoneType();
        if (zone == forge.game.zone.ZoneType.Battlefield
                || (viewer == null && zone == forge.game.zone.ZoneType.Hand)) {
            about.addProperty("card", "card:" + card.getId());
        }
        if (sa.isSpell()) {
            forge.game.zone.Zone from = card.getCastFrom();
            about.addProperty("from", from == null
                    ? "hand" : from.getZoneType().name().toLowerCase(java.util.Locale.ROOT));
        }
        subject = about;
    }

    void offerSubject(forge.game.card.Card card) {
        if (card == null) {
            subject = null;
            return;
        }
        com.google.gson.JsonObject about = new com.google.gson.JsonObject();
        about.addProperty("name", card.getName());
        about.addProperty("kind", "card");
        // Spec 0057, item 6 -- the card the player is playing (getAbilityToPlay):
        // their own, on the battlefield or in their hand.
        forge.game.zone.ZoneType zone = card.getZone() == null ? null : card.getZone().getZoneType();
        if (zone == forge.game.zone.ZoneType.Battlefield || zone == forge.game.zone.ZoneType.Hand) {
            about.addProperty("card", "card:" + card.getId());
        }
        subject = about;
    }

    /**
     * Spec 0057, item 3 -- a cost the player chooses to pay: the button's
     * word ("Sacrifice") and what the ability does, for the window's line.
     * Set after offerSubject.
     */
    void offerCostChoice(String act, String effect) {
        com.google.gson.JsonObject about = subject;
        if (about == null) {
            return;
        }
        about.addProperty("act", act);
        if (effect != null && !effect.isBlank()) {
            about.addProperty("effect", effect);
        }
    }

    /**
     * Phase 9 W-06 -- the question's subject is copy [number] of [total]
     * copies of one trigger going on the stack together, so the page can
     * offer one answer for them all. Set after offerSubject.
     */
    void offerCopies(int number, int total) {
        com.google.gson.JsonObject about = subject;
        if (about == null) {
            return;
        }
        about.addProperty("copy", String.valueOf(number));
        about.addProperty("copies", String.valueOf(total));
    }

    public com.google.gson.JsonObject subject() {
        return subject;
    }

    /** Spec 0005 -- this priority question is a response window. Cleared per question. */
    private volatile boolean responseWindow = false;

    void offerResponseWindow(boolean window) {
        responseWindow = window;
    }

    public boolean responseWindow() {
        return responseWindow;
    }

    /**
     * Spec 0001 D3 -- the cards a question is about that no zone shows
     * this player: a scry's or a surveil's top cards, as pictures. Each is
     * described exactly as a snapshot would describe it to [viewer], so a
     * card Forge has not let them look at goes out nameless (HID). Only
     * on the decision, which goes to the asking seat alone.
     *
     * Unlike the facts above, NOT cleared per question: a surveil asks
     * several in a row about the same cards, so whoever sets it clears it
     * ([#stopLooking]), in a finally.
     */
    private volatile com.google.gson.JsonArray looking = null;

    void lookingAt(Iterable<forge.game.card.Card> cards, forge.game.player.PlayerView viewer) {
        Game current = game;
        if (current == null) {
            return;
        }
        java.util.Map<Player, Integer> seats = seatsByPlayer(current);
        com.google.gson.JsonArray out = new com.google.gson.JsonArray();
        cards.forEach(card -> out.add(ViewerSnapshot.describeFor(card, viewer, seats)));
        looking = out;
    }

    void stopLooking() {
        looking = null;
    }

    public com.google.gson.JsonArray looking() {
        return looking;
    }

    /**
     * Phase 9 W-07..W-10 -- how a tray question is laid out: where its
     * cards go ("to": top, bottom, graveyard), where the first pick ends
     * up ("first"), whether a shuffle may follow ("shuffle"), the hidden
     * zone the cards are in ("zone"), a split into two piles ("split") or
     * the two piles to choose from ("piles"). Facts Forge holds that the
     * question's words do not carry. With the question, to the asking
     * seat only. Like [#looking], set and cleared by whoever asks.
     */
    private volatile com.google.gson.JsonObject arrange = null;

    void arranging(com.google.gson.JsonObject how) {
        arrange = how;
    }

    public com.google.gson.JsonObject arrange() {
        return arrange;
    }

    private static final java.util.regex.Pattern OBJECT =
            java.util.regex.Pattern.compile("(card|stack|player):(\\d+)$");

    /**
     * §7.61 B5 -- the object an option is about, so a board can answer by
     * clicking it: "card:N", "stack:N" or "player:SEAT". The worker owns
     * its option ids, so reading them here is not the client parsing
     * them (§1.34). A player is named by SEAT: Forge's own player number
     * (in "target:player:0") is not one.
     */
    public String objectIdOf(String actionId) {
        java.util.regex.Matcher m = OBJECT.matcher(actionId);
        if (!m.find()) {
            return null;
        }
        if (!"player".equals(m.group(1))) {
            return m.group(1) + ":" + m.group(2);
        }
        Game current = game;
        if (current == null) {
            return null;
        }
        int forgeId = Integer.parseInt(m.group(2));
        for (Player player : current.getRegisteredPlayers()) {
            if (player.getId() == forgeId) {
                Integer seat = seatOf.get(player.getOriginalLobbyPlayer());
                return seat == null ? null : "player:" + seat;
            }
        }
        return null;
    }

    void publishDecision(DecisionGate.Pending pending, java.util.Map<String, String> labels) {
        if (pending.searchable()) {
            java.util.List<String> ids = new java.util.ArrayList<>(pending.options());
            java.util.List<String> names = new java.util.ArrayList<>(ids.size());
            java.util.List<String> folded = new java.util.ArrayList<>(ids.size());
            for (String id : ids) {
                String label = labels.get(id);
                names.add(label);
                folded.add(fold(label == null ? "" : label));
            }
            searchable = new Searchable(pending.decisionId(), pending.authorisedSeat(), ids, names, folded);
        }
        decisionCounts.merge(pending.kind(), 1, Integer::sum);
        flushGameLog();
        // §6.48 — the state the question refers to, before it.
        publishSnapshots();
        publisher.accept(pending, labels);
        unpayable = java.util.Set.of(); // only for the question it was set for
        costs = java.util.Map.of();
        uses = java.util.Map.of();
        costReveal = null;
        unavailable = java.util.Map.of();
        notNow = java.util.Map.of();
        owing = null;
        subject = null;
        responseWindow = false;
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
        if (failure.get() != null && conceded && finishedGame.isGameOver()) {
            // §7.55 — Forge had already ended the game when something
            // threw on the way out (a question answered "no" while
            // the game unwound). The result is Forge's; the throw is
            // evidence, kept in stderr, not a reason to call a
            // finished game FAILED.
            System.err.println("proxic: after the concession: " + describeFailure());
            failure.set(null);
        }
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
            String reason = null;
            int concededSeat = 0;
            String lossReason = null;
            for (Player each : finishedGame.getRegisteredPlayers()) {
                // Spec 0045 -- the loser's reason, Forge's own record.
                if (each.getOutcome() != null && each.getOutcome().lossState != null) {
                    lossReason = each.getOutcome().lossState.name();
                }
                if (each.getOutcome() != null && each.getOutcome().hasWon()
                        && each.getOutcome().altWinSourceName != null) {
                    reason = String.valueOf(each.getOutcome());
                }
                // §7.55 — by SEAT, from Forge's own record of why
                // this player lost.
                if (each.conceded()) {
                    concededSeat = seatOf(each.getLobbyPlayer());
                }
            }
            result = new Result(
                    "WINNER",
                    seatOf(finishedGame.getOutcome().getWinningLobbyPlayer()),
                    turn(),
                    null,
                    reason,
                    concededSeat,
                    reason == null && concededSeat == 0 ? lossReason : null);
        }
        if (failure.get() == null) {
            // The board as the game ENDED, before the result. Snapshots
            // otherwise go out only with a question, so whatever
            // happened after the last one never reached the players:
            // the mill that emptied the library before Laboratory
            // Maniac's draw, or the combat damage that took a player
            // to zero -- the final board showed the loser alive.
            // Found by e2e/match-alternate-win.spec.ts in CI. Not for
            // a crash: that game's state is not something to show.
            try {
                publishSnapshots();
            } catch (RuntimeException e) {
                System.err.println("proxic: final board not delivered: " + e);
            }
        }
        try {
            flushGameLog();
        } catch (RuntimeException e) {
            System.err.println("proxic: final game log not recorded: " + e);
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

    /** Whether a concession ended this game (§7.55). */
    private volatile boolean conceded;

    /**
     * PHASE_07 §7.55 — `seat` concedes: FORGE's concession, so Forge
     * declares the winner.
     *
     * What Forge's own client does (PlayerControllerHuman.concede):
     * Player.concede, then checkGameOverCondition, then release every
     * input still waiting. Here it runs on Forge's thread, at the
     * question that thread is blocked on (DecisionGate.interject), and
     * the release is the gate closing.
     *
     * Returns null when it will happen, or why not. Refused before
     * the game proper starts, as Forge's client refuses it during the
     * mulligan: Abandon is the way out of a game that has not begun.
     */
    public String concede(int seat) {
        Game g = game;
        if (g == null) {
            return "NO_GAME";
        }
        if (g.isGameOver()) {
            return "GAME_OVER";
        }
        if (g.getAge() != GameStage.Play) {
            return "NOT_STARTED";
        }
        Player player = null;
        for (Player each : g.getRegisteredPlayers()) {
            if (seatOf(each.getLobbyPlayer()) == seat) {
                player = each;
            }
        }
        if (player == null) {
            return "NO_SEAT";
        }
        Player conceding = player;
        gate.interject(() -> {
            if (g.isGameOver()) {
                return;
            }
            conceding.concede();
            g.getAction().checkGameOverCondition();
            if (g.isGameOver()) {
                conceded = true;
                gate.close();
            }
        });
        return null;
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
