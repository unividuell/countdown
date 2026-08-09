# Shared Postgres container for the backend test suite

## Problem

`TestcontainersConfiguration` declares the Postgres container as a plain `@Bean`:

```kotlin
@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfiguration {
    @Bean
    @ServiceConnection
    fun postgresContainer(): PostgreSQLContainer =
        PostgreSQLContainer(DockerImageName.parse("postgres:18"))
}
```

The bean belongs to the test application context. Thirty-two test classes carry
`@SpringBootTest` + `@Import(TestcontainersConfiguration::class)` with differing
`@MockkBean` sets, `@TestPropertySource`s and one `@ActiveProfiles("production")`, which
the Spring TestContext framework resolves to roughly twenty-two distinct context
configurations — and therefore twenty-two Postgres containers running at once.

On an idle machine the suite still finishes in about a minute, so the cost is invisible
day to day. On a congested Docker host it is a cliff: a run was observed blocking
completely, Maven at 0 % CPU for thirty minutes having spent nine seconds of CPU in
total, the last surefire report written after roughly thirty seconds. Killing the run
made Ryuk reap nineteen containers at once, confirming they all belonged to that JVM.

## Constraint: the isolation the suite already relies on

Sharing one *database* across all contexts is not safe here.

`TestUserSeeder` runs at context startup and **commits** twelve Futurama users;
`@Transactional` on a test method cannot roll those back. Four classes switch the seeder
off with `app.test-auth.enabled=false` precisely so they observe an *empty* user table —
`SuperAdminUserServiceTest`, `SuperAdminRosterServiceTest`, `SuperAdminRosterEmptyAllowlistTest`
and `UserProvisioningServiceTest`. Today that works because every context gets a virgin
container. With a single shared database they would see rows committed by whichever
context was built first, and the failures would depend on class ordering.

The guarantee to preserve is therefore: **every distinct context configuration starts
from an empty, freshly migrated database.**

## Design

**One static container per JVM, one logical database per Spring context.**

```
TestcontainersConfiguration
├── companion object
│     PostgreSQLContainer("postgres:18"), started in a static initialiser
└── @Bean JdbcConnectionDetails
      CREATE DATABASE countdown_test_<n>  →  JDBC URL pointing at it
```

* The container moves into a `companion object` and is started from static
  initialisation, outside any bean lifecycle. Spring never starts or stops it; Ryuk
  reaps it when the JVM exits. One container per `./mvnw test`, whatever the number of
  contexts.
* `@ServiceConnection` is replaced by an explicit `JdbcConnectionDetails` bean. Since
  `TestcontainersConfiguration` is imported *into each context*, that bean is
  instantiated once per context. Each instance issues `CREATE DATABASE countdown_test_<n>`
  (`n` from an `AtomicInteger`) against the shared server and returns a JDBC URL for that
  database.
* Spring Boot's `PropertiesJdbcConnectionDetails` is `@ConditionalOnMissingBean(JdbcConnectionDetails::class)`,
  so the explicit bean wins and the `DataSource`, Flyway and Spring Session JDBC all
  follow it.
* Flyway then migrates that fresh database exactly as before. The Spring Modulith
  schema-per-module layout (`__root`, `iam`, `community`) is untouched — see
  [modules-and-migrations](../../../.claude/guidelines/modules-and-migrations.md).

### What changes for the tests

Nothing. No test class is edited, no truncation hook is added, no per-test schema is
introduced. Isolation is bit-for-bit what it is today: an empty migrated database per
context configuration, `@Transactional` rollback within a class, and the seeder
committing only into its own context's database.

### What is traded

Roughly twenty-two `CREATE DATABASE` statements plus their Flyway runs — milliseconds
each — instead of twenty-two container starts costing seconds each, plus twenty-two
concurrent Postgres processes and their memory and connection-slot footprint.

### `TestCoreApplication`

The dev-time runner
(`fromApplication<CoreApplication>().with(TestcontainersConfiguration::class)`) keeps
working unchanged. It builds a single context, so it gets one container and one
database, as before.

## Verification

* `./mvnw test` timed before and after on the same machine.
* Peak `docker ps --format '{{.Image}}' | grep -c postgres` sampled during each run.
* The full suite stays green — in particular the four seeder-sensitive classes above and
  `ModularityTests`.

The measured before/after numbers belong in the commit message, per
[feeding-knowledge-back](../../../.claude/guidelines/feeding-knowledge-back.md).
