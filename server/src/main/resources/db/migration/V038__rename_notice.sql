-- Spec 0041 Amendment 3 — an administrator renames a player (owner
-- 2026-11-04, canvas choices A/A).
--
-- The player is told once: "An administrator changed your display name
-- to <name>." At once when they are online; otherwise the next time
-- they connect. The new name waits here until it is told, then the
-- lobby clears it (Renames.takeNotice). Null: nothing to tell.
ALTER TABLE app_user ADD COLUMN renamed_notice TEXT;
