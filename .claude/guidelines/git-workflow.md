# Git workflow (git flow)

The repo follows **git flow**: two long-lived branches, feature branches in between.

| Branch | Role | Deploys to |
|---|---|---|
| `main` | **production** — only ever fast-forwarded from `develop` (or a hotfix) | prod (`:latest`) |
| `develop` | **staging** — integration branch, always deployable | staging (`:staging`) |
| `feat/…`, `fix/…`, `claude/…` | short-lived work branches | — |

## Rules

- **Start every branch from an up-to-date `develop`** — not from `main`:
  ```bash
  git switch develop && git pull && git switch -c feat/my-feature
  ```
  Same for Claude Code worktrees: the worktree branch must be based on `develop`.
- **PRs target `develop`.** Never open a feature PR against `main`.
  ```bash
  gh pr create --base develop
  ```
  The **GitHub default branch is `develop`**, so this is also `gh`'s default base —
  but state it explicitly anyway: a stale local `origin/HEAD` still makes tooling
  (incl. the Claude Code session context) report `main` as the PR base. Fix a clone
  that got it wrong once with `git remote set-head origin -a`.
- **Promotion to prod is a separate `develop` → `main` PR** (release). Nothing lands
  on `main` that hasn't been on staging first.
- **Hotfix (rare):** branch from `main`, PR into `main`, then merge `main` back into
  `develop` so the fix isn't lost on the next release.
- **Merged branches are deleted.** The repo has *Automatically delete head branches*
  enabled, so GitHub removes the source branch on merge — locally follow up with
  `git fetch --prune` (and `git worktree remove` for Claude Code worktrees).
  Note this fires **only on merge**: a PR closed *without* merging keeps its branch,
  delete that one by hand (`git push origin --delete <branch>`).

## Why it matters here

`main` and `develop` are not just labels — both CI workflows trigger on **both**
branches and derive the image tag from the branch (`main`→`:latest`, `develop`→
`:staging`), which is what the two compose stacks on the prod host pull. Merging a
feature straight into `main` therefore ships it to production untested on staging.
See [deployment.md](deployment.md) for the tag resolution and the per-env stacks.
