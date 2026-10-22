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
    id("org.jlleitschuh.gradle.ktlint")
    id("io.gitlab.arturbosch.detekt")
}

val ktorVersion: String by project
val logbackVersion: String by project
val junitVersion: String by project
val hikariVersion: String by project
val postgresVersion: String by project
val flywayVersion: String by project
val testcontainersVersion: String by project
val bouncycastleVersion: String by project

dependencies {
    implementation("io.ktor:ktor-server-core-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-netty-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-content-negotiation-jvm:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-websockets-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-call-logging-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-call-id-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-auto-head-response-jvm:$ktorVersion")
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

    // Argon2id (PHASE_03 3.12). BouncyCastle is pure JVM, so there
    // is no native library to ship in the image or to go missing on
    // a different architecture. 3.12 forbids implementing the
    // primitive by hand, and a hand-rolled KDF is the single worst
    // thing in that specification to get subtly wrong.
    implementation("org.bouncycastle:bcprov-jdk18on:$bouncycastleVersion")

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

// PHASE_03 3.56, 3.150 -- the account administration tool, shipped
// beside the server so it can be run in the deployed container:
//
//   docker compose exec arena-server /app/bin/arena-admin user list
//
// Its own start script rather than a flag on the server, so running
// it cannot accidentally start an HTTP listener.
val arenaAdmin by tasks.registering(CreateStartScripts::class) {
    mainClass.set("net.barnflix.proxic.auth.AdminToolKt")
    applicationName = "arena-admin"
    outputDir = layout.buildDirectory.dir("scripts").get().asFile
    classpath = tasks.named<Jar>("jar").get().outputs.files + configurations.runtimeClasspath.get()
}

tasks.named<Sync>("installDist") {
    into("bin") {
        from(arenaAdmin)
        fileMode = 493 // rwxr-xr-x: the script must be executable
    }
    // The scripts are regenerated on every build, so a re-run finds
    // the previous copy already in place.
    duplicatesStrategy = DuplicatesStrategy.INCLUDE
}

ktlint {
    // ktlint 1.x cannot PARSE this build script (it fails on
    // `runKtlintFormatOverKotlinScripts`, not on a style rule), so
    // linting .kts here would mean a permanently red task that says
    // nothing about the code. Kotlin SOURCE is still fully checked,
    // which is what 1.87 is for.
    filter {
        exclude { it.file.path.endsWith(".kts") }
    }
}

detekt {
    buildUponDefaultConfig = true
    config.setFrom(rootProject.file("config/detekt.yml"))
    // The generated build-info source set is not ours to style.
    source.setFrom("src/main/kotlin", "src/test/kotlin")
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

    // CI runs the suite as two halves on two machines at once
    // (-PtestShard=1 or 2; owner 2026-10-21, "the checks take longer and
    // longer"). Split by package, about seven minutes each. Half 2 is
    // "everything NOT in half 1", so a new package can never fall
    // between them. No property: the whole suite, as always.
    val shardOne = listOf("**/proxic/deck/**", "**/proxic/match/**", "**/proxic/admin/**")
    when (project.findProperty("testShard")?.toString()) {
        "1" -> include(shardOne)
        "2" -> exclude(shardOne)
        null -> Unit
        else -> throw GradleException("testShard is 1 or 2")
    }
}
