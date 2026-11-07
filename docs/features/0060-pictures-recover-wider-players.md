# 0060 — Player pictures recover by themselves; a wider players list

**Status:** Approved 2026-11-07 (owner, in chat, after the deep dive)
**Owner decisions:** pictures retry by themselves; never cache a failure;
players column grows with the screen. Not chosen: pictures without signing
in (the sign-in-screen rule stands).

## Why (found 2026-11-07)

On the live site, right after updating to 1.49.0, one player's picture in
the lobby was a broken-image icon. Reproduced on the local stack with a
real container recreate (nothing stubbed): while the server restarts
(~3.5 s locally; the tunnel answers 502 live), a picture the page asks for
the first time (a row appearing, Offline opened, a picture scrolling into
view) fails, and the one `<img>` (frontend/src/avatars.tsx) never asks
again -- it stays broken after the server is back and "Connected" shows,
until its row is redrawn. Pictures already in the browser's cache, and the
default picture (built into the page), are unaffected. Ruled out: sessions
lost (they are in PostgreSQL and survive), a half-started server, build
hashes changing, damaged files, a service worker, the browser remembering
the failure. Also found: a refused picture's 404 carries no Cache-Control,
so a cache in front (Cloudflare) could keep it and hand it to others.

The lobby's players column is a fixed 280 px: about 84 px for a name
(about 8 letters); names may be 12 letters and the status line needs
about 160 px.

## Built

1. **Pictures retry by themselves.** A picture that fails to load tries
   again on its own (about 1, 2, 4, 8 s, then every 30 s), and at once when
   the page reconnects, comes back online or becomes visible; while it
   waits the default picture shows, never a broken icon. Everywhere
   pictures appear (one component: lobby, rooms, chat, game plates, Hall,
   admin).
2. **Never cache a failure.** Every answer under `/assets` that is not a
   success says `Cache-Control: no-store`, so no cache in between keeps
   and spreads it.
3. **A wider players list.** The lobby's players column grows with the
   screen: about 365 px at 1920 wide, at most 380 px, never under 300 px;
   a 12-letter name and "Away 6 min · in the lobby" fit at 1920 and up.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0060-A | A picture that fails once shows by itself when the server answers again, without a reload | page test; e2e/real restart on the local stack |
| F-0060-B | A non-200 under /assets says no-store | server test |
| F-0060-C | A 12-letter name and its status line fit in the players column at 1920x1080 | e2e measurement; screenshot |

## Amendments

### Amendment 1 — As built (2026-11-07, not yet committed)

1. **Pictures retry** -- `frontend/src/avatars.tsx`. On a failed load the
   `<img>` shows the default picture (built into the page, so it cannot
   fail) and a background loader tries `<address>?r=n` after 1, 2, 4, 8 s,
   then every 30 s (`AVATAR_RETRY_MS`), and at once on window `online`,
   on the page becoming visible, and on `proxic:reconnected`, which
   `shell/LobbyConnection.tsx` now says when the lobby socket reopens. The
   real picture goes back on screen only after it has loaded, so a broken
   icon never shows; timers and listeners stop when the picture goes away;
   inlined (data:) pictures and the default are never retried.
   Page test `src/avatarRetry.test.tsx` (4 tests; 2 fail on the old code).
   Real restart on the local stack, nothing stubbed: Offline opened while
   the server was down -> 4 pictures failed (`ERR_EMPTY_RESPONSE`), the
   default showed; retries r=1, r=2 failed while it was down; r=3 answered
   200 about 3 s after the server was back and all 4 pictures showed
   (naturalWidth 128), with no reload.
2. **Never cache a failure** -- `auth/SignedInGate.kt`. One send-pipeline
   step decides the Cache-Control of every answer under `/assets` from the
   answer itself: not a success -> `no-store`; a signed-in success ->
   `private, max-age=31536000, immutable` (as before); the sign-in
   screen's own files -> nothing (as before). Also found and fixed: the
   gate used to add "immutable" BEFORE the file was looked up, so a
   signed-in page's 404 for a missing file said "keep for a year".
   Server test `AuthApiTest` "a failed built file is never kept" (fails on
   the old code: Cache-Control was absent).
3. **Wider players list** -- `shell/app.css`:
   `clamp(300px, 19vw, 380px)` (365 px at 1920, 380 px at 2560 and up;
   300 px under the 1100 px breakpoint, was 260). e2e
   `lobby.spec.ts` "spec 0060: ..." renames the second player to
   "MightyWombat" for the run (restored after) and checks at 1920x1080,
   1920x947 and 2560x1440: column width, name not cut, and "Away 60 min ·
   in the lobby" fits. Known limit: beside the Invite button the name has
   about 170 px at 1920; twelve capital Ms need about 178 px and still end
   in "...". Ordinary 12-letter names fit.
