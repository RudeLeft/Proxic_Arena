// Proxic Arena — root build.
//
// Versions are pinned here rather than per-module (PHASE_01 §1.5: no
// floating `latest` in production dependencies).

plugins {
    kotlin("jvm") version "1.9.24" apply false
    kotlin("plugin.serialization") version "1.9.24" apply false
    // Static analysis (PHASE_01 1.87). ktlint owns formatting;
    // detekt owns the things that are legal Kotlin and still wrong.
    id("org.jlleitschuh.gradle.ktlint") version "12.1.1" apply false
    id("io.gitlab.arturbosch.detekt") version "1.23.6" apply false
}

allprojects {
    group = "net.barnflix.proxic"
    version = "0.1.0"

    repositories {
        mavenCentral()
    }

    // PHASE_01 1.88 — dependency locking.
    //
    // gradle.properties pins the versions WE declare; a lockfile
    // pins the transitive graph those versions resolve to. Without
    // it, a transitive dependency can publish a new patch release
    // and change the build between two runs of the same commit,
    // which makes "it worked yesterday" unanswerable.
    //
    // Refresh with:  ./gradlew :server:dependencies --write-locks
    dependencyLocking {
        lockAllConfigurations()
    }
}
