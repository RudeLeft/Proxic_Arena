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

    testImplementation("io.ktor:ktor-server-test-host-jvm:$ktorVersion")
    testImplementation("io.ktor:ktor-client-content-negotiation-jvm:$ktorVersion")
    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:$junitVersion")
}

kotlin {
    jvmToolchain(17)
}

application {
    mainClass.set("net.barnflix.proxic.ApplicationKt")
}

tasks.test {
    useJUnitPlatform()
    testLogging { events("passed", "failed", "skipped") }
}
