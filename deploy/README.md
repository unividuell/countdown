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

## Voraussetzung: sops + age (Spielinhalte)

`update.sh` entschlüsselt das Guess-Hue-Datenset auf dem Server, bevor es `compose up` ruft.
Der Server braucht dafür einmalig `age` und `sops`:

```bash
apt-get install -y age
curl -fsSL -o /usr/local/bin/sops https://github.com/getsops/sops/releases/latest/download/sops-linux-arm64 && chmod +x /usr/local/bin/sops
```

Die Images sind arm64 (siehe [deployment.md](../.claude/guidelines/deployment.md)) — auf einem
x86-Server stattdessen `sops-linux-amd64`.

Der Server braucht ein **eigenes** age-Schlüsselpaar — nicht den privaten Schlüssel des Autors.
Der Autoren-Schlüssel gehört nicht auf eine Maschine, die am Internet hängt: bei einer
Kompromittierung müsste sonst alles rotiert werden, nicht nur der Server. Der Server erzeugt sein
Paar selbst, und nur der öffentliche Teil verlässt ihn wieder:

```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt && chmod 600 ~/.config/sops/age/keys.txt
age-keygen -y ~/.config/sops/age/keys.txt   # nur den Public Key ausgeben
```

Der letzte Befehl leitet den Public Key aus der Datei ab, falls die Ausgabe von `age-keygen` nicht
mehr im Scrollback steht. `update.sh` erwartet `SOPS_AGE_KEY_FILE` standardmäßig genau an diesem
Pfad; ein abweichender Ort wird über die `.env` gesetzt. Der private Schlüssel gehört **nicht**
ins Repo.

Ohne Eintrag in `.sops.yaml` **und** ein anschließendes `updatekeys` kann dieser Server die Chiffre
nicht öffnen — das muss also **vor dem ersten Deploy** passieren:

1. Public Key wie oben auf dem Server ermitteln.
2. Lokal in `.sops.yaml` als zweiten Empfänger eintragen (siehe Kommentarkopf dort für das Format
   bei mehreren Empfängern).
3. `sops updatekeys deploy/guess-hue-dataset.sops.yaml` ausführen. Das packt nur den Datenschlüssel
   neu ein — der Inhalt bleibt unangetastet — und braucht dafür den **privaten** Schlüssel des
   Autors (um den Datenschlüssel einmal auszupacken); der Server-Key wird dabei nur als Public Key
   gebraucht.
4. `.sops.yaml` **und** die neu eingepackte `deploy/guess-hue-dataset.sops.yaml` committen.
5. Erst danach deployen — ein Server ohne eingetragenen Key bricht in `update.sh` ab, weil er die
   Chiffre nicht öffnen kann.

Prod und Staging teilen sich einen Server (siehe oben), also deckt ein Server-Key beide Stacks ab;
getrennte Server bräuchten je einen eigenen.

Fehlt Schlüssel oder Werkzeug, bricht `update.sh` mit einer Meldung ab und deployt nicht — statt
einen Container zu starten, der auf Platzhalterinhalten läuft.

`GUESS_HUE_DATASET_FILE` bestimmt, wohin das entschlüsselte Datenset kommt (eigener Name pro
Target, da beide Stacks dasselbe Verzeichnis teilen). **`update.sh` setzt und exportiert diese
Variable selbst** — sie steht bewusst nicht in `.env.prod`/`.env.staging`: Compose gibt der
Shell-Umgebung Vorrang vor `--env-file`, ein Wert dort würde also ohnehin überstimmt und wäre
irreführend. Ruft man `compose up` von Hand ohne `update.sh` auf, muss man
`GUESS_HUE_DATASET_FILE` selbst exportieren; ohne sie bricht `compose up` mit einer klaren
Fehlermeldung ab, statt mit einem leeren Pfad zu binden.

`update.sh` lädt `guess-hue-dataset.sops.yaml` vom selben Branch, den es sonst für `compose.yaml`
verwendet (`$REF` — `main` für prod, `develop` für staging). Die verschlüsselte Datei muss auf
diesem Branch existieren, sonst bricht **jedes** `./update.sh <target>` ab, auch für Änderungen,
die mit Guess Hue nichts zu tun haben.

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

```bash
# private ghcr images: authenticate first (token needs read:packages)
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-username> --password-stdin

mkdir -p /opt/unividuell/countdown && cd /opt/unividuell/countdown
curl -fsSL https://raw.githubusercontent.com/unividuell/countdown/main/deploy/update.sh -o update.sh && chmod +x update.sh

# prod stack
./update.sh prod        # first run writes .env.prod from template + stops
# edit .env.prod: POSTGRES_PASSWORD, GITHUB_CLIENT_SECRET, SUPER_ADMIN_GITHUB_LOGINS, PGADMIN_EMAIL/PGADMIN_PASSWORD
./update.sh prod        # pulls :latest images and starts the prod stack

# staging stack (independent — own volumes, own network name)
./update.sh staging     # first run writes .env.staging from template + stops
# edit .env.staging: POSTGRES_PASSWORD (own), PGADMIN_PASSWORD; GITHUB_CLIENT_SECRET=unused is fine
#   (SUPER_ADMIN_GITHUB_LOGINS=bender comes from the template on this first run — see note above for existing stacks)
./update.sh staging     # pulls :staging images and starts the staging stack
```

Both stacks run independently. To restart or stop one without touching the other:
```bash
docker compose --env-file .env.staging -f compose.staging.yaml down
# up -d resolves the core service's volumes, which needs GUESS_HUE_DATASET_FILE in the shell
# environment (update.sh sets this for you; it's not in .env.staging, see above)
export GUESS_HUE_DATASET_FILE=./secrets/guess-hue-dataset.staging.yaml
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
# up -d resolves the core service's volumes too, which needs GUESS_HUE_DATASET_FILE in the shell
# environment (update.sh sets this for you; it's not in .env.prod, see above)
export GUESS_HUE_DATASET_FILE=./secrets/guess-hue-dataset.prod.yaml
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
# up -d resolves the core service's volumes too, which needs GUESS_HUE_DATASET_FILE in the shell
# environment (update.sh sets this for you; it's not in .env.staging, see above)
export GUESS_HUE_DATASET_FILE=./secrets/guess-hue-dataset.staging.yaml
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
