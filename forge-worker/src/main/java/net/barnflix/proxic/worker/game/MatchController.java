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

    public MatchController(Game game, Player player, LobbyPlayer lobbyPlayer, GameHost host) {
        super(game, player, lobbyPlayer);
        this.host = host;
    }

    // ---- pregame ------------------------------------------------------

    @Override
    public boolean mulliganKeepHand(Player firstPlayer, int cardsToReturn) {
        // Keep. A mulligan decision belongs to a player, and there
        // is no player attached yet in this slice.
        return true;
    }

    @Override
    public Player chooseStartingPlayer(boolean isFirstGame) {
        return player;
    }

    @Override
    public List<forge.item.PaperCard> sideboard(
            forge.deck.Deck deck, forge.game.GameType gameType, String message) {
        // Open Format has no sideboard (FMT-002), so there is
        // nothing to choose even when Forge offers.
        return null;
    }

    // ---- the priority loop ---------------------------------------------

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

        // PASS IS `null`, NOT AN EMPTY LIST.
        //
        // An empty list is "here are zero abilities I am playing",
        // which Forge answers by offering the same window again --
        // forever, per the guard above. `null` is the pass. One
        // character between a game and a hang, and the hang is
        // silent.
        return null;
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
     * A reveal is presentation, not a decision.
     *
     * Deliberately nothing in THIS slice. When viewer state exists
     * (§6.39-§6.49) a reveal becomes a snapshot change the server
     * sends to whoever is entitled to see it, and that is where the
     * hidden-information rules live. Doing something ad hoc here
     * would be building a second, weaker visibility path.
     */
    @Override
    public void reveal(
            forge.game.card.CardCollectionView cards,
            forge.game.zone.ZoneType zone,
            Player to,
            String message,
            boolean addSuffix) {
        // see above
    }

    @Override
    public void reveal(
            java.util.List<forge.game.card.CardView> cards,
            forge.game.zone.ZoneType zone,
            forge.game.player.PlayerView to,
            String message,
            boolean addSuffix) {
        // see above
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
    @Override
    public void notifyOfValue(
            forge.game.spellability.SpellAbility sa, forge.game.GameObject realtimeTarget,
            String value) {
        // see above
    }

    /** How many times this seat was offered priority. Diagnostics. */
    public int priorityWindows() {
        return priorityWindows.get();
    }
}
