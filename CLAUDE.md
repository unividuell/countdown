# countdown.unividuell.org

Porting the Nuxt/Firebase `huettehuette.unividuell.org` app to a leaner stack:
- **Backend `core/`** — Spring Boot 4.1 · Kotlin 2.3 · Java 25 · Spring Modulith 2.1 · PostgreSQL 18.
- **Frontend `webapp-vue/`** — Vite 8 · Vue 3 · TypeScript (strict) · Vue Router 5 (file-based) · Tailwind v4 · pnpm.

## Coding guidelines (read before non-trivial work)

Binding project conventions live in [`.claude/guidelines/`](.claude/guidelines/README.md):

- **[Feeding knowledge back](.claude/guidelines/feeding-knowledge-back.md)** — every task ends by capturing important learnings into these guidelines.
- **[Testing](.claude/guidelines/testing.md)** — mockk + kotest + MockMvc Kotlin DSL + Testcontainers; TDD.
- **[Persistence](.claude/guidelines/persistence.md)** — Spring Data JDBC, Postgres-generated UUID v7, auditing, no `@Column`.
- **[Modules & migrations](.claude/guidelines/modules-and-migrations.md)** — Spring Modulith, schema-per-module, module-based Flyway.
- **[Security & auth](.claude/guidelines/security-and-auth.md)** — GitHub OAuth2, session, super-admin role, SPA 401/CSRF contract. *(backend)*
- **[Frontend](.claude/guidelines/frontend.md)** — Vue 3 + Vite 8 + Vue Router 5 file-based + Tailwind v4; composables/VueUse (no Pinia); `apiFetch`/`useAuth` (CSRF, 401, full-page OAuth); Vitest + `vi` (not mockk). *(webapp-vue)*

Design docs (specs + plans) are in `docs/superpowers/`. Reference implementations:
the **`iam` module** (backend) and **`webapp-vue`** (frontend).

## Build & run

```bash
# Backend
cd core && ./mvnw test            # full suite (Testcontainers needs Docker)
cd core && ./mvnw spring-boot:run # starts Postgres 18 via compose; see core/README.md

# Frontend
cd webapp-vue && pnpm install && pnpm test
cd webapp-vue && pnpm dev         # proxies to the backend on :8080; see webapp-vue/README.md
```
