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

# Das Spieldatenset liegt verschluesselt im oeffentlichen Repo; entschluesselt wird hier, nicht in
# der Anwendung -- die liest schlichtes YAML von einem Pfad und kennt weder sops noch einen Key.
# SOPS_AGE_KEY_FILE zeigt auf den privaten Schluessel, der ausserhalb des Repos auf dem Server liegt.
# Eigener Dateiname pro Target (wie COMPOSE_FILE/ENV_FILE oben): beide Stacks teilen sich dieses
# Verzeichnis, ein gemeinsamer Name wuerde bedeuten, dass ein staging-Lauf das von prod gemountete
# Klartext-File unter der Decke austauscht, ohne dass der prod-Container neu startet.
DATASET_FILE="secrets/guess-hue-dataset.$TARGET.yaml"
curl -fsSL "$BASE/guess-hue-dataset.sops.yaml" -o "guess-hue-dataset.$TARGET.sops.yaml"
mkdir -p secrets
if ! SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}" \
     sops -d "guess-hue-dataset.$TARGET.sops.yaml" > "$DATASET_FILE"; then
  echo "sops could not decrypt the Guess Hue dataset." >&2
  echo "Install sops and put the age key at \${SOPS_AGE_KEY_FILE:-\$HOME/.config/sops/age/keys.txt}." >&2
  rm -f "$DATASET_FILE"
  exit 1
fi
chmod 600 "$DATASET_FILE"

if [ ! -f "$ENV_FILE" ]; then
  curl -fsSL "$BASE/$ENV_FILE.example" -o "$ENV_FILE"
  echo "$ENV_FILE created from template — fill in the secrets, then re-run ./update.sh $TARGET"
  exit 1
fi

docker network create edge 2>/dev/null || true
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
docker image prune -f
echo "Update complete ($TARGET, infra from $REF)."
