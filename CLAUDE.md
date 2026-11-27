# countdown.unividuell.org

Users see **daily** (`daily.unividuell.org`, staging `nightly.unividuell.org`). `countdown` stays
the internal name: repo, packages, modules, containers, server paths.

Porting the Nuxt/Firebase `huettehuette.unividuell.org` app to a leaner stack:
- **Backend `core/`** — Spring Boot 4.2 · Kotlin 2.4 · Java 25 · Spring Modulith 2.2 · PostgreSQL 18.
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
- **[Language](.claude/guidelines/README.md#language)** — code, comments, commits and PR text are English; design docs under `docs/superpowers/` and German data stay German. **User-facing German text uses `„…“`** — never a straight `"`.
- **[Git workflow](.claude/guidelines/git-workflow.md)** — git flow: branch off `develop`, PRs target `develop`; `main` = prod, `develop` = staging.
- **[Dependency updates](.claude/guidelines/dependency-updates.md)** — how to bump Maven/npm/Docker/Actions, and the versions held back (TypeScript 6.x, `@types/node` = Node LTS).
- **Backend (`core/`)**
  - **[Kotlin call sites](.claude/guidelines/kotlin.md)** — named arguments from two arguments on, and the exceptions.
  - **[Testing](.claude/guidelines/testing.md)** — mockk + kotest + MockMvc Kotlin DSL + Testcontainers; TDD; test isolation.
  - **[Configuration](.claude/guidelines/configuration.md)** — no `application*.yaml` key is under test, so boot the app after touching one.
  - **[Persistence](.claude/guidelines/persistence.md)** — Spring Data JDBC, Postgres-generated UUID v7, auditing, no `@Column`, expand/switch/contract, query traps.
  - **[Modules & migrations](.claude/guidelines/modules-and-migrations.md)** — Spring Modulith, schema-per-module, module-based Flyway, the plugin pattern.
  - **[Security & auth](.claude/guidelines/security-and-auth.md)** — the auth lib, one account per provider, no session for anonymous requests, super-admin, live per-user permissions.
  - **[Logging](.claude/guidelines/logging.md)** — kotlin-logging inside the class, lambda messages, log silent degradation, never log what storage must not have.
- **Frontend (`webapp-vue/`)**
  - **[Frontend](.claude/guidelines/frontend.md)** — stack, colour roles and dark mode, `apiFetch`/`useAuth`, round assets, no secure-context-only APIs, `vue-tsc -b`.
  - **[UI & layout](.claude/guidelines/frontend-ui.md)** — mobile-first, animation, pointer controls, sizing traps, accessibility, the reveal cover.
  - **[Routing & shells](.claude/guidelines/frontend-routing.md)** — Vue Router 5 file-based, guard-owned nav data, `[slug]` shell, role gating.
  - **[State](.claude/guidelines/frontend-state.md)** — composables (no Pinia), shared clock, shared reveal plumbing, sound, server-authoritative ticking.
  - **[Testing](.claude/guidelines/frontend-testing.md)** — Vitest + `vi` (not mockk), what happy-dom and the browser pane cannot see, doubles.
- **Deployment**
  - **[Deployment](.claude/guidelines/deployment.md)** — ghcr images, arm64 GitHub Actions, prod+staging compose topology, production profile.
  - **[Edge](.claude/guidelines/deployment-edge.md)** — the two Caddys, SPA/API routing, cache headers, the `X-Forwarded-*` chain.
  - **[Server ops](.claude/guidelines/deployment-server.md)** — `update.sh`, secret-handling scripts, backups, pgAdmin.
- **Domain**
  - **[Countdown & rounds](.claude/guidelines/countdown.md)** — `targetAt` + `targetTimezone`, round numbers on a number line, DST, the frozen grid, editions.
  - **[Multi-tenancy](.claude/guidelines/multi-tenancy.md)** — `community_id` scoping, `CommunityAccess`, communities under `/c/`.
  - **[Cross-runtime parity](.claude/guidelines/cross-runtime-parity.md)** — logic computed identically in Kotlin and TS: golden vectors in `shared/`, bit-exact ops only, no `Long` > 2⁵³ in JSON.
- **Games**
  - **[Game rounds](.claude/guidelines/game-rounds.md)** — how a round gets a game and a guess becomes points: materialisation, the secret's two exits, round assets, judging vs. awarding, stages.
  - **[Game integrity](.claude/guidelines/game-integrity.md)** — anti-cheat as built: pictures not values, nothing derived in the client, server-authoritative time, the named ceiling.
  - **[Game content](.claude/guidelines/game-content.md)** — curated puzzle data is a secret in a public repo: never in plaintext, `.local/` → `sops -e`, sample set for tests.
  - **[Game lab](.claude/guidelines/game-lab.md)** — non-prod harness for mini-game review: two-gate, 404 not 403, in-memory round store; the lab adapts to the game, never the reverse.

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
