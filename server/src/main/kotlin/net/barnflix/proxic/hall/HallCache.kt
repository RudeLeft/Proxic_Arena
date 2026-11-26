package net.barnflix.proxic.hall

import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

// P11-E10 -- the Hall's finished games, kept in memory.
//
// Before, every lobby connection, every game end and every account change
// read every finished game from the database again (and every Hall page
// visit did too): 30 ms of the server's time at 10,000 games, most of a
// lobby join's. The games only change when something writes them, so they
// are read once and kept until one of those writes says otherwise:
//
//   a game end         LobbyService.matchChanged (ENDED)
//   an account change  AccountChanges (a name, an avatar, an administrator
//                      creating, disabling or enabling an account; the
//                      Belt reset and the record purge say so too)
//   a deck the Hall    DeckAccessListener.deckShown (its icon, its colours,
//   shows              its deletion)
//
// What is kept is the Hall itself, never an answer worked out from it for a
// moment in time: every view, place and Belt is still worked out for "now"
// on each read (Hall takes `now` everywhere), so a season ending or a Belt
// falling due needs no invalidation. StandingsSource keeps its places for as
// long as Hall.steadyUntil says they hold.

class HallCache(
    /** No keeping when false: every read goes to the database (tests that write and read straight away). */
    private val keep: Boolean = true,
    private val load: () -> Hall,
) {
    private class Kept(val generation: Long, val hall: Hall)

    private val generation = AtomicLong()
    private val kept = AtomicReference<Kept?>(null)

    /** Bumped by every [invalidate]: what was worked out under an older one is old. */
    val current: Long get() = if (keep) generation.get() else generation.incrementAndGet()

    /** The Hall as the database holds it now, read again only after an [invalidate]. */
    fun hall(): Hall {
        if (!keep) return load()
        val asked = generation.get()
        kept.get()?.takeIf { it.generation == asked }?.let { return it.hall }
        val fresh = load()
        // A change landed while this was reading: hand this reader what it
        // read (as before the cache), but never keep it for the next.
        if (generation.get() == asked) kept.set(Kept(asked, fresh))
        return fresh
    }

    /** Something the Hall is counted from changed: the next read goes to the database. */
    fun invalidate() {
        generation.incrementAndGet()
        kept.set(null)
    }

    companion object {
        /** Kept, read from [source]. */
        fun of(source: HallGameSource) = HallCache { source.hall() }

        /** Never kept: what the code did before P11-E10. */
        fun uncached(source: HallGameSource) = HallCache(keep = false) { source.hall() }
    }
}
