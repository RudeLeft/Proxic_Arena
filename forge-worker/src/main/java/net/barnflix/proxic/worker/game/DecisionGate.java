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
 * `seat` here is the player being ACTED FOR. Which connection is
 * AUTHORISED to answer is the server's question, not this one —
 * §0A.8 requires those to stay separate, and mind-slave effects are
 * exactly where they come apart.
 */
public final class DecisionGate {

    /** Why an answer was refused. §6.101's list, as outcomes. */
    public enum Reject {
        NOT_PENDING,
        WRONG_SEAT,
        DUPLICATE,
        STALE_DECISION,
        STALE_STATE,
    }

    /** One outstanding question. */
    public record Pending(long decisionId, String seat, String kind, long stateVersion,
                          java.util.List<String> options) {}

    /** A client's answer. */
    public record Response(long decisionId, String seat, long expectedStateVersion,
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
    public String ask(String seat, String kind, java.util.List<String> options,
                      Consumer<Pending> deliver) throws InterruptedException {
        long id = nextDecisionId.getAndIncrement();
        Pending question = new Pending(id, seat, kind, stateVersion.get(), options);

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
        if (!question.seat().equals(response.seat())) {
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
