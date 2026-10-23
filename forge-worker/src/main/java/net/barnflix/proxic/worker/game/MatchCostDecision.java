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

    /**
     * Exile something to pay for it — §6.91, §6.105.
     *
     * A graveyard ability whose cost is "exile this card", flashback-style
     * self-exile, "exile a card from your hand", "exile two cards
     * from your graveyard". A PORT of Forge's human path for the
     * branches that cover those; Forge builds every list, and the
     * player chooses from it.
     *
     * The rarer variants — a total mana value, a count of mana
     * symbols or card types, cards that share a type, the top of a
     * graveyard or library, any player's zone — are refused LOUDLY,
     * by name. Each is its own selection rule in Forge, and paying
     * one with the plain chooser would accept selections Forge
     * would refuse.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostExile cost) {
        String type = cost.getType();
        Card onlyPayable = cost.payCostFromSource() ? source : null;
        if ("OriginalHost".equals(type)) {
            onlyPayable = ability.getOriginalHost();
        }
        if (onlyPayable != null) {
            // Forge asks even here: the human path confirms before
            // exiling the card the cost names.
            if (onlyPayable.canExiledBy(ability, isEffect())
                    && onlyPayable.getZone() == player.getZone(cost.from.get(0))
                    && confirm("Exile " + onlyPayable.getName() + "?")) {
                return PaymentDecision.card(onlyPayable);
            }
            return null;
        }

        for (String variant : new String[] {
                "FromTopGrave", "+withTotalCMCEQ", "+withTotalCMCGE",
                "+withTotalManaSymbols_", "+withSharedCardType", "+withTypesGE"}) {
            if (type.contains(variant)) {
                return loud("CostExile " + variant);
            }
        }

        final forge.game.Game game = player.getGame();
        forge.game.card.CardCollection list =
                new forge.game.card.CardCollection(
                        cost.zoneRestriction != 1 ? game.getCardsIn(cost.from) : player.getCardsIn(cost.from));

        if ("All".equals(type)) {
            if (confirm("Exile all " + list.size() + " cards from " + cost.from.get(0) + "?")) {
                return PaymentDecision.card(list);
            }
            return null;
        }
        list = new forge.game.card.CardCollection(
                forge.game.card.CardLists.getValidCards(list, type.split(";"), player, source, ability));
        list = new forge.game.card.CardCollection(
                forge.game.card.CardLists.filter(
                        list, forge.game.card.CardPredicates.canExiledBy(ability, isEffect())));

        final int needed = cost.getAbilityAmount(ability);
        if (list.size() < needed) {
            return null;
        }
        if (needed == 0) {
            return PaymentDecision.number(0);
        }

        if (cost.from.size() == 1) {
            forge.game.zone.ZoneType zone = cost.from.get(0);
            if (zone == forge.game.zone.ZoneType.Battlefield || zone == forge.game.zone.ZoneType.Hand) {
                java.util.List<Card> chosen =
                        pickCards(list, needed, "CostExile", "Exile " + needed + " from your " + zone + ".");
                return chosen == null ? null : PaymentDecision.card(chosen);
            }
            if (zone == forge.game.zone.ZoneType.Library) {
                return loud("CostExile from the top of a library");
            }
        }

        if (cost.zoneRestriction == 0) {
            // Forge first asks WHOSE zone, then which cards in it.
            return loud("CostExile from any player's zone");
        }

        // exileFromMiscZone: a triggered ability exiling its one
        // card confirms rather than offering a list of one.
        if (cost.zoneRestriction == -1 && ability.isTrigger() && needed == 1 && list.size() == 1) {
            return confirm("Exile " + list.getFirst().getName() + "?")
                    ? PaymentDecision.card(list.getFirst())
                    : null;
        }
        java.util.List<Card> chosen =
                player.getController().chooseCardsForZoneChange(
                        forge.game.zone.ZoneType.Exile,
                        new java.util.ArrayList<>(cost.from),
                        ability, list, 0, needed, null, cost.toString(needed), null);
        if (chosen == null || chosen.size() < needed) {
            return null;
        }
        return PaymentDecision.card(chosen);
    }

    /**
     * Sacrifice something to pay for it.
     *
     * Village Rites, Evolving Wilds, Deadly Dispute. A port of
     * Forge's human path: a cost that names its own card confirms
     * (Forge asks "sacrifice this?" even after the ability was
     * chosen); otherwise the player chooses which permanents, from
     * the list FORGE builds of what may legally be sacrificed.
     * "+WithDifferentNames" is refused loudly — it is a different
     * selection rule.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostSacrifice cost) {
        final String amount = cost.getAmount();
        final String type = cost.getType();

        if (cost.payCostFromSource()) {
            if (source.getController() == ability.getActivatingPlayer()
                    && source.canBeSacrificedBy(ability, isEffect())
                    && confirm("Sacrifice " + source.getName() + "?")) {
                return PaymentDecision.card(source);
            }
            return null;
        }
        if ("OriginalHost".equals(type)) {
            Card original = ability.getOriginalHost();
            if (original.getController() == ability.getActivatingPlayer()
                    && original.canBeSacrificedBy(ability, isEffect())
                    && confirm("Sacrifice " + original.getName() + "?")) {
                return PaymentDecision.card(original);
            }
            return null;
        }
        if (type.contains("+WithDifferentNames")) {
            return loud("CostSacrifice +WithDifferentNames");
        }

        forge.game.card.CardCollectionView list =
                forge.game.card.CardLists.filter(
                        player.getCardsIn(forge.game.zone.ZoneType.Battlefield),
                        forge.game.card.CardPredicates.canBeSacrificedBy(ability, isEffect()));
        list = forge.game.card.CardLists.getValidCards(list, type.split(";"), player, source, ability);

        if ("All".equals(amount)) {
            return PaymentDecision.card(list);
        }
        final int needed = cost.getAbilityAmount(ability);
        if (needed == 0) {
            return PaymentDecision.number(0);
        }
        if (list.size() < needed) {
            return null;
        }
        java.util.List<Card> chosen =
                pickCards(list, needed, "CostSacrifice",
                        "Sacrifice " + needed + " " + cost.getDescriptiveType() + ".");
        return chosen == null ? null : PaymentDecision.card(chosen);
    }

    /**
     * Draw cards as a cost -- Phase 8, 52 cards (Academy Wall, Daring
     * Saboteur's loot, Baral). A port of Forge's human path: a yes or no,
     * "Draw 1 card?". Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostDraw cost) {
        if (!cost.canPay(ability, player, isEffect())) {
            return null;
        }
        int needed = cost.getAbilityAmount(ability);
        java.util.List<forge.game.player.Player> who = cost.getPotentialPlayers(player, ability);
        String card = source == null ? "" : source.getName() + ": ";
        String draw = who.contains(player) && who.size() == 1 ? "draw " : "have that player draw ";
        if (!confirm(card + draw + forge.util.Lang.nounWithNumeralExceptOne(needed, "card") + "?")) {
            return null;
        }
        PaymentDecision decision = PaymentDecision.players(who);
        decision.c = needed;
        return decision;
    }

    /**
     * Reveal cards from your hand as a cost -- Phase 8, 76 cards (Charge of
     * the Forever-Beast, Draconic Roar, the reveal-a-Dragon cards). A port
     * of Forge's human path: the card itself, or the whole hand, without
     * asking; exactly as many as qualify, revealed without asking (Forge's
     * own shortcut); otherwise the player picks -- for "the same colour",
     * each pick sharing a colour with the first. Forge reveals them to the
     * other player. Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostReveal cost) {
        if (cost.payCostFromSource()) {
            return PaymentDecision.card(source);
        }
        if ("Hand".equals(cost.getType())) {
            return PaymentDecision.card(player.getCardsIn(forge.game.zone.ZoneType.Hand));
        }
        int needed = cost.getAbilityAmount(ability);
        if (needed == 0) {
            return PaymentDecision.number(0);
        }
        forge.game.card.CardCollectionView from = player.getCardsIn(cost.getRevealFrom());
        if ("SameColor".equals(cost.getType())) {
            final forge.game.card.CardCollectionView all = from;
            forge.game.card.CardCollection left = forge.game.card.CardLists.filter(all, c -> {
                for (Card other : all) {
                    if (!other.equals(c) && other.sharesColorWith(c)) {
                        return true;
                    }
                }
                return false;
            });
            forge.game.card.CardCollection shown = new forge.game.card.CardCollection();
            for (int i = 0; i < needed; i++) {
                Card next = pickOne(left, "CostReveal", "Reveal " + needed + " cards of the same colour ("
                        + (i + 1) + " of " + needed + ").");
                if (next == null) {
                    return null;
                }
                shown.add(next);
                left = forge.game.card.CardLists.filter(left, c -> c != next && c.sharesColorWith(next));
            }
            return PaymentDecision.card(shown);
        }
        forge.game.card.CardCollectionView valid = forge.game.card.CardLists.getValidCards(
                from, cost.getType().split(";"), player, source, ability);
        if (valid.size() < needed) {
            return null;
        }
        if (!ability.isCastFromPlayEffect() && valid.size() == needed) {
            return PaymentDecision.card(valid);
        }
        java.util.List<Card> chosen = pickCards(valid, needed, "CostReveal",
                "Reveal " + forge.util.Lang.nounWithNumeralExceptOne(needed, cost.getDescriptiveType()) + ".");
        return chosen == null ? null : PaymentDecision.card(chosen);
    }

    /** "Reveal the chosen card" -- the choice was made already; nothing to ask (Forge's human path). */
    @Override
    public PaymentDecision visit(forge.game.cost.CostRevealChosen cost) {
        return PaymentDecision.number(1);
    }

    /**
     * Exert as a cost -- Arena of Glory's "Exert this land", Steward of
     * Solidarity. Every exert cost there is exerts the card itself (36 of
     * 36), so this is Forge's human path for that: a yes or no. Any other
     * form stays the loud stub, so a new card is noticed. (Exerting as a
     * creature attacks is not asked here: Forge pays that from the creature
     * after "Exert which attackers?".) Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostExert cost) {
        if (cost.payCostFromSource()) {
            Card card = ability.getHostCard();
            if (card.getController() == ability.getActivatingPlayer() && card.isInPlay()
                    && confirm("Exert " + card.getName() + "? It doesn't untap during your next untap step.")) {
                return PaymentDecision.card(card);
            }
            return null;
        }
        return super.visit(cost);
    }

    /**
     * Behold as a cost -- "behold a Dragon": choose one you control or
     * reveal one from your hand (25 cards, Lorwyn Eclipsed); the champions'
     * "behold a Kithkin and exile it" is the same choice, then exiled. A
     * port of Forge's human path: exactly that many, one click each, from
     * your battlefield and hand together. Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostBehold cost) {
        int needed = cost.getAbilityAmount(ability);
        forge.game.card.CardCollectionView valid = forge.game.card.CardLists.getValidCards(
                player.getCardsIn(cost.getRevealFrom()), cost.getType().split(";"), player, source, ability);
        if (valid.size() < needed) {
            return null;
        }
        String what = forge.util.Lang.nounWithNumeralExceptOne(needed, cost.getDescriptiveType());
        java.util.List<Card> chosen = pickCards(valid, needed, "CostBehold",
                (cost instanceof forge.game.cost.CostBeholdExile ? "Behold and exile " : "Behold ") + what
                        + ": one you control, or one from your hand.");
        return chosen == null ? null : PaymentDecision.card(chosen);
    }

    /** Behold, then exile what was beheld: the same choice. */
    @Override
    public PaymentDecision visit(forge.game.cost.CostBeholdExile cost) {
        return visit((forge.game.cost.CostBehold) cost);
    }

    /**
     * Collect evidence N -- exile cards from your graveyard with total mana
     * value N or more (25 cards, Murders at Karlov Manor). A port of
     * Forge's human path, in the crew form: one card at a time until the
     * total is enough, then more or Done. Cancelling, before it is enough,
     * cancels the spell or ability. Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostCollectEvidence cost) {
        forge.game.card.CardCollection left = forge.game.card.CardLists.filter(
                player.getCardsIn(forge.game.zone.ZoneType.Graveyard),
                forge.game.card.CardPredicates.canExiledBy(ability, isEffect()));
        int total = forge.game.ability.AbilityUtils.calculateAmount(source, cost.getAmount(), ability);
        forge.game.card.CardCollection chosen = new forge.game.card.CardCollection();
        while (!left.isEmpty()) {
            int have = forge.game.card.CardLists.getTotalCMC(chosen);
            boolean enough = have >= total;
            Card next = pickOrDone(left, "CostCollectEvidence", "Collect evidence " + total
                    + ": exile cards from your graveyard with total mana value " + total + " or more ("
                    + have + " so far)" + (enough ? " -- or Done." : "."), enough);
            if (next == null) {
                break;
            }
            chosen.add(next);
            left.remove(next);
        }
        return forge.game.card.CardLists.getTotalCMC(chosen) >= total ? PaymentDecision.card(chosen) : null;
    }

    /**
     * Blight N -- put N -1/-1 counters on a creature you control (23 cards,
     * Lorwyn Eclipsed). Forge pays it as its put-a-counter cost; this
     * asks it in blight's own words. Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostBlight cost) {
        int amount = cost.getAbilityAmount(ability);
        forge.game.card.CardCollectionView valid = forge.game.card.CardLists.filter(
                forge.game.card.CardLists.getValidCards(
                        source.getGame().getCardsIn(forge.game.zone.ZoneType.Battlefield),
                        cost.getType().split(";"), player, ability.getHostCard(), ability),
                forge.game.card.CardPredicates.canReceiveCounters(cost.getCounter()));
        if (valid.isEmpty()) {
            return null;
        }
        Card chosen = pickOne(valid, "CostBlight", "Blight " + amount + ": put "
                + forge.util.Lang.nounWithNumeral(amount, "-1/-1 counter") + " on a creature you control.");
        return chosen == null ? null : PaymentDecision.card(chosen);
    }

    /**
     * Take damage as a cost -- Blazing Salvo, Browbeat, Book Burning: "unless
     * that player has it deal 5 damage to them". A port of Forge's human
     * path: a yes or no, asked of whoever may pay. Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostDamage cost) {
        int amount = cost.getAbilityAmount(ability);
        return confirm("Have " + source.getName() + " deal " + amount + " damage to you?")
                ? PaymentDecision.number(amount) : null;
    }

    /** The untap symbol {Q}: nothing to choose -- the card untaps (Forge's human path). */
    @Override
    public PaymentDecision visit(forge.game.cost.CostUntap cost) {
        return PaymentDecision.number(1);
    }

    /**
     * Enlist -- tap a creature you control that isn't attacking (and could
     * attack); the enlisting attacker gets its power. A port of Forge's
     * human path: one click, from Forge's list. Cancelling means the
     * attacker doesn't enlist and, as Forge has it, doesn't attack.
     * Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostEnlist cost) {
        forge.game.card.CardCollectionView list = forge.game.cost.CostEnlist.getCardsForEnlisting(player);
        if (list.isEmpty()) {
            return null;
        }
        Card chosen = pickOne(list, "CostEnlist", source.getName()
                + " enlists: tap a creature that isn't attacking, and add its power.");
        return chosen == null ? null : PaymentDecision.card(chosen);
    }

    /**
     * Mill as a cost -- Sinister Concoction, Deranged Assistant: a yes or no
     * (Forge's human path). Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostMill cost) {
        int amount = cost.getAbilityAmount(ability);
        return confirm("Mill " + forge.util.Lang.nounWithNumeral(amount, "card") + "?")
                ? PaymentDecision.number(amount) : null;
    }

    /**
     * Forage -- sacrifice a Food, or exile three cards from your graveyard
     * (Bloomburrow). A port of Forge's human path: with a Food, "sacrifice
     * a Food?" first (no means the graveyard instead); then which Food, or
     * which three cards. Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostForage cost) {
        forge.game.card.CardCollection food = forge.game.card.CardLists.filter(
                player.getCardsIn(forge.game.zone.ZoneType.Battlefield),
                forge.game.card.CardPredicates.isType("Food"),
                forge.game.card.CardPredicates.canBeSacrificedBy(ability, isEffect()));
        forge.game.card.CardCollection grave = forge.game.card.CardLists.filter(
                player.getCardsIn(forge.game.zone.ZoneType.Graveyard),
                forge.game.card.CardPredicates.canExiledBy(ability, isEffect()));
        if (!food.isEmpty() && confirm("Forage by sacrificing a Food? (Or pass to exile three cards from your"
                + " graveyard.)")) {
            Card one = pickOne(food, "CostForage", "Forage: sacrifice a Food.");
            return one == null ? null : PaymentDecision.card(one);
        }
        if (grave.size() >= 3) {
            java.util.List<Card> chosen = pickCards(grave, 3, "CostForage",
                    "Forage: exile three cards from your graveyard.");
            return chosen == null ? null : PaymentDecision.card(chosen);
        }
        return null;
    }

    /**
     * "Have an opponent gain 3 life" as a cost -- Invigorate, Skyshroud
     * Cutter. A port of Forge's human path: which opponent, or none to
     * cancel; "each other player" needs no choice. Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostGainLife cost) {
        int amount = cost.getAbilityAmount(ability);
        java.util.List<forge.game.player.Player> can = new java.util.ArrayList<>();
        for (forge.game.player.Player opp : cost.getPotentialTargets(player, ability)) {
            if (opp.canGainLife()) {
                can.add(opp);
            }
        }
        if (cost.getCntPlayers() == Integer.MAX_VALUE) {
            return PaymentDecision.players(can);
        }
        forge.game.player.Player chosen = pickPlayer(can, "CostGainLife",
                source.getName() + ": choose an opponent to gain " + amount + " life.");
        return chosen == null ? null : PaymentDecision.players(java.util.List.of(chosen));
    }

    /**
     * Promise a gift (Bloomburrow, 27 cards) -- which opponent receives it.
     * Forge's human path asks a "choose one" that needs no question with a
     * single opponent, so a two-player game asks nothing. Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostPromiseGift cost) {
        java.util.List<forge.game.player.Player> opponents = new java.util.ArrayList<>();
        cost.getPotentialPlayers(player, ability).forEach(opponents::add);
        if (opponents.size() == 1) {
            return PaymentDecision.players(opponents);
        }
        forge.game.player.Player chosen = pickPlayer(opponents, "CostPromiseGift",
                source.getName() + ": choose an opponent to promise the gift to.");
        return chosen == null ? null : PaymentDecision.players(java.util.List.of(chosen));
    }

    /** One of these players, by name, or none (cancels the cost). */
    private forge.game.player.Player pickPlayer(java.util.List<forge.game.player.Player> players, String kind,
            String prompt) {
        java.util.LinkedHashMap<String, forge.game.player.Player> byId = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        for (forge.game.player.Player p : players) {
            byId.put("player:" + p.getId(), p);
            labels.put("player:" + p.getId(), p.getName());
        }
        try {
            String choice = host.gate().ask(actedForSeat, authorisedSeat, kind,
                    new java.util.ArrayList<>(byId.keySet()), false, prompt,
                    pending -> host.publishDecision(pending, labels));
            return choice == null ? null : byId.get(choice);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    /**
     * Put cards on top of your library as a cost -- Leashling and Hidden
     * Retreat (from hand), the graveyard ones (Reito Lantern-style). A port
     * of Forge's human path for the card itself (a yes or no), the hand and
     * your graveyard: exactly that many, one click each. The one "from the
     * same graveyard" card stays the loud stub. Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostPutCardToLib cost) {
        if (cost.payCostFromSource()) {
            return source.getZone() == player.getZone(cost.getFrom())
                    && confirm("Put " + source.getName() + " on top of your library?")
                    ? PaymentDecision.card(source) : null;
        }
        if (cost.isSameZone()) {
            return super.visit(cost);
        }
        int needed = cost.getAbilityAmount(ability);
        forge.game.card.CardCollection list = forge.game.card.CardLists.getValidCards(
                player.getCardsIn(cost.getFrom()), cost.getType().split(";"), player, source, ability);
        if (list.size() < needed) {
            return null;
        }
        String from = cost.getFrom() == forge.game.zone.ZoneType.Hand ? "hand" : "graveyard";
        java.util.List<Card> chosen = pickCards(list, needed, "CostPutCardToLib", "Put "
                + forge.util.Lang.nounWithNumeralExceptOne(needed, "card") + " from your " + from
                + " on top of your library.");
        return chosen == null ? null : PaymentDecision.card(chosen);
    }

    /**
     * Untap permanents as a cost -- Halo Fountain ("untap a tapped creature
     * you control"), Benthic Explorers, Crackleburr. A port of Forge's human
     * path: exactly that many, one click each, from what can untap. Was a
     * loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostUntapType cost) {
        forge.game.card.CardCollection list = forge.game.card.CardLists.filter(
                forge.game.card.CardLists.getValidCards(
                        player.getGame().getCardsIn(forge.game.zone.ZoneType.Battlefield),
                        cost.getType().split(";"), player, source, ability),
                c -> c.canUntap(null, false) && (c.getCounters(forge.game.card.CounterEnumType.STUN) == 0
                        || c.canRemoveCounters(forge.game.card.CounterEnumType.STUN)));
        int needed = cost.getAbilityAmount(ability);
        if (list.size() < needed) {
            return null;
        }
        java.util.List<Card> chosen = pickCards(list, needed, "CostUntapType", "Untap "
                + forge.util.Lang.nounWithNumeralExceptOne(needed, cost.getDescriptiveType()) + ".");
        return chosen == null ? null : PaymentDecision.card(chosen);
    }

    /**
     * Remove counters of any kind as a cost -- "remove a counter from this
     * creature" (Moonlit Lamenter, Glen Elendra Guardian), "from a creature
     * you control" (Fain, the Broker); 39 cards. A port of Forge's human
     * path, one counter at a time: which permanent, then which kind when it
     * has several. The card itself with one kind of counter is a yes or
     * no, as for the planeswalker-style counter cost. Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostRemoveAnyCounter cost) {
        int needed = cost.getAbilityAmount(ability);
        forge.game.card.CardCollectionView list = cost.payCostFromSource()
                ? new forge.game.card.CardCollection(ability.getHostCard())
                : forge.game.card.CardLists.getValidCards(player.getCardsIn(forge.game.zone.ZoneType.Battlefield),
                        cost.getType().split(";"), player, source, ability);
        final forge.game.GameEntityCounterTable table = new forge.game.GameEntityCounterTable();
        String what = forge.util.Lang.nounWithNumeral(needed,
                (cost.counter == null ? "" : cost.counter.getName() + " ") + "counter");
        for (int left = needed; left > 0; left--) {
            forge.game.card.CardCollection holding = forge.game.card.CardLists.filter(list,
                    c -> !removable(table, c, cost.counter).isEmpty());
            if (holding.isEmpty()) {
                return null;
            }
            Card card;
            if (cost.payCostFromSource()) {
                card = holding.get(0);
                if (left == needed && removable(table, card, cost.counter).elementSet().size() == 1
                        && !confirm("Remove " + what + " from " + card.getName() + "?")) {
                    return null;
                }
            } else {
                card = pickOne(holding, "CostRemoveAnyCounter", "Remove " + what
                        + (left == needed ? "" : " (" + left + " more)") + ": from which permanent?");
                if (card == null) {
                    return null;
                }
            }
            java.util.List<forge.game.card.CounterType> kinds =
                    new java.util.ArrayList<>(removable(table, card, cost.counter).elementSet());
            forge.game.card.CounterType kind = kinds.size() == 1 ? kinds.get(0)
                    : card.getController().getController().chooseCounterType(kinds, ability,
                            "Which kind of counter to remove from " + card.getName() + "?", null);
            if (kind == null) {
                return null;
            }
            table.put(null, card, kind, 1);
        }
        return decide(table);
    }

    /** The counters still on [card] after [table], of [type] if given, that can be removed. */
    private static com.google.common.collect.Multiset<forge.game.card.CounterType> removable(
            forge.game.GameEntityCounterTable table, Card card, forge.game.card.CounterType type) {
        com.google.common.collect.Multiset<forge.game.card.CounterType> kinds = table.filterToRemove(card);
        kinds.elementSet().removeIf(k -> (type != null && !k.equals(type)) || !card.canRemoveCounters(k));
        return kinds;
    }

    /**
     * Put cards from exile into their owners' graveyards as a cost -- the
     * processors (Wasteland Strangler, Blight Herder; 16 cards). A port of
     * Forge's human path: exactly that many, one click each; a card whose
     * face its chooser cannot see is offered as "Face-down". Was a loud
     * stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostExiledMoveToGrave cost) {
        int needed = cost.getAbilityAmount(ability);
        forge.game.player.Player activator = ability.getActivatingPlayer();
        forge.game.card.CardCollection list = forge.game.card.CardLists.getValidCards(
                activator.getGame().getCardsIn(forge.game.zone.ZoneType.Exile), cost.getType().split(";"),
                activator, source, ability);
        if (list.size() < needed) {
            return null;
        }
        java.util.List<Card> chosen = pickCards(list, needed, "CostExiledMoveToGrave", "Put "
                + forge.util.Lang.nounWithNumeralExceptOne(needed, cost.getDescriptiveType())
                + " from exile into " + (needed == 1 ? "its owner's graveyard." : "their owners' graveyards."));
        return chosen == null ? null : PaymentDecision.card(chosen);
    }

    /**
     * Unattach as a cost -- Heartseeker, Blinding Powder ("unattach this
     * Equipment"; 9 cards). A port of Forge's human path: one card is a yes
     * or no; several, exactly that many, one click each. Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostUnattach cost) {
        forge.game.card.CardCollection attached = cost.findCardToUnattach(source, player, ability);
        if (attached.size() == 1) {
            return confirm("Unattach " + attached.getFirst().getName() + "?")
                    ? PaymentDecision.card(attached.getFirst()) : null;
        }
        if (attached.size() > 1) {
            java.util.List<Card> chosen = pickCards(attached, cost.getAbilityAmount(ability), "CostUnattach",
                    "Unattach " + cost.getDescriptiveType() + ".");
            return chosen == null ? null : PaymentDecision.card(chosen);
        }
        return null;
    }

    /**
     * Exile spells from the stack as a cost -- Nivmagus Elemental, Dragon's
     * Approach (4 cards). A port of Forge's human path: one spell at a time,
     * named by Forge's own stack description; "All" needs no choice. Was a
     * loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostExileFromStack cost) {
        java.util.List<SpellAbility> spells = new java.util.ArrayList<>();
        java.util.List<String> texts = new java.util.ArrayList<>();
        for (forge.game.spellability.SpellAbilityStackInstance si : player.getGame().getStack()) {
            Card card = si.getSourceCard();
            SpellAbility root = si.getSpellAbility().getRootAbility();
            if (card.isValid(cost.getType().split(";"), ability.getActivatingPlayer(), source, ability)
                    && root.isSpell()) {
                spells.add(root);
                texts.add(root.getStackDescription().replaceAll(" \\(\\d+\\)", "")
                        + (card.isCopiedSpell() ? " (a copy)" : ""));
            }
        }
        if ("All".equals(cost.getType())) {
            return PaymentDecision.spellabilities(spells);
        }
        int needed = cost.getAbilityAmount(ability);
        if (spells.size() < needed) {
            return null;
        }
        java.util.List<SpellAbility> exiled = new java.util.ArrayList<>();
        for (int i = 0; i < needed; i++) {
            int picked = pickText(texts, "CostExileFromStack", "Exile a spell from the stack ("
                    + (needed - i) + " more): which one?");
            if (picked < 0) {
                return null;
            }
            exiled.add(spells.remove(picked));
            texts.remove(picked);
        }
        return PaymentDecision.spellabilities(exiled);
    }

    /** Choose a creature type as a cost -- Caller of the Hunt, Celestial Reunion (Forge's type question). */
    @Override
    public PaymentDecision visit(forge.game.cost.CostChooseCreatureType cost) {
        String choice = player.getController().chooseSomeType("Creature", ability,
                forge.card.CardType.getAllCreatureTypes(), true);
        return choice == null ? null : PaymentDecision.type(choice);
    }

    /** One of these texts, by index, or -1 when passed (cancels the cost). */
    private int pickText(java.util.List<String> texts, String kind, String prompt) {
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        for (int i = 0; i < texts.size(); i++) {
            labels.put(kind + ":" + i, texts.get(i));
        }
        try {
            String choice = host.gate().ask(actedForSeat, authorisedSeat, kind,
                    new java.util.ArrayList<>(labels.keySet()), false, prompt,
                    pending -> host.publishDecision(pending, labels));
            return choice == null ? -1 : Integer.parseInt(choice.substring(kind.length() + 1));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return -1;
        }
    }

    /**
     * Return permanents you control to their owner's hand as a cost --
     * Phase 8, 94 cards: Daze and Gush (instead of their mana), the
     * bounce lands. A port of Forge's human path: the card itself is a yes
     * or no; otherwise exactly that many of Forge's list, one click each.
     * Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostReturn cost) {
        int needed = cost.getAbilityAmount(ability);
        if (cost.payCostFromSource()) {
            Card card = ability.getHostCard();
            if (card.getController() == player && card.isInPlay()
                    && confirm("Return " + card.getName() + " to its owner's hand?")) {
                return PaymentDecision.card(card);
            }
            return null;
        }
        forge.game.card.CardCollectionView valid = forge.game.card.CardLists.getValidCards(
                ability.getActivatingPlayer().getCardsIn(forge.game.zone.ZoneType.Battlefield),
                cost.getType().split(";"), player, source, ability);
        if (valid.size() < needed) {
            return null;
        }
        java.util.List<Card> chosen = pickCards(valid, needed, "CostReturn",
                "Return " + forge.util.Lang.nounWithNumeralExceptOne(needed, cost.getDescriptiveType())
                        + (needed == 1 ? " to its" : " to their") + " owner's hand.");
        return chosen == null ? null : PaymentDecision.card(chosen);
    }

    /**
     * Tap untapped permanents you control as a cost -- Phase 8, 239 cards
     * (Springleaf Drum, Hecatomb, Glare of Subdual) and every Vehicle's
     * crew. A port of Forge's human path, three forms:
     *   a number of them      exactly that many, one click each
     *   sharing a type        one at a time, each narrowing the next
     *   total power (crew)    until the power is enough, then Done (more
     *                         may be tapped; Forge allows it)
     * Cancelling, where Forge allows it, cancels the spell or ability.
     * Was a loud stub.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostTapType cost) {
        String type = cost.getType();
        final String amount = cost.getAmount();
        if ("OriginalHost".equals(type)) {
            Card original = ability.getOriginalHost();
            return original.canTap() ? PaymentDecision.card(original) : null;
        }
        boolean sameType = type.contains(".sharesCreatureTypeWith");
        if (sameType) {
            type = type.replace(".sharesCreatureTypeWith", "");
        }
        Integer power = null;
        if (type.contains("+withTotalPowerGE")) {
            String p = type.split("withTotalPowerGE")[1];
            power = Integer.parseInt(p);
            type = type.replace("+withTotalPowerGE" + p, "");
        }
        forge.game.card.CardCollection list = forge.game.card.CardLists.getValidCards(
                player.getCardsIn(forge.game.zone.ZoneType.Battlefield), type.split(";"), player, source, ability);
        list = forge.game.card.CardLists.filter(list, ability.isCrew()
                ? forge.game.card.CardPredicates.CAN_CREW : forge.game.card.CardPredicates.CAN_TAP);
        Integer needed = "Any".equals(amount) ? null : cost.getAbilityAmount(ability);
        if (needed != null && needed == 0) {
            return PaymentDecision.number(0);
        }
        String what = cost.getDescriptiveType();

        if (power != null) {
            // Crew and its kin: any of them, until their power is enough.
            forge.game.card.CardCollection chosen = new forge.game.card.CardCollection();
            forge.game.card.CardCollection left = new forge.game.card.CardCollection(list);
            while (!left.isEmpty()) {
                int have = forge.game.card.CardLists.getTotalPower(chosen, ability);
                boolean enough = have >= power;
                Card next = pickOrDone(left, "CostTapType", (ability.isCrew() ? "Crew " + power : "Tap")
                        + ": tap creatures with total power " + power + " or more (" + have + " so far)"
                        + (enough ? " -- or Done." : "."), enough);
                if (next == null) {
                    break;
                }
                chosen.add(next);
                left.remove(next);
            }
            return forge.game.card.CardLists.getTotalPower(chosen, ability) >= power
                    ? PaymentDecision.card(chosen) : null;
        }
        if (sameType) {
            final forge.game.card.CardCollection candidates = list;
            forge.game.card.CardCollection left = forge.game.card.CardLists.filter(candidates, c12 -> {
                for (Card other : candidates) {
                    if (!other.equals(c12) && other.sharesCreatureTypeWith(c12)) {
                        return true;
                    }
                }
                return false;
            });
            forge.game.card.CardCollection tapped = new forge.game.card.CardCollection();
            for (int i = 0; i < (needed == null ? 0 : needed); i++) {
                Card next = pickOne(left, "CostTapType", "Tap " + needed + " " + what
                        + " that share a creature type (" + (i + 1) + " of " + needed + ").");
                if (next == null) {
                    return null;
                }
                tapped.add(next);
                left = forge.game.card.CardLists.filter(left, c1 -> c1 != next && c1.sharesCreatureTypeWith(next));
            }
            return PaymentDecision.card(tapped);
        }
        if (needed == null) {
            forge.game.card.CardCollection chosen = new forge.game.card.CardCollection();
            forge.game.card.CardCollection left = new forge.game.card.CardCollection(list);
            while (!left.isEmpty()) {
                Card next = pickOrDone(left, "CostTapType", "Tap any number of " + what + " ("
                        + chosen.size() + " so far) -- or Done.", true);
                if (next == null) {
                    break;
                }
                chosen.add(next);
                left.remove(next);
            }
            return PaymentDecision.card(chosen);
        }
        if (needed > list.size()) {
            return null;
        }
        java.util.List<Card> chosen = pickCards(list, needed, "CostTapType", "Tap " + needed + " " + what + ".");
        return chosen == null ? null : PaymentDecision.card(chosen);
    }

    /**
     * One card, or -- when [done] -- "Done" (null): enough has been chosen.
     * Without [done] a pass cancels, as pickOne's does (null too: the
     * callers tell the two apart by whether enough was chosen).
     */
    private Card pickOrDone(forge.game.card.CardCollectionView cards, String kind, String prompt, boolean done) {
        java.util.LinkedHashMap<String, Card> byId = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        for (Card card : cards) {
            String id = "cost:card:" + card.getId();
            byId.put(id, card);
            labels.put(id, card.getName());
        }
        if (done) {
            labels.put("cost:done", "Done");
        }
        host.offerSubject(ability);
        try {
            String choice = host.gate().ask(
                    actedForSeat, authorisedSeat, kind, new java.util.ArrayList<>(labels.keySet()),
                    false, prompt, pending -> host.publishDecision(pending, labels));
            return DecisionGate.PASS.equals(choice) || "cost:done".equals(choice) ? null : byId.get(choice);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    /**
     * Pay energy — Aether Hub's "{T}, Pay {E}: Add one mana of any
     * colour", Aetherworks Marvel. A port of Forge's human path: if
     * the player has the energy, confirm, and pay. It was a loud stub,
     * so the first time a player tapped Aether Hub for a colour the
     * match ended (found by the P6-AO check).
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostPayEnergy cost) {
        int amount = cost.getAbilityAmount(ability);
        int have = player.getCounters(forge.game.card.CounterEnumType.ENERGY);
        if (player.canPayEnergy(amount)
                && confirm("Pay " + amount + " energy? You have " + have + ".")) {
            return PaymentDecision.number(amount);
        }
        return null;
    }

    /**
     * Pay life — every fetch land, Dismember's Phyrexian cousins
     * outside the mana cost, Toxic Deluge. A port of Forge's human
     * path: a mandatory cost is simply paid; otherwise, if the player
     * can pay it, they confirm.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostPayLife cost) {
        int amount = cost.getAbilityAmount(ability);
        if (ability.getPayCosts() != null && ability.getPayCosts().isMandatory()) {
            return PaymentDecision.number(amount);
        }
        if (player.canPayLife(amount, isEffect(), ability)
                && confirm("Pay " + amount + " life? You have " + player.getLife() + ".")) {
            return PaymentDecision.number(amount);
        }
        return null;
    }

    /**
     * Exactly N cards out of a list Forge built, one question each.
     *
     * One at a time for the same reason every multi-select is
     * (§6.105): each answer is one option the gate can check. A
     * pass at any point cancels the cost, as Forge's own input
     * allows.
     */
    private java.util.List<Card> pickCards(
            forge.game.card.CardCollectionView cards, int needed, String kind, String prompt) {
        forge.game.card.CardCollection left = new forge.game.card.CardCollection(cards);
        java.util.List<Card> chosen = new java.util.ArrayList<>();
        while (chosen.size() < needed) {
            String remaining = needed > 1 ? " (" + (chosen.size() + 1) + " of " + needed + ")" : "";
            Card next = pickOne(left, kind, prompt + remaining);
            if (next == null) {
                return null;
            }
            chosen.add(next);
            left.remove(next);
        }
        return chosen;
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
        // What backing out of this cost undoes (owner 2026-10-22).
        host.offerSubject(ability);
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

    /**
     * "Discard a card" as a cost -- escalate (Collective Brutality),
     * looting, rummaging. A port of Forge's own HumanCostDecision:
     * the card itself; the whole hand (confirmed); the last drawn;
     * at random (Forge's randomness, not the player's); cards with
     * different names; or N of a type, chosen one at a time. Was a
     * loud stub: Collective Brutality's second mode stopped the match.
     * "+WithSameName" still refuses loudly, by name.
     */
    @Override
    public PaymentDecision visit(forge.game.cost.CostDiscard cost) {
        forge.game.card.CardCollectionView hand = player.getCardsIn(forge.game.zone.ZoneType.Hand);
        String type = cost.getType();
        if (cost.payCostFromSource()) {
            return hand.contains(source) ? PaymentDecision.card(source) : null;
        }
        if (type.equals("Hand")) {
            return confirm("Discard your hand (" + hand.size() + " cards)?") ? PaymentDecision.card(hand) : null;
        }
        if (type.equals("LastDrawn")) {
            Card last = player.getLastDrawnCard();
            return hand.contains(last) ? PaymentDecision.card(last) : null;
        }
        int count = cost.getAbilityAmount(ability);
        if (type.equals("Random")) {
            return PaymentDecision.card(new forge.game.card.CardCollection(forge.util.Aggregates.random(hand, count)));
        }
        if (type.contains("+WithSameName")) {
            return loud("CostDiscard+WithSameName");
        }
        if (type.contains("+WithDifferentNames")) {
            forge.game.card.CardCollection chosen = new forge.game.card.CardCollection();
            forge.game.card.CardCollectionView left = hand;
            for (int i = 0; i < count; i++) {
                Card next = pickOne(left, "CostDiscard",
                        "Discard a card with a name not yet discarded (" + (i + 1) + " of " + count + ").");
                if (next == null) {
                    return null;
                }
                chosen.add(next);
                left = forge.game.card.CardLists.filter(left,
                        forge.game.card.CardPredicates.sharesNameWith(next).negate());
            }
            return PaymentDecision.card(chosen);
        }
        forge.game.card.CardCollectionView valid =
                forge.game.card.CardLists.getValidCards(hand, type.split(";"), player, source, ability);
        if (valid.isEmpty()) {
            return null;
        }
        java.util.List<Card> picked = pickCards(valid, count, "CostDiscard",
                "Discard " + count + " " + cost.getDescriptiveType() + " to pay the cost.");
        return picked == null ? null : PaymentDecision.card(picked);
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
