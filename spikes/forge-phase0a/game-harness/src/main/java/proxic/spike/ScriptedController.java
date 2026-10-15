package proxic.spike;

import forge.LobbyPlayer;
import forge.card.mana.ManaCost;
import forge.card.mana.ManaCostShard;
import forge.game.Game;
import forge.game.GameEntity;
import forge.game.card.Card;
import forge.game.card.CardCollection;
import forge.game.card.CardCollectionView;
import forge.game.combat.Combat;
import forge.game.cost.CostDecisionMakerBase;
import forge.game.cost.CostPartMana;
import forge.game.mana.Mana;
import forge.game.mana.ManaConversionMatrix;
import forge.game.mana.ManaCostBeingPaid;
import forge.game.player.DelayedReveal;
import forge.game.player.PlayerActionConfirmMode;
import forge.game.player.PlaySpellAbility;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.trigger.WrappedAbility;
import forge.game.zone.ZoneType;
import forge.util.collect.FCollectionView;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Phase 0A §0A.6 / P0A-B — a Strategy A adapter with scripted answers.
 *
 * This stands in for the human + browser + protocol that Phase 6 will
 * eventually supply. It answers Forge's questions from simple policy
 * rather than from a network, which is exactly what `PHASE_00 §0.20`
 * asks for: prove the architecture can carry the interaction, without
 * building the application.
 *
 * Everything not implemented here inherits GeneratedControllerBase's
 * loud failure, so the set of decisions a real game actually reaches is
 * *measured*, not guessed (AGENTS STUB-001).
 *
 * Policy, deliberately aggressive so a game actually finishes:
 *   - always keep the opening hand
 *   - prefer casting a spell over playing a land, land over passing
 *   - attack with everything legal
 *   - never block
 *   - first legal choice for anything else
 */
public final class ScriptedController extends GeneratedControllerBase {

    private final String tag;
    /** Counts of every decision kind this controller actually answered. */
    public static final LinkedHashMap<String, Integer> ANSWERED = new LinkedHashMap<>();

    public ScriptedController(Game game, Player p, LobbyPlayer lp, String tag) {
        super(game, p, lp);
        this.tag = tag;
    }

    private static final java.util.concurrent.atomic.AtomicInteger DIAG =
            new java.util.concurrent.atomic.AtomicInteger();

    private static void seen(String what) {
        ANSWERED.merge(what, 1, Integer::sum);
    }

    public static void printAnswered() {
        System.out.println();
        System.out.println("=== decisions answered: " + ANSWERED.size() + " kinds ===");
        ANSWERED.forEach((k, v) -> System.out.printf("    %5dx  %s%n", v, k));
    }

    // ---- pregame ---------------------------------------------------

    @Override
    public boolean mulliganKeepHand(Player firstPlayer, int cardsToReturn) {
        seen("mulliganKeepHand");
        return true; // always keep
    }


    @Override
    public Player chooseStartingPlayer(boolean isFirstGame) {
        seen("chooseStartingPlayer");
        return player;
    }

    @Override
    public List<forge.item.PaperCard> sideboard(forge.deck.Deck deck, forge.game.GameType gameType, String message) {
        seen("sideboard");
        return null; // no sideboarding
    }

    // ---- the priority loop -----------------------------------------

    @Override
    public List<SpellAbility> chooseSpellAbilityToPlay() {
        seen("chooseSpellAbilityToPlay");
        int stackDepth = getGame().getStack().size();
        if (stackDepth > MAX_STACK) MAX_STACK = stackDepth;
        int mana = untappedManaSources();

        List<SpellAbility> lands = new ArrayList<>();
        List<SpellAbility> spells = new ArrayList<>();

        for (Card c : player.getCardsIn(ZoneType.Hand)) {
            for (SpellAbility sa : c.getAllPossibleAbilities(player, true)) {
                if (sa.isLandAbility()) {
                    lands.add(sa);
                } else if (sa.isSpell()
                        && sa.getPayCosts().getTotalMana().getCMC() <= mana
                        && !requiresTargetButHasNone(sa)) {
                    spells.add(sa);
                }
            }
        }
        for (Card c : player.getCardsIn(ZoneType.Battlefield)) {
            for (SpellAbility sa : c.getAllPossibleAbilities(player, true)) {
                if (sa.isManaAbility() || !sa.isActivatedAbility()) continue;
                if (sa.getPayCosts().getTotalMana().getCMC() > mana) continue;
                if (requiresTargetButHasNone(sa)) continue;
                spells.add(sa);
            }
        }

        // P0A-C needs a REAL stack interaction, not just "a targeted
        // spell was cast". So when something is already on the stack and
        // we hold an instant-speed answer, respond to it. That is a
        // deliberate scripted policy to reach the branch, not an
        // optimisation -- without it both players simply cast into an
        // empty stack all game and the stack never exceeds depth 1.
        if (stackDepth > 0) {
            for (SpellAbility sa : spells) {
                if (sa.isSpell() && sa.getHostCard() != null
                        && sa.getHostCard().isInstant()) {
                    return List.of(sa);
                }
            }
        }

        // Spell over land over pass, so the run exercises casting rather
        // than dribbling out lands for twenty turns.
        if (!spells.isEmpty()) return List.of(spells.get(0));
        if (!lands.isEmpty()) return List.of(lands.get(0));
        return null; // pass priority
    }

    private int untappedManaSources() {
        int n = 0;
        for (Card c : player.getCardsIn(ZoneType.Battlefield)) {
            if (c.isLand() && !c.isTapped() && !c.getManaAbilities().isEmpty()) n++;
        }
        return n;
    }

    /**
     * canPlay() checks legality, not whether a mandatory target exists.
     * Offering a spell with no legal target made the old project's engine
     * loop forever: the cast fails, priority returns, the same option is
     * offered again.
     */
    private boolean requiresTargetButHasNone(SpellAbility sa) {
        if (!sa.usesTargeting()) return false;
        sa.setActivatingPlayer(player);
        return sa.getTargetRestrictions() != null
                && sa.getTargetRestrictions().getAllCandidates(sa).isEmpty();
    }

    /**
     * Actually perform the action chosen in chooseSpellAbilityToPlay.
     *
     * Leaving this unimplemented is catastrophic rather than loud, and
     * that is a property of Forge, not of this adapter. PhaseHandler's
     * priority loop ends with:
     *
     *     } while (loopCount < 999 || !controller.isAI());
     *
     * The 999-iteration safety valve applies ONLY to AI controllers.
     * For a human controller the condition is permanently true, so a
     * `false` return here makes Forge re-offer the same action forever,
     * at full CPU, with no error and no log line. The old project
     * recorded the same hazard from the other direction: never offer an
     * action that cannot be performed.
     */
    /** Max stack depth observed, and whether anyone ever responded. */
    public static int MAX_STACK = 0;
    public static int CAST_OFF_TURN = 0;
    public static int CAST_ONTO_NONEMPTY_STACK = 0;

    @Override
    public boolean playChosenSpellAbility(SpellAbility chosenSa) {
        seen("playChosenSpellAbility");
        // P0A-C evidence: did a real stack interaction ever happen, or
        // did every spell just resolve into an empty stack? "A targeted
        // spell was cast" is not the same claim as "the opponent
        // responded and the stack resolved in order".
        int depth = getGame().getStack().size();
        if (depth > MAX_STACK) MAX_STACK = depth;
        if (depth > 0 && chosenSa.isSpell()) CAST_ONTO_NONEMPTY_STACK++;
        if (getGame().getPhaseHandler().getPlayerTurn() != player && chosenSa.isSpell()) {
            CAST_OFF_TURN++;
        }
        return PlaySpellAbility.playSpellAbility(this, player, chosenSa);
    }

    @Override
    public SpellAbility getAbilityToPlay(Card hostCard, List<SpellAbility> abilities, forge.util.ITriggerEvent triggerEvent) {
        seen("getAbilityToPlay");
        return abilities.isEmpty() ? null : abilities.get(0);
    }

    @Override
    public void playSpellAbilityNoStack(SpellAbility effectSA, boolean mayChooseNewTargets) {
        seen("playSpellAbilityNoStack");
        PlaySpellAbility.playSpellAbilityNoStack(this, player, effectSA, !mayChooseNewTargets);
    }

    @Override
    public boolean playSaFromPlayEffect(SpellAbility tgtSA) {
        seen("playSaFromPlayEffect");
        return PlaySpellAbility.playSpellAbility(this, player, tgtSA);
    }

    @Override
    public boolean playTrigger(Card host, WrappedAbility wrapperAbility, boolean isMandatory) {
        seen("playTrigger");
        return PlaySpellAbility.playSpellAbility(this, player, wrapperAbility);
    }

    @Override
    public List<SpellAbility> orderSimultaneousSa(List<SpellAbility> activePlayerSAs) {
        seen("orderSimultaneousSa");
        return activePlayerSAs;
    }

    /**
     * Triggers with targets were silently DISCARDED in the old project
     * because setupTargets was never called — the ability went on the
     * stack with no target and fizzled. setupTargets is only reached
     * from the normal casting path, so a trigger has to do it here.
     */
    @Override
    public void orderAndPlaySimultaneousSa(List<SpellAbility> activePlayerSAs) {
        seen("orderAndPlaySimultaneousSa");
        for (SpellAbility sa : activePlayerSAs) {
            if (sa.getActivatingPlayer() == null) sa.setActivatingPlayer(player);
            if (!sa.setupTargets()) {
                System.err.println("[warn] trigger dropped, setupTargets failed: " + sa);
                continue;
            }
            getGame().getStack().add(sa);
        }
    }

    // ---- targeting -------------------------------------------------

    @Override
    public boolean chooseTargetsFor(SpellAbility currentAbility) {
        seen("chooseTargetsFor");
        // Simplest correct behaviour: let Forge's own default targeting
        // choose, by accepting the first legal candidate set.
        forge.game.spellability.TargetRestrictions tgt = currentAbility.getTargetRestrictions();
        if (tgt == null) return true;
        List<GameEntity> candidates = new ArrayList<>(tgt.getAllCandidates(currentAbility));
        if (candidates.isEmpty()) return false;
        currentAbility.resetTargets();
        int want = Math.max(1, tgt.getMinTargets(currentAbility.getHostCard(), currentAbility));
        for (GameEntity e : candidates) {
            if (currentAbility.getTargets().size() >= want) break;
            if (currentAbility.canTarget(e)) currentAbility.getTargets().add(e);
        }
        return currentAbility.getTargets().size() >= want;
    }

    @Override
    public <T extends GameEntity> T chooseSingleEntityForEffect(
            FCollectionView<T> optionList, DelayedReveal delayedReveal, SpellAbility sa,
            String title, boolean isOptional, Player targetedPlayer, Map<String, Object> params) {
        seen("chooseSingleEntityForEffect");
        return optionList.isEmpty() ? null : optionList.get(0);
    }

    // ---- combat ----------------------------------------------------

    @Override
    public void declareAttackers(Player attacker, Combat combat) {
        seen("declareAttackers");
        GameEntity defender = combat.getDefenders().isEmpty() ? null : combat.getDefenders().get(0);
        if (defender == null) return;
        int declared = 0;
        for (Card c : attacker.getCreaturesInPlay()) {
            if (forge.game.combat.CombatUtil.canAttack(c, defender)) {
                combat.addAttacker(c, defender);
                declared++;
            }
        }
        if (declared > 0) seen("declareAttackers:attacked");
    }

    @Override
    public void declareBlockers(Player defender, Combat combat) {
        seen("declareBlockers");
        // never block — combat damage therefore always reaches a player,
        // which is what makes the game end
    }

    @Override
    public Map<Card, Integer> assignCombatDamage(Card attacker, CardCollectionView blockers,
            CardCollectionView remaining, int damageDealt, GameEntity defender, boolean overrideOrder) {
        seen("assignCombatDamage");
        Map<Card, Integer> out = new LinkedHashMap<>();
        int left = damageDealt;
        for (Card b : blockers) {
            if (left <= 0) break;
            int lethal = Math.max(1, b.getLethalDamage());
            int give = Math.min(left, lethal);
            out.put(b, give);
            left -= give;
        }
        if (left > 0 && !blockers.isEmpty()) {
            Card first = blockers.get(0);
            out.merge(first, left, Integer::sum);
        }
        return out;
    }

    @Override
    public CardCollection orderBlockers(Card attacker, CardCollection blockers) {
        seen("orderBlockers");
        return blockers;
    }

    @Override
    public CardCollection orderAttackers(Card blocker, CardCollection attackers) {
        seen("orderAttackers");
        return attackers;
    }

    // ---- payment ---------------------------------------------------

    @Override
    public boolean payManaCost(ManaCost toPay, CostPartMana costPartMana, SpellAbility sa,
            String prompt, ManaConversionMatrix matrix, boolean effect) {
        seen("payManaCost");
        return PlaySpellAbility.payManaCost(this, toPay, costPartMana, sa, player, prompt, matrix, effect);
    }

    /**
     * Tap a land that can actually pay part of what is left.
     *
     * The old project's first version picked any untapped land, which
     * crashed the bridge the moment a deck had two colours: Forge
     * rejected the mana with "addMana() error, mana not needed". The
     * colour check is the fix, and it is why this is not a one-liner.
     */
    /**
     * Tap lands whose mana the remaining cost can actually use.
     *
     * Ported from the old project and RE-VALIDATED here (AGENTS
     * ISO-003), because the obvious implementation does not work and
     * fails in a way that is extremely expensive to diagnose.
     *
     * Two things had to be right:
     *
     * 1. A mana ability must NOT be played through
     *    PlaySpellAbility.playSpellAbility. From inside a payment that
     *    returns false, the cast then fails, and Forge's priority loop
     *    re-offers the identical cast forever (see
     *    playChosenSpellAbility's note on the missing AI-only safety
     *    valve). Measured: 340,251 identical attempts, stuck on turn 3,
     *    zero stubs reached, no error of any kind. Tap and produce
     *    directly instead.
     *
     * 2. Colour must be checked before tapping. The old project tapped
     *    the first untapped land, which was invisible while every deck
     *    was mono-coloured, then killed the bridge the moment a
     *    two-colour deck existed: Forge threw "ManaCost : addMana()
     *    error, mana not needed - R". An unpayable cost must fail
     *    cleanly and let Forge roll the cast back, never tap a land
     *    whose mana is unwanted.
     */
    @Override
    public boolean applyManaToCost(ManaCostBeingPaid toPay, SpellAbility sa, String prompt,
            ManaConversionMatrix matrix, boolean effect) {
        seen("applyManaToCost");
        while (!toPay.isPaid()) {
            Card land = null;
            SpellAbility manaAbility = null;
            for (Card c : player.getCardsIn(ZoneType.Battlefield)) {
                if (!c.isLand() || c.isTapped()) {
                    continue;
                }
                SpellAbility found = findManaAbility(c);
                if (found == null) {
                    continue;
                }
                if (toPay.isAnyPartPayableWith(producedColorMask(found), player.getManaPool())) {
                    land = c;
                    manaAbility = found;
                    break;
                }
            }
            if (land == null) {
                return false; // fail cleanly; do NOT tap something unusable
            }
            manaAbility.setActivatingPlayer(player);
            land.tap(false, manaAbility, player);
            manaAbility.getManaPart().produceMana(manaAbility);
            for (Mana m : manaAbility.getManaPart().getLastManaProduced()) {
                if (toPay.isPaid()) {
                    break;
                }
                // Per mana, not per land: a source producing two mana can
                // have its second one unwanted. Unneeded mana stays
                // floating, which is what the rules say happens.
                if (toPay.isNeeded(m, player.getManaPool())) {
                    toPay.payMana(m, player.getManaPool());
                }
            }
        }
        return true;
    }

    /** A land's plain unconditional mana ability, or null. */
    private static SpellAbility findManaAbility(Card land) {
        for (forge.card.MagicColor.Color c : forge.card.MagicColor.Color.values()) {
            String basicType = c.getBasicLandType();
            if (basicType != null && land.getType().hasSubtype(basicType)) {
                return land.getCurrentState().getLandManaForColor(c);
            }
        }
        for (SpellAbility sa : land.getManaAbilities()) {
            return sa;
        }
        return null;
    }

    /** Which colours a mana ability can produce, as a MagicColor mask. */
    private static byte producedColorMask(SpellAbility manaAbility) {
        String produced = manaAbility.getManaPart() == null
                ? null : manaAbility.getManaPart().getOrigProduced();
        if (produced == null || produced.isEmpty()) {
            return forge.card.MagicColor.ALL_COLORS;
        }
        byte mask = 0;
        for (char c : produced.toCharArray()) {
            switch (c) {
                case 'W': case 'U': case 'B': case 'R': case 'G':
                    mask |= forge.card.MagicColor.fromName(c);
                    break;
                case 'C': case '1': case ' ':
                    break; // colourless/generic contributes no colour
                default:
                    return forge.card.MagicColor.ALL_COLORS; // Any/Combo/unparsed
            }
        }
        return mask;
    }

    @Override
    public forge.game.cost.CostDecisionMakerBase getCostDecisionMaker(
            Player p, SpellAbility ability, boolean effect, String prompt) {
        seen("getCostDecisionMaker");
        return new GeneratedCostDecisionMaker(p, effect, ability, ability.getHostCard());
    }

    @Override
    public Mana chooseManaFromPool(List<Mana> manaChoices) {
        seen("chooseManaFromPool");
        return manaChoices.get(0);
    }


    @Override
    public List<forge.game.spellability.OptionalCostValue> chooseOptionalCosts(
            SpellAbility choosen, List<forge.game.spellability.OptionalCostValue> optionalCostValues) {
        seen("chooseOptionalCosts");
        return new ArrayList<forge.game.spellability.OptionalCostValue>();
    }

    @Override
    public boolean confirmPayment(forge.game.cost.CostPart costPart, String question, SpellAbility sa) {
        seen("confirmPayment");
        return true;
    }

    // ---- confirmations and small choices ---------------------------

    @Override
    public boolean confirmAction(SpellAbility sa, PlayerActionConfirmMode mode, String message,
            List<String> options, Card cardToShow, Map<String, Object> params) {
        seen("confirmAction");
        return true;
    }

    @Override
    public boolean confirmTrigger(WrappedAbility wrapper) {
        seen("confirmTrigger");
        return true;
    }

    @Override
    public boolean confirmStaticApplication(Card hostCard, PlayerActionConfirmMode mode, String message, String logic) {
        seen("confirmStaticApplication");
        return true;
    }

    @Override
    public boolean chooseBinary(SpellAbility sa, String question, BinaryChoiceType kindOfChoice, Boolean defaultVal) {
        seen("chooseBinary");
        return defaultVal != null ? defaultVal : true;
    }

    @Override
    public int chooseNumber(SpellAbility sa, String title, int min, int max) {
        seen("chooseNumber");
        return min;
    }

    @Override
    public forge.game.card.CounterType chooseCounterType(List<forge.game.card.CounterType> options,
            SpellAbility sa, String prompt, Map<String, Object> params) {
        seen("chooseCounterType");
        return options.isEmpty() ? null : options.get(0);
    }

    @Override
    public forge.game.replacement.ReplacementEffect chooseSingleReplacementEffect(
            List<forge.game.replacement.ReplacementEffect> possibleReplacers) {
        seen("chooseSingleReplacementEffect");
        return possibleReplacers.get(0);
    }

    @Override
    public CardCollectionView orderMoveToZoneList(CardCollectionView cards, ZoneType destinationZone, SpellAbility source) {
        seen("orderMoveToZoneList");
        return cards;
    }

    @Override
    public CardCollectionView chooseCardsToDiscardToMaximumHandSize(int numDiscard) {
        seen("chooseCardsToDiscardToMaximumHandSize");
        CardCollection out = new CardCollection();
        CardCollectionView hand = player.getCardsIn(ZoneType.Hand);
        for (int i = 0; i < numDiscard && i < hand.size(); i++) out.add(hand.get(i));
        return out;
    }

    // ---- notifications, no decision --------------------------------

    /**
     * Forge telling us it could not support some cards in a deck. Not a
     * decision, but absolutely not noise either: silently swallowing
     * this is how a deck quietly plays differently from what the player
     * built. Logged loudly on purpose.
     */
    @Override
    public void revealUnsupported(Map<Player, List<forge.item.PaperCard>> unsupported) {
        seen("revealUnsupported");
        if (unsupported == null || unsupported.isEmpty()) return;
        for (Map.Entry<Player, List<forge.item.PaperCard>> e : unsupported.entrySet()) {
            if (e.getValue() == null || e.getValue().isEmpty()) continue;
            System.out.println("[UNSUPPORTED CARDS] " + e.getKey().getName() + ": " + e.getValue());
        }
    }

    @Override
    public void reveal(forge.game.card.CardCollectionView cards, ZoneType zone, Player owner, String message, boolean addSuffix) {
        seen("reveal");
    }

    @Override
    public void reveal(List<forge.game.card.CardView> cards, ZoneType zone, forge.game.player.PlayerView owner, String message, boolean addSuffix) {
        seen("reveal(view)");
    }

    @Override
    public void revealAnte(String message, com.google.common.collect.Multimap<Player, forge.item.PaperCard> removedAnteCards) {
        seen("revealAnte");
    }

    @Override
    public void revealAISkipCards(String message, Map<Player, Map<forge.deck.DeckSection, List<? extends forge.item.PaperCard>>> unplayable) {
        seen("revealAISkipCards");
    }

    @Override
    public void notifyOfValue(SpellAbility sa, forge.game.GameObject realtedTarget, String value) {
        seen("notifyOfValue");
    }

    @Override
    public void autoPassCancel() { /* no-op */ }

    @Override
    public void awaitNextInput() { /* no-op */ }

    @Override
    public void cancelAwaitNextInput() { /* no-op */ }
}
