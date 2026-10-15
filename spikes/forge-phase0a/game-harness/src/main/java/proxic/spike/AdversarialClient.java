package proxic.spike;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Phase 0A P0A-G / P0A-H — a headless client that misbehaves on purpose.
 *
 * `PHASE_00 §0.67` allows a headless test client rather than a browser,
 * and this is it. It answers honestly most of the time, and
 * deliberately injects the three failure modes §0.68–§0.70 name, plus a
 * mid-game disconnect for §0.67.
 *
 * Crucially it attacks through the SAME entry point a real client uses
 * (`DecisionGate.submit`), with no privileged test-only path. A harness
 * that bypasses the boundary it is testing proves nothing (AGENTS
 * TEST-002, and §6.6 Layer C's "must not use a privileged test-only
 * gameplay bypass").
 */
final class AdversarialClient {

    private final String seat;
    private final DecisionGate gate;
    private final BlockingQueue<DecisionGate.Pending> inbox = new ArrayBlockingQueue<>(64);
    private final java.util.function.Function<DecisionGate.Pending, Object> answerFn;

    /** The last question this client saw, for replaying it as a duplicate. */
    private volatile DecisionGate.Pending lastSeen;
    private volatile boolean stop = false;

    static int sentDuplicate = 0;
    static int sentStale = 0;
    static int sentStaleUnknown = 0;
    static int sentStaleState = 0;
    static int sentWrongSeat = 0;
    static int disconnects = 0;
    static int reconnects = 0;

    AdversarialClient(String seat, DecisionGate gate,
                      java.util.function.Function<DecisionGate.Pending, Object> answerFn) {
        this.seat = seat;
        this.gate = gate;
        this.answerFn = answerFn;
        gate.connect(seat);
    }

    /** Called by the gate when a question is addressed to this seat. */
    void deliver(DecisionGate.Pending p) {
        if (!gate.isConnected(seat)) {
            // Dropped client: the question stands, unanswered, and the
            // worker stays alive. This is the P0A-H precondition.
            return;
        }
        inbox.offer(p);
    }

    void start() {
        Thread t = new Thread(() -> {
            int handled = 0;
            while (!stop) {
                DecisionGate.Pending p;
                try {
                    p = inbox.poll(100, TimeUnit.MILLISECONDS);
                } catch (InterruptedException e) {
                    return;
                }
                if (p == null) continue;
                lastSeen = p;
                handled++;

                // --- adversarial injections, before the honest answer ---

                // §0.70 wrong player: answer a question addressed to the
                // other seat. Uses this client's own seat label, so the
                // gate must reject on ownership, not on content.
                if (handled % 7 == 0) {
                    sentWrongSeat++;
                    gate.submit(new DecisionGate.Response(
                            p.decisionId(), seat + "-IMPOSTOR",
                            p.stateVersion(), answerFn.apply(p)));
                }

                // §0.69 stale, two distinct shapes:
                //
                // (a) an id that has already been answered. This is
                //     caught by the duplicate ledger, which is the
                //     correct rejection but reports as DUPLICATE.
                // (b) an id that was NEVER asked. Only this exercises
                //     the STALE_DECISION branch, and it is the shape a
                //     lagging or malicious client actually produces.
                if (handled % 5 == 0 && p.decisionId() > 1) {
                    sentStale++;
                    gate.submit(new DecisionGate.Response(
                            p.decisionId() - 1, seat,
                            p.stateVersion(), answerFn.apply(p)));
                }
                if (handled % 6 == 0) {
                    sentStaleUnknown++;
                    gate.submit(new DecisionGate.Response(
                            p.decisionId() + 500, seat,
                            p.stateVersion(), answerFn.apply(p)));
                }
                // A response carrying a state version the server has
                // moved past: right decision, stale view of the world.
                if (handled % 8 == 0) {
                    sentStaleState++;
                    gate.submit(new DecisionGate.Response(
                            p.decisionId(), seat,
                            p.stateVersion() - 1, answerFn.apply(p)));
                }

                // The honest answer.
                Object a = answerFn.apply(p);
                gate.submit(new DecisionGate.Response(
                        p.decisionId(), seat, p.stateVersion(), a));

                // §0.68 duplicate: send the SAME answer again, after it
                // has already been accepted. If this is not rejected it
                // becomes the answer to the NEXT question.
                if (handled % 3 == 0) {
                    sentDuplicate++;
                    gate.submit(new DecisionGate.Response(
                            p.decisionId(), seat, p.stateVersion(), a));
                }

                // §0.67 reconnect: drop and come back, once, mid-game.
                if (handled == 11 || handled == 37) {
                    disconnects++;
                    gate.disconnect(seat);
                    try {
                        Thread.sleep(150);
                    } catch (InterruptedException e) {
                        return;
                    }
                    DecisionGate.Pending outstanding = gate.resume(seat);
                    reconnects++;
                    if (outstanding != null) {
                        // The worker kept the seat and re-offers the
                        // question. Answer it as a returning client.
                        inbox.offer(outstanding);
                    }
                }
            }
        }, "client-" + seat);
        t.setDaemon(true);
        t.start();
    }

    void stop() {
        stop = true;
    }

    static void report() {
        System.out.println();
        System.out.println("=== P0A-H client behaviour ===");
        System.out.printf("    %-34s %d%n", "duplicate responses sent", sentDuplicate);
        System.out.printf("    %-34s %d%n", "stale (already-answered id) sent", sentStale);
        System.out.printf("    %-34s %d%n", "stale (never-asked id) sent", sentStaleUnknown);
        System.out.printf("    %-34s %d%n", "stale (old state version) sent", sentStaleState);
        System.out.printf("    %-34s %d%n", "wrong-seat responses sent", sentWrongSeat);
        System.out.printf("    %-34s %d%n", "disconnects", disconnects);
        System.out.printf("    %-34s %d%n", "reconnects", reconnects);
    }
}
