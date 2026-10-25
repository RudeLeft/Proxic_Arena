# Troubleshooting — Foundation

PHASE_01 §1.98. Every entry here is a failure that was actually hit
while building Phase 1, or one the specification names. Where a cause
was non-obvious, the symptom is written as it appears — because the
expensive part is never the fix, it is the hour spent looking in the
wrong place.

**First question, always: what did it actually say?** This project's
status endpoints are built not to lie. `curl
http://127.0.0.1:8080/api/health/ready` is faster than guessing.

---

## Docker will not start

**`docker` is not a recognised command**, or `docker version` shows a
Client but no Server.

- Docker Desktop is installed but has never been launched. Start it
  from the Start menu, accept its terms, and wait for the tray icon
  to stop animating. First launch builds its WSL distribution and
  takes a few minutes.
- `com.docker.service` shows `Stopped` — the machine has not been
  rebooted since installing. Reboot.
- A shell opened **before** Docker was installed has a stale `PATH`.
  Open a new one.

**`wsl --status` prints usage text and exits 50** — WSL is not
installed. `wsl --install --no-distribution` in an admin shell, then
reboot.

## The database is not ready

```bash
docker compose exec arena-server wget -qO- http://127.0.0.1:8080/api/health/ready
```

| `checks.database` | Meaning |
| --- | --- |
| `unconfigured` | No `PROXIC_DATABASE_URL`. Expected on a bare development run; the server works without one. |
| `unreachable` | Configured and not answering. The database is down, the credentials are wrong, or the URL points somewhere else. |
| `ok` | A `SELECT 1` round trip just succeeded. |

`unreachable` is reported per request, not cached, so a database that
recovers is picked up automatically — no server restart.

**The server starts fine with the database down.** That is by design:
liveness does not depend on dependencies (§1.23), so Docker will not
restart a healthy server because PostgreSQL blinked. Readiness answers
503 and the page shows it.

**Flyway reports a checksum mismatch** — a migration that already ran
has been edited. Never edit an applied migration; add a new one. In
development, reset the volume (README, *Database reset*).

## The frontend cannot reach the API

- **In development**, Vite proxies `/api` and `/ws` to Ktor on 8080.
  If the server is not running the proxy returns 500s. Start it.
- **In production**, there is no proxy: Ktor serves the page and the
  API from the same origin. If `/api` 404s from the page but works
  from `curl`, something is rewriting the path.
- **Never hardcode a host in frontend source** (§1.47). Same-origin
  `/api` and `/ws` are the contract, and a hardcoded `localhost:8080`
  works on your machine and nowhere else.

## Ktor is not serving the frontend

**Every route returns `FRONTEND_NOT_BUILT` with a 503.** The server is
looking at `PROXIC_STATIC_ROOT` and finding no `index.html`. Either
the frontend was never built (`cd frontend && npm run build`) or the
path is wrong. The error is deliberate: an unbuilt frontend is a
different problem from a missing route, and a 404 would have told you
the wrong thing.

**A script tag 404s, or the browser reports a syntax error inside the
bundle.** A missing asset under `/assets/` returns a JSON 404, never
`index.html` — if it returned HTML the browser would report it as a
syntax error in your JavaScript. Usually a stale cached page asking
for a hashed file that a rebuild replaced. Hard-refresh.

## A React route returns 404

`/play`, `/settings` and friends have no file behind them; the SPA
fallback serves `index.html` for them. If one 404s:

- The request path starts with `/api` or `/ws`, which are excluded
  from the fallback on purpose. An API typo must stay a 404 instead of
  quietly becoming an HTML page.
- The static root has no `index.html` — see above.

## The WebSocket will not connect

- Check the page's indicator: `Disconnected` means it connected and
  dropped; `Unavailable` means it never connected.
- A proxy in front must forward the `Upgrade` and `Connection`
  headers. A proxy that handles plain HTTP perfectly and silently
  drops WebSockets is common; the API working is not evidence that
  the socket will.
- `wss://` is required from an `https://` page. A browser refuses a
  plain `ws://` from a secure page and says little about why.

**Frames arrive but are rejected as malformed.** Every frame must
carry `protocolVersion`. This was a real bug: the default JSON
serializer omits properties equal to their default, so the server's
own HELLO was rejected by its own client parser. Both sides use
`encodeDefaults = true`.

## The Forge runtime is not ready

`checks.forgeWorker` distinguishes five states, because the operator
action differs for each:

| State | Meaning | What to do |
| --- | --- | --- |
| `unconfigured` | No worker jar configured | Expected in Phase 1. Set `PROXIC_FORGE_WORKER_JAR`. |
| `missing` | Configured, file not there | Build it: `cd forge-worker && mvn package`. Check the path. |
| `unreachable` | Started and never spoke, or died first | Run it by hand (below) and read stderr. |
| `incompatible` | Answered with the wrong commit or protocol | You are running a jar built against a different Forge. Rebuild. |
| `resources-missing` | Runs, but Forge's data files are not usable | Set `PROXIC_FORGE_RES`. The detail names which directory. |

Run the worker directly — it is a normal program and will tell you
what it thinks:

```bash
echo '{"type":"VERIFY_RESOURCES"}' | java -jar forge-worker/target/forge-worker-0.1.0.jar /path/to/forge-gui/res
```

## Protocol version mismatch

The page shows **Version mismatch**, and the socket closes with
`CANNOT_ACCEPT`.

The browser is running an older build than the server — almost always
a cached page after a deploy. Hard-refresh. If it persists, the client
bundle and the server really were built from different commits.

This is its own state rather than a generic failure on purpose: the
server is healthy and reachable, and reporting "unavailable" would
send you debugging the wrong machine.

## Wrong Forge commit

`forgeWorker: incompatible`, detail naming two commits.

The server compares the worker's reported commit against
`forge-pin.properties` and refuses a mismatch (§1.61). A jar built
months ago against another checkout is otherwise indistinguishable
from a current one, and would quietly become the production build.

Rebuild the worker from a checkout at the pinned commit. Do **not**
"fix" this by editing the pin — see the README's Forge update warning.

## Missing Forge resources

`forgeWorker: resources-missing`, detail naming the directory.

Forge needs `languages`, `lists`, `cardsfolder`, `tokenscripts`,
`editions` and `blockdata`. The check is up front because the
alternative is worse: a missing `tokenscripts` does not fail at
startup, it fails much later inside Forge with a
`NullPointerException` that looks like a Forge bug.

A directory that exists but is empty reports `empty`, not `ok`.

## PostgreSQL restart-loops: "directory exists but is not empty"

```text
initdb: error: directory "/var/lib/postgresql/data" exists but is
not empty
```

`initdb` will not touch a non-empty data directory — correctly, since
the alternative is destroying a database it does not recognise.

On Unraid this happens with a directory you believe is empty.
Something in the compose tooling writes `name` and `project_name`
files into appdata subdirectories, and two 8-byte files are enough.

**Look before deleting.** If the directory holds `PG_VERSION`,
`base/`, `global/` or `pg_wal/`, that is a real database — possibly
another deployment's — and clearing it is unrecoverable.

```bash
ls -la /mnt/user/appdata/proxic_arena/v2/postgres
```

If it holds only those two metadata files, use a dedicated
subdirectory rather than clearing them, because whatever wrote them
will write them again.

## Starting the dev stack broke the production stack

Symptom: `docker compose -f docker-compose.dev.yml up` succeeds, and
the production server immediately reports `database: unreachable`.

Compose derives its project name from the DIRECTORY, so both files
shared one project, and both define a service called `postgres`.
Starting the development stack therefore **replaced** the production
`postgres` container rather than creating a second one.

Fixed by giving each file an explicit `name:` — `proxic-arena` and
`proxic-arena-dev`. They now run side by side.

No data was lost when this happened: the volumes were always
distinct (`postgres-data` vs `postgres-dev-data`), so only the
containers collided. If you are on an older checkout, remove the
stale project first:

```bash
docker compose -p proxic_arena down
```

**After this, force-recreate the server if its port looks
unpublished** (`docker ps` shows `8080/tcp` rather than
`127.0.0.1:8080->8080/tcp`): a container created during a failed
bind keeps the unpublished mapping.

```bash
docker compose up -d --force-recreate arena-server
```

## Nothing is listening on 8080

`docker compose up` publishes no host port by design (§1.51): in
production the Cloudflare tunnel reaches the server over the
internal network. To drive it locally, add the override:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
```

## Port already in use

```bash
netstat -ano | grep ":8080"
taskkill //PID <pid> //F
```

A server that fails to bind logs it and exits; the port belongs to
something else, often a previous run of this one. **Check that the
old process is actually gone before concluding a fix did not work** —
a second instance that dies on bind leaves the first one serving the
old build, which looks exactly like a change that had no effect.

## Cloudflare tunnel disconnected

> Not yet verified in this project. The entries below come from the
> specification, not from a run.

- The token is wrong or expired. It comes from the Unraid
  environment, never from the repository.
- `docker compose --profile edge logs -f cloudflared` — the edge
  service only starts under that profile.
- An empty `CLOUDFLARE_TUNNEL_TOKEN` fails inside the container
  rather than blocking the whole stack from starting. That is
  deliberate: a required-variable marker on a profiled service makes
  `docker compose up` fail for everyone not running the edge.

## proxic.barnflix.net does not reach Arena Server

- The tunnel's public hostname must route to `arena-server:8080` over
  the internal network, not to a published host port.
- `docker compose ps` — the server must be `healthy`, not merely
  `Up`.
- Test the origin from inside the stack before blaming the edge:
  `docker compose exec cloudflared wget -qO- http://arena-server:8080/api/health/live`.

## Public HTTP works but the WebSocket fails

The classic edge misconfiguration, and worth stating plainly: a page
that loads perfectly proves nothing about `/ws`. The tunnel must pass
the `Upgrade` header through. Check the browser's network panel for
the 101 response — if the request returns 200 or 502 instead, the
upgrade never happened.
