package proxic.spike;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Phase 0A §0A.8 / P0A-G, P0A-H — the decision boundary.
 *
 * Sits between Forge's synchronous PlayerController call and whatever
 * answers it. Everything the transport is allowed to know and nothing
 * more (`PHASE_00` §0.71):
 *
 *     connection, seat, decision id, state version, decision owner
 *
 * It does NOT know whether a target is legal, what a card costs, or
 * whose turn it is. Those are Forge's.
 *
 * The one hard requirement is §0.68's: a response must be rejected
 * BEFORE it reaches the synchronous waiter, because a late or
 * duplicated answer that slips through does not merely get ignored —
 * it becomes the answer to whatever Forge asks NEXT. That is a silent
 * wrong move in a real game, not an error.
 */
final class DecisionGate {

    enum Reject { WRONG_SEAT, DUPLICATE, STALE_DECISION, STALE_STATE, NOT_PENDING }

    /** One outstanding question. */
    record Pending(long decisionId, String seat, String kind, long stateVersion) {}

    /** A client's answer. */
    record Response(long decisionId, String seat, long expectedStateVersion, Object answer) {}

    private final AtomicLong nextDecisionId = new AtomicLong(1);
    private final AtomicLong stateVersion = new AtomicLong(1);

    private volatile Pending pending;
    /** Decision ids already answered — the duplicate/stale ledger. */
    private final java.util.Set<Long> answered =
            java.util.Collections.synchronizedSet(new java.util.LinkedHashSet<>());
    private final BlockingQueue<Object> accepted = new ArrayBlockingQueue<>(1);

    /** Seats currently connected. A dropped seat keeps its pending decision. */
    private final java.util.Set<String> connected =
            java.util.Collections.synchronizedSet(new java.util.LinkedHashSet<>());

    static final Map<Reject, Integer> REJECTIONS = new LinkedHashMap<>();
    static int accepts = 0;
    static int resumesServed = 0;
    /** Answers that were accepted while no question was outstanding. */
    static int leakedIntoNextQuestion = 0;

    long bumpStateVersion() {
        return stateVersion.incrementAndGet();
    }

    void connect(String seat) {
        connected.add(seat);
    }

    void disconnect(String seat) {
        connected.remove(seat);
    }

    boolean isConnected(String seat) {
        return connected.contains(seat);
    }

    /**
     * What a reconnecting client is given: the latest state version and
     * the outstanding decision, if that decision belongs to it.
     * Returns null when there is nothing outstanding for that seat.
     */
    Pending resume(String seat) {
        connect(seat);
        Pending p = pending;
        if (p != null && p.seat().equals(seat)) {
            resumesServed++;
            return p;
        }
        return null;
    }

    /**
     * Ask, and block until a VALID answer arrives. Called on Forge's
     * thread, inside the controller.
     */
    Object ask(String seat, String kind, java.util.function.Consumer<Pending> deliver)
            throws InterruptedException {
        long id = nextDecisionId.getAndIncrement();
        Pending p = new Pending(id, seat, kind, stateVersion.get());
        accepted.clear();
        pending = p;
        deliver.accept(p);

        // Wait for a valid response. A disconnected seat simply has not
        // answered yet; the worker stays alive and the question stands.
        Object answer;
        while ((answer = accepted.poll(5, TimeUnit.MILLISECONDS)) == null) {
            if (Thread.currentThread().isInterrupted()) {
                throw new InterruptedException();
            }
        }
        answered.add(id);
        pending = null;
        return answer;
    }

    /**
     * Submit an answer. Returns null when accepted, or the reason.
     *
     * Order matters: every check happens here, before the value can
     * reach the waiter above.
     */
    synchronized Reject submit(Response r) {
        Pending p = pending;

        if (p == null) {
            // §0.68's dangerous case: an answer arriving with no question
            // outstanding. If this were queued it would answer the NEXT
            // question Forge asks.
            record(Reject.NOT_PENDING);
            return Reject.NOT_PENDING;
        }
        if (!p.seat().equals(r.seat())) {
            record(Reject.WRONG_SEAT);
            return Reject.WRONG_SEAT;
        }
        if (answered.contains(r.decisionId())) {
            record(Reject.DUPLICATE);
            return Reject.DUPLICATE;
        }
        if (r.decisionId() != p.decisionId()) {
            record(Reject.STALE_DECISION);
            return Reject.STALE_DECISION;
        }
        if (r.expectedStateVersion() != p.stateVersion()) {
            record(Reject.STALE_STATE);
            return Reject.STALE_STATE;
        }
        if (!accepted.offer(r.answer())) {
            // Already have an accepted answer for this question.
            record(Reject.DUPLICATE);
            return Reject.DUPLICATE;
        }
        accepts++;
        return null;
    }

    private static void record(Reject why) {
        REJECTIONS.merge(why, 1, Integer::sum);
    }

    static void report() {
        System.out.println();
        System.out.println("=== P0A-G decision authority ===");
        System.out.printf("    %-34s %d%n", "answers accepted", accepts);
        for (Reject r : Reject.values()) {
            System.out.printf("    %-34s %d%n", "rejected " + r, REJECTIONS.getOrDefault(r, 0));
        }
        System.out.printf("    %-34s %d%n", "resume requests served", resumesServed);
    }
}
