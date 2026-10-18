-- PHASE_06 §6.9, §6.16, §6.17, §6.18, §6.19 — the match record.
--
-- Phase 5 ends at a frozen setup. This is what consumes one.

-- §6.16 — the room lifecycle gains IN_MATCH.
--
-- Phase 5's CHECK allowed four values and this is not one of them,
-- which the Phase 6 lock review caught: the exit gate requires the
-- transition and the schema forbade it.
--
-- The expiry sweep filters on OPEN and READY_FOR_MATCH, so a room
-- in a match is untouched by it without anything being added. The
-- care needed is the opposite one: when a match ends the room
-- returns to OPEN (owner decision D4), and its 24-hour clock runs
-- from the last ACTIVITY — a long match is not activity.
ALTER TABLE room DROP CONSTRAINT room_status_check;
ALTER TABLE room ADD CONSTRAINT room_status_check
    CHECK (status IN ('OPEN', 'READY_FOR_MATCH', 'IN_MATCH', 'CLOSED', 'EXPIRED'));

-- §6.18 — one match.
CREATE TABLE match (
    match_id        UUID PRIMARY KEY,

    -- §6.9 — a setup creates AT MOST ONE match, enforced here
    -- rather than in code. Two concurrent launches both passing a
    -- check-then-insert is exactly the race §6.9 names, and the
    -- unique constraint is what makes the loser lose.
    --
    -- RESTRICT, not CASCADE: a setup is never deleted while a match
    -- points at it, and silently removing match history to tidy a
    -- setup table would be the wrong trade.
    setup_id        UUID        NOT NULL UNIQUE
        REFERENCES match_setup (setup_id) ON DELETE RESTRICT,

    room_id         UUID        NOT NULL
        REFERENCES room (room_id) ON DELETE RESTRICT,

    -- §6.17 — the lifecycle, enforced by the database for the same
    -- reason room.status is: a status nobody wrote is how a record
    -- ends up in a state no branch handles.
    status          TEXT        NOT NULL
        CHECK (status IN (
            'LAUNCHING', 'RUNNING', 'ENDED',
            'FAILED_STARTUP', 'FAILED_RUNTIME', 'TERMINATED'
        )),

    preset_id       TEXT        NOT NULL,

    -- §6.18, §6.26 — WHAT RAN. Recorded at launch from the server's
    -- own build facts, not from anything a client said.
    --
    -- The reason this is not a join to some current-version table:
    -- the question a month from now is "which Forge was this match
    -- played under", and the answer must not change when the server
    -- is upgraded.
    forge_commit    TEXT        NOT NULL,
    forge_release   TEXT        NOT NULL,
    worker_protocol_version  INTEGER NOT NULL,
    public_protocol_version  INTEGER NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Null until Forge reaches the accepted running milestone
    -- (§6.17): LAUNCHING is not RUNNING, and a match record that
    -- claimed a start time before a game existed would be a lie
    -- told by a timestamp.
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,

    -- §6.15 — why it did not start, or why it stopped. Null while
    -- nothing has gone wrong.
    failure_code    TEXT,

    -- §6.149 — FORGE decides who won. This holds what Forge
    -- reported, never a conclusion Arena drew from life totals or a
    -- dropped connection.
    result_summary  TEXT,

    CONSTRAINT match_started_before_ended
        CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX match_room_idx ON match (room_id);
CREATE INDEX match_status_idx ON match (status);

-- §6.19 — the seats, as they were at launch.
CREATE TABLE match_participant (
    match_id    UUID    NOT NULL
        REFERENCES match (match_id) ON DELETE CASCADE,

    user_id     UUID    NOT NULL
        REFERENCES app_user (user_id) ON DELETE RESTRICT,

    seat_number INTEGER NOT NULL,

    -- Null for Open Format. The column exists because §5.38 forbids
    -- INFERRING a team from seat parity later, and FMT-005 requires
    -- seat and team identity to stay representable — a seat model
    -- that can hold four is in scope even while a game that seats
    -- four is not.
    team_id     INTEGER,

    -- WHICH DECK, and WHAT IT WAS CALLED.
    --
    -- ON DELETE SET NULL plus a name snapshot, deliberately, and
    -- this settles a question carried out of Phase 5. The obvious
    -- alternative — RESTRICT, the way match_setup_player does it —
    -- would mean that playing one game with a deck made that deck
    -- permanently undeletable. That is the exact defect V008 and
    -- V009 were written to repair, and reproducing it in a new
    -- table a day later would be careless.
    --
    -- The history survives as the NAME, which is what anybody
    -- reading an old match actually wants. The id is what Phase 6
    -- needs at LAUNCH, and by the time a deck can be deleted the
    -- match is long over.
    deck_id     UUID
        REFERENCES imported_deck (deck_id) ON DELETE SET NULL,
    deck_name_snapshot  TEXT NOT NULL,

    -- §6.19, and the same reasoning as V007's setup snapshot: a
    -- player who renames their account keeps the name the match was
    -- played under (§5.106).
    display_name_snapshot TEXT NOT NULL,

    PRIMARY KEY (match_id, user_id),
    CONSTRAINT match_participant_seat_unique UNIQUE (match_id, seat_number),
    CONSTRAINT match_participant_seat_positive CHECK (seat_number > 0)
);
