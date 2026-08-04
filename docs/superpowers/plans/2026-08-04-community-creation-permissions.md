# Community-Erstellung nur nach Freischaltung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nur vom Super-Admin freigeschaltete Nutzer dürfen Spielgemeinschaften anlegen; die Freischaltung passiert in einem neuen Nutzer-Bereich unter `/super-admin`.

**Architecture:** Ein Boolean auf `iam.users`, das **nie** aus dem Session-Prinzipal gelesen wird — `AuthenticatedUser` bleibt unangetastet, damit es keine Session-Kopie gibt, die man versehentlich als Berechtigungsquelle nutzt. `POST /api/communities` und `GET /api/me` fragen live. Im Frontend verschwinden alle Einstiegspunkte zum Erstellen; `/super-admin` wird vom Button-Sammelplatz zur Nav-Liste mit Unterseiten.

**Tech Stack:** Backend Spring Boot 4.1 · Kotlin 2.4 · Spring Modulith 2.1 · Spring Data JDBC · Flyway · PostgreSQL 18. Tests: JUnit 5 + kotest-Matcher + mockk/springmockk + MockMvc Kotlin DSL + Testcontainers. Frontend Vite 8 · Vue 3 · TypeScript strict · Vue Router 5 (file-based) · Tailwind v4 · Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-04-community-creation-permissions-design.md`](../specs/2026-08-04-community-creation-permissions-design.md)

## Global Constraints

- **Zwei Namen, zwei Fakten.** `User.communityCreationAllowed` ist die gespeicherte Spalte (roh). `User.mayCreateCommunities` ist die berechnete effektive Berechtigung (`isSuperAdmin || communityCreationAllowed`) und die **einzige** Stelle, an der diese Regel steht. Super-Admin-DTOs tragen die rohe, `MeResponse` die effektive.
- **`AuthenticatedUser` wird nicht erweitert.** Berechtigungen werden live gelesen, nie aus der Session.
- Tests: kotest-Matcher (`shouldBe`), **nicht** `kotlin.test`/JUnit-Assertions. mockk/`@MockkBean`, **nicht** Mockito. MockMvc **Kotlin DSL** (`mockMvc.get(...) { }.andExpect { }`), nicht `.perform()`.
- Persistence: kein `@Column`; ids kommen von Postgres (`uuidv7()`); Flyway-Migrationen liegen modulweise unter `core/src/main/resources/db/migration/<modul>/`.
- Repository-/Service-Integrationstests tragen `@Transactional`, damit jede Methode zurückrollt.
- `ModularityTests` muss grün bleiben — niemals `@Disabled`.
- Logging: kotlin-logging, `logger {}` **in** der Klasse, Lambda-Messages.
- KDoc/Kommentare auf Englisch, UI-Texte auf Deutsch.
- Frontend ist mobile-first: schmal zuerst, Tap-Targets ≥ 44px.
- Keine redundanten Inline-Kommentare; Begründungen gehören in die Commit-Message.
- Commit-Messages: Präfix wie im Repo (`feat(scope):`, `fix(scope):`, `refactor(scope):`), Body erklärt das *Warum*, Fuß `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

**Testkommandos**

```bash
cd core && ./mvnw test -Dtest=KlassenName
```

```bash
cd webapp-vue && pnpm vitest run src/pfad/zur/datei.spec.ts
```

---

### Task 1: Spalte, Feld und effektive Berechtigung

**Files:**
- Create: `core/src/main/resources/db/migration/iam/V2__add_community_creation_allowed.sql`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/User.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserRepositoryTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserTest.kt` (neu)

**Interfaces:**
- Consumes: nichts.
- Produces: `User.communityCreationAllowed: Boolean` (persistiert, Default `false`) und `User.mayCreateCommunities: Boolean` (berechnet, `isSuperAdmin || communityCreationAllowed`). Alle späteren Tasks bauen darauf.

- [ ] **Step 1: Failing Test für die berechnete Property schreiben**

Neue Datei `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserTest.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class UserTest {

    private fun user(superAdmin: Boolean = false, allowed: Boolean = false) = User(
        githubId = 1L, githubLogin = "octocat",
        isSuperAdmin = superAdmin, communityCreationAllowed = allowed,
    )

    @Test
    fun `may create communities when the clearance is stored`() {
        user(allowed = true).mayCreateCommunities shouldBe true
    }

    @Test
    fun `may create communities as a super-admin without a stored clearance`() {
        user(superAdmin = true).mayCreateCommunities shouldBe true
    }

    @Test
    fun `may not create communities without either`() {
        user().mayCreateCommunities shouldBe false
    }
}
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=UserTest`
Expected: Kompilierfehler — `communityCreationAllowed` und `mayCreateCommunities` existieren nicht.

- [ ] **Step 3: Migration schreiben**

Neue Datei `core/src/main/resources/db/migration/iam/V2__add_community_creation_allowed.sql`:

```sql
ALTER TABLE iam.users
    ADD COLUMN community_creation_allowed BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 4: `User` erweitern**

In `User.kt` das neue Feld hinter `isSuperAdmin` einfügen und die berechnete Property neben `username` stellen:

```kotlin
    val isSuperAdmin: Boolean = false,
    val communityCreationAllowed: Boolean = false,
```

```kotlin
    /** Name shown in the UI: user-chosen, else GitHub display name, else GitHub handle. */
    val username: String
        get() = displayName ?: githubName ?: githubLogin

    /**
     * Effective permission to create communities: the stored clearance, or super-admin.
     * The only place this rule lives — read it instead of combining the two facts per call site.
     */
    val mayCreateCommunities: Boolean
        get() = isSuperAdmin || communityCreationAllowed
```

`get()`-only Properties werden von Spring Data JDBC nicht persistiert; `username` ist der Präzedenzfall.

- [ ] **Step 5: Test laufen lassen und grün sehen**

Run: `cd core && ./mvnw test -Dtest=UserTest`
Expected: PASS (3 Tests)

- [ ] **Step 6: Failing Test für Default und Roundtrip schreiben**

An `UserRepositoryTest` anhängen (Import `io.kotest.matchers.shouldBe` ist schon da):

```kotlin
    @Test
    fun `stores no community-creation clearance by default and round-trips it`() {
        val saved = repository.save(User(githubId = 5150L, githubLogin = "newcomer"))
        saved.communityCreationAllowed shouldBe false

        val cleared = repository.save(saved.copy(communityCreationAllowed = true))

        repository.findByGithubId(5150L)!!.communityCreationAllowed shouldBe true
        cleared.mayCreateCommunities shouldBe true
    }
```

- [ ] **Step 7: Test laufen lassen**

Run: `cd core && ./mvnw test -Dtest=UserRepositoryTest`
Expected: PASS. Schlägt er mit „column community_creation_allowed does not exist" fehl, hat Flyway die neue Migration nicht gesehen — Dateinamen und Ordner prüfen.

- [ ] **Step 8: Commit**

```bash
git add core/src/main/resources/db/migration/iam/V2__add_community_creation_allowed.sql \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/User.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/UserTest.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/UserRepositoryTest.kt
git commit -m "feat(iam): store a per-user community-creation clearance

The column starts at FALSE for existing rows and newcomers alike: creating
communities becomes a privilege a super-admin grants, with no grandfathering.

The stored clearance and the effective permission are deliberately two names.
is_super_admin feeds only the latter, and one name for both would invite
reading the raw column where the effective answer is meant.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Port `UserQuery.mayCreateCommunities`

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/UserQuery.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserQueryService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserQueryServiceTest.kt`

**Interfaces:**
- Consumes: `User.mayCreateCommunities` (Task 1).
- Produces: `UserQuery.mayCreateCommunities(id: UUID): Boolean` — die Methode, die das `community`-Modul in Task 3 aufruft. Unbekannte id → `false`.

- [ ] **Step 1: Failing Test schreiben**

An `UserQueryServiceTest` anhängen:

```kotlin
    @Test
    fun `answers the effective community-creation permission and defaults to false`() {
        val plain = repository.save(User(githubId = 301L, githubLogin = "plain"))
        val cleared = repository.save(
            User(githubId = 302L, githubLogin = "cleared", communityCreationAllowed = true)
        )
        val boss = repository.save(User(githubId = 303L, githubLogin = "boss", isSuperAdmin = true))

        query.mayCreateCommunities(plain.id!!) shouldBe false
        query.mayCreateCommunities(cleared.id!!) shouldBe true
        query.mayCreateCommunities(boss.id!!) shouldBe true
        query.mayCreateCommunities(UUID.randomUUID()) shouldBe false
    }
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=UserQueryServiceTest`
Expected: Kompilierfehler — `mayCreateCommunities` ist kein Member von `UserQuery`.

- [ ] **Step 3: Port erweitern**

In `UserQuery.kt`:

```kotlin
    /**
     * Effective permission to create communities: the stored clearance, or super-admin.
     * Read live and never from [AuthenticatedUser] — the principal is JDK-serialized into the
     * session, so a clearance granted after sign-in would not be visible there. Unknown id: false.
     */
    fun mayCreateCommunities(id: UUID): Boolean
```

In `UserQueryService.kt`:

```kotlin
    @Transactional(readOnly = true)
    override fun mayCreateCommunities(id: UUID): Boolean =
        repository.findByIdOrNull(id)?.mayCreateCommunities ?: false
```

- [ ] **Step 4: Test laufen lassen und grün sehen**

Run: `cd core && ./mvnw test -Dtest=UserQueryServiceTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/UserQuery.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserQueryService.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/UserQueryServiceTest.kt
git commit -m "feat(iam): expose the community-creation permission as a query port

Other modules must not combine is_super_admin with the stored clearance
themselves, and they must not read either from the session principal. One port
method answers the whole question against the current row.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Durchsetzung an `POST /api/communities`

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityExceptions.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityExceptionHandler.kt:16-17`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityControllerTest.kt`

**Interfaces:**
- Consumes: `UserQuery.mayCreateCommunities(id)` (Task 2).
- Produces: `POST /api/communities` antwortet `403` ohne Berechtigung. Nichts Späteres baut darauf auf.

- [ ] **Step 1: Failing Tests schreiben**

In `CommunityControllerTest` das MockkBean ergänzen:

```kotlin
    @MockkBean lateinit var users: org.unividuell.countdown.core.iam.UserQuery
```

Die beiden bestehenden `POST`-Tests brauchen jetzt einen Stub — in `POST creates a community` und `POST surfaces slug conflict as 409` jeweils als erste Zeile:

```kotlin
        every { users.mayCreateCommunities(uid) } returns true
```

Dazu die neuen Tests:

```kotlin
    @Test
    fun `POST is forbidden without a community-creation clearance`() {
        every { users.mayCreateCommunities(uid) } returns false
        mockMvc.post("/api/communities") {
            with(principalFor()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Team A"}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `POST reads the clearance live rather than from the session principal`() {
        // The principal carries no clearance; the live answer does. Reading the principal
        // instead would 403 here — which is exactly the regression this test guards.
        every { users.mayCreateCommunities(uid) } returns true
        every { communityService.create(uid, "Team A") } returns community("team-a")
        mockMvc.post("/api/communities") {
            with(principalFor(superAdmin = false)); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Team A"}"""
        }.andExpect { status { isCreated() } }
    }
```

- [ ] **Step 2: Tests laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=CommunityControllerTest`
Expected: `POST is forbidden…` schlägt fehl mit `201` statt `403`.

- [ ] **Step 3: Exception und Mapping hinzufügen**

An `CommunityExceptions.kt` anhängen:

```kotlin
/** Caller is not cleared to create communities → 403. */
class CommunityCreationNotAllowedException(message: String = "Not allowed to create communities") : RuntimeException(message)
```

In `CommunityExceptionHandler.kt` den `forbidden`-Handler erweitern:

```kotlin
    @ExceptionHandler(NotAdminException::class, CommunityCreationNotAllowedException::class)
    fun forbidden(e: RuntimeException) = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, e.message ?: "forbidden")
```

- [ ] **Step 4: Controller prüfen lassen**

In `CommunityController.kt` den Konstruktor erweitern und `create` anpassen:

```kotlin
import org.unividuell.countdown.core.iam.UserQuery
```

```kotlin
    private val memberRepo: CommunityMemberRepository,
    private val users: UserQuery,
) {
    @PostMapping
    fun create(@AuthenticationPrincipal me: AuthenticatedUser, @RequestBody body: CreateCommunityRequest): ResponseEntity<CommunityResponse> {
        if (!users.mayCreateCommunities(me.id)) throw CommunityCreationNotAllowedException()
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(communityService.create(me.id, body.name).toResponse(viewerIsAdmin = true, pendingCount = 0))
    }
```

- [ ] **Step 5: Tests laufen lassen und grün sehen**

Run: `cd core && ./mvnw test -Dtest=CommunityControllerTest`
Expected: PASS (alle Tests der Klasse)

- [ ] **Step 6: Modulgrenzen prüfen**

Run: `cd core && ./mvnw test -Dtest=ModularityTests`
Expected: PASS — `community` durfte `iam` schon vorher konsumieren, es entsteht keine neue Kante.

- [ ] **Step 7: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityExceptions.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityExceptionHandler.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityController.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityControllerTest.kt
git commit -m "feat(community): require a clearance to create a community

This is the real gate; everything the frontend hides is only UX. The check
asks the query port rather than the principal, so a clearance granted after
sign-in takes effect without a re-login.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `/api/me` liest frisch und trägt die Berechtigung

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/IamExceptions.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserProfileService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/IamExceptionHandler.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserControllerTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserProfileServiceTest.kt`

**Interfaces:**
- Consumes: `User.mayCreateCommunities` (Task 1).
- Produces: `UserProfileService.current(userId: UUID): User` (wirft `StaleSessionException`, wenn die Zeile fehlt) und `MeResponse.mayCreateCommunities: Boolean` — Letzteres liest das Frontend in Task 8.

- [ ] **Step 1: Failing Tests schreiben**

In `UserControllerTest` die Helper-Funktion um das neue Feld erweitern und einen `current`-Stub für alle `/api/me`-Tests setzen. `user()` wird zu:

```kotlin
    private fun user(
        isSuperAdmin: Boolean = false,
        displayName: String? = null,
        communityCreationAllowed: Boolean = false,
    ) = User(
        id = uid, githubId = 1L, githubLogin = "octocat", githubName = "The Octocat",
        email = "cat@example.com", displayName = displayName, isSuperAdmin = isSuperAdmin,
        communityCreationAllowed = communityCreationAllowed,
    )
```

In den drei bestehenden `GET me`-Tests (`returns the current user with computed username`, `sets the XSRF-TOKEN cookie`, und `super-admin path forbidden` braucht keinen) jeweils vor dem Request:

```kotlin
        every { profileService.current(uid) } returns user(displayName = "Mr. Custom")
```

(im Cookie-Test entsprechend `returns user()`).

Dazu die neuen Tests:

```kotlin
    @Test
    fun `GET me reports the clearance from the row, not from the session principal`() {
        // The principal was serialized into the session without a clearance; the row has one.
        every { profileService.current(uid) } returns user(communityCreationAllowed = true)

        mockMvc.get("/api/me") {
            with(principalFor(user(communityCreationAllowed = false)))
        }.andExpect {
            status { isOk() }
            jsonPath("$.mayCreateCommunities") { value(true) }
        }
    }

    @Test
    fun `GET me reports a super-admin as allowed to create communities`() {
        every { profileService.current(uid) } returns user(isSuperAdmin = true)

        mockMvc.get("/api/me") { with(principalFor(user(isSuperAdmin = true))) }
            .andExpect {
                status { isOk() }
                jsonPath("$.mayCreateCommunities") { value(true) }
            }
    }

    @Test
    fun `GET me returns 401 when the session outlived its user row`() {
        every { profileService.current(uid) } throws
                StaleSessionException("user $uid from the session no longer exists")

        mockMvc.get("/api/me") { with(principalFor(user())) }
            .andExpect { status { isUnauthorized() } }
    }
```

Import ergänzen: `import org.unividuell.countdown.core.iam.internal.StaleSessionException`.

- [ ] **Step 2: Tests laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=UserControllerTest`
Expected: Kompilierfehler — `profileService.current` und `StaleSessionException` existieren nicht.

- [ ] **Step 3: Exceptions anlegen**

Neue Datei `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/IamExceptions.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal

/**
 * The session carries a principal whose user row is gone → 401. The SPA's 401 handler drops the
 * local auth state and routes to login, which is exactly the right outcome for a dead session.
 */
class StaleSessionException(message: String) : RuntimeException(message)

/** No user with that id → 404. */
class UserNotFoundException(message: String) : RuntimeException(message)
```

- [ ] **Step 4: Handler erweitern**

In `IamExceptionHandler.kt`:

```kotlin
    @ExceptionHandler(StaleSessionException::class)
    fun unauthorized(e: StaleSessionException) = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, e.message ?: "unauthorized")

    @ExceptionHandler(UserNotFoundException::class)
    fun notFound(e: UserNotFoundException) = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message ?: "not found")
```

- [ ] **Step 5: Lesepfad im Service ergänzen**

In `UserProfileService.kt`:

```kotlin
    /**
     * The caller's own row, read fresh. `GET /api/me` must not answer from the session principal:
     * it is JDK-serialized at login and never refreshed, so both a granted clearance and an
     * updated display name would be stale until the next sign-in.
     */
    @Transactional(readOnly = true)
    fun current(userId: UUID): User =
        repository.findByIdOrNull(userId)
            ?: throw StaleSessionException("user $userId from the session no longer exists")
```

- [ ] **Step 6: Controller und DTO anpassen**

In `UserController.kt`:

```kotlin
data class MeResponse(
    val id: UUID,
    val username: String,
    val githubLogin: String,
    val githubName: String?,
    val email: String?,
    val bgColorHex: String?,
    val isSuperAdmin: Boolean,
    val mayCreateCommunities: Boolean,
    val createdAt: Instant?,
)
```

```kotlin
private fun User.toMeResponse() = MeResponse(
    id = id!!, username = username, githubLogin = githubLogin, githubName = githubName,
    email = email, bgColorHex = bgColorHex, isSuperAdmin = isSuperAdmin,
    mayCreateCommunities = mayCreateCommunities, createdAt = createdAt,
)
```

```kotlin
    @GetMapping
    fun me(@AuthenticationPrincipal principal: CountdownOAuth2User): MeResponse =
        profileService.current(principal.user.id!!).toMeResponse()
```

- [ ] **Step 7: Failing Test für `current` im Service schreiben**

An `UserProfileServiceTest` anhängen. Die Datei hat `service` und `repository` als echte Beans und importiert `shouldThrow` schon:

```kotlin
    @Test
    fun `current returns the stored row and rejects a vanished user`() {
        val saved = repository.save(User(githubId = 909L, githubLogin = "octocat"))

        service.current(saved.id!!).githubLogin shouldBe "octocat"
        shouldThrow<StaleSessionException> { service.current(UUID.randomUUID()) }
    }
```

Import ergänzen: `import org.unividuell.countdown.core.iam.internal.StaleSessionException`.

- [ ] **Step 8: Alle Tests laufen lassen und grün sehen**

Run: `cd core && ./mvnw test -Dtest='UserControllerTest,UserProfileServiceTest'`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/IamExceptions.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserProfileService.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/IamExceptionHandler.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserController.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/UserControllerTest.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/UserProfileServiceTest.kt
git commit -m "fix(iam): answer GET /api/me from the row instead of the session

The principal is JDK-serialized at login and never refreshed, so a PATCH
/api/me followed by a reload already returned the stale display name. The same
path now has to carry the community-creation clearance, where staleness would
mean a freshly cleared user still sees no way to create anything.

A session whose user row is gone is a dead session, so it answers 401 and lets
the SPA's existing 401 handler route to login.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `SuperAdminUserController` → `SuperAdminRosterController`

**Files:**
- Rename: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserController.kt` → `SuperAdminRosterController.kt`
- Rename: `core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserControllerTest.kt` → `SuperAdminRosterControllerTest.kt`

**Interfaces:**
- Consumes: nichts.
- Produces: der Name `SuperAdminUserController` ist frei für Task 6. Der Endpoint `/api/super-admin/super-admins` bleibt unverändert.

- [ ] **Step 1: Dateien und Klassen umbenennen**

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/community-creation-permissions-6cf634
git mv core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserController.kt \
       core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminRosterController.kt
git mv core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserControllerTest.kt \
       core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminRosterControllerTest.kt
```

In `SuperAdminRosterController.kt` die Klassenzeile ändern zu:

```kotlin
class SuperAdminRosterController(private val roster: SuperAdminRosterService) {
```

In `SuperAdminRosterControllerTest.kt`:

```kotlin
class SuperAdminRosterControllerTest(@Autowired val mockMvc: MockMvc) {
```

- [ ] **Step 2: Tests laufen lassen und grün sehen**

Run: `cd core && ./mvnw test -Dtest=SuperAdminRosterControllerTest`
Expected: PASS (2 Tests) — reine Umbenennung, das Verhalten ändert sich nicht.

- [ ] **Step 3: Commit**

```bash
git add -A core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/ \
           core/src/test/kotlin/org/unividuell/countdown/core/iam/
git commit -m "refactor(iam): name the roster controller after what it serves

It answers /api/super-admin/super-admins from SuperAdminRosterService, so
SuperAdminUserController pointed at the wrong thing — and the name is needed
for the actual user administration that follows.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `GET /api/super-admin/users` und `/{id}`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserService.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserServiceTest.kt` (neu)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserControllerTest.kt` (neu)

**Interfaces:**
- Consumes: `User.communityCreationAllowed` (Task 1), `UserNotFoundException` (Task 4), der freie Klassenname (Task 5).
- Produces: `SuperAdminUserListEntry`, `SuperAdminUserDetail`, `SuperAdminUserService.list()`, `.detail(id)`. Task 7 hängt `setCommunityCreation` an denselben Service; Task 8 spiegelt die DTOs im Frontend.

- [ ] **Step 1: Failing Service-Test schreiben**

Neue Datei `core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserServiceTest.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.SuperAdminUserService
import org.unividuell.countdown.core.iam.internal.UserNotFoundException
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class SuperAdminUserServiceTest(
    @Autowired val service: SuperAdminUserService,
    @Autowired val repository: UserRepository,
) {

    @Test
    fun `lists users by name and reports the raw clearance`() {
        repository.save(User(githubId = 401L, githubLogin = "zoe", displayName = "Zoe"))
        repository.save(
            User(githubId = 402L, githubLogin = "adam", displayName = "Adam", communityCreationAllowed = true)
        )
        // Super-admin without a stored clearance: the list must show the raw column, so false.
        repository.save(User(githubId = 403L, githubLogin = "boss", displayName = "Boss", isSuperAdmin = true))

        val names = service.list().map { it.username }
        names shouldBe listOf("Adam", "Boss", "Zoe")

        val byName = service.list().associateBy { it.username }
        byName["Adam"]!!.communityCreationAllowed shouldBe true
        byName["Boss"]!!.communityCreationAllowed shouldBe false
        byName["Boss"]!!.isSuperAdmin shouldBe true
    }

    @Test
    fun `returns a detail view and rejects an unknown id`() {
        val saved = repository.save(
            User(githubId = 404L, githubLogin = "octocat", githubName = "The Octocat", email = "cat@example.com")
        )

        val detail = service.detail(saved.id!!)
        detail.githubLogin shouldBe "octocat"
        detail.email shouldBe "cat@example.com"
        detail.communityCreationAllowed shouldBe false

        shouldThrow<UserNotFoundException> { service.detail(UUID.randomUUID()) }
    }
}
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=SuperAdminUserServiceTest`
Expected: Kompilierfehler — `SuperAdminUserService` existiert nicht.

- [ ] **Step 3: Service und DTOs schreiben**

Neue Datei `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserService.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.iam.User
import java.time.Instant
import java.util.UUID

/**
 * Rows carry the raw `community_creation_allowed`, never the effective permission: the toggle in
 * the UI has to show what is stored. A super-admin may create communities regardless, which the
 * `isSuperAdmin` field lets the caller render instead of conflating the two.
 */
data class SuperAdminUserListEntry(
    val userId: UUID,
    val username: String,
    val githubLogin: String,
    val isSuperAdmin: Boolean,
    val communityCreationAllowed: Boolean,
    val createdAt: Instant?,
)

data class SuperAdminUserDetail(
    val userId: UUID,
    val username: String,
    val githubLogin: String,
    val githubName: String?,
    val displayName: String?,
    val email: String?,
    val bgColorHex: String?,
    val isSuperAdmin: Boolean,
    val communityCreationAllowed: Boolean,
    val createdAt: Instant?,
    val updatedAt: Instant?,
)

@Service
class SuperAdminUserService(private val users: UserRepository) {

    @Transactional(readOnly = true)
    fun list(): List<SuperAdminUserListEntry> =
        users.findAll().map { it.toListEntry() }.sortedBy { it.username.lowercase() }

    @Transactional(readOnly = true)
    fun detail(id: UUID): SuperAdminUserDetail = load(id).toDetail()

    private fun load(id: UUID): User =
        users.findByIdOrNull(id) ?: throw UserNotFoundException("user $id not found")

    private fun User.toListEntry() = SuperAdminUserListEntry(
        userId = id!!, username = username, githubLogin = githubLogin,
        isSuperAdmin = isSuperAdmin, communityCreationAllowed = communityCreationAllowed,
        createdAt = createdAt,
    )

    private fun User.toDetail() = SuperAdminUserDetail(
        userId = id!!, username = username, githubLogin = githubLogin, githubName = githubName,
        displayName = displayName, email = email, bgColorHex = bgColorHex,
        isSuperAdmin = isSuperAdmin, communityCreationAllowed = communityCreationAllowed,
        createdAt = createdAt, updatedAt = updatedAt,
    )
}
```

- [ ] **Step 4: Service-Test laufen lassen und grün sehen**

Run: `cd core && ./mvnw test -Dtest=SuperAdminUserServiceTest`
Expected: PASS

- [ ] **Step 5: Failing Controller-Test schreiben**

Neue Datei `core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserControllerTest.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.SuperAdminUserDetail
import org.unividuell.countdown.core.iam.internal.SuperAdminUserListEntry
import org.unividuell.countdown.core.iam.internal.SuperAdminUserService
import org.unividuell.countdown.core.iam.internal.UserNotFoundException
import org.unividuell.countdown.core.principalFor
import java.time.Instant

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class SuperAdminUserControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var service: SuperAdminUserService

    private val uid = TEST_USER_ID

    private fun detail(allowed: Boolean = false) = SuperAdminUserDetail(
        userId = uid, username = "Octocat", githubLogin = "octocat", githubName = "The Octocat",
        displayName = null, email = "cat@example.com", bgColorHex = null, isSuperAdmin = false,
        communityCreationAllowed = allowed,
        createdAt = Instant.parse("2026-01-01T00:00:00Z"), updatedAt = null,
    )

    @Test
    fun `listing users without auth returns 401`() {
        mockMvc.get("/api/super-admin/users").andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `listing users is forbidden for a non-super-admin`() {
        mockMvc.get("/api/super-admin/users") { with(principalFor(superAdmin = false)) }
            .andExpect { status { isForbidden() } }
    }

    @Test
    fun `lists users for a super-admin`() {
        every { service.list() } returns listOf(
            SuperAdminUserListEntry(
                userId = uid, username = "Octocat", githubLogin = "octocat",
                isSuperAdmin = false, communityCreationAllowed = true,
                createdAt = Instant.parse("2026-01-01T00:00:00Z"),
            )
        )
        mockMvc.get("/api/super-admin/users") { with(principalFor(superAdmin = true)) }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].username") { value("Octocat") }
                jsonPath("$[0].communityCreationAllowed") { value(true) }
            }
    }

    @Test
    fun `returns a user detail for a super-admin`() {
        every { service.detail(uid) } returns detail(allowed = true)
        mockMvc.get("/api/super-admin/users/$uid") { with(principalFor(superAdmin = true)) }
            .andExpect {
                status { isOk() }
                jsonPath("$.githubLogin") { value("octocat") }
                jsonPath("$.email") { value("cat@example.com") }
                jsonPath("$.communityCreationAllowed") { value(true) }
                // Present-and-null, not omitted: no NON_NULL inclusion is configured and the
                // frontend type is `string | null`.
                jsonPath("$.displayName") { isEmpty() }
            }
    }

    @Test
    fun `returns 404 for an unknown user`() {
        every { service.detail(uid) } throws UserNotFoundException("user $uid not found")
        mockMvc.get("/api/super-admin/users/$uid") { with(principalFor(superAdmin = true)) }
            .andExpect { status { isNotFound() } }
    }
}
```

- [ ] **Step 6: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=SuperAdminUserControllerTest`
Expected: die `isOk()`-Tests schlagen mit `404` fehl — den Endpoint gibt es noch nicht.

- [ ] **Step 7: Controller schreiben**

Neue Datei `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserController.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * User administration for the super-admin area.
 *
 * No authorization check and no principal parameter on purpose: the whole `/api/super-admin` tree
 * is gated centrally by `hasRole("SUPER_ADMIN")` in SecurityConfig, so anything that reaches this
 * controller is already a super-admin.
 *
 * Note: do not write the glob form of that path inside this KDoc — Kotlin block comments nest,
 * so an embedded slash-star-star opens a nested comment and leaves the file unclosed.
 */
@RestController
@RequestMapping("/api/super-admin/users")
class SuperAdminUserController(private val service: SuperAdminUserService) {

    @GetMapping
    fun users(): List<SuperAdminUserListEntry> = service.list()

    @GetMapping("/{id}")
    fun user(@PathVariable id: UUID): SuperAdminUserDetail = service.detail(id)
}
```

- [ ] **Step 8: Tests laufen lassen und grün sehen**

Run: `cd core && ./mvnw test -Dtest='SuperAdminUserControllerTest,SuperAdminUserServiceTest,ModularityTests'`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserService.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserController.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserServiceTest.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserControllerTest.kt
git commit -m "feat(iam): list and inspect users in the super-admin area

Granting a clearance needs somewhere to find the person first. Rows carry the
raw column rather than the effective permission, because the toggle has to
show what is stored — a super-admin is reported as such separately so the UI
can say why they may create communities anyway.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `PUT /api/super-admin/users/{id}/community-creation`

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserServiceTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserControllerTest.kt`

**Interfaces:**
- Consumes: `SuperAdminUserService`, `SuperAdminUserDetail` (Task 6).
- Produces: `SuperAdminUserService.setCommunityCreation(id: UUID, allowed: Boolean): SuperAdminUserDetail` und `CommunityCreationRequest(allowed: Boolean)`. Task 8 ruft den Endpoint auf.

- [ ] **Step 1: Failing Service-Test schreiben**

An `SuperAdminUserServiceTest` anhängen:

```kotlin
    @Test
    fun `grants and revokes the clearance`() {
        val saved = repository.save(User(githubId = 405L, githubLogin = "octocat"))

        service.setCommunityCreation(saved.id!!, allowed = true).communityCreationAllowed shouldBe true
        repository.findByIdOrNull(saved.id!!)!!.communityCreationAllowed shouldBe true

        service.setCommunityCreation(saved.id!!, allowed = false).communityCreationAllowed shouldBe false
        repository.findByIdOrNull(saved.id!!)!!.communityCreationAllowed shouldBe false
    }

    @Test
    fun `setting the clearance it already has does not touch updated_at`() {
        val saved = repository.save(User(githubId = 406L, githubLogin = "octocat"))
        val before = repository.findByIdOrNull(saved.id!!)!!.updatedAt

        service.setCommunityCreation(saved.id!!, allowed = false)

        repository.findByIdOrNull(saved.id!!)!!.updatedAt shouldBe before
    }

    @Test
    fun `setting the clearance rejects an unknown id`() {
        shouldThrow<UserNotFoundException> {
            service.setCommunityCreation(UUID.randomUUID(), allowed = true)
        }
    }
```

Import ergänzen: `import org.springframework.data.repository.findByIdOrNull`.

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=SuperAdminUserServiceTest`
Expected: Kompilierfehler — `setCommunityCreation` existiert nicht.

- [ ] **Step 3: Service-Methode schreiben**

In `SuperAdminUserService.kt` nach `detail`:

```kotlin
    /**
     * Idempotent: setting the clearance a user already has returns the current state without an
     * UPDATE, so a repeated PUT does not churn `updated_at`.
     */
    @Transactional
    fun setCommunityCreation(id: UUID, allowed: Boolean): SuperAdminUserDetail {
        val user = load(id)
        if (user.communityCreationAllowed == allowed) return user.toDetail()
        return users.save(
            user.copy(communityCreationAllowed = allowed, updatedAt = Instant.now())
        ).toDetail()
    }
```

- [ ] **Step 4: Service-Test laufen lassen und grün sehen**

Run: `cd core && ./mvnw test -Dtest=SuperAdminUserServiceTest`
Expected: PASS

- [ ] **Step 5: Failing Controller-Test schreiben**

An `SuperAdminUserControllerTest` anhängen:

```kotlin
    @Test
    fun `grants the clearance for a super-admin`() {
        every { service.setCommunityCreation(uid, true) } returns detail(allowed = true)

        mockMvc.put("/api/super-admin/users/$uid/community-creation") {
            with(principalFor(superAdmin = true)); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"allowed":true}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.communityCreationAllowed") { value(true) }
        }
    }

    @Test
    fun `granting the clearance without a CSRF token is rejected`() {
        mockMvc.put("/api/super-admin/users/$uid/community-creation") {
            with(principalFor(superAdmin = true))
            contentType = MediaType.APPLICATION_JSON
            content = """{"allowed":true}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `granting the clearance is forbidden for a non-super-admin`() {
        mockMvc.put("/api/super-admin/users/$uid/community-creation") {
            with(principalFor(superAdmin = false)); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"allowed":true}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `granting the clearance for an unknown user returns 404`() {
        every { service.setCommunityCreation(uid, true) } throws UserNotFoundException("user $uid not found")

        mockMvc.put("/api/super-admin/users/$uid/community-creation") {
            with(principalFor(superAdmin = true)); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"allowed":true}"""
        }.andExpect { status { isNotFound() } }
    }
```

Imports ergänzen:

```kotlin
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.put
```

- [ ] **Step 6: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=SuperAdminUserControllerTest`
Expected: `grants the clearance for a super-admin` schlägt mit `404`/`405` fehl.

- [ ] **Step 7: Endpoint schreiben**

In `SuperAdminUserController.kt` das Request-DTO und die Methode ergänzen, Imports `PutMapping` und `RequestBody`:

```kotlin
/** Full desired state of the clearance, so a repeated call is idempotent. */
data class CommunityCreationRequest(val allowed: Boolean)
```

```kotlin
    @PutMapping("/{id}/community-creation")
    fun setCommunityCreation(
        @PathVariable id: UUID,
        @RequestBody body: CommunityCreationRequest,
    ): SuperAdminUserDetail = service.setCommunityCreation(id, body.allowed)
```

Eigene Sub-Ressource statt `PATCH /users/{id}`: der Endpoint kann so nicht unbemerkt zum allgemeinen Profil-Editor auswachsen.

- [ ] **Step 8: Tests laufen lassen und grün sehen**

Run: `cd core && ./mvnw test -Dtest='SuperAdminUserControllerTest,SuperAdminUserServiceTest'`
Expected: PASS

- [ ] **Step 9: Voller Backend-Lauf**

Run: `cd core && ./mvnw test`
Expected: PASS — insbesondere `ModularityTests` und alle in Task 3/4 angepassten Tests.

- [ ] **Step 10: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserService.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserController.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserServiceTest.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserControllerTest.kt
git commit -m "feat(iam): let a super-admin grant or revoke community creation

A dedicated sub-resource rather than PATCH /users/{id}, so the endpoint cannot
quietly grow into a general 'super-admin edits other people's profiles' door.
It takes the full desired state and returns the fresh detail, which keeps a
repeated call idempotent and lets the SPA render from server truth.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Frontend-Typen und API-Funktionen

**Files:**
- Modify: `webapp-vue/src/api/types.ts`
- Modify: `webapp-vue/src/api/superAdmin.ts`
- Test: `webapp-vue/src/api/__tests__/superAdmin.spec.ts`

**Interfaces:**
- Consumes: die Endpoints aus Task 6/7 und `MeResponse.mayCreateCommunities` aus Task 4.
- Produces: `MeResponse.mayCreateCommunities: boolean`, `SuperAdminUserListEntry`, `SuperAdminUserDetail`, `listUsers()`, `getUser(id)`, `setCommunityCreation(id, allowed)`. Tasks 11–16 nutzen das.

- [ ] **Step 1: Failing Tests schreiben**

An `webapp-vue/src/api/__tests__/superAdmin.spec.ts` anhängen und den Import oben erweitern:

```ts
import {
  getUser,
  listAllCommunities,
  listSuperAdmins,
  listUsers,
  setCommunityCreation,
} from '@/api/superAdmin'
```

```ts
  it('lists users', async () => {
    apiFetch.mockResolvedValue([
      {
        userId: 'u1',
        username: 'Alice',
        githubLogin: 'alice',
        isSuperAdmin: false,
        communityCreationAllowed: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ])
    const rows = await listUsers()
    expect(apiFetch).toHaveBeenCalledWith('/api/super-admin/users')
    expect(rows[0]!.communityCreationAllowed).toBe(true)
  })

  it('fetches one user', async () => {
    apiFetch.mockResolvedValue({ userId: 'u1', username: 'Alice' })
    await getUser('u1')
    expect(apiFetch).toHaveBeenCalledWith('/api/super-admin/users/u1')
  })

  it('puts the full desired state of the clearance', async () => {
    apiFetch.mockResolvedValue({ userId: 'u1', communityCreationAllowed: true })
    await setCommunityCreation('u1', true)
    expect(apiFetch).toHaveBeenCalledWith('/api/super-admin/users/u1/community-creation', {
      method: 'PUT',
      body: '{"allowed":true}',
    })
  })
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/api/__tests__/superAdmin.spec.ts`
Expected: FAIL — `listUsers`, `getUser`, `setCommunityCreation` sind kein Export von `@/api/superAdmin`.

- [ ] **Step 3: Typen ergänzen**

In `webapp-vue/src/api/types.ts` `MeResponse` erweitern:

```ts
export interface MeResponse {
  id: string
  username: string
  githubLogin: string
  githubName: string | null
  email: string | null
  bgColorHex: string | null
  isSuperAdmin: boolean
  /** Effective permission: the stored clearance, or super-admin. */
  mayCreateCommunities: boolean
  createdAt: string | null
}
```

Und am Ende der Datei, nach `SuperAdminUser`:

```ts
/**
 * `communityCreationAllowed` is the raw column, not the effective permission — a super-admin may
 * create communities regardless, which `isSuperAdmin` reports separately.
 */
export interface SuperAdminUserListEntry {
  userId: string
  username: string
  githubLogin: string
  isSuperAdmin: boolean
  communityCreationAllowed: boolean
  createdAt: string | null
}
export interface SuperAdminUserDetail {
  userId: string
  username: string
  githubLogin: string
  githubName: string | null
  displayName: string | null
  email: string | null
  bgColorHex: string | null
  isSuperAdmin: boolean
  communityCreationAllowed: boolean
  createdAt: string | null
  updatedAt: string | null
}
```

- [ ] **Step 4: API-Funktionen ergänzen**

`webapp-vue/src/api/superAdmin.ts` vollständig:

```ts
import { apiFetch } from '@/api/client'
import type {
  SuperAdminCommunity,
  SuperAdminUser,
  SuperAdminUserDetail,
  SuperAdminUserListEntry,
} from '@/api/types'

export const listSuperAdmins = () => apiFetch<SuperAdminUser[]>('/api/super-admin/super-admins')
export const listAllCommunities = () =>
  apiFetch<SuperAdminCommunity[]>('/api/super-admin/communities')

export const listUsers = () => apiFetch<SuperAdminUserListEntry[]>('/api/super-admin/users')
export const getUser = (id: string) =>
  apiFetch<SuperAdminUserDetail>(`/api/super-admin/users/${id}`)
export const setCommunityCreation = (id: string, allowed: boolean) =>
  apiFetch<SuperAdminUserDetail>(`/api/super-admin/users/${id}/community-creation`, {
    method: 'PUT',
    body: JSON.stringify({ allowed }),
  })
```

- [ ] **Step 5: Tests laufen lassen und grün sehen**

Run: `cd webapp-vue && pnpm vitest run src/api/__tests__/superAdmin.spec.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `cd webapp-vue && pnpm typecheck`
Expected: FAIL — bestehende Test-Fixtures bauen `MeResponse` ohne `mayCreateCommunities`. Jede gemeldete Stelle um `mayCreateCommunities: false` ergänzen (bzw. `true`, wo der Test einen berechtigten User braucht). Danach erneut laufen lassen: PASS.

- [ ] **Step 7: Voller Frontend-Lauf**

Run: `cd webapp-vue && pnpm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add webapp-vue/src/api/types.ts webapp-vue/src/api/superAdmin.ts webapp-vue/src/
git commit -m "feat(api): type the clearance and the user-administration calls

The raw column and the effective permission keep separate names on the client
too, so a list row cannot accidentally claim a super-admin holds a stored
clearance they never got.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: `ui/useAction.ts`

**Files:**
- Create: `webapp-vue/src/ui/useAction.ts`
- Test: `webapp-vue/src/ui/__tests__/useAction.spec.ts` (neu)

**Interfaces:**
- Consumes: nichts.
- Produces: `useAction(toMessage?: (e: unknown) => string)` → `{ busy: Readonly<Ref<boolean>>, error: Readonly<Ref<string | null>>, run: (fn: () => Promise<void>) => Promise<void> }`. Tasks 13 und 14 nutzen es.

- [ ] **Step 1: Failing Test schreiben**

Neue Datei `webapp-vue/src/ui/__tests__/useAction.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { useAction } from '@/ui/useAction'

/** A promise plus the handles to settle it, so a test can inspect the in-flight state. */
function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useAction', () => {
  it('marks the action busy while it is in flight and clears it after', async () => {
    const { busy, run } = useAction()
    const d = deferred()

    const call = run(() => d.promise)
    expect(busy.value).toBe(true)

    d.resolve()
    await call
    expect(busy.value).toBe(false)
  })

  it('clears busy after a rejection so the button does not stay disabled', async () => {
    const { busy, error, run } = useAction()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await run(() => Promise.reject(new Error('boom')))

    expect(busy.value).toBe(false)
    expect(error.value).toBe('Aktion fehlgeschlagen.')
  })

  it('drops a second call while one is in flight', async () => {
    const { run } = useAction()
    const d = deferred()
    const fn = vi.fn(() => d.promise)

    const first = run(fn)
    await run(fn)
    expect(fn).toHaveBeenCalledTimes(1)

    d.resolve()
    await first
  })

  it('derives the message from the error', async () => {
    const { error, run } = useAction((e) => (e instanceof Error ? `kaputt: ${e.message}` : 'egal'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await run(() => Promise.reject(new Error('409')))

    expect(error.value).toBe('kaputt: 409')
  })

  it('clears a previous error when the next call starts', async () => {
    const { error, run } = useAction()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await run(() => Promise.reject(new Error('boom')))
    expect(error.value).not.toBeNull()

    await run(() => Promise.resolve())
    expect(error.value).toBeNull()
  })
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/ui/__tests__/useAction.spec.ts`
Expected: FAIL — `@/ui/useAction` existiert nicht.

- [ ] **Step 3: Composable schreiben**

Neue Datei `webapp-vue/src/ui/useAction.ts`:

```ts
import { readonly, ref, type Ref } from 'vue'

const DEFAULT_MESSAGE = 'Aktion fehlgeschlagen.'

/**
 * Wraps a mutating call so a button can show that it is in flight.
 *
 * `busy` is cleared in a `finally`: a rejected call must not leave the button disabled forever.
 * A second `run` while one is in flight is dropped rather than queued — guarding the double click
 * is the point, and queueing would fire the same mutation twice a moment later.
 */
export function useAction(toMessage: (e: unknown) => string = () => DEFAULT_MESSAGE): {
  busy: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
  run: (fn: () => Promise<void>) => Promise<void>
} {
  const busy = ref(false)
  const error = ref<string | null>(null)

  async function run(fn: () => Promise<void>): Promise<void> {
    if (busy.value) return
    busy.value = true
    error.value = null
    try {
      await fn()
    } catch (e) {
      console.error('action failed', e)
      error.value = toMessage(e)
    } finally {
      busy.value = false
    }
  }

  return { busy: readonly(busy), error: readonly(error), run }
}
```

- [ ] **Step 4: Tests laufen lassen und grün sehen**

Run: `cd webapp-vue && pnpm vitest run src/ui/__tests__/useAction.spec.ts`
Expected: PASS (5 Tests)

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/ui/useAction.ts webapp-vue/src/ui/__tests__/useAction.spec.ts
git commit -m "feat(ui): track whether a mutating action is in flight

No button in the app currently shows that its request is running, so every one
of them stays clickable while it waits. busy clears in a finally, because a
rejected call leaving the button disabled forever would be worse than no
feedback at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: `ui/ActionButton.vue`

**Files:**
- Create: `webapp-vue/src/ui/ActionButton.vue`
- Test: `webapp-vue/src/ui/__tests__/ActionButton.spec.ts` (neu)

**Interfaces:**
- Consumes: nichts (`busy` kommt als Prop).
- Produces: `<ActionButton :busy :disabled :type>Label</ActionButton>`, Props `busy?: boolean` (Default `false`), `disabled?: boolean` (Default `false`), `type?: 'button' | 'submit'` (Default `'button'`). Der Spinner trägt `data-test="spinner"`. Tasks 13 und 14 nutzen es.

- [ ] **Step 1: Failing Test schreiben**

Neue Datei `webapp-vue/src/ui/__tests__/ActionButton.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ActionButton from '@/ui/ActionButton.vue'

describe('ActionButton', () => {
  it('keeps the label readable and shows no spinner at rest', () => {
    const w = mount(ActionButton, { slots: { default: 'Freischalten' } })

    expect(w.text()).toContain('Freischalten')
    expect(w.find('[data-test=spinner]').exists()).toBe(false)
    expect(w.attributes('disabled')).toBeUndefined()
    expect(w.attributes('aria-busy')).toBe('false')
  })

  it('reserves the icon slot on both sides so the label stays centred', () => {
    const w = mount(ActionButton, { slots: { default: 'Freischalten' } })

    // Two reserved slots at rest, and still two elements once one holds the spinner:
    // the button width and the label position must not change between states.
    expect(w.findAll('[data-test=slot]')).toHaveLength(2)
  })

  it('disables itself and shows the spinner while busy, without hiding the label', () => {
    const w = mount(ActionButton, { props: { busy: true }, slots: { default: 'Freischalten' } })

    expect(w.text()).toContain('Freischalten')
    expect(w.find('[data-test=spinner]').exists()).toBe(true)
    expect(w.attributes('disabled')).toBeDefined()
    expect(w.attributes('aria-busy')).toBe('true')
  })

  it('can be disabled independently of being busy', () => {
    const w = mount(ActionButton, { props: { disabled: true }, slots: { default: 'Erstellen' } })

    expect(w.attributes('disabled')).toBeDefined()
    expect(w.find('[data-test=spinner]').exists()).toBe(false)
  })

  it('can act as a form submit button', () => {
    const w = mount(ActionButton, { props: { type: 'submit' }, slots: { default: 'Erstellen' } })

    expect(w.attributes('type')).toBe('submit')
  })
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/ui/__tests__/ActionButton.spec.ts`
Expected: FAIL — `@/ui/ActionButton.vue` existiert nicht.

- [ ] **Step 3: Komponente schreiben**

Neue Datei `webapp-vue/src/ui/ActionButton.vue`:

```vue
<script setup lang="ts">
import IconSpinner from '~icons/lucide/loader-circle'

// cursor-pointer is explicit: Tailwind v4's preflight resets buttons to cursor:default.
withDefaults(
  defineProps<{ busy?: boolean; disabled?: boolean; type?: 'button' | 'submit' }>(),
  { busy: false, disabled: false, type: 'button' },
)
</script>

<template>
  <button
    :type="type"
    :disabled="busy || disabled"
    :aria-busy="busy"
    class="inline-flex cursor-pointer items-center justify-center gap-2 rounded border px-3 py-1.5 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:text-neutral-400 disabled:hover:bg-transparent"
  >
    <!--
      An icon-sized slot is reserved on BOTH sides in every state, so the button width never
      changes and the label stays optically centred once the leading slot holds the spinner.
      The label is only greyed out, never hidden: what is running has to stay readable.
    -->
    <span data-test="slot" class="flex size-3.5 shrink-0 items-center justify-center">
      <IconSpinner
        v-if="busy"
        data-test="spinner"
        aria-hidden="true"
        class="size-3.5 motion-safe:animate-spin motion-reduce:animate-[spin_2.4s_linear_infinite]"
      />
    </span>
    <slot />
    <span data-test="slot" class="size-3.5 shrink-0" aria-hidden="true" />
  </button>
</template>
```

Bei `prefers-reduced-motion` wird die Drehung verlangsamt statt abgeschaltet — sonst gäbe es kein Warte-Signal.

- [ ] **Step 4: Tests laufen lassen und grün sehen**

Run: `cd webapp-vue && pnpm vitest run src/ui/__tests__/ActionButton.spec.ts`
Expected: PASS (5 Tests)

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/ui/ActionButton.vue webapp-vue/src/ui/__tests__/ActionButton.spec.ts
git commit -m "feat(ui): add a button that shows its request is running

The icon slot is reserved on both sides rather than inserted on click, so
neither the button width nor the label position moves when the spinner
appears — a jump would be most visible exactly where these buttons sit, in
dropdown panels and table rows. The label stays legible and is only greyed
out; hiding it would drop the one piece of information the user needs while
waiting.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: `/super-admin` als Nav-Liste

**Files:**
- Modify: `webapp-vue/src/pages/super-admin/index.vue`
- Modify: `webapp-vue/src/pages/super-admin/communities.vue`
- Test: `webapp-vue/src/pages/super-admin/__tests__/index.spec.ts`
- Test: `webapp-vue/src/pages/super-admin/__tests__/communities.spec.ts`

**Interfaces:**
- Consumes: `listSuperAdmins` (Bestand).
- Produces: die Route `/super-admin/users` wird verlinkt (Ziel entsteht in Task 12). Nichts Späteres importiert von hier.

- [ ] **Step 1: Failing Test schreiben**

In `webapp-vue/src/pages/super-admin/__tests__/index.spec.ts` den ersten Test um die Nav-Liste erweitern (die bestehende Zeile zu `/super-admin/communities` bleibt):

```ts
    const nav = w.findAll('[data-test=nav-entry]')
    expect(nav).toHaveLength(2)
    expect(nav.map((a) => a.text())).toEqual(['Nutzer', 'Spielgemeinschaften'])
    expect(w.find('a[href="/super-admin/users"]').exists()).toBe(true)
    expect(w.find('a[href="/super-admin/communities"]').exists()).toBe(true)
```

Und ein neuer Test, dass die Nav-Liste auch dann steht, wenn die Tabelle scheitert — sie ist die Navigation des Bereichs und darf nicht an einem Ladefehler hängen:

```ts
  it('keeps the nav list usable when the roster fails to load', async () => {
    vi.spyOn(api, 'listSuperAdmins').mockRejectedValue(new Error('boom'))
    const Page = (await import('@/pages/super-admin/index.vue')).default
    const w = mount(Page)
    await flushPromises()

    expect(w.findAll('[data-test=nav-entry]')).toHaveLength(2)
    expect(w.text()).toContain('konnten nicht geladen werden')
  })
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/pages/super-admin/__tests__/index.spec.ts`
Expected: FAIL — kein Element mit `data-test="nav-entry"`.

- [ ] **Step 3: Index umbauen**

`webapp-vue/src/pages/super-admin/index.vue` — das `<script setup>` bleibt unverändert, nur das Template wird ersetzt:

```vue
<template>
  <section class="mx-auto max-w-3xl px-4 py-8">
    <h1 class="mb-4 text-xl font-semibold">Super-Admin</h1>

    <ul class="mb-8 divide-y rounded border">
      <li>
        <RouterLink
          to="/super-admin/users"
          data-test="nav-entry"
          class="flex min-h-11 items-center px-4 py-3 hover:bg-neutral-100"
        >
          Nutzer
          <IconChevron class="ml-auto size-4 text-neutral-400" />
        </RouterLink>
      </li>
      <li>
        <RouterLink
          to="/super-admin/communities"
          data-test="nav-entry"
          class="flex min-h-11 items-center px-4 py-3 hover:bg-neutral-100"
        >
          Spielgemeinschaften
          <IconChevron class="ml-auto size-4 text-neutral-400" />
        </RouterLink>
      </li>
    </ul>

    <h2 class="mb-2 font-medium">Super-Admins</h2>
    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Lade…</p>
    <p v-else-if="state === 'error'" class="text-sm text-red-600">
      Die Super-Admins konnten nicht geladen werden.
    </p>
    <table v-else class="w-full text-left text-sm">
      <thead>
        <tr class="border-b text-neutral-500">
          <th class="py-1 pr-4 font-medium">GitHub</th>
          <th class="py-1 pr-4 font-medium">Name</th>
          <th class="py-1 pr-4 font-medium">Status</th>
          <th class="py-1 font-medium">seit</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in rows" :key="u.githubLogin" data-test="super-admin-row" class="border-b">
          <td class="py-1 pr-4">
            <code>{{ u.githubLogin }}</code>
          </td>
          <td class="py-1 pr-4">{{ u.username ?? '—' }}</td>
          <td class="py-1 pr-4">{{ statusLabel(u) }}</td>
          <td class="py-1">{{ formatDate(u.createdAt) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
```

Im `<script setup>` den Icon-Import ergänzen:

```ts
import IconChevron from '~icons/lucide/chevron-right'
```

Der `vue-router`-Mock in der Spec liefert nur `RouterLink`; die Icons sind echte Komponenten und brauchen keinen Mock.

- [ ] **Step 4: Test laufen lassen und grün sehen**

Run: `cd webapp-vue && pnpm vitest run src/pages/super-admin/__tests__/index.spec.ts`
Expected: PASS

- [ ] **Step 5: Failing Test für den Back-Link schreiben**

An `webapp-vue/src/pages/super-admin/__tests__/communities.spec.ts` anhängen. Die Datei mockt `vue-router` mit `RouterLink` bereits passend:

```ts
  it('links back to the super-admin hub', async () => {
    vi.spyOn(api, 'listAllCommunities').mockResolvedValue([])
    const Page = (await import('@/pages/super-admin/communities.vue')).default
    const w = mount(Page)
    await flushPromises()

    expect(w.find('a[href="/super-admin"]').text()).toContain('Super-Admin')
  })
```

- [ ] **Step 6: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/pages/super-admin/__tests__/communities.spec.ts`
Expected: FAIL — kein `a[href="/super-admin"]`.

- [ ] **Step 7: Back-Link einbauen**

In `webapp-vue/src/pages/super-admin/communities.vue` direkt nach dem öffnenden `<section …>`:

```vue
    <RouterLink to="/super-admin" class="mb-4 inline-block text-sm text-blue-700 hover:underline">
      ← Super-Admin
    </RouterLink>
```

- [ ] **Step 8: Tests laufen lassen und grün sehen**

Run: `cd webapp-vue && pnpm vitest run src/pages/super-admin`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add webapp-vue/src/pages/super-admin/
git commit -m "refactor(super-admin): turn the landing page into a nav list

A second area makes loose buttons the wrong shape: the entries become a real
nav list, and the sub-pages get a way back now that the index is a hub rather
than the only page worth being on. The nav renders independently of the
roster table, so a failed load costs information but not navigation.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Nutzer-Liste

**Files:**
- Create: `webapp-vue/src/pages/super-admin/users/index.vue`
- Test: `webapp-vue/src/pages/super-admin/users/__tests__/index.spec.ts` (neu)

**Interfaces:**
- Consumes: `listUsers()`, `SuperAdminUserListEntry` (Task 8).
- Produces: die Route `/super-admin/users`; verlinkt `/super-admin/users/:id` (Task 13).

- [ ] **Step 1: Failing Test schreiben**

Neue Datei `webapp-vue/src/pages/super-admin/users/__tests__/index.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/superAdmin'
import type { SuperAdminUserListEntry } from '@/api/types'

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
}))

const entry = (over: Partial<SuperAdminUserListEntry> = {}): SuperAdminUserListEntry => ({
  userId: 'u1',
  username: 'Alice',
  githubLogin: 'alice',
  isSuperAdmin: false,
  communityCreationAllowed: false,
  createdAt: '2026-01-14T23:30:00Z',
  ...over,
})

describe('super-admin user list', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists users and links each row to its detail view', async () => {
    vi.spyOn(api, 'listUsers').mockResolvedValue([entry()])
    const Page = (await import('@/pages/super-admin/users/index.vue')).default
    const w = mount(Page)
    await flushPromises()

    const rows = w.findAll('[data-test=user-row]')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('Alice')
    expect(rows[0]!.text()).toContain('alice')
    expect(w.find('a[href="/super-admin/users/u1"]').exists()).toBe(true)
  })

  it('badges only a stored clearance, and never alongside super-admin', async () => {
    vi.spyOn(api, 'listUsers').mockResolvedValue([
      entry({ userId: 'u1', username: 'Plain' }),
      entry({ userId: 'u2', username: 'Cleared', communityCreationAllowed: true }),
      // A super-admin may create communities without a stored clearance. Showing both badges
      // would suggest two independent states, so only the super-admin badge appears.
      entry({ userId: 'u3', username: 'Boss', isSuperAdmin: true }),
    ])
    const Page = (await import('@/pages/super-admin/users/index.vue')).default
    const w = mount(Page)
    await flushPromises()

    const rows = w.findAll('[data-test=user-row]')
    expect(rows[0]!.find('[data-test=clearance-badge]').exists()).toBe(false)
    expect(rows[0]!.find('[data-test=super-admin-badge]').exists()).toBe(false)
    expect(rows[1]!.find('[data-test=clearance-badge]').exists()).toBe(true)
    expect(rows[2]!.find('[data-test=super-admin-badge]').exists()).toBe(true)
    expect(rows[2]!.find('[data-test=clearance-badge]').exists()).toBe(false)
  })

  it('shows an error message when the list cannot be loaded', async () => {
    vi.spyOn(api, 'listUsers').mockRejectedValue(new Error('boom'))
    const Page = (await import('@/pages/super-admin/users/index.vue')).default
    const w = mount(Page)
    await flushPromises()

    expect(w.text()).toContain('konnten nicht geladen werden')
  })
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/pages/super-admin/users/__tests__/index.spec.ts`
Expected: FAIL — die Seite existiert nicht.

- [ ] **Step 3: Seite schreiben**

Neue Datei `webapp-vue/src/pages/super-admin/users/index.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { listUsers } from '@/api/superAdmin'
import type { SuperAdminUserListEntry } from '@/api/types'

const rows = ref<SuperAdminUserListEntry[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')

onMounted(async () => {
  try {
    rows.value = await listUsers()
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 py-8">
    <RouterLink to="/super-admin" class="mb-4 inline-block text-sm text-blue-700 hover:underline">
      ← Super-Admin
    </RouterLink>
    <h1 class="mb-4 text-xl font-semibold">Nutzer</h1>

    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Lade…</p>
    <p v-else-if="state === 'error'" class="text-sm text-red-600">
      Die Nutzer konnten nicht geladen werden.
    </p>
    <p v-else-if="!rows.length" class="text-sm text-neutral-500">Noch keine Nutzer.</p>
    <ul v-else class="divide-y rounded border">
      <li v-for="u in rows" :key="u.userId" data-test="user-row">
        <RouterLink
          :to="`/super-admin/users/${u.userId}`"
          class="flex min-h-11 items-center gap-3 px-4 py-3 hover:bg-neutral-100"
        >
          <span class="min-w-0">
            <span class="block truncate">{{ u.username }}</span>
            <code class="block truncate text-xs text-neutral-500">@{{ u.githubLogin }}</code>
          </span>
          <span class="ml-auto flex shrink-0 gap-1">
            <!-- Super-admin subsumes the clearance, so the two badges are exclusive. -->
            <span
              v-if="u.isSuperAdmin"
              data-test="super-admin-badge"
              class="rounded bg-blue-600 px-1.5 text-xs text-white"
            >
              Super-Admin
            </span>
            <span
              v-else-if="u.communityCreationAllowed"
              data-test="clearance-badge"
              class="rounded bg-emerald-100 px-1.5 text-xs text-emerald-800"
            >
              Erstellen erlaubt
            </span>
          </span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
```

- [ ] **Step 4: Tests laufen lassen und grün sehen**

Run: `cd webapp-vue && pnpm vitest run src/pages/super-admin/users/__tests__/index.spec.ts`
Expected: PASS (3 Tests)

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/pages/super-admin/users/
git commit -m "feat(super-admin): list users as a mobile-first row list

A row list rather than a wide table, because the audience is on phones. Only a
stored clearance earns a badge — false is the silent majority and labelling it
would bury the handful of rows that matter. A super-admin gets that badge
alone, since it already implies the permission.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Nutzer-Detail mit der Aktion

**Files:**
- Create: `webapp-vue/src/pages/super-admin/users/[id].vue`
- Test: `webapp-vue/src/pages/super-admin/users/__tests__/id.spec.ts` (neu)

**Interfaces:**
- Consumes: `getUser`, `setCommunityCreation`, `SuperAdminUserDetail` (Task 8); `useAction` (Task 9); `ActionButton` (Task 10).
- Produces: die Route `/super-admin/users/:id`. Nichts Späteres baut darauf auf.

- [ ] **Step 1: Failing Test schreiben**

Neue Datei `webapp-vue/src/pages/super-admin/users/__tests__/id.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/superAdmin'
import type { SuperAdminUserDetail } from '@/api/types'

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
  useRoute: () => ({ params: { id: 'u1' } }),
}))

const detail = (over: Partial<SuperAdminUserDetail> = {}): SuperAdminUserDetail => ({
  userId: 'u1',
  username: 'Alice',
  githubLogin: 'alice',
  githubName: 'Alice A.',
  displayName: null,
  email: 'alice@example.com',
  bgColorHex: null,
  isSuperAdmin: false,
  communityCreationAllowed: false,
  createdAt: '2026-01-14T23:30:00Z',
  updatedAt: null,
  ...over,
})

async function page() {
  const Page = (await import('@/pages/super-admin/users/[id].vue')).default
  const w = mount(Page)
  await flushPromises()
  return w
}

describe('super-admin user detail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the profile facts of the routed user', async () => {
    vi.spyOn(api, 'getUser').mockResolvedValue(detail())
    const w = await page()

    expect(api.getUser).toHaveBeenCalledWith('u1')
    expect(w.text()).toContain('Alice')
    expect(w.text()).toContain('alice@example.com')
    expect(w.text()).toContain('15.01.2026')
  })

  it('grants the clearance and adopts the server response', async () => {
    vi.spyOn(api, 'getUser').mockResolvedValue(detail())
    vi.spyOn(api, 'setCommunityCreation').mockResolvedValue(
      detail({ communityCreationAllowed: true }),
    )
    const w = await page()

    await w.find('[data-test=toggle-clearance]').trigger('click')
    await flushPromises()

    expect(api.setCommunityCreation).toHaveBeenCalledWith('u1', true)
    expect(w.find('[data-test=toggle-clearance]').text()).toContain('entziehen')
  })

  it('revokes the clearance', async () => {
    vi.spyOn(api, 'getUser').mockResolvedValue(detail({ communityCreationAllowed: true }))
    vi.spyOn(api, 'setCommunityCreation').mockResolvedValue(
      detail({ communityCreationAllowed: false }),
    )
    const w = await page()

    await w.find('[data-test=toggle-clearance]').trigger('click')
    await flushPromises()

    expect(api.setCommunityCreation).toHaveBeenCalledWith('u1', false)
  })

  it('keeps the old state and reports the failure when the call fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(api, 'getUser').mockResolvedValue(detail())
    vi.spyOn(api, 'setCommunityCreation').mockRejectedValue(new Error('boom'))
    const w = await page()

    await w.find('[data-test=toggle-clearance]').trigger('click')
    await flushPromises()

    expect(w.text()).toContain('Freischaltung konnte nicht geändert werden')
    expect(w.find('[data-test=toggle-clearance]').text()).toContain('Freischalten')
  })

  it('disables the action for a super-admin and says why', async () => {
    vi.spyOn(api, 'getUser').mockResolvedValue(detail({ isSuperAdmin: true }))
    const w = await page()

    expect(w.find('[data-test=toggle-clearance]').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Super-Admins dürfen immer erstellen')
  })

  it('shows an error message when the user cannot be loaded', async () => {
    vi.spyOn(api, 'getUser').mockRejectedValue(new Error('boom'))
    const w = await page()

    expect(w.text()).toContain('konnte nicht geladen werden')
  })
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/pages/super-admin/users/__tests__/id.spec.ts`
Expected: FAIL — die Seite existiert nicht.

- [ ] **Step 3: Seite schreiben**

Neue Datei `webapp-vue/src/pages/super-admin/users/[id].vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { DateTime } from 'luxon'
import ActionButton from '@/ui/ActionButton.vue'
import { useAction } from '@/ui/useAction'
import { getUser, setCommunityCreation } from '@/api/superAdmin'
import type { SuperAdminUserDetail } from '@/api/types'

const route = useRoute()
const id = String(route.params.id)

const user = ref<SuperAdminUserDetail | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const { busy, error, run } = useAction(() => 'Die Freischaltung konnte nicht geändert werden.')

// No community context here, so the app's default zone rather than the browser's.
function formatDate(iso: string | null): string {
  return iso ? DateTime.fromISO(iso, { zone: 'Europe/Berlin' }).toFormat('dd.MM.yyyy') : '—'
}

const allowed = computed(() => user.value?.communityCreationAllowed ?? false)

// Toggling the column would have no visible effect for a super-admin, and a control that does
// nothing is worse than none — so it is disabled and the reason is spelled out.
const locked = computed(() => user.value?.isSuperAdmin ?? false)

async function toggle(): Promise<void> {
  // No optimistic UI: adopt the server's answer, or keep the state we had.
  await run(async () => {
    user.value = await setCommunityCreation(id, !allowed.value)
  })
}

onMounted(async () => {
  try {
    user.value = await getUser(id)
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 py-8">
    <RouterLink
      to="/super-admin/users"
      class="mb-4 inline-block text-sm text-blue-700 hover:underline"
    >
      ← Nutzer
    </RouterLink>

    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Lade…</p>
    <p v-else-if="state === 'error' || !user" class="text-sm text-red-600">
      Der Nutzer konnte nicht geladen werden.
    </p>
    <template v-else>
      <h1 class="text-xl font-semibold">{{ user.username }}</h1>
      <code class="mb-6 block text-sm text-neutral-500">@{{ user.githubLogin }}</code>

      <dl class="mb-8 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt class="text-neutral-500">GitHub-Login</dt>
        <dd><code>{{ user.githubLogin }}</code></dd>
        <dt class="text-neutral-500">GitHub-Name</dt>
        <dd>{{ user.githubName ?? '—' }}</dd>
        <dt class="text-neutral-500">Anzeigename</dt>
        <dd>{{ user.displayName ?? '—' }}</dd>
        <dt class="text-neutral-500">E-Mail</dt>
        <dd>{{ user.email ?? '—' }}</dd>
        <dt class="text-neutral-500">Farbe</dt>
        <dd>
          <span v-if="user.bgColorHex" class="flex items-center gap-2">
            <span
              class="inline-block size-4 rounded border"
              :style="{ backgroundColor: user.bgColorHex }"
            />
            <code>{{ user.bgColorHex }}</code>
          </span>
          <span v-else>—</span>
        </dd>
        <dt class="text-neutral-500">Mitglied seit</dt>
        <dd>{{ formatDate(user.createdAt) }}</dd>
        <dt class="text-neutral-500">zuletzt geändert</dt>
        <dd>{{ formatDate(user.updatedAt) }}</dd>
      </dl>

      <h2 class="mb-1 font-medium">Spielgemeinschaften erstellen</h2>
      <p class="mb-3 text-sm text-neutral-600">
        <span v-if="locked">Super-Admins dürfen immer erstellen.</span>
        <span v-else-if="allowed">Dieser Nutzer darf eigene Spielgemeinschaften erstellen.</span>
        <span v-else>Dieser Nutzer darf keine eigenen Spielgemeinschaften erstellen.</span>
      </p>
      <ActionButton
        data-test="toggle-clearance"
        :busy="busy"
        :disabled="locked"
        @click="toggle"
      >
        {{ allowed ? 'Berechtigung entziehen' : 'Freischalten' }}
      </ActionButton>
      <p v-if="error" data-test="toggle-error" class="mt-3 text-sm text-red-600">{{ error }}</p>
    </template>
  </section>
</template>
```

- [ ] **Step 4: Tests laufen lassen und grün sehen**

Run: `cd webapp-vue && pnpm vitest run src/pages/super-admin/users/__tests__/id.spec.ts`
Expected: PASS (6 Tests)

- [ ] **Step 5: Commit**

```bash
git add 'webapp-vue/src/pages/super-admin/users/[id].vue' \
        webapp-vue/src/pages/super-admin/users/__tests__/id.spec.ts
git commit -m "feat(super-admin): grant community creation from the user detail

The page adopts the server's answer instead of guessing locally, so a failed
call leaves the visible state matching the stored one. For a super-admin the
control is disabled with the reason spelled out — flipping the column would
change nothing they can see.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Guard und `communities/new.vue`

**Files:**
- Create: `webapp-vue/src/communities/useCommunityCreationGuard.ts`
- Modify: `webapp-vue/src/pages/communities/new.vue`
- Test: `webapp-vue/src/communities/__tests__/useCommunityCreationGuard.spec.ts` (neu)
- Test: `webapp-vue/src/pages/communities/__tests__/new.spec.ts`

**Interfaces:**
- Consumes: `MeResponse.mayCreateCommunities` (Task 8), `useAction` (Task 9), `ActionButton` (Task 10).
- Produces: `useCommunityCreationGuard(): void`. Nichts Späteres importiert es.

- [ ] **Step 1: Failing Test für den Guard schreiben**

Der Auth-Zustand in `useAuth` ist ein Modul-Singleton hinter `readonly()` und lässt sich nicht direkt schreiben. Er wird deshalb wie in der App über `bootstrap()` gesetzt, mit gemocktem `apiFetch` — `_resetAuthState()` räumt zwischen den Tests auf.

Neue Datei `webapp-vue/src/communities/__tests__/useCommunityCreationGuard.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import * as client from '@/api/client'
import { useCommunityCreationGuard } from '@/communities/useCommunityCreationGuard'
import { useAuth, _resetAuthState } from '@/auth/useAuth'

const replace = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof client>()),
  apiFetch: vi.fn(),
}))
const apiFetch = vi.mocked(client.apiFetch)

const Host = defineComponent({
  setup() {
    useCommunityCreationGuard()
    return () => null
  },
})

async function signIn(mayCreateCommunities: boolean): Promise<void> {
  apiFetch.mockResolvedValue({
    id: 'u1',
    username: 'Alice',
    githubLogin: 'alice',
    githubName: null,
    email: null,
    bgColorHex: null,
    isSuperAdmin: false,
    mayCreateCommunities,
    createdAt: null,
  })
  await useAuth().bootstrap()
}

describe('useCommunityCreationGuard', () => {
  beforeEach(() => {
    replace.mockReset()
    apiFetch.mockReset()
    _resetAuthState()
  })

  it('redirects a viewer without the clearance', async () => {
    await signIn(false)
    mount(Host)
    expect(replace).toHaveBeenCalledWith('/communities')
  })

  it('lets a cleared viewer through', async () => {
    await signIn(true)
    mount(Host)
    expect(replace).not.toHaveBeenCalled()
  })

  it('redirects when there is no session at all', async () => {
    mount(Host)
    expect(replace).toHaveBeenCalledWith('/communities')
  })
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/communities/__tests__/useCommunityCreationGuard.spec.ts`
Expected: FAIL — `@/communities/useCommunityCreationGuard` existiert nicht.

- [ ] **Step 3: Guard schreiben**

Neue Datei `webapp-vue/src/communities/useCommunityCreationGuard.ts`:

```ts
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/auth/useAuth'

/**
 * Redirects away when the viewer is not cleared to create communities. The backend 403 on
 * `POST /api/communities` is the real gate; this only keeps the URL from being a dead end.
 * `bootstrap()` resolves before the app mounts, so the flag is available in `onMounted`.
 */
export function useCommunityCreationGuard(): void {
  const router = useRouter()
  const { user } = useAuth()
  onMounted(() => {
    if (!user.value?.mayCreateCommunities) void router.replace('/communities')
  })
}
```

- [ ] **Step 4: Test laufen lassen und grün sehen**

Run: `cd webapp-vue && pnpm vitest run src/communities/__tests__/useCommunityCreationGuard.spec.ts`
Expected: PASS

- [ ] **Step 5: Failing Test für die Seite schreiben**

An `webapp-vue/src/pages/communities/__tests__/new.spec.ts` anhängen (bestehenden Mock-Aufbau der Datei übernehmen):

```ts
  it('guards the route and shows the submit button as busy while creating', async () => {
    // Deferred so the in-flight state is observable before the call settles.
    let resolve!: (c: unknown) => void
    vi.spyOn(api, 'createCommunity').mockReturnValue(
      new Promise((res) => {
        resolve = res
      }) as ReturnType<typeof api.createCommunity>,
    )
    const w = await mountNewPage()

    await w.find('input#name').setValue('Team A')
    await w.find('form').trigger('submit')

    const button = w.find('button[type=submit]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.find('[data-test=spinner]').exists()).toBe(true)

    resolve({ id: 'c1', name: 'Team A', slug: 'team-a' })
    await flushPromises()
    expect(w.find('button[type=submit]').attributes('aria-busy')).toBe('false')
  })
```

- [ ] **Step 6: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/pages/communities/__tests__/new.spec.ts`
Expected: FAIL — der Button hat kein `aria-busy`.

- [ ] **Step 7: Seite umbauen**

`webapp-vue/src/pages/communities/new.vue` vollständig:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import ActionButton from '@/ui/ActionButton.vue'
import { useAction } from '@/ui/useAction'
import { slugify } from '@/lib/slugify'
import { createCommunity } from '@/api/communities'
import { ApiError } from '@/api/client'
import { communityPath } from '@/communities/routes'
import { useCommunityCreationGuard } from '@/communities/useCommunityCreationGuard'

useCommunityCreationGuard()

const router = useRouter()
const name = ref('')
const slug = computed(() => slugify(name.value))
const tooShort = computed(() => slug.value.length < 3)

const { busy, error, run } = useAction((e) =>
  e instanceof ApiError && e.status === 409
    ? 'Dieser Name ergibt einen bereits vergebenen Slug — bitte Namen anpassen.'
    : 'Erstellen fehlgeschlagen. Bitte erneut versuchen.',
)

async function submit(): Promise<void> {
  await run(async () => {
    const c = await createCommunity(name.value.trim())
    await router.replace(communityPath(c.slug))
  })
}
</script>

<template>
  <section class="mx-auto max-w-md py-8">
    <h1 class="mb-4 text-xl font-semibold">Spielgemeinschaft erstellen</h1>
    <form @submit.prevent="submit">
      <label class="block text-sm font-medium" for="name">Name</label>
      <input
        id="name"
        v-model="name"
        class="mt-1 w-full rounded border px-3 py-1.5"
        minlength="3"
        maxlength="50"
        required
      />
      <p class="mt-2 text-sm text-neutral-500">
        URL: <code>{{ communityPath(slug || '…') }}</code>
        <span v-if="name && tooShort" class="text-amber-600"> (mind. 3 Zeichen)</span>
      </p>
      <ActionButton type="submit" class="mt-4" :busy="busy" :disabled="tooShort">
        Erstellen
      </ActionButton>
      <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p>
    </form>
  </section>
</template>
```

- [ ] **Step 8: Tests laufen lassen und grün sehen**

Run: `cd webapp-vue && pnpm vitest run src/pages/communities src/communities`
Expected: PASS. Der `vue-router`-Mock in `new.spec.ts` braucht jetzt `useRouter` **und** wird vom Guard genutzt; fehlt `useRouter` im Mock, ergänzen.

- [ ] **Step 9: Commit**

```bash
git add webapp-vue/src/communities/useCommunityCreationGuard.ts \
        webapp-vue/src/communities/__tests__/useCommunityCreationGuard.spec.ts \
        webapp-vue/src/pages/communities/new.vue \
        webapp-vue/src/pages/communities/__tests__/new.spec.ts
git commit -m "feat(communities): close the create page for uncleared viewers

Typing /communities/new by hand must not reach a form whose submit is bound to
fail with a 403. The submit button also stops being clickable while the
request is in flight, which is where a double click used to create two
communities with drifting slugs.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: `communities/index.vue`

**Files:**
- Modify: `webapp-vue/src/pages/communities/index.vue`
- Test: `webapp-vue/src/pages/communities/__tests__/index.spec.ts` (neu)

**Interfaces:**
- Consumes: `MeResponse.mayCreateCommunities` (Task 8).
- Produces: nichts.

- [ ] **Step 1: Failing Test schreiben**

Neue Datei `webapp-vue/src/pages/communities/__tests__/index.spec.ts`.

Die Community-Liste wird **nicht** über einen selbstgebauten Mock von `useCommunities` gestellt, sondern wie in `CommunityMenu.spec.ts` über einen `vi.spyOn` auf `listCommunities` plus `_resetCommunitiesState()` — `active` ist ein Modul-Singleton-Ref, und ein handgeschriebenes `{ value: [] }` wäre kein echtes Ref (im Template würde `active.length` dann `undefined` liefern und nur zufällig richtig aussehen).

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as client from '@/api/client'
import * as communitiesApi from '@/api/communities'
import { _resetCommunitiesState } from '@/communities/useCommunities'
import { useAuth, _resetAuthState } from '@/auth/useAuth'

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
}))
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof client>()),
  apiFetch: vi.fn(),
}))
const apiFetch = vi.mocked(client.apiFetch)

async function signIn(mayCreateCommunities: boolean): Promise<void> {
  apiFetch.mockResolvedValue({
    id: 'u1',
    username: 'Alice',
    githubLogin: 'alice',
    githubName: null,
    email: null,
    bgColorHex: null,
    isSuperAdmin: false,
    mayCreateCommunities,
    createdAt: null,
  })
  await useAuth().bootstrap()
}

async function page() {
  const Page = (await import('@/pages/communities/index.vue')).default
  const w = mount(Page)
  await flushPromises()
  return w
}

describe('own communities page', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    _resetAuthState()
    _resetCommunitiesState()
    // No memberships, so both cases land on the empty state — which is what has to branch.
    vi.spyOn(communitiesApi, 'listCommunities').mockResolvedValue([])
  })

  it('offers creating a community to a cleared viewer', async () => {
    await signIn(true)
    const w = await page()

    expect(w.find('a[href="/communities/new"]').exists()).toBe(true)
    expect(w.text()).toContain('Erstelle eine')
  })

  it('hides the entry point and the invitation to create it from an uncleared viewer', async () => {
    await signIn(false)
    const w = await page()

    expect(w.find('a[href="/communities/new"]').exists()).toBe(false)
    // The empty state must not point at a button that is not there.
    expect(w.text()).not.toContain('Erstelle eine')
    expect(w.text()).toContain('Öffne einen Einladungslink')
  })
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/pages/communities/__tests__/index.spec.ts`
Expected: FAIL — der Link ist auch ohne Berechtigung da.

- [ ] **Step 3: Seite anpassen**

`webapp-vue/src/pages/communities/index.vue` vollständig:

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useCommunities } from '@/communities/useCommunities'
import { communityPath } from '@/communities/routes'
import { useAuth } from '@/auth/useAuth'

const { active, refresh } = useCommunities()
const { user } = useAuth()

onMounted(refresh)
</script>

<template>
  <section class="mx-auto max-w-md py-8">
    <h1 class="mb-4 text-xl font-semibold">Deine Spielgemeinschaften</h1>
    <ul v-if="active.length" class="mb-6 space-y-2">
      <li v-for="c in active" :key="c.id">
        <RouterLink :to="communityPath(c.slug)" class="text-blue-700 hover:underline">{{
          c.name
        }}</RouterLink>
      </li>
    </ul>
    <!--
      Two empty states, because the copy must not point at an entry point the viewer does not
      have. Without the clearance there is no hint that creating exists at all.
    -->
    <p v-else-if="user?.mayCreateCommunities" class="mb-6 text-sm text-neutral-600">
      Du bist noch in keiner Spielgemeinschaft. Erstelle eine — oder öffne einen Einladungslink, den
      du erhalten hast.
    </p>
    <p v-else class="mb-6 text-sm text-neutral-600">
      Du bist noch in keiner Spielgemeinschaft. Öffne einen Einladungslink, den du erhalten hast.
    </p>
    <RouterLink
      v-if="user?.mayCreateCommunities"
      to="/communities/new"
      class="rounded border px-3 py-1.5 hover:bg-neutral-200"
      >Spielgemeinschaft erstellen</RouterLink
    >
  </section>
</template>
```

- [ ] **Step 4: Tests laufen lassen und grün sehen**

Run: `cd webapp-vue && pnpm vitest run src/pages/communities`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/pages/communities/index.vue \
        webapp-vue/src/pages/communities/__tests__/index.spec.ts
git commit -m "feat(communities): hide creating from viewers without the clearance

The empty state had to branch as well: an uncleared newcomer with no
invitation lands here from the landing guard, and the old copy told them to
create one while the button was gone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 16: `CommunityMenu.vue`

**Files:**
- Modify: `webapp-vue/src/communities/CommunityMenu.vue`
- Test: `webapp-vue/src/communities/__tests__/CommunityMenu.spec.ts`

**Interfaces:**
- Consumes: `MeResponse.mayCreateCommunities` (Task 8).
- Produces: nichts. Letzter Task.

- [ ] **Step 1: Failing Tests schreiben**

Die Datei hat einen `open(community)`-Helper, der mountet **und** den Trigger klickt. Für den Fall „Menü rendert gar nicht" ist der ungeeignet (es gibt dann keinen Button zu klicken), also kommt ein zweiter Helper dazu, der nur mountet.

Der Auth-Zustand kommt wie in Task 14 über `bootstrap()` mit gemocktem `apiFetch`. `@/api/communities` wird in der Datei per `vi.spyOn` gedoubelt, läuft also nicht über `apiFetch` — die beiden Mocks kollidieren nicht.

**Kopf der Datei ergänzen** (nach den bestehenden Imports und Mocks):

```ts
import * as client from '@/api/client'
import { useAuth, _resetAuthState } from '@/auth/useAuth'

vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof client>()),
  apiFetch: vi.fn(),
}))
const apiFetch = vi.mocked(client.apiFetch)

async function signIn(mayCreateCommunities: boolean): Promise<void> {
  apiFetch.mockResolvedValue({
    id: 'u1',
    username: 'Alice',
    githubLogin: 'alice',
    githubName: null,
    email: null,
    bgColorHex: null,
    isSuperAdmin: false,
    mayCreateCommunities,
    createdAt: null,
  })
  await useAuth().bootstrap()
}

/** Mounts without opening: the trigger is absent when the menu would have no entries. */
async function render(community: ActiveCommunity) {
  const Cmp = (await import('@/communities/CommunityMenu.vue')).default
  const w = mount(Cmp, { props: { community } })
  await flushPromises()
  return w
}
```

Im bestehenden `beforeEach` ergänzen:

```ts
    apiFetch.mockReset()
    _resetAuthState()
```

**Bestehende Tests anpassen** — zwei behaupten, der Create-Link sei da, was ohne Freischaltung nicht mehr gilt. In `offers the create action` und `stays usable when the community list cannot be loaded` jeweils als erste Zeile:

```ts
    await signIn(true)
```

**Neue Tests anhängen:**

```ts
  it('hides creating a community from an uncleared viewer', async () => {
    await signIn(false)
    const w = await open(admin)

    expect(w.find('[data-test=create-community]').exists()).toBe(false)
  })

  it('renders no menu at all when nothing would be left in it', async () => {
    // A non-admin in exactly one community without the clearance. The create link used to be the
    // one guaranteed entry, so without the guard this trigger would open an empty panel.
    vi.spyOn(api, 'listCommunities').mockResolvedValue([{ id: '1', name: 'Team Süd', slug: 'team' }])
    await signIn(false)
    const w = await render({ ...admin, viewerIsAdmin: false, pendingCount: 0 })

    expect(w.find('[data-test=community-menu]').exists()).toBe(false)
  })

  it('still renders the menu for a non-admin who can switch communities', async () => {
    // Same viewer, but a second community remains as an entry — the trigger must stay.
    await signIn(false)
    const w = await render({ ...admin, viewerIsAdmin: false, pendingCount: 0 })

    expect(w.find('[data-test=community-menu]').exists()).toBe(true)
  })
```

- [ ] **Step 2: Tests laufen lassen und Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/communities/__tests__/CommunityMenu.spec.ts`
Expected: FAIL — der Create-Link erscheint immer, und das Menü rendert leer.

- [ ] **Step 3: Komponente anpassen**

In `webapp-vue/src/communities/CommunityMenu.vue` das `<script setup>` erweitern:

```ts
import { useAuth } from '@/auth/useAuth'
```

```ts
const { user } = useAuth()
const mayCreate = computed(() => user.value?.mayCreateCommunities ?? false)
// The create link used to guarantee the panel was never empty. Without it, a non-admin in exactly
// one community would open an empty dropdown — no menu is better than an empty one.
const hasEntries = computed(
  () => props.community.viewerIsAdmin || others.value.length > 0 || mayCreate.value,
)
```

Im Template das öffnende Tag um `v-if` erweitern und den Create-Link bedingt rendern:

```vue
  <HeaderMenu v-if="hasEntries" :label="label" data-test="community-menu">
```

```vue
    <RouterLink
      v-if="mayCreate"
      to="/communities/new"
      data-test="create-community"
      :class="`${ENTRY} gap-2 text-neutral-600`"
    >
      <IconPlus class="size-4" />
      Spielgemeinschaft
    </RouterLink>
```

Der Divider bei `CommunityMenu.vue:67` schließt den Admin-Block ab und bleibt unverändert.

- [ ] **Step 4: Tests laufen lassen und grün sehen**

Run: `cd webapp-vue && pnpm vitest run src/communities/__tests__/CommunityMenu.spec.ts`
Expected: PASS

- [ ] **Step 5: Voller Lauf über beide Seiten**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Expected: PASS

```bash
cd core && ./mvnw test
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/communities/CommunityMenu.vue \
        webapp-vue/src/communities/__tests__/CommunityMenu.spec.ts
git commit -m "feat(communities): drop the create entry from the community menu

Removing it exposed a latent case: the link was the only guaranteed entry, so
a non-admin in exactly one community would now open an empty dropdown. The
menu hides its trigger instead.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Manuelle Verifikation zum Abschluss

Der Frontend-Guard und die Backend-Sperre greifen erst zusammen im laufenden System. Nach Task 16:

```bash
cd core && ./mvnw spring-boot:run
```

```bash
cd webapp-vue && pnpm dev
```

1. Als nicht freigeschalteter Test-User anmelden (Dev-Login-Picker). Auf `/communities` darf **kein** Erstellen-Button stehen; im Community-Menü kein `+ Spielgemeinschaft`.
2. `/communities/new` direkt in die Adresszeile: leitet nach `/communities` zurück.
3. `curl` mit der Session-Cookie gegen `POST /api/communities`: `403`.
4. Als Super-Admin `/super-admin` öffnen: Nav-Liste mit „Nutzer" und „Spielgemeinschaften", darunter die Super-Admins-Tabelle.
5. Über „Nutzer" den Test-User öffnen, „Freischalten" klicken — Spinner im Button sichtbar, Label bleibt an seiner Stelle.
6. Zurück als Test-User (**ohne** neues Login, nur Seite neu laden): Erstellen ist jetzt möglich. Das ist der Punkt, an dem sich der Live-Read gegen eine Session-Kopie beweist.
