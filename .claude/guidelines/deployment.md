# Deployment

Production runs on a single **linux/arm64** server from one Docker Compose file;
images are built by GitHub Actions and pulled from **ghcr.io**. See the design spec + plan in
`docs/superpowers/` and the on-server guide in `deploy/README.md`. Everything HTTP-facing —
the two Caddys, TLS, routing, cache headers, the forwarded-header chain — lives in
[deployment-edge.md](deployment-edge.md).

## Images & CI

- **Tests gate the image (both apps).** A red test must fail the job *before* anything is
  built or published:
  - `build-core`: an explicit **`./mvnw -B clean verify`** step (full suite incl. Testcontainers
    + `ModularityTests`) runs first; the image step then uses `spring-boot:build-image -DskipTests`
    (suite already ran — don't run it twice). Do **not** rely on `build-image`'s implicit fork to
    the `package` phase; make the gate explicit.
  - `build-web`: the **Docker build only runs `pnpm build`** (vue-tsc type-check + vite build) —
    it does **NOT** run eslint or Vitest. So the workflow adds an explicit
    **`pnpm install && pnpm lint && pnpm typecheck && pnpm test`** step (setup-node +
    `corepack enable`) before the `docker build`. The `typecheck` is not redundant with the
    image build: on a **pull request the image steps are skipped**, so `pnpm build` never runs
    and vue-tsc would otherwise only see the code after merge. **The gate must stand alone.**
- **Backend** `ghcr.io/unividuell/countdown-core` — built with **Cloud Native Buildpacks** via
  `spring-boot:build-image`. Image name + `<docker><publishRegistry>` (`${env.GHCR_USERNAME}`/
  `${env.GHCR_TOKEN}`) live in the `spring-boot-maven-plugin` config.
- **Web** `ghcr.io/unividuell/countdown-web` — multi-stage Dockerfile (`node` build → `pnpm build`;
  then `caddy` with `dist/` + Caddyfile baked in). Postgres is the official `postgres:18`.
- **CI runner: `ubuntu-24.04-arm`** (GitHub-hosted, native arm64 — free for the public repo).
  Buildpacks don't cross-build, so build arm64 on an arm64 runner (not buildx/QEMU).
- **`pull_request` validates, `push` publishes.** Both workflows trigger on *both* events with
  the same branch/path filters, and every image step carries
  `if: github.event_name != 'pull_request'`. A PR therefore runs only its test gate. This
  matters: the tag resolver is `ref_name == 'main' ? latest : staging`, so an **unguarded PR run
  would publish over `:staging`** from an unmerged branch. When adding a step that touches ghcr,
  guard it the same way.
- Push is **path-filtered** so each app only rebuilds on its own changes;
  `permissions: { contents: read, packages: write }`, ghcr auth via `GITHUB_TOKEN`.
  Both workflows also declare **`workflow_dispatch`** for manual runs — and note that
  **path-filtered workflows do NOT trigger on the initial branch-creation push** (no diff
  base), so the first `build-web` had to be kicked off another way. Each workflow lists its
  own file in `paths`, so editing the workflow re-triggers it.
- **ghcr package visibility:** the `countdown-core`/`countdown-web` packages are kept **private**.
  The server therefore authenticates before pulling: `docker login ghcr.io -u <user>` with a
  token that has **`read:packages`** (the credential persists in `~/.docker/config.json`). CI
  publishes with the workflow `GITHUB_TOKEN` + `packages: write`.
- **Branch → image tag:** both workflows trigger on **`main` and `develop`**; a `Resolve image tag`
  step (`${{ github.ref_name == 'main' && 'latest' || 'staging' }}`) sets the tag — `main`→`:latest`
  (prod), `develop`→`:staging` — see [git-workflow.md](git-workflow.md) for the branching model
  those two branches encode. Wire the tag into the image name — **core: `-Dcountdown.image.tag=<tag>`**
  (a pom property substituted into `<image><name>`; the `-Dspring-boot.build-image.imageName` user
  property does **not** override a pom-set `<image><name>` in this plugin version — it silently
  built `:latest`); web: `docker build -t …:<tag>`.

## Prod + staging on one host (one compose, per-env files)

Both stacks live in **`/opt/unividuell/countdown/`** and share **one parametrized
`deploy/compose.yaml`** (renamed from `compose.prod.yaml`). They differ only by an env file:

- `.env.prod` / `.env.staging`, each carrying **`COMPOSE_PROJECT_NAME`** (`countdown` /
  `countdown-staging`), `IMAGE_TAG` (`latest` / `staging`), `SPRING_PROFILES_ACTIVE`
  (`production` / `staging`), `PGADMIN_PORT`, `BACKUP_DIR` (`./backups` / `./backups-staging`),
  and secrets.
- **`COMPOSE_PROJECT_NAME` is the stack's identity**, not the compose file's name or location
  (the compose file declares no `name:`). Keep it stable and the existing volumes are reused
  across any rename or move; change it and you silently get a second, empty stack. The distinct
  names are also what make staging independently start/stoppable and keep the two Postgres volumes
  (`countdown_pgdata` / `countdown-staging_pgdata`) separate — so a Postgres major upgrade can be
  rehearsed on staging first.
- **The compose file is per target on disk** (`compose.prod.yaml` / `compose.staging.yaml`), because
  both stacks share one directory: with a single `compose.yaml`, a staging run would overwrite the
  file prod is deployed from. Containers are matched by `COMPOSE_PROJECT_NAME`, not by filename, so
  the on-disk name is free to change and renaming recreates nothing on its own.
- **A new required var doesn't reach existing deployments on its own:** `update.sh` writes
  `.env.<target>` from the template **only when the file doesn't exist yet** — a stack bootstrapped
  before a new `${VAR}` was added keeps its old env file forever, silently missing it (e.g.
  `SUPER_ADMIN_GITHUB_LOGINS`). When adding one, document a one-line manual-migration note in
  `deploy/README.md` right where an upgrading operator will read it — a first-run checklist alone
  isn't enough, since existing stacks skip the whole "first run" path.
- **`--env-file` is substitution-only, not passthrough:** `docker compose --env-file .env.prod`
  only makes a var available for `${VAR}` interpolation *inside* `compose.yaml` — it does **not**
  inject it into a container's process environment. A variable reaches `core` only because its
  `environment:` list names it (`SUPER_ADMIN_GITHUB_LOGINS=${SUPER_ADMIN_GITHUB_LOGINS:-}`, same
  pattern as `GITHUB_CLIENT_SECRET`/`POSTGRES_PASSWORD`). Add a var to an `.env.*` file without
  also adding it to the service's `environment:` (or an `env_file:`), and the app-side property binds
  empty/default with no error — it silently never reaches the JVM. Every new Spring `${...}` property
  backed by a compose-level secret needs **both** the `.env.*` entry **and** the `environment:` line.

## Backend production profile

- `application-production.yaml` (profile `production`): GitHub **client-id committed** (public),
  **client-secret via env**; explicit datasource to the compose `postgres` service;
  `server.forward-headers-strategy=framework` (see [deployment-edge.md](deployment-edge.md) for the
  hop chain that makes it necessary); `Secure`/`SameSite=Lax` session cookies.
- **`spring-boot-docker-compose` is excluded from the prod image** automatically — it's
  `optional`/`runtime` in the pom and the Maven plugin's `repackage`/`build-image` defaults to
  `excludeDockerCompose=true`. So **no `spring.docker.compose.enabled=false` needed** (the support
  isn't on the prod classpath; the in-tests skip-check is irrelevant there).

## Server compose & ops

- **No service publishes a host port except pgAdmin** (loopback only). `postgres` and `core` are
  reachable on the `internal` network only; `countdown-web` is reached by the shared edge over the
  `edge` network. Secrets come from the server-side `.env.<target>` files, never committed.
- **`postgres:18` volume mount gotcha:** Postgres 18's Docker image moved `PGDATA` into a
  version subdir and the recommended mount point to **`/var/lib/postgresql`** (not the old
  `/var/lib/postgresql/data`). Mounting the named volume at `.../data` makes 18 **refuse to
  start** — it logs "PostgreSQL data in /var/lib/postgresql/data (unused mount/volume)" and
  crash-loops, which cascades (`UnknownHostException: postgres` in `core`, 502 at the edge).
  Mount the **parent**: `pgdata:/var/lib/postgresql`. (pg_dump/psql via `-h postgres` are
  unaffected — they go over the network.)
- **Backup:** a `db-backup` sidecar reusing `postgres:18` runs `pg_dump | gzip` to the host
  `BACKUP_DIR` (7-day retention). Harden it: `entrypoint: ["/bin/bash","-c"]` + `set -eo pipefail` +
  `until pg_isready ...; do sleep 2; done` before each dump — otherwise a not-yet-ready Postgres makes
  `gzip` write a silent corrupt/empty archive (the pipe hides `pg_dump`'s failure). PITR is a later
  pgBackRest upgrade. **Compose gotcha:** in a `command:` block escape shell `$(...)` as `$$(...)`,
  else Compose interpolates it away.

### `update.sh <prod|staging>`

The server runs a `curl`-able `update.sh` (default target `prod`) that re-fetches the infra files,
then `docker compose --env-file .env.<target> -f compose.<target>.yaml pull && up -d`. Only the
per-target compose files, `.env.prod`/`.env.staging`, `README.md` and `update.sh` itself live on the
server; the Caddyfile is image-baked.

- **Each target fetches `compose.yaml` from the branch its images come from** — prod from `main`
  (`:latest`), staging from `develop` (`:staging`), saved as `compose.<target>.yaml`; `REF=<branch>`
  overrides for a one-off. Infra must follow the same branch as the code it deploys, or staging runs
  develop images on main infrastructure and a compose-level change can never be exercised before it
  reaches prod.
- **`update.sh` and `README.md` stay pinned to `main`** for both targets — they are one shared copy,
  and a staging run must not leave prod driving an unreleased script. So a change to `update.sh`
  itself is only testable after it reaches `main`, and it takes effect on the *next* invocation (the
  running shell keeps its old inode across the `mv`) — budget two runs when changing the script.

## pgAdmin in production

- Under a **`debug` compose profile** (off by default), bound to **`127.0.0.1` only** (never public,
  not proxied by Caddy). Access via an SSH local-port-forward (`ssh -L <port>:127.0.0.1:<port> user@server`).
- **One pgAdmin per environment**, each connecting only to its own `postgres` via the service name —
  no shared instance or network. Distinct loopback ports (`PGADMIN_PORT`: prod 5050, staging 5051)
  let you tunnel both at once. `deploy/README.md` documents the per-env start + SSH tunnel.
- **Desktop mode (no pgAdmin login):** `PGADMIN_CONFIG_SERVER_MODE=False` +
  `PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED=False`. The boundary is **SSH + loopback bind** — anyone
  past SSH can read the `.env` secrets anyway, so an extra pgAdmin login is no added security, only
  friction. Gotcha: set `PGADMIN_CONFIG_DESKTOP_USER='<email>'` to **match** `PGADMIN_DEFAULT_EMAIL`
  (else pgAdmin looks up its built-in default and 401s); `PGADMIN_CONFIG_*` values are written into a
  Python config verbatim, so string values need **embedded quotes**, booleans (`False`) do not.

## Docker Desktop gotcha (local, macOS)

This project lives under `/opt`, which Docker Desktop does **not** share by default → host
**bind mounts** (`docker run -v /opt/...`) fail with "mounts denied". Avoid them:

- inject small config files via inline compose **`configs: [{ content: ... }]`** (no host mount);
- validate a Caddyfile by piping it via **stdin** into a container
  (`docker run -i caddy:2-alpine sh -c 'cat > /tmp/Caddyfile && caddy adapt --config /tmp/Caddyfile --adapter caddyfile'`),
  not with `-v`.

Named volumes are unaffected (Docker-managed).
