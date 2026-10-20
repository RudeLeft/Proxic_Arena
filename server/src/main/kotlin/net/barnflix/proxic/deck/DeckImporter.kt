package net.barnflix.proxic.deck

import net.barnflix.proxic.ServerConfig
import org.slf4j.LoggerFactory
import java.io.File
import java.util.Locale
import java.util.UUID
import java.util.zip.ZipFile
import javax.sql.DataSource

// The import pipeline — PHASE_02 §2.17, §2.18, §2.37, §2.38.
//
// §2.18 is the rule everything here serves: a deck must not appear
// imported when half its files copied, the insert failed, Forge
// resolution failed or the manifest was not written. So the work
// happens in a staging directory, the database write is one
// transaction, and the deck becomes visible only when all of it
// succeeded.

sealed interface ImportResult {
    data class Imported(
        val deckId: UUID,
        val displayName: String,
        val totalCards: Int,
        val distinctCards: Int,
        val artStored: Int,
        val entriesWithoutArt: Int,
    ) : ImportResult

    /** One reason, or many: a player fixing one problem per upload is worse. */
    data class Rejected(val code: String, val detail: String, val problems: List<String>) :
        ImportResult

    data class Duplicate(val existingDeckId: UUID, val displayName: String) : ImportResult
}

/**
 * Everything a validated import needs to become rows.
 *
 * Introduced because `persist` had grown to seven parameters, which
 * detekt flagged and which was genuinely hard to call correctly: two
 * of them were Strings that could be swapped without the compiler
 * noticing.
 */
private data class PreparedImport(
    val deckId: UUID,
    /** §4.52 — bound at import, from the SESSION, never from the request. */
    val ownerUserId: UUID,
    val displayName: String,
    val sourceFilename: String,
    val checksum: String,
    val deck: ParsedDeck,
    val resolutions: Map<String, CardResolution>,
    val art: Map<String, StoredArt>,
)

class DeckImporter(
    private val config: ServerConfig,
    private val dataSource: DataSource,
    private val resolver: CardResolver,
) {
    private val log = LoggerFactory.getLogger(DeckImporter::class.java)

    private val dataRoot = File(config.dataRoot)
    private val artStore = ArtStore(dataRoot)

    /** §2.14 — the manifest shape, so a change can be detected later. */
    private val manifestSchemaVersion = 1

    /**
     * @param ownerUserId PHASE_04 §4.52, §4.6 -- the authenticated
     *   caller, resolved from their session by the route. It is a
     *   required parameter rather than an optional one so that an
     *   ownerless import cannot be written by accident (§4.53), and
     *   it is never read from the request body: a client that can
     *   name the owner can give a deck to somebody else.
     */
    fun import(
        upload: File,
        originalFilename: String,
        ownerUserId: UUID,
    ): ImportResult {
        // §2.37 — one isolated staging directory per import, under
        // /data and NEVER /tmp: the production container runs with a
        // read-only root and /tmp on a tmpfs, so extracting there
        // would consume RAM rather than disk.
        val importId = UUID.randomUUID()
        val staging = File(dataRoot, "temp/deck-imports/$importId")

        return try {
            staging.mkdirs()
            runImport(upload, originalFilename, staging, ownerUserId)
        } catch (e: Exception) {
            log.error("import {} failed unexpectedly", importId, e)
            ImportResult.Rejected(
                "IMPORT_FAILED",
                // §2.76 — no stack trace, no path, to the client.
                "The package could not be imported.",
                emptyList(),
            )
        } finally {
            // §2.38 — cleaned up after success, failure, exception
            // and abandonment alike. A staging directory that
            // survives a crash is a disk leak nobody watches.
            staging.deleteRecursively()
        }
    }

    private fun runImport(
        upload: File,
        originalFilename: String,
        staging: File,
        ownerUserId: UUID,
    ): ImportResult {
        // 1-3. Structure and limits, before anything is extracted.
        val inspected =
            when (val result = PackageInspector.inspect(upload)) {
                is PackageResult.Rejected ->
                    return ImportResult.Rejected(result.code, result.detail, emptyList())

                is PackageResult.Ok -> result.inspected
            }

        // §2.72 — the checksum, and the owner's D3 duplicate rule.
        val checksum = ArtStore.sha256Of(upload)
        existingDeck(checksum, ownerUserId)?.let { return it }

        // 4-6. Extract and parse.
        val deckText =
            ZipFile(upload).use { zip ->
                val entry = zip.getEntry(inspected.deckTextEntry)
                if (entry.size > PackageLimits.MAX_DECK_TEXT_BYTES) {
                    return ImportResult.Rejected(
                        "DECK_TEXT_TOO_LARGE",
                        "The decklist is ${entry.size} bytes.",
                        emptyList(),
                    )
                }
                zip.getInputStream(entry).readBytes().toString(Charsets.UTF_8)
            }

        val deck =
            when (val parsed = DeckListParser.parse(deckText)) {
                is DeckParseResult.Invalid -> return ImportResult.Rejected(
                    "INVALID_DECK_LIST",
                    "Line ${parsed.line}: ${parsed.reason}",
                    emptyList(),
                )

                is DeckParseResult.Ok -> parsed.deck
            }

        // §2.44, §2.45 — Open Format legality, before Forge is asked
        // anything. Resolving 65 cards costs ~3 seconds; refusing an
        // illegal deck costs nothing.
        val violations = OpenFormat.validate(deck)
        if (violations.isNotEmpty()) {
            return ImportResult.Rejected(
                "DECK_NOT_LEGAL",
                "The deck is not legal in Open Format.",
                violations.map { it.detail },
            )
        }

        // 7. Forge resolution (§2.46–§2.49).
        val resolutions = resolver.resolve(deck.entries).associateBy { it.name.lowercase() }
        val unresolved =
            deck.entries.filter {
                resolutions[it.name.lowercase()]?.status != CardResolution.Status.RESOLVED
            }
        if (unresolved.isNotEmpty()) {
            // Owner decision D2: one unresolvable card rejects the
            // whole import. Never a degraded or flagged deck, and
            // never a substitution (§2.94).
            return ImportResult.Rejected(
                "CARDS_NOT_RESOLVED",
                "Forge could not resolve every card in this deck.",
                unresolved.map { entry ->
                    val detail = resolutions[entry.name.lowercase()]?.detail
                    "Line ${entry.lineNumber}: ${entry.name}${detail?.let { " — $it" } ?: ""}"
                },
            )
        }

        // 8. Artwork.
        val artByFrontName = mutableMapOf<String, StoredArt>()
        val artProblems = storeArtwork(upload, inspected, staging, artByFrontName)
        if (artProblems.isNotEmpty()) {
            return ImportResult.Rejected(
                "INVALID_ARTWORK",
                "The package contains artwork that is not a usable image.",
                artProblems,
            )
        }

        // 9-10. One transaction. Either the whole deck exists or
        // none of it does (§2.18).
        val deckId = UUID.randomUUID()
        return persist(
            PreparedImport(
                deckId = deckId,
                ownerUserId = ownerUserId,
                displayName = deck.declaredName ?: originalFilename.removeSuffix(".zip"),
                sourceFilename = originalFilename,
                checksum = checksum,
                deck = deck,
                resolutions = resolutions,
                art = artByFrontName,
            ),
        )
    }

    /**
     * Extract, validate and store each image, returning the problems.
     *
     * Members are extracted ONE AT A TIME into staging and deleted
     * immediately after storing, so a package of many large images
     * never has more than one of them expanded at once.
     */
    private fun storeArtwork(
        upload: File,
        inspected: InspectedPackage,
        staging: File,
        into: MutableMap<String, StoredArt>,
    ): List<String> {
        val problems = mutableListOf<String>()
        ZipFile(upload).use { zip ->
            for (member in inspected.imageEntries) {
                val extracted = File(staging, "art-${into.size}.png")
                zip.getInputStream(zip.getEntry(member)).use { input ->
                    extracted.outputStream().use { output -> input.copyTo(output) }
                }
                when (val stored = artStore.store(extracted, member)) {
                    is ArtResult.Rejected -> problems += "${stored.code}: ${stored.detail}"
                    is ArtResult.Ok -> into[frontNameOf(member)] = stored.art
                }
                extracted.delete()
            }
        }
        return problems
    }

    private fun persist(prepared: PreparedImport): ImportResult {
        // Named access rather than destructuring: seven positional
        // names is exactly the readability problem the value type
        // was introduced to solve.
        val deckId = prepared.deckId
        val displayName = prepared.displayName
        val originalFilename = prepared.sourceFilename
        val checksum = prepared.checksum
        val deck = prepared.deck
        val resolutions = prepared.resolutions
        val art = prepared.art
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                connection.prepareStatement(
                    """
                    INSERT INTO imported_deck
                      (deck_id, display_name, source_filename, package_sha256,
                       total_cards, distinct_cards, import_schema_version, owner_user_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """.trimIndent(),
                ).use { statement ->
                    statement.setObject(1, deckId)
                    statement.setString(2, displayName)
                    statement.setString(3, originalFilename)
                    statement.setString(4, checksum)
                    statement.setInt(5, deck.totalCards)
                    statement.setInt(6, deck.entries.size)
                    statement.setInt(7, manifestSchemaVersion)
                    statement.setObject(8, prepared.ownerUserId)
                    statement.executeUpdate()
                }

                for (stored in art.values.distinctBy { it.sha256 }) {
                    // Another deck may already have this art, which
                    // is the point of content addressing.
                    connection.prepareStatement(
                        """
                        INSERT INTO art_asset (content_sha256, byte_size)
                        VALUES (?, ?) ON CONFLICT (content_sha256) DO NOTHING
                        """.trimIndent(),
                    ).use {
                        it.setString(1, stored.sha256)
                        it.setLong(2, stored.byteSize)
                        it.executeUpdate()
                    }
                }

                for (entry in deck.entries) {
                    val resolution = resolutions[entry.name.lowercase()]
                    connection.prepareStatement(
                        """
                        INSERT INTO deck_entry
                          (deck_id, line_number, quantity, card_name, set_code,
                           collector_number, source_text, resolution_status,
                           resolved_set, resolved_number, art_sha256)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """.trimIndent(),
                    ).use { statement ->
                        statement.setObject(1, deckId)
                        statement.setInt(2, entry.lineNumber)
                        statement.setInt(3, entry.quantity)
                        statement.setString(4, entry.name)
                        statement.setString(5, entry.setCode)
                        statement.setString(6, entry.collectorNumber)
                        statement.setString(7, entry.sourceText)
                        statement.setString(8, resolution?.status?.name ?: "UNAVAILABLE")
                        statement.setString(9, resolution?.actualSet)
                        statement.setString(10, resolution?.actualNumber)
                        statement.setString(11, art[entry.frontFaceName.lowercase()]?.sha256)
                        statement.executeUpdate()
                    }
                }

                connection.commit()
            } catch (e: Exception) {
                connection.rollback()
                // A unique violation here is the duplicate rule
                // winning a race: two uploads of one package by the
                // SAME owner, both past the earlier check. The
                // constraint is (owner, checksum) since PHASE 4
                // AMENDMENT 4, so its name changed with it.
                if (e.toString().contains("package_sha256", ignoreCase = true) ||
                    e.toString().contains("owner_package_unique", ignoreCase = true)
                ) {
                    return existingDeck(checksum, prepared.ownerUserId)
                        ?: ImportResult.Rejected("DUPLICATE", "This package was already imported.", emptyList())
                }
                log.error("persisting deck {} failed", deckId, e)
                return ImportResult.Rejected(
                    "IMPORT_FAILED",
                    "The deck could not be stored.",
                    emptyList(),
                )
            }
        }

        return ImportResult.Imported(
            deckId = deckId,
            displayName = displayName,
            totalCards = deck.totalCards,
            distinctCards = deck.entries.size,
            artStored = art.size,
            entriesWithoutArt = deck.entries.count { art[it.frontFaceName.lowercase()] == null },
        )
    }

    /**
     * Has THIS owner already imported this package?
     *
     * PHASE 4 AMENDMENT 4. Scoped to the owner, for two reasons
     * measured on the running server: a global lookup told a second
     * user the name and id of a private deck they had no access to
     * (§4.65), and it meant whoever imported a file first owned it
     * forever.
     *
     * The answer still names the deck, because for the owner it IS
     * their deck -- being told "you already have this, here it is"
     * is the whole value of the check (§2.72, owner decision D3).
     */
    private fun existingDeck(
        checksum: String,
        ownerUserId: UUID,
    ): ImportResult.Duplicate? {
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "SELECT deck_id, display_name FROM imported_deck " +
                    "WHERE package_sha256 = ? AND owner_user_id = ?",
            ).use { statement ->
                statement.setString(1, checksum)
                statement.setObject(2, ownerUserId)
                statement.executeQuery().use { rows ->
                    if (rows.next()) {
                        return ImportResult.Duplicate(
                            rows.getObject(1, UUID::class.java),
                            rows.getString(2),
                        )
                    }
                }
            }
        }
        return null
    }
}

/**
 * `real_cards/Reckless Stormseeker [MID].png` -> `reckless stormseeker`
 *
 * The art is filed under the FRONT face name with the set
 * stripped, which is how the exporter writes it and how a deck
 * entry finds its image.
 *
 * Internal rather than private so the Mechanics Lab corpus check
 * (P6-AS) maps art by THIS rule, not by a copy of it that could
 * drift.
 */
internal fun frontNameOf(member: String): String =
    member.removePrefix("real_cards/")
        .removeSuffix(".png")
        .substringBeforeLast(" [")
        .trim()
        .lowercase(Locale.ROOT)
