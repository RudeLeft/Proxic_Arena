package net.barnflix.proxic.worker.game;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Spec 0103, items 1-2 (owner option A, 2026-11-18) -- a report card's link
 * to the card on the table (`table`) reaches a reader only while that
 * reader's own board shows the card: never a card on the stack only, never
 * one in a hidden zone (a library, the other player's hand).
 */
class TableLinksTest {

    private static JsonObject snapshot(String json) {
        return JsonParser.parseString(json).getAsJsonObject();
    }

    private static JsonObject card(JsonObject snapshot, String report, int i) {
        JsonObject action = snapshot.getAsJsonObject("action");
        JsonObject r = report == null ? action : action.getAsJsonArray("gathered").get(0).getAsJsonObject();
        return r.getAsJsonArray("cards").get(i).getAsJsonObject();
    }

    @Test
    void aLinkStaysOnlyToACardThisBoardShows() {
        JsonObject s = snapshot("""
                {"battlefield":[{"id":"card:5"}],"graveyard":[{"id":"card:7"}],
                 "stack":[{"id":"stack:1","source":"card:9"}],
                 "action":{"key":"action:2","cards":[
                   {"id":"action:2:0","known":true,"table":"card:5"},
                   {"id":"action:2:1","known":true,"table":"card:7"},
                   {"id":"action:2:2","known":true,"table":"card:9"},
                   {"id":"action:2:3","known":true,"table":"card:40"},
                   {"id":"action:2:4","known":false,"faceDown":true,"table":"card:5"}],
                  "gathered":[{"key":"action:1","cards":[
                   {"id":"action:1:0","known":true,"table":"card:41"},
                   {"id":"action:1:1","known":true,"table":"card:5"}]}]}}""");
        assertEquals(4, HiddenIds.keepTableLinks(s));
        assertEquals("card:5", card(s, null, 0).get("table").getAsString(), "on the table");
        assertEquals("card:7", card(s, null, 1).get("table").getAsString(), "in a graveyard");
        assertFalse(card(s, null, 2).has("table"), "a stack entry's source is no card on view");
        assertFalse(card(s, null, 3).has("table"), "in no board list: a library, a hidden hand");
        assertFalse(card(s, null, 4).has("table"), "a face-down card on view stays a back");
        assertFalse(card(s, "gathered", 0).has("table"), "gathered reports too");
        assertTrue(card(s, "gathered", 1).has("table"));
    }

    @Test
    void controlALibraryCardIsNeverLinkedEvenAfterStrip() {
        // A Brainstorm put back: the card went to Alice's library. Bob's board
        // has no such card; HiddenIds' zones say card:30 is in a library.
        JsonObject s = snapshot("""
                {"battlefield":[],"action":{"key":"action:3","cards":[
                   {"id":"action:3:0","table":"card:30","to":"top"}]}}""");
        HiddenIds.keepTableLinks(s);
        HiddenIds.strip(s, Set.of("card:30"));
        assertFalse(s.toString().contains("card:30"), s.toString());
    }

    @Test
    void theBoardCardIdsAreTheListsOwnCardsOnly() {
        JsonObject s = snapshot("""
                {"battlefield":[{"id":"card:5","holds":["card:6"]}],
                 "stack":[{"id":"stack:1","source":"card:9"}],"libraryTop":[{"id":"card:8"}]}""");
        assertEquals(Set.of("card:5", "card:8"), HiddenIds.boardCardIds(s));
    }
}
