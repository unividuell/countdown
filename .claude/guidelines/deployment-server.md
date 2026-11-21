# Deployment — server ops, secrets & pgAdmin

Everything that happens **on the deployment host** once the images exist: compose topology on
disk, backups, `update.sh` and the secret-handling scripts it and its siblings run, and pgAdmin.
Sibling: [deployment.md](deployment.md) (images, CI, the compose topology, backend profile).

## Server compose & ops

- **No service publishes a host port except pgAdmin** (loopback only). `postgres` and `core` are
  reachable on the `internal` network only; `countdown-web` is reached by the shared edge over the
  `edge` network. Secrets come from the server-side `.env.<target>` files, never committed.
- **`postgres:18` mounts its volume at the parent: `pgdata:/var/lib/postgresql`.** The image
  moved `PGDATA` into a version subdir; a volume at the old `.../data` makes 18 refuse to start
  ("unused mount/volume") and crash-loop — `UnknownHostException: postgres` in `core`, 502 at the
  edge.
- **Backup:** a `db-backup` sidecar reusing `postgres:18` runs `pg_dump | gzip` to the host
  `BACKUP_DIR` (7-day retention). Harden it: `entrypoint: ["/bin/bash","-c"]` + `set -eo pipefail` +
  `until pg_isready ...; do sleep 2; done` before each dump — otherwise a not-yet-ready Postgres makes
  `gzip` write a silent corrupt/empty archive (the pipe hides `pg_dump`'s failure). PITR is a later
  pgBackRest upgrade. **Compose gotcha:** in a `command:` block escape shell `$(...)` as `$$(...)`,
  else Compose interpolates it away.
- **Split a dump on table data, not on schemas, when one table dwarfs the rest.**
  `--exclude-table-data=<table>` keeps the DDL and drops the rows, so a restore from the daily dump
  alone still boots the app -- with that table empty rather than missing. The heavy table gets its
  own `--data-only --table=<table>` dump, triggered by a fingerprint
  (`count(*) || md5(string_agg(id))`) instead of a schedule, so an unchanged table costs one query
  a day instead of its own size. Retention then counts **changes, not days**: say so where the
  number is configured, or someone will read "keep 8" as "eight days of safety". Today that is
  `imagepool.images` and `audiopool.clips`, both through one `dump_on_change <table> <prefix>
  <keep>` function in `db-backup`: a new heavy table is one more call plus one more
  `--exclude-table-data` and `<PREFIX>_BACKUP_KEEP`, not another copy of the block. Inside it
  guard with `if`, never a trailing `[ ... ] && cmd`: the function would return 1 and `set -e`
  would end the loop.

- **A JVM container without `mem_limit` sizes its heap from the HOST.** The Buildpacks memory
  calculator reads the cgroup limit, and with none the machine — on a shared box every stack
  believes it owns nearly all of it, and nothing fails until something allocates. Set `mem_limit`
  on every JVM service and verify rather than compute: `docker run --rm -m 2g <image>` prints the
  calculator's line. About 610 MB of the limit go to metaspace, code cache, direct memory and
  thread stacks before anything becomes heap — below that the container fails to start. Give the
  variable a **default** in compose (`${CORE_MEM_LIMIT:-2g}`): a new *required* compose variable
  cannot be staging-deployed until `update.sh` reaches `main` (see below).

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
  itself is only testable after it reaches `main`, and the run that fetches it still executes the
  *old* code (the shell keeps its inode across the `mv`) — so after such a merge, `curl` the new
  script into place yourself instead of spending a run on the old one.
- **A change that needs `update.sh` and `compose.yaml` to move together cannot be staging-deployed
  until it reaches `main`** — the script comes from `main` while compose comes from the deployed
  branch, so staging would pair the old script with the new compose file and fail on every run.
  Plan the release around it, or deploy that once from a copy of the branch's script under a
  different filename (the self-update rewrites `update.sh`, not the file being run). Treat a new
  *required* compose variable as exactly this kind of change. **Moving a file `update.sh`
  downloads** is one too: `main`'s `update.sh` first learns the new path with a fallback to the old
  one on a 404, then the move ships, then the fallback goes after the release.
- **A dataset the app reads at startup needs a restart to change.** A content-only commit builds no
  image (CI builds on `core/**`), so `up -d` leaves core running on the old data. `update.sh` marks
  every decrypted dataset that differs from the deployed one (`mark_if_changed`) and then recreates
  core; a new game dataset goes through the same call.
- **Any script that writes a secret to disk follows one discipline: `umask 077` while writing, a
  temp file plus `mv` into place, and `trap … EXIT INT TERM` to clean up on every exit path.** A
  plain `EXIT`-only trap looks sufficient until the actual deploy shell or signal diverges (see the
  `dash`/`SIGINT` gap below). Also never nest a command substitution under `set -e`: the inner
  command's failure is discarded, so the outer one still reports success on an empty string.
- **Never decrypt or generate a secret straight onto a live bind-mount target, and never lock it
  down with `chmod 600`.** `sops -d ... > "$TARGET_FILE"` truncates the mount before the tool
  produces a byte; if the tool then fails, the container's next restart finds the bind source gone
  and Docker recreates it as an empty **directory** — a failed deploy arms a later crash-loop, which
  is exactly what the temp-file-plus-`mv` discipline above prevents. Buildpacks images run as a
  fixed non-root UID a bind mount can't remap, so `600` on the file locks the container out — protect
  the **directory** instead (`700`) and leave the file itself readable (`644`).
- **A deploy-side shell script runs under whatever `/bin/sh` the target host actually has.**
  Debian/Ubuntu's is `dash`, where `trap ... EXIT` alone does not fire on `SIGINT` — a script that
  only sets the `EXIT` trap (looking like it already follows the discipline above) still leaves a
  temp file behind on Ctrl-C there. Verify cleanup on the real target shell, not just the dev
  machine's.

## pgAdmin in production

- **One pgAdmin per environment, opt-in and loopback-only:** under a `debug` compose profile (off
  by default), each connects only to its own `postgres` via the service name, bound to `127.0.0.1`
  on a distinct port (`PGADMIN_PORT`: prod 5050, staging 5051) — never public, never proxied by
  Caddy. Access via an SSH local-port-forward (`ssh -L <port>:127.0.0.1:<port> user@server`);
  distinct ports let you tunnel both at once. `deploy/README.md` documents the per-env start.
- **Desktop mode (no pgAdmin login):** `PGADMIN_CONFIG_SERVER_MODE=False` +
  `PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED=False`. The boundary is **SSH + loopback bind** — anyone
  past SSH can read the `.env` secrets anyway, so an extra pgAdmin login is no added security, only
  friction. Gotcha: set `PGADMIN_CONFIG_DESKTOP_USER='<email>'` to **match** `PGADMIN_DEFAULT_EMAIL`
  (else pgAdmin looks up its built-in default and 401s); `PGADMIN_CONFIG_*` values are written into a
  Python config verbatim, so string values need **embedded quotes**, booleans (`False`) do not.
