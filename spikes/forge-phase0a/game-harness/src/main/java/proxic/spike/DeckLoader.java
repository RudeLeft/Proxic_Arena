package proxic.spike;

import forge.StaticData;
import forge.deck.Deck;
import forge.item.PaperCard;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Minimal decklist reader for the Phase 0A spike.
 *
 * Deliberately resolves by NAME only. Exact-printing resolution is a
 * real requirement (§0A.9A) but it is Phase 2 import work, and the old
 * project's bug here — matching the [SET:NUMBER] tag in a non-capturing
 * group and silently discarding it — is documented rather than
 * repeated: this parser does not pretend to honour the tag at all.
 */
final class DeckLoader {
    private DeckLoader() {}

    private static final Pattern LINE =
            Pattern.compile("^(\\d+)\\s+(.+?)(?:\\s*\\[[^\\]]*\\])?\\s*$");

    static Deck load(String path, String name) throws IOException {
        Deck deck = new Deck(name);
        int missing = 0;
        for (String raw : Files.readAllLines(Path.of(path), StandardCharsets.UTF_8)) {
            String line = raw.trim();
            if (line.isEmpty() || line.startsWith("//") || line.startsWith("#")) {
                continue;
            }
            Matcher m = LINE.matcher(line);
            if (!m.matches()) {
                System.err.println("[deck] unparsed: " + line);
                continue;
            }
            int qty = Integer.parseInt(m.group(1));
            String cardName = m.group(2).trim();
            PaperCard pc = StaticData.instance().getCommonCards().getCard(cardName);
            if (pc == null) {
                System.err.println("[deck] NOT FOUND: " + cardName);
                missing++;
                continue;
            }
            deck.getMain().add(pc, qty);
        }
        if (missing > 0) {
            throw new IllegalStateException(missing + " card(s) not found in " + path);
        }
        return deck;
    }
}
