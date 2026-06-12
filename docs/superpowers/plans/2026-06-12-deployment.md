# Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build container images for the backend (Buildpacks) and the SPA (Caddy+static) on every push to `main` via GitHub Actions (arm64) → ghcr, and run backend + Caddy(edge) + PostgreSQL (+ pg_dump backup, + debug pgAdmin) on the arm64 server from one Docker Compose file, fetched/updated via a `curl`-able `update.sh`.

**Architecture:** Caddy is the edge (TLS via Let's Encrypt, serves the SPA with history-mode fallback, reverse-proxies `/api,/oauth2,/login,/logout` to `core:8080`). The backend runs Spring profile `production` (client-id committed, client-secret + DB password via env), honoring Caddy's `X-Forwarded-*`. Postgres persists to a named volume; a sidecar makes daily `pg_dump` logical backups. pgAdmin is loopback-only under a `debug` profile (SSH-tunnel access).

**Tech stack:** Spring Boot 4.1 + `spring-boot:build-image` (Paketo Buildpacks), Vite/Vue (multi-stage Docker build), Caddy 2, PostgreSQL 18, GitHub Actions on `ubuntu-24.04-arm`, ghcr.io.

Design spec: `docs/superpowers/specs/2026-06-12-deployment-design.md`.

> **Notes for the implementer:**
> - Work on branch `feat/deployment` (already created). Commit each task.
> - Some steps can only be fully verified once pushed (CI) or on the server (TLS/DNS) — those are marked. Local verification: `docker build`, `docker compose config`, shellcheck, maven build.
> - CI/registry-publish specifics (Buildpacks publish auth, runner labels) are bleeding-edge; if a detail differs, adapt minimally to make the workflow succeed and note it — the final task watches the real CI run.

---

## File Structure

```
core/
  pom.xml                                  # add image name + publishRegistry to spring-boot-maven-plugin
  src/main/resources/application-production.yaml   # NEW
.github/workflows/
  build-core.yml                           # NEW
  build-web.yml                            # NEW
deploy/
  Caddyfile                                # NEW (baked into web image)
  web.Dockerfile                           # NEW (multi-stage: pnpm build -> caddy)
  compose.prod.yaml                        # NEW (server stack)
  .env.example                             # NEW (secret keys template)
  update.sh                                # NEW (curl infra files + pull + up)
  README.md                                # NEW (on-server ops guide)
.dockerignore                              # NEW (repo root; trims web build context)
.claude/guidelines/deployment.md           # NEW (knowledge feedback)
```

---

## Task 1: Connect the git remote

**Files:** none (git config).

- [ ] **Step 1: Add the origin remote**
```bash
git remote add origin https://github.com/unividuell/countdown.git
git remote -v
```
Expected: `origin` points at `github.com/unividuell/countdown` (fetch + push).

- [ ] **Step 2: Report**
Do NOT push yet (push happens in the finishing step after all files exist, to trigger CI once). If `origin` already exists, leave it. No commit (remote config isn't tracked).

---

## Task 2: Backend production profile + image name in pom

**Files:**
- Create: `core/src/main/resources/application-production.yaml`
- Modify: `core/pom.xml` (spring-boot-maven-plugin configuration)

- [ ] **Step 1: Production profile**
`core/src/main/resources/application-production.yaml`:
```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          github:
            # Production GitHub OAuth App (callback https://countdown.unividuell.org/login/oauth2/code/github).
            # Replace with the real prod Client ID (public value, safe to commit).
            client-id: REPLACE_WITH_PROD_GITHUB_CLIENT_ID
            client-secret: ${GITHUB_CLIENT_SECRET}
            scope: read:user
  datasource:
    url: jdbc:postgresql://postgres:5432/app
    username: admin
    password: ${POSTGRES_PASSWORD}

server:
  # Caddy terminates TLS and forwards X-Forwarded-*; honour it so the app builds
  # correct https://countdown.unividuell.org URLs (OAuth redirect_uri) and treats
  # requests as secure.
  forward-headers-strategy: framework
  servlet:
    session:
      cookie:
        secure: true
        same-site: lax
```
Notes: `spring.modulith.runtime.flyway-enabled` and the GitHub provider defaults are inherited from the base `application.yaml`. `spring-boot-docker-compose` is excluded from the prod image by the Maven plugin, so no `spring.docker.compose.enabled` is needed. The `REPLACE_WITH_PROD_GITHUB_CLIENT_ID` placeholder must be filled with the real prod Client ID before the first prod login works (committed value).

- [ ] **Step 2: Pin the image name + publish registry in pom.xml**
In `core/pom.xml`, give the `spring-boot-maven-plugin` a `<configuration>`:
```xml
<plugin>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-maven-plugin</artifactId>
    <configuration>
        <image>
            <name>ghcr.io/unividuell/countdown-core:latest</name>
        </image>
        <docker>
            <publishRegistry>
                <url>https://ghcr.io</url>
                <username>${env.GHCR_USERNAME}</username>
                <password>${env.GHCR_TOKEN}</password>
            </publishRegistry>
        </docker>
    </configuration>
</plugin>
```
(The `${env.*}` are only needed when publishing in CI; local `build-image` without publish ignores them.)

- [ ] **Step 3: Verify the build still works**
```bash
cd core && ./mvnw -q -DskipTests package
```
Expected: BUILD SUCCESS (the YAML is well-formed and the pom edit is valid). Do NOT run `build-image` locally (it would try to build an image; that's CI's job).

- [ ] **Step 4: Commit**
```bash
git add core/pom.xml core/src/main/resources/application-production.yaml
git commit -m "feat(core): production profile + ghcr image name for build-image"
```

---

## Task 3: Web image (Caddy + SPA) — Caddyfile, Dockerfile, .dockerignore

**Files:**
- Create: `deploy/Caddyfile`
- Create: `deploy/web.Dockerfile`
- Create: `.dockerignore` (repo root)

- [ ] **Step 1: Caddyfile**
`deploy/Caddyfile`:
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

- [ ] **Step 2: Multi-stage Dockerfile**
`deploy/web.Dockerfile`:
```dockerfile
# build the SPA
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY webapp-vue/package.json webapp-vue/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY webapp-vue/ ./
RUN pnpm build

# serve it with Caddy (TLS + history-mode fallback + reverse proxy)
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
```

- [ ] **Step 3: .dockerignore (repo root)**
`.dockerignore`:
```
**/node_modules
**/dist
**/target
.git
.idea
core
docs
backups
```
(Keeps the web build context small; `core/`, `docs/` etc. aren't needed to build the SPA image.)

- [ ] **Step 4: Verify the image builds locally (native arm64 on the dev machine)**
```bash
docker build -f deploy/web.Dockerfile -t countdown-web:test .
docker run --rm -d --name web-test -p 8088:80 countdown-web:test
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8088/        # SPA index served (expect 200)
docker rm -f web-test
```
Expected: build SUCCESS; `200` for `/` (Caddy serves the SPA; without DNS it serves on HTTP locally). The `reverse_proxy core:8080` won't resolve locally — that's fine (only `/` is probed here).

- [ ] **Step 5: Commit**
```bash
git add deploy/Caddyfile deploy/web.Dockerfile .dockerignore
git commit -m "feat(deploy): Caddy+SPA web image (history-mode fallback, reverse proxy)"
```

---

## Task 4: Server compose, env template, update script

**Files:**
- Create: `deploy/compose.prod.yaml`
- Create: `deploy/.env.example`
- Create: `deploy/update.sh`

- [ ] **Step 1: compose.prod.yaml**
`deploy/compose.prod.yaml`:
```yaml
name: countdown

services:
  postgres:
    image: postgres:18
    restart: unless-stopped
    environment:
      - POSTGRES_DB=app
      - POSTGRES_USER=admin
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    # no host port — only reachable on the compose network

  db-backup:
    image: postgres:18
    restart: unless-stopped
    environment:
      - PGPASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - ./backups:/backups
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        while true; do
          pg_dump -h postgres -U admin -d app | gzip > "/backups/app-$(date +%Y%m%d-%H%M%S).sql.gz"
          find /backups -name 'app-*.sql.gz' -mtime +7 -delete
          sleep 86400
        done
    depends_on:
      - postgres

  core:
    image: ghcr.io/unividuell/countdown-core:latest
    restart: unless-stopped
    environment:
      - SPRING_PROFILES_ACTIVE=production
      - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    depends_on:
      - postgres

  caddy:
    image: ghcr.io/unividuell/countdown-web:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - core

  # DB debugging UI — NOT public, NOT proxied by Caddy. Only runs when started with the
  # `debug` profile; bound to loopback; reached via an SSH tunnel. Login required.
  pgadmin:
    image: dpage/pgadmin4:latest
    profiles: [debug]
    restart: unless-stopped
    environment:
      - PGADMIN_DEFAULT_EMAIL=${PGADMIN_EMAIL}
      - PGADMIN_DEFAULT_PASSWORD=${PGADMIN_PASSWORD}
    ports:
      - "127.0.0.1:5050:80"
    configs:
      - source: pgadmin_servers
        target: /pgadmin4/servers.json
    volumes:
      - pgadmin-data:/var/lib/pgadmin
    depends_on:
      - postgres

configs:
  pgadmin_servers:
    content: |
      {
        "Servers": { "1": {
          "Name": "countdown app (postgres)", "Group": "Servers",
          "Host": "postgres", "Port": 5432, "MaintenanceDB": "app",
          "Username": "admin", "SSLMode": "prefer"
        } }
      }

volumes:
  pgdata:
  caddy-data:
  caddy-config:
  pgadmin-data:
```

- [ ] **Step 2: .env.example**
`deploy/.env.example`:
```dotenv
# Copy to .env on the server and fill in. NEVER commit the real .env.
POSTGRES_PASSWORD=change-me
GITHUB_CLIENT_SECRET=change-me
# Only needed for the optional `debug`-profile pgAdmin:
PGADMIN_EMAIL=admin@local.dev
PGADMIN_PASSWORD=change-me
```

- [ ] **Step 3: update.sh**
`deploy/update.sh`:
```sh
#!/usr/bin/env sh
# Full update: fetch latest infra files from main, pull images, restart.
set -eu
BASE="https://raw.githubusercontent.com/unividuell/countdown/main/deploy"

curl -fsSL "$BASE/compose.prod.yaml" -o compose.prod.yaml
curl -fsSL "$BASE/README.md"         -o README.md
curl -fsSL "$BASE/update.sh"         -o update.sh.new && chmod +x update.sh.new && mv update.sh.new update.sh

if [ ! -f .env ]; then
  curl -fsSL "$BASE/.env.example" -o .env
  echo ".env created from template — fill in the secrets, then re-run ./update.sh"
  exit 1
fi

docker compose pull
docker compose up -d
docker image prune -f
echo "Update complete."
```

- [ ] **Step 4: Verify**
```bash
# compose file is valid and resolves env vars (use the example as a stand-in .env)
docker compose -f deploy/compose.prod.yaml --env-file deploy/.env.example config >/dev/null && echo "compose OK"
# shell script lints clean (if shellcheck is available)
command -v shellcheck >/dev/null && shellcheck deploy/update.sh || echo "shellcheck not installed (skip)"
chmod +x deploy/update.sh
```
Expected: `compose OK` (no parse/interpolation errors). shellcheck clean if present.

- [ ] **Step 5: Commit**
```bash
git add deploy/compose.prod.yaml deploy/.env.example deploy/update.sh
git commit -m "feat(deploy): server compose (pg+backup+core+caddy+debug pgadmin), env template, update.sh"
```

---

## Task 5: On-server operations guide (`deploy/README.md`)

**Files:**
- Create: `deploy/README.md`

- [ ] **Step 1: Write the guide**
`deploy/README.md` — must cover bootstrap, full update, pgAdmin SSH-tunnel debug, DB restore, and the DNS/TLS prerequisite:
````markdown
# countdown — server operations

Production stack for `countdown.unividuell.org`, run on the (linux/arm64) server
from `compose.prod.yaml`. Images come from `ghcr.io/unividuell/countdown-*:latest`
(public). Everything below is run **on the server**, e.g. in `/opt/countdown/`.

## Prerequisites
- Docker + Docker Compose v2.
- DNS: `A` (and `AAAA`) record `countdown.unividuell.org` → this server's public IP;
  inbound ports **80 + 443** open. Without this, Caddy cannot obtain a TLS cert.
- A production GitHub OAuth App (callback `https://countdown.unividuell.org/login/oauth2/code/github`);
  its Client ID is committed in `application-production.yaml`, its secret goes into `.env`.

## Bootstrap (first time)
```bash
mkdir -p /opt/countdown && cd /opt/countdown
curl -fsSL https://raw.githubusercontent.com/unividuell/countdown/main/deploy/update.sh -o update.sh && chmod +x update.sh
./update.sh                 # fetches README.md + compose.prod.yaml + a .env template, then stops
# edit .env: POSTGRES_PASSWORD, GITHUB_CLIENT_SECRET, PGADMIN_EMAIL/PGADMIN_PASSWORD
./update.sh                 # pulls images and starts the stack
```

## Update (new images / infra changes)
```bash
cd /opt/countdown && ./update.sh
```
Re-fetches `compose.prod.yaml` + `README.md` + `update.sh`, then `docker compose pull && up -d`
and prunes old images. Never overwrites `.env`.

## Debug the DB (pgAdmin — no public endpoint, SSH tunnel only)
pgAdmin runs only under the `debug` profile and is bound to the server's loopback.
```bash
# 1) start it on the server (on demand)
docker compose --profile debug up -d pgadmin
# 2) from your workstation, open an SSH tunnel (laptop:5050 -> server loopback:5050)
ssh -L 5050:127.0.0.1:5050 <user>@<server>
# 3) browse http://localhost:5050 ; log in with PGADMIN_EMAIL / PGADMIN_PASSWORD.
#    The "countdown app (postgres)" server is pre-registered; enter the DB password (POSTGRES_PASSWORD) once.
# 4) when done
docker compose --profile debug stop pgadmin
```

## Backups & restore
- Daily logical dumps are written by the `db-backup` service to `./backups/app-<timestamp>.sql.gz` (7-day retention).
- Copy `./backups` off-site regularly (rsync/scp).
- **Restore** into the running DB:
  ```bash
  gunzip -c backups/app-<timestamp>.sql.gz | docker compose exec -T postgres psql -U admin -d app
  ```
  (Restore into an empty/fresh `app` database.)
````

- [ ] **Step 2: Verify**
```bash
# basic sanity: the bootstrap/update/restore/pgadmin sections are present
grep -qE "Bootstrap|## Update|pgAdmin|Restore|DNS" deploy/README.md && echo "README sections OK"
```
Expected: `README sections OK`.

- [ ] **Step 3: Commit**
```bash
git add deploy/README.md
git commit -m "docs(deploy): on-server README (bootstrap, update, pgAdmin SSH, restore)"
```

---

## Task 6: GitHub Actions workflows

**Files:**
- Create: `.github/workflows/build-core.yml`
- Create: `.github/workflows/build-web.yml`

- [ ] **Step 1: build-core.yml**
```yaml
name: build-core
on:
  push:
    branches: [main]
    paths:
      - 'core/**'
      - '.github/workflows/build-core.yml'
permissions:
  contents: read
  packages: write
jobs:
  image:
    runs-on: ubuntu-24.04-arm
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '25'
          cache: maven
      - name: Build & publish image (Buildpacks -> ghcr)
        working-directory: core
        env:
          GHCR_USERNAME: ${{ github.actor }}
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: ./mvnw -B spring-boot:build-image -Dspring-boot.build-image.publish=true
```
(The image name + publishRegistry creds come from the pom config in Task 2, fed by `GHCR_USERNAME`/`GHCR_TOKEN`. If publish-auth needs a different wiring, adjust — verify against the CI run in Task 8.)

- [ ] **Step 2: build-web.yml**
```yaml
name: build-web
on:
  push:
    branches: [main]
    paths:
      - 'webapp-vue/**'
      - 'deploy/Caddyfile'
      - 'deploy/web.Dockerfile'
      - '.github/workflows/build-web.yml'
permissions:
  contents: read
  packages: write
jobs:
  image:
    runs-on: ubuntu-24.04-arm
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build & push web image
        run: |
          docker build -f deploy/web.Dockerfile -t ghcr.io/unividuell/countdown-web:latest .
          docker push ghcr.io/unividuell/countdown-web:latest
```

- [ ] **Step 3: Verify (static)**
```bash
command -v actionlint >/dev/null && actionlint .github/workflows/*.yml || python3 -c "import yaml,glob; [yaml.safe_load(open(f)) for f in glob.glob('.github/workflows/*.yml')]; print('workflow YAML OK')"
```
Expected: actionlint clean, or `workflow YAML OK`. (Real execution is verified in Task 8 after pushing.)

- [ ] **Step 4: Commit**
```bash
git add .github/workflows/build-core.yml .github/workflows/build-web.yml
git commit -m "ci: build+push core (Buildpacks) and web (Caddy) images to ghcr on main (arm64)"
```

---

## Task 7: Feed knowledge back into the guidelines

Per `.claude/guidelines/feeding-knowledge-back.md`.

**Files:**
- Create: `.claude/guidelines/deployment.md`
- Modify: `.claude/guidelines/README.md` (index row), `CLAUDE.md` (bullet)

- [ ] **Step 1: Write `deployment.md`** capturing the conventions + gotchas:
  - ghcr public images `latest`; backend via `spring-boot:build-image` (Buildpacks) with image name + publishRegistry in the pom; web via multi-stage Dockerfile (Node build → Caddy).
  - **arm64** images built on **GitHub-hosted `ubuntu-24.04-arm`** (Buildpacks don't cross-build).
  - **Caddy is the edge**: TLS (Let's Encrypt), SPA history-mode fallback (`try_files {path} /index.html`), reverse-proxy of `/api,/oauth2,/login,/logout`. Backend uses `server.forward-headers-strategy=framework` so OAuth `redirect_uri` is `https://…` (gotcha: without it the redirect_uri/scheme is wrong behind the proxy).
  - prod profile: client-id committed, secret via env; **`spring-boot-docker-compose` is excluded from the prod image** by the Maven plugin (`excludeDockerCompose=true`) — no disable needed.
  - PG: named volume + daily `pg_dump` sidecar (reuse `postgres:18`); restore via `psql`. PITR is an isolated pgBackRest upgrade.
  - Ops: server runs `curl`-able `update.sh` (fetch infra files + `docker compose pull && up -d`); only `compose.prod.yaml` + `.env` (+ README/update.sh) live on the server; the Caddyfile is image-baked.
  - pgAdmin in prod: `debug` profile, **loopback-only**, SSH-tunnel, login required.
- [ ] **Step 2: Link it** — add a row to `.claude/guidelines/README.md` and a bullet to `CLAUDE.md`.
- [ ] **Step 3: Commit**
```bash
git add .claude CLAUDE.md
git commit -m "docs: add deployment guidelines"
```

---

## Task 8: Merge to main, push, verify CI builds the images

This is the real end-to-end verification of the build pipeline. (Use superpowers:finishing-a-development-branch for the merge mechanics; this task covers the deployment-specific verification.)

- [ ] **Step 1: Ensure full local build/tests still green**
```bash
cd core && ./mvnw -q test && cd .. && cd webapp-vue && pnpm test && cd ..
```
Expected: backend + frontend suites green (unchanged by deployment files).

- [ ] **Step 2: Merge `feat/deployment` → `main` and push**
```bash
git checkout main && git merge feat/deployment
git push -u origin main
```
(Requires push auth to `github.com/unividuell/countdown`. If the push is rejected for auth, the human pushes.)

- [ ] **Step 3: Verify the workflows run and publish images**
- In the repo's **Actions** tab, confirm `build-core` and `build-web` run on the push and succeed on `ubuntu-24.04-arm`.
- In **Packages**, confirm `ghcr.io/unividuell/countdown-core:latest` and `ghcr.io/unividuell/countdown-web:latest` exist (arm64). Make the packages **public** if not already (so the server pulls without auth).
- If `build-core` fails on publish auth, adjust the pom `publishRegistry` wiring / workflow env and re-push; iterate until green.

- [ ] **Step 4: (Human, on the server — outside this plan)**
Set DNS + open 80/443, create the prod OAuth App, fill `application-production.yaml`'s client-id, then bootstrap per `deploy/README.md`.

---

## Self-Review

**Spec coverage:**
- Backend image via Buildpacks, name pinned, ghcr, latest → Task 2 + 6. ✓
- Web image (Caddy+SPA, history fallback, reverse proxy) → Task 3 (+ build-web Task 6). ✓
- Caddy TLS edge for `countdown.unividuell.org` → Task 3 Caddyfile. ✓
- arm64 on `ubuntu-24.04-arm`, build on every push to main, path-filtered → Task 6. ✓
- ghcr (public) → Task 6 + Task 8 (make public). ✓
- prod profile (client-id committed, secret env, forward-headers, secure cookies), docker-compose excluded → Task 2. ✓
- compose.prod.yaml (pg + volume + backup sidecar + core + caddy + debug pgadmin) → Task 4. ✓
- pg_dump backup + restore → Task 4 + Task 5 README. ✓
- pgAdmin loopback/debug-profile/SSH tunnel → Task 4 + Task 5. ✓
- curl-able README + update.sh (full update) → Task 4 + 5. ✓
- git remote → Task 1; push triggers CI → Task 8. ✓
- guidelines feedback → Task 7. ✓

**Placeholder scan:** the only intentional placeholder is `REPLACE_WITH_PROD_GITHUB_CLIENT_ID` (a user-supplied value, clearly flagged in Task 2 + README). Every step has full content + an expected verification outcome.

**Consistency:** image names `ghcr.io/unividuell/countdown-core|web:latest` identical across pom, workflows, compose. Service name `core`/`postgres` consistent between Caddyfile, compose, and the backend datasource URL (`postgres:5432/app`, user `admin`, matching the compose `POSTGRES_*`). The `/api,/oauth2,/login,/logout` proxy set matches the SPA's expectations and the backend security paths. `.env` keys (`POSTGRES_PASSWORD`, `GITHUB_CLIENT_SECRET`, `PGADMIN_EMAIL/PASSWORD`) match between compose, .env.example, README, and update.sh.
