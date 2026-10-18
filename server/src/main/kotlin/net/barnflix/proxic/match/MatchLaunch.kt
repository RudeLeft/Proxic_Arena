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
