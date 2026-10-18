package net.barnflix.proxic.worker.game;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The decision boundary — PHASE_06 §6.101–§6.104, PHASE_0A §0A.8.
 *
 * Every test here is a measured failure from Phase 0A rather than a
 * hypothetical. The requirement is that a response is rejected
 * BEFORE it reaches the blocked waiter, because an answer that
 * slips through is not ignored — it becomes the answer to whatever
 * Forge asks NEXT. That is a silent wrong move in a real game.
 *
 * Phase 0A measured 203 such leaks in one game with both duplicate
 * defences removed, and noted that removing either one ALONE looked
 * safe. So there are tests for each defence separately.
 */
class DecisionGateTest {

    private static final List<String> OPTIONS = List.of("action:0:card:7", "action:1:card:9");

    /** Ask on another thread, so the test can submit while it blocks. */
    private static final class Asker {
        final DecisionGate gate;
        final AtomicReference<String> answer = new AtomicReference<>();
        final CountDownLatch asked = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(1);
        volatile DecisionGate.Pending pending;
        final Thread thread;

        Asker(DecisionGate gate, String seat) {
            this.gate = gate;
            this.thread =
                    new Thread(() -> {
                        try {
                            answer.set(gate.ask(seat, "chooseSpellAbilityToPlay", OPTIONS, p -> {
                                pending = p;
                                asked.countDown();
                            }));
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                        } finally {
                            done.countDown();
                        }
                    });
            thread.setDaemon(true);
            thread.start();
        }

        void awaitAsked() throws InterruptedException {
            assertTrue(asked.await(5, TimeUnit.SECONDS), "the gate never published a question");
        }
    }

    @Test
    void a_valid_answer_reaches_the_waiter() throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker asker = new Asker(gate, "Alice");
        asker.awaitAsked();

        assertNull(gate.submit(new DecisionGate.Response(
                asker.pending.decisionId(), "Alice", asker.pending.stateVersion(),
                "action:0:card:7")));

        assertTrue(asker.done.await(5, TimeUnit.SECONDS), "the waiter never resumed");
        assertEquals("action:0:card:7", asker.answer.get());
    }

    /** §6.102 — User B cannot answer User A's decision. */
    @Test
    void the_wrong_seat_is_refused() throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker asker = new Asker(gate, "Alice");
        asker.awaitAsked();

        assertEquals(
                DecisionGate.Reject.WRONG_SEAT,
                gate.submit(new DecisionGate.Response(
                        asker.pending.decisionId(), "Bob", asker.pending.stateVersion(),
                        "action:0:card:7")));

        assertEquals(1, asker.done.getCount(), "a wrong-seat answer reached the waiter");
    }

    /**
     * §6.103 — the first valid answer wins and a duplicate does not
     * execute twice.
     *
     * This is the SINGLE-SLOT defence: the ledger has not recorded
     * the id yet, because the waiter has not woken. Phase 0A found
     * that removing this one alone still looked safe.
     */
    @Test
    void a_duplicate_is_refused_before_the_waiter_wakes() throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker asker = new Asker(gate, "Alice");
        asker.awaitAsked();

        DecisionGate.Response same = new DecisionGate.Response(
                asker.pending.decisionId(), "Alice", asker.pending.stateVersion(),
                "action:0:card:7");

        assertNull(gate.submit(same));
        assertEquals(DecisionGate.Reject.DUPLICATE, gate.submit(same));
    }

    /**
     * And the LEDGER defence: an answer to a decision that has
     * already been answered and closed.
     */
    @Test
    void an_answer_to_a_closed_decision_is_refused() throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker first = new Asker(gate, "Alice");
        first.awaitAsked();
        long oldId = first.pending.decisionId();
        long oldVersion = first.pending.stateVersion();
        assertNull(gate.submit(new DecisionGate.Response(
                oldId, "Alice", oldVersion, "action:0:card:7")));
        assertTrue(first.done.await(5, TimeUnit.SECONDS));

        // A second question is now outstanding.
        Asker second = new Asker(gate, "Alice");
        second.awaitAsked();

        // The late answer to the FIRST one must not become the
        // answer to the second. This is the 203-leak case.
        assertEquals(
                DecisionGate.Reject.DUPLICATE,
                gate.submit(new DecisionGate.Response(
                        oldId, "Alice", oldVersion, "action:0:card:7")));
        assertEquals(1, second.done.getCount(), "a stale answer leaked into the next question");
    }

    /** §6.104 — an answer composed against an older board. */
    @Test
    void a_stale_state_version_is_refused() throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker asker = new Asker(gate, "Alice");
        asker.awaitAsked();

        assertEquals(
                DecisionGate.Reject.STALE_STATE,
                gate.submit(new DecisionGate.Response(
                        asker.pending.decisionId(), "Alice",
                        asker.pending.stateVersion() - 1, "action:0:card:7")));
    }

    /**
     * The most dangerous case of all: an answer with NO question
     * outstanding. Queued, it would answer the next one.
     */
    @Test
    void an_answer_with_no_question_is_refused() {
        DecisionGate gate = new DecisionGate();

        assertEquals(
                DecisionGate.Reject.NOT_PENDING,
                gate.submit(new DecisionGate.Response(1, "Alice", 1, "action:0:card:7")));
    }

    /** §6.101 — the choice must be one this decision offered. */
    @Test
    void an_action_that_was_not_offered_is_refused() throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker asker = new Asker(gate, "Alice");
        asker.awaitAsked();

        assertEquals(
                DecisionGate.Reject.STALE_DECISION,
                gate.submit(new DecisionGate.Response(
                        asker.pending.decisionId(), "Alice", asker.pending.stateVersion(),
                        "action:0:card:999")));
    }

    /** Passing is an answer, and it is allowed. */
    @Test
    void a_pass_is_accepted() throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker asker = new Asker(gate, "Alice");
        asker.awaitAsked();

        assertNull(gate.submit(new DecisionGate.Response(
                asker.pending.decisionId(), "Alice", asker.pending.stateVersion(), null)));

        assertTrue(asker.done.await(5, TimeUnit.SECONDS));
        assertEquals(DecisionGate.PASS, asker.answer.get());
    }
}
