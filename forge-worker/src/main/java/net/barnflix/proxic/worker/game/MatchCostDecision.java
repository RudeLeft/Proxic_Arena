package net.barnflix.proxic.worker.game;

import forge.game.card.Card;
import forge.game.cost.CostPartMana;
import forge.game.cost.PaymentDecision;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;

/**
 * What a cost decides — PHASE_06 §6.91, §6.105.
 *
 * Forge asks this while paying for something. The generated base
 * refuses every cost type loudly, and this overrides only the ones
 * Proxic genuinely supports; anything else names itself and stops
 * the match rather than being paid by a guess.
 *
 * That looks drastic and is the smaller risk. A cost silently
 * "paid" by picking the first legal option is a game that looks
 * fine and is not Magic — the exact class of defect the old project
 * shipped, and the reason §6.105 lists "do not choose first option"
 * alongside "do not choose randomly".
 */
final class MatchCostDecision extends GeneratedCostDecisionBase {

    private final GameHost host;
    private final int actedForSeat;
    private final int authorisedSeat;

    MatchCostDecision(
            Player player,
            boolean effect,
            SpellAbility ability,
            Card source,
            GameHost host,
            int actedForSeat,
            int authorisedSeat) {
        super(player, effect, ability, source);
        this.host = host;
        this.actedForSeat = actedForSeat;
        this.authorisedSeat = authorisedSeat;
    }

    /**
     * MANA IS NOT PAID HERE.
     *
     * The one cost every spell has, and the visitor has nothing to
     * decide about it: Forge pays mana through its own payment
     * flow, which asks the controller separately. Both of Forge's
     * own implementations say exactly this — the AI returns
     * `PaymentDecision.number(0)` and the human controller does not
     * override the method at all.
     *
     * So this is a faithful port and not a shortcut. Returning
     * anything else here would be inventing an answer to a question
     * Forge did not ask.
     */
    @Override
    public PaymentDecision visit(CostPartMana cost) {
        return PaymentDecision.number(0);
    }

    /**
     * "{T}" — tap the thing the cost already names.
     *
     * No choice exists: the permanent is decided by the ability
     * being activated, not by the player. Every mana ability on a
     * land has this, which is why nothing could be paid for until
     * it was here.
     *
     * Forge's two implementations DISAGREE on the number -- the
     * human returns 1 and the AI returns 0 -- and this follows
     * the human, as it does for paysRightAfterDecision. Proxic is
     * modelling a person, and where Forge's own paths differ the
     * human one is the one to copy.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostTap cost) {
        return PaymentDecision.number(1);
    }

    /**
     * Pay each cost as it is decided, like a human and unlike the AI.
     *
     * Forge's human controller returns true and the AI returns
     * false. The difference matters when a cost is refused partway
     * through: paying as you go leaves the game in the state a
     * player would expect, which is what Proxic is modelling.
     */
    /**
     * Put a counter on something to pay for it — §6.91, §6.105.
     *
     * Overwhelmingly this is a planeswalker's "+1": the cost of the
     * ability is a loyalty counter on the planeswalker itself. It
     * is also how a handful of spells work (Scarscale Ritual puts a
     * -1/-1 counter on a creature you choose), and those are not
     * the same question, so Forge separates them and so does this.
     *
     * A PORT of Forge's human path, branch for branch.
     * `payCostFromSource` means the cost names its own card and
     * there is nothing to choose. Otherwise the player picks which
     * permanent takes the counter, from the list FORGE builds —
     * valid types, filtered by what can actually receive that
     * counter. Nothing here works out what a legal recipient is.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostPutCounter cost) {
        final int amount = cost.getAbilityAmount(ability);

        if (cost.payCostFromSource()) {
            // Forge asks for confirmation only when this is an
            // optional cost on an effect (Fabricate). A planeswalker
            // ability is neither, and the player has already chosen
            // it by activating the ability -- asking "do you want to
            // pay the loyalty?" after they pressed +1 is a question
            // with one answer.
            if (isEffect() && ability.hasParam("UnlessCost")
                    && !confirm("Put " + amount + " " + cost.getCounter().getName()
                            + " counter on " + ability.getHostCard().getDisplayName() + "?")) {
                return null;
            }
            return PaymentDecision.card(source);
        }

        // FORGE decides what is a legal recipient.
        forge.game.card.CardCollectionView valid =
                forge.game.card.CardLists.getValidCards(
                        source.getGame().getCardsIn(forge.game.zone.ZoneType.Battlefield),
                        cost.getType().split(";"), player, ability.getHostCard(), ability);
        valid = forge.game.card.CardLists.filter(
                valid, forge.game.card.CardPredicates.canReceiveCounters(cost.getCounter()));
        if (valid.isEmpty()) {
            return null;
        }

        Card chosen =
                pickOne(
                        valid,
                        "CostPutCounter",
                        "Put " + amount + " " + cost.getCounter().getName()
                                + " counter on which " + cost.getDescriptiveType() + "?");
        return chosen == null ? null : PaymentDecision.card(chosen);
    }

    /**
     * Remove counters to pay for it — a planeswalker's "-3".
     *
     * Ported from Forge's human path, including the two early
     * branches that look like special cases and are not: "All"
     * confirms before wiping a pile of counters, and a planeswalker
     * ability is EXEMPT from the confirmation other cards get,
     * because activating the ability already was the decision.
     * Forge's own comment says so in as many words ("ignore
     * Planeswalker abilities for this").
     *
     * The counter TABLE is built by {@link #counterTable}, which is
     * where a card carrying several kinds of counter becomes a real
     * question for the player.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostRemoveCounter cost) {
        final String amount = cost.getAmount();
        final forge.game.card.CounterType counter = cost.counter;
        final boolean anyKind = counter == null;
        final boolean all = "All".equals(amount);

        int toRemove = all ? 1 : cost.getAbilityAmount(ability);

        if (cost.payCostFromSource()) {
            final int available =
                    anyKind ? source.getNumAllCounters() : source.getCounters(counter);
            if (all) {
                if (!confirm("Remove all "
                        + (anyKind ? "" : counter.getName() + " ") + "counters from "
                        + source.getName() + "?")) {
                    return null;
                }
                toRemove = available;
            } else if (ability != null && !ability.isPwAbility()) {
                if (available < toRemove) {
                    return null;
                }
                if (!confirm("Remove " + amount + " "
                        + (anyKind ? "" : counter.getName().toLowerCase() + " ")
                        + "counter from " + source.getName() + " to pay the cost?")) {
                    return null;
                }
            }
            if (available < toRemove) {
                return null;
            }
            return decide(counterTable(source, counter, toRemove));
        }

        if ("OriginalHost".equals(cost.getType())) {
            final Card original = ability.getOriginalHost();
            final int available =
                    anyKind ? original.getNumAllCounters() : original.getCounters(counter);
            if (all) {
                toRemove = available;
            }
            if (available < toRemove) {
                return null;
            }
            return decide(counterTable(original, counter, toRemove));
        }

        forge.game.card.CardCollectionView valid =
                forge.game.card.CardLists.getValidCards(
                        player.getCardsIn(cost.zone), cost.getType().split(";"),
                        player, source, ability);
        // One card, N counters -- Forge's own comment, and its own
        // filters for what has enough to give.
        valid = anyKind
                ? forge.game.card.CardLists.filterAnyCounters(valid, toRemove)
                : forge.game.card.CardLists.filter(
                        valid, forge.game.card.CardPredicates.hasCounter(counter, toRemove));
        if (valid.isEmpty()) {
            return null;
        }

        Card chosen =
                pickOne(
                        valid,
                        "CostRemoveCounter",
                        "Remove " + toRemove + " "
                                + (anyKind ? "" : counter.getName() + " ")
                                + "counter from which permanent?");
        return chosen == null ? null : decide(counterTable(chosen, counter, toRemove));
    }

    /** An empty table is "could not pay", not "paid nothing". */
    private static PaymentDecision decide(forge.game.GameEntityCounterTable table) {
        return table.isEmpty() ? null : PaymentDecision.counters(table);
    }

    /**
     * Which counters, exactly — a port of Forge's own helper.
     *
     * A named counter type is no question. Unnamed ("remove a
     * counter", no kind given) with more than one kind present and
     * the PLAYER chooses the kind and how many, one pass at a time,
     * which is Forge's loop and is a real decision: removing a
     * +1/+1 and removing a loyalty counter are not interchangeable.
     */
    private forge.game.GameEntityCounterTable counterTable(
            Card card, forge.game.card.CounterType type, int toRemove) {
        final forge.game.GameEntityCounterTable table = new forge.game.GameEntityCounterTable();
        if (type != null) {
            table.put(null, card, type, toRemove);
            return table;
        }

        com.google.common.collect.Multiset<forge.game.card.CounterType> kinds =
                table.filterToRemove(card);
        for (forge.game.card.CounterType kind
                : com.google.common.collect.ImmutableList.copyOf(kinds.elementSet())) {
            if (!card.canRemoveCounters(kind)) {
                kinds.remove(kind);
            }
        }
        if (kinds.isEmpty()) {
            return table;
        }
        if (kinds.size() == 1) {
            table.put(null, card, kinds.elementSet().iterator().next(), toRemove);
            return table;
        }

        forge.game.player.PlayerController controller = card.getController().getController();
        while (toRemove > 0) {
            forge.game.card.CounterType chosen =
                    controller.chooseCounterType(
                            new java.util.ArrayList<>(kinds.elementSet()),
                            ability,
                            "Which kind of counter to remove?",
                            null);
            if (chosen == null) {
                break;
            }
            int max = Math.min(toRemove, kinds.count(chosen));
            int min = Math.max(1, max - kinds.size());
            int chosenAmount =
                    controller.chooseNumber(
                            ability,
                            "How many " + chosen.getName() + " counters to remove?",
                            min, max, null);
            if (chosenAmount > 0) {
                table.put(null, card, chosen, chosenAmount);
                kinds = table.filterToRemove(card);
            }
            toRemove -= chosenAmount;
        }
        return table;
    }

    /**
     * One card out of a list Forge built.
     *
     * Always asked, even for a single candidate. Unlike a counter
     * TYPE, which is a property of the effect, which permanent pays
     * a cost is a commitment: Forge's own human input shows the
     * list and lets the player cancel, and a cost silently paid off
     * the only legal permanent is a cost the player never agreed
     * to.
     */
    private Card pickOne(
            forge.game.card.CardCollectionView cards, String kind, String prompt) {
        java.util.LinkedHashMap<String, Card> byId = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        for (Card card : cards) {
            // §6.46 -- typed, like every other object id.
            String id = "cost:card:" + card.getId();
            byId.put(id, card);
            labels.put(id, card.getName());
        }
        try {
            String choice =
                    host.gate().ask(
                            actedForSeat, authorisedSeat, kind,
                            new java.util.ArrayList<>(byId.keySet()),
                            // NOT mandatory: Forge allows a cancel
                            // here, and cancelling a cost cancels the
                            // spell, which is a legal answer.
                            false, prompt,
                            pending -> host.publishDecision(pending, labels));
            return DecisionGate.PASS.equals(choice) ? null : byId.get(choice);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    /** A yes/no the player actually answers. */
    private boolean confirm(String prompt) {
        try {
            String choice =
                    host.gate().ask(
                            actedForSeat, authorisedSeat, "confirmPayment",
                            java.util.List.of("confirm:yes"), false, prompt,
                            pending -> host.publishDecision(
                                    pending, java.util.Map.of("confirm:yes", "Pay the cost")));
            return "confirm:yes".equals(choice);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    @Override
    public boolean paysRightAfterDecision() {
        return true;
    }
}
