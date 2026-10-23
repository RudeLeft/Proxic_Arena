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
 * the decision-surface change. Each stub passes its own arguments to
 * `loud` (PHASE_08 P8-G, 2026-10-23), so a regeneration keeps that.
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

    protected static void loud(String method, Object... arguments) {
        REACHED_STUBS.merge(method, 1, Integer::sum);
        if (SURVEY) {
            return;
        }
        String asked = method + about(arguments);
        System.err.println("[STUB REACHED] PlayerController." + asked);
        // BEFORE the throw, because the throw is the part that can
        // be swallowed.
        watcher.accept(asked);
        throw new UnsupportedOperationException(
                "Phase 0A adapter does not implement " + asked);
    }

    /**
     * The card a question is about, from the question's own arguments --
     * PHASE_08 P8-G, "names the card that asked".
     *
     * The stack alone is not enough: a question asked as a creature
     * enters (Space Beleren's sectors) comes after its spell has left
     * the stack, and the stop said only "chooseSector -- turn 8". A
     * single Card, or the card behind a SpellAbility, is named; a
     * collection never is (a library search would list a library). A
     * card the opponent could not see -- face down, or in a hand or
     * library -- is "a hidden card": this text reaches the server log
     * and the admin's match record, and no further, but it still tells
     * nobody what they could not have seen at the table.
     */
    static String about(Object... arguments) {
        java.util.LinkedHashSet<String> cards = new java.util.LinkedHashSet<>();
        for (Object argument : arguments) {
            forge.game.card.Card card = argument instanceof forge.game.card.Card c ? c
                    : argument instanceof forge.game.spellability.SpellAbility sa ? sa.getHostCard()
                    : null;
            if (card != null) {
                cards.add(publicName(card));
            }
        }
        return cards.isEmpty() ? "" : ", about " + String.join(" and ", cards);
    }

    private static String publicName(forge.game.card.Card card) {
        forge.game.zone.Zone zone = card.getZone();
        boolean hidden = card.isFaceDown() || zone == null || zone.getZoneType().isHidden();
        return hidden ? "a hidden card" : card.getName();
    }

    public static void printReachedStubs() {
        System.out.println();
        System.out.println("=== stubs reached this run: " + REACHED_STUBS.size() + " ===");
        REACHED_STUBS.forEach((k, v) -> System.out.println("    " + v + "x  " + k));
    }

    @Override
    public forge.game.spellability.SpellAbility getAbilityToPlay(forge.game.card.Card a0, java.util.List<forge.game.spellability.SpellAbility> a1, forge.util.ITriggerEvent a2) {
        loud("getAbilityToPlay", a0, a1, a2);
        return null;
    }

    @Override
    public void playSpellAbilityNoStack(forge.game.spellability.SpellAbility a0, boolean a1) {
        loud("playSpellAbilityNoStack", a0, a1);
    }

    @Override
    public java.util.List<forge.game.spellability.SpellAbility> orderSimultaneousSa(java.util.List<forge.game.spellability.SpellAbility> a0) {
        loud("orderSimultaneousSa", a0);
        return null;
    }

    @Override
    public void orderAndPlaySimultaneousSa(java.util.List<forge.game.spellability.SpellAbility> a0) {
        loud("orderAndPlaySimultaneousSa", a0);
    }

    @Override
    public boolean playTrigger(forge.game.card.Card a0, forge.game.trigger.WrappedAbility a1, boolean a2) {
        loud("playTrigger", a0, a1, a2);
        return false;
    }

    @Override
    public boolean playSaFromPlayEffect(forge.game.spellability.SpellAbility a0) {
        loud("playSaFromPlayEffect", a0);
        return false;
    }

    @Override
    public java.util.List<forge.item.PaperCard> sideboard(forge.deck.Deck a0, forge.game.GameType a1, java.lang.String a2) {
        loud("sideboard", a0, a1, a2);
        return null;
    }

    @Override
    public java.util.List<forge.item.PaperCard> chooseCardsYouWonToAddToDeck(java.util.List<forge.item.PaperCard> a0) {
        loud("chooseCardsYouWonToAddToDeck", a0);
        return null;
    }

    @Override
    public java.util.Map<forge.game.card.Card, java.lang.Integer> assignCombatDamage(forge.game.card.Card a0, forge.game.card.CardCollectionView a1, forge.game.card.CardCollectionView a2, int a3, forge.game.GameEntity a4, boolean a5) {
        loud("assignCombatDamage", a0, a1, a2, a3, a4, a5);
        return null;
    }

    @Override
    public java.util.Map<forge.game.GameEntity, java.lang.Integer> divideShield(forge.game.card.Card a0, java.util.Map<forge.game.GameEntity, java.lang.Integer> a1, int a2) {
        loud("divideShield", a0, a1, a2);
        return null;
    }

    @Override
    public java.util.Map<java.lang.Byte, java.lang.Integer> specifyManaCombo(forge.game.spellability.SpellAbility a0, forge.card.ColorSet a1, int a2, boolean a3) {
        loud("specifyManaCombo", a0, a1, a2, a3);
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView choosePermanentsToSacrifice(forge.game.spellability.SpellAbility a0, int a1, int a2, forge.game.card.CardCollectionView a3, java.lang.String a4) {
        loud("choosePermanentsToSacrifice", a0, a1, a2, a3, a4);
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView choosePermanentsToDestroy(forge.game.spellability.SpellAbility a0, int a1, int a2, forge.game.card.CardCollectionView a3, java.lang.String a4) {
        loud("choosePermanentsToDestroy", a0, a1, a2, a3, a4);
        return null;
    }

    @Override
    public java.lang.Integer announceRequirements(forge.game.spellability.SpellAbility a0, int a1, int a2, java.lang.String a3) {
        loud("announceRequirements", a0, a1, a2, a3);
        return null;
    }

    @Override
    public forge.game.spellability.TargetChoices chooseNewTargetsFor(forge.game.spellability.SpellAbility a0, java.util.function.Predicate<forge.game.GameObject> a1, boolean a2) {
        loud("chooseNewTargetsFor", a0, a1, a2);
        return null;
    }

    @Override
    public boolean chooseTargetsFor(forge.game.spellability.SpellAbility a0) {
        loud("chooseTargetsFor", a0);
        return false;
    }

    @Override
    public org.apache.commons.lang3.tuple.Pair<forge.game.spellability.SpellAbilityStackInstance, forge.game.GameObject> chooseTarget(forge.game.spellability.SpellAbility a0, java.util.List<org.apache.commons.lang3.tuple.Pair<forge.game.spellability.SpellAbilityStackInstance, forge.game.GameObject>> a1) {
        loud("chooseTarget", a0, a1);
        return null;
    }

    @Override
    public boolean helpPayForAssistSpell(forge.game.mana.ManaCostBeingPaid a0, forge.game.spellability.SpellAbility a1, int a2, int a3) {
        loud("helpPayForAssistSpell", a0, a1, a2, a3);
        return false;
    }

    @Override
    public forge.game.player.Player choosePlayerToAssistPayment(forge.util.collect.FCollectionView<forge.game.player.Player> a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, int a3) {
        loud("choosePlayerToAssistPayment", a0, a1, a2, a3);
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView chooseCardsForEffect(forge.game.card.CardCollectionView a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, int a3, int a4, boolean a5, java.util.Map<java.lang.String, java.lang.Object> a6) {
        loud("chooseCardsForEffect", a0, a1, a2, a3, a4, a5, a6);
        return null;
    }

    @Override
    public forge.game.card.CardCollection chooseCardsForEffectMultiple(java.util.Map<java.lang.String, forge.game.card.CardCollection> a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, boolean a3) {
        loud("chooseCardsForEffectMultiple", a0, a1, a2, a3);
        return null;
    }

    @Override
    public <T extends forge.game.GameEntity> T chooseSingleEntityForEffect(forge.util.collect.FCollectionView<T> a0, forge.game.player.DelayedReveal a1, forge.game.spellability.SpellAbility a2, java.lang.String a3, boolean a4, forge.game.player.Player a5, java.util.Map<java.lang.String, java.lang.Object> a6) {
        loud("chooseSingleEntityForEffect", a0, a1, a2, a3, a4, a5, a6);
        return null;
    }

    @Override
    public <T extends forge.game.GameEntity> java.util.List<T> chooseEntitiesForEffect(forge.util.collect.FCollectionView<T> a0, int a1, int a2, forge.game.player.DelayedReveal a3, forge.game.spellability.SpellAbility a4, java.lang.String a5, forge.game.player.Player a6, java.util.Map<java.lang.String, java.lang.Object> a7) {
        loud("chooseEntitiesForEffect", a0, a1, a2, a3, a4, a5, a6, a7);
        return null;
    }

    @Override
    public java.util.List<forge.game.spellability.SpellAbility> chooseSpellAbilitiesForEffect(java.util.List<forge.game.spellability.SpellAbility> a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, int a3, java.util.Map<java.lang.String, java.lang.Object> a4) {
        loud("chooseSpellAbilitiesForEffect", a0, a1, a2, a3, a4);
        return null;
    }

    @Override
    public forge.game.spellability.SpellAbility chooseSingleSpellForEffect(java.util.List<forge.game.spellability.SpellAbility> a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, java.util.Map<java.lang.String, java.lang.Object> a3) {
        loud("chooseSingleSpellForEffect", a0, a1, a2, a3);
        return null;
    }

    @Override
    public boolean confirmAction(forge.game.spellability.SpellAbility a0, forge.game.player.PlayerActionConfirmMode a1, java.lang.String a2, java.util.List<java.lang.String> a3, forge.game.card.Card a4, java.util.Map<java.lang.String, java.lang.Object> a5) {
        loud("confirmAction", a0, a1, a2, a3, a4, a5);
        return false;
    }

    @Override
    public boolean confirmBidAction(forge.game.spellability.SpellAbility a0, forge.game.player.PlayerActionConfirmMode a1, java.lang.String a2, int a3, forge.game.player.Player a4) {
        loud("confirmBidAction", a0, a1, a2, a3, a4);
        return false;
    }

    @Override
    public boolean confirmReplacementEffect(forge.game.replacement.ReplacementEffect a0, forge.game.spellability.SpellAbility a1, forge.game.GameEntity a2, java.lang.String a3) {
        loud("confirmReplacementEffect", a0, a1, a2, a3);
        return false;
    }

    @Override
    public boolean confirmStaticApplication(forge.game.card.Card a0, forge.game.player.PlayerActionConfirmMode a1, java.lang.String a2, java.lang.String a3) {
        loud("confirmStaticApplication", a0, a1, a2, a3);
        return false;
    }

    @Override
    public boolean confirmTrigger(forge.game.trigger.WrappedAbility a0) {
        loud("confirmTrigger", a0);
        return false;
    }

    @Override
    public java.util.List<forge.game.card.Card> exertAttackers(java.util.List<forge.game.card.Card> a0) {
        loud("exertAttackers", a0);
        return null;
    }

    @Override
    public java.util.List<forge.game.card.Card> enlistAttackers(java.util.List<forge.game.card.Card> a0) {
        loud("enlistAttackers", a0);
        return null;
    }

    @Override
    public void declareAttackers(forge.game.player.Player a0, forge.game.combat.Combat a1) {
        loud("declareAttackers", a0, a1);
    }

    @Override
    public void declareBlockers(forge.game.player.Player a0, forge.game.combat.Combat a1) {
        loud("declareBlockers", a0, a1);
    }

    @Override
    public forge.game.card.CardCollection orderBlockers(forge.game.card.Card a0, forge.game.card.CardCollection a1) {
        loud("orderBlockers", a0, a1);
        return null;
    }

    @Override
    public forge.game.card.CardCollection orderBlocker(forge.game.card.Card a0, forge.game.card.Card a1, forge.game.card.CardCollection a2) {
        loud("orderBlocker", a0, a1, a2);
        return null;
    }

    @Override
    public forge.game.card.CardCollection orderAttackers(forge.game.card.Card a0, forge.game.card.CardCollection a1) {
        loud("orderAttackers", a0, a1);
        return null;
    }

    @Override
    public void reveal(forge.game.card.CardCollectionView a0, forge.game.zone.ZoneType a1, forge.game.player.Player a2, java.lang.String a3, boolean a4) {
        loud("reveal", a0, a1, a2, a3, a4);
    }

    @Override
    public void reveal(java.util.List<forge.game.card.CardView> a0, forge.game.zone.ZoneType a1, forge.game.player.PlayerView a2, java.lang.String a3, boolean a4) {
        loud("reveal", a0, a1, a2, a3, a4);
    }

    @Override
    public void notifyOfValue(forge.game.spellability.SpellAbility a0, forge.game.GameObject a1, java.lang.String a2) {
        loud("notifyOfValue", a0, a1, a2);
    }

    @Override
    public org.apache.commons.lang3.tuple.ImmutablePair<forge.game.card.CardCollection, forge.game.card.CardCollection> arrangeForScry(forge.game.card.CardCollection a0) {
        loud("arrangeForScry", a0);
        return null;
    }

    @Override
    public org.apache.commons.lang3.tuple.ImmutablePair<forge.game.card.CardCollection, forge.game.card.CardCollection> arrangeForSurveil(forge.game.card.CardCollection a0) {
        loud("arrangeForSurveil", a0);
        return null;
    }

    @Override
    public boolean willPutCardOnTop(forge.game.card.Card a0) {
        loud("willPutCardOnTop", a0);
        return false;
    }

    @Override
    public forge.game.card.CardCollectionView orderMoveToZoneList(forge.game.card.CardCollectionView a0, forge.game.zone.ZoneType a1, forge.game.spellability.SpellAbility a2) {
        loud("orderMoveToZoneList", a0, a1, a2);
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView chooseCardsToDiscardFrom(forge.game.player.Player a0, forge.game.spellability.SpellAbility a1, forge.game.card.CardCollection a2, int a3, int a4, forge.game.card.CardCollectionView a5) {
        loud("chooseCardsToDiscardFrom", a0, a1, a2, a3, a4, a5);
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView chooseCardsToDiscardUnlessType(int a0, forge.game.card.CardCollectionView a1, java.lang.String[] a2, forge.game.spellability.SpellAbility a3) {
        loud("chooseCardsToDiscardUnlessType", a0, a1, a2, a3);
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView chooseCardsToDiscardToMaximumHandSize(int a0) {
        loud("chooseCardsToDiscardToMaximumHandSize", a0);
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView chooseCardsToDelve(int a0, forge.game.card.CardCollection a1) {
        loud("chooseCardsToDelve", a0, a1);
        return null;
    }

    @Override
    public java.util.Map<forge.game.card.Card, forge.card.mana.ManaCostShard> chooseCardsForConvokeOrImprovise(forge.game.spellability.SpellAbility a0, forge.card.mana.ManaCost a1, forge.game.card.CardCollectionView a2, boolean a3, boolean a4, java.lang.Integer a5) {
        loud("chooseCardsForConvokeOrImprovise", a0, a1, a2, a3, a4, a5);
        return null;
    }

    @Override
    public java.util.List<forge.game.card.Card> chooseCardsForSplice(forge.game.spellability.SpellAbility a0, java.util.List<forge.game.card.Card> a1) {
        loud("chooseCardsForSplice", a0, a1);
        return null;
    }

    @Override
    public forge.game.card.CardCollectionView chooseCardsToRevealFromHand(int a0, int a1, forge.game.card.CardCollectionView a2) {
        loud("chooseCardsToRevealFromHand", a0, a1, a2);
        return null;
    }

    @Override
    public java.util.List<forge.game.spellability.SpellAbility> chooseSaToActivateFromOpeningHand(java.util.List<forge.game.spellability.SpellAbility> a0) {
        loud("chooseSaToActivateFromOpeningHand", a0);
        return null;
    }

    @Override
    public forge.game.player.Player chooseStartingPlayer(boolean a0) {
        loud("chooseStartingPlayer", a0);
        return null;
    }

    @Override
    public forge.game.zone.PlayerZone chooseStartingHand(java.util.List<forge.game.zone.PlayerZone> a0) {
        loud("chooseStartingHand", a0);
        return null;
    }

    @Override
    public forge.game.mana.Mana chooseManaFromPool(java.util.List<forge.game.mana.Mana> a0) {
        loud("chooseManaFromPool", a0);
        return null;
    }

    @Override
    public java.lang.String chooseSomeType(java.lang.String a0, forge.game.spellability.SpellAbility a1, java.util.Collection<java.lang.String> a2, boolean a3) {
        loud("chooseSomeType", a0, a1, a2, a3);
        return null;
    }

    @Override
    public java.lang.String chooseSector(forge.game.card.Card a0, java.lang.String a1, java.util.List<java.lang.String> a2) {
        loud("chooseSector", a0, a1, a2);
        return null;
    }

    @Override
    public java.util.List<forge.game.card.Card> chooseContraptionsToCrank(java.util.List<forge.game.card.Card> a0) {
        loud("chooseContraptionsToCrank", a0);
        return null;
    }

    @Override
    public int chooseSprocket(forge.game.card.Card a0, java.util.List<java.lang.Integer> a1) {
        loud("chooseSprocket", a0, a1);
        return 0;
    }

    @Override
    public forge.game.PlanarDice choosePDRollToIgnore(java.util.List<forge.game.PlanarDice> a0) {
        loud("choosePDRollToIgnore", a0);
        return null;
    }

    @Override
    public java.lang.Integer chooseRollToIgnore(java.util.List<java.lang.Integer> a0) {
        loud("chooseRollToIgnore", a0);
        return null;
    }

    @Override
    public java.util.List<java.lang.Integer> chooseDiceToReroll(java.util.List<java.lang.Integer> a0) {
        loud("chooseDiceToReroll", a0);
        return null;
    }

    @Override
    public java.lang.Integer chooseRollToModify(java.util.List<java.lang.Integer> a0) {
        loud("chooseRollToModify", a0);
        return null;
    }

    @Override
    public forge.game.ability.effects.RollDiceEffect.DieRollResult chooseRollToSwap(java.util.List<forge.game.ability.effects.RollDiceEffect.DieRollResult> a0) {
        loud("chooseRollToSwap", a0);
        return null;
    }

    @Override
    public java.lang.String chooseRollSwapValue(java.util.List<java.lang.String> a0, java.lang.Integer a1, int a2, int a3) {
        loud("chooseRollSwapValue", a0, a1, a2, a3);
        return null;
    }

    @Override
    public java.lang.Object vote(forge.game.spellability.SpellAbility a0, java.lang.String a1, java.util.List<java.lang.Object> a2, com.google.common.collect.ListMultimap<java.lang.Object, forge.game.player.Player> a3, forge.game.player.Player a4, boolean a5) {
        loud("vote", a0, a1, a2, a3, a4, a5);
        return null;
    }

    @Override
    public boolean mulliganKeepHand(forge.game.player.Player a0, int a1) {
        loud("mulliganKeepHand", a0, a1);
        return false;
    }

    @Override
    public forge.game.card.CardCollectionView tuckCardsViaMulligan(forge.game.card.CardCollectionView a0, int a1) {
        loud("tuckCardsViaMulligan", a0, a1);
        return null;
    }

    @Override
    public java.util.List<forge.game.spellability.SpellAbility> chooseSpellAbilityToPlay() {
        loud("chooseSpellAbilityToPlay");
        return null;
    }

    @Override
    public boolean playChosenSpellAbility(forge.game.spellability.SpellAbility a0) {
        loud("playChosenSpellAbility", a0);
        return false;
    }

    @Override
    public java.util.List<forge.game.spellability.AbilitySub> chooseModeForAbility(forge.game.spellability.SpellAbility a0, java.util.List<forge.game.spellability.AbilitySub> a1, int a2, int a3, boolean a4) {
        loud("chooseModeForAbility", a0, a1, a2, a3, a4);
        return null;
    }

    @Override
    public int chooseNumberForCostReduction(forge.game.spellability.SpellAbility a0, int a1, int a2) {
        loud("chooseNumberForCostReduction", a0, a1, a2);
        return 0;
    }

    @Override
    public int chooseNumberForKeywordCost(forge.game.spellability.SpellAbility a0, forge.game.cost.Cost a1, forge.game.keyword.KeywordInterface a2, java.lang.String a3, int a4) {
        loud("chooseNumberForKeywordCost", a0, a1, a2, a3, a4);
        return 0;
    }

    @Override
    public int chooseNumber(forge.game.spellability.SpellAbility a0, java.lang.String a1, int a2, int a3) {
        loud("chooseNumber", a0, a1, a2, a3);
        return 0;
    }

    @Override
    public int chooseNumber(forge.game.spellability.SpellAbility a0, java.lang.String a1, java.util.List<java.lang.Integer> a2, forge.game.player.Player a3) {
        loud("chooseNumber", a0, a1, a2, a3);
        return 0;
    }

    @Override
    public boolean chooseBinary(forge.game.spellability.SpellAbility a0, java.lang.String a1, forge.game.player.PlayerController.BinaryChoiceType a2, java.lang.Boolean a3) {
        loud("chooseBinary", a0, a1, a2, a3);
        return false;
    }

    @Override
    public boolean chooseFlipResult(forge.game.spellability.SpellAbility a0, forge.game.player.Player a1, boolean a2) {
        loud("chooseFlipResult", a0, a1, a2);
        return false;
    }

    @Override
    public byte chooseColor(java.lang.String a0, forge.game.spellability.SpellAbility a1, forge.card.ColorSet a2) {
        loud("chooseColor", a0, a1, a2);
        return 0;
    }

    @Override
    public byte chooseColorAllowColorless(java.lang.String a0, forge.game.card.Card a1, forge.card.ColorSet a2) {
        loud("chooseColorAllowColorless", a0, a1, a2);
        return 0;
    }

    @Override
    public forge.card.ColorSet chooseColors(java.lang.String a0, forge.game.spellability.SpellAbility a1, int a2, int a3, forge.card.ColorSet a4) {
        loud("chooseColors", a0, a1, a2, a3, a4);
        return null;
    }

    @Override
    public forge.card.ICardFace chooseSingleCardFace(forge.game.spellability.SpellAbility a0, java.lang.String a1, java.util.function.Predicate<forge.card.ICardFace> a2, java.lang.String a3) {
        loud("chooseSingleCardFace", a0, a1, a2, a3);
        return null;
    }

    @Override
    public forge.card.ICardFace chooseSingleCardFace(forge.game.spellability.SpellAbility a0, java.util.List<forge.card.ICardFace> a1, java.lang.String a2) {
        loud("chooseSingleCardFace", a0, a1, a2);
        return null;
    }

    @Override
    public forge.game.card.CardState chooseSingleCardState(forge.game.spellability.SpellAbility a0, java.util.List<forge.game.card.CardState> a1, java.lang.String a2, java.util.Map<java.lang.String, java.lang.Object> a3) {
        loud("chooseSingleCardState", a0, a1, a2, a3);
        return null;
    }

    @Override
    public boolean chooseCardsPile(forge.game.spellability.SpellAbility a0, forge.game.card.CardCollectionView a1, forge.game.card.CardCollectionView a2, java.lang.String a3) {
        loud("chooseCardsPile", a0, a1, a2, a3);
        return false;
    }

    @Override
    public forge.game.card.CounterType chooseCounterType(java.util.List<forge.game.card.CounterType> a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, java.util.Map<java.lang.String, java.lang.Object> a3) {
        loud("chooseCounterType", a0, a1, a2, a3);
        return null;
    }

    @Override
    public java.lang.String chooseKeywordForPump(java.util.List<java.lang.String> a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, forge.game.card.Card a3) {
        loud("chooseKeywordForPump", a0, a1, a2, a3);
        return null;
    }

    @Override
    public boolean confirmPayment(forge.game.cost.CostPart a0, java.lang.String a1, forge.game.spellability.SpellAbility a2) {
        loud("confirmPayment", a0, a1, a2);
        return false;
    }

    @Override
    public forge.game.replacement.ReplacementEffect chooseSingleReplacementEffect(java.util.List<forge.game.replacement.ReplacementEffect> a0) {
        loud("chooseSingleReplacementEffect", a0);
        return null;
    }

    @Override
    public forge.game.staticability.StaticAbility chooseSingleStaticAbility(java.util.List<forge.game.staticability.StaticAbility> a0) {
        loud("chooseSingleStaticAbility", a0);
        return null;
    }

    @Override
    public java.lang.String chooseProtectionType(forge.game.spellability.SpellAbility a0, java.util.List<java.lang.String> a1) {
        loud("chooseProtectionType", a0, a1);
        return null;
    }

    @Override
    public void revealAnte(java.lang.String a0, com.google.common.collect.Multimap<forge.game.player.Player, forge.item.PaperCard> a1) {
        loud("revealAnte", a0, a1);
    }

    @Override
    public void revealAISkipCards(java.lang.String a0, java.util.Map<forge.game.player.Player, java.util.Map<forge.deck.DeckSection, java.util.List<? extends forge.item.PaperCard>>> a1) {
        loud("revealAISkipCards", a0, a1);
    }

    @Override
    public void revealUnsupported(java.util.Map<forge.game.player.Player, java.util.List<forge.item.PaperCard>> a0) {
        loud("revealUnsupported", a0);
    }

    @Override
    public java.util.List<forge.game.spellability.OptionalCostValue> chooseOptionalCosts(forge.game.spellability.SpellAbility a0, java.util.List<forge.game.spellability.OptionalCostValue> a1) {
        loud("chooseOptionalCosts", a0, a1);
        return null;
    }

    @Override
    public java.util.List<forge.game.cost.CostPart> orderCosts(java.util.List<forge.game.cost.CostPart> a0) {
        loud("orderCosts", a0);
        return null;
    }

    @Override
    public boolean payCostToPreventEffect(forge.game.cost.Cost a0, forge.game.spellability.SpellAbility a1, boolean a2, forge.util.collect.FCollectionView<forge.game.player.Player> a3) {
        loud("payCostToPreventEffect", a0, a1, a2, a3);
        return false;
    }

    @Override
    public boolean payCostDuringRoll(forge.game.cost.Cost a0, forge.game.spellability.SpellAbility a1) {
        loud("payCostDuringRoll", a0, a1);
        return false;
    }

    @Override
    public boolean payCombatCost(forge.game.card.Card a0, forge.game.cost.Cost a1, forge.game.spellability.SpellAbility a2, java.lang.String a3) {
        loud("payCombatCost", a0, a1, a2, a3);
        return false;
    }

    @Override
    public boolean payManaCost(forge.card.mana.ManaCost a0, forge.game.cost.CostPartMana a1, forge.game.spellability.SpellAbility a2, java.lang.String a3, forge.game.mana.ManaConversionMatrix a4, boolean a5) {
        loud("payManaCost", a0, a1, a2, a3, a4, a5);
        return false;
    }

    @Override
    public boolean applyManaToCost(forge.game.mana.ManaCostBeingPaid a0, forge.game.spellability.SpellAbility a1, java.lang.String a2, forge.game.mana.ManaConversionMatrix a3, boolean a4) {
        loud("applyManaToCost", a0, a1, a2, a3, a4);
        return false;
    }

    @Override
    public forge.game.card.CardCollectionView chooseCardsForCost(forge.game.card.CardCollectionView a0, forge.game.spellability.SpellAbility a1, forge.game.cost.CostPartWithList a2, int a3, boolean a4, java.lang.String a5) {
        loud("chooseCardsForCost", a0, a1, a2, a3, a4, a5);
        return null;
    }

    @Override
    public forge.game.cost.CostDecisionMakerBase getCostDecisionMaker(forge.game.player.Player a0, forge.game.spellability.SpellAbility a1, boolean a2, java.lang.String a3) {
        loud("getCostDecisionMaker", a0, a1, a2, a3);
        return null;
    }

    @Override
    public java.lang.String chooseCardName(forge.game.spellability.SpellAbility a0, java.util.function.Predicate<forge.card.ICardFace> a1, java.lang.String a2, java.lang.String a3) {
        loud("chooseCardName", a0, a1, a2, a3);
        return null;
    }

    @Override
    public java.lang.String chooseCardName(forge.game.spellability.SpellAbility a0, java.util.List<forge.card.ICardFace> a1, java.lang.String a2) {
        loud("chooseCardName", a0, a1, a2);
        return null;
    }

    @Override
    public forge.game.card.Card chooseSingleCardForZoneChange(forge.game.zone.ZoneType a0, java.util.List<forge.game.zone.ZoneType> a1, forge.game.spellability.SpellAbility a2, forge.game.card.CardCollection a3, forge.game.player.DelayedReveal a4, java.lang.String a5, boolean a6, forge.game.player.Player a7) {
        loud("chooseSingleCardForZoneChange", a0, a1, a2, a3, a4, a5, a6, a7);
        return null;
    }

    @Override
    public java.util.List<forge.game.card.Card> chooseCardsForZoneChange(forge.game.zone.ZoneType a0, java.util.List<forge.game.zone.ZoneType> a1, forge.game.spellability.SpellAbility a2, forge.game.card.CardCollection a3, int a4, int a5, forge.game.player.DelayedReveal a6, java.lang.String a7, forge.game.player.Player a8) {
        loud("chooseCardsForZoneChange", a0, a1, a2, a3, a4, a5, a6, a7, a8);
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
