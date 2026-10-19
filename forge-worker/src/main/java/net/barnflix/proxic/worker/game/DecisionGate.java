package net.barnflix.proxic.worker.game;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

/**
 * The decision boundary — PHASE_06 §6.101-§6.104, from PHASE_0A
 * §0A.8 (P0A-G, P0A-H).
 *
 * Sits between Forge's SYNCHRONOUS PlayerController call and
 * whatever answers it. `Match.startGame` blocks for the whole game,
 * so a decision is not a message the engine sends and forgets — it
 * is a blocked call stack, and this is the thing holding it.
 *
 * THE ONE HARD REQUIREMENT, and the reason every check lives in
 * `submit` rather than near the waiter: a response must be rejected
 * BEFORE it reaches the waiter. A late or duplicated answer that
 * slips through does not get ignored — it becomes the answer to
 * whatever Forge asks NEXT. That is a silent wrong move in a real
 * game, not an error anybody sees.
 *
 * Phase 0A measured it: with both duplicate defences removed, 203
 * answers leaked into the following question in one game. Removing
 * either one ALONE looked safe. So both are here:
 *
 *   the ledger          `answered` — ids that already had an answer
 *   the single slot     `accepted` holds exactly one, cleared on ask
 *
 * What this class is allowed to know, and nothing more: seat,
 * decision id, state version. It does NOT know whether a target is
 * legal, what a card costs, or whose turn it is. Those are Forge's,
 * and a transport that second-guesses them is a second rules
 * engine (§6.50).
 *
 * TWO SEATS, NEVER ONE — §6.37, §6.38, §0A.8.
 *
 * `actedForSeat` is the Forge player the decision is ABOUT.
 * `authorisedSeat` is the seat whose human may answer it. They are
 * the same number in every ordinary decision and they come apart
 * under Mindslaver, which is precisely why the protocol carries
 * both rather than deriving one from the other. §6.37 forbids
 * hardcoding "the decision concerns seat N, so seat N's owner
 * answers".
 *
 * They are SEAT NUMBERS, not names. Forge identifies a player by
 * `getName()`, which in Arena is a display name — and display
 * names are not unique (only `username_normalized` is). Routing an
 * answer on a name would, for two players who chose the same one,
 * authorise the wrong human.
 */
public final class DecisionGate {

    /** Why an answer was refused. §6.101's list, as outcomes. */
    public enum Reject {
        NOT_PENDING,
        WRONG_SEAT,
        DUPLICATE,
        STALE_DECISION,
        STALE_STATE,

        /**
         * Passing was not on offer.
         *
         * Some decisions have no "no". Discarding down to hand
         * size is the plain case: the rules say discard, so the
         * only question is WHICH. A client that passes anyway is
         * refused rather than answered for -- the game waits,
         * which is correct, because nobody else may choose a
         * player's cards for them.
         */
        PASS_NOT_ALLOWED,
    }

    /** One outstanding question. */
    public record Pending(long decisionId, int actedForSeat, int authorisedSeat, String kind,
                          long stateVersion, java.util.List<String> options,
                          boolean mandatory, String prompt) {}

    /**
     * A client's answer.
     *
     * `seat` is the seat the SERVER authorised, resolved from the
     * authenticated connection. §6.100: never a seat the browser
     * supplied.
     */
    public record Response(long decisionId, int seat, long expectedStateVersion,
                           String choice) {}

    private final AtomicLong nextDecisionId = new AtomicLong(1);

    /**
     * §6.46's sibling: server-authoritative and MONOTONIC.
     *
     * Bumped whenever the game has moved, so an answer composed
     * against an older view is refused rather than applied to a
     * board that has changed underneath it.
     */
    private final AtomicLong stateVersion = new AtomicLong(1);

    private volatile Pending pending;

    /** Defence one: ids that have already been answered. */
    private final Set<Long> answered = Collections.synchronizedSet(new LinkedHashSet<>());

    /** Defence two: room for exactly one answer, cleared on every ask. */
    private final BlockingQueue<String> accepted = new ArrayBlockingQueue<>(1);

    public long bumpStateVersion() {
        return stateVersion.incrementAndGet();
    }

    public long stateVersion() {
        return stateVersion.get();
    }

    public Pending pending() {
        return pending;
    }

    /**
     * Ask, and block until a VALID answer arrives.
     *
     * Runs on Forge's thread, inside the controller. A seat that
     * has disconnected has simply not answered yet: the worker
     * stays alive and the question stands, which is what makes
     * §6.111's reconnect possible at all.
     */
    public String ask(int actedForSeat, int authorisedSeat, String kind,
                      java.util.List<String> options, Consumer<Pending> deliver)
            throws InterruptedException {
        return ask(actedForSeat, authorisedSeat, kind, options, false, deliver);
    }

    public String ask(int actedForSeat, int authorisedSeat, String kind,
                      java.util.List<String> options, boolean mandatory,
                      Consumer<Pending> deliver)
            throws InterruptedException {
        return ask(actedForSeat, authorisedSeat, kind, options, mandatory, null, deliver);
    }

    /**
     * @param prompt Forge's own wording for the question, when it
     *               has one. A generic chooser is unusable
     *               without it: "choose one" means nothing, and
     *               "Choose a creature to sacrifice" means
     *               everything. Null when the kind says enough.
     */
    public String ask(int actedForSeat, int authorisedSeat, String kind,
                      java.util.List<String> options, boolean mandatory, String prompt,
                      Consumer<Pending> deliver)
            throws InterruptedException {
        long id = nextDecisionId.getAndIncrement();
        Pending question =
                new Pending(id, actedForSeat, authorisedSeat, kind, stateVersion.get(), options,
                        mandatory, prompt);

        // Clear BEFORE publishing the question. An answer left over
        // from the previous one would otherwise be waiting in the
        // slot and be taken as the answer to this.
        accepted.clear();
        pending = question;
        deliver.accept(question);

        String answer;
        while ((answer = accepted.poll(20, TimeUnit.MILLISECONDS)) == null) {
            if (Thread.currentThread().isInterrupted()) {
                throw new InterruptedException("decision wait interrupted");
            }
        }
        answered.add(id);
        pending = null;
        return answer;
    }

    /**
     * Submit an answer. Returns null when accepted, or the reason.
     *
     * Synchronised, and the ORDER MATTERS: every check happens here,
     * before the value can reach the waiter.
     */
    public synchronized Reject submit(Response response) {
        Pending question = pending;

        if (question == null) {
            // The dangerous case. An answer with no question
            // outstanding, if queued, answers the NEXT question.
            return Reject.NOT_PENDING;
        }
        // §6.102 — against the AUTHORISED seat, not the one the
        // decision is about. Under Mindslaver the player being
        // acted for must not be able to answer for themselves.
        if (question.authorisedSeat() != response.seat()) {
            return Reject.WRONG_SEAT;
        }
        if (answered.contains(response.decisionId())) {
            return Reject.DUPLICATE;
        }
        if (response.decisionId() != question.decisionId()) {
            return Reject.STALE_DECISION;
        }
        if (response.expectedStateVersion() != question.stateVersion()) {
            return Reject.STALE_STATE;
        }
        if (response.choice() == null && question.mandatory()) {
            // The rules leave no "no" here. Refusing keeps the
            // game waiting, which is right: the alternative is
            // choosing somebody's cards for them.
            return Reject.PASS_NOT_ALLOWED;
        }
        if (response.choice() != null && !question.options().contains(response.choice())) {
            // §6.101 — the answer must name one of the candidates
            // THIS decision offered. An id from a previous question
            // is not a legal answer to this one.
            return Reject.STALE_DECISION;
        }
        if (!accepted.offer(response.choice() == null ? PASS : response.choice())) {
            // The slot is full: this question already has an answer.
            return Reject.DUPLICATE;
        }
        return null;
    }

    /** What a pass looks like in the slot, since null cannot be queued. */
    public static final String PASS = "pass";
}
