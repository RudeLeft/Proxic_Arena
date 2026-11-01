package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.AbilityKey;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;

/**
 * Spec 0045 -- what caused what, read from Forge's own events as they
 * happen, never worked out afterwards from the board.
 *
 * Three things a player could not see before:
 * <ul>
 *   <li>where a counter came from ("+1/+1 from Ajani's Pridemate's
 *       trigger: RudeLeft gained 1 life (Soul Warden)") -- the stack
 *       object RESOLVING when Forge put the counter on;</li>
 *   <li>why a trigger on the stack triggered -- the triggering objects
 *       Forge stored on it;</li>
 *   <li>the cards a player was shown (Goblin Ringleader's four), with
 *       where each went once the reveal's effect finished.</li>
 * </ul>
 *
 * Public information only, except reveals, which are kept per seat and
 * filled only by the controller Forge told (MatchController#reveal):
 * Forge calls that on the controller of each player entitled to see.
 */
final class Causes {

    /** How many counter origins a card keeps, newest last. */
    private static final int ORIGINS_KEPT = 4;

    private final java.util.Map<Integer, java.util.Deque<JsonObject>> counterFrom =
            new java.util.concurrent.ConcurrentHashMap<>();

    /** A player's last life gain and what was resolving then. */
    private record Gain(int amount, String by) {}

    private final java.util.Map<Player, Gain> lastGain =
            java.util.Collections.synchronizedMap(new java.util.IdentityHashMap<>());

    /** One reveal, as one seat was shown it. */
    private static final class Reveal {
        final long key;
        final String title;
        final java.util.List<Integer> cards;
        /** Where each card went, fixed once the revealing effect finished. */
        java.util.Map<Integer, String> settled;

        Reveal(long key, String title, java.util.List<Integer> cards) {
            this.key = key;
            this.title = title;
            this.cards = cards;
        }
    }

    private final java.util.Map<Integer, Reveal> reveals = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.concurrent.atomic.AtomicLong revealKeys = new java.util.concurrent.atomic.AtomicLong();

    private final Game game;

    Causes(Game game) {
        this.game = game;
    }

    /** Forge's events, as it fires them (on the game thread). */
    final class Listener {
        @com.google.common.eventbus.Subscribe
        public void on(forge.game.event.GameEvent event) {
            if (event instanceof forge.game.event.GameEventCardCounters counted
                    && counted.newValue() > counted.oldValue()) {
                noteCounter(counted);
            } else if (event instanceof forge.game.event.GameEventPlayerLivesChanged lives
                    && lives.newLives() > lives.oldLives()) {
                Player who = playerOf(lives.player());
                if (who != null) {
                    lastGain.put(who, new Gain(lives.newLives() - lives.oldLives(), resolvingName()));
                }
            } else if (event instanceof forge.game.event.GameEventSpellResolved) {
                settleReveals();
            } else if (event instanceof forge.game.event.GameEventTurnBegan) {
                // A reveal is about the moment it happened; a new turn
                // is the game moving on.
                settleReveals();
                reveals.clear();
            }
        }
    }

    private Player playerOf(forge.game.player.PlayerView view) {
        for (Player each : game.getRegisteredPlayers()) {
            if (each.getView().equals(view)) {
                return each;
            }
        }
        return null;
    }

    /** The card whose spell or ability is resolving now, or null. */
    private String resolvingName() {
        if (!game.getStack().isResolving() || game.getStack().isEmpty()) {
            return null;
        }
        SpellAbility sa = game.getStack().peekAbility();
        return sa == null || sa.getHostCard() == null ? null : sa.getHostCard().getName();
    }

    private void noteCounter(forge.game.event.GameEventCardCounters counted) {
        String from = null;
        if (game.getStack().isResolving() && !game.getStack().isEmpty()) {
            SpellAbility sa = game.getStack().peekAbility();
            if (sa != null && sa.getHostCard() != null) {
                String host = sa.getHostCard().getName();
                String what = sa.isSpell() ? host : host + (sa.isTrigger() ? "'s trigger" : "'s ability");
                String why = why(sa);
                from = why == null ? what : what + ": " + why;
            }
        }
        if (from == null) {
            // Not from anything on the stack: a card that entered with
            // counters, a cost, a state-based action. Forge says no more.
            return;
        }
        JsonObject origin = new JsonObject();
        origin.addProperty("counter", String.valueOf(counted.type()));
        origin.addProperty("added", counted.newValue() - counted.oldValue());
        origin.addProperty("from", from);
        java.util.Deque<JsonObject> kept =
                counterFrom.computeIfAbsent(counted.card().getId(), id -> new java.util.ArrayDeque<>());
        synchronized (kept) {
            kept.addLast(origin);
            while (kept.size() > ORIGINS_KEPT) {
                kept.removeFirst();
            }
        }
    }

    /** Where this card's counters came from, oldest first; null when unknown. */
    JsonArray counterOrigins(Card card) {
        java.util.Deque<JsonObject> kept = counterFrom.get(card.getId());
        if (kept == null) {
            return null;
        }
        JsonArray out = new JsonArray();
        synchronized (kept) {
            kept.forEach(origin -> out.add(origin.deepCopy()));
        }
        return out;
    }

    /**
     * Why a trigger triggered, in a player's words -- from the objects
     * Forge stored on it when it triggered. The common kinds are said
     * plainly; any other kind in Forge's own words. Null for a spell or
     * an activated ability, which nothing "caused".
     */
    String why(SpellAbility sa) {
        if (sa == null || !sa.isTrigger() || sa.getTrigger() == null) {
            return null;
        }
        try {
            Object player = sa.getTriggeringObject(AbilityKey.Player);
            Object card = sa.getTriggeringObject(AbilityKey.Card);
            switch (sa.getTrigger().getMode()) {
                case LifeGained -> {
                    Object amount = sa.getTriggeringObject(AbilityKey.LifeAmount);
                    if (player instanceof Player gainer && amount != null) {
                        Gain gain = lastGain.get(gainer);
                        String by = gain != null && gain.by() != null && String.valueOf(gain.amount()).equals(String.valueOf(amount))
                                ? " (" + gain.by() + ")" : "";
                        return gainer.getName() + " gained " + amount + " life" + by;
                    }
                }
                case ChangesZone, ChangesZoneAll -> {
                    if (card instanceof Card moved) {
                        String to = sa.getTrigger().getParam("Destination");
                        String from = sa.getTrigger().getParam("Origin");
                        if ("Battlefield".equals(to)) {
                            return moved.getName() + " entered the battlefield";
                        }
                        if ("Graveyard".equals(to) && "Battlefield".equals(from)) {
                            return moved.getName() + " died";
                        }
                    }
                }
                case Attacks -> {
                    Object attacker = sa.getTriggeringObject(AbilityKey.Attacker);
                    if (attacker instanceof Card attacking) {
                        return attacking.getName() + " attacked";
                    }
                }
                case SpellCast, SpellCastOrCopy -> {
                    if (card instanceof Card cast) {
                        return cast.getName() + " was cast";
                    }
                }
                case Drawn -> {
                    if (card instanceof Card drawn && drawn.getOwner() != null) {
                        return drawn.getOwner().getName() + " drew a card";
                    }
                }
                default -> {
                    // Forge's own words, below.
                }
            }
            String forge = sa.getTrigger().getImportantStackObjects(sa);
            if (forge == null || forge.isBlank()) {
                return null;
            }
            // Forge's card numbers ("Soul Warden (65)") are not for players.
            return forge.replaceAll("\\s*\\(\\d+\\)", "").trim();
        } catch (RuntimeException e) {
            // A trigger kind with objects shaped otherwise: say nothing
            // rather than something wrong.
            return null;
        }
    }

    /**
     * A seat was shown these cards. The title names what showed them --
     * the card resolving -- or, outside a resolution, Forge's own words.
     */
    void revealed(int seat, java.util.List<Integer> cardIds, String forgeWords) {
        if (cardIds.isEmpty()) {
            return;
        }
        String by = resolvingName();
        String title = by != null ? by + " revealed:" : forgeWords;
        reveals.put(seat, new Reveal(revealKeys.incrementAndGet(), title, java.util.List.copyOf(cardIds)));
    }

    /** The revealing effect finished: where each card went is now fixed. */
    private void settleReveals() {
        for (Reveal reveal : reveals.values()) {
            if (reveal.settled == null) {
                java.util.Map<Integer, String> where = new java.util.HashMap<>();
                for (int id : reveal.cards) {
                    where.put(id, whereIs(id, reveal.cards));
                }
                reveal.settled = where;
            }
        }
    }

    /**
     * Where a card is now: a zone, and for a library its top or bottom --
     * counting the other revealed cards: Goblin Ringleader puts the rest on
     * the bottom TOGETHER, so a card with only revealed cards below it is
     * on the bottom too.
     */
    private String whereIs(int id, java.util.List<Integer> revealed) {
        Card card = game.findById(id);
        if (card == null || card.getZone() == null) {
            return null;
        }
        ZoneType zone = card.getZone().getZoneType();
        if (zone == ZoneType.Library) {
            java.util.List<Card> library = new java.util.ArrayList<>(card.getZone().getCards());
            int at = library.indexOf(card);
            boolean belowAllRevealed = library.subList(at + 1, library.size()).stream()
                    .allMatch(other -> revealed.contains(other.getId()));
            boolean aboveAllRevealed = library.subList(0, at).stream()
                    .allMatch(other -> revealed.contains(other.getId()));
            if (aboveAllRevealed == belowAllRevealed) {
                // In the middle, or a library of nothing but these cards:
                // which end is not knowable from where it lies.
                return "library";
            }
            return aboveAllRevealed ? "top" : "bottom";
        }
        return switch (zone) {
            case Hand -> "hand";
            case Graveyard -> "graveyard";
            case Battlefield -> "battlefield";
            case Exile -> "exile";
            case Stack -> "stack";
            default -> null;
        };
    }

    /**
     * This seat's latest reveal, for its snapshot, or null. The cards are
     * described as SHOWN to this seat (Forge revealed them to it), and
     * each carries where it went once that is settled.
     */
    JsonObject revealFor(int seat, java.util.function.Function<Card, JsonObject> shown) {
        Reveal reveal = reveals.get(seat);
        if (reveal == null) {
            return null;
        }
        JsonObject out = new JsonObject();
        out.addProperty("key", "reveal:" + reveal.key);
        out.addProperty("title", reveal.title);
        JsonArray cards = new JsonArray();
        int n = 0;
        for (int id : reveal.cards) {
            Card card = game.findById(id);
            if (card == null) {
                continue;
            }
            JsonObject entry = shown.apply(card);
            // NOT the card's own id: a revealed card can go back into a hand,
            // and its id there would let this viewer follow that very card
            // (the hidden-hand gate caught it, 2026-10-31). The tray needs
            // only its face and where it went.
            entry.addProperty("id", "revealed:" + reveal.key + ":" + n++);
            String to = reveal.settled == null ? null : reveal.settled.get(id);
            if (to != null) {
                entry.addProperty("to", to);
            }
            cards.add(entry);
        }
        out.add("cards", cards);
        return out;
    }
}
