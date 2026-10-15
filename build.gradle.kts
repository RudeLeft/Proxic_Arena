// Proxic Arena — root build.
//
// Versions are pinned here rather than per-module (PHASE_01 §1.5: no
// floating `latest` in production dependencies).

plugins {
    kotlin("jvm") version "1.9.24" apply false
    kotlin("plugin.serialization") version "1.9.24" apply false
}

allprojects {
    group = "net.barnflix.proxic"
    version = "0.1.0"

    repositories {
        mavenCentral()
    }
}
