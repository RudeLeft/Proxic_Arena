package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.AbilityUtils;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Phase 9 Amendment 12 (owner 2026-11-03) -- who did it, and what they did.
 *
 * When a spell or ability searches a library, looks at or reveals its top
 * cards, reorders it, scries, surveils, puts cards from a hand on top,
 * looks at a hand, makes a player discard, or mills, BOTH players get one
 * sentence naming the player who acted, in the reader's words ("Pat
 * searched their library and put a card into their hand." / "You searched
 * your library and put Goblin Matron into your hand."), and the cards it
 * moved: face up only where the reader may know them -- their own card,
 * a card now in a public zone, or one Forge revealed to them -- otherwise
 * a back with no name and no id.
 *
 * Read from Forge's own events while the effect resolves (each card that
 * moved, a shuffle, a scry's and a surveil's counts), and written once it
 * has resolved. What KIND of action it was is the resolving ability's own
 * (its ApiType and parameters), never guessed from the board.
 */
final class ActionReports {

    /** One card the effect moved. */
    private record Move(int cardId, Player owner, ZoneType from, ZoneType to) {}

    /** One finished report: rendered per reader. */
    private static final class Report {
        final long key;
        final Player actor;
        final String source;
        final Kind kind;
        final Player subject;
        final int count;
        final List<Move> moves;
        final java.util.Map<Integer, String> where;
        final boolean shuffled;
        final int top;
        final int bottom;
        /** Cards drawn before a put-back (Brainstorm's three). */
        int drew;
        /**
         * Amendment 13 (item 7) -- who made the choices: they are not told
         * what they just did. The target, for a discard the target chooses
         * (Mind Rot); otherwise the player who acted.
         */
        Player chooser;
        /** The moved cards, by id, for their names. */
        final java.util.Map<Integer, Card> cards = new java.util.HashMap<>();

        Report(long key, Player actor, String source, Kind kind, Player subject, int count, List<Move> moves,
                java.util.Map<Integer, String> where, boolean shuffled, int top, int bottom) {
            this.key = key;
            this.actor = actor;
            this.source = source;
            this.kind = kind;
            this.subject = subject;
            this.count = count;
            this.moves = moves;
            this.where = where;
            this.shuffled = shuffled;
            this.top = top;
            this.bottom = bottom;
        }
    }

    enum Kind { SEARCH, DIG, REVEAL_TOP, REORDER, SCRY, SURVEIL, PUT_BACK, LOOK_HAND, CHOOSE_DISCARD, DISCARD, MILL }

    private final Game game;
    /** Shared with the reveals (Causes), so the page can tell which came last. */
    private final java.util.concurrent.atomic.AtomicLong keys;

    // While one effect resolves (the game thread only).
    private SpellAbility resolving;
    private final List<Move> moves = new ArrayList<>();
    private final java.util.Set<Player> shuffled = new java.util.HashSet<>();
    private int scryTop = -1;
    private int scryBottom;
    private int surveilKept = -1;
    private int surveilAway;

    /** The latest report, for every reader; replaced by the next. */
    private volatile Report latest;

    ActionReports(Game game, java.util.concurrent.atomic.AtomicLong keys) {
        this.game = game;
        this.keys = keys;
    }

    /** Forge's events, as it fires them (on the game thread). */
    final class Listener {
        @com.google.common.eventbus.Subscribe
        public void on(forge.game.event.GameEvent event) {
            if (event instanceof forge.game.event.GameEventCardChangeZone moved) {
                noteResolving();
                if (resolving != null && moved.from() != null && moved.to() != null) {
                    Card card = game.findById(moved.card().getId());
                    if (card != null) {
                        moves.add(new Move(card.getId(), card.getOwner(), moved.from().zoneType(), moved.to().zoneType()));
                    }
                }
            } else if (event instanceof forge.game.event.GameEventShuffle shuffle) {
                noteResolving();
                Player who = playerOf(shuffle.player());
                if (who != null) {
                    shuffled.add(who);
                }
            } else if (event instanceof forge.game.event.GameEventScry scry) {
                noteResolving();
                scryTop = scry.toTop();
                scryBottom = scry.toBottom();
            } else if (event instanceof forge.game.event.GameEventSurveil surveil) {
                noteResolving();
                surveilKept = surveil.toLibrary();
                surveilAway = surveil.toGraveyard();
            } else if (event instanceof forge.game.event.GameEventSpellResolved) {
                finish();
            } else if (event instanceof forge.game.event.GameEventTurnBegan) {
                // The tray is about the moment it happened; a new turn is
                // the game moving on.
                latest = null;
                reset();
            }
        }
    }

    private void noteResolving() {
        if (resolving == null && game.getStack().isResolving() && !game.getStack().isEmpty()) {
            resolving = game.getStack().peekAbility();
        }
    }

    private void reset() {
        resolving = null;
        moves.clear();
        shuffled.clear();
        scryTop = -1;
        scryBottom = 0;
        surveilKept = -1;
        surveilAway = 0;
    }

    private Player playerOf(forge.game.player.PlayerView view) {
        for (Player each : game.getRegisteredPlayers()) {
            if (each.getView().equals(view)) {
                return each;
            }
        }
        return null;
    }

    /** The effect resolved: what kind of action was it, and is it one to tell? */
    private void finish() {
        noteResolving();
        try {
            SpellAbility sa = resolving;
            if (sa == null || sa.getHostCard() == null || sa.getActivatingPlayer() == null) {
                return;
            }
            Report report = build(sa);
            if (report != null) {
                latest = report;
            }
        } finally {
            reset();
        }
    }

    private Report build(SpellAbility root) {
        Player actor = root.getActivatingPlayer();
        Card host = root.getHostCard();
        List<SpellAbility> chain = new ArrayList<>();
        for (SpellAbility each = root; each != null; each = each.getSubAbility()) {
            chain.add(each);
        }
        Kind kind = null;
        SpellAbility which = null;
        for (SpellAbility each : chain) {
            Kind found = kindOf(each);
            if (found != null) {
                kind = found;
                which = each;
                break;
            }
        }
        if (scryTop >= 0) {
            kind = Kind.SCRY;
        } else if (surveilKept >= 0) {
            kind = Kind.SURVEIL;
        }
        if (kind == null) {
            return null;
        }
        Player subject = subjectOf(which == null ? root : which, actor);
        List<Move> mine = relevant(kind, subject);
        if (mine.isEmpty() && (kind == Kind.SEARCH || kind == Kind.DISCARD || kind == Kind.CHOOSE_DISCARD
                || kind == Kind.MILL || kind == Kind.PUT_BACK || kind == Kind.DIG || kind == Kind.REVEAL_TOP)) {
            // Searched and found nothing, or nothing moved: say the look.
            if (kind != Kind.SEARCH && kind != Kind.CHOOSE_DISCARD) {
                return null;
            }
        }
        int count = switch (kind) {
            case DIG, REVEAL_TOP -> amount(which, "DigNum", mine.size());
            case REORDER -> amount(which, "NumCards", 0);
            case SCRY -> scryTop + scryBottom;
            case SURVEIL -> surveilKept + surveilAway;
            default -> mine.size();
        };
        java.util.Map<Integer, String> where = new java.util.HashMap<>();
        for (Move move : mine) {
            // Put back on top together: each is "on top", wherever in the pile.
            where.put(move.cardId(), kind == Kind.PUT_BACK ? "top" : whereIs(move.cardId()));
        }
        int drew = 0;
        if (kind == Kind.PUT_BACK) {
            for (SpellAbility each : chain) {
                if (each.getApi() == ApiType.Draw) {
                    drew += amount(each, "NumCards", 1);
                }
            }
        }
        Report report = new Report(keys.incrementAndGet(), actor, host.getName(), kind, subject, count,
                List.copyOf(mine), where, shuffled.contains(subject), scryTop, scryBottom);
        report.drew = drew;
        report.chooser = kind == Kind.DISCARD ? subject : actor;
        for (Move move : mine) {
            Card card = game.findById(move.cardId());
            if (card != null) {
                report.cards.put(move.cardId(), card);
            }
        }
        return report;
    }

    /**
     * Amendment 13 (item 7) -- is [player] the one making the choices for an
     * effect this class reports, resolving now? Forge's own reveal to them
     * (Goblin Ringleader's four, Thoughtseize's hand) and its "Looking at
     * ..." line are then not shown: they chose, and the other player gets
     * the report.
     */
    static boolean choosingNow(Game game, Player player) {
        if (player == null || !game.getStack().isResolving() || game.getStack().isEmpty()) {
            return false;
        }
        SpellAbility root = game.getStack().peekAbility();
        if (root == null || root.getActivatingPlayer() == null) {
            return false;
        }
        for (SpellAbility each = root; each != null; each = each.getSubAbility()) {
            Kind kind = kindOf(each);
            if (kind != null) {
                Player chooser = kind == Kind.DISCARD ? subjectOf(each, root.getActivatingPlayer()) : root.getActivatingPlayer();
                return chooser == player;
            }
        }
        return false;
    }

    /** What kind of action this one ability is, or null when it is none of ours. */
    private static Kind kindOf(SpellAbility sa) {
        ApiType api = sa.getApi();
        if (api == null) {
            return null;
        }
        String origin = sa.getParamOrDefault("Origin", "");
        String destination = sa.getParamOrDefault("Destination", "");
        return switch (api) {
            case ChangeZone, ChangeZoneAll -> origin.contains("Library")
                    ? Kind.SEARCH
                    : origin.contains("Hand") && destination.contains("Library") ? Kind.PUT_BACK : null;
            case Dig, DigUntil -> sa.hasParam("Reveal") && "True".equalsIgnoreCase(sa.getParam("Reveal"))
                    ? Kind.REVEAL_TOP : Kind.DIG;
            case RearrangeTopOfLibrary -> Kind.REORDER;
            case RevealHand -> sa.hasParam("Look") ? Kind.LOOK_HAND : null;
            case Discard -> "RevealYouChoose".equals(sa.getParam("Mode")) ? Kind.CHOOSE_DISCARD : Kind.DISCARD;
            case Mill -> Kind.MILL;
            default -> null;
        };
    }

    /** Whose library or hand it was about: a targeted or defined player, else the actor. */
    private static Player subjectOf(SpellAbility sa, Player actor) {
        if (sa.usesTargeting() && sa.getTargets() != null) {
            for (Player each : sa.getTargets().getTargetPlayers()) {
                return each;
            }
        }
        if (sa.hasParam("Defined")) {
            for (Player each : AbilityUtils.getDefinedPlayers(sa.getHostCard(), sa.getParam("Defined"), sa)) {
                return each;
            }
        }
        return actor;
    }

    private static int amount(SpellAbility sa, String param, int otherwise) {
        if (sa == null || !sa.hasParam(param)) {
            return otherwise;
        }
        try {
            return AbilityUtils.calculateAmount(sa.getHostCard(), sa.getParam(param), sa);
        } catch (RuntimeException e) {
            return otherwise;
        }
    }

    /** The moves this kind of action is about, without the draws it also made. */
    private List<Move> relevant(Kind kind, Player subject) {
        // Forge can move one card twice in one effect (Cultivate reveals its
        // lands, then places them): each card once, where it ended up.
        java.util.Set<Integer> seen = new java.util.HashSet<>();
        List<Move> out = new ArrayList<>();
        for (Move move : moves) {
            if (move.owner() != subject) {
                continue;
            }
            boolean keep = switch (kind) {
                case SEARCH, DIG, REVEAL_TOP -> move.from() == ZoneType.Library;
                case PUT_BACK -> move.from() == ZoneType.Hand && move.to() == ZoneType.Library;
                case CHOOSE_DISCARD, DISCARD -> move.from() == ZoneType.Hand && move.to() == ZoneType.Graveyard;
                case MILL, SURVEIL -> move.from() == ZoneType.Library && move.to() == ZoneType.Graveyard;
                default -> false;
            };
            if (keep && seen.add(move.cardId())) {
                out.add(move);
            }
        }
        return out;
    }

    /** Where a card is now, as the tray says it: a zone, or a library's top or bottom. */
    private String whereIs(int id) {
        Card card = game.findById(id);
        if (card == null || card.getZone() == null) {
            return null;
        }
        ZoneType zone = card.getZone().getZoneType();
        if (zone == ZoneType.Library) {
            List<Card> library = new ArrayList<>(card.getZone().getCards());
            int at = library.indexOf(card);
            if (at == 0) {
                return "top";
            }
            return at == library.size() - 1 || at > library.size() / 2 ? "bottom" : "library";
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

    // --- per reader ------------------------------------------------------------------------

    /**
     * The latest report as [reader] reads it, for its snapshot, or null.
     * {@code revealedTo} says whether Forge showed that card to the reader;
     * {@code shown} draws a card the reader may see.
     */
    JsonObject reportFor(Player reader, java.util.function.Predicate<Integer> revealedTo,
            java.util.function.Function<Card, JsonObject> shown, java.util.function.ToIntFunction<Player> seatOf) {
        Report report = latest;
        if (report == null || reader == null || reader == report.chooser) {
            return null;
        }
        Words w = new Words(reader, report.actor);
        JsonObject out = new JsonObject();
        out.addProperty("key", "action:" + report.key);
        out.addProperty("stamp", report.key);
        out.addProperty("by", seatOf.applyAsInt(report.actor));
        out.addProperty("source", report.source);
        List<String> named = new ArrayList<>();
        java.util.Set<Integer> visibleIds = new java.util.HashSet<>();
        int hidden = 0;
        JsonArray cards = new JsonArray();
        int n = 0;
        for (Move move : report.moves) {
            Card card = game.findById(move.cardId());
            String to = report.where.get(move.cardId());
            boolean visible = card != null && (move.owner() == reader || publicZone(to) || revealedTo.test(move.cardId()));
            JsonObject entry;
            if (visible) {
                entry = shown.apply(card);
                named.add(card.getName());
                visibleIds.add(move.cardId());
            } else {
                entry = new JsonObject();
                entry.addProperty("faceDown", true);
                entry.addProperty("known", false);
                entry.addProperty("seat", seatOf.applyAsInt(move.owner()));
                hidden++;
            }
            // Never the card's own id: a reader could follow it (spec 0045).
            entry.addProperty("id", "action:" + report.key + ":" + n++);
            if (to != null) {
                entry.addProperty("to", to);
            }
            cards.add(entry);
        }
        // Looks that moved nothing still show what was looked at, as backs.
        int backs = switch (report.kind) {
            case REORDER, SCRY -> report.count;
            case SURVEIL -> Math.max(0, report.count - report.moves.size());
            case DIG, REVEAL_TOP -> Math.max(0, report.count - report.moves.size());
            default -> 0;
        };
        for (int i = 0; i < backs; i++) {
            JsonObject entry = new JsonObject();
            entry.addProperty("faceDown", true);
            entry.addProperty("known", false);
            entry.addProperty("seat", seatOf.applyAsInt(report.subject));
            entry.addProperty("id", "action:" + report.key + ":" + n++);
            String to = switch (report.kind) {
                case REORDER -> "top";
                case SCRY -> i < report.top ? "top" : "bottom";
                case SURVEIL -> "top";
                default -> "bottom";
            };
            entry.addProperty("to", to);
            cards.add(entry);
        }
        out.add("cards", cards);
        out.addProperty("said", sentence(report, w, named, hidden, visibleIds));
        return out;
    }

    private static boolean publicZone(String to) {
        return "graveyard".equals(to) || "battlefield".equals(to) || "exile".equals(to) || "stack".equals(to);
    }

    /** The reader's words for the players: "You", "Pat", "your", "their", "Bob's". */
    private static final class Words {
        final Player reader;
        final Player actor;

        Words(Player reader, Player actor) {
            this.reader = reader;
            this.actor = actor;
        }

        String who(Player p) {
            return p == reader ? "You" : p.getName();
        }

        /** "your" for the reader, "their" for the actor's own, else "Bob's". */
        String whose(Player p) {
            if (p == reader) {
                return "your";
            }
            return p == actor ? "their" : p.getName() + "'s";
        }
    }

    /** The approved sentences (canvas table, Amendment 12). */
    static String sentence(Report r, Words w, List<String> named, int hidden, java.util.Set<Integer> visible) {
        String who = w.who(r.actor);
        String its = w.whose(r.subject);
        String cards = cardWords(named, hidden);
        String then = r.shuffled ? ", then shuffled" : "";
        return switch (r.kind) {
            case SEARCH -> r.moves.isEmpty()
                    ? who + " searched " + its + " library and found nothing" + then + "."
                    : who + " searched " + its + " library and put " + destinations(r, w, visible) + then + ".";
            case DIG -> who + " looked at the top " + r.count + " " + plural(r.count) + " of " + its + " library"
                    + (r.moves.isEmpty() ? "" : ", put " + destinations(r, w, visible))
                    + rest(r) + ".";
            case REVEAL_TOP -> who + " revealed the top " + r.count + " " + plural(r.count) + " of " + its + " library"
                    + (r.moves.isEmpty() ? "" : ": " + destinations(r, w, visible)) + rest(r) + ".";
            case REORDER -> who + " looked at the top " + r.count + " " + plural(r.count) + " of " + its
                    + " library and put them back in an order " + (r.actor == w.reader ? "you" : "they") + " chose"
                    + then + ".";
            case SCRY -> who + " scried " + r.count + (r.bottom == 0
                    ? " and kept " + (r.count == 1 ? "it" : "them") + " on top."
                    : r.top == 0
                    ? " and put " + (r.count == 1 ? "it" : "them") + " on the bottom."
                    : ": " + r.top + " on top, " + r.bottom + " on the bottom.");
            case SURVEIL -> who + " surveilled " + r.count
                    + (r.moves.isEmpty() ? " and kept " + (r.count == 1 ? "it" : "them") + " on top"
                    : " and put " + cards + " into " + its + " graveyard") + ".";
            case PUT_BACK -> who + (r.drew > 0 ? " drew " + r.drew + " " + plural(r.drew) + ", then put " : " put ")
                    + cards + " from " + its + " hand on top of " + its + " library.";
            case LOOK_HAND -> who + " looked at " + its + " hand.";
            case CHOOSE_DISCARD -> r.moves.isEmpty()
                    ? who + " looked at " + its + " hand and chose nothing."
                    : who + " looked at " + its + " hand and chose " + cards + " for "
                    + (r.subject == w.reader ? "you" : r.subject.getName()) + " to discard.";
            case DISCARD -> w.who(r.subject) + " discarded " + cards + ".";
            case MILL -> who + " put the top " + r.count + " " + plural(r.count) + " of " + its
                    + " library into " + its + " graveyard: " + cards + ".";
        };
    }

    private static String rest(Report r) {
        int restCount = r.count - r.moves.size();
        if (r.moves.isEmpty() || restCount <= 0) {
            return "";
        }
        return " and " + restCount + " on the bottom";
    }

    /** "Goblin Matron into their hand", "a card into their hand", "Forest onto the battlefield and Forest into their hand". */
    private static String destinations(Report r, Words w, java.util.Set<Integer> visible) {
        Map<String, List<String>> by = new LinkedHashMap<>();
        Map<String, Integer> backs = new LinkedHashMap<>();
        for (Move move : r.moves) {
            String to = r.where.get(move.cardId());
            String place = placeWords(to, w.whose(move.owner()));
            Card card = r.cards.get(move.cardId());
            if (visible.contains(move.cardId()) && card != null) {
                by.computeIfAbsent(place, k -> new ArrayList<>()).add(card.getName());
            } else {
                backs.merge(place, 1, Integer::sum);
            }
        }
        List<String> parts = new ArrayList<>();
        for (Map.Entry<String, List<String>> each : by.entrySet()) {
            parts.add(and(grouped(each.getValue())) + " " + each.getKey());
        }
        for (Map.Entry<String, Integer> each : backs.entrySet()) {
            parts.add((each.getValue() == 1 ? "a card" : each.getValue() + " cards") + " " + each.getKey());
        }
        return and(parts);
    }

    private static String placeWords(String to, String whose) {
        if (to == null) {
            return "somewhere";
        }
        return switch (to) {
            case "hand" -> "into " + whose + " hand";
            case "battlefield" -> "onto the battlefield";
            case "graveyard" -> "into " + whose + " graveyard";
            case "exile" -> "into exile";
            case "top" -> "on top of " + whose + " library";
            case "bottom" -> "on the bottom of " + whose + " library";
            default -> "into " + whose + " library";
        };
    }

    /** "Goblin Piker x3" (the times sign) for three of a name, in the order first met. */
    private static List<String> grouped(List<String> names) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        names.forEach(name -> counts.merge(name, 1, Integer::sum));
        List<String> out = new ArrayList<>();
        counts.forEach((name, n) -> out.add(n == 1 ? name : name + " \u00d7" + n));
        return out;
    }

    /** "A", "A and B", "A, B and C". */
    private static String and(List<String> parts) {
        if (parts.isEmpty()) {
            return "";
        }
        if (parts.size() == 1) {
            return parts.get(0);
        }
        return String.join(", ", parts.subList(0, parts.size() - 1)) + " and " + parts.get(parts.size() - 1);
    }

    private static String cardWords(List<String> named, int hidden) {
        List<String> parts = grouped(named);
        if (hidden > 0) {
            parts.add(named.isEmpty() ? (hidden == 1 ? "a card" : hidden + " cards")
                    : hidden + " other " + (hidden == 1 ? "card" : "cards"));
        }
        return parts.isEmpty() ? "nothing" : and(parts);
    }

    private static String plural(int n) {
        return n == 1 ? "card" : "cards";
    }
}
