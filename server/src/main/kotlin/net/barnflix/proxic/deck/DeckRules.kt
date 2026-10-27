package net.barnflix.proxic.deck

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import net.barnflix.proxic.BuildInfo
import org.slf4j.LoggerFactory
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.zip.GZIPOutputStream

// The deck rules the Deck Builder follows — spec 0021 (owner 2026-10-27).
//
// The Deck Builder warns about a card Arena cannot play, picks a printing
// Arena accepts, and refuses a deck Arena would refuse, all before the
// player uploads. It does that from this document rather than from Forge,
// so a Forge update here reaches the Deck Builder with no release of its
// own. Two halves, from their two owners:
//
//   format  -- OpenFormat's own constants and its basic-land list, so this
//              document and import can never disagree (FMT-002, FMT-004);
//   cards, editions, setCodes -- the Forge worker's CARD_POOL answer, the
//              cards and printings this Forge loaded and the set codes its
//              own lookup accepts (ARCH-001: no Forge in this process).
//
// Asking the worker costs a process (~3 s, ~611 MB), so the pool is asked
// once per Forge commit and kept under /data/deck-rules. Import stays the
// authority: this document only lets the Deck Builder warn first.

class DeckRules(
    dataRoot: File,
    /** Asks a worker for CARD_POOL; null when none answered. */
    private val pool: () -> JsonObject?,
    private val forgeCommit: String = BuildInfo.FORGE_COMMIT,
    private val forgeRelease: String = BuildInfo.FORGE_RELEASE,
    private val arenaVersion: String = BuildInfo.PROXIC_VERSION,
) {
    /** One built document: its version (the ETag), and its bytes plain and gzipped. */
    class Document(val version: String, val json: ByteArray, val gzip: ByteArray)

    private val log = LoggerFactory.getLogger(DeckRules::class.java)
    private val folder = File(dataRoot, "deck-rules")
    private val lock = Any()

    @Volatile
    private var built: Document? = null

    /** The document, built on first use; null when no worker could answer. */
    fun document(): Document? {
        built?.let { return it }
        synchronized(lock) {
            built?.let { return it }
            val cards = storedPool() ?: askPool() ?: return null
            return assemble(cards).also { built = it }
        }
    }

    /** Where this Forge's pool is kept. A new worker revision asks again. */
    private fun poolFile() = File(folder, "pool-r$POOL_REVISION-$forgeCommit.json")

    private fun storedPool(): JsonObject? {
        val file = poolFile()
        if (!file.isFile) return null
        return runCatching { JSON.parseToJsonElement(file.readText()) as JsonObject }
            .onFailure { log.warn("ignoring an unreadable deck-rules pool at {}", file) }
            .getOrNull()
    }

    private fun askPool(): JsonObject? {
        val answer = pool() ?: return null
        val cards =
            buildJsonObject {
                POOL_PARTS.forEach { part -> answer[part]?.let { put(part, it) } }
            }
        if (POOL_PARTS.any { cards[it] == null }) {
            log.warn("the card pool answer was missing a part; not keeping it")
            return null
        }
        // Written beside its destination and moved over it, so a crash
        // never leaves half a pool that would be read back as a whole one.
        folder.mkdirs()
        val temporary = File(folder, poolFile().name + ".tmp")
        temporary.writeText(JSON.encodeToString(JsonObject.serializer(), cards))
        Files.move(
            temporary.toPath(),
            poolFile().toPath(),
            StandardCopyOption.REPLACE_EXISTING,
            StandardCopyOption.ATOMIC_MOVE,
        )
        return cards
    }

    private fun assemble(cards: JsonObject): Document {
        val format = formatPart()
        val version = versionOf(format)
        val document =
            buildJsonObject {
                put("rulesVersion", version)
                put("arenaVersion", arenaVersion)
                put("forgeRelease", forgeRelease)
                put("forgeCommit", forgeCommit)
                put("format", format)
                POOL_PARTS.forEach { part -> put(part, cards.getValue(part)) }
            }
        val json = JSON.encodeToString(JsonObject.serializer(), document).toByteArray(Charsets.UTF_8)
        val gzip = ByteArrayOutputStream().also { out -> GZIPOutputStream(out).use { it.write(json) } }
        log.info(
            "deck rules {} ready: {} cards, {} bytes ({} gzipped)",
            version,
            (cards["cards"] as? JsonArray)?.size ?: 0,
            json.size,
            gzip.size(),
        )
        return Document(version, json, gzip.toByteArray())
    }

    /** Changes whenever the Forge, the pool's shape or any format rule can. */
    private fun versionOf(format: JsonElement): String {
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update("$forgeCommit\nr$POOL_REVISION\n$format".toByteArray(Charsets.UTF_8))
        return digest.digest().take(8).joinToString("") { "%02x".format(it) }
    }

    companion object {
        /** Raised when CARD_POOL's answer changes shape or meaning, so a kept pool is asked again. */
        const val POOL_REVISION = 1

        private val POOL_PARTS = listOf("cards", "editions", "setCodes")
        private val JSON = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }

        /** Open Format as the Deck Builder needs it, from OpenFormat's own constants. */
        fun formatPart(): JsonObject =
            buildJsonObject {
                put("name", "Open Format")
                put("minCards", OpenFormat.MIN_CARDS)
                put("maxCards", OpenFormat.MAX_CARDS)
                put("maxCopies", OpenFormat.MAX_COPIES)
                // FMT-004: the names exempt from the copy limit, and only
                // those -- never "any number" cards like Relentless Rats.
                put(
                    "unlimitedCopies",
                    buildJsonArray { OpenFormat.BASIC_LAND_NAMES.sorted().forEach { add(it) } },
                )
                put("sideboard", false)
                putJsonObject("sideDecks") {
                    OpenFormat.SIDE_DECKS.toSortedMap().forEach { (section, least) ->
                        putJsonObject(section) {
                            put("minCards", least)
                            put("maxCopies", OpenFormat.SIDE_DECK_MAX_COPIES)
                        }
                    }
                }
            }
    }
}
