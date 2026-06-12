# countdown — server operations

Production stack for `countdown.unividuell.org`, run on the (linux/arm64) server
from `compose.prod.yaml`. Images come from `ghcr.io/unividuell/countdown-*:latest`
(public). Everything below is run **on the server**, e.g. in `/opt/countdown/`.

## Prerequisites
- Docker + Docker Compose v2.
- DNS: `A` (and `AAAA`) record `countdown.unividuell.org` → this server's public IP;
  inbound ports **80 + 443** (TCP, and 443/UDP for HTTP/3) open. Without correct DNS +
  reachable 80/443, Caddy cannot obtain a TLS certificate.
- A production GitHub OAuth App (callback `https://countdown.unividuell.org/login/oauth2/code/github`);
  its Client ID is committed in `application-production.yaml`, its secret goes into `.env` as `GITHUB_CLIENT_SECRET`.

## Bootstrap (first time)
```bash
mkdir -p /opt/countdown && cd /opt/countdown
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
cd /opt/countdown && ./update.sh
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
