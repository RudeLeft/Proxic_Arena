package net.barnflix.proxic.match

import java.util.UUID

// Launching a match — PHASE_06 §6.9–§6.19.
//
// Phase 5 ends at a frozen setup. This is the vocabulary for
// consuming one, kept separate from the service so the rules below
// read as rules rather than as column juggling.

/** §6.17 — the match lifecycle, as the database CHECK enforces it. */
enum class MatchStatus {
    LAUNCHING,
    RUNNING,
    ENDED,
    FAILED_STARTUP,
    FAILED_RUNTIME,
    TERMINATED,
}

/** §6.19 — a seat, as it stood at launch. */
data class MatchParticipant(
    val userId: UUID,
    val seatNumber: Int,
    val deckId: UUID?,
    val deckName: String,
    val displayName: String,
    val teamId: Int? = null,
)

data class Match(
    val matchId: UUID,
    val setupId: UUID,
    val roomId: UUID,
    val status: MatchStatus,
    val presetId: String,
    val participants: List<MatchParticipant>,
)

/**
 * Why a launch was refused.
 *
 * §6.12 lists what must be revalidated immediately before claiming.
 * Every one of these is an expected answer a host must be shown,
 * not a fault — and the detail is written for them.
 */
sealed interface LaunchError {
    val code: String
    val detail: String

    /**
     * §4.65's lesson, carried forward for the fourth phase running:
     * a setup you may not launch and one that does not exist are
     * the same answer.
     */
    data object SetupNotFound : LaunchError {
        override val code = "SETUP_NOT_FOUND"
        override val detail = "No such match setup."
    }

    /** §6.11 — only the host of the source room may launch. */
    data object HostRequired : LaunchError {
        override val code = "MATCH_HOST_REQUIRED"
        override val detail = "Only the host can start the match."
    }

    /**
     * §6.9 — somebody else got there first.
     *
     * Distinct from SetupNotFound on purpose: the host who lost the
     * race is a legitimate participant who should be told the match
     * is starting, not told their setup never existed.
     */
    data object AlreadyLaunched : LaunchError {
        override val code = "MATCH_ALREADY_LAUNCHED"
        override val detail = "That match has already started."
    }

    /** The setup was invalidated before anyone launched it. */
    data object SetupNotReady : LaunchError {
        override val code = "SETUP_NOT_READY"
        override val detail = "That setup is no longer ready. Prepare the match again."
    }

    /**
     * §6.12 — something changed between preparation and launch.
     *
     * A deck deleted, a share revoked, an account disabled. The
     * detail names which seat so the host can act, and §5.101's
     * split still applies: it does not say WHY that player's deck
     * failed.
     */
    data class RevalidationFailed(override val detail: String) : LaunchError {
        override val code = "LAUNCH_REVALIDATION_FAILED"
    }
}

sealed interface LaunchResult {
    data class Launched(val match: Match) : LaunchResult

    data class Refused(val error: LaunchError) : LaunchResult
}

/**
 * Something that turns a claimed match into a running one.
 *
 * An interface, and the reason is timing rather than taste.
 * Claiming a setup takes milliseconds; starting Forge takes a JVM
 * and most of a minute. The route does the first and hands the
 * second to this, so an HTTP request never waits on a process
 * spawn — Cloudflare cuts a request off at 100 seconds, and a
 * launch that took longer would look like a failure while the
 * match started perfectly.
 *
 * It also keeps the route tests deterministic. With a real starter
 * they would spawn workers, fail asynchronously on a machine with
 * no Forge, and flip the match out of LAUNCHING while a test was
 * asserting on it.
 */
fun interface MatchStarter {
    /** Called after the claim. Must not block the caller. */
    fun begin(match: Match)

    companion object {
        /** For tests, and for a server with no Forge configured. */
        val NONE = MatchStarter { }
    }
}

/**
 * Ending a match that is not ending by itself — §6.162.
 *
 * Separate from [MatchStarter] because starting and abandoning
 * are different authorities: anybody may be told to start a
 * match they host, and abandoning is the escape hatch for a game
 * that has stopped responding.
 *
 * §6.164 — the browser cannot kill a worker. It names a MATCH it
 * participates in; the server decides what that means and which
 * process, if any, is involved. No pid, no path, no handle ever
 * crosses that line.
 */

fun interface MatchControl {
    fun abandon(match: Match)

    companion object {
        val NONE = MatchControl { }
    }
}

/**
 * May this player fetch this image — PHASE_06 §6.122, §6.129.
 *
 * Separate from MatchControl because it answers a question rather
 * than performing an action, and because the answer is per VIEWER:
 * the same asset is fetchable by the player whose snapshot carried
 * it and by nobody else.
 *
 * NONE denies, which is the safe direction for a seam: a wiring
 * mistake makes artwork stop appearing, rather than making an
 * opponent's deck readable.
 */
fun interface MatchAssets {
    fun mayFetch(
        matchId: java.util.UUID,
        userId: java.util.UUID,
        assetId: String,
    ): Boolean

    companion object {
        val NONE = MatchAssets { _, _, _ -> false }
    }
}

/**
 * Telling the players what their match is doing — PHASE_06 §6.17.
 *
 * Declared in `match` and implemented over in `lobby`, the same
 * direction as RoomAnnouncer: the match rules have no idea a
 * WebSocket exists and keep it that way.
 *
 * This exists because the audit after the "leave room" bug found
 * the same fault three more times, and the worst of them was here:
 * launching a match announced NOTHING. The opponent's lobby still
 * showed a prepared room, and when the match became RUNNING a
 * minute later — or failed — nobody was told at all.
 *
 * That matters more here than anywhere else, because the next
 * thing built on top is a decision protocol that is entirely "tell
 * ONE connection something". A view-update model with holes in it
 * does not get better by being used 240 times a game.
 */

fun interface MatchAnnouncer {
    /**
     * The match moved. Sent to its participants, one message each
     * so a player's own deck stays their own (§5.47).
     *
     * [failureCode] is null unless the match failed.
     * [outcome] is null unless it finished (§6.149).
     */
    suspend fun matchChanged(
        match: Match,
        failureCode: String?,
        outcome: GameOutcome?,
    )

    companion object {
        val NONE = MatchAnnouncer { _, _, _ -> }
    }
}
