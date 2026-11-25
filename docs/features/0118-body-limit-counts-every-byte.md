# 0118 — The body limit counts every byte, however a request is sent

**Status:** Approved 2026-11-25 (owner, by prompt: "Fix it now").
Not part of a phase. Its own small spec, shipping in the next release.
**Owner decisions:**

- 2026-11-25, by prompt: **"Fix it now"**, as its own small spec in the next release. Players and the Deck Builder must see no difference for a legitimate request.

## Why (researched)

Read at main c3b32be5 (2026-11-25).

- **What the limit is** (SOURCE). Every HTTP request body has a ceiling, per route: 1 MB everywhere (`Limits.MAX_HTTP_BODY_BYTES`), 150 MB for a deck package (`/api/decks/import`, `/api/deck-builder/decks`) and 5 MB for a problem report (`/api/reports`, `Limits.REPORT_BODY_BYTES`). `Limits.bodyLimitFor` picks the route's. A body over it is answered 413 `BODY_TOO_LARGE`, "That was too much to send at once." (spec 0114, W2-138).
- **Where it was checked** (SOURCE). Only in `BodySizeLimit`'s `onCall`, and only against the `Content-Length` header: a request with no declared length (chunked transfer) skipped the check entirely, and the route then read the whole body. The plugin's own comment said such a body was "still bounded by Netty's own frame handling". Netty bounds each chunk, not the body.
- **Seen from outside** (USER, an earlier outside test, 2026-11-10). A body of about 1 MB sent chunked to `/api/auth/device-link` was read and answered by the route (410 `CODE_INVALID`); the same size with a declared length got 413 `BODY_TOO_LARGE`. Resource exhaustion was not tested then and is not tested here: every body in this spec is just over, or exactly at, its route's limit.
- **What a route does with a failed read** (SOURCE). Almost every route reads with `runCatching { call.receive<T>() }.getOrNull()` and answers its own "could not read that" (or, at device-link, carries on with an empty request). So a limit that only throws mid-read would come back as that route's answer, not as 413. A few read without catching (the admin purge routes; the deck import's multipart loop), so their failure reaches `StatusPages` as an error.
- **Request decompression** (SOURCE). None. Ktor 2.3.13's `Compression` plugin (installed in `HttpEfficiency.kt`) only encodes answers; it has no decoders, and Ktor's Netty engine adds no request decompressor. So the bytes counted are the bytes a route reads. A deck package is a ZIP the route unpacks itself, bounded separately (`PackageLimits`, including its compression-ratio ceiling).

## What the player sees

Nothing changes for anything a player, the Deck Builder or a page really sends.

1. Pat links the Deck Builder: the link request is a few hundred bytes. It is linked, as today.
2. Pat sends a problem report with its picture: up to 5 MB, as today.
3. Pat sends a 100 MB deck package from the Deck Builder: under 150 MB, imported as today.
4. Someone sends 1 MB and one byte to the link route without saying the length up front: they get "That was too much to send at once." (413 `BODY_TOO_LARGE`), exactly what they get today when they say the length. The route never sees the bytes past the limit.

## The change

`server/.../Limits.kt`, `BodySizeLimit`:

- **The first gate stays exactly as it was:** a declared `Content-Length` over the route's limit is refused before a byte is read, with the same answer and the same log line.
- **A second gate counts every body as it is read**, whatever its framing or declared length (`ReceiveRequestBytes` hook). The channel a route reads from is a counted copy of the request's: bytes pass on as they arrive (8 KB at a time, never collected first), and once the count passes the route's limit (`Limits.bodyLimitFor`) the copy stops reading and fails the read with `BodyTooLargeException`. This happens before any deserialization, so JSON receives, the multipart deck import and the report route all go through it.
- **One answer.** When a call's body passed its limit, whatever the call then answers (the route's own "could not read that", or an error) is replaced in the send pipeline by the same 413 `BODY_TOO_LARGE` with the same player sentence and request id. The log line is in the same style: `body of at least N bytes refused at <path>; the limit is L`. `StatusPages`' catch-all answers such a call with the 413 instead of logging an internal error.
- **Clean-up.** When the answer has gone (`ResponseSent`), the copy is stopped, so a route that stops reading early leaves nothing waiting.
- **WebSockets are out of scope.** A GET asking for a WebSocket is not counted: a socket's stream is its frames, which have their own limit (`Limits.MAX_WS_FRAME_BYTES`, on the WebSockets plugin).

No route, protocol, page or Deck Builder change.

## Rules and boundaries

- **Same answer everywhere.** The 413 is the existing `ErrorResponse` shape with the existing `errorCode` and sentence (§1.44, spec 0114). Clients branch on `errorCode` (PROTO-006).
- **Per route, not global** (PHASE_02 carry-forward C1). The counted gate uses the same `Limits.bodyLimitFor` as the declared gate; the deck import keeps 150 MB and the report route 5 MB.
- **No game rule, no hidden information.** Transport only (ARCH-005).
- **TEST-012.** No player clicks anything new, so no real-click game is owed; one real check on the local stack instead (As built).

## Tests that prove it

| ID | Test | Where |
|---|---|---|
| F-0118-A | A chunked body (no `Content-Length`) one byte over the limit is answered 413 `BODY_TOO_LARGE` with the player sentence: on two probe routes on the real module (one reading with `runCatching`, one without), on `/api/auth/device-link` (1 MB) and on `/api/reports` (5 MB) | `LimitsTest`, `BodyLimitApiTest` |
| F-0118-B | Exactly at the limit, chunked, the route reads it whole and gives its normal answer: probes 200 with the byte count, device-link 410 `CODE_INVALID`, reports 422 | `LimitsTest`, `BodyLimitApiTest` |
| F-0118-C | A declared length over the limit is still refused first, 413 | `LimitsTest`, `BodyLimitApiTest` (and the existing `an oversized body is refused before it is read`) |
| F-0118-D | A real device link still works, sent with a declared length and sent chunked (201); small bodies are read as before | `BodyLimitApiTest`, `LimitsTest` |
| F-0118-E | Route limits are honoured: a report over 1 MB (the global limit) is read (422, not 413); a 2 MB multipart upload sent chunked to `/api/decks/import` reaches the route, which answers for itself (422, not a package) | `BodyLimitApiTest` |

**Bites (TEST-004):** with the counting switched off, F-0118-A fails on every route that has it; with the answer replacement switched off, F-0118-A fails on the routes that catch their own read; an off-by-one (refusing at the limit) fails F-0118-B; counting against the global limit instead of the route's fails F-0118-E.

## Out of scope

- WebSockets (above).
- How much a server can take (load, slow senders): not tested here and not changed. The read timeout (`Limits.REQUEST_READ_TIMEOUT_SECONDS`) is unchanged.
- **Trigger (PHASE-004):** if Ktor is upgraded to 3.x, whose `Compression` also decodes request bodies by default, re-check that the counted bytes are the decoded ones (the counted gate would then need to sit after decoding, or decoding be switched off).

## Open questions

None.

## Amendments

None.

## As built (2026-11-25)

Built on branch `p-0118` from c3b32be5, one builder. Labels: SOURCE (read in the code), RUN (run here, this build).

### What changed

- **`Limits.kt`, `BodySizeLimit`:** the declared-length gate is unchanged (same check, same answer, same log line). New: an `on(ReceiveRequestBytes)` hook hands every route a counted copy of the request body (`countInto`, an 8 KB buffer, written by `writer` in the application's scope, so a failure there never cancels the call). Past `Limits.bodyLimitFor(path)` it stops reading, marks the call and closes the copy with `BodyTooLargeException`. An interceptor on `ApplicationSendPipeline.Before` replaces whatever a marked call answers with the 413 (`BodyTooLargeAnswer`: the `ErrorResponse` JSON, with `requestId`). `on(ResponseSent)` stops the copy. A GET asking for a WebSocket is not counted (`isWebSocketUpgrade`): the first test run without that exclusion closed every `/ws/system` socket in `LimitsTest` (3 failures), because the test engine passes a socket's stream through the same hook. The 413 `ErrorResponse` is now built in one place, `ApplicationCall.bodyTooLarge`, for both gates.
- **`Application.kt`, `StatusPages`:** the catch-all answers a call whose body passed its limit with the 413 instead of logging "unhandled error" (an uncaught `receive`: the admin purge routes, the deck import's multipart loop).
- **Tests:** `LimitsTest` gains four (two probe routes on the real module, one reading with `runCatching`, one without). New `BodyLimitApiTest` (six, real routes over a real database). `ChunkedBody` is the test helper that sends a body in 64 KB pieces with no `Content-Length`.
- **Not changed:** any route, the protocol, the page, the Deck Builder.

### Checked (SOURCE)

- Every body-reading call site in `server/src/main` reads through `call.receive<T>()` or `call.receiveMultipart()`, both through the receive pipeline, so through the hook. None reads `call.request.receiveChannel()` directly.
- No request decompression: Ktor 2.3.13's `ktor-server-compression` has encoders only (`GzipEncoder`, `DeflateEncoder`, `IdentityEncoder`), and `ktor-server-netty` has no decompressor class.

### Proofs (RUN)

- **Gates:** `./gradlew -q :server:ktlintCheck :server:detekt :server:test`: exit 0; 97 test classes, 802 tests, 0 failures, 0 errors, 62 skipped. The skipped ones need the built Forge worker jar or the Forge resource checkout, which this worktree doesn't have (`CardResolverTest`, `DeckApiTest`, `DeckBuilderApiTest`, `DeckImportTest`, `DeckListTest`, `MechanicsLabArtTest`, `MechanicsLabCorpusTest`, `PackageInspectorTest`, `Words0114ImportTest`, `ForgeWorkerTest`, `MatchRuntimeTest`, `MatchPreflightTest`); CI runs them. `python -I scripts/check-doc-refs.py`: OK.
- **The new tests:** `LimitsTest` 15/15, `BodyLimitApiTest` 6/6. Answers in the test log: device-link chunked limit + 1 413, at the limit 410, declared limit + 1 413, a real link 201 (declared) and 201 (chunked); reports chunked limit + 1 413, at the limit 422, 1 MB + 1 422; deck import, 2 MB multipart sent chunked, 422 (the route's own "not a package").
- **Bites (TEST-004)**, each a temporary edit to `Limits.kt`, run against `LimitsTest` and `BodyLimitApiTest`, then restored (not committed):
  1. counting off (the hook hands on the body as it is): 3 failures. Device-link chunked limit + 1 answered **410 `CODE_INVALID`** (the outside test's result again), reports 422 `REPORT_REFUSED`, the `runCatching` probe 200.
  2. answer replacement off (counting on): the same 3 failures (device-link 410 `CODE_INVALID`, reports 400 `INVALID_REPORT`, the probe 200). Counting alone isn't enough: the routes swallow the failed read.
  3. off by one (refusing at the limit, `>=`): 3 failures; every "exactly at the limit" test got 413.
  4. the counted gate using the global 1 MB instead of the route's limit: 2 failures; the report's 1 MB + 1 and the deck import's 2 MB both got 413.
- **The real stack** (stack A, `http://127.0.0.1:8080`, rebuilt from this worktree with `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build`, build id `c3b32be5-p0118-dirty`): curl to `/api/auth/device-link` with `Transfer-Encoding: chunked` (curl's verbose output shows that header and no `Content-Length`), a wrong code padded with spaces:

  | Body | Sent | Status | Answer |
  |---|---|---|---|
  | 1,048,577 bytes (limit + 1) | chunked | **413** | `BODY_TOO_LARGE`, "That was too much to send at once." |
  | 1,048,576 bytes (at the limit) | chunked | 410 | `CODE_INVALID` (the route's normal answer) |
  | 1,048,575 bytes (limit - 1) | chunked | 410 | `CODE_INVALID` |
  | 1,048,577 bytes | declared length | 413 | `BODY_TOO_LARGE` (as before) |

  Server log: `body of at least 1048577 bytes refused at /api/auth/device-link; the limit is 1048576`, then `413 Payload Too Large: POST - /api/auth/device-link`.

### Not done here

- A real deck import with a real package, and the Deck Builder's send, were not run locally (no worker jar in this worktree, so the Forge-backed API tests skip). CI's server run covers `DeckApiTest` and `DeckBuilderApiTest`; the import route's 150 MB was shown with the 2 MB multipart upload above.
- The counted gate's log line is written from the counting coroutine, so its log context has no `req=` id (the 413 line right after it has one). Otherwise it uses the declared gate's words.
