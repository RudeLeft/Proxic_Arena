package net.barnflix.proxic.worker.game;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * No seat is sent a live id for a card in a zone hidden from it -- the
 * round Krark, the Thumbless lost his flip (2026-11-08): Alice's (seat 1)
 * Lightning Bolt, card:7, went from the stack back to her hand.
 */
class HiddenIdsTest {

    /** Alice holds the Bolt (7) and a Forest (8); Bob holds Shock (20); libraries 30 and 31. */
    private static final Map<Integer, Map<String, List<Integer>>> ZONES = Map.of(
            1, Map.of("hand", List.of(7, 8), "library", List.of(30)),
            2, Map.of("hand", List.of(20), "library", List.of(31)));

    /** The round as Forge's history has it, before any seat's view is applied. */
    private static JsonObject round(String ownHand) {
        return JsonParser.parseString("""
                {"battlefield": [{"id": "card:39"}],
                 "hand": %s,
                 "otherHands": [],
                 "stack": [],
                 "moves": [{"card": "card:7", "from": {"zone": "stack"}, "to": {"zone": "hand", "seat": 1},
                            "why": "countered", "said": "Countered"},
                           {"card": "card:50", "from": {"zone": "battlefield", "seat": 2},
                            "to": {"zone": "graveyard", "seat": 2}, "said": "Died"}],
                 "payments": [{"n": 21, "for": "card:7", "mana": [{"colour": "R", "from": "card:39"}]}],
                 "rolls": [{"n": 1, "source": "card:7"}],
                 "damage": {"hits": [{"source": "card:7", "target": {"object": "card:39"}}]},
                 "playLog": [{"parts": [{"name": "Lightning Bolt", "id": "card:7"}, " returned"]}],
                 "action": {"source": "card:31", "targets": ["card:31", "card:39"]}}
                """.formatted(ownHand)).getAsJsonObject();
    }

    @Test
    void bobIsToldTheBoltWentHomeButIsGivenNoHandleOnIt() {
        JsonObject bob = round("[{\"id\": \"card:20\"}]");
        int removed = HiddenIds.strip(bob, HiddenIds.hiddenZones(ZONES, 2));
        String sent = bob.toString();
        assertFalse(sent.contains("card:7\""), "no id of Alice's hand card: " + sent);
        assertFalse(sent.contains("card:31\""), "nor of a card in a library: " + sent);
        assertEquals(7, removed);
        JsonObject move = bob.getAsJsonArray("moves").get(0).getAsJsonObject();
        assertFalse(move.has("card"));
        assertFalse(move.has("why"), "what travels only with a card goes with it");
        assertFalse(move.has("said"));
        assertEquals("hand", move.getAsJsonObject("to").get("zone").getAsString(), "where it went is public");
        JsonObject payment = bob.getAsJsonArray("payments").get(0).getAsJsonObject();
        assertFalse(payment.has("for"));
        assertEquals("card:39", payment.getAsJsonArray("mana").get(0).getAsJsonObject().get("from").getAsString(),
                "the land on the table keeps its id");
        JsonObject line = bob.getAsJsonArray("playLog").get(0).getAsJsonObject()
                .getAsJsonArray("parts").get(0).getAsJsonObject();
        assertEquals("Lightning Bolt", line.get("name").getAsString(), "the name is history and stays");
        assertEquals(List.of("card:39").toString(),
                bob.getAsJsonObject("action").getAsJsonArray("targets").toString().replace("\"", ""));
        // A token that died is in no hidden zone: its move keeps its card and its tag.
        JsonObject token = bob.getAsJsonArray("moves").get(1).getAsJsonObject();
        assertEquals("card:50", token.get("card").getAsString());
        assertEquals("Died", token.get("said").getAsString());
    }

    @Test
    void aliceKeepsEveryHandleOnHerOwnHand() {
        // HID-003: both seats. A guard that blanked the Bolt for Alice too would be wrong.
        JsonObject alice = round("[{\"id\": \"card:7\"}, {\"id\": \"card:8\"}]");
        HiddenIds.strip(alice, HiddenIds.hiddenZones(ZONES, 1));
        JsonObject move = alice.getAsJsonArray("moves").get(0).getAsJsonObject();
        assertEquals("card:7", move.get("card").getAsString());
        assertEquals("Countered", move.get("said").getAsString());
        assertEquals("card:7", alice.getAsJsonArray("payments").get(0).getAsJsonObject().get("for").getAsString());
        assertFalse(alice.toString().contains("card:31\""), "a library is hidden from its owner too");
    }

    @Test
    void aHandForgeLetsTheViewerSeeKeepsItsIds() {
        // Mindslaver / Telepathy: Forge put Alice's hand in Bob's otherHands.
        JsonObject bob = round("[{\"id\": \"card:20\"}]");
        bob.add("otherHands", JsonParser.parseString("[{\"id\": \"card:7\"}]"));
        HiddenIds.strip(bob, HiddenIds.hiddenZones(ZONES, 2));
        assertTrue(bob.getAsJsonArray("moves").get(0).getAsJsonObject().has("card"));
    }

    @Test
    void aSpectatorSeesNoHandAtAll() {
        Set<String> hidden = HiddenIds.hiddenZones(ZONES, null);
        assertEquals(Set.of("card:7", "card:8", "card:20", "card:30", "card:31"), hidden);
        JsonObject everyone = round("[]");
        HiddenIds.strip(everyone, hidden);
        assertFalse(everyone.toString().contains("card:7\""));
    }

    @Test
    void revealedCardsGoneToAHandStayInTheTrayUnderAStandIn() {
        // Goblin Ringleader revealed Alice's top four; a Goblin went to her
        // hand (card:8), a Forest to the bottom of her library (card:30).
        JsonObject bob = JsonParser.parseString("""
                {"hand": [{"id": "card:20"}],
                 "reveal": {"key": "r5", "source": "card:39",
                            "cards": [{"id": "card:8", "name": "Goblin Piker", "seat": 1},
                                      {"id": "card:30", "name": "Forest", "seat": 1},
                                      {"id": "card:39", "name": "Goblin Ringleader", "seat": 1}]}}
                """).getAsJsonObject();
        HiddenIds.strip(bob, HiddenIds.hiddenZones(ZONES, 2));
        com.google.gson.JsonArray cards = bob.getAsJsonObject("reveal").getAsJsonArray("cards");
        assertEquals(3, cards.size(), "every revealed card stays in the tray");
        assertEquals("reveal:r5:0", cards.get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("Goblin Piker", cards.get(0).getAsJsonObject().get("name").getAsString());
        assertEquals("reveal:r5:1", cards.get(1).getAsJsonObject().get("id").getAsString());
        assertEquals("card:39", cards.get(2).getAsJsonObject().get("id").getAsString(), "one on the table keeps its own");
        assertFalse(bob.toString().contains("card:8\""));
    }

    @Test
    void aManaFromACardNowHiddenSaysUnseen() {
        JsonObject bob = JsonParser.parseString("""
                {"payments": [{"n": 3, "mana": [{"colour": "G", "from": "card:8"}]}]}
                """).getAsJsonObject();
        HiddenIds.strip(bob, HiddenIds.hiddenZones(ZONES, 2));
        assertEquals("unseen", bob.getAsJsonArray("payments").get(0).getAsJsonObject()
                .getAsJsonArray("mana").get(0).getAsJsonObject().get("from").getAsString());
    }
}
