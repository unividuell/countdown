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

# Downloads $BASE/$1 to $3; on a 404 retries the pre-move path $BASE/$2. update.sh runs from main
# while the ciphers come from $REF, so this one script deploys both layouts.
# TODO: drop the fallback once deploy/games/ has reached main.
fetch_cipher() {
  FETCH_CODE="$(curl -sS -w '%{http_code}' "$BASE/$1" -o "$3")" || FETCH_CODE="000"
  if [ "$FETCH_CODE" = "404" ]; then
    FETCH_CODE="$(curl -sS -w '%{http_code}' "$BASE/$2" -o "$3")" || FETCH_CODE="000"
  fi
  [ "$FETCH_CODE" = "200" ]
}

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
  if ! fetch_cipher games/guess-hue/dataset.sops.yaml guess-hue-dataset.sops.yaml "$DATASET_SOPS_FILE"; then
    echo "Could not download games/guess-hue/dataset.sops.yaml from branch '$REF' ($BASE): HTTP $FETCH_CODE." >&2
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
  if ! fetch_cipher games/spot-object/terms.sops.yaml spot-object-terms.sops.yaml "$TERMS_SOPS_FILE"; then
    echo "Missing prerequisite: deploy/games/spot-object/terms.sops.yaml is not on branch '$REF' ($BASE): HTTP $FETCH_CODE." >&2
    echo "Nothing was deployed and the running stack is untouched." >&2
    echo "The curated Weltanschauung term list has to be encrypted and committed to that branch first:" >&2
    echo "  paste it into .local/games/spot-object/terms.yaml in the main checkout," >&2
    echo "  run ./scripts/spot-object-terms.sh encrypt, and commit deploy/games/spot-object/terms.sops.yaml." >&2
    echo "See deploy/README.md, 'Prerequisite: the Weltanschauung term list'." >&2
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

# Downloads and decrypts the Augenmaß category files for $TARGET: one cipher per category
# listed in games/match-scale/categories.txt, decrypted into a directory the container mounts.
# Same reasoning as the two functions above; only the differences are commented.
prepare_match_scale_dataset() {
  # update.sh comes from main, compose.yaml from $REF: a branch without the list (HTTP 404) has no
  # categories to deploy. Skip instead of abort, so older branches stay deployable. Any other
  # failure (network, 5xx) aborts: skipping then would silently deploy without the data.
  CATEGORIES_FILE="match-scale.$TARGET.categories.txt"
  MATCH_SCALE_DIR="./secrets/match-scale.$TARGET"
  MATCH_SCALE_NEW="$MATCH_SCALE_DIR.new"
  CATEGORY_SOPS_FILE="match-scale.$TARGET.current.sops.yaml"

  # Leftovers (list, half-decrypted directory, cipher copy) must not survive any exit path.
  trap 'rm -rf "$CATEGORIES_FILE" "$MATCH_SCALE_NEW" "$CATEGORY_SOPS_FILE"' EXIT
  HTTP_CODE="$(curl -sS -w '%{http_code}' "$BASE/games/match-scale/categories.txt" -o "$CATEGORIES_FILE")" || HTTP_CODE="000"
  case "$HTTP_CODE" in
    200) ;;
    404)
      echo "no match-scale categories on '$REF', skipping"
      return 0
      ;;
    *)
      echo "Could not download games/match-scale/categories.txt from branch '$REF' ($BASE): HTTP $HTTP_CODE." >&2
      exit 1
      ;;
  esac

  mkdir -p secrets
  chmod 700 secrets
  rm -rf "$MATCH_SCALE_NEW"
  mkdir "$MATCH_SCALE_NEW"

  # A directory is swapped as a whole, like the single files above: on any failure the old
  # directory, which the running container has mounted, stays untouched.
  OLD_UMASK="$(umask)"
  umask 077
  KEY_COUNT=0
  while IFS= read -r KEY || [ -n "$KEY" ]; do
    case "$KEY" in ''|'#'*) continue ;; esac
    # The key becomes a file name: nothing but [a-z0-9-] may reach the path.
    case "$KEY" in
      *[!a-z0-9-]*)
        echo "Invalid match-scale category '$KEY' in games/match-scale/categories.txt on '$REF'." >&2
        umask "$OLD_UMASK"
        exit 1
        ;;
    esac
    if ! curl -fsSL "$BASE/games/match-scale/categories/$KEY.sops.yaml" -o "$CATEGORY_SOPS_FILE"; then
      echo "Could not download games/match-scale/categories/$KEY.sops.yaml from branch '$REF' ($BASE)." >&2
      umask "$OLD_UMASK"
      exit 1
    fi
    if ! SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}" \
         sops -d "$CATEGORY_SOPS_FILE" > "$MATCH_SCALE_NEW/$KEY.yaml"; then
      echo "sops could not decrypt the Augenmaß category '$KEY'." >&2
      echo "Install sops and put the age key at \${SOPS_AGE_KEY_FILE:-\$HOME/.config/sops/age/keys.txt}." >&2
      umask "$OLD_UMASK"
      exit 1
    fi
    KEY_COUNT=$((KEY_COUNT + 1))
  done < "$CATEGORIES_FILE"
  umask "$OLD_UMASK"

  if [ "$KEY_COUNT" -eq 0 ]; then
    echo "games/match-scale/categories.txt on '$REF' lists no categories." >&2
    exit 1
  fi

  # 755/644 for the same UID reason as the Guess Hue file: the container user is not the host
  # user. Confidentiality sits on ./secrets (0700).
  chmod 755 "$MATCH_SCALE_NEW"
  chmod 644 "$MATCH_SCALE_NEW"/*.yaml

  # Move the old directory aside instead of deleting it first: a running container that is not
  # recreated keeps its mount on the old inode, and an empty window would break its next restart.
  rm -rf "$MATCH_SCALE_DIR.old"
  if [ -d "$MATCH_SCALE_DIR" ]; then
    mv "$MATCH_SCALE_DIR" "$MATCH_SCALE_DIR.old"
  fi
  mv "$MATCH_SCALE_NEW" "$MATCH_SCALE_DIR"
  rm -rf "$MATCH_SCALE_DIR.old"

  MATCH_SCALE_DATASET_HOST_DIR="$MATCH_SCALE_DIR"
  export MATCH_SCALE_DATASET_HOST_DIR
  rm -f "$CATEGORIES_FILE" "$CATEGORY_SOPS_FILE"
  trap - EXIT
}

curl -fsSL "$STABLE/README.md"  -o README.md
curl -fsSL "$STABLE/update.sh"  -o update.sh.new && chmod +x update.sh.new && mv update.sh.new update.sh

if [ ! -f "$ENV_FILE" ]; then
  curl -fsSL "$BASE/$ENV_FILE.example" -o "$ENV_FILE"
  echo "$ENV_FILE created from template — fill in the secrets, then re-run ./update.sh $TARGET"
  exit 1
fi

prepare_guess_hue_dataset
prepare_spot_object_terms
prepare_match_scale_dataset

# Downloaded last, after every prerequisite held: a missing cipher file must not leave the deployed
# compose file replaced by one the stack cannot be brought up with by hand afterwards. README.md and
# update.sh above are the exception on purpose — they are how a broken run gets fixed.
curl -fsSL "$BASE/compose.yaml" -o "$COMPOSE_FILE"

docker network create edge 2>/dev/null || true
docker network create monitoring 2>/dev/null || true
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
docker image prune -f
echo "Update complete ($TARGET, infra from $REF)."
