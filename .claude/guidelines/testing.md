# Testing

## Stack (use these, not the alternatives)

| Concern | Use | Do NOT use |
|---|---|---|
| Assertions | **kotest matchers** (`io.kotest:kotest-assertions-core`) | `kotlin.test.*`, JUnit assertions |
| Mocking | **mockk** (`io.mockk:mockk`); **`@MockkBean`** (`com.ninja-squad:springmockk`) for Spring beans | Mockito / `@MockitoBean` / BDDMockito |
| Web tests | **Spring MockMvc Kotlin DSL** (`mockMvc.get(...) { }.andExpect { }`) | Java `MockMvcRequestBuilders` / `.perform()` / `MockMvcResultMatchers` |
| Runner | JUnit 5 (`@org.junit.jupiter.api.Test`) | — |
| Integration DB | **Testcontainers** Postgres 18 (`@Import(TestcontainersConfiguration::class)`) | H2 / in-memory fakes for DB behaviour |

kotest is used **only as the assertion library** here — JUnit 5 stays the runner.

## TDD

Write the failing test first, watch it fail, implement the minimum to make it
pass, then refactor. Keep commits small. Integration tests must verify real
behaviour against the Testcontainers Postgres, not mock echoes.

## A mapping test needs a non-default value on the source side

When a test proves that value X reaches field Y, and the expected value happens to be what **both**
sides default to, the assertion holds even if the mapping is wired to something else entirely. It
looks like coverage and is worth nothing:

```kotlin
// Community defaults to "Europe/Berlin", the stubbed edition defaults to "Europe/Berlin" too —
// this passes whichever one the controller actually read.
every { editions.requireActive(id) } returns CommunityEdition(communityId = id, label = "Team 2026")
jsonPath("$.startsAtTimezone") { value("Europe/Berlin") }
```

Stub a value that **only** the intended source could have produced (`"America/New_York"`), then assert
that. Same rule for a batch keyed by id: give one row a distinctive value and a second row none, so a
lookup on the wrong key produces the default and the test fails. If you cannot make the expected value
differ from the default, the test is not testing the mapping — say so instead of asserting it.

## Assertion cheatsheet (kotest)

```kotlin
actual shouldBe expected
value.shouldNotBeNull()                 // io.kotest.matchers.nulls.*
value.shouldBeNull()
flag shouldBe true
shouldThrow<NoSuchElementException> { ... }   // io.kotest.assertions.throwables.*
result.shouldBeInstanceOf<CountdownOAuth2User>()  // io.kotest.matchers.types.*
authorities shouldContain "ROLE_USER"   // io.kotest.matchers.collections.*
```

## Mocking with mockk

Spring bean override in a `@SpringBootTest`:

```kotlin
@MockkBean
lateinit var profileService: UserProfileService
// ...
every { profileService.update(uid, "New Name", "#abcdef") } returns updatedUser
```

Plain unit test (no Spring): construct the real collaborator with mockk doubles —
`mockk<UserRepository>()`, `every { repo.findByGithubId(42L) } returnsMany listOf(null, existing)`,
`every { repo.save(match { it.id == null }) } throws DuplicateKeyException("dup")`,
`verify(exactly = 2) { repo.findByGithubId(42L) }`. Prefer mockk over hand-rolled fakes.

## MockMvc Kotlin DSL + Spring Security test

Apply spring-security-test post-processors inside the DSL block via `with(...)`:

```kotlin
mockMvc.get("/api/me").andExpect { status { isUnauthorized() } }

mockMvc.get("/api/me") {
    with(authentication(OAuth2AuthenticationToken(principal, principal.authorities, "github")))
}.andExpect {
    status { isOk() }
    jsonPath("$.username") { value("Mr. Custom") }
}

mockMvc.patch("/api/me") {
    with(authentication(...)); with(csrf())
    contentType = MediaType.APPLICATION_JSON
    content = """{"displayName":"New Name","bgColorHex":"#abcdef"}"""
}.andExpect { status { isOk() } }
```

## Test isolation

Annotate repository/service integration tests with `@Transactional` so each
method rolls back — assertions like `repository.count()` must not see state from
sibling tests.

`app.test-auth.enabled` is `true` on the test classpath, so **`TestUserSeeder` seeds its twelve
Futurama users into every `@SpringBootTest` context** — rows `@Transactional` cannot roll back,
because they are committed before the test starts. Any test asserting *exact* membership over all
users (a full `list()`, a `count()`, a roster) must switch the seeder off:

```kotlin
@TestPropertySource(properties = ["app.test-auth.enabled=false"])
```

`SuperAdminRosterServiceTest` and `SuperAdminUserServiceTest` are the precedents.

A start-up guard keyed on the deployed profile (e.g. "fail if this profile loaded the fallback
data") fires inside **every** `@SpringBootTest` that activates that profile too — the test context
is a real Spring context. Don't weaken the guard and don't add a bypass property; let the test
supply the fixture the guard demands, imported from a **narrowly scoped** `@TestConfiguration` on
that test class, never registered globally. A fixture registered globally would silently change
what every other context test on that profile sees, and a later test asserting the real fallback
behaviour would observe the fixture instead. `GuessHueTestDatasetConfiguration` is the precedent.

## One Postgres container, one database per context

`TestcontainersConfiguration` keeps the container in a `companion object`, started from static
initialisation, so it lives outside any context lifecycle — **one container per JVM**, however many
contexts the suite builds. Never turn it back into a plain `@Bean`: a bean belongs to the test
application context, and the suite resolves to twenty distinct context configurations, so that is
twenty simultaneous Postgres containers. The cost is invisible on an idle machine and a cliff on a
busy Docker host.

Isolation lives one level down. The `JdbcConnectionDetails` bean **is** per context, and each
instance issues `CREATE DATABASE countdown_test_<n>` before returning its URL, so every context
still starts from an empty, freshly migrated database. Don't collapse that to one shared database:
`TestUserSeeder` commits before any test runs, and the classes that set
`app.test-auth.enabled=false` do so precisely to observe an empty table.

Consolidating servers consolidates their **connection budget**. Every context holds its pool open
for the whole run, so pool size multiplies by context count against a single `max_connections` —
the defaults (10 per pool, 100 per server) die at ten contexts. The container therefore starts with
`max_connections=400` and the test classpath caps `spring.datasource.hikari.maximum-pool-size` at
5. `TestcontainersConfigurationTest` guards the server side of that arithmetic.

## Module verification

Keep `ModularityTests` (`ApplicationModules.of(CoreApplication::class.java).verify()`)
green. Never `@Disabled` it or relax it to hide a boundary violation — fix the
violation instead.

## After deleting a class, run the suite with `clean`

`./mvnw test` never removes the `.class` file of a source file you deleted, and Spring
component-scans `target/classes`, not your sources. A deleted `@Component` or
`@Configuration` therefore keeps being found: deleting one of two `MemberPointsQuery`
implementations failed 263 tests with `expected single matching bean but found 2`, against
a tree where only one implementation existed. Read a mass failure right after a deletion as
a stale-target suspicion first, and confirm with `./mvnw clean test` before believing
anything the run says about the code. The same trap makes a `git stash` comparison lie:
without `clean`, the run measures leftover classes instead of the stashed tree.
