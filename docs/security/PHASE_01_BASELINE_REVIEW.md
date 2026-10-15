# Phase 1 Security Baseline — review

**PHASE_01 §1.99. Reviewed 2026-10-15.**

§1.99 lists twelve properties. This is each one checked against the
running system, with what was actually observed. Three gaps were
found and closed during the review; they are marked **FIXED**.

Nothing here is a penetration test. It is a deliberate pass over a
stated list, which is what §1.99 asks for and what "we were careful"
is not.

---

| # | Property | Verdict |
| --- | --- | --- |
| 1 | Database is private | **PASS** |
| 2 | Forge workers are private | **PASS** |
| 3 | Ktor private behind the tunnel in production | **FIXED** |
| 4 | Public traffic uses the existing Cloudflare HTTPS endpoint | **BLOCKED** |
| 5 | Existing HSTS/security settings preserved | **BLOCKED** |
| 6 | No stack traces sent to clients | **PASS** |
| 7 | Secrets stay outside Git | **PASS** |
| 8 | CORS same-origin / restricted | **PASS** |
| 9 | Inputs are validated | **PASS** |
| 10 | JSON message size bounded | **PASS** |
| 11 | HTTP body size bounded | **PASS** |
| 12 | Containers use minimal permissions | **FIXED** |

---

## 1. Database is private

`docker compose ps` shows `5432/tcp` with no host binding, and a
connection attempt from the host is refused. The compose file has no
`ports:` section for `postgres`, and it sits on an `internal: true`
network that has no route out.

## 2. Forge workers are private

The worker is a child process of the server speaking line-delimited
JSON over its own stdin/stdout. It opens no socket and binds no
port, so there is nothing to reach. Phase 0A chose this shape for
isolation; privacy is a side effect of it.

## 3. Ktor private behind the tunnel — **FIXED**

**Found:** `docker-compose.yml` published `127.0.0.1:8080` by
default, with a comment saying the real deployment should remove it.

That is the wrong default. It makes the *safe* configuration the one
someone has to remember, and the exposed one what runs if they
forget — on a host where other containers share the loopback
interface.

**Fixed:** the base file publishes nothing. Local use adds an
explicit override:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
```

Production reaches the server over the internal `edge` network only.

## 4–5. Cloudflare HTTPS and HSTS — **BLOCKED**

Cannot be verified here; they need the real host and a real tunnel.
Acceptance tests P1-R through P1-U remain open, and nothing in this
project describes unrun configuration as working (§1.71).

## 6. No stack traces to clients

`StatusPages` converts every unhandled throwable into one shape:

```json
{"errorCode":"NOT_FOUND","detail":"No such endpoint.","requestId":"…"}
```

The exception goes to the log with its request id; the client gets a
code, a sentence and that id. A test asserts `"Exception" !in detail`.
The database health check logs only the exception *type*, because a
JDBC message can carry the host and, in some drivers, credentials.

## 7. Secrets stay outside Git

- `.env`, `.env.local`, `*.pem`, `*.key` have never appeared in any
  commit (checked across all history, not just HEAD).
- `.env.example` holds placeholders only, and the server refuses to
  start in production if a secret still equals one.
- `ServerConfig.toString()` is overridden to redact. The generated
  data-class version would have printed every secret the first time
  anyone logged the config — the most common way secrets escape.
- A grep across tracked files for assigned secret-shaped literals
  returns nothing.

## 8. CORS same-origin

The CORS plugin is **not installed**, which is the restrictive
choice: with no `Access-Control-Allow-Origin` header, browsers
refuse cross-origin use. Verified by sending
`Origin: https://evil.example` and confirming no `Access-Control-*`
header comes back.

The frontend needs none: production is same-origin (Ktor serves the
page and the API), and development goes through Vite's proxy, which
is also same-origin from the browser's point of view.

## 9. Inputs are validated

| Input | Validation |
| --- | --- |
| Protocol envelope | Version checked and refused on mismatch; malformed JSON answered with `MALFORMED_MESSAGE`; unknown type rejected |
| Unknown JSON fields | Ignored rather than fatal — a newer client must not 500 the server; the protocol version is what gates compatibility |
| Static file paths | Canonical path compared against the root, so traversal degrades to the SPA fallback instead of serving `/etc/passwd` |
| `Content-Length` | Checked before the body is read |
| Worker handshake | Commit and protocol version compared; a mismatch is refused, not used |

Phase 1 accepts no user content, which is why this list is short.
Phase 2 adds the first real parser — a ZIP from the Deck Builder —
and that needs its own review, including zip-slip and decompression
bombs.

## 10–11. Bounded message and body sizes

1 MB WebSocket frames, 1 MB HTTP bodies, 64 concurrent system
connections, 30-second read and write timeouts. Each is tested with
a negative control, and a 2 MB POST returns 413 on the running
stack.

## 12. Containers use minimal permissions — **FIXED**

**Found:** both containers ran with the default capability set, no
`no-new-privileges`, and a writable root filesystem. Only the
non-root user had been done.

**Fixed, and verified on the running stack:**

| | arena-server | postgres |
| --- | --- | --- |
| User | `uid=100(proxic)` | postgres |
| Capabilities | `ALL` dropped | `ALL` dropped, five added back for the entrypoint's `root → postgres` drop |
| `no-new-privileges` | yes | yes |
| Root filesystem | **read-only**, `/tmp` on tmpfs | writable (PostgreSQL needs it) |
| Privileged | no | no |

Checked that it works rather than assumed: `touch /app/EVIL` is
refused, `/data` is still writable, readiness is `ok`, and the Forge
worker still spawns a child JVM under the read-only root.

---

## Known gaps, stated rather than hidden

- **Cloudflare (4, 5)** — unverified until deployment.
- **No authentication** — §1.101 forbids it in Phase 1. Until Phase
  3, anyone who can reach the server can use it. That is acceptable
  only because nothing is behind it yet, and it stops being
  acceptable the moment Phase 2 stores a deck.
- **No audit logging** — no phase has asked for it yet.
- **Postgres root filesystem is writable** — the image needs it;
  revisit if a hardened variant is adopted.
- **This review covers Phase 1's surface only.** Each phase that
  adds an input adds work here, and Phase 2's ZIP parsing is the
  next one that needs it.
