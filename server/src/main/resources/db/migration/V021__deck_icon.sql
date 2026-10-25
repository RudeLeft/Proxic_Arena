-- Spec 0012 (owner 2026-10-25) — deck icons.
--
-- colors: the deck's colours, every colour in its cards' colour identity
-- as Forge reports them at import, in WUBRG order ('' colourless). NULL
-- until Forge has been asked: decks imported before this are asked once,
-- in the background (DeckCategoryFill), as their card faces were.
ALTER TABLE imported_deck ADD COLUMN colors TEXT NULL
    CHECK (colors ~ '^W?U?B?R?G?$');

-- icon: one of the owner's 100 icons by name (DeckIcons), chosen by the
-- deck's owner; NULL shows the suggestion from the colours.
ALTER TABLE imported_deck ADD COLUMN icon TEXT NULL
    CHECK (icon ~ '^[a-z]+(-[a-z]+)*$' AND length(icon) <= 40);
