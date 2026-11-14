package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.zone.ZoneType;

import java.util.Map;
import java.util.Set;

/**
 * Spec 0088 (owner 2026-11-13, Q4 C) -- the top card of a library, when it
 * may be seen.
 *
 * Until 0088 the page was sent only a library's count, so a public or
 * playable top card (Courser of Kruphix, Future Sight, Bolas's Citadel) was
 * invisible. Who may see it is Forge's own answer, never a card's name:
 * {@code CardView#canBeShownTo}, which for a library card is true only for a
 * player its MayLookAt names (Courser's and Future Sight's "Play with the top
 * card of your library revealed": every player; the Citadel's and Vizier of
 * the Menagerie's "You may look at the top card": its owner alone). Who may
 * play it from there is Forge's too: {@code Card#mayPlay} (the MayPlay effects
 * the same cards make -- Courser only for a land). Each viewer is sent the
 * top card only when Forge lets them see it (HID-001); the other player of a
 * Citadel is sent nothing new, not even that there is something to see.
 *
 * Marked on the card: `public` when every player may see it, and `uses`
 * [{seat, how: "cast"}], each player who may play it from there -- told only
 * with the card, to a viewer who may see it.
 */
final class LibraryTops {

    private LibraryTops() {
    }

    /** The top card of [player]'s library (Forge's index 0), or null when it is empty. */
    static Card topOf(Player player) {
        forge.game.card.CardCollectionView library = player.getCardsIn(ZoneType.Library);
        return library.isEmpty() ? null : library.get(0);
    }

    /**
     * Whether [viewer] may see [top] where it lies: Forge's own question, asked
     * both ways (HID-002, STUB-004). A spectator (null) only when every player
     * may: the public view holds only what everyone can see.
     */
    static boolean shownTo(Card top, PlayerView viewer, Set<Player> players) {
        if (viewer == null) {
            return everyone(top, players);
        }
        return top.getView().canBeShownTo(viewer) && top.getView().canFaceDownBeShownTo(viewer);
    }

    private static boolean everyone(Card top, Set<Player> players) {
        if (players.isEmpty()) {
            return false;
        }
        for (Player each : players) {
            if (!shownTo(top, each.getView(), Set.of())) {
                return false;
            }
        }
        return true;
    }

    /** Mark a library top card a viewer is sent: `public`, `uses`. */
    static void mark(JsonObject entry, Card top, Set<Player> players, Map<Player, Integer> seatOf) {
        if (everyone(top, players)) {
            entry.addProperty("public", true);
        }
        JsonArray uses = new JsonArray();
        for (Player each : players) {
            if (!top.mayPlay(each).isEmpty()) {
                uses.add(use(seatOf.getOrDefault(each, 0)));
            }
        }
        if (uses.size() > 0) {
            entry.add("uses", uses);
        }
    }

    /** One player's use of a library top card, as the page reads a pile card's (spec 0087). */
    static JsonObject use(int seat) {
        JsonObject one = new JsonObject();
        one.addProperty("seat", seat);
        one.addProperty("how", "cast");
        return one;
    }
}
