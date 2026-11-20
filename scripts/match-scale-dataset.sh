#!/usr/bin/env sh
# Convenient paths to the local Augenmaß category files. Two directory pairs, one cipher per
# plaintext file:
#
#   .local/match-scale/<key>.yaml        <-> deploy/match-scale/<key>.sops.yaml
#   .local/match-scale-input/<key>.yaml  <-> deploy/match-scale-input/<key>.sops.yaml
#
# The first pair is what the backend loads; the second is the generator's exclude list. Same shape
# as guess-hue-dataset.sh, see there for the reasoning behind each step.
#
# Usage: ./scripts/match-scale-dataset.sh decrypt [--force]
#        ./scripts/match-scale-dataset.sh encrypt
#        ./scripts/match-scale-dataset.sh dev-path
#
# "dev-path" prints the plaintext directory .local/match-scale on stdout and nothing else,
# decrypting missing files first. Where it cannot decrypt (no sops, no age key, no cipher on this
# branch) it prints nothing and still succeeds -- the backend then falls back to its bundled
# sample. See .claude/launch.json.
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
    # --force only means "overwrite plaintext files", which only decrypt does.
    [ "$FORCE" -eq 0 ] || usage
    ;;
  *) usage ;;
esac

# For dev-path a missing prerequisite is an answer, not a failure.
unavailable() {
  echo "$1" >&2
  if [ "$SUBCOMMAND" = "dev-path" ]; then
    echo "Augenmaß: staying on the bundled sample dataset." >&2
    exit 0
  fi
  exit 1
}

command -v sops >/dev/null 2>&1 || unavailable \
  "sops is not installed. Install it (e.g. 'brew install sops') and try again."

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "Not a git repo here: $(pwd)" >&2
  exit 1
}

# Two statements so a failing "git rev-parse" trips "set -e". The plaintext always lives in the
# main worktree's .local/, even when run from a linked worktree: worktrees are temporary.
GIT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_ROOT="$(dirname "$GIT_COMMON_DIR")"
PLAINTEXT_DIR="$MAIN_ROOT/.local/match-scale"

# .sops.yaml and the ciphers come from the current checkout.
CHECKOUT_ROOT="$(git rev-parse --show-toplevel)"
CONFIG="$CHECKOUT_ROOT/.sops.yaml"
[ -f "$CONFIG" ] || unavailable "No .sops.yaml found at $CONFIG."

# macOS sops would otherwise look under ~/Library/Application Support.
SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
export SOPS_AGE_KEY_FILE

# Removes a half-written .tmp (plaintext on decrypt) on exit and on signals; see
# guess-hue-dataset.sh for why INT/TERM are trapped separately.
TMP_FILE=""
cleanup_tmp() {
  if [ -n "$TMP_FILE" ]; then
    rm -f "$TMP_FILE"
  fi
}
trap cleanup_tmp EXIT
trap 'cleanup_tmp; exit 130' INT
trap 'cleanup_tmp; exit 143' TERM

# Decrypts one cipher into the plaintext directory of its pair ($1 = pair name, $2 = cipher).
# Overwrites unconditionally; guarding existing files is the caller's job.
decrypt_one() {
  PAIR="$1"
  CIPHER="$2"
  NAME="$(basename "$CIPHER" .sops.yaml)"
  TARGET="$MAIN_ROOT/.local/$PAIR/$NAME.yaml"

  mkdir -p "$(dirname "$TARGET")"
  TMP_FILE="$TARGET.tmp"

  OLD_UMASK="$(umask)"
  umask 077
  if ! sops -d --config "$CONFIG" "$CIPHER" > "$TMP_FILE"; then
    umask "$OLD_UMASK"
    unavailable "sops could not decrypt $CIPHER (see message above)."
  fi
  umask "$OLD_UMASK"
  mv "$TMP_FILE" "$TARGET"
  TMP_FILE=""
}

# Calls "$1" (decrypt_one) for every cipher of both pairs: "$2" = "force" decrypts regardless,
# "missing" only where the plaintext file is absent.
each_cipher() {
  FOUND=0
  for PAIR in match-scale match-scale-input; do
    for CIPHER in "$CHECKOUT_ROOT/deploy/$PAIR"/*.sops.yaml; do
      [ -f "$CIPHER" ] || continue
      FOUND=1
      TARGET="$MAIN_ROOT/.local/$PAIR/$(basename "$CIPHER" .sops.yaml).yaml"
      if [ "$1" = "missing" ] && [ -f "$TARGET" ]; then
        continue
      fi
      decrypt_one "$PAIR" "$CIPHER"
      echo "Augenmaß: decrypted $PAIR/$(basename "$TARGET")" >&2
    done
  done
  [ "$FOUND" -eq 1 ] || unavailable "No encrypted ciphers found under $CHECKOUT_ROOT/deploy/match-scale*."
}

case "$SUBCOMMAND" in
  decrypt)
    if [ "$FORCE" -eq 0 ]; then
      for PAIR in match-scale match-scale-input; do
        for CIPHER in "$CHECKOUT_ROOT/deploy/$PAIR"/*.sops.yaml; do
          [ -f "$CIPHER" ] || continue
          TARGET="$MAIN_ROOT/.local/$PAIR/$(basename "$CIPHER" .sops.yaml).yaml"
          if [ -f "$TARGET" ]; then
            echo "Plaintext file already exists: $TARGET" >&2
            echo "Overwrite with --force, or unversioned changes there will be lost." >&2
            exit 1
          fi
        done
      done
    fi

    [ -f "$SOPS_AGE_KEY_FILE" ] || unavailable "No age key found at $SOPS_AGE_KEY_FILE."
    each_cipher force

    echo "Decrypted to: $PLAINTEXT_DIR"
    echo "Export to use it:"
    echo "  export MATCH_SCALE_DATASET_DIR=$PLAINTEXT_DIR"
    ;;

  dev-path)
    # Existing plaintext files are used as they are: they are what "encrypt" reads and may hold
    # edits that aren't in the cipher yet.
    [ -f "$SOPS_AGE_KEY_FILE" ] || [ -d "$PLAINTEXT_DIR" ] || unavailable \
      "No age key found at $SOPS_AGE_KEY_FILE."
    if [ -f "$SOPS_AGE_KEY_FILE" ]; then
      each_cipher missing
    fi

    echo "$PLAINTEXT_DIR"
    ;;

  encrypt)
    FOUND=0
    for PAIR in match-scale match-scale-input; do
      for PLAIN in "$MAIN_ROOT/.local/$PAIR"/*.yaml; do
        [ -f "$PLAIN" ] || continue
        # The name ends up in the cipher path and in update.sh's key check.
        case "$(basename "$PLAIN" .yaml)" in
          ''|*[!a-z0-9-]*)
            echo "Refusing $PLAIN: file name must match [a-z0-9-]+.yaml." >&2
            exit 1
            ;;
        esac
        FOUND=1
        CIPHER="$CHECKOUT_ROOT/deploy/$PAIR/$(basename "$PLAIN" .yaml).sops.yaml"
        mkdir -p "$(dirname "$CIPHER")"

        # sops output differs on every run and re-emits YAML in its own form, so the plaintext is
        # never compared directly: encrypt once, then compare decrypted forms (new vs. existing
        # cipher; decrypted text stays in shell variables, not on disk). Equal -> keep the committed cipher; else the fresh one replaces it.
        TMP_FILE="$CIPHER.tmp"
        if ! sops -e --config "$CONFIG" "$PLAIN" > "$TMP_FILE"; then
          echo "sops could not encrypt $PLAIN (see message above)." >&2
          exit 1
        fi

        if [ -f "$CIPHER" ] \
          && OLD_FORM="$(sops -d --config "$CONFIG" --input-type yaml --output-type yaml "$CIPHER" 2>/dev/null)" \
          && NEW_FORM="$(sops -d --config "$CONFIG" --input-type yaml --output-type yaml "$TMP_FILE" 2>/dev/null)" \
          && [ "$OLD_FORM" = "$NEW_FORM" ]; then
          rm -f "$TMP_FILE"
          TMP_FILE=""
          echo "Unchanged: $CIPHER"
          continue
        fi

        mv "$TMP_FILE" "$CIPHER"
        TMP_FILE=""

        echo "Encrypted to: $CIPHER"
      done
    done
    [ "$FOUND" -eq 1 ] || {
      echo "No plaintext files found under $MAIN_ROOT/.local/match-scale*." >&2
      exit 1
    }
    ;;
esac
