package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.IntFunction;

/**
 * Spec 0103, item 4 (Decided 2, owner 2026-11-17) -- the cards a player knows
 * are on top of their own library, because they put them there in an order
 * they chose: Brainstorm's put back, a scry or a surveil kept on top, a
 * look-and-reorder (MatchController's arrangeForScry, arrangeForSurveil,
 * willPutCardOnTop and orderMoveToZoneList answers).
 *
 * Forge does not remember this (CardView#canBeShownTo hides a library card
 * from its owner once the prompt's temporary look ends), so the worker keeps
 * it, as SeenHands keeps what a seat was shown of a hand. It is the ONE place
 * the worker, not Forge, decides a library card may be shown -- the HID-002
 * exception the owner approved 2026-11-17, recorded in
 * docs/architecture/MATCH_STATE_VISIBILITY.md.
 *
 * Bookkeeping, per seat:
 *  - [chose] records an answer: these cards, top first, are going on top of
 *    the answering player's own library. Pending until they are there: known
 *    once every one of them has moved in ([movedIn]) -- at once, since a draw
 *    can follow before any board is sent (Brainstorm at the end of the other
 *    player's turn, then the draw step: found by the real-click game) -- or
 *    once a snapshot sees the library's top cards ARE that list.
 *  - [knownFor] (each snapshot) never returns anything that is not exactly
 *    the library's top cards now, in that order (anything else is dropped).
 *  - [movedIn]: any other card moved into, or within, that library forgets
 *    what was known (the order is no longer the player's).
 *  - [movedOut]: the top known card leaving (a draw, a mill) pops it; any
 *    other known card leaving forgets the rest.
 *  - [shuffled]: forgets everything for that library.
 *
 * Sent as `knownTop` in the owner's own snapshot ONLY (GameHost), never to
 * the other seat or a spectator; each card under a stand-in id
 * ("known:SEAT:I", as a report's cards are "action:N:I"), never the card's
 * own -- a library card's id is a live handle (HiddenIds). Pure: tested
 * without a game (KnownTopsTest).
 *
 * Known limit (STUB-005): a new answer replaces what was known below it (a
 * scry 1 kept on top over a known Brainstorm pair remembers the one card).
 */
final class KnownTops {

    private final Map<Integer, List<Integer>> known = new HashMap<>();
    private final Map<Integer, List<Integer>> pending = new HashMap<>();
    /** Of each pending list, the cards already moved into the library. */
    private final Map<Integer, java.util.Set<Integer>> arrived = new HashMap<>();

    /** [seat] chose to put these cards, top first, on top of its own library. */
    synchronized void chose(int seat, List<Integer> topFirst) {
        if (topFirst == null || topFirst.isEmpty()) {
            return;
        }
        pending.put(seat, new ArrayList<>(topFirst));
        arrived.put(seat, new java.util.HashSet<>());
    }

    /** A card was moved into (or within) [seat]'s library. */
    synchronized void movedIn(int seat, int cardId) {
        List<Integer> waiting = pending.get(seat);
        if (waiting != null && waiting.contains(cardId)) {
            // The answer being carried out: known once all of it is in.
            java.util.Set<Integer> in = arrived.computeIfAbsent(seat, k -> new java.util.HashSet<>());
            in.add(cardId);
            if (in.containsAll(waiting)) {
                known.put(seat, new ArrayList<>(waiting));
                pending.remove(seat);
                arrived.remove(seat);
            }
            return;
        }
        known.remove(seat);
    }

    /** A card left [seat]'s library (drawn, milled, exiled...). */
    synchronized void movedOut(int seat, int cardId) {
        List<Integer> list = known.get(seat);
        if (list != null && !list.isEmpty()) {
            if (list.get(0) == cardId) {
                list.remove(0);
            } else if (list.contains(cardId)) {
                known.remove(seat);
            }
        }
        List<Integer> waiting = pending.get(seat);
        if (waiting != null && waiting.contains(cardId)) {
            pending.remove(seat);
            arrived.remove(seat);
        }
    }

    /** [seat]'s library was shuffled: nothing about its order is known. */
    synchronized void shuffled(int seat) {
        known.remove(seat);
        pending.remove(seat);
        arrived.remove(seat);
    }

    /**
     * What [seat] knows of its library's top now: [library] is that library,
     * top first. Only ever a prefix of it, so nothing stale is ever sent.
     */
    synchronized List<Integer> knownFor(int seat, List<Integer> library) {
        List<Integer> waiting = pending.get(seat);
        if (waiting != null && isPrefix(waiting, library)) {
            known.put(seat, new ArrayList<>(waiting));
            pending.remove(seat);
            arrived.remove(seat);
        }
        List<Integer> list = known.get(seat);
        if (list == null || list.isEmpty()) {
            return List.of();
        }
        if (!isPrefix(list, library)) {
            known.remove(seat);
            return List.of();
        }
        return List.copyOf(list);
    }

    private static boolean isPrefix(List<Integer> head, List<Integer> library) {
        if (head.size() > library.size()) {
            return false;
        }
        for (int i = 0; i < head.size(); i++) {
            if (!head.get(i).equals(library.get(i))) {
                return false;
            }
        }
        return true;
    }

    /**
     * Adds `knownTop` to [snapshot], [ownerSeat]'s own (never call it for
     * another seat's or the public view): each known card as [describe] gives
     * it (shown to its owner), under a stand-in id. Nothing when nothing is
     * known. Returns how many cards were added.
     */
    int addTo(JsonObject snapshot, int ownerSeat, List<Integer> library, IntFunction<JsonObject> describe) {
        List<Integer> cards = knownFor(ownerSeat, library);
        if (cards.isEmpty()) {
            return 0;
        }
        JsonArray out = new JsonArray();
        for (int i = 0; i < cards.size(); i++) {
            JsonObject card = describe.apply(cards.get(i));
            if (card == null) {
                break;
            }
            card.addProperty("id", "known:" + ownerSeat + ":" + i);
            out.add(card);
        }
        if (out.size() > 0) {
            snapshot.add("knownTop", out);
        }
        return out.size();
    }
}
