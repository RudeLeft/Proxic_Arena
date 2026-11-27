package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.spellability.SpellAbilityStackInstance;

import java.util.HashSet;
import java.util.Set;

/**
 * Spec 0105 -- the stack always shows. A spell, ability or trigger nobody
 * can answer used to resolve a few thousandths of a second after it was put
 * on the stack: both seats were passed for at once (PriorityStops), and the
 * object was gone before either screen had drawn it there. Now the pass that
 * will let it resolve, with nobody having been asked about it, is held: the
 * boards say the top of the stack is resting ({@code rest: {ms, arriveMs}}
 * on its stack entry) and the game thread waits that long before passing,
 * as {@link PriorityStops#STEP_PAUSE_MS} does for a passed step.
 *
 * Nothing here decides who is asked ({@link PriorityStops#shouldAsk} does)
 * or what is legal; it only decides how long a pass the worker makes takes.
 * A game with no seat on the stops rule (a Mechanics Lab check driving the
 * worker directly) never rests.
 *
 * Forge's own record of who has passed since the top was put on
 * ({@code PhaseHandler.pFirstPriority}) is private with no getter, so the
 * passes are counted here, per top-of-stack id: reset when the top changes,
 * and when a seat plays something (Forge resets its own count then, CR
 * 117.3c). Forge resolves the top when every player in the game has passed
 * in succession; the pass that completes that count is the resting one.
 */
public final class StackRests {

    /** Owner 2026-11-19, Q2 B -- the least any seat sees an unanswered object rest. */
    public static final long REST_MS = 2500;
    /** Owner 2026-11-19, Q2 B ("several in a row") -- each rest after the first in a run. */
    public static final long REST_NEXT_MS = 800;
    /**
     * The time a cast spell takes to reach the stack on the slowest seat: on
     * the other player's screen the caster's mana balls land first
     * (manaBalls.tsx BALL_MS, 620 ms), then the card flips, is held face up
     * and flies (CastingCard.tsx FLIP_MS + HOLD_MS + FLY_MS, 1630 ms), then
     * its stack card fades in (Board.tsx LANDED_FADE_MS, 176 ms): 2426 ms
     * unpaced, 2870 at spec 0106's 1.25 pace (the face-up hold is a wait, not
     * paced). A presentation allowance held here so each seat's ring runs at
     * least REST_MS after its card lands; the page tests pin the page to it
     * (fixes0105.test.ts). Spec 0105 Amendment 1 (owner 2026-11-19, "Wait 1 s
     * longer"): 3100, was 2000, which left the other player about 2.0 s of
     * ring. Spec 0105 Amendment 2 (owner 2026-11-20, "Wait 0.3 s longer"):
     * 3400, was 3100 -- on a slow CI runner the other player's card arrived
     * at 3150.7 ms and its ring ran 2493.5 ms; the spare time over the paper
     * arrival goes from 230 ms to 530 ms.
     */
    public static final long ARRIVE_SPELL_MS = 3400;
    /** An ability or trigger rising to the stack (Board.tsx RISE_MS, 520 ms; 650 after 0106); a copy too. */
    public static final long ARRIVE_ABILITY_MS = 700;

    /** One rest: the stack entry, the whole sleep, and the arrival allowance it includes. */
    public record Rest(int entry, long ms, long arriveMs) {}

    /** Any seat follows the stops rule ({@link PriorityStops#active}). */
    private final java.util.function.BooleanSupplier ruled;

    /** The stack instance on top when last seen, -1 for an empty stack. */
    private int top = -1;
    /** Seats that have passed since `top` was put on (or since somebody last played something). */
    private final Set<Integer> passed = new HashSet<>();
    /** Somebody was asked something while `top` was on top. */
    private boolean asked;
    /** Entries that have already rested (an object rests once). */
    private final Set<Integer> rested = new HashSet<>();
    /** The last rest's run is still going: no question since, the stack never empty since. */
    private boolean inRun;
    /** The rest the boards are saying now, or null. */
    private volatile Rest resting;

    private final Object wake = new Object();
    private boolean woken;

    public StackRests(java.util.function.BooleanSupplier ruled) {
        this.ruled = ruled;
    }

    /** The top of the stack is `entry` (-1: empty). A new top starts a new count. */
    synchronized void see(int entry) {
        if (entry != top) {
            top = entry;
            passed.clear();
            asked = false;
        }
        if (entry < 0) {
            inRun = false;
        }
    }

    /** A question is being asked of some seat while `entry` is on top: it never rests, and a run ends. */
    synchronized void asked(int entry) {
        see(entry);
        if (entry >= 0) {
            asked = true;
        }
        inRun = false;
    }

    /** A seat played something (a spell, an ability, a mana ability): Forge starts counting passes again. */
    synchronized void acted(int entry) {
        see(entry);
        passed.clear();
    }

    /**
     * `seat` passes with `entry` on top (`players` seats in the game, the
     * top a spell that flies there, or not). The rest to take now, when this
     * pass is the one that lets the top resolve with nobody having been asked
     * about it; null otherwise.
     */
    synchronized Rest passing(int seat, int entry, int players, boolean flies) {
        see(entry);
        if (entry < 0) {
            return null;
        }
        passed.add(seat);
        if (!ruled.getAsBoolean() || passed.size() < players || asked || rested.contains(entry)) {
            return null;
        }
        rested.add(entry);
        long arrive = inRun ? 0 : flies ? ARRIVE_SPELL_MS : ARRIVE_ABILITY_MS;
        long ms = inRun ? REST_NEXT_MS : arrive + REST_MS;
        inRun = true;
        return new Rest(entry, ms, arrive);
    }

    /** The stack instance on top of `game`'s stack, -1 when it is empty. */
    static int topOf(Game game) {
        if (game == null || game.getStack().isEmpty()) {
            return -1;
        }
        SpellAbilityStackInstance first = game.getStack().peek();
        return first == null ? -1 : first.getId();
    }

    /**
     * Whether the top of the stack is a spell that is CAST onto it (the other
     * player's screen flips it, holds it and flies it: ARRIVE_SPELL_MS). A
     * copy appears on the stack directly: an ability's allowance.
     */
    static boolean flies(Game game) {
        if (game == null || game.getStack().isEmpty()) {
            return false;
        }
        SpellAbilityStackInstance first = game.getStack().peek();
        if (first == null || !first.isSpell()) {
            return false;
        }
        Card source = first.getSourceCard();
        return source != null && !source.isCopiedSpell() && !Copies.of(game).isCastCopy(source);
    }

    /** The boards now say `rest` (null: no rest). */
    void show(Rest rest) {
        resting = rest;
    }

    public Rest resting() {
        return resting;
    }

    /**
     * Mark the resting entry in one snapshot's stack: {@code rest: {ms,
     * arriveMs}}, nothing else -- no reason, no seat, no card (HID-005).
     */
    void mark(JsonObject snapshot) {
        Rest now = resting;
        if (now == null || snapshot == null || !snapshot.has("stack")) {
            return;
        }
        JsonArray stack = snapshot.getAsJsonArray("stack");
        String id = "stack:" + now.entry();
        for (JsonElement each : stack) {
            JsonObject entry = each.getAsJsonObject();
            if (entry.has("id") && id.equals(entry.get("id").getAsString())) {
                JsonObject rest = new JsonObject();
                rest.addProperty("ms", now.ms());
                rest.addProperty("arriveMs", now.arriveMs());
                entry.add("rest", rest);
            }
        }
    }

    /**
     * Wait out `ms` on the game thread, running `between` (the decision gate's
     * pending interjections: a concession) as a question's wait does; ends at
     * once when woken (the match stopping, the game over) or interrupted.
     */
    void sleep(long ms, Runnable between, java.util.function.BooleanSupplier over) {
        synchronized (wake) {
            woken = false;
        }
        piece(ms, between, over);
    }

    /**
     * Spec 0120 -- one piece of a rest (DecisionGate#waitOut): as `sleep`,
     * without forgetting a wake that came before it. False when the rest was
     * ended early (woken, over, interrupted).
     */
    boolean piece(long ms, Runnable between, java.util.function.BooleanSupplier over) {
        long end = System.nanoTime() + ms * 1_000_000L;
        while (true) {
            between.run();
            if (over.getAsBoolean()) {
                return false;
            }
            long left = (end - System.nanoTime()) / 1_000_000L;
            if (left <= 0) {
                return true;
            }
            synchronized (wake) {
                if (woken) {
                    return false;
                }
                try {
                    wake.wait(Math.min(left, 20));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return false;
                }
                if (woken) {
                    return false;
                }
            }
        }
    }

    /** Spec 0120 -- a new rest begins: a wake from before it is forgotten. */
    void unwake() {
        synchronized (wake) {
            woken = false;
        }
    }

    /**
     * Spec 0120 (D10) -- how long a rest runs again after a pause: a whole
     * REST_MS (the card is already on the stack, so no arrival allowance),
     * or the shorter rest of a run.
     */
    static long again(long ms) {
        return Math.min(ms, REST_MS);
    }

    /** End a rest now (a concession, the match stopping). */
    void wake() {
        synchronized (wake) {
            woken = true;
            wake.notifyAll();
        }
    }
}
