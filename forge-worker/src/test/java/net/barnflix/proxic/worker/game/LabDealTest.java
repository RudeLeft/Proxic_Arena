package net.barnflix.proxic.worker.game;

import com.google.gson.JsonParser;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** TEST ONLY -- the Mechanics Lab's deal (protocol/README.md, "Test-only: the Lab's deal"). */
class LabDealTest {

    private static JsonObject seat(String json) {
        return JsonParser.parseString(json).getAsJsonObject();
    }

    /** A START_GAME seat exactly as the server builds it (WorkerFrames.startGameFrame). */
    private static final String SERVER_SEAT =
            "{\"displayName\":\"Alice\",\"seatNumber\":1,\"stops\":true,"
                    + "\"cards\":[{\"name\":\"Island\",\"quantity\":60}]}";

    @Test
    void aSeatAsTheServerSendsItCarriesNoDeal() {
        // No deal: GameHost subscribes no dealer, so Forge's shuffle stands.
        assertNull(LabDeal.read(seat(SERVER_SEAT)));
        assertNull(LabDeal.read(seat("{\"displayName\":\"A\",\"labDeal\":null,\"cards\":[]}")));
    }

    @Test
    void onlyTheLabsCommandLineSwitchesItOn() {
        // The server starts the worker as: java -jar <jar> <res> (MatchWorker).
        assertFalse(LabDeal.allowed(new String[] {"/app/forge/res"}));
        assertFalse(LabDeal.allowed(new String[] {}));
        assertTrue(LabDeal.allowed(new String[] {"/app/forge/res", "--lab-deal"}));
    }

    @Test
    void anEmptyDealLeavesForgesShuffleAlone() {
        List<String> shuffled = List.of("Island", "Bear", "Island", "Sol Ring", "Bear", "Island", "Bear", "Island", "Bear");
        assertEquals(shuffled, new LabDeal(List.of(), List.of()).arrange(shuffled, s -> s, 7));
    }

    @Test
    void theHandAndTheNextDrawsAreDealtInOrder() {
        List<String> shuffled = List.of("I1", "B1", "I2", "S1", "B2", "I3", "B3", "I4", "B4", "I5");
        LabDeal deal = LabDeal.read(seat(
                "{\"labDeal\":{\"hand\":[\"S\",\"B\"],\"top\":[\"B\"]}}"));
        assertNotNull(deal);
        assertEquals(List.of("S", "B"), deal.hand);
        assertEquals(List.of("B"), deal.top);
        // Here a card's name is its first letter.
        List<String> out = deal.arrange(shuffled, s -> s.substring(0, 1), 4);
        // Hand: S1, B1, then the shuffle's next two (I1, I2); draws: B2; rest as shuffled.
        assertEquals(List.of("S1", "B1", "I1", "I2", "B2", "I3", "B3", "I4", "B4", "I5"), out);
        assertEquals(shuffled.size(), out.size());
    }

    @Test
    void aCardTheDeckDoesNotHoldIsRefusedBeforeTheGame() {
        LabDeal deal = new LabDeal(List.of("Sol Ring", "Sol Ring"), List.of("Island"));
        assertNull(deal.problem(Map.of("Sol Ring", 2, "Island", 30), 7));
        assertNotNull(deal.problem(Map.of("Sol Ring", 1, "Island", 30), 7));
        assertNotNull(new LabDeal(List.of("I", "I", "I", "I", "I", "I", "I", "I"), List.of())
                .problem(Map.of("I", 60), 7));
        assertThrows(IllegalArgumentException.class,
                () -> deal.arrange(List.of("Island"), s -> s, 7));
    }
}
