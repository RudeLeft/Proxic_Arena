package net.barnflix.proxic.worker.game;

/**
 * Phase 9 W-11 (Amendment 14) -- what a number costs, for the dial: X filled
 * in ("{X}{R}" with X = 3 is "{3}{R}"), or a kicker paid n times on top of
 * the spell ("{0}" and "{2}" three times is "{6}"). Mana symbols as Forge
 * writes them; the generic part is summed, everything else kept in order.
 * Only words for the page: Forge prices and pays the real cost.
 */
final class NumberCosts {

    private static final java.util.regex.Pattern SYMBOL = java.util.regex.Pattern.compile("\\{([^}]+)\\}");

    private NumberCosts() {
    }

    /** [cost] with every {X} worth [x]. */
    static String withX(String cost, int x) {
        return sum(java.util.List.of(cost), x, true);
    }

    /** [base] plus [each] paid [times] times; an {X} in [base] stays an X. */
    static String plus(String base, String each, int times) {
        java.util.List<String> parts = new java.util.ArrayList<>();
        parts.add(base == null ? "" : base);
        for (int i = 0; i < times; i++) {
            parts.add(each == null ? "" : each);
        }
        return sum(parts, 0, false);
    }

    /** How much mana [cost] takes, an X as nothing: "{3}{R}{R}" is 5. */
    static int manaValue(String cost) {
        int value = 0;
        java.util.regex.Matcher m = SYMBOL.matcher(cost == null ? "" : cost);
        while (m.find()) {
            String s = m.group(1);
            if (s.matches("\\d+")) {
                value += Integer.parseInt(s);
            } else if (!"X".equals(s)) {
                value++;
            }
        }
        return value;
    }

    /**
     * The first sentence of a card's rules text that [pattern] finds, its
     * reminder text dropped: "Fireball deals X damage divided evenly,
     * rounded down, among any number of targets." Null when none does.
     */
    static String sentence(String text, String pattern) {
        if (text == null || text.isBlank()) {
            return null;
        }
        java.util.regex.Pattern wanted = java.util.regex.Pattern.compile(pattern);
        String plain = text.replaceAll("\\([^)]*\\)", "").replace("\\n", "\n");
        for (String line : plain.split("\n")) {
            for (String said : line.split("(?<=[.!?])\\s+")) {
                String trimmed = said.trim();
                if (!trimmed.isEmpty() && wanted.matcher(trimmed).find()) {
                    return trimmed;
                }
            }
        }
        return null;
    }

    private static String sum(java.util.List<String> costs, int x, boolean fillX) {
        int generic = 0;
        StringBuilder xs = new StringBuilder();
        StringBuilder rest = new StringBuilder();
        for (String cost : costs) {
            java.util.regex.Matcher m = SYMBOL.matcher(cost == null ? "" : cost);
            while (m.find()) {
                String s = m.group(1);
                if (s.matches("\\d+")) {
                    generic += Integer.parseInt(s);
                } else if ("X".equals(s)) {
                    if (fillX) {
                        generic += x;
                    } else {
                        xs.append("{X}");
                    }
                } else {
                    rest.append('{').append(s).append('}');
                }
            }
        }
        String g = generic > 0 || (xs.length() == 0 && rest.length() == 0) ? "{" + generic + "}" : "";
        return xs + g + rest;
    }
}
