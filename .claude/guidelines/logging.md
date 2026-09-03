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
@Controller
class DevLoginController(/* … */) {

    private val logger = KotlinLogging.logger {}

    fun picker(): String {
        logger.warn { "no database row for seed login '$login' — omitting its button" }
    }
}
```

- `KotlinLogging.logger {}` names the logger after the lambda's **enclosing** declaration. Inside a
  class that is the class. At file top level it is the file's facade class instead — which is only
  the right name by coincidence, when the file happens to hold exactly one class named after it. A
  file with two top-level declarations (`SeedUser` + `TestUserSeeder` in `TestUserSeeder.kt`) would
  log both under the file's name, so the line no longer tells you where it came from. Keep it in the
  class and the name is right by construction.
- No class literal is needed either way — a rename carries the logger name with it.
- **Always pass the message as a lambda** (`logger.warn { "…" }`), never as a string
  (`logger.warn("…")`). The lambda is only evaluated if the level is enabled, so string
  interpolation costs nothing when the statement is switched off. This is the whole reason we took
  the dependency — a `logger.warn("… $x …")` call throws that away and should be flagged in review.

## What to log

Prefer a log line where behaviour degrades **silently**. The case that motivated this: the dev-login
picker drops the button of a seed user whose database row is missing — one button short beats a
broken page, but an absent button with no log line is close to undiagnosable. Name the identifier
that went missing, so the line points at the cause rather than announcing that something happened.

Cover such a branch with a test as well. A log statement on a path no test reaches proves nothing —
and the test is what shows the branch is reachable and does not blow up.

## What not to log

Never log a value the design keeps out of storage on purpose — a log line often outlives the
database row it was kept out of. If a doc-comment claims a value never reaches persistence, that
guarantee covers the logs too: `GoogleCountryLookup` resolves a Street View coordinate to a
country precisely so the coordinate never reaches the database (see `CountryLookup`'s doc-comment)
— a log line printing it on the error path would have quietly broken that promise.
