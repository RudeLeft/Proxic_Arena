package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.player.Player;
import forge.game.player.PlayerView;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Spec 0064 -- the play log: what happened, in plain English, written for
 * EACH SEAT from only what that seat may see.
 *
 * Never from Forge's own game log (GAME_LOG, which can name hidden cards
 * and goes to the admin record only). Each line is built from Forge's
 * events as they happen, and every card in it is named for a seat only if
 * Forge says that seat may identify it at that moment -- both questions,
 * canBeShownTo and canFaceDownBeShownTo (HID-002, STUB-004) -- or if the
 * card was public in the zone it just left (a creature bounced to a hand
 * was on the table for everyone). Anything else is "a card", "a face-down
 * creature". The visibility is decided when the event happens, not when
 * the line is sent: a card drawn and then discarded in one round was drawn
 * as "a card" for the other player, and stays so.
 *
 * HID-005 -- a line never reaches the table ahead of the board: lines wait
 * here until the next snapshot round and go out IN that round's snapshots
 * (`playLog`), each carrying the round's revision, so the page shows a line
 * only once the board it is drawing is at least that revision.
 *
 * The worker keeps nothing once a round is sent; the server keeps each
 * seat's lines for the match (LiveMatch) and sends them again on
 * reconnect. A round is bounded (ROUND_LIMIT), and runs of the same thing
 * are one line ("Alice created 12 Goblin tokens", "Bob drew 7 cards").
 */
final class PlayLog {

    /** At most this many lines in one round; the rest is one "and N more" line. */
    static final int ROUND_LIMIT = 300;

    /** What one seat reads for one fact; null when the fact says nothing to that seat. */
    interface Phrase {
        JsonArray words(int seat, List<JsonElement> items);
    }

    /**
     * One thing that happened. `items` are the cards (or players) it is
     * about, per seat, as that seat may know them: a name part, or null for
     * a card that seat may not identify. Facts with the same `key` one after
     * the other become one line.
     */
    static final class Fact {
        String kind;
        final int turn;
        final int active;
        final String step;
        String key;
        Phrase phrase;
        final Map<Integer, List<JsonElement>> items = new HashMap<>();
        /** Life totals after it ({seat, total}), public. */
        final JsonArray life = new JsonArray();
        /** Told to this seat only (what Forge showed it), or null for every seat. */
        Integer only;
        /** A card gone from a library to a hand, until we know whether it was drawn. */
        Integer unsettled;
        Integer unsettledSeat;
        /** A life loss that a damage event may yet explain (seat, amount). */
        int lossSeat;
        int lossAmount;

        Fact(String kind, int turn, int active, String step) {
            this.kind = kind;
            this.turn = turn;
            this.active = active;
            this.step = step;
        }

        List<JsonElement> itemsFor(int seat) {
            return items.computeIfAbsent(seat, k -> new ArrayList<>());
        }
    }

    private final Game game;
    private final java.util.function.Function<Player, Integer> seatOf;

    private final List<Fact> pending = new ArrayList<>();
    private int dropped;
    private final Map<Integer, Integer> numbered = new HashMap<>();
    /** Cards public where they are now, as every seat may name them. */
    private final Map<Integer, JsonObject> publicNames = new HashMap<>();
    private final Set<Integer> sacrificing = new HashSet<>();
    private final Set<Integer> landsPlayed = new HashSet<>();

    PlayLog(Game game, java.util.function.Function<Player, Integer> seatOf) {
        this.game = game;
        this.seatOf = seatOf;
    }

    // --- who and where ---------------------------------------------------------------------

    private List<Player> players() {
        List<Player> out = new ArrayList<>();
        for (Player player : game.getRegisteredPlayers()) {
            if (seatOf.apply(player) != null) {
                out.add(player);
            }
        }
        return out;
    }

    private Player playerOf(PlayerView view) {
        if (view == null) {
            return null;
        }
        for (Player player : game.getRegisteredPlayers()) {
            if (player.getId() == view.getId()) {
                return player;
            }
        }
        return null;
    }

    private int seat(Player player) {
        Integer seat = player == null ? null : seatOf.apply(player);
        return seat == null ? 0 : seat;
    }

    private int seat(PlayerView view) {
        return seat(playerOf(view));
    }

    static JsonObject player(int seat) {
        JsonObject part = new JsonObject();
        part.addProperty("player", seat);
        return part;
    }

    private static String stepOf(forge.game.phase.PhaseType phase) {
        if (phase == null) {
            return "Before the game";
        }
        return switch (phase) {
            case UNTAP, UPKEEP, DRAW -> "Beginning";
            case MAIN1 -> "Main 1";
            case COMBAT_BEGIN, COMBAT_DECLARE_ATTACKERS, COMBAT_DECLARE_BLOCKERS,
                    COMBAT_FIRST_STRIKE_DAMAGE, COMBAT_DAMAGE, COMBAT_END -> "Combat";
            case MAIN2 -> "Main 2";
            default -> "End";
        };
    }

    private Fact fact(String kind) {
        forge.game.phase.PhaseHandler ph = game.getPhaseHandler();
        return new Fact(kind, ph.getTurn(), seat(ph.getPlayerTurn()), stepOf(ph.getPhase()));
    }

    // --- naming a card for one seat -------------------------------------------------------

    /** Whether Forge lets [viewer] identify this card where it is now: both questions. */
    static boolean maySee(CardView view, PlayerView viewer) {
        return view != null && viewer != null
                && view.canBeShownTo(viewer) && view.canFaceDownBeShownTo(viewer);
    }

    /** The card as a name part (its own name, its owner and controller); null without a name. */
    private JsonObject named(Card card, CardView view) {
        String name;
        boolean down;
        int id;
        if (card != null) {
            down = card.isFaceDown();
            name = down ? card.getState(forge.card.CardStateName.Original).getName() : card.getName();
            id = card.getId();
        } else {
            down = view.isFaceDown();
            name = down ? null : view.getName();
            id = view.getId();
        }
        if (name == null || name.isEmpty()) {
            return null;
        }
        JsonObject part = new JsonObject();
        part.addProperty("name", name);
        // MatchArt's word for "this viewer may identify it": it then wears
        // its picture, and the seat may fetch it (the snapshot rule).
        part.addProperty("known", true);
        part.addProperty("id", "card:" + id);
        Player owner = card != null ? card.getOwner() : playerOf(view.getOwner());
        Player controller = card != null ? card.getController() : playerOf(view.getController());
        part.addProperty("owner", seat(owner));
        part.addProperty("seat", seat(controller));
        if (card != null ? card.isToken() : view.isToken()) {
            part.addProperty("token", true);
            if (name.endsWith(" Token")) {
                part.addProperty("label", name.substring(0, name.length() - " Token".length()));
            }
        } else if (card != null && card.getPaperCard() != null && card.getPaperCard().getEdition() != null
                && !card.getPaperCard().getEdition().isEmpty()) {
            part.addProperty("printing", card.getPaperCard().getEdition() + "/"
                    + card.getPaperCard().getCollectorNumber());
        }
        if (down) {
            part.addProperty("faceDown", true);
        }
        return part;
    }

    /** The card as [viewer] may know it now: a name part, or null. */
    private JsonObject cardFor(Card card, CardView view, Player viewer) {
        CardView v = card != null ? card.getView() : view;
        if (!maySee(v, viewer.getView())) {
            return null;
        }
        return named(card, v);
    }

    private Card find(CardView view) {
        return view == null ? null : game.findById(view.getId());
    }

    /** Every seat may identify it now. */
    private boolean isPublic(Card card, CardView view) {
        CardView v = card != null ? card.getView() : view;
        List<Player> all = players();
        if (all.isEmpty() || v == null) {
            return false;
        }
        for (Player each : all) {
            if (!maySee(v, each.getView())) {
                return false;
            }
        }
        return true;
    }

    /** Each seat's view of one card, into the fact's items. */
    private void addCard(Fact fact, Card card, CardView view) {
        for (Player viewer : players()) {
            fact.itemsFor(seat(viewer)).add(cardFor(card, view, viewer));
        }
    }

    private void addPlayer(Fact fact, int seat) {
        for (Player viewer : players()) {
            fact.itemsFor(seat(viewer)).add(player(seat));
        }
    }

    // --- words ------------------------------------------------------------------------------

    static void text(JsonArray out, String words) {
        if (out.size() > 0 && out.get(out.size() - 1).isJsonPrimitive()) {
            String before = out.get(out.size() - 1).getAsString();
            out.set(out.size() - 1, new JsonPrimitive(before + words));
        } else {
            out.add(words);
        }
    }

    static void part(JsonArray out, JsonElement part, String hidden) {
        if (part == null) {
            text(out, hidden);
        } else if (part.isJsonPrimitive()) {
            text(out, part.getAsString());
        } else {
            out.add(part.deepCopy());
            JsonObject p = part.getAsJsonObject();
            if (p.has("faceDown") && p.get("faceDown").getAsBoolean()) {
                text(out, " (face down)");
            }
        }
    }

    /** "A", "A and B", "A, B and C"; hidden ones counted at the end ("and 2 cards"). */
    static void list(JsonArray out, List<JsonElement> items, String one, String many) {
        List<JsonElement> named = new ArrayList<>();
        int hidden = 0;
        for (JsonElement item : items) {
            if (item == null) {
                hidden++;
            } else {
                named.add(item);
            }
        }
        List<Object> all = new ArrayList<>(named);
        if (hidden > 0) {
            all.add(hidden == 1 ? one : hidden + " " + many);
        }
        for (int i = 0; i < all.size(); i++) {
            if (i > 0) {
                text(out, i == all.size() - 1 ? " and " : ", ");
            }
            Object each = all.get(i);
            if (each instanceof JsonElement element) {
                part(out, element, one);
            } else {
                text(out, (String) each);
            }
        }
    }

    static int count(List<JsonElement> items) {
        return items.size();
    }

    static String cards(int n, String one, String many) {
        return n == 1 ? one : n + " " + many;
    }

    /** The line starts with a capital, whatever its first words are. */
    static JsonArray capital(JsonArray out) {
        if (out.size() > 0 && out.get(0).isJsonPrimitive()) {
            String first = out.get(0).getAsString();
            if (!first.isEmpty()) {
                out.set(0, new JsonPrimitive(Character.toUpperCase(first.charAt(0)) + first.substring(1)));
            }
        }
        return out;
    }

    private static int namedIn(JsonArray parts) {
        int n = 0;
        for (JsonElement part : parts) {
            if (part.isJsonObject() && part.getAsJsonObject().has("name")) {
                n++;
            }
        }
        return n;
    }

    // --- the round --------------------------------------------------------------------------

    private void add(Fact fact) {
        settleLast();
        if (pending.size() >= ROUND_LIMIT) {
            dropped++;
            return;
        }
        pending.add(fact);
        if (fact.unsettled == null) {
            mergeLast();
        }
    }

    /** A library-to-hand move becomes a draw, or not, once Forge has counted it. */
    private void settleLast() {
        if (pending.isEmpty()) {
            return;
        }
        Fact last = pending.get(pending.size() - 1);
        if (last.unsettled == null) {
            return;
        }
        Card card = game.findById(last.unsettled);
        // Before the first turn every card to a hand is the opening hand: drawn.
        boolean drawn = last.turn == 0 || (card != null && card.getDrawnThisTurn());
        int who = last.unsettledSeat;
        last.unsettled = null;
        last.kind = drawn ? "draw" : "move";
        if (drawn) {
            last.key = "draw:" + who;
            last.phrase = (seat, items) -> {
                JsonArray out = new JsonArray();
                out.add(player(who));
                text(out, " drew ");
                list(out, items, "a card", "cards");
                return out;
            };
        } else {
            last.key = "tohand:" + who;
            last.phrase = (seat, items) -> {
                JsonArray out = new JsonArray();
                out.add(player(who));
                text(out, " put ");
                list(out, items, "a card", "cards");
                text(out, " into their hand from their library");
                return out;
            };
        }
        mergeLast();
    }

    private void mergeLast() {
        int size = pending.size();
        if (size < 2) {
            return;
        }
        Fact last = pending.get(size - 1);
        Fact before = pending.get(size - 2);
        if (last.key == null || !last.key.equals(before.key) || before.unsettled != null
                || last.turn != before.turn || !last.step.equals(before.step) || last.only != null
                || before.only != null) {
            return;
        }
        last.items.forEach((seat, items) -> before.itemsFor(seat).addAll(items));
        last.life.forEach(before.life::add);
        pending.remove(size - 1);
    }

    /**
     * This round's lines, per seat, numbered per seat, each with the
     * round's revision; then forgotten. Called once per snapshot round.
     */
    synchronized Map<Integer, JsonArray> flush(long revision) {
        settleLast();
        Map<Integer, JsonArray> out = new LinkedHashMap<>();
        List<Player> all = players();
        if (dropped > 0) {
            int more = dropped;
            Fact rest = fact("other");
            rest.phrase = (seat, items) -> {
                JsonArray words = new JsonArray();
                words.add("And " + more + " more things happened");
                return words;
            };
            pending.add(rest);
            dropped = 0;
        }
        List<Integer> seats = new ArrayList<>();
        all.forEach(viewer -> seats.add(seat(viewer)));
        out.putAll(lines(pending, seats, revision, numbered));
        pending.clear();
        return out;
    }

    /**
     * The facts as each seat reads them: one line per fact per seat it says
     * something to, numbered per seat. A line is `private` when it names
     * more cards than another seat's line for the same fact (only you were
     * told), or when it was told to that seat alone.
     */
    static Map<Integer, JsonArray> lines(List<Fact> facts, List<Integer> seats, long revision,
            Map<Integer, Integer> numbered) {
        Map<Integer, JsonArray> out = new LinkedHashMap<>();
        for (Fact fact : facts) {
            Map<Integer, JsonArray> said = new LinkedHashMap<>();
            for (int seat : seats) {
                if (fact.only != null && fact.only != seat) {
                    continue;
                }
                JsonArray words = fact.phrase == null ? new JsonArray()
                        : fact.phrase.words(seat, fact.itemsFor(seat));
                if (words != null) {
                    said.put(seat, capital(words));
                }
            }
            int fewest = said.values().stream().mapToInt(PlayLog::namedIn).min().orElse(0);
            for (Map.Entry<Integer, JsonArray> each : said.entrySet()) {
                int seat = each.getKey();
                JsonObject line = new JsonObject();
                line.addProperty("n", numbered.merge(seat, 1, Integer::sum));
                line.addProperty("rev", revision);
                line.addProperty("turn", fact.turn);
                line.addProperty("active", fact.active);
                line.addProperty("step", fact.step);
                line.addProperty("kind", fact.kind);
                line.add("parts", each.getValue());
                if (fact.life.size() > 0) {
                    line.add("life", fact.life.deepCopy());
                }
                if (fact.only != null || namedIn(each.getValue()) > fewest) {
                    line.addProperty("private", true);
                }
                out.computeIfAbsent(seat, k -> new JsonArray()).add(line);
            }
        }
        return out;
    }

    /**
     * Every card id a snapshot carries for its viewer (any `id` or stack
     * `source`, anywhere but the play log itself): the cards that viewer's
     * board shows right now.
     */
    static java.util.Set<String> cardIds(JsonElement node) {
        java.util.Set<String> out = new HashSet<>();
        collect(node, out);
        return out;
    }

    private static void collect(JsonElement node, java.util.Set<String> out) {
        if (node == null || node.isJsonNull() || node.isJsonPrimitive()) {
            return;
        }
        if (node.isJsonArray()) {
            node.getAsJsonArray().forEach(child -> collect(child, out));
            return;
        }
        for (Map.Entry<String, JsonElement> entry : node.getAsJsonObject().entrySet()) {
            if ("playLog".equals(entry.getKey())) {
                continue;
            }
            JsonElement value = entry.getValue();
            if (("id".equals(entry.getKey()) || "source".equals(entry.getKey())) && value.isJsonPrimitive()
                    && value.getAsString().startsWith("card:")) {
                out.add(value.getAsString());
            }
            collect(value, out);
        }
    }

    /**
     * A line's card keeps its id (what the page opens a close-up by) only
     * while the board it travels with shows that card. The NAME is history --
     * it was public when the line was written ("Lightning Bolt returned to
     * Alice's hand") -- but an id is a live handle on the card: once the card
     * is somewhere this seat can't see (back in its owner's hand), the id
     * would let the seat follow it (found by check-hidden-hands on Krark, the
     * Thumbless, 2026-11-08). The server applies the same rule to the whole
     * log it sends on a reconnect.
     */
    static void keepShownIds(JsonArray lines, java.util.Set<String> shown) {
        for (JsonElement line : lines) {
            JsonElement parts = line.isJsonObject() ? line.getAsJsonObject().get("parts") : null;
            if (parts == null || !parts.isJsonArray()) {
                continue;
            }
            for (JsonElement part : parts.getAsJsonArray()) {
                if (part.isJsonObject() && part.getAsJsonObject().has("id")
                        && !shown.contains(part.getAsJsonObject().get("id").getAsString())) {
                    part.getAsJsonObject().remove("id");
                }
            }
        }
    }

    // --- what the worker tells it directly ----------------------------------------------------

    /** Forge showed [seat] these cards (a reveal, a look): named for that seat alone. */
    synchronized void shown(int seat, List<Integer> ids, String said) {
        if (ids == null || ids.isEmpty()) {
            return;
        }
        // Cards that are public now (a face-down creature turned up as it
        // died) are already named by the line that moved them.
        boolean allPublic = true;
        for (Integer id : ids) {
            Card card = game.findById(id);
            allPublic &= card != null && isPublic(card, null);
        }
        if (allPublic) {
            return;
        }
        Fact fact = fact("reveal");
        fact.only = seat;
        for (Integer id : ids) {
            Card card = game.findById(id);
            // Shown to this seat by Forge, so known wherever it lies -- the
            // snapshot's reveal rule (describe, shown): never a face-down card.
            fact.itemsFor(seat).add(card == null || card.isFaceDown() ? null : named(card, card.getView()));
        }
        String words = said == null || said.isBlank() ? "Shown to you" : said;
        fact.phrase = (s, items) -> {
            JsonArray out = new JsonArray();
            text(out, words + ": ");
            list(out, items, "a card", "cards");
            return out;
        };
        add(fact);
    }

    /** A die rolled (public). */
    synchronized void rolled(int seat, Card source, int sides, List<Integer> results) {
        Fact fact = fact("other");
        StringBuilder rolledWords = new StringBuilder();
        for (int i = 0; i < results.size(); i++) {
            rolledWords.append(i == 0 ? "" : i == results.size() - 1 ? " and " : ", ").append(results.get(i));
        }
        if (source != null) {
            addCard(fact, source, null);
        }
        String what = rolledWords.toString();
        fact.phrase = (s, items) -> {
            JsonArray out = new JsonArray();
            out.add(player(seat));
            text(out, " rolled " + what + " on a " + sides + "-sided die");
            if (!items.isEmpty() && items.get(0) != null) {
                text(out, " for ");
                part(out, items.get(0), "a card");
            }
            return out;
        };
        add(fact);
    }

    // --- Forge's events ------------------------------------------------------------------------

    final class Listener {
        @com.google.common.eventbus.Subscribe
        public void on(forge.game.event.GameEvent event) {
            synchronized (PlayLog.this) {
                try {
                    handle(event);
                } catch (RuntimeException e) {
                    // The log is a view: a line it could not write must never
                    // stop the game. Said on stderr, which the admin record keeps.
                    System.err.println("proxic: play log skipped " + event.getClass().getSimpleName() + ": " + e);
                }
            }
        }
    }

    private void handle(forge.game.event.GameEvent event) {
        if (event instanceof forge.game.event.GameEventTurnBegan began) {
            Fact fact = new Fact("turn", began.turnNumber(), seat(began.turnOwner()), "Beginning");
            add(fact);
        } else if (event instanceof forge.game.event.GameEventGameRestarted) {
            publicNames.clear();
            Fact fact = fact("other");
            fact.phrase = (s, items) -> {
                JsonArray out = new JsonArray();
                out.add("The game restarted");
                return out;
            };
            add(fact);
        } else if (event instanceof forge.game.event.GameEventMulligan mulligan) {
            int who = seat(mulligan.player());
            Fact fact = fact("other");
            fact.phrase = (s, items) -> {
                JsonArray out = new JsonArray();
                out.add(player(who));
                text(out, " took a mulligan");
                return out;
            };
            add(fact);
        } else if (event instanceof forge.game.event.GameEventLandPlayed played) {
            landPlayed(played);
        } else if (event instanceof forge.game.event.GameEventSpellAbilityCast cast) {
            cast(cast);
        } else if (event instanceof forge.game.event.GameEventAttackersDeclared attack) {
            attacked(attack);
        } else if (event instanceof forge.game.event.GameEventBlockersDeclared blocks) {
            blocked(blocks);
        } else if (event instanceof forge.game.event.GameEventCardDamaged hit && hit.amount() > 0) {
            damage(hit.source(), hit.amount(), fact -> addCard(fact, find(hit.card()), hit.card()), 0);
        } else if (event instanceof forge.game.event.GameEventPlayerDamaged hit && hit.amount() > 0) {
            int target = seat(hit.target());
            damage(hit.source(), hit.amount(), fact -> addPlayer(fact, target), target);
        } else if (event instanceof forge.game.event.GameEventPlayerLivesChanged lives) {
            lifeChanged(lives);
        } else if (event instanceof forge.game.event.GameEventPlayerPoisoned poison && poison.amount() > 0) {
            int who = seat(poison.receiver());
            int amount = poison.amount();
            Fact fact = fact("life");
            fact.phrase = (s, items) -> {
                JsonArray out = new JsonArray();
                out.add(player(who));
                text(out, " got " + cards(amount, "a poison counter", "poison counters"));
                return out;
            };
            add(fact);
        } else if (event instanceof forge.game.event.GameEventScry scry) {
            looked(scry.player(), " scried ", scry.toTop() + scry.toBottom(),
                    scry.toTop() + " on top, " + scry.toBottom() + " on the bottom");
        } else if (event instanceof forge.game.event.GameEventSurveil surveil) {
            looked(surveil.player(), " surveilled ", surveil.toLibrary() + surveil.toGraveyard(),
                    surveil.toLibrary() + " on top, " + surveil.toGraveyard() + " into the graveyard");
        } else if (event instanceof forge.game.event.GameEventCardSacrificed sacrificed && sacrificed.card() != null) {
            sacrificing.add(sacrificed.card().getId());
        } else if (event instanceof forge.game.event.GameEventCardChangeZone moved && moved.card() != null) {
            moved(moved);
        }
    }

    private void looked(PlayerView who, String verb, int total, String split) {
        int seat = seat(who);
        Fact fact = fact("other");
        fact.phrase = (s, items) -> {
            JsonArray out = new JsonArray();
            out.add(player(seat));
            text(out, verb + total + " (" + split + ")");
            return out;
        };
        add(fact);
    }

    private void landPlayed(forge.game.event.GameEventLandPlayed played) {
        Card land = find(played.land());
        int id = played.land().getId();
        // Forge moves the land, then says it was played: the move's line goes.
        for (int i = pending.size() - 1; i >= 0 && i >= pending.size() - 4; i--) {
            if (("move:hand-battlefield:" + id).equals(pending.get(i).key)) {
                pending.remove(i);
                break;
            }
        }
        landsPlayed.add(id);
        int who = seat(played.player());
        Fact fact = fact("land");
        addCard(fact, land, played.land());
        remember(land, played.land());
        fact.phrase = (s, items) -> {
            JsonArray out = new JsonArray();
            out.add(player(who));
            text(out, " played ");
            part(out, items.isEmpty() ? null : items.get(0), "a land");
            return out;
        };
        add(fact);
    }

    private void cast(forge.game.event.GameEventSpellAbilityCast cast) {
        forge.game.spellability.SpellAbilityStackInstance instance = null;
        int wanted = cast.si() == null ? -1 : cast.si().getId();
        for (forge.game.spellability.SpellAbilityStackInstance each : game.getStack()) {
            if (each.getId() == wanted) {
                instance = each;
            }
        }
        if (instance == null) {
            return;
        }
        Card source = instance.getSourceCard();
        int by = seat(instance.getActivatingPlayer());
        String kind = instance.isSpell() ? "spell" : instance.isTrigger() ? "trigger" : "ability";
        boolean down = source != null && source.isFaceDown();
        Fact fact = fact(kind);
        // Item 0: the source; then each target (a card, a player, a spell).
        if (source != null) {
            addCard(fact, source, null);
            remember(source, null);
        } else {
            for (Player viewer : players()) {
                fact.itemsFor(seat(viewer)).add(null);
            }
        }
        List<Integer> owners = new ArrayList<>();
        owners.add(by);
        Set<Integer> named = new HashSet<>();
        for (forge.game.spellability.SpellAbility part = instance.getSpellAbility(); part != null;
                part = part.getSubAbility()) {
            forge.game.spellability.TargetChoices chosen = part.getTargets();
            if (chosen == null) {
                continue;
            }
            for (Card card : chosen.getTargetCards()) {
                if (!named.add(card.getId())) {
                    continue;
                }
                addCard(fact, card, null);
                owners.add(seat(card.getController()));
            }
            for (Player target : chosen.getTargetPlayers()) {
                addPlayer(fact, seat(target));
                owners.add(-1);
            }
            for (forge.game.spellability.SpellAbility spell : chosen.getTargetSpells()) {
                Card host = spell.getHostCard();
                if (host != null && named.add(host.getId())) {
                    addCard(fact, host, null);
                    owners.add(seat(host.getController()));
                }
            }
        }
        String hiddenSource = down ? (instance.isSpell() ? "a face-down spell" : "a face-down creature")
                : instance.isSpell() ? "a spell" : "a card";
        fact.phrase = (s, items) -> {
            JsonArray out = new JsonArray();
            JsonElement src = items.isEmpty() ? null : items.get(0);
            if ("trigger".equals(kind)) {
                part(out, src, hiddenSource);
                text(out, "'s ability triggered");
            } else {
                out.add(player(by));
                text(out, "spell".equals(kind) ? " cast " : " activated ");
                part(out, src, hiddenSource);
                if (!"spell".equals(kind)) {
                    text(out, "'s ability");
                }
            }
            if (items.size() > 1) {
                text(out, " targeting ");
                for (int i = 1; i < items.size(); i++) {
                    if (i > 1) {
                        text(out, i == items.size() - 1 ? " and " : ", ");
                    }
                    JsonElement target = items.get(i);
                    int whose = i < owners.size() ? owners.get(i) : -1;
                    boolean player = target != null && target.isJsonObject() && target.getAsJsonObject().has("player");
                    if (!player && whose > 0 && whose != by) {
                        out.add(player(whose));
                        text(out, "'s ");
                    }
                    part(out, target, "a card");
                }
            }
            return out;
        };
        add(fact);
    }

    private void attacked(forge.game.event.GameEventAttackersDeclared attack) {
        int by = seat(attack.player());
        attack.attackersMap().asMap().forEach((defender, attackers) -> {
            if (attackers.isEmpty()) {
                return;
            }
            Fact fact = fact("combat");
            if (defender instanceof PlayerView who) {
                addPlayer(fact, seat(who));
            } else if (defender instanceof CardView card) {
                addCard(fact, find(card), card);
            } else {
                for (Player viewer : players()) {
                    fact.itemsFor(seat(viewer)).add(null);
                }
            }
            for (CardView attacker : attackers) {
                addCard(fact, find(attacker), attacker);
            }
            fact.phrase = (s, items) -> {
                JsonArray out = new JsonArray();
                out.add(player(by));
                text(out, " attacked ");
                part(out, items.get(0), "a permanent");
                text(out, " with ");
                list(out, items.subList(1, items.size()), "a face-down creature", "face-down creatures");
                return out;
            };
            add(fact);
        });
    }

    private void blocked(forge.game.event.GameEventBlockersDeclared blocks) {
        forge.game.combat.Combat combat = game.getCombat();
        Player defending = playerOf(blocks.defendingPlayer());
        if (combat == null || defending == null) {
            return;
        }
        int who = seat(defending);
        boolean attacked = false;
        boolean any = false;
        for (Card attacker : combat.getAttackers()) {
            forge.game.GameEntity defender = combat.getDefenderByAttacker(attacker);
            Player target = defender instanceof Player p ? p
                    : defender instanceof Card c ? c.getController() : null;
            if (target != defending) {
                continue;
            }
            attacked = true;
            List<Card> blockers = new ArrayList<>();
            for (Card blocker : combat.getBlockers(attacker)) {
                if (blocker.getController() == defending) {
                    blockers.add(blocker);
                }
            }
            if (blockers.isEmpty()) {
                continue;
            }
            any = true;
            Fact fact = fact("combat");
            addCard(fact, attacker, null);
            for (Card blocker : blockers) {
                addCard(fact, blocker, null);
            }
            fact.phrase = (s, items) -> {
                JsonArray out = new JsonArray();
                out.add(player(who));
                text(out, " blocked ");
                part(out, items.get(0), "a face-down creature");
                text(out, " with ");
                list(out, items.subList(1, items.size()), "a face-down creature", "face-down creatures");
                return out;
            };
            add(fact);
        }
        if (attacked && !any) {
            Fact fact = fact("combat");
            fact.phrase = (s, items) -> {
                JsonArray out = new JsonArray();
                out.add(player(who));
                text(out, " did not block");
                return out;
            };
            add(fact);
        }
    }

    private void damage(CardView source, int amount, java.util.function.Consumer<Fact> target, int playerHit) {
        Card from = find(source);
        Fact fact = fact("damage");
        fact.key = "damage:" + (source == null ? "none" : source.getId()) + ":" + amount;
        if (source != null) {
            addCard(fact, from, source);
        } else {
            for (Player viewer : players()) {
                fact.itemsFor(seat(viewer)).add(null);
            }
        }
        target.accept(fact);
        fact.phrase = (s, items) -> {
            JsonArray out = new JsonArray();
            // Item 0 of a merged run is every source again: show the first.
            part(out, items.get(0), "a face-down creature");
            text(out, " dealt " + amount + " damage to ");
            List<JsonElement> targets = new ArrayList<>();
            for (int i = 1; i < items.size(); i += 2) {
                targets.add(items.get(i));
            }
            list(out, targets, "a face-down creature", "face-down creatures");
            return out;
        };
        // A life loss Forge reported first is this damage: one line, with the total.
        if (playerHit > 0 && !pending.isEmpty()) {
            Fact last = pending.get(pending.size() - 1);
            if (last.lossSeat == playerHit && last.lossAmount == amount) {
                pending.remove(pending.size() - 1);
                last.life.forEach(fact.life::add);
            }
        }
        add(fact);
    }

    private void lifeChanged(forge.game.event.GameEventPlayerLivesChanged lives) {
        int who = seat(lives.player());
        int change = lives.newLives() - lives.oldLives();
        if (change == 0) {
            return;
        }
        JsonObject total = new JsonObject();
        total.addProperty("seat", who);
        total.addProperty("total", lives.newLives());
        settleLast();
        if (change < 0 && !pending.isEmpty()) {
            // Damage Forge reported first: the total goes on its line.
            Fact last = pending.get(pending.size() - 1);
            if (last.key != null && last.key.startsWith("damage:") && last.key.endsWith(":" + (-change))
                    && hitsPlayer(last, who)) {
                last.life.add(total);
                return;
            }
        }
        Fact fact = fact("life");
        fact.life.add(total);
        int amount = Math.abs(change);
        if (change < 0) {
            fact.lossSeat = who;
            fact.lossAmount = amount;
        }
        fact.phrase = (s, items) -> {
            JsonArray out = new JsonArray();
            out.add(player(who));
            text(out, (change > 0 ? " gained " : " lost ") + amount + " life");
            return out;
        };
        add(fact);
    }

    private static boolean hitsPlayer(Fact fact, int seat) {
        for (List<JsonElement> items : fact.items.values()) {
            for (JsonElement item : items) {
                if (item != null && item.isJsonObject() && item.getAsJsonObject().has("player")
                        && item.getAsJsonObject().get("player").getAsInt() == seat) {
                    return true;
                }
            }
            return false;
        }
        return false;
    }

    /** Remember (or forget) the card's public name, as it is now. */
    private void remember(Card card, CardView view) {
        int id = card != null ? card.getId() : view.getId();
        JsonObject name = isPublic(card, view) ? named(card, card != null ? card.getView() : view) : null;
        if (name != null) {
            publicNames.put(id, name);
        } else {
            publicNames.remove(id);
        }
    }

    private static final Set<String> PUBLIC_ZONES = Set.of("battlefield", "graveyard", "stack", "exile", "command");

    private void moved(forge.game.event.GameEventCardChangeZone moved) {
        CardView view = moved.card();
        Card card = find(view);
        int id = view.getId();
        String from = Moves.zoneName(moved.from() == null ? null : moved.from().zoneType());
        String to = Moves.zoneName(moved.to() == null ? null : moved.to().zoneType());
        Integer fromSeat = moved.from() == null ? null : seat(moved.from().player());
        Integer toSeat = moved.to() == null ? null : seat(moved.to().player());
        // What every seat knew of it where it was: a public card stays named.
        JsonObject wasPublic = PUBLIC_ZONES.contains(from) ? publicNames.get(id) : null;
        Fact fact = fact("move");
        for (Player viewer : players()) {
            JsonObject now = cardFor(card, view, viewer);
            fact.itemsFor(seat(viewer)).add(now != null ? now : wasPublic == null ? null : wasPublic.deepCopy());
        }
        remember(card, view);
        String route = from + "-" + to;
        int owner = toSeat != null && toSeat > 0 ? toSeat : fromSeat == null ? 0 : fromSeat;
        boolean sacrificed = "battlefield".equals(from) && sacrificing.remove(id);
        switch (route) {
            case "library-hand" -> {
                // A draw or a search: Forge counts the draw just after the move.
                fact.unsettled = id;
                fact.unsettledSeat = owner;
                add(fact);
                return;
            }
            case "battlefield-graveyard" -> {
                boolean creature = card != null ? card.isCreature()
                        : view.getCurrentState() != null && view.getCurrentState().isCreature();
                String said = sacrificed ? null
                        : creature ? " died" : view.wasDestroyed() ? " was destroyed" : null;
                int controller = fromSeat == null ? 0 : fromSeat;
                setKind(fact, "death");
                if (sacrificed) {
                    fact.key = "sacrifice:" + controller;
                    fact.phrase = (s, items) -> lead(player(controller), " sacrificed ", items);
                } else if (said != null) {
                    fact.phrase = (s, items) -> tail(items, said, said);
                } else {
                    fact.phrase = (s, items) -> tail(items, " was put into ", " were put into ", owner, "'s graveyard");
                }
            }
            case "battlefield-exile" -> {
                setKind(fact, "death");
                fact.key = "exile:battlefield";
                fact.phrase = (s, items) -> tail(items, " was exiled", " were exiled");
            }
            case "battlefield-hand" -> fact.phrase = (s, items) -> tail(items, " returned to ", " returned to ",
                    owner, "'s hand");
            case "battlefield-library" -> fact.phrase = (s, items) -> tail(items, " was put into ", " were put into ",
                    owner, "'s library");
            case "stack-graveyard", "stack-exile" -> {
                if (!countered(id)) {
                    return; // resolved, or cast from somewhere: the cast line said it
                }
                setKind(fact, "death");
                fact.phrase = "stack-graveyard".equals(route)
                        ? (s, items) -> tail(items, " was countered", " were countered")
                        : (s, items) -> tail(items, " was countered and exiled", " were countered and exiled");
            }
            // Off the stack back to a hand or a library (Krark, the Thumbless
            // losing his flip; Remand; Memory Lapse): said where it went.
            case "stack-hand" -> fact.phrase = (s, items) -> tail(items, " returned to ", " returned to ",
                    owner, "'s hand");
            case "stack-library" -> fact.phrase = (s, items) -> tail(items, " was put into ", " were put into ",
                    owner, "'s library");
            case "hand-graveyard" -> {
                Player who = card == null ? null : card.getOwner();
                List<Card> discards = who == null ? List.of() : who.getDiscardedThisTurn();
                boolean discarded = !discards.isEmpty() && discards.get(discards.size() - 1).getId() == id;
                if (discarded) {
                    fact.key = "discard:" + owner;
                    fact.phrase = (s, items) -> lead(player(owner), " discarded ", items);
                } else {
                    fact.phrase = (s, items) -> tail(items, " went from ", " went from ", owner,
                            "'s hand to their graveyard");
                }
            }
            case "hand-battlefield" -> {
                if (landsPlayed.remove(id)) {
                    return;
                }
                fact.key = "move:hand-battlefield:" + id;
                fact.phrase = (s, items) -> lead(player(owner), " put ", items, " onto the battlefield");
            }
            case "hand-exile" -> fact.phrase = (s, items) -> lead(player(owner), " exiled ", items,
                    " from their hand");
            case "hand-library" -> {
                if (fact.turn == 0) {
                    return; // a mulligan: the hand goes back, said as "took a mulligan"
                }
                fact.key = "handlib:" + owner;
                fact.phrase = (s, items) -> {
                    JsonArray out = new JsonArray();
                    out.add(player(owner));
                    text(out, " put " + cards(items.size(), "a card", "cards")
                            + " from their hand into their library");
                    return out;
                };
            }
            case "library-graveyard" -> {
                fact.key = "libgy:" + owner;
                fact.phrase = (s, items) -> tail(items, " went to ", " went to ", owner,
                        "'s graveyard from their library");
            }
            case "library-battlefield" -> fact.phrase = (s, items) -> tail(items,
                    " was put onto the battlefield from ", " were put onto the battlefield from ", owner, "'s library");
            case "library-exile" -> {
                fact.key = "libex:" + owner;
                fact.phrase = (s, items) -> tail(items, " was exiled from ", " were exiled from ", owner, "'s library");
            }
            case "graveyard-hand" -> fact.phrase = (s, items) -> tail(items, " returned to ", " returned to ",
                    owner, "'s hand from their graveyard");
            case "graveyard-battlefield" -> fact.phrase = (s, items) -> tail(items,
                    " returned to the battlefield", " returned to the battlefield");
            case "graveyard-exile" -> {
                fact.key = "gyex:" + owner;
                fact.phrase = (s, items) -> tail(items, " was exiled from ", " were exiled from ", owner,
                        "'s graveyard");
            }
            case "graveyard-library" -> fact.phrase = (s, items) -> tail(items, " was put into ", " were put into ",
                    owner, "'s library");
            case "exile-battlefield" -> fact.phrase = (s, items) -> tail(items,
                    " returned to the battlefield from exile", " returned to the battlefield from exile");
            case "exile-hand" -> fact.phrase = (s, items) -> tail(items, " was put into ", " were put into ",
                    owner, "'s hand from exile");
            case "nowhere-battlefield" -> {
                if (!(card != null ? card.isToken() : view.isToken())) {
                    return;
                }
                int controller = card != null ? seat(card.getController()) : owner;
                JsonElement any = fact.items.values().stream().flatMap(List::stream)
                        .filter(java.util.Objects::nonNull).findFirst().orElse(null);
                String name = any == null ? "?" : any.getAsJsonObject().get("name").getAsString();
                setKind(fact, "move");
                fact.key = "token:" + controller + ":" + name;
                fact.phrase = (s, items) -> {
                    JsonArray out = new JsonArray();
                    out.add(player(controller));
                    text(out, " created " + (items.size() == 1 ? "a" : String.valueOf(items.size())) + " ");
                    JsonElement first = items.get(0);
                    part(out, first, "face-down");
                    text(out, items.size() == 1 ? " token" : " tokens");
                    return out;
                };
            }
            default -> {
                return; // stack, merged, other zones: the board shows them
            }
        }
        add(fact);
    }

    private static void setKind(Fact fact, String kind) {
        fact.kind = kind;
    }

    /** It leaves the stack while another card's spell or ability resolves: countered. */
    private boolean countered(int id) {
        if (!game.getStack().isResolving()) {
            return false;
        }
        forge.game.spellability.SpellAbility top = game.getStack().peekAbility();
        Card by = top == null ? null : top.getHostCard();
        return by != null && by.getId() != id;
    }

    /** "Alice discarded A and B[ rest]". */
    private static JsonArray lead(JsonObject who, String verb, List<JsonElement> items, String... rest) {
        JsonArray out = new JsonArray();
        out.add(who);
        text(out, verb);
        list(out, items, "a card", "cards");
        for (String words : rest) {
            text(out, words);
        }
        return out;
    }

    /** "A died", "A and B were exiled"; with a player: "A was put into Bob's graveyard". */
    private static JsonArray tail(List<JsonElement> items, String one, String many) {
        JsonArray out = new JsonArray();
        list(out, items, "a card", "cards");
        text(out, items.size() == 1 ? one : many);
        return out;
    }

    private static JsonArray tail(List<JsonElement> items, String one, String many, int seat, String after) {
        JsonArray out = tail(items, one, many);
        out.add(player(seat));
        text(out, after);
        return out;
    }
}
