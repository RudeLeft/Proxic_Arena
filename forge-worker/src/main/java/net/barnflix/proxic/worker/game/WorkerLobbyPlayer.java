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

    WorkerLobbyPlayer(String name, GameHost host) {
        super(name);
        this.host = host;
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
        player.setFirstController(new MatchController(game, player, this, host));
        return player;
    }

    @Override
    public PlayerController createMindSlaveController(Player master, Player slave) {
        // The player being ACTED FOR is `slave`; the human
        // AUTHORISED to answer is whoever controls `master`. When
        // decisions start reaching browsers, that difference is the
        // thing the protocol must carry — not the thing the
        // controller quietly resolves here.
        return new MatchController(slave.getGame(), slave, this, host);
    }
}
