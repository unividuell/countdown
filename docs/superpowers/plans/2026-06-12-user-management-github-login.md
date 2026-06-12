# User Management — GitHub Social Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authenticate users via GitHub OAuth2, provision/sync a local Postgres user record keyed by a Postgres-generated UUID v7, persist the login in an HTTP session, and expose the user (plus a self-service profile update and a super-admin role) to a future SPA.

**Architecture:** A single Spring Modulith module `iam`, owning a dedicated Postgres schema `iam`. A custom `OAuth2UserService` upserts the user on every login and returns a principal carrying our UUID + authorities. Spring Session JDBC persists the session in Postgres. Flyway runs **per module** (Spring Modulith's module-aware migrations) with independent versioning. Domain API (`User`, `UserQuery`) is exposed; everything else lives in `iam.internal`.

**Tech Stack:** Spring Boot 4.1, Kotlin, Java 25, Spring Security 7 (OAuth2 client + session), Spring Data JDBC, Flyway, PostgreSQL 18 (`uuidv7()`), Spring Modulith 2.1, Testcontainers, spring-security-test.

---

## File Structure

Module base package `org.unividuell.countdown.core.iam` (path prefix `core/src/main/kotlin/org/unividuell/countdown/core/iam`):

**Exposed (module API), base package:**
- `User.kt` — JDBC aggregate + read model (immutable `data class`, `Serializable`).
- `UserQuery.kt` — facade interface for other modules.

**Internal, `iam/internal/`:**
- `UserRepository.kt` — Spring Data JDBC repository.
- `SuperAdminProperties.kt` — `@ConfigurationProperties(prefix = "app")` super-admin allowlist.
- `UserProvisioningService.kt` — upsert + sync + super-admin evaluation.
- `UserProfileService.kt` — self-service updates to user-owned fields.
- `UserQueryService.kt` — `UserQuery` implementation.
- `CountdownOAuth2User.kt` — custom `OAuth2User` principal (`Serializable`).
- `GitHubOAuth2UserService.kt` — custom `OAuth2UserService`.
- `SecurityConfig.kt` — `SecurityFilterChain` + `@EnableConfigurationProperties`.
- `UserController.kt` — `/api/me` (GET + PATCH) + DTOs `MeResponse`, `UpdateProfileRequest`.

**Resources — module-based Flyway layout:**
- `core/src/main/resources/db/migration/iam/V1__create_users.sql` (creates schema `iam` + `iam.users`)
- `core/src/main/resources/db/migration/__root/V1__spring_session.sql` (shared infra)
- `core/src/main/resources/application.yaml` (extended)
- `core/src/test/resources/application.yaml` (test OAuth2 dummy creds)

**Tests, `core/src/test/kotlin/org/unividuell/countdown/core/iam/`:**
- `UserRepositoryTest.kt`, `UserProvisioningServiceTest.kt`, `UserProfileServiceTest.kt`, `CountdownOAuth2UserTest.kt`, `GitHubOAuth2UserServiceTest.kt`, `UserControllerTest.kt`
- `core/src/test/kotlin/org/unividuell/countdown/core/ModularityTests.kt`

### Module-based Flyway migrations (read first)

This project enables Spring Modulith's module-aware Flyway support
(`spring.modulith.runtime.flyway-enabled=true`). Its effect:

- The default base location `classpath:db/migration` (no wildcard) is expanded
  per module: Flyway runs once for a `__root` pseudo-module and once for each
  application module (`iam`), scanning `db/migration/__root` and
  `db/migration/iam` respectively.
- Each gets its **own** schema-history table (`flyway_schema_history` for root,
  `flyway_schema_history_iam` for the module), so each module versions
  independently and starts at `V1`.
- **Scripts placed directly in `db/migration` are not scanned** — everything
  goes in a per-module subfolder.
- The feature requires ArchUnit on the runtime classpath (provided by
  `spring-modulith-starter-core`); the runtime support fails fast otherwise.

---

## Task 1: Pin PostgreSQL 18

`uuidv7()` is a PostgreSQL 18 built-in. Pin both the dev compose service and the Testcontainers image.

**Files:**
- Modify: `core/compose.yaml`
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/TestcontainersConfiguration.kt:13`

- [ ] **Step 1: Pin the compose image**

In `core/compose.yaml` change the image line:

```yaml
services:
  postgres:
    image: 'postgres:18'
    environment:
      - 'POSTGRES_DB=mydatabase'
      - 'POSTGRES_PASSWORD=secret'
      - 'POSTGRES_USER=myuser'
    ports:
      - '5432'
```

- [ ] **Step 2: Pin the Testcontainers image**

In `TestcontainersConfiguration.kt` replace `postgres:latest`:

```kotlin
	@Bean
	@ServiceConnection
	fun postgresContainer(): PostgreSQLContainer {
		return PostgreSQLContainer(DockerImageName.parse("postgres:18"))
	}
```

- [ ] **Step 3: Run the existing context test to verify it still loads**

Run: `cd core && ./mvnw -q -Dtest=CoreApplicationTests test`
Expected: PASS (Testcontainers starts `postgres:18`, context loads).

- [ ] **Step 4: Commit**

```bash
git add core/compose.yaml core/src/test/kotlin/org/unividuell/countdown/core/TestcontainersConfiguration.kt
git commit -m "build: pin PostgreSQL to 18 for uuidv7()"
```

---

## Task 2: Enable module-based migrations + `iam` schema + `User` entity + repository

**Files:**
- Modify: `core/src/main/resources/application.yaml`
- Create: `core/src/main/resources/db/migration/iam/V1__create_users.sql`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/User.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserRepository.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserRepositoryTest.kt`

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/iam/UserRepositoryTest.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserRepository
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

@Import(TestcontainersConfiguration::class)
@SpringBootTest
class UserRepositoryTest(@Autowired val repository: UserRepository) {

    @Test
    fun `saves a new user and assigns a uuid v7 id`() {
        val saved = repository.save(
            User(githubId = 4711L, githubLogin = "octocat", githubName = "The Octocat", email = "cat@example.com")
        )

        assertNotNull(saved.id, "DB should assign a UUID v7")
        assertEquals(7, saved.id!!.version(), "id must be a UUID version 7")
        assertNotNull(saved.createdAt)
        assertNotNull(saved.updatedAt)
    }

    @Test
    fun `finds a user by github id`() {
        repository.save(User(githubId = 1234L, githubLogin = "hubert", githubName = null, email = null))

        val found = repository.findByGithubId(1234L)

        assertNotNull(found)
        assertEquals("hubert", found.githubLogin)
        assertNull(repository.findByGithubId(9999L))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw -q -Dtest=UserRepositoryTest test`
Expected: COMPILE FAILURE — `User` and `UserRepository` are unresolved references.

- [ ] **Step 3: Enable module-based Flyway migrations**

Replace `core/src/main/resources/application.yaml` with:

```yaml
spring:
  application:
    name: core
  modulith:
    runtime:
      flyway-enabled: true
```

This makes Flyway scan `db/migration/iam` and `db/migration/__root` with
per-module history tables (see "Module-based Flyway migrations" above).

- [ ] **Step 4: Create the module migration (schema + table)**

`core/src/main/resources/db/migration/iam/V1__create_users.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS iam;

CREATE TABLE iam.users (
    id              UUID         PRIMARY KEY DEFAULT uuidv7(),
    github_id       BIGINT       NOT NULL UNIQUE,
    github_login    TEXT         NOT NULL,
    github_name     TEXT         NULL,
    display_name    TEXT         NULL,
    email           TEXT         NULL,
    bg_color_hex    TEXT         NULL,
    is_super_admin  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

- [ ] **Step 5: Create the `User` entity**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/User.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.io.Serializable
import java.time.Instant
import java.util.UUID

@Table(schema = "iam", name = "users")
data class User(
    @Id
    val id: UUID? = null,
    val githubId: Long,
    val githubLogin: String,
    val githubName: String? = null,
    val displayName: String? = null,
    val email: String? = null,
    val bgColorHex: String? = null,
    val isSuperAdmin: Boolean = false,
    val createdAt: Instant? = null,
    val updatedAt: Instant? = null,
) : Serializable {
    /** Name shown in the UI: user-chosen, else GitHub display name, else GitHub handle. */
    val username: String
        get() = displayName ?: githubName ?: githubLogin
}
```

No `@Column` annotations needed: Spring Data JDBC's `DefaultNamingStrategy` already maps camelCase properties to `snake_case` columns (verified in spring-data-relational 4.1.0 — its javadoc states *"Names are in SNAKE_CASE"* and `getColumnName` uses `ParsingUtils.reconcatenateCamelCase(name, "_")`), so `githubLogin` → `github_login`, `isSuperAdmin` → `is_super_admin`, etc. `@Table(schema = "iam", name = "users")` pins the module schema and avoids the reserved word `user`. `id == null` makes Spring Data JDBC treat the row as new (INSERT); PostgreSQL fills the `uuidv7()` default and the driver returns it.

- [ ] **Step 6: Create the repository**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserRepository.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.data.repository.CrudRepository
import org.unividuell.countdown.core.iam.User
import java.util.UUID

interface UserRepository : CrudRepository<User, UUID> {
    fun findByGithubId(githubId: Long): User?
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd core && ./mvnw -q -Dtest=UserRepositoryTest test`
Expected: PASS. The `iam` schema + `iam.users` table are created by the module
migration; both tests green; `id.version()` is 7. (If the table is missing,
confirm `spring.modulith.runtime.flyway-enabled=true` and that the script is at
`db/migration/iam/V1__create_users.sql`.)

- [ ] **Step 8: Commit**

```bash
git add core/src/main/resources/application.yaml \
        core/src/main/resources/db/migration/iam/V1__create_users.sql \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/User.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserRepository.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/UserRepositoryTest.kt
git commit -m "feat(iam): module-based migration, iam schema, users table with uuid v7"
```

---

## Task 3: Super-admin allowlist + provisioning/sync service

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminProperties.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserProvisioningService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserProvisioningServiceTest.kt`

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/iam/UserProvisioningServiceTest.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.TestPropertySource
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserProvisioningService
import org.unividuell.countdown.core.iam.internal.UserRepository
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@TestPropertySource(properties = ["app.super-admin-github-logins=bossuser"])
class UserProvisioningServiceTest(
    @Autowired val service: UserProvisioningService,
    @Autowired val repository: UserRepository,
) {

    @Test
    fun `first login inserts a new user`() {
        val user = service.provision(githubId = 100L, login = "octocat", name = "The Octocat", email = "cat@example.com")

        assertEquals("octocat", user.githubLogin)
        assertEquals("The Octocat", user.githubName)
        assertEquals("cat@example.com", user.email)
        assertFalse(user.isSuperAdmin)
        assertNull(user.displayName)
        assertEquals(1, repository.count())
    }

    @Test
    fun `repeat login syncs github fields but preserves user-owned fields`() {
        val first = service.provision(101L, "old-login", "Old Name", "old@example.com")
        // simulate user-owned edits
        repository.save(first.copy(displayName = "Mr. Custom", bgColorHex = "#ff0000"))

        val synced = service.provision(101L, "new-login", "New Name", "new@example.com")

        assertEquals("new-login", synced.githubLogin)
        assertEquals("New Name", synced.githubName)
        assertEquals("new@example.com", synced.email)
        assertEquals("Mr. Custom", synced.displayName, "display_name must not be overwritten by sync")
        assertEquals("#ff0000", synced.bgColorHex, "bg_color_hex must not be overwritten by sync")
        assertEquals(1, repository.count(), "must update, not insert a duplicate")
    }

    @Test
    fun `super-admin flag follows the allowlist on every login`() {
        val notSuperAdmin = service.provision(102L, "regular", null, null)
        assertFalse(notSuperAdmin.isSuperAdmin)

        val superAdmin = service.provision(103L, "bossuser", null, null)
        assertTrue(superAdmin.isSuperAdmin)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw -q -Dtest=UserProvisioningServiceTest test`
Expected: COMPILE FAILURE — `UserProvisioningService` unresolved.

- [ ] **Step 3: Create the super-admin properties**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminProperties.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "app")
open class SuperAdminProperties(
    /** GitHub logins granted ROLE_SUPER_ADMIN. Re-evaluated on every login. */
    val superAdminGithubLogins: List<String> = emptyList(),
) {
    open fun isSuperAdmin(login: String): Boolean =
        superAdminGithubLogins.any { it.equals(login, ignoreCase = true) }
}
```

(`open` so the Task 5 unit test can subclass it without Spring context.)

- [ ] **Step 4: Create the provisioning service**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserProvisioningService.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.iam.User
import java.time.Instant

@Service
open class UserProvisioningService(
    private val repository: UserRepository,
    private val superAdminProperties: SuperAdminProperties,
) {
    /** Upserts the user from GitHub claims; never touches user-owned fields. */
    @Transactional
    open fun provision(githubId: Long, login: String, name: String?, email: String?): User {
        val isSuperAdmin = superAdminProperties.isSuperAdmin(login)
        repository.findByGithubId(githubId)?.let { existing ->
            return repository.save(sync(existing, login, name, email, isSuperAdmin))
        }
        return try {
            repository.save(
                User(
                    githubId = githubId,
                    githubLogin = login,
                    githubName = name,
                    email = email,
                    isSuperAdmin = isSuperAdmin,
                )
            )
        } catch (_: DuplicateKeyException) {
            // a concurrent login already inserted the row: re-fetch and sync
            val existing = repository.findByGithubId(githubId)!!
            repository.save(sync(existing, login, name, email, isSuperAdmin))
        }
    }

    private fun sync(existing: User, login: String, name: String?, email: String?, isSuperAdmin: Boolean): User =
        existing.copy(
            githubLogin = login,
            githubName = name,
            email = email,
            isSuperAdmin = isSuperAdmin,
            updatedAt = Instant.now(),
        )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd core && ./mvnw -q -Dtest=UserProvisioningServiceTest test`
Expected: PASS (3 tests green).

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminProperties.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserProvisioningService.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/UserProvisioningServiceTest.kt
git commit -m "feat(iam): provisioning/sync with super-admin allowlist"
```

---

## Task 4: Profile update service + `UserQuery` facade

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/UserQuery.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserQueryService.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserProfileService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserProfileServiceTest.kt`

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/iam/UserProfileServiceTest.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserProfileService
import org.unividuell.countdown.core.iam.internal.UserRepository
import kotlin.test.assertEquals
import kotlin.test.assertNull

@Import(TestcontainersConfiguration::class)
@SpringBootTest
class UserProfileServiceTest(
    @Autowired val service: UserProfileService,
    @Autowired val query: UserQuery,
    @Autowired val repository: UserRepository,
) {

    @Test
    fun `updates user-owned fields and preserves github fields`() {
        val saved = repository.save(User(githubId = 200L, githubLogin = "octocat", githubName = "The Octocat"))

        val updated = service.update(saved.id!!, displayName = "Mr. Custom", bgColorHex = "#00ff00")

        assertEquals("Mr. Custom", updated.displayName)
        assertEquals("#00ff00", updated.bgColorHex)
        assertEquals("octocat", updated.githubLogin)
        assertEquals("The Octocat", updated.githubName)
    }

    @Test
    fun `null clears a user-owned field`() {
        val saved = repository.save(
            User(githubId = 201L, githubLogin = "octocat", displayName = "old", bgColorHex = "#111111")
        )

        val updated = service.update(saved.id!!, displayName = null, bgColorHex = null)

        assertNull(updated.displayName)
        assertNull(updated.bgColorHex)
    }

    @Test
    fun `query finds user by id`() {
        val saved = repository.save(User(githubId = 202L, githubLogin = "octocat"))
        assertEquals(saved.id, query.findById(saved.id!!)?.id)
        assertNull(query.findById(java.util.UUID.randomUUID()))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw -q -Dtest=UserProfileServiceTest test`
Expected: COMPILE FAILURE — `UserQuery`, `UserProfileService` unresolved.

- [ ] **Step 3: Create the query facade (exposed) and its implementation**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/UserQuery.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import java.util.UUID

/** Read-only access to users, for consumption by other modules. */
interface UserQuery {
    fun findById(id: UUID): User?
}
```

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserQueryService.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

@Service
class UserQueryService(private val repository: UserRepository) : UserQuery {
    override fun findById(id: UUID): User? = repository.findByIdOrNull(id)
}
```

- [ ] **Step 4: Create the profile service**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserProfileService.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.iam.User
import java.time.Instant
import java.util.UUID

@Service
class UserProfileService(private val repository: UserRepository) {
    /** Sets the caller's user-owned fields. `null` clears the value. */
    @Transactional
    fun update(userId: UUID, displayName: String?, bgColorHex: String?): User {
        val user = repository.findByIdOrNull(userId)
            ?: throw NoSuchElementException("user $userId not found")
        return repository.save(
            user.copy(displayName = displayName, bgColorHex = bgColorHex, updatedAt = Instant.now())
        )
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd core && ./mvnw -q -Dtest=UserProfileServiceTest test`
Expected: PASS (3 tests green).

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/UserQuery.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserQueryService.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserProfileService.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/UserProfileServiceTest.kt
git commit -m "feat(iam): profile update service and query facade"
```

---

## Task 5: OAuth2 principal + custom `OAuth2UserService`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/CountdownOAuth2User.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/GitHubOAuth2UserService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/CountdownOAuth2UserTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/GitHubOAuth2UserServiceTest.kt`

- [ ] **Step 1: Write the failing principal test**

`core/src/test/kotlin/org/unividuell/countdown/core/iam/CountdownOAuth2UserTest.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CountdownOAuth2UserTest {

    private fun user(isSuperAdmin: Boolean) = User(
        id = UUID.fromString("018f0000-0000-7000-8000-000000000000"),
        githubId = 1L, githubLogin = "octocat", isSuperAdmin = isSuperAdmin,
    )

    @Test
    fun `name is our uuid`() {
        val principal = CountdownOAuth2User(user(false), mapOf("login" to "octocat"))
        assertEquals("018f0000-0000-7000-8000-000000000000", principal.name)
    }

    @Test
    fun `non-super-admin has only ROLE_USER`() {
        val authorities = CountdownOAuth2User(user(false), emptyMap()).authorities.map { it.authority }
        assertTrue("ROLE_USER" in authorities)
        assertFalse("ROLE_SUPER_ADMIN" in authorities)
    }

    @Test
    fun `super-admin has ROLE_SUPER_ADMIN`() {
        val authorities = CountdownOAuth2User(user(true), emptyMap()).authorities.map { it.authority }
        assertTrue("ROLE_USER" in authorities)
        assertTrue("ROLE_SUPER_ADMIN" in authorities)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw -q -Dtest=CountdownOAuth2UserTest test`
Expected: COMPILE FAILURE — `CountdownOAuth2User` unresolved.

- [ ] **Step 3: Create the principal**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/CountdownOAuth2User.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.core.user.OAuth2User
import org.unividuell.countdown.core.iam.User
import java.io.Serializable

/** Session principal carrying our domain user. Serializable for Spring Session JDBC. */
class CountdownOAuth2User(
    val user: User,
    private val attributes: Map<String, Any>,
) : OAuth2User, Serializable {

    override fun getName(): String = user.id.toString()

    override fun getAttributes(): Map<String, Any> = attributes

    override fun getAuthorities(): Collection<GrantedAuthority> = buildList {
        add(SimpleGrantedAuthority("ROLE_USER"))
        if (user.isSuperAdmin) add(SimpleGrantedAuthority("ROLE_SUPER_ADMIN"))
    }
}
```

- [ ] **Step 4: Write the failing service test**

`core/src/test/kotlin/org/unividuell/countdown/core/iam/GitHubOAuth2UserServiceTest.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.core.user.DefaultOAuth2User
import org.springframework.security.oauth2.core.user.OAuth2User
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import org.unividuell.countdown.core.iam.internal.GitHubOAuth2UserService
import org.unividuell.countdown.core.iam.internal.SuperAdminProperties
import org.unividuell.countdown.core.iam.internal.UserProvisioningService
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertIs

class GitHubOAuth2UserServiceTest {

    @Test
    fun `extracts github claims, provisions, and returns our principal`() {
        val attrs = mapOf<String, Any>(
            "id" to 4711, "login" to "octocat", "name" to "The Octocat", "email" to "cat@example.com",
        )
        val provisioned = User(
            id = UUID.fromString("018f0000-0000-7000-8000-000000000000"),
            githubId = 4711L, githubLogin = "octocat", githubName = "The Octocat", email = "cat@example.com",
        )

        var captured: List<Any?> = emptyList()
        val provisioning = object : UserProvisioningService(FakeRepo(), SuperAdminProperties(emptyList())) {
            override fun provision(githubId: Long, login: String, name: String?, email: String?): User {
                captured = listOf(githubId, login, name, email)
                return provisioned
            }
        }
        // delegate returns canned GitHub attributes regardless of the (unused) request
        val delegate = object : DefaultOAuth2UserService() {
            override fun loadUser(userRequest: OAuth2UserRequest?): OAuth2User =
                DefaultOAuth2User(emptyList(), attrs, "id")
        }
        val service = GitHubOAuth2UserService(provisioning, delegate)

        val result = service.loadUser(null)

        assertIs<CountdownOAuth2User>(result)
        assertEquals(provisioned, result.user)
        assertEquals(listOf(4711L, "octocat", "The Octocat", "cat@example.com"), captured)
    }
}

private class FakeRepo : UserRepository {
    override fun findByGithubId(githubId: Long): User? = null
    override fun <S : User> save(entity: S): S = entity
    override fun <S : User> saveAll(entities: Iterable<S>): Iterable<S> = entities
    override fun findById(id: UUID): java.util.Optional<User> = java.util.Optional.empty()
    override fun existsById(id: UUID): Boolean = false
    override fun findAll(): Iterable<User> = emptyList()
    override fun findAllById(ids: Iterable<UUID>): Iterable<User> = emptyList()
    override fun count(): Long = 0
    override fun deleteById(id: UUID) {}
    override fun delete(entity: User) {}
    override fun deleteAllById(ids: Iterable<UUID>) {}
    override fun deleteAll(entities: Iterable<User>) {}
    override fun deleteAll() {}
}
```

> NOTE: `SuperAdminProperties` and `UserProvisioningService.provision` are `open`
> (Task 3) so this test can subclass them without a database. `UserRepository`
> imports come from `...iam.internal`. The `FakeRepo` implements every
> `CrudRepository` method.

- [ ] **Step 5: Run service test to verify it fails**

Run: `cd core && ./mvnw -q -Dtest=GitHubOAuth2UserServiceTest test`
Expected: COMPILE FAILURE — `GitHubOAuth2UserService` unresolved.

- [ ] **Step 6: Create the custom `OAuth2UserService`**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/GitHubOAuth2UserService.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.stereotype.Service

/**
 * Fetches the GitHub profile via the default service, upserts our user, and
 * returns a principal carrying our UUID + authorities.
 */
@Service
class GitHubOAuth2UserService(
    private val provisioning: UserProvisioningService,
    private val delegate: OAuth2UserService<OAuth2UserRequest, OAuth2User> = DefaultOAuth2UserService(),
) : OAuth2UserService<OAuth2UserRequest, OAuth2User> {

    override fun loadUser(userRequest: OAuth2UserRequest?): OAuth2User {
        val githubUser = delegate.loadUser(userRequest)
        val attributes = githubUser.attributes
        val user = provisioning.provision(
            githubId = (attributes["id"] as Number).toLong(),
            login = attributes["login"] as String,
            name = attributes["name"] as String?,
            email = attributes["email"] as String?,
        )
        return CountdownOAuth2User(user, attributes)
    }
}
```

- [ ] **Step 7: Run both tests to verify they pass**

Run: `cd core && ./mvnw -q -Dtest='CountdownOAuth2UserTest,GitHubOAuth2UserServiceTest' test`
Expected: PASS (all green).

- [ ] **Step 8: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/CountdownOAuth2User.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/GitHubOAuth2UserService.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/CountdownOAuth2UserTest.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/GitHubOAuth2UserServiceTest.kt
git commit -m "feat(iam): custom OAuth2 user service and session principal"
```

---

## Task 6: Security config, session schema, controller, and web tests

This task wires the filter chain, the Spring Session schema (in the `__root`
migration), the GitHub client config, and the `/api/me` endpoints, and verifies
the whole HTTP contract.

**Files:**
- Create: `core/src/main/resources/db/migration/__root/V1__spring_session.sql`
- Modify: `core/src/main/resources/application.yaml`
- Create: `core/src/test/resources/application.yaml`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SecurityConfig.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserControllerTest.kt`

- [ ] **Step 1: Create the Spring Session schema migration (root module)**

`core/src/main/resources/db/migration/__root/V1__spring_session.sql` (canonical Spring Session JDBC PostgreSQL schema, default schema):

```sql
CREATE TABLE SPRING_SESSION (
    PRIMARY_ID            CHAR(36)     NOT NULL,
    SESSION_ID            CHAR(36)     NOT NULL,
    CREATION_TIME         BIGINT       NOT NULL,
    LAST_ACCESS_TIME      BIGINT       NOT NULL,
    MAX_INACTIVE_INTERVAL INT          NOT NULL,
    EXPIRY_TIME           BIGINT       NOT NULL,
    PRINCIPAL_NAME        VARCHAR(100),
    CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
);

CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);

CREATE TABLE SPRING_SESSION_ATTRIBUTES (
    SESSION_PRIMARY_ID CHAR(36)     NOT NULL,
    ATTRIBUTE_NAME     VARCHAR(200) NOT NULL,
    ATTRIBUTE_BYTES    BYTEA        NOT NULL,
    CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
    CONSTRAINT SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID) REFERENCES SPRING_SESSION (PRIMARY_ID) ON DELETE CASCADE
);
```

- [ ] **Step 2: Extend the main application config**

Replace `core/src/main/resources/application.yaml` with:

```yaml
spring:
  application:
    name: core
  modulith:
    runtime:
      flyway-enabled: true
  security:
    oauth2:
      client:
        registration:
          github:
            client-id: ${GITHUB_CLIENT_ID}
            client-secret: ${GITHUB_CLIENT_SECRET}
            scope: read:user
  session:
    jdbc:
      initialize-schema: never

app:
  super-admin-github-logins: ${SUPER_ADMIN_GITHUB_LOGINS:}
```

- [ ] **Step 3: Add test config so the context loads without real GitHub creds**

`core/src/test/resources/application.yaml`:

```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          github:
            client-id: test-client-id
            client-secret: test-client-secret
            scope: read:user
```

- [ ] **Step 4: Write the failing controller test**

`core/src/test/kotlin/org/unividuell/countdown/core/iam/UserControllerTest.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import org.unividuell.countdown.core.iam.internal.UserProfileService
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class UserControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockitoBean
    lateinit var profileService: UserProfileService

    private val uid = UUID.fromString("018f0000-0000-7000-8000-000000000000")

    private fun principalFor(user: User) =
        authentication(
            OAuth2AuthenticationToken(
                CountdownOAuth2User(user, mapOf("login" to user.githubLogin)),
                CountdownOAuth2User(user, emptyMap()).authorities,
                "github",
            )
        )

    private fun user(isSuperAdmin: Boolean = false, displayName: String? = null) = User(
        id = uid, githubId = 1L, githubLogin = "octocat", githubName = "The Octocat",
        email = "cat@example.com", displayName = displayName, isSuperAdmin = isSuperAdmin,
    )

    @Test
    fun `GET me without auth returns 401`() {
        mockMvc.perform(get("/api/me")).andExpect(status().isUnauthorized)
    }

    @Test
    fun `GET me returns the current user with computed username`() {
        mockMvc.perform(get("/api/me").with(principalFor(user(displayName = "Mr. Custom"))))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(uid.toString()))
            .andExpect(jsonPath("$.username").value("Mr. Custom"))
            .andExpect(jsonPath("$.githubLogin").value("octocat"))
            .andExpect(jsonPath("$.isSuperAdmin").value(false))
    }

    @Test
    fun `PATCH me updates own profile`() {
        whenever(profileService.update(uid, "New Name", "#abcdef"))
            .thenReturn(user(displayName = "New Name").copy(bgColorHex = "#abcdef"))

        mockMvc.perform(
            patch("/api/me").with(principalFor(user())).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"displayName":"New Name","bgColorHex":"#abcdef"}""")
        ).andExpect(status().isOk)
            .andExpect(jsonPath("$.username").value("New Name"))
            .andExpect(jsonPath("$.bgColorHex").value("#abcdef"))
    }

    @Test
    fun `super-admin path forbidden for non-super-admin`() {
        mockMvc.perform(get("/api/super-admin/ping").with(principalFor(user(isSuperAdmin = false))))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `logout clears session and returns 204`() {
        mockMvc.perform(post("/logout").with(principalFor(user())).with(csrf()))
            .andExpect(status().isNoContent)
    }
}
```

> NOTE on imports: this test uses `org.mockito.kotlin.whenever` (mockito-kotlin).
> If it is not available transitively, either add it as a test dependency or use
> Mockito's `Mockito.\`when\``. `@MockitoBean` is in
> `org.springframework.test.context.bean.override.mockito`.

- [ ] **Step 5: Run controller test to verify it fails**

Run: `cd core && ./mvnw -q -Dtest=UserControllerTest test`
Expected: COMPILE FAILURE — `SecurityConfig`/`UserController` missing (and `/api/super-admin/**`, `/logout` not configured).

- [ ] **Step 6: Create the security config**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SecurityConfig.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler
import org.springframework.security.web.csrf.CookieCsrfTokenRepository
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(SuperAdminProperties::class)
class SecurityConfig {

    @Bean
    fun securityFilterChain(
        http: HttpSecurity,
        gitHubOAuth2UserService: GitHubOAuth2UserService,
    ): SecurityFilterChain {
        http {
            authorizeHttpRequests {
                authorize("/oauth2/**", permitAll)
                authorize("/login/**", permitAll)
                authorize("/actuator/health", permitAll)
                authorize("/api/super-admin/**", hasRole("SUPER_ADMIN"))
                authorize(anyRequest, authenticated)
            }
            oauth2Login {
                userInfoEndpoint {
                    userService = gitHubOAuth2UserService
                }
            }
            // SPA contract: 401 instead of a redirect to GitHub for unauthenticated API calls
            exceptionHandling {
                authenticationEntryPoint = HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)
            }
            // Cookie-based CSRF the SPA can read; plain handler so cookie value == header value
            csrf {
                csrfTokenRepository = CookieCsrfTokenRepository.withHttpOnlyFalse()
                csrfTokenRequestHandler = CsrfTokenRequestAttributeHandler()
            }
            logout {
                logoutUrl = "/logout"
                logoutSuccessHandler = HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)
            }
        }
        return http.build()
    }
}
```

- [ ] **Step 7: Create the controller + DTOs**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserController.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.iam.User
import java.time.Instant
import java.util.UUID

data class MeResponse(
    val id: UUID,
    val username: String,
    val githubLogin: String,
    val githubName: String?,
    val email: String?,
    val bgColorHex: String?,
    val isSuperAdmin: Boolean,
    val createdAt: Instant?,
)

/** Full desired state of the user-owned fields (null clears a field). */
data class UpdateProfileRequest(
    val displayName: String?,
    val bgColorHex: String?,
)

private fun User.toMeResponse() = MeResponse(
    id = id!!, username = username, githubLogin = githubLogin, githubName = githubName,
    email = email, bgColorHex = bgColorHex, isSuperAdmin = isSuperAdmin, createdAt = createdAt,
)

@RestController
@RequestMapping("/api/me")
class UserController(private val profileService: UserProfileService) {

    @GetMapping
    fun me(@AuthenticationPrincipal principal: CountdownOAuth2User): MeResponse =
        principal.user.toMeResponse()

    @PatchMapping
    fun update(
        @AuthenticationPrincipal principal: CountdownOAuth2User,
        @RequestBody body: UpdateProfileRequest,
    ): MeResponse =
        profileService.update(principal.user.id!!, body.displayName, body.bgColorHex).toMeResponse()
}
```

- [ ] **Step 8: Run controller test to verify it passes**

Run: `cd core && ./mvnw -q -Dtest=UserControllerTest test`
Expected: PASS. If `GET /api/me` without auth returns `302` instead of `401`, confirm the `exceptionHandling { authenticationEntryPoint = ... }` block is present (it sets the default entry point).

- [ ] **Step 9: Commit**

```bash
git add core/src/main/resources/db/migration/__root/V1__spring_session.sql \
        core/src/main/resources/application.yaml \
        core/src/test/resources/application.yaml \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SecurityConfig.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserController.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/UserControllerTest.kt
git commit -m "feat(iam): security filter chain, session schema, /api/me endpoints"
```

---

## Task 7: Spring Modulith boundary verification

**Files:**
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/ModularityTests.kt`

- [ ] **Step 1: Write the verification test**

`core/src/test/kotlin/org/unividuell/countdown/core/ModularityTests.kt`:

```kotlin
package org.unividuell.countdown.core

import org.junit.jupiter.api.Test
import org.springframework.modulith.core.ApplicationModules

class ModularityTests {

    private val modules = ApplicationModules.of(CoreApplication::class.java)

    @Test
    fun `verifies module boundaries`() {
        modules.verify()
    }
}
```

- [ ] **Step 2: Run the test**

Run: `cd core && ./mvnw -q -Dtest=ModularityTests test`
Expected: PASS. If it fails because internal types are exposed across module boundaries, confirm all implementation classes live under `...iam.internal` and only `User` + `UserQuery` are in `...iam`. There are no cross-module references yet, so verification should be green.

- [ ] **Step 3: Commit**

```bash
git add core/src/test/kotlin/org/unividuell/countdown/core/ModularityTests.kt
git commit -m "test: verify spring modulith boundaries"
```

---

## Task 8: Full build + local run documentation

**Files:**
- Modify: `core/README.md` (or create if absent) — local GitHub OAuth setup notes.

- [ ] **Step 1: Run the whole test suite**

Run: `cd core && ./mvnw -q test`
Expected: PASS — all unit, repository, provisioning, controller, and modulith tests green.

- [ ] **Step 2: Document local run with a real GitHub OAuth app**

Append to `core/README.md`:

```markdown
## Running locally

1. Create a GitHub OAuth App (Settings → Developer settings → OAuth Apps).
   - Homepage URL: `http://localhost:8080`
   - Authorization callback URL: `http://localhost:8080/login/oauth2/code/github`
2. Export credentials and (optionally) super-admin logins:
   ```bash
   export GITHUB_CLIENT_ID=...        # from the OAuth App
   export GITHUB_CLIENT_SECRET=...
   export SUPER_ADMIN_GITHUB_LOGINS=your-github-login
   ```
3. Start Postgres + the app (Spring Boot docker-compose support starts `compose.yaml`):
   ```bash
   ./mvnw spring-boot:run
   ```
4. Log in by visiting `http://localhost:8080/oauth2/authorization/github`.
   After the GitHub redirect, `GET /api/me` returns your provisioned user.
```

- [ ] **Step 3: Commit**

```bash
git add core/README.md
git commit -m "docs: local run instructions for GitHub OAuth login"
```

---

## Self-Review

**Spec coverage:**
- GitHub-only social login, no password → Tasks 5–6 (OAuth2 login, GitHub registration). ✓
- Expose user via HTTP session → Task 6 (Spring Session JDBC schema in `__root` + session principal). ✓
- Take username, email, GitHub id → Tasks 2–3 (`github_id`, `github_login`, `github_name`, `email`). ✓
- UUID v7 own id → Task 2 (`DEFAULT uuidv7()`, version assertion). ✓
- `display_name`/`bg_color_hex` user-owned, never synced → Task 3 test asserts preservation. ✓
- `github_login` + `github_name`, username fallback → `User.username` (Task 2) + controller assertion (Task 6). ✓
- `email_verified` dropped → not present anywhere. ✓
- Module `iam` + dedicated schema `iam` → Task 2 (`CREATE SCHEMA iam`, `@Table(schema = "iam")`). ✓
- Module-based Flyway migrations (independent versioning) → Task 2 (enable property, `db/migration/iam/V1`) + Task 6 (`db/migration/__root/V1`). ✓
- Super-admin role via allowlist → Tasks 3, 5, 6 (`SuperAdminProperties`, `ROLE_SUPER_ADMIN`, `/api/super-admin/**` 403 test). ✓
- 401 (not redirect) for unauthenticated API → Task 6 (`HttpStatusEntryPoint`, 401 test). ✓
- Self-service `PATCH /api/me` → Tasks 4, 6. ✓
- Same-origin CSRF (`SameSite=Lax`, cookie token) → Task 6 (`CookieCsrfTokenRepository`). ✓
- Modulith encapsulation → Task 7. ✓
- Postgres 18 pin → Task 1. ✓

**Placeholder scan:** No TBD/TODO; every code step contains full code; every run step has an expected outcome.

**Type consistency:** `User` fields (`githubLogin`, `githubName`, `displayName`, `bgColorHex`, `isSuperAdmin`, `username`) are used identically across tasks. `provision(githubId, login, name, email)` signature matches between Task 3 (definition), Task 5 (override + call site). `UserProfileService.update(userId, displayName, bgColorHex)` matches between Task 4 and Task 6 mock. `CountdownOAuth2User(user, attributes)` constructor matches across Tasks 5–6. `MeResponse` field names match the controller-test JSON paths. All packages are `org.unividuell.countdown.core.iam[.internal]`.

**Notes carried into implementation:**
- `SuperAdminProperties` and `UserProvisioningService` are `open` so the Task 5 unit test can subclass them without a database (called out in Tasks 3 and 5).
- Module-based Flyway requires migrations in per-module subfolders (`db/migration/iam`, `db/migration/__root`) and ArchUnit on the runtime classpath; scripts directly under `db/migration` are ignored.
