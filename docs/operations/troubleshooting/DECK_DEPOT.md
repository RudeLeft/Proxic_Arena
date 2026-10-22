# Troubleshooting — Deck Depot

PHASE_04 §4.170. Each entry names what you see, what it means, and
what to do.

How it works is `docs/architecture/DECK_DEPOT.md`; the exact rules
are `DECK_AUTHORIZATION.md`. Problems with the package itself —
rejected ZIPs, missing cards, bad artwork — are
`docs/operations/troubleshooting/DECK_IMPORT.md`, which Phase 4 did not change.

---

## "Upload" does nothing, or the page sends you to sign in

Every Deck Depot route needs a session, import included. If you are
on `http://<unraid-ip>:8765`, signing in cannot work at all — a
browser will not keep a `Secure` cookie over plain HTTP. Use
`https://proxic.barnflix.net`.

That is owner decision D2 and it catches everybody once;
`docs/operations/troubleshooting/AUTHENTICATION.md` leads with it.

## The upload is refused

Phase 4 added two refusals to the Phase 2 list:

| What you see | What it means |
| --- | --- |
| `401` or a redirect to login | No session. See above. |
| `403` | The CSRF token was missing — the page must send `X-CSRF-Token`. A call made outside the app will see this. |
| `DUPLICATE_PACKAGE` | **You** have already imported this exact package. It names the deck, because it is yours. |

Everything else — `NOT_A_ZIP`, `NO_DECK_LIST`, `CARD_NOT_FOUND` and
the rest — is unchanged and documented in `DECK_IMPORT.md`.

### "This package has already been imported" — but you have never seen it

Since **PHASE 4 AMENDMENT 4** this cannot happen for someone else's
deck. Uniqueness is per owner, so another account importing the same
file gets their own copy and is told nothing about yours.

If you see this, the deck is in *your* library. Look under **My
decks** for the name it gives.

> Before that amendment, a duplicate answer named *any* deck with
> that checksum, including a private deck belonging to somebody else
> — it leaked the name and the id. If an older build is still
> running anywhere, that is why this entry exists.

## A deck you imported is not in the list

In order of likelihood:

1. **You are signed in as somebody else.** The library is per
   account. Check the home page — it says who you are.
2. **It is under the other heading.** A deck someone shared with you
   appears in **Shared with me**, never in **My decks** (§4.60).
3. **The import did not finish.** A failed import leaves nothing at
   all (§2.18, §4.75) — there is no half-imported deck. The page
   would have shown the refusal.
4. **The share was revoked.** Then it is gone from your library,
   which is the feature working.

## The wrong person owns a deck

Ownership is set from the session at import and cannot be changed in
Phase 4 (§4.17) — there is no transfer, and an administrator cannot
reassign one.

To check who owns what, from the host:

```bash
docker compose exec postgres psql -U proxic -d proxic -c \
  "select d.display_name, u.username from imported_deck d join app_user u on u.user_id = d.owner_user_id;"
```

If a deck genuinely belongs to the wrong account, the supported fix
is: the right owner imports the package themselves, and the wrong
one deletes their copy. Since AMENDMENT 4 both can hold it at once,
so nothing is lost in between.

## Sharing says the user does not exist

`SHARE_USER_NOT_FOUND`. The username must be exact — it is matched
the way accounts are, so case does not matter (`pAt` finds `Pat`),
but spelling does. There is deliberately no user directory and no
search (§4.30).

Confirm the spelling from the host:

```bash
docker compose exec arena-server /app/bin/arena-admin list
```

## Sharing says the account is disabled

`SHARE_USER_DISABLED`. §4.28: no **new** share to a disabled
account. Re-enable it first:

```bash
docker compose exec arena-server /app/bin/arena-admin enable Pat
```

An **existing** share is unaffected by disabling — it simply cannot
be used while the account is disabled, and works again when the
account is re-enabled. That is the account's state talking, not the
share's.

## "Already shared"

Not an error. Sharing twice is idempotent (§4.33): the answer is
`200` instead of `201`, and the recipient list is unchanged. Nothing
was duplicated.

## A recipient cannot see a deck you shared

1. **Have them reload.** The library is fetched when the page loads;
   a share created a moment ago appears on the next load.
2. **Check the recipient.** Open the deck and look at *Currently
   shared with* — it is the server's list, not the page's memory.
3. **Check they are signed in as that account.**

Nothing is cached server-side, so a share that exists in that list is
in force.

## A revoked recipient can still see the cards

Two different things, and only one is a fault:

- **They can still open the deck or its API.** That is a fault.
  Check the share list; if the recipient is gone from it and access
  continues, tell me — revocation is a database delete and takes
  effect on the next request.
- **Images still appear in their browser.** Expected (§4.36).
  Artwork is `Cache-Control: private`, so no shared cache holds it,
  but their own browser may until the entry expires. Revocation
  governs the server, not pixels already delivered — and no server
  setting prevents a screenshot.

## Artwork is missing, or answers 404

Since PHASE 4 AMENDMENT 2, artwork needs **both** deck access and
the asset actually belonging to that deck. A 404 means one of:

- you may not see that deck;
- the asset is not part of it (a URL from a different deck will not
  work, even for your own decks);
- the file is genuinely absent — see "Artwork is missing" in
  `DECK_IMPORT.md`.

The deck id in an artwork URL is load-bearing. Before Phase 4 it was
not, and any asset could be fetched under any deck id.

## A legacy deck has no owner

Not possible since `V004`: `owner_user_id` is `NOT NULL`. If the
migration ever stops with

```text
V004: N deck(s) have no owner and no account named "RudeLeft" exists
```

the database holds decks and not that account. Create it, or delete
the decks, then start the server again. The migration refuses to
guess an owner (§4.14).

## The data directory is missing or unwritable

Card art lives on the host, not in the image:

```text
/mnt/user/appdata/proxic_arena/v2/data
```

The `init-data` container chowns it to uid 100 on every start and
then exits — seeing it **stopped** is correct, and the stack reading
"partial (2/3)" in the Unraid GUI is normal for this reason.

If imports fail with a permission error, check that container's log
first; it runs before the server starts.

## Owner and database disagree

If the page and the database tell different stories, the database is
right — the page holds no authority and asks on every load. Compare
with the query under *The wrong person owns a deck*, and tell me what
the two say.
