# Arena Server — production image (PHASE_01 §1.56, §1.57, §1.59).
#
# Three stages: build the frontend, build the server, then ship a JRE
# runtime that contains neither toolchain. The production app needs no
# Node server (§1.56) — Ktor serves the compiled assets (§1.27).

# --- Stage 1: frontend ------------------------------------------------
# Pinned by DIGEST, not just by tag (§1.58). A tag is a moving
# pointer: `node:24.11.1-alpine` can be republished, and the build
# that worked yesterday is then not the build that runs today. The
# digest is the image. The tag is kept alongside it because a bare
# digest tells a reader nothing about what it is.
#
# These are manifest-LIST digests, so they still resolve per
# architecture -- amd64 here and on the Unraid host.
FROM node:24.11.1-alpine@sha256:682368d8253e0c3364b803956085c456a612d738bd635926d73fa24db3ce53d7 AS frontend
WORKDIR /src
# package files first, so a source-only change does not re-resolve
# every dependency.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY protocol/ /protocol/
RUN npm run build

# --- Stage 2: server --------------------------------------------------
FROM eclipse-temurin:17.0.13_11-jdk-alpine@sha256:d60e19d7da3a1bebbde66f740841d822c0e518aebf99a4403da16bb34f0373f8 AS server
WORKDIR /src
# Wrapper and build scripts first: dependency resolution is the slow
# part and must not be invalidated by a source edit.
# forge-pin.properties is required AT CONFIGURATION TIME: the
# Gradle build reads it to generate build-info.properties. Leaving
# it out failed the image build outright, which is the right
# failure -- a server that cannot state its Forge commit must not
# build.
COPY gradlew gradlew.bat settings.gradle.kts build.gradle.kts gradle.properties forge-pin.properties ./
COPY config/ config/
COPY gradle/ gradle/
COPY server/build.gradle.kts server/
RUN chmod +x gradlew && ./gradlew --no-daemon :server:dependencies --quiet || true
COPY server/ server/
COPY protocol/ protocol/
# Tests are NOT run here. They need Docker (Testcontainers), and a
# build that silently skipped them would be the false-green this
# project keeps rejecting. CI runs them on the host.
RUN ./gradlew --no-daemon :server:installDist -x test

# --- Stage 3: Forge worker --------------------------------------------
# PHASE_01 §1.52 ("all production services run through Docker") and
# §1.53. Phase 0A chose ONE JVM PER MATCH, spawned by the server, so
# the worker is not a separate container — it is a jar the server
# executes, and it therefore has to live in this image alongside
# Forge's own data files.
#
# Forge is built from source here because no published artifact
# exists for forge-core/forge-game at this pin.
FROM maven:3.9.9-eclipse-temurin-17@sha256:f58d59b6273e785ac0a4477f6e9b5ba1d7731c75b906c0f7b34076f1851318cc AS worker

# The pin, from the same file the other two builds read (§1.25).
COPY forge-pin.properties /pin.properties

# Shallow clone of the release tag, then an EXPLICIT check that the
# commit is the pinned one. A tag can be moved; a commit cannot.
# §1.61 says a mismatched Forge revision must not silently become the
# production build — checking here means the image cannot be built
# from the wrong source at all.
RUN set -eu; \
    FORGE_COMMIT="$(grep '^forge.commit=' /pin.properties | cut -d= -f2)"; \
    FORGE_RELEASE="$(grep '^forge.release=' /pin.properties | cut -d= -f2)"; \
    git clone --depth 1 --branch "$FORGE_RELEASE" \
        https://github.com/Card-Forge/forge.git /forge; \
    cd /forge; \
    ACTUAL="$(git rev-parse HEAD)"; \
    if [ "$ACTUAL" != "$FORGE_COMMIT" ]; then \
        echo "Forge mismatch: tag $FORGE_RELEASE is $ACTUAL, pin says $FORGE_COMMIT" >&2; \
        exit 1; \
    fi

# forge-core and forge-game only (Strategy A). forge-gui is
# Swing-coupled and a browser cannot speak it.
RUN cd /forge && mvn -q -B install -DskipTests -pl forge-core,forge-game -am

COPY forge-worker/ /build/forge-worker/
COPY forge-pin.properties /build/forge-pin.properties
RUN cd /build/forge-worker && mvn -q -B package

# --- Stage 4: runtime -------------------------------------------------
FROM eclipse-temurin:17.0.13_11-jre-alpine@sha256:8164ba7f332faf27462e055013c2aa518a2eba1ce6984e9ca60dadb899cab6bd AS runtime

# Non-root (§1.59). The app writes only to /data, which is a volume.
RUN addgroup -S proxic && adduser -S -G proxic proxic

WORKDIR /app
COPY --from=server  /src/server/build/install/server/ /app/
COPY --from=frontend /src/dist/ /app/frontend/dist/

# The worker jar and Forge's own data files (~430 MB of card
# scripts, editions and token definitions — no artwork). Forge is
# GPL; this image is private to the deployment and not published.
COPY --from=worker /build/forge-worker/target/forge-worker-0.1.0.jar /app/forge/forge-worker.jar
COPY --from=worker /forge/forge-gui/res/ /app/forge/res/

# Owned by root, readable by proxic: the application cannot rewrite
# its own binaries.
RUN mkdir -p /data && chown proxic:proxic /data

ENV PROXIC_STATIC_ROOT=/app/frontend/dist \
    PROXIC_DATA_ROOT=/data \
    PROXIC_FORGE_WORKER_JAR=/app/forge/forge-worker.jar \
    PROXIC_FORGE_RES=/app/forge/res \
    PROXIC_HOST=0.0.0.0 \
    PROXIC_PORT=8080 \
    APP_ENV=production

USER proxic
EXPOSE 8080

# Liveness only — it must not depend on the database (§1.23), or a
# degraded database would make Docker restart a healthy server.
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
    CMD wget -q -O- http://127.0.0.1:8080/api/health/live || exit 1

ENTRYPOINT ["/app/bin/server"]
