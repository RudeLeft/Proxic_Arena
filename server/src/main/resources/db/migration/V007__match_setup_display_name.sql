-- PHASE_05 §5.105, §5.106, §5.111 — the display-name snapshot.
--
-- V006 stored user_id, seat and deck_id for each seat but not the
-- display name, and §5.111 lists "display-name snapshots" among the
-- things the handoff contract MUST define. §5.106 says why it is a
-- snapshot rather than a join: if a player renames their account
-- after preparation, the match may keep the name it was prepared
-- with. A join to app_user would silently give the new one.
--
-- A separate migration rather than an edit to V006, because V006 is
-- committed and Flyway checksums an applied migration. Editing it
-- would break every database that already ran it, which is the one
-- failure mode that only appears on somebody else's server.

ALTER TABLE match_setup_player
    ADD COLUMN display_name TEXT;

-- Backfilled from the account for any row written before this
-- column existed. There are none in practice -- nothing creates a
-- setup yet -- but a migration that assumes its own table is empty
-- is a migration that corrupts the one database where it was not.
UPDATE match_setup_player p
   SET display_name = u.display_name
  FROM app_user u
 WHERE u.user_id = p.user_id
   AND p.display_name IS NULL;

ALTER TABLE match_setup_player
    ALTER COLUMN display_name SET NOT NULL;
