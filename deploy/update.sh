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
# Ziel kommt aus der bereits vorhandenen .env (nicht hier neu konstruiert) -- ein Tippfehler dort
# soll auffallen, statt zwei verschiedene Pfade fuer update.sh und compose entstehen zu lassen.
DATASET_FILE="$(grep -m1 '^GUESS_HUE_DATASET_FILE=' "$ENV_FILE" | cut -d= -f2-)"
if [ -z "$DATASET_FILE" ]; then
  echo "GUESS_HUE_DATASET_FILE is not set in $ENV_FILE (see deploy/README.md)." >&2
  exit 1
fi
DATASET_DIR="$(dirname "$DATASET_FILE")"
DATASET_SOPS_FILE="guess-hue-dataset.$TARGET.sops.yaml"
if ! curl -fsSL "$BASE/guess-hue-dataset.sops.yaml" -o "$DATASET_SOPS_FILE"; then
  echo "Could not download guess-hue-dataset.sops.yaml from branch '$REF' ($BASE)." >&2
  echo "The encrypted Guess Hue dataset must exist on that branch before update.sh can run." >&2
  exit 1
fi
mkdir -p "$DATASET_DIR"
# Host-seitiger Schutz sitzt am Verzeichnis, nicht an der Datei (siehe unten).
chmod 700 "$DATASET_DIR"
# Erst nach ".tmp" entschluesseln und per mv an die Zielstelle ziehen: schlaegt sops fehl, bleibt
# die bestehende gute Datei am Mount-Ziel unangetastet. Wuerde direkt auf die Zielstelle
# geschrieben, truenkiert das ">" die Datei schon vor dem ersten sops-Byte -- der laufende
# Container ueberlebt zwar am offenen Inode, aber beim naechsten Neustart loest Docker die
# fehlende Bind-Quelle neu auf, legt dort ein leeres Verzeichnis an, und core crasht dauerhaft.
# umask 077 haelt die tmp-Datei waehrend des Schreibens vertraulich (sonst kurz weltlesbar).
OLD_UMASK="$(umask)"
umask 077
if ! SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}" \
     sops -d "$DATASET_SOPS_FILE" > "$DATASET_FILE.tmp"; then
  echo "sops could not decrypt the Guess Hue dataset." >&2
  echo "Install sops and put the age key at \${SOPS_AGE_KEY_FILE:-\$HOME/.config/sops/age/keys.txt}." >&2
  rm -f "$DATASET_FILE.tmp"
  umask "$OLD_UMASK"
  exit 1
fi
umask "$OLD_UMASK"
mv "$DATASET_FILE.tmp" "$DATASET_FILE"
# 644 statt 600: core laeuft im Container als Paketo-Buildpacks-User (UID 1002, GID 1001 laut
# `docker inspect ghcr.io/unividuell/countdown-core --format '{{.Config.User}}'`), Bind-Mounts
# remappen keine UIDs, und der Host-User, der update.sh faehrt, kennt diese UID nicht. Vertraulich
# bleibt das Datenset trotzdem: das Verzeichnis (0700, s.o.) ist nur fuer den Host-Owner betretbar.
chmod 644 "$DATASET_FILE"

docker network create edge 2>/dev/null || true
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
docker image prune -f
echo "Update complete ($TARGET, infra from $REF)."
