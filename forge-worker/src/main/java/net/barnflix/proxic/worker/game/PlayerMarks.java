package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.ImageKeys;
import forge.StaticData;
import forge.game.card.Card;
import forge.game.mana.Mana;
import forge.game.player.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Spec 0086 (owner 2026-11-13, canvas gaps-players-1113) -- what the page
 * needs to draw the players' own marks, read from Forge's state, never from
 * a card's name or rules text:
 *
 *   manaFrom   each mana floating in a player's pool, by colour and the card
 *              that made it (Forge's own record, Mana#getSourceCard), in the
 *              pool's order: [{colour, from: "card:N", n}] -- so the page's
 *              balls fly from the land or spell that made each one
 *              (Amendment 1). A mana with no source card has no `from`.
 *   designation  a stack entry's trigger that is the monarch's or the
 *              initiative's own (the effect card Forge keeps for each in its
 *              command zone, Player#createMonarchEffect and
 *              #createInitiativeEffect), so it rises from the crown or the
 *              initiative token (Amendment 1).
 *   emblem     an emblem in a command zone with the card that made it
 *              (Forge's Card#getEffectSource: Chandra, Torch of Defiance for
 *              her emblem), so its tile wears its planeswalker's picture.
 *
 * All public: a mana pool, the command zone and the stack are on the table.
 * Every id is an id only -- HiddenIds.strip removes it, per seat, when that
 * card is in a zone the seat cannot see (HID-001).
 */
final class PlayerMarks {

    private PlayerMarks() {
    }

    private static final String[] LETTERS = {"W", "U", "B", "R", "G", "C"};

    /** A mana's colour letter, as the pool's own (ViewerSnapshot#manaPool). */
    static String letter(byte colour) {
        byte[] types = forge.card.mana.ManaAtom.MANATYPES;
        for (int i = 0; i < types.length; i++) {
            if (types[i] == colour) {
                return LETTERS[i];
            }
        }
        return "C";
    }

    /** One run of the pool: [n] mana of [colour] made by [from] ("card:N", or null). */
    record Run(String colour, String from, int n) {}

    /**
     * The pool as runs of the same colour and source, in the pool's order:
     * three black from Dark Ritual are one run of 3. Pure, for the test.
     */
    static List<Run> runs(Iterable<String[]> mana) {
        List<Run> out = new ArrayList<>();
        for (String[] each : mana) {
            String colour = each[0];
            String from = each[1];
            int at = -1;
            for (int i = 0; i < out.size(); i++) {
                Run r = out.get(i);
                if (r.colour().equals(colour) && java.util.Objects.equals(r.from(), from)) {
                    at = i;
                    break;
                }
            }
            if (at >= 0) {
                Run r = out.get(at);
                out.set(at, new Run(colour, from, r.n() + 1));
            } else {
                out.add(new Run(colour, from, 1));
            }
        }
        return out;
    }

    /** [player]'s floating mana by colour and source, or null when the pool is empty. */
    static JsonArray manaFrom(Player player) {
        forge.game.mana.ManaPool pool = player.getManaPool();
        if (pool == null || pool.totalMana() == 0) {
            return null;
        }
        List<String[]> mana = new ArrayList<>();
        for (Mana each : pool) {
            Card source = each.getSourceCard();
            mana.add(new String[] {letter(each.getColor()), source == null ? null : "card:" + source.getId()});
        }
        JsonArray out = new JsonArray();
        for (Run r : runs(mana)) {
            JsonObject entry = new JsonObject();
            entry.addProperty("colour", r.colour());
            if (r.from() != null) {
                entry.addProperty("from", r.from());
            }
            entry.addProperty("n", r.n());
            out.add(entry);
        }
        return out;
    }

    /**
     * "monarch" or "initiative" when [source] is the effect card Forge made
     * for that designation, else null. Forge keeps no public getter for
     * those cards; it gives each the image key of its designation
     * (ImageKeys.MONARCH_IMAGE / INITIATIVE_IMAGE, through
     * StaticData#getOtherImageKey with the card's own set code), and that is
     * asked here the same way -- a Forge constant, not a name.
     */
    static String designation(Card source) {
        if (source == null || !source.isImmutable() || source.getImageKey() == null) {
            return null;
        }
        String key = source.getImageKey();
        if (key.equals(otherKey(ImageKeys.MONARCH_IMAGE, source.getSetCode()))) {
            return "monarch";
        }
        if (key.equals(otherKey(ImageKeys.INITIATIVE_IMAGE, source.getSetCode()))) {
            return "initiative";
        }
        return null;
    }

    private static String otherKey(String name, String set) {
        try {
            return StaticData.instance().getOtherImageKey(name, set);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * The emblems in every command zone, with the planeswalker (or other
     * card) that made each: {id: the emblem, seat, from, name, owner,
     * printing?, known} -- the card's name, owner and printing so the server
     * puts its picture on the entry (MatchArt), as for any card on the
     * table. An emblem whose maker Forge does not know has no `from` and no
     * picture.
     */
    static JsonArray emblems(forge.game.Game game, Map<Player, Integer> seatOf) {
        JsonArray out = new JsonArray();
        for (Player player : game.getRegisteredPlayers()) {
            for (Card card : player.getCardsIn(forge.game.zone.ZoneType.Command)) {
                if (!card.isEmblem()) {
                    continue;
                }
                JsonObject entry = new JsonObject();
                entry.addProperty("id", "card:" + card.getId());
                entry.addProperty("seat", seatOf.getOrDefault(player, 0));
                Card from = card.getEffectSource();
                if (from != null && !from.isFaceDown() && from.getName() != null && !from.getName().isEmpty()) {
                    entry.addProperty("from", "card:" + from.getId());
                    entry.addProperty("name", from.getName());
                    entry.addProperty("owner", seatOf.getOrDefault(from.getOwner(), 0));
                    entry.addProperty("known", true);
                    forge.item.IPaperCard paper = from.getPaperCard();
                    if (paper != null && paper.getEdition() != null && !paper.getEdition().isEmpty()) {
                        entry.addProperty("printing", paper.getEdition() + "/" + paper.getCollectorNumber());
                    }
                } else {
                    entry.addProperty("known", false);
                }
                out.add(entry);
            }
        }
        return out;
    }
}
