# Deployment

Production runs on a single **linux/arm64** server from one Docker Compose file;
images are built by GitHub Actions and pulled from **ghcr.io**. See the design spec + plan in
`docs/superpowers/` and the on-server guide in `deploy/README.md`. Everything HTTP-facing —
the two Caddys, TLS, routing, cache headers, the forwarded-header chain — lives in
[deployment-edge.md](deployment-edge.md). Everything that runs **on the server itself** — ops,
backups, `update.sh`, secret-handling scripts, pgAdmin — lives in
[deployment-server.md](deployment-server.md).

## Images & CI

- **Tests gate the image (both apps).** A red test must fail the job *before* anything is
  built or published:
  - `build-core`: an explicit **`./mvnw -B clean verify`** step runs first; the image step then
    uses `spring-boot:build-image -DskipTests`. Do **not** rely on `build-image`'s implicit fork
    to the `package` phase.
  - `build-web`: the Docker build runs only `pnpm build` — no eslint, no Vitest. So the workflow
    runs **`pnpm install && pnpm lint && pnpm typecheck && pnpm test`** before it. `typecheck` is
    not redundant: on a pull request the image steps are skipped and `pnpm build` never runs.
    **The gate must stand alone.**
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
- Push is **path-filtered** so each app only rebuilds on its own changes (each workflow lists its
  own file in `paths`, so editing the workflow re-triggers it); `permissions: { contents: read,
  packages: write }`, ghcr auth via `GITHUB_TOKEN`. Both declare **`workflow_dispatch`** for manual
  runs — needed because a path-filtered workflow does **not** trigger on the initial
  branch-creation push (no diff base), nor on a push changing **more than 300 files**: GitHub
  then skips the run silently. A large release merge into `main` hits this — check the Actions
  tab after merging, and start both builds by hand:
  `gh workflow run build-core.yml --ref main` and `gh workflow run build-web.yml --ref main`.
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
`deploy/compose.yaml`**. They differ only by an env file:

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
  `.env.<target>` from the template **only when the file doesn't exist yet**, so an existing stack
  silently misses the new `${VAR}`. Put a one-line manual-migration note in `deploy/README.md`
  where an upgrading operator reads it — existing stacks skip the "first run" path.
- **`--env-file` only feeds `${VAR}` interpolation inside `compose.yaml`;** it injects nothing
  into the container. Every var also needs the service's `environment:` line (or an `env_file:`),
  or it binds empty with no error.
- **A value `update.sh` computes (a path derived from `$TARGET`) is `export`ed by the script,**
  never re-read out of the `.env.*` file with `grep`/`cut` — a hand-rolled parser and Compose's
  diverge on quotes, comments, `${VAR}` references and CRLF, and the script then writes one path
  while Compose mounts another. The shell environment takes precedence over `--env-file`, so don't
  also put the value in the `.env.*.example` template.

## Backend production profile

- `application-production.yaml` (profile `production`): the GitHub App's **client-id committed**
  (public), **client-secret via env**; explicit datasource to the compose `postgres` service;
  `server.forward-headers-strategy=framework` (see [deployment-edge.md](deployment-edge.md) for the
  hop chain that makes it necessary); `Secure`/`SameSite=Lax` session cookies.
- **`spring-boot-docker-compose` is excluded from the prod image automatically**
  (`optional`/`runtime` in the pom; `build-image` defaults to `excludeDockerCompose=true`). No
  `spring.docker.compose.enabled=false` needed.

## Docker Desktop gotcha (local, macOS)

This project lives under `/opt`, which Docker Desktop does **not** share by default → host
**bind mounts** (`docker run -v /opt/...`) fail with "mounts denied". Avoid them:

- inject small config files via inline compose **`configs: [{ content: ... }]`** (no host mount);
- validate a Caddyfile by piping it via **stdin** into a container
  (`docker run -i --rm ghcr.io/unividuell/countdown-web caddy adapt --config /dev/stdin --adapter caddyfile < Caddyfile`),
  not with `-v`.

Named volumes are unaffected (Docker-managed).
