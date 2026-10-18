package net.barnflix.proxic.worker.game;

import forge.LobbyPlayer;
import forge.game.Game;
import forge.game.player.IGameEntitiesFactory;
import forge.game.player.Player;
import forge.game.player.PlayerController;

/**
 * One seat's identity to Forge — PHASE_06 §6.20, §6.35, §6.37.
 *
 * Forge creates its own Player objects during `createGame`, through
 * this factory. That is why the controller is installed HERE rather
 * than afterwards: a loop over `game.getPlayers()` setting
 * controllers runs after Forge has already decided what each player
 * is, and misses `createMindSlaveController` entirely.
 *
 * §6.35 says not to overload one player id. This class is one of
 * the links in §6.36's chain:
 *
 *     Arena user → match participant → seat → FORGE PLAYER
 *
 * and `createMindSlaveController` is the exact hook where Forge
 * hands one player another's decisions — the case Phase 0A §0A.8
 * requires the protocol to carry as "acted for" separately from
 * "authorised to answer". FMT-005 keeps that distinction required
 * even though Open Format is two players: it is the same mechanism
 * multiplayer would need.
 */
final class WorkerLobbyPlayer extends LobbyPlayer implements IGameEntitiesFactory {
    private final GameHost host;
    private final int seatNumber;

    WorkerLobbyPlayer(String name, int seatNumber, GameHost host) {
        super(name);
        this.seatNumber = seatNumber;
        this.host = host;
    }

    /** The seat whose human answers through this lobby player. */
    int seatNumber() {
        return seatNumber;
    }

    @Override
    public void hear(LobbyPlayer other, String message) {
        // In-game chat is not Phase 6's (§6.186 excludes match
        // chat), and Phase 5's lobby channel is a different thing
        // entirely. Deliberately nothing.
    }

    @Override
    public Player createIngamePlayer(Game game, int id) {
        Player player = new Player(getName(), game, id);
        // Acted for and authorised are the same seat here: an
        // ordinary player answering their own decisions.
        player.setFirstController(
                new MatchController(game, player, this, host, seatNumber, seatNumber));
        return player;
    }

    @Override
    public PlayerController createMindSlaveController(Player master, Player slave) {
        // WHERE THE TWO SEATS COME APART. The player being ACTED
        // FOR is `slave`; the human AUTHORISED to answer is this
        // lobby player, the master's. §6.37 forbids collapsing
        // them, so both travel in the decision rather than being
        // resolved away here.
        return new MatchController(
                slave.getGame(), slave, this, host,
                host.seatOf(slave.getLobbyPlayer()), seatNumber);
    }
}
