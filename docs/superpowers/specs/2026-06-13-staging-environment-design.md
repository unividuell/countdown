# Staging Environment + Test-User Auth + Branch Workflow

**Status:** Approved design (2026-06-13)
**Touches:** CI workflows, branch model, `edge-caddy` repo, `deploy/` (compose + env + update.sh + README), backend `iam`/auth (test-login + seeder + staging profile), frontend login page.
**Builds on:** the shared-edge deployment + the `iam` GitHub-OAuth/session foundation.

## Purpose

Stand up a **staging environment** on the same server as prod so changes can be exercised
before going live, and solve the **single-GitHub-account test-user problem** (simulate
multi-user flows — admin/player/invite/approval — without creating fake GitHub accounts).
Introduce a **`develop` → `main`** branch workflow: feature branches target `develop`
(= staging), and `develop` rolls out to `main` (= prod).

One spec, built as staged components (CI/workflow · staging stack · pgAdmin · test-auth ·
staging config). The test-auth is security-critical and gated so it **cannot exist in prod**.

## Decisions (locked during brainstorming)

- **Branch workflow:** `feature/*` → `develop` → `main`, all via **local fast-forward merges**
  (no PRs); CI runs after push. `develop` push builds **`:staging`** images; `main` push builds
  **`:latest`** (prod). This feature itself bootstraps the workflow, so it merges to `main`
  directly (and creates `develop`); the feature→develop→main flow applies to *future* work.
- **Deploy:** **build-only** — no auto-deploy. The server is updated manually via `update.sh`
  for **both** prod and staging.
- **Staging stack = same compose, two env files (not two compose files):** the stacks are
  identical except environment. One parametrized **`deploy/compose.yaml`** (renamed from
  `compose.prod.yaml`), two env files **`.env.prod`** / **`.env.staging`**, both living in
  **`/opt/unividuell/countdown/`**. Each env file sets `COMPOSE_PROJECT_NAME`
  (`countdown` / `countdown-staging`), `IMAGE_TAG` (`latest` / `staging`), and its secrets/OAuth.
  Separate project names give each stack its own container/volume/network namespace → staging is
  independently start/stoppable (`docker compose --env-file .env.staging -f compose.yaml down`
  touches only staging). Leaner than duplicating compose; no `extends`/override overhead.
- **Edge:** new site **`beta.countdown.unividuell.org`** → `reverse_proxy countdown-staging-web:80`
  (own LE cert) in the `edge-caddy` Caddyfile.
- **Staging DB:** own postgres container + volume (project-scoped), **Postgres 18** like prod but
  **independently bumpable** — so a major upgrade can be rehearsed on staging first.
- **pgAdmin for both DBs:** one pgAdmin (prod stack, `debug` profile) on a shared external
  **`db-ops`** network; both postgres containers also join `db-ops`; `servers.json` pre-registers
  both `countdown-postgres` + `countdown-staging-postgres`. Staging does not start its own pgAdmin.
- **Test-user auth:** a profile-gated **test-login** with a **fixed Futurama seed set**, available
  on **localhost (`default`) + staging**, **never prod**. All test endpoints, the seeder, and the
  permitAll security rule are **`@Profile("!production")`** — i.e. they do not exist in the prod
  app at all.
- **Staging GitHub OAuth:** staging gets its **own** GitHub OAuth App (own client-id committed in
  `application-staging.yaml`, secret via `.env.staging`, callback
  `https://beta.countdown.unividuell.org/login/oauth2/code/github`) — so the real OAuth flow is
  testable on beta too, alongside test-login.

## A. Branch workflow + CI image tags

- Branches: `feature/*` → `develop` (ff) → `main` (ff). CI after push.
- `build-core.yml` + `build-web.yml`: trigger on **both** `main` and `develop`. Tag by branch:
  - `main` → `ghcr.io/unividuell/countdown-{core,web}:latest`
  - `develop` → `…:staging`
  - core (Buildpacks): the image name/tag is selected per branch, e.g.
    `-Dspring-boot.build-image.imageName=ghcr.io/unividuell/countdown-core:staging` on `develop`
    (latest on `main`); web (`docker build`): `-t …:staging` on `develop`.
- **Test gates stay** (added earlier): `build-core` runs `./mvnw clean verify` first;
  `build-web` runs `pnpm lint && pnpm test` first — on both branches, before the image.
- `workflow_dispatch` retained on both.

## B. Server layout + parametrized compose

Everything in **`/opt/unividuell/countdown/`**:
```
/opt/unividuell/countdown/
  compose.yaml            # one parametrized compose (renamed from compose.prod.yaml)
  .env.prod               # COMPOSE_PROJECT_NAME=countdown,         IMAGE_TAG=latest,  prod secrets/OAuth
  .env.staging            # COMPOSE_PROJECT_NAME=countdown-staging, IMAGE_TAG=staging, staging secrets/OAuth
  update.sh               # update.sh <prod|staging> → picks the env file
  README.md
  backups/                # prod db-backup target (staging backups optional/separate)
```

Parametrization in `compose.yaml` (no behavioural change for prod when run with `.env.prod`):
- project name via `COMPOSE_PROJECT_NAME` (from the env file) — drives container/volume/network names.
- images `ghcr.io/unividuell/countdown-core:${IMAGE_TAG}` / `…-web:${IMAGE_TAG}`.
- `postgres` gets an explicit `container_name: ${COMPOSE_PROJECT_NAME}-postgres` and also joins the
  external `db-ops` network (so pgAdmin can address it unambiguously) in addition to `internal`.
- `core` reads `SPRING_PROFILES_ACTIVE=${SPRING_PROFILES_ACTIVE:-production}` (prod sets
  `production`, staging sets `staging`).
- `caddy` (web) stays `container_name: ${COMPOSE_PROJECT_NAME}-web` (already `countdown-web`;
  staging → `countdown-staging-web`).
- volumes are project-scoped automatically → `countdown_pgdata` vs `countdown-staging_pgdata` are
  distinct. **No shared DB.**
- `db-backup` host mount is parametrized **`${BACKUP_DIR:-./backups}`** per env file (prod
  `./backups`, staging `./backups-staging`) so the two stacks' dumps don't collide in the shared
  dir. (Staging backups aren't a goal — see out-of-scope — but a distinct path keeps them harmless;
  alternatively gate `db-backup` to prod via a compose profile. Plan picks one.)

`update.sh <target>`: `target` defaults to `prod`; resolves `ENV_FILE=.env.$target`; then
`docker network create edge || true`, `docker network create db-ops || true`,
`docker compose --env-file "$ENV_FILE" -f compose.yaml pull && up -d`. (Each env file carries its
own `COMPOSE_PROJECT_NAME`, so the right stack is targeted.) Stopping staging:
`docker compose --env-file .env.staging -f compose.yaml down`.

> **Migration note:** prod currently runs from `compose.prod.yaml` + `.env`. The cutover renames
> to `compose.yaml` + `.env.prod` (move/rename on the server, no data change — volumes persist as
> long as `COMPOSE_PROJECT_NAME=countdown` is kept). Sequence it carefully (see plan).

## C. pgAdmin for both databases

- A shared external Docker network **`db-ops`** (created idempotently like `edge`).
- Both `postgres` containers join `db-ops` (+ their own `internal`). They are addressable by
  `container_name`: `countdown-postgres`, `countdown-staging-postgres`.
- The single **pgAdmin** (in the prod stack, `debug` profile, loopback-bound + SSH-tunnel as today)
  joins `db-ops`; its `configs` `servers.json` pre-registers **both** servers
  ("countdown prod (postgres)" → `countdown-postgres`, "countdown staging (postgres)" →
  `countdown-staging-postgres`).
- Staging's compose still *defines* pgAdmin (same file), but it is only ever started from the prod
  env (`--env-file .env.prod … --profile debug up pgadmin`); staging is never launched with the
  `debug` profile.

## D. Test-user auth (gated `@Profile("!production")` — absent in prod)

A second authentication path for **localhost + staging only**. Everything below is
`@Profile("!production")`, so in the prod app these beans/endpoints/rules **do not exist**.

- **Seeder** — an `ApplicationRunner` (`@Profile("!production")`, idempotent) upserts the fixed
  test users on startup. **Not** a Flyway migration (migrations can't be profile-gated and would
  leak into prod). Test users use **synthetic negative `github_id`s** (−1…−5) so they never
  collide with real GitHub ids (always positive).

  | github_login | github_name | display_name | github_id |
  | --- | --- | --- | --- |
  | `Fry` | – | – | -1 |
  | `leela` | `Leela` | `Turanga Leela` | -2 |
  | `Bender` | – | – | -3 |
  | `prof` | – | `Prof Farnsworth` | -4 |
  | `amy` | – | – | -5 |

- **Endpoints** (a `@Profile("!production")` `@RestController`, e.g. `…iam.internal.devauth`):
  - `GET /api/auth/test-users` → the seeded users (login + display name) for the login page.
  - `POST /api/auth/dev-login {login}` → loads the seeded user, builds an `OAuth2AuthenticationToken`
    carrying a `CountdownOAuth2User` (same principal type as the real OAuth login), stores it in the
    `SecurityContext` + the HTTP session (Spring Session JDBC) — yielding a session indistinguishable
    from a GitHub login. Returns 204; the SPA then bootstraps `/api/me` as usual.
- **Security rule:** a `@Profile("!production")` security config permits `/api/auth/test-users` +
  `/api/auth/dev-login` (these must work pre-auth). In prod that config is absent → the paths aren't
  mapped → `anyRequest authenticated` 401s them anyway (defense in depth).
- **Frontend `/login`:** in addition to "Login with GitHub", probe `GET /api/auth/test-users` with a
  **raw `fetch`** (NOT `apiFetch`, to avoid triggering the global 401 → redirect handler). On `200`
  render a "Test-Login" block listing the users; clicking one POSTs `/api/auth/dev-login` then
  navigates to `/`. On non-200 (prod) show nothing.

## E. Staging profile + config

- **`application-staging.yaml`** (profile `staging`): mirrors prod web settings —
  `forward-headers-strategy: framework`, `Secure`/`SameSite=Lax` cookies (staging is behind the TLS
  edge) — plus the **staging GitHub OAuth client-id** (committed; secret `${GITHUB_CLIENT_SECRET}`
  from `.env.staging`) and the datasource to the staging postgres (`jdbc:postgresql://postgres:5432/app`,
  same service name inside the staging stack).
- Profile gating recap: test-auth beans are `@Profile("!production")` → active under `default`
  (localhost) and `staging`, never `production`.
- The staging GitHub OAuth App is created out-of-band (like prod): the user supplies its client-id
  (committed) + secret (server `.env.staging`); callback
  `https://beta.countdown.unividuell.org/login/oauth2/code/github`.

## F. localhost (default profile)

Test-login works locally via the `default` profile (test-auth is `!production`). You can log in as
Fry/leela/Bender/prof/amy without GitHub; the real GitHub dev-app login remains available in
parallel. The seeder runs on local startup too (idempotent).

## Out of scope / follow-ups

- Auto-deploy on `develop` push (chosen: build-only + manual `update.sh`).
- PR-based gates (chosen: local ff merges).
- Staging DB backups (prod keeps `db-backup`; staging backup optional, not now).
- Actually performing a Postgres major upgrade (staging just makes it *possible* to rehearse).
- The per-community countdown/game logic (separate spec).

## Feed knowledge back

After implementation, capture into `.claude/guidelines/deployment.md`: the one-compose +
per-env-file (`COMPOSE_PROJECT_NAME`) multi-stack pattern; branch→image-tag mapping
(`develop`→`:staging`, `main`→`:latest`); the `db-ops` shared network for cross-stack pgAdmin; and
into `security-and-auth.md`: the `@Profile("!production")` test-login pattern (synthetic negative
github_ids, seeder as ApplicationRunner not Flyway, raw-fetch probe on the login page, endpoints
absent in prod).
