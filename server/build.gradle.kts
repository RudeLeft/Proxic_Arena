import java.util.Properties

// Arena Server — Kotlin / Ktor.
//
// PHASE_00_ACCEPTED_DECISIONS: the server owns HTTP, WebSocket,
// sessions and worker lifecycle. It is NEVER a second Magic rules
// engine, and it does not depend on Forge (AGENTS ARCH-001).

plugins {
    kotlin("jvm")
    kotlin("plugin.serialization")
    application
}

val ktorVersion: String by project
val logbackVersion: String by project
val junitVersion: String by project
val hikariVersion: String by project
val postgresVersion: String by project
val flywayVersion: String by project
val testcontainersVersion: String by project

dependencies {
    implementation("io.ktor:ktor-server-core-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-netty-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-content-negotiation-jvm:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-websockets-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-call-logging-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-call-id-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-status-pages-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-cors-jvm:$ktorVersion")
    implementation("ch.qos.logback:logback-classic:$logbackVersion")

    // Database (PHASE_01 1.36-1.38). The driver and Flyway are
    // present even when no database is configured: an unconfigured
    // server must report "unconfigured", not fail to start.
    implementation("com.zaxxer:HikariCP:$hikariVersion")
    implementation("org.postgresql:postgresql:$postgresVersion")
    implementation("org.flywaydb:flyway-core:$flywayVersion")
    implementation("org.flywaydb:flyway-database-postgresql:$flywayVersion")

    testImplementation("io.ktor:ktor-server-test-host-jvm:$ktorVersion")
    testImplementation("io.ktor:ktor-client-content-negotiation-jvm:$ktorVersion")
    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:$junitVersion")
    // A throwaway PostgreSQL per run, so migrations are proven
    // against a clean database and never against dev data.
    testImplementation("org.testcontainers:postgresql:$testcontainersVersion")
    testImplementation("org.testcontainers:junit-jupiter:$testcontainersVersion")
}

kotlin {
    jvmToolchain(17)
}

// The Forge pin comes from ONE file, shared with the Maven worker
// build (§1.25). Generating a resource rather than hardcoding a
// constant means the server and the worker cannot claim different
// commits because someone edited one of them.
val forgePin = Properties().apply {
    rootProject.file("forge-pin.properties").inputStream().use { load(it) }
}

val generateBuildInfo by tasks.registering(WriteProperties::class) {
    destinationFile.set(layout.buildDirectory.file("generated/resources/build-info.properties"))
    forgePin.forEach { k, v -> property(k.toString(), v.toString()) }
}

sourceSets.main {
    resources.srcDir(layout.buildDirectory.dir("generated/resources"))
}
tasks.named("processResources") { dependsOn(generateBuildInfo) }

application {
    mainClass.set("net.barnflix.proxic.ApplicationKt")
}

tasks.test {
    useJUnitPlatform()
    testLogging { events("passed", "failed", "skipped") }

    // Windows + Docker Desktop: Testcontainers probes the DEFAULT
    // named pipe, which Docker Desktop answers with an empty 400 stub
    // pointing at its CLI pipe. The probe therefore reports "no
    // Docker" on a machine whose engine is running fine, and the
    // database tests skip forever -- a permanent, silent skip, which
    // is the failure mode those tests exist to prevent.
    //
    // The engine lives on the desktop-linux context pipe. Guarded, so
    // Linux, CI, and anyone who sets DOCKER_HOST themselves are
    // untouched.
    // NOTE: do not add a File(...).exists() check on the pipe -- the
    // JVM reports false for a Windows named pipe that exists and
    // works, which silently disabled this whole block.
    if (System.getProperty("os.name").startsWith("Windows") &&
        System.getenv("DOCKER_HOST") == null
    ) {
        environment("DOCKER_HOST", "npipe:////./pipe/dockerDesktopLinuxEngine")
    }

    // docker-java negotiates API 1.32 by default. Docker Engine 29
    // refuses anything below 1.40 and answers 400 with an EMPTY,
    // Info-shaped body -- which Testcontainers reports as "could not
    // find a valid Docker environment", i.e. it looks like Docker is
    // missing when it is running and the CLI works fine.
    //
    // 1.44 is supported by every engine we target (Docker 25+).
    systemProperty("api.version", "1.44")
}
