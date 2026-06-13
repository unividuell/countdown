# Staging Environment + Test-User Auth + Branch Workflow

**Status:** Approved design (2026-06-13)
**Touches:** CI workflows, branch model, `edge-caddy` repo, `deploy/` (compose + env + update.sh + README), backend `iam`/auth (emulator-style test-login + seeder + staging profile), frontend login button.
**Builds on:** the shared-edge deployment + the `iam` GitHub-OAuth/session foundation.

## Purpose

Stand up a **staging environment** on the same server as prod so changes can be exercised
before going live, and solve the **single-GitHub-account test-user problem** (simulate
multi-user flows — admin/player/invite/approval — without creating fake GitHub accounts).
Introduce a **`develop` → `main`** branch workflow: feature branches target `develop`
(= staging), and `develop` rolls out to `main` (= prod).

One spec, built as staged components (CI/workflow · staging stack · per-env pgAdmin · test-auth ·
staging config). The test-auth follows the **Firebase-emulator pattern**: one login button
everywhere; the *server* decides (real GitHub in prod, a test-user picker in non-prod). Nothing
test-related ships in the prod app — neither in the SPA nor the backend.

## Decisions (locked during brainstorming)

- **Branch workflow:** `feature/*` → `develop` → `main`, all via **local fast-forward merges**
  (no PRs); CI runs after push. `develop` push builds **`:staging`** images; `main` push builds
  **`:latest`** (prod). This feature bootstraps the workflow, so it merges to `main` directly (and
  creates `develop`); the feature→develop→main flow applies to *future* work.
- **Deploy:** **build-only** — no auto-deploy. The server is updated manually via `update.sh` for
  **both** prod and staging.
- **Staging stack = same compose, two env files (not two compose files):** the stacks are identical
  except environment. One parametrized **`deploy/compose.yaml`** (renamed from `compose.prod.yaml`),
  two env files **`.env.prod`** / **`.env.staging`**, both in **`/opt/unividuell/countdown/`**. Each
  sets `COMPOSE_PROJECT_NAME` (`countdown` / `countdown-staging`), `IMAGE_TAG` (`latest` /
  `staging`), `SPRING_PROFILES_ACTIVE` (`production` / `staging`), `PGADMIN_PORT` (`5050` / `5051`),
  and its secrets. Separate project names give each stack its own container/volume/network
  namespace → staging is independently start/stoppable
  (`docker compose --env-file .env.staging -f compose.yaml down` touches only staging). Leaner than
  duplicating compose; no `extends`/override overhead.
- **Edge:** new site **`beta.countdown.unividuell.org`** → `reverse_proxy countdown-staging-web:80`
  (own LE cert) in the `edge-caddy` Caddyfile.
- **Staging DB:** own postgres container + volume (project-scoped), **Postgres 18** like prod but
  **independently bumpable** — so a major upgrade can be rehearsed on staging first.
- **pgAdmin: one per environment** (each in its own stack's `debug` profile, connecting only to its
  own `postgres`). No shared instance, no cross-stack network. Host port parametrized per env
  (`PGADMIN_PORT`); the README documents how to start/reach each.
- **Test-user auth (emulator pattern):** one **"Login with GitHub"** button in the SPA on every
  environment, always navigating to **`/login/github`**. The **server** decides — **real GitHub
  OAuth** vs a **server-rendered test-user picker** (fixed Futurama seed set) — by profile **and** a
  config switch. All picker endpoints + the seeder + their permit rules are **`@Profile("!production")`**
  → they do not exist in the prod app. The **SPA carries zero test logic** (one button, one URL).
- **Switch `app.test-auth.enabled`:** a config flag (default **`true`** in `application.yaml`;
  **`false`** in `application-production.yaml`; **`true`** in `application-staging.yaml`). When
  **`false`**, the seeder and picker are off and `/login/github` redirects to real GitHub — so on
  **localhost you can flip it to `false` to replay the exact prod GitHub flow** (and seed nothing).
- **No separate staging GitHub OAuth App.** Staging logs in via the picker (you opted out of the
  real GitHub dance on beta). Real GitHub OAuth is exercised **only in prod**; on non-prod the
  standard `/oauth2/authorization/github` endpoint still exists (reachable for occasional manual
  testing) but the button doesn't route to it.

## A. Branch workflow + CI image tags

- Branches: `feature/*` → `develop` (ff) → `main` (ff). CI after push.
- `build-core.yml` + `build-web.yml`: trigger on **both** `main` and `develop`. Tag by branch:
  - `main` → `ghcr.io/unividuell/countdown-{core,web}:latest`
  - `develop` → `…:staging`
  - core (Buildpacks): select the tag per branch, e.g.
    `-Dspring-boot.build-image.imageName=ghcr.io/unividuell/countdown-core:staging` on `develop`;
    web (`docker build`): `-t …:staging` on `develop`.
- **Test gates stay** (added earlier): `build-core` runs `./mvnw clean verify`; `build-web` runs
  `pnpm lint && pnpm test` — on both branches, before the image. `workflow_dispatch` retained.

## B. Server layout + parametrized compose

Everything in **`/opt/unividuell/countdown/`**:
```
compose.yaml         # one parametrized compose (renamed from compose.prod.yaml)
.env.prod            # COMPOSE_PROJECT_NAME=countdown,         IMAGE_TAG=latest,  SPRING_PROFILES_ACTIVE=production, PGADMIN_PORT=5050, prod secrets
.env.staging         # COMPOSE_PROJECT_NAME=countdown-staging, IMAGE_TAG=staging, SPRING_PROFILES_ACTIVE=staging,    PGADMIN_PORT=5051, staging secrets
update.sh            # update.sh <prod|staging> → picks the env file
README.md
backups/             # prod db-backup target
```

Parametrization in `compose.yaml` (unchanged prod behaviour when run with `.env.prod`):
- project name via `COMPOSE_PROJECT_NAME` (from the env file) — drives container/volume/network names.
- images `ghcr.io/unividuell/countdown-{core,web}:${IMAGE_TAG}`.
- `core`: `SPRING_PROFILES_ACTIVE=${SPRING_PROFILES_ACTIVE:-production}`.
- `caddy` (web): `container_name: ${COMPOSE_PROJECT_NAME}-web` (prod `countdown-web`, staging
  `countdown-staging-web` — matches the edge route).
- `postgres` stays internal, reached by `core`/`pgadmin` via the service name `postgres` on the
  stack's own `internal` network (no cross-stack networking).
- `pgadmin` (debug profile): host port `127.0.0.1:${PGADMIN_PORT:-5050}:80`; its `servers.json`
  pre-registers only this stack's `postgres`.
- `db-backup`: host mount **`${BACKUP_DIR:-./backups}`** (prod `./backups`, staging `./backups-staging`)
  so the two stacks' dumps don't collide. (Staging backups aren't a goal — out of scope — but a
  distinct path keeps them harmless; the plan may instead gate `db-backup` to prod via a profile.)
- volumes are project-scoped automatically → `countdown_pgdata` vs `countdown-staging_pgdata` are
  distinct. **No shared DB.**

`update.sh <target>`: `target` defaults to `prod`; `ENV_FILE=.env.$target`; then
`docker network create edge || true`, `docker compose --env-file "$ENV_FILE" -f compose.yaml pull && up -d`.
(Each env file carries its own `COMPOSE_PROJECT_NAME`, so the right stack is targeted.) Bring staging
down with `docker compose --env-file .env.staging -f compose.yaml down`.

> **Migration note (prod is live):** prod runs from `compose.prod.yaml` + `.env`. Cutover renames to
> `compose.yaml` + `.env.prod` (keep `COMPOSE_PROJECT_NAME=countdown` so the existing volumes are
> reused — no data loss). Sequence carefully (see plan); a brief prod restart is expected.

## C. pgAdmin — one per environment

Each stack carries its own `pgadmin` (already in the compose, `debug` profile, loopback-bound).
It connects **only to its own** `postgres` (`servers.json` host `postgres`, on the stack's internal
network). No shared instance, no `db-ops` network, no `container_name` juggling.

- Host port per env: `127.0.0.1:${PGADMIN_PORT}:80` — prod `5050`, staging `5051` — so both can be
  tunnelled simultaneously if needed.
- **README** documents, per environment, how to start it and reach it, e.g.:
  - prod: `docker compose --env-file .env.prod -f compose.yaml --profile debug up -d pgadmin`
    then `ssh -L 5050:127.0.0.1:5050 …` → `http://localhost:5050`.
  - staging: `docker compose --env-file .env.staging -f compose.yaml --profile debug up -d pgadmin`
    then `ssh -L 5051:127.0.0.1:5051 …` → `http://localhost:5051`.
  - and how to stop each (`… --profile debug stop pgadmin`).

## D. Test-user auth — Firebase-emulator pattern (gated `@Profile("!production")`)

**SPA (all environments, no test code):** the login page has a single **"Login with GitHub"**
button → `window.location.assign('/login/github')`. That's the entire SPA contribution; it is
identical in prod and never references test users.

**The switch `app.test-auth.enabled`** decides which behaviour is wired (in addition to the profile
guard). Define `TEST_AUTH = (profile != production) AND (app.test-auth.enabled == true)`.

**Backend routing of `/login/github`:**
- **Picker** (`@Profile("!production")` + `@ConditionalOnProperty(name="app.test-auth.enabled",
  havingValue="true")`): `GET /login/github` → a **server-rendered test-user picker** page (minimal
  HTML — a centered card listing the seeded users, each a POST form). Selecting a user
  `POST /login/github/as {login}` → builds an `OAuth2AuthenticationToken` carrying a
  `CountdownOAuth2User` (same principal as the real login), stores it in the `SecurityContext` + HTTP
  session (Spring Session JDBC), 302 → `/`. The SPA then bootstraps `/api/me` as usual.
- **Redirect** (`@ConditionalOnProperty(name="app.test-auth.enabled", havingValue="false")`):
  `GET /login/github` → 302 `/oauth2/authorization/github` (real GitHub). Active in prod and on any
  non-prod env where the switch is `false`.

Exactly one is active given the per-profile flag values, so both can map `/login/github` without
clashing. The picker paths are permitted pre-auth via a security rule gated the same way
(`@Profile("!production")` + property); in prod that rule is absent and only the redirect (to the
already-permitted oauth entry) exists.

**Seeder** — an `ApplicationRunner` (`@Profile("!production")` + `@ConditionalOnProperty(
"app.test-auth.enabled"=true)`, idempotent) upserts the fixed test users on startup (localhost +
staging, when the switch is on). **Not** Flyway (can't be profile/condition-gated; would leak into
prod). Synthetic **negative `github_id`s** (−1…−5) so they never collide with real GitHub ids.

| github_login | github_name | display_name | github_id |
| --- | --- | --- | --- |
| `Fry` | – | – | -1 |
| `leela` | `Leela` | `Turanga Leela` | -2 |
| `Bender` | – | – | -3 |
| `prof` | – | `Prof Farnsworth` | -4 |
| `amy` | – | – | -5 |

**Prod guarantee:** in the prod app none of the picker controller, the `…/as` endpoint, the seeder,
or the permit rule are wired (all `@Profile("!production")`). The SPA is byte-identical across envs
and has no test branch. Defense in depth: even if a test path were hit in prod it isn't mapped →
`anyRequest authenticated` 401s it.

## E. Staging profile + config

- **`application-staging.yaml`** (profile `staging`): mirrors prod web settings —
  `forward-headers-strategy: framework`, `Secure`/`SameSite=Lax` cookies (staging is behind the TLS
  edge) — and the datasource to the staging postgres
  (`jdbc:postgresql://postgres:5432/app`, same service name inside the staging stack).
- **GitHub OAuth on staging:** not used for login (picker handles it). The `github` client
  registration is **inherited from the default `application.yaml`** (the localhost dev client-id) so
  the OAuth2 machinery still starts; `.env.staging` supplies a placeholder `GITHUB_CLIENT_SECRET`
  (never exercised). No new GitHub OAuth App is created for staging.
- `application-staging.yaml` sets **`app.test-auth.enabled: true`** (picker login on beta).
- Gating recap: test-auth beans require `@Profile("!production")` **and** `app.test-auth.enabled=true`.
  Flag defaults: `application.yaml` `true`, `application-staging.yaml` `true`,
  `application-production.yaml` `false`. So they are active on localhost + staging, never prod.

## F. localhost (default profile)

With `app.test-auth.enabled=true` (the default): the button → `/login/github` → the picker
(Fry/leela/Bender/prof/amy), no GitHub; the seeder runs (idempotent). **To replay the exact prod
GitHub flow locally, set `app.test-auth.enabled=false`** (e.g. via env/`SPRING_APPLICATION_JSON` or
editing `application.yaml`): the picker + seeder switch off and `/login/github` redirects to the real
GitHub dev-app OAuth — identical to prod behaviour.

## Out of scope / follow-ups

- Auto-deploy on `develop` push (chosen: build-only + manual `update.sh`).
- PR-based gates (chosen: local ff merges).
- Staging DB backups (prod keeps `db-backup`; staging backup not now).
- Actually performing a Postgres major upgrade (staging just makes rehearsing it possible).
- A literal popup window for the picker (chosen: full-page server-rendered picker — keeps the SPA
  free of popup/postMessage logic; the page is styled as a small centered card to approximate the
  "small window" feel).
- The per-community countdown/game logic (separate spec).

## Feed knowledge back

Capture into `.claude/guidelines/deployment.md`: the one-compose + per-env-file
(`COMPOSE_PROJECT_NAME`) multi-stack pattern; branch→image-tag mapping (`develop`→`:staging`,
`main`→`:latest`); one pgAdmin per environment (own postgres, `PGADMIN_PORT` per env). And into
`security-and-auth.md`: the **emulator-pattern test-login** — one SPA button → `/login/github`,
profile-decided server-side (prod GitHub vs `@Profile("!production")` server-rendered picker),
seeder as an ApplicationRunner with synthetic negative github_ids, nothing test-related in the prod
app or SPA; and the `app.test-auth.enabled` switch (profile + property gating) that flips localhost
to the real prod GitHub flow on demand.
