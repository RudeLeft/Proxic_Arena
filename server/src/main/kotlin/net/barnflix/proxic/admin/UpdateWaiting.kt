package net.barnflix.proxic.admin

import kotlinx.serialization.Serializable
import org.slf4j.LoggerFactory
import java.util.concurrent.CopyOnWriteArrayList

// Spec 0056 — an update waits for games to finish.
//
// The owner's switch, "Update waiting", on the Admin page's Server tab.
// In memory and nowhere else (spec 0056, Scope): the update it waits for
// replaces the server, and a server that starts again starts with it off.
// While it is on, no new game starts (MatchLauncher refuses with
// UPDATE_WAITING), the lobby says why, and the players already in a game
// see a notice; all of them hear it change at once (UPDATE_WAITING on the
// lobby socket, LobbyService). There is no deadline and no countdown
// (owner 2026-11-06): it waits until the owner switches it off, or the
// update ends it.

class UpdateWaiting {
    private val log = LoggerFactory.getLogger(UpdateWaiting::class.java)

    @Volatile
    var on: Boolean = false
        private set

    private val listeners = CopyOnWriteArrayList<suspend (Boolean) -> Unit>()

    /** Told every change, with the new value; the lobby tells everybody. */
    fun onChange(listener: suspend (Boolean) -> Unit) {
        listeners += listener
    }

    /** Switch it; true when that changed it (and everybody has been told). */
    suspend fun set(value: Boolean): Boolean {
        val changed =
            synchronized(this) {
                (on != value).also { on = value }
            }
        if (changed) {
            log.info("update waiting: {}", if (value) "on -- new games wait" else "off -- new games may start")
            listeners.forEach { listener ->
                runCatching { listener(value) }.onFailure { log.warn("an update-waiting change was not told", it) }
            }
        }
        return changed
    }
}

/** Spec 0056 — one game being played on this server now, for the Admin page. */
@Serializable
data class RunningGameView(
    val matchId: String,
    /** "RudeLeft vs Pat", in seat order. */
    val players: String,
    /** The turn the game is on, when the board has said; null before. */
    val turn: Int? = null,
)

/** Spec 0056 — `GET`/`POST /api/admin/update-waiting`: the switch, and the games it waits for. */
@Serializable
data class UpdateWaitingView(
    val on: Boolean,
    val games: List<RunningGameView>,
)

@Serializable
data class UpdateWaitingRequest(val on: Boolean? = null)
