-- PHASE_05 §5.50, §5.51, §5.77 — deleting a deck must not fail.
--
-- Two constraints that are each right alone and wrong together:
--
--   room_member.selected_deck_id   ON DELETE SET NULL
--   room_member_ready_needs_deck   CHECK (NOT ready OR deck IS NOT NULL)
--
-- Deleting a deck that a READY member had selected made the FK null
-- the column, which the CHECK then rejected, so the DELETE failed
-- outright. The owner's Deck Depot delete returned a 500 and the
-- deck could not be removed while anyone was ready with it.
--
-- Found by the §5.228 checklist audit, on "invalidate on deletion",
-- by trying it against the real schema rather than reading the DDL.
--
-- The fix is to clear readiness FIRST, so the FK's SET NULL lands on
-- a row the CHECK accepts. A trigger rather than application code
-- alone because the constraint is the database's and a rule enforced
-- only in one route is a rule the next route forgets (§4.45). The
-- application still clears selections before deleting, so that the
-- ROOM message reaches the players; this is the backstop that keeps
-- the schema consistent whichever path got there.

CREATE FUNCTION room_member_release_deck() RETURNS TRIGGER AS $$
BEGIN
    UPDATE room_member
       SET ready = FALSE
     WHERE selected_deck_id = OLD.deck_id
       AND ready;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION room_member_release_deck() IS
    'PHASE_05 §5.51: a deleted deck drops readiness before the FK nulls the selection.';

CREATE TRIGGER imported_deck_release_room_members
    BEFORE DELETE ON imported_deck
    FOR EACH ROW
    EXECUTE FUNCTION room_member_release_deck();
