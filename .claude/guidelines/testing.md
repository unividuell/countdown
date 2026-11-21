# Testing

## Stack (use these, not the alternatives)

| Concern | Use | Do NOT use |
|---|---|---|
| Assertions | **kotest matchers** (`io.kotest:kotest-assertions-core`) | `kotlin.test.*`, JUnit assertions |
| Mocking | **mockk** (`io.mockk:mockk`); **`@MockkBean`** (`com.ninja-squad:springmockk`) for Spring beans | Mockito / `@MockitoBean` / BDDMockito |
| Web tests | **Spring MockMvc Kotlin DSL** (`mockMvc.get(...) { }.andExpect { }`) | Java `MockMvcRequestBuilders` / `.perform()` / `MockMvcResultMatchers` |
| Runner | JUnit 5 (`@org.junit.jupiter.api.Test`) | — |
| Integration DB | **Testcontainers** Postgres 18 (`@Import(TestcontainersConfiguration::class)`) | H2 / in-memory fakes for DB behaviour |

kotest is the assertion library only — JUnit 5 stays the runner. Prefer mockk over hand-rolled
fakes.

## TDD

Write the failing test first, watch it fail, implement the minimum, refactor. Keep commits small.
Integration tests verify real behaviour against the Testcontainers Postgres, not mock echoes.

## A mapping test needs a non-default value on the source side

If the expected value is what **both** sides default to, the assertion holds whatever the mapping
is wired to:

```kotlin
// Community and the stubbed edition both default to "Europe/Berlin" —
// this passes whichever one the controller actually read.
jsonPath("$.targetTimezone") { value("Europe/Berlin") }
```

Stub a value **only** the intended source could have produced (`"America/New_York"`). For a batch
keyed by id: one row with a distinctive value, a second with none, so a lookup on the wrong key
fails. If the expected value cannot differ from the default, the test does not test the mapping —
say so.

## MockMvc Kotlin DSL + Spring Security test

Request post-processors go inside the DSL block via `with(...)`:

```kotlin
mockMvc.get("/api/me").andExpect { status { isUnauthorized() } }

mockMvc.patch("/api/me") {
    with(principalFor(user)); with(withCsrfToken())
    contentType = MediaType.APPLICATION_JSON
    content = """{"displayName":"New Name","bgColorHex":"#abcdef"}"""
}.andExpect { status { isOk() } }
```

- **`principalFor` (`TestPrincipals.kt`) builds the auth lib's `AuthPrincipal` for a `User`** —
  role `SUPER_ADMIN` exactly when the row is flagged; `principalFor(superAdmin = true)` when only
  the role matters. Don't build tokens by hand.
- **CSRF is the lib's `withCsrfToken()`, never spring-security-test's `csrf()`**
  ([security-and-auth.md](security-and-auth.md)).
- **Through the real test door:** `POST /login/test/as` and carry the `SESSION` cookie from its
  `Set-Cookie` header — not `request.session`: Spring Session wraps the request, and the
  `MvcResult` knows only the unwrapped one (`TestLoginEndToEndTest`).

## Test isolation

- **`@Transactional` on repository/service integration tests,** so each method rolls back.
- **No users are seeded, and a test sign-in commits its row** — `@Transactional` cannot roll back
  what a request wrote. A test asserting *exact* membership over all users (a full `list()`, a
  `count()`) runs in a context of its own, with the test door shut:
  `@TestPropertySource(properties = ["unividuell.auth.test-login.enabled=false"])`
  (`SuperAdminUserServiceTest`). The test classpath registers a placeholder GitHub client so such a
  context still starts.
- **A test that commits rows into a set every community sees — the global image pool — deletes
  them after each test.** The context's database is shared by every class in it; a leftover row is
  content for a later announcement, depending on test order.
- **A start-up guard keyed on a profile fires in every `@SpringBootTest` on that profile.** Don't
  weaken it or add a bypass property: supply the fixture it demands from a **narrowly scoped**
  `@TestConfiguration` on that test class, never globally — a global fixture changes what every
  other context test on the profile sees (`GuessHueTestDatasetConfiguration`).

## One Postgres container, one database per context

- **One container per JVM:** `TestcontainersConfiguration` keeps it in a `companion object`. Never
  turn it back into a plain `@Bean` — a bean belongs to a context, and the suite builds about
  twenty: twenty simultaneous Postgres containers.
- **One database per context:** each `JdbcConnectionDetails` bean issues
  `CREATE DATABASE countdown_test_<n>`. Don't collapse that to one shared database: test sign-ins
  commit rows, and some classes exist to observe a table no other class wrote to.
- **One server means one connection budget.** Every context holds its pool open for the whole run,
  so the container starts with `max_connections=400` and the test classpath caps
  `spring.datasource.hikari.maximum-pool-size` at 5 (`TestcontainersConfigurationTest`).

## Module verification

Keep `ModularityTests` (`ApplicationModules.of(CoreApplication::class.java).verify()`) green. Never
`@Disabled` it or relax it to hide a boundary violation — fix the violation.

## After deleting a class, run the suite with `clean`

`./mvnw test` never removes the `.class` file of a deleted source, and Spring component-scans
`target/classes`: a deleted `@Component` keeps being found (`expected single matching bean but
found 2`). Read a mass failure right after a deletion as a stale target first, and confirm with
`./mvnw clean test`. The same trap makes a `git stash` comparison lie.
