package net.barnflix.proxic.worker;

import java.io.InputStream;
import java.util.Properties;

/**
 * The worker's own version facts — PHASE_01 §1.25, §1.61.
 *
 * Filtered in at build time from {@code forge-pin.properties}, the
 * same file the Gradle server build reads. Neither side hardcodes
 * the commit.
 *
 * The point of the worker reporting its commit at all is that the
 * server COMPARES it (§1.61): "an unknown or mismatched Forge
 * revision must not silently become the production build". A worker
 * jar built months ago against a different checkout is otherwise
 * indistinguishable from a current one.
 */
public final class WorkerInfo {

    private static final Properties PROPS = load();

    private WorkerInfo() {
    }

    private static Properties load() {
        Properties p = new Properties();
        try (InputStream in = WorkerInfo.class.getClassLoader()
                .getResourceAsStream("worker-info.properties")) {
            if (in == null) {
                // Loudly, not with a placeholder: a worker that
                // cannot say what it is must not pretend.
                throw new IllegalStateException(
                        "worker-info.properties missing; the build did not filter it");
            }
            p.load(in);
        } catch (Exception e) {
            throw new IllegalStateException("could not read worker-info.properties", e);
        }
        return p;
    }

    private static String required(String key) {
        String value = PROPS.getProperty(key);
        if (value == null || value.isBlank() || value.startsWith("${")) {
            // An unfiltered "${forge.commit}" is a build failure
            // wearing the costume of a value.
            throw new IllegalStateException("worker-info.properties has no usable '" + key + "'");
        }
        return value;
    }

    public static String workerVersion() {
        return required("proxic.version");
    }

    public static int protocolVersion() {
        return Integer.parseInt(required("protocol.version"));
    }

    public static String forgeCommit() {
        return required("forge.commit");
    }

    public static String forgeRelease() {
        return required("forge.release");
    }
}
