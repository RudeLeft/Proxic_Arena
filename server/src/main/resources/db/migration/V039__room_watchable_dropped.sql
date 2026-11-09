-- Spec 0067 item 6 (owner 2026-11-09) — every game can be spectated: the
-- "Let people watch" checkbox is gone, so the room's watchable column (V031)
-- is dropped. Rooms opened with it off become spectatable like the rest.
ALTER TABLE room DROP COLUMN watchable;
