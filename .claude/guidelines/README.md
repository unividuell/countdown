# Coding Guidelines — countdown core

Project-wide conventions for `countdown.unividuell.org` — the `core` Spring Boot
backend and the `webapp-vue` Vue SPA frontend (ported from the Nuxt/Firebase
`huettehuette.unividuell.org`). These are binding defaults for new work — follow
them unless a documented decision says otherwise. They exist so new features and
new team members (and AI assistants) stay consistent.

| Topic | File |
|---|---|
| **Feeding knowledge back** — every task ends by capturing the transferable rules here; the admission bar keeps post-mortems in the commit, not in the file | [feeding-knowledge-back.md](feeding-knowledge-back.md) |
| **Git workflow** — git flow: branch off `develop`, PRs target `develop`; `main` = prod, `develop` = staging | [git-workflow.md](git-workflow.md) |
| Kotlin call sites — named arguments from two arguments on, and where that does not apply | [kotlin.md](kotlin.md) |
| Testing — backend (mockk · kotest · MockMvc Kotlin DSL · Testcontainers · TDD) | [testing.md](testing.md) |
| Persistence — backend (Spring Data JDBC · UUID v7 · auditing) | [persistence.md](persistence.md) |
| Modules & migrations — backend (Spring Modulith · schema-per-module · module-based Flyway) | [modules-and-migrations.md](modules-and-migrations.md) |
| Security & auth — backend (GitHub OAuth2 · session · roles · SPA contract · browser vs. server API keys) | [security-and-auth.md](security-and-auth.md) |
| Logging — backend (kotlin-logging · logger inside the class · lambda messages · log the silent degradation · never log what storage must not have) | [logging.md](logging.md) |
| Frontend — `webapp-vue` (Vue 3 · Vite 8 · Tailwind v4 · stack · `apiFetch`/`useAuth` · lint · typecheck) | [frontend.md](frontend.md) |
| ↳ Frontend UI & layout (mobile-first · sizing traps · accessibility) | [frontend-ui.md](frontend-ui.md) |
| ↳ Frontend routing, shells & access (Vue Router 5 file-based · guard-owned nav data · `[slug]` shell · role gating) | [frontend-routing.md](frontend-routing.md) |
| ↳ Frontend state & live values (composables/VueUse, no Pinia · shared clock · server-authoritative ticking · short-clip audio) | [frontend-state.md](frontend-state.md) |
| ↳ Frontend testing (Vitest + `vi` · @vue/test-utils · happy-dom limits · doubles · `<component :is>` props aren't type-checked) | [frontend-testing.md](frontend-testing.md) |
| Deployment (ghcr images · arm64 CI · prod+staging compose topology · backend production profile) | [deployment.md](deployment.md) |
| ↳ Deployment edge (the two Caddys · TLS · SPA/API routing · cache headers · `X-Forwarded-*` chain) | [deployment-edge.md](deployment-edge.md) |
| ↳ Deployment server ops (`update.sh` · secret-handling scripts · pg_dump backup · pgAdmin SSH) | [deployment-server.md](deployment-server.md) |
| **Dependency updates** — Maven · npm · Docker, and the versions we deliberately hold back (TS 6.x, `@types/node` 24, Node LTS) | [dependency-updates.md](dependency-updates.md) |
| Multi-tenancy (community module · `community_id` scoping · slug-derivation parity · URL-slug routing guard) | [multi-tenancy.md](multi-tenancy.md) |
| **Countdown & rounds** — the core principle (`startsAt` + community `timezone` · signed T-offset rounds · interval model · DST) | [countdown.md](countdown.md) |
| **Cross-runtime parity** — logic that must compute identically in Kotlin and TS (golden vectors · bit-exact ops · UTF-8 hashing · no `Long` in JSON) | [cross-runtime-parity.md](cross-runtime-parity.md) |
| **Game content** — hand-curated puzzle data is a secret in a public repo (`.local/` → `sops` → ciphertext · sample set for tests · fail-fast) | [game-content.md](game-content.md) |
| **Game rounds** — how a round gets a game and a guess becomes points (run as the round coordinate · lazy materialisation via `ON CONFLICT` · one secret, two exits split per stream · game judges, framework awards · points as a cache) | [game-rounds.md](game-rounds.md) |
| **Game lab** — the non-prod harness for playing a mini-game against a URL seed (two-gate pattern · self-limiting in-memory state · payload-hygiene test · the lab adapts, never the game) | [game-lab.md](game-lab.md) |
| **Game integrity** — what the anti-cheat design validated at the first game (parseable → perceptual · two streams split by publication · field-set tests both directions · client never materialises the solution · server-authoritative time) | [game-integrity.md](game-integrity.md) |

## Stack baseline

**Backend (`core/`):** **Spring Boot 4.1**, **Kotlin 2.4**, **Java 25**, **Spring Modulith 2.1** (GA — not RC), **PostgreSQL 18** (native `uuidv7()`). Build with the Maven wrapper from `core/`: `./mvnw test`, `./mvnw spring-boot:run`; local DB via Spring Boot docker-compose support (`compose.yaml` at the repo root, pinned to `postgres:18`; see [persistence.md](persistence.md) for the port/pgAdmin setup).

**Frontend (`webapp-vue/`):** **Vite 8**, **Vue 3** (Composition API), **TypeScript** (strict), **Vue Router 5** (file-based), **Tailwind v4**, **pnpm**. `pnpm dev` proxies to the backend for same-origin auth.

## Language

- **Source code is English** — comments, KDoc, identifiers, log messages, error
  messages, test names — whatever language the conversation that produced it was
  in. So are configuration and script comments, and the operator-facing READMEs.
- **Repository metadata is English too:** commit messages (including bodies), PR
  titles and descriptions. GitHub seeds the merge commit from the PR, so a German
  entry sits oddly in an otherwise English history.
- **Design docs under `docs/superpowers/` stay German** — they're prose for the
  two of us, not repository metadata.
- **Exception in the other direction:** German *data* — e.g. the placeholder
  entries standing in for the German game content — stays German; it's content,
  not code.
- **User-facing German text uses German quotation marks: `„…“`** — opening `„`
  (U+201E, low) and closing `“` (U+201C, high). Never a straight `"` on either
  side, and never the English `“…”`. This binds everything a user reads: Vue
  templates and the strings behind them, server-rendered HTML, and any message
  that reaches the UI. It does **not** bind design docs under
  `docs/superpowers/`, commit messages, or code comments — there the mix is
  irrelevant because nobody reads it as typography.
  *Watch the closing mark specifically.* Typing `„` and then reaching for the
  key next to Enter yields `„…"`, which looks almost right in a diff and wrong
  on screen; that mistake was in the codebase for months and got mistaken for
  house style. When in doubt, grep: `grep -rn '„[^“]*"' webapp-vue/src` finds
  every half-converted pair.

## Worked examples

- Backend: the **`iam` module** (user management / GitHub login) is the reference for every backend guideline.
- Frontend: **`webapp-vue`** (auth foundation) is the reference for every frontend guideline.

When in doubt, read them and the design docs in `docs/superpowers/`.
