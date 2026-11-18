package net.barnflix.proxic.worker.game;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Spec 0088 (owner 2026-11-13, Q2 A and Q3 C) -- every report a reader has
 * not closed yet.
 *
 * Until 0088 the worker kept one latest report and cleared it when a turn
 * began, so a report made in an end step vanished at the turn line and each
 * new report replaced the last. Now a report stays until its reader closes
 * the window (Q2 A), and a newer one gathers the older ones into the same
 * window (Q3 C): the book keeps every report since each reader last closed
 * theirs. Closing is per reader -- Alice closing her window leaves Bob's as
 * it is -- and up to the newest stamp that reader was shown, so a report
 * made a moment after the click is not lost.
 *
 * Pure (no Forge): [P] is a player, [R] a report. A report made for one
 * reader alone (an empty look, ActionReports#emptyLook) names that reader.
 * Thread-safe: reports are written on the game thread, read as each
 * snapshot is built, and closed from the command thread.
 */
final class ReportBook<P, R> {

    /** Kept at most, the oldest going first: a reader who never closes the window is not a leak. */
    static final int KEPT = 40;

    /**
     * Spec 0088, Amendment 1 (owner 2026-11-14, "keep only 3 rows") -- the
     * window shows at most this many older reports as rows above the newest;
     * older ones drop off.
     */
    static final int ROWS = 3;

    /** What one reader's window holds, oldest first: the newest and at most ROWS before it. */
    static <T> List<T> window(List<T> open) {
        return open.size() <= ROWS + 1 ? open : new ArrayList<>(open.subList(open.size() - ROWS - 1, open.size()));
    }

    /** One report: its stamp (rising), and the one reader it is for, or null for every reader. */
    record Entry<P, R>(long key, P onlyFor, R report) {}

    private final List<Entry<P, R>> entries = new ArrayList<>();
    private final Map<P, Long> closed = new ConcurrentHashMap<>();

    /** A new report, newest last. The same report again (merged into in place) is kept once. */
    synchronized void add(long key, P onlyFor, R report) {
        for (Entry<P, R> each : entries) {
            if (each.key() == key) {
                return;
            }
        }
        entries.add(new Entry<>(key, onlyFor, report));
        while (entries.size() > KEPT) {
            entries.remove(0);
        }
    }

    /** [reader] closed the window, which showed reports up to [upTo]: those are gone for them. */
    void close(P reader, long upTo) {
        if (reader == null) {
            return;
        }
        closed.merge(reader, upTo, Math::max);
    }

    /** The newest stamp [reader] has closed, or 0. */
    long closedBy(P reader) {
        return reader == null ? 0 : closed.getOrDefault(reader, 0L);
    }

    /**
     * The reports [reader] has not closed, oldest first: every report for
     * everyone, and those made for [reader] alone.
     */
    synchronized List<Entry<P, R>> openFor(P reader) {
        long after = closedBy(reader);
        List<Entry<P, R>> out = new ArrayList<>();
        for (Entry<P, R> each : entries) {
            if (each.key() > after && (each.onlyFor() == null || each.onlyFor().equals(reader))) {
                out.add(each);
            }
        }
        return out;
    }

    /** Forget the reports every one of [readers] has closed. */
    synchronized void prune(Iterable<P> readers) {
        long all = Long.MAX_VALUE;
        for (P reader : readers) {
            all = Math.min(all, closedBy(reader));
        }
        final long upTo = all == Long.MAX_VALUE ? 0 : all;
        entries.removeIf(each -> each.key() <= upTo);
    }

    /**
     * Spec 0102, item 1 (owner, Decided 1) -- the game restarted (Karn
     * Liberated): every report is forgotten, for every reader. What each
     * reader closed is kept (stamps keep rising), so nothing comes back.
     */
    synchronized void clear() {
        entries.clear();
    }

    synchronized int size() {
        return entries.size();
    }
}
