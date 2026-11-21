# Coding Guidelines — countdown

Binding conventions for the `core` Spring Boot backend and the `webapp-vue` Vue SPA. Follow them
unless a documented decision says otherwise. The root [`CLAUDE.md`](../../CLAUDE.md) carries the
one-line summary of each file; this index only groups them.

| Area | Files |
|---|---|
| Process | [feeding-knowledge-back.md](feeding-knowledge-back.md) · [git-workflow.md](git-workflow.md) · [dependency-updates.md](dependency-updates.md) |
| Backend | [kotlin.md](kotlin.md) · [testing.md](testing.md) · [configuration.md](configuration.md) · [persistence.md](persistence.md) · [modules-and-migrations.md](modules-and-migrations.md) · [security-and-auth.md](security-and-auth.md) · [logging.md](logging.md) |
| Frontend | [frontend.md](frontend.md) · [frontend-ui.md](frontend-ui.md) · [frontend-routing.md](frontend-routing.md) · [frontend-state.md](frontend-state.md) · [frontend-testing.md](frontend-testing.md) |
| Deployment | [deployment.md](deployment.md) · [deployment-edge.md](deployment-edge.md) · [deployment-server.md](deployment-server.md) |
| Domain | [countdown.md](countdown.md) · [multi-tenancy.md](multi-tenancy.md) · [cross-runtime-parity.md](cross-runtime-parity.md) |
| Games | [game-rounds.md](game-rounds.md) · [game-integrity.md](game-integrity.md) · [game-content.md](game-content.md) · [game-lab.md](game-lab.md) |

## Language

- **Source code is English** — comments, KDoc, identifiers, log messages, error messages, test
  names — whatever language the conversation was in. So are configuration and script comments, and
  the operator-facing READMEs.
- **Repository metadata is English too:** commit messages, PR titles and descriptions. GitHub
  seeds the merge commit from the PR.
- **Design docs under `docs/superpowers/` stay German.**
- **German *data* stays German** — content, not code.
- **User-facing German text uses `„…“`** — opening `„` (U+201E, low), closing `“` (U+201C, high).
  Never a straight `"` on either side, never the English `“…”`. This binds everything a user
  reads: Vue templates and their strings, server-rendered HTML, any message that reaches the UI —
  not design docs, commit messages or code comments. Watch the closing mark:
  `grep -rn '„[^“]*"' webapp-vue/src` finds every half-converted pair.
- **„Tipp“ is a round's hand-in, nothing else.** A touch on a game's field is a „Klick“.

## Worked examples

- Backend: the **`iam` module** is the reference for every backend guideline.
- Frontend: **`webapp-vue`**'s auth foundation is the reference for every frontend guideline.

When in doubt, read them and the design docs in `docs/superpowers/`.
