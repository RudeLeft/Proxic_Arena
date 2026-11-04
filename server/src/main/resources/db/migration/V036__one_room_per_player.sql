-- §5.5 — one room membership per user, enforced by the database.
--
-- V006 said the primary key did this; it did not. (room_id, user_id)
-- stops a user taking two seats in ONE room, not one seat in each of
-- two, so two tabs clicking "Open a room" at the same instant both
-- passed the service's check and both inserted (docs audit,
-- 2026-11-04). A unique index on the user alone is the guard.
--
-- Closing a room deletes its members (RoomStore.close), so a row
-- belongs to a live room. Any left behind in a finished room by an
-- older build is cleared first, or the index could not be built.
DELETE FROM room_member m
 USING room r
 WHERE r.room_id = m.room_id
   AND r.status NOT IN ('OPEN', 'READY_FOR_MATCH', 'IN_MATCH');

-- Should the race ever have happened, the user keeps the room they
-- joined first; a later seat is dropped.
DELETE FROM room_member m
 WHERE EXISTS (
       SELECT 1 FROM room_member earlier
        WHERE earlier.user_id = m.user_id
          AND (earlier.joined_at, earlier.room_id) < (m.joined_at, m.room_id));

DROP INDEX room_member_user_idx;
CREATE UNIQUE INDEX room_member_one_room ON room_member (user_id);
