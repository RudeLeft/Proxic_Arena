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

    /**
     * Spec 0108, item 12 -- a stack entry's words without the notes Forge
     * appends in its own code text: " (Targeting: [[Butcher Ghoul (65)]])"
     * (Forge's {@code WrappedAbility.getStackDescription}, a Java list of
     * lists), the plain " (Targeting: Pat)" some effects add, and a
     * trigger's remembered objects printed as a raw list (" ([Goblin
     * Token])"). The arrow and the stack's own marks carry those facts.
     * Anything else is left as it is; then trimmed.
     */
    public static String stackText(String text) {
        if (text == null || text.indexOf('(') < 0) {
            return text;
        }
        StringBuilder out = new StringBuilder(text);
        int at = 0;
        while ((at = out.indexOf("(", at)) >= 0) {
            boolean targeting = out.indexOf("(Targeting:", at) == at;
            boolean remembered = at + 1 < out.length() && out.charAt(at + 1) == '[';
            int close = targeting || remembered ? closing(out, at) : -1;
            if (close < 0 || (remembered && out.charAt(close - 1) != ']')) {
                at++;
                continue;
            }
            int from = at;
            while (from > 0 && Character.isWhitespace(out.charAt(from - 1))) {
                from--;
            }
            out.delete(from, close + 1);
            at = from;
        }
        return out.toString().trim();
    }

    private static final Pattern SOURCE_ARROW = Pattern.compile("^[^\\n]*?\\(\\d+\\)\\s*->\\s*");
    private static final Pattern BARE_CREATURE = Pattern.compile(
            "^((?:Legendary |Snow |Artifact |Enchantment |Kindred |Tribal )*Creature)(?: [A-Z][A-Za-z' ]*?)?"
                    + " (\\d+|\\*) / (\\d+|\\*)$");

    /**
     * Spec 0113 (W1-249) -- a stack entry's words, after {@link #stackText}:
     * without Forge's "Name (115)->" source mark, without the
     * card's own name repeated before " - ", and a creature spell's "Creature
     * 2 / 1" as "2/1 creature". [name] the card's name, or null.
     */
    private static final Pattern ROOM = Pattern.compile("(.+?) [—-] (.+?) \\[Room: \\1\\]");

    public static String stackDescription(String text, String name) {
        if (text == null) {
            return null;
        }
        String s = SOURCE_ARROW.matcher(text).replaceFirst("").trim();
        if (s.isEmpty()) {
            return text;
        }
        if (name != null && !name.isBlank() && s.startsWith(name)) {
            // "Arc Lightning (101) - Arc Lightning deals ...": the card's own mark, then its words.
            String rest = s.substring(name.length()).replaceFirst("^ \\(\\d+\\)", "");
            if (rest.startsWith(" - ")) {
                s = rest.substring(3).trim();
            }
        }
        // A dungeon room's trigger: "Lost Well — Scry 2. [Room: Lost Well]" reads
        // "Lost Well: Scry 2." (as the room labels, W1-197), without Forge's label.
        Matcher room = ROOM.matcher(s);
        if (room.matches()) {
            s = room.group(1) + ": " + room.group(2);
        }
        Matcher creature = BARE_CREATURE.matcher(s);
        if (creature.matches()) {
            return creature.group(2) + "/" + creature.group(3) + " " + creature.group(1).toLowerCase(Locale.ROOT);
        }
        return s;
    }

    /** The index of the bracket closing the "(" at [open], counting nested ones; -1 if none. */
    private static int closing(CharSequence text, int open) {
        int depth = 0;
        for (int i = open; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '(') {
                depth++;
            } else if (c == ')' && --depth == 0) {
                return i;
            }
        }
        return -1;
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
                // Spec 0113 (W1-244) -- "Then {effect}", no colon.
                ? "Discard " + cardName + ". Then " + does
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
        // Spec 0113 (W1-162) -- a full stop, as the report sentences have.
        return who + " revealed " + cards + " from their " + zone + ".";
    }

    /** Forge's English (forge-gui en-US.properties, never edited: VEND-001) as it reaches a question, and ours. */
    private static final Pattern COIN_CALL = Pattern.compile("^(?:(.+?) - )?Call coin flip$");
    private static final Pattern TO_HAND = Pattern.compile("^Choose card\\(s\\) to put into hand\\s*(.*)$", Pattern.DOTALL);
    private static final Pattern CHOOSE_COUNT = Pattern.compile(
            "^(Choose (?:up to |exactly |at least )?)(\\d+) (cards?|creatures?|permanents?|targets?|players?)\\b");
    /** "Choose 1 untapped Island ...", a count before any other noun. */
    private static final Pattern CHOOSE_ONE_NUMBER = Pattern.compile("^Choose (\\d+) (?!of\\b)");
    private static final Pattern COUNTER_TYPE_TO = Pattern.compile("^Select counter type to add to (.+?)\\s*$");
    private static final Pattern DIE_NUDGE = Pattern.compile("^Choose a card to modify die result (\\d+)$");
    private static final Pattern DIE_SWAP =
            Pattern.compile("^Choose a card to swap its Power or Toughness with die result (\\d+)$");
    private static final Pattern CHANGE_TARGETS = Pattern.compile("^Do you want to change targets of (.+?)\\??$");
    private static final Pattern SPEND_COUNTERS =
            Pattern.compile("^Do you want to spend (\\d+) ([A-Za-z]+) counters?\\??$");
    private static final Pattern CANCEL_SEARCH =
            Pattern.compile("^Cancel Search\\? Up to (\\d+) more card\\(s\\) can be selected\\.?$");
    private static final Pattern BECOMES = Pattern.compile("^(.+?) has base power and toughness (\\d+/\\d+)\\s+and "
            + "becomes an? ([a-z]+) creature ([A-Z][A-Za-z]*)\\s+and\\s+gains ([a-z ]+?) until end of turn\\.?$");

    /**
     * Spec 0113 (W1-309..W1-313, W1-343..W1-348, W1-362..W1-365) -- the
     * questions Forge words itself (its English file's templates, read as
     * they arrive: "Goblin Bangchuckers - Call coin flip", "Select Mana to
     * Produce", "Do you want to change targets of Lightning Bolt?"), in our
     * words; anything else as it is. Run before the cleanup ({@link #tidy}).
     */
    public static String forgeWords(String text) {
        if (text == null || text.isBlank()) {
            return text;
        }
        String t = brokenEnglish(text.replaceAll("[ \\t]+", " ").trim());
        Matcher m;
        if ((m = COIN_CALL.matcher(t)).matches()) {
            return (m.group(1) == null ? "Call" : m.group(1) + ": call") + " the coin flip.";
        }
        if ((m = TO_HAND.matcher(t)).matches()) {
            String rest = m.group(1).trim();
            return "Choose a card to put into your hand." + (rest.isEmpty() ? "" : " " + rest);
        }
        switch (t) {
            case "Select Mana to Produce" -> {
                return "Choose which mana to make";
            }
            case "Choose card to meld with" -> {
                return "Choose a card to meld with.";
            }
            case "Choose which creature to be the top" -> {
                return "Which creature goes on top?";
            }
            case "Choose a card", "Choose a source", "Choose a creature", "Choose a player" -> {
                return t + ".";
            }
            default -> {
                // Below.
            }
        }
        // Spec 0113 (W1-252, W1-257) -- Forge's "Select a card from Bob's hand": our verb is "Choose".
        if (t.matches("^Select (?:a|an|one|two|three|up to|any|\\d+|target|cards?|creatures?|permanents?)\\b.*")
                && !t.startsWith("Select counter type")) {
            t = "Choose" + t.substring("Select".length());
        }
        // Spec 0113 -- Forge's "(or: Sacrifices X)" and "Creature 1 / 2" (its debug form of a creature spell).
        t = t.replace("(or: Sacrifices ", "(or sacrifice ")
                .replaceAll("\\bCreature (\\d+) / (\\d+)\\b", "$1/$2 creature");
        if (!CHOOSE_COUNT.matcher(t).find() && (m = CHOOSE_ONE_NUMBER.matcher(t)).find()
                && Integer.parseInt(m.group(1)) <= 10) {
            t = "Choose " + number(Integer.parseInt(m.group(1))) + " " + t.substring(m.end());
        }
        // Spec 0113 (W1-314) -- Forge's "Choose up to 2 cards from your library": a count in words.
        if ((m = CHOOSE_COUNT.matcher(t)).find()) {
            int n = Integer.parseInt(m.group(2));
            String noun = m.group(3);
            if (n == 1 && noun.endsWith("s")) {
                noun = noun.substring(0, noun.length() - 1);
            } else if (n != 1 && !noun.endsWith("s")) {
                noun = noun + "s";
            }
            t = m.group(1) + number(n) + " " + noun + t.substring(m.end());
        }
        if ((m = COUNTER_TYPE_TO.matcher(t)).matches()) {
            return "Choose a kind of counter to put on " + m.group(1) + ".";
        }
        if ((m = DIE_NUDGE.matcher(t)).matches()) {
            return "Choose a card to change the roll of " + m.group(1) + ".";
        }
        if ((m = DIE_SWAP.matcher(t)).matches()) {
            return "Choose a creature to swap its power or toughness with the roll of " + m.group(1) + ".";
        }
        if ((m = CHANGE_TARGETS.matcher(t)).matches()) {
            return "Change the target of " + m.group(1).trim() + "?";
        }
        if ((m = SPEND_COUNTERS.matcher(t)).matches()) {
            return "Spend " + number(Integer.parseInt(m.group(1))) + " " + m.group(2).toLowerCase(Locale.ROOT) + "?";
        }
        if ((m = CANCEL_SEARCH.matcher(t)).matches()) {
            int n = Integer.parseInt(m.group(1));
            return "Stop searching? You can still choose " + number(n) + " more " + (n == 1 ? "card" : "cards") + ".";
        }
        if ((m = BECOMES.matcher(t)).matches()) {
            return "Make " + m.group(1) + " a " + m.group(2) + " " + m.group(4) + " " + m.group(3) + " creature with "
                    + m.group(5) + " until end of turn?";
        }
        return t;
    }

    /**
     * Spec 0113 (W1-338..W1-342, W1-347) -- the English Forge's cost and mode
     * text gets wrong as it builds it ("five untapped Elfs", "creaturess", "a
     * this creature", "a other blue card", "a instant", "from stack"), put
     * right. The card's own name is never one of these.
     */
    static String brokenEnglish(String text) {
        if (text == null) {
            return null;
        }
        return text.replaceAll("\\bElfs\\b", "Elves").replaceAll("\\belfs\\b", "elves")
                .replaceAll("\\b(creature|card|permanent|artifact|land|token|enchantment|spell)ss\\b", "$1s")
                .replaceAll("\\b([Aa]) this\\b", "this").replaceAll("\\b([Aa]) other\\b", "$1nother")
                .replaceAll("\\b([Aa]) (?=[aeiouAEIOU][a-z])(?!one\\b|uni|use|eu|ur)", "$1n ")
                .replaceAll("\\bspell from stack\\b", "spell from the stack");
    }

    /**
     * Spec 0113 (W1-224, W1-229, W1-230, W1-232, W1-234, W1-236, W1-241,
     * W1-243) -- [n] of a cost's kind ("creature", "Creature.Elf", "untapped
     * creature you control"): "a creature", "two creatures", "two untapped
     * creatures you control", "an Elf". The head noun takes the plural.
     */
    public static String counted(int n, String type) {
        String t = humanise(type == null ? "card" : type.trim());
        if (t.isEmpty()) {
            t = "card";
        }
        t = lowerType(t);
        if (n == 1) {
            return t.startsWith("a ") || t.startsWith("an ") ? t : withArticle(t);
        }
        Matcher tail = TYPE_TAIL.matcher(t);
        String head = tail.find() ? t.substring(0, tail.start()) : t;
        String rest = t.substring(head.length());
        int space = head.lastIndexOf(' ');
        String last = head.substring(space + 1);
        String many = last.endsWith("s") ? last : plural(last);
        return number(n) + " " + head.substring(0, space + 1) + many + rest;
    }

    /** Where a cost's kind runs on past its noun: "creature[ you control]", "card[ with flying]". */
    private static final Pattern TYPE_TAIL = Pattern.compile(
            " (?:you |with |without |that |from |in |of |named |other than |an opponent |your |each |not )");

    /** A cost's kind with its card-type words lowered ("Creature" -> "creature"), a creature type kept ("Elf"). */
    static String lowerType(String t) {
        StringBuilder out = new StringBuilder();
        for (String word : t.split(" ")) {
            if (out.length() > 0) {
                out.append(' ');
            }
            out.append(CARD_TYPE_WORDS.contains(word) ? word.toLowerCase(Locale.ROOT) : word);
        }
        return out.toString();
    }

    private static final Set<String> CARD_TYPE_WORDS = Set.of("Card", "Cards", "Creature", "Creatures", "Artifact",
            "Artifacts", "Enchantment", "Enchantments", "Land", "Lands", "Permanent", "Permanents", "Planeswalker",
            "Instant", "Sorcery", "Spell", "Battle", "Untapped", "Tapped", "Other", "Nonland", "Noncreature",
            "Token", "Tokens");

    /** Spec 0113 (W1-186, W1-223, W1-235, W1-256) -- a counter's name in a sentence: "charge", "+1/+1", "blood token". */
    public static String counterName(String forgeName) {
        if (forgeName == null) {
            return "";
        }
        return forgeName.replace('_', ' ').toLowerCase(Locale.ROOT).trim();
    }

    /** "two charge counters", "a +1/+1 counter": [n] counters of a kind ([kind] blank: any kind). */
    public static String counters(int n, String kind) {
        String k = counterName(kind);
        return some(n, k.isEmpty() ? "counter" : k + " counter");
    }

    /** Spec 0113 (W1-228, W1-229) -- a zone of the player's own, in a sentence: "your graveyard", "your hand". */
    public static String yourZone(String zone) {
        String z = zone == null ? "" : zone.toLowerCase(Locale.ROOT);
        return z.equals("exile") ? "exile" : "your " + z;
    }

    private static final Pattern REVEALING = Pattern.compile("^(.+?) - Revealing cards? from\\s+(.+?):?\\s*$");
    private static final Pattern PICKED = Pattern.compile("^(.+?) picked card\\(s\\) from\\s+(.+?):?\\s*$");
    private static final Pattern TRANSFORMED = Pattern.compile("^Transformed cards in\\s*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern LEAVES = Pattern.compile(
            "^(.+?) leaves (?:the )?(.+?)'s ([A-Za-z]+):\\s*(.+?)\\s*$");
    private static final Pattern SUSPENDED = Pattern.compile(
            "^(.+?) is suspended with (\\d+) time counters? in\\s*(.*?)\\s*$");

    /**
     * Spec 0113 (W1-161, W1-328..W1-330, W1-366, W1-367) -- the title of a
     * reveal (its tray and its play-log line), from Forge's message:
     * [message] Forge's words (null or blank: none), [addSuffix] Forge's "add
     * where" flag, [whose] "your" / "Alice's", [zone] our zone word
     * ("battlefield"). "Looking at Alice's hand", "Alice's transformed
     * cards", "A face-down card left Alice's battlefield for their
     * graveyard", "Ancestral Vision is suspended in Alice's exile with four
     * time counters", "Goblin Ringleader revealed cards from your library",
     * "Alice picked cards from Bob's library"; anything else: Forge's words
     * (and where), tidied.
     */
    static String revealTitle(String message, boolean addSuffix, String whose, String zone) {
        String where = whose + " " + zone;
        if (message == null || message.isBlank()) {
            return "Looking at " + where;
        }
        String m = message.replaceAll("\\s+", " ").trim();
        if (addSuffix && TRANSFORMED.matcher(m).matches()) {
            return capital(whose) + " transformed cards";
        }
        String full = addSuffix ? m + " " + where : m;
        Matcher revealing = REVEALING.matcher(full);
        if (revealing.matches()) {
            return revealing.group(1).trim() + " revealed cards from " + revealing.group(2).trim();
        }
        Matcher picked = PICKED.matcher(full);
        if (picked.matches()) {
            return picked.group(1).trim() + " picked cards from " + picked.group(2).trim();
        }
        Matcher leaves = LEAVES.matcher(full);
        if (leaves.matches()) {
            String card = leaves.group(1).trim();
            String owner = leaves.group(2).trim();
            String to = leaves.group(4).trim();
            if (to.startsWith(owner + "'s ")) {
                to = "their " + to.substring(owner.length() + 3);
            }
            return (card.toLowerCase(Locale.ROOT).startsWith("face-down") ? "A " + Character.toLowerCase(card.charAt(0)) + card.substring(1) : card) + " left "
                    + owner + "'s " + leaves.group(3).toLowerCase(Locale.ROOT) + " for " + to;
        }
        Matcher suspended = SUSPENDED.matcher(full);
        if (suspended.matches()) {
            int n = Integer.parseInt(suspended.group(2));
            String in = suspended.group(3).trim();
            return suspended.group(1).trim() + " is suspended" + (in.isEmpty() ? "" : " in " + in) + " with "
                    + count(n, "time counter");
        }
        return tidy(full.replace(" the " + whose + " ", " " + whose + " "));
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
                // Spec 0113 (W1-222) -- never "Then ... Then:".
                then = lowered.equals(does) ? card + " goes to your graveyard, then: " + does
                        : then + " and you " + lowered;
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
        // Spec 0113 (W1-334) -- "You control target player ..." is no verb to follow "to": "to use Mindslaver".
        if (lowered.startsWith("you ")) {
            return new String[] {"to use " + card, does.isEmpty() ? null : does};
        }
        if (stop < 0 && !bare.isEmpty() && !lowered.equals(bare) && bare.length() <= 60) {
            // Spec 0113 (W1-335) -- "to regenerate River Boa", never "... River Boa with River Boa".
            return new String[] {"to " + lowered + (lowered.contains(card) ? "" : " with " + card), null};
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

    // --- Spec 0113: the number-and-article helper, and the cleanup -------------------

    /**
     * Spec 0113 (owner's number rule) -- a count in a sentence: one to ten
     * as words (Forge's {@code Lang.getNumeral}), zero as "zero", bigger
     * counts and negative ones as digits. Printed game terms and game values
     * ("Scry 2", "deals 3 damage", "20 life") never come through here.
     */
    public static String number(int n) {
        return n >= 0 && n <= 10 ? forge.util.Lang.getNumeral(n) : String.valueOf(n);
    }

    /** {@link #number} with its first letter up, to begin a sentence ("Two cards"). */
    public static String capitalNumber(int n) {
        return capital(number(n));
    }

    /** "a" or "an" before [word], by its first letter (Forge's {@code Lang.startsWithVowel}). */
    public static String article(String word) {
        if (word == null || word.isBlank()) {
            return "a";
        }
        String w = word.trim();
        // "a one-shot", "a unicorn", "a +1/+1 counter": the sound, where the letter misleads.
        String lower = w.toLowerCase(Locale.ROOT);
        if (lower.startsWith("one") || lower.startsWith("uni") || lower.startsWith("use")
                || lower.startsWith("eu") || lower.startsWith("ur")) {
            return "a";
        }
        if (Character.isDigit(w.charAt(0))) {
            return w.startsWith("8") || w.startsWith("11") || w.startsWith("18") ? "an" : "a";
        }
        return forge.util.Lang.startsWithVowel(w) ? "an" : "a";
    }

    /** "an Island", "a Forest". */
    public static String withArticle(String word) {
        return article(word) + " " + word;
    }

    /** The plural of a noun (Forge's {@code Lang.getPlural}, with English's irregular ones). */
    public static String plural(String noun) {
        if (noun == null || noun.isEmpty()) {
            return noun;
        }
        for (Map.Entry<String, String> e : IRREGULAR.entrySet()) {
            if (noun.endsWith(e.getKey())) {
                return noun.substring(0, noun.length() - e.getKey().length()) + e.getValue();
            }
        }
        if (noun.endsWith("y") && noun.length() > 1 && "aeiou".indexOf(noun.charAt(noun.length() - 2)) < 0) {
            return noun.substring(0, noun.length() - 1) + "ies";
        }
        return forge.util.Lang.getPlural(noun);
    }

    private static final Map<String, String> IRREGULAR = Map.ofEntries(
            Map.entry("Elf", "Elves"), Map.entry("elf", "elves"),
            Map.entry("Wolf", "Wolves"), Map.entry("wolf", "wolves"),
            Map.entry("Dwarf", "Dwarves"), Map.entry("dwarf", "dwarves"),
            Map.entry("Mouse", "Mice"), Map.entry("mouse", "mice"),
            Map.entry("Ox", "Oxen"), Map.entry("Sheep", "Sheep"), Map.entry("Fish", "Fish"),
            Map.entry("Phoenix", "Phoenixes"), Map.entry("Djinn", "Djinn"),
            Map.entry("Octopus", "Octopuses"),
            Map.entry("Mana", "Mana"), Map.entry("mana", "mana"),
            Map.entry("energy", "energy"), Map.entry("experience", "experience"));

    /** "one card", "two cards", "12 cards", "zero cards": a count and its noun. */
    public static String count(int n, String noun) {
        return number(n) + " " + (n == 1 ? noun : plural(noun));
    }

    /** "a card", "an Island", "two cards", "12 cards": one is "a" / "an". */
    public static String some(int n, String noun) {
        return n == 1 ? withArticle(noun) : count(n, noun);
    }

    /** "A", "A and B", "A, B and C" ("" for none). */
    public static String and(List<String> parts) {
        if (parts == null || parts.isEmpty()) {
            return "";
        }
        if (parts.size() == 1) {
            return parts.get(0);
        }
        return String.join(", ", parts.subList(0, parts.size() - 1)) + " and " + parts.get(parts.size() - 1);
    }

    /** "A", "A or B", "A, B or C". */
    public static String or(List<String> parts) {
        if (parts == null || parts.isEmpty()) {
            return "";
        }
        if (parts.size() == 1) {
            return parts.get(0);
        }
        return String.join(", ", parts.subList(0, parts.size() - 1)) + " or " + parts.get(parts.size() - 1);
    }

    /**
     * A card number Forge appends to a card's name: " (68)", digits only, after
     * a word with a capital ("Grizzly Bears (68)"), so never a value ("power (5)").
     */
    private static final Pattern CARD_NUMBER = Pattern.compile("(\\b[A-Z][^\\s(),.:;]*) \\((\\d+)\\)");
    /** A word with Forge's "(s)" plural: "card(s)". */
    private static final Pattern MAYBE_PLURAL = Pattern.compile("([A-Za-z]+)\\(s\\)");
    /** A count that may stand before it, a word or two back: "1 more card(s)", "up to 2 card(s)". */
    private static final Pattern COUNT_BEFORE = Pattern.compile(
            "(?:^|(?<=\\W))(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)"
                    + "((?:\\s+(?:more|other|additional|different|untapped|tapped|target|[a-z]+))?)\\s+$",
            Pattern.CASE_INSENSITIVE);
    /** The card types a printed type line starts with: "Creature - Goblin" keeps its dash. */
    private static final Pattern TYPE_LINE_LEFT = Pattern.compile(
            "(?:^|\\b)(?:Legendary |Basic |Snow |World |Tribal |Kindred |Token )*"
                    + "(?:Artifact|Battle|Creature|Enchantment|Instant|Land|Planeswalker|Sorcery|Dungeon"
                    + "|Kindred|Tribal|Conspiracy|Plane|Phenomenon|Scheme|Vanguard)"
                    + "(?: (?:Artifact|Creature|Enchantment|Land))*$");

    /**
     * Spec 0113, safety net 2 -- tidies the engine's pass-through wording
     * before a frame is sent: a card number Forge writes after a name
     * (" (68)") goes, but a card's own name in brackets ("Hazmat Suit
     * (Used)") stays; "(s)" goes by the count beside it ("1 more card(s)"
     * becomes "one more card"), else the plural; " - " joining two parts
     * becomes ": " (a type line's becomes the printed "—"; never inside one
     * of [names], the game's card names); runs of spaces become one; the
     * ends are trimmed. Run after every sentence of our own is built, so it
     * catches what they miss. Null stays null.
     */
    public static String tidy(String text, java.util.Collection<String> names) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        // A card's own name is never touched: hide each one while the rest is tidied.
        List<String> hidden = new ArrayList<>();
        String s = text;
        if (names != null && !names.isEmpty()) {
            List<String> sorted = new ArrayList<>();
            for (String n : names) {
                if (n != null && n.length() > 1 && (n.contains(" - ") || n.contains("(") || n.contains("  "))
                        && s.contains(n)) {
                    sorted.add(n);
                }
            }
            sorted.sort((a, b) -> b.length() - a.length());
            for (String n : sorted) {
                if (s.contains(n)) {
                    s = s.replace(n, "\u0000" + hidden.size() + "\u0001");
                    hidden.add(n);
                }
            }
        }
        s = CARD_NUMBER.matcher(s).replaceAll("$1");
        s = maybePlurals(s);
        s = dashes(s);
        s = s.replaceAll("[ \\t\\u00a0]{2,}", " ").replaceAll(" +\\n", "\n").replaceAll("\\n +", "\n")
                .replaceAll(" +([.,;:?!])(?=\\s|$)", "$1").trim();
        for (int i = 0; i < hidden.size(); i++) {
            s = s.replace("\u0000" + i + "\u0001", hidden.get(i));
        }
        return s;
    }

    /** {@link #tidy(String, java.util.Collection)} with no card names to keep apart. */
    public static String tidy(String text) {
        return tidy(text, List.of());
    }

    private static String maybePlurals(String s) {
        Matcher m = MAYBE_PLURAL.matcher(s);
        StringBuilder out = new StringBuilder();
        int last = 0;
        while (m.find()) {
            String before = s.substring(last, m.start());
            String noun = m.group(1);
            Matcher c = COUNT_BEFORE.matcher(before);
            String word;
            if (c.find()) {
                String n = c.group(1);
                Integer value = valueOf(n);
                boolean one = value != null && value == 1;
                String said = n;
                if (value != null && Character.isDigit(n.charAt(0)) && value <= 10) {
                    said = number(value);
                }
                before = before.substring(0, c.start(1)) + said + before.substring(c.end(1));
                word = one ? noun : plural(noun);
            } else {
                word = plural(noun);
            }
            out.append(before).append(word);
            last = m.end();
        }
        out.append(s.substring(last));
        return out.toString();
    }

    private static Integer valueOf(String n) {
        String lower = n.toLowerCase(Locale.ROOT);
        if (lower.equals("a") || lower.equals("an")) {
            return 1;
        }
        if (Character.isDigit(lower.charAt(0))) {
            try {
                return Integer.parseInt(lower);
            } catch (NumberFormatException e) {
                return null;
            }
        }
        for (int i = 0; i <= 10; i++) {
            if (forge.util.Lang.getNumeral(i).equals(lower)) {
                return i;
            }
        }
        return null;
    }

    private static String dashes(String s) {
        int at = s.indexOf(" - ");
        if (at < 0) {
            return s;
        }
        StringBuilder out = new StringBuilder();
        int last = 0;
        while (at >= 0) {
            String left = s.substring(last, at);
            out.append(left);
            String sofar = out.toString();
            int lineStart = Math.max(Math.max(sofar.lastIndexOf('\n'), sofar.lastIndexOf(". ")),
                    Math.max(sofar.lastIndexOf(": "), sofar.lastIndexOf(", ")));
            String tail = sofar.substring(lineStart < 0 ? 0 : lineStart + 1).trim();
            out.append(TYPE_LINE_LEFT.matcher(tail).find() && Character.isUpperCase(tail.charAt(0))
                    ? " — " : ": ");
            last = at + 3;
            at = s.indexOf(" - ", last);
        }
        out.append(s.substring(last));
        return out.toString();
    }

    /**
     * Spec 0107 (owner Q5c A) -- a kept trample split, to the defending
     * player: "Bob put all five on your Grizzly Bears; none trampled over.",
     * "Bob put three on your Grizzly Bears and two on your Llanowar Elves;
     * none trampled over.", "Bob put four on your Grizzly Bears; one
     * trampled over." ([whose] "your" for the defender; [over] what reached
     * them; [damage] the attacker's whole damage).
     */
    public static String trampleKept(String who, String whose, List<String> blockers, List<Integer> amounts,
            int over, int damage) {
        List<String> parts = new ArrayList<>();
        for (int i = 0; i < blockers.size(); i++) {
            int n = amounts.get(i);
            boolean all = blockers.size() == 1 && over == 0 && n == damage;
            parts.add((all ? "all " : "") + number(n) + " on " + whose + " " + blockers.get(i));
        }
        String put = parts.size() <= 1 ? String.join("", parts)
                : String.join(", ", parts.subList(0, parts.size() - 1)) + " and " + parts.get(parts.size() - 1);
        return who + " put " + put + "; " + (over == 0 ? "none" : number(over)) + " trampled over.";
    }
}
