# 0020 — One set of picture sizes, and Admin's room status and health

**Status:** Approved 2026-10-26 — built; look approved ("Yes, ship it")
**Owner decisions** (2026-10-26): F1 the Hall's four places and the Belt
holder use the big seat size, 56px; F2 a server problem also puts a red
dot on the Server tab's name; F3 build it.

## What the player sees

1. **Pictures use the lobby's two sizes** (owner, 2026-10-26): 40px in
   lists and chat (spec 0019 F2), 56px for featured players (the seats
   in a room).
   - Hall of Champions: the four places and the Belt holder are 56px
     (were 32 and 44); the records, rivalries, "your rival" and
     "playing their way in" pictures are 40px (were 26–34). The leaderboard
     was already 40. A record's second line stays on one line, a long
     deck name ending in "…" with the whole line in its tooltip.
   - Deck Depot: the "Shared with" names are 40px (were 24).
   - The Account page's picture editor is a preview, not a list, and
     keeps its own sizes.

## What the administrator sees

2. **Admin → Rooms**: every status fits its box (owner, 2026-10-26).
   "WAITING FOR A PLAYER" overflowed the 150px box once spec 0017's
   type scale made the letters bigger; the box is now 210px in a 220px
   column.
3. **The server's health is a pill beside the Server tab's title**
   (owner, 2026-10-26), no longer above every tab: "● Healthy · v1.8.0"
   in green, or the problem in words in red. When there is a problem a
   red dot also shows on the Server tab's name, so it is seen from any
   tab (F2).

## Tests

- **F-0020-A** (`frontend/src/avatarSizes.test.ts`): the Lobby, chat,
  Hall, Admin and Deck Depot pages size every picture with `ICON` or
  `SEAT_AVATAR` only, and those are 40 and 56.
- **F-0020-B** (`frontend/e2e/admin.spec.ts`, force close): in a real
  browser each of the five room statuses fits its box.
- **F-0020-C** (`frontend/e2e/admin.spec.ts`): no health pill and no
  problem dot outside the Server tab; the pill is in the Server panel's
  title row.
- The Hall shows no scroll bars at 1920×1080 and 1440×900 with the
  bigger pictures (checked from screenshots).
