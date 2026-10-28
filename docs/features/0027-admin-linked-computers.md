# 0027 — Linked computers on the Admin page

**Status:** Built in 1.15.0
**Owner decisions:** 2026-10-28 — a Computers tab with Remove, as on the
canvas; (1) show the address each computer last connected from, yes;
(2) email the player when a computer is removed, no (the Deck Builder
tells them on its next send).

## What the player sees

RudeLeft opens the Admin page's **Computers** tab and sees every computer
linked to the Deck Builder: Pat's PAT-PC, linked Oct 28, last used 2 hours
ago from 203.0.113.7. Pat says that PC was sold, so RudeLeft clicks
**Remove**. The row asks first and says what happens. RudeLeft confirms,
and the link stops working at once. The next time the Deck Builder on that
PC tries to send, it says Arena no longer accepts its link and unlinks
itself. Pat's decks already on Arena stay.

From the Accounts tab, Pat's Sessions column says "1 computer", and
Manage → **Linked computers (1)…** opens the tab showing just Pat's.

## Scope

In:
- `GET /api/admin/computers` and `POST /api/admin/computers/{id}/remove`,
  administrators only.
- The address a computer last used its link from (`device_link.
  last_used_from`, V027), written on every use, as Sign-ins records
  addresses.
- The Computers tab, the count on each account and the Manage menu item.

Out (and why):
- An email to the player on removal (owner decision 2).
- A history of removed computers. A removed link drops off the list. The
  Admin log keeps who removed what.

## Rules and boundaries

- Remove ends the link exactly as the player's own Remove does (spec 0021).
- Nothing that could use a link is listed or logged. Arena keeps only a
  SHA-256 of a token.
- The Admin log records "computer removed" with the player and the
  computer's name.
- The player's Account page is unchanged.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0027-A | The list shows every live link with its player, name, dates and last address, and never a token; players get 403 | server test |
| F-0027-B | Remove ends the link (the token no longer works), records it, and a second Remove says it is gone | server test |
| F-0027-C | An administrator sees a computer the player just linked, Remove asks first, Cancel changes nothing, Remove ends it | browser (e2e) |
| F-0027-D | The tab and the account row look right at desk and phone widths | owner |

## Decisions for the owner

All taken 2026-10-28 (see the top).

## Amendments

None.
