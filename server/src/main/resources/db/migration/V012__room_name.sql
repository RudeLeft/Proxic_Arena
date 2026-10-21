-- PHASE_07 Amendment 9 — a room may be named when it is opened.
--
-- Optional: NULL means "<host display name>'s room", worked out when
-- the room is shown rather than stored, so a host who changes their
-- display name does not leave a stale label behind. The length and
-- the one-line rule are the service's to explain; this is the
-- backstop.
ALTER TABLE room ADD COLUMN name TEXT NULL
    CONSTRAINT room_name_sane CHECK (name IS NULL OR char_length(btrim(name)) BETWEEN 1 AND 40);
