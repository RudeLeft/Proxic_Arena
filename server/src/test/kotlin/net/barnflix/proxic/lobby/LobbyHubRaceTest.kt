package net.barnflix.proxic.lobby

import io.ktor.websocket.Frame
import kotlinx.coroutines.channels.Channel
import net.barnflix.proxic.auth.AccountStatus
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.User
import java.util.UUID
import java.util.concurrent.CyclicBarrier
import kotlin.concurrent.thread
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * A reload: the old connection goes away while the new one arrives,
 * on two threads at once. Owner report 2026-10-21 -- players had to
 * refresh several times before the other one showed as online.
 *
 * Before the fix, the new connection could join the set the old one
 * was emptying, and the set was then dropped from the map with the
 * new connection in it: connected, and offline to everybody.
 */
class LobbyHubRaceTest {
    private val user =
        User(UUID.randomUUID(), "rudeleft", "RudeLeft", Role.PLAYER, AccountStatus.ACTIVE)

    private fun connection(id: Int) = LobbyConnection("c$id", user, Channel<Frame>(Channel.UNLIMITED))

    @Test
    fun `a reload never leaves a connected player offline`() {
        val hub = LobbyHub()
        var old = connection(0)
        hub.register(old)
        repeat(ROUNDS) { round ->
            val fresh = connection(round + 1)
            val barrier = CyclicBarrier(2)
            val leaving =
                thread {
                    barrier.await()
                    hub.unregister(old)
                }
            val arriving =
                thread {
                    barrier.await()
                    hub.register(fresh)
                }
            leaving.join()
            arriving.join()
            assertTrue(hub.isOnline(user.userId), "round $round: connected, but shown offline")
            assertEquals(listOf(user.userId), hub.online().map { it.userId }, "round $round")
            old = fresh
        }
    }

    @Test
    fun `only the last connection going is a departure`() {
        val hub = LobbyHub()
        val first = connection(1)
        val second = connection(2)
        assertTrue(hub.register(first))
        assertEquals(false, hub.register(second))
        assertEquals(false, hub.unregister(first))
        assertEquals(false, hub.unregister(first), "a connection already gone is not a departure")
        assertTrue(hub.unregister(second))
        assertEquals(false, hub.isOnline(user.userId))
    }

    private companion object {
        const val ROUNDS = 20_000
    }
}
