package net.barnflix.proxic.worker.game;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Spec 0057 -- the game's words as a player reads them.
 *
 * Forge writes some of its sentences from its own card-script shorthand:
 * an alternative cost said "exile two Card.Green cards from your hand",
 * because the cost's type is the script's {@code Card.Green}. Nothing in
 * that shorthand is for a player. Everything a player is sent passes
 * through {@link #humanise}, and the few sentences this spec writes are
 * built here, as plain functions, so they are tested on their own.
 *
 * Words only: nothing here decides anything about the game.
 */
public final class PlainWords {

    private PlainWords() {
    }

    /** The card-type words Forge's shorthand starts with. */
    private static final Set<String> TYPES = Set.of(
            "Card", "Creature", "Permanent", "Land", "Artifact", "Enchantment", "Planeswalker",
            "Instant", "Sorcery", "Spell", "Battle", "Player", "Opponent");

    private static final Map<String, String> COLOURS = Map.of(
            "White", "white", "Blue", "blue", "Black", "black", "Red", "red", "Green", "green",
            "Colorless", "colorless", "Multicolor", "multicolored", "MonoColor", "monocolored");

    /** Properties said before the noun ("other", "tapped", "token"). */
    private static final Map<String, String> BEFORE = Map.ofEntries(
            Map.entry("Other", "other"), Map.entry("token", "token"), Map.entry("Token", "token"),
            Map.entry("Basic", "basic"), Map.entry("Legendary", "legendary"), Map.entry("Snow", "snow"),
            Map.entry("Historic", "historic"), Map.entry("tapped", "tapped"), Map.entry("untapped", "untapped"),
            Map.entry("attacking", "attacking"), Map.entry("blocking", "blocking"),
            Map.entry("Attacking", "attacking"), Map.entry("Blocking", "blocking"));

    /** Properties said after it ("you control"). */
    private static final Map<String, String> AFTER = Map.of(
            "YouCtrl", "you control", "YouOwn", "you own", "OppCtrl", "an opponent controls",
            "OppOwn", "an opponent owns", "YouDontCtrl", "you don't control");

    /**
     * "Card.Green cards", "Creature.Elf+YouCtrl", "Permanent.nonLand": a type
     * word, a dot, its properties joined by "+", and perhaps the noun Forge
     * put after it ("cards").
     */
    private static final Pattern SHORTHAND = Pattern.compile(
            "\\b([A-Z][A-Za-z]*)\\.([A-Za-z][A-Za-z0-9+]*)"
                    + "(?:\\s+(cards?|creatures?|permanents?|lands?|spells?|artifacts?|enchantments?))?\\b");

    private static final Pattern COMPARE = Pattern.compile("^(cmc|power|toughness)(LE|LT|GE|GT|EQ)(\\d+)$");

    /** Spec 0057, item 1 -- Forge's type shorthand said in words; anything else unchanged. */
    public static String humanise(String text) {
        if (text == null || text.indexOf('.') < 0) {
            return text;
        }
        Matcher m = SHORTHAND.matcher(text);
        StringBuilder out = new StringBuilder();
        boolean changed = false;
        while (m.find()) {
            String said = say(m.group(1), m.group(2), m.group(3));
            if (said == null) {
                m.appendReplacement(out, Matcher.quoteReplacement(m.group()));
                continue;
            }
            changed = true;
            m.appendReplacement(out, Matcher.quoteReplacement(said));
        }
        if (!changed) {
            return text;
        }
        m.appendTail(out);
        return out.toString();
    }

    /** One piece of shorthand, or null when it is not shorthand at all. */
    private static String say(String type, String properties, String noun) {
        List<String> before = new ArrayList<>();
        List<String> after = new ArrayList<>();
        boolean known = TYPES.contains(type);
        boolean anyKnown = false;
        for (String p : properties.split("\\+")) {
            if (p.isEmpty()) {
                continue;
            }
            Matcher compare = COMPARE.matcher(p);
            if (COLOURS.containsKey(p)) {
                before.add(COLOURS.get(p));
                anyKnown = true;
            } else if (BEFORE.containsKey(p)) {
                before.add(0, BEFORE.get(p));
                anyKnown = true;
            } else if (AFTER.containsKey(p)) {
                after.add(AFTER.get(p));
                anyKnown = true;
            } else if (p.startsWith("non") && p.length() > 3) {
                before.add("non" + p.substring(3).toLowerCase(Locale.ROOT));
                anyKnown = true;
            } else if (p.startsWith("with") && p.length() > 4) {
                after.add("with " + spaced(p.substring(4)));
                anyKnown = true;
            } else if (compare.matches()) {
                String what = "cmc".equals(compare.group(1)) ? "mana value" : compare.group(1);
                String how = switch (compare.group(2)) {
                    case "LE" -> " or less";
                    case "LT" -> " less than";
                    case "GE" -> " or greater";
                    case "GT" -> " greater than";
                    default -> "";
                };
                after.add(how.startsWith(" or")
                        ? "with " + what + " " + compare.group(3) + how
                        : "with " + what + (how.isEmpty() ? " " : how + " ") + compare.group(3));
                anyKnown = true;
            } else if (Character.isUpperCase(p.charAt(0))) {
                // A subtype: "Creature.Elf" is an Elf creature.
                before.add(p);
            } else {
                before.add(spaced(p));
            }
        }
        if (!known && !anyKnown) {
            return null;
        }
        String base = noun != null ? noun
                : known ? type.toLowerCase(Locale.ROOT) : type;
        StringBuilder said = new StringBuilder();
        for (String word : before) {
            said.append(word).append(' ');
        }
        said.append(base);
        for (String word : after) {
            said.append(' ').append(word);
        }
        return said.toString();
    }

    /** "FirstStrike" -> "first strike". */
    private static String spaced(String camel) {
        return camel.replaceAll("([a-z])([A-Z])", "$1 $2").toLowerCase(Locale.ROOT);
    }

    /** First letter up. */
    static String capital(String text) {
        return text == null || text.isEmpty() ? "" : Character.toUpperCase(text.charAt(0)) + text.substring(1);
    }

    /** First letter down, unless the sentence begins with a name ("Boseiju deals..."). */
    static String lower(String text) {
        if (text == null || text.isEmpty()) {
            return "";
        }
        int space = text.indexOf(' ');
        String first = (space < 0 ? text : text.substring(0, space)).replaceAll("[^A-Za-z]", "");
        return LOWERABLE.contains(first)
                ? Character.toLowerCase(text.charAt(0)) + text.substring(1)
                : text;
    }

    /** Words that begin an effect and read on in lower case after "and". */
    private static final Set<String> LOWERABLE = Set.of(
            "Draw", "Search", "Destroy", "Exile", "Return", "Put", "Create", "Add", "Look", "Scry", "Surveil",
            "Target", "Each", "Up", "Any", "You", "Choose", "Counter", "Tap", "Untap", "Gain", "Lose", "Deal",
            "Sacrifice", "Discard", "Reveal", "Mill", "Shuffle", "Copy", "Prevent", "Regenerate", "Investigate",
            "Proliferate", "Manifest", "Amass", "Populate", "Venture", "Explore", "Learn", "Connive", "All",
            "Another", "Two", "Three", "Pay", "Cast", "Play", "Double", "Remove");

    /**
     * Spec 0057, item 1 -- an alternative cost, said as the card's reminder
     * says it: "Exile two green cards from your hand instead of paying
     * {5}{G}{G}". {@code parts} are the cost's own parts in Forge's words
     * (a mana part as its symbols), {@code printed} the card's mana cost.
     */
    static String insteadOf(List<String> parts, String printed) {
        List<String> said = new ArrayList<>();
        for (String part : parts) {
            if (part == null || part.isBlank()) {
                continue;
            }
            String p = humanise(part.trim());
            said.add(p.startsWith("{") ? "pay " + p : p);
        }
        if (said.isEmpty()) {
            return printed == null || printed.isBlank() ? "Cast it without paying its mana cost"
                    : "Cast it without paying " + printed;
        }
        StringBuilder line = new StringBuilder(capital(said.get(0)));
        for (int i = 1; i < said.size(); i++) {
            line.append(i == said.size() - 1 ? " and " : ", ").append(uncapital(said.get(i)));
        }
        if (printed != null && !printed.isBlank()) {
            line.append(" instead of paying ").append(printed);
        } else {
            line.append(" instead of paying its mana cost");
        }
        return line.toString();
    }

    private static String uncapital(String text) {
        return text.isEmpty() ? text : Character.toLowerCase(text.charAt(0)) + text.substring(1);
    }

    /**
     * Spec 0057, item 3 -- the button for a cost the player chooses to pay,
     * from the question the worker itself wrote ("Sacrifice Elvish
     * Eulogist?" -> "Sacrifice"; "Pay 2 life? You have 20." -> "Pay 2 life").
     * The worker owns these questions, so reading them is not the page
     * parsing a prompt (PROTO-006).
     */
    static String costAct(String question) {
        String q = question == null ? "" : question.trim();
        Matcher pay = Pattern.compile("^Pay (\\d+|X) (life|energy)\\b").matcher(q);
        if (pay.find()) {
            return "Pay " + pay.group(1) + " " + pay.group(2);
        }
        Matcher damage = Pattern.compile("^Have .+ deal (\\d+|X) damage to you\\?").matcher(q);
        if (damage.find()) {
            return "Take " + damage.group(1) + " damage";
        }
        int space = q.indexOf(' ');
        String first = (space < 0 ? q : q.substring(0, space)).replace("?", "");
        return ACTS.contains(first) ? first : "Pay";
    }

    private static final Set<String> ACTS = Set.of(
            "Sacrifice", "Discard", "Exile", "Tap", "Untap", "Put", "Remove", "Return", "Exert", "Mill", "Flip",
            "Roll", "Unattach", "Reveal", "Forage");

    /**
     * Spec 0057, item 3 -- what an ability does, from Forge's description of
     * it: "Sacrifice CARDNAME: You gain 1 life for each Elf card in your
     * graveyard." -> "You gain 1 life for each Elf card in your graveyard."
     * A keyword's bracketed reminder ("({R}, Discard this card: Draw a
     * card.)") gives what follows its colon.
     */
    static String effectWords(String description, String cardName) {
        if (description == null) {
            return "";
        }
        String d = description.trim();
        if (cardName != null) {
            d = d.replace("CARDNAME", cardName).replace("NICKNAME", cardName);
        }
        if (d.startsWith("(") && d.endsWith(")")) {
            d = d.substring(1, d.length() - 1).trim();
        }
        int colon = d.indexOf(": ");
        // Only a cost before the colon: "{R}, Discard this card: ...".
        if (colon > 0 && colon < 80 && !d.substring(0, colon).contains(".")) {
            d = d.substring(colon + 2).trim();
        }
        return humanise(capital(d));
    }

    /**
     * Spec 0057, item 5 -- what discarding a card for its cycling, landcycling
     * or channel ability means, and what is lost: "Discard Forgotten Cave and
     * draw a card. You won't have it as a land."
     */
    static String discardLine(String cardName, String effect, boolean land) {
        String does = effect == null ? "" : effect.trim();
        String lost = land ? "You won't have it as a land." : "You won't cast it.";
        if (does.isEmpty()) {
            return "Discard " + cardName + ". " + lost;
        }
        if (!does.endsWith(".")) {
            does = does + ".";
        }
        String lowered = lower(does);
        String line = lowered.equals(does)
                ? "Discard " + cardName + ". Then: " + does
                : "Discard " + cardName + " and " + lowered;
        return line + " " + lost;
    }

    private static final Pattern WHERE_X = Pattern.compile(",? where X is the number of ([^.]+?)\\s*(\\.|$)");
    private static final Pattern BARE_X = Pattern.compile("(?<![{\\w])X(?![}\\w])");

    /**
     * Spec 0058, item 3 -- an X the game has counted, filled in: "deal X
     * damage to target creature, where X is the number of Goblins on the
     * battlefield." with 3 becomes "deal 3 damage to target creature (3
     * Goblins on the battlefield)." -- or, {@code brief}, "(3 Goblins)".
     * Text without "where X is the number of ..." comes back unchanged:
     * then nothing says what was counted.
     */
    static String countedX(String text, int x, boolean brief) {
        if (text == null) {
            return null;
        }
        Matcher m = WHERE_X.matcher(text);
        if (!m.find()) {
            return text;
        }
        String what = m.group(1).trim();
        if (brief) {
            what = what.replaceFirst("\\s+on the battlefield$", "");
        }
        if (x == 1) {
            // "1 Goblin", "1 card in your hand": the first word, singular.
            what = what.replaceFirst("^(\\w+?)s\\b", "$1");
        }
        String before = BARE_X.matcher(text.substring(0, m.start())).replaceAll(String.valueOf(x));
        return before + " (" + x + " " + what + ")" + m.group(2) + text.substring(m.end());
    }

    /**
     * Spec 0058, item 3 -- an effect after "then", as the discard line says
     * it: "Gempalm Incinerator may deal 3 damage to target creature (3
     * Goblins)." becomes "deal 3 damage to a creature (3 Goblins)".
     */
    static String thenWords(String effect, String cardName) {
        String t = effect == null ? "" : effect.trim();
        if (cardName != null) {
            t = t.replaceFirst("^" + Pattern.quote(cardName) + "\\s+(may\\s+)?", "");
        }
        t = t.replaceFirst("^(you may have it|you may|it)\\s+", "");
        t = t.replaceAll("(?<!any )\\btarget (?=[aeiouAEIOU])", "an ").replaceAll("(?<!any )\\btarget ", "a ");
        if (t.endsWith(".")) {
            t = t.substring(0, t.length() - 1);
        }
        return lower(t);
    }

    /**
     * Spec 0057, item 5 -- the title of the option that discards the card:
     * "Cycle it instead", "Swampcycle it instead", "Channel instead".
     */
    static String discardTitle(String way, String keyword) {
        if ("cycling".equals(way)) {
            return "Cycle it instead";
        }
        if ("landcycling".equals(way)) {
            String k = keyword == null ? "" : keyword.trim();
            if (k.toLowerCase(Locale.ROOT).endsWith("cycling")) {
                return capital(k.substring(0, k.length() - "cycling".length()) + "cycle it instead");
            }
            return "Cycle it for a card instead";
        }
        String k = keyword == null ? "" : keyword.replaceAll("\\s*[—–-]\\s*$", "").trim();
        return (k.isEmpty() ? "Use this" : k) + " instead";
    }

    /**
     * Spec 0057, item 7 -- a reveal paid as a cost, for the other player:
     * "Pat revealed Llanowar Elves from their hand".
     */
    static String revealSaid(String who, List<String> names, String zone) {
        String cards = names.size() <= 1 ? (names.isEmpty() ? "a card" : names.get(0))
                : String.join(", ", names.subList(0, names.size() - 1)) + " and " + names.get(names.size() - 1);
        return who + " revealed " + cards + " from their " + zone;
    }

    /**
     * Spec 0061, item 5 -- what the mana paid for an ability is for, after
     * "Pay {R}": {"to cycle Forgotten Cave", "Then Forgotten Cave goes to
     * your graveyard and you draw a card."}. `way`: "cycling" (cycling and
     * landcycling), "equip", or anything else; `effect` the ability's words
     * (effectWords). An ability whose words read on after "to" ("Draw a
     * card.") is "to draw a card with Jayemdae Tome"; any other is "for
     * Prodigal Sorcerer's ability", its words the line under it. Index 1 is
     * null when there is no line.
     */
    static String[] payFor(String way, String card, String effect) {
        String does = effect == null ? "" : effect.trim();
        if ("cycling".equals(way)) {
            String then = "Then " + card + " goes to your graveyard";
            if (!does.isEmpty()) {
                String lowered = lower(does);
                then += lowered.equals(does) ? ". Then: " + does : " and you " + lowered;
                if (!then.endsWith(".")) {
                    then += ".";
                }
            } else {
                then += ".";
            }
            return new String[] {"to cycle " + card, then};
        }
        if ("equip".equals(way)) {
            return new String[] {"to equip a creature with " + card, null};
        }
        int stop = does.indexOf(". ");
        String first = stop < 0 ? does : does.substring(0, stop + 1);
        String bare = first.endsWith(".") ? first.substring(0, first.length() - 1) : first;
        String lowered = lower(bare);
        if (stop < 0 && !bare.isEmpty() && !lowered.equals(bare) && bare.length() <= 60) {
            return new String[] {"to " + lowered + " with " + card, null};
        }
        return new String[] {"for " + card + "'s ability", does.isEmpty() ? null : does};
    }

    /**
     * Spec 0057, item 7 -- why: "to cast Wren's Run Vanquisher for {1}{G}
     * instead of {4}{G}", or, with no cheaper price to name, "to pay for
     * Wren's Run Vanquisher".
     */
    static String revealWhy(String card, boolean spell, String paid, String instead) {
        if (spell && paid != null && instead != null && !paid.isBlank() && !instead.isBlank()
                && !paid.equals(instead)) {
            return "to cast " + card + " for " + paid + " instead of " + instead;
        }
        return "to pay for " + card;
    }
}
