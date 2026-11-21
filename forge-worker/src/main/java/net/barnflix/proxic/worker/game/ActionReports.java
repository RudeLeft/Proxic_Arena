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
        /**
         * Spec 0080 (owner, on approval) -- a phasing report: the same effect
         * also left a "life can't change" static ability on the subject
         * (Teferi's Protection), as Forge has it.
         */
        boolean lifeHeld;
        /**
         * Spec 0097, item 3 -- a fizzle that is a trigger its controller
         * could not pay for: the mana it cost ("{1}"); null for a fizzled spell.
         */
        String unpaid;
        /** Spec 0100, item 8 -- the spell whose target changed, and its new target (a Card, a Player or a SpellAbility). */
        String retargeted;
        Object newTarget;
        /** Spec 0102, item 3 -- a skip: the step or phase skipped ("combat"), or null for whole turns ({@code count}). */
        String skipped;
        /** Spec 0102, item 3 -- the card whose effect it was (Time Stop's own exile is not "the spells"). */
        int hostId = -1;
        /** Spec 0107 -- a kept trample split: each blocker's card id and damage, in Forge's order. */
        List<int[]> split;
        /** Spec 0107 -- the damage that trampled over, and the attacker's whole damage. */
        int over;
        int damage;

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
        FIZZLE,
        /** Spec 0080 -- permanents phased out (Teferi's Protection, Slip Out the Back). */
        PHASE,
        /**
         * Spec 0086 (10 B) -- an extra turn began (Time Warp): told at its
         * start to all but whoever played the card (0086 Amendment 4).
         */
        EXTRA_TURN,
        /** Spec 0086 (8) -- a player completed a dungeon: told to the other player. */
        DUNGEON,
        /**
         * Spec 0089 (Q3 A) -- an extra combat began (Aurelia, Relentless
         * Assault): told at its start to all but whoever played the card
         * (0089 Amendment 1).
         */
        EXTRA_COMBAT,
        /**
         * Spec 0097, item 4 -- a player restarted the game (Karn Liberated):
         * told to the other player only, with the card that did it.
         */
        RESTART,
        /**
         * Spec 0100, item 8 -- a change-targets effect (Spellskite, Deflecting
         * Swat, Redirect) moved a spell's target: told to that spell's
         * controller only, never to the one who did it.
         */
        RETARGET,
        /**
         * Spec 0101, item 2 -- an ability countered (Stifle on Prodigal
         * Pyromancer's ping): it has no card move, so it is told here, to the
         * ability's controller only, never to the one who countered it.
         */
        COUNTER_ABILITY,
        /**
         * Spec 0102, item 2 -- a player's turn began and another player
         * controls them (Mindslaver): "Bob is playing your turn.", told to the
         * controlled player only, with the card that did it.
         */
        CONTROL,
        /**
         * Spec 0102, item 3 -- an end-the-turn effect resolved (Time Stop,
         * Sundial of the Infinite): "Bob ended the turn: the spells on the
         * stack were exiled.", told at once to every player but its
         * controller, the exiled stack as its cards.
         */
        END_TURN,
        /**
         * Spec 0102, item 3 (owner, Decided 2) -- a skip effect resolved (a
         * turn skipped: Meditate; a step or phase: Fatespinner, Moment of
         * Silence): "Bob's spell: you skip your next turn.", told when the
         * effect resolves (Forge says nothing when the turn or step is later
         * skipped), to every player but its controller.
         */
        SKIP,
        /**
         * Spec 0104 -- a card taken out of a player's hand by an effect another
         * player chooses for (Appetite for Brains, Castigate, Brain Maggot,
         * Kitesail Freebooter): "Alice exiled your Hill Giant.", told to the
         * hand's owner only, never to the one who chose.
         */
        HAND_EXILE,
        /**
         * Spec 0107 (owner Q5c A) -- a blocked trampler could trample over and
         * its player kept the extra on the blockers (a changed split): "Bob
         * put all five on your Grizzly Bears; none trampled over.", told to
         * the defending player only, never to the one who chose.
         */
        TRAMPLE_KEPT }

    /**
     * Spec 0074, Amendment 1 -- the kinds that hide nothing Forge shows (a
     * mill, a counter, a return, a fizzle, a phasing). Who is told is
     * {@link #tells}: since spec 0097, item 7, never the one who did it,
     * except a fizzle (both).
     */
    static boolean toBoth(Kind kind) {
        return kind == Kind.MILL || kind == Kind.COUNTER || kind == Kind.RETURN || kind == Kind.FIZZLE
                || kind == Kind.PHASE;
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
    /** Spec 0080 -- the permanents this effect phased out, as Forge did it. */
    private final List<Card> phasedOut = new ArrayList<>();

    /**
     * Spec 0107 -- kept trample splits made during a combat damage step, told
     * once the step is over (the blockers have died or not, so each picture
     * says where it went). The game thread only.
     */
    private final List<Report> trampleKept = new ArrayList<>();

    /** The latest report, for every reader (a choice's values merge into it). */
    private volatile Report latest;

    /**
     * Spec 0088 (Q2 A, Q3 C) -- every report each reader has not closed:
     * they stay through the turn line, and a newer one gathers the older ones
     * into the same window.
     */
    private final ReportBook<Player, Report> book = new ReportBook<>();

    /** A finished report, for every reader it tells. */
    private void tell(Report report) {
        latest = report;
        book.add(report.key, null, report);
    }

    /**
     * Spec 0102, item 1 (owner, Decided 1) -- the game restarted (Karn
     * Liberated): game 1's reports are forgotten for every reader, before the
     * RESTART report is made, so they never gather into its window.
     */
    void forgetAll() {
        book.clear();
        latest = null;
        reset();
        controlsFrom.clear();
    }

    /**
     * Spec 0088 (Q3 C) -- [reader] closed the report window, which showed
     * reports up to [upTo] (its newest stamp): they are gone for that reader,
     * and the ones every reader has closed are forgotten.
     */
    void closed(Player reader, long upTo) {
        book.close(reader, upTo);
        book.prune(game.getRegisteredPlayers());
    }

    ActionReports(Game game, java.util.concurrent.atomic.AtomicLong keys) {
        this.game = game;
        this.keys = keys;
    }

    /**
     * Spec 0097, item 4 -- the ability on top of the stack as last seen: a
     * restart (Karn Liberated) empties the stack before Forge says so, so
     * the card that did it is read from here.
     */
    private SpellAbility lastTop;

    /** Forge's events, as it fires them (on the game thread). */
    final class Listener {
        @com.google.common.eventbus.Subscribe
        public void on(forge.game.event.GameEvent event) {
            if (!game.getStack().isEmpty()) {
                SpellAbility top = game.getStack().peekAbility();
                if (top != null) {
                    lastTop = top;
                }
            }
            if (event instanceof forge.game.event.GameEventCardChangeZone moved) {
                noteResolving();
                if (resolving != null && moved.from() != null && moved.to() != null) {
                    Card card = game.findById(moved.card().getId());
                    if (card != null) {
                        moves.add(new Move(card.getId(), card.getOwner(), moved.from().zoneType(), moved.to().zoneType(),
                                moved.card().isFaceDown()));
                    }
                }
                // Spec 0102, item 3 -- a skip effect resolving puts its effect
                // card (a turn or step replacement) into the command zone.
                if (resolving != null && moved.card() != null && moved.to() != null
                        && moved.to().zoneType() == ZoneType.Command) {
                    Card effect = game.findById(moved.card().getId());
                    if (effect != null && Skips.of(effect) != null && !skipEffects.contains(effect)) {
                        skipEffects.add(effect);
                    }
                }
            } else if (event instanceof forge.game.event.GameEventShuffle shuffle) {
                noteResolving();
                Player who = playerOf(shuffle.player());
                if (who != null) {
                    shuffled.add(who);
                }
            } else if (event instanceof forge.game.event.GameEventCardPhased phased) {
                noteResolving();
                if (resolving != null && phased.phaseState() && phased.card() != null) {
                    Card card = game.findById(phased.card().getId());
                    if (card != null && !phasedOut.contains(card)) {
                        phasedOut.add(card);
                    }
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
                // Spec 0100, item 8 -- a change-targets effect: whose target moved.
                retargeted(Copies.resolved(game, resolved));
                // Spec 0079 -- a spell that fizzled did nothing: that is its report.
                if (!(resolved.hasFizzled() && fizzled(resolved))) {
                    finish();
                }
                noteTargets();
                // Spec 0101 -- what resolved now (after its report): its own
                // move off the stack follows, and starts nothing.
                justResolved = game.getStack().isEmpty() ? null : game.getStack().peekAbility();
                return;
            }
            // Spec 0107 -- a damage step is over: its kept trample splits are told.
            if (event instanceof forge.game.event.GameEventTurnPhase step && !trampleKept.isEmpty()
                    && step.phase() != forge.game.phase.PhaseType.COMBAT_DAMAGE
                    && step.phase() != forge.game.phase.PhaseType.COMBAT_FIRST_STRIKE_DAMAGE) {
                tellTrampleKept();
            } else if (event instanceof forge.game.event.GameEventTurnBegan && !trampleKept.isEmpty()) {
                tellTrampleKept();
            }
            if (event instanceof forge.game.event.GameEventTurnPhase phase
                    && phase.phase() == forge.game.phase.PhaseType.COMBAT_BEGIN) {
                // Spec 0089 (Q3 A) -- a combat beginning after one already
                // this turn is an extra one: told now.
                extraCombat();
            } else if (event instanceof forge.game.event.GameEventTurnBegan) {
                // Spec 0088 (Q2 A) -- a report is no longer cleared at the
                // turn line: Bob's Opt in Alice's end step stays until she
                // closes it (ReportBook). Only what was being gathered for an
                // effect still resolving is dropped.
                reset();
                // Spec 0086 (10 B) -- unless it is an extra turn: that is told now.
                extraTurn();
                // Spec 0102, item 2 -- a turn another player plays (Mindslaver).
                controlled();
            } else if (event instanceof forge.game.event.GameEventPlayerControl) {
                // Spec 0102, item 2 -- control that came once the turn began.
                controlled();
            }
            noteDungeons();
            if (event instanceof forge.game.event.GameEventSpellAbilityCast
                    || event instanceof forge.game.event.GameEventCardChangeZone) {
                noteAims();
            }
            if (event instanceof forge.game.event.GameEventSpellAbilityCast) {
                noteTargets();
            }
        }
    }

    /**
     * Spec 0100, item 8 -- every stack entry's targets as last seen: when
     * something is put on the stack and after each resolution, so never in
     * the middle of the change-targets effect that moves them.
     */
    private final java.util.Map<SpellAbility, List<Object>> aimedAt = new java.util.IdentityHashMap<>();

    private void noteTargets() {
        aimedAt.clear();
        for (forge.game.spellability.SpellAbilityStackInstance each : game.getStack()) {
            SpellAbility sa = each.getSpellAbility();
            if (sa != null) {
                aimedAt.put(sa, targetsNow(sa));
            }
        }
    }

    /** What [sa] aims at, through its sub-abilities: cards, players, spells, once each, in order. */
    static List<Object> targetsNow(SpellAbility sa) {
        List<Object> out = new ArrayList<>();
        for (SpellAbility part = sa; part != null; part = part.getSubAbility()) {
            if (part.getTargets() == null) {
                continue;
            }
            for (Object each : part.getTargets()) {
                if (!out.contains(each)) {
                    out.add(each);
                }
            }
        }
        return out;
    }

    /**
     * Spec 0100, item 8 -- [by] resolved; when it is a change-targets effect
     * (Forge's ApiType.ChangeTargets), each stack entry whose targets now
     * differ from before is told to its controller: "Bob changed your
     * Lightning Bolt's target to Spellskite.", with the spell and its new
     * target as pictures. The one who changed it is not told (tells).
     */
    private void retargeted(SpellAbility by) {
        if (by == null || by.getActivatingPlayer() == null || by.getHostCard() == null) {
            return;
        }
        boolean changes = false;
        for (SpellAbility part = by; part != null; part = part.getSubAbility()) {
            changes |= part.getApi() == ApiType.ChangeTargets;
        }
        if (!changes) {
            return;
        }
        for (forge.game.spellability.SpellAbilityStackInstance each : game.getStack()) {
            SpellAbility sa = each.getSpellAbility();
            List<Object> before = sa == null || sa == by ? null : aimedAt.get(sa);
            if (before == null || sa.getHostCard() == null || sa.getActivatingPlayer() == null) {
                continue;
            }
            List<Object> now = targetsNow(sa);
            if (now.equals(before)) {
                continue;
            }
            Object fresh = now.stream().filter(o -> !before.contains(o)).findFirst().orElse(null);
            if (fresh == null) {
                continue;
            }
            Card spell = sa.getHostCard();
            List<Move> shown = new ArrayList<>();
            shown.add(new Move(spell.getId(), spell.getOwner(), ZoneType.Stack, ZoneType.Stack, spell.isFaceDown()));
            if (fresh instanceof Card card && card.getZone() != null) {
                ZoneType zone = card.getZone().getZoneType();
                shown.add(new Move(card.getId(), card.getOwner(), zone, zone, card.isFaceDown()));
            }
            Report report = new Report(keys.incrementAndGet(), by.getActivatingPlayer(), by.getHostCard().getName(),
                    Kind.RETARGET, sa.getActivatingPlayer(), shown.size(), shown, new java.util.HashMap<>(), false,
                    -1, 0);
            report.chooser = by.getActivatingPlayer();
            report.retargeted = spell.isFaceDown() ? "face-down spell" : spell.getName();
            report.newTarget = fresh;
            for (Move move : shown) {
                Card card = game.findById(move.cardId());
                if (card != null) {
                    report.cards.put(card.getId(), card);
                }
            }
            tell(report);
        }
    }

    /**
     * Spec 0101, item 2 -- [ability] (on the stack) was countered while
     * [by] resolved: a COUNTER_ABILITY report, the ability's source card as
     * its picture (where it is now), told to the ability's controller.
     */
    void abilityCountered(SpellAbility ability, SpellAbility by) {
        if (ability == null || by == null || ability.getHostCard() == null || ability.getActivatingPlayer() == null
                || by.getActivatingPlayer() == null || by.getHostCard() == null) {
            return;
        }
        Card source = game.findById(ability.getHostCard().getId());
        Card card = source != null ? source : ability.getHostCard();
        ZoneType zone = card.getZone() == null ? ZoneType.Battlefield : card.getZone().getZoneType();
        List<Move> shown = new ArrayList<>();
        shown.add(new Move(card.getId(), card.getOwner(), zone, zone, card.isFaceDown()));
        Card spell = by.getHostCard();
        Report report = new Report(keys.incrementAndGet(), by.getActivatingPlayer(),
                spell.isFaceDown() ? "a face-down card" : spell.getName(), Kind.COUNTER_ABILITY,
                ability.getActivatingPlayer(), shown.size(), shown, new java.util.HashMap<>(), false, -1, 0);
        report.chooser = by.getActivatingPlayer();
        report.retargeted = card.isFaceDown() ? "a face-down card" : card.getName();
        report.cards.put(card.getId(), card);
        tell(report);
    }

    /**
     * Spec 0107 (Q5c A) -- [attacker] (trample) was blocked, could trample
     * over, and its player kept the extra on the blockers: [split] is what
     * was assigned (a null key the defender's share). Held until the damage
     * step is over, then told to [defending] only (tells).
     */
    void trampleKept(Card attacker, Iterable<Card> blockers, Map<Card, Integer> split, Player defending,
            int damage) {
        Player actor = attacker.getController();
        if (actor == null || defending == null) {
            return;
        }
        List<Move> shown = new ArrayList<>();
        List<int[]> each = new ArrayList<>();
        shown.add(new Move(attacker.getId(), attacker.getOwner(), ZoneType.Battlefield, ZoneType.Battlefield,
                attacker.isFaceDown()));
        for (Card blocker : blockers) {
            shown.add(new Move(blocker.getId(), blocker.getOwner(), ZoneType.Battlefield, ZoneType.Battlefield,
                    blocker.isFaceDown()));
            each.add(new int[] {blocker.getId(), split.getOrDefault(blocker, 0)});
        }
        Report report = new Report(keys.incrementAndGet(), actor,
                attacker.isFaceDown() ? "a face-down card" : attacker.getName(), Kind.TRAMPLE_KEPT, defending,
                shown.size(), shown, new java.util.HashMap<>(), false, -1, 0);
        report.chooser = actor;
        report.split = each;
        report.over = split.getOrDefault(null, 0);
        report.damage = damage;
        report.cards.put(attacker.getId(), attacker);
        for (Card blocker : blockers) {
            report.cards.put(blocker.getId(), blocker);
        }
        trampleKept.add(report);
    }

    /** Spec 0107 -- the damage step is over: each kept split told, its blockers' pictures where they went. */
    private void tellTrampleKept() {
        for (Report report : trampleKept) {
            for (int[] one : report.split) {
                String place = whereIs(one[0]);
                if (place != null && !"battlefield".equals(place)) {
                    report.where.put(one[0], place);
                }
            }
            tell(report);
        }
        trampleKept.clear();
    }

    /** Spec 0101, item 2 -- "Bob countered Prodigal Pyromancer's ability with Stifle." */
    static String abilityCounteredWords(String actor, String card, String spell) {
        return actor + " countered " + card + "'s ability with " + spell + ".";
    }

    /** Spec 0100, item 8 -- the sentence, to the spell's controller ("Bob changed your Lightning Bolt's target to Spellskite."). */
    static String retargetWords(String actor, String spell, String target) {
        return actor + " changed your " + spell + "'s target to " + target + ".";
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
            tell(report);
            return true;
        } finally {
            reset();
        }
    }

    private void noteResolving() {
        if (resolving == null && game.getStack().isResolving() && !game.getStack().isEmpty()) {
            SpellAbility top = game.getStack().peekAbility();
            if (startsResolving(top, justResolved)) {
                resolving = top;
            }
        }
    }

    /**
     * Spec 0101 (found in its real-click game) -- the entry that last said it
     * resolved (GameEventSpellResolved). Forge moves a spell's card off the
     * stack AFTER that event, with the stack still resolving and the spell
     * still its top entry (MagicStack#finishResolving: removeCardFromStack,
     * then remove(si)); that move must not start a new effect. It did: after
     * Stifle resolved, its own move to the graveyard set `resolving` back to
     * Stifle, the next permanent spell's move onto the battlefield was
     * gathered under it, and that spell was reported countered ("Pat
     * countered your Wingshield Agent.").
     */
    private SpellAbility justResolved;

    /** Whether [top] (the stack's top while it resolves) starts a new effect: not the one that just resolved. */
    static <S> boolean startsResolving(S top, S justResolved) {
        return top != null && top != justResolved;
    }

    /**
     * Spec 0109, item 7 (test 3) -- Forge showed a card to a player while an
     * effect resolved (Causes#revealed): that effect's report is never quiet.
     */
    private volatile boolean revealedHere;

    /** Causes#revealed -- a reveal or a look, now. Counted only while the stack resolves. */
    void revealedNow() {
        if (game.getStack().isResolving()) {
            revealedHere = true;
        }
    }

    private void reset() {
        resolving = null;
        revealedHere = false;
        moves.clear();
        shuffled.clear();
        scryTop = -1;
        scryBottom = 0;
        surveilKept = -1;
        surveilAway = 0;
        values.clear();
        phasedOut.clear();
        skipEffects.clear();
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
            noteExtraTurns(sa);
            noteExtraCombats(sa);
            noteControls(sa);
            Report report = build(sa);
            // Spec 0109, item 7 (owner, canvas "7" A) -- no window for what the
            // animation already showed: the arrow pointed at the card, it
            // landed in sight, nothing was hidden. The play log keeps its line
            // (PlayLog#moved, which never reads these reports).
            if (report != null && values.isEmpty() && quiet(report, sa)) {
                report = null;
            }
            // Spec 0102, item 3 -- a skip effect: told now, as it resolves
            // (with the choices that made it, when it is nothing else).
            Report skip = skipped(sa);
            if (skip != null) {
                if (report == null) {
                    report = skip;
                } else {
                    tell(skip);
                }
            }
            // Spec 0075 -- the choices and flips Forge told while it resolved
            // ride with its report, or are the report (Voice of All).
            if (!values.isEmpty()) {
                Report told = report != null ? report : choiceReport(sa);
                values.forEach((reader, list) -> told.values.put(reader, List.copyOf(list)));
                report = told;
            }
            if (report != null) {
                tell(report);
            }
        } finally {
            reset();
        }
    }

    /**
     * Spec 0109, item 7 (owner 2026-11-20, canvas "7" option A) -- the kinds
     * whose window goes when the animation told the whole story. CONTROL is
     * here as the spec names it, but Kind.CONTROL is Mindslaver's "Bob is
     * playing your turn." (spec 0102): told as the turn begins, outside any
     * resolution and with no card moved, so test 1 never holds for it and
     * its window always stays. Act of Treason (Forge's GainControl) has no
     * report at all (kindOf).
     */
    static boolean mayBeQuiet(Kind kind) {
        return kind == Kind.BOUNCE || kind == Kind.RETURN || kind == Kind.COUNTER || kind == Kind.CONTROL;
    }

    /** Spec 0109, item 7, test 2 -- a place every player sees a card land in, face up. */
    static boolean landsInSight(ZoneType to, boolean faceDown) {
        return !faceDown && (to == ZoneType.Hand || to == ZoneType.Graveyard || to == ZoneType.Battlefield
                || to == ZoneType.Exile);
    }

    /**
     * Spec 0109, item 7 -- whether [report], made as [root] resolved, says
     * nothing the table did not already show, so it gets no window. All five
     * of the spec's tests, read from Forge's state for the resolving effect
     * (never from words):
     *  1. the cause was visible: [root] was on the stack and every card the
     *     report shows was among its targets (its arrow) -- a spell the
     *     counter aimed at counts by its card;
     *  2. each landed in sight: a hand, a graveyard, exile face up or the
     *     battlefield; not a library, not face down;
     *  3. nothing hidden: no card shown or looked at while it resolved
     *     (Causes#revealed), no shuffle, no scry or surveil, no choice told
     *     (the caller's `values`), and no other card moved out of a hidden
     *     zone but a draw;
     *  4. one visible result: every card shown went to the same place, and
     *     nothing else moved but a draw and the source itself;
     *  5. not a non-event: a fizzle is its own path (fizzled) and never here.
     */
    private boolean quiet(Report report, SpellAbility root) {
        if (!mayBeQuiet(report.kind) || report.moves.isEmpty()) {
            return false;
        }
        // 3. Nothing hidden.
        if (revealedHere || !shuffled.isEmpty() || scryTop >= 0 || surveilKept >= 0) {
            return false;
        }
        // 1. The arrow: every card shown was a target of the effect on the stack.
        java.util.Set<Integer> aimed = new java.util.HashSet<>();
        List<Object> targets = new ArrayList<>(aimedAt.getOrDefault(root, List.of()));
        targets.addAll(targetsNow(root));
        for (Object target : targets) {
            if (target instanceof Card card) {
                aimed.add(card.getId());
            } else if (target instanceof SpellAbility spell && spell.getHostCard() != null) {
                aimed.add(spell.getHostCard().getId());
            }
        }
        java.util.Set<Integer> shown = new java.util.HashSet<>();
        ZoneType landed = null;
        for (Move move : report.moves) {
            if (!aimed.contains(move.cardId())) {
                return false;
            }
            // 2. Landed in sight, face up then and now.
            Card now = game.findById(move.cardId());
            if (!landsInSight(move.to(), move.faceDown() || (now != null && now.isFaceDown()))) {
                return false;
            }
            // 4. One place for all of them.
            if (landed != null && landed != move.to()) {
                return false;
            }
            landed = move.to();
            shown.add(move.cardId());
        }
        // 3 and 4. Nothing else moved, but a draw (Repulse) and the source itself.
        boolean draws = false;
        for (SpellAbility part = root; part != null; part = part.getSubAbility()) {
            draws |= part.getApi() == ApiType.Draw;
        }
        int host = root.getHostCard() == null ? -1 : root.getHostCard().getId();
        for (Move move : moves) {
            boolean drew = draws && move.from() == ZoneType.Library && move.to() == ZoneType.Hand;
            if (!shown.contains(move.cardId()) && move.cardId() != host && !drew) {
                return false;
            }
        }
        return true;
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
        if (kind == null && !phasedOut.isEmpty()) {
            return phased(root, actor, host);
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
        // Spec 0104 -- about the player whose hand it was: another's card the
        // actor chose; nothing taken from another's hand, no report.
        if (kind == Kind.HAND_EXILE) {
            mine = mine.stream().filter(move -> move.owner() != actor).toList();
            if (mine.isEmpty()) {
                return null;
            }
            subject = mine.get(0).owner();
        }
        // Spec 0102, item 3 -- nothing was exiled with it (Sundial of the
        // Infinite's ability on an empty stack): the card that did it, as it is.
        if (kind == Kind.END_TURN && mine.isEmpty()) {
            Card now = game.findById(host.getId());
            Card card = now != null ? now : host;
            ZoneType zone = card.getZone() == null ? ZoneType.Battlefield : card.getZone().getZoneType();
            Report report = new Report(keys.incrementAndGet(), actor, host.getName(), kind, actor, 0,
                    List.of(new Move(card.getId(), card.getOwner(), zone, zone, card.isFaceDown())),
                    new java.util.HashMap<>(), false, -1, 0);
            report.chooser = actor;
            report.cards.put(card.getId(), card);
            return report;
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
        report.hostId = host.getId();
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

    /**
     * Spec 0080 (Q2 A, with the window) -- "Bob's permanents phased out until
     * Bob's next turn.": whose they were (the first that is not the actor's,
     * else the actor's), and each one, public on the battlefield. They phase
     * in at their controller's next untap step (CR 702.26b).
     */
    private Report phased(SpellAbility root, Player actor, Card host) {
        Player subject = phasedOut.stream().map(Card::getController).filter(c -> c != null && c != actor)
                .findFirst().orElse(actor);
        List<Move> shown = new ArrayList<>();
        java.util.Map<Integer, String> where = new java.util.HashMap<>();
        for (Card card : phasedOut) {
            if (card.getController() == subject) {
                shown.add(new Move(card.getId(), card.getOwner(), ZoneType.Battlefield, ZoneType.Battlefield,
                        card.isFaceDown()));
            }
        }
        // All of them: every permanent that player controls is phased out now.
        boolean all = subject.getCardsIn(ZoneType.Battlefield, false).stream().allMatch(Card::isPhasedOut);
        Report report = new Report(keys.incrementAndGet(), actor, host == null ? "" : host.getName(), Kind.PHASE,
                subject, all ? -1 : shown.size(), shown, where, false, -1, 0);
        report.chooser = actor;
        report.lifeHeld = lifeHeldBy(game, host, subject);
        for (Move move : shown) {
            Card card = game.findById(move.cardId());
            if (card != null) {
                report.cards.put(move.cardId(), card);
            }
        }
        return report;
    }

    /**
     * Spec 0080 -- whether an effect [host] made (Forge's effect card, whose
     * effect source is [host]) holds a static ability of mode CantChangeLife
     * that applies to [player] now: Forge's own test (its conditions, and
     * StaticAbilityCantGainLosePayLife#applyCommonAbility's ValidPlayer).
     * Read from Forge's state, never from the card's name or text.
     */
    static boolean lifeHeldBy(Game game, Card host, Player player) {
        if (host == null || player == null) {
            return false;
        }
        for (Card effect : game.getCardsIn(ZoneType.STATIC_ABILITIES_SOURCE_ZONES)) {
            Card source = effect.getEffectSource();
            if (source == null || source.getId() != host.getId()) {
                continue;
            }
            for (forge.game.staticability.StaticAbility st : effect.getStaticAbilities()) {
                if (st.checkMode(forge.game.staticability.StaticAbilityMode.CantChangeLife) && st.checkConditions()
                        && forge.game.staticability.StaticAbilityCantGainLosePayLife.applyCommonAbility(st, player)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Spec 0086 (10 B) -- the cards that gave each player an extra turn, the
     * newest last (Forge's extra turns are a stack too:
     * PhaseHandler#addExtraTurn). Kept as each AddTurn effect resolves, for
     * the players it names (Forge's own Defined, "You" when unsaid).
     */
    private final java.util.Map<Player, java.util.Deque<Gift>> extraTurnsFrom = new java.util.HashMap<>();

    /**
     * Spec 0089, Amendment 1 / spec 0086, Amendment 4 (owner 2026-11-15) -- a
     * card that gave an extra turn or combat, and who played it: Forge's own
     * record of who activated the spell or ability that resolved
     * (SpellAbility#getActivatingPlayer), never a name. That player is not
     * told; everyone else is -- also when it is an opponent's turn or combat
     * they gave.
     */
    record Gift(Card card, Player by) {}

    private void noteExtraTurns(SpellAbility root) {
        for (SpellAbility each = root; each != null; each = each.getSubAbility()) {
            if (each.getApi() != ApiType.AddTurn) {
                continue;
            }
            int turns = amount(each, "NumTurns", 1);
            List<Player> who;
            try {
                who = new ArrayList<>(AbilityUtils.getDefinedPlayers(root.getHostCard(),
                        each.getParamOrDefault("Defined", "You"), each));
            } catch (RuntimeException e) {
                who = List.of(root.getActivatingPlayer());
            }
            for (Player player : who) {
                for (int i = 0; i < Math.max(1, turns); i++) {
                    extraTurnsFrom.computeIfAbsent(player, p -> new java.util.ArrayDeque<>())
                            .addLast(new Gift(root.getHostCard(), root.getActivatingPlayer()));
                }
            }
        }
    }

    /**
     * Spec 0086 (10 B) -- the turn that just began is an extra one (Forge's
     * Player#isExtraTurn, set as it began): "Extra turn: this is Alice's turn
     * again.", to every player but whoever played the card (Amendment 4), with the card that gave it where it is now.
     */
    private void extraTurn() {
        Player active = game.getPhaseHandler().getPlayerTurn();
        if (active == null || !active.isExtraTurn()) {
            return;
        }
        java.util.Deque<Gift> from = extraTurnsFrom.get(active);
        Gift gift = from == null || from.isEmpty() ? null : from.pollLast();
        Card host = gift == null ? null : gift.card();
        List<Move> shown = new ArrayList<>();
        java.util.Map<Integer, String> where = new java.util.HashMap<>();
        if (host != null) {
            Card now = game.findById(host.getId());
            Card card = now != null ? now : host;
            ZoneType zone = card.getZone() == null ? ZoneType.Graveyard : card.getZone().getZoneType();
            shown.add(new Move(card.getId(), card.getOwner(), ZoneType.Stack, zone, card.isFaceDown()));
            where.put(card.getId(), whereIs(card.getId()));
            host = card;
        }
        Report report = new Report(keys.incrementAndGet(), active, host == null ? "" : host.getName(),
                Kind.EXTRA_TURN, active, shown.size(), shown, where, false, -1, 0);
        // Amendment 4 (0086): whoever played the card is not told.
        report.chooser = gift != null && gift.by() != null ? gift.by() : active;
        if (host != null) {
            report.cards.put(host.getId(), host);
        }
        tell(report);
    }

    /**
     * Spec 0089 (Q3 A) -- the cards that gave each player an extra combat,
     * the newest last: kept as each AddPhase effect that adds a combat phase
     * resolves (Forge's own "ExtraPhase$ Combat" on the ability: Aurelia's
     * trigger, Relentless Assault), for the player who made it.
     */
    private final java.util.Map<Player, java.util.Deque<Gift>> extraCombatsFrom = new java.util.HashMap<>();

    private void noteExtraCombats(SpellAbility root) {
        for (SpellAbility each = root; each != null; each = each.getSubAbility()) {
            if (each.getApi() != ApiType.AddPhase || !"Combat".equals(each.getParam("ExtraPhase"))) {
                continue;
            }
            // The combat is added to the turn now being played (AddPhaseEffect),
            // whoever played the card; that player is kept to leave out.
            Player turn = game.getPhaseHandler().getPlayerTurn();
            Player by = root.getActivatingPlayer();
            if (turn != null && root.getHostCard() != null) {
                extraCombatsFrom.computeIfAbsent(turn, p -> new java.util.ArrayDeque<>())
                        .addLast(new Gift(root.getHostCard(), by));
            }
        }
    }

    /**
     * Spec 0089 (Q3 A) -- a combat phase begins and the turn has had one
     * already (Forge's PhaseHandler#getNumCombat: Forge counts a combat as it
     * begins, after this event): an extra combat. "Extra combat: Alice
     * attacks again.", to every player but whoever played the card (0089 Amendment 1), with the card that gave it where it is now.
     */
    private void extraCombat() {
        forge.game.phase.PhaseHandler phases = game.getPhaseHandler();
        Player active = phases.getPlayerTurn();
        if (active == null || phases.getNumCombat() < 1) {
            return;
        }
        java.util.Deque<Gift> from = extraCombatsFrom.get(active);
        Gift gift = from == null || from.isEmpty() ? null : from.pollLast();
        Card host = gift == null ? null : gift.card();
        List<Move> shown = new ArrayList<>();
        java.util.Map<Integer, String> where = new java.util.HashMap<>();
        if (host != null) {
            Card now = game.findById(host.getId());
            Card card = now != null ? now : host;
            ZoneType zone = card.getZone() == null ? ZoneType.Graveyard : card.getZone().getZoneType();
            shown.add(new Move(card.getId(), card.getOwner(), ZoneType.Stack, zone, card.isFaceDown()));
            where.put(card.getId(), whereIs(card.getId()));
            host = card;
        }
        Report report = new Report(keys.incrementAndGet(), active, host == null ? "" : host.getName(),
                Kind.EXTRA_COMBAT, active, shown.size(), shown, where, false, -1, 0);
        // Amendment 1 (0089): whoever played the card is not told.
        report.chooser = gift != null && gift.by() != null ? gift.by() : active;
        if (host != null) {
            report.cards.put(host.getId(), host);
        }
        tell(report);
    }

    /**
     * Spec 0102, item 2 -- the cards that will make another player control
     * each player (Mindslaver), the newest last: kept as each ControlPlayer
     * effect resolves, for the players it targets, with who played it.
     */
    private final java.util.Map<Player, java.util.Deque<Gift>> controlsFrom = new java.util.HashMap<>();
    /** Spec 0102, item 2 -- the card that made each controlled player's controller, while it lasts. */
    private final java.util.Map<Player, Card> controlSources = new java.util.concurrent.ConcurrentHashMap<>();
    /**
     * The controlled player last told, while that control lasts (once per
     * controlled turn: Forge gives control as the turn changes hands, a moment
     * before the turn's number moves on and GameEventTurnBegan fires).
     */
    private Player controlToldFor;

    private void noteControls(SpellAbility root) {
        for (SpellAbility each = root; each != null; each = each.getSubAbility()) {
            if (each.getApi() != ApiType.ControlPlayer || each.getTargets() == null) {
                continue;
            }
            for (Player target : each.getTargets().getTargetPlayers()) {
                controlsFrom.computeIfAbsent(target, p -> new java.util.ArrayDeque<>())
                        .addLast(new Gift(root.getHostCard(), root.getActivatingPlayer()));
            }
        }
    }

    /**
     * Spec 0102, item 2 -- the card that made [player] controlled by another
     * player now (Mindslaver, where it is now), or null: for the chain round
     * that player's plate.
     */
    Card controlSource(Player player) {
        if (player == null || !player.isControlled()) {
            return null;
        }
        Card card = controlSources.get(player);
        if (card == null) {
            return null;
        }
        Card now = game.findById(card.getId());
        return now != null ? now : card;
    }

    /**
     * Spec 0102, item 2 (owner, missed Q7 A) -- the turn that began (or the
     * control that came during it) is played by another player (Forge's
     * Player#isControlled): "Bob is playing your turn.", to the controlled
     * player only, with the card that did it as it was. Once a turn.
     */
    private void controlled() {
        forge.game.phase.PhaseHandler phases = game.getPhaseHandler();
        Player active = phases.getPlayerTurn();
        if (active == null || !active.isControlled()) {
            controlToldFor = null;
            return;
        }
        if (controlToldFor == active) {
            return;
        }
        controlToldFor = active;
        Player controller = active.getControllingPlayer();
        java.util.Deque<Gift> from = controlsFrom.get(active);
        Gift gift = from == null || from.isEmpty() ? null : from.pollLast();
        Card host = gift == null ? null : gift.card();
        List<Move> shown = new ArrayList<>();
        if (host != null) {
            controlSources.put(active, host);
            shown.add(new Move(host.getId(), host.getOwner(), ZoneType.Battlefield, ZoneType.Battlefield, false));
        }
        Report report = new Report(keys.incrementAndGet(), controller, host == null ? "" : host.getName(),
                Kind.CONTROL, active, 0, shown, new java.util.HashMap<>(), false, -1, 0);
        report.chooser = controller;
        if (host != null) {
            report.cards.put(host.getId(), host);
        }
        tell(report);
    }

    /** Spec 0102, item 2 -- "Bob is playing your turn." ([player] null: the reader, who never reads it). */
    static String controlWords(String player) {
        return (player == null ? "You are" : player + " is") + " playing your turn.";
    }

    /** Spec 0102, item 3 -- the effect cards of skips made while this effect resolved. */
    private final List<Card> skipEffects = new ArrayList<>();

    /**
     * Spec 0102, item 3 (owner, Decided 2) -- a skip effect resolved: Forge
     * put a turn or step replacement into the skipping player's command zone
     * (SkipTurnEffect, SkipPhaseEffect). "Bob's spell: you skip your next
     * turn.", "Bob's spell: you skip your combat." (Fatespinner), told now, to
     * every player but its controller; the card that did it as its picture.
     */
    private Report skipped(SpellAbility sa) {
        if (skipEffects.isEmpty()) {
            return null;
        }
        Card effect = skipEffects.get(0);
        Skips.Skip what = Skips.of(effect);
        if (what == null) {
            return null;
        }
        Player actor = sa.getActivatingPlayer();
        Card host = sa.getHostCard();
        ZoneType zone = host.getZone() == null ? ZoneType.Stack : host.getZone().getZoneType();
        List<Move> shown = List.of(new Move(host.getId(), host.getOwner(), zone, zone, host.isFaceDown()));
        Report report = new Report(keys.incrementAndGet(), actor, host.isFaceDown() ? "a face-down card" : host.getName(),
                Kind.SKIP, effect.getOwner(), what.turns(), shown, new java.util.HashMap<>(), false, -1, 0);
        report.chooser = actor;
        report.skipped = what.step();
        report.cards.put(host.getId(), host);
        return report;
    }

    /**
     * Spec 0102, item 3 -- "Bob's Fatespinner: you skip your next turn." To
     * another reader: "Bob's Fatespinner: Alice skips their next combat."
     * ([card] the card that did it; [player] null: the reader; [step] null: a
     * whole turn, [turns] of them).
     */
    static String skipWords(String actor, String card, String player, String step, int turns) {
        // Spec 0113 (W1-156) -- the card by its name (Fatespinner is no spell), "next two turns".
        String what = step != null ? "next " + step
                : turns > 1 ? "next " + PlainWords.count(turns, "turn") : "next turn";
        String whose = card == null || card.isBlank() || card.startsWith("a face-down")
                ? actor + "'s face-down card" : actor + "'s " + card;
        return whose + ": " + (player == null ? "you skip your " : player + " skips their ") + what + ".";
    }

    /**
     * Spec 0102, item 3 -- "Bob ended the turn: the spells on the stack were
     * exiled." ([spells] false: nothing else was on the stack).
     */
    static String endTurnWords(String actor, boolean spells) {
        return actor + " ended the turn" + (spells ? ": the spells on the stack were exiled." : ".");
    }

    /** Spec 0086 (8) -- how many dungeons each player had completed, as last seen. */
    private final java.util.Map<Player, Integer> dungeonsDone = new java.util.HashMap<>();

    /**
     * Spec 0086 (8) -- a player completed a dungeon (Forge's
     * Player#getCompletedDungeons grew, GameAction#completeDungeon): a report
     * to the other player, "Alice completed Tomb of Annihilation.", with the
     * dungeon's map as its picture. Forge sends no event for it, so it is
     * looked for as each event arrives (the game thread only).
     */
    private void noteDungeons() {
        for (Player player : game.getRegisteredPlayers()) {
            List<Card> done = player.getCompletedDungeons();
            int was = dungeonsDone.getOrDefault(player, 0);
            if (done.size() == was) {
                continue;
            }
            dungeonsDone.put(player, done.size());
            if (done.size() < was || done.isEmpty()) {
                continue;
            }
            Card dungeon = done.get(done.size() - 1);
            Report report = new Report(keys.incrementAndGet(), player, dungeon.getName(), Kind.DUNGEON, player, 0,
                    List.of(), new java.util.HashMap<>(), false, -1, 0);
            report.chooser = player;
            tell(report);
        }
    }

    /** Spec 0092 -- did this ability bring its card somewhere: a spell, or a replacement as it entered? */
    static boolean arrives(SpellAbility sa) {
        return sa != null && (sa.isSpell() || sa.isReplacementAbility());
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
                // Spec 0092 -- and only a card that really arrived gets "-> place": a
                // spell, or a replacement as it entered (Voice of All). An ability of a
                // card already on the table (a land, a creature) is not an arrival.
                if (arrives(sa) && !"stack".equals(place)) {
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
            tell(now);
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
    /**
     * Spec 0097, item 3 (owner) -- [sa], a trigger with a mana cost, was not
     * played: its controller could not pay [cost]. The fizzle window, told
     * to both players (0079's precedent): "Bob's Lightning Rift did nothing:
     * they couldn't pay {1}." / "Your Lightning Rift did nothing: you
     * couldn't pay {1}.", with the card where it is.
     */
    void unpaid(SpellAbility sa, String cost) {
        if (sa == null || sa.getHostCard() == null || sa.getActivatingPlayer() == null) {
            return;
        }
        Card host = sa.getHostCard();
        Card now = game.findById(host.getId());
        Card card = now != null ? now : host;
        ZoneType zone = card.getZone() == null ? ZoneType.Battlefield : card.getZone().getZoneType();
        List<Move> shown = new ArrayList<>();
        shown.add(new Move(card.getId(), card.getOwner(), zone, zone, card.isFaceDown()));
        String source = card.isFaceDown() ? "a face-down card" : card.getName();
        Report report = new Report(keys.incrementAndGet(), sa.getActivatingPlayer(), source, Kind.FIZZLE,
                sa.getActivatingPlayer(), shown.size(), shown, new java.util.HashMap<>(), false, -1, 0);
        report.chooser = sa.getActivatingPlayer();
        report.unpaid = cost;
        report.cards.put(card.getId(), card);
        tell(report);
    }

    /**
     * Spec 0097, item 4 (owner) -- [who] restarted the game, which is now
     * game [number] of the match: "Bob restarted the game. This is game 2.",
     * to the other player only, with the card that did it (the ability last
     * seen on top of the stack: Karn Liberated).
     */
    void restarted(forge.game.player.PlayerView who, int number) {
        SpellAbility by = lastTop;
        Player actor = null;
        for (Player each : game.getRegisteredPlayers()) {
            if (who != null && each.getView().equals(who)) {
                actor = each;
            }
        }
        if (actor == null && by != null) {
            actor = by.getActivatingPlayer();
        }
        if (actor == null) {
            return;
        }
        Card host = by == null ? null : by.getHostCard();
        List<Move> shown = new ArrayList<>();
        if (host != null) {
            shown.add(new Move(host.getId(), host.getOwner(), ZoneType.Battlefield, ZoneType.Battlefield,
                    false));
        }
        Report report = new Report(keys.incrementAndGet(), actor, host == null ? "" : host.getName(),
                Kind.RESTART, actor, number, shown, new java.util.HashMap<>(), false, -1, 0);
        report.chooser = actor;
        if (host != null) {
            report.cards.put(host.getId(), host);
        }
        tell(report);
    }

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
        // Spec 0113 (W1-155) -- our own zone words, never Forge's translated name.
        report.zone = zoneWords(zone);
        // Made for this reader alone (ReportBook's onlyFor).
        book.add(report.key, reader, report);
    }

    /**
     * Amendment 13 (item 7) -- is [player] the one making the choices for an
     * effect this class reports, resolving now? Forge's own reveal to them
     * (Goblin Ringleader's four, Thoughtseize's hand) and its "Looking at
     * ..." line are then not shown: they chose, and the other player gets
     * the report.
     */
    /**
     * Spec 0104 -- the stack entries (Forge's own objects, by identity, held
     * weakly: gone once resolved) whose hand-exile had a card to choose.
     */
    private static final java.util.Map<Object, Boolean> CHOSE_FROM_HAND =
            java.util.Collections.synchronizedMap(new java.util.WeakHashMap<>());

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
            // Spec 0102, item 3: ending the turn hides nothing either.
            if (kind == Kind.BOUNCE || kind == Kind.END_TURN) {
                return false;
            }
            // Spec 0104: the one choosing from another's hand is shown it in the
            // question (MatchController#alsoShown); nothing to choose, the reveal stays.
            if (kind == Kind.HAND_EXILE) {
                if (root.getActivatingPlayer() != player) {
                    return false;
                }
                // Once there was a choice, the rest of this resolution is the
                // choice's too: Forge's reveal of the card taken, after it went.
                Object entry = game.getStack().peek();
                if (entry != null && CHOSE_FROM_HAND.containsKey(entry)) {
                    return true;
                }
                boolean choosing = handHasChoice(each, player);
                if (choosing && entry != null) {
                    CHOSE_FROM_HAND.put(entry, Boolean.TRUE);
                }
                return choosing;
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
                    // Spec 0104: out of a hand another player chooses from.
                    : origin.contains("Hand") && !destination.isEmpty() && !destination.contains("Hand")
                    && choosesFromAnotherHand(sa) ? Kind.HAND_EXILE
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
            // Spec 0102, item 3: Time Stop, Sundial of the Infinite.
            case EndTurn -> Kind.END_TURN;
            default -> null;
        };
    }

    /**
     * Spec 0104 -- a move out of a hand whose cards the effect's controller
     * chooses (`Chooser$ You` with `DefinedPlayer$`: Appetite for Brains,
     * Castigate), not the hand's owner (Arcane Artisan: they exile their own).
     */
    static boolean choosesFromAnotherHand(SpellAbility sa) {
        return sa.hasParam("DefinedPlayer") && "You".equals(sa.getParam("Chooser"));
    }

    /**
     * Spec 0104 -- will [chooser] be asked for [sa]? Only when a hand of
     * another player it names holds a card Forge's own filter allows (as
     * ChangeZoneEffect filters it): with none there is nothing to choose, and
     * the hand Forge revealed stays the chooser's to see (Appetite for Brains
     * on a hand of cheap cards).
     */
    private static boolean handHasChoice(SpellAbility sa, Player chooser) {
        try {
            for (Player each : AbilityUtils.getDefinedPlayers(sa.getHostCard(), sa.getParam("DefinedPlayer"), sa)) {
                if (each == chooser) {
                    continue;
                }
                forge.game.card.CardCollectionView hand = each.getCardsIn(ZoneType.Hand);
                String type = sa.getParam("ChangeType");
                if (!(type == null ? hand : AbilityUtils.filterListByType(hand, type, sa)).isEmpty()) {
                    return true;
                }
            }
        } catch (RuntimeException e) {
            // Not resolvable now: treated as a choice (the reveal is the report's).
            return true;
        }
        return false;
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
            boolean anyOwner = kind == Kind.COUNTER || kind == Kind.RETURN || kind == Kind.BOUNCE
                    || kind == Kind.END_TURN || kind == Kind.HAND_EXILE;
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
                // Spec 0102, item 3: every spell exiled off the stack (Time Stop itself too).
                case END_TURN -> move.from() == ZoneType.Stack && move.to() == ZoneType.Exile;
                // Spec 0104: out of a hand (or, Covetous Urge, its graveyard) to where the effect put it.
                case HAND_EXILE -> (move.from() == ZoneType.Hand || move.from() == ZoneType.Graveyard)
                        && move.to() != move.from() && (host == null || move.cardId() != host.getId());
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
        // Spec 0088 (Q3 C) -- every report this reader has not closed, each
        // in their words: the newest in full, the older ones gathered with
        // it (oldest first), each with its own key, stamp and cards.
        List<JsonObject> open = new ArrayList<>();
        for (ReportBook.Entry<Player, Report> entry : book.openFor(reader)) {
            JsonObject one = render(entry.report(), entry.onlyFor() != null, reader, revealedTo, shown, seatOf);
            if (one != null) {
                open.add(one);
            }
        }
        if (open.isEmpty()) {
            return null;
        }
        // Spec 0088, Amendment 1 (owner) -- the newest and at most three older
        // ones as rows; the rest drop off.
        open = ReportBook.window(open);
        JsonObject newest = open.get(open.size() - 1);
        if (open.size() > 1) {
            JsonArray older = new JsonArray();
            open.subList(0, open.size() - 1).forEach(older::add);
            newest.add("gathered", older);
        }
        return newest;
    }

    /** One report as [reader] reads it, or null when it tells them nothing. */
    private JsonObject render(Report report, boolean personal, Player reader,
            java.util.function.Predicate<Integer> revealedTo,
            java.util.function.Function<Card, JsonObject> shown, java.util.function.ToIntFunction<Player> seatOf) {
        // Spec 0075 -- the other player's choices and flips this reader was told.
        List<Value> told = new ArrayList<>();
        for (Value value : report.values.getOrDefault(reader, List.of())) {
            if (showsValue(reader, value.who(), value.mark())) {
                told.add(value);
            }
        }
        boolean main = tells(report.kind, reader, report.actor, report.subject, report.chooser)
                || (report.emptyHand && reader == report.chooser);
        // Spec 0075 -- an empty look, made for this reader alone.
        if (personal) {
            main = true;
            told = List.of();
        }
        if (!main && told.isEmpty()) {
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
                boolean spell = n == 0 && (move.from() == ZoneType.Stack || report.unpaid != null);
                Card shownCard = card != null ? card : report.cards.get(move.cardId());
                String place = card == null ? null : whereIs(move.cardId());
                // Spec 0097, item 3 -- an unpaid trigger's card, face up where
                // the reader may see it (on the table, its owner's own).
                boolean visible = shownCard != null && (report.unpaid != null
                        ? !move.faceDown() && (move.owner() == reader || publicZone(place))
                        : spell ? !move.faceDown()
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
                    // Spec 0103, items 1-2 (owner option A, 2026-11-18): the card
                    // on the table this one is -- kept only while the reader's
                    // own board shows it (HiddenIds.keepTableLinks).
                    // Only a card the reader may identify (a face-down card stays a back).
                    if (entry.has("known") && entry.get("known").getAsBoolean()) {
                        entry.addProperty("table", "card:" + move.cardId());
                    }
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
            // Spec 0080: phased out on the battlefield, public (a face-down one stays a back).
            if (report.kind == Kind.PHASE && card != null && !move.faceDown()) {
                wasPublic = true;
            }
            // Spec 0097, item 4: the card that restarted the game was on the
            // table as it did -- shown as it was, never where it is now.
            // Spec 0100, item 8: the spell on the stack and its new target were
            // in view as it changed (a face-down one stays a back).
            if (report.kind == Kind.RETARGET && card != null && !move.faceDown()) {
                wasPublic = true;
            }
            // Spec 0102, items 2 and 3: the card that ended the turn, made a
            // skip, or made a player controlled was in view as it did (a
            // face-down one stays a back).
            if ((report.kind == Kind.END_TURN || report.kind == Kind.SKIP) && card != null && !move.faceDown()) {
                wasPublic = true;
            }
            // Spec 0107: the attacker and its blockers were on the table as
            // they fought (a face-down one stays a back).
            if (report.kind == Kind.TRAMPLE_KEPT) {
                if (card == null) {
                    card = report.cards.get(move.cardId());
                }
                wasPublic = card != null && !move.faceDown();
            }
            if (report.kind == Kind.RESTART || report.kind == Kind.CONTROL) {
                card = report.cards.get(move.cardId());
                wasPublic = card != null;
                to = null;
            }
            boolean visible = card != null
                    && (move.owner() == reader || publicZone(to) || wasPublic || revealedTo.test(move.cardId()));
            JsonObject entry;
            if (visible) {
                entry = shown.apply(card);
                named.add(card.getName());
                visibleIds.add(move.cardId());
                // Spec 0103, items 1-2 (owner option A, 2026-11-18): see above.
                // Only a card the reader may identify (a face-down card stays a back).
                if (entry.has("known") && entry.get("known").getAsBoolean()) {
                    entry.addProperty("table", "card:" + move.cardId());
                }
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
        // Spec 0086 (8) -- a completed dungeon's picture is its map.
        if (main && report.kind == Kind.DUNGEON) {
            JsonObject mark = new JsonObject();
            mark.addProperty("kind", "dungeon");
            mark.addProperty("dungeon", report.source);
            marks.add(mark);
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
        // Spec 0113 (W1-140..W1-157) -- counts as words, "an Island", "the other card", "putting".
        return switch (r.kind) {
            case SEARCH -> r.moves.isEmpty()
                    ? who + " searched " + its + " library and found nothing" + then + "."
                    : who + " searched " + its + " library, " + putting(went(r, w, visible), 0) + then + ".";
            case DIG -> topWords(who, "looked at", its, r.count,
                    r.moves.isEmpty() ? "" : putting(went(r, w, visible), r.count - r.moves.size()));
            case REVEAL_TOP -> topWords(who, "revealed", its, r.count,
                    r.moves.isEmpty() ? "" : putting(went(r, w, visible), r.count - r.moves.size()));
            case REORDER -> reorderWords(who, its, r.count, r.actor == w.reader, r.shuffled);
            case SCRY -> scryWords(who, r.count, r.top, r.bottom);
            case SURVEIL -> surveilWords(who, its, r.count, r.moves.isEmpty() ? null : cards,
                    r.count - r.moves.size());
            case PUT_BACK -> who + (r.drew > 0 ? " drew " + PlainWords.some(r.drew, "card") + ", then put " : " put ")
                    + cards + " from " + its + " hand on top of " + its + " library.";
            case LOOK_HAND -> who + " looked at " + its + " hand." + (r.emptyHand ? " It has no cards." : "");
            case CHOOSE_DISCARD -> r.emptyHand ? who + " looked at " + its + " hand. It has no cards."
                    : r.moves.isEmpty()
                    ? who + " looked at " + its + " hand and chose nothing."
                    : who + " looked at " + its + " hand and chose " + cards + " for "
                    + (r.subject == w.reader ? "you" : r.subject.getName()) + " to discard.";
            case DISCARD -> w.who(r.subject) + " discarded " + cards + ".";
            // Spec 0074, Amendment 1: one plain sentence; the cards are the pictures.
            case MILL -> w.who(r.subject) + " milled " + PlainWords.some(r.count, "card") + ".";
            case COUNTER -> counteredWords(who, its, named.stream().anyMatch(n -> n != null && !n.isBlank())
                    ? cards : null);
            case RETURN -> returned(r, w, visible);
            case BOUNCE -> bounced(r, w, visible);
            case CYCLE -> who + " cycled " + r.source + (r.drew > 0
                    ? " and drew " + PlainWords.some(r.drew, "card") : "") + ".";
            case CHOICE -> "";
            case FIZZLE -> r.unpaid != null
                    ? unpaidSentence(r.actor == w.reader ? null : r.actor.getName(), r.source, r.unpaid)
                    : fizzledWords(r, w);
            case PHASE -> phasedWords(r, w, named, hidden) + (r.lifeHeld
                    ? " " + lifeWords(r.subject == w.reader ? null : r.subject.getName()) : "");
            case EMPTY_LOOK -> who + " looked at " + its + " " + r.zone + ". It has no cards.";
            // Spec 0086 (10 B), the canvas's words.
            case EXTRA_TURN -> extraTurnWords(r.actor == w.reader ? null : r.actor.getName());
            case DUNGEON -> who + " completed " + r.source + ".";
            // Spec 0089 (Q3 A), the canvas's words.
            case EXTRA_COMBAT -> extraCombatWords(r.actor == w.reader ? null : r.actor.getName());
            // Spec 0097, item 4, the canvas's words.
            case RESTART -> restartWords(r.actor == w.reader ? null : r.actor.getName(), r.count);
            // Spec 0100, item 8, the spec's words.
            case RETARGET -> retargetWords(who, r.retargeted, targetWords(r.newTarget, w));
            case COUNTER_ABILITY -> abilityCounteredWords(who, r.retargeted, r.source);
            // Spec 0102, items 2 and 3, the spec's words.
            case CONTROL -> controlWords(r.actor == w.reader ? null : r.actor.getName());
            case END_TURN -> endTurnWords(who,
                    r.moves.stream().anyMatch(m -> m.from() == ZoneType.Stack && m.cardId() != r.hostId));
            case SKIP -> skipWords(r.actor.getName(), r.source, r.subject == w.reader ? null : r.subject.getName(),
                    r.skipped, r.count);
            // Spec 0104, the spec's words.
            case HAND_EXILE -> handExileWords(who, its, cards, r.moves.isEmpty() ? null : r.moves.get(0).to());
            // Spec 0107 (Q5c A), the spec's words.
            case TRAMPLE_KEPT -> trampleKeptWords(who, its, r);
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

    /**
     * Spec 0080 -- "Bob's permanents phased out until Bob's next turn." (to
     * Bob: "Your permanents ... your next turn."); someone else's doing:
     * "Alice phased out your Grizzly Bears until your next turn."
     */
    private static String phasedWords(Report r, Words w, List<String> named, int hidden) {
        String whose = r.subject == w.reader ? "your" : r.subject.getName() + "'s";
        String what = r.count < 0 ? "permanents" : cardWords(named, hidden);
        String until = " until " + whose + " next turn.";
        if (r.actor == r.subject) {
            return capital(whose) + " " + what + " phased out" + until;
        }
        return w.who(r.actor) + " phased out " + whose + " " + what + until;
    }

    /**
     * Spec 0097, item 3 -- "Bob's Lightning Rift did nothing: they couldn't
     * pay {1}." ([controller] null: "Your ... you couldn't pay {1}.").
     */
    static String unpaidSentence(String controller, String card, String cost) {
        return (controller == null ? "Your" : controller + "'s") + " " + card + " did nothing: "
                + (controller == null ? "you" : "they") + " couldn't pay " + cost + ".";
    }

    /** Spec 0097, item 4 -- "Bob restarted the game. This is game 2." ([player] null: the reader). */
    static String restartWords(String player, int number) {
        return (player == null ? "You" : player) + " restarted the game. This is game " + number + ".";
    }

    /** Spec 0086 (10 B) -- "Extra turn: this is Alice's turn again." ([player] null: the reader's own). */
    static String extraTurnWords(String player) {
        return "Extra turn: this is " + (player == null ? "your" : player + "'s") + " turn again.";
    }

    /** Spec 0089 (Q3 A) -- "Extra combat: Alice attacks again." ([player] null: the reader's own). */
    static String extraCombatWords(String player) {
        return "Extra combat: " + (player == null ? "you attack" : player + " attacks") + " again.";
    }

    /** Spec 0100, item 8 -- a new target in the reader's words: "you", "Bob", "Spellskite". */
    private static String targetWords(Object target, Words w) {
        if (target instanceof Player p) {
            return p == w.reader ? "you" : p.getName();
        }
        if (target instanceof Card c) {
            return c.isFaceDown() ? "a face-down card" : c.getName();
        }
        if (target instanceof SpellAbility sa && sa.getHostCard() != null) {
            return sa.getHostCard().getName();
        }
        return "a new target";
    }

    /**
     * Spec 0104 -- "Alice exiled your Hill Giant." ([who] the chooser as the
     * reader names them, [whose] the hand's owner: "your"); a card put
     * anywhere else than exile: "Alice put your Hill Giant into your graveyard."
     */
    static String handExileWords(String who, String whose, String cards, ZoneType to) {
        if (to == null || to == ZoneType.Exile) {
            return who + " exiled " + whose + " " + cards + ".";
        }
        return switch (to) {
            case Battlefield -> who + " put " + whose + " " + cards + " onto the battlefield.";
            case Graveyard -> who + " put " + whose + " " + cards + " into " + whose + " graveyard.";
            default -> who + " took " + whose + " " + cards + ".";
        };
    }

    /** Spec 0107 -- the kept split's sentence, each blocker by the name the reader knows it by. */
    private static String trampleKeptWords(String who, String whose, Report r) {
        List<String> names = new ArrayList<>();
        List<Integer> amounts = new ArrayList<>();
        for (int[] one : r.split) {
            Card card = r.cards.get(one[0]);
            names.add(card == null ? "creature" : card.isFaceDown() ? "face-down creature" : card.getName());
            amounts.add(one[1]);
        }
        return PlainWords.trampleKept(who, whose, names, amounts, r.over, r.damage);
    }

    /** Spec 0080 -- "Bob's life can't change." ("Your ..." to that player). */
    static String lifeWords(String player) {
        return (player == null ? "Your" : player + "'s") + " life can't change.";
    }

    private static String capital(String words) {
        return words.isEmpty() ? words : Character.toUpperCase(words.charAt(0)) + words.substring(1);
    }

    /** The fizzle sentence: [caster] null for the reader's own spell. */
    static String fizzleSentence(String caster, String spell, boolean copy, boolean gone, boolean many) {
        String whose = caster == null ? "Your" : caster + "'s";
        return whose + " " + (copy ? "copy of " : "") + spell + " did nothing: " + fizzleWhy(gone, many) + ".";
    }

    /** Spec 0113 (W1-172) -- the reason half of a fizzle, shared with the play log's line. */
    static String fizzleWhy(boolean gone, boolean many) {
        return gone
                ? (many ? "its targets were gone" : "its target was gone")
                : (many ? "its targets could no longer be chosen" : "its target could no longer be chosen");
    }

    /**
     * Spec 0074, Amendment 1 -- whether [reader] is shown the report. Spec
     * 0097, item 7 (owner, the 0086 A4 / 0089 A1 rule): a mill, a counter, a
     * return or a phasing is told to everyone but the player who did it (it
     * was told to both when the subject was the other player); the others as
     * before (Amendment 13, item 7: not to the one who chose).
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
            // Spec 0086 (10 B), Amendment 4 (owner 2026-11-15): all but whoever played the card.
            case EXTRA_TURN -> reader != chooser;
            // Spec 0086 (8): a completed dungeon is told to the other player.
            case DUNGEON -> reader != actor;
            // Spec 0089 (Q3 A), Amendment 1 (owner 2026-11-15): all but whoever played the card.
            case EXTRA_COMBAT -> reader != chooser;
            // Spec 0097, item 4 (owner): a restart is told to the other player only.
            case RESTART -> reader != actor;
            // Spec 0100, item 8 (owner): the changed spell's controller, never the one who changed it.
            case RETARGET -> reader == subject && reader != actor;
            // Spec 0101, item 2 (owner, missed Q5 A): the countered ability's controller only.
            case COUNTER_ABILITY -> reader == subject && reader != actor;
            // Spec 0102, item 2 (owner, missed Q7 A): the controlled player only.
            case CONTROL -> reader == subject && reader != actor;
            // Spec 0102, item 3 (owner, missed Q8 A): every player but the one who did it.
            case END_TURN, SKIP -> reader != actor;
            // Spec 0104 (owner 2026-11-19): the hand's owner only, never the one who chose.
            case HAND_EXILE -> reader == subject && reader != actor;
            // Spec 0107 (owner Q5c A): the defending player only, never the one who chose.
            case TRAMPLE_KEPT -> reader == subject && reader != actor;
            // Spec 0097, item 7 (owner): never a window for the one who did it.
            case MILL, COUNTER, RETURN, PHASE -> reader != actor;
            default -> reader != chooser;
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

    /** Spec 0074, Amendment 1 -- "Bob returned Grizzly Bears to their hand", "You exiled ten cards from Bob's graveyard". */
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
            // Spec 0113 (W1-150) -- out of exile it is only "exiled" again, never "from exile".
            return exiledWords(who, cardWords(named, hidden),
                    r.moves.get(0).from() == ZoneType.Exile ? null : w.whose(r.subject) + " graveyard");
        }
        List<Went> went = new ArrayList<>();
        for (Move move : r.moves) {
            String to = r.where.get(move.cardId());
            String place = to == null ? null : switch (to) {
                case "hand" -> "to " + w.whose(move.owner()) + " hand";
                case "battlefield" -> "to the battlefield";
                case "graveyard" -> "to " + w.whose(move.owner()) + " graveyard";
                case "exile" -> EXILED;
                case "top" -> "on top of " + w.whose(move.owner()) + " library";
                case "bottom" -> "on the bottom of " + w.whose(move.owner()) + " library";
                default -> "into " + w.whose(move.owner()) + " library";
            };
            Card card = r.cards.get(move.cardId());
            went.add(new Went(visible.contains(move.cardId()) && card != null ? card.getName() : null, place, false));
        }
        return returnedWords(who, went);
    }

    /** Spec 0113 (W1-150) -- "You exiled ten cards from Bob's graveyard." ([from] null: out of exile). */
    static String exiledWords(String who, String cards, String from) {
        return who + " exiled " + cards + (from == null ? "" : " from " + from) + ".";
    }

    /** The place a card "went" that is an exile: said as the verb "exiled", with no place after it. */
    static final String EXILED = "\u0000exiled";

    /**
     * Spec 0113 (W1-151) -- "Bob returned Grizzly Bears to their hand and
     * exiled Lightning Bolt." A place unknown is no place ("returned
     * Grizzly Bears."), never "somewhere"; into exile is "exiled".
     */
    static String returnedWords(String who, List<Went> went) {
        List<Went> back = new ArrayList<>();
        List<Went> exiled = new ArrayList<>();
        for (Went one : went) {
            (EXILED.equals(one.place()) ? exiled : back).add(one);
        }
        List<String> verbs = new ArrayList<>();
        if (!back.isEmpty()) {
            verbs.add("returned " + objects(back, false));
        }
        if (!exiled.isEmpty()) {
            List<Went> bare = exiled.stream().map(one -> new Went(one.name(), null, false)).toList();
            verbs.add("exiled " + objects(bare, false));
        }
        return who + " " + PlainWords.and(verbs) + ".";
    }

    /** "Grizzly Bears to their hand and a card to your hand": the cards by place, hidden ones after the named. */
    private static String objects(List<Went> went, boolean otherBefore) {
        Map<String, List<String>> by = new LinkedHashMap<>();
        Map<String, Integer> backs = new LinkedHashMap<>();
        for (Went one : went) {
            String place = one.place() == null ? "" : one.place();
            if (one.name() != null && !one.name().isBlank()) {
                by.computeIfAbsent(place, k -> new ArrayList<>()).add(one.name());
            } else {
                backs.merge(place, 1, Integer::sum);
            }
        }
        boolean other = otherBefore || !by.isEmpty();
        List<String> parts = new ArrayList<>();
        by.forEach((place, names) -> parts.add(PlainWords.and(grouped(names)) + (place.isEmpty() ? "" : " " + place)));
        backs.forEach((place, n) -> parts.add(hiddenWords(n, other, false) + (place.isEmpty() ? "" : " " + place)));
        return PlainWords.and(parts);
    }

    /**
     * Spec 0075 -- "Bob returned your Grizzly Bears to your hand.", "Bob put
     * your Serra Angel on top of your library.", "Bob shuffled your Serra
     * Angel into your library." Spec 0113 (W1-152): a place unknown is "Bob
     * moved your Grizzly Bears.", never "somewhere"; counts as words.
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
                default -> new String[] {"moved", ""};
            };
            String key = verb[0] + "\u0000" + whose + "\u0000" + verb[1];
            Card card = r.cards.get(move.cardId());
            if (visible.contains(move.cardId()) && card != null && !card.getName().isBlank()) {
                by.computeIfAbsent(key, k -> new ArrayList<>()).add(card.getName());
            } else {
                backs.merge(key, 1, Integer::sum);
            }
        }
        List<String[]> parts = new ArrayList<>();
        java.util.Set<String> keys = new java.util.LinkedHashSet<>(by.keySet());
        keys.addAll(backs.keySet());
        for (String key : keys) {
            String[] bits = key.split("\u0000", -1);
            List<String> names = by.getOrDefault(key, List.of());
            parts.add(new String[] {bits[0], bits[1], bits[2], String.join("\u0000", names),
                String.valueOf(backs.getOrDefault(key, 0))});
        }
        return bouncedWords(w.who(r.actor), parts);
    }

    /**
     * Spec 0113 (W1-152) -- the bounce sentence from its parts, each {verb,
     * whose, place, names joined by NUL, hidden count}: "Bob returned your
     * Grizzly Bears to your hand.", "Bob put two cards on top of your library."
     */
    static String bouncedWords(String who, List<String[]> parts) {
        List<String> said = new ArrayList<>();
        for (String[] bits : parts) {
            List<String> names = bits[3].isEmpty() ? List.of() : List.of(bits[3].split("\u0000"));
            List<String> what = new ArrayList<>(grouped(names));
            int n = Integer.parseInt(bits[4]);
            if (n > 0) {
                what.add(hiddenWords(n, !names.isEmpty(), false));
            }
            String whose = n == 0 ? bits[1] + " " : "";
            said.add(bits[0] + " " + whose + PlainWords.and(what) + (bits[2].isEmpty() ? "" : " " + bits[2]));
        }
        return who + " " + PlainWords.and(said) + ".";
    }

    /**
     * One card's move, for the words: [name] null when this reader may not
     * know it; [place] where it went ("into their hand"); [faceDownExile] a
     * card exiled face down (Hideaway), said with no name.
     */
    record Went(String name, String place, boolean faceDownExile) {}

    /** The moves of a search or a look at the top, in this reader's words. */
    private static List<Went> went(Report r, Words w, java.util.Set<Integer> visible) {
        List<Went> out = new ArrayList<>();
        for (Move move : r.moves) {
            String to = r.where.get(move.cardId());
            Card card = r.cards.get(move.cardId());
            String name = visible.contains(move.cardId()) && card != null && !card.getName().isBlank()
                    ? card.getName() : null;
            boolean faceDown = "exile".equals(to) && move.faceDown() && name == null;
            out.add(new Went(name, placeWords(to, w.whose(move.owner())), faceDown));
        }
        return out;
    }

    /**
     * Spec 0113 (W1-140, W1-141, W1-142, W1-337) -- "putting an Island into
     * their graveyard and the other card into their hand", "putting Goblin
     * Matron into their hand and the other three on the bottom", "exiling one
     * face down and putting the other three cards on the bottom of their
     * library". [rest] the cards left on the bottom without a move of their own.
     */
    static String putting(List<Went> went, int rest) {
        Map<String, List<String>> by = new LinkedHashMap<>();
        Map<String, Integer> backs = new LinkedHashMap<>();
        int faceDown = 0;
        for (Went one : went) {
            if (one.faceDownExile()) {
                faceDown++;
            } else if (one.name() == null || one.name().isBlank()) {
                backs.merge(one.place(), 1, Integer::sum);
            } else {
                by.computeIfAbsent(one.place(), k -> new ArrayList<>()).add(one.name());
            }
        }
        List<String> doing = new ArrayList<>();
        if (faceDown > 0) {
            doing.add("exiling " + PlainWords.number(faceDown) + " face down");
        }
        boolean other = faceDown > 0 || !by.isEmpty();
        List<String> put = new ArrayList<>();
        by.forEach((place, names) -> put.add(PlainWords.and(grouped(names)) + " " + place));
        backs.forEach((place, n) -> put.add(hiddenWords(n, other, true) + " " + place));
        if (rest > 0) {
            put.add((!backs.isEmpty() ? "the rest" : rest == 1 ? "the other card" : "the other " + PlainWords.number(rest))
                    + " on the bottom");
        }
        if (!put.isEmpty()) {
            doing.add("putting " + PlainWords.and(put));
        }
        return PlainWords.and(doing);
    }

    /**
     * Spec 0113 (W1-141, W1-142) -- "RudeLeft looked at the top two cards of
     * their library, putting ..." / "Bob revealed the top card of their
     * library." ([putting] "" when nothing moved).
     */
    static String topWords(String who, String verb, String its, int count, String putting) {
        return who + " " + verb + " " + topCards(count) + " of " + its + " library"
                + (putting == null || putting.isEmpty() ? "" : ", " + putting) + ".";
    }

    /** "the top card", "the top two cards". */
    static String topCards(int count) {
        return count == 1 ? "the top card" : "the top " + PlainWords.count(count, "card");
    }

    /**
     * Spec 0113 (W1-143) -- "Bob looked at the top three cards of their
     * library and put them back in the order they chose." / "... the top
     * card of their library and put it back."
     */
    static String reorderWords(String who, String its, int count, boolean you, boolean shuffled) {
        return who + " looked at " + topCards(count) + " of " + its + " library and put "
                + (count == 1 ? "it back" : "them back in the order " + (you ? "you" : "they") + " chose")
                + (shuffled ? ", then shuffled" : "") + ".";
    }

    /** "it", "both", "them all": the cards of a scry or a surveil kept together. */
    private static String allOf(int count) {
        return count == 1 ? "it" : count == 2 ? "both" : "them all";
    }

    /**
     * Spec 0113 (W1-144, W1-145) -- "Bob scried 2 and kept both on top.",
     * "Bob scried 3, keeping one on top and putting two on the bottom."
     * ("Scry 2" keeps its digit: a printed game term.)
     */
    static String scryWords(String who, int count, int top, int bottom) {
        if (bottom == 0) {
            return who + " scried " + count + " and kept " + allOf(count) + " on top.";
        }
        if (top == 0) {
            return who + " scried " + count + " and put " + allOf(count) + " on the bottom.";
        }
        return who + " scried " + count + ", keeping " + PlainWords.number(top) + " on top and putting "
                + PlainWords.number(bottom) + " on the bottom.";
    }

    /**
     * Spec 0113 (W1-146) -- "Bob surveilled 2, putting an Island into their
     * graveyard and keeping the other card on top." ([cards] null: none went
     * to the graveyard; [kept] the cards left on top.)
     */
    static String surveilWords(String who, String its, int count, String cards, int kept) {
        if (cards == null) {
            return who + " surveilled " + count + " and kept " + allOf(count) + " on top.";
        }
        if (kept <= 0) {
            return who + " surveilled " + count + " and put " + cards + " into " + its + " graveyard.";
        }
        return who + " surveilled " + count + ", putting " + cards + " into " + its + " graveyard and keeping "
                + hiddenWords(kept, true, true) + " on top.";
    }

    /**
     * Spec 0113 (W1-149) -- "Alice countered your Grizzly Bears."; a spell the
     * reader never saw ([cards] null): "Alice countered a spell of yours."
     */
    static String counteredWords(String who, String its, String cards) {
        if (cards == null) {
            String whose = switch (its) {
                case "your" -> "yours";
                case "their" -> "theirs";
                default -> its;
            };
            return who + " countered a spell of " + whose + ".";
        }
        return who + " countered " + its + " " + cards + ".";
    }

    /** Spec 0113 (W1-155) -- a zone in our own words ("hand", "command zone"), never Forge's translated name. */
    static String zoneWords(ZoneType zone) {
        return switch (zone) {
            case Hand -> "hand";
            case Library -> "library";
            case Graveyard -> "graveyard";
            case Exile -> "exile";
            case Battlefield -> "battlefield";
            case Command -> "command zone";
            case Sideboard -> "sideboard";
            case Stack -> "stack";
            default -> zone.name().replaceAll("([a-z])([A-Z])", "$1 $2").toLowerCase(java.util.Locale.ROOT);
        };
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

    /**
     * Spec 0113 (W1-157) -- "Goblin Matron", "an Island", "three Goblin
     * Pikers", "two copies of Light Up the Stage", in the order first met
     * (never the times sign inside a sentence).
     */
    static List<String> grouped(List<String> names) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        names.forEach(name -> counts.merge(name, 1, Integer::sum));
        List<String> out = new ArrayList<>();
        counts.forEach((name, n) -> out.add(named(name, n)));
        return out;
    }

    /** The basic lands' names: said with "a" / "an" ("an Island"), as a kind of card, not one card's name. */
    private static final java.util.Set<String> BASICS = java.util.Set.of("Plains", "Island", "Swamp", "Mountain",
            "Forest", "Wastes", "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp",
            "Snow-Covered Mountain", "Snow-Covered Forest", "Snow-Covered Wastes");

    /** A basic land's name, said with "a" / "an" as a kind of card ("an Island"). */
    static boolean isBasic(String name) {
        return BASICS.contains(name);
    }

    /** Spec 0113 (W1-141, W1-157) -- [n] cards of one name: "an Island", "Goblin Matron", "three Goblin Pikers". */
    static String named(String name, int n) {
        if (n == 1) {
            return BASICS.contains(name) ? PlainWords.withArticle(name) : name;
        }
        return PlainWords.number(n) + " " + pluralName(name);
    }

    /** A plain name of capitalised words ("Goblin Piker", "Snow-Covered Island"): its last word can take an "s". */
    private static final java.util.regex.Pattern PLAIN_NAME =
            java.util.regex.Pattern.compile("[A-Z][A-Za-z'-]*(?: [A-Z][A-Za-z'-]*){0,3}");

    /** "Goblin Pikers", "Grizzly Bears" (as it is), "Elves"; a name that would read wrong: "copies of Fact or Fiction". */
    static String pluralName(String name) {
        if (name.endsWith("s")) {
            return name;
        }
        if (PLAIN_NAME.matcher(name).matches() && !name.contains("'")) {
            return PlainWords.plural(name);
        }
        return "copies of " + name;
    }

    /**
     * Spec 0113 (W1-141, W1-157, W1-164) -- cards the reader may not see: "a
     * card", "two cards"; beside named ones ([other]) "the other card", "the
     * other two cards" ([the]), else "another card", "two other cards".
     */
    static String hiddenWords(int hidden, boolean other, boolean the) {
        if (!other) {
            return PlainWords.some(hidden, "card");
        }
        if (the) {
            return hidden == 1 ? "the other card" : "the other " + PlainWords.count(hidden, "card");
        }
        return hidden == 1 ? "another card" : PlainWords.number(hidden) + " other cards";
    }

    /** "Island, Forest and two other cards", "a card", "nothing": a blank name is a hidden card. */
    static String cardWords(List<String> named, int hidden) {
        List<String> names = new ArrayList<>();
        for (String name : named) {
            if (name == null || name.isBlank()) {
                hidden++;
            } else {
                names.add(name);
            }
        }
        List<String> parts = grouped(names);
        if (hidden > 0) {
            parts.add(hiddenWords(hidden, !names.isEmpty(), false));
        }
        return parts.isEmpty() ? "nothing" : PlainWords.and(parts);
    }
}
