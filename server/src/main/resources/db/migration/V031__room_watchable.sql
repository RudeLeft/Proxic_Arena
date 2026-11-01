-- Spec 0047 (owner 2026-10-31) — whether people may watch this room's
-- game. The host chooses when opening the room; on unless they say no.
ALTER TABLE room ADD COLUMN watchable BOOLEAN NOT NULL DEFAULT TRUE;
