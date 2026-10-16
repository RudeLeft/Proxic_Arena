-- V002 — Deck Package Import (PHASE_02 §2.68, §2.71, §2.113).
--
-- Only what an imported deck needs. §2.68 explicitly forbids user
-- ownership, sharing, ratings, folders, tags and match history here;
-- those belong to Phases 3, 4 and 6, and a column added early is a
-- column every later migration carries and nobody dares drop.

-- One imported deck.
--
-- The id is Arena-owned and opaque (§2.66): the display name is NOT
-- identity, because two different decks may share a name and a deck
-- may be renamed.
CREATE TABLE imported_deck (
    deck_id                 UUID PRIMARY KEY,
    display_name            TEXT        NOT NULL,
    imported_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- §2.71 diagnostics. The source filename is what the uploader
    -- called it and is NOT trusted as a path — it is a label.
    source_filename         TEXT        NOT NULL,

    -- §2.72 — SHA-256 of the uploaded package.
    --
    -- UNIQUE enforces the owner's decision (D3): an identical
    -- package is refused and the existing deck is named, rather
    -- than silently storing a second copy of ~12 MB of artwork.
    -- Enforced here rather than only in code, because two uploads
    -- racing would both pass a check-then-insert.
    package_sha256          CHAR(64)    NOT NULL UNIQUE,

    total_cards             INTEGER     NOT NULL,
    distinct_cards          INTEGER     NOT NULL,

    -- The shape of the manifest written beside the deck's files, so
    -- a future format change can be detected rather than guessed.
    import_schema_version   INTEGER     NOT NULL,

    CONSTRAINT imported_deck_total_cards_positive CHECK (total_cards > 0),
    CONSTRAINT imported_deck_distinct_positive CHECK (distinct_cards > 0)
);

-- Art, stored ONCE and shared (§2.135).
--
-- Keyed by content hash, not by card name: every deck containing
-- Lightning Bolt would otherwise store its own copy, and at five
-- players with several decks each that is tens of gigabytes of
-- identical files.
--
-- De-duplication is storage only. Access stays per match and per
-- viewer (Phase 6 §6.122) — a player must never be able to
-- enumerate art they have no right to see, and nothing here grants
-- that.
CREATE TABLE art_asset (
    content_sha256  CHAR(64) PRIMARY KEY,
    byte_size       BIGINT      NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT art_asset_size_positive CHECK (byte_size > 0)
);

-- One line of the decklist.
--
-- The deck's own ordering is preserved through line_number, because
-- a decklist is something the player wrote and reordering it is a
-- visible change they did not ask for.
CREATE TABLE deck_entry (
    entry_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    deck_id             UUID        NOT NULL
        REFERENCES imported_deck (deck_id) ON DELETE CASCADE,

    line_number         INTEGER     NOT NULL,
    quantity            INTEGER     NOT NULL,

    -- As written in the package, including both faces of a
    -- double-faced card ("A // B"). Forge knows only the front, but
    -- what the player's file said is what we keep (§2.42).
    card_name           TEXT        NOT NULL,
    set_code            TEXT,
    collector_number    TEXT,
    source_text         TEXT        NOT NULL,

    -- What Forge said (§2.46). Stored because an import can succeed
    -- while a later Forge pin changes the answer, and "it imported
    -- fine last year" needs evidence.
    resolution_status   TEXT        NOT NULL,
    resolved_set        TEXT,
    resolved_number     TEXT,

    -- The art for this entry, if the package carried any. NULL is
    -- legitimate and common: the exporter omits art it could not
    -- fetch and still succeeds (inspection finding 2).
    art_sha256          CHAR(64)
        REFERENCES art_asset (content_sha256) ON DELETE RESTRICT,

    CONSTRAINT deck_entry_quantity_positive CHECK (quantity > 0),
    CONSTRAINT deck_entry_unique_line UNIQUE (deck_id, line_number)
);

CREATE INDEX deck_entry_deck_idx ON deck_entry (deck_id);
CREATE INDEX deck_entry_art_idx ON deck_entry (art_sha256);
