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

## Module verification

Keep `ModularityTests` (`ApplicationModules.of(CoreApplication::class.java).verify()`)
green. Never `@Disabled` it or relax it to hide a boundary violation — fix the
violation instead.
