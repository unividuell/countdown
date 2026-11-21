# Logging (backend)

We log with **[kotlin-logging](https://github.com/oshai/kotlin-logging)**
(`io.github.oshai:kotlin-logging-jvm`), not slf4j's `LoggerFactory` directly. It is a thin Kotlin
facade over slf4j, so Spring Boot's Logback setup, the `logging.level.*` properties and the log
format all keep working unchanged.

Its version is **not** in the Spring Boot BOM, so it lives in `core/pom.xml` as
`kotlin-logging.version` and is ours to track — see
[dependency-updates.md](dependency-updates.md).

## The idiom

Declare the logger **inside the class**, never at file top level:

```kotlin
@Service
class CountdownService(/* … */) {

    private val logger = KotlinLogging.logger {}

    fun forSlug(/* … */): CountdownResponse {
        logger.warn { "community $communityId has no active edition — countdown shows no date" }
    }
}
```

- `KotlinLogging.logger {}` names the logger after the lambda's **enclosing** declaration: inside
  a class, the class; at file top level, the file's facade class — the right name only while the
  file holds exactly one class named after it.
- **Always pass the message as a lambda** (`logger.warn { "…" }`), never as a string. The lambda is
  evaluated only if the level is enabled — the reason we took the dependency.

## What to log

Prefer a log line where behaviour degrades **silently**. Example: a community without an active
edition gets a countdown without a date — a page short of one fact beats a 500, but a missing date
with no log line is close to undiagnosable. Name the identifier that went missing, so the line
points at the cause rather than announcing that something happened.

Cover such a branch with a test as well. A log statement on a path no test reaches proves nothing —
and the test is what shows the branch is reachable and does not blow up.

## What not to log

Never log a value the design keeps out of storage on purpose — a log line often outlives the
database row. A doc-comment's "never reaches persistence" covers the logs too: `GoogleCountryLookup`
resolves a Street View coordinate to a country so the coordinate is never stored, error path
included.

## Where logs go

Staging and production log ECS JSON to stdout (`logging.structured.format.console: ecs`);
edge-caddy's `edge-lgtm` reads it from docker's log files and unpacks level, logger, trace id
and stack trace. So: no OTLP log appender, no log file, no second format — anything else on
stdout arrives as unparsed text. Locally the console stays human-readable and nothing is
exported. Metrics and traces, unlike logs, go out via OTLP, tagged
`service.namespace=countdown` and `deployment.environment.name`; an app-level metric is a
Micrometer meter named `countdown.*` (`observability/internal/ActivePlayers.kt`).

Every SQL query and every pooled connection is a trace span (`datasource-micrometer`), with
the SQL text but no parameter values. Above them, `spring-modulith-observability-core` adds a span
per call into a module. It wraps each controller, cross-module listener and **API-package
bean** in a CGLIB subclass, so such a bean must be `open` with `open` members (the Kotlin
spring plugin does that only for annotated classes; a `@Bean`-built one like `GuessHueDataset`
needs it spelled out), and a servlet filter belongs in `internal` (proxied, Tomcat's call to
its final `init` meets a null `logger`). Get it wrong and the app does not start.
