# Deployment

Production runs on a single **linux/arm64** server from one Docker Compose file;
images are built by GitHub Actions and pulled from **ghcr.io** (public, tag `latest`).
Caddy is the edge (TLS + SPA + reverse-proxy). See the design spec + plan in
`docs/superpowers/` and the on-server guide in `deploy/README.md`.

## Images & CI

- **Backend** `ghcr.io/unividuell/countdown-core` — built with **Cloud Native Buildpacks** via
  `spring-boot:build-image`. Image name + `<docker><publishRegistry>` (`${env.GHCR_USERNAME}`/
  `${env.GHCR_TOKEN}`) live in the `spring-boot-maven-plugin` config; CI runs
  `./mvnw spring-boot:build-image -Dspring-boot.build-image.publish=true`.
- **Web** `ghcr.io/unividuell/countdown-web` — multi-stage Dockerfile (`node` build → `pnpm build`;
  then `caddy` with `dist/` + Caddyfile baked in). Postgres is the official `postgres:18`.
- **CI runner: `ubuntu-24.04-arm`** (GitHub-hosted, native arm64 — free for the public repo).
  Buildpacks don't cross-build, so build arm64 on an arm64 runner (not buildx/QEMU).
- Push to `main`, **path-filtered** so each app only rebuilds on its own changes;
  `permissions: { contents: read, packages: write }`, ghcr auth via `GITHUB_TOKEN`.
  Both workflows also declare **`workflow_dispatch`** for manual runs — and note that
  **path-filtered workflows do NOT trigger on the initial branch-creation push** (no diff
  base), so the first `build-web` had to be kicked off another way. Each workflow lists its
  own file in `paths`, so editing the workflow re-triggers it.
- **ghcr package visibility:** the `countdown-core`/`countdown-web` packages are kept **private**.
  The server therefore authenticates before pulling: `docker login ghcr.io -u <user>` with a
  token that has **`read:packages`** (the credential persists in `~/.docker/config.json`). CI
  publishes with the workflow `GITHUB_TOKEN` + `packages: write`.

## Caddy edge

- Terminates TLS (automatic HTTPS / Let's Encrypt) for the domain; serves the SPA with
  HTML5 history-mode fallback; reverse-proxies `/api`, `/oauth2`, `/login`, `/logout` to `core:8080`.
- **Routing gotcha:** use **two mutually-exclusive `handle` blocks** —
  `handle @backend { reverse_proxy core:8080 }` then `handle { root; try_files {path} /index.html; file_server }`.
  A bare `reverse_proxy @backend` + a catch-all `handle` compiles the SPA `file_server` *first*
  (it matches everything, incl. `/api/*`) → API requests 404→index.html instead of proxying.
  Verify route order with `caddy adapt`.
- The backend must set **`server.forward-headers-strategy=framework`** so it honours Caddy's
  `X-Forwarded-*` and builds correct `https://<domain>/...` URLs (OAuth `redirect_uri`!) + secure cookies.

## Backend production profile

- `application-production.yaml` (profile `production`): GitHub **client-id committed** (public),
  **client-secret via env**; explicit datasource to the compose `postgres` service; forward-headers;
  `Secure`/`SameSite=Lax` session cookies.
- **`spring-boot-docker-compose` is excluded from the prod image** automatically — it's
  `optional`/`runtime` in the pom and the Maven plugin's `repackage`/`build-image` defaults to
  `excludeDockerCompose=true`. So **no `spring.docker.compose.enabled=false` needed** (the support
  isn't on the prod classpath; the in-tests skip-check is irrelevant there).

## Server compose & ops

- Compose `name: countdown` (else it's derived from the dir). Postgres: named volume, **no host port**.
  Backend: internal only. Caddy: `80:80`, `443:443`, `443:443/udp` (HTTP/3). Secrets via a server-side
  **`.env`** (never committed).
- **`postgres:18` volume mount gotcha:** Postgres 18's Docker image moved `PGDATA` into a
  version subdir and the recommended mount point to **`/var/lib/postgresql`** (not the old
  `/var/lib/postgresql/data`). Mounting the named volume at `.../data` makes 18 **refuse to
  start** — it logs "PostgreSQL data in /var/lib/postgresql/data (unused mount/volume)" and
  crash-loops, which cascades (`UnknownHostException: postgres` in `core`, 502 at the edge).
  Mount the **parent**: `pgdata:/var/lib/postgresql`. (pg_dump/psql via `-h postgres` are
  unaffected — they go over the network.)
- **Backup:** a `db-backup` sidecar reusing `postgres:18` runs `pg_dump | gzip` to host `./backups`
  (7-day retention). Harden it: `entrypoint: ["/bin/bash","-c"]` + `set -eo pipefail` +
  `until pg_isready ...; do sleep 2; done` before each dump — otherwise a not-yet-ready Postgres makes
  `gzip` write a silent corrupt/empty archive (the pipe hides `pg_dump`'s failure). PITR is a later
  pgBackRest upgrade. **Compose gotcha:** in a `command:` block escape shell `$(...)` as `$$(...)`,
  else Compose interpolates it away.
- **Ops:** the server runs a `curl`-able **`update.sh`** that re-fetches the infra files
  (`compose.prod.yaml`, `README.md`, itself) from `main`, then
  `docker compose --env-file .env -f compose.prod.yaml pull && up -d`. Only `compose.prod.yaml` + `.env`
  (+ `README.md`/`update.sh`) live on the server; the Caddyfile is image-baked.

## pgAdmin in production

- Under a **`debug` compose profile** (off by default), bound to **`127.0.0.1` only** (never public,
  not proxied by Caddy), **login required**. Access via an SSH local-port-forward
  (`ssh -L 5050:127.0.0.1:5050 user@server`). Three layers: SSH boundary + loopback bind + pgAdmin login.

## Shared edge (multi-project host)

This server hosts several `unividuell.org` sites; only one process can bind 80/443. TLS +
host-routing live in the separate **`unividuell/edge-caddy`** repo (its own guideline:
shared-edge). countdown therefore:
- serves `countdown-web` on **`:80`** (Caddyfile address `:80`, not the domain) — no own TLS;
- **publishes no host ports**; the `countdown-web` container joins the external **`edge`**
  network (stable `container_name: countdown-web`) and an `internal` net for `core`/`postgres`;
- relies on the edge for the two-hop `X-Forwarded-*` chain (edge → countdown-web → core), so
  `forward-headers-strategy=framework` still yields `https://countdown.unividuell.org/...`.
- Server dir is `/opt/unividuell/countdown/`.

**Two-hop scheme loss (OAuth `redirect_uri` = `http://`):** by default the inner `countdown-web`
Caddy receives the edge hop on plaintext `:80` and **overwrites** `X-Forwarded-Proto` with `http`,
so `core` builds an `http://` `redirect_uri` (GitHub rejects it; insecure). Fix in `countdown-web`'s
Caddyfile with a global `servers { trusted_proxies static private_ranges }` block — the edge reaches
it over the private `edge` network, so trusting private ranges makes Caddy **preserve** the edge's
`X-Forwarded-Proto=https`/`-Host`. The Caddyfile is baked into the image → this needs a `build-web`
rebuild + `docker compose pull && up -d` on the server.

## Docker Desktop gotcha (local, macOS)

This project lives under `/opt`, which Docker Desktop does **not** share by default → host
**bind mounts** (`docker run -v /opt/...`) fail with "mounts denied". Avoid them:
- inject small config files via inline compose **`configs: [{ content: ... }]`** (no host mount);
- validate a Caddyfile by piping it via **stdin** into a container
  (`docker run -i caddy:2-alpine sh -c 'cat > /tmp/Caddyfile && caddy adapt --config /tmp/Caddyfile --adapter caddyfile'`),
  not with `-v`.
Named volumes are unaffected (Docker-managed).
