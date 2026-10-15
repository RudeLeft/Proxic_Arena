# Arena Server — production image (PHASE_01 §1.56, §1.57, §1.59).
#
# Three stages: build the frontend, build the server, then ship a JRE
# runtime that contains neither toolchain. The production app needs no
# Node server (§1.56) — Ktor serves the compiled assets (§1.27).

# --- Stage 1: frontend ------------------------------------------------
# Pinned, not `node:latest` (§1.58). Matches the host toolchain.
FROM node:24.11.1-alpine AS frontend
WORKDIR /src
# package files first, so a source-only change does not re-resolve
# every dependency.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY protocol/ /protocol/
RUN npm run build

# --- Stage 2: server --------------------------------------------------
FROM eclipse-temurin:17.0.13_11-jdk-alpine AS server
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

# --- Stage 3: runtime -------------------------------------------------
FROM eclipse-temurin:17.0.13_11-jre-alpine AS runtime

# Non-root (§1.59). The app writes only to /data, which is a volume.
RUN addgroup -S proxic && adduser -S -G proxic proxic

WORKDIR /app
COPY --from=server  /src/server/build/install/server/ /app/
COPY --from=frontend /src/dist/ /app/frontend/dist/

# Owned by root, readable by proxic: the application cannot rewrite
# its own binaries.
RUN mkdir -p /data && chown proxic:proxic /data

ENV PROXIC_STATIC_ROOT=/app/frontend/dist \
    PROXIC_DATA_ROOT=/data \
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
