# countdown.unividuell.org

Spring Boot backend (`core/`) porting the Nuxt/Firebase `huettehuette.unividuell.org`
app. Spring Boot 4.1 · Kotlin 2.3 · Java 25 · Spring Modulith 2.1 · PostgreSQL 18.

## Coding guidelines (read before non-trivial work)

Binding project conventions live in [`.claude/guidelines/`](.claude/guidelines/README.md):

- **[Feeding knowledge back](.claude/guidelines/feeding-knowledge-back.md)** — every task ends by capturing important learnings into these guidelines.
- **[Testing](.claude/guidelines/testing.md)** — mockk + kotest + MockMvc Kotlin DSL + Testcontainers; TDD.
- **[Persistence](.claude/guidelines/persistence.md)** — Spring Data JDBC, Postgres-generated UUID v7, auditing, no `@Column`.
- **[Modules & migrations](.claude/guidelines/modules-and-migrations.md)** — Spring Modulith, schema-per-module, module-based Flyway.
- **[Security & auth](.claude/guidelines/security-and-auth.md)** — GitHub OAuth2, session, super-admin role, SPA 401/CSRF contract.

Design docs (specs + plans) are in `docs/superpowers/`. The `iam` module is the
reference implementation of every guideline.

## Build & run

```bash
cd core
./mvnw test            # full suite (Testcontainers needs Docker running)
./mvnw spring-boot:run # starts Postgres 18 via compose; see core/README.md
```
