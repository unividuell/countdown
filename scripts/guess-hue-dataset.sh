#!/usr/bin/env sh
# Convenient path to the local, opt-in Guess Hue dataset. See core/README.md
# ("Guess Hue: checking the dataset") for context and
# docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md ("storage and handoff")
# for the full path an entry takes.
#
# Usage: ./scripts/guess-hue-dataset.sh decrypt [--force]
#        ./scripts/guess-hue-dataset.sh encrypt
set -eu

usage() {
  echo "usage: $0 decrypt [--force] | encrypt" >&2
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
  decrypt|encrypt) ;;
  *) usage ;;
esac

command -v sops >/dev/null 2>&1 || {
  echo "sops is not installed. Install it (e.g. 'brew install sops') and try again." >&2
  exit 1
}

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "Not a git repo here: $(pwd)" >&2
  echo "This script must run from a checkout of countdown.unividuell.org." >&2
  exit 1
}

# Split into two statements instead of one nested command substitution: with
# $(dirname "$(git ...)"), the exit status of "git rev-parse" would be lost -- if it failed,
# "dirname" would carry on with empty input, land on ".", and succeed itself, so "set -e" would
# never fire. The script would then try to write the dataset's plaintext into the current
# working directory instead of .local/ -- not gitignored, and outside the main worktree. The
# canonical place for the plaintext is always the repo's main worktree, even when this script
# runs from a linked worktree -- worktrees are temporary, .local/ in the main worktree isn't.
GIT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_ROOT="$(dirname "$GIT_COMMON_DIR")"
PLAINTEXT="$MAIN_ROOT/.local/guess-hue-dataset.yaml"

# .sops.yaml and the committed cipher, on the other hand, come from the current checkout: until
# this branch is merged into the main worktree, only the worktree has a .sops.yaml.
CHECKOUT_ROOT="$(git rev-parse --show-toplevel)"
CONFIG="$CHECKOUT_ROOT/.sops.yaml"
CIPHER="$CHECKOUT_ROOT/deploy/guess-hue-dataset.sops.yaml"

# Without --config, sops would otherwise search for .sops.yaml upward from the input file's
# directory, not from the current checkout -- it would find none in the main worktree as long
# as this branch isn't merged.
[ -f "$CONFIG" ] || {
  echo "No .sops.yaml found at $CONFIG." >&2
  exit 1
}

# On macOS, sops otherwise looks for the age key under
# ~/Library/Application Support/sops/age/keys.txt instead of ~/.config -- encrypting (public key
# only) still works, but decrypting then fails with "identity did not match any of the recipients".
SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
export SOPS_AGE_KEY_FILE

# Covers both directions: if not sops but the final "mv" fails (disk full, permissions), a .tmp
# file would be left behind without this trap -- for decrypt, that's a plaintext file nobody
# expects. Set before creating either .tmp file, disarmed by clearing the path variable after a
# successful mv.
TMP_FILE=""
cleanup_tmp() {
  # "if" instead of "[ -n "$TMP_FILE" ] && rm -f ...": with an empty TMP_FILE the condition is
  # false, and its own non-zero exit status, being the trap's last command, would overwrite the
  # script's real exit code as an EXIT trap -- a successful run with TMP_FILE already cleared
  # would then falsely report itself as a failure.
  if [ -n "$TMP_FILE" ]; then
    rm -f "$TMP_FILE"
  fi
}
# Separate INT/TERM traps instead of just "trap cleanup_tmp EXIT INT TERM": an EXIT trap alone
# covers Ctrl-C under bash-as-/bin/sh (the macOS default), but not under dash -- and dash is
# /bin/sh on Debian/Ubuntu, exactly where this repo is deployed. There, a Ctrl-C mid-decrypt
# would leave the .tmp file with the dataset's plaintext behind. The explicit form also sets the
# exit code after a signal itself (130/143 by the 128+signal-number convention) instead of
# leaving it to the shell dialect.
trap cleanup_tmp EXIT
trap 'cleanup_tmp; exit 130' INT
trap 'cleanup_tmp; exit 143' TERM

case "$SUBCOMMAND" in
  decrypt)
    [ -f "$CIPHER" ] || {
      echo "No encrypted cipher found at $CIPHER." >&2
      exit 1
    }

    if [ -f "$PLAINTEXT" ] && [ "$FORCE" -eq 0 ]; then
      echo "Buffer file already exists: $PLAINTEXT" >&2
      echo "Overwrite with --force, or unversioned changes there will be lost." >&2
      exit 1
    fi

    [ -f "$SOPS_AGE_KEY_FILE" ] || {
      echo "No age key found at $SOPS_AGE_KEY_FILE." >&2
      echo "Without it the cipher can't be decrypted -- put the key there, or set" >&2
      echo "SOPS_AGE_KEY_FILE to the right path." >&2
      exit 1
    }

    mkdir -p "$(dirname "$PLAINTEXT")"
    TMP_FILE="$PLAINTEXT.tmp"

    # umask only while writing the plaintext, restored afterward. Write to a temp file and mv it
    # into place only on success: a failure must not leave a half-written file behind (see also
    # the EXIT trap above).
    OLD_UMASK="$(umask)"
    umask 077
    if ! sops -d --config "$CONFIG" "$CIPHER" > "$TMP_FILE"; then
      umask "$OLD_UMASK"
      echo "sops could not decrypt the cipher (see message above)." >&2
      exit 1
    fi
    umask "$OLD_UMASK"
    mv "$TMP_FILE" "$PLAINTEXT"
    TMP_FILE=""

    echo "Decrypted to: $PLAINTEXT"
    echo "Export to use it:"
    echo "  export GUESS_HUE_DATASET_PATH=$PLAINTEXT"
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
