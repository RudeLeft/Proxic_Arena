-- PHASE_04 §4.88–§4.91 — deck ownership and sharing.
--
-- Two changes: every deck gets an owner, and a deck may be shared
-- with named users. Both are database relationships; nothing about
-- storage moves (PHASE 4 AMENDMENT 1).

-- §4.4, §4.10, §4.11 — ownership lives on the deck.
--
-- Added NULLABLE first so the legacy assignment below can run; the
-- NOT NULL constraint is applied at the end, once every row has an
-- owner (§4.16). A column that is NOT NULL from the start cannot be
-- added to a table that already has rows without inventing a value,
-- and inventing one is exactly what §4.14 forbids.
ALTER TABLE imported_deck
    ADD COLUMN owner_user_id UUID
        REFERENCES app_user (user_id) ON DELETE RESTRICT;

-- ON DELETE RESTRICT, not CASCADE: §4.92 says user deletion is still
-- not implemented, and a future DELETE that silently took a user's
-- decks with it would be a worse discovery than a foreign key
-- complaining.

-- §4.13–§4.15 — the legacy decks, assigned by OWNER DECISION D1
-- (2026-10-16), not by guesswork.
--
-- Two decks existed before ownership did: one on the development
-- stack and one on the production host, both imported by the owner,
-- who confirmed they are theirs. §4.14 forbids assigning decks to
-- "the first admin" or "the first user" -- this assigns them to a
-- NAMED account, which is a different thing: if `rudeleft` does not
-- exist in some other database, nothing is assigned and the check
-- below reports it rather than picking somebody.
UPDATE imported_deck
   SET owner_user_id = (
        SELECT user_id FROM app_user WHERE username_normalized = 'rudeleft'
   )
 WHERE owner_user_id IS NULL;

-- Fail loudly, and usefully, rather than through a constraint.
--
-- The only way to reach this is a database holding decks with no
-- `rudeleft` account -- which is not any environment this project
-- has, but is exactly the case where a cryptic NOT NULL violation
-- would waste an afternoon.
DO $$
DECLARE orphans INTEGER;
BEGIN
    SELECT count(*) INTO orphans FROM imported_deck WHERE owner_user_id IS NULL;
    IF orphans > 0 THEN
        RAISE EXCEPTION
            'V004: % deck(s) have no owner and no account named "RudeLeft" exists to assign them to. '
            'PHASE_04 §4.14 forbids guessing an owner. Create the account, or delete the decks, then '
            'run the migration again.', orphans;
    END IF;
END $$;

-- §4.16 — no permanent ownerless decks.
ALTER TABLE imported_deck
    ALTER COLUMN owner_user_id SET NOT NULL;

-- "My Decks" runs on every page load of the Deck Depot (§4.58).
CREATE INDEX imported_deck_owner_idx ON imported_deck (owner_user_id);

-- §4.25 — the share relationship.
CREATE TABLE deck_share (
    share_id             UUID PRIMARY KEY,

    deck_id              UUID NOT NULL
        REFERENCES imported_deck (deck_id) ON DELETE CASCADE,

    shared_with_user_id  UUID NOT NULL
        REFERENCES app_user (user_id) ON DELETE RESTRICT,

    -- §4.25 — normally the owner. Kept as audit history rather than
    -- re-derived, because ownership is not transferable in Phase 4
    -- (§4.17) but may become so later, and "who granted this" is not
    -- recoverable afterwards.
    created_by_user_id   UUID NOT NULL
        REFERENCES app_user (user_id) ON DELETE RESTRICT,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- §4.26 — at most one share per (deck, recipient). Enforced here
    -- and not only in code: two share requests racing would both
    -- pass a check-then-insert, and the second would leave a
    -- duplicate that revocation then only half removes.
    CONSTRAINT deck_share_unique UNIQUE (deck_id, shared_with_user_id)
);

-- §4.91 — ON DELETE CASCADE above is the "no orphan share rows"
-- requirement, enforced by the database rather than by remembering
-- to delete them in the right order.

-- §4.59 "Shared with me" is the other half of the Deck Depot query.
CREATE INDEX deck_share_recipient_idx ON deck_share (shared_with_user_id);

-- §4.27 (cannot share with the owner) is NOT a constraint here: it
-- spans two tables, so a CHECK cannot express it. It is enforced in
-- the share service, which returns CANNOT_SHARE_WITH_OWNER, and a
-- test asserts no such row can be created through the API.
