package net.barnflix.proxic.worker.game;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Spec 0088 (owner 2026-11-13) -- reports that stay and gather. Q2 A: a
 * report stays until its reader closes the window (no turn line clears it).
 * Q3 C: a newer report gathers the older ones; closing clears the gathered
 * set, for that reader only.
 */
class ReportBookTest {

    private static final String ALICE = "Alice";
    private static final String BOB = "Bob";

    private static List<String> open(ReportBook<String, String> book, String reader) {
        return book.openFor(reader).stream().map(ReportBook.Entry::report).toList();
    }

    @Test
    void aReportStaysUntilItsReaderClosesIt() {
        // F-0088-B: Bob's Opt in Alice's end step, then Bob's turn begins.
        ReportBook<String, String> book = new ReportBook<>();
        book.add(7, null, "Bob scried 1");
        assertEquals(List.of("Bob scried 1"), open(book, ALICE));
        book.close(ALICE, 7);
        assertEquals(List.of(), open(book, ALICE));
    }

    @Test
    void newerReportsGatherTheOlderOnesOldestFirst() {
        // F-0088-C: two fetch lands, then Consider.
        ReportBook<String, String> book = new ReportBook<>();
        book.add(3, null, "Strand");
        book.add(5, null, "Delta");
        book.add(9, null, "Consider");
        assertEquals(List.of("Strand", "Delta", "Consider"), open(book, ALICE));
    }

    @Test
    void theWindowHoldsTheNewestAndAtMostThreeOlderOnes() {
        // Amendment 1 (owner): two fetch lands and three Considers -- the first search drops off.
        assertEquals(List.of("Strand", "C1", "C2", "C3"),
                ReportBook.window(List.of("Delta", "Strand", "C1", "C2", "C3")));
        assertEquals(List.of("Delta", "Strand"), ReportBook.window(List.of("Delta", "Strand")));
        assertEquals(3, ReportBook.ROWS);
    }

    @Test
    void closingIsForThatReaderAloneAndUpToWhatTheyWereShown() {
        ReportBook<String, String> book = new ReportBook<>();
        book.add(3, null, "Strand");
        book.add(5, null, "Delta");
        book.close(ALICE, 5);
        // Made a moment after her click: not lost.
        book.add(9, null, "Consider");
        assertEquals(List.of("Consider"), open(book, ALICE));
        assertEquals(List.of("Strand", "Delta", "Consider"), open(book, BOB));
        // An older close never reopens anything.
        book.close(ALICE, 2);
        assertEquals(List.of("Consider"), open(book, ALICE));
    }

    @Test
    void aReportMadeForOneReaderIsTheirsAlone() {
        ReportBook<String, String> book = new ReportBook<>();
        book.add(4, BOB, "You looked at Alice's hand. It has no cards.");
        assertEquals(List.of(), open(book, ALICE));
        assertEquals(List.of("You looked at Alice's hand. It has no cards."), open(book, BOB));
    }

    @Test
    void theSameReportMergedIntoIsKeptOnce() {
        ReportBook<String, String> book = new ReportBook<>();
        book.add(4, null, "Voice of All");
        book.add(4, null, "Voice of All");
        assertEquals(1, book.size());
    }

    @Test
    void whatEveryReaderClosedIsForgottenAndTheBookIsBounded() {
        ReportBook<String, String> book = new ReportBook<>();
        book.add(1, null, "one");
        book.add(2, null, "two");
        book.close(ALICE, 2);
        book.prune(List.of(ALICE, BOB));
        assertEquals(2, book.size());
        book.close(BOB, 1);
        book.prune(List.of(ALICE, BOB));
        assertEquals(1, book.size());
        for (int i = 10; i < 10 + ReportBook.KEPT + 5; i++) {
            book.add(i, null, "r" + i);
        }
        assertEquals(ReportBook.KEPT, book.size());
        assertEquals("r" + (10 + 5), open(book, BOB).get(0));
    }
}
