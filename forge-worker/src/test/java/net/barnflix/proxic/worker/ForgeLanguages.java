package net.barnflix.proxic.worker;

import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Forge's language data, loaded once before the first test class of the run.
 *
 * <p>Forge reads its phase and game names through {@code Localizer}; a class
 * whose static set-up touches them ({@code PriorityStops}, {@code GameHost}
 * via {@code PhaseType}) fails to load if no test loaded the languages first,
 * and the JVM then refuses that class to every later test. Which test runs
 * first depends on the file system's order, so a test that set nothing up
 * passed or failed by luck: the 1.76.0 release image build ran
 * {@code ThrownAwayTest} first and took {@code LoudFailureTest} down with it
 * (CI run 45626584754). Registered for every test class through
 * {@code META-INF/services} and {@code junit-platform.properties}, so no test
 * has to remember it.
 */
public final class ForgeLanguages implements BeforeAllCallback {

    private static volatile boolean loaded;

    @Override
    public void beforeAll(ExtensionContext context) {
        load();
    }

    /** Loads the languages once; safe to call from any test. */
    public static synchronized void load() {
        if (loaded) {
            return;
        }
        List<Path> candidates = new ArrayList<>();
        String given = System.getProperty("forge.res", System.getenv("FORGE_RES"));
        if (given != null) {
            candidates.add(Path.of(given));
        }
        candidates.add(Path.of("..", "spikes", "forge-phase0a", "forge-upstream", "forge-gui", "res"));
        candidates.add(Path.of("/forge/forge-gui/res"));
        Path res = candidates.stream().filter(p -> Files.isDirectory(p.resolve("languages"))).findFirst()
                .orElseThrow(() -> new AssertionError("Forge's resources not found in " + candidates
                        + " -- set -Dforge.res=<forge-gui/res>"));
        forge.util.Localizer.getInstance().initialize("en-US", res.toAbsolutePath() + "/languages");
        loaded = true;
    }
}
