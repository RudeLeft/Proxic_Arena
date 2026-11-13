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

    /** One card the effect moved; face down as it left (spec 0075: a bounced morph stays a back). */
    private record Move(int cardId, Player owner, ZoneType from, ZoneType to, boolean faceDown) {
        Move(int cardId, Player owner, ZoneType from, ZoneType to) {
            this(cardId, owner, from, to, false);
        }
    }

    /**
     * Spec 0075 -- one value Forge told a reader (its notifyOfValue): who
     * chose or flipped, the kind of effect, and the words. {@code sentence}
     * is the reader's sentence; {@code mark} the picture ("color", "coin").
     */
    record Value(Player who, String sentence, String mark, String detail) {}

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
        /**
         * Spec 0075 -- what Forge told each reader of choices and coin flips
         * while it resolved (or, outside a resolution, as it happened); a
         * reader is shown the ones another player made.
         */
        final java.util.Map<Player, List<Value>> values = new java.util.concurrent.ConcurrentHashMap<>();
        /** Spec 0075 -- the ability the values came from, outside a resolution. */
        SpellAbility from;
        /** Spec 0075 -- the zone looked at, for an empty look (made for one reader: ActionReports#personal). */
        String zone;
        /**
         * Spec 0075 -- a look at a hand that had no cards (Duress on an empty
         * hand): there was nothing to choose, so the one who looked is told too.
         */
        boolean emptyHand;
        /**
         * Spec 0079 -- a fizzle: the spell was a copy (it is "your copy of
         * Lightning Bolt"), and its targets were all gone from where they
         * were (else they were still there, no longer legal targets).
         */
        boolean copy;
        boolean gone;

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

    enum Kind { SEARCH, DIG, REVEAL_TOP, REORDER, SCRY, SURVEIL, PUT_BACK, LOOK_HAND, CHOOSE_DISCARD, DISCARD, MILL,
        /** Spec 0074, Amendment 1 -- a spell countered. */
        COUNTER,
        /** Spec 0074, Amendment 1 -- cards out of a graveyard or exile (Raise Dead, Unearth, Bojuka Bog). */
        RETURN,
        /** Spec 0075 -- cards from the table or the stack back to a hand or into a library (Unsummon, Griptide). */
        BOUNCE,
        /** Spec 0075 -- a card cycled (Forgotten Cave). */
        CYCLE,
        /** Spec 0075 -- choices and coin flips alone (Voice of All, Stitch in Time): told by their values. */
        CHOICE,
        /** Spec 0075 -- a look at a hand or a library with no cards in it. */
        EMPTY_LOOK,
        /** Spec 0079 -- a spell that did nothing: every target it had was gone (it fizzled). */
        FIZZLE }

    /**
     * Spec 0074, Amendment 1 -- the kinds told to both players unless the
     * reader did it to themselves alone (milling yourself, your own Raise
     * Dead): what the other player does, or what happens to them.
     */
    static boolean toBoth(Kind kind) {
        return kind == Kind.MILL || kind == Kind.COUNTER || kind == Kind.RETURN || kind == Kind.FIZZLE;
    }

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
    /** Spec 0075 -- the values Forge told each reader while this effect resolved. */
    private final java.util.Map<Player, List<Value>> values = new java.util.LinkedHashMap<>();

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
                        moves.add(new Move(card.getId(), card.getOwner(), moved.from().zoneType(), moved.to().zoneType(),
                                moved.card().isFaceDown()));
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
            } else if (event instanceof forge.game.event.GameEventSpellResolved resolved) {
                // Spec 0079 -- a spell that fizzled did nothing: that is its report.
                if (!(resolved.hasFizzled() && fizzled(resolved))) {
                    finish();
                }
                return;
            } else if (event instanceof forge.game.event.GameEventTurnBegan) {
                // The tray is about the moment it happened; a new turn is
                // the game moving on.
                latest = null;
                personal.clear();
                reset();
            }
            if (event instanceof forge.game.event.GameEventSpellAbilityCast
                    || event instanceof forge.game.event.GameEventCardChangeZone) {
                noteAims();
            }
        }
    }

    /**
     * Spec 0079 -- what each spell on the stack aims at, kept from before it
     * resolves: Forge drops a target that is gone from the spell's own list
     * as it checks whether it fizzled (MagicStack#hasFizzled), before it says
     * so. Read as each spell is put on the stack and as cards move (the game
     * thread only).
     */
    private record Aim(Card card, boolean faceDown) {}

    private final java.util.Map<SpellAbility, List<Aim>> aims = new java.util.IdentityHashMap<>();

    private void noteAims() {
        java.util.Set<SpellAbility> now = java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        for (forge.game.spellability.SpellAbilityStackInstance each : game.getStack()) {
            SpellAbility sa = each.getSpellAbility();
            if (sa == null || !each.isSpell()) {
                continue;
            }
            now.add(sa);
            List<Aim> list = new ArrayList<>();
            for (SpellAbility part = sa; part != null; part = part.getSubAbility()) {
                if (part.getTargets() == null) {
                    continue;
                }
                for (Card card : part.getTargets().getTargetCards()) {
                    if (list.stream().noneMatch(a -> a.card().getId() == card.getId())) {
                        list.add(new Aim(card, card.isFaceDown()));
                    }
                }
            }
            if (!list.isEmpty() || !aims.containsKey(sa)) {
                aims.put(sa, list);
            }
        }
        aims.keySet().retainAll(now);
    }

    /**
     * Spec 0079 -- the spell resolving did nothing: every target it had was
     * gone or no longer allowed (Forge's hasFizzled). A report for both
     * players: the spell, and each card it aimed at that the reader may
     * still see. Not a bestowed or mutating spell, which Forge resolves as a
     * creature spell instead. True when the report was made.
     */
    private boolean fizzled(forge.game.event.GameEventSpellResolved resolved) {
        try {
            // The spell Forge names as resolved, still on the stack when it
            // says so (MagicStack#resolveStack) -- not `resolving`, which the
            // last spell's own move off the stack can leave pointing at that
            // spell, and not the top of the stack.
            SpellAbility sa = Copies.resolved(game, resolved);
            if (sa == null || !sa.isSpell() || sa.isBestow() || sa.isMutate() || sa.getHostCard() == null
                    || sa.getActivatingPlayer() == null) {
                return false;
            }
            Card host = sa.getHostCard();
            List<Aim> aimed = aims.getOrDefault(sa, List.of());
            List<Move> shown = new ArrayList<>();
            shown.add(new Move(host.getId(), host.getOwner(), ZoneType.Stack, ZoneType.Graveyard, host.isFaceDown()));
            boolean gone = !aimed.isEmpty();
            for (Aim aim : aimed) {
                Card now = game.findById(aim.card().getId());
                boolean left = now == null || now.getZone() == null
                        || !now.equalsWithGameTimestamp(aim.card());
                gone &= left;
                if (left && now != null && now.getZone() != null) {
                    shown.add(new Move(now.getId(), now.getOwner(), ZoneType.Battlefield, now.getZone().getZoneType(),
                            aim.faceDown()));
                }
            }
            String source = host.isFaceDown() ? "a face-down card" : host.getName();
            Report report = new Report(keys.incrementAndGet(), sa.getActivatingPlayer(), source, Kind.FIZZLE,
                    sa.getActivatingPlayer(), shown.size(), shown, new java.util.HashMap<>(), false, -1, 0);
            report.chooser = sa.getActivatingPlayer();
            report.copy = host.isCopiedSpell();
            report.gone = gone || aimed.isEmpty();
            report.cards.put(host.getId(), host);
            for (Aim aim : aimed) {
                report.cards.put(aim.card().getId(), aim.card());
            }
            latest = report;
            return true;
        } finally {
            reset();
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
        values.clear();
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
            // Spec 0075 -- the choices and flips Forge told while it resolved
            // ride with its report, or are the report (Voice of All).
            if (!values.isEmpty()) {
                Report told = report != null ? report : choiceReport(sa);
                values.forEach((reader, list) -> told.values.put(reader, List.copyOf(list)));
                report = told;
            }
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
        if (kind == null && root.isCycling()) {
            // Spec 0075 -- the cycled card went to the graveyard as the cost,
            // before this resolved: it is the card the report shows. What was
            // drawn is never named ("drew a card").
            return cycled(root, actor, host);
        }
        if (kind == null) {
            return null;
        }
        Player subject = subjectOf(which == null ? root : which, actor);
        List<Move> mine = relevant(kind, subject, host);
        // Spec 0074, Amendment 1 -- a counter or a return is about whose
        // cards they were (Counterspell on your spell; Reanimate on theirs).
        if (kind == Kind.COUNTER || kind == Kind.RETURN) {
            if (mine.isEmpty()) {
                return null;
            }
            subject = mine.get(0).owner();
        }
        // Spec 0075 -- a bounce is about the player it happened to: the owner
        // of a card the actor sent back that was not the actor's own.
        if (kind == Kind.BOUNCE) {
            if (mine.isEmpty()) {
                return null;
            }
            subject = mine.stream().map(Move::owner).filter(owner -> owner != actor).findFirst().orElse(actor);
        }
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
            String place = kind == Kind.PUT_BACK ? "top" : whereIs(move.cardId());
            // Spec 0075 -- bounced into a library that was then shuffled (Chaos Warp).
            if (kind == Kind.BOUNCE && place != null && move.to() == ZoneType.Library && shuffled.contains(move.owner())) {
                place = "shuffled";
            }
            where.put(move.cardId(), place);
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
        report.emptyHand = (kind == Kind.CHOOSE_DISCARD || kind == Kind.LOOK_HAND) && mine.isEmpty()
                && subject != null && subject.getCardsIn(ZoneType.Hand).isEmpty();
        for (Move move : mine) {
            Card card = game.findById(move.cardId());
            if (card != null) {
                report.cards.put(move.cardId(), card);
            }
        }
        return report;
    }

    /** Spec 0075 -- "Bob cycled Forgotten Cave and drew a card.": the cycled card, now in its graveyard. */
    private Report cycled(SpellAbility root, Player actor, Card host) {
        List<Move> one = List.of(new Move(host.getId(), host.getOwner(), ZoneType.Hand, ZoneType.Graveyard));
        java.util.Map<Integer, String> where = new java.util.HashMap<>();
        where.put(host.getId(), whereIs(host.getId()));
        int drew = 0;
        for (SpellAbility each = root; each != null; each = each.getSubAbility()) {
            if (each.getApi() == ApiType.Draw) {
                drew += amount(each, "NumCards", 1);
            }
        }
        Report report = new Report(keys.incrementAndGet(), actor, host.getName(), Kind.CYCLE, actor, 1, one, where,
                false, -1, 0);
        report.drew = drew;
        report.chooser = actor;
        report.cards.put(host.getId(), host);
        return report;
    }

    /** Spec 0075 -- a report made of choices and flips alone, shown with the card that made them. */
    private Report choiceReport(SpellAbility sa) {
        Card host = sa.getHostCard();
        Player actor = sa.getActivatingPlayer();
        List<Move> shown = new ArrayList<>();
        java.util.Map<Integer, String> where = new java.util.HashMap<>();
        if (host != null && host.getZone() != null && !host.isFaceDown()) {
            String place = whereIs(host.getId());
            // Only where everyone sees it (Voice of All on the battlefield).
            if (publicZone(place)) {
                shown.add(new Move(host.getId(), host.getOwner(), ZoneType.Stack, host.getZone().getZoneType()));
                // A spell still resolving is on its way off the stack: no "-> stack" under it.
                if (!"stack".equals(place)) {
                    where.put(host.getId(), place);
                }
            }
        }
        Report report = new Report(keys.incrementAndGet(), actor, host == null ? "" : host.getName(), Kind.CHOICE,
                actor, shown.size(), shown, where, false, -1, 0);
        report.chooser = actor;
        report.from = sa;
        if (host != null && !shown.isEmpty()) {
            report.cards.put(host.getId(), host);
        }
        return report;
    }

    /**
     * Spec 0075 -- Forge told [reader] a value (MatchController#notifyOfValue):
     * a colour chosen, a coin flipped, a card named. While an effect resolves
     * it rides with that effect's report; outside one (a land's "as it
     * enters, choose a color") it is the report at once. A die is not told
     * here: it tumbles in its own window.
     */
    void valueTold(Player reader, SpellAbility sa, Value value) {
        if (reader == null || sa == null || value == null) {
            return;
        }
        noteResolving();
        if (resolving != null) {
            values.computeIfAbsent(reader, k -> new ArrayList<>()).add(value);
            return;
        }
        Report now = latest;
        if (now == null || now.kind != Kind.CHOICE || now.from != sa) {
            now = choiceReport(sa);
            latest = now;
        }
        now.values.merge(reader, List.of(value), (a, b) -> {
            List<Value> both = new ArrayList<>(a);
            both.addAll(b);
            return List.copyOf(both);
        });
    }

    /**
     * Spec 0075 -- Forge showed [reader] a hand or a library with no cards in
     * it ("There are no cards in Bob's hand."): a report for that reader
     * alone, "You looked at Bob's hand. It has no cards." -- whoever made
     * the look, as its source is the effect resolving (Duress).
     */
    void emptyLook(Player reader, Player owner, ZoneType zone) {
        if (reader == null || owner == null || zone == null) {
            return;
        }
        SpellAbility sa = game.getStack().isResolving() && !game.getStack().isEmpty()
                ? game.getStack().peekAbility() : null;
        Player actor = sa != null && sa.getActivatingPlayer() != null ? sa.getActivatingPlayer() : reader;
        String source = sa != null && sa.getHostCard() != null
                ? (sa.getHostCard().isFaceDown() ? "a face-down card" : sa.getHostCard().getName()) : "";
        Report report = new Report(keys.incrementAndGet(), actor, source, Kind.EMPTY_LOOK, owner, 0, List.of(),
                new java.util.HashMap<>(), false, -1, 0);
        report.chooser = actor;
        report.zone = zone.getTranslatedName().toLowerCase(java.util.Locale.ROOT);
        personal.put(reader, report);
    }

    /** Spec 0075 -- the latest report made for one reader alone (an empty look). */
    private final java.util.Map<Player, Report> personal = new java.util.concurrent.ConcurrentHashMap<>();

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
            // Spec 0075: a bounce is reported to the one it happened to and hides
            // nothing Forge shows (Chaos Warp's revealed card) -- the report is the bounce's.
            if (kind == Kind.BOUNCE) {
                return false;
            }
            // Spec 0074, Amendment 1: a mill, a counter, a return hide nothing Forge shows.
            if (kind != null && !toBoth(kind)) {
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
                    : origin.contains("Hand") && destination.contains("Library") ? Kind.PUT_BACK
                    // Spec 0074, Amendment 1: out of a graveyard or exile.
                    : (origin.contains("Graveyard") || origin.contains("Exile")) && !destination.isEmpty()
                    && !destination.contains("Graveyard") ? Kind.RETURN
                    // Spec 0075: from the table or the stack back to a hand or into a library.
                    : (origin.contains("Battlefield") || origin.contains("Stack"))
                    && (destination.contains("Hand") || destination.contains("Library")) ? Kind.BOUNCE : null;
            case Dig, DigUntil -> sa.hasParam("Reveal") && "True".equalsIgnoreCase(sa.getParam("Reveal"))
                    ? Kind.REVEAL_TOP : Kind.DIG;
            case RearrangeTopOfLibrary -> Kind.REORDER;
            case RevealHand -> sa.hasParam("Look") ? Kind.LOOK_HAND : null;
            case Discard -> "RevealYouChoose".equals(sa.getParam("Mode")) ? Kind.CHOOSE_DISCARD : Kind.DISCARD;
            case Mill -> Kind.MILL;
            case Counter -> Kind.COUNTER;
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
    private List<Move> relevant(Kind kind, Player subject, Card host) {
        // Forge can move one card twice in one effect (Cultivate reveals its
        // lands, then places them): each card once, where it ended up.
        java.util.Set<Integer> seen = new java.util.HashSet<>();
        List<Move> out = new ArrayList<>();
        for (Move move : moves) {
            boolean anyOwner = kind == Kind.COUNTER || kind == Kind.RETURN || kind == Kind.BOUNCE;
            if (!anyOwner && move.owner() != subject) {
                continue;
            }
            boolean keep = switch (kind) {
                // Spec 0074, Amendment 1: the spell it countered (not itself).
                case COUNTER -> move.from() == ZoneType.Stack && (host == null || move.cardId() != host.getId());
                case RETURN -> move.from() == ZoneType.Graveyard || move.from() == ZoneType.Exile;
                // Spec 0075: off the table or the stack, into a hand or a library (not the spell itself).
                case BOUNCE -> (move.from() == ZoneType.Battlefield || move.from() == ZoneType.Stack)
                        && (move.to() == ZoneType.Hand || move.to() == ZoneType.Library)
                        && (host == null || move.cardId() != host.getId());
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
        if (reader == null) {
            return null;
        }
        Report report = latest;
        // Spec 0075 -- the other player's choices and flips this reader was told.
        List<Value> told = new ArrayList<>();
        if (report != null) {
            for (Value value : report.values.getOrDefault(reader, List.of())) {
                if (showsValue(reader, value.who(), value.mark())) {
                    told.add(value);
                }
            }
        }
        boolean main = report != null && (tells(report.kind, reader, report.actor, report.subject, report.chooser)
                || (report.emptyHand && reader == report.chooser));
        if (!main && told.isEmpty()) {
            report = null;
        }
        // Spec 0075 -- an empty look, made for this reader alone, when it is the newer.
        Report own = personal.get(reader);
        if (own != null && (report == null || own.key > report.key)) {
            report = own;
            main = true;
            told = List.of();
        }
        if (report == null) {
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
            // Spec 0079 -- a fizzle: the spell (a copy has ceased to exist: as
            // it was), then each card it aimed at, where it is now, only while
            // this reader may see it -- its owner, a public place, or a hand it
            // went to face up (the reader watched it go there).
            if (report.kind == Kind.FIZZLE) {
                boolean spell = n == 0 && move.from() == ZoneType.Stack;
                Card shownCard = card != null ? card : report.cards.get(move.cardId());
                String place = card == null ? null : whereIs(move.cardId());
                boolean visible = shownCard != null && (spell ? !move.faceDown()
                        : move.owner() == reader || publicZone(place)
                        || ("hand".equals(place) && !move.faceDown()));
                if (!spell && !visible) {
                    continue;
                }
                JsonObject entry;
                if (visible) {
                    entry = shown.apply(shownCard);
                    named.add(shownCard.getName());
                    visibleIds.add(move.cardId());
                } else {
                    entry = new JsonObject();
                    entry.addProperty("faceDown", true);
                    entry.addProperty("known", false);
                    entry.addProperty("seat", seatOf.applyAsInt(move.owner()));
                    hidden++;
                }
                entry.addProperty("id", "action:" + report.key + ":" + n++);
                if (spell && place != null && !"stack".equals(place)) {
                    entry.addProperty("to", place);
                } else if (!spell && place != null) {
                    entry.addProperty("toSaid", "in " + inWords(place, w.whose(move.owner()).equals("their")
                            ? move.owner().getName() + "'s" : w.whose(move.owner())));
                }
                cards.add(entry);
                continue;
            }
            // Spec 0074, Amendment 1: out of a graveyard or face-up exile, a
            // card was public as it moved -- shown as it was there, never by
            // its id (into the other player's hand it is hidden from now on).
            boolean wasPublic = report.kind == Kind.RETURN && card != null
                    && (move.from() == ZoneType.Graveyard || (move.from() == ZoneType.Exile && !card.isFaceDown()));
            // Spec 0075: off the table or the stack face up, a bounced card was
            // public as it left -- shown as it was, under the report's own id.
            if (report.kind == Kind.BOUNCE && card != null && !move.faceDown()) {
                wasPublic = true;
            }
            // Spec 0075: a choice's card is kept only when it was public then
            // (Voice of All on the table; Stitch in Time on the stack, now in
            // a graveyard) -- shown as it was.
            if (report.kind == Kind.CHOICE && card != null) {
                wasPublic = true;
            }
            boolean visible = card != null
                    && (move.owner() == reader || publicZone(to) || wasPublic || revealedTo.test(move.cardId()));
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
        // Spec 0075 -- the pictures that are not cards: a colour chosen, a coin flipped.
        JsonArray marks = new JsonArray();
        List<String> words = new ArrayList<>();
        if (main) {
            String said = sentence(report, w, named, hidden, visibleIds);
            if (!said.isEmpty()) {
                words.add(said);
            }
        }
        for (Value value : told) {
            words.add(value.sentence());
            if (value.mark() != null) {
                JsonObject mark = new JsonObject();
                mark.addProperty("kind", value.mark());
                if ("coin".equals(value.mark())) {
                    mark.addProperty("won", "won".equals(value.detail()));
                } else if (value.detail() != null) {
                    mark.addProperty(value.mark(), value.detail());
                }
                marks.add(mark);
            }
        }
        if (words.isEmpty()) {
            return null;
        }
        if (!marks.isEmpty()) {
            out.add("marks", marks);
        }
        out.addProperty("said", String.join(" ", words));
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
            case LOOK_HAND -> who + " looked at " + its + " hand." + (r.emptyHand ? " It has no cards." : "");
            case CHOOSE_DISCARD -> r.emptyHand ? who + " looked at " + its + " hand. It has no cards."
                    : r.moves.isEmpty()
                    ? who + " looked at " + its + " hand and chose nothing."
                    : who + " looked at " + its + " hand and chose " + cards + " for "
                    + (r.subject == w.reader ? "you" : r.subject.getName()) + " to discard.";
            case DISCARD -> w.who(r.subject) + " discarded " + cards + ".";
            // Spec 0074, Amendment 1: one plain sentence; the cards are the pictures.
            case MILL -> w.who(r.subject) + " milled " + r.count + " " + plural(r.count) + ".";
            case COUNTER -> who + " countered " + its + " " + cards + ".";
            case RETURN -> returned(r, w, visible);
            case BOUNCE -> bounced(r, w, visible);
            case CYCLE -> who + " cycled " + r.source + (r.drew > 0
                    ? " and drew " + (r.drew == 1 ? "a card" : r.drew + " cards") : "") + ".";
            case CHOICE -> "";
            case FIZZLE -> fizzledWords(r, w);
            case EMPTY_LOOK -> who + " looked at " + its + " " + r.zone + ". It has no cards.";
        };
    }

    /**
     * Spec 0079 (owner, Q4 A) -- "Alice's Lightning Bolt did nothing: its
     * target was gone." ("Your ..." to its caster; "Your copy of ..." for a
     * copy). A target still there but no longer allowed (it gained
     * protection) is said as that.
     */
    private static String fizzledWords(Report r, Words w) {
        return fizzleSentence(r.actor == w.reader ? null : r.actor.getName(), r.source, r.copy, r.gone,
                r.cards.size() > 2);
    }

    /** The fizzle sentence: [caster] null for the reader's own spell. */
    static String fizzleSentence(String caster, String spell, boolean copy, boolean gone, boolean many) {
        String whose = caster == null ? "Your" : caster + "'s";
        String why = gone
                ? (many ? "its targets were gone" : "its target was gone")
                : (many ? "its targets could no longer be chosen" : "its target could no longer be chosen");
        return whose + " " + (copy ? "copy of " : "") + spell + " did nothing: " + why + ".";
    }

    /**
     * Spec 0074, Amendment 1 -- whether [reader] is shown the report: a
     * mill, a counter or a return goes to both players unless the reader did
     * it to themselves alone (milling yourself, your own Raise Dead); the
     * others as before (Amendment 13, item 7: not to the one who chose).
     */
    static <P> boolean tells(Kind kind, P reader, P actor, P subject, P chooser) {
        return switch (kind) {
            // Spec 0075: a bounce is told to the player whose card it was, when the other player did it.
            case BOUNCE -> reader == subject && reader != actor;
            // Spec 0075: choices are told by their values (each reader the other player's); the
            // empty look only to the one who looked (ActionReports#emptyLook).
            case CHOICE, EMPTY_LOOK -> false;
            // Spec 0079 (owner, Q4 A): a fizzle is told to both players, its caster too.
            case FIZZLE -> true;
            default -> toBoth(kind) ? !(reader == actor && reader == subject) : reader != chooser;
        };
    }

    /**
     * Spec 0075 -- the values a reader is shown: those another player chose
     * or flipped, and your own coin flips (your own choice: nothing).
     */
    static <P> boolean showsValue(P reader, P who, String mark) {
        // Owner 2026-11-12: a coin flip is luck, not a choice -- the flipper
        // is shown their own flip too.
        return reader != who || "coin".equals(mark);
    }

    /** Spec 0074, Amendment 1 -- "Bob returned Grizzly Bears to their hand", "You exiled 10 cards from Bob's graveyard". */
    private static String returned(Report r, Words w, java.util.Set<Integer> visible) {
        String who = w.who(r.actor);
        boolean allExiled = r.moves.stream().allMatch(m -> "exile".equals(r.where.get(m.cardId())));
        if (allExiled) {
            List<String> named = new ArrayList<>();
            int hidden = 0;
            for (Move move : r.moves) {
                Card card = r.cards.get(move.cardId());
                if (visible.contains(move.cardId()) && card != null) {
                    named.add(card.getName());
                } else {
                    hidden++;
                }
            }
            String from = r.moves.get(0).from() == ZoneType.Exile ? "exile" : w.whose(r.subject) + " graveyard";
            return who + " exiled " + cardWords(named, hidden) + " from " + from + ".";
        }
        Map<String, List<String>> by = new LinkedHashMap<>();
        Map<String, Integer> backs = new LinkedHashMap<>();
        for (Move move : r.moves) {
            String to = r.where.get(move.cardId());
            String place = to == null ? "somewhere" : switch (to) {
                case "hand" -> "to " + w.whose(move.owner()) + " hand";
                case "battlefield" -> "to the battlefield";
                case "graveyard" -> "to " + w.whose(move.owner()) + " graveyard";
                case "exile" -> "into exile";
                case "top" -> "on top of " + w.whose(move.owner()) + " library";
                case "bottom" -> "on the bottom of " + w.whose(move.owner()) + " library";
                default -> "into " + w.whose(move.owner()) + " library";
            };
            Card card = r.cards.get(move.cardId());
            if (visible.contains(move.cardId()) && card != null) {
                by.computeIfAbsent(place, k -> new ArrayList<>()).add(card.getName());
            } else {
                backs.merge(place, 1, Integer::sum);
            }
        }
        List<String> parts = new ArrayList<>();
        by.forEach((place, names) -> parts.add(and(grouped(names)) + " " + place));
        backs.forEach((place, n) -> parts.add((n == 1 ? "a card" : n + " cards") + " " + place));
        return who + " returned " + and(parts) + ".";
    }

    /**
     * Spec 0075 -- "Bob returned your Grizzly Bears to your hand.", "Bob put
     * your Serra Angel on top of your library.", "Bob shuffled your Serra
     * Angel into your library."
     */
    private static String bounced(Report r, Words w, java.util.Set<Integer> visible) {
        Map<String, List<String>> by = new LinkedHashMap<>();
        Map<String, Integer> backs = new LinkedHashMap<>();
        for (Move move : r.moves) {
            String to = r.where.get(move.cardId());
            String whose = w.whose(move.owner());
            String[] verb = switch (to == null ? "" : to) {
                case "hand" -> new String[] {"returned", "to " + whose + " hand"};
                case "top" -> new String[] {"put", "on top of " + whose + " library"};
                case "bottom" -> new String[] {"put", "on the bottom of " + whose + " library"};
                case "shuffled" -> new String[] {"shuffled", "into " + whose + " library"};
                case "library" -> new String[] {"put", "into " + whose + " library"};
                default -> new String[] {"moved", "somewhere"};
            };
            String key = verb[0] + "\u0000" + whose + "\u0000" + verb[1];
            Card card = r.cards.get(move.cardId());
            if (visible.contains(move.cardId()) && card != null) {
                by.computeIfAbsent(key, k -> new ArrayList<>()).add(card.getName());
            } else {
                backs.merge(key, 1, Integer::sum);
            }
        }
        List<String> parts = new ArrayList<>();
        java.util.Set<String> keys = new java.util.LinkedHashSet<>(by.keySet());
        keys.addAll(backs.keySet());
        for (String key : keys) {
            String[] bits = key.split("\u0000", -1);
            List<String> names = new ArrayList<>(grouped(by.getOrDefault(key, List.of())));
            int n = backs.getOrDefault(key, 0);
            if (n > 0) {
                names.add(n == 1 ? "a card" : n + " cards");
            }
            String whose = n == 0 ? bits[1] + " " : "";
            parts.add(bits[0] + " " + whose + and(names) + " " + bits[2]);
        }
        return w.who(r.actor) + " " + and(parts) + ".";
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

    /** Spec 0079 -- "Bob's hand", "your graveyard", "exile": where a card the spell aimed at is now. */
    private static String inWords(String place, String whose) {
        return switch (place) {
            case "hand" -> whose + " hand";
            case "graveyard" -> whose + " graveyard";
            case "battlefield" -> "play";
            case "exile" -> "exile";
            case "top", "bottom", "library" -> whose + " library";
            default -> place;
        };
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
