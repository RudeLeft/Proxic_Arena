-- Rooms, membership and prepared match setups.
-- PHASE_05 §5.118, §5.128–§5.131.
--
-- Lobby state is persisted rather than held in memory (§5.118), so a
-- server restart, a browser refresh or a dropped connection does not
-- silently destroy a room somebody is standing in. What is NOT
-- persisted is presence: who is connected right now is connection
-- state, and §5.120 says so plainly. A restart leaves members in a
-- room and marks them all disconnected (§5.121).
--
-- There is no join_code column. PHASE 5 AMENDMENT 1: Arena has no
-- self-registration, so every account was created by the owner and
-- there are no strangers for a code to introduce. A host invites a
-- user who is present, and §5.11 already conceded that codes were
-- never authentication.

CREATE TABLE room (
    room_id         UUID PRIMARY KEY,

    -- §5.15. The host is a player too (§5.16), so they also hold a
    -- row in room_member; this records who may configure and close.
    host_user_id    UUID        NOT NULL
        REFERENCES app_user (user_id) ON DELETE RESTRICT,

    -- §5.32 — the preset is server-authoritative. Stored as its id
    -- rather than as expanded rules: a room must not carry a frozen
    -- copy of what Open Format meant on the day it was created.
    preset_id       TEXT        NOT NULL,

    -- §5.33. Open Format is 2 players and the preset says so; this
    -- exists because §5.34 lets a room be configured below its
    -- preset's maximum, and §5.35 forbids shrinking below the seats
    -- already occupied.
    desired_player_count INTEGER NOT NULL,

    -- §5.86 — an explicit lifecycle, enforced here rather than in
    -- code, because "a status nobody wrote" is how a room ends up
    -- in a state no branch handles.
    status          TEXT        NOT NULL
        CHECK (status IN ('OPEN', 'READY_FOR_MATCH', 'CLOSED', 'EXPIRED')),

    -- §5.x — optimistic concurrency. Every mutation bumps it, and a
    -- client that acts on revision 17 cannot apply its change to
    -- revision 18. Two hosts clicking at once is the ordinary case,
    -- not the exotic one.
    revision        BIGINT      NOT NULL DEFAULT 1,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- §5.124, owner decision D4 — rooms expire after 24 hours of
    -- INACTIVITY. Activity is joining, leaving, configuring,
    -- selecting a deck, readying, or a host action. A browser
    -- holding a socket open is not activity, which is why this is
    -- touched by those operations and not by the heartbeat.
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT room_player_count_sane
        CHECK (desired_player_count BETWEEN 2 AND 8)
);

-- The expiry sweep reads this; the lobby reads nothing else globally
-- (§5.13 — there is no room directory).
CREATE INDEX room_active_idx ON room (status, last_activity_at);

CREATE TABLE room_member (
    room_id          UUID        NOT NULL
        REFERENCES room (room_id) ON DELETE CASCADE,

    user_id          UUID        NOT NULL
        REFERENCES app_user (user_id) ON DELETE RESTRICT,

    -- §5.25, §5.26 — a seat is a position in a match, not an
    -- identity. Seat 1 today and seat 2 tomorrow is the same person.
    seat_number      INTEGER     NOT NULL,

    -- §5.38 — teams only if a preset needs them. Open Format does
    -- not, so this is null for every row Phase 5 will write. It
    -- exists because §5.38 forbids INFERRING a team from seat
    -- parity later, which is exactly what a missing column invites.
    team_id          INTEGER,

    -- §5.40. A deck ID, never deck contents (§5.123): the server
    -- resolves it, because a client that can send a decklist can
    -- send any decklist.
    --
    -- ON DELETE SET NULL, deliberately: deleting a deck must not
    -- delete the player from the room. §5.50 already says a
    -- selection can become invalid, and §5.51 says that clears
    -- readiness -- so the honest outcome is a seated player with no
    -- deck, not a vanished member.
    selected_deck_id UUID
        REFERENCES imported_deck (deck_id) ON DELETE SET NULL,

    ready            BOOLEAN     NOT NULL DEFAULT FALSE,
    joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- §5.5 — one room membership per user, enforced by the database
    -- because two tabs racing would both pass a check-then-insert.
    -- §5.6: several browser sessions are one player, not two.
    PRIMARY KEY (room_id, user_id),

    CONSTRAINT room_member_seat_unique UNIQUE (room_id, seat_number),
    CONSTRAINT room_member_seat_positive CHECK (seat_number > 0),

    -- §5.41, §5.42 -- a member cannot be ready without a deck. The
    -- rule lives in the service too, where it can explain itself;
    -- here it is the backstop that makes "ready with no deck"
    -- unrepresentable rather than merely unlikely.
    CONSTRAINT room_member_ready_needs_deck
        CHECK (NOT ready OR selected_deck_id IS NOT NULL)
);

-- "Which room am I in?" on every page load, and §5.5's uniqueness
-- check. A partial index would be tempting, but a user is in at most
-- one room, so the whole index is tiny.
CREATE INDEX room_member_user_idx ON room_member (user_id);

-- §5.130 — the handoff to Phase 6.
--
-- A setup is a SNAPSHOT: the room as it stood when every player was
-- ready. Phase 6 consumes it to start a match. It is separate from
-- the room because the room keeps changing and a match must not be
-- launched from a moving target.
CREATE TABLE match_setup (
    setup_id             UUID PRIMARY KEY,

    room_id              UUID        NOT NULL
        REFERENCES room (room_id) ON DELETE CASCADE,

    -- §5.122, §5.x — which revision of the room this snapshot was
    -- taken from. If the room has moved on, the setup is stale and
    -- must not be launched.
    source_room_revision BIGINT      NOT NULL,

    preset_id            TEXT        NOT NULL,

    -- §5.122 — a setup that was not consumed before a restart
    -- becomes INVALIDATED. Never "probably still fine".
    status               TEXT        NOT NULL
        CHECK (status IN ('READY', 'CONSUMED', 'INVALIDATED')),

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- §5.x — at most one live setup per room. Two READY setups for one
-- room is a race with two winners, and the second launch would start
-- a match from a snapshot nobody is looking at.
CREATE UNIQUE INDEX match_setup_one_ready_per_room
    ON match_setup (room_id)
    WHERE status = 'READY';

-- The seats as they stood at snapshot time, so Phase 6 launches from
-- what was agreed rather than from what the room says later.
CREATE TABLE match_setup_player (
    setup_id    UUID    NOT NULL
        REFERENCES match_setup (setup_id) ON DELETE CASCADE,

    user_id     UUID    NOT NULL
        REFERENCES app_user (user_id) ON DELETE RESTRICT,

    seat_number INTEGER NOT NULL,

    -- RESTRICT, not SET NULL: a snapshot with a missing deck is not
    -- a launchable match. Deleting a deck that a READY setup depends
    -- on should fail loudly; the service invalidates the setup
    -- first, which is the ordered way to do it.
    deck_id     UUID    NOT NULL
        REFERENCES imported_deck (deck_id) ON DELETE RESTRICT,

    team_id     INTEGER,

    PRIMARY KEY (setup_id, user_id),
    CONSTRAINT match_setup_player_seat_unique UNIQUE (setup_id, seat_number)
);
