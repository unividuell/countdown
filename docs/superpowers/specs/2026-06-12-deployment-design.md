# Deployment — Containers, CI, and Self-Hosted Compose

**Status:** Approved design (2026-06-12)
**Repo:** https://github.com/unividuell/countdown (public)
**Target server:** single self-hosted host, **linux/arm64**

## Purpose

Ship `countdown.unividuell.org` to production: build container images for the
Spring Boot backend and the Vue SPA on every push to `main` (GitHub Actions →
GitHub Container Registry), and run backend + SPA-via-Caddy + PostgreSQL on the
server from a single Docker Compose file. Caddy is the edge: TLS termination,
SPA delivery, and reverse-proxy to the backend (same-origin, matching the
backend's session/CSRF/401 contract). PostgreSQL persists data with
backup-friendly logical dumps.

## Decisions

| Topic | Decision |
|---|---|
| Registry | **ghcr.io** (public packages); images tagged `latest`. |
| Backend image | `ghcr.io/unividuell/countdown-core:latest` — built with **Cloud Native Buildpacks** via `spring-boot:build-image` (image name pinned in the plugin config). |
| Web image | `ghcr.io/unividuell/countdown-web:latest` — multi-stage Dockerfile (Node build → `pnpm build`; then `caddy` with `dist/` + Caddyfile baked in). |
| Database | official `postgres:18` (no custom image). |
| Architecture | all images **linux/arm64**. |
| CI runner | **`ubuntu-24.04-arm`** (GitHub-hosted, native arm64 — free for this public repo; Buildpacks don't cross-build well). |
| CI trigger | every push to `main` (path-filtered per app). Build **and push** only. |
| Deploy | **manual pull on the server** (`docker compose pull && up -d`); no CI→server access. |
| Backend prod config | Spring profile `production`; GitHub client-id committed in the prod profile, client-secret via env. |
| `spring-boot-docker-compose` in prod | **Not present** — it's `optional`/`runtime` and the Maven plugin's `repackage`/`build-image` excludes it (`excludeDockerCompose=true` by default). No `spring.docker.compose.enabled=false` needed. |
| TLS / edge | **Caddy** terminates TLS (automatic HTTPS / Let's Encrypt) for `countdown.unividuell.org`, serves the SPA (history-mode fallback), reverse-proxies the API paths to the backend. |
| PG persistence | named volume `pgdata`. |
| PG backup | **daily `pg_dump` logical dumps** (sidecar reusing `postgres:18`) to a host-mounted `./backups`, retention 7 days. No PITR (deliberately; can be added later as an isolated change — see "PITR upgrade path"). |
| Server bootstrap | files fetched from the public repo via `curl` (raw.githubusercontent); the server only needs `compose.prod.yaml` + `.env`. |

## Architecture

```
                 Internet (HTTPS :443 / :80)
                          │
                   ┌──────▼───────┐   countdown-web image
                   │    Caddy     │   - TLS (Let's Encrypt)
                   │   (edge)     │   - serves /srv (SPA, history fallback)
                   └──┬────────┬──┘   - reverse_proxy /api,/oauth2,/login,/logout
          static SPA  │        │ proxied API paths
                      │        ▼
                      │   ┌─────────┐   countdown-core image (Spring Boot, prod)
                      │   │  core   │   core:8080  (no host port)
                      │   └────┬────┘
                      │        │ jdbc
                      │   ┌────▼────┐   postgres:18  (no host port)
                      │   │postgres │←── db-backup sidecar → ./backups (pg_dump)
                      │   └─────────┘   volume: pgdata
```

All services share the compose network; only Caddy publishes host ports (80/443).

## Images & CI

### Backend (`countdown-core`)
- Image name pinned in `core/pom.xml` `spring-boot-maven-plugin` →
  `<image><name>ghcr.io/unividuell/countdown-core:latest</name></image>`.
- Workflow `.github/workflows/build-core.yml`: on push to `main` (paths `core/**`),
  runs on `ubuntu-24.04-arm`, `permissions: { packages: write, contents: read }`:
  - `setup-java` (Temurin 25), log in to ghcr (`docker/login-action`, `GITHUB_TOKEN`),
  - `cd core && ./mvnw -B spring-boot:build-image -Dspring-boot.build-image.publish=true`
    with publish-registry credentials wired to `github.actor` / `GITHUB_TOKEN`.
  - Native arm64 image (runner is arm64) → published to ghcr.

### Web (`countdown-web`)
- `deploy/web.Dockerfile` (multi-stage):
  ```dockerfile
  FROM node:24-alpine AS build
  RUN corepack enable
  WORKDIR /app
  COPY webapp-vue/package.json webapp-vue/pnpm-lock.yaml ./
  RUN pnpm install --frozen-lockfile
  COPY webapp-vue/ .
  RUN pnpm build
  FROM caddy:2-alpine
  COPY deploy/Caddyfile /etc/caddy/Caddyfile
  COPY --from=build /app/dist /srv
  ```
- Workflow `.github/workflows/build-web.yml`: on push to `main` (paths `webapp-vue/**`,
  `deploy/Caddyfile`, `deploy/web.Dockerfile`), on `ubuntu-24.04-arm`: ghcr login →
  `docker build -f deploy/web.Dockerfile -t ghcr.io/unividuell/countdown-web:latest .`
  (native arm64) → `docker push`.

### Caddyfile (`deploy/Caddyfile`)
```
countdown.unividuell.org {
    encode zstd gzip
    @backend path /api/* /oauth2/* /login/* /logout/*
    reverse_proxy @backend core:8080
    handle {
        root * /srv
        try_files {path} /index.html
        file_server
    }
}
```
- Automatic HTTPS for the domain (needs DNS A/AAAA → server + ports 80/443 reachable).
- Forwards `X-Forwarded-*` by default → the backend builds correct
  `https://countdown.unividuell.org/...` URLs (OAuth `redirect_uri`).

## Backend production profile (`core/src/main/resources/application-production.yaml`)

```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          github:
            client-id: <PROD_GITHUB_CLIENT_ID>     # committed (public)
            client-secret: ${GITHUB_CLIENT_SECRET}  # env
            scope: read:user
  datasource:
    url: jdbc:postgresql://postgres:5432/app
    username: admin
    password: ${POSTGRES_PASSWORD}

server:
  forward-headers-strategy: framework   # honour Caddy's X-Forwarded-*

# session/CSRF cookies secured over HTTPS in production
```
- Activated via `SPRING_PROFILES_ACTIVE=production`.
- Module-based Flyway stays enabled; migrations run on the `app` DB at startup.
- Cookies marked `Secure` in prod (the app is behind HTTPS via Caddy + forwarded headers).
- **Requires a dedicated production GitHub OAuth App** with callback
  `https://countdown.unividuell.org/login/oauth2/code/github`; its client-id goes
  into this profile, its secret into `GITHUB_CLIENT_SECRET`.

## Server compose (`deploy/compose.prod.yaml`)

```yaml
name: countdown

services:
  postgres:
    image: postgres:18
    environment: [ POSTGRES_DB=app, POSTGRES_USER=admin, 'POSTGRES_PASSWORD=${POSTGRES_PASSWORD}' ]
    volumes: [ 'pgdata:/var/lib/postgresql/data' ]
    # no host port — only reachable on the compose network

  db-backup:
    image: postgres:18           # reuse → guaranteed arm64, pg_dump available
    environment: [ 'PGPASSWORD=${POSTGRES_PASSWORD}' ]
    volumes: [ './backups:/backups' ]
    entrypoint: [ "/bin/sh", "-c" ]
    command: >
      'while true; do
         pg_dump -h postgres -U admin -d app | gzip > "/backups/app-$(date +%Y%m%d-%H%M%S).sql.gz";
         find /backups -name "app-*.sql.gz" -mtime +7 -delete;
         sleep 86400;
       done'
    depends_on: [ postgres ]

  core:
    image: ghcr.io/unividuell/countdown-core:latest
    environment:
      - SPRING_PROFILES_ACTIVE=production
      - 'GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}'
      - 'POSTGRES_PASSWORD=${POSTGRES_PASSWORD}'
    depends_on: [ postgres ]

  caddy:
    image: ghcr.io/unividuell/countdown-web:latest
    ports: [ '80:80', '443:443' ]
    volumes: [ 'caddy-data:/data', 'caddy-config:/config' ]   # persist Let's Encrypt certs
    depends_on: [ core ]

volumes:
  pgdata:
  caddy-data:
  caddy-config:
```
- Secrets via a server-side **`.env`** (not committed): `POSTGRES_PASSWORD`,
  `GITHUB_CLIENT_SECRET`. A committed `deploy/.env.example` documents the keys.
- `./backups` is host-mounted → easy to copy off-server (rsync/scp).

## Server operations (`deploy/README.md`)

Bootstrap (public repo → `curl`; only two files needed on the server):
```bash
mkdir -p /opt/countdown && cd /opt/countdown
curl -fsSLO https://raw.githubusercontent.com/unividuell/countdown/main/deploy/compose.prod.yaml
curl -fsSL  https://raw.githubusercontent.com/unividuell/countdown/main/deploy/.env.example -o .env   # fill secrets
docker compose -f compose.prod.yaml up -d
```
Infra update (`deploy/update.sh`, also curl-able): re-fetch `compose.prod.yaml`,
then `docker compose pull && docker compose up -d`.

**Prerequisite:** DNS A/AAAA record for `countdown.unividuell.org` → server IP,
ports 80+443 open — otherwise Caddy cannot obtain a TLS certificate. (DNS not set yet.)

## Backup & restore

- **Backup:** daily `pg_dump | gzip` to `./backups/app-<timestamp>.sql.gz`, 7-day retention.
- **Restore:** `gunzip -c backups/app-<ts>.sql.gz | docker compose exec -T postgres psql -U admin -d app`
  (into a fresh/empty `app` DB).
- **Off-site:** copy `./backups` off the server (rsync/scp/object storage) — out of scope to automate here.

### PITR upgrade path (not now)
If point-in-time recovery is later required: switch to **pgBackRest** — a custom
`postgres` image with pgBackRest, `archive_mode=on` + `archive_command` for
continuous WAL archiving, scheduled base backups, and a repo volume (or S3).
This is an isolated change to the postgres service + a backup sidecar; the rest
of the deployment is unaffected.

## Git remote

The local repo is connected to `origin = https://github.com/unividuell/countdown`
so Actions run. (Set during implementation.)

## Out of scope (YAGNI)

- Auto-deploy from CI (manual pull chosen); Watchtower.
- PITR / WAL archiving (logical dumps only).
- Monitoring, alerting, log aggregation.
- HA / multi-server / replicas; staging environment.
- External secret manager (server `.env` is sufficient for one host).
- Automated off-site backup shipping.
