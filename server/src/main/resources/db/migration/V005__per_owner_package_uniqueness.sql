-- Per-owner package uniqueness — PHASE 4 AMENDMENT 4.
--
-- Phase 2 made package_sha256 globally UNIQUE, which was right when
-- every deck belonged to everybody. Phase 4 gave decks owners, and
-- the combination produced two faults, both measured against the
-- running server:
--
--   1. A second user importing a package somebody else owned got a
--      409 naming that deck and quoting its id -- so an account with
--      no access to a private deck could learn it exists, what it is
--      called and where it lives. That is the §4.65 rule broken by a
--      route Phase 4 never touched.
--
--   2. That user could never own their own copy. On a server where
--      decks are private, "first to import this file owns it
--      forever" is not a rule anybody chose.
--
-- Owner decision, 2026-10-16: uniqueness is per owner. Each account
-- may import any package once; a re-import by the SAME owner is
-- still refused and still names the deck, because that deck is
-- theirs to be told about.
--
-- Storage cost is near zero: artwork is content-addressed, so a
-- second owner's copy shares every image file and adds only rows.

ALTER TABLE imported_deck
    DROP CONSTRAINT imported_deck_package_sha256_key;

ALTER TABLE imported_deck
    ADD CONSTRAINT imported_deck_owner_package_unique
        UNIQUE (owner_user_id, package_sha256);

-- The duplicate check now looks up (owner, checksum), which this
-- constraint already indexes.
