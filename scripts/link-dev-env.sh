#!/usr/bin/env sh
# Borrows the main checkout's `.env` into a git worktree.
#
# `.env` is gitignored, so a fresh worktree starts without one -- and two things read it from the
# checkout root: the backend, via `spring.config.import: optional:file:../.env[.properties]`
# (the three SPOT_OBJECT_* Google values), and docker compose, via compose.yaml (the host ports).
# Both are `optional`, so the failure is silent: the backend boots, Weltanschauung draws no map,
# and nothing says why.
#
# A symlink rather than a copy: a key rotated in the main checkout then reaches every worktree at
# once, and `ls -la` says where the file really comes from. An existing `.env` is never touched --
# in the main checkout that is the real file.
#
# Called from .claude/launch.json before the backend starts, which is enough: the link stays, so
# everything afterwards -- `docker compose` by hand included -- finds it too.
#
# Usage: ./scripts/link-dev-env.sh
set -eu

# The worktree, whatever the caller's working directory is.
cd "$(git rev-parse --show-toplevel)"

# The main checkout: in a worktree `--git-common-dir` points at the main `.git`, in the main
# checkout at its own -- where the guard below then finds the real file and stops.
main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")

if [ -e .env ]; then exit 0; fi
# Nothing to borrow. A clone that has never been set up is the normal case here, and
# `.env.example` is the answer to it -- see core/README.md.
if [ ! -e "$main/.env" ]; then exit 0; fi

ln -sf "$main/.env" .env
echo "linked .env -> $main/.env" >&2
