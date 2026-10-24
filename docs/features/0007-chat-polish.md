# 0007 — Chat polish: time, your lines, emoji, reactions, lobby events

**Status:** Draft
**Owner decisions:** C1 time next to the name; C2 your own lines marked;
C3 an emoji button by Send; C4 reactions; C5 lobby events in the chat;
C6 message bubbles; C7 an unread marker (owner, 2026-10-24, from the
chat options after the 0006 build)

## What the player sees

A moment in the lobby: you are in "Friday night", Pat has just joined.

```text
 (Pat)  Pat  20:14
        ╭───────────────────────────╮
        │ gl hf                     │
        │ bringing the goblins 🔥   │
        ╰───────────────────────────╯
          👍 1   😂 2
                       ── Pat joined Friday night ──
                                     RudeLeft  20:15  (you)
                    ╭──────────────────────────────╮
                    │ ready when you are ⚔️         │   ← gold edge
                    ╰──────────────────────────────╯
 ─────────────────────────── New ──────────────────────────────
 (Cole) Cole  20:31
        ╭───────────────────────────╮
        │ room for one more later?  │
        ╰───────────────────────────╯
 [ Say something…                       ] [😊] [Send]
```

- **C1 Time next to the name.** "**Pat** 20:14": the time small and dim,
  right after the name, the message under them. Today the name stretches
  across the column and the time ends up at the far edge.
- **C2 Your own lines.** A gold left edge and a slightly warmer
  background on what you said, so you find your own lines at a glance.
  Your lines stay on the left like everybody's (one column reads faster
  in a narrow panel than a left/right split).
- **C6 Bubbles.** Each run of lines from one person sits in one soft,
  rounded box; the name, time and avatar show once per run, as today.
- **C3 Emoji button.** A 😊 button between the box and Send opens a small
  panel of 40 emoji (list below); clicking one puts it into what you are
  typing at the cursor, and the panel stays open until you click away,
  press Esc or send. On a phone the panel opens above the keyboard, full
  width. Typing emoji with Windows `Win + .` or a phone keyboard keeps
  working as it does today.
- **C4 Reactions.** Pointing at a line (or tapping it on a phone) shows a
  small row of six: 👍 ❤️ 😂 😮 😢 🔥. Clicking one adds it under the
  line with a count ("😂 2"); clicking your own again takes it back.
  Pointing at a count says who ("Pat, Cole"). One of each per person per
  line.
- **C5 Lobby events.** Small grey centred lines, between the chat lines,
  at the moment they happen:
  - "Pat opened a room" / "Friday night closed"
  - "Pat joined Friday night" / "Pat left Friday night"
  - "RudeLeft and Pat started a game" / "RudeLeft and Pat's game ended"
  Only what the room list already shows everyone -- never a deck, an
  invitation, or who was invited (invitations stay private). Signing in
  and out are not posted (the Players list already shows that, and it
  would drown the chat).
- **C7 Unread marker.** Lines that arrive while the tab is in the
  background, or while chat is scrolled up, sit under a "New" divider;
  the page title shows the count, "(3) Proxic Arena". Coming back to the
  tab and scrolling to the bottom clears both. Lobby events (C5) do not
  count as unread.

## Scope

In: the lobby chat (the only chat there is), on desktop and phone.

Out (and why):
- **Saving chat.** Chat stays as it is today, live only (Phase 5
  Amendment 3): a reload starts empty, and so do reactions on lines you
  did not see. A saved chat is a separate decision with privacy weight.
- **Reacting to lobby events**, editing or deleting lines, replies,
  mentions -- not asked for; each could be its own spec.
- **A large emoji library or search.** 40 chosen emoji keep the page
  small and need no download.
- **In-game chat.** There is none; this spec does not add one.

## Rules and boundaries

- **Hidden information (HID):** lobby events are built only from the
  room list everyone already receives -- no deck, no invitation, no
  account that is not already shown. A unit test pins the words to the
  room list.
- **Ephemeral chat (Phase 5 Amendment 3):** reactions are relayed like
  chat lines, never stored. The server gives each line an id so a
  reaction can name it; it keeps no list of lines or reactions.
- **Limits:** a reaction goes through the same rate limit as a chat line
  ("Slow down a moment"); only the six reaction emoji are accepted; a
  reaction to an unknown id is harmless (nobody has that line).
- **Escaping:** emoji are ordinary text; messages stay escaped by React,
  as today.
- **No layout geometry change** to the lobby columns: everything here
  lives inside the chat panel.

## How it works (for the build)

- Server: `CHAT` gains `id` (a fresh UUID); a new `REACT` message
  `{ id, emoji, on }` from a player is checked (emoji in the six, rate
  limit) and broadcast as `REACTION { id, emoji, on, from }`.
  `MATCH_PROTOCOL.md`/lobby protocol notes updated.
- Frontend: reactions tallied per line in the lobby state (a set of user
  ids per emoji); lobby events derived from changes in the room list
  between two updates; unread count from visibility and scroll position;
  the emoji panel and the 40-emoji list in their own small module.

The 40 emoji (owner may swap any):

```text
😀 😂 🤣 😊 😍 😎 🤔 😅 😬 😮 😢 😭 😡 🤯 🥳 😴 🙃 🤝 👍 👎
👏 🙏 💪 👀 🔥 ⚔️ 🛡️ 💀 🐉 🧙 ✨ 💎 🎲 🃏 🏆 ❤️ 💔 ☠️ 🍀 🎉
```

## Tests

- Server: a chat line carries an id; a reaction outside the six is
  refused; a reaction is rate-limited; a reaction reaches everyone with
  who sent it.
- Unit: lobby events from room-list changes (each wording, and nothing
  for a private change such as an invitation); unread count rules.
- Browser: two players -- time next to the name, own line marked, emoji
  from the panel sent, a reaction appears for both and is taken back,
  "Pat joined Friday night" seen by both, "New" divider after the tab
  was hidden.
- Screenshots of the chat at 1280, 1600 and on a phone for the owner
  before it ships.
