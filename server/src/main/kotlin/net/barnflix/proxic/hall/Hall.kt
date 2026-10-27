package net.barnflix.proxic.hall

import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

// The Hall of Champions, assembled — spec 0018.
//
// One pass over the finished games builds every view the page has: the
// season (its tables now and a day ago, for the ▲/▼), all time, the
// Belt, badges, records, rivalries, the latest results and the past
// seasons' places. Disabled accounts ([counted] false) are left off the
// boards; their games still count for the players they played.

class Hall(
    games: List<HallGame>,
    zone: ZoneId,
    private val counted: (UUID) -> Boolean,
) {
    private val games = games.sortedWith(compareBy<HallGame> { it.endedAt }.thenBy { it.matchId })
    private val seasons = Seasons(this.games, zone)

    /** This season's four places, for the lobby's rings (STANDINGS). */
    fun places(now: Instant): Places {
        val month = seasons.monthOf(now)
        return Places.of(seasons.table(month, now), counted)
    }

    /** Spec 0019 F1 — who holds the Belt now, for the mark beside their name. */
    fun beltHolder(now: Instant): UUID? {
        val played = games.filter { !it.endedAt.isAfter(now) }
        return Belt(played, seasons, counted).at(now).holder
    }

    fun view(
        now: Instant,
        viewer: UUID,
    ): HallView {
        val month = seasons.monthOf(now)
        val seasonGames = seasons.gamesIn(month, now)
        val upToNow = games.filter { !it.endedAt.isAfter(now) }
        val belt = Belt(upToNow, seasons, counted).at(now)
        val highlights = Highlights(upToNow, seasonGames)
        val table = RatingTable.of(seasonGames)
        val dayAgo = seasons.table(month, now.minus(DAY))
        val rivalries = highlights.rivalries(counted)
        return HallView(
            season = seasonView(month, table),
            belt = BeltView(belt.holder?.toString(), belt.since?.toString(), belt.defences),
            board =
                rows(
                    table.ranked(Seasons.RANKED, counted),
                    dayAgo.ranked(Seasons.RANKED, counted),
                    highlights,
                    belt,
                ),
            allTime = rows(RatingTable.of(upToNow).ranked(Seasons.RANKED, counted), null, highlights, belt),
            qualifying =
                table.all
                    .filter { counted(it.userId) && it.games < Seasons.RANKED }
                    .sortedWith(compareByDescending<RatingLine> { it.games }.thenBy { it.userId })
                    .map { QualifyingView(it.userId.toString(), it.games, it.wins) },
            records =
                highlights.records(counted).map {
                    RecordView(it.key, it.label, it.userId.toString(), it.value, it.detail)
                },
            rivalries = rivalries.take(RIVALRIES).map { it.toView() },
            rival =
                rivalries
                    .filter { it.a == viewer || it.b == viewer }
                    .maxByOrNull { it.games }
                    ?.let { if (it.a == viewer) it else Rivalry(it.b, it.a, it.bWins, it.aWins, it.draws) }
                    ?.toView(),
            latest = latest(upToNow, belt),
            past = seasons.pastMonths(month).map { seasonView(it, seasons.table(it)) },
        )
    }

    private fun seasonView(
        month: java.time.YearMonth,
        table: RatingTable,
    ): SeasonView {
        val places = Places.of(table, counted)
        val views =
            places.podium.mapIndexed { index, line -> line.toPlace(index + 1) } +
                listOfNotNull(places.last?.toPlace(LAST_PLACE))
        return SeasonView(seasons.number(month), month.toString(), seasons.endsAt(month).toString(), views)
    }

    private fun rows(
        ranked: List<RatingLine>,
        before: List<RatingLine>?,
        highlights: Highlights,
        belt: BeltState,
    ): List<RowView> =
        ranked.mapIndexed { index, line ->
            val was = before?.indexOfFirst { it.userId == line.userId }?.takeIf { it >= 0 }
            RowView(
                userId = line.userId.toString(),
                rank = index + 1,
                move = was?.let { it - index },
                rating = line.rating,
                change = line.lastChange,
                wins = line.wins,
                losses = line.losses,
                draws = line.draws,
                form = line.form.takeLast(FORM).toString(),
                badges = highlights.badges(line.userId, belt.holder).map { BadgeView(it.key, it.label) },
                deck = line.favourite?.let { DeckView(it.name, it.icon, it.colors) },
            )
        }

    /** The newest results, each win with the winner's season gain, and the Belt passing on without a game. */
    private fun latest(
        upToNow: List<HallGame>,
        belt: BeltState,
    ): List<LatestView> {
        val gains = HashMap<UUID, Int>()
        for (month in upToNow.map { seasons.monthOf(it.endedAt) }.distinct()) {
            val table = RatingTable()
            for (game in upToNow.filter { seasons.monthOf(it.endedAt) == month }) gains[game.matchId] = table.play(game)
        }
        val taken = belt.events.filter { it.change == BeltChange.TAKEN }.map { it.at to it.to }.toSet()
        val results =
            upToNow.takeLast(LATEST).map { game ->
                val winner = game.winner
                if (winner == null) {
                    LatestView(game.endedAt.toString(), "draw", game.seats.map { it.userId.toString() }, game.turn)
                } else {
                    LatestView(
                        at = game.endedAt.toString(),
                        kind = "win",
                        players = listOf(winner.userId.toString(), game.loser!!.userId.toString()),
                        turn = game.turn,
                        change = gains[game.matchId],
                        beltTaken = (game.endedAt to winner.userId) in taken,
                    )
                }
            }
        val handed =
            belt.events.filter { it.change == BeltChange.VACATED }.map {
                LatestView(it.at.toString(), "belt", listOfNotNull(it.to?.toString(), it.from?.toString()))
            }
        return (results + handed).sortedByDescending { it.at }.take(LATEST)
    }

    private fun RatingLine.toPlace(place: Int) = PlaceView(place, userId.toString(), rating, wins, games)

    private fun Rivalry.toView() = RivalryView(a.toString(), b.toString(), aWins, bWins, draws)

    companion object {
        const val LAST_PLACE = 4
        private const val FORM = 5
        private const val LATEST = 8
        private const val RIVALRIES = 5
        private val DAY: Duration = Duration.ofDays(1)
    }
}
