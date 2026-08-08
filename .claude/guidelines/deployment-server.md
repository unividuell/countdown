# Deployment — server ops, secrets & pgAdmin

Everything that happens **on the deployment host** once the images exist: compose topology on
disk, backups, `update.sh` and the secret-handling scripts it and its siblings run, and pgAdmin.
Sibling: [deployment.md](deployment.md) (images, CI, the compose topology, backend profile).

## Server compose & ops

- **No service publishes a host port except pgAdmin** (loopback only). `postgres` and `core` are
  reachable on the `internal` network only; `countdown-web` is reached by the shared edge over the
  `edge` network. Secrets come from the server-side `.env.<target>` files, never committed.
- **`postgres:18` volume mount gotcha:** Postgres 18's Docker image moved `PGDATA` into a
  version subdir and the recommended mount point to **`/var/lib/postgresql`** (not the old
  `/var/lib/postgresql/data`). Mounting the named volume at `.../data` makes 18 **refuse to
  start** — it logs "PostgreSQL data in /var/lib/postgresql/data (unused mount/volume)" and
  crash-loops, which cascades (`UnknownHostException: postgres` in `core`, 502 at the edge).
  Mount the **parent**: `pgdata:/var/lib/postgresql`.
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
- **A change that needs `update.sh` and `compose.yaml` to move together cannot be staging-deployed
  until it reaches `main`** — the script comes from `main` while compose comes from the deployed
  branch, so staging would pair the old script with the new compose file and fail on every run.
  Plan the release around it, or deploy that once from a copy of the branch's script under a
  different filename (the self-update rewrites `update.sh`, not the file being run). Treat a new
  *required* compose variable as exactly this kind of change.
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
