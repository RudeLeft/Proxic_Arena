package net.barnflix.proxic.worker.game;

import forge.card.ColorSet;
import forge.card.MagicColor;
import forge.card.mana.ManaAtom;
import forge.game.card.Card;
import forge.game.mana.ManaCostBeingPaid;
import forge.game.player.Player;
import forge.game.player.PlayerController;
import forge.game.player.PlaySpellAbility;
import forge.game.spellability.AbilityManaPart;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;

/**
 * Paying for something, one permanent at a time — PHASE_06 §6.91,
 * §6.105, §6.189.
 *
 * THE PLAYER TAPS THE LANDS. Forge's own human input works this
 * way and its automatic payment is a button the player presses,
 * implemented by temporarily swapping in the AI controller. Proxic
 * has no such button and no AI: the rules enforce what is legal,
 * and the player decides everything the rules leave open.
 *
 * That is not merely cautious. Which land you tap routinely
 * changes the game — a pain land costs life, a creature-land
 * spends the ability you wanted, a dual decides a colour you may
 * need later. Choosing for the player is a silent wrong move, and
 * silent wrong moves are the defect class this project treats as
 * worse than a loud failure.
 *
 * WHAT IS NOT ASKED is equally deliberate. Forge decides which
 * abilities could pay (`isManaAbilityFor`), and when a card's
 * abilities are interchangeable it says so — its "express mana"
 * rule stops guessing when the amounts differ, when an ability is
 * not undoable or renewable, when it has a sub-ability, when the
 * spell tracks mana spent, or when the card declares
 * ManaNeededToAvoidNegativeEffect. Every one of those tests is
 * Forge's. Proxic asks which PERMANENT, and lets Forge settle what
 * happens inside it.
 */
final class ManaPayment {

    /**
     * §6.189 — the loop guard, and it is not decoration.
     *
     * Forge's 999-iteration safety valve is AI-only, so a
     * human-shaped controller that fails to make progress is
     * re-offered the same thing for ever: full CPU, no exception,
     * no log line. Phase 0A measured 679,963 identical attempts
     * from exactly this shape of bug. If the remaining cost has
     * not changed after this many answered choices, something is
     * wrong with the payment and the match must say so rather
     * than spin.
     */
    private static final int MAX_STALLED_ROUNDS = 8;

    private final GameHost host;
    private final PlayerController controller;
    private final Player player;
    private final int actedForSeat;
    private final int authorisedSeat;

    ManaPayment(
            GameHost host,
            PlayerController controller,
            Player player,
            int actedForSeat,
            int authorisedSeat) {
        this.host = host;
        this.controller = controller;
        this.player = player;
        this.actedForSeat = actedForSeat;
        this.authorisedSeat = authorisedSeat;
    }

    /**
     * Ask for permanents until the cost is paid, or the player stops.
     *
     * Returning false CANCELS the whole spell, which is a legal
     * answer — a player who starts casting something and changes
     * their mind has not done anything wrong. Forge unwinds it.
     */
    boolean pay(ManaCostBeingPaid toPay, SpellAbility paidFor) throws InterruptedException {
        return pay(toPay, paidFor, false);
    }

    /** The life id: "pay 2 life" for one Phyrexian symbol. */
    private static final String PHYREXIAN = "mana:life:phyrexian";

    /** Floating mana of one kind: "mana:pool:C". */
    private static final String POOL = "mana:pool:";

    /** The pool's kinds of mana, as ManaAtom codes, and the letters players read. */
    private static final byte[] POOL_KINDS = ManaAtom.MANATYPES;
    private static final String POOL_LETTERS = "WUBRGC";

    boolean pay(ManaCostBeingPaid toPay, SpellAbility paidFor, boolean effect) throws InterruptedException {
        String lastRemaining = toPay.toString();
        int stalled = 0;
        // P6-AN, Dismember: a Phyrexian symbol may be paid with 2 life
        // instead of its colour -- a port of Forge's own human input,
        // where clicking your life total does it. The life is LOST only
        // when the whole cost is paid (Forge's done()), so cancelling
        // halfway costs nothing.
        int lifeToLose = 0;

        while (!toPay.isPaid()) {
            LinkedHashMap<String, Card> sources = usableSources(toPay, paidFor);
            LinkedHashMap<String, Byte> floating = usableFloating(toPay, paidFor);
            boolean lifeForMana = toPay.containsPhyrexianMana()
                    && player.canPayLife(lifeToLose + 2, effect, paidFor);
            if (sources.isEmpty() && floating.isEmpty() && !lifeForMana) {
                // Nothing left that could pay. Not an error: it is
                // how "you cannot afford this" ends.
                return false;
            }

            LinkedHashMap<String, String> labels = new LinkedHashMap<>();
            // Floating mana first: it is already made, and it empties at the
            // end of the step whether it is spent or not.
            floating.forEach((id, kind) -> labels.put(id, "Use floating {" + id.substring(POOL.length())
                    + "} — you have " + player.getManaPool().getAmountOfColor(kind) + " — " + remaining(toPay)));
            sources.forEach((id, card) -> labels.put(id, card.getName() + " — " + remaining(toPay)));
            if (lifeForMana) {
                labels.put(PHYREXIAN, "Pay 2 life for a Phyrexian symbol — you have "
                        + (player.getLife() - lifeToLose) + " life — " + remaining(toPay));
            }

            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            "applyManaToCost",
                            new ArrayList<>(labels.keySet()),
                            pending -> host.publishDecision(pending, labels));

            if (DecisionGate.PASS.equals(choice)) {
                return false;
            }
            if (floating.containsKey(choice)) {
                // Forge's own "click the mana pool" (InputPayMana.useManaFromPool).
                player.getManaPool().tryPayCostWithColor(
                        floating.get(choice), paidFor, toPay, paidFor.getPayingMana());
                String nowRemaining = toPay.toString();
                stalled = nowRemaining.equals(lastRemaining) ? stalled + 1 : 0;
                lastRemaining = nowRemaining;
                continue;
            }
            if (PHYREXIAN.equals(choice)) {
                if (toPay.payPhyrexian()) {
                    paidFor.setSpendPhyrexianMana(true);
                    lifeToLose += 2;
                    lastRemaining = toPay.toString();
                    stalled = 0;
                }
                continue;
            }
            Card tapped = sources.get(choice);
            if (tapped == null) {
                return false;
            }
            if (!activate(tapped, toPay, paidFor)) {
                // The player declined which ability, or Forge would
                // not activate the one chosen. Their choice, and it
                // waited for them: NOT a stall. Counting it as one
                // ended a match after a player said "never mind" to
                // Aether Hub's ability choice eight times -- the guard
                // treating a person as a runaway loop.
                continue;
            }

            // §6.189 — an ability really activated: did it change anything?
            String nowRemaining = toPay.toString();
            stalled = nowRemaining.equals(lastRemaining) ? stalled + 1 : 0;
            lastRemaining = nowRemaining;
            if (stalled >= MAX_STALLED_ROUNDS) {
                host.failRunaway(
                        "mana payment made no progress in " + MAX_STALLED_ROUNDS
                                + " choices; still owing " + nowRemaining);
                throw new IllegalStateException("mana payment is not progressing");
            }
        }
        if (lifeToLose > 0) {
            player.payLife(lifeToLose, paidFor, effect);
        }
        return true;
    }

    /**
     * Every permanent that could pay some part of what is left.
     *
     * FORGE decides "could pay": `isManaAbilityFor` against the
     * colours the remaining cost can accept. Nothing here reasons
     * about lands, colours or types, which is §6.50 — an adapter
     * that worked out for itself what a permanent can produce
     * would be a second rules engine, and would be wrong first on
     * exactly the cards people build decks around.
     */
    private LinkedHashMap<String, Card> usableSources(
            ManaCostBeingPaid toPay, SpellAbility paidFor) {
        byte canUse = acceptableColors(toPay);
        LinkedHashMap<String, Card> sources = new LinkedHashMap<>();
        if (canUse == 0) {
            return sources;
        }
        for (Card card : player.getCardsIn(ZoneType.Battlefield)) {
            for (SpellAbility ability : manaAbilitiesOf(card)) {
                if (ability.isManaAbilityFor(paidFor, canUse)) {
                    // §6.46 — typed, because a card id and a
                    // player id share a number space.
                    sources.put("mana:card:" + card.getId(), card);
                    break;
                }
            }
        }
        return sources;
    }

    /**
     * Floating mana that could pay some part of what is left, by kind.
     *
     * Mana already in the pool -- Sol Ring's second {C} after a {1} spell,
     * a Dark Ritual's -- was never offered: a spell Forge called affordable
     * then cancelled itself once every permanent was tapped (2026-10-22).
     * Forge's own human input spends it when the player clicks the pool;
     * this is that click, offered. Forge decides whether the mana may pay
     * (restrictions, `isAnyPartPayableWith`), as for permanents.
     */
    private LinkedHashMap<String, Byte> usableFloating(ManaCostBeingPaid toPay, SpellAbility paidFor) {
        LinkedHashMap<String, Byte> out = new LinkedHashMap<>();
        forge.game.mana.ManaPool pool = player.getManaPool();
        for (int i = 0; i < POOL_KINDS.length; i++) {
            byte kind = POOL_KINDS[i];
            if (pool.getAmountOfColor(kind) > 0 && toPay.isAnyPartPayableWith(kind, pool)) {
                out.put(POOL + POOL_LETTERS.charAt(i), kind);
            }
        }
        return out;
    }

    /** What the remaining cost will accept, including the pool. */
    private byte acceptableColors(ManaCostBeingPaid toPay) {
        byte canUse = 0;
        for (byte color : ManaAtom.MANATYPES) {
            if (toPay.isAnyPartPayableWith(color, player.getManaPool())) {
                canUse |= color;
            }
        }
        if (toPay.isAnyPartPayableWith((byte) ManaAtom.GENERIC, player.getManaPool())) {
            canUse |= ManaAtom.GENERIC;
        }
        return canUse;
    }

    /** Colours the cost still specifically needs, if any. */
    private byte neededColors(ManaCostBeingPaid toPay) {
        byte needed = 0;
        for (byte color : ManaAtom.MANATYPES) {
            if (toPay.needsColor(color, player.getManaPool())) {
                needed |= color;
            }
        }
        return needed;
    }

    /**
     * The abilities of one card that are playable right now.
     *
     * A port of Forge's own helper: its mana abilities plus any
     * alternative costs, minus the ones `canPlay` rejects.
     */
    private List<SpellAbility> manaAbilitiesOf(Card card) {
        List<SpellAbility> all = new ArrayList<>();
        for (SpellAbility ability : card.getManaAbilities()) {
            all.add(ability);
            all.addAll(forge.game.GameActionUtil.getAlternativeCosts(ability, player, false));
        }
        all.removeIf(ability -> {
            ability.setActivatingPlayer(player);
            return !ability.canPlay(true);
        });
        return all;
    }

    /**
     * Tap it, and put what it makes toward the cost.
     *
     * Called on Forge's own thread, inside the blocked controller
     * call, so it runs directly rather than through
     * `game.getAction().invoke` — that indirection exists in the
     * desktop client to hop off the UI thread, and there is no UI
     * thread here.
     */
    /** True when an ability was really activated; false when nothing was. */
    private boolean activate(Card card, ManaCostBeingPaid toPay, SpellAbility paidFor)
            throws InterruptedException {
        byte canUse = acceptableColors(toPay);
        byte needed = neededColors(toPay);

        List<SpellAbility> usable = new ArrayList<>();
        for (SpellAbility ability : manaAbilitiesOf(card)) {
            if (ability.isManaAbilityFor(paidFor, canUse)) {
                usable.add(ability);
            }
        }
        if (usable.isEmpty()) {
            return false;
        }

        SpellAbility chosen = usable.size() == 1 ? usable.get(0) : chooseAbility(card, usable);
        if (chosen == null) {
            return false;
        }

        // Which colours this ability may produce for this payment.
        // Forge reads this when the ability can make more than one.
        int producible = 0;
        ColorSet wanted = ColorSet.fromMask(needed == 0 ? canUse : needed);
        for (byte color : ManaAtom.MANATYPES) {
            if (chosen.canProduce(MagicColor.toShortString(color)) && wanted.hasAnyColor(color)) {
                producible |= color;
            }
        }
        chosen.setManaExpressChoice(ColorSet.fromMask(producible));

        if (!PlaySpellAbility.playSpellAbility(controller, player, chosen)) {
            return false;
        }

        List<AbilityManaPart> parts = chosen.getAllManaParts();
        for (AbilityManaPart part : parts) {
            if (!part.meetsManaRestrictions(paidFor)) {
                // Produced, but not usable for THIS. It stays in
                // the pool, which is what Forge does too.
                return true;
            }
        }
        player.getManaPool().payManaFromAbility(paidFor, toPay, chosen);
        return true;
    }

    /**
     * Which of this card's abilities — asked, never guessed.
     *
     * Reached only when one permanent offers several ways to pay
     * that Forge has not already collapsed. Pass cancels, because
     * a player who taps the wrong permanent should be able to back
     * out rather than being forced to spend it.
     */
    private SpellAbility chooseAbility(Card card, List<SpellAbility> usable)
            throws InterruptedException {
        LinkedHashMap<String, SpellAbility> byId = new LinkedHashMap<>();
        LinkedHashMap<String, String> labels = new LinkedHashMap<>();
        for (SpellAbility ability : usable) {
            String id = "mana:ability:" + byId.size() + ":card:" + card.getId();
            byId.put(id, ability);
            labels.put(id, card.getName() + " — " + ability);
        }
        String choice =
                host.gate().ask(
                        actedForSeat,
                        authorisedSeat,
                        "chooseManaAbility",
                        new ArrayList<>(byId.keySet()),
                        pending -> host.publishDecision(pending, labels));
        return DecisionGate.PASS.equals(choice) ? null : byId.get(choice);
    }

    /** What is still owed, for the prompt. */
    private static String remaining(ManaCostBeingPaid toPay) {
        return "still owing " + toPay;
    }
}
