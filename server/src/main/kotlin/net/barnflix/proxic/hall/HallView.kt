package net.barnflix.proxic.hall

import kotlinx.serialization.Serializable

// What GET /api/hall answers — spec 0018. Players by id only: names and
// pictures come from the PLAYERS list the page already has (as spec
// 0011's STANDINGS do), so a renamed player is renamed here too.

@Serializable
data class DeckView(
    val name: String,
    val icon: String? = null,
    val colors: String? = null,
)

/** A season place: 1, 2, 3, or 4 for Last place. */
@Serializable
data class PlaceView(
    val place: Int,
    val userId: String,
    val rating: Int,
    val wins: Int,
    val games: Int,
)

@Serializable
data class SeasonView(
    val number: Int,
    /** "2026-11" */
    val month: String,
    val endsAt: String,
    val places: List<PlaceView>,
)

@Serializable
data class BeltView(
    val holder: String? = null,
    val since: String? = null,
    val defences: Int = 0,
)

@Serializable
data class BadgeView(
    val key: String,
    val label: String,
)

@Serializable
data class RowView(
    val userId: String,
    val rank: Int,
    /** Places gained (+) or lost (-) since a day ago; null when new to the board. */
    val move: Int? = null,
    val rating: Int,
    val change: Int,
    val wins: Int,
    val losses: Int,
    val draws: Int,
    /** The last five, oldest first: W, L or D. */
    val form: String,
    val badges: List<BadgeView>,
    val deck: DeckView? = null,
)

@Serializable
data class QualifyingView(
    val userId: String,
    val games: Int,
    val wins: Int,
)

@Serializable
data class RecordView(
    val key: String,
    val label: String,
    val userId: String,
    val value: Int,
    /** A deck's name, or for "longest game" the beaten player's id. */
    val detail: String,
)

@Serializable
data class RivalryView(
    val a: String,
    val b: String,
    val aWins: Int,
    val bWins: Int,
    val draws: Int,
)

/** One line of Latest: a win, a draw, or the Belt passing on without a game. */
@Serializable
data class LatestView(
    val at: String,
    /** "win", "draw" or "belt" */
    val kind: String,
    val players: List<String>,
    val turn: Int? = null,
    /** The winner's rating gain. */
    val change: Int? = null,
    /** The win took the Belt. */
    val beltTaken: Boolean = false,
)

@Serializable
data class HallView(
    val season: SeasonView,
    val belt: BeltView,
    val board: List<RowView>,
    val allTime: List<RowView>,
    val qualifying: List<QualifyingView>,
    val records: List<RecordView>,
    val rivalries: List<RivalryView>,
    /** The viewer's most-played opponent, with the viewer as [RivalryView.a]. */
    val rival: RivalryView? = null,
    val latest: List<LatestView>,
    val past: List<SeasonView>,
)
