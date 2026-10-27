# 0017 — One type scale: bigger, unified text

**Status:** Approved 2026-10-26 — built; look approved from the comparison page (https://claude.ai/artifact/Ub9BLXTD43WJcbiEE8hxTX)
**Owner decisions:** T1 everyday reading text 16px, nothing under 12px;
T2 sizes follow the browser's own text-size setting; T3 the small
spaced-capital labels stay, made bigger; T4 the game screen is
included — its card text on the board is not (owner, 2026-10-26)

## Why

Presentation, readability and consistency (owner). Measured 2026-10-26:
about 200 hand-set text sizes across the stylesheets, 22 different
values from 8px to 34px; about 90 of them under 12px (the game's turn
key and seat role at 8px, zone labels, room tags and Deck Depot group
heads at 9px, every spaced-capital label at 10-11px, chat times,
"In Ash's room", notice second lines, help text). Twelve letter
spacings, an odd fourth weight (500), and the game screen names its
two typefaces by hand in 20 places instead of using the shared ones.

## What the player sees

Everything a little bigger and more even. Reading text — chat, room
details, lists, help lines — is 16px (was mostly 12-13px). The
smallest text anywhere is 12px (was 8px). Labels in spaced capitals
("PLAYERS", "1 · YOUR DECK") keep their look at 12-13px. Headings and
the big numbers are about the size they are now. A player who sets
Chrome's text size to Large gets bigger text everywhere (T2).

## The scale

Two typefaces, as now: Barlow Condensed for headings, buttons and
numbers; Segoe UI for reading. Sizes in rem (1rem = the browser's
text size, 16px by default), so T2 holds:

| Token | Size | Was | Used for |
|---|---|---|---|
| `--pa-size-xs` | 0.75rem (12px) | 8-10px | spaced-capital labels, tiny tags |
| `--pa-size-sm` | 0.8125rem (13px) | 11px | times, meta lines, notes |
| `--pa-size-md` | 0.875rem (14px) | 12px | secondary text, small buttons |
| `--pa-size-base` | 1rem (16px) | 13-15px | reading text, inputs, rows |
| `--pa-size-lg` | 1.125rem (18px) | 16-19px | card titles, room names, buttons |
| `--pa-size-xl` | 1.5rem (24px) | 20-26px | page and room titles, big names |
| `--pa-size-2xl` | 2rem (32px) | 30-34px | the largest headings |

Weights 400, 600, 700. Letter spacing: `--pa-track-caps` (0.12em) for
spaced capitals, `--pa-track-button` (0.08em) for buttons. Line
height 1.45 for reading, 1.15 for headings.

## Scope

In: every stylesheet (base, app, game, and the global one the status
page uses), the sign-in and join pages.
Out: text drawn on the battlefield cards, and the three sizes set in
code (the avatar badge's number, two on the board's overlays) -- each
grows with its picture or card, and is part of the measured board.
A third shared face, `--pa-mono`, names the one monospace use (the
`.zip` in the Deck Depot's drop box).

## How

1. The tokens in `styles.css` (every page loads it); the game screen's 20 hand-typed families
   become the shared ones.
2. Page by page — Lobby, Deck Depot, Account, Admin, sign-in/join,
   then the game screen's panels, menus and bars — each size moved to
   its step, with screenshots before and after at 1280px, 1920px and
   phone width, and at Windows 125% and 150% scaling.
3. Where bigger text crowds (most likely the game screen's top bar,
   seat facts and action bar), the spacing change is shown to the
   owner first: no layout geometry changes without permission.
4. A gate: a unit test fails on any `font-size` in the stylesheets
   that is not a token (the board's card-relative sizes excepted by
   name), so the scale cannot drift.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0017-A | No `font-size` outside the scale; no hand-typed family | unit test (the gate) |
| F-0017-B | Nothing under 12px on any page at 100% | browser (computed sizes) |
| F-0017-C | Chrome's text size Large makes text bigger | browser |
| F-0017-D | No overflow or clipping at 1280, 1920, phone, 125% and 150% | browser + screenshots |
| F-0017-O | The owner approves the look from side-by-side screenshots ("Yes, ship it", 2026-10-26) | owner |
