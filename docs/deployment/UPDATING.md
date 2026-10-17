# Updating the server

**Two clicks. No terminal, no git, no build.**

```text
Unraid -> Docker -> Compose -> proxic-arena
    CHECK FOR UPDATES        (arena-server shows an update)
    UPDATE STACK             (pulls and recreates)
```

That is the whole procedure. What follows is why it works, how to
confirm it worked, and what to do when it does not.

---

## Why it used to need a terminal

The host built the image itself, from source it had to fetch first:

```text
git pull                     on the right checkout
docker compose up -d --build 3-10 minutes, ~4 GB of array
                             and hope Compose recreates the container
```

Three ways that went wrong in practice, all of them real:

- **`git pull` in the wrong copy.** The sources updated somewhere the
  build never read.
- **`up --build` left the old container running.** Compose decides
  whether to replace a container from a config hash, and the service
  definition had not changed — only the image contents behind the
  same tag. The build succeeded, the stack went green, the host kept
  serving old code.
- **No way to tell.** `/api/version` reported `buildId: null`, so
  answering "what is actually deployed?" meant comparing frontend
  bundle hashes and asking the image to grep itself.

The Compose plugin's own Update buttons could not help, because they
read **registries** — and said `not checked` next to a locally built
image, which is exactly right and completely useless.

## What happens now

```text
push to main
   -> build the candidate image          ghcr.io/...:ci-<sha>
   -> static analysis + 49 frontend tests
   -> 233 server tests                   against that image's Forge
   -> 29 browser tests                   against that image, running
   -> all green? retag it latest and <sha>
   -> Unraid: Check for Updates -> Update Stack
```

**Nothing becomes `latest` until the tests pass.** Deploying is two
clicks now, which makes a bad build as easy to ship as a good one —
so the gate stands where the risk moved to.

The image is built once and **promoted by retagging**, never rebuilt
for publication. The bytes you deploy are the exact bytes that
passed; a gate that tests one build and ships another is not a gate.

If a run fails, no new image appears, your Update button stays quiet,
and the server keeps running what it was running.

The host pulls a finished image. It never compiles anything, never
needs the repository, and never needs 4 GB free to deploy.

The image carries the commit it was built from, so the question that
used to take twenty minutes takes one request.

---

## Confirming an update landed

```text
https://proxic.barnflix.net/api/version
```

```json
{"proxicVersion":"0.1.0", ..., "buildId":"6b7e1b7e7f80c8dc3176498c0b4c3cdb46fa134a"}
```

`buildId` is the commit. Compare it with the latest commit on
`main`; if they match, that is what is running. A local build
reports `dev`, which is honest about being neither published nor
reproducible.

Database migrations apply themselves when the new container starts —
watch for `flyway applied=N` in the log if a release includes schema
changes.

---

## Rolling back

Every build is published under its commit as well as `latest`, so a
rollback is a tag change rather than a rebuild. In the Compose
plugin, edit the stack's compose file:

```yaml
image: ghcr.io/rudeleft/proxic_arena:<the previous commit sha>
```

then **Update Stack**. Put `:latest` back when the fix ships.

Data is unaffected: it lives in `/mnt/user/appdata/proxic_arena/v2/`,
not in the image. **Migrations are the exception** — rolling the code
back does not roll a schema change back, so a release that migrated
the database needs a word first.

---

## When the GUI will not do it

Rare, and each has a plain cause.

**"Check for Updates" says nothing changed.** Either the run is still
going — the full gate takes about fifteen minutes — or it failed and
nothing was published. The Actions tab on GitHub says which, and a
failed run names the test that stopped it.

That is the gate working. The alternative is a green button that
deploys a broken build.

**It updated, but the site looks the same.** Check `buildId` first.
If it changed, the server is new and the browser is holding the old
page — hard-refresh with Ctrl+Shift+R. If it did not change, the pull
did not reach the container; use the terminal form below.

**The terminal form, when you want certainty:**

```bash
cd /mnt/user/appdata/proxic_arena/src && docker compose pull && docker compose up -d --force-recreate
```

`--force-recreate` is the part that matters. It is what was missing
the day a correct build sat in a correct image while the old
container kept running.

**The image will not pull** — `denied` or `unauthorized`. The package
must be public for the host to pull without credentials. The first
publish came out public on its own, inheriting the repository's
visibility, and an anonymous pull was verified before this was
written. If that ever changes: GitHub → the repository's
**Packages** → `proxic_arena` → **Package settings** → visibility
**public**.

---

## What did not change

- **`.env` still lives on the host** and is never published. Secrets
  are not in the image.
- **Data still lives in appdata** and survives every update,
  rollback and container recreation.
- **The first install** is still `UNRAID_INSTALL.md`. This document
  is about the updates after it.
- **Local development still builds from source.**
  `docker-compose.local.yml` adds the build back, because a
  developer wants the code in front of them rather than the last
  thing published.
