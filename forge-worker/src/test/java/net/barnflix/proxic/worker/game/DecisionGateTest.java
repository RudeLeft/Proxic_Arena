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

    private static final int ALICE = 1;
    private static final int BOB = 2;

    /** Ask on another thread, so the test can submit while it blocks. */
    private static final class Asker {
        final DecisionGate gate;
        final AtomicReference<String> answer = new AtomicReference<>();
        final CountDownLatch asked = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(1);
        volatile DecisionGate.Pending pending;
        final Thread thread;

        /**
         * Holds the asking thread INSIDE `ask`, before it starts
         * polling for an answer.
         *
         * `ask` sets `pending`, clears the slot and then calls
         * the publisher; the wait loop only begins once the
         * publisher returns. Blocking in the publisher therefore
         * freezes the gate in the exact state a duplicate test
         * needs: a question outstanding, an empty slot, and a
         * waiter that cannot wake and clear `pending` underneath
         * the assertions.
         *
         * Open by default, so every other test behaves as before.
         */
        final CountDownLatch release = new CountDownLatch(1);

        Asker(DecisionGate gate, int seat) {
            this(gate, seat, seat);
        }

        /** Let the asking thread out of `ask` and into its wait. */
        void letItWait() {
            release.countDown();
        }

        Asker(DecisionGate gate, int actedFor, int authorised) {
            this.gate = gate;
            this.thread =
                    new Thread(() -> {
                        try {
                            answer.set(gate.ask(actedFor, authorised,
                                    "chooseSpellAbilityToPlay", OPTIONS, p -> {
                                pending = p;
                                asked.countDown();
                                try {
                                    release.await(5, TimeUnit.SECONDS);
                                } catch (InterruptedException e) {
                                    Thread.currentThread().interrupt();
                                }
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

        /**
         * Wait until the question exists, then let the waiter run.
         *
         * The duplicate test uses `awaitAskedAndHold` instead,
         * because it needs the waiter held still.
         */
        void awaitAsked() throws InterruptedException {
            awaitAskedAndHold();
            letItWait();
        }

        void awaitAskedAndHold() throws InterruptedException {
            assertTrue(asked.await(5, TimeUnit.SECONDS), "the gate never published a question");
        }
    }

    @Test
    void a_valid_answer_reaches_the_waiter() throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker asker = new Asker(gate, ALICE);
        asker.awaitAsked();

        assertNull(gate.submit(new DecisionGate.Response(
                asker.pending.decisionId(), ALICE, asker.pending.stateVersion(),
                "action:0:card:7")));

        assertTrue(asker.done.await(5, TimeUnit.SECONDS), "the waiter never resumed");
        assertEquals("action:0:card:7", asker.answer.get());
    }

    /** §6.102 — User B cannot answer User A's decision. */
    @Test
    void the_wrong_seat_is_refused() throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker asker = new Asker(gate, ALICE);
        asker.awaitAsked();

        assertEquals(
                DecisionGate.Reject.WRONG_SEAT,
                gate.submit(new DecisionGate.Response(
                        asker.pending.decisionId(), BOB, asker.pending.stateVersion(),
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
        Asker asker = new Asker(gate, ALICE);
        // HELD, deliberately. This test is about the single slot
        // specifically, which only exists as a distinct defence
        // while the waiter has not woken: once it does, `pending`
        // is cleared and a second answer is refused as
        // NOT_PENDING by a different check.
        //
        // The first version of this test did not hold anything
        // and asserted DUPLICATE anyway, so it was a coin toss
        // between two refusals. It never lost locally and lost on
        // the first CI runner that was busy enough.
        asker.awaitAskedAndHold();

        DecisionGate.Response same = new DecisionGate.Response(
                asker.pending.decisionId(), ALICE, asker.pending.stateVersion(),
                "action:0:card:7");

        assertNull(gate.submit(same));
        assertEquals(DecisionGate.Reject.DUPLICATE, gate.submit(same));

        // And the answer that WAS accepted still gets through,
        // so the duplicate was refused rather than the pair.
        asker.letItWait();
        assertTrue(asker.done.await(5, TimeUnit.SECONDS), "the waiter never resumed");
        assertEquals("action:0:card:7", asker.answer.get());
    }

    /**
     * §6.103 again, in the gap BETWEEN the two defences: the waiter
     * has taken the first answer out of the slot (so the slot is
     * empty again) but has not yet written the ledger. A second,
     * different answer arriving then found nothing in its way and
     * was ACCEPTED -- the Mechanics Lab's coin-flip check caught it,
     * one run in six, as a second call to a coin flip that was not
     * refused. Left there, it could answer the next question.
     *
     * The gap cannot be held open from outside, so this races it:
     * answer, then immediately answer differently, many times. Every
     * second answer must be refused and every waiter must get the
     * first.
     */
    @Test
    void a_second_answer_is_refused_while_the_waiter_wakes() throws Exception {
        DecisionGate gate = new DecisionGate();
        int accepted = 0;
        for (int i = 0; i < 3000; i++) {
            Asker asker = new Asker(gate, ALICE);
            asker.awaitAsked();
            long id = asker.pending.decisionId();
            long version = asker.pending.stateVersion();
            assertNull(gate.submit(new DecisionGate.Response(id, ALICE, version, "action:0:card:7")));
            if (gate.submit(new DecisionGate.Response(id, ALICE, version, "action:1:card:9")) == null) {
                accepted++;
            }
            assertTrue(asker.done.await(5, TimeUnit.SECONDS), "the waiter never resumed");
            assertEquals("action:0:card:7", asker.answer.get(), "the second answer replaced the first");
        }
        assertEquals(0, accepted, "second answers accepted");
    }

    /**
     * And the LEDGER defence: an answer to a decision that has
     * already been answered and closed.
     */
    @Test
    void an_answer_to_a_closed_decision_is_refused() throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker first = new Asker(gate, ALICE);
        first.awaitAsked();
        long oldId = first.pending.decisionId();
        long oldVersion = first.pending.stateVersion();
        assertNull(gate.submit(new DecisionGate.Response(
                oldId, ALICE, oldVersion, "action:0:card:7")));
        assertTrue(first.done.await(5, TimeUnit.SECONDS));

        // A second question is now outstanding.
        Asker second = new Asker(gate, ALICE);
        second.awaitAsked();

        // The late answer to the FIRST one must not become the
        // answer to the second. This is the 203-leak case.
        assertEquals(
                DecisionGate.Reject.DUPLICATE,
                gate.submit(new DecisionGate.Response(
                        oldId, ALICE, oldVersion, "action:0:card:7")));
        assertEquals(1, second.done.getCount(), "a stale answer leaked into the next question");
    }

    /** §6.104 — an answer composed against an older board. */
    @Test
    void a_stale_state_version_is_refused() throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker asker = new Asker(gate, ALICE);
        asker.awaitAsked();

        assertEquals(
                DecisionGate.Reject.STALE_STATE,
                gate.submit(new DecisionGate.Response(
                        asker.pending.decisionId(), ALICE,
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
                gate.submit(new DecisionGate.Response(1, ALICE, 1, "action:0:card:7")));
    }

    /** §6.101 — the choice must be one this decision offered. */
    @Test
    void an_action_that_was_not_offered_is_refused() throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker asker = new Asker(gate, ALICE);
        asker.awaitAsked();

        assertEquals(
                DecisionGate.Reject.STALE_DECISION,
                gate.submit(new DecisionGate.Response(
                        asker.pending.decisionId(), ALICE, asker.pending.stateVersion(),
                        "action:0:card:999")));
    }

    /**
     * §6.37, §6.38 — MINDSLAVER. The decision is ABOUT Alice; the
     * human allowed to answer it is Bob.
     *
     * The two assertions are the whole rule. Bob answers because
     * Bob controls the decision, and Alice is refused even though
     * the decision concerns her own player. A gate that carried
     * one seat could not express this, and the natural single-seat
     * implementation gets it exactly backwards.
     */
    @Test
    void the_controller_answers_not_the_player_controlled() throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker asker = new Asker(gate, ALICE, BOB);
        asker.awaitAsked();

        assertEquals(ALICE, asker.pending.actedForSeat());
        assertEquals(BOB, asker.pending.authorisedSeat());

        // The player being acted for does not get to answer.
        assertEquals(
                DecisionGate.Reject.WRONG_SEAT,
                gate.submit(new DecisionGate.Response(
                        asker.pending.decisionId(), ALICE, asker.pending.stateVersion(),
                        "action:0:card:7")));
        assertEquals(1, asker.done.getCount(), "the controlled player answered for themselves");

        // The controller does.
        assertNull(gate.submit(new DecisionGate.Response(
                asker.pending.decisionId(), BOB, asker.pending.stateVersion(),
                "action:0:card:7")));
        assertTrue(asker.done.await(5, TimeUnit.SECONDS), "the waiter never resumed");
    }

    /**
     * Some decisions have no "no".
     *
     * Discarding down to hand size is the plain case: the rules
     * say discard, so only WHICH is open, and Forge's own input
     * disables cancelling for it. A pass must be refused rather
     * than answered for -- nobody else may choose a player's
     * cards, so the game waits instead.
     */
    @Test
    void a_pass_is_refused_when_the_rules_do_not_allow_one() throws Exception {
        DecisionGate gate = new DecisionGate();
        AtomicReference<String> answer = new AtomicReference<>();
        CountDownLatch asked = new CountDownLatch(1);
        AtomicReference<DecisionGate.Pending> pending = new AtomicReference<>();
        Thread asker =
                new Thread(() -> {
                    try {
                        answer.set(gate.ask(ALICE, ALICE, "discard", OPTIONS, true, p -> {
                            pending.set(p);
                            asked.countDown();
                        }));
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                });
        asker.setDaemon(true);
        asker.start();
        assertTrue(asked.await(5, TimeUnit.SECONDS));
        assertTrue(pending.get().mandatory());

        assertEquals(
                DecisionGate.Reject.PASS_NOT_ALLOWED,
                gate.submit(new DecisionGate.Response(
                        pending.get().decisionId(), ALICE, pending.get().stateVersion(), null)));

        // And a real choice still works, so the refusal is about
        // the pass and not about the decision.
        assertNull(gate.submit(new DecisionGate.Response(
                pending.get().decisionId(), ALICE, pending.get().stateVersion(),
                "action:0:card:7")));
        assertEquals("action:0:card:7", pollAnswer(answer));
    }

    private static String pollAnswer(AtomicReference<String> answer) throws InterruptedException {
        for (int i = 0; i < 100 && answer.get() == null; i++) {
            Thread.sleep(20);
        }
        return answer.get();
    }

    /** Passing is an answer, and it is allowed. */
    @Test
    void a_pass_is_accepted() throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker asker = new Asker(gate, ALICE);
        asker.awaitAsked();

        assertNull(gate.submit(new DecisionGate.Response(
                asker.pending.decisionId(), ALICE, asker.pending.stateVersion(), null)));

        assertTrue(asker.done.await(5, TimeUnit.SECONDS));
        assertEquals(DecisionGate.PASS, asker.answer.get());
    }

    /**
     * PHASE_07 §7.55 — a concession runs on the WAITING thread, and
     * closing withdraws the question: Forge is told "no", and the
     * answer the player was about to send is refused.
     */
    @Test
    void an_interjection_runs_on_the_asking_thread_and_closing_withdraws_the_question()
            throws Exception {
        DecisionGate gate = new DecisionGate();
        Asker asker = new Asker(gate, ALICE);
        asker.awaitAsked();

        AtomicReference<Thread> ranOn = new AtomicReference<>();
        gate.interject(() -> {
            ranOn.set(Thread.currentThread());
            gate.close();
        });

        assertTrue(asker.done.await(5, TimeUnit.SECONDS), "closing never released the waiter");
        assertEquals(asker.thread, ranOn.get(), "the interjection ran on the wrong thread");
        assertEquals(DecisionGate.PASS, asker.answer.get());
        assertNull(gate.pending());
        assertEquals(
                DecisionGate.Reject.NOT_PENDING,
                gate.submit(new DecisionGate.Response(
                        asker.pending.decisionId(), ALICE, asker.pending.stateVersion(),
                        "action:0:card:7")));
    }

    /** Once closed, nothing more is asked of anybody. */
    @Test
    void a_closed_gate_answers_no_at_once_and_publishes_nothing() throws Exception {
        DecisionGate gate = new DecisionGate();
        gate.close();
        AtomicReference<DecisionGate.Pending> published = new AtomicReference<>();

        assertEquals(DecisionGate.PASS,
                gate.ask(ALICE, ALICE, "chooseSingleEntity", OPTIONS, true, published::set));
        assertNull(published.get(), "a closed gate still published a question");
    }
}
