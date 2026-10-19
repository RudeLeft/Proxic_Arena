package net.barnflix.proxic.worker.game;

import com.google.common.collect.ListMultimap;
import com.google.common.collect.Multimap;
import forge.LobbyPlayer;
import forge.card.ColorSet;
import forge.card.ICardFace;
import forge.card.mana.ManaCost;
import forge.card.mana.ManaCostShard;
import forge.deck.Deck;
import forge.deck.DeckSection;
import forge.game.*;
import forge.game.ability.effects.RollDiceEffect;
import forge.game.card.*;
import forge.game.combat.Combat;
import forge.game.cost.*;
import forge.game.keyword.KeywordInterface;
import forge.game.mana.Mana;
import forge.game.mana.ManaConversionMatrix;
import forge.game.mana.ManaCostBeingPaid;
import forge.game.player.*;
import forge.game.replacement.ReplacementEffect;
import forge.game.spellability.*;
import forge.game.staticability.StaticAbility;
import forge.game.trigger.WrappedAbility;
import forge.game.zone.PlayerZone;
import forge.game.zone.ZoneType;
import forge.item.PaperCard;
import forge.util.ITriggerEvent;
import forge.util.collect.FCollectionView;
import org.apache.commons.lang3.tuple.ImmutablePair;
import org.apache.commons.lang3.tuple.Pair;

import java.util.*;
import java.util.function.Predicate;

/**
 * The Strategy A adapter base — PHASE_06 §6.20, from PHASE_0A §0A.6.
 *
 * PORTED from the Phase 0A spike, not rewritten. §6.20 requires the
 * ACCEPTED Forge architecture, and this is it: the file Phase 0A
 * generated and proved a real game against.
 *
 * ISO-003 asks whether copied code still matches. It does: the pin
 * has not moved (4ec5f1a2, forge-2.0.15), and these signatures were
 * generated from THAT jar by javap rather than transcribed. The
 * build fails loudly if Forge ever disagrees, which is the check
 * that matters more than reading.
 *
 * Phase 0A §0A.6 — GENERATED Strategy A adapter base.
 *
 * Every one of Forge's 109 abstract PlayerController declarations is
 * overridden here with a LOUD failure. Generated from `javap` output
 * against forge-game-2.0.15.jar, so the signatures are authoritative
 * rather than hand-transcribed.
 *
 * Why loud, and why generated:
 *
 * AGENTS STUB-002. Forge catches exceptions in places this project does
 * not control — CountersPutEffect.resolve wraps its chooseCounterType
 * call in try/catch, which in the old project silently disabled every
 * counter in the game while printing one line to stderr. A stub that
 * throws is not enough; it must also announce itself somewhere that
 * survives being swallowed. So `loud()` records the method name in a
 * static registry AND throws.
 *
 * At the end of a run the harness prints every stub that was reached,
 * which turns "a decision we never implemented" from a silent
 * behavioural hole into a visible list.
 *
 * DO NOT hand-edit. Regenerate if the Forge pin moves; the diff is then
 * the decision-surface change.
 */
public abstract class GeneratedControllerBase extends PlayerController {

    /** Stub names reached during this run, in first-touch order. */
    public static final java.util.LinkedHashMap<String, Integer> REACHED_STUBS =
            new java.util.LinkedHashMap<>();

    protected GeneratedControllerBase(Game game, Player p, LobbyPlayer lp) {
        super(game, p, lp);
    }

    /**
     * Record and throw. The record is what survives Forge's own
     * try/catch; the throw is what stops us pretending we answered.
     */
    /**
     * Survey mode (-Dproxic.survey=true) records a reached stub and
     * returns a default INSTEAD of throwing, so one run can enumerate
     * every decision a real game needs rather than one per rebuild.
     *
     * It is a research tool and nothing more. A surveyed run's game
     * result is MEANINGLESS -- returning null/false to the engine is
     * not "answering" -- so the harness refuses to report PASS in this
     * mode. Only the throwing mode can support a P0A-B claim.
     */
    public static final boolean SURVEY = Boolean.getBoolean("proxic.survey");

    /**
     * Told when a stub is reached, so the MATCH can fail even
     * though the throw below may never arrive anywhere.
     *
     * This is not belt-and-braces. STUB-002 above records that
     * Forge catches exceptions in places this project does not
     * control, and a measured run proves it still does: a creature
     * deck reached chooseCounterType twice, threw twice, printed no
     * trace, and finished with a WINNER at turn 13. A game decided
     * partly by a rule that never applied must not be reported as
     * somebody's win, so the host is told directly rather than
     * through an exception whose survival is Forge's choice.
     *
     * Static because a worker process hosts one game at a time, and
     * because `loud` is static -- the 109 generated overrides below
     * call it without an instance.
     */
    private static volatile java.util.function.Consumer<String> watcher = method -> { };

    public static void onStubReached(java.util.function.Consumer<String> sink) {
        watcher = sink;
    }

    /**
     * Fire the same hook for something that is not a method on this
     * class — an unimplemented COST, which fails a match for the
     * same reason and deserves the same announcement.
     */
    static void notifyStubReached(String what) {
        watcher.accept(what);
    }

    protected static void loud(String method) {
        REACHED_STUBS.merge(method, 1, Integer::sum);
        if (SURVEY) {
            return;
        }
        System.err.println("[STUB REACHED] PlayerController." + method);
        // BEFORE the throw, because the throw is the part that can
        // be swallowed.
        watcher.accept(method);
        throw new UnsupportedOperationException(
                "Phase 0A adapter does not implement " + method);
    }

    public static void printReachedStubs() {
        System.out.println();
        System.out.println("=== stubs reached this run: " + REACHED_STUBS.size() + " ===");
        REACHED_STUBS.forEach((k, v) -> System.out.println("    " + v + "x  " + k));
    }

    @Override
    public forge.game.spellability.SpellAbility getAbilityToPlay(forge.game.card.Card a0, java.util.List<forge.game.spellability.SpellAbility> a1, forge.util.ITriggerEvent a2) {
        loud("getAbilityToPlay");
        return null;
    }

    @Override
    public void playSpellAbilityNoStack(forge.game.spellability.SpellAbility a0, boolean a1) {
        loud("playSpellAbilityNoStack");
    }

    @Override
    public java.util.List<forge.game.spellability.SpellAbility> orderSimultaneousSa(java.util.List<forge.game.spellability.SpellAbility> a0) {
        loud("orderSimultaneousSa");
        return null;
    }

    @Override
    public void orderAndPlaySimultaneousSa(java.util.List<forge.game.spellability.SpellAbility> a0) {
        loud("orderAndPlaySimultaneousSa");
    }

    @Override
    public boolean playTrigger(forge.game.card.Card a0, forge.game.trigger.WrappedAbility a1, boolean a2) {
        loud("playTrigger");
        return false;
    }

    @Override
    public boolean playSaFromPlayEffect(forge.game.spellability.SpellAbility a0) {
        loud("playSaFromPlayEffect");
        return false;
    }

    @Override
    public java.util.List<forge.item.PaperCard> sideboard(forge.deck.Deck a0, forge.game.GameType a1, java.lang.String a2) {
        loud("sideboard");
        return null;
    }

    @Override
    public java.util.List<forge.item.PaperCard> chooseCardsYouWonToAddToDeck(java.util.List<forge.item.PaperCard> a0) {
        loud("chooseCardsYouWonToAddToDeck");
        return null;
    }

    @Override
    public java.util.Map<forge.game.card.Card, java.lang.Integer> assignCombatDamage(forge.game.card.Card a0, forge.game.card.CardCollectionView a1, forge.game.card.CardCollectionView a2, int a3, forge.game.GameEntity a4, boolean a5) {
        loud("assignCombatDamage");
        return null;
    }

    @Override
    public java.util.Map<forge.game.GameEntity, java.lang.Integer> divideShield(forge.game.card.Card a0, java.util.Map<forge.game.GameEntity, java.lang.Integer> a1, int a2) {
        loud("divideShield");
        return null;
    }

    @Override
    public java.util.Map<java.lang.Byte, java.lang.Integer> specifyManaCombo(forge.game.spellability.SpellAbility a0, forge.card.ColorSet a1, int a2, boolean a3) {
        loud("specifyManaCombo");
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView choosePermanentsToSacrifice(forge.game.spellability.SpellAbility a0, int a1, int a2, forge.game.card.CardCollectionView a3, java.lang.String a4) {
        loud("choosePermanentsToSacrifice");
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView choosePermanentsToDestroy(forge.game.spellability.SpellAbility a0, int a1, int a2, forge.game.card.CardCollectionView a3, java.lang.String a4) {
        loud("choosePermanentsToDestroy");
        return null;
    }

    @Override
    public java.lang.Integer announceRequirements(forge.game.spellability.SpellAbility a0, int a1, int a2, java.lang.String a3) {
        loud("announceRequirements");
        return null;
    }

    @Override
    public forge.game.spellability.TargetChoices chooseNewTargetsFor(forge.game.spellability.SpellAbility a0, java.util.function.Predicate<forge.game.GameObject> a1, boolean a2) {
        loud("chooseNewTargetsFor");
        return null;
    }

    @Override
    public boolean chooseTargetsFor(forge.game.spellability.SpellAbility a0) {
        loud("chooseTargetsFor");
        return false;
    }

    @Override
    public org.apache.commons.lang3.tuple.Pair<forge.game.spellability.SpellAbilityStackInstance, forge.game.GameObject> chooseTarget(forge.game.spellability.SpellAbility a0, java.util.List<org.apache.commons.lang3.tuple.Pair<forge.game.spellability.SpellAbilityStackInstance, forge.game.GameObject>> a1) {
        loud("chooseTarget");
        return null;
    }

    @Override
    public boolean helpPayForAssistSpell(forge.game.mana.ManaCostBeingPaid a0, forge.game.spellability.SpellAbility a1, int a2, int a3) {
        loud("helpPayForAssistSpell");
        return false;
    }

    @Override
    public forge.game.player.Player choosePlayerToAssistPayment(forge.util.collect.FCollectionView<forge.game.player.Player> a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, int a3) {
        loud("choosePlayerToAssistPayment");
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView chooseCardsForEffect(forge.game.card.CardCollectionView a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, int a3, int a4, boolean a5, java.util.Map<java.lang.String, java.lang.Object> a6) {
        loud("chooseCardsForEffect");
        return null;
    }

    @Override
    public forge.game.card.CardCollection chooseCardsForEffectMultiple(java.util.Map<java.lang.String, forge.game.card.CardCollection> a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, boolean a3) {
        loud("chooseCardsForEffectMultiple");
        return null;
    }

    @Override
    public <T extends forge.game.GameEntity> T chooseSingleEntityForEffect(forge.util.collect.FCollectionView<T> a0, forge.game.player.DelayedReveal a1, forge.game.spellability.SpellAbility a2, java.lang.String a3, boolean a4, forge.game.player.Player a5, java.util.Map<java.lang.String, java.lang.Object> a6) {
        loud("chooseSingleEntityForEffect");
        return null;
    }

    @Override
    public <T extends forge.game.GameEntity> java.util.List<T> chooseEntitiesForEffect(forge.util.collect.FCollectionView<T> a0, int a1, int a2, forge.game.player.DelayedReveal a3, forge.game.spellability.SpellAbility a4, java.lang.String a5, forge.game.player.Player a6, java.util.Map<java.lang.String, java.lang.Object> a7) {
        loud("chooseEntitiesForEffect");
        return null;
    }

    @Override
    public java.util.List<forge.game.spellability.SpellAbility> chooseSpellAbilitiesForEffect(java.util.List<forge.game.spellability.SpellAbility> a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, int a3, java.util.Map<java.lang.String, java.lang.Object> a4) {
        loud("chooseSpellAbilitiesForEffect");
        return null;
    }

    @Override
    public forge.game.spellability.SpellAbility chooseSingleSpellForEffect(java.util.List<forge.game.spellability.SpellAbility> a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, java.util.Map<java.lang.String, java.lang.Object> a3) {
        loud("chooseSingleSpellForEffect");
        return null;
    }

    @Override
    public boolean confirmAction(forge.game.spellability.SpellAbility a0, forge.game.player.PlayerActionConfirmMode a1, java.lang.String a2, java.util.List<java.lang.String> a3, forge.game.card.Card a4, java.util.Map<java.lang.String, java.lang.Object> a5) {
        loud("confirmAction");
        return false;
    }

    @Override
    public boolean confirmBidAction(forge.game.spellability.SpellAbility a0, forge.game.player.PlayerActionConfirmMode a1, java.lang.String a2, int a3, forge.game.player.Player a4) {
        loud("confirmBidAction");
        return false;
    }

    @Override
    public boolean confirmReplacementEffect(forge.game.replacement.ReplacementEffect a0, forge.game.spellability.SpellAbility a1, forge.game.GameEntity a2, java.lang.String a3) {
        loud("confirmReplacementEffect");
        return false;
    }

    @Override
    public boolean confirmStaticApplication(forge.game.card.Card a0, forge.game.player.PlayerActionConfirmMode a1, java.lang.String a2, java.lang.String a3) {
        loud("confirmStaticApplication");
        return false;
    }

    @Override
    public boolean confirmTrigger(forge.game.trigger.WrappedAbility a0) {
        loud("confirmTrigger");
        return false;
    }

    @Override
    public java.util.List<forge.game.card.Card> exertAttackers(java.util.List<forge.game.card.Card> a0) {
        loud("exertAttackers");
        return null;
    }

    @Override
    public java.util.List<forge.game.card.Card> enlistAttackers(java.util.List<forge.game.card.Card> a0) {
        loud("enlistAttackers");
        return null;
    }

    @Override
    public void declareAttackers(forge.game.player.Player a0, forge.game.combat.Combat a1) {
        loud("declareAttackers");
    }

    @Override
    public void declareBlockers(forge.game.player.Player a0, forge.game.combat.Combat a1) {
        loud("declareBlockers");
    }

    @Override
    public forge.game.card.CardCollection orderBlockers(forge.game.card.Card a0, forge.game.card.CardCollection a1) {
        loud("orderBlockers");
        return null;
    }

    @Override
    public forge.game.card.CardCollection orderBlocker(forge.game.card.Card a0, forge.game.card.Card a1, forge.game.card.CardCollection a2) {
        loud("orderBlocker");
        return null;
    }

    @Override
    public forge.game.card.CardCollection orderAttackers(forge.game.card.Card a0, forge.game.card.CardCollection a1) {
        loud("orderAttackers");
        return null;
    }

    @Override
    public void reveal(forge.game.card.CardCollectionView a0, forge.game.zone.ZoneType a1, forge.game.player.Player a2, java.lang.String a3, boolean a4) {
        loud("reveal");
    }

    @Override
    public void reveal(java.util.List<forge.game.card.CardView> a0, forge.game.zone.ZoneType a1, forge.game.player.PlayerView a2, java.lang.String a3, boolean a4) {
        loud("reveal");
    }

    @Override
    public void notifyOfValue(forge.game.spellability.SpellAbility a0, forge.game.GameObject a1, java.lang.String a2) {
        loud("notifyOfValue");
    }

    @Override
    public org.apache.commons.lang3.tuple.ImmutablePair<forge.game.card.CardCollection, forge.game.card.CardCollection> arrangeForScry(forge.game.card.CardCollection a0) {
        loud("arrangeForScry");
        return null;
    }

    @Override
    public org.apache.commons.lang3.tuple.ImmutablePair<forge.game.card.CardCollection, forge.game.card.CardCollection> arrangeForSurveil(forge.game.card.CardCollection a0) {
        loud("arrangeForSurveil");
        return null;
    }

    @Override
    public boolean willPutCardOnTop(forge.game.card.Card a0) {
        loud("willPutCardOnTop");
        return false;
    }

    @Override
    public forge.game.card.CardCollectionView orderMoveToZoneList(forge.game.card.CardCollectionView a0, forge.game.zone.ZoneType a1, forge.game.spellability.SpellAbility a2) {
        loud("orderMoveToZoneList");
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView chooseCardsToDiscardFrom(forge.game.player.Player a0, forge.game.spellability.SpellAbility a1, forge.game.card.CardCollection a2, int a3, int a4, forge.game.card.CardCollectionView a5) {
        loud("chooseCardsToDiscardFrom");
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView chooseCardsToDiscardUnlessType(int a0, forge.game.card.CardCollectionView a1, java.lang.String[] a2, forge.game.spellability.SpellAbility a3) {
        loud("chooseCardsToDiscardUnlessType");
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView chooseCardsToDiscardToMaximumHandSize(int a0) {
        loud("chooseCardsToDiscardToMaximumHandSize");
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView chooseCardsToDelve(int a0, forge.game.card.CardCollection a1) {
        loud("chooseCardsToDelve");
        return null;
    }

    @Override
    public java.util.Map<forge.game.card.Card, forge.card.mana.ManaCostShard> chooseCardsForConvokeOrImprovise(forge.game.spellability.SpellAbility a0, forge.card.mana.ManaCost a1, forge.game.card.CardCollectionView a2, boolean a3, boolean a4, java.lang.Integer a5) {
        loud("chooseCardsForConvokeOrImprovise");
        return null;
    }

    @Override
    public java.util.List<forge.game.card.Card> chooseCardsForSplice(forge.game.spellability.SpellAbility a0, java.util.List<forge.game.card.Card> a1) {
        loud("chooseCardsForSplice");
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView chooseCardsToRevealFromHand(int a0, int a1, forge.game.card.CardCollectionView a2) {
        loud("chooseCardsToRevealFromHand");
        return null;
    }

    @Override
    public java.util.List<forge.game.spellability.SpellAbility> chooseSaToActivateFromOpeningHand(java.util.List<forge.game.spellability.SpellAbility> a0) {
        loud("chooseSaToActivateFromOpeningHand");
        return null;
    }

    @Override
    public forge.game.player.Player chooseStartingPlayer(boolean a0) {
        loud("chooseStartingPlayer");
        return null;
    }

    @Override
    public forge.game.zone.PlayerZone chooseStartingHand(java.util.List<forge.game.zone.PlayerZone> a0) {
        loud("chooseStartingHand");
        return null;
    }

    @Override
    public forge.game.mana.Mana chooseManaFromPool(java.util.List<forge.game.mana.Mana> a0) {
        loud("chooseManaFromPool");
        return null;
    }

    @Override
    public java.lang.String chooseSomeType(java.lang.String a0, forge.game.spellability.SpellAbility a1, java.util.Collection<java.lang.String> a2, boolean a3) {
        loud("chooseSomeType");
        return null;
    }

    @Override
    public java.lang.String chooseSector(forge.game.card.Card a0, java.lang.String a1, java.util.List<java.lang.String> a2) {
        loud("chooseSector");
        return null;
    }

    @Override
    public java.util.List<forge.game.card.Card> chooseContraptionsToCrank(java.util.List<forge.game.card.Card> a0) {
        loud("chooseContraptionsToCrank");
        return null;
    }

    @Override
    public int chooseSprocket(forge.game.card.Card a0, java.util.List<java.lang.Integer> a1) {
        loud("chooseSprocket");
        return 0;
    }

    @Override
    public forge.game.PlanarDice choosePDRollToIgnore(java.util.List<forge.game.PlanarDice> a0) {
        loud("choosePDRollToIgnore");
        return null;
    }

    @Override
    public java.lang.Integer chooseRollToIgnore(java.util.List<java.lang.Integer> a0) {
        loud("chooseRollToIgnore");
        return null;
    }

    @Override
    public java.util.List<java.lang.Integer> chooseDiceToReroll(java.util.List<java.lang.Integer> a0) {
        loud("chooseDiceToReroll");
        return null;
    }

    @Override
    public java.lang.Integer chooseRollToModify(java.util.List<java.lang.Integer> a0) {
        loud("chooseRollToModify");
        return null;
    }

    @Override
    public forge.game.ability.effects.RollDiceEffect.DieRollResult chooseRollToSwap(java.util.List<forge.game.ability.effects.RollDiceEffect.DieRollResult> a0) {
        loud("chooseRollToSwap");
        return null;
    }

    @Override
    public java.lang.String chooseRollSwapValue(java.util.List<java.lang.String> a0, java.lang.Integer a1, int a2, int a3) {
        loud("chooseRollSwapValue");
        return null;
    }

    @Override
    public java.lang.Object vote(forge.game.spellability.SpellAbility a0, java.lang.String a1, java.util.List<java.lang.Object> a2, com.google.common.collect.ListMultimap<java.lang.Object, forge.game.player.Player> a3, forge.game.player.Player a4, boolean a5) {
        loud("vote");
        return null;
    }

    @Override
    public boolean mulliganKeepHand(forge.game.player.Player a0, int a1) {
        loud("mulliganKeepHand");
        return false;
    }

    @Override
    public forge.game.card.CardCollectionView tuckCardsViaMulligan(forge.game.card.CardCollectionView a0, int a1) {
        loud("tuckCardsViaMulligan");
        return null;
    }

    @Override
    public java.util.List<forge.game.spellability.SpellAbility> chooseSpellAbilityToPlay() {
        loud("chooseSpellAbilityToPlay");
        return null;
    }

    @Override
    public boolean playChosenSpellAbility(forge.game.spellability.SpellAbility a0) {
        loud("playChosenSpellAbility");
        return false;
    }

    @Override
    public java.util.List<forge.game.spellability.AbilitySub> chooseModeForAbility(forge.game.spellability.SpellAbility a0, java.util.List<forge.game.spellability.AbilitySub> a1, int a2, int a3, boolean a4) {
        loud("chooseModeForAbility");
        return null;
    }

    @Override
    public int chooseNumberForCostReduction(forge.game.spellability.SpellAbility a0, int a1, int a2) {
        loud("chooseNumberForCostReduction");
        return 0;
    }

    @Override
    public int chooseNumberForKeywordCost(forge.game.spellability.SpellAbility a0, forge.game.cost.Cost a1, forge.game.keyword.KeywordInterface a2, java.lang.String a3, int a4) {
        loud("chooseNumberForKeywordCost");
        return 0;
    }

    @Override
    public int chooseNumber(forge.game.spellability.SpellAbility a0, java.lang.String a1, int a2, int a3) {
        loud("chooseNumber");
        return 0;
    }

    @Override
    public int chooseNumber(forge.game.spellability.SpellAbility a0, java.lang.String a1, java.util.List<java.lang.Integer> a2, forge.game.player.Player a3) {
        loud("chooseNumber");
        return 0;
    }

    @Override
    public boolean chooseBinary(forge.game.spellability.SpellAbility a0, java.lang.String a1, forge.game.player.PlayerController.BinaryChoiceType a2, java.lang.Boolean a3) {
        loud("chooseBinary");
        return false;
    }

    @Override
    public boolean chooseFlipResult(forge.game.spellability.SpellAbility a0, forge.game.player.Player a1, boolean a2) {
        loud("chooseFlipResult");
        return false;
    }

    @Override
    public byte chooseColor(java.lang.String a0, forge.game.spellability.SpellAbility a1, forge.card.ColorSet a2) {
        loud("chooseColor");
        return 0;
    }

    @Override
    public byte chooseColorAllowColorless(java.lang.String a0, forge.game.card.Card a1, forge.card.ColorSet a2) {
        loud("chooseColorAllowColorless");
        return 0;
    }

    @Override
    public forge.card.ColorSet chooseColors(java.lang.String a0, forge.game.spellability.SpellAbility a1, int a2, int a3, forge.card.ColorSet a4) {
        loud("chooseColors");
        return null;
    }

    @Override
    public forge.card.ICardFace chooseSingleCardFace(forge.game.spellability.SpellAbility a0, java.lang.String a1, java.util.function.Predicate<forge.card.ICardFace> a2, java.lang.String a3) {
        loud("chooseSingleCardFace");
        return null;
    }

    @Override
    public forge.card.ICardFace chooseSingleCardFace(forge.game.spellability.SpellAbility a0, java.util.List<forge.card.ICardFace> a1, java.lang.String a2) {
        loud("chooseSingleCardFace");
        return null;
    }

    @Override
    public forge.game.card.CardState chooseSingleCardState(forge.game.spellability.SpellAbility a0, java.util.List<forge.game.card.CardState> a1, java.lang.String a2, java.util.Map<java.lang.String, java.lang.Object> a3) {
        loud("chooseSingleCardState");
        return null;
    }

    @Override
    public boolean chooseCardsPile(forge.game.spellability.SpellAbility a0, forge.game.card.CardCollectionView a1, forge.game.card.CardCollectionView a2, java.lang.String a3) {
        loud("chooseCardsPile");
        return false;
    }

    @Override
    public forge.game.card.CounterType chooseCounterType(java.util.List<forge.game.card.CounterType> a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, java.util.Map<java.lang.String, java.lang.Object> a3) {
        loud("chooseCounterType");
        return null;
    }

    @Override
    public java.lang.String chooseKeywordForPump(java.util.List<java.lang.String> a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, forge.game.card.Card a3) {
        loud("chooseKeywordForPump");
        return null;
    }

    @Override
    public boolean confirmPayment(forge.game.cost.CostPart a0, java.lang.String a1, forge.game.spellability.SpellAbility a2) {
        loud("confirmPayment");
        return false;
    }

    @Override
    public forge.game.replacement.ReplacementEffect chooseSingleReplacementEffect(java.util.List<forge.game.replacement.ReplacementEffect> a0) {
        loud("chooseSingleReplacementEffect");
        return null;
    }

    @Override
    public forge.game.staticability.StaticAbility chooseSingleStaticAbility(java.util.List<forge.game.staticability.StaticAbility> a0) {
        loud("chooseSingleStaticAbility");
        return null;
    }

    @Override
    public java.lang.String chooseProtectionType(forge.game.spellability.SpellAbility a0, java.util.List<java.lang.String> a1) {
        loud("chooseProtectionType");
        return null;
    }

    @Override
    public void revealAnte(java.lang.String a0, com.google.common.collect.Multimap<forge.game.player.Player, forge.item.PaperCard> a1) {
        loud("revealAnte");
    }

    @Override
    public void revealAISkipCards(java.lang.String a0, java.util.Map<forge.game.player.Player, java.util.Map<forge.deck.DeckSection, java.util.List<? extends forge.item.PaperCard>>> a1) {
        loud("revealAISkipCards");
    }

    @Override
    public void revealUnsupported(java.util.Map<forge.game.player.Player, java.util.List<forge.item.PaperCard>> a0) {
        loud("revealUnsupported");
    }

    @Override
    public java.util.List<forge.game.spellability.OptionalCostValue> chooseOptionalCosts(forge.game.spellability.SpellAbility a0, java.util.List<forge.game.spellability.OptionalCostValue> a1) {
        loud("chooseOptionalCosts");
        return null;
    }

    @Override
    public java.util.List<forge.game.cost.CostPart> orderCosts(java.util.List<forge.game.cost.CostPart> a0) {
        loud("orderCosts");
        return null;
    }

    @Override
    public boolean payCostToPreventEffect(forge.game.cost.Cost a0, forge.game.spellability.SpellAbility a1, boolean a2, forge.util.collect.FCollectionView<forge.game.player.Player> a3) {
        loud("payCostToPreventEffect");
        return false;
    }

    @Override
    public boolean payCostDuringRoll(forge.game.cost.Cost a0, forge.game.spellability.SpellAbility a1) {
        loud("payCostDuringRoll");
        return false;
    }

    @Override
    public boolean payCombatCost(forge.game.card.Card a0, forge.game.cost.Cost a1, forge.game.spellability.SpellAbility a2, java.lang.String a3) {
        loud("payCombatCost");
        return false;
    }

    @Override
    public boolean payManaCost(forge.card.mana.ManaCost a0, forge.game.cost.CostPartMana a1, forge.game.spellability.SpellAbility a2, java.lang.String a3, forge.game.mana.ManaConversionMatrix a4, boolean a5) {
        loud("payManaCost");
        return false;
    }

    @Override
    public boolean applyManaToCost(forge.game.mana.ManaCostBeingPaid a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, forge.game.mana.ManaConversionMatrix a3, boolean a4) {
        loud("applyManaToCost");
        return false;
    }

    @Override
    public forge.game.card.CardCollectionView chooseCardsForCost(forge.game.card.CardCollectionView a0, forge.game.spellability.SpellAbility a1, forge.game.cost.CostPartWithList a2, int a3, boolean a4, java.lang.String a5) {
        loud("chooseCardsForCost");
        return null;
    }

    @Override
    public forge.game.cost.CostDecisionMakerBase getCostDecisionMaker(forge.game.player.Player a0, forge.game.spellability.SpellAbility a1, boolean a2, java.lang.String a3) {
        loud("getCostDecisionMaker");
        return null;
    }

    @Override
    public java.lang.String chooseCardName(forge.game.spellability.SpellAbility a0, java.util.function.Predicate<forge.card.ICardFace> a1, java.lang.String a2, java.lang.String a3) {
        loud("chooseCardName");
        return null;
    }

    @Override
    public java.lang.String chooseCardName(forge.game.spellability.SpellAbility a0, java.util.List<forge.card.ICardFace> a1, java.lang.String a2) {
        loud("chooseCardName");
        return null;
    }

    @Override
    public forge.game.card.Card chooseSingleCardForZoneChange(forge.game.zone.ZoneType a0, java.util.List<forge.game.zone.ZoneType> a1, forge.game.spellability.SpellAbility a2, forge.game.card.CardCollection a3, forge.game.player.DelayedReveal a4, java.lang.String a5, boolean a6, forge.game.player.Player a7) {
        loud("chooseSingleCardForZoneChange");
        return null;
    }

    @Override
    public java.util.List<forge.game.card.Card> chooseCardsForZoneChange(forge.game.zone.ZoneType a0, java.util.List<forge.game.zone.ZoneType> a1, forge.game.spellability.SpellAbility a2, forge.game.card.CardCollection a3, int a4, int a5, forge.game.player.DelayedReveal a6, java.lang.String a7, forge.game.player.Player a8) {
        loud("chooseCardsForZoneChange");
        return null;
    }

    @Override
    public void autoPassCancel() {
        loud("autoPassCancel");
    }

    @Override
    public void awaitNextInput() {
        loud("awaitNextInput");
    }

    @Override
    public void cancelAwaitNextInput() {
        loud("cancelAwaitNextInput");
    }
}
