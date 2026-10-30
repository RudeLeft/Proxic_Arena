-- Spec 0039 (owner 2026-10-30) — a player's report of a problem, or an
-- idea. The answers and what the page knew are kept as sent; the files
-- that go with it (the picture, the page's log, copies of the game record,
-- the server's lines and the engine's errors) live in a folder named by
-- the number, under the data root's bug-reports. Kept until an
-- administrator deletes it.
CREATE TABLE bug_report (
    number      SERIAL      PRIMARY KEY,
    user_id     UUID        NOT NULL
        REFERENCES app_user (user_id) ON DELETE CASCADE,
    kind        TEXT        NOT NULL CHECK (kind IN ('PROBLEM', 'IDEA')),
    status      TEXT        NOT NULL DEFAULT 'NEW'
        CHECK (status IN ('NEW', 'SEEN', 'FIXED', 'WONT_FIX', 'PLANNED')),
    -- The first line, for the list: "What happened?" or the idea's title.
    summary     TEXT        NOT NULL,
    answers     JSONB       NOT NULL,
    context     JSONB       NOT NULL,
    match_id    UUID,
    -- What came with it, for the list: "record,log,picture".
    attached    TEXT        NOT NULL DEFAULT '',
    admin_note  TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX bug_report_created ON bug_report (created_at DESC);
