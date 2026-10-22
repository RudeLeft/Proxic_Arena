package net.barnflix.proxic.deck

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import net.barnflix.proxic.ServerConfig
import org.slf4j.LoggerFactory
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit

// Card resolution through the Forge worker — PHASE_02 §2.46–§2.49.
//
// The server does not own a card database and never will: Forge is
// the authority on what a card is (AGENTS ARCH-001). Resolution is a
// question asked of a worker process, not a lookup done here.

/** What Forge said about one requested entry. */
data class CardResolution(
    val name: String,
    val status: Status,
    val detail: String?,
    val actualSet: String? = null,
    val actualNumber: String? = null,
    /** PHASE_07 Amendment 10 — LAND, CREATURE or SPELL, as Forge reads the card. */
    val category: String? = null,
) {
    enum class Status { RESOLVED, NOT_FOUND, PRINTING_MISMATCH, UNAVAILABLE }
}

/** What Forge's own deck contains (PHASE_02 §2.92–§2.94). */
data class ForgeDeckBuild(
    val totalCards: Int,
    val countsByName: Map<String, Int>,
    val unresolved: List<String>,
)

class CardResolver(private val config: ServerConfig) {
    private val log = LoggerFactory.getLogger(CardResolver::class.java)
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Resolve every distinct entry in a deck.
     *
     * One worker per call. Loading Forge costs ~2.8 s and ~611 MB,
     * so the whole deck is asked in ONE request rather than one
     * process per card — sixty-five workers would be 40 GB.
     *
     * Never throws. A worker that cannot start produces
     * [CardResolution.Status.UNAVAILABLE] for every entry, because
     * an import failing is a result and a 500 is not (§1.66).
     */
    fun resolve(
        entries: List<DeckEntry>,
        timeoutSeconds: Long = 120,
    ): List<CardResolution> {
        val distinct = entries.distinctBy { it.name.lowercase() }
        if (distinct.isEmpty()) return emptyList()

        val jar = config.forgeWorkerJar
        if (jar.isNullOrBlank() || !File(jar).isFile) {
            return unavailable(distinct, "the card checker is not configured")
        }

        return runCatching { ask(distinct, File(jar), timeoutSeconds) }
            .getOrElse { failure ->
                log.warn("card resolution failed: {}", failure.javaClass.simpleName)
                unavailable(distinct, "the card checker could not be reached")
            }
    }

    private fun unavailable(
        entries: List<DeckEntry>,
        why: String,
    ) = entries.map { CardResolution(it.name, CardResolution.Status.UNAVAILABLE, why) }

    /**
     * Build the deck in Forge and report what FORGE sees.
     *
     * PHASE_02 §2.92-§2.94. The counts come from Forge's own card
     * pool, not from the numbers Arena sent: comparing Arena's
     * numbers to Arena's numbers would prove nothing.
     */
    fun buildDeck(
        entries: List<DeckEntry>,
        timeoutSeconds: Long = 120,
    ): ForgeDeckBuild {
        val jar = config.forgeWorkerJar
        if (jar.isNullOrBlank() || !File(jar).isFile) {
            return ForgeDeckBuild(0, emptyMap(), listOf("the card checker is not configured"))
        }
        val request =
            buildJsonObject {
                put("protocolVersion", net.barnflix.proxic.BuildInfo.PROTOCOL_VERSION)
                put("type", "BUILD_DECK")
                put("messageId", UUID.randomUUID().toString())
                put(
                    "cards",
                    buildJsonArray {
                        entries.forEach { entry ->
                            add(
                                buildJsonObject {
                                    put("name", entry.name)
                                    entry.setCode?.let { put("set", it) }
                                    entry.collectorNumber?.let { put("number", it) }
                                    put("quantity", entry.quantity)
                                },
                            )
                        }
                    },
                )
            }

        val reply =
            runCatching { exchange(request, File(jar), timeoutSeconds) }.getOrNull()
                ?: return ForgeDeckBuild(0, emptyMap(), listOf("the card checker could not be reached"))

        if (reply["type"]?.jsonPrimitive?.content != "DECK_BUILT") {
            return ForgeDeckBuild(0, emptyMap(), listOf("the card checker could not build the deck"))
        }
        return ForgeDeckBuild(
            totalCards = reply["totalCards"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0,
            countsByName =
                reply["countsByName"]?.jsonObject?.mapValues {
                    it.value.jsonPrimitive.content.toIntOrNull() ?: 0
                }.orEmpty(),
            unresolved = reply["unresolved"]?.jsonArray?.map { it.jsonPrimitive.content }.orEmpty(),
        )
    }

    /**
     * Send one request to a fresh worker and return its reply frame.
     *
     * One process per exchange. Forge costs ~2.8 s and ~611 MB to
     * load, so the caller asks for a whole deck at once rather than
     * a card at a time.
     */
    private fun exchange(
        request: JsonObject,
        jar: File,
        timeoutSeconds: Long,
    ): JsonObject? {
        val command =
            buildList {
                add(javaExecutable())
                add("-jar")
                add(jar.absolutePath)
                config.forgeResRoot?.let { add(it) }
            }
        val process =
            ProcessBuilder(command)
                .redirectError(ProcessBuilder.Redirect.DISCARD)
                .start()
        try {
            val reader = process.inputStream.bufferedReader()
            val writer = process.outputStream.bufferedWriter()
            // The worker announces WORKER_READY unprompted.
            readLine(reader, process, timeoutSeconds) ?: return null
            writer.write(json.encodeToString(JsonObject.serializer(), request))
            writer.write("\n")
            writer.flush()
            val reply = readLine(reader, process, timeoutSeconds) ?: return null
            return runCatching { json.parseToJsonElement(reply).jsonObject }.getOrNull()
        } finally {
            shutdown(process)
        }
    }

    private fun ask(
        entries: List<DeckEntry>,
        jar: File,
        timeoutSeconds: Long,
    ): List<CardResolution> {
        val command =
            buildList {
                add(javaExecutable())
                add("-jar")
                add(jar.absolutePath)
                config.forgeResRoot?.let { add(it) }
            }
        val process =
            ProcessBuilder(command)
                // Forge logs its 33,980-script load to stderr. Discarded
                // here; Phase 6 will want it captured per match.
                .redirectError(ProcessBuilder.Redirect.DISCARD)
                .start()

        try {
            val reader = process.inputStream.bufferedReader()
            val writer = process.outputStream.bufferedWriter()

            // The worker announces WORKER_READY unprompted.
            readLine(reader, process, timeoutSeconds)
                ?: return unavailable(entries, "the card checker did not start")

            val messageId = UUID.randomUUID().toString()
            writer.write(json.encodeToString(JsonObject.serializer(), request(entries, messageId)))
            writer.write("\n")
            writer.flush()

            // The first load of the card database is ~2.8 s, and a
            // cold filesystem on the Unraid array is slower, so the
            // timeout is generous rather than tight.
            val reply =
                readLine(reader, process, timeoutSeconds)
                    ?: return unavailable(entries, "the card checker did not answer in time")

            return parse(reply, entries)
        } finally {
            shutdown(process)
        }
    }

    private fun request(
        entries: List<DeckEntry>,
        messageId: String,
    ): JsonObject =
        buildJsonObject {
            put("protocolVersion", net.barnflix.proxic.BuildInfo.PROTOCOL_VERSION)
            put("type", "RESOLVE_CARDS")
            put("messageId", messageId)
            put(
                "cards",
                buildJsonArray {
                    entries.forEach { entry ->
                        add(
                            buildJsonObject {
                                put("name", entry.name)
                                entry.setCode?.let { put("set", it) }
                                entry.collectorNumber?.let { put("number", it) }
                            },
                        )
                    }
                },
            )
        }

    private fun parse(
        reply: String,
        entries: List<DeckEntry>,
    ): List<CardResolution> {
        val frame =
            runCatching { json.parseToJsonElement(reply).jsonObject }.getOrNull()
                ?: return unavailable(entries, "the card checker sent an unreadable reply")

        if (frame["type"]?.jsonPrimitive?.content != "CARDS_RESOLVED") {
            return unavailable(entries, "the card checker could not resolve the deck")
        }

        val cards: JsonArray =
            frame["cards"]?.jsonArray
                ?: return unavailable(entries, "the card checker sent no results")

        return cards.map { element ->
            val card = element.jsonObject
            CardResolution(
                name = card["name"]?.jsonPrimitive?.content ?: "",
                status =
                    runCatching {
                        CardResolution.Status.valueOf(
                            card["status"]?.jsonPrimitive?.content ?: "UNAVAILABLE",
                        )
                    }.getOrDefault(CardResolution.Status.UNAVAILABLE),
                detail = (card["detail"] as? JsonPrimitive)?.content,
                actualSet = (card["actualSet"] as? JsonPrimitive)?.content,
                actualNumber = (card["actualNumber"] as? JsonPrimitive)?.content,
                category =
                    (card["category"] as? JsonPrimitive)?.content
                        ?.takeIf { it in setOf("LAND", "CREATURE", "SPELL") },
            )
        }
    }

    private fun readLine(
        reader: java.io.BufferedReader,
        process: Process,
        seconds: Long,
    ): String? {
        val deadline = System.currentTimeMillis() + seconds * 1000
        while (System.currentTimeMillis() < deadline) {
            if (reader.ready()) return reader.readLine()
            if (!process.isAlive && !reader.ready()) return null
            Thread.sleep(50)
        }
        return null
    }

    private fun shutdown(process: Process) {
        runCatching {
            process.outputStream.use { it.write("{\"type\":\"SHUTDOWN\"}\n".toByteArray()) }
        }
        if (!process.waitFor(5, TimeUnit.SECONDS)) {
            // ~611 MB per worker: a leaked one is not a small leak.
            process.destroyForcibly()
        }
    }

    private fun javaExecutable(): String {
        val home = System.getProperty("java.home")
        val name = if (System.getProperty("os.name").startsWith("Windows")) "java.exe" else "java"
        val candidate = File(File(home, "bin"), name)
        return if (candidate.isFile) candidate.absolutePath else "java"
    }
}
