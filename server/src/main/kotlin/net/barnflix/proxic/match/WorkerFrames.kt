package net.barnflix.proxic.match

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
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
        )
    }.getOrNull()

private fun readOptions(value: JsonElement?): List<DecisionOption> =
    (value as? JsonArray).orEmpty().mapNotNull { entry ->
        val option = entry as? JsonObject ?: return@mapNotNull null
        val actionId = option["actionId"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
        DecisionOption(actionId, option["label"]?.jsonPrimitive?.contentOrNull)
    }

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
