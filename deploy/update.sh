#!/usr/bin/env sh
# Full update for one stack: [REF=<branch>] ./update.sh [prod|staging]  (default: prod)
#
# Each target tracks the branch its images are built from — prod/main/:latest,
# staging/develop/:staging — so staging can validate an infra change before it
# reaches prod. Set REF to deploy one stack from another branch for a one-off test.
set -eu
TARGET="${1:-prod}"
case "$TARGET" in
  prod)    REF="${REF:-main}" ;;
  staging) REF="${REF:-develop}" ;;
  *) echo "usage: [REF=<branch>] ./update.sh [prod|staging]"; exit 2 ;;
esac
ENV_FILE=".env.$TARGET"
# Per-target filename: both stacks share this directory, so a single compose.yaml would
# mean a staging run overwrites the file prod is deployed from.
COMPOSE_FILE="compose.$TARGET.yaml"
BASE="https://raw.githubusercontent.com/unividuell/countdown/$REF/deploy"
# update.sh and README.md are one shared copy on disk, so they always track main —
# a staging run must not leave prod driving an unreleased script.
STABLE="https://raw.githubusercontent.com/unividuell/countdown/main/deploy"

curl -fsSL "$BASE/compose.yaml" -o "$COMPOSE_FILE"
curl -fsSL "$STABLE/README.md"  -o README.md
curl -fsSL "$STABLE/update.sh"  -o update.sh.new && chmod +x update.sh.new && mv update.sh.new update.sh

if [ ! -f "$ENV_FILE" ]; then
  curl -fsSL "$BASE/$ENV_FILE.example" -o "$ENV_FILE"
  echo "$ENV_FILE created from template — fill in the secrets, then re-run ./update.sh $TARGET"
  exit 1
fi

# Das Spieldatenset liegt verschluesselt im oeffentlichen Repo; entschluesselt wird hier, nicht in
# der Anwendung -- die liest schlichtes YAML von einem Pfad und kennt weder sops noch einen Key.
# SOPS_AGE_KEY_FILE zeigt auf den privaten Schluessel, der ausserhalb des Repos auf dem Server liegt.
# update.sh besitzt diesen Pfad und exportiert ihn fuer compose, statt ihn aus der .env zu lesen:
# Compose interpoliert Anfuehrungszeichen, Kommentare, ${VAR}-Referenzen und CRLF weg, waehrend ein
# simples Auslesen der Zeile das woertlich mitnimmt -- keiner dieser Faelle bricht laut ab, das
# Skript entschluesselt dann nach einem anderen Pfad als dem, den compose mountet. Die Shell-Umgebung
# hat bei `docker compose` Vorrang vor --env-file, also reicht export: eine Quelle der Wahrheit.
# Eigener Dateiname pro Target: beide Stacks teilen sich dieses Verzeichnis, ein gemeinsamer Name
# wuerde bedeuten, dass ein staging-Lauf das von prod gemountete Klartext-File unter der Decke
# austauscht, ohne dass der prod-Container neu startet.
GUESS_HUE_DATASET_FILE="./secrets/guess-hue-dataset.$TARGET.yaml"
export GUESS_HUE_DATASET_FILE
DATASET_SOPS_FILE="guess-hue-dataset.$TARGET.sops.yaml"
if ! curl -fsSL "$BASE/guess-hue-dataset.sops.yaml" -o "$DATASET_SOPS_FILE"; then
  echo "Could not download guess-hue-dataset.sops.yaml from branch '$REF' ($BASE)." >&2
  echo "The encrypted Guess Hue dataset must exist on that branch before update.sh can run." >&2
  exit 1
fi
mkdir -p secrets
# Host-seitiger Schutz sitzt am Verzeichnis, nicht an der Datei (siehe unten). Festes "secrets/"
# statt dirname($GUESS_HUE_DATASET_FILE): der Pfad kommt jetzt aus update.sh selbst, nicht mehr
# aus Nutzereingabe -- kein dirname-Sonderfall wie ein blosser Dateiname (dirname "." wuerde das
# ganze geteilte Deploy-Verzeichnis mit Compose-/.env-Dateien und Backups sperren) noetig.
chmod 700 secrets
# Erst nach ".tmp" entschluesseln und per mv an die Zielstelle ziehen: schlaegt sops fehl, bleibt
# die bestehende gute Datei am Mount-Ziel unangetastet. Wuerde direkt auf die Zielstelle
# geschrieben, truenkiert das ">" die Datei schon vor dem ersten sops-Byte -- der laufende
# Container ueberlebt zwar am offenen Inode, aber beim naechsten Neustart loest Docker die
# fehlende Bind-Quelle neu auf, legt dort ein leeres Verzeichnis an, und core crasht dauerhaft.
# umask 077 haelt die tmp-Datei waehrend des Schreibens vertraulich (sonst kurz weltlesbar).
OLD_UMASK="$(umask)"
umask 077
if ! SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}" \
     sops -d "$DATASET_SOPS_FILE" > "$GUESS_HUE_DATASET_FILE.tmp"; then
  echo "sops could not decrypt the Guess Hue dataset." >&2
  echo "Install sops and put the age key at \${SOPS_AGE_KEY_FILE:-\$HOME/.config/sops/age/keys.txt}." >&2
  rm -f "$GUESS_HUE_DATASET_FILE.tmp"
  umask "$OLD_UMASK"
  exit 1
fi
umask "$OLD_UMASK"
mv "$GUESS_HUE_DATASET_FILE.tmp" "$GUESS_HUE_DATASET_FILE"
# 644 statt 600: core laeuft im Container als Paketo-Buildpacks-User (UID 1002, GID 1001 laut
# `docker inspect ghcr.io/unividuell/countdown-core --format '{{.Config.User}}'`), Bind-Mounts
# remappen keine UIDs, und der Host-User, der update.sh faehrt, kennt diese UID nicht. Vertraulich
# bleibt das Datenset trotzdem: das Verzeichnis (0700, s.o.) ist nur fuer den Host-Owner betretbar.
chmod 644 "$GUESS_HUE_DATASET_FILE"

docker network create edge 2>/dev/null || true
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
docker image prune -f
echo "Update complete ($TARGET, infra from $REF)."
