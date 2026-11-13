package net.barnflix.proxic.worker.game;

import forge.game.Game;
import forge.game.ability.AbilityUtils;
import forge.game.card.Card;
import forge.game.card.CardCloneStates;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityStackInstance;
import forge.game.zone.ZoneType;

import java.util.Map;

/**
 * Spec 0079, item 1 -- what a copy copied, as Forge keeps it.
 *
 * Three kinds of copy, each read from Forge's own record:
 * <ul>
 *   <li>a permanent that entered as a copy (Clone): its last copy state's
 *       origin ({@link CardCloneStates#getOrigin}, set by CloneEffect);</li>
 *   <li>a token that is a copy (Cackling Counterpart): Forge links the token
 *       only to a prototype it made for the purpose (TokenEffectBase sets
 *       {@code setCopiedPermanent(prototype)}), so the original is the target
 *       of the ability that made it, read as the token enters -- while that
 *       ability is still resolving with its targets ({@code resetOnceResolved}
 *       clears them after);</li>
 *   <li>a copied spell (Fork, storm): a new card on the stack whose
 *       {@code getCopiedPermanent()} is the spell it copies
 *       (CardFactory.copySpellHost).</li>
 * </ul>
 *
 * Whether a permanent is a copy is public: its copiable values are on the
 * table. Which card it copied travels as that card's id, and only while the
 * reader may see that card -- a card in a hidden zone has its id stripped
 * from every snapshot (HiddenIds), which covers this field too.
 */
final class Copies {

    /** Each game's record (one Forge game per worker; a restart keeps the Game). */
    private static final Map<Game, Copies> BY_GAME =
            java.util.Collections.synchronizedMap(new java.util.WeakHashMap<>());

    /** Token id -> the id of the card it is a copy of, recorded as it entered. */
    private final Map<Integer, Integer> tokens = new java.util.concurrent.ConcurrentHashMap<>();

    private Copies() {
    }

    /** The record for [game], made on first use. */
    static Copies of(Game game) {
        synchronized (BY_GAME) {
            return BY_GAME.computeIfAbsent(game, g -> new Copies());
        }
    }

    /** Forge's events, as it fires them: a token copy entering is recorded then. */
    static final class Listener {
        private final Game game;

        Listener(Game game) {
            this.game = game;
        }

        @com.google.common.eventbus.Subscribe
        public void on(forge.game.event.GameEvent event) {
            if (event instanceof forge.game.event.GameEventCardChangeZone moved && moved.card() != null
                    && moved.to() != null && moved.to().zoneType() == ZoneType.Battlefield
                    && (moved.from() == null || moved.from().zoneType() == ZoneType.None)) {
                Card card = game.findById(moved.card().getId());
                if (card != null && card.isToken() && card.getCopiedPermanent() != null) {
                    Card original = tokenOriginal(card);
                    if (original != null) {
                        of(game).tokens.put(card.getId(), original.getId());
                    }
                }
            } else if (event instanceof forge.game.event.GameEventGameRestarted) {
                of(game).tokens.clear();
            }
        }
    }

    /**
     * The card a token copy was made from: a card the making ability targets
     * (or defines) whose printed card is the one the token copies. Null when
     * none fits (the copy is still marked a copy; it just names nothing).
     */
    private static Card tokenOriginal(Card token) {
        SpellAbility made = token.getTokenSpawningAbility();
        Card prototype = token.getCopiedPermanent();
        String printed = prototype == null || prototype.getPaperCard() == null ? null
                : prototype.getPaperCard().getName();
        if (made == null || printed == null) {
            return null;
        }
        for (SpellAbility part = made.getRootAbility(); part != null; part = part.getSubAbility()) {
            java.util.List<Card> candidates = new java.util.ArrayList<>();
            if (part.getTargets() != null) {
                candidates.addAll(part.getTargets().getTargetCards());
            }
            if (candidates.isEmpty() && part.hasParam("Defined")) {
                try {
                    candidates.addAll(AbilityUtils.getDefinedCards(part.getHostCard(), part.getParam("Defined"), part));
                } catch (RuntimeException e) {
                    // A definition that cannot be read now: nothing named.
                }
            }
            for (Card each : candidates) {
                if (each != null && each.getId() != token.getId() && each.getPaperCard() != null
                        && printed.equals(each.getPaperCard().getName())) {
                    return each;
                }
            }
        }
        return null;
    }

    /** Is [card] a copy: a permanent entered as one, a token copy, or a copied spell. */
    static boolean isCopy(Card card) {
        if (card == null) {
            return false;
        }
        if (card.isCopiedSpell()) {
            return true;
        }
        if (card.isToken() && card.getCopiedPermanent() != null) {
            return true;
        }
        return cloneOrigin(card) != null;
    }

    /** A permanent copying another (Clone): the origin of its newest copy state, never itself. */
    private static Card cloneOrigin(Card card) {
        if (!card.isCloned()) {
            return null;
        }
        Map<Long, CardCloneStates> states = card.getCloneStates();
        if (!(states instanceof java.util.NavigableMap<Long, CardCloneStates> ordered) || ordered.isEmpty()) {
            return null;
        }
        CardCloneStates last = ordered.lastEntry().getValue();
        Card origin = last == null ? null : last.getOrigin();
        return origin == null || origin.getId() == card.getId() ? null : origin;
    }

    /** The card [card] is a copy of, as the game now has it (by id), or null. */
    Card originalOf(Game game, Card card) {
        if (card == null) {
            return null;
        }
        Card origin = null;
        if (card.isCopiedSpell()) {
            origin = card.getCopiedPermanent();
        } else if (card.isToken()) {
            Integer id = tokens.get(card.getId());
            origin = id == null ? null : game.findById(id);
        } else {
            origin = cloneOrigin(card);
        }
        if (origin == null) {
            return null;
        }
        Card now = game.findById(origin.getId());
        return now != null ? now : origin;
    }

    /**
     * The stack entry a copied spell copies: the one whose card is the spell
     * the copy was made from (Fork's target, Grapeshot itself for its storm
     * copies), while it is still on the stack; null otherwise.
     */
    static SpellAbilityStackInstance copiedEntry(Game game, Card copy) {
        if (copy == null || !copy.isCopiedSpell() || copy.getCopiedPermanent() == null) {
            return null;
        }
        int original = copy.getCopiedPermanent().getId();
        for (SpellAbilityStackInstance each : game.getStack()) {
            Card source = each.getSourceCard();
            if (source != null && source.getId() == original && each.isSpell() && source.getId() != copy.getId()) {
                return each;
            }
        }
        return null;
    }

    /**
     * The spell or ability Forge says just resolved (GameEventSpellResolved
     * fires before Forge takes it off the stack). Found by its id among the
     * stack's entries -- NOT the top of the stack: a storm trigger that just
     * made its copies has them on top of it.
     */
    static SpellAbility resolved(Game game, forge.game.event.GameEventSpellResolved event) {
        if (event == null || event.spell() == null) {
            return null;
        }
        int id = event.spell().getId();
        for (SpellAbilityStackInstance each : game.getStack()) {
            SpellAbility sa = each.getSpellAbility();
            if (sa != null && sa.getId() == id) {
                return sa;
            }
        }
        return null;
    }

    /**
     * Whose deck has the picture of what [card] copied: the owner of the
     * card it copies (a Clone of Bob's Serra Angel looks like Bob's Angel),
     * or null when that is [card]'s own owner or nothing is known.
     */
    forge.game.player.Player artOwner(Game game, Card card) {
        Card original = originalOf(game, card);
        if (original == null || original.getOwner() == null || original.getOwner() == card.getOwner()) {
            return null;
        }
        return original.getOwner();
    }

}
