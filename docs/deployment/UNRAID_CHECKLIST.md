# Unraid deployment checklist

**For closing PHASE_01 §1.48–§1.51 and acceptance tests P1-R–P1-U.**

> **None of this has been run.** Every step below is written from the
> Phase 1 specification and the compose files, not from a deployment.
> The first execution **is** the verification (§1.71). Expect at
> least one step to be wrong, and treat a surprise as information
> rather than as something to work around.

Work top to bottom. Stop at the first step whose result you did not
expect, and send me what it said.

**Install the stack first.** `UNRAID_INSTALL.md` gets it running and
reachable on the LAN. This document is only the public step.

---

## Before you touch anything

- [ ] **The current deployment is live.** The existing Proxic Arena
      on Unraid keeps running until the new stack is proven. Nothing
      below stops it — but read the port check in step 3 before
      starting anything.
- [ ] **Note how to roll back.** Write down what is running now and
      how to restart it, before you change the tunnel route. The
      rollback is "point the tunnel back", and that only works if
      you know where it pointed.
- [ ] **Decide whether the public hostname should be live at all
      yet.** There is **no authentication until Phase 3**. Anyone who
      reaches `arena.barnflix.net` can use the server. Nothing is
      behind it yet, so the risk today is small — but if you would
      rather keep it private, verify through the tunnel with
      Cloudflare Access in front, or test and then take the route
      down again.

## 1. Get the code onto the host

- [ ] Clone the repository to the Unraid box (or copy it).
- [ ] Confirm `git log --oneline -1` matches what you expect.
- [ ] You need **Docker** and **git** on the host. Nothing else —
      the image builds its own Java, Node and Maven.

Disk: the build needs roughly **4 GB** free. The final image is
986 MB; the Forge clone and Maven cache inside the build are
transient but real.

## 2. Create `.env`

- [ ] `cp .env.example .env`
- [ ] Generate real values — do **not** keep the placeholders:
      ```bash
      openssl rand -hex 32    # PROXIC_SESSION_SECRET
      openssl rand -hex 16    # POSTGRES_PASSWORD
      ```
- [ ] Set `APP_ENV=production`.
- [ ] Leave `CLOUDFLARE_TUNNEL_TOKEN` empty for now. You will add it
      in step 6.
- [ ] Confirm `.env` is **not** tracked: `git status --short` should
      not list it.

The server refuses to start in production with a missing or
placeholder secret and exits **78**. If that happens, it is working
as intended — read the message, it names the variable.

## 3. Check the ports before building

- [ ] `docker ps` — note anything already bound to 8080 or 5432.

The new stack publishes **no host ports at all** by default, so a
clash is unlikely. If you want to reach it directly on the host for
testing, that is step 5.

## 4. Build

```bash
docker compose build
```

- [ ] Expect **2–5 minutes** (75 s on a developer laptop; the Forge
      clone and compile dominate).
- [ ] The build **clones upstream Forge** and will fail outright if
      the commit does not match `forge-pin.properties`. That is the
      §1.61 guard, not a network error — the message says which
      commit it found.
- [ ] Needs outbound network: GitHub, Maven Central, npm.

## 5. Start without the tunnel, and verify internally

```bash
docker compose up -d
docker compose ps
```

- [ ] Both services reach **healthy** (postgres first, then
      arena-server; give it ~45 s).
- [ ] Readiness, from inside the network — there is no host port:
      ```bash
      docker compose exec arena-server wget -qO- http://127.0.0.1:8080/api/health/ready
      ```
      Expect:
      ```json
      {"status":"ok","checks":{"dataRoot":"ok","database":"ok","forgeWorker":"ok"}}
      ```
- [ ] If `forgeWorker` is anything else, stop here —
      `docs/troubleshooting/FOUNDATION.md` has a table of the five
      states and what each one means.

**Optional, to see it in a browser before the tunnel exists:**

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
```

That publishes `127.0.0.1:8080` on the host only. Take it back down
to the base file before going live — in production the tunnel should
reach the server over the internal network and no host port should be
published (§1.51).

## 6. Point the tunnel at the new origin

This is the step most likely to need adjusting to your existing
Cloudflare setup, and the one I cannot predict.

- [ ] In the Cloudflare dashboard, find the tunnel currently serving
      `arena.barnflix.net` and **note its current origin** before
      changing it. This is your rollback.
- [ ] The new origin is `http://arena-server:8080` — reachable only
      if `cloudflared` runs **inside this compose stack**, on the
      `edge` network. That is what §1.50 specifies.
- [ ] Put the tunnel token in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`.
- [ ] Start it:
      ```bash
      docker compose --profile edge up -d
      docker compose --profile edge logs -f cloudflared
      ```
- [ ] The logs should show a registered connection. An empty token
      fails **inside cloudflared**, visibly — it does not block the
      rest of the stack.

> If your existing tunnel runs as its own Unraid container rather
> than inside this stack, §1.50 explicitly allows the equivalent
> target — but it must still reach `arena-server` over a shared
> Docker network, not a published host port. Tell me which shape
> yours is and I will adjust the compose file.

## 7. The four acceptance tests

- [ ] **P1-R — public page.** Open `https://arena.barnflix.net`. The
      foundation page loads, all five indicators green.
- [ ] **P1-S — public API.**
      ```bash
      curl -s https://arena.barnflix.net/api/health/ready
      ```
- [ ] **P1-T — public WebSocket.** The page's WebSocket indicator
      says **Ready**. If the page loads but that indicator does not,
      the tunnel is not passing the `Upgrade` header — a page loading
      perfectly proves nothing about `/ws`. The browser network panel
      should show a **101** for `/ws/system`.
- [ ] **P1-U — security preserved.**
      ```bash
      curl -sI https://arena.barnflix.net | grep -i strict-transport-security
      ```
      HSTS must still be present (§1.49). If it vanished, the route
      change dropped it — that is a finding, not a detail.

You can also run the browser suite against production from your
development machine:

```bash
cd frontend
PROXIC_E2E_URL=https://arena.barnflix.net npx playwright test
```

All 7 should pass unchanged. That is the strongest single check in
this list, because it asserts the same things against the real
deployment that pass locally.

## 8. Confirm what should NOT be reachable

- [ ] `docker compose ps` — postgres shows `5432/tcp` with **no**
      host binding.
- [ ] From another machine on the LAN, `curl http://<unraid-ip>:8080`
      should **fail**. If it answers, a host port is published that
      should not be.
- [ ] `https://arena.barnflix.net:5432` and any direct database
      exposure: nothing.

## 9. Tell me the results

Send me:

- the readiness JSON from step 5,
- whether each of P1-R–P1-U passed,
- the HSTS header line,
- anything that surprised you.

I will update `PHASE_01_EXIT_GATE.md` and
`PHASE_01_DELIVERABLES.md` with the real results and, if all four
pass, Phase 1's gate closes.

---

## If you need to roll back

```bash
docker compose --profile edge down     # stop the new stack and tunnel
```

Then point the tunnel's origin back to what you noted in step 6. The
old deployment was never stopped, so it should serve again as soon as
the route returns to it.

Volumes survive `down`. Only `down -v` destroys them, and there is no
undo.

---

## What this does not cover

- **Backups.** Nothing here backs up the new database, because it
  holds nothing yet. Before Phase 2 stores a deck, that needs
  answering.
- **Automatic start on boot.** `restart: unless-stopped` is set, so
  Docker restarts the containers — but if Unraid's Docker service
  starts before your array is mounted, a named volume may not be
  where it should be. Worth testing a reboot once, deliberately,
  while nothing valuable is stored.
- **Retiring the old deployment.** Decide that after the new one has
  run for a while, not on the same day.
