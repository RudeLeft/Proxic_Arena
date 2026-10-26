# Installing Proxic Arena on Unraid

Three commands, then the GUI. Everything that used to be a manual
step — creating directories, fixing their ownership, generating
secrets, remembering `-f` flags, remembering to rebuild — is now done
by the project instead of by a person.

> **Verified on a real Unraid 6.12/7.x host.** The notes marked
> *Found by deploying* are failures this document exists to prevent.
>
> This gets the stack running and reachable on the LAN. Going public
> through `proxic.barnflix.net` is `UNRAID_CHECKLIST.md`.

**Everything requires a sign-in** (since 2026-10-24, the version and
the health checks too -- those answer only from inside the container),
and accounts are created by hand. Between
the stack starting and Step 5 below, the site shows a login nobody
can get past. That is expected, not a fault.

---

## Step 0 — Install Docker Compose Manager (first time only)

Unraid ships Docker but not the compose plugin.

1. Unraid web UI → **Apps** (Community Applications).
2. Search **Docker Compose Manager** (author: dcflachs) → **Install**.
3. A **Compose** section appears at the bottom of the **Docker** tab.

Check it took:

```bash
docker compose version
```

A version number means yes. "docker: 'compose' is not a docker
command" means the plugin did not install its binary — stop there.

**Disk space:** about **1.5 GB** for the pulled image. The host no
longer builds, so the Forge clone and Maven cache that used to need
~4 GB of array are GitHub's problem now.

---

## Step 1 — Get the code

Everything lives under one folder, `/mnt/user/appdata/proxic_arena/`:
the repository in `src/`, the data in `v2/`.

```bash
mkdir -p /mnt/user/appdata/proxic_arena && cd /mnt/user/appdata/proxic_arena
git clone https://github.com/RudeLeft/Proxic_Arena.git src
cd src && git log --oneline -1
```

The repository goes in `src/` rather than directly in
`proxic_arena/`, so the Compose Manager's own bookkeeping files land
beside the code and nowhere near the database. That separation is the
whole requirement — not which parent folder they sit under.

The repository is **public**; no credentials needed. If `git` is
missing, install **NerdTools** from Community Applications, or copy
the folder over SMB (it is small — 9.8 MB).

Check the commit line is the one you expect. A deployment built from
the wrong commit is the kind of thing nobody notices for a week.

## Step 2 — Run the setup script

```bash
sh scripts/unraid-setup.sh
```

It writes `.env`: production mode, a 32-byte session secret, a
16-byte database password, the public URL, and `COMPOSE_FILE` so that
no command ever needs `-f` flags again.

Safe to run twice. **It never regenerates a secret that is already
set** — doing so to `POSTGRES_PASSWORD` would lock the server out of
an existing database, because PostgreSQL keeps whatever `initdb` was
given.

It prints what it did, never a secret value.

## Step 3 — Add the stack in the GUI

**Docker** tab → **Compose** → **Add New Compose Stack**:

| Field | Value |
| --- | --- |
| Stack Name | `proxic-arena` — exactly |
| Compose Source | **External folder** |
| folder | `/mnt/user/appdata/proxic_arena/src` |
| External ENV File Path | leave blank |
| Compose File Discovery | leave as default |

**The name must match.** `docker-compose.yml` sets
`name: proxic-arena` internally, but a `-p` flag from the plugin
overrides it. If the two disagree you get a second set of containers
on the same bind mounts, fighting over the same port. Two compose
files sharing a project name once replaced this stack's database with
a development one.

Leave discovery alone: `COMPOSE_FILE` in `.env` already names
`docker-compose.yml` and `docker-compose.unraid.yml`.

`docker-compose.local.yml` is **not** among them, deliberately — it
turns `Secure` off on session cookies, which is right for a laptop on
plain HTTP and wrong for anything reachable from outside.

## Step 4 — Compose Up

Press it. The host **pulls** a published image rather than building
one, so this takes about a minute rather than ten, and needs no
build space on the array.

Three things happen without being asked:

```text
init-data      chowns the data directory to the server's uid, exits
postgres       starts, becomes healthy
arena-server   pulls ghcr.io/rudeleft/proxic_arena:latest, then starts
```

- **`pull_policy: always`** is why there is no build step. GitHub
  Actions builds on every push to `main`; the host only ever pulls.
  Updates afterwards are two clicks — `UPDATING.md`.
- **`init-data`** is why there is no `chown` step. Docker creates a
  missing bind-mount source as `root`, the server runs as uid 100,
  and card art would fail with permission denied on the first import.

Watch the `arena-server` log for `Successfully applied N migrations`
(five on a fresh database, V001 through V005).

The image is public — an anonymous pull was verified — so nothing
needs a login. If a pull is ever refused with `denied`, check the
package's visibility: GitHub → the repository's **Packages** →
`proxic_arena` → **Package settings**.

If it stops with **"Forge mismatch"**, that is the §1.61 guard
refusing to build from the wrong source, not a network problem.

## Step 5 — Create your account

Only the first administrator is made here. Everyone after that is
invited from the Admin page (**+ Invite**): they get a one-time link and
choose their own username and password. To have the server email those
links, see "Invitation email" below; without it, the Admin page gives
you the link to send yourself.

**Docker** tab → `arena-server` → **Console**:

```bash
/app/bin/arena-admin create RudeLeft --admin
```

It prompts for the password — twice, not echoed, never on a command
line, never in shell history. **Minimum 12 characters**, no other
rules.

A password passed as `--password=...` is **refused outright**
(§3.58). Then:

```bash
/app/bin/arena-admin list
```

## Step 6 — Verify

```bash
docker compose exec arena-server wget -qO- http://127.0.0.1:8080/api/health/ready
```

Expected, exactly:

```json
{"status":"ok","checks":{"dataRoot":"ok","database":"ok","forgeWorker":"ok"}}
```

Open `http://<unraid-ip>:8765` — five indicators, all **Ready**.

> **Signing in will not work on that address, by design.** A browser
> will not keep a `Secure` cookie delivered over plain HTTP, so the
> login silently bounces back to the form. Use
> `https://proxic.barnflix.net`. The LAN port is for diagnostics
> (owner decision D2); `docs/operations/troubleshooting/AUTHENTICATION.md`
> leads with this.

If an indicator is not Ready:

| Indicator | Where to look |
| --- | --- |
| Database | `docker compose logs postgres`; check `POSTGRES_PASSWORD` |
| Forge Runtime | the five-state table in `FOUNDATION.md` |
| WebSocket | nothing between you and it yet; it should just work |
| Pixi Renderer | the browser console |

## Step 7 — Confirm the database is not exposed

```bash
docker compose ps
```

`postgres` must show `5432/tcp` with **no** host binding, and from
another machine `curl http://<unraid-ip>:5432` must fail.

Port 8765 **will** answer — that is PHASE 1 AMENDMENT 2, and it means
anything on your LAN can reach the server. Health and version are
public there; everything else needs a session.

## Step 8 — Survive a reboot

`restart: unless-stopped` is set, so Docker restarts containers
itself. The Unraid-specific risk is Docker starting before the array
mounts, leaving a bind mount under `/mnt/user` missing.

**Verified on this host, 2026-10-15:** Docker started after the array
mounted, the stack came back unattended, and readiness reported
`database: ok`, `forgeWorker: ok` through the tunnel.

---

## Where things are afterwards

```text
/mnt/user/appdata/proxic_arena/src/          repository, compose files, .env
/mnt/user/appdata/proxic_arena/v2/postgres   database
/mnt/user/appdata/proxic_arena/v2/data       card art and uploads (/data)
```

The data lives under `appdata` so Unraid's backup routines and the
Appdata Backup plugin find it. Named Docker volumes would work and
would be invisible to all of it.

The `v2/` level is not decoration. *Found by deploying:* Unraid's
compose tooling writes `name` and `project_name` files into appdata
subdirectories, and PostgreSQL's `initdb` **refuses a data directory
that is not empty** — two 8-byte files were enough to restart-loop
the database.

## Everyday commands

From the project folder, where `.env` sets `COMPOSE_FILE`:

```bash
docker compose ps                   # what is running
docker compose logs -f arena-server # follow the log
docker compose down                 # stop; data survives
docker compose up -d                # start, pulling if a newer image exists
```

**To deploy new code you need none of these.** In the Compose
plugin: *Check for Updates*, then *Update Stack*. See
`UPDATING.md`, including how to confirm which build is live and how
to roll one back.

> `docker compose down -v` destroys named volumes. Your data is in
> bind mounts so `-v` will not take it — but do not rely on that.
> Deleting the appdata folders will.

## Next

`UNRAID_CHECKLIST.md` for the Cloudflare tunnel and the remaining
acceptance tests.

## Invitation email (optional, spec 0014)

The Admin page's **+ Invite** can email the invitation link itself. Set
the account up on the Admin page's **Email account** tab: the email
server, port, security, username, password and From, then **Save** and
**Send a test email to** yourself. The tab says in plain words what went
wrong if the test fails. The password is stored encrypted and never
shown again; to change provider, fill the tab in again.

For Gmail, use a dedicated account (e.g. proxicarena@gmail.com) with
2-Step Verification on, and an **app password** (Google Account →
Security → App passwords), never the normal password. "Use Gmail's"
fills in the server and port.

Until it is set up, the Invite dialog says so and shows the link to copy.

The settings file can still carry the account instead (the tab's
settings win when both exist):

```text
PROXIC_SMTP_HOST=smtp.gmail.com
PROXIC_SMTP_PORT=587
PROXIC_SMTP_SECURITY=starttls
PROXIC_SMTP_USERNAME=you@gmail.com
PROXIC_SMTP_PASSWORD=<a Gmail app password>
PROXIC_SMTP_FROM=Proxic Arena <you@gmail.com>
```

The tab's password is encrypted with a key made from
`PROXIC_SESSION_SECRET`: if that secret is ever changed, type the email
password into the tab again.
