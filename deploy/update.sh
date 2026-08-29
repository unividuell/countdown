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

# Downloads the encrypted Guess Hue dataset for $TARGET and decrypts it into place, so the main
# flow below just reads as "prepare the dataset, then bring the stack up".
prepare_guess_hue_dataset() {
  # The dataset is decrypted here, not by the application — the app reads a plain YAML file from
  # a path and knows nothing about sops or a key. SOPS_AGE_KEY_FILE points at the private key that
  # lives on the server outside the repo.
  # update.sh owns this path and exports it for compose instead of letting compose read it back
  # from .env: compose's interpolation strips quotes, comments, ${VAR} references and CRLF, while a
  # plain shell read of the same line takes it literally — none of those mismatches fail loudly, so
  # the script would decrypt to one path while compose mounts another. The shell environment
  # outranks --env-file for `docker compose`, so a single export is enough: one source of truth.
  # Per-target filename: both stacks share this directory, and a shared name would let a staging
  # run swap the plaintext file mounted into a running prod container out from under it, without
  # the prod container ever restarting.
  GUESS_HUE_DATASET_FILE="./secrets/guess-hue-dataset.$TARGET.yaml"
  export GUESS_HUE_DATASET_FILE
  DATASET_SOPS_FILE="guess-hue-dataset.$TARGET.sops.yaml"
  if ! curl -fsSL "$BASE/guess-hue-dataset.sops.yaml" -o "$DATASET_SOPS_FILE"; then
    echo "Could not download guess-hue-dataset.sops.yaml from branch '$REF' ($BASE)." >&2
    echo "The encrypted Guess Hue dataset must exist on that branch before update.sh can run." >&2
    exit 1
  fi
  mkdir -p secrets
  # Host-side protection sits on the directory, not the file (see below). Fixed "secrets/" instead
  # of dirname($GUESS_HUE_DATASET_FILE): the path now comes from update.sh itself, not user input,
  # so there's no dirname edge case to guard against — a bare filename would make dirname return
  # ".", locking down the whole shared deploy directory (compose/.env files, backups) instead.
  chmod 700 secrets
  # Decrypt to ".tmp" first, then mv it into place: if sops fails, the existing good file at the
  # mount target is untouched. Writing straight to the target would have ">" truncate the file
  # before sops writes its first byte — the running container survives on the open inode, but on
  # the next restart Docker re-resolves the now-missing bind source, creates an empty directory
  # there instead, and core crash-loops for good.
  # umask 077 keeps the tmp file confidential while it's being written (otherwise briefly world-readable).
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
  # 644, not 600: core runs in the container as the Paketo Buildpacks user (UID 1002, GID 1001 per
  # `docker inspect ghcr.io/unividuell/countdown-core --format '{{.Config.User}}'`), bind mounts
  # don't remap UIDs, and the host user running update.sh doesn't have that UID. The dataset stays
  # confidential anyway: the directory (0700, see above) is only enterable by the host owner.
  chmod 644 "$GUESS_HUE_DATASET_FILE"
}

# Same shape as prepare_guess_hue_dataset above, for the Weltanschauung term list. See its
# comments for the reasoning behind every step -- only the game and the file names differ.
prepare_spot_object_terms() {
  SPOT_OBJECT_TERMS_FILE="./secrets/spot-object-terms.$TARGET.yaml"
  export SPOT_OBJECT_TERMS_FILE
  TERMS_SOPS_FILE="spot-object-terms.$TARGET.sops.yaml"
  if ! curl -fsSL "$BASE/spot-object-terms.sops.yaml" -o "$TERMS_SOPS_FILE"; then
    echo "Could not download spot-object-terms.sops.yaml from branch '$REF' ($BASE)." >&2
    echo "The encrypted Weltanschauung term list must exist on that branch before update.sh can run." >&2
    exit 1
  fi
  mkdir -p secrets
  chmod 700 secrets
  OLD_UMASK="$(umask)"
  umask 077
  if ! SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}" \
       sops -d "$TERMS_SOPS_FILE" > "$SPOT_OBJECT_TERMS_FILE.tmp"; then
    echo "sops could not decrypt the Weltanschauung term list." >&2
    echo "Install sops and put the age key at \${SOPS_AGE_KEY_FILE:-\$HOME/.config/sops/age/keys.txt}." >&2
    rm -f "$SPOT_OBJECT_TERMS_FILE.tmp"
    umask "$OLD_UMASK"
    exit 1
  fi
  umask "$OLD_UMASK"
  mv "$SPOT_OBJECT_TERMS_FILE.tmp" "$SPOT_OBJECT_TERMS_FILE"
  chmod 644 "$SPOT_OBJECT_TERMS_FILE"
}

curl -fsSL "$BASE/compose.yaml" -o "$COMPOSE_FILE"
curl -fsSL "$STABLE/README.md"  -o README.md
curl -fsSL "$STABLE/update.sh"  -o update.sh.new && chmod +x update.sh.new && mv update.sh.new update.sh

if [ ! -f "$ENV_FILE" ]; then
  curl -fsSL "$BASE/$ENV_FILE.example" -o "$ENV_FILE"
  echo "$ENV_FILE created from template — fill in the secrets, then re-run ./update.sh $TARGET"
  exit 1
fi

prepare_guess_hue_dataset
prepare_spot_object_terms

docker network create edge 2>/dev/null || true
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
docker image prune -f
echo "Update complete ($TARGET, infra from $REF)."
