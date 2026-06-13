#!/usr/bin/env sh
# Full update for one stack: ./update.sh [prod|staging]  (default: prod)
set -eu
TARGET="${1:-prod}"
case "$TARGET" in prod|staging) : ;; *) echo "usage: ./update.sh [prod|staging]"; exit 2 ;; esac
ENV_FILE=".env.$TARGET"
BASE="https://raw.githubusercontent.com/unividuell/countdown/main/deploy"

curl -fsSL "$BASE/compose.yaml" -o compose.yaml
curl -fsSL "$BASE/README.md"    -o README.md
curl -fsSL "$BASE/update.sh"    -o update.sh.new && chmod +x update.sh.new && mv update.sh.new update.sh

if [ ! -f "$ENV_FILE" ]; then
  curl -fsSL "$BASE/$ENV_FILE.example" -o "$ENV_FILE"
  echo "$ENV_FILE created from template — fill in the secrets, then re-run ./update.sh $TARGET"
  exit 1
fi

docker network create edge 2>/dev/null || true
docker compose --env-file "$ENV_FILE" -f compose.yaml pull
docker compose --env-file "$ENV_FILE" -f compose.yaml up -d
docker image prune -f
echo "Update complete ($TARGET)."
