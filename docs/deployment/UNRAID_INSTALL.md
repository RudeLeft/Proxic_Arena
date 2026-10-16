# Installing Proxic Arena on Unraid — step by step

> **Not yet run on a real Unraid host.** Written from the
> specification, the compose files and how Unraid generally works.
> The first execution is the verification (§1.71). If a step does
> not match what you see, stop and tell me — do not improvise around
> it, because a workaround that happens to work is how undocumented
> deployments start.
>
> Assumes Unraid **6.12 or 7.x**. If you are on something older,
> tell me and I will adjust.

This gets the stack running and reachable **on the LAN only**.
Putting it behind `arena.barnflix.net` is
`UNRAID_CHECKLIST.md`, deliberately separate — get it running
first, go public second.

---

## Step 1 — Install Docker Compose

Unraid ships Docker but not the compose plugin.

1. Open the Unraid web UI → **Apps** (Community Applications).
2. Search for **Docker Compose Manager** (author: dcflachs).
3. Click **Install**. It takes a few seconds.
4. A **Compose** section appears at the bottom of the **Docker**
   tab.

**Verify before moving on.** Open a terminal (the `>_` icon in the
Unraid header, or SSH in) and run:

```bash
docker compose version
```

You want a version number. If you get "docker: 'compose' is not a
docker command", the plugin did not install its binary — stop and
tell me what it printed.

## Step 2 — Get the code onto the server

In the Unraid terminal:

```bash
mkdir -p /mnt/user/appdata/proxic-arena
cd /mnt/user/appdata
git clone <your-repo-url> proxic-arena-src
cd proxic-arena-src
git log --oneline -1
```

If `git` is missing, install **NerdTools** from Community
Applications and enable git, or copy the folder over SMB instead —
the repository is small (the heavy parts are gitignored).

Check the last commit line matches what you expect. A deployment
built from the wrong commit is the kind of thing nobody notices for
a week.

**Disk space:** you need roughly **4 GB free** on the array for the
build. The finished image is 986 MB; the Forge clone and Maven cache
inside the build are temporary but real.

## Step 3 — Create the data directories

```bash
mkdir -p /mnt/user/appdata/proxic-arena/postgres
mkdir -p /mnt/user/appdata/proxic-arena/data
```

These are where the database and the application's files live. They
sit under `appdata` on purpose: that is where Unraid's backup
routines and the Appdata Backup plugin look. Named volumes inside
Docker's own storage would work and would be invisible to all of it.

## Step 4 — Create `.env`

```bash
cd /mnt/user/appdata/proxic-arena-src
cp .env.example .env
```

Generate real secrets:

```bash
openssl rand -hex 32    # paste as PROXIC_SESSION_SECRET
openssl rand -hex 16    # paste as POSTGRES_PASSWORD
```

Edit `.env` (`nano .env`) and set:

```text
APP_ENV=production
POSTGRES_PASSWORD=<the 16-byte value>
PROXIC_SESSION_SECRET=<the 32-byte value>
```

Leave `CLOUDFLARE_TUNNEL_TOKEN` empty. That belongs to the public
step, not this one.

**The placeholders must go.** The server refuses to start in
production while a secret is missing or still says `changeme`, and
exits **78**. If that happens the message names the variable — it is
the guard working, not a bug.

`.env` must sit **next to `docker-compose.yml`**. If you later use
the Compose Manager UI and it keeps projects in its own folder,
the file has to be in *that* folder. Putting it somewhere
reasonable-looking but wrong produces a refusal naming a variable
you are certain you set.

## Step 5 — Build the image

```bash
cd /mnt/user/appdata/proxic-arena-src
docker compose build
```

- Expect **3–10 minutes** on a typical Unraid box (75 seconds on a
  developer laptop; the Forge clone and compile dominate, and your
  array is slower than an SSD).
- Needs outbound internet: GitHub, Maven Central, npm.
- The build **clones upstream Forge and verifies the commit**. If it
  stops with "Forge mismatch", that is the §1.61 guard refusing to
  build from the wrong source — not a network problem.

## Step 6 — Start it

```bash
docker compose -f docker-compose.yml -f docker-compose.unraid.yml \
               -f docker-compose.local.yml up -d
```

Three files, each doing one thing:

| File | Why |
| --- | --- |
| `docker-compose.yml` | the stack itself |
| `docker-compose.unraid.yml` | puts the data under `/mnt/user/appdata` |
| `docker-compose.local.yml` | publishes port 8080 so you can reach it on the LAN **before** the tunnel exists |

> Drop `docker-compose.local.yml` once the tunnel is working. In
> production the tunnel reaches the server over Docker's internal
> network and **no host port should be published** (§1.51).

Watch it come up:

```bash
docker compose ps
```

Postgres becomes healthy first, then arena-server — allow about
45 seconds.

## Step 7 — Verify

```bash
curl -s http://127.0.0.1:8080/api/health/ready
```

Expected, exactly:

```json
{"status":"ok","checks":{"dataRoot":"ok","database":"ok","forgeWorker":"ok"}}
```

Then open `http://<unraid-ip>:8080` in a browser. You should see the
foundation page with five indicators, all **Ready**.

If any is not:

| Indicator | Where to look |
| --- | --- |
| Database | `docker compose logs postgres`; check `POSTGRES_PASSWORD` |
| Forge Runtime | the five-state table in `FOUNDATION.md` — it names which one |
| WebSocket | nothing between you and it yet, so this should just work |
| Pixi Renderer | browser console |

`docs/troubleshooting/FOUNDATION.md` covers each failure.

## Step 8 — Make sure the database is not exposed

```bash
docker compose ps
```

`postgres` must show `5432/tcp` with **no** host binding. From
another machine:

```bash
curl http://<unraid-ip>:5432
```

must fail. If it answers, something published the database and that
needs fixing before anything else.

## Step 9 — Survive a reboot (do this now, while it is empty)

`restart: unless-stopped` is set, so Docker restarts the containers
by itself. The thing worth testing is Unraid-specific: if Docker
starts before the array is mounted, a bind mount under
`/mnt/user` may not be there yet.

Reboot the server deliberately, now, while the database holds
nothing. Then re-run step 7. If the stack comes back unhealthy,
that is much better learned today than after Phase 2 has stored
decks.

---

## Where things are afterwards

```text
/mnt/user/appdata/proxic-arena-src/     the repository and compose files
/mnt/user/appdata/proxic-arena/postgres database
/mnt/user/appdata/proxic-arena/data     application data (/data)
```

## Everyday commands

```bash
cd /mnt/user/appdata/proxic-arena-src

docker compose ps                        # what is running
docker compose logs -f arena-server      # follow the server log
docker compose down                      # stop; data survives
docker compose up -d                     # start again
docker compose build && docker compose up -d   # after a git pull
```

> `docker compose down -v` **destroys the volumes.** With the Unraid
> override your data is in bind mounts, so `-v` will not take it —
> but do not rely on that. Deleting the appdata folders will.

## Next

Once all five indicators are green on the LAN, go to
`UNRAID_CHECKLIST.md` for the Cloudflare tunnel and the four
remaining acceptance tests.

Before you do, read its first section: there is **no authentication
until Phase 3**, so making the public hostname live means anyone who
reaches it can use the server.
