package net.barnflix.proxic.hall

import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource
import kotlin.random.Random

// P11-E10 -- many finished games in a TEST database, for the Hall's
// measure and its cache tests. Straight rows, as MatchRecords leaves them
// (status ENDED, Forge's result line), so the Hall reads them exactly as
// it reads real games. Never pointed at a real database: it is only ever
// handed a test's own fresh one.

object HallSeed {
    /** [count] decks, each owned by one of [owners] in turn; their ids. */
    fun decks(
        dataSource: DataSource,
        owners: List<UUID>,
        count: Int,
    ): List<UUID> =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                INSERT INTO imported_deck
                    (deck_id, display_name, source_filename, package_sha256, total_cards, distinct_cards,
                     import_schema_version, owner_user_id, colors)
                VALUES (?, ?, 'seed.zip', ?, 60, 20, 1, ?, 'RG')
                """.trimIndent(),
            ).use { statement ->
                val ids = List(count) { UUID.randomUUID() }
                ids.forEachIndexed { index, id ->
                    statement.setObject(1, id)
                    statement.setString(2, "Seed deck ${index + 1}")
                    statement.setString(3, id.toString().replace("-", "").repeat(2).take(64))
                    statement.setObject(4, owners[index % owners.size])
                    statement.addBatch()
                }
                statement.executeBatch()
                ids
            }
        }

    /**
     * [count] finished games between [players], evenly spread over the [span]
     * up to [until] (oldest first), each seat on a deck its player owns; about
     * one in ten a draw and one in eight won by a concession. Seeded, so a
     * measure sees the same games every run.
     */
    fun games(
        dataSource: DataSource,
        players: List<UUID>,
        decks: List<UUID>,
        count: Int,
        until: Instant = Instant.now().minusSeconds(60),
        span: Duration = Duration.ofDays(365),
        seed: Int = 11,
    ) {
        if (count == 0) return
        val random = Random(seed)
        val step = span.toMillis() / count
        val start = until.minus(span)
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            val match =
                connection.prepareStatement(
                    """
                    INSERT INTO match
                        (match_id, setup_id, room_id, status, preset_id, forge_commit, forge_release,
                         worker_protocol_version, public_protocol_version, created_at, started_at, ended_at,
                         result_summary)
                    VALUES (?, ?, ?, 'ENDED', 'open-format', 'seed', 'seed', 1, 1, ?, ?, ?, ?)
                    """.trimIndent(),
                )
            val seat =
                connection.prepareStatement(
                    """
                    INSERT INTO match_participant
                        (match_id, user_id, seat_number, deck_id, deck_name_snapshot, display_name_snapshot)
                    VALUES (?, ?, ?, ?, ?, 'Seeded')
                    """.trimIndent(),
                )
            for (index in 0 until count) {
                val matchId = UUID.randomUUID()
                val ended = start.plusMillis(step * (index + 1))
                val began = Timestamp.from(ended.minusSeconds(1200))
                val a = players[random.nextInt(players.size)]
                val b = players.filter { it != a }.random(random)
                val turn = 4 + random.nextInt(14)
                val roll = random.nextInt(20)
                val seatWon = 1 + random.nextInt(2)
                val seatConceded = 1 + random.nextInt(2)
                val result =
                    when {
                        roll < 2 -> "draw on turn $turn"
                        roll < 4 -> "winner:seat $seatWon on turn $turn (seat $seatConceded conceded)"
                        else -> "winner:seat $seatWon on turn $turn"
                    }
                match.setObject(1, matchId)
                match.setObject(2, UUID.randomUUID())
                match.setObject(3, UUID.randomUUID())
                match.setTimestamp(4, began)
                match.setTimestamp(5, began)
                match.setTimestamp(6, Timestamp.from(ended))
                match.setString(7, result)
                match.addBatch()
                listOf(a, b).forEachIndexed { number, player ->
                    val own = decks.filterIndexed { d, _ -> d % players.size == players.indexOf(player) }
                    val deck = (own.ifEmpty { decks }).random(random)
                    seat.setObject(1, matchId)
                    seat.setObject(2, player)
                    seat.setInt(3, number + 1)
                    seat.setObject(4, deck)
                    seat.setString(5, "Seed deck")
                    seat.addBatch()
                }
                if (index % 500 == 499) {
                    match.executeBatch()
                    seat.executeBatch()
                }
            }
            match.executeBatch()
            seat.executeBatch()
            connection.commit()
            match.close()
            seat.close()
        }
    }
}
