-- §5.126 — a finished room's record goes after its diagnostics window,
-- even when it played a game (owner 2026-11-04: "clean up the room,
-- keep the game").
--
-- match.room_id and match.setup_id were RESTRICT references, so a room
-- that ever launched a match could never be removed: the purge skipped
-- every room with a CONSUMED setup, and those rows piled up forever.
--
-- The match keeps both ids as history -- the same UUIDs, still NOT NULL,
-- setup_id still UNIQUE, so §6.9's one-match-per-setup race is still
-- settled by the database. Only the references go: nothing reads a
-- finished match's room or setup (standings, the Hall, the Belt, the
-- admin match list, records and reports read match and
-- match_participant), and a live match's room is IN_MATCH, which the
-- purge never touches.
ALTER TABLE match DROP CONSTRAINT match_room_id_fkey;
ALTER TABLE match DROP CONSTRAINT match_setup_id_fkey;
