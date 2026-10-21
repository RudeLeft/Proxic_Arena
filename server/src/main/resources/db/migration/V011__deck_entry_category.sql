-- PHASE_07 §7.65, Amendment 10 — the Deck Depot bands an open deck
-- into Lands, Creatures and Spells, the way a player reads a list.
--
-- Forge decides which is which (ARCH-001): the worker answers it with
-- each resolved card at import. Decks imported before this column
-- existed hold NULL until the server's one-time fill asks Forge about
-- them (DeckCategoryFill); the page shows an unsorted band meanwhile,
-- never a guess.
ALTER TABLE deck_entry ADD COLUMN card_category TEXT NULL
    CONSTRAINT deck_entry_card_category_check
    CHECK (card_category IN ('LAND', 'CREATURE', 'SPELL'));
