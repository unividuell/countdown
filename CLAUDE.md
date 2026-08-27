# countdown.unividuell.org

Porting the Nuxt/Firebase `huettehuette.unividuell.org` app to a leaner stack:
- **Backend `core/`** — Spring Boot 4.1 · Kotlin 2.4 · Java 25 · Spring Modulith 2.1 · PostgreSQL 18.
- **Frontend `webapp-vue/`** — Vite 8 · Vue 3 · TypeScript (strict) · Vue Router 5 (file-based) · Tailwind v4 · pnpm.

## Coding guidelines (read before non-trivial work)

- When writing something intended for human consumption, (comment, commit message, reply to prompt) use as few words as possible. Pick every word meticulously to reduce the volume to a strict minimum. Be down to the point. Less is more.
- Avoid superlatives and praise. Stop telling me I am absolutely right. Give me the cold hard truth.
- Let the reader of the code breathe. Add empty lines between logical blocks of code.
- Add a small, to the point, comment to explain *what* the block does and *why*. Use examples when possible. Propose ASCII drawings to explain complete systems.
- Don't touch blocks of code unrelated to the feature you implement. e.g. Don't add comments to a block of code if you did not create it or modify it. As much as possible try to minimize the number of changed lines when implementing a feature.

When you write a commit message, follow these 7 rules:
Rule 1: Separate the subject line from the body with a single blank line.
Rule 2: Limit the subject line to 50 characters (72 is the absolute hard limit).
Rule 3: Capitalize the first letter of the subject line.
Rule 4: Do not end the subject line with a period.
Rule 5: Use the imperative mood in the subject line (e.g., "Fix bug," "Add feature," 
        not "Fixed" or "Adds"). Test formula: It must complete the sentence: "If applied,
        this commit will [your subject line here]".
Rule 6: Wrap the body text manually at 72 characters to prevent Git formatting issues.
Rule 7: Use the body to explain what and why vs. how. Assume the code explains the how;
        the message must explain the context and reasoning. 


Binding project conventions live in [`.claude/guidelines/`](.claude/guidelines/README.md):

- **[Feeding knowledge back](.claude/guidelines/feeding-knowledge-back.md)** — every task ends by capturing the transferable rules here; post-mortems and measurements stay in the commit.
- **[Language](.claude/guidelines/README.md#language)** — source code, config/script comments and operator READMEs are English regardless of conversation language; commit messages and PR text too; design docs under `docs/superpowers/` and German data stay German. **User-facing German text uses `„…“`** (low opening, high closing) — never a straight `"`.
- **[Git workflow](.claude/guidelines/git-workflow.md)** — git flow: branch off `develop`, PRs target `develop`; `main` = prod, `develop` = staging.
- **[Kotlin call sites](.claude/guidelines/kotlin.md)** — named arguments from two arguments on; the exceptions (single arg, varargs, Java-declared functions, trailing lambdas, infix).
- **[Testing](.claude/guidelines/testing.md)** — mockk + kotest + MockMvc Kotlin DSL + Testcontainers; TDD.
- **[Persistence](.claude/guidelines/persistence.md)** — Spring Data JDBC, Postgres-generated UUID v7, auditing, no `@Column`.
- **[Modules & migrations](.claude/guidelines/modules-and-migrations.md)** — Spring Modulith, schema-per-module, module-based Flyway.
- **[Security & auth](.claude/guidelines/security-and-auth.md)** — GitHub OAuth2, session, super-admin role, SPA 401/CSRF contract. *(backend)*
- **[Logging](.claude/guidelines/logging.md)** — kotlin-logging, `logger {}` inside the class (never top-level), always lambda messages, log where behaviour degrades silently. *(backend)*
- **[Frontend](.claude/guidelines/frontend.md)** — Vue 3 + Vite 8 + Tailwind v4; `apiFetch`/`useAuth` (CSRF, 401, full-page OAuth); lint + `vue-tsc -b`. *(webapp-vue)*
  - **[UI & layout](.claude/guidelines/frontend-ui.md)** — mobile-first, sizing traps, accessibility.
  - **[Routing & shells](.claude/guidelines/frontend-routing.md)** — Vue Router 5 file-based, guard-owned nav data, `[slug]` shell, role gating.
  - **[State](.claude/guidelines/frontend-state.md)** — composables/VueUse (no Pinia), shared clock, server-authoritative ticking, short-clip audio.
  - **[Testing](.claude/guidelines/frontend-testing.md)** — Vitest + `vi` (not mockk), happy-dom limits, doubles.
- **[Deployment](.claude/guidelines/deployment.md)** — ghcr images (Buildpacks/multi-stage), arm64 GitHub Actions, prod+staging compose topology, backend production profile.
  - **[Edge](.claude/guidelines/deployment-edge.md)** — the two Caddys, TLS, SPA/API routing, cache headers, the `X-Forwarded-*` chain.
  - **[Server ops](.claude/guidelines/deployment-server.md)** — `update.sh`, secret-handling scripts, pg_dump backup, SSH-tunnel pgAdmin.
- **[Dependency updates](.claude/guidelines/dependency-updates.md)** — how to bump Maven/npm/Docker, and the versions we deliberately hold back (TypeScript 6.x for `vue-tsc`, `@types/node` matching the Node LTS runtime).
- **[Cross-runtime parity](.claude/guidelines/cross-runtime-parity.md)** — logic that must compute identically in Kotlin and TS: golden vectors in `shared/`, only bit-exactly specified ops (no `sin/cos/log/exp/pow`), UTF-8 string hashing, never a `Long` > 2⁵³ as a JSON number.
- **[Game content](.claude/guidelines/game-content.md)** — hand-curated puzzle data is a secret in a public repo: never in plaintext (spec, plan, commit, fixture), handed over via gitignored `.local/` → `sops -e`, sample set for tests, fail-fast under `production`/`staging`.
- **[Game rounds](.claude/guidelines/game-rounds.md)** — the run as the round coordinate, lazy materialisation on first announcement, one round secret with two exits (the rule per *stream*), the game judges / the framework awards, `points` as a cache, a row lock when writing other players' rows.
- **[Game lab](.claude/guidelines/game-lab.md)** — non-prod harness for manual mini-game review: two-gate (`!production` + own switch), 404 not 403, self-limiting in-memory round store, payload-hygiene test; the lab adapts to the game, never the reverse.

Design docs (specs + plans) are in `docs/superpowers/`. Reference implementations:
the **`iam` module** (backend) and **`webapp-vue`** (frontend).

> **Branching:** we use **git flow**. Start work from `develop` and open PRs with
> `--base develop` (`develop` is the GitHub default branch; `main` is production).
> If any tooling claims the PR base is `main`, it's reading a stale `origin/HEAD`.
> See [git-workflow.md](.claude/guidelines/git-workflow.md).

## Build & run

```bash
# Backend
cd core && ./mvnw test            # full suite (Testcontainers needs Docker)
cd core && ./mvnw spring-boot:run # starts Postgres 18 via compose; see core/README.md

# Frontend
cd webapp-vue && pnpm install && pnpm test
cd webapp-vue && pnpm dev         # proxies to the backend on :8080; see webapp-vue/README.md
```
