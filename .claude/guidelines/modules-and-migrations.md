# Modules & Migrations (Spring Modulith)

The app is a **Spring Modulith**. Each feature is a module under
`org.unividuell.countdown.core.<module>`.

## Module structure & encapsulation

- **Exposed API** lives in the module's base package: domain read types and
  facade interfaces only (e.g. `iam.User`, `iam.UserQuery`).
- **Everything else** (repositories, services, controllers, security config,
  OAuth components, DTOs) lives in `<module>.internal`. Kotlin has no
  package-private visibility, so the `.internal` subpackage is how we enforce the
  boundary — Spring Modulith treats it as non-exported.
- Other modules may depend only on another module's exposed API, never its
  `.internal`. The `ModularityTests` `verify()` enforces this; keep it green.

## Module naming

The module name doubles as its Postgres schema name (below), so **avoid SQL
reserved words**. The user-management module is named **`iam`**, not `user`,
because `user` is reserved in Postgres.

## One Postgres schema per module

Each module owns a dedicated schema named after the module. The module's
migration creates it and qualifies its tables; entities pin it on `@Table`:

```sql
CREATE SCHEMA IF NOT EXISTS iam;
CREATE TABLE iam.users ( ... );
```
```kotlin
@Table(schema = "iam", name = "users")
```

Shared infrastructure tables that don't belong to a domain module (e.g. the
Spring Session schema) live in the default (`public`) schema.

## Module-based Flyway migrations

Enabled via `spring.modulith.runtime.flyway-enabled=true`. Effect:

- Flyway runs once per application module **plus** a `__root` pseudo-module.
- The base location `classpath:db/migration` is expanded to
  `classpath:db/migration/<module>` per module, each with its **own** history
  table (`flyway_schema_history_<module>`, baselined at 0) — so **every module
  versions independently and starts at `V1`**.

Layout:

```
src/main/resources/db/migration/
  iam/      V1__create_users.sql        # iam schema + its tables
  __root/   V1__spring_session.sql      # shared/infra DDL (default schema)
```

Rules:
- Put migrations in the per-module subfolder. **Scripts placed directly under
  `db/migration/` are NOT scanned.**
- Shared/infra DDL goes in `__root/`.
- The feature requires ArchUnit on the **runtime** classpath (provided by
  `spring-modulith-starter-core`).

## Migration ordering follows the module dependency tree

`SpringModulithFlywayMigrationStrategy` applies modules' migrations in **module-dependency
order** — a module's migrations run after those of the modules it depends on. The dependency
graph is derived from **code** (e.g. a module using another's exposed API). So **cross-schema
FKs are fine**: if module B's table references module A's table, just make B depend on A in
code (use A's exposed API) and A's migrations run first automatically. No manual Flyway
locations/ordering config. Example: `community` → `iam` (uses `iam.UserQuery`), so a
`community` migration may declare an FK to `iam.users`.

## Dependencies note

Pin Spring Modulith to a **GA** version (`2.1.0`), not an RC — RC artifacts live
in the Spring milestone repo, not Maven Central. `spring-modulith-observability`
is a POM-only aggregator in 2.x (no jar) — don't depend on it directly; use
`spring-modulith-starter-insight` if observability is ever needed.
