package net.barnflix.proxic.worker;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Resource availability verification — PHASE_01 §1.64.
 *
 * Phase 0A established the exact bootstrap order and, more usefully,
 * which missing inputs fail LATE and confusingly rather than early:
 *
 *   languages      Localizer.initialize needs it
 *   lists          CardType.Helper.parseTypes
 *   cardsfolder    33,980 card scripts
 *   tokenscripts   getAllTokens() NPEs without it
 *   editions       StaticData
 *   blockdata      StaticData
 *
 * The NPEs are the reason this class exists. A missing
 * `tokenscripts` directory does not fail at startup; it fails much
 * later inside Forge with a NullPointerException that looks like a
 * Forge bug. Checking up front turns a mystery into a sentence.
 *
 * This verifies PRESENCE, not correctness. A directory that exists
 * and is empty is reported as present-but-empty rather than ok,
 * because "the folder is there" is not the claim anyone cares about.
 */
public final class ForgeResources {

    /** Directory name -> whether it must contain files to count as ok. */
    private static final Map<String, Boolean> REQUIRED = new LinkedHashMap<>();

    static {
        REQUIRED.put("languages", true);
        REQUIRED.put("lists", true);
        REQUIRED.put("cardsfolder", true);
        REQUIRED.put("tokenscripts", true);
        REQUIRED.put("editions", true);
        REQUIRED.put("blockdata", true);
    }

    private final File root;

    public ForgeResources(File root) {
        this.root = root;
    }

    /** One line per required input: ok / missing / empty. */
    public Map<String, String> inspect() {
        Map<String, String> result = new LinkedHashMap<>();
        if (root == null || !root.isDirectory()) {
            result.put("resRoot", root == null ? "unset" : "missing");
            return result;
        }
        result.put("resRoot", "ok");
        for (Map.Entry<String, Boolean> entry : REQUIRED.entrySet()) {
            File dir = new File(root, entry.getKey());
            if (!dir.isDirectory()) {
                result.put(entry.getKey(), "missing");
                continue;
            }
            if (entry.getValue()) {
                String[] contents = dir.list();
                result.put(entry.getKey(),
                        (contents == null || contents.length == 0) ? "empty" : "ok");
            } else {
                result.put(entry.getKey(), "ok");
            }
        }
        return result;
    }

    /** The inputs that are not usable, for a one-line failure reason. */
    public List<String> problems() {
        List<String> problems = new ArrayList<>();
        for (Map.Entry<String, String> entry : inspect().entrySet()) {
            if (!"ok".equals(entry.getValue())) {
                problems.add(entry.getKey() + "=" + entry.getValue());
            }
        }
        return problems;
    }

    public boolean usable() {
        return problems().isEmpty();
    }
}
