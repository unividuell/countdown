#!/usr/bin/env sh
# Convenient path to the local, opt-in Weltanschauung term list. Same shape as
# ./scripts/guess-hue-dataset.sh -- see its comments for the reasoning behind every choice
# below; this script only renames the game.
#
# Usage: ./scripts/spot-object-terms.sh decrypt [--force]
#        ./scripts/spot-object-terms.sh encrypt
#        ./scripts/spot-object-terms.sh dev-path
#
# "dev-path" is the machine-readable variant of "decrypt" for the local dev server: it prints the
# buffer file's path on stdout and nothing else, decrypting first if the file isn't there yet. On a
# machine that cannot decrypt (no sops, no age key, no cipher on this branch) it prints nothing and
# still succeeds -- the caller then passes an empty SPOT_OBJECT_TERMS_PATH and the backend falls
# back to the bundled sample. See .claude/launch.json.
set -eu

usage() {
  echo "usage: $0 decrypt [--force] | encrypt | dev-path" >&2
  exit 2
}

SUBCOMMAND="${1:-}"
[ -n "$SUBCOMMAND" ] || usage
shift

FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    *) usage ;;
  esac
  shift
done

case "$SUBCOMMAND" in
  decrypt) ;;
  encrypt|dev-path)
    [ "$FORCE" -eq 0 ] || usage
    ;;
  *) usage ;;
esac

unavailable() {
  echo "$1" >&2
  shift
  for line in "$@"; do
    echo "$line" >&2
  done
  if [ "$SUBCOMMAND" = "dev-path" ]; then
    echo "Weltanschauung: staying on the bundled sample term list." >&2
    exit 0
  fi
  exit 1
}

command -v sops >/dev/null 2>&1 || unavailable \
  "sops is not installed. Install it (e.g. 'brew install sops') and try again."

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "Not a git repo here: $(pwd)" >&2
  echo "This script must run from a checkout of countdown.unividuell.org." >&2
  exit 1
}

GIT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_ROOT="$(dirname "$GIT_COMMON_DIR")"
PLAINTEXT="$MAIN_ROOT/.local/spot-object-terms.yaml"

CHECKOUT_ROOT="$(git rev-parse --show-toplevel)"
CONFIG="$CHECKOUT_ROOT/.sops.yaml"
CIPHER="$CHECKOUT_ROOT/deploy/spot-object-terms.sops.yaml"

[ -f "$CONFIG" ] || unavailable "No .sops.yaml found at $CONFIG."

SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
export SOPS_AGE_KEY_FILE

TMP_FILE=""
cleanup_tmp() {
  if [ -n "$TMP_FILE" ]; then
    rm -f "$TMP_FILE"
  fi
}
trap cleanup_tmp EXIT
trap 'cleanup_tmp; exit 130' INT
trap 'cleanup_tmp; exit 143' TERM

decrypt_cipher() {
  [ -f "$CIPHER" ] || unavailable "No encrypted cipher found at $CIPHER."

  [ -f "$SOPS_AGE_KEY_FILE" ] || unavailable \
    "No age key found at $SOPS_AGE_KEY_FILE." \
    "Without it the cipher can't be decrypted -- put the key there, or set" \
    "SOPS_AGE_KEY_FILE to the right path."

  mkdir -p "$(dirname "$PLAINTEXT")"
  TMP_FILE="$PLAINTEXT.tmp"

  OLD_UMASK="$(umask)"
  umask 077
  if ! sops -d --config "$CONFIG" "$CIPHER" > "$TMP_FILE"; then
    umask "$OLD_UMASK"
    unavailable "sops could not decrypt the cipher (see message above)."
  fi
  umask "$OLD_UMASK"
  mv "$TMP_FILE" "$PLAINTEXT"
  TMP_FILE=""
}

case "$SUBCOMMAND" in
  decrypt)
    if [ -f "$PLAINTEXT" ] && [ "$FORCE" -eq 0 ]; then
      echo "Buffer file already exists: $PLAINTEXT" >&2
      echo "Overwrite with --force, or unversioned changes there will be lost." >&2
      exit 1
    fi

    decrypt_cipher

    echo "Decrypted to: $PLAINTEXT"
    echo "Export to use it:"
    echo "  export SPOT_OBJECT_TERMS_PATH=$PLAINTEXT"
    ;;

  dev-path)
    if [ ! -f "$PLAINTEXT" ]; then
      decrypt_cipher
      echo "Weltanschauung: decrypted the real term list to $PLAINTEXT" >&2
    fi

    echo "$PLAINTEXT"
    ;;

  encrypt)
    [ -f "$PLAINTEXT" ] || {
      echo "No buffer file found at $PLAINTEXT." >&2
      echo "Run '$0 decrypt' first, or create the file by hand." >&2
      exit 1
    }

    TMP_FILE="$CIPHER.tmp"
    if ! sops -e --config "$CONFIG" "$PLAINTEXT" > "$TMP_FILE"; then
      echo "sops could not encrypt the buffer file (see message above)." >&2
      exit 1
    fi
    mv "$TMP_FILE" "$CIPHER"
    TMP_FILE=""

    echo "Encrypted to: $CIPHER"
    ;;
esac
