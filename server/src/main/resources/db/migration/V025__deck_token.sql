-- Spec 0022 (owner 2026-10-27) — the token pictures a deck brought.
--
-- A decklist's "// Tokens" section lists token cards, sent for their
-- pictures only: never resolved by Forge, never counted, never in the copy
-- limit. In a game a token wears the picture of the same name, from its
-- controller's deck first, then the other player's. The name is kept as
-- written; the picture is filed by its front face, as every card's is.
CREATE TABLE deck_token (
    deck_id           UUID     NOT NULL
        REFERENCES imported_deck (deck_id) ON DELETE CASCADE,
    line_number       INTEGER  NOT NULL,
    quantity          INTEGER  NOT NULL,
    token_name        TEXT     NOT NULL,
    set_code          TEXT     NULL,
    collector_number  TEXT     NULL,
    source_text       TEXT     NOT NULL,
    art_sha256        CHAR(64) NULL
        REFERENCES art_asset (content_sha256) ON DELETE RESTRICT,
    PRIMARY KEY (deck_id, line_number)
);
