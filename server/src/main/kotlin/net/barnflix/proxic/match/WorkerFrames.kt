package net.barnflix.proxic.match

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import net.barnflix.proxic.BuildInfo
import java.util.UUID

// Reading and writing the worker's wire — PHASE_06 §6.24, §6.99,
// §6.100.
//
// Split out of MatchWorker, which owns a process, a pipe and two
// threads and should not also own a parser. Everything here is a
// pure function over one frame, which is what makes it testable
// without spawning a 611 MB JVM.
//
// Nothing throws. A frame that does not read is null, and the
// caller drops it: the worker's stdout also carries Forge's own
// output, and a server that fell over on an unexpected line would
// be a server that fell over whenever Forge logged something new.

/** §6.99 — the question Forge is blocked on. */
fun readDecisionFrame(frame: JsonObject): DecisionRequest? =
    runCatching {
        DecisionRequest(
            decisionId = frame.getValue("decisionId").jsonPrimitive.content.toLong(),
            // §6.37 — BOTH seats, and neither inferred from the
            // other. A frame missing either is unreadable rather
            // than half-understood: guessing the authorised seat
            // is how a Mindslavered player answers for themselves.
            actedForSeat = frame.getValue("actedForSeat").jsonPrimitive.int,
            authorisedSeat = frame.getValue("authorisedSeat").jsonPrimitive.int,
            kind = frame["kind"]?.jsonPrimitive?.content ?: "unknown",
            stateVersion = frame.getValue("stateVersion").jsonPrimitive.content.toLong(),
            options = readOptions(frame["options"]),
            // Absent means optional, which is the safe default:
            // an older worker that does not send it cannot
            // accidentally make a decision unrefusable.
            mandatory = frame["mandatory"]?.jsonPrimitive?.contentOrNull?.toBoolean() ?: false,
            prompt = frame["prompt"]?.jsonPrimitive?.contentOrNull,
            searchable = frame["searchable"]?.jsonPrimitive?.contentOrNull?.toBoolean() ?: false,
            optionCount = frame["optionCount"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: 0,
            gameEpoch = frame["gameEpoch"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: 1,
            // B7 -- object id to reason; anything not a string pair is dropped.
            unavailable =
                (frame["unavailable"] as? JsonObject).orEmpty().mapNotNull { (objectId, reason) ->
                    (reason as? JsonPrimitive)?.contentOrNull?.let { objectId to it }
                }.toMap(),
            about =
                (frame["about"] as? JsonObject).orEmpty().mapNotNull { (key, value) ->
                    (value as? JsonPrimitive)?.contentOrNull?.let { key to it }
                }.toMap(),
            looking = (frame["looking"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject },
            window = (frame["window"] as? JsonPrimitive)?.booleanOrNull == true,
        )
    }.getOrNull()

/** P6-AG — what a search found, for the seat that searched. */
fun readOptionsFrame(frame: JsonObject): WorkerEvent.Options? =
    runCatching {
        WorkerEvent.Options(
            decisionId = frame.getValue("decisionId").jsonPrimitive.content.toLong(),
            seat = frame.getValue("seat").jsonPrimitive.int,
            query = frame["query"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            options = readOptions(frame["options"]),
            total = frame["total"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: 0,
        )
    }.getOrNull()

private fun readOptions(value: JsonElement?): List<DecisionOption> =
    (value as? JsonArray).orEmpty().mapNotNull { entry ->
        val option = entry as? JsonObject ?: return@mapNotNull null
        val actionId = option["actionId"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
        DecisionOption(
            actionId,
            option["label"]?.jsonPrimitive?.contentOrNull,
            objectId = option["objectId"]?.jsonPrimitive?.contentOrNull,
            // Only an explicit false: absent means payable (§7.54).
            payable = option["payable"]?.jsonPrimitive?.contentOrNull != "false",
            cost = option["cost"]?.jsonPrimitive?.contentOrNull,
        )
    }

/** §6.149, §6.151 — what Forge said, read without interpretation. */
fun readOutcomeFrame(frame: JsonObject): GameOutcome? =
    runCatching {
        GameOutcome(
            kind = frame.getValue("outcome").jsonPrimitive.content,
            // Absent for a draw, for a game with no outcome and
            // for a failure. Absent is NOT seat zero.
            winningSeat = frame["winningSeat"]?.jsonPrimitive?.contentOrNull?.toIntOrNull(),
            turn = frame["turn"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: 0,
            detail = frame["detail"]?.jsonPrimitive?.contentOrNull,
            reason = frame["reason"]?.jsonPrimitive?.contentOrNull,
            concededSeat = frame["concededSeat"]?.jsonPrimitive?.contentOrNull?.toIntOrNull(),
        )
    }.getOrNull()

fun readDecisionId(frame: JsonObject): Long? = frame["decisionId"]?.jsonPrimitive?.contentOrNull?.toLongOrNull()

/**
 * The gate's reason, as this side's vocabulary.
 *
 * An unknown reason becomes NOT_PENDING rather than being
 * invented: both mean "your answer did not take", and the
 * alternative is a client told something the server made up.
 */
fun readRefusal(frame: JsonObject): DecisionRefusal =
    runCatching {
        DecisionRefusal.valueOf(frame.getValue("detail").jsonPrimitive.content)
    }.getOrDefault(DecisionRefusal.NOT_PENDING)

/**
 * §6.10 — what the worker is told to start.
 *
 * Card NAMES and printings, not deck ids: the worker has no
 * database and §6.107 keeps it that way.
 */
fun startGameFrame(
    matchId: UUID,
    seats: List<WorkerSeat>,
): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", "START_GAME")
        put("messageId", UUID.randomUUID().toString())
        put("matchId", matchId.toString())
        putJsonArray("players") {
            seats.forEach { seat ->
                add(
                    buildJsonObject {
                        put("displayName", seat.displayName)
                        // The identity the worker routes decisions
                        // on. Display names are not unique.
                        put("seatNumber", seat.seatNumber)
                        put("cards", cardsOf(seat))
                        seat.stops?.let { put("stops", stopsJson(it)) }
                    },
                )
            }
        }
    }

private fun cardsOf(seat: WorkerSeat): JsonArray =
    buildJsonArray {
        seat.cards.forEach { card ->
            add(
                buildJsonObject {
                    put("name", card.name)
                    card.setCode?.let { put("set", it) }
                    card.collectorNumber?.let { put("number", it) }
                    put("quantity", card.quantity)
                },
            )
        }
    }

/**
 * P6-AG — a search, for the seat the SERVER authorised.
 *
 * Not an answer: the gate is not touched and nothing in the game
 * moves. The seat is the server's for the same reason an answer's
 * is.
 */
fun decisionSearchFrame(
    decisionId: Long,
    seat: Int,
    query: String,
): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", "DECISION_SEARCH")
        put("messageId", UUID.randomUUID().toString())
        put("decisionId", decisionId)
        put("seat", seat)
        put("query", query)
    }

/**
 * §6.100 — an answer the SERVER authorised.
 *
 * `seat` and `stateVersion` are the server's, never the browser's.
 * A client that could name its own state version could defeat
 * §6.104's staleness check simply by naming the current one.
 */
fun decisionResponseFrame(
    decisionId: Long,
    seat: Int,
    stateVersion: Long,
    actionId: String?,
): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", "DECISION_RESPONSE")
        put("messageId", UUID.randomUUID().toString())
        put("decisionId", decisionId)
        put("seat", seat)
        put("stateVersion", stateVersion)
        // Absent means PASS, which is an answer and not the
        // absence of one.
        actionId?.let { put("actionId", it) }
    }
