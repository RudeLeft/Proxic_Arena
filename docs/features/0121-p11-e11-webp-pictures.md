# 0121 — Phase 11 P11-E11: card pictures as WebP

**Status:** **Approved by the owner 2026-11-27 (by prompt: "Approve it").** Building. Phase 11, item P11-E11 (step 8 of the recommended order).
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
