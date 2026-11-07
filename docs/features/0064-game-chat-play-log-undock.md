# 0064 — Game chat: a play log tab, and undocking

**Status:** Approved 2026-11-07 (owner, on the canvas "chat-1107", sent as a file)
**Owner decisions:** tabs; floating window plus its own browser window

## Why

Players asked to undock the game chat and to see everything that was
played. The owner: the log is not in the chat; it is its own section of
the chat window. The lobby chat is unchanged.

## Built

- The game chat window has two tabs, "Chat" and "Play log", each with an
  unread count.
- The play log: what happened, in plain English, grouped by turn
  ("Turn 5 · Alice"; "Alice cast Lightning Bolt targeting Bob's Grizzly
  Bears"; "Grizzly Bears died"; "Bob attacked with ..."; "Alice gained 3
  life"), card names you can point at to see the card; filters
  (Everything / Spells and combat); it scrolls with the game, with "Jump
  to latest" when you have scrolled up. Written for each player from only
  what that player is allowed to see (never the game's own record, which
  can name hidden cards); a line never appears before the table shows the
  event; it survives a page refresh for the game's length.
- Undock: the window floats on the battlefield; drag and resize it; it
  remembers where you put it and slides clear of your hand and the action
  button. Pop-out: a button opens it in its own browser window (for a
  second screen); the browser asks once to allow pop-ups; refreshing the
  game closes it.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0064-A | Chat and Play log tabs with unread counts | page test; screenshot |
| F-0064-B | The log names nothing the player may not see; never ahead of the table | Lab hidden-info check; server/worker test |
| F-0064-C | Floating window: drag, resize, remembered, never over the hand or action button | e2e; screenshot |
| F-0064-D | Pop-out window shows chat and log and stays in step | e2e |

## Amendments
