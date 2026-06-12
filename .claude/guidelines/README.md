# Coding Guidelines — countdown core

Project-wide conventions for the `core` Spring Boot backend (ported from the
Nuxt/Firebase `huettehuette.unividuell.org`). These are binding defaults for new
work — follow them unless a documented decision says otherwise. They exist so
new features and new team members (and AI assistants) stay consistent.

| Topic | File |
|---|---|
| **Feeding knowledge back** — capture important learnings into these guidelines as part of every task | [feeding-knowledge-back.md](feeding-knowledge-back.md) |
| Testing (mockk · kotest · MockMvc Kotlin DSL · Testcontainers · TDD) | [testing.md](testing.md) |
| Persistence (Spring Data JDBC · UUID v7 · auditing) | [persistence.md](persistence.md) |
| Modules & migrations (Spring Modulith · schema-per-module · module-based Flyway) | [modules-and-migrations.md](modules-and-migrations.md) |
| Security & auth (GitHub OAuth2 · session · roles · SPA contract) | [security-and-auth.md](security-and-auth.md) |

## Stack baseline

- **Spring Boot 4.1**, **Kotlin 2.3**, **Java 25**, **Spring Modulith 2.1** (GA — not RC).
- **PostgreSQL 18** (required for the native `uuidv7()` function).
- Build with the Maven wrapper from `core/`: `./mvnw test`, `./mvnw spring-boot:run`.
- Local dev DB comes up via Spring Boot docker-compose support (`core/compose.yaml`, pinned to `postgres:18`).

## Worked example

The `iam` module (user management / GitHub login) is the reference
implementation of every guideline here. When in doubt, read it and the design
docs in `docs/superpowers/`.
