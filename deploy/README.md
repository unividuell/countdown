# countdown — server operations

Two stacks from one parametrized compose file, fetched per target as `compose.prod.yaml` / `compose.staging.yaml`:
- **prod** (`countdown.unividuell.org`) — branch `main`, images `:latest`, `SPRING_PROFILES_ACTIVE=production`, real GitHub OAuth.
- **staging** (`beta.countdown.unividuell.org`) — branch `develop`, images `:staging`, `SPRING_PROFILES_ACTIVE=staging`, test-user picker login.

Both live in `/opt/unividuell/countdown/` on the server, identified by `COMPOSE_PROJECT_NAME` in their per-env file.
Images come from `ghcr.io/unividuell/countdown-*` (**private** packages — the server must `docker login ghcr.io` first, see below).
Everything below is run **on the server**, e.g. in `/opt/unividuell/countdown/`.

## Prerequisites
- Docker + Docker Compose v2.
- **ghcr login (private images):** the server must authenticate to pull. Create a GitHub
  token with **`read:packages`** scope (classic PAT, or a fine-grained token with package
  read on this repo), then once on the server:
  ```bash
  echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-username> --password-stdin
  ```
  The credential persists in `~/.docker/config.json`, so `update.sh`'s `docker compose pull` works.
- DNS: `A`/`AAAA` `countdown.unividuell.org` and `beta.countdown.unividuell.org` → this server's public IP.
  TLS is terminated by the shared **edge-caddy** (see `/opt/unividuell/edge-caddy`), which must be running and
  routing both hostnames to their respective `-web` containers. Stacks publish no host ports; they only join
  the external `edge` network.
- A production GitHub OAuth App (callback `https://countdown.unividuell.org/login/oauth2/code/github`);
  its Client ID is committed in `application-production.yaml`, its secret goes into `.env.prod` as `GITHUB_CLIENT_SECRET`.
  Staging does not use a real GitHub OAuth App (`GITHUB_CLIENT_SECRET=unused`); login is via the built-in test-user picker.
- `SUPER_ADMIN_GITHUB_LOGINS` in `.env.prod`/`.env.staging` grants the app-level super-admin role
  (`/api/super-admin/...`) to a comma-separated list of GitHub logins. Leave it empty and nobody
  has the role.

## Prerequisite: sops + age (game content)

`update.sh` decrypts the Guess Hue dataset and the Weltanschauung term list on the server
before calling `compose up`. The server needs `age` and `sops` installed once:

```bash
apt-get install -y age
curl -fsSL -o /usr/local/bin/sops https://github.com/getsops/sops/releases/download/v3.13.3/sops-v3.13.3.linux.arm64 && chmod +x /usr/local/bin/sops
```

`releases/latest/download/<name>` doesn't work for sops — asset names carry the version
(`sops-v3.13.3.linux.arm64`, not `sops-linux-arm64`), hence the pinned tag above. Version
3.13.3 is pinned deliberately: the checked-in `deploy/guess-hue-dataset.sops.yaml` carries
`version: 3.13.3`, and matching the server's sops to it avoids format surprises between
encryption and decryption. If sops gets updated locally, update the server promptly too.
The same applies to `deploy/spot-object-terms.sops.yaml` (the Weltanschauung term list) —
one sops install and one age key pair serve both games.

Check the architecture **on the server** first (`dpkg --print-architecture`) — don't assume.
That's the server CPU's architecture, not the container images' (those are arm64, see
[deployment.md](../.claude/guidelines/deployment.md)). On an `amd64` server, use
`sops-v3.13.3.linux.amd64` instead. On Debian, the matching `.deb`
(`sops_3.13.3_arm64.deb`/`sops_3.13.3_amd64.deb`, via `dpkg -i`) is the tidier route.

For later, once 3.13.3 is stale — resolve the current tag from the API instead of pinning it:

```bash
TAG=$(curl -fsSL https://api.github.com/repos/getsops/sops/releases/latest | grep -oP '"tag_name": "\K[^"]+')
curl -fsSL -o /usr/local/bin/sops "https://github.com/getsops/sops/releases/download/${TAG}/sops-${TAG}.linux.arm64" && chmod +x /usr/local/bin/sops
```

The server needs its **own** age key pair — not the author's private key. The author's key
has no business on a machine that faces the internet: a compromise would force rotating
everything, not just the server. Have the server generate its own pair, and only ever let
the public half leave it:

```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt && chmod 600 ~/.config/sops/age/keys.txt
age-keygen -y ~/.config/sops/age/keys.txt   # print just the public key
```

That last command re-derives the public key from the file, for when `age-keygen`'s original
output has scrolled away. `update.sh` looks for `SOPS_AGE_KEY_FILE` at exactly that path by
default. Set a different location **in the environment that `update.sh` runs in** — not in
`.env`: that file is only ever passed to Compose via `--env-file`, never read into
`update.sh`'s own shell, so a value there would never reach the `sops` call. Either per
invocation:

```bash
SOPS_AGE_KEY_FILE=/opt/unividuell/secrets/age.key ./update.sh prod
```

or permanently in the deploying user's shell profile. The private key does **not** go into
the repo.

Without an entry in `.sops.yaml` **and** a subsequent `updatekeys`, this server can't open the
cipher — so this has to happen **before the first deploy**:

1. Get the public key on the server as above.
2. Add it locally to `.sops.yaml` as a second recipient (see that file's comment header for
   the multi-recipient format).
3. Run `sops updatekeys deploy/guess-hue-dataset.sops.yaml` (and, once it exists,
   `deploy/spot-object-terms.sops.yaml`). This only re-wraps the data key — the content is
   untouched — and needs the author's **private** key to do it (to unwrap the data key once);
   the server key is only needed as a public key here.
4. Commit `.sops.yaml` **and** the re-wrapped cipher file(s).
5. Only deploy after that — a server without an entered key fails in `update.sh` because it
   can't open the cipher.

Prod and staging share one server (see above), so one server key covers both stacks; separate
servers would each need their own.

Missing key or tooling makes `update.sh` abort with a message rather than deploy — instead of
starting a container that runs on placeholder content.

`GUESS_HUE_DATASET_FILE` decides where the decrypted dataset lands (a distinct name per
target, since both stacks share one directory). **`update.sh` sets and exports this variable
itself** — it's deliberately absent from `.env.prod`/`.env.staging`: Compose gives shell
environment precedence over `--env-file`, so a value there would be overridden anyway and
would be misleading. Calling `compose up` by hand without `update.sh` means exporting
`GUESS_HUE_DATASET_FILE` yourself; without it, `compose up` fails with a clear error instead
of binding an empty path.

`update.sh` fetches `guess-hue-dataset.sops.yaml` from the same branch it otherwise uses for
`compose.yaml` (`$REF` — `main` for prod, `develop` for staging). The encrypted file must
exist on that branch, or **every** `./update.sh <target>` fails, even for changes that have
nothing to do with Guess Hue.

Same shape for `SPOT_OBJECT_TERMS_FILE` and `spot-object-terms.sops.yaml`.

**Merge window develop → main.** `update.sh` and `README.md` always come from `main`
(`$STABLE`), `compose.yaml` from the deployed branch (`$BASE` — `develop` for staging). A
change that needs both to move together therefore cannot be staging-deployed while it is on
`develop` only: the run pairs the **old** script with the **new** compose file. It fails on
every run, not just the first, because the script never comes from `develop`.

Plan for it rather than discover it: either finish the release before the next staging deploy,
or run that one deploy from a copy of the branch's script —

```bash
curl -fsSL https://raw.githubusercontent.com/unividuell/countdown/develop/deploy/update.sh -o update-once.sh
chmod +x update-once.sh && ./update-once.sh staging && rm -f update-once.sh
```

The copy works because the self-update writes `update.sh`, not the file being run. Done twice so
far — the Guess Hue and the Weltanschauung release — and staging came up correctly on both.

Once the release has landed on `main`, the **first** regular run still executes the old script
on disk: it fetches the new one, but the running shell keeps its inode across the `mv`, so it
fails exactly as before. Fetch the script yourself rather than spending a run on it:

```bash
curl -fsSL https://raw.githubusercontent.com/unividuell/countdown/main/deploy/update.sh -o update.sh
chmod +x update.sh && ./update.sh prod
```

## Prerequisite: the Weltanschauung term list

`update.sh` fetches `deploy/spot-object-terms.sops.yaml` from the branch it deploys and aborts
when it is missing — then **every** `./update.sh <target>` fails, including deploys that have
nothing to do with Weltanschauung. It is committed on `main` and `develop` (released
2026-09-03); a branch without it needs the list encrypted and committed first. Only the owner
can produce it — it is the curated term list, and the term list is the game — and no
placeholder substitutes: the backend refuses to start on the sample list under
`production`/`staging`, precisely so a game on placeholder content cannot look healthy.
Never commit a term in plaintext; see core/README.md ("Weltanschauung: term list, the two Maps
keys, and the signing secret") and [game-content.md](../.claude/guidelines/game-content.md).

Also add the three `SPOT_OBJECT_*` variables to `.env.prod`/`.env.staging` by hand — see
"Migrating an existing stack for Weltanschauung" below.

## Bootstrap / Update

`update.sh <target>` handles both stacks. On first run it writes `.env.<target>` from the example template,
prints a reminder to fill in secrets, and exits without starting Docker. Fill in the values, then re-run.

**Each target tracks the branch its images are built from** — prod pulls its compose file and env
template from `main` (matching `:latest`), staging from `develop` (matching `:staging`). So an infra
change is exercised on staging before it can reach prod, the same way application code is. Deploy a
stack from another branch for a one-off test with `REF=<branch> ./update.sh <target>`; `update.sh`
and `README.md` themselves always come from `main`, since both stacks share one copy on disk.

**Existing deployments:** `update.sh` only writes `.env.<target>` from the template when the file
doesn't exist, so a stack bootstrapped earlier keeps its old env file forever. When a release adds a
new variable to the template, add it to your `.env.prod`/`.env.staging` by hand — it will not appear
there on its own, and a missing one binds empty without any error.

**Migrating an existing stack for Weltanschauung:** add `SPOT_OBJECT_MAPS_API_KEY`,
`SPOT_OBJECT_SERVER_MAPS_API_KEY` and `SPOT_OBJECT_SIGNING_SECRET` to `.env.prod`/`.env.staging`
by hand (see core/README.md for where each value comes from and which one is browser-restricted
versus server-only) before the next `./update.sh <target>` — the backend refuses to boot without
them.

```bash
# private ghcr images: authenticate first (token needs read:packages)
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-username> --password-stdin

mkdir -p /opt/unividuell/countdown && cd /opt/unividuell/countdown
curl -fsSL https://raw.githubusercontent.com/unividuell/countdown/main/deploy/update.sh -o update.sh && chmod +x update.sh

# prod stack
./update.sh prod        # first run writes .env.prod from template + stops
# edit .env.prod: POSTGRES_PASSWORD, GITHUB_CLIENT_SECRET, SUPER_ADMIN_GITHUB_LOGINS,
#   PGADMIN_EMAIL/PGADMIN_PASSWORD, SPOT_OBJECT_MAPS_API_KEY, SPOT_OBJECT_SERVER_MAPS_API_KEY,
#   SPOT_OBJECT_SIGNING_SECRET
./update.sh prod        # pulls :latest images and starts the prod stack

# staging stack (independent — own volumes, own network name)
./update.sh staging     # first run writes .env.staging from template + stops
# edit .env.staging: POSTGRES_PASSWORD (own), PGADMIN_PASSWORD, SPOT_OBJECT_MAPS_API_KEY,
#   SPOT_OBJECT_SERVER_MAPS_API_KEY, SPOT_OBJECT_SIGNING_SECRET; GITHUB_CLIENT_SECRET=unused is fine
#   (SUPER_ADMIN_GITHUB_LOGINS=bender comes from the template on this first run — see note above for existing stacks)
./update.sh staging     # pulls :staging images and starts the staging stack
```

Both stacks run independently. To restart or stop one without touching the other:
```bash
docker compose --env-file .env.staging -f compose.staging.yaml down
# up -d resolves the core service's volumes, which needs GUESS_HUE_DATASET_FILE and
# SPOT_OBJECT_TERMS_FILE in the shell environment (update.sh sets both for you; neither is in
# .env.staging, see above)
export GUESS_HUE_DATASET_FILE=./secrets/guess-hue-dataset.staging.yaml
export SPOT_OBJECT_TERMS_FILE=./secrets/spot-object-terms.staging.yaml
docker compose --env-file .env.staging -f compose.staging.yaml up -d
```

## Staging login

Staging uses the built-in test-user picker (Futurama characters). There is no real GitHub OAuth flow.
Visit `beta.countdown.unividuell.org` → click Login → pick a test user. The test-user picker
is served by the backend at `/login/github` when `SPRING_PROFILES_ACTIVE=staging`.

## Debug the DB (pgAdmin — no public endpoint, SSH tunnel only)

pgAdmin runs only under the `debug` profile and is bound to `127.0.0.1` on the server's loopback.
Each environment gets its own port so both can run simultaneously. It runs in **desktop mode — no
pgAdmin login** (the SSH boundary + loopback bind already gate access; an extra login adds no
security, only friction). Each pgAdmin connects only to its own DB.

**Prod pgAdmin (port 5050):**
```bash
# 1) start it on the server
# up -d resolves the core service's volumes too, which needs GUESS_HUE_DATASET_FILE and
# SPOT_OBJECT_TERMS_FILE in the shell environment (update.sh sets both for you; neither is in
# .env.prod, see above)
export GUESS_HUE_DATASET_FILE=./secrets/guess-hue-dataset.prod.yaml
export SPOT_OBJECT_TERMS_FILE=./secrets/spot-object-terms.prod.yaml
docker compose --env-file .env.prod -f compose.prod.yaml --profile debug up -d pgadmin

# 2) from your workstation, open an SSH tunnel: laptop:5050 -> server loopback:5050
ssh -L 5050:127.0.0.1:5050 <user>@<server>

# 3) browse http://localhost:5050 — opens straight in (no login). The "countdown app (postgres)"
#    server is pre-registered; enter the DB password (POSTGRES_PASSWORD) once — it persists in the
#    pgadmin-data volume.

# 4) when done
docker compose --env-file .env.prod -f compose.prod.yaml --profile debug stop pgadmin
```

**Staging pgAdmin (port 5051):**
```bash
# 1) start it on the server
# up -d resolves the core service's volumes too, which needs GUESS_HUE_DATASET_FILE and
# SPOT_OBJECT_TERMS_FILE in the shell environment (update.sh sets both for you; neither is in
# .env.staging, see above)
export GUESS_HUE_DATASET_FILE=./secrets/guess-hue-dataset.staging.yaml
export SPOT_OBJECT_TERMS_FILE=./secrets/spot-object-terms.staging.yaml
docker compose --env-file .env.staging -f compose.staging.yaml --profile debug up -d pgadmin

# 2) from your workstation, open an SSH tunnel: laptop:5051 -> server loopback:5051
ssh -L 5051:127.0.0.1:5051 <user>@<server>

# 3) browse http://localhost:5051 — opens straight in (no login), connected only to the staging DB.

# 4) when done
docker compose --env-file .env.staging -f compose.staging.yaml --profile debug stop pgadmin
```

## Backups & restore

The `db-backup` service writes daily logical dumps (7-day retention):
- prod: `./backups/app-<timestamp>.sql.gz`
- staging: `./backups-staging/app-<timestamp>.sql.gz` (set by `BACKUP_DIR` in `.env.staging`)

Copy the backup directory off-site regularly (rsync/scp).

**Restore** into the running database:
```bash
# prod:
gunzip -c backups/app-<timestamp>.sql.gz \
  | docker compose --env-file .env.prod -f compose.prod.yaml exec -T postgres psql -U admin -d app

# staging:
gunzip -c backups-staging/app-<timestamp>.sql.gz \
  | docker compose --env-file .env.staging -f compose.staging.yaml exec -T postgres psql -U admin -d app
```
Restore into an empty/fresh `app` database.
