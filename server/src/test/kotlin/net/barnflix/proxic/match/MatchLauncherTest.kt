package net.barnflix.proxic.match

import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.AccountStatus
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.deck.DeckAuthorization
import net.barnflix.proxic.deck.DeckSharing
import net.barnflix.proxic.room.DeckCheck
import net.barnflix.proxic.room.DeckVerdict
import net.barnflix.proxic.room.MatchSetupService
import net.barnflix.proxic.room.PrepareResult
import net.barnflix.proxic.room.Room
import net.barnflix.proxic.room.RoomAnnouncer
import net.barnflix.proxic.room.RoomError
import net.barnflix.proxic.room.RoomResult
import net.barnflix.proxic.room.RoomService
import net.barnflix.proxic.room.RoomStatus
import net.barnflix.proxic.room.SilentAnnouncer
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Claiming a setup — PHASE_06 §6.9–§6.19, acceptance P6-A, P6-B,
 * P6-C.
 *
 * The one that matters is P6-B. §6.9 says a race between duplicate
 * launch requests must not start two Forge runtimes, and a test
 * that calls launch twice in sequence proves nothing about that:
 * it proves the second call sees the first call's result, which it
 * would even with a check-then-update. These launch concurrently
 * from a barrier, so both are inside the window the claim exists to
 * close.
 */
class MatchLauncherTest {
    private var container: PostgreSQLContainer<*>? = null
    private var database: Database? = null
    private val password = "a perfectly fine passphrase"

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            PostgreSQLContainer("postgres:16.4-alpine")
                .withDatabaseName("proxic_test")
                .withUsername("proxic")
                .withPassword("test-only-not-a-secret")
                .also { it.start() }
        database = Database.connect(config())!!.also { it.migrate() }

        val accounts = Accounts(source())
        for (name in listOf("RudeLeft", "Pat")) accounts.createUser(name, password, Role.PLAYER)
    }

    @AfterTest
    fun stop() {
        database?.close()
        container!!.stop()
    }

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = "build/test-match-launch",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun source() = database!!.dataSource()

    private fun userId(username: String) = Accounts(source()).findByUsername(username)!!.userId

    private fun launcher() = MatchLauncher(source(), DeckAuthorization(source()))

    private fun setups() =
        MatchSetupService(
            source(),
            DeckAuthorization(source()),
            { DeckCheck(DeckVerdict.VALID, "") },
        )

    private fun insertDeck(
        ownerId: UUID,
        name: String = "A deck",
    ): UUID {
        val deckId = UUID.randomUUID()
        source().connection.use { connection ->
            connection.prepareStatement(
                """
                INSERT INTO imported_deck
                    (deck_id, display_name, source_filename, package_sha256,
                     total_cards, distinct_cards, import_schema_version, owner_user_id)
                VALUES (?, ?, 'test.zip', ?, 60, 15, 1, ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, deckId)
                it.setString(2, name)
                it.setString(3, deckId.toString().replace("-", "").repeat(2).take(64))
                it.setObject(4, ownerId)
                it.executeUpdate()
            }
        }
        return deckId
    }

    /** A room prepared through the real Phase 5 path, ready to launch. */
    private fun preparedRoom(): Pair<Room, UUID> {
        val rooms = RoomService(source(), DeckAuthorization(source()))
        val host = userId("RudeLeft")
        val guest = userId("Pat")
        val deckId = insertDeck(host, "Mono Red")
        DeckSharing(source(), DeckAuthorization(source())).share(deckId, host, "Pat")

        val room = (rooms.create(host) as RoomResult.Ok).room
        check(rooms.join(room.roomId, guest) is RoomResult.Ok)
        for (user in listOf(host, guest)) {
            check(rooms.selectDeck(room.roomId, user, deckId) is RoomResult.Ok)
            check(rooms.setReady(room.roomId, user, true) is RoomResult.Ok)
        }
        val prepared = setups().prepare(room.roomId, host)
        val setup = assertIs<PrepareResult.Prepared>(prepared, "could not prepare: $prepared")
        return rooms.find(room.roomId)!! to UUID.fromString(setup.setup.setupId)
    }

    private fun matchCount(): Int =
        source().connection.use { connection ->
            connection.prepareStatement("SELECT count(*) FROM match").use {
                it.executeQuery().use { rows ->
                    rows.next()
                    rows.getInt(1)
                }
            }
        }

    private fun matchRow(matchId: UUID): Triple<String, String?, String?> =
        source().connection.use { connection ->
            connection.prepareStatement(
                "SELECT status, result_summary, failure_code FROM match WHERE match_id = ?",
            ).use {
                it.setObject(1, matchId)
                it.executeQuery().use { rows ->
                    rows.next()
                    Triple(rows.getString(1), rows.getString(2), rows.getString(3))
                }
            }
        }

    // --- how a game ends — §6.149, §6.151, §6.154 ---------------------------

    /**
     * §6.151's sequence, and D4's amendment to it.
     *
     * The locked §6.151 says the source room is CLOSED; the owner
     * decision recorded in the same document supersedes that and
     * returns it to OPEN, both players still seated with their
     * decks and readiness reset. Two people who have just
     * finished a game are the likeliest to want another.
     */
    @Test
    fun `a finished game records Forge's result and gives the room back`() {
        val (room, setupId) = preparedRoom()
        val launched = assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))
        val records = MatchRecords(source())
        records.recordRunning(launched.match.matchId, java.time.Instant.now())

        records.recordEnded(
            launched.match.matchId,
            GameOutcome(GameOutcome.WINNER, winningSeat = 2, turn = 11),
            java.time.Instant.now(),
        )
        records.releaseRoom(launched.match.roomId)

        val (status, summary, failure) = matchRow(launched.match.matchId)
        assertEquals("ENDED", status)
        // §6.149 — by SEAT. A display name is not an identity, and
        // "Pat won" records nothing when both players are Pat.
        assertEquals("winner:seat 2 on turn 11", summary)
        assertEquals(null, failure)

        val rooms = RoomService(source(), DeckAuthorization(source()))
        val after = rooms.find(room.roomId)!!
        assertEquals(RoomStatus.OPEN, after.status)
        assertEquals(2, after.members.size, "somebody lost their seat")
        assertTrue(after.members.none { it.ready }, "readiness was not reset")
    }

    /**
     * §6.154 — a match that stopped records NO WINNER.
     *
     * The tempting version credits whoever was still connected.
     * This writes FAILED_RUNTIME with an empty result instead,
     * because a worker exiting is a fault and not a game.
     */
    @Test
    fun `a runtime failure records no winner`() {
        val (room, setupId) = preparedRoom()
        val launched = assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))
        val records = MatchRecords(source())
        records.recordRunning(launched.match.matchId, java.time.Instant.now())

        records.recordEnded(
            launched.match.matchId,
            GameOutcome(GameOutcome.FAILED, winningSeat = null, turn = 3),
            java.time.Instant.now(),
        )

        val (status, summary, failure) = matchRow(launched.match.matchId)
        assertEquals("FAILED_RUNTIME", status)
        assertEquals(null, summary, "a crashed match recorded a result")
        assertEquals("WORKER_STOPPED", failure)
    }

    /**
     * A second ending cannot overwrite the first.
     *
     * GAME_ENDED followed by the pipe closing as the worker exits
     * is the NORMAL ending, not an unusual one, so the late
     * failure must not turn a real result into FAILED_RUNTIME.
     * The UPDATE is conditional on RUNNING, which is what stops it.
     */
    @Test
    fun `a late failure cannot overwrite a real result`() {
        val (room, setupId) = preparedRoom()
        val launched = assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))
        val records = MatchRecords(source())
        records.recordRunning(launched.match.matchId, java.time.Instant.now())
        records.recordEnded(
            launched.match.matchId,
            GameOutcome(GameOutcome.WINNER, 1, 9),
            java.time.Instant.now(),
        )

        records.recordEnded(
            launched.match.matchId,
            GameOutcome(GameOutcome.FAILED, null, 9),
            java.time.Instant.now(),
        )

        val (status, summary, _) = matchRow(launched.match.matchId)
        assertEquals("ENDED", status)
        assertEquals("winner:seat 1 on turn 9", summary)
    }

    // --- abandoning — §6.153, §6.162 ---------------------------------------

    private fun endings() =
        MatchEndings(
            MatchRecords(source()),
            MatchAnnouncer.NONE,
            RoomService(source(), DeckAuthorization(source())),
        )

    /**
     * THE ESCAPE HATCH. A match that has stopped responding
     * leaves its room locked IN_MATCH, and §6.152 means no lobby
     * action can end it -- so until this existed the players
     * could not leave, close or prepare again until the 24-hour
     * sweep. That trapped the owner twice in testing.
     */
    @Test
    fun `abandoning a match frees the room`() {
        val (room, setupId) = preparedRoom()
        val launched = assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))
        MatchRecords(source()).recordRunning(launched.match.matchId, java.time.Instant.now())

        endings().abandoned(launched.match)

        val (status, summary, failure) = matchRow(launched.match.matchId)
        assertEquals("TERMINATED", status)
        // §6.153 — Arena must not declare the opponent the winner
        // without Forge's result, and there is none. Nobody won.
        assertEquals(null, summary, "an abandoned match recorded a winner")
        // Not a failure either: somebody meant to do this.
        assertEquals(null, failure)

        val rooms = RoomService(source(), DeckAuthorization(source()))
        val after = rooms.find(room.roomId)!!
        assertEquals(RoomStatus.OPEN, after.status)
        assertEquals(2, after.members.size)
        assertTrue(after.members.none { it.ready })
    }

    /** Both players pressing it at once must not matter. */
    @Test
    fun `abandoning twice is harmless`() {
        val (room, setupId) = preparedRoom()
        val launched = assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))
        MatchRecords(source()).recordRunning(launched.match.matchId, java.time.Instant.now())

        endings().abandoned(launched.match)
        endings().abandoned(launched.match)

        assertEquals("TERMINATED", matchRow(launched.match.matchId).first)
        val rooms = RoomService(source(), DeckAuthorization(source()))
        assertEquals(RoomStatus.OPEN, rooms.find(room.roomId)!!.status)
    }

    /**
     * A finished game cannot be abandoned afterwards.
     *
     * Otherwise a click that arrives a moment late would erase a
     * real Forge result and replace it with a termination.
     */
    @Test
    fun `abandoning cannot erase a result`() {
        val (room, setupId) = preparedRoom()
        val launched = assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))
        val records = MatchRecords(source())
        records.recordRunning(launched.match.matchId, java.time.Instant.now())
        records.recordEnded(
            launched.match.matchId,
            GameOutcome(GameOutcome.WINNER, 2, 6),
            java.time.Instant.now(),
        )

        endings().abandoned(launched.match)

        val (status, summary, _) = matchRow(launched.match.matchId)
        assertEquals("ENDED", status)
        assertEquals("winner:seat 2 on turn 6", summary)
    }

    // --- surviving a restart — §6.154, §6.157 -------------------------------

    /**
     * THE PRODUCTION BUG, reproduced.
     *
     * After a restart the `match` rows still said RUNNING.
     * /api/matches/current handed those back, both browsers
     * opened a match socket for a game whose Forge had died with
     * the previous container, and both sat on "Waiting for the
     * game" indefinitely -- waiting for a decision that was never
     * coming, in a room still locked IN_MATCH that they could not
     * leave. From the players' side it was indistinguishable from
     * a slow opponent.
     *
     * §6.157 allows two answers and demands the honest one. A
     * worker is a CHILD PROCESS of the server, so it dies with
     * it and there is nothing to reattach to: the match becomes
     * FAILED_RUNTIME.
     */
    @Test
    fun `a restart ends the matches it finds and gives their rooms back`() {
        val (room, setupId) = preparedRoom()
        val launched = assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))
        MatchRecords(source()).recordRunning(launched.match.matchId, java.time.Instant.now())

        MatchRecovery(source(), org.slf4j.LoggerFactory.getLogger("test")).recover()

        val (status, summary, failure) = matchRow(launched.match.matchId)
        assertEquals("FAILED_RUNTIME", status)
        assertEquals("SERVER_RESTARTED", failure)
        // §6.149 — Forge is gone, so nobody won. Recording a
        // winner here would be Arena inventing a result.
        assertEquals(null, summary, "a restart recorded a winner")

        val rooms = RoomService(source(), DeckAuthorization(source()))
        val after = rooms.find(room.roomId)!!
        assertEquals(RoomStatus.OPEN, after.status, "the room was left locked")
        assertEquals(2, after.members.size, "somebody lost their seat")
        assertTrue(after.members.none { it.ready }, "readiness was not reset")
    }

    /** A match still starting is in exactly the same position. */
    @Test
    fun `a restart also ends a match that was still launching`() {
        val (room, setupId) = preparedRoom()
        val launched = assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))
        assertEquals(MatchStatus.LAUNCHING, launched.match.status)

        MatchRecovery(source(), org.slf4j.LoggerFactory.getLogger("test")).recover()

        assertEquals("FAILED_RUNTIME", matchRow(launched.match.matchId).first)
        val rooms = RoomService(source(), DeckAuthorization(source()))
        assertEquals(RoomStatus.OPEN, rooms.find(room.roomId)!!.status)
    }

    /** A finished match is history, and a restart does not rewrite it. */
    @Test
    fun `a restart leaves an already finished match alone`() {
        val (room, setupId) = preparedRoom()
        val launched = assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))
        val records = MatchRecords(source())
        records.recordRunning(launched.match.matchId, java.time.Instant.now())
        records.recordEnded(
            launched.match.matchId,
            GameOutcome(GameOutcome.WINNER, 1, 14),
            java.time.Instant.now(),
        )

        MatchRecovery(source(), org.slf4j.LoggerFactory.getLogger("test")).recover()

        val (status, summary, failure) = matchRow(launched.match.matchId)
        assertEquals("ENDED", status)
        assertEquals("winner:seat 1 on turn 14", summary, "a restart overwrote a real result")
        assertEquals(null, failure)
    }

    // --- P6-A ---------------------------------------------------------------

    /** §6.18, §6.19 — one match record, with the seats as prepared. */
    @Test
    fun `a ready setup launches exactly one match`() {
        val (room, setupId) = preparedRoom()

        val result = launcher().launch(setupId, room.hostUserId)

        val launched = assertIs<LaunchResult.Launched>(result, "got: $result")
        assertEquals(MatchStatus.LAUNCHING, launched.match.status)
        assertEquals(setupId, launched.match.setupId)
        assertEquals(2, launched.match.participants.size)
        assertEquals(listOf(1, 2), launched.match.participants.map { it.seatNumber })
        assertTrue(launched.match.participants.all { it.deckId != null })
        // §6.19 — the names are SNAPSHOTS, captured at launch.
        assertEquals(
            setOf("RudeLeft", "Pat"),
            launched.match.participants.map { it.displayName }.toSet(),
        )
        assertTrue(launched.match.participants.all { it.deckName == "Mono Red" })

        assertEquals(1, matchCount())
    }

    /** §6.16 — and the room follows it. */
    @Test
    fun `launching moves the room to IN_MATCH`() {
        val (room, setupId) = preparedRoom()
        assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))

        val rooms = RoomService(source(), DeckAuthorization(source()))
        assertEquals(RoomStatus.IN_MATCH, rooms.find(room.roomId)!!.status)
    }

    /**
     * A FAILED START GIVES THE ROOM BACK.
     *
     * The bug this was written against: launching consumes the
     * setup and locks the room, and nothing undid either when the
     * worker failed. The room sat in IN_MATCH holding a setup that
     * no longer existed, so the players could neither prepare
     * again nor start -- and the only thing that ever cleared it
     * was the 24-hour expiry sweep.
     *
     * The failure it actually hits is DECK_UNAVAILABLE -- this
     * harness inserts decks without resolved card rows, so the
     * seats cannot be built. That is the EARLIER of the two
     * failure paths and the easier one to leave unhandled, since
     * it returns before the worker is ever touched. No JVM is
     * spawned, so this costs milliseconds.
     *
     * Run against the un-fixed runtime this fails on the first
     * assertion with IN_MATCH (TEST-004).
     */
    @Test
    fun `a failed start returns the room to the players`() {
        val (room, setupId) = preparedRoom()
        val launched = assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))

        val rooms = RoomService(source(), DeckAuthorization(source()))
        val told = mutableListOf<String>()
        val watchRoom =
            object : RoomAnnouncer by SilentAnnouncer {
                override suspend fun roomChanged(room: Room) {
                    told += "ROOM ${room.status}"
                }
            }
        val runtime =
            MatchRuntime(
                source(),
                config(),
                announcer = { match, code, _ -> told += "MATCH ${match.status} $code" },
                rooms = rooms,
                roomAnnouncer = watchRoom,
            )

        val result = runtime.beginBlocking(launched.match)
        assertIs<WorkerStart.Failed>(result)

        // The room is usable again...
        val after = rooms.find(room.roomId)!!
        assertEquals(RoomStatus.OPEN, after.status)
        // ...and nobody is still ticked, because the decks were
        // released with the setup and a ready seat without a deck
        // is the state §5's CHECK constraint forbids.
        assertTrue(after.members.none { it.ready }, "somebody was left ready")

        // And BOTH halves were announced, because a room that is
        // open again but says IN_MATCH on screen is the same bug
        // from the player's side.
        assertEquals(
            listOf("MATCH FAILED_STARTUP DECK_UNAVAILABLE", "ROOM OPEN"),
            told,
        )
    }

    /** The same path must not disturb a room that is not in a match. */
    @Test
    fun `releasing a room leaves an unrelated open room alone`() {
        val (room, _) = preparedRoom()
        val rooms = RoomService(source(), DeckAuthorization(source()))
        val before = rooms.find(room.roomId)!!.revision

        MatchRecords(source()).releaseRoom(room.roomId)

        // Still READY_FOR_MATCH: the UPDATE is conditional on
        // IN_MATCH, so a stray release cannot unlock a prepared
        // room out from under a launch that is about to happen.
        val after = rooms.find(room.roomId)!!
        assertEquals(RoomStatus.READY_FOR_MATCH, after.status)
        assertEquals(before, after.revision)
    }

    /**
     * §6.152 — WHILE A MATCH IS ON, THE LOBBY DOES NOTHING.
     *
     * Found from the other end: the owner noticed "Prepare match"
     * was clickable again after starting a game, and reasonably
     * assumed it was cosmetic. It was not. Four room mutations ran
     * with no status guard at all, and the worst of them was
     * cancel-preparation -- it sets the room back to OPEN and
     * clears readiness, so calling it mid-match would have let the
     * host prepare and launch a SECOND match with the same two
     * players. Two Forge JVMs, two games, the first orphaned.
     *
     * §6.152 is the rule that settles the whole group: a browser
     * action is not a concession. Ending a game is Forge's
     * business (§6.153) or an operational termination (§6.162) --
     * never a lobby button.
     *
     * Every assertion here fails against the unguarded code.
     */
    @Test
    fun `the lobby cannot touch a room that is playing a match`() {
        val (room, setupId) = preparedRoom()
        assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))

        val rooms = RoomService(source(), DeckAuthorization(source()))
        val host = room.hostUserId
        val guest = room.members.first { it.userId != host }.userId

        // The one with no guard at all, and the dangerous one.
        assertRefused(setups().cancel(room.roomId, host), "cancel-preparation")

        // The host cannot take the game away from the other player.
        assertRefused(rooms.close(room.roomId, host), "close")
        assertRefused(rooms.remove(room.roomId, host, guest), "remove")

        // And a player cannot walk out of a game through the lobby.
        assertRefused(rooms.leave(room.roomId, guest), "leave")

        // Nothing moved: still IN_MATCH, still both seats.
        val after = rooms.find(room.roomId)!!
        assertEquals(RoomStatus.IN_MATCH, after.status)
        assertEquals(2, after.members.size)
    }

    private fun assertRefused(
        result: RoomResult,
        what: String,
    ) {
        val refused = assertIs<RoomResult.Refused>(result, "$what was allowed during a match")
        assertEquals(RoomError.MatchInProgress, refused.error, "$what gave the wrong reason")
    }

    // --- P6-B, the one that matters -----------------------------------------

    /**
     * §6.9 — two concurrent launches, one match.
     *
     * A barrier so both threads are inside the window at once. The
     * sequential version of this test passes against a
     * check-then-update implementation, which is exactly the
     * implementation §6.9 forbids.
     */
    @Test
    fun `two concurrent launches create exactly one match`() {
        val (room, setupId) = preparedRoom()
        val host = room.hostUserId

        val barrier = CyclicBarrier(2)
        val pool = Executors.newFixedThreadPool(2)
        val task =
            Callable {
                barrier.await(10, TimeUnit.SECONDS)
                launcher().launch(setupId, host)
            }

        val results = pool.invokeAll(listOf(task, task)).map { it.get() }
        pool.shutdown()

        val launched = results.filterIsInstance<LaunchResult.Launched>()
        val refused = results.filterIsInstance<LaunchResult.Refused>()

        assertEquals(1, launched.size, "expected exactly one winner, got: $results")
        assertEquals(1, refused.size)
        // §6.9's own words: the loser must not get a second runtime.
        assertEquals(1, matchCount(), "a second match record was created")
        // The loser is a participant, not a stranger: they are told
        // the match started, not that nothing exists.
        assertEquals(LaunchError.AlreadyLaunched, refused.single().error)
    }

    /** And sequentially, which is the ordinary case. */
    @Test
    fun `launching twice is refused the second time`() {
        val (room, setupId) = preparedRoom()
        assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))

        val again = launcher().launch(setupId, room.hostUserId)
        assertEquals(LaunchError.AlreadyLaunched, assertIs<LaunchResult.Refused>(again).error)
        assertEquals(1, matchCount())
    }

    // --- P6-C ----------------------------------------------------------------

    /**
     * §6.12 — a share revoked between preparation and launch.
     *
     * The setup is NOT consumed: it stays claimable, so the host
     * can fix the problem and launch rather than having to prepare
     * from scratch.
     */
    @Test
    fun `a deck revoked after preparation stops the launch`() {
        val (room, setupId) = preparedRoom()
        val host = room.hostUserId
        val guest = userId("Pat")
        val deckId = room.members.first { it.userId == guest }.selectedDeckId!!

        DeckSharing(source(), DeckAuthorization(source())).revoke(deckId, host, guest)

        val result = launcher().launch(setupId, host)
        val refused = assertIs<LaunchResult.Refused>(result, "got: $result")
        assertIs<LaunchError.RevalidationFailed>(refused.error)
        assertEquals(0, matchCount(), "a match was created from an unusable setup")

        // §5.101 — the host learns WHICH seat, never why.
        assertTrue(refused.error.detail.contains("Pat"))
        assertTrue(
            !refused.error.detail.contains("revok", ignoreCase = true),
            "the host was told the reason: ${refused.error.detail}",
        )
    }

    /** §6.12 — a disabled account stops it too. */
    @Test
    fun `a disabled participant stops the launch`() {
        val (room, setupId) = preparedRoom()
        Accounts(source()).setStatus(userId("Pat"), AccountStatus.DISABLED)

        val result = launcher().launch(setupId, room.hostUserId)
        assertIs<LaunchError.RevalidationFailed>(assertIs<LaunchResult.Refused>(result).error)
        assertEquals(0, matchCount())
    }

    // --- §6.11 authority -------------------------------------------------------

    /** §6.11 — a participant who is not the host cannot start it. */
    @Test
    fun `a non-host cannot launch`() {
        val (_, setupId) = preparedRoom()

        val result = launcher().launch(setupId, userId("Pat"))
        assertEquals(LaunchError.HostRequired, assertIs<LaunchResult.Refused>(result).error)
        assertEquals(0, matchCount())
    }

    /** A setup id that was never issued tells you nothing. */
    @Test
    fun `an unknown setup is refused without saying more`() {
        val result = launcher().launch(UUID.randomUUID(), userId("RudeLeft"))
        assertEquals(LaunchError.SetupNotFound, assertIs<LaunchResult.Refused>(result).error)
    }

    /** §6.185, and the Phase 5 fix it depends on: a deck that was
     *  played with is still the owner's to delete. */
    @Test
    fun `a deck can be deleted after the match that used it`() {
        val (room, setupId) = preparedRoom()
        assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))
        val deckId = room.members.first().selectedDeckId!!

        // The room's own reference goes first; that is Phase 5's.
        source().connection.use { connection ->
            connection.prepareStatement(
                "UPDATE room_member SET ready = FALSE, selected_deck_id = NULL " +
                    "WHERE selected_deck_id = ?",
            ).use {
                it.setObject(1, deckId)
                it.executeUpdate()
            }
        }

        val deleted =
            runCatching {
                source().connection.use { connection ->
                    connection.prepareStatement("DELETE FROM imported_deck WHERE deck_id = ?")
                        .use {
                            it.setObject(1, deckId)
                            it.executeUpdate()
                        }
                }
            }
        assertTrue(
            deleted.isSuccess,
            "a played match held the deck: ${deleted.exceptionOrNull()?.message}",
        )

        // And the match still says what was played.
        source().connection.use { connection ->
            connection.prepareStatement(
                "SELECT deck_name_snapshot, deck_id FROM match_participant LIMIT 1",
            ).use {
                it.executeQuery().use { rows ->
                    rows.next()
                    assertEquals("Mono Red", rows.getString(1))
                    assertEquals(null, rows.getObject(2))
                }
            }
        }
    }
}
