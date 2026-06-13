# countdown — server operations

Two stacks from one parametrized `compose.yaml`:
- **prod** (`countdown.unividuell.org`) — images `:latest`, `SPRING_PROFILES_ACTIVE=production`, real GitHub OAuth.
- **staging** (`beta.countdown.unividuell.org`) — images `:staging`, `SPRING_PROFILES_ACTIVE=staging`, test-user picker login.

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

## Bootstrap / Update

`update.sh <target>` handles both stacks. On first run it writes `.env.<target>` from the example template,
prints a reminder to fill in secrets, and exits without starting Docker. Fill in the values, then re-run.

```bash
# private ghcr images: authenticate first (token needs read:packages)
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-username> --password-stdin

mkdir -p /opt/unividuell/countdown && cd /opt/unividuell/countdown
curl -fsSL https://raw.githubusercontent.com/unividuell/countdown/main/deploy/update.sh -o update.sh && chmod +x update.sh

# prod stack
./update.sh prod        # first run writes .env.prod from template + stops
# edit .env.prod: POSTGRES_PASSWORD, GITHUB_CLIENT_SECRET, PGADMIN_EMAIL/PGADMIN_PASSWORD
./update.sh prod        # pulls :latest images and starts the prod stack

# staging stack (independent — own volumes, own network name)
./update.sh staging     # first run writes .env.staging from template + stops
# edit .env.staging: POSTGRES_PASSWORD (own), PGADMIN_PASSWORD; GITHUB_CLIENT_SECRET=unused is fine
./update.sh staging     # pulls :staging images and starts the staging stack
```

Both stacks run independently. To restart or stop one without touching the other:
```bash
docker compose --env-file .env.staging -f compose.yaml down
docker compose --env-file .env.staging -f compose.yaml up -d
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
docker compose --env-file .env.prod -f compose.yaml --profile debug up -d pgadmin

# 2) from your workstation, open an SSH tunnel: laptop:5050 -> server loopback:5050
ssh -L 5050:127.0.0.1:5050 <user>@<server>

# 3) browse http://localhost:5050 — opens straight in (no login). The "countdown app (postgres)"
#    server is pre-registered; enter the DB password (POSTGRES_PASSWORD) once — it persists in the
#    pgadmin-data volume.

# 4) when done
docker compose --env-file .env.prod -f compose.yaml --profile debug stop pgadmin
```

**Staging pgAdmin (port 5051):**
```bash
# 1) start it on the server
docker compose --env-file .env.staging -f compose.yaml --profile debug up -d pgadmin

# 2) from your workstation, open an SSH tunnel: laptop:5051 -> server loopback:5051
ssh -L 5051:127.0.0.1:5051 <user>@<server>

# 3) browse http://localhost:5051 — opens straight in (no login), connected only to the staging DB.

# 4) when done
docker compose --env-file .env.staging -f compose.yaml --profile debug stop pgadmin
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
  | docker compose --env-file .env.prod -f compose.yaml exec -T postgres psql -U admin -d app

# staging:
gunzip -c backups-staging/app-<timestamp>.sql.gz \
  | docker compose --env-file .env.staging -f compose.yaml exec -T postgres psql -U admin -d app
```
Restore into an empty/fresh `app` database.
