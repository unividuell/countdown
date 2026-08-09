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
