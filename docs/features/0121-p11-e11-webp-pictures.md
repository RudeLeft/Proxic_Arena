# 0121 — Phase 11 P11-E11: card pictures as WebP

**Status:** **Approved by the owner 2026-11-27 (by prompt: "Approve it").** Built 2026-11-27 (As built, at the end). Phase 11, item P11-E11 (step 8 of the recommended order).
**Owner decisions:** already made, in `PHASE_11_EFFICIENCY_LOCKED.md`:

- **Decision 8** (2026-11-19): card pictures move to a lighter format, **WebP**, with a side-by-side canvas first.
- **Owner answers, 2026-11-27** (by prompt, after the canvas `Proxic canvases/webp-e11.html`): **WebP quality 80 for all three kinds of picture**: the table's picture, the art crop **and** the close-up ("I honestly cannot tell at 80"). The Deck Builder sending WebP itself is a separate ROADMAP row for later, **not** this spec.

What is left for the owner is only to approve this spec (no open look question). One build choice (the encoder) is recommended below; the lead decides it, with the owner only if it changes something they would notice. It does not.

## Why (researched)

Measured 2026-11-27 (research for P11-E11; scripts and results in the scratch folder `e11/`). SOURCE = read in the code at origin/main 8f433bca; RUN = measured.

- **How pictures are made today** (SOURCE). The Deck Builder sends each card's close-up as a full-size 88% JPEG (`light_jpeg` in its `mtgdb/arena/pictures.py`, spec 0051) and Scryfall's art crop as a JPEG. `ArtStore.store` keeps the original and calls `ArtStore.makeCopies`, which writes the table's copy with `ZoomCopy.write` (384 px wide, Java2D bilinear, corners filled, JPEG 0.88) to `art/display/xx/<sha>.jpg`; a PNG original also gets a full-size JPEG close-up copy in `art/zoom/xx/<sha>.jpg`. A JPEG original is served as its own close-up. `ArtStore.fileFor` picks the file for every picture address: `/api/pictures/{sha}` (`PictureRoutes.kt`, spec 0052) and the old `/api/matches/{id}/assets/{sha}` and `/api/decks/{id}/assets/{sha}` (`MatchRoutes.kt`, `DeckRoutes.kt`). `ZoomCopy.fillInBackground` makes missing copies once, on a background thread, at start-up.
- **The sizes** (RUN: 275 real card scans from `Test Deck/Testing Deck/real_cards`, the two real decks `Basic_Mono_Red_65_Card_Deck` and `Basic_Mono_Green_60_Card_Deck`, and the 130 art crops stored on stack A; today's copies made exactly as above; WebP by libwebp 1.6, method 4, from the same pixels the server holds):

  | Picture | Today (JPEG) | WebP 80 | Lighter by |
  |---|---|---|---|
  | Table's picture, 384 px | 67 KB (45-86) | 43 KB (22-65) | 36% |
  | Art crop, 384 px | 38 KB (27-49) | 29 KB (17-40) | 24% |
  | Close-up, full size | 223 KB (127-350) | 128 KB (49-244) | 43% |

  A browser fetches all three for a card it sees in a game (the close-up is fetched ahead, spec 0015), about 328 KB per different picture today and about 200 KB at WebP 80. **A 60-card deck of 24 different cards: 7.9 MB to about 4.8 MB the first time an opponent sees it (about 3.1 MB less); a 100-card deck of 60 different cards: about 7.7 MB less.** Every first view crosses the home uplink (`private`, spec 0052), so this is what E11 is for.
- **The look** (RUN). Scored with SSIM against the unsqueezed picture: WebP 80 scores as well as today's JPEG on 94% of table pictures and 98% of art crops (the rest within 0.007 and 0.015). The close-up is made from the Deck Builder's JPEG, so it is squeezed a second time and measures below today (SSIM 0.919 against 0.938); the owner judged it on the canvas's 3x zoom strip and could not tell (2026-11-27).
- **The cost** (RUN, one core of the owner's PC; the Unraid box is to be measured, P11-R5). WebP 80 takes about 30 ms for a table picture and about 100 ms for a close-up; today's JPEG about 10 ms. Method 6 saves about 2% more for 70% more time, so method 4.
- **Every supported browser shows WebP** (`PHASE_11_EFFICIENCY_LOCKED.md`, F3's "Picture formats" row; AGENTS UI-007). The app already serves WebP files: the deck icons (`DeckIcons.kt`, `frontend/src/assets/deck-icons/`).

## What this reverses (amends specs 0051 and 0015)

This spec changes approved behaviour, so on approval both specs get a dated amendment pointing here (PHASE-002):

- **Spec 0051**, Arena step 4: "A JPEG card picture IS the close-up copy (no second encode). The board copy is a 384-px JPEG for every new picture". **Now:** every picture gets a WebP close-up copy (a second encode, at quality 80), and the board copy is a 384-px WebP.
- **Spec 0051**, "What the player sees": "**Close-ups:** look the same as today (the same 88% JPEG)." **Now:** a WebP at quality 80 made from that JPEG; the owner judged it the same to the eye (2026-11-27).
- **Spec 0051**, F-0051-C: "A JPEG package imports; the JPEG is served as the close-up unchanged; the board copy is a 384-px JPEG". **Now:** F-0121-A and F-0121-B below; the JPEG original is still kept unchanged, but it is served only when no WebP copy exists.
- **Spec 0015**, item 3: "The close-up is the same picture at the same size as a JPEG", and "The close-up copy is made when a deck is imported (`art/zoom/xx/<sha>.jpg`, beside `art/original` and `art/display`)." **Now:** the same picture at the same size as a WebP, `art/zoom/xx/<sha>.webp`; the corners are still filled with the border colour.

Not changed: 0015's fetching ahead and "never a half-painted card"; 0052's one address per picture, its sign-in gate and `private` caching; 0053's picture per printing; the originals, which are never re-encoded or deleted by this.

## What the player sees

Nothing different by eye. Pat sends a deck with an Alpha Lightning Bolt. When Pat's opponent first plays against it, the Bolt's table picture arrives as 43 KB instead of 67 KB, its art window as 29 KB instead of 38 KB, and its close-up as 128 KB instead of 223 KB, so cards appear sooner on a slow home connection. A deck already in the Deck Depot gets the lighter pictures too, once, in the background, after the update. A browser that already holds a card's JPEG keeps showing it; the picture is the same.

## Scope

In:
1. **At import.** `ArtStore.makeCopies` writes `art/display/xx/<sha>.webp` (384 px wide, quality 80) and `art/zoom/xx/<sha>.webp` (full size, quality 80) for every picture: card pictures, back faces, tokens and art crops, from a PNG or a JPEG original. Scaling and the border-colour corners stay `ZoomCopy`'s. The rule "a copy no smaller than what it replaces is not kept" stays. The JPEG and PNG copies are no longer made for new pictures. The original is kept as it came.
2. **Once, for pictures already stored.** `ArtStore.needsCopies` counts a picture as needing copies until both `.webp` copies exist (or were found no smaller). `ZoomCopy.fillInBackground` makes them **from the original** (never from an old JPEG copy, which would be a third squeeze), one picture at a time, on its background thread, at a lower priority than games. After a WebP copy exists, the older copy of the same kind (`display/<sha>.jpg` or `.png`, `zoom/<sha>.jpg`) is deleted, as spec 0051's pass deleted the PNG table copies. It logs how many it made and the time per picture (P11-R5). A second start does nothing.
3. **Serving.** `ArtStore.fileFor` prefers the `.webp` copy, then today's JPEG or PNG copy, then the original. All three addresses go through it, so the old per-match and per-deck addresses keep working (0052) and answer WebP too. The answer says `Content-Type: image/webp` (set explicitly if Ktor's file types do not know it); the `private, max-age=31536000, immutable` header stays. Same address, same picture: a browser's cached JPEG stays valid.
4. **Clean-up.** `PictureCleanup` deletes a picture's `.webp` files with its row (`filesOf` gains `webp`); its orphan sweep already walks every file by hash.
5. **If the encoder fails or is missing,** the import still succeeds and the JPEG copy is made as today (a performance problem, not a failed send, as `makeCopies` treats a failed copy today), and it is logged.

Out (and why):
- **The Deck Builder** sends JPEG and PNG as today, and `/api/deck-rules` still says `formats: png, jpeg`; a `.webp` inside a package is still refused (`PackageInspector`). The Deck Builder sending WebP straight from the scan (one squeeze, about 29% lighter than today's JPEG at the same look) is its own ROADMAP row (owner 2026-11-27).
- **AVIF** (decision 8, option b): not chosen.
- **The frontend**: no change. The addresses are the same; the page never names a format.
- **Choosing a format per browser** (`Accept`): not needed; every supported browser shows WebP.

## The encoder (recommendation)

Java's ImageIO has no WebP writer, so the server needs libwebp one way or the other.

- **(a) Recommended: libwebp's `cwebp` tool in the runtime image**, run as a child process per picture. The image is Alpine (`eclipse-temurin:17.0.20.1_1-jre-alpine`, `Dockerfile` runtime stage), so the package is `libwebp-tools`, pinned with the image. The scaled, corner-filled pixels go to `cwebp` as a PPM file on `/tmp` (a tmpfs), the result to a `.part` file renamed when whole, as `ZoomCopy.write` does today; a JPEG original's close-up needs no corner fill and can go to `cwebp` as it is. Run at a low priority (`nice`), with a time limit, `-metadata none`.
  - Why: a crash or hang in native code stays in the child process and never takes the server and its live games with it; libwebp gets Alpine's security updates with the image, not frozen inside a jar; nothing native is loaded into the JVM; the musl question (below) does not arise.
  - Cost: a few milliseconds to start each process (small next to the 30-100 ms encode); CI's `server-tests` job (Ubuntu) installs the `webp` package; local server test runs on the owner's Windows PC have no `cwebp` (installing it there is the owner's call), so the tests that need the real encoder run in CI and on the local Docker stacks, and the rest use a stand-in encoder that runs everywhere.
- **(b) A Java library that wraps libwebp** (a JNI jar with the native library inside). Same results on every machine, no image change. Against it: native code inside the server process (a crash ends every game on the box); a prebuilt binary from a third party to vet and pin; its libwebp is frozen in the jar (libwebp had a serious security fix in 2023); and most such jars carry natives built for glibc, which do not load on the Alpine (musl) runtime without extra work.

Neither changes anything a player or the owner sees.

## Rules and boundaries

- **Hidden information (HID):** unchanged. No new address, no new field; a picture's address is still learned only by being shown the card. WebP copies carry no metadata (`-metadata none`); neither do today's.
- **P11-R5:** bytes per picture measured before and after on stack A with the real decks; server CPU per picture measured **on the Unraid box** (the import of a 100-card deck, and the one-time pass's total and per-picture time), at least 3 runs, the machine named.
- **P11-E4** already keeps WebP out of response compression.
- **ENV:** one new package in the runtime image (recommendation a), pinned with it.
- **Rollback:** an older build finds no JPEG table copy for a converted picture and serves the original instead (heavier, still correct); nothing is lost.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0121-A | Import of a JPEG package and a PNG package, with art crops: each picture gets `display/<sha>.webp` 384 wide and `zoom/<sha>.webp` full size, both decodable WebP at quality 80, PNG corners filled with the border colour; originals byte-identical; no new JPEG copies | server tests (`ArtStoreTest`, `LightPicturesTest`, `ZoomCopyTest`), real encoder in CI |
| F-0121-B | `fileFor` order: WebP, then today's JPEG/PNG copy, then the original; an encoder failure or missing encoder leaves the import accepted and the JPEG copy served, and logs it | server tests, stand-in encoder |
| F-0121-C | The one-time pass: pictures stored before get both WebP copies from their originals, old copies of the same kind removed after, originals kept; a second start makes nothing; it logs count and time per picture | server test with a stored-before data folder |
| F-0121-D | `/api/pictures/{sha}`, `?size=full`, and the old match and deck addresses answer `image/webp` with `private, max-age=31536000, immutable`; 401 without a session and 404 for an unknown hash as today | server tests |
| F-0121-E | Clean-up deletes a picture's `.webp` files with its row and 30-day-old orphan `.webp` files, and keeps every picture a deck or running game uses | `PictureCleanupTest` |
| F-0121-F | The Deck Builder side is unchanged: `/api/deck-rules` still says `png`, `jpeg`; a package with a `.webp` card picture is refused with today's words | server tests |
| F-0121-G | In Chromium, Firefox and WebKit: on the game page the hand and stack pictures, an art window's crop and a close-up, and on the Deck Depot a card's close-up, each come as `image/webp` and draw (`naturalWidth` above 0); an old per-match address draws too | new e2e spec, added to `ENGINE_SPEC` in `frontend/playwright.config.ts` (CI's engines job) and run in Chromium's suite |
| F-0121-H | Bytes per picture before and after on stack A for the two real decks and the 275-card Lab set (E11's target); server CPU per picture on the Unraid box at import and for the one-time pass (P11-R5) | measurement, written into the spec's As built |
| F-0121-I | A real-click game on the local stack after the one-time pass: hand, board art windows and a close-up look as before | screenshots (AGENTS TEST-011) |

## Decisions for the owner

None open: the look and the quality were decided on 2026-11-27. Approving this spec is the decision. The encoder choice above does not change anything the owner sees.

## Amendments

None yet.

## As built (2026-11-27)

Branch `p11-e11-build`, from main 8c49da6f. Labels as EVID-001: RUN = measured
here, SOURCE = read in the code.

**What was built** (SOURCE):

- `deck/WebpEncoder.kt` (new): the `WebpEncoder` interface and `CwebpEncoder`,
  libwebp's `cwebp` as a child process per picture: `-q 80 -m 4 -metadata none`,
  under `nice -n 10` where `nice` exists, a 60 s limit, the pixels in as a PPM
  file in the temporary folder, the answer to a `.part` file renamed when whole.
  Whether `cwebp` is there is asked once (`cwebp -version`); a missing one is
  logged once, and every picture then gets today's JPEG copies. `webpSize` reads
  a WebP's width and height from its header (VP8, VP8L, VP8X), for the tests.
- `Dockerfile`: `apk add --no-cache libwebp-tools=1.6.0-r0` in the runtime stage
  (Alpine 3.24's package; the build runs `cwebp -version`).
- `deck/PictureCopies.kt` (new; `ArtStore.makeCopies` and `needsCopies` hand to it):
  `display/xx/<sha>.webp` (384 wide, or the picture's own
  width when narrower: a 96-wide crop is not blown up) and `zoom/xx/<sha>.webp`
  (full size), from the decoded original through `ZoomCopy`'s scaling and
  border-colour corners (`ZoomCopy.opaque`, shared with the JPEG writer). A copy
  no lighter than the original is deleted and a `<sha>.nowebp` mark left, so it
  is not tried again (the rule "a copy no smaller than what it replaces is not
  kept", now for both copies). Once a WebP copy exists, the older copy of the
  same kind goes (`display/<sha>.jpg` and `.png`, `zoom/<sha>.jpg`). If the
  encoder fails it is logged ("the WebP table copy of picture ... was not made
  (...); a JPEG copy is used") and spec 0051's JPEG copies are made as before.
- `PictureCopies.needed` (`ArtStore.needsCopies`): true until both WebP copies
  exist or are marked. `ArtStore.fileFor`: the WebP copy, then the JPEG (or pre-0051 PNG) copy, then
  the original.
- `ZoomCopy.fill` and `fillInBackground`: the one-time pass, on a
  `Thread.MIN_PRIORITY` thread, from the originals, one picture at a time. With
  no encoder it makes nothing and says so. It logs counts, time and CPU per
  picture: its own thread's CPU (decoding, scaling) plus the encoder processes'
  (the children's CPU from `/proc/self/stat`; "?" where there is no `/proc`).
- `PictureRoutes.respondPicture` and `pictureType`: one answer for all three
  addresses (`/api/pictures/{sha}`, `/api/matches/{id}/assets/{sha}`,
  `/api/decks/{id}/assets/{sha}`): the `Content-Type` said by the file
  (`image/webp`, `image/jpeg`, `image/png`) and `private, max-age=31536000,
  immutable`. The deck route used to say `image/png` for anything not a `.jpg`.
- `PictureCleanup`: a picture's files are its `png`, `jpg`, `webp` and `nowebp`
  in each folder; the orphan sweep already went by hash.
- CI: the server-tests job installs Ubuntu's `webp` (cwebp, dwebp); the game
  machine and the engines job build `Test Deck/webp-deck.zip`; the engines job
  runs the new browser spec in Firefox and WebKit.
- Not changed: the Deck Builder side (`/api/deck-rules` says `png`, `jpeg`;
  `PackageInspector` refuses a `.webp`), hidden information (no new address or
  field), the frontend.

**Bytes before and after, through the app** (RUN, stack A, 2026-11-27:
`/api/pictures/{sha}` and `?size=full` for every picture in the package; after,
every answer 200, `image/webp`, `private, max-age=31536000, immutable`):

| Deck | Table picture | Close-up | All its pictures |
|---|---|---|---|
| `Basic_Mono_Red_65_Card_Deck` (11 pictures, PNG) | 70.8 -> 46.9 KB (-34%) | 221.9 -> 141.4 KB (-36%) | 3.14 -> 2.02 MB |
| `Basic_Mono_Green_60_Card_Deck` (10 pictures, PNG) | 64.6 -> 43.8 KB (-32%) | 219.8 -> 150.3 KB (-32%) | 2.78 -> 1.89 MB |

Every picture stored on stack A (RUN, 541 originals: 410 card pictures, many of
them the CI decks' small solid ones, and 131 art crops; what `fileFor` serves):
card table pictures 11.59 -> 8.03 MB, close-ups 41.34 -> 27.13 MB, art crops
37.8 -> 28.9 KB on average (-24%; 4.83 -> 3.69 MB). Of the 275-card Lab set only
14 pictures are stored on stack A as they are in `Test Deck/Testing Deck`:
66.3 -> 42.4 KB table, 203.8 -> 123.6 KB close-up. The research's numbers over
all 275 (Why, above) stand for the rest.

Disk (RUN): the art folder grew from about 114 MB to 137 MB, because a JPEG
original now has a WebP close-up copy beside it (spec 0051 served the JPEG
itself): display 18 -> 13 MB, zoom 8.7 -> 38 MB, originals unchanged.

**The one-time pass on stack A** (RUN): 541 pictures, 0 failed, 574 older
copies removed (298 JPEG table copies, 276 JPEG close-ups). The close-ups of 5
JPEG originals came out no lighter than the original: not kept, marked, and the
JPEG original serves them. All 541 originals byte-identical before and after
(SHA-256). A start after it logs nothing (nothing to do). All 1,077 WebP files
decode (`dwebp`) and carry no metadata (`webpinfo`: no EXIF, XMP or ICCP).

**Server CPU per picture (P11-R5)** (RUN, the owner's PC: Intel Core
i5-13600KF, Docker Desktop; the pass run three times from the same pre-0121
copies):

| Run | Wall time | CPU in the server | CPU in `cwebp` | CPU per picture |
|---|---|---|---|---|
| 1 | 24,399 ms (45 ms a picture) | 5,624 ms | 17,770 ms | 43 ms |
| 2 | 24,406 ms (45 ms a picture) | 5,628 ms | 17,860 ms | 43 ms |
| 3 | 24,327 ms (44 ms a picture) | 5,586 ms | 17,680 ms | 43 ms |

A picture is two encodes (its table copy and its close-up); an import pays the
same per new picture, so a 100-card deck of 60 new pictures takes about 2.6 s
more CPU than before. **Owed:** the same on the Unraid box (the pass's log line
after the update, and a 100-card deck's import), at least 3 runs, the machine
named, as P11-R5 and Rules above say. Not measured here.

**Tests** (RUN):

- `WebpPicturesTest` (new, 9): F-0121-A both copies for a PNG, a JPEG and a
  crop, 384 wide and full size, corners filled, originals byte-identical, no
  JPEG copies; a narrow picture, and a copy no lighter (marked, not encoded
  again). F-0121-B the serving order; a failing encoder (import accepted, JPEG
  copies, logged); a missing `cwebp` (found once, logged; the pass makes
  nothing). F-0121-C the pass from the originals (the old copies planted blue,
  never handed to the encoder), old copies removed after, logged, a second start
  encodes nothing, and a failed encode keeps the old copy. F-0121-F a `.webp`
  member refused with today's words, `PICTURE_FORMATS` still `png, jpeg`.
  F-0121-A with the real `cwebp`: decodable by `dwebp`, and the same bytes as
  `cwebp -q 80 -m 4 -metadata none` run by hand on the same pixels. That one
  skips on this PC, which has no `cwebp`; CI's server-tests job installs it, and
  CI fails an undeclared skip.
- `WebpRoutesTest` (new) F-0121-D: `/api/pictures/{sha}`, `?size=full` and the
  per-deck address with and without `?size=full` answer `image/webp` with the
  cache rule; 401 with no session, 404 for an unknown hash; with the WebP copy
  gone the JPEG copy answers as `image/jpeg`, a PNG copy as `image/png`, then the
  original.
- `PictureCleanupTest` F-0121-E: the WebP files and the mark go with their row
  (not later as strays), 30-day-old orphan WebP files go, newer ones and a deck's
  or a running game's stay. `DeckRulesTest`: `pictures.formats` is `png, jpeg`.
- Updated: `LightPicturesTest` and `ZoomCopyTest` (spec 0051's JPEG copies, now
  with no encoder), `DeckApiTest` and `DeckImportTest` (WebP where the encoder
  is).
- Bites (TEST-004), each against its tests, 11 of 11 caught (run again after the
  code moved into `PictureCopies` for detekt's function count, 11 of 11): table copy not
  scaled; corners not filled; JPEG close-up served before the WebP; no JPEG copy
  when the encoder fails; the failure not logged; the pass made from the old
  JPEG copy; the no-lighter mark ignored; the pass running with no encoder; a
  WebP said to be a PNG; the clean-up forgetting WebP files; `PICTURE_FORMATS`
  gaining `webp`. Two first tries were not caught and were changed: "old
  close-up deleted although no WebP was made" is near-equivalent (the JPEG
  close-up is made again at once), so it was replaced by "made from the old
  copy" (caught once the test's blue check allowed for JPEG's rounding); and the
  clean-up test now asserts the WebP files go with the row (they were swept up
  later as strays, so forgetting them did not show).
- F-0121-G, `frontend/e2e/match-webp-pictures.spec.ts` (new; in `ENGINE_SPEC`
  and CI's engines job; deck `protocol/fixtures/webp-deck`, 56 Forests and 4
  Llanowar Elves with art crops): the Deck Depot's close-up, both hands, the
  Elves on the stack (the card being cast and its stack slot, both seats), its
  art window's crop (both seats), a hand card's close-up (the reading card) and
  an old per-match address each answered `image/webp` with the cache rule and
  drew (`naturalWidth` above 0). Chromium (Edge): passed, 22.5 s. WebKit: passed,
  1.3 min. Firefox does not start on this PC (UI-007): CI's engines job runs it.
  With its CI neighbour at 4x CPU (`ci/ci-speed.mjs`): match-stolen-picture,
  then this, both passed (30.4 s). Its whole CI machine (match 2/6, 13 files, 14
  tests) at 4x CPU (`ci-speed.mjs --whole`): 14 passed in 17.0 min, this spec
  30.8 s. `ci/browser-durations.json`: 45 s.
- F-0121-I, the look (TEST-011): the same spec with
  `PROXIC_WEBP_DECK=<Basic_Mono_Green_60_Card_Deck.zip>` (real scans), 1920x1080,
  after the one-time pass: the hand, the Elves on the stack, the Forest's
  close-up and the Deck Depot's close-up were looked at, and zoomed in: no
  blocks, rings or smears; by eye the same as the canvas's WebP 80 side.

**Owner, 2026-11-27 (by prompt: "Yes, that's fine"):** the picture folder growing about a fifth
(stack A: 114 -> 137 MB), because a JPEG original now has a WebP close-up beside it, is accepted in
exchange for close-ups about a third lighter. Originals stay untouched.
