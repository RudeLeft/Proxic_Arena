package net.barnflix.proxic.auth

import java.util.concurrent.CopyOnWriteArrayList

/**
 * Something about an account that other players see changed -- a display
 * name or an avatar (spec 0006). The lobby listens, and sends everybody
 * the Players list again, so nobody needs a reload to see it.
 */
class AccountChanges {
    private val listeners = CopyOnWriteArrayList<suspend () -> Unit>()

    fun onChange(listener: suspend () -> Unit) {
        listeners += listener
    }

    suspend fun changed() {
        listeners.forEach { listener -> runCatching { listener() } }
    }
}
