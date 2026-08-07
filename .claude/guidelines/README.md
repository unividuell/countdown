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
| Testing — backend (mockk · kotest · MockMvc Kotlin DSL · Testcontainers · TDD) | [testing.md](testing.md) |
| Persistence — backend (Spring Data JDBC · UUID v7 · auditing) | [persistence.md](persistence.md) |
| Modules & migrations — backend (Spring Modulith · schema-per-module · module-based Flyway) | [modules-and-migrations.md](modules-and-migrations.md) |
| Security & auth — backend (GitHub OAuth2 · session · roles · SPA contract) | [security-and-auth.md](security-and-auth.md) |
| Logging — backend (kotlin-logging · logger inside the class · lambda messages · log the silent degradation) | [logging.md](logging.md) |
| Frontend — `webapp-vue` (Vue 3 · Vite 8 · Tailwind v4 · stack · `apiFetch`/`useAuth` · lint · typecheck) | [frontend.md](frontend.md) |
| ↳ Frontend UI & layout (mobile-first · sizing traps · accessibility) | [frontend-ui.md](frontend-ui.md) |
| ↳ Frontend routing, shells & access (Vue Router 5 file-based · guard-owned nav data · `[slug]` shell · role gating) | [frontend-routing.md](frontend-routing.md) |
| ↳ Frontend state & live values (composables/VueUse, no Pinia · shared clock · server-authoritative ticking) | [frontend-state.md](frontend-state.md) |
| ↳ Frontend testing (Vitest + `vi` · @vue/test-utils · happy-dom limits · doubles) | [frontend-testing.md](frontend-testing.md) |
| Deployment (ghcr images · arm64 CI · Caddy edge · prod compose · pg_dump backup · pgAdmin SSH) | [deployment.md](deployment.md) |
| **Dependency updates** — Maven · npm · Docker, and the versions we deliberately hold back (TS 6.x, `@types/node` 24, Node LTS) | [dependency-updates.md](dependency-updates.md) |
| Multi-tenancy (community module · `community_id` scoping · slug-derivation parity · URL-slug routing guard) | [multi-tenancy.md](multi-tenancy.md) |
| **Countdown & rounds** — the core principle (`startsAt` + community `timezone` · signed T-offset rounds · interval model · DST) | [countdown.md](countdown.md) |
| **Cross-runtime parity** — logic that must compute identically in Kotlin and TS (golden vectors · bit-exact ops · UTF-8 hashing · no `Long` in JSON) | [cross-runtime-parity.md](cross-runtime-parity.md) |

## Stack baseline

**Backend (`core/`):** **Spring Boot 4.1**, **Kotlin 2.4**, **Java 25**, **Spring Modulith 2.1** (GA — not RC), **PostgreSQL 18** (native `uuidv7()`). Build with the Maven wrapper from `core/`: `./mvnw test`, `./mvnw spring-boot:run`; local DB via Spring Boot docker-compose support (`compose.yaml` at the repo root, pinned to `postgres:18`; see [persistence.md](persistence.md) for the port/pgAdmin setup).

**Frontend (`webapp-vue/`):** **Vite 8**, **Vue 3** (Composition API), **TypeScript** (strict), **Vue Router 5** (file-based), **Tailwind v4**, **pnpm**. `pnpm dev` proxies to the backend for same-origin auth.

## Worked examples

- Backend: the **`iam` module** (user management / GitHub login) is the reference for every backend guideline.
- Frontend: **`webapp-vue`** (auth foundation) is the reference for every frontend guideline.

When in doubt, read them and the design docs in `docs/superpowers/`.
