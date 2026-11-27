package net.barnflix.proxic.worker.game;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Spec 0120 (G2, F-0120-D) -- HOLD and GO: while a player's connection is
 * down the game is paused, and only Arena's own waits stop (the not-asked
 * pass, the passed step's 400 ms, the stack's 2.5 s rest). After GO a wait
 * starts again from its full length (D10). A concession still runs while
 * held; an open question is untouched.
 */
class DecisionGateHoldTest {

    private static final java.util.function.BooleanSupplier NEVER = () -> false;

    private static DecisionGate.Sleeper sleeps() {
        return ms -> {
            try {
                Thread.sleep(ms);
                return true;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        };
    }

    /** Runs `body` on another thread; returns when it ended (ms from start), or -1 if not within `limitMs`. */
    private static long timed(Runnable body, long limitMs) throws InterruptedException {
        AtomicLong took = new AtomicLong(-1);
        CountDownLatch done = new CountDownLatch(1);
        long start = System.nanoTime();
        Thread t = new Thread(() -> {
            body.run();
            took.set((System.nanoTime() - start) / 1_000_000L);
            done.countDown();
        });
        t.setDaemon(true);
        t.start();
        done.await(limitMs, TimeUnit.MILLISECONDS);
        return took.get();
    }

    @Test
    void anUnheldWaitTakesItsLength() throws InterruptedException {
        DecisionGate gate = new DecisionGate();
        long took = timed(() -> gate.waitOut(400, 400, NEVER, sleeps()), 5_000);
        assertTrue(took >= 400 && took < 700, "took " + took);
    }

    @Test
    void aWaitWhosePiecesWakeAFractionEarlyStillEnds() throws InterruptedException {
        // Found by ci-speed (match-numbers, a rest that never ended): pieces
        // that each wake 0.6 ms early, summed as whole milliseconds, once left
        // the wait at 1 ms for ever. The wait is a deadline now.
        DecisionGate gate = new DecisionGate();
        long took = timed(() -> gate.waitOut(50, 50, NEVER, ms -> {
            // Each piece ends 0.6 ms short of its length (spun, so exactly).
            long until = System.nanoTime() + ms * 1_000_000L - 600_000L;
            while (System.nanoTime() < until) {
                Thread.onSpinWait();
            }
            return true;
        }), 3_000);
        assertTrue(took >= 0 && took < 1_000, "the wait ended: " + took);
    }

    @Test
    void theStackRestPiecesEndOnTheirDeadline() throws InterruptedException {
        StackRests rests = new StackRests(() -> true);
        DecisionGate gate = new DecisionGate();
        rests.unwake();
        long took = timed(() -> gate.waitOut(2_500, 2_500, NEVER,
                piece -> rests.piece(piece, () -> { }, NEVER)), 5_000);
        assertTrue(took >= 2_490 && took < 2_800, "a whole rest, and it ended: " + took);
    }

    @Test
    void aStepPauseHeldMidwayStopsAndRunsAgainInFull() throws Exception {
        DecisionGate gate = new DecisionGate();
        AtomicLong ended = new AtomicLong();
        Thread t = new Thread(() -> {
            gate.waitOut(400, 400, NEVER, sleeps());
            ended.set(System.nanoTime());
        });
        t.start();
        Thread.sleep(200);
        gate.hold();
        Thread.sleep(1_000);
        assertEquals(0, ended.get(), "held: the step's pause does not end");
        long go = System.nanoTime();
        gate.go();
        t.join(3_000);
        long after = (ended.get() - go) / 1_000_000L;
        // The whole 400 again (not the 200 that was left).
        assertTrue(after >= 390 && after < 700, "ran " + after + " ms after GO");
    }

    @Test
    void theStackRestRunsAgainForAWholeRestAfterGo() throws Exception {
        DecisionGate gate = new DecisionGate();
        StackRests rests = new StackRests(() -> true);
        long ms = StackRests.ARRIVE_SPELL_MS + StackRests.REST_MS;
        AtomicLong ended = new AtomicLong();
        Thread t = new Thread(() -> {
            rests.unwake();
            gate.waitOut(ms, StackRests.again(ms), NEVER, piece -> rests.piece(piece, gate::interjectionsNow, NEVER));
            ended.set(System.nanoTime());
        });
        t.start();
        Thread.sleep(300);
        gate.hold();
        Thread.sleep(800);
        long go = System.nanoTime();
        gate.go();
        t.join(10_000);
        long after = (ended.get() - go) / 1_000_000L;
        assertEquals(2_500, StackRests.again(ms));
        assertTrue(after >= 2_480 && after < 2_900, "the rest ran " + after + " ms after GO (a whole 2.5 s)");
        assertEquals(StackRests.REST_NEXT_MS, StackRests.again(StackRests.REST_NEXT_MS), "a run's rest: its own length");
    }

    @Test
    void theNotAskedPassWaitsForGo() throws Exception {
        DecisionGate gate = new DecisionGate();
        gate.hold();
        AtomicBoolean passed = new AtomicBoolean();
        Thread t = new Thread(() -> {
            assertTrue(gate.waitWhileHeld(NEVER));
            passed.set(true);
        });
        t.start();
        Thread.sleep(500);
        assertFalse(passed.get(), "held: no pass");
        gate.go();
        t.join(1_000);
        assertTrue(passed.get());
        assertFalse(gate.waitWhileHeld(NEVER), "not held: no wait at all");
    }

    @Test
    void aConcessionWhileHeldRunsAndEndsTheHold() throws Exception {
        DecisionGate gate = new DecisionGate();
        gate.hold();
        AtomicBoolean conceded = new AtomicBoolean();
        Thread t = new Thread(() -> gate.waitOut(400, 400, gate::closed, sleeps()));
        t.start();
        Thread.sleep(200);
        long at = System.nanoTime();
        gate.interject(() -> {
            conceded.set(true);
            gate.close();
        });
        t.join(1_000);
        assertFalse(t.isAlive(), "the held wait ended with the game");
        assertTrue(conceded.get());
        assertTrue((System.nanoTime() - at) / 1_000_000L < 200);
    }

    @Test
    void anOpenQuestionIsUntouchedByHoldAndGo() throws Exception {
        DecisionGate gate = new DecisionGate();
        AtomicReference<DecisionGate.Pending> asked = new AtomicReference<>();
        AtomicReference<String> answer = new AtomicReference<>();
        Thread t = new Thread(() -> {
            try {
                answer.set(gate.ask(1, 1, "priority", List.of("a"), asked::set));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        t.start();
        while (asked.get() == null) {
            Thread.sleep(5);
        }
        gate.hold();
        Thread.sleep(100);
        gate.go();
        DecisionGate.Pending q = asked.get();
        assertNull(gate.submit(new DecisionGate.Response(q.decisionId(), 1, q.stateVersion(), "a")));
        t.join(1_000);
        assertEquals("a", answer.get());
    }

    @Test
    void theHoldTakesEffectWithinMilliseconds() throws Exception {
        // F-0120-D's measure: from HOLD to the wait stopping. A wait looks
        // between pieces of at most HOLD_LOOK_MS (20 ms), so a hold bites
        // when the piece under way ends.
        DecisionGate gate = new DecisionGate();
        java.util.List<Long> ends = java.util.Collections.synchronizedList(new java.util.ArrayList<>());
        Thread t = new Thread(() -> gate.waitOut(5_000, 5_000, gate::closed, ms -> {
            try {
                Thread.sleep(ms);
                ends.add(System.nanoTime());
                return true;
            } catch (InterruptedException e) {
                return false;
            }
        }));
        t.start();
        Thread.sleep(300);
        long held = System.nanoTime();
        gate.hold();
        Thread.sleep(300);
        long stopped = ends.stream().filter(e -> e >= held).findFirst().orElse(held);
        long piecesAfter = ends.stream().filter(e -> e >= held).count();
        long bite = (stopped - held) / 1_000_000L;
        System.out.println("[0120] HOLD took effect " + bite + " ms after it came");
        assertTrue(piecesAfter <= 1, "no new piece began once held: " + piecesAfter);
        assertTrue(bite < 40, "the hold bit " + bite + " ms after HOLD");
        gate.close();
        gate.go();
        t.join(1_000);
    }
}
