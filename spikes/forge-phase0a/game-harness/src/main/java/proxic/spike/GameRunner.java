package proxic.spike;

import forge.LobbyPlayer;
import forge.StaticData;
import forge.CardStorageReader;
import forge.ImageKeys;
import forge.card.CardType;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameRules;
import forge.game.GameType;
import forge.game.Match;
import forge.game.player.Player;
import forge.game.player.PlayerController;
import forge.game.player.RegisteredPlayer;
import forge.item.PaperCard;
import forge.util.FileSection;
import forge.util.FileUtil;
import forge.util.Lang;
import forge.util.Localizer;

import java.io.File;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Phase 0A — P0A-B / P0A-C.
 *
 * Runs a real headless two-player Forge game through the Strategy A
 * adapter recommended by §0A.6: a Proxic-owned PlayerController over
 * forge-core + forge-game, with no GUI classes anywhere on the path.
 *
 * Proves, or fails to prove:
 *   mulligan, land play, mana production, casting, combat, damage,
 *   game completion, and §0.22's construction object graph.
 *
 * It also reports which PlayerController methods a real game actually
 * reached, both answered and stubbed, which is the measurement §0A.6
 * needs to size the remaining adapter work.
 */
public final class GameRunner {
    private GameRunner() {}

    public static void main(String[] args) throws Exception {
        String res = arg(args, "res", "../forge-upstream/forge-gui/res");
        String deck1 = arg(args, "deck1", "decks/mono_green.dck");
        String deck2 = arg(args, "deck2", deck1);
        int maxTurns = Integer.parseInt(arg(args, "maxturns", "60"));

        System.out.println("=== Phase 0A P0A-B — headless two-player game ===");
        long t0 = System.currentTimeMillis();

        bootstrap(res);
        System.out.printf("[%5d ms] Forge ready%n", System.currentTimeMillis() - t0);

        Deck d1 = DeckLoader.load(deck1, "Deck A");
        Deck d2 = DeckLoader.load(deck2, "Deck B");
        System.out.printf("[%5d ms] decks loaded: %d / %d cards%n",
                System.currentTimeMillis() - t0, d1.getMain().countAll(), d2.getMain().countAll());

        // §0.22 construction graph, exercised for real.
        LobbyPlayer lp1 = new SpikeLobbyPlayer("Alice");
        LobbyPlayer lp2 = new SpikeLobbyPlayer("Bob");
        RegisteredPlayer rp1 = new RegisteredPlayer(d1).setPlayer(lp1);
        RegisteredPlayer rp2 = new RegisteredPlayer(d2).setPlayer(lp2);

        GameRules rules = new GameRules(GameType.Constructed);
        rules.setGamesPerMatch(1);
        Match match = new Match(rules, List.of(rp1, rp2), "Phase 0A spike");
        Game game = match.createGame();
        System.out.printf("[%5d ms] game constructed%n", System.currentTimeMillis() - t0);

        // A watchdog: a scripted game that cannot end would otherwise hang
        // the harness forever, and "it hung" must be a reported result,
        // not a stuck terminal.
        // Watchdog + heartbeat.
        //
        // Two harness bugs were found the hard way and are fixed here:
        // System.out is BLOCK-buffered when redirected to a file, and
        // Runtime.halt() aborts without flushing -- so an earlier
        // watchdog fired and its entire report was discarded, which
        // looked exactly like "the watchdog never ran".
        final int limitSeconds = Integer.parseInt(arg(args, "limit", "120"));
        Thread watchdog = new Thread(() -> {
            int elapsed = 0;
            try {
                while (elapsed < limitSeconds) {
                    Thread.sleep(10_000);
                    elapsed += 10;
                    System.out.printf("[heartbeat %3ds] turn=%d  answered=%d kinds  stubs=%d%n",
                            elapsed, game.getPhaseHandler().getTurn(),
                            ScriptedController.ANSWERED.size(),
                            GeneratedControllerBase.REACHED_STUBS.size());
                    System.out.flush();
                }
            } catch (InterruptedException ignored) {
                return;
            }
            System.out.println();
            System.out.println("RESULT: TIMEOUT after " + limitSeconds + "s"
                    + " (turn " + game.getPhaseHandler().getTurn() + ")");
            ScriptedController.printAnswered();
            GeneratedControllerBase.printReachedStubs();
            System.out.flush();
            System.err.flush();
            Runtime.getRuntime().halt(2);
        });
        watchdog.setDaemon(true);
        watchdog.start();

        try {
            match.startGame(game, null);
        } catch (Throwable t) {
            System.out.println();
            System.out.println("RESULT: FAIL — " + t.getClass().getName() + ": " + t.getMessage());
            for (int i = 0; i < Math.min(10, t.getStackTrace().length); i++) {
                System.out.println("    at " + t.getStackTrace()[i]);
            }
            ScriptedController.printAnswered();
            GeneratedControllerBase.printReachedStubs();
            System.exit(1);
        }

        System.out.printf("[%5d ms] game over%n", System.currentTimeMillis() - t0);
        System.out.println();
        System.out.println("turns played : " + game.getPhaseHandler().getTurn());
        if (game.getOutcome() == null) {
            System.out.println("outcome      : none");
        } else if (game.getOutcome().isDraw()) {
            System.out.println("outcome      : draw");
        } else {
            System.out.println("outcome      : winner "
                    + game.getOutcome().getWinningLobbyPlayer().getName());
        }
        for (Player p : game.getPlayers()) {
            System.out.printf("  %-6s life=%-4d hand=%-3d battlefield=%-3d graveyard=%d%n",
                    p.getName(), p.getLife(),
                    p.getCardsIn(forge.game.zone.ZoneType.Hand).size(),
                    p.getCardsIn(forge.game.zone.ZoneType.Battlefield).size(),
                    p.getCardsIn(forge.game.zone.ZoneType.Graveyard).size());
        }

        watchdog.interrupt();
        ScriptedController.printAnswered();
        GeneratedControllerBase.printReachedStubs();
        GeneratedCostDecisionMaker.printUnsupported();

        boolean ok = game.getOutcome() != null && !GeneratedControllerBase.SURVEY;
        System.out.println();
        if (GeneratedControllerBase.SURVEY) {
            System.out.println("RESULT: SURVEY (not a pass — stubs returned defaults "
                    + "instead of answering; see the stub list above)");
        } else {
            System.out.println("RESULT: " + (ok ? "PASS" : "FAIL — no outcome"));
        }
        System.exit(ok ? 0 : 1);
    }

    private static String arg(String[] args, String k, String dflt) {
        for (String a : args) {
            if (a.startsWith("--" + k + "=")) return a.substring(k.length() + 3);
        }
        return dflt;
    }

    /** Exactly the sequence proven in §0A.5. */
    static void bootstrap(String res) {
        Localizer.getInstance().initialize("en-US", res + "/languages");
        Lang.createInstance("en-US");
        ImageKeys.initializeDirs("", Collections.emptyMap(), "", "", "", "", "", "", "");
        Map<String, List<String>> typeLists = FileSection.parseSections(
                FileUtil.readFile(new File(res + "/lists/TypeLists.txt")));
        for (Map.Entry<String, List<String>> s : typeLists.entrySet()) {
            if (s.getKey().endsWith("Types")) {
                CardType.Helper.parseTypes(s.getKey(), s.getValue());
            }
        }
        CardStorageReader cards = new CardStorageReader(res + "/cardsfolder", null, false);
        CardStorageReader tokens = new CardStorageReader(res + "/tokenscripts", null, false);
        new StaticData(cards, tokens, null, null, res + "/editions", res + "/editions",
                res + "/blockdata", res + "/setlookup", "Latest", false, false, false, false);
    }

    /**
     * LobbyPlayer is where Forge asks who controls a seat. This is the
     * attachment point for the Proxic adapter: one controller per seat.
     */
    /**
     * LobbyPlayer + IGameEntitiesFactory is where Forge asks who controls
     * a seat. This is the attachment point for the Proxic adapter: one
     * controller per seat, installed via Player.setFirstController.
     */
    static final class SpikeLobbyPlayer extends LobbyPlayer
            implements forge.game.player.IGameEntitiesFactory {
        SpikeLobbyPlayer(String name) { super(name); }

        @Override
        public void hear(LobbyPlayer other, String message) { }

        @Override
        public Player createIngamePlayer(Game game, int id) {
            Player p = new Player(getName(), game, id);
            p.setFirstController(new ScriptedController(game, p, this, getName()));
            return p;
        }

        @Override
        public PlayerController createMindSlaveController(Player master, Player slave) {
            // Control-of-another-player. §0A.8 requires the PROTOCOL to
            // distinguish "the player being acted for" from "the human
            // authorised to answer"; this is the exact hook where Forge
            // hands one player another's decisions. Runtime test is 0B.6.
            return new ScriptedController(slave.getGame(), slave, this, "slave-of-" + master.getName());
        }
    }
}
