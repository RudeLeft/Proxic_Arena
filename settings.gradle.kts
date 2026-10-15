// Proxic Arena — Phase 1 Application Foundation.
// The Forge worker is a separate Maven build (forge-worker/), because
// Forge itself is Maven and Phase 0A proved module selection against an
// unmodified upstream checkout works. Gradle owns the Kotlin side only.
rootProject.name = "proxic-arena"
include("server")
