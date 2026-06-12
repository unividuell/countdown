# countdown — server operations

Production stack for `countdown.unividuell.org`, run on the (linux/arm64) server
from `compose.prod.yaml`. Images come from `ghcr.io/unividuell/countdown-*:latest`
(**private** packages — the server must `docker login ghcr.io` first, see below).
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
- DNS: `A`/`AAAA` `countdown.unividuell.org` → this server's public IP. TLS is terminated
  by the shared **edge-caddy** (see `/opt/unividuell/edge-caddy`), which must be running and
  routing `countdown.unividuell.org` → `countdown-web:80`. This stack publishes no host
  ports; it only joins the external `edge` network.
- A production GitHub OAuth App (callback `https://countdown.unividuell.org/login/oauth2/code/github`);
  its Client ID is committed in `application-production.yaml`, its secret goes into `.env` as `GITHUB_CLIENT_SECRET`.

## Bootstrap (first time)

> Requires the shared **edge-caddy** stack to be up (it owns 80/443 + TLS) and the external
> `edge` network to exist. `update.sh` creates the network idempotently if missing.

```bash
# private ghcr images: authenticate first (token needs read:packages)
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-username> --password-stdin

mkdir -p /opt/unividuell/countdown && cd /opt/unividuell/countdown
curl -fsSL https://raw.githubusercontent.com/unividuell/countdown/main/deploy/update.sh -o update.sh && chmod +x update.sh
./update.sh                 # fetches README.md + compose.prod.yaml + a .env template, then stops
# edit .env: POSTGRES_PASSWORD, GITHUB_CLIENT_SECRET, PGADMIN_EMAIL/PGADMIN_PASSWORD
./update.sh                 # pulls images and starts the stack
```

`update.sh` on first run detects no `.env`, downloads `.env.example` as `.env`, prints a
reminder to fill in the secrets, and exits without starting Docker. Fill in the values,
then run `./update.sh` again.

## Update (new images / infra changes)
```bash
cd /opt/unividuell/countdown && ./update.sh
```
Re-fetches `compose.prod.yaml`, `README.md`, and `update.sh` itself from `main`, then runs:
```
docker compose --env-file .env -f compose.prod.yaml pull
docker compose --env-file .env -f compose.prod.yaml up -d
docker image prune -f
```
It never overwrites `.env`.

## Debug the DB (pgAdmin — no public endpoint, SSH tunnel only)
pgAdmin runs only under the `debug` profile and is bound to `127.0.0.1:5050` on the server's
loopback, so it is not reachable from the internet.

```bash
# 1) start it on the server (on demand)
docker compose --env-file .env -f compose.prod.yaml --profile debug up -d pgadmin

# 2) from your workstation, open an SSH tunnel: laptop:5050 -> server loopback:5050
ssh -L 5050:127.0.0.1:5050 <user>@<server>

# 3) browse http://localhost:5050 ; log in with PGADMIN_EMAIL / PGADMIN_PASSWORD.
#    The "countdown app (postgres)" server is pre-registered; enter the DB password
#    (POSTGRES_PASSWORD) once — it persists in the pgadmin-data volume.

# 4) when done
docker compose --env-file .env -f compose.prod.yaml --profile debug stop pgadmin
```

## Backups & restore
The `db-backup` service writes daily logical dumps to `./backups/app-<timestamp>.sql.gz`
(7-day retention). Copy `./backups` off-site regularly (rsync/scp).

**Restore** into the running database:
```bash
gunzip -c backups/app-<timestamp>.sql.gz \
  | docker compose --env-file .env -f compose.prod.yaml exec -T postgres psql -U admin -d app
```
Restore into an empty/fresh `app` database.
