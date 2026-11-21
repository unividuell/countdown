# Modules & Migrations (Spring Modulith)

The app is a **Spring Modulith**. Each feature is a module under
`org.unividuell.countdown.core.<module>`.

## Module structure & encapsulation

- **Exposed API** lives in the module's base package: domain read types and facade interfaces only
  (`iam.User`, `iam.UserQuery`).
- **Everything else** (repositories, services, controllers, DTOs) lives in `<module>.internal`.
  Kotlin has no package-private visibility; Spring Modulith treats `.internal` as non-exported.
- Other modules depend only on a module's exposed API. `ModularityTests.verify()` enforces it.
- **The module name is its Postgres schema name, so avoid SQL reserved words:** `iam`, not `user`.

## One Postgres schema per module

The module's migration creates its schema and qualifies its tables; entities pin it on `@Table`:

```sql
CREATE SCHEMA IF NOT EXISTS iam;
CREATE TABLE iam.users ( ... );
```
```kotlin
@Table(schema = "iam", name = "users")
```

Shared infrastructure tables (the Spring Session schema) live in the default (`public`) schema.

## Module-based Flyway migrations

Enabled via `spring.modulith.runtime.flyway-enabled=true`: Flyway runs once per module **plus** a
`__root` pseudo-module, each with its **own** history table — so every module versions
independently and starts at `V1`.

```
src/main/resources/db/migration/
  iam/      V1__create_users.sql        # iam schema + its tables
  __root/   V1__spring_session.sql      # shared/infra DDL (default schema)
```

- **Scripts placed directly under `db/migration/` are NOT scanned.** Per-module subfolder, or
  `__root/` for shared DDL.
- **A pure-logic module ships no schema and no migration folder** (`countdown`, which depends on
  `community`, never the reverse). Add the schema when the module first persists something.

## Stale `application-modules.json` — clean after changing the module set

Spring Modulith persists the detected module structure to
`target/classes/META-INF/spring-modulith/application-modules.json`, and the runtime — the
module-Flyway strategy included — reads it. After adding a module or a dependency between modules
it describes the old structure: a new module's migrations don't run, or a cross-schema FK fails on
ordering. **Run `./mvnw clean`** and rebuild before trusting runtime or migration behaviour.

## Migration ordering follows the module dependency tree

A module's migrations run after those of the modules it depends on, and the graph is derived from
**code**. So a cross-schema FK is fine: if B's table references A's, make B use A's exposed API.
No manual Flyway ordering. Example: `community` → `iam` (`iam.UserQuery`), so a `community`
migration may reference `iam.users`.

## The plugin pattern: data points one way, code the other

A plugin module's code arrow points **host → plugin** (the adapter lives in the host:
`SongSnippetGameType` in `game.internal` calls into `songsnippet`), but what it would store hangs
off the host's data. Migrations follow the code graph, so the plugin's schema migrates **before**
the host's — an FK against the code arrow cannot be created.

- **A plugin owns no table where it can avoid it:** a game *produces* what it would store and the
  host stores it (`game.round_assets`, [game-rounds.md](game-rounds.md), „Round assets“). No state,
  no schema.
- **Don't bend the migration strategy for a plugin table:** drop the FK, leave the waiver as a
  comment in the migration that would have carried it, and own the lifecycle in application code.
- **A class the host injects (`SnippetCutter`) lives in the plugin's exposed root package,** never
  `.internal`. `deduster` → `imagepool` likewise uses the exported `ImagePoolQuery`.

## Dependencies

- Spring Modulith is pinned to a **GA** version — RC artifacts are not on Maven Central.
- Module-based Flyway needs ArchUnit on the **runtime** classpath; `spring-modulith-starter-core`
  brings it.
- Module spans come from `spring-modulith-observability-core`; what it demands of a bean is in
  [logging.md](logging.md).
