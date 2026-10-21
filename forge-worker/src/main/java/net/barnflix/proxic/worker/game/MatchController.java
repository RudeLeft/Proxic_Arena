package net.barnflix.proxic.worker.game;

import forge.LobbyPlayer;
import forge.game.Game;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * One seat's decisions — PHASE_06 §6.20, §6.105.
 *
 * THIS SLICE ANSWERS THE START AND NOTHING ELSE. The job here is
 * LAUNCHING → RUNNING: get a real Forge game constructed, started,
 * and as far as its first priority window, which is §6.17's
 * "Forge is alive and authoritative; gameplay input may occur".
 *
 * Routing decisions to a browser is the next slice. Until it
 * exists, both seats pass priority, which means a real game of
 * Magic is played to a real Forge-reported conclusion with nobody
 * doing anything — the players deck out. That is a weak game and a
 * strong proof: Forge ran it, Forge ended it, and Forge said who
 * lost (§6.149).
 *
 * EVERYTHING ELSE INHERITS THE LOUD FAILURE from the generated
 * base, and that is the design rather than an omission. §6.105
 * requires an unsupported required decision to be visible; a
 * controller that guessed would produce a game that looks fine and
 * is subtly not Magic, which is the class of defect the old
 * project shipped.
 */
public final class MatchController extends GeneratedControllerBase {
    /**
     * Far more than a real game needs, far less than forever.
     *
     * §6.191 measured ~240 priority windows in a twelve-turn game.
     * A deck-out game is ~60 turns, so a few thousand is generous;
     * 50,000 means something is wrong rather than long.
     */
    private static final int MAX_PRIORITY_WINDOWS = 50_000;

    private final GameHost host;
    private final AtomicInteger priorityWindows = new AtomicInteger();

    /** §6.189 — what was tried at the current state and achieved nothing. */
    private final java.util.Set<String> declined = new java.util.HashSet<>();

    private String lastSignature = "";
    private String lastOffered;

    /** §6.38 — the Forge player this controller decides for. */
    private final int actedForSeat;

    /** §6.38 — the seat whose human is allowed to answer. */
    private final int authorisedSeat;

    public MatchController(Game game, Player player, LobbyPlayer lobbyPlayer, GameHost host,
                           int actedForSeat, int authorisedSeat) {
        super(game, player, lobbyPlayer);
        this.host = host;
        this.actedForSeat = actedForSeat;
        this.authorisedSeat = authorisedSeat;
    }

    // ---- pregame ------------------------------------------------------

    /**
     * Keep this hand, or mulligan — §6.105, FORGE-RULE.
     *
     * The first decision of every game, and it used to answer
     * itself: this method returned `true` unconditionally, so both
     * players kept whatever they were dealt and neither was ever
     * asked. A one-land hand was kept. A seven-land hand was kept.
     *
     * It is worth saying how that survived so long. The survey
     * measures decisions the adapter does NOT implement, because
     * an unimplemented one records itself and throws. A method
     * implemented as "return a sensible default" is invisible to
     * it — nothing throws, nothing is recorded, and the run looks
     * clean. The Phase 6 acceptance audit found this by reading,
     * not by measuring.
     *
     * Keeping is the answer when nobody can be asked, because a
     * mulligan taken on a player's behalf cannot be given back.
     */
    @Override
    public boolean mulliganKeepHand(Player firstPlayer, int alreadyPutBack) {
        // BOTH ARGUMENTS ARE MISLEADINGLY NAMED IN FORGE, and the
        // call site in MulliganService settles it:
        //
        //   mulliganKeepHand(firstPlayer, mulligan.tuckCardsDuringMulligan())
        //
        // The first is whoever goes FIRST, not whoever is
        // mulliganing. The second is how many cards were already
        // put back to produce the hand being looked at -- London
        // tucks during the redraw (LondonMulligan.mulliganDraw),
        // not on keep. An earlier version of this label read
        // "Keep, and put 1 card back" and had it backwards.
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        labels.put("mulligan:keep", "Keep this hand");
        labels.put("mulligan:again", "Mulligan");

        try {
            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            "mulliganKeepHand",
                            new java.util.ArrayList<>(labels.keySet()),
                            // Mandatory: there is no third answer.
                            true,
                            "Keep this hand of "
                                    + player.getCardsIn(forge.game.zone.ZoneType.Hand).size()
                                    + ", or mulligan?",
                            pending -> host.publishDecision(pending, labels));
            return !"mulligan:again".equals(choice);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return true;
        }
    }

    /**
     * Which cards go back — the London mulligan.
     *
     * You draw seven however many times you mulligan, and put that
     * many back. WHICH ones is the whole of the modern mulligan,
     * and this was a loud stub: asking the question above without
     * implementing this would have turned "always keeps" into
     * "fails the match the moment anybody mulligans".
     *
     * One at a time, like every other several-of-something in this
     * adapter.
     */
    @Override
    public forge.game.card.CardCollectionView tuckCardsViaMulligan(
            forge.game.card.CardCollectionView hand, int cardsToReturn) {
        forge.game.card.CardCollection back = new forge.game.card.CardCollection();
        if (hand == null || cardsToReturn <= 0) {
            return back;
        }
        java.util.List<forge.game.card.Card> remaining = new java.util.ArrayList<>();
        hand.forEach(remaining::add);

        while (back.size() < cardsToReturn && !remaining.isEmpty()) {
            java.util.LinkedHashMap<String, forge.game.card.Card> byId =
                    new java.util.LinkedHashMap<>();
            java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
            for (forge.game.card.Card card : remaining) {
                // §6.46 — typed, like every other object id.
                String id = "tuck:card:" + card.getId();
                byId.put(id, card);
                labels.put(id, card.getName());
            }

            forge.game.card.Card picked;
            try {
                String choice =
                        host.gate().ask(
                                actedForSeat,
                                authorisedSeat,
                                "tuckCardsViaMulligan",
                                new java.util.ArrayList<>(byId.keySet()),
                                true,
                                "Choose a card to put back ("
                                        + (cardsToReturn - back.size()) + " to go).",
                                pending -> host.publishDecision(pending, labels));
                picked = byId.get(choice);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                picked = null;
            }

            if (picked == null) {
                // Mandatory and unanswerable. The hand has to end
                // up the right size or the game cannot continue,
                // so the first remaining card goes back.
                picked = remaining.get(0);
            }
            remaining.remove(picked);
            back.add(picked);
        }
        return back;
    }

    /**
     * Begin the game with it on the battlefield — §6.68, P6-AC.
     *
     * Leyline of the Void, Gemstone Caverns, Chancellor of the
     * Annex: "if this is in your opening hand, you MAY...". Forge
     * gathers every such effect in the hand and asks the player which
     * to use AND IN WHAT ORDER (rule 103.5); then it performs them
     * itself, without the stack -- the card is not cast.
     *
     * A port of Forge's human path, asked one card at a time as every
     * multi-pick here is: each question offers the cards not yet
     * chosen, and a pass means "no more". Choosing none is a legal
     * answer to a "may", so the first question can be passed too.
     *
     * This was a loud stub, so any deck with a Leyline stopped the
     * match before turn one.
     */
    @Override
    public java.util.List<SpellAbility> chooseSaToActivateFromOpeningHand(
            java.util.List<SpellAbility> usable) {
        java.util.List<SpellAbility> chosen = new java.util.ArrayList<>();
        java.util.List<SpellAbility> remaining = new java.util.ArrayList<>(usable);
        while (!remaining.isEmpty()) {
            java.util.LinkedHashMap<String, SpellAbility> byId = new java.util.LinkedHashMap<>();
            java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
            for (SpellAbility sa : remaining) {
                // §6.46 — typed. One effect per card, as Forge's own
                // chooser assumes (it maps each card to its first).
                String id = "opening:card:" + sa.getHostCard().getId();
                if (byId.containsKey(id)) {
                    continue;
                }
                byId.put(id, sa);
                labels.put(id, sa.getHostCard().getName() + " — "
                        + forge.util.TextUtil.fastReplace(
                                String.valueOf(sa.getDescription()), "CARDNAME", sa.getHostCard().getName()));
            }
            String prompt = chosen.isEmpty()
                    ? "Begin the game with any of these on the battlefield? Choose them in the order they happen."
                    : "Any more? " + chosen.size() + " chosen so far.";
            String choice;
            try {
                choice = host.gate().ask(
                        actedForSeat, authorisedSeat, "chooseSaToActivateFromOpeningHand",
                        new java.util.ArrayList<>(byId.keySet()), false, prompt,
                        pending -> host.publishDecision(pending, labels));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
            SpellAbility picked = byId.get(choice);
            if (picked == null) {
                break;
            }
            chosen.add(picked);
            remaining.removeIf(sa -> sa.getHostCard() == picked.getHostCard());
        }
        return chosen;
    }

    /**
     * Play first, or draw first — §6.105, FORGE-RULE.
     *
     * Won the die roll, and the choice that follows it is a real
     * one: on the play you are a turn ahead, on the draw you are a
     * card ahead. This returned `player` unconditionally, so every
     * game in this project so far has been on the play for
     * whoever Forge asked, without anybody choosing it.
     *
     * Two seats is the Open Format case and gets the question
     * Forge's own client asks — play or draw. More than two is
     * representable (FMT-005) and gets the general one: which
     * player starts.
     */
    @Override
    public Player chooseStartingPlayer(boolean isFirstGame) {
        java.util.List<Player> players = new java.util.ArrayList<>();
        player.getGame().getPlayersInTurnOrder().forEach(players::add);
        if (players.size() <= 1) {
            return player;
        }

        String why = isFirstGame
                ? "You won the die roll."
                : "You lost the last game.";

        if (players.size() == 2) {
            Player opponent = player.getOpponents().get(0);
            java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
            labels.put("start:play", "Play first");
            labels.put("start:draw", "Draw first");
            try {
                String choice =
                        host.gate().ask(
                                actedForSeat,
                                authorisedSeat,
                                "chooseStartingPlayer",
                                new java.util.ArrayList<>(labels.keySet()),
                                true,
                                why + " Play first, or draw first?",
                                pending -> host.publishDecision(pending, labels));
                return "start:draw".equals(choice) ? opponent : player;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return player;
            }
        }

        java.util.LinkedHashMap<String, Player> byId = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        for (Player candidate : players) {
            String id = "start:player:" + candidate.getId();
            byId.put(id, candidate);
            labels.put(id, String.valueOf(candidate));
        }
        try {
            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            "chooseStartingPlayer",
                            new java.util.ArrayList<>(byId.keySet()),
                            true,
                            why + " Who starts this game?",
                            pending -> host.publishDecision(pending, labels));
            Player chosen = byId.get(choice);
            return chosen == null ? player : chosen;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return player;
        }
    }

    @Override
    public List<forge.item.PaperCard> sideboard(
            forge.deck.Deck deck, forge.game.GameType gameType, String message) {
        // Open Format has no sideboard (FMT-002), so there is
        // nothing to choose even when Forge offers.
        return null;
    }

    // ---- the priority loop ---------------------------------------------

    /**
     * §7.61 B8 -- can [payer] pay for [sa] right now? FORGE's check: its
     * mana solver (ComputerUtilMana, in forge-ai, the module added for
     * this alone -- owner decision 2026-10-21) in test mode, which taps
     * nothing, and forge-game's own check of every other cost part
     * (sacrifice, discard, life, tapping). A land play or a mana ability
     * costs nothing to offer. A check that throws on some unusual card
     * reports payable: hiding a playable option would be a wrong move,
     * dimming one is only a hint.
     */
    static boolean payable(SpellAbility sa, Player payer) {
        if (sa.isLandAbility() || sa.isManaAbility()) {
            return true;
        }
        try {
            return forge.ai.ComputerUtilMana.canPayManaCost(sa, payer, 0, false)
                    && forge.game.cost.CostPayment.canPayAdditionalCosts(sa.getPayCosts(), sa, false, payer);
        } catch (RuntimeException e) {
            System.err.println("proxic: payment check failed for " + sa + ": " + e);
            return true;
        }
    }

    @Override
    public List<SpellAbility> chooseSpellAbilityToPlay() {
        // THE RUNNING MILESTONE. Reaching this means the game is
        // constructed, started, past mulligans and asking a player
        // what they want to do — which is as alive as a game gets.
        //
        // Signalled on the FIRST window only. §6.191 measured ~240
        // of these in a twelve-turn game, so anything done here
        // unconditionally is done 240 times.
        if (priorityWindows.incrementAndGet() == 1) {
            host.markRunning();
        }
        // §6.189 — THE WORKER'S OWN LOOP GUARD.
        //
        // Phase 0A added that section because Forge's safety valve
        // is AI-only: PhaseHandler's priority loop ends with
        //
        //     } while (loopCount < 999 || !controller.isAI());
        //
        // so for a non-AI controller the condition is permanently
        // true. A controller that never makes progress spins at
        // full CPU with no error and no log line. This match had
        // exactly that, for four minutes, stuck on turn 1.
        if (priorityWindows.get() > MAX_PRIORITY_WINDOWS) {
            host.failRunaway(
                    player.getName() + " was offered priority "
                            + priorityWindows.get() + " times; the game is not progressing");
            throw new IllegalStateException("priority loop guard tripped");
        }

        // §6.189 — AND NOT THE ONES THAT JUST FAILED.
        //
        // "The adapter must never offer an action it cannot
        // perform, and never fail to perform one it offered."
        // That cannot be done by screening for affordability:
        // Forge has no such test outside its AI --
        // CostPartMana.canPay returns true unconditionally, with
        // the comment "this should probably be checked at some
        // point" -- and writing one here would mean deciding what
        // a board can pay, which is §6.50's second rules engine
        // and would hide legal plays the moment anything reduces
        // a cost.
        //
        // So this learns from Forge instead. If the player chose
        // something and the game did not move, that action did
        // not work HERE AND NOW, and is not offered again until
        // something changes. Nothing about the rules is assumed;
        // the only claim is "we tried it and nothing happened".
        //
        // Measured: without this, a Staggershock offered on turn
        // one with no lands was chosen, targeted and cancelled
        // 50,000 times -- Forge's own loop guard is AI-only, so
        // it re-offered for ever. The counters named it exactly
        // as §6.189 predicted: chooseSpellAbilityToPlay=50000
        // against chooseTargetsFor=50000, with mana payment never
        // reached at all.
        String signature = stateSignature();
        if (!signature.equals(lastSignature)) {
            lastSignature = signature;
            declined.clear();
        } else if (lastOffered != null) {
            declined.add(lastOffered);
            host.noteDeclinedAction();
        }
        lastOffered = null;

        // §6.50 — THE OPTIONS COME FROM FORGE. Not from card type,
        // not from zone, not from mana cost, not from card text.
        // Whatever Forge says is playable right now is what the
        // player may do; nothing here reorders it, and the only
        // filter is Forge's own (below).
        java.util.LinkedHashMap<String, SpellAbility> byId = new java.util.LinkedHashMap<>();
        for (forge.game.card.Card card : player.getAllCards()) {
            for (SpellAbility sa : card.getAllPossibleAbilities(player, true)) {
                // Owner decision 2026-10-20: do not offer what the RULES
                // forbid right now. These are the two checks Forge itself
                // makes the moment an action is chosen (its
                // HumanPlaySpellAbility), and refuses it on: "can't be
                // cast / activated" effects -- Pithing Needle, Silence --
                // and casting timing. getAllPossibleAbilities consults
                // neither, so a Needled ability was offered, clicked,
                // and rolled back. Still Forge's answer, asked earlier.
                // COST is deliberately not screened (see describe()).
                if (!sa.checkRestrictions(player) || !sa.canCastTiming(player)) {
                    continue;
                }
                // §6.46 — TYPED ids, because card ids and
                // stack-instance ids share a number space and a bare
                // integer cannot say which it means. The index keeps
                // two abilities of ONE card distinct, which is
                // §6.51's invariant: an object can expose zero, one
                // or several actions.
                byId.put("action:" + byId.size() + ":card:" + card.getId(), sa);
            }
        }

        // Whatever did not work at this exact state is dropped.
        byId.keySet().removeAll(declined);
        if (byId.isEmpty()) {
            // Everything Forge offered has already failed here.
            // Passing is the honest answer and ends the window.
            return null;
        }

        // §7.61 B8 -- which of these Forge says cannot be paid right now,
        // so the board can dim them (§7.54: dimmed, still clickable). Not a
        // filter: COST stays unscreened (see describe()), and choosing an
        // unpayable option still goes to Forge, which refuses it.
        java.util.Set<String> unpayable = new java.util.HashSet<>();
        for (java.util.Map.Entry<String, SpellAbility> option : byId.entrySet()) {
            if (!payable(option.getValue(), player)) {
                unpayable.add(option.getKey());
            }
        }
        host.offerUnpayable(unpayable);

        // PHASE_07 §7.53, AMENDMENT 13 -- a step this player does not stop
        // at, with nothing on the stack they could answer: passed for, as
        // MTG Arena does. Only ever a priority pass, and only with the
        // player's own settings; a seat without any is asked as before.
        if (!host.stops().shouldAsk(actedForSeat, player, player.getGame(),
                actedForSeat != authorisedSeat, byId, unpayable)) {
            return null;
        }

        try {
            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            "chooseSpellAbilityToPlay",
                            new java.util.ArrayList<>(byId.keySet()),
                            pending -> host.publishDecision(pending, labelsFor(byId)));

            if (DecisionGate.PASS.equals(choice)) {
                // PASS IS `null`, NOT AN EMPTY LIST.
                //
                // An empty list is "here are zero abilities I am
                // playing", which Forge answers by offering the same
                // window again -- forever, per the guard above.
                // `null` is the pass. One character between a game
                // and a hang, and the hang is silent.
                return null;
            }
            lastOffered = choice;
            SpellAbility chosen = byId.get(choice);
            // The gate already refused a choice that was not on the
            // list, so null here means the list changed underneath
            // us. Passing is the safe answer; inventing one is not.
            return chosen == null ? null : java.util.List.of(chosen);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    /**
     * Actually play what the player chose — §6.50, §6.91.
     *
     * `chooseSpellAbilityToPlay` only NAMES an ability; Forge then
     * calls this to play it, and until now the adapter refused
     * loudly here. That is why a real game stopped the moment
     * somebody did anything: picking was implemented and doing
     * was not.
     *
     * FORGE'S OWN HUMAN PATH, deliberately, and not the AI one.
     * `PlayerControllerAi.playChosenSpellAbility` resolves lands
     * directly and hands everything else to
     * `ComputerUtil.handlePlayingSpellAbility`, which CHOOSES
     * TARGETS for the player. That is the engine inventing
     * answers, which is what §6.105 forbids and what Phase 0A
     * called a second rules engine.
     *
     * This path instead calls back into this controller for
     * every sub-decision -- targets, modes, costs, mana -- so
     * each one arrives as a decision the player answers, or as a
     * loud failure naming the next thing to implement. Both are
     * correct outcomes; neither is a guess.
     *
     * It takes a plain PlayerController and lives in forge-game
     * rather than the GUI module, so nothing about it is tied to
     * Forge's desktop interface.
     */
    @Override
    public boolean playChosenSpellAbility(SpellAbility sa) {
        return forge.game.player.PlaySpellAbility.playSpellAbility(this, player, sa);
    }

    /**
     * WHICH ability of this card — §6.50, §6.51.
     *
     * Forge asks this while playing something, when the object
     * the player pointed at can do more than one thing. §6.51's
     * invariant is exactly that: an object may expose zero, one
     * or several actions.
     *
     * Zero is nothing to play, and one is not a choice -- it is
     * the only thing Forge offers, and returning it is not
     * "choose the first option" in §6.105's sense, which forbids
     * picking one of SEVERAL to avoid asking. Several is a real
     * decision and goes to the player through the gate like any
     * other.
     */
    @Override
    public SpellAbility getAbilityToPlay(
            forge.game.card.Card hostCard,
            List<SpellAbility> abilities,
            forge.util.ITriggerEvent triggerEvent) {
        if (abilities == null || abilities.isEmpty()) {
            return null;
        }
        if (abilities.size() == 1) {
            return abilities.get(0);
        }

        java.util.LinkedHashMap<String, SpellAbility> byId = new java.util.LinkedHashMap<>();
        for (SpellAbility sa : abilities) {
            byId.put("action:" + byId.size() + ":card:" + hostCard.getId(), sa);
        }
        try {
            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            "getAbilityToPlay",
                            new java.util.ArrayList<>(byId.keySet()),
                            pending -> host.publishDecision(pending, labelsFor(byId)));
            // A pass here means "do not play it after all", which
            // Forge expresses as null. Not an error.
            return DecisionGate.PASS.equals(choice) ? null : byId.get(choice);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    /**
     * Play something that does not use the stack.
     *
     * A faithful port of Forge's own human path and nothing
     * more: no choice is made here, so there is nothing for a
     * player to answer. Any decision inside it comes back
     * through this controller as usual.
     */
    @Override
    public void playSpellAbilityNoStack(SpellAbility effectSA, boolean canSetupTargets) {
        forge.game.player.PlaySpellAbility.playSpellAbilityNoStack(
                this, player, effectSA, !canSetupTargets);
    }

    /**
     * WHO OR WHAT this is aimed at — §6.93, §6.50.
     *
     * "Legal targets come from Forge." Every candidate here is
     * `TargetRestrictions.getAllCandidates`, unfiltered and
     * unreordered; this method decides nothing about legality and
     * could not, because deciding it would make Proxic a second
     * rules engine (§6.50).
     *
     * Forge's own human path is TargetSelection, which lives in
     * forge-gui and takes a PlayerControllerHuman, so it cannot be
     * delegated to. This is the same shape driven by the gate
     * instead: ask, one target at a time, from the candidates
     * Forge supplied, until the ability has as many as it needs.
     *
     * Returns false to CANCEL — "I do not want to play this after
     * all" — which is a legal answer and not an error.
     */
    @Override
    public boolean chooseTargetsFor(SpellAbility ability) {
        return selectTargets(ability, null, null);
    }

    /**
     * New targets for a copy -- Krark, the Thumbless's "you may choose
     * new targets for the copy" (rule 707.10c). A port of Forge's human
     * controller: the targets are cleared and chosen again through the
     * same question as casting, from Forge's candidates and its
     * `filter`; passing before enough are chosen keeps the OLD targets
     * (Forge returns null for "unchanged"). Was a loud stub: the first
     * copy Krark made stopped the match (found 2026-10-20).
     *
     * Known limit (STUB-005): a DIVIDED copy keeps its targets and its
     * division -- Forge carries the old division over, and re-dividing
     * it here would be a second, different question. No required card
     * reaches it.
     */
    @Override
    public forge.game.spellability.TargetChoices chooseNewTargetsFor(
            SpellAbility ability, java.util.function.Predicate<forge.game.GameObject> filter, boolean optional) {
        SpellAbility sa = ability.isWrapper()
                ? ((forge.game.trigger.WrappedAbility) ability).getWrappedAbility() : ability;
        if (!sa.usesTargeting() || sa.isDividedAsYouChoose()) {
            return null;
        }
        forge.game.spellability.TargetChoices old = sa.getTargets();
        sa.clearTargets();
        String prompt = "New target for " + sa.getHostCard().getName()
                + " (now: " + old.toString() + ")" + (optional ? " -- pass to keep the targets it has." : "");
        if (selectTargets(sa, filter, prompt)) {
            return sa.getTargets();
        }
        sa.setTargets(old);
        return null;
    }

    private boolean selectTargets(SpellAbility ability,
                                  java.util.function.Predicate<forge.game.GameObject> filter,
                                  String prompt) {
        if (!ability.usesTargeting()) {
            return true;
        }
        forge.game.spellability.TargetRestrictions restrictions =
                ability.getTargetRestrictions();
        int min = ability.getMinTargets();
        int max = ability.getMaxTargets();
        if (max == 0 && min == 0) {
            return true;
        }

        // Divided as you choose (Fire // Ice, P6-AJ): a SECOND question
        // after each target -- "how much to this one?" -- as Forge's own
        // InputSelectTargets asks it. Every target gets at least 1, all
        // of it must be assigned, and targeting ends when none is left.
        // Was refused loudly; this is Forge's shape, one answer each.
        boolean divided = ability.isDividedAsYouChoose();

        while (ability.getTargets().size() < max && (!divided || ability.getStillToDivide() > 0)) {
            java.util.List<forge.game.GameEntity> candidates =
                    restrictions.getAllCandidates(ability);
            // Already chosen ones are not offered again: a target
            // list is a set, and Forge rejects a repeat anyway.
            candidates.removeIf(entity -> ability.getTargets().contains(entity)
                    || (filter != null && !filter.test(entity)));

            // SPELLS ON THE STACK (Counterspell, Force of Will). Forge's
            // getAllCandidates covers players and cards in the target
            // zone, never the stack: its own human client handles stack
            // targets separately (TargetSelection.chooseCardFromStack),
            // asking canTargetSpellAbility of each stack instance. Ported
            // here; until now no counterspell could be cast at all -- the
            // target list was empty and the cast rolled back silently
            // (found by check-costs.py, 2026-10-20).
            java.util.LinkedHashMap<String, SpellAbility> onStack = new java.util.LinkedHashMap<>();
            if (restrictions.getZone() != null && restrictions.getZone().contains(forge.game.zone.ZoneType.Stack)) {
                for (forge.game.spellability.SpellAbilityStackInstance instance : player.getGame().getStack()) {
                    SpellAbility there = instance.getSpellAbility();
                    if (ability.canTargetSpellAbility(there) && !ability.getTargets().contains(there)
                            && (filter == null || filter.test(there))) {
                        // The snapshot's own id for it, so a page can match them.
                        onStack.put("target:stack:" + instance.getId(), there);
                    }
                }
            }
            if (candidates.isEmpty() && onStack.isEmpty()) {
                break;
            }

            boolean enough = ability.getTargets().size() >= min;
            java.util.LinkedHashMap<String, forge.game.GameEntity> byId =
                    new java.util.LinkedHashMap<>();
            java.util.LinkedHashMap<String, String> labels =
                    new java.util.LinkedHashMap<>();
            for (forge.game.GameEntity candidate : candidates) {
                // §6.46 — TYPED ids. A card id and a player id
                // share a number space, and a bare integer cannot
                // say which it means.
                String id = (candidate instanceof forge.game.card.Card card)
                        ? "target:card:" + card.getId()
                        : "target:player:" + candidate.getId();
                byId.put(id, candidate);
                labels.put(id, candidate.toString());
            }
            onStack.forEach((id, spell) -> labels.put(id, "on the stack: " + spell.getStackDescription()));

            try {
                String choice =
                        host.gate().ask(
                                actedForSeat,
                                authorisedSeat,
                                "chooseTargetsFor",
                                new java.util.ArrayList<>(labels.keySet()),
                                false,
                                prompt,
                                pending -> host.publishDecision(pending, labels));

                if (DecisionGate.PASS.equals(choice)) {
                    // Stop. With enough targets that is "no more";
                    // without them it is "cancel", and Forge reads
                    // false as the player changing their mind.
                    return enough && finishDivision(ability);
                }
                SpellAbility spell = onStack.get(choice);
                if (spell != null) {
                    ability.getTargets().add(spell);
                    continue;
                }
                forge.game.GameEntity chosen = byId.get(choice);
                if (chosen == null) {
                    return enough && finishDivision(ability);
                }
                ability.getTargets().add(chosen);
                if (divided && !divide(ability, chosen, candidates.size() == 1
                        || ability.getTargets().size() >= max)) {
                    return false;
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }

        return ability.getTargets().size() >= min && finishDivision(ability);
    }

    /**
     * How much of a divided amount goes to `target` -- Forge's own
     * question ("Select how much damage to deal to ..."), with the
     * amounts Forge allows: 1 up to what is left. The last possible
     * target takes the rest without asking, because there is no
     * other answer. Returns false if the player backs out.
     */
    private boolean divide(SpellAbility ability, forge.game.GameEntity target, boolean last) {
        int left = ability.getStillToDivide();
        if (left <= 0) {
            return true;
        }
        if (last || left == 1) {
            ability.addDividedAllocation(target, left);
            return true;
        }
        String verb = switch (String.valueOf(ability.getApi())) {
            case "DealDamage" -> "damage to deal to ";
            case "PreventDamage" -> "damage to prevent to ";
            case "PutCounter" -> "counters to put on ";
            default -> "to distribute to ";
        };
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        for (int amount = 1; amount <= left; amount++) {
            labels.put("divide:" + amount, String.valueOf(amount));
        }
        try {
            String choice = host.gate().ask(
                    actedForSeat,
                    authorisedSeat,
                    "divideAsYouChoose",
                    new java.util.ArrayList<>(labels.keySet()),
                    true,
                    "How much " + verb + target + "? (" + left + " left to assign)",
                    pending -> host.publishDecision(pending, labels));
            ability.addDividedAllocation(target, Integer.parseInt(choice.substring("divide:".length())));
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    /**
     * Whatever is still undivided when targeting stops goes to the last
     * target chosen: all of it must be assigned (rule 601.2d), and with
     * no more targets there is nowhere else for it.
     */
    private static boolean finishDivision(SpellAbility ability) {
        if (!ability.isDividedAsYouChoose() || ability.getStillToDivide() <= 0) {
            return true;
        }
        java.util.List<forge.game.GameObject> chosen = new java.util.ArrayList<>(ability.getTargets());
        if (chosen.isEmpty()) {
            return true;
        }
        forge.game.GameObject last = chosen.get(chosen.size() - 1);
        Integer already = ability.getDividedValue(last);
        ability.addDividedAllocation(last, (already == null ? 0 : already) + ability.getStillToDivide());
        return true;
    }

    /**
     * Pay the mana — §6.91, and §6.189's warning.
     *
     * Forge's own human path, which lives in forge-game and takes
     * a plain PlayerController, so it is a delegation rather than
     * a reimplementation. It calls back into this controller for
     * the interactive part.
     *
     * §6.189 names "a mana ability played through the wrong path"
     * as one of four measured causes of an INFINITE LOOP: Forge's
     * 999-iteration safety valve is AI-only, so a human-shaped
     * controller that fails to pay is re-offered the same action
     * for ever, at full CPU, with no exception and no log line.
     * The worst measured case was 679,963 identical attempts with
     * targeting succeeding every time. That is why this is a
     * delegation to Forge's own path and not something clever.
     */
    @Override
    public boolean payManaCost(
            forge.card.mana.ManaCost toPay,
            forge.game.cost.CostPartMana costPartMana,
            SpellAbility sa,
            String prompt,
            forge.game.mana.ManaConversionMatrix matrix,
            boolean effect) {
        return forge.game.player.PlaySpellAbility.payManaCost(
                this, toPay, costPartMana, sa, player, prompt, matrix, effect);
    }

    /**
     * THE PLAYER TAPS THE LANDS — §6.91, §6.105.
     *
     * Forge's human input asks for permanents one at a time and
     * offers automatic payment only as a BUTTON, implemented by
     * swapping in the AI controller. Proxic has no such button and
     * no AI in the worker: the rules enforce what is legal and the
     * player decides everything the rules leave open.
     *
     * Owner's framing, 2026-10-18: "we don't want to take
     * decisions away from the player, we want the rules to enforce
     * them."
     */
    @Override
    public boolean applyManaToCost(
            forge.game.mana.ManaCostBeingPaid toPay,
            SpellAbility ability,
            String prompt,
            forge.game.mana.ManaConversionMatrix matrix,
            boolean effect) {
        try {
            return new ManaPayment(host, this, player, actedForSeat, authorisedSeat)
                    .pay(toPay, ability, effect);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    /**
     * §6.91 — FORGE decides what is affordable, not Proxic.
     *
     * Every cost type is refused loudly by default and the few
     * that are supported are overridden explicitly, so a cost this
     * adapter cannot represent stops the match and names itself
     * instead of being quietly paid.
     */
    @Override
    public forge.game.cost.CostDecisionMakerBase getCostDecisionMaker(
            Player payer, SpellAbility ability, boolean effect, String prompt) {
        // The host and both seats, because some costs are a real
        // choice -- which permanent a counter goes on -- and a cost
        // maker that cannot ask would have to guess.
        return new MatchCostDecision(
                payer, effect, ability, ability.getHostCard(),
                host, actedForSeat, authorisedSeat);
    }

    /**
     * Has the game moved?
     *
     * Deliberately coarse and deliberately FORGE's: turn, phase,
     * what is on the stack, what is in hand, what is on the
     * battlefield, and how much mana is floating. Any real action
     * changes at least one. Nothing here interprets the game --
     * it only asks whether it is the same game state as a moment
     * ago.
     */
    private String stateSignature() {
        forge.game.Game current = player.getGame();
        return current.getPhaseHandler().getTurn()
                + "/" + current.getPhaseHandler().getPhase()
                + "/" + current.getStack().size()
                + "/" + player.getCardsIn(forge.game.zone.ZoneType.Hand).size()
                + "/" + player.getCardsIn(forge.game.zone.ZoneType.Battlefield).size()
                + "/" + player.getManaPool().totalMana()
                + "/" + player.getLife();
    }

    /**
     * Discarding down to hand size — §6.105, AGENTS FORGE-RULE.
     *
     * The rules say discard; the only question is WHICH, and that
     * is entirely the player's. Forge's own human input sets
     * min = max = nDiscard and `setCancelAllowed(false)`, so
     * there is no "no" to offer and the decision is marked
     * mandatory.
     *
     * Asked ONE CARD AT A TIME rather than as a multi-select.
     * That is how a person does it, it needs no new protocol
     * shape, and a half-finished selection cannot be submitted:
     * each answer is final on its own and the next question
     * reflects it. Forge's desktop client uses a multi-select
     * dialog; the outcome is identical.
     *
     * Interruption returns what has been chosen so far rather
     * than nothing. The worker is shutting down at that point,
     * and a partial honest answer beats a confident empty one.
     */
    @Override
    public forge.game.card.CardCollectionView chooseCardsToDiscardToMaximumHandSize(int nDiscard) {
        forge.game.card.CardCollection chosen = new forge.game.card.CardCollection();
        if (nDiscard <= 0) {
            return chosen;
        }

        try {
            while (chosen.size() < nDiscard) {
                java.util.LinkedHashMap<String, forge.game.card.Card> byId =
                        new java.util.LinkedHashMap<>();
                java.util.LinkedHashMap<String, String> labels =
                        new java.util.LinkedHashMap<>();
                for (forge.game.card.Card card
                        : player.getCardsIn(forge.game.zone.ZoneType.Hand)) {
                    if (chosen.contains(card)) {
                        continue;
                    }
                    String id = "discard:card:" + card.getId();
                    byId.put(id, card);
                    labels.put(id, card.getName());
                }
                if (byId.isEmpty()) {
                    // Fewer cards in hand than Forge asked for.
                    // Nothing to invent; give back what there is.
                    return chosen;
                }

                String choice =
                        host.gate().ask(
                                actedForSeat,
                                authorisedSeat,
                                "chooseCardsToDiscardToMaximumHandSize",
                                new java.util.ArrayList<>(byId.keySet()),
                                true,
                                pending -> host.publishDecision(pending, labels));

                forge.game.card.Card card = byId.get(choice);
                if (card == null) {
                    // The gate refuses a pass on a mandatory
                    // decision, so this means the answer named
                    // something that is no longer in hand. Ask
                    // again with a fresh list.
                    continue;
                }
                chosen.add(card);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return chosen;
    }

    /**
     * Which replacement applies first — §6.105, AGENTS FORGE-RULE.
     *
     * When two effects both want to change the same event, the
     * affected player picks the order. It is MANDATORY: the game
     * cannot continue until one is chosen, so no pass is offered.
     *
     * Forge's own human path decides when it is a real choice and
     * this ports it exactly: one option is not a choice, and
     * neither is a list whose entries all read the same — that is
     * the same effect reached more than once, and asking would be
     * asking which of two identical things you prefer. Anything
     * else goes to the player.
     */
    @Override
    public forge.game.replacement.ReplacementEffect chooseSingleReplacementEffect(
            List<forge.game.replacement.ReplacementEffect> possible) {
        if (possible == null || possible.isEmpty()) {
            return null;
        }
        forge.game.replacement.ReplacementEffect first = possible.get(0);
        if (possible.size() == 1) {
            return first;
        }
        String firstText = String.valueOf(first);
        boolean allTheSame = possible.stream()
                .allMatch(effect -> effect == first || firstText.equals(String.valueOf(effect)));
        if (allTheSame) {
            return first;
        }

        java.util.LinkedHashMap<String, forge.game.replacement.ReplacementEffect> byId =
                new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        for (forge.game.replacement.ReplacementEffect effect : possible) {
            String id = "replacement:" + byId.size();
            byId.put(id, effect);
            labels.put(id, String.valueOf(effect));
        }

        try {
            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            "chooseSingleReplacementEffect",
                            new java.util.ArrayList<>(byId.keySet()),
                            true,
                            pending -> host.publishDecision(pending, labels));
            forge.game.replacement.ReplacementEffect chosen = byId.get(choice);
            // The gate refuses a pass on a mandatory decision, so
            // a miss here means the list moved underneath us. The
            // first is then the only answer that is certainly
            // still valid, and returning null would strand the
            // game.
            return chosen == null ? first : chosen;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return first;
        }
    }

    /**
     * Which KIND of counter — PHASE_06 §6.50, FORGE-RULE.
     *
     * Reached by cards that put, move or remove a counter without
     * naming which one, and it is a real decision with real
     * consequences: a +1/+1 counter and a -1/-1 counter on the
     * same creature annihilate, a charge counter spent is a charge
     * counter gone. Nothing here reasons about which counter is
     * better, and nothing picks on the player's behalf.
     *
     * FORGE chooses the candidates. Every call site builds the
     * list from what that effect and that permanent actually allow,
     * and several of them collapse a single candidate before asking
     * at all — which is why a one-option list is answered here
     * rather than published: the call sites that do ask with one
     * option are asking a question with one answer.
     *
     * The prompt is Forge's own localised text, passed through
     * because it is the only thing that says WHY the choice is
     * being made.
     *
     * The survey found this one. Three decks drove 1,814 decisions
     * and reached exactly one unimplemented kind, this — Legion
     * Warboss's mentor trigger on a creature already carrying
     * counters.
     */
    @Override
    public forge.game.card.CounterType chooseCounterType(
            List<forge.game.card.CounterType> options,
            forge.game.spellability.SpellAbility sa,
            String prompt,
            java.util.Map<String, Object> params) {
        if (options == null || options.isEmpty()) {
            return null;
        }
        forge.game.card.CounterType first = options.get(0);
        if (options.size() == 1) {
            return first;
        }

        java.util.LinkedHashMap<String, forge.game.card.CounterType> byId =
                new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        for (forge.game.card.CounterType type : options) {
            // §6.46 — typed, like every other object id. A counter
            // name is not a number, but the prefix is what tells a
            // client what it is answering about.
            String id = "counter:" + type.getName();
            byId.put(id, type);
            labels.put(id, type.getName());
        }

        try {
            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            "chooseCounterType",
                            new java.util.ArrayList<>(byId.keySet()),
                            true,
                            prompt,
                            pending -> host.publishDecision(pending, labels));
            forge.game.card.CounterType chosen = byId.get(choice);
            // Mandatory, so the gate refused a pass. A miss means
            // the candidates moved; the first is then the only
            // answer still certainly valid, and returning null
            // would strand the effect mid-resolution.
            return chosen == null ? first : chosen;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return first;
        }
    }

    /**
     * "Choose one —" — PHASE_06 §6.50, FORGE-RULE.
     *
     * Modal cards: Abrade either destroys an artifact or burns a
     * creature, and which one is the entire decision the card
     * exists to offer. Nothing here reads the modes or reasons
     * about which is better. FORGE supplies the list, already
     * narrowed to the modes that are legal right now, and the
     * player picks from it.
     *
     * A PORT of Forge's own human loop, and its two edges are not
     * obvious:
     *
     * `min` MODES ARE COMPULSORY AND THE REST ARE NOT. Escalate and
     * entwine cards let you take more than the minimum, so the
     * first `min` questions refuse a pass and the ones after it
     * accept one — passing means "that is all the modes I want",
     * which is a real and ordinary answer, not a cancel.
     *
     * `allowRepeat` decides whether a mode can be taken twice. When
     * it cannot, a chosen mode leaves the list, so the second
     * question is a shorter one.
     */
    @Override
    public List<forge.game.spellability.AbilitySub> chooseModeForAbility(
            forge.game.spellability.SpellAbility sa,
            List<forge.game.spellability.AbilitySub> possible,
            int min,
            int num,
            boolean allowRepeat) {
        if (possible == null || possible.isEmpty()) {
            return null;
        }
        // Forge's own shortcut: when every mode must be taken there
        // is nothing to decide. "Choose one" that offers one thing
        // is not a question.
        if (!allowRepeat && min == num && num == possible.size()) {
            return possible;
        }

        List<forge.game.spellability.AbilitySub> remaining =
                new java.util.ArrayList<>(possible);
        List<forge.game.spellability.AbilitySub> chosen = new java.util.ArrayList<>();
        int spentPawprint = 0;

        for (int round = 0; round < num; round++) {
            if (sa.hasParam("Pawprint")) {
                // A budget rather than a count: each mode costs
                // some of it, so the modes that no longer fit stop
                // being offered. Forge's rule, ported whole.
                final int spent = spentPawprint;
                remaining.removeIf(mode -> pawprintOf(mode) > num - spent);
            }
            if (remaining.isEmpty()) {
                break;
            }

            java.util.LinkedHashMap<String, forge.game.spellability.AbilitySub> byId =
                    new java.util.LinkedHashMap<>();
            java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
            for (forge.game.spellability.AbilitySub mode : remaining) {
                // §6.46 — typed, and indexed because two modes of
                // one card can read the same and still be distinct.
                String id = "mode:" + byId.size() + ":card:" + sa.getHostCard().getId();
                byId.put(id, mode);
                labels.put(id, mode.toUnsuppressedString());
            }

            // The first `min` cannot be declined; the rest can.
            boolean mandatory = round < min;
            String prompt = mandatory
                    ? "Choose a mode for " + sa.getHostCard().getName() + "."
                    : "Choose another mode for " + sa.getHostCard().getName()
                            + ", or pass to take no more.";

            forge.game.spellability.AbilitySub picked;
            try {
                String choice =
                        host.gate().ask(
                                actedForSeat,
                                authorisedSeat,
                                "chooseModeForAbility",
                                new java.util.ArrayList<>(byId.keySet()),
                                mandatory,
                                prompt,
                                pending -> host.publishDecision(pending, labels));
                if (DecisionGate.PASS.equals(choice)) {
                    // Only reachable when this one was optional:
                    // the gate refuses a pass on a mandatory
                    // decision. "No more modes" ends the choosing.
                    break;
                }
                picked = byId.get(choice);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                picked = null;
            }

            if (picked == null) {
                // Mandatory and unanswerable, or interrupted. The
                // first remaining mode is the only answer still
                // certainly legal, and a modal spell with no mode
                // would strand mid-resolution.
                if (!mandatory) {
                    break;
                }
                picked = remaining.get(0);
            }

            if (!allowRepeat) {
                remaining.remove(picked);
            }
            if (picked.hasParam("Pawprint")) {
                spentPawprint += pawprintOf(picked);
            }
            chosen.add(picked);
        }
        return chosen;
    }

    /**
     * How big is the X — PHASE_06 §6.91, §6.105, FORGE-RULE.
     *
     * Fireball asks it, and so does every kicker, multikicker and
     * "pay {X}" on the way to being cast. Forge asks for a NUMBER,
     * and the decision protocol offers a list of actions, so the
     * numbers are offered as actions — one per value.
     *
     * That is not a workaround. FORGE'S OWN HUMAN PATH DOES THIS:
     * SGuiChoose.getInteger lists min..cutoff and adds a "..." for
     * typing something larger, and returns `min` outright when
     * max <= min because one answer is not a question. Both of
     * those are ported below. What is not ported is the "...", for
     * want of a text box, and {@link #ceilingFor} is the answer to
     * that — see there, because offering too few is the half that
     * would take a decision away from the player.
     *
     * NULL CANCELS THE SPELL, and that is a legal answer rather
     * than an error: PlaySpellAbility returns false and the cast is
     * unwound. So a pass is offered, except where the cost says it
     * is mandatory, which is Forge's own split between chooseNumber
     * and a cancellable prompt.
     */
    @Override
    public Integer announceRequirements(
            forge.game.spellability.SpellAbility ability, int min, int max, String announce) {
        forge.game.cost.Cost cost = ability.getPayCosts();

        // Forge's clamp: an X paid with something other than mana
        // — sacrificing X creatures, exiling X cards — cannot be
        // bigger than what there is. Forge guards this with a
        // full-control flag that lets an expert start a payment
        // they cannot finish; Proxic has no such mode, so the
        // clamp simply applies.
        if ("X".equals(announce) && cost != null) {
            Integer costX = cost.getMaxForNonManaX(ability, player, false);
            if (costX != null) {
                max = Math.min(max, costX);
            }
        }
        if (min > max) {
            // Forge: there is no announceable value. Cancels.
            return null;
        }
        if (min == max) {
            // One answer is not a question.
            return min;
        }

        int ceiling = ceilingFor(min, max);
        java.util.LinkedHashMap<String, Integer> byId = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        for (int value = min; value <= ceiling; value++) {
            // §6.46 — typed, so a client can tell a number from a
            // card id that happens to look like one.
            String id = "number:" + value;
            byId.put(id, value);
            labels.put(id, announce + " = " + value);
        }

        // Forge's own split: a mandatory cost gets a prompt that
        // cannot be cancelled, anything else can be backed out of.
        boolean mandatory = cost != null && cost.isMandatory();
        String title = "X".equals(announce)
                ? ability.getParamOrDefault("XAnnounceTitle", announce)
                : ability.getParamOrDefault("AnnounceTitle", announce);

        try {
            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            "announceRequirements",
                            new java.util.ArrayList<>(byId.keySet()),
                            mandatory,
                            "Choose " + title + " for " + ability.getHostCard().getName() + ".",
                            pending -> host.publishDecision(pending, labels));
            if (DecisionGate.PASS.equals(choice)) {
                // Only reachable when this was cancellable. Forge
                // unwinds the cast, which is what a player who
                // changed their mind expects.
                return null;
            }
            Integer chosen = byId.get(choice);
            return chosen == null ? min : chosen;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    /**
     * How many values to put on offer.
     *
     * The hard part, and the reason it is not simply `max`: for an
     * X paid with MANA, Forge's bound is Integer.MAX_VALUE. It can
     * afford to be — its prompt has a text box, and a player who
     * types a number they cannot pay for simply fails the payment
     * afterwards. A list cannot have two billion entries.
     *
     * Forge's desktop client stops at min + 9 and offers "..." for
     * the rest. Copying only the first half of that would quietly
     * cap what a player is allowed to announce, which is exactly
     * the kind of silent narrowing FORGE-RULE exists to prevent.
     *
     * So the ceiling is ASKED OF THE GAME instead: how much mana
     * could be made right now, counting what is already floating
     * and every permanent that has a mana ability Forge says is
     * playable. Nothing here reasons about colours or about what
     * the cost actually needs, which makes it an over-estimate —
     * deliberately, because over-offering is harmless (the payment
     * that follows will refuse, and the player can cancel) while
     * under-offering removes a legal choice.
     */
    private int ceilingFor(int min, int max) {
        if (max != Integer.MAX_VALUE && max - min <= OFFER_LIMIT) {
            return max;
        }
        int available = player.getManaPool().totalMana();
        for (forge.game.card.Card card
                : player.getCardsIn(forge.game.zone.ZoneType.Battlefield)) {
            for (forge.game.spellability.SpellAbility mana : card.getManaAbilities()) {
                mana.setActivatingPlayer(player);
                if (mana.canPlay(true)) {
                    available++;
                    break;
                }
            }
        }
        // AT LEAST Forge's own window of ten, whatever the board
        // looks like. Its desktop client offers min..min+9 and a
        // box for anything larger, and it does not check first
        // whether any of them can be paid for -- a player is
        // allowed to announce a number and then fail to pay, and
        // FORGE-RULE says the rules enforce that, not the client.
        // Offering only what is affordable would be the page
        // deciding, and on turn one with no land in play it came
        // to exactly one value.
        int window = Math.max(available, FORGE_WINDOW);
        return Math.min(max, min + Math.min(window, OFFER_LIMIT));
    }

    /** Forge's own default list length, and the floor for ours. */
    private static final int FORGE_WINDOW = 9;

    /**
     * The most values one question will ever offer.
     *
     * A guard against a list nobody can read, not a rule. Nothing
     * in Magic needs an X of more than this from a board that
     * could pay for it, and a question with a thousand buttons is
     * not a question either.
     */
    private static final int OFFER_LIMIT = 64;

    /**
     * The delayed reveal, as a sentence for the prompt.
     *
     * Forge's own message prefix when it supplied one, because it
     * says what the cards ARE — "You looked at" reads very
     * differently from "Revealed from your library".
     *
     * Empty when there is nothing to show, which is the common
     * case: most choices have no reveal attached.
     */
    private static String revealed(forge.game.player.DelayedReveal reveal) {
        if (reveal == null || reveal.getCards() == null || reveal.getCards().isEmpty()) {
            return "";
        }
        java.util.List<String> names = new java.util.ArrayList<>();
        reveal.getCards().forEach(card -> names.add(String.valueOf(card)));

        // CAPPED, and says when it is capping.
        //
        // This is built for "look at the top seven", where naming
        // them all is the point. A library search hands over the
        // whole library -- fifty-six names measured, which buries
        // the question underneath its own context and repeats most
        // of the options. Nothing is hidden silently: the count of
        // what is not listed is part of the sentence, and the
        // cards a player may actually TAKE are the options, which
        // are never capped.
        int shown = Math.min(names.size(), REVEAL_LIMIT);
        String more = names.size() > shown
                ? ", and " + (names.size() - shown) + " more"
                : "";
        String prefix = reveal.getMessagePrefix();
        prefix = (prefix == null || prefix.isBlank()) ? "You are looking at:" : prefix.trim();
        return prefix + " " + String.join(", ", names.subList(0, shown)) + more + ".";
    }

    /**
     * Choose SEVERAL things for an effect — §6.90, §6.93.
     *
     * The plural of the chooser above, and not a rare one: it is
     * what Elspeth Resplendent's -3 asks, and what every "choose up
     * to N" and "put any number of them" ends in. Reached by a
     * perfectly ordinary card, and until now it failed the match
     * loudly — correctly, but a planeswalker whose second ability
     * stops the game is not a game.
     *
     * ONE AT A TIME, like combat and like modes. It needs no new
     * protocol shape, every answer is final on its own, and a
     * half-made selection cannot be submitted. The first `min` are
     * compulsory and the rest are not, so the question stops
     * refusing a pass once the minimum is met — "that is all I
     * want" is the ordinary answer to "up to three".
     *
     * Forge's own human path allows a cancel exactly when min is
     * zero, which is the same rule stated from the other end.
     */
    @Override
    public <T extends forge.game.GameEntity> java.util.List<T> chooseEntitiesForEffect(
            forge.util.collect.FCollectionView<T> optionList,
            int min,
            int max,
            forge.game.player.DelayedReveal delayedReveal,
            SpellAbility sa,
            String title,
            Player targetedPlayer,
            java.util.Map<String, Object> params) {
        java.util.List<T> chosen = new java.util.ArrayList<>();
        if (optionList == null || optionList.isEmpty()) {
            return chosen;
        }
        java.util.List<T> remaining = new java.util.ArrayList<>();
        optionList.forEach(remaining::add);

        // Shown with the first question only. Repeating seven card
        // names above every pick is noise, and the player has
        // already read them.
        String context = revealed(delayedReveal);

        while (chosen.size() < max && !remaining.isEmpty()) {
            java.util.LinkedHashMap<String, T> byId = new java.util.LinkedHashMap<>();
            java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
            for (T candidate : remaining) {
                // §6.46 — typed, because a card id and a player id
                // share a number space.
                String id = (candidate instanceof forge.game.card.Card card)
                        ? "card:" + card.getId()
                        : "player:" + candidate.getId();
                byId.put(id, candidate);
                labels.put(id, String.valueOf(candidate));
            }

            boolean mandatory = chosen.size() < min;
            String prompt = title
                    + (mandatory
                        ? " (" + (min - chosen.size()) + " more needed)"
                        : " (up to " + (max - chosen.size()) + " more, or pass)");
            if (chosen.isEmpty() && !context.isEmpty()) {
                prompt = prompt + " " + context;
            }

            T picked;
            try {
                String choice =
                        host.gate().ask(
                                actedForSeat,
                                authorisedSeat,
                                "chooseEntitiesForEffect",
                                new java.util.ArrayList<>(byId.keySet()),
                                mandatory,
                                prompt,
                                pending -> host.publishDecision(pending, labels));
                if (DecisionGate.PASS.equals(choice)) {
                    // Only reachable once the minimum is met; the
                    // gate refuses a pass before that.
                    break;
                }
                picked = byId.get(choice);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                picked = null;
            }

            if (picked == null) {
                if (!mandatory) {
                    break;
                }
                // Required and unanswerable: the first remaining
                // candidate is the only answer certainly still
                // valid, and returning short of the minimum would
                // strand the effect.
                picked = remaining.get(0);
            }
            remaining.remove(picked);
            chosen.add(picked);
        }
        return chosen;
    }

    /**
     * One of several labelled choices, by index, or -1 for a pass --
     * the shape the three ports below share.
     */
    private int askIndex(String kind, java.util.List<String> texts, boolean mandatory, String prompt) {
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        for (int i = 0; i < texts.size(); i++) {
            labels.put(kind + ":" + i, texts.get(i));
        }
        try {
            String choice = host.gate().ask(
                    actedForSeat, authorisedSeat, kind,
                    new java.util.ArrayList<>(labels.keySet()), mandatory, prompt,
                    pending -> host.publishDecision(pending, labels));
            if (choice == null || DecisionGate.PASS.equals(choice)) {
                return -1;
            }
            return Integer.parseInt(choice.substring(kind.length() + 1));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return -1;
        }
    }

    /**
     * Which of several static abilities applies -- a port of Forge's
     * own human controller: one, or a cost reduction (Thoughtcast's
     * affinity), needs no question and takes the first; otherwise the
     * player chooses. Was a loud stub: Thoughtcast stopped the match.
     */
    @Override
    public forge.game.staticability.StaticAbility chooseSingleStaticAbility(
            java.util.List<forge.game.staticability.StaticAbility> possible) {
        forge.game.staticability.StaticAbility first = possible.get(0);
        boolean costReduction = first.getMode().contains(forge.game.staticability.StaticAbilityMode.ReduceCost);
        if (possible.size() == 1 || costReduction) {
            return first;
        }
        java.util.List<String> texts = new java.util.ArrayList<>();
        possible.forEach(st -> texts.add(st.getHostCard() + " — " + st));
        int picked = askIndex("chooseSingleStaticAbility", texts, true, "Which applies first?");
        return picked < 0 ? first : possible.get(picked);
    }

    /**
     * A number during resolution -- Harnessed Lightning's "pay any
     * amount of energy". A port of Forge's human controller: min when
     * there is only one answer, otherwise every value from min to max,
     * with the same ceiling as an announced X when max is unbounded
     * (see {@link #ceilingFor}). Forge's prompt cannot be cancelled,
     * so neither can this one. Was a loud stub: the first Harnessed
     * Lightning stopped the match (found 2026-10-20).
     */
    @Override
    public int chooseNumber(SpellAbility sa, String title, int min, int max) {
        if (min >= max) {
            return min;
        }
        java.util.List<Integer> values = new java.util.ArrayList<>();
        for (int value = min, ceiling = ceilingFor(min, max); value <= ceiling; value++) {
            values.add(value);
        }
        return pickNumber(title, values);
    }

    /** A number from Forge's own list of allowed ones. */
    @Override
    public int chooseNumber(SpellAbility sa, String title, java.util.List<Integer> choices, Player relatedPlayer) {
        return pickNumber(title, choices);
    }

    private int pickNumber(String title, java.util.List<Integer> values) {
        if (values.size() == 1) {
            return values.get(0);
        }
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        values.forEach(value -> labels.put("number:" + value, String.valueOf(value)));
        String answer = askOne("chooseNumber", title, labels, true);
        return answer == null ? values.get(0) : Integer.parseInt(answer.substring("number:".length()));
    }

    /**
     * One card face out of a list Forge supplies -- which dungeon to
     * venture into (White Plume Adventurer takes the initiative, so
     * Forge offers the Undercity alone). A port of Forge's human
     * controller; one face is not a question. Was a loud stub: taking
     * the initiative stopped the match (found 2026-10-20).
     */
    @Override
    public forge.card.ICardFace chooseSingleCardFace(
            SpellAbility sa, java.util.List<forge.card.ICardFace> faces, String message) {
        if (faces == null || faces.isEmpty()) {
            return null;
        }
        if (faces.size() == 1) {
            return faces.get(0);
        }
        java.util.List<String> names = new java.util.ArrayList<>();
        faces.forEach(face -> names.add(face.getName()));
        int picked = askIndex("chooseSingleCardFace", names, true, message);
        return faces.get(Math.max(picked, 0));
    }

    /**
     * One ability out of several Forge offers for an effect -- which
     * room of a dungeon to enter next. A port of Forge's human
     * controller: fewer than two is not a question.
     */
    @Override
    public SpellAbility chooseSingleSpellForEffect(
            java.util.List<SpellAbility> spells, SpellAbility sa, String title, java.util.Map<String, Object> params) {
        if (spells.size() < 2) {
            return spells.isEmpty() ? null : spells.get(0);
        }
        int picked = askIndex("chooseSingleSpellForEffect", describe(spells), true, title);
        return spells.get(Math.max(picked, 0));
    }

    /**
     * `num` abilities out of several, all different -- Mind Bend's
     * "a colour word or a basic land type", Forge's GenericChoice. A
     * port of Forge's human controller (exactly `num`), asked one at a
     * time. Was a loud stub: Mind Bend stopped the match (found
     * 2026-10-20).
     */
    @Override
    public java.util.List<SpellAbility> chooseSpellAbilitiesForEffect(
            java.util.List<SpellAbility> spells, SpellAbility sa, String title, int num,
            java.util.Map<String, Object> params) {
        java.util.List<SpellAbility> remaining = new java.util.ArrayList<>(spells);
        java.util.List<SpellAbility> chosen = new java.util.ArrayList<>();
        while (chosen.size() < num && !remaining.isEmpty()) {
            if (remaining.size() == 1 || remaining.size() == num - chosen.size()) {
                chosen.add(remaining.remove(0));
                continue;
            }
            int picked = askIndex("chooseSpellAbilitiesForEffect", describe(remaining), true, title);
            chosen.add(remaining.remove(Math.max(picked, 0)));
        }
        return chosen;
    }

    /**
     * A cost paid while something resolves -- Harnessed Lightning's
     * "pay any amount of {E}", "unless its controller pays", echo,
     * cumulative upkeep. Forge's human controller hands this to
     * PlaySpellAbility.payCostDuringAbilityResolve, which is in
     * forge-game and takes any PlayerController, so this is the same
     * delegation: every confirm and every choice in it comes back to
     * this controller as a question. Was a loud stub: the first
     * Harnessed Lightning stopped the match (found 2026-10-20).
     */
    @Override
    public boolean payCostToPreventEffect(
            forge.game.cost.Cost cost, SpellAbility sa, boolean alreadyPaid,
            forge.util.collect.FCollectionView<Player> allPayers) {
        String prompt = null;
        if (sa.isKeyword(forge.game.keyword.Keyword.ECHO)) {
            prompt = "Pay Echo?";
        } else if (sa.isKeyword(forge.game.keyword.Keyword.CUMULATIVE_UPKEEP)) {
            prompt = "Cumulative upkeep for " + sa.getHostCard();
        }
        return forge.game.player.PlaySpellAbility.payCostDuringAbilityResolve(this, player, cost, sa, prompt);
    }

    /** The same, for a cost paid during a die roll. */
    @Override
    public boolean payCostDuringRoll(forge.game.cost.Cost cost, SpellAbility sa) {
        return forge.game.player.PlaySpellAbility.payCostDuringAbilityResolve(this, player, cost, sa, null);
    }

    /**
     * Some cards for an effect, between min and max -- the Undercity's
     * rooms, "choose up to two". A port of Forge's human controller:
     * exactly one is the single-card question; otherwise one at a time
     * through chooseEntitiesForEffect, and an optional choice may be
     * none at all (Forge's cancel returns an empty selection). Was a
     * loud stub (found by White Plume Adventurer, 2026-10-20).
     */
    @Override
    public forge.game.card.CardCollectionView chooseCardsForEffect(
            forge.game.card.CardCollectionView sourceList, SpellAbility sa, String title,
            int min, int max, boolean isOptional, java.util.Map<String, Object> params) {
        if (min == 1 && max == 1) {
            forge.game.card.Card one = chooseSingleEntityForEffect(sourceList, sa, title, isOptional, params);
            return one == null ? forge.game.card.CardCollection.EMPTY : new forge.game.card.CardCollection(one);
        }
        if (sourceList.isEmpty()) {
            return new forge.game.card.CardCollection();
        }
        return new forge.game.card.CardCollection(chooseEntitiesForEffect(
                sourceList, isOptional ? 0 : min, max, null, sa, title, null, params));
    }

    /**
     * Scry -- a port of Forge's human controller. One card: top or
     * bottom. Several: which go to the BOTTOM (any number, none
     * included), then the order of the rest on top, first chosen =
     * top card (Forge's GameAction.scry reverses the list it gets
     * back for exactly that reading). The cards are named in the
     * question, which goes to the scrying player alone. Was a loud
     * stub, reached by the Undercity's Lost Well (White Plume
     * Adventurer, 2026-10-20) -- and by every scry card there is.
     */
    @Override
    public org.apache.commons.lang3.tuple.ImmutablePair<forge.game.card.CardCollection, forge.game.card.CardCollection>
            arrangeForScry(forge.game.card.CardCollection topN) {
        if (topN.size() == 1) {
            return willPutCardOnTop(topN.get(0))
                    ? org.apache.commons.lang3.tuple.ImmutablePair.of(topN, null)
                    : org.apache.commons.lang3.tuple.ImmutablePair.of(null, topN);
        }
        forge.game.card.CardCollection toBottom = new forge.game.card.CardCollection(chooseEntitiesForEffect(
                topN, 0, topN.size(), null, null,
                "Scry " + topN.size() + ": choose the cards to put on the BOTTOM of your library", null, null));
        java.util.List<forge.game.card.Card> remaining = new java.util.ArrayList<>(topN);
        remaining.removeAll(toBottom);
        forge.game.card.CardCollection toTop = new forge.game.card.CardCollection();
        while (remaining.size() > 1) {
            java.util.List<String> names = new java.util.ArrayList<>();
            remaining.forEach(card -> names.add(String.valueOf(card)));
            int picked = askIndex("arrangeForScry", names, true,
                    "Which goes on TOP of your library" + (toTop.isEmpty() ? "" : ", under " + toTop.get(toTop.size() - 1)) + "?");
            toTop.add(remaining.remove(Math.max(picked, 0)));
        }
        toTop.addAll(remaining);
        return org.apache.commons.lang3.tuple.ImmutablePair.of(toTop.isEmpty() ? null : toTop,
                toBottom.isEmpty() ? null : toBottom);
    }

    /** Top or bottom of the library, for one card -- Forge's own question. */
    @Override
    public boolean willPutCardOnTop(forge.game.card.Card card) {
        int picked = askIndex("willPutCardOnTop", java.util.List.of("Top", "Bottom"), true,
                "Put " + card + " on the top or the bottom of your library?");
        return picked != 1;
    }

    /** What a player reads for each ability: its own description. */
    private static java.util.List<String> describe(java.util.List<SpellAbility> spells) {
        java.util.List<String> texts = new java.util.ArrayList<>();
        for (SpellAbility spell : spells) {
            String text = spell.getDescription();
            texts.add(text == null || text.isBlank() ? spell.toString() : text);
        }
        return texts;
    }

    /**
     * Discard from a hand (Three Steps Ahead's "then discard a card") --
     * a port of Forge's human controller: from `valid`, between min
     * and max, one at a time. From another player's hand the chooser
     * is choosing among cards Forge has shown them. Was a loud stub.
     */
    @Override
    public forge.game.card.CardCollectionView chooseCardsToDiscardFrom(
            Player discarder,
            SpellAbility sa,
            forge.game.card.CardCollection valid,
            int min,
            int max,
            forge.game.card.CardCollectionView visibleToChooser) {
        String whose = discarder == player ? "your hand" : discarder.getName() + "'s hand";
        String title = (min == max ? "Discard " + max : "Discard up to " + max) + " from " + whose;
        return new forge.game.card.CardCollection(
                chooseEntitiesForEffect(valid, min, max, null, sa, title, discarder, null));
    }

    /**
     * Optional additional costs (Entwine, Spree, Kicker, Buyback...) --
     * a port of Forge's human controller, which offers any number of
     * them: one at a time here, pass when done. Was a loud stub: Tooth
     * and Nail stopped the match.
     */
    @Override
    public java.util.List<forge.game.spellability.OptionalCostValue> chooseOptionalCosts(
            SpellAbility chosen, java.util.List<forge.game.spellability.OptionalCostValue> values) {
        java.util.List<forge.game.spellability.OptionalCostValue> left = new java.util.ArrayList<>(values);
        java.util.List<forge.game.spellability.OptionalCostValue> taken = new java.util.ArrayList<>();
        while (!left.isEmpty()) {
            java.util.List<String> texts = new java.util.ArrayList<>();
            left.forEach(v -> texts.add(String.valueOf(v)));
            int picked = askIndex("chooseOptionalCosts", texts, false,
                    "Pay any optional costs for " + chosen.getHostCard().getName()
                            + (taken.isEmpty() ? "?" : "? (" + taken.size() + " chosen; pass when done)"));
            if (picked < 0) {
                break;
            }
            taken.add(left.remove(picked));
        }
        return taken;
    }

    /**
     * Delve (Treasure Cruise) — PHASE_06 §6.92, P6-AN.
     *
     * Each card exiled from the graveyard pays {1} of the generic
     * cost; how many, and which, is the player's. Forge's own human
     * controller asks for "up to" that many from the graveyard; so
     * does this, one at a time, and passing is "no more". Was a loud
     * stub: any delve spell stopped the match.
     */
    @Override
    public forge.game.card.CardCollectionView chooseCardsToDelve(
            int genericAmount, forge.game.card.CardCollection grave) {
        int most = Math.min(genericAmount, grave.size());
        if (most == 0) {
            return forge.game.card.CardCollection.EMPTY;
        }
        return new forge.game.card.CardCollection(chooseEntitiesForEffect(
                grave, 0, most, null, null,
                "Delve: exile cards from your graveyard, each paying {1}", player, null));
    }

    /**
     * Convoke and Improvise — PHASE_06 §6.92, P6-AN.
     *
     * A port of Forge's own InputSelectCardsForConvokeOrImprovise:
     * tap creatures (Convoke) or artifacts (Improvise) to pay, one at
     * a time, pass when done. What each tap pays is Forge's
     * ManaCostBeingPaid: an artifact pays generic; a creature pays a
     * colour it has, and only a creature that could pay more than one
     * remaining colour asks which. A tap that cannot pay anything still
     * owed is not offered again. Was a loud stub.
     */
    @Override
    public java.util.Map<forge.game.card.Card, forge.card.mana.ManaCostShard> chooseCardsForConvokeOrImprovise(
            SpellAbility sa,
            forge.card.mana.ManaCost manaCost,
            forge.game.card.CardCollectionView untappedCards,
            boolean artifacts,
            boolean creatures,
            Integer maxReduction) {
        java.util.Map<forge.game.card.Card, forge.card.mana.ManaCostShard> chosen = new java.util.LinkedHashMap<>();
        forge.game.mana.ManaCostBeingPaid remaining = new forge.game.mana.ManaCostBeingPaid(manaCost);
        java.util.List<forge.game.card.Card> left = new java.util.ArrayList<>();
        untappedCards.forEach(left::add);
        int most = Math.min(manaCost.getCMC(), left.size());
        if (maxReduction != null) {
            most = Math.min(most, maxReduction);
        }
        String what = artifacts && creatures ? "an artifact or creature" : creatures ? "a creature" : "an artifact";
        String keyword = artifacts && creatures ? "Waterbend" : creatures ? "Convoke" : "Improvise";

        while (chosen.size() < most && !left.isEmpty() && !remaining.isPaid()) {
            java.util.LinkedHashMap<String, forge.game.card.Card> byId = new java.util.LinkedHashMap<>();
            java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
            for (forge.game.card.Card card : left) {
                String id = "card:" + card.getId();
                byId.put(id, card);
                labels.put(id, ViewerSnapshot.nameFor(card, player.getView()));
            }
            String choice;
            try {
                choice = host.gate().ask(
                        actedForSeat,
                        authorisedSeat,
                        "chooseCardsForConvokeOrImprovise",
                        new java.util.ArrayList<>(byId.keySet()),
                        false,
                        "Choose " + what + " to tap for " + keyword + ". Still owed: " + remaining
                                + " (or pass when done).",
                        pending -> host.publishDecision(pending, labels));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
            forge.game.card.Card picked = byId.get(choice);
            if (picked == null) {
                break;
            }
            left.remove(picked);
            byte colour;
            if (artifacts) {
                colour = forge.card.mana.ManaCostShard.COLORLESS.getColorMask();
            } else {
                forge.card.ColorSet colours = picked.getColor();
                if (colours.isMulticolor()) {
                    colours = forge.card.ColorSet.fromMask(colours.getColor() & remaining.getUnpaidColors());
                }
                colour = colours.isMulticolor()
                        ? chooseColorAllowColorless(keyword + " " + picked + " for which colour?", picked, colours)
                        : colours.getColor();
            }
            forge.card.mana.ManaCostShard shard = remaining.payManaViaConvoke(colour);
            if (shard != null) {
                chosen.put(picked, shard);
            }
        }
        return chosen;
    }

    /**
     * Searching for SEVERAL cards — the plural of
     * {@link #chooseSingleCardForZoneChange}.
     *
     * One line, straight through, which is exactly what Forge's
     * own human controller does with it.
     */
    @Override
    public java.util.List<forge.game.card.Card> chooseCardsForZoneChange(
            forge.game.zone.ZoneType destination,
            List<forge.game.zone.ZoneType> origin,
            SpellAbility sa,
            forge.game.card.CardCollection fetchList,
            int min,
            int max,
            forge.game.player.DelayedReveal delayedReveal,
            String selectPrompt,
            Player decider) {
        return chooseEntitiesForEffect(
                fetchList, min, max, delayedReveal, sa, selectPrompt, decider, null);
    }

    /**
     * What order do these go in — PHASE_06 §6.50, FORGE-RULE.
     *
     * Brainstorm puts two cards back on top of your library, and
     * which of them you draw next turn is the whole card. Ponder,
     * every "put the rest on the bottom", every multiple-card
     * move: Forge hands over a list and asks what order it should
     * be in.
     *
     * Asked ONE AT A TIME — "which of these goes first" until the
     * list is empty — because it needs no new protocol shape and
     * every answer is final on its own. Forge's desktop client
     * uses a drag-to-reorder dialog; the result is the same list.
     *
     * THE REVERSE AT THE END IS NOT OPTIONAL. Forge's own comment,
     * in the AI controller: "Cards going to the top of a deck are
     * returned in reverse order." Ordering the cards correctly and
     * then handing them back the wrong way round is a silent wrong
     * move — the player draws the card they meant to put second.
     * {@link #orderedMoveToTopOfLibrary} is Forge's, and decides
     * which end "first" means.
     */
    @Override
    public forge.game.card.CardCollectionView orderMoveToZoneList(
            forge.game.card.CardCollectionView cards,
            forge.game.zone.ZoneType destinationZone,
            SpellAbility source) {
        if (cards == null || cards.size() <= 1) {
            // One card is already in order.
            return cards;
        }

        // A GRAVEYARD IS NOT ORDERED unless something cares.
        //
        // Forge makes this a user preference and asks only when
        // the game says the order can matter — a card with
        // NeedsOrderedGraveyard, or an opponent's Bone Dancer. That
        // middle setting is the one ported: asking on every
        // creature that dies would be hundreds of questions a game
        // for an answer that changes nothing. A deliberate
        // reordering effect still asks.
        boolean deliberate = source != null
                && source.getApi() == forge.game.ability.ApiType.ReorderZone;
        if (!deliberate && destinationZone == forge.game.zone.ZoneType.Graveyard
                && !player.getGame().isGraveyardOrdered(player)) {
            return cards;
        }

        boolean topOfDeck = orderedMoveToTopOfLibrary(destinationZone, source);
        String end = endDescription(destinationZone, topOfDeck);
        if (end == null) {
            // Forge's default branch: a destination it does not
            // order. Returned untouched rather than guessed at.
            return cards;
        }

        java.util.List<forge.game.card.Card> remaining = new java.util.ArrayList<>();
        cards.forEach(remaining::add);
        forge.game.card.CardCollection ordered = new forge.game.card.CardCollection();

        while (remaining.size() > 1) {
            java.util.LinkedHashMap<String, forge.game.card.Card> byId =
                    new java.util.LinkedHashMap<>();
            java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
            for (forge.game.card.Card card : remaining) {
                // §6.46 — typed, like every other object id.
                String id = "order:card:" + card.getId();
                byId.put(id, card);
                labels.put(id, String.valueOf(card));
            }

            forge.game.card.Card picked;
            try {
                String choice =
                        host.gate().ask(
                                actedForSeat,
                                authorisedSeat,
                                "orderMoveToZoneList",
                                new java.util.ArrayList<>(byId.keySet()),
                                // Mandatory: they are all going
                                // somewhere, and in SOME order. The
                                // only question is which.
                                true,
                                "Which goes " + end + "? (" + remaining.size() + " left)",
                                pending -> host.publishDecision(pending, labels));
                picked = byId.get(choice);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                picked = null;
            }

            if (picked == null) {
                // Mandatory, so this means the list moved. Keep
                // the order Forge handed over for what is left,
                // which is the only arrangement certainly valid.
                break;
            }
            remaining.remove(picked);
            ordered.add(picked);
        }
        ordered.addAll(remaining);

        if (topOfDeck) {
            // Forge's own rule, and its own comment: the top of a
            // deck is taken in reverse.
            java.util.Collections.reverse(ordered);
        }
        return ordered;
    }

    /**
     * Which end the player is choosing for, in words.
     *
     * Null for a destination Forge does not order — its switch
     * falls through to "Not Ordered" and hands the list back
     * untouched, and so does this.
     */
    private static String endDescription(
            forge.game.zone.ZoneType destination, boolean topOfDeck) {
        return switch (destination) {
            case Library, PlanarDeck, SchemeDeck, AttractionDeck, ContraptionDeck ->
                    topOfDeck ? "closest to the top" : "closest to the bottom";
            case Graveyard -> "closest to the bottom";
            case Battlefield, Exile, Stack, None -> "first";
            default -> null;
        };
    }

    /**
     * In what order are the parts of a cost paid — §6.91.
     *
     * NOT ASKED, and that is Forge's own answer rather than a
     * shortcut. Its human controller returns the order it was
     * given unless the player has switched on a FULL CONTROL flag
     * (ChooseCostOrder), an expert option that is off by default
     * and that Proxic has no equivalent of.
     *
     * So this takes nothing away: tapping before paying mana or
     * the other way round changes nothing a player can act on,
     * which is why Forge hides the question too.
     */
    @Override
    public List<forge.game.cost.CostPart> orderCosts(List<forge.game.cost.CostPart> costs) {
        return costs;
    }

    // ---- values that are not game objects ------------------------------
    //
    // PHASE_06 §6.105, P6-AG/AH/AI. Everything above chooses a
    // THING on the board; these choose a word. Pithing Needle names
    // a card that may not be in the game at all, Adaptive Automaton
    // names a creature type, Mind Bend names a colour.
    //
    // The protocol carries them the same way it carries numbers
    // (see announceRequirements): one option per value, with the
    // value in the id. Nothing here invents the list — Forge says
    // which types and which colours are allowed, which is the whole
    // of P6-AH's "authoritative allowed values rather than a
    // hand-maintained frontend rules list".

    /**
     * Name a type — creature, land, artifact, whatever Forge asks.
     *
     * FORGE supplies `validTypes`. It is the game's own list for
     * this effect, already filtered, and this adapter neither adds
     * to it nor sorts it into an opinion.
     *
     * Optional when Forge says so, and then passing is a real
     * answer rather than a cancel.
     */
    @Override
    public String chooseSomeType(
            String kindOfType,
            SpellAbility sa,
            java.util.Collection<String> validTypes,
            boolean isOptional) {
        java.util.List<String> types = new java.util.ArrayList<>(validTypes);
        if (types.isEmpty()) {
            return null;
        }
        if (!isOptional && types.size() == 1) {
            return types.get(0);
        }
        String kind = kindOfType.toLowerCase(java.util.Locale.ROOT);
        String prompt = "Choose a " + kind + " type.";
        // A text change (Mind Bend) asks TWICE with the same words --
        // the type to replace, then its replacement -- and Forge's own
        // prompt cannot tell them apart. Which one this is follows
        // ChangeTextEffect's order: the first question of a resolution
        // is the word to replace (found 2026-10-20, check-text-effects).
        if (sa != null && sa.getApi() == forge.game.ability.ApiType.ChangeText) {
            boolean second = sa == changeTextAsked;
            changeTextAsked = second ? null : sa;
            prompt = sa.getHostCard().getName() + ": "
                    + (second ? "choose the new " + kind + " type to put in its place."
                              : "choose the " + kind + " type to replace.");
        }
        return pickValue("chooseSomeType", prompt, types, isOptional, types.get(0));
    }

    /** The text change whose first type question has been asked. */
    private SpellAbility changeTextAsked;

    /** Which kind of protection — the same shape, Forge's list. */
    @Override
    public String chooseProtectionType(SpellAbility sa, List<String> choices) {
        if (choices == null || choices.isEmpty()) {
            return null;
        }
        if (choices.size() == 1) {
            return choices.get(0);
        }
        return pickValue(
                "chooseProtectionType",
                "Protection from what?",
                choices,
                false,
                choices.get(0));
    }

    /**
     * Name a colour — §6.105, P6-AI.
     *
     * Forge's own short-circuits first, and they are not
     * optimisations: no colours is no question, and one colour is
     * not a choice either.
     */
    @Override
    public byte chooseColor(String message, SpellAbility sa, forge.card.ColorSet colors) {
        return switch (colors.countColors()) {
            case 0 -> 0;
            case 1 -> colors.getColor();
            default -> askColor(message, colors, false);
        };
    }

    /** The same, where colourless is itself an answer. */
    @Override
    public byte chooseColorAllowColorless(
            String message, forge.game.card.Card c, forge.card.ColorSet colors) {
        if (colors.countColors() == 0) {
            return 0;
        }
        return askColor(message, colors, true);
    }

    /**
     * Several colours at once.
     *
     * One at a time, like every other many-of-something here. The
     * first `min` cannot be declined and the rest can.
     */
    @Override
    public forge.card.ColorSet chooseColors(
            String message,
            SpellAbility sa,
            int min,
            int max,
            forge.card.ColorSet options) {
        byte chosen = 0;
        int taken = 0;
        java.util.List<Byte> remaining = new java.util.ArrayList<>();
        for (byte color : forge.card.mana.ManaAtom.MANATYPES) {
            if (options.hasAnyColor(color)) {
                remaining.add(color);
            }
        }

        while (taken < max && !remaining.isEmpty()) {
            java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
            for (byte color : remaining) {
                labels.put("color:" + color, forge.card.MagicColor.toLongString(color));
            }
            boolean mandatory = taken < min;
            String answer =
                    askOne(
                            "chooseColors",
                            message + (mandatory
                                    ? " (" + (min - taken) + " more needed)"
                                    : " (up to " + (max - taken) + " more, or pass)"),
                            labels,
                            mandatory);
            if (answer == null) {
                break;
            }
            byte picked = Byte.parseByte(answer.substring("color:".length()));
            chosen |= picked;
            taken++;
            remaining.remove(Byte.valueOf(picked));
        }
        return forge.card.ColorSet.fromMask(chosen);
    }

    /** One colour, asked. */
    private byte askColor(String message, forge.card.ColorSet colors, boolean allowColorless) {
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        if (allowColorless) {
            labels.put("color:0", "Colourless");
        }
        for (byte color : forge.card.mana.ManaAtom.MANATYPES) {
            if (colors.hasAnyColor(color)) {
                labels.put("color:" + color, forge.card.MagicColor.toLongString(color));
            }
        }
        String answer = askOne("chooseColor", message, labels, true);
        if (answer == null) {
            return allowColorless ? 0 : colors.getColor();
        }
        return Byte.parseByte(answer.substring("color:".length()));
    }

    /**
     * Name a card — §6.105, §6.106, P6-AG.
     *
     * This overload is the answerable one: Forge hands over the
     * faces it will accept, and they become the options.
     */
    @Override
    public String chooseCardName(
            SpellAbility sa, List<forge.card.ICardFace> faces, String message) {
        if (faces == null || faces.isEmpty()) {
            return null;
        }
        java.util.List<String> names = new java.util.ArrayList<>();
        for (forge.card.ICardFace face : faces) {
            names.add(face.getName());
        }
        if (names.size() == 1) {
            return names.get(0);
        }
        return pickValue("chooseCardName", message, names, false, names.get(0));
    }

    /**
     * Name a card out of the WHOLE POOL — P6-AG.
     *
     * Pithing Needle, Meddling Mage, Cabal Therapy: any card name,
     * in the game or not. Forge's human path lists every face in
     * the database that its predicate accepts and lets the player
     * search them; this is that, faithfully, with the search done
     * over the protocol (owner decision 2026-10-20: search, then
     * pick).
     *
     * EVERY allowed name is an option, held by the gate, so an
     * answer is checked exactly as any other: it must be one of the
     * names Forge allowed. The question goes out marked searchable
     * and without them -- ~30,000 names is not a list to send -- and
     * the player is sent what they search for, fifty at a time.
     * Nothing here decides which cards are worth naming.
     *
     * Then Forge's own second check, also ported: the name must
     * also satisfy the effect's `valid` restriction ("a nonland
     * card name"), tested on a real card instance, and a name that
     * fails is asked for again -- Forge's loop, not a guess.
     */
    @Override
    public String chooseCardName(
            SpellAbility sa,
            java.util.function.Predicate<forge.card.ICardFace> faces,
            String valid,
            String message) {
        forge.StaticData data = forge.StaticData.instance();
        data.ensureAllCardsLoaded();
        java.util.List<String> names =
                data.getCommonCards().streamAllFaces()
                        .filter(faces)
                        .map(forge.card.ICardFace::getName)
                        .distinct()
                        .sorted()
                        .collect(java.util.stream.Collectors.toList());
        if (names.isEmpty()) {
            return "";
        }
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        for (String name : names) {
            labels.put("name:" + labels.size(), name);
        }

        while (true) {
            String choice;
            try {
                // Mandatory: Forge's chooser has no cancel here.
                choice = host.gate().ask(
                        actedForSeat, authorisedSeat, "chooseCardName",
                        new java.util.ArrayList<>(labels.keySet()),
                        true, message, true,
                        pending -> host.publishDecision(pending, labels));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return "";
            }
            String name = labels.get(choice);
            if (name == null) {
                return "";
            }
            if (valid == null || valid.isBlank()) {
                return name;
            }
            forge.item.PaperCard paper = data.getCommonCards().getCard(name);
            if (paper == null) {
                return name;
            }
            forge.game.card.Card instance = forge.game.card.Card.fromPaperCard(paper, player);
            forge.game.card.CardUtil.turnToRightFace(name, instance);
            if (instance.isValid(valid.split(","), sa.getHostCard().getController(),
                    sa.getHostCard(), sa)) {
                return name;
            }
            // Not a name this effect accepts. Forge asks again.
            host.note(actedForSeat, name + " cannot be named here.");
        }
    }

    /**
     * Heads or tails, and its relatives — P6-AM.
     *
     * FORGE FLIPS THE COIN. This is only the call, and the
     * difference matters: the outcome is the engine's, so a
     * reconnect cannot reroll it and a duplicate answer cannot
     * either — the gate has already closed the question by then.
     *
     * Forge supplies a default for the cases where nobody can be
     * asked, and it is used when the wait is interrupted.
     */
    @Override
    public boolean chooseBinary(
            SpellAbility sa,
            String question,
            forge.game.player.PlayerController.BinaryChoiceType kind,
            Boolean defaultVal) {
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        labels.put("binary:yes", firstOf(kind));
        labels.put("binary:no", secondOf(kind));
        String answer =
                askOne(
                        "chooseBinary",
                        question == null || question.isBlank() ? labelOf(kind) : question,
                        labels,
                        true);
        if (answer == null) {
            return defaultVal != null && defaultVal;
        }
        return "binary:yes".equals(answer);
    }

    /** Forge's own words for each side of a binary choice. */
    private static String labelOf(
            forge.game.player.PlayerController.BinaryChoiceType kind) {
        return switch (kind) {
            case HeadsOrTails -> "Call the coin.";
            case TapOrUntap -> "Tap or untap?";
            case PlayOrDraw -> "Play or draw?";
            case OddsOrEvens -> "Odds or evens?";
            case UntapOrLeaveTapped -> "Untap, or leave it tapped?";
            case LeftOrRight -> "Left or right?";
            case AddOrRemove -> "Add or remove?";
            case IncreaseOrDecrease -> "Increase or decrease?";
        };
    }

    private static String firstOf(
            forge.game.player.PlayerController.BinaryChoiceType kind) {
        return switch (kind) {
            case HeadsOrTails -> "Heads";
            case TapOrUntap -> "Tap";
            case PlayOrDraw -> "Play";
            case OddsOrEvens -> "Odds";
            case UntapOrLeaveTapped -> "Untap";
            case LeftOrRight -> "Left";
            case AddOrRemove -> "Add";
            case IncreaseOrDecrease -> "Increase";
        };
    }

    private static String secondOf(
            forge.game.player.PlayerController.BinaryChoiceType kind) {
        return switch (kind) {
            case HeadsOrTails -> "Tails";
            case TapOrUntap -> "Untap";
            case PlayOrDraw -> "Draw";
            case OddsOrEvens -> "Evens";
            case UntapOrLeaveTapped -> "Leave it tapped";
            case LeftOrRight -> "Right";
            case AddOrRemove -> "Remove";
            case IncreaseOrDecrease -> "Decrease";
        };
    }

    /** One value out of a list of words. */
    private String pickValue(
            String kind,
            String prompt,
            java.util.List<String> values,
            boolean optional,
            String fallback) {
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        for (String value : values) {
            // The value IS the id. These are not game objects, so
            // there is no object id to carry (§6.46 types it all
            // the same way regardless).
            labels.put("value:" + value, value);
        }
        String answer = askOne(kind, prompt, labels, !optional);
        if (answer == null) {
            return optional ? null : fallback;
        }
        return answer.substring("value:".length());
    }

    /** Ask, and give back the chosen id, or null for a pass. */
    private String askOne(
            String kind,
            String prompt,
            java.util.LinkedHashMap<String, String> labels,
            boolean mandatory) {
        try {
            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            kind,
                            new java.util.ArrayList<>(labels.keySet()),
                            mandatory,
                            prompt,
                            pending -> host.publishDecision(pending, labels));
            return DecisionGate.PASS.equals(choice) ? null : choice;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    /** How many revealed cards a prompt names before counting. */
    private static final int REVEAL_LIMIT = 12;

    /** What one mode costs out of a Pawprint budget. */
    private static int pawprintOf(forge.game.spellability.AbilitySub mode) {
        String paw = mode.getParam("Pawprint");
        if (paw == null) {
            return 0;
        }
        return forge.game.ability.AbilityUtils.calculateAmount(mode.getHostCard(), paw, mode);
    }

    /**
     * Several triggers at once — which resolves first?
     *
     * When more than one of your abilities triggers on the same
     * event, you choose the order they go on the stack. Forge
     * decides when that is a REAL choice and this ports its
     * rule: it asks when the abilities are not all triggers,
     * when one targets, when a trigger asks for duplicates to be
     * ordered, or when their descriptions differ. Two identical
     * triggers are not a choice.
     *
     * Mandatory, because the game cannot continue until they are
     * on the stack.
     */
    private List<SpellAbility> orderSimultaneous(List<SpellAbility> abilities) {
        if (abilities.size() < 2) {
            return abilities;
        }
        boolean needPrompt = !abilities.get(0).isTrigger();
        String firstText = String.valueOf(abilities.get(0));
        for (int i = 1; i < abilities.size(); i++) {
            SpellAbility current = abilities.get(i);
            if (current.isTrigger()) {
                needPrompt |= current.getTrigger().hasParam("OrderDuplicates");
            } else if (current.usesTargeting()) {
                needPrompt = true;
            }
            if (!needPrompt && !String.valueOf(current).equals(firstText)) {
                needPrompt = true;
            }
        }
        if (!needPrompt) {
            return abilities;
        }

        // Asked one at a time: "which of these resolves first?",
        // then again with the rest. The first answer is the one
        // that resolves first, which is why the caller puts the
        // list on the stack backwards.
        List<SpellAbility> remaining = new java.util.ArrayList<>(abilities);
        List<SpellAbility> ordered = new java.util.ArrayList<>();
        while (remaining.size() > 1) {
            java.util.LinkedHashMap<String, SpellAbility> byId =
                    new java.util.LinkedHashMap<>();
            java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
            for (SpellAbility ability : remaining) {
                String id = "trigger:" + byId.size() + ":card:" + ability.getHostCard().getId();
                byId.put(id, ability);
                labels.put(id, describe(ability));
            }
            try {
                String choice =
                        host.gate().ask(
                                actedForSeat,
                                authorisedSeat,
                                "orderSimultaneousAbilities",
                                new java.util.ArrayList<>(byId.keySet()),
                                true,
                                pending -> host.publishDecision(pending, labels));
                SpellAbility chosen = byId.get(choice);
                if (chosen == null) {
                    break;
                }
                ordered.add(chosen);
                remaining.remove(chosen);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        ordered.addAll(remaining);
        return ordered;
    }

    /**
     * Put the simultaneous abilities on the stack, in order.
     *
     * A faithful port of Forge's human path. The loop runs
     * BACKWARDS on purpose: the stack resolves last-in-first-out,
     * so the ability the player wants to resolve first has to go
     * on last. Copied spells take a different route onto the
     * stack, which is Forge's business and is copied verbatim
     * rather than simplified.
     */
    @Override
    public void orderAndPlaySimultaneousSa(List<SpellAbility> activePlayerSAs) {
        List<SpellAbility> ordered = orderSimultaneous(activePlayerSAs);
        for (int i = ordered.size() - 1; i >= 0; i--) {
            SpellAbility next = ordered.get(i);
            if (next.isTrigger() && !next.isCopied()) {
                forge.game.player.PlaySpellAbility.playSpellAbility(this, player, next);
                continue;
            }
            if (next.isCopied()) {
                if (next.isSpell()) {
                    if (!next.getHostCard().isInZone(forge.game.zone.ZoneType.Stack)) {
                        next.setHostCard(
                                player.getGame().getAction().moveToStack(next.getHostCard(), next));
                    } else {
                        player.getGame().getStackZone().add(next.getHostCard());
                    }
                }
                if (next.isMayChooseNewTargets()) {
                    next.setupNewTargets(player);
                }
            }
            player.getGame().getStack().add(next);
        }
    }

    /**
     * A yes-or-no question, asked properly.
     *
     * Forge has a great many of these — use this trigger? pay
     * this cost? take this action? — and they are all the same
     * shape: two explicit answers, neither of them a pass.
     *
     * Deliberately NOT modelled as "one option, and passing
     * means no". A pass is "I decline to act"; "no" is an
     * answer. Collapsing them would mean a disconnected player
     * silently answering no to everything, which §6.112 forbids
     * for exactly this reason.
     *
     * @param fallback what to assume if the worker is shutting
     *                 down mid-question. Chosen by the caller,
     *                 because the safe answer differs: declining
     *                 an optional trigger is safe, and declining
     *                 a mandatory payment is not.
     */
    private boolean askYesNo(String kind, String question, boolean fallback) {
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        labels.put("confirm:yes", "Yes — " + question);
        labels.put("confirm:no", "No");
        try {
            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            kind,
                            new java.util.ArrayList<>(labels.keySet()),
                            true,
                            pending -> host.publishDecision(pending, labels));
            return "confirm:yes".equals(choice);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return fallback;
        }
    }

    /**
     * Use this optional trigger? — §6.105.
     *
     * Forge's own short-circuit is ported first and it is not an
     * optimisation: a trigger that COSTS something can always be
     * declined by not paying, so asking here as well would ask
     * the same question twice and let a player say yes and then
     * find they had already said no.
     */
    @Override
    public boolean confirmTrigger(forge.game.trigger.WrappedAbility wrapper) {
        SpellAbility sa = wrapper.getWrappedAbility();
        if (sa.hasParam("Cost") && !"0".equals(sa.getParam("Cost"))) {
            return true;
        }
        String card = String.valueOf(wrapper.getTrigger().getHostCard());
        return askYesNo(
                "confirmTrigger",
                "use the triggered ability of " + card + "?",
                // Declining an OPTIONAL trigger is the safe
                // answer when nobody is there to say.
                false);
    }

    /**
     * Choose one thing for an effect — §6.90, §6.93.
     *
     * The generic chooser, and the one most effects end up in:
     * "sacrifice a creature", "exile a card", "choose a player".
     * Forge supplies both the candidates and the WORDING, and
     * the wording is what makes it answerable — without it the
     * player sees a list of names and no question.
     *
     * Forge's own short-circuits are ported: an empty list is
     * no choice, and a single candidate you are REQUIRED to pick
     * is not a choice either. A single OPTIONAL candidate still
     * asks, because "none" is a real answer there.
     *
     * `delayedReveal` carries cards Forge would show the player
     * while they choose — the top of a library, say. It used to
     * be dropped here, which left a choice that depends on seeing
     * them being made blind; it is now part of the prompt. See
     * {@link #revealed}.
     */
    /**
     * Searching a library, a graveyard or an exile pile — §6.42,
     * §6.44, §6.50.
     *
     * Rampant Growth finds a basic land; a tutor finds anything.
     * FORGE builds the list: it has already applied the effect's
     * restriction, so what arrives here is exactly what may be
     * taken, and nothing in this file re-reads the card.
     *
     * Delegated to {@link #chooseSingleEntityForEffect}, which is
     * what Forge's own human controller does with this method —
     * one line, passing everything straight through. Both of them
     * then share the delayed reveal.
     *
     * THIS IS THE MOST SENSITIVE LIST IN THE GAME. The options are
     * cards out of a hidden zone, named. They are safe because a
     * decision travels to ONE seat: the frame carries
     * authorisedSeat and the server sends every other participant
     * a bare "cleared" with no options on it (MatchDecisionsTest
     * asserts exactly that). §6.42's rule is kept the same way the
     * snapshots keep it — by what is put on the wire, not by what
     * a page chooses to draw.
     */
    @Override
    public forge.game.card.Card chooseSingleCardForZoneChange(
            forge.game.zone.ZoneType destination,
            List<forge.game.zone.ZoneType> origin,
            SpellAbility sa,
            forge.game.card.CardCollection fetchList,
            forge.game.player.DelayedReveal delayedReveal,
            String selectPrompt,
            boolean isOptional,
            Player decider) {
        return chooseSingleEntityForEffect(
                fetchList, delayedReveal, sa, selectPrompt, isOptional, decider, null);
    }

    @Override
    public <T extends forge.game.GameEntity> T chooseSingleEntityForEffect(
            forge.util.collect.FCollectionView<T> optionList,
            forge.game.player.DelayedReveal delayedReveal,
            SpellAbility sa,
            String title,
            boolean isOptional,
            Player targetedPlayer,
            java.util.Map<String, Object> params) {
        if (optionList == null || optionList.isEmpty()) {
            return null;
        }
        java.util.List<T> candidates = new java.util.ArrayList<>();
        optionList.forEach(candidates::add);

        // WHAT ELSE THE PLAYER IS LOOKING AT.
        //
        // A "delayed reveal" is Forge's word for cards shown to the
        // chooser that are not themselves choices: look at the top
        // seven, put a permanent onto the battlefield, and the four
        // lands you also saw are the delayed reveal. Forge's human
        // path puts them in the same dialog as the choices.
        //
        // This was being dropped on the floor, so the question
        // arrived without the context that made it a decision
        // rather than a guess. It goes in the prompt, which travels
        // to the one authorised seat exactly as the options do.
        String context = revealed(delayedReveal);
        String prompt = context.isEmpty() ? title : title + " " + context;

        // Normally one candidate that cannot be declined is not a
        // question. It is when there is something to show: Forge
        // reveals in that case too, and a player who looked at
        // seven cards should learn what was in them.
        if (!isOptional && candidates.size() == 1 && context.isEmpty()) {
            return candidates.get(0);
        }

        java.util.LinkedHashMap<String, T> byId = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        for (T candidate : candidates) {
            // §6.46 — typed, because a card id and a player id
            // share a number space.
            String id = (candidate instanceof forge.game.card.Card card)
                    ? "card:" + card.getId()
                    : "player:" + candidate.getId();
            byId.put(id, candidate);
            labels.put(id, String.valueOf(candidate));
        }

        try {
            String choice =
                    host.gate().ask(
                            actedForSeat,
                            authorisedSeat,
                            "chooseSingleEntityForEffect",
                            new java.util.ArrayList<>(byId.keySet()),
                            !isOptional,
                            prompt,
                            pending -> host.publishDecision(pending, labels));
            if (DecisionGate.PASS.equals(choice)) {
                // Only reachable when the choice was optional;
                // the gate refuses a pass otherwise.
                return null;
            }
            T chosen = byId.get(choice);
            // A required choice whose answer no longer exists
            // still has to produce something, or the effect
            // stalls. The first candidate is the only answer
            // certainly still valid.
            return chosen == null && !isOptional ? candidates.get(0) : chosen;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return isOptional ? null : candidates.get(0);
        }
    }

    /**
     * "Do you want to do this?" — the general form.
     *
     * Forge supplies the wording every time, which is what makes
     * these answerable: the kind says it is a confirmation and
     * the message says what of.
     *
     * When `options` is non-empty this is not a yes/no at all —
     * Forge is offering its own named answers, and they are
     * shown instead of inventing Yes and No.
     */
    @Override
    public boolean confirmAction(
            SpellAbility sa,
            forge.game.player.PlayerActionConfirmMode mode,
            String message,
            List<String> options,
            forge.game.card.Card cardToShow,
            java.util.Map<String, Object> params) {
        if (options != null && !options.isEmpty()) {
            java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
            for (String option : options) {
                labels.put("choice:" + labels.size(), option);
            }
            try {
                String choice =
                        host.gate().ask(
                                actedForSeat,
                                authorisedSeat,
                                "confirmAction",
                                new java.util.ArrayList<>(labels.keySet()),
                                true,
                                message,
                                pending -> host.publishDecision(pending, labels));
                // Forge's own convention: the FIRST option is the
                // affirmative one.
                return "choice:0".equals(choice);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return askYesNo("confirmAction", message, false);
    }

    /** Apply this replacement effect? Forge asks; the player answers. */
    @Override
    public boolean confirmReplacementEffect(
            forge.game.replacement.ReplacementEffect replacement,
            SpellAbility effect,
            forge.game.GameEntity affected,
            String question) {
        return askYesNo("confirmReplacementEffect", question, false);
    }

    @Override
    public boolean confirmStaticApplication(
            forge.game.card.Card host,
            forge.game.player.PlayerActionConfirmMode mode,
            String message,
            String logic) {
        return askYesNo("confirmStaticApplication", message, false);
    }

    /**
     * Pay this optional cost?
     *
     * Declining is the safe fallback: not paying means the thing
     * does not happen, which is recoverable. Paying something
     * nobody agreed to is not.
     */
    @Override
    public boolean confirmPayment(
            forge.game.cost.CostPart costPart, String question, SpellAbility sa) {
        return askYesNo("confirmPayment", question, false);
    }

    /**
     * Play something an effect told you to play.
     *
     * "You may cast target card without paying its mana cost"
     * and similar. A faithful port with no choice in it: any
     * decision inside comes back through this controller as
     * usual.
     */
    @Override
    public boolean playSaFromPlayEffect(SpellAbility targetSa) {
        return forge.game.player.PlaySpellAbility.playSpellAbility(this, player, targetSa);
    }

    /** A triggered ability resolving. Also a port, also no choice. */
    @Override
    public boolean playTrigger(
            forge.game.card.Card host,
            forge.game.trigger.WrappedAbility wrapper,
            boolean isMandatory) {
        return forge.game.player.PlaySpellAbility.playSpellAbilityNoStack(
                this, player, wrapper, false);
    }

    /**
     * §6.94 — combat, which is the player's and Forge's together.
     *
     * Who attacks and who blocks is entirely the player's. What
     * is LEGAL is Forge's, asked through CombatUtil every time.
     * An interruption leaves combat as it stands rather than
     * inventing attackers: an empty attack is a legal turn, and
     * a made-up one is not recoverable.
     */
    @Override
    public void declareAttackers(Player attacker, forge.game.combat.Combat combat) {
        try {
            new CombatChoices(host, actedForSeat, authorisedSeat, player.getView())
                    .declareAttackers(attacker, combat);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Override
    public java.util.Map<forge.game.card.Card, Integer> assignCombatDamage(
            forge.game.card.Card attacker,
            forge.game.card.CardCollectionView blockers,
            forge.game.card.CardCollectionView remaining,
            int damageDealt,
            forge.game.GameEntity defender,
            boolean overrideOrder) {
        try {
            return new CombatChoices(host, actedForSeat, authorisedSeat, player.getView())
                    .assignCombatDamage(attacker, blockers, damageDealt, defender, overrideOrder);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            // All of it to the first blocker: a legal assignment,
            // and better than none while the worker is stopping.
            java.util.Map<forge.game.card.Card, Integer> fallback = new java.util.HashMap<>();
            fallback.put(blockers.isEmpty() ? null : blockers.get(0), damageDealt);
            return fallback;
        }
    }

    @Override
    public void declareBlockers(Player defender, forge.game.combat.Combat combat) {
        try {
            new CombatChoices(host, actedForSeat, authorisedSeat, player.getView())
                    .declareBlockers(defender, combat);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Labels for a client that has no game state yet.
     *
     * §6.49 — presentation hints, not authority. When viewer
     * snapshots exist the client will identify an action from the
     * state it already holds (§6.48), and these become redundant
     * rather than load-bearing.
     */
    private java.util.LinkedHashMap<String, String> labelsFor(
            java.util.LinkedHashMap<String, SpellAbility> byId) {
        java.util.LinkedHashMap<String, String> labels = new java.util.LinkedHashMap<>();
        byId.forEach((id, sa) -> labels.put(id, describe(sa)));
        return labels;
    }

    /**
     * One action, with WHAT IT COSTS.
     *
     * Reported by the owner: on turn one with no lands, three
     * instants were offered and none could be cast. They were
     * right that it looks wrong, and the cost is the missing
     * half of the picture -- "Fiery Temper" says nothing about
     * affordability, "Fiery Temper — {2}{R}" says everything when
     * the battlefield is empty.
     *
     * This is a LEGIBILITY fix and not a filter, deliberately.
     * Screening the list by affordability would mean deciding
     * what a board can pay, which Forge does not offer outside
     * its AI (CostPartMana.canPay returns true unconditionally)
     * and which hides legal plays the moment anything reduces a
     * cost, grants convoke, or plays for free. §6.50's second
     * rules engine is wrong in exactly the cases people build
     * decks around, so the player is told the cost and left to
     * judge.
     */
    private String describe(SpellAbility sa) {
        // P6-I — as THIS player may know it: a face-down card's own
        // name is empty, which left its controller choosing between
        // options that began " — {1}{U} — Morph".
        String name = spellName(sa);
        String cost = costOf(sa);
        String what = String.valueOf(sa).trim();

        // Forge's own description often repeats the card name
        // ("Hellspark Elemental - Creature 3 / 1") and, for a
        // mana ability, the cost as well ("{T}: Add {R}"). Seen
        // on screen, the line read "Hellspark Elemental — {1}{R}
        // — Hellspark Elemental - Creature 3 / 1", which buries
        // the only part that differs between two options.
        if (what.startsWith(name)) {
            what = what.substring(name.length()).replaceFirst("^\s*[-–—:]\s*", "").trim();
        }
        if (!cost.isEmpty() && what.startsWith(cost)) {
            cost = "";
        }

        StringBuilder label = new StringBuilder(name);
        if (!cost.isEmpty()) {
            label.append(" — ").append(cost);
        }
        if (!what.isEmpty()) {
            label.append(" — ").append(what);
        }
        return label.toString();
    }

    /**
     * What this costs, from wherever Forge keeps it.
     *
     * An ACTIVATED ability carries its own pay costs; a SPELL
     * usually does not, and the mana cost lives on the card. The
     * first version read only the ability's and showed nothing
     * at all for every spell -- which is precisely the case the
     * owner reported.
     */
    private String costOf(SpellAbility sa) {
        forge.game.cost.Cost costs = sa.getPayCosts();
        if (costs != null) {
            String text = costs.toString();
            if (text != null && !text.isBlank() && !"".equals(text.trim())) {
                // Cost text is Forge's TEMPLATE: a cost that names its
                // own card says "CARDNAME", which Forge substitutes
                // when it shows it. Seen on a graveyard ability as
                // "{3}{U}, Exile CARDNAME from your graveyard".
                return forge.util.TextUtil.fastReplace(
                        text.trim(), "CARDNAME", sa.getHostCard().getName());
            }
            // Some abilities carry a mana cost whose TEXT is blank -- a
            // Room's "Unlock Locker Room" costs {4}{U}, and fell through to
            // the card's open door, {U} (found 2026-10-20, P6-AJ).
            if (costs.hasManaCost()) {
                String mana = costs.getTotalMana().toString().trim();
                if (!mana.isEmpty()) {
                    return mana;
                }
            }
        }
        // The FACE this spell is cast from, when it has one: Fire's {1}{R},
        // Stomp's {1}{R}, a Room door's own cost. The card's mana cost is
        // the combined one ({2}{R}{U} for Fire // Ice), which put the
        // wrong price on every half (found by the P6-AJ scenarios,
        // 2026-10-20). A fused cast's state is the whole card, so it keeps
        // the combined cost, which is what fusing costs.
        forge.card.mana.ManaCost mana = sa.isSpell() && sa.getCardState() != null
                ? sa.getCardState().getManaCost()
                : sa.getHostCard().getManaCost();
        return mana == null ? "" : mana.toString().trim();
    }

    /**
     * The name a spell is cast UNDER: its face's ("Fire", "Stomp", "Locker
     * Room") rather than the whole card's. Face-down cards keep
     * {@link ViewerSnapshot#nameFor}'s rules.
     */
    private String spellName(SpellAbility sa) {
        forge.game.card.Card host = sa.getHostCard();
        if (sa.isSpell() && !host.isFaceDown() && sa.getCardState() != null) {
            String face = sa.getCardState().getName();
            if (face != null && !face.isBlank()) {
                return face;
            }
        }
        return ViewerSnapshot.nameFor(host, player.getView());
    }

    // ---- notifications, not decisions ------------------------------------

    /**
     * §6.96, §6.98 — FORGE says these cards are unsupported.
     *
     * Not a decision: Forge is telling us, at game start, that it
     * cannot play some of what is in the deck. Swallowing it would
     * mean a match that starts and then behaves as though those
     * cards were not there — a game that looks fine and is subtly
     * not the game the player built.
     *
     * Recorded on the host so the launch can refuse rather than
     * proceed. The preflight should have caught it first; this is
     * where Forge gets the final word.
     */
    @Override
    public void revealUnsupported(
            java.util.Map<Player, java.util.List<forge.item.PaperCard>> unsupported) {
        for (java.util.List<forge.item.PaperCard> cards : unsupported.values()) {
            for (forge.item.PaperCard card : cards) {
                host.noteUnsupported(card.getName());
            }
        }
    }

    /**
     * Forge SHOWS this player some cards — §6.42, P6-J.
     *
     * "Look at the top card of your library" (Delver of Secrets),
     * "reveal your hand", a card revealed to every player: Forge calls
     * this on the controller of EACH player entitled to see them, and
     * only those. So telling this player alone is the hidden-
     * information rule, followed rather than re-derived.
     *
     * This was a no-op, on the reasoning that viewer snapshots would
     * carry reveals. They do not carry libraries, so a player who
     * "looked at" a card never saw it: Delver's controller was asked
     * "Reveal cards to other players?" about a card nobody had shown
     * them, and an opponent never saw what was revealed to them.
     * Found while building the multi-face check (P6-BF).
     *
     * A NOTICE, in Forge's own wording -- the per-seat list every
     * snapshot already carries. How a reveal finally looks is
     * Phase 7's; that it reaches the right player is this phase's.
     */
    @Override
    public void reveal(
            forge.game.card.CardCollectionView cards,
            forge.game.zone.ZoneType zone,
            Player to,
            String message,
            boolean addSuffix) {
        java.util.List<String> names = new java.util.ArrayList<>();
        for (forge.game.card.Card card : cards) {
            names.add(card.getName());
        }
        tellRevealed(names, zone, to == null ? null : to.getName(), to == player, message, addSuffix);
    }

    @Override
    public void reveal(
            java.util.List<forge.game.card.CardView> cards,
            forge.game.zone.ZoneType zone,
            forge.game.player.PlayerView to,
            String message,
            boolean addSuffix) {
        java.util.List<String> names = new java.util.ArrayList<>();
        for (forge.game.card.CardView card : cards) {
            names.add(card.getName());
        }
        tellRevealed(names, zone, to == null ? null : to.getName(),
                to != null && to.equals(player.getView()), message, addSuffix);
    }

    /** Forge's human wording, as a notice to this player only. */
    private void tellRevealed(
            java.util.List<String> names,
            forge.game.zone.ZoneType zone,
            String ownerName,
            boolean own,
            String message,
            boolean addSuffix) {
        String whose = own ? "your" : (ownerName == null ? "a player's" : ownerName + "'s");
        String where = whose + " " + zone.getTranslatedName().toLowerCase(java.util.Locale.ROOT);
        String text;
        if (names.isEmpty()) {
            text = "There are no cards in " + where + ".";
        } else {
            String said = message == null || message.isBlank()
                    ? "Looking at " + where
                    : (addSuffix ? message + " " + where : message);
            text = said + ": " + String.join(", ", names);
        }
        host.note(actedForSeat, text);
    }

    /**
     * Forge telling the UI to expect input, and to stop expecting
     * it. Nothing to do: this controller does not drive a UI, and
     * when it drives a browser the DECISION message is what the
     * client waits on, not a hint that one may be coming.
     */
    @Override
    public void awaitNextInput() {
        // see above
    }

    @Override
    public void cancelAwaitNextInput() {
        // see above
    }

    @Override
    public void autoPassCancel() {
        // Auto-pass is Phase 7's (§6.191 records why it is needed
        // and warns it must not hide a real response opportunity).
        // Nothing here has one to cancel.
    }

    /**
     * Forge reporting a value it chose or computed.
     *
     * A notification, and this slice has nowhere to show it.
     * Becomes a presentation event when the protocol exists
     * (§6.49: events are hints, the snapshot is authoritative).
     */
    /**
     * Forge is telling this player something — P6-AM.
     *
     * The result of a coin flip, a die roll, a card looked at.
     * This used to be a no-op, which meant the game acted on a
     * flip the player never saw. It goes on this seat's notice
     * list and travels with the next snapshot.
     */
    @Override
    public void notifyOfValue(
            forge.game.spellability.SpellAbility sa, forge.game.GameObject realtimeTarget,
            String value) {
        // Forge's own wording (forge-game's MessageUtil, which its
        // human controller uses): "You win the flip." / "Alice loses
        // the flip." rather than "Krark, the Thumbless: lose", which
        // did not say who flipped or that it was a flip (2026-10-20).
        String message = forge.util.MessageUtil.formatNotificationMessage(sa, player, realtimeTarget, value);
        String about = sa == null || sa.getHostCard() == null || message.contains(sa.getHostCard().getName())
                ? ""
                : sa.getHostCard().getName() + ": ";
        host.note(actedForSeat, about + message);
    }

    /** How many times this seat was offered priority. Diagnostics. */
    public int priorityWindows() {
        return priorityWindows.get();
    }
}
