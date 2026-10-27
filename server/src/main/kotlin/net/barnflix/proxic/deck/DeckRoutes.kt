package net.barnflix.proxic.deck

import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.http.content.streamProvider
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondFile
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.util.pipeline.PipelineContext
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.PRINCIPAL_KEY
import net.barnflix.proxic.ServerConfig
import java.io.File
import java.util.UUID
import javax.sql.DataSource

// Deck import and discovery API — PHASE_02 §2.19, §2.61, §2.74–§2.80.
//
// Every response here is a declared shape, never an exception that
// escaped: §2.75 forbids an opaque 500 for an invalid package, and a
// stack trace reaching a client is both a bug and a leak (§2.76).

@Serializable
data class ImportAcceptedResponse(
    val deckId: String,
    val displayName: String,
    val status: String,
    val totalCards: Int,
    val distinctCards: Int,
    val artStored: Int,
    val entriesWithoutArt: Int,
    /** Spec 0022 -- the token cards that brought a picture. */
    val tokenPictures: Int = 0,
)

@Serializable
data class ImportRejectedResponse(
    val errorCode: String,
    val detail: String,
    /** Every problem, so a player fixes them in one pass (§2.75). */
    val problems: List<String> = emptyList(),
    val requestId: String? = null,
)

@Serializable
data class DeckSummary(
    val deckId: String,
    val displayName: String,
    val totalCards: Int,
    val distinctCards: Int,
    val importedAt: String,
    // PHASE_04 §4.73, §4.98 — who owns it. Present on both lists so
    // a shared deck can say "shared by Alice" (§4.59) without a
    // second request, and so the client never has to infer it.
    val ownerDisplayName: String,
    /**
     * PHASE_07 §7.65 — "shared with 2", on YOUR decks only. Always 0
     * on a deck shared with you: who else holds it is the owner's
     * business (§4.99).
     */
    val shareCount: Int = 0,
    /** Spec 0012 — the deck's colours in WUBRG order; null until Forge has been asked. */
    val colors: String? = null,
    /** Spec 0012 — the owner's chosen icon; null shows the suggestion from [colors]. */
    val icon: String? = null,
)

@Serializable
data class ShareRecipientView(
    val userId: String,
    val username: String,
    val displayName: String,
    val sharedAt: String,
)

/** §4.99, §4.100 — the owner's view of who holds this deck. */
@Serializable
data class ShareListResponse(
    val shares: List<ShareRecipientView>,
    val shareCount: Int,
    /**
     * PHASE_07 Amendment 10 — the players the owner can still share
     * with, for the Share list. Owner only, like the rest of this.
     */
    val candidates: List<ShareCandidate> = emptyList(),
)

@Serializable
data class ShareRequest(val username: String = "")

/**
 * The Deck Depot library — PHASE_04 §4.58, §4.59, §4.61.
 *
 * Two named lists rather than one flat array with a flag: §4.60 asks
 * that the UI never let someone assume they may manage a deck that
 * is merely shared with them, and a shape that cannot express
 * "mixed" is a better guarantee of that than a field the page has to
 * remember to read.
 */
@Serializable
data class DeckLibrary(
    val mine: List<DeckSummary>,
    val sharedWithMe: List<DeckSummary>,
)

@Serializable
data class DeckEntryView(
    val lineNumber: Int,
    val quantity: Int,
    val cardName: String,
    val setCode: String? = null,
    val collectorNumber: String? = null,
    val resolutionStatus: String,
    /** An Arena asset URL, never a filesystem path (§2.57, §2.59). */
    val artUrl: String? = null,
    /**
     * PHASE_07 Amendment 10 — LAND, CREATURE or SPELL, from Forge.
     * Null for a deck imported before the column, until the fill.
     */
    val category: String? = null,
    /** Spec 0008 — the face it turns over to, when the deck has that face's picture. */
    val backFaceName: String? = null,
    val backArtUrl: String? = null,
)

/** Spec 0022 — a token card the deck brought for its picture. */
@Serializable
data class DeckTokenView(
    val quantity: Int,
    val name: String,
    val setCode: String? = null,
    val collectorNumber: String? = null,
    val artUrl: String? = null,
)

@Serializable
data class DeckDetail(
    val deckId: String,
    val displayName: String,
    val totalCards: Int,
    val distinctCards: Int,
    val importedAt: String,
    val entries: List<DeckEntryView>,
    val ownerDisplayName: String,
    /** OWNER or SHARED (§4.41). The server's answer, not a claim. */
    val access: String,
    /** Spec 0022 — the token pictures it brought, outside the card count. */
    val tokens: List<DeckTokenView> = emptyList(),
)

/**
 * Register the deck API.
 *
 * [importEnabled] implements §2.21. PHASE 2 AMENDMENT 1 turns it ON
 * in production by owner decision, but the switch stays: the
 * endpoint it guards is unauthenticated, and an operator who wants
 * it off should not have to redeploy a different build.
 */
fun Route.deckRoutes(
    config: ServerConfig,
    dataSource: DataSource,
    importer: DeckImporter,
    importEnabled: Boolean,
    // PHASE_05 §5.50, §5.51 — somebody may be sitting in a lobby
    // with this deck selected. Optional so Phase 2's tests, which
    // predate rooms entirely, still describe a Deck Depot on its
    // own.
    deckAccess: DeckAccessListener = DeckAccessListener.NONE,
) {
    val artStore = ArtStore(File(config.dataRoot))
    val authorization = DeckAuthorization(dataSource)
    val sharing = DeckSharing(dataSource, authorization)

    route("/decks") {
        // §4.52, §4.6 -- the owner comes from the SESSION the Phase 3
        // intercept already resolved and stashed, never from the multipart
        // body. A client that can name an owner can give a deck to somebody
        // else, or take one.
        post("/import") { handleImport(config, importer, importEnabled, callerId()) }

        // §2.77, narrowed by §4.58/§4.59/§4.62.
        //
        // This endpoint used to return every deck in the database.
        // It is a live, deployed endpoint whose MEANING changes here
        // (Phase 4 carry-forward C3), not a new feature: a user must
        // not be able to enumerate decks they cannot open.
        get {
            call.respond(authorization.library(callerId()))
        }

        // §2.78
        get("/{deckId}") {
            val deckId =
                deckIdOrNull() ?: return@get call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_DECK_ID", "That is not a deck id.", null),
                )

            // §4.63-§4.65. A deck you may not see and a deck that
            // does not exist answer identically, so a stranger
            // cannot use 403-vs-404 to discover that a private deck
            // exists.
            val access = authorization.accessFor(callerId(), deckId)
            if (!access.mayView()) {
                return@get call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("DECK_NOT_FOUND", "No such deck.", null),
                )
            }

            val detail =
                deckDetail(dataSource, deckId, access)
                    ?: return@get call.respond(
                        HttpStatusCode.NotFound,
                        ErrorResponse("DECK_NOT_FOUND", "No such deck.", null),
                    )
            call.respond(detail)
        }

        // §2.59, §2.61 — art by Arena asset id, which IS the content
        // hash. The browser never constructs a filesystem path.
        get("/{deckId}/assets/{assetId}") {
            val assetId = call.parameters["assetId"].orEmpty()
            // A hash is 64 hex characters. Validating the SHAPE means
            // no traversal is possible regardless of what was sent.
            if (!assetId.matches(Regex("[0-9a-f]{64}"))) {
                return@get call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_ASSET_ID", "That is not an asset id.", null),
                )
            }

            val deckId =
                deckIdOrNull() ?: return@get call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_DECK_ID", "That is not a deck id.", null),
                )

            // PHASE 4 AMENDMENT 2 — deck access AND the asset being
            // part of THAT deck.
            //
            // The second half is what this URL only pretended to do:
            // before Phase 4 the deck id was never consulted, so a
            // valid asset id under a deck id that did not exist
            // returned 200 and the whole image. Art is
            // content-addressed and shared between decks, so "is
            // this asset yours" is not a meaningful question.
            //
            // 404, not 403: §4.65 again.
            if (!authorization.mayViewAsset(callerId(), deckId, assetId)) {
                return@get call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("ASSET_NOT_FOUND", "No such asset.", null),
                )
            }

            // Prefer the display derivative; fall back to the
            // original, which is what exists when the derivative was
            // no smaller (see ArtStore). Spec 0008's zoom asks for the
            // full scan (?size=full), as the game's close look does,
            // under the same check -- a size is no more visible than
            // its picture.
            val full = call.request.queryParameters["size"] == "full"
            val file =
                artStore.fileFor(assetId, closeUp = full)
                    ?: return@get call.respond(
                        HttpStatusCode.NotFound,
                        ErrorResponse("ASSET_NOT_FOUND", "No such asset.", null),
                    )

            // PHASE 4 AMENDMENT 3, owner decision D2.
            //
            // `private` keeps deck artwork out of shared caches --
            // Cloudflare sits in front of this server, and a cached
            // private image served to the wrong viewer would defeat
            // the authorization above. The viewer's OWN browser may
            // still cache it for a year, because an asset id is a
            // content hash: those bytes cannot change meaning.
            //
            // §4.36's limit is accepted: a user whose access is
            // revoked may keep a usable copy until their cache
            // expires. Revocation governs the server, not pixels
            // already delivered.
            call.response.header(
                HttpHeaders.CacheControl,
                "private, max-age=31536000, immutable",
            )
            // The close-up copy is a JPEG since spec 0015; the rest are PNGs.
            val type = if (file.extension == "jpg") ContentType.Image.JPEG else ContentType.Image.PNG
            call.response.headers.append(HttpHeaders.ContentType, type.toString())
            call.respondFile(file)
        }

        // §4.29-§4.35, §4.99 — sharing lives in its own file.
        // Split out when detekt found this function past both its
        // length and complexity limits: a route table that has
        // outgrown one function wants a second function, not a
        // raised threshold.
        shareRoutes(authorization, sharing, deckAccess)

        // PHASE_07 §7.65 — rename, in its own file for the same reason.
        renameRoute(dataSource, authorization, deckAccess)
        // Spec 0012 — the deck's icon, owner only.
        iconRoute(dataSource, authorization)

        // §2.79
        delete("/{deckId}") {
            val deckId =
                deckIdOrNull() ?: return@delete call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_DECK_ID", "That is not a deck id.", null),
                )

            // §4.76, §4.80. Three outcomes, and the difference
            // between the last two is deliberate:
            //
            //   owner      -> delete it
            //   recipient  -> 403, because they CAN see the deck and
            //                 telling them "no such deck" would be a
            //                 lie they can disprove (§4.66)
            //   stranger   -> 404, because they cannot (§4.65)
            when (authorization.accessFor(callerId(), deckId)) {
                DeckAccess.NO_ACCESS ->
                    return@delete call.respond(
                        HttpStatusCode.NotFound,
                        ErrorResponse("DECK_NOT_FOUND", "No such deck.", null),
                    )

                DeckAccess.SHARED ->
                    return@delete call.respond(
                        HttpStatusCode.Forbidden,
                        ErrorResponse(
                            "DECK_OWNER_REQUIRED",
                            "Only the owner can delete this deck.",
                            null,
                        ),
                    )

                DeckAccess.OWNER -> Unit
            }

            // §5.50 — BEFORE the row goes. Afterwards the foreign
            // key has already nulled every selection and there is
            // nothing left to tell a room about.
            deckAccess.deckAccessChanged(deckId, beingDeleted = true)

            val removed = deleteDeck(dataSource, deckId)
            if (removed) {
                call.respond(HttpStatusCode.NoContent)
            } else {
                call.respond(
                    HttpStatusCode.NotFound,
                    ErrorResponse("DECK_NOT_FOUND", "No such deck.", null),
                )
            }
        }
    }
}

/** The deck id in the path, or null when it is not a uuid. */
internal fun PipelineContext<Unit, ApplicationCall>.deckIdOrNull(): UUID? =
    call.parameters["deckId"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }

internal fun ShareRecipient.view(): ShareRecipientView =
    ShareRecipientView(
        userId = userId.toString(),
        username = username,
        displayName = displayName,
        sharedAt = sharedAt,
    )

/**
 * The caller, from the session the Phase 3 intercept resolved.
 *
 * `/api/decks` is behind that intercept, so a request without a
 * principal cannot reach any of these routes — but this reads the
 * attribute rather than taking a user id from anywhere a client can
 * influence (§4.6).
 */
internal fun PipelineContext<Unit, ApplicationCall>.callerId(): UUID = call.attributes[PRINCIPAL_KEY].user.userId

private fun deckDetail(
    dataSource: DataSource,
    deckId: UUID,
    access: DeckAccess,
): DeckDetail? =
    dataSource.connection.use { connection ->
        val summary =
            connection.prepareStatement(
                """
                SELECT d.display_name, d.total_cards, d.distinct_cards, d.imported_at,
                       u.display_name
                  FROM imported_deck d
                  JOIN app_user u ON u.user_id = d.owner_user_id
                 WHERE d.deck_id = ?
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, deckId)
                statement.executeQuery().use { rows ->
                    if (!rows.next()) return@use null
                    listOf(
                        rows.getString(1),
                        rows.getInt(2),
                        rows.getInt(3),
                        rows.getTimestamp(4).toInstant().toString(),
                        rows.getString(5),
                    )
                }
            } ?: return@use null

        val entries =
            connection.prepareStatement(
                """
                SELECT e.line_number, e.quantity, e.card_name, e.set_code, e.collector_number,
                       e.resolution_status, e.art_sha256, e.card_category,
                       e.back_face_name, f.art_sha256
                  FROM deck_entry e
                  LEFT JOIN deck_face_art f
                    ON f.deck_id = e.deck_id AND f.face_name = lower(e.back_face_name)
                 WHERE e.deck_id = ? ORDER BY e.line_number
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, deckId)
                statement.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) {
                            val art = rows.getString(7)
                            val backArt = rows.getString(10)
                            add(
                                DeckEntryView(
                                    lineNumber = rows.getInt(1),
                                    quantity = rows.getInt(2),
                                    cardName = rows.getString(3),
                                    setCode = rows.getString(4),
                                    collectorNumber = rows.getString(5),
                                    resolutionStatus = rows.getString(6),
                                    artUrl = art?.let { "/api/decks/$deckId/assets/$it" },
                                    category = rows.getString(8),
                                    backFaceName = backArt?.let { rows.getString(9) },
                                    backArtUrl = backArt?.let { "/api/decks/$deckId/assets/$it" },
                                ),
                            )
                        }
                    }
                }
            }

        DeckDetail(
            deckId = deckId.toString(),
            displayName = summary[0] as String,
            totalCards = summary[1] as Int,
            distinctCards = summary[2] as Int,
            importedAt = summary[3] as String,
            entries = entries,
            ownerDisplayName = summary[4] as String,
            // §4.41 — the server states the relationship; the client
            // uses it to decide what to SHOW, never what to allow.
            access = access.name,
            tokens = deckTokens(connection, deckId),
        )
    }

/** Spec 0022 — the deck's token section, in its order. */
private fun deckTokens(
    connection: java.sql.Connection,
    deckId: UUID,
): List<DeckTokenView> =
    connection.prepareStatement(
        """
        SELECT quantity, token_name, set_code, collector_number, art_sha256
          FROM deck_token WHERE deck_id = ? ORDER BY line_number
        """.trimIndent(),
    ).use { statement ->
        statement.setObject(1, deckId)
        statement.executeQuery().use { rows ->
            buildList {
                while (rows.next()) {
                    add(
                        DeckTokenView(
                            quantity = rows.getInt(1),
                            name = rows.getString(2),
                            setCode = rows.getString(3),
                            collectorNumber = rows.getString(4),
                            artUrl = rows.getString(5)?.let { "/api/decks/$deckId/assets/$it" },
                        ),
                    )
                }
            }
        }
    }

/**
 * §2.79, §2.80 — remove the deck and its entries.
 *
 * Art is deliberately NOT deleted. It is content-addressed and
 * shared, so deleting it here would break every other deck using the
 * same card (§2.135, §2.60). Reclaiming art nothing references is a
 * sweep, not part of a delete.
 */
private fun deleteDeck(
    dataSource: DataSource,
    deckId: UUID,
): Boolean =
    dataSource.connection.use { connection ->
        connection.prepareStatement("DELETE FROM imported_deck WHERE deck_id = ?").use { statement ->
            statement.setObject(1, deckId)
            statement.executeUpdate() > 0
        }
    }

/** The Ktor handler receiver, aliased so the signature fits a line. */
internal typealias ImportContext =
    io.ktor.util.pipeline.PipelineContext<Unit, io.ktor.server.application.ApplicationCall>

/**
 * The import handler, extracted because `deckRoutes` had grown past
 * what detekt accepts — and past what reads well. Registering routes
 * and performing an upload are different jobs.
 */
internal suspend fun ImportContext.handleImport(
    config: ServerConfig,
    importer: DeckImporter,
    importEnabled: Boolean,
    // The caller's account: the session's, or a linked computer's (spec 0022).
    owner: UUID,
) {
    if (!importEnabled) {
        call.respond(
            HttpStatusCode.ServiceUnavailable,
            ImportRejectedResponse(
                "IMPORT_DISABLED",
                "Deck import is disabled on this server.",
            ),
        )
        return
    }

    // §2.37 — the upload lands in /data, never /tmp: the
    // container's root is read-only and /tmp is a tmpfs, so
    // a 150 MB upload there would be 150 MB of RAM.
    val staging = File(config.dataRoot, "temp/uploads").apply { mkdirs() }
    val upload = File(staging, "upload-${UUID.randomUUID()}.zip")
    var originalName = "upload.zip"
    // PHASE_07 §7.65 -- an optional name the player typed, sent when
    // the package's own name is one they already use.
    var typedName: String? = null

    try {
        var bytes = 0L
        var tooLarge = false
        call.receiveMultipart().forEachPart { part ->
            if (part is PartData.FormItem && part.name == "name") {
                typedName = part.value
            }
            if (part is PartData.FileItem) {
                // The uploaded filename is a LABEL, never a
                // path: it is used for display and nothing
                // else (§2.61).
                originalName = part.originalFileName?.substringAfterLast('/')
                    ?.substringAfterLast('\\') ?: originalName
                upload.outputStream().use { out ->
                    part.streamProvider().use { input ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val read = input.read(buffer)
                            if (read <= 0) break
                            bytes += read
                            // Carry-forward C1: the route's
                            // OWN limit. The global body
                            // limit is 1 MB and must stay
                            // there, or every endpoint would
                            // accept a deck-sized body.
                            if (bytes > PackageLimits.MAX_ARCHIVE_BYTES) {
                                tooLarge = true
                                return@use
                            }
                            out.write(buffer, 0, read)
                        }
                    }
                }
            }
            part.dispose()
        }

        if (tooLarge) {
            call.respond(
                HttpStatusCode.PayloadTooLarge,
                ImportRejectedResponse(
                    "ARCHIVE_TOO_LARGE",
                    "The package exceeds ${PackageLimits.MAX_ARCHIVE_BYTES} bytes.",
                ),
            )
            return
        }
        if (!upload.isFile || upload.length() == 0L) {
            call.respond(
                HttpStatusCode.BadRequest,
                ImportRejectedResponse("NO_FILE", "No package was uploaded."),
            )
            return
        }

        importAndRespond(importer, ImportRequest(upload, originalName, owner, typedName))
    } finally {
        // The upload is ours and temporary whatever happened.
        upload.delete()
    }
}

/** One upload, as the import handler received it. */
private class ImportRequest(
    val upload: File,
    val originalName: String,
    val owner: UUID,
    /** PHASE_07 §7.65 — what the player typed in the name field, if anything. */
    val typedName: String?,
)

/**
 * Run the import and answer it. Split from [handleImport] when the
 * name field (PHASE_07 §7.65) took that function past detekt's
 * complexity limit: receiving an upload and answering for it are two
 * jobs.
 */
private suspend fun ImportContext.importAndRespond(
    importer: DeckImporter,
    request: ImportRequest,
) {
    // A blank field means "use the package's name", not an error.
    val typed = request.typedName?.takeIf { it.isNotBlank() }
    val requestedName = typed?.let { DeckNames.typed(it) }
    if (typed != null && requestedName == null) {
        call.respond(
            HttpStatusCode.UnprocessableEntity,
            ImportRejectedResponse(
                "INVALID_DECK_NAME",
                "A deck name is 1 to ${DeckNames.MAX_LENGTH} characters on one line.",
            ),
        )
        return
    }

    when (val result = importer.import(request.upload, request.originalName, request.owner, requestedName)) {
        is ImportResult.Imported ->
            call.respond(
                HttpStatusCode.Created,
                ImportAcceptedResponse(
                    deckId = result.deckId.toString(),
                    displayName = result.displayName,
                    status = "ready",
                    totalCards = result.totalCards,
                    distinctCards = result.distinctCards,
                    artStored = result.artStored,
                    entriesWithoutArt = result.entriesWithoutArt,
                    tokenPictures = result.tokenPictures,
                ),
            )

        is ImportResult.Duplicate ->
            call.respond(
                // 409: the request was understood and refused
                // because the deck already exists (owner
                // decision D3). The existing id is returned so
                // the client can show it rather than guess.
                HttpStatusCode.Conflict,
                ImportRejectedResponse(
                    "DUPLICATE_PACKAGE",
                    "You already have this deck: \"${result.displayName}\".",
                    listOf(result.existingDeckId.toString()),
                ),
            )

        is ImportResult.NameTaken ->
            call.respond(
                // 409 like a duplicate package, but a different
                // code: this one is fixed by choosing a name.
                HttpStatusCode.Conflict,
                ImportRejectedResponse(
                    "DECK_NAME_TAKEN",
                    DeckNames.takenMessage(result.displayName),
                    listOf(result.displayName),
                ),
            )

        is ImportResult.Rejected ->
            call.respond(
                HttpStatusCode.UnprocessableEntity,
                ImportRejectedResponse(result.code, result.detail, result.problems),
            )
    }
}
