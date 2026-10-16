package net.barnflix.proxic

import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.response.header

// Security headers and CSP — PHASE_03 §3.99–§3.101.
//
// §3.99 says to PRESERVE existing Cloudflare behaviour and add
// protection against content-type sniffing, clickjacking and
// referrer leakage. Cloudflare already terminates TLS and sets
// HSTS; nothing here touches that.
//
// §3.100 requires a CSP that works with React, Vite's production
// output, PixiJS, same-origin APIs and WebSockets, and the card
// images Arena serves — and forbids disabling CSP globally because
// one dependency is awkward.

/**
 * The policy, with the reason for each relaxation.
 *
 * Every `'unsafe-*'` here is a liability, so each one states why it
 * exists and what would remove it.
 */
private val CONTENT_SECURITY_POLICY =
    listOf(
        // Nothing loads from anywhere else unless named below.
        "default-src 'self'",
        // Vite emits external script files, so no inline script is
        // needed and none is allowed. This is the directive that
        // actually stops injected markup from executing.
        "script-src 'self'",
        // 'unsafe-inline' is required for STYLE ATTRIBUTES, which React
        // produces from `style={{ ... }}` — the status indicator's
        // colour is one. It does not permit inline <script>.
        //
        // Removing it means moving those to classes; worth doing when
        // the UI settles, not worth a broken page now.
        "style-src 'self' 'unsafe-inline'",
        // Card art is same-origin. `data:` covers small generated
        // images; `blob:` covers canvas work PixiJS may do.
        "img-src 'self' data: blob:",
        // Same-origin API and WebSocket. A same-origin ws:// is covered
        // by 'self' in current browsers.
        "connect-src 'self'",
        // PixiJS 8 loads textures through a worker, and a bundled
        // worker is instantiated from a blob URL.
        "worker-src 'self' blob:",
        "font-src 'self' data:",
        // No plugins, and no <base> rewriting where links point.
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        // §3.99 clickjacking, in its modern form. X-Frame-Options is
        // also sent below for older browsers.
        "frame-ancestors 'none'",
    ).joinToString("; ")

val SecurityHeaders =
    createApplicationPlugin(name = "SecurityHeaders") {
        onCallRespond { call ->
            // §3.99 — a response whose type is guessed is a response
            // that can be executed as something it is not.
            call.response.header("X-Content-Type-Options", "nosniff")

            // Clickjacking, for browsers predating frame-ancestors.
            call.response.header("X-Frame-Options", "DENY")

            // A deck id or asset hash in a Referer sent to another site
            // is a small leak that costs nothing to prevent.
            call.response.header("Referrer-Policy", "strict-origin-when-cross-origin")

            call.response.header("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        }
    }

/** Exposed so a test can assert the policy's content directly. */
internal fun contentSecurityPolicy(): String = CONTENT_SECURITY_POLICY
