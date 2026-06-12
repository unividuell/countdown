#!/usr/bin/env sh
# Full update: fetch latest infra files from main, pull images, restart.
set -eu
BASE="https://raw.githubusercontent.com/unividuell/countdown/main/deploy"

curl -fsSL "$BASE/compose.prod.yaml" -o compose.prod.yaml
curl -fsSL "$BASE/README.md"         -o README.md
curl -fsSL "$BASE/update.sh"         -o update.sh.new && chmod +x update.sh.new && mv update.sh.new update.sh

if [ ! -f .env ]; then
  curl -fsSL "$BASE/.env.example" -o .env
  echo ".env created from template — fill in the secrets, then re-run ./update.sh"
  exit 1
fi

docker compose --env-file .env -f compose.prod.yaml pull
docker compose --env-file .env -f compose.prod.yaml up -d
docker image prune -f
echo "Update complete."
