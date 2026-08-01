# Super-Admin Area (Overview + Community List) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an unlinked, read-only super-admin area at `/super-admin` with a roster of super-admins and a page listing every community with its full member roster.

**Architecture:** Two new read-only endpoints under the already-role-gated `/api/super-admin/**` namespace — one in the `community` module (system-wide community + member view), one in `iam` (super-admin roster from the DB flag *and* the configured allowlist). The frontend adds a `super-admin.vue` shell that owns the access check, with two child pages. No new Spring Modulith module, no new table, no migration.

**Tech Stack:** Kotlin 2.3 / Spring Boot 4.1 / Spring Modulith 2.1 / Spring Data JDBC / PostgreSQL 18 · Vue 3 + Vite 8 + TypeScript (strict) + Vue Router 5 file-based routing + Tailwind v4 + Luxon · Tests: mockk + kotest + MockMvc Kotlin DSL + Testcontainers (backend), Vitest + `vi` + `@vue/test-utils` + happy-dom (frontend).

**Spec:** `docs/superpowers/specs/2026-08-01-super-admin-community-overview-design.md`

## Global Constraints

- Backend commands run from `core/`; frontend commands from `webapp-vue/`.
- **No authorization code in either new controller.** `authorize("/api/super-admin/**", hasRole("SUPER_ADMIN"))` in `iam.internal.SecurityConfig` is the single gate; anything reaching these controllers is already a super-admin.
- **Read-only.** No POST/PATCH/DELETE anywhere in this feature.
- Exposed API lives in the module base package (`community.*`, `iam.*`); everything else in `<module>.internal`. `ModularityTests` must stay green.
- No `@Column` annotations; entities pin their schema via `@Table(schema = …)`.
- Kotlin tests use **mockk + kotest matchers + MockMvc Kotlin DSL**. Frontend tests use **`vi`**, never mockk.
- TypeScript is very strict: `noUncheckedIndexedAccess` (index access needs `!` or a guard), `exactOptionalPropertyTypes`, `verbatimModuleSyntax` (type-only imports need `import type`).
- Luxon for all date formatting; never native `Date` math, never the implicit browser zone.
- UI copy is German.
- Nothing in the app links to `/super-admin`. Do not add a menu entry, nav link, or switcher entry.

---

## File Structure

**Backend — `community` module** (system-wide community view)

| File | Responsibility |
| --- | --- |
| `core/src/main/kotlin/org/unividuell/countdown/core/iam/UserQuery.kt` (modify) | Add the batch lookup `findAllById` to the exposed port |
| `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserQueryService.kt` (modify) | Implement it |
| `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityDtos.kt` (modify) | Add `SuperAdminCommunityResponse` + `SuperAdminMemberResponse` |
| `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/SuperAdminOverviewService.kt` (create) | Assemble the read model in three queries |
| `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/SuperAdminController.kt` (create) | `GET /api/super-admin/communities` |

**Backend — `iam` module** (roster)

| File | Responsibility |
| --- | --- |
| `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserRepository.kt` (modify) | Two explicit `@Query` lookups |
| `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminRosterService.kt` (create) | Merge DB flag + allowlist, case-insensitively; holds `SuperAdminUserResponse` |
| `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserController.kt` (create) | `GET /api/super-admin/super-admins` |
| `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/Slugs.kt` (modify) | Reserve the `super-admin` slug |

**Frontend**

| File | Responsibility |
| --- | --- |
| `webapp-vue/src/api/types.ts` (modify) | `SuperAdminUser`, `SuperAdminCommunity`, `SuperAdminMember` |
| `webapp-vue/src/api/superAdmin.ts` (create) | `listSuperAdmins()`, `listAllCommunities()` |
| `webapp-vue/src/pages/super-admin.vue` (create) | Shell: access check + header + `<RouterView/>` |
| `webapp-vue/src/pages/super-admin/index.vue` (create) | Roster table + link onward |
| `webapp-vue/src/pages/super-admin/communities.vue` (create) | Community overview |

Route mechanics: `super-admin.vue` + `super-admin/*.vue` is the same layout pairing already used by `[slug].vue` + `[slug]/*.vue`. Vue Router matches the static `/super-admin` before the dynamic `/:slug`, so no router or guard configuration changes.

---

### Task 1: Community overview endpoint

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/UserQuery.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserQueryService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityDtos.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/SuperAdminOverviewService.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/SuperAdminController.kt`
- Create: `core/src/test/kotlin/org/unividuell/countdown/core/TestPrincipals.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/SuperAdminOverviewServiceTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/SuperAdminControllerTest.kt`
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityControllerTest.kt` (drop its local `principal` helper)
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserControllerTest.kt` (drop its local `principalFor` helper)

**Interfaces:**
- Consumes: `CommunityRepository` (`findBySlug`, `findByInviteToken`, plus `CrudRepository.findAll()`), `CommunityMemberRepository` (`CrudRepository.findAll()`), the exposed types `Community`, `CommunityMember`, `MemberStatus`, `User`.
- Produces:
  - `iam.UserQuery.findAllById(ids: Collection<UUID>): List<User>`
  - `community.internal.SuperAdminMemberResponse(userId: UUID, username: String, githubLogin: String, status: String, isAdmin: Boolean, joinedAt: Instant?)`
  - `community.internal.SuperAdminCommunityResponse(id: UUID, name: String, slug: String, startsAt: Instant?, startsAtTimezone: String, createdAt: Instant?, members: List<SuperAdminMemberResponse>)`
  - `community.internal.SuperAdminOverviewService.overview(): List<SuperAdminCommunityResponse>`
  - `GET /api/super-admin/communities`

Why this service gets a **pure mockk unit test** while Task 2's gets a Spring integration test: this one is assembly only (group, resolve, sort) over stock `CrudRepository` methods — there is no custom SQL to prove against Postgres, and the one-batch-lookup guarantee is only observable on a mock. Task 2 runs hand-written SQL and binds a real config property, so it needs the container.

- [ ] **Step 1: Write the failing service test**

Create `core/src/test/kotlin/org/unividuell/countdown/core/community/SuperAdminOverviewServiceTest.kt`:

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.community.internal.SuperAdminOverviewService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import java.time.Instant
import java.util.UUID

/**
 * Pure mockk unit test: the service is assembly only (group, resolve, sort) over stock
 * CrudRepository methods — no custom SQL to prove against Postgres, and the
 * one-batch-lookup guarantee is only observable on a mock.
 */
class SuperAdminOverviewServiceTest {
    private val communities = mockk<CommunityRepository>()
    private val members = mockk<CommunityMemberRepository>()
    private val users = mockk<UserQuery>()
    private val service = SuperAdminOverviewService(communities, members, users)

    private val alphaId = UUID.fromString("018f0000-0000-7000-8000-0000000000a1")
    private val zuluId = UUID.fromString("018f0000-0000-7000-8000-0000000000b1")
    private val aliceId = UUID.fromString("018f0000-0000-7000-8000-0000000000c1")
    private val bobId = UUID.fromString("018f0000-0000-7000-8000-0000000000c2")
    private val ghostId = UUID.fromString("018f0000-0000-7000-8000-0000000000c3")

    private fun community(id: UUID, name: String, slug: String) = Community(
        id = id, name = name, slug = slug, createdBy = aliceId,
        createdAt = Instant.parse("2026-01-01T00:00:00Z"),
    )

    private fun member(communityId: UUID, userId: UUID, status: MemberStatus, isAdmin: Boolean) =
        CommunityMember(
            id = UUID.randomUUID(), communityId = communityId, userId = userId,
            status = status, isAdmin = isAdmin, createdAt = Instant.parse("2026-02-01T00:00:00Z"),
        )

    private fun user(id: UUID, login: String, name: String) =
        User(id = id, githubId = id.leastSignificantBits, githubLogin = login, displayName = name)

    @Test
    fun `sorts communities by name and members admins-active-pending, resolving users in one batch`() {
        every { communities.findAll() } returns listOf(
            community(zuluId, "Zulu", "zulu"),
            community(alphaId, "alpha", "alpha"),
        )
        every { members.findAll() } returns listOf(
            member(alphaId, bobId, MemberStatus.PENDING, isAdmin = false),
            member(alphaId, ghostId, MemberStatus.ACTIVE, isAdmin = false),
            member(alphaId, aliceId, MemberStatus.ACTIVE, isAdmin = true),
            member(zuluId, aliceId, MemberStatus.ACTIVE, isAdmin = true),
        )
        // ghostId is deliberately absent: a membership whose user row is gone must stay visible.
        every { users.findAllById(any()) } returns listOf(
            user(aliceId, "alice", "Alice"),
            user(bobId, "bob", "Bob"),
        )

        val result = service.overview()

        // case-insensitive name order: "alpha" before "Zulu"
        result.map { it.slug } shouldContainExactly listOf("alpha", "zulu")
        result[0].members.map { it.username } shouldContainExactly listOf("Alice", "?", "Bob")
        result[0].members[1].githubLogin shouldBe "?"
        result[0].members[2].status shouldBe "PENDING"
        result[0].members[0].isAdmin shouldBe true
        result[0].members[0].joinedAt shouldBe Instant.parse("2026-02-01T00:00:00Z")
        verify(exactly = 1) { users.findAllById(any()) }
    }

    @Test
    fun `a community without members yields an empty roster`() {
        every { communities.findAll() } returns listOf(community(alphaId, "Alpha", "alpha"))
        every { members.findAll() } returns emptyList()
        every { users.findAllById(emptyList()) } returns emptyList()

        val result = service.overview()

        result shouldHaveSize 1
        result[0].members shouldBe emptyList()
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=SuperAdminOverviewServiceTest`
Expected: COMPILATION FAILURE — `Unresolved reference: SuperAdminOverviewService` and `Unresolved reference: findAllById`.

- [ ] **Step 3: Add the batch lookup to the exposed `UserQuery` port**

Replace the body of `core/src/main/kotlin/org/unividuell/countdown/core/iam/UserQuery.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import java.util.UUID

/** Read-only access to users, for consumption by other modules. */
interface UserQuery {
    fun findById(id: UUID): User?

    /** Batch lookup. Callers rendering many rows must use this instead of a findById per row. */
    fun findAllById(ids: Collection<UUID>): List<User>
}
```

Add the implementation to `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserQueryService.kt`, inside the class body after `findById`:

```kotlin
    @Transactional(readOnly = true)
    override fun findAllById(ids: Collection<UUID>): List<User> =
        if (ids.isEmpty()) emptyList() else repository.findAllById(ids).toList()
```

- [ ] **Step 4: Add the DTOs**

Append to `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityDtos.kt`:

```kotlin
data class SuperAdminMemberResponse(
    val userId: UUID, val username: String, val githubLogin: String,
    val status: String, val isAdmin: Boolean, val joinedAt: Instant?,
)
data class SuperAdminCommunityResponse(
    val id: UUID, val name: String, val slug: String,
    val startsAt: Instant?, val startsAtTimezone: String, val createdAt: Instant?,
    val members: List<SuperAdminMemberResponse>,
)
```

- [ ] **Step 5: Implement the service**

Create `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/SuperAdminOverviewService.kt`:

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery

/**
 * System-wide read model for the super-admin area: every community with its full roster.
 *
 * Three queries regardless of how many communities exist. MemberController resolves one user
 * per row, which is bounded by a single community; here that same shape would be an N+1 across
 * the whole system, so users are fetched in one batch.
 */
@Service
class SuperAdminOverviewService(
    private val communities: CommunityRepository,
    private val members: CommunityMemberRepository,
    private val users: UserQuery,
) {
    @Transactional(readOnly = true)
    fun overview(): List<SuperAdminCommunityResponse> {
        val allMembers = members.findAll().toList()
        val byCommunity = allMembers.groupBy { it.communityId }
        val usersById = users.findAllById(allMembers.map { it.userId }.distinct()).associateBy { it.id }

        return communities.findAll()
            .sortedBy { it.name.lowercase() }
            .map { c ->
                // Local non-null id: byCommunity is keyed on UUID, and Community.id is UUID?.
                val id = requireNotNull(c.id)
                SuperAdminCommunityResponse(
                    id = id,
                    name = c.name,
                    slug = c.slug,
                    startsAt = c.startsAt,
                    startsAtTimezone = c.startsAtTimezone,
                    createdAt = c.createdAt,
                    members = byCommunity[id].orEmpty()
                        .map { it.toResponse(usersById[it.userId]) }
                        .sortedWith(MEMBER_ORDER),
                )
            }
    }

    private fun CommunityMember.toResponse(user: User?) = SuperAdminMemberResponse(
        userId = userId,
        username = user?.username ?: UNKNOWN,
        githubLogin = user?.githubLogin ?: UNKNOWN,
        status = status.name,
        isAdmin = isAdmin,
        joinedAt = createdAt,
    )

    private companion object {
        /** A membership whose user row is gone stays visible rather than vanishing. */
        const val UNKNOWN = "?"
        val MEMBER_ORDER = compareBy<SuperAdminMemberResponse>(
            { if (it.isAdmin) 0 else 1 },
            { if (it.status == MemberStatus.ACTIVE.name) 0 else 1 },
            { it.username.lowercase() },
        )
    }
}
```

- [ ] **Step 6: Run the service test to verify it passes**

Run: `cd core && ./mvnw test -Dtest=SuperAdminOverviewServiceTest`
Expected: PASS, 2 tests.

- [ ] **Step 7: Extract the shared MockMvc principal helper**

Two test classes already carry near-identical copies of this helper, and this plan adds two more. Extract it once before writing the third copy.

Create `core/src/test/kotlin/org/unividuell/countdown/core/TestPrincipals.kt` (package `org.unividuell.countdown.core`, next to `TestcontainersConfiguration`). Return types are inferred deliberately — `authentication()`'s return type moved packages between Spring versions, and inference sidesteps the import.

```kotlin
package org.unividuell.countdown.core

import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import java.util.UUID

/** Stable id for the authenticated test principal, so tests can assert against a fixed UUID. */
val TEST_USER_ID: UUID = UUID.fromString("018f0000-0000-7000-8000-000000000000")

/** Authenticates a MockMvc request as [user], the shape the real OAuth2 login produces. */
fun principalFor(user: User) =
    authentication(
        OAuth2AuthenticationToken(
            CountdownOAuth2User(user, mapOf("login" to user.githubLogin)),
            CountdownOAuth2User(user, emptyMap()).authorities,
            "github",
        )
    )

/** For tests that care only about the role, not the user's other fields. */
fun principalFor(
    id: UUID = TEST_USER_ID,
    superAdmin: Boolean = false,
    githubLogin: String = "octocat",
) = principalFor(User(id = id, githubId = 1L, githubLogin = githubLogin, isSuperAdmin = superAdmin))
```

Then migrate the two existing call sites:

- `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityControllerTest.kt` — delete its private `principal(superAdmin: Boolean = false)` function and the now-unused `OAuth2AuthenticationToken` / `authentication` / `CountdownOAuth2User` imports; replace `private val uid = UUID.fromString("018f0000-0000-7000-8000-000000000000")` with `private val uid = TEST_USER_ID`; replace every `with(principal())` with `with(principalFor())` and every `with(principal(superAdmin = true))` with `with(principalFor(superAdmin = true))`. Add `import org.unividuell.countdown.core.TEST_USER_ID` and `import org.unividuell.countdown.core.principalFor`.
- `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserControllerTest.kt` — delete its private `principalFor(user: User)` function and the now-unused `OAuth2AuthenticationToken` / `authentication` / `CountdownOAuth2User` imports; replace `private val uid = UUID.fromString("018f0000-0000-7000-8000-000000000000")` with `private val uid = TEST_USER_ID`. Its call sites already read `principalFor(user(...))` and keep working against the shared overload. Add `import org.unividuell.countdown.core.TEST_USER_ID` and `import org.unividuell.countdown.core.principalFor`.

Run: `cd core && ./mvnw test -Dtest='CommunityControllerTest,UserControllerTest'`
Expected: PASS — pure refactor, no behavior change. Fix any leftover unused-import warnings before moving on.

- [ ] **Step 8: Write the failing controller test**

Create `core/src/test/kotlin/org/unividuell/countdown/core/community/SuperAdminControllerTest.kt`:

```kotlin
package org.unividuell.countdown.core.community

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
import org.unividuell.countdown.core.community.internal.SuperAdminCommunityResponse
import org.unividuell.countdown.core.community.internal.SuperAdminMemberResponse
import org.unividuell.countdown.core.community.internal.SuperAdminOverviewService
import org.unividuell.countdown.core.principalFor
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class SuperAdminControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var overview: SuperAdminOverviewService

    private val uid = TEST_USER_ID

    @Test
    fun `forbidden for a non-super-admin`() {
        mockMvc.get("/api/super-admin/communities") { with(principalFor(superAdmin = false)) }
            .andExpect { status { isForbidden() } }
    }

    @Test
    fun `returns the system-wide overview for a super-admin`() {
        every { overview.overview() } returns listOf(
            SuperAdminCommunityResponse(
                id = UUID.fromString("018f0000-0000-7000-8000-0000000000a1"),
                name = "Alpha", slug = "alpha", startsAt = null,
                startsAtTimezone = "Europe/Berlin",
                createdAt = Instant.parse("2026-01-01T00:00:00Z"),
                members = listOf(
                    SuperAdminMemberResponse(
                        userId = uid, username = "Alice", githubLogin = "alice",
                        status = "ACTIVE", isAdmin = true,
                        joinedAt = Instant.parse("2026-02-01T00:00:00Z"),
                    ),
                ),
            ),
        )
        mockMvc.get("/api/super-admin/communities") { with(principalFor(superAdmin = true)) }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].slug") { value("alpha") }
                jsonPath("$[0].startsAtTimezone") { value("Europe/Berlin") }
                jsonPath("$[0].members[0].githubLogin") { value("alice") }
                jsonPath("$[0].members[0].isAdmin") { value(true) }
            }
    }
}
```

- [ ] **Step 9: Run the controller test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=SuperAdminControllerTest`
Expected: the `super-admin` case FAILS with 404 (no handler mapped yet). The `forbidden` case already passes — the SecurityConfig rule predates this feature; keep it as the regression guard for that rule.

- [ ] **Step 10: Implement the controller**

Create `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/SuperAdminController.kt`:

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * System-wide community view for the super-admin area.
 *
 * No authorization check and no principal parameter on purpose: the whole `/api/super-admin`
 * tree is gated centrally by `hasRole("SUPER_ADMIN")` in iam's SecurityConfig, so anything that
 * reaches this controller is already a super-admin.
 *
 * Note: do not write the glob form of that path inside this KDoc — Kotlin block comments nest,
 * so an embedded slash-star-star opens a nested comment and leaves the file unclosed.
 */
@RestController
@RequestMapping("/api/super-admin/communities")
class SuperAdminController(private val overview: SuperAdminOverviewService) {
    @GetMapping
    fun communities(): List<SuperAdminCommunityResponse> = overview.overview()
}
```

- [ ] **Step 11: Run the task's backend tests to verify they pass**

Run: `cd core && ./mvnw test -Dtest='SuperAdminOverviewServiceTest,SuperAdminControllerTest,CommunityControllerTest,UserControllerTest'`
Expected: PASS — 4 new tests plus the two migrated classes still green.

- [ ] **Step 12: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam core/src/main/kotlin/org/unividuell/countdown/core/community core/src/test/kotlin/org/unividuell/countdown/core
git commit -m "feat(core): add the system-wide community overview for super-admins

GET /api/super-admin/communities returns every community with its full member
roster. UserQuery gains a batch findAllById because the per-row lookup in
MemberController, bounded to one community there, would be an N+1 across the
whole system here.

The MockMvc principal helper moves to a shared TestPrincipals, replacing the
copies in CommunityControllerTest and UserControllerTest rather than adding a
third."
```

---

### Task 2: Super-admin roster endpoint

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserRepository.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminRosterService.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminRosterServiceTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserControllerTest.kt`

**Interfaces:**
- Consumes: `UserRepository`, `SuperAdminProperties` (`superAdminGithubLogins: List<String>`) — both already in `iam.internal`. Nothing from another module. The controller test uses `org.unividuell.countdown.core.principalFor` and `TEST_USER_ID`, the shared helper Task 1 extracted.
- Produces:
  - `iam.internal.SuperAdminUserResponse(githubLogin: String, username: String?, userId: UUID?, flagged: Boolean, allowlisted: Boolean, createdAt: Instant?)`
  - `iam.internal.SuperAdminRosterService.roster(): List<SuperAdminUserResponse>`
  - `GET /api/super-admin/super-admins`

Two facts that drive the whole task: the allowlist grants the role **case-insensitively** (`SuperAdminProperties.isSuperAdmin` uses `equals(…, ignoreCase = true)`), and the `is_super_admin` column is re-derived from that allowlist on **every login**, so the two sources legitimately disagree.

- [ ] **Step 1: Write the failing roster tests**

Create `core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminRosterServiceTest.kt`. Note the two classes: an empty allowlist is a distinct Spring context *and* the guard against generating `IN ()`, which is a SQL syntax error.

```kotlin
package org.unividuell.countdown.core.iam

import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.TestPropertySource
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.SuperAdminRosterService
import org.unividuell.countdown.core.iam.internal.UserRepository

/**
 * Integration test on purpose: the roster runs hand-written SQL (`lower(github_login) IN (…)`)
 * and binds the real allowlist property — neither is exercised by a mock.
 * `test-auth.enabled=false` keeps the seeded Futurama users out of this context.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(properties = ["app.super-admin-github-logins=BossUser,ghost", "app.test-auth.enabled=false"])
class SuperAdminRosterServiceTest(
    @Autowired val service: SuperAdminRosterService,
    @Autowired val users: UserRepository,
) {
    @Test
    fun `matches an allowlist entry to a differently-cased github login exactly once`() {
        users.save(User(githubId = 501L, githubLogin = "bossuser", displayName = "Boss", isSuperAdmin = true))

        val rows = service.roster().filter { it.githubLogin.lowercase() == "bossuser" }

        rows shouldHaveSize 1
        rows[0].flagged shouldBe true
        rows[0].allowlisted shouldBe true
        rows[0].username shouldBe "Boss"
    }

    @Test
    fun `an allowlist entry without a user row awaits its first login`() {
        val row = service.roster().single { it.githubLogin == "ghost" }

        row.flagged shouldBe false
        row.allowlisted shouldBe true
        row.userId.shouldBeNull()
        row.createdAt.shouldBeNull()
        row.username.shouldBeNull()
    }

    @Test
    fun `a flagged user missing from the allowlist is reported as stale`() {
        users.save(User(githubId = 502L, githubLogin = "removed", isSuperAdmin = true))

        val row = service.roster().single { it.githubLogin == "removed" }

        row.flagged shouldBe true
        row.allowlisted shouldBe false
    }
}

/** Separate context: the empty default must not produce `IN ()`. */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(properties = ["app.super-admin-github-logins=", "app.test-auth.enabled=false"])
class SuperAdminRosterEmptyAllowlistTest(
    @Autowired val service: SuperAdminRosterService,
    @Autowired val users: UserRepository,
) {
    @Test
    fun `an empty allowlist returns only flagged users`() {
        users.save(User(githubId = 503L, githubLogin = "onlyflagged", isSuperAdmin = true))

        val row = service.roster().single { it.githubLogin == "onlyflagged" }

        row.flagged shouldBe true
        row.allowlisted shouldBe false
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd core && ./mvnw test -Dtest='SuperAdminRosterServiceTest,SuperAdminRosterEmptyAllowlistTest'`
Expected: COMPILATION FAILURE — `Unresolved reference: SuperAdminRosterService`.

- [ ] **Step 3: Add the repository queries**

Add to the `UserRepository` interface in `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserRepository.kt` (the file needs `import org.springframework.data.jdbc.repository.query.Query`):

```kotlin
    /**
     * Explicit SQL rather than a derived `findByIsSuperAdminTrue()`: the property is already
     * named `isSuperAdmin`, and Spring Data strips a leading `Is` as a keyword, so the derived
     * name is ambiguous.
     */
    @Query("SELECT * FROM iam.users WHERE is_super_admin = true")
    fun findSuperAdmins(): List<User>

    /**
     * Lowercased match, because the allowlist grants the role case-insensitively — a configured
     * `BossUser` must find a stored `bossuser`. Never call with an empty collection: it renders
     * `IN ()`, which is a SQL syntax error.
     */
    @Query("SELECT * FROM iam.users WHERE lower(github_login) IN (:logins)")
    fun findByGithubLoginLowercaseIn(logins: Collection<String>): List<User>
```

- [ ] **Step 4: Implement the roster service and its DTO**

Create `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminRosterService.kt`. The DTO lives here rather than with the controller (where `UserController.kt` keeps `MeResponse`) because it is the service's return type — putting it in the controller file would force that file into existence before its own test.

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.iam.User
import java.time.Instant
import java.util.UUID

/**
 * A super-admin as seen from both sources: `flagged` is the `is_super_admin` column,
 * `allowlisted` is membership in `app.super-admin-github-logins`. `username`, `userId` and
 * `createdAt` are null for an allowlist entry that has never logged in.
 */
data class SuperAdminUserResponse(
    val githubLogin: String,
    val username: String?,
    val userId: UUID?,
    val flagged: Boolean,
    val allowlisted: Boolean,
    val createdAt: Instant?,
)

/**
 * Who holds super-admin rights, from both sources — they drift by design. `is_super_admin` is
 * re-derived from the allowlist on every login, so someone newly allowlisted has no flag yet and
 * someone removed keeps it until their next sign-in. Reporting only one source would hide exactly
 * the state this endpoint exists to show, so rows carry both raw facts and the caller labels them.
 */
@Service
class SuperAdminRosterService(
    private val users: UserRepository,
    private val properties: SuperAdminProperties,
) {
    @Transactional(readOnly = true)
    fun roster(): List<SuperAdminUserResponse> {
        // Blank entries are real: the empty env default binds a ghost element.
        val allowlist = properties.superAdminGithubLogins
            .filter { it.isNotBlank() }
            .map { it.lowercase() }
            .toSet()

        val flagged = users.findSuperAdmins()
        val allowlisted =
            if (allowlist.isEmpty()) emptyList() else users.findByGithubLoginLowercaseIn(allowlist)

        val byLogin = (flagged + allowlisted).associateBy { it.githubLogin.lowercase() }
        val withoutUserRow = allowlist - byLogin.keys

        return (
            byLogin.map { (login, user) -> user.toRow(allowlisted = login in allowlist) } +
                withoutUserRow.map {
                    SuperAdminUserResponse(
                        githubLogin = it, username = null, userId = null,
                        flagged = false, allowlisted = true, createdAt = null,
                    )
                }
            ).sortedBy { it.githubLogin.lowercase() }
    }

    private fun User.toRow(allowlisted: Boolean) = SuperAdminUserResponse(
        githubLogin = githubLogin,
        username = username,
        userId = id,
        flagged = isSuperAdmin,
        allowlisted = allowlisted,
        createdAt = createdAt,
    )
}
```

- [ ] **Step 5: Run the roster tests to verify they pass**

Run: `cd core && ./mvnw test -Dtest='SuperAdminRosterServiceTest,SuperAdminRosterEmptyAllowlistTest'`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing controller test**

Create `core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserControllerTest.kt`:

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
import org.unividuell.countdown.core.iam.internal.SuperAdminRosterService
import org.unividuell.countdown.core.iam.internal.SuperAdminUserResponse
import org.unividuell.countdown.core.principalFor
import java.time.Instant

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class SuperAdminUserControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var roster: SuperAdminRosterService

    private val uid = TEST_USER_ID

    @Test
    fun `forbidden for a non-super-admin`() {
        mockMvc.get("/api/super-admin/super-admins") { with(principalFor(superAdmin = false)) }
            .andExpect { status { isForbidden() } }
    }

    @Test
    fun `returns the roster for a super-admin`() {
        every { roster.roster() } returns listOf(
            SuperAdminUserResponse(
                githubLogin = "boss", username = "Boss", userId = uid,
                flagged = true, allowlisted = true,
                createdAt = Instant.parse("2026-01-01T00:00:00Z"),
            ),
            SuperAdminUserResponse(
                githubLogin = "ghost", username = null, userId = null,
                flagged = false, allowlisted = true, createdAt = null,
            ),
        )
        mockMvc.get("/api/super-admin/super-admins") { with(principalFor(superAdmin = true)) }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].githubLogin") { value("boss") }
                jsonPath("$[0].flagged") { value(true) }
                jsonPath("$[1].githubLogin") { value("ghost") }
                // Present-and-null, not omitted: no NON_NULL inclusion is configured, and the
                // frontend type is `string | null`. `doesNotExist()` would therefore be wrong.
                jsonPath("$[1].userId") { isEmpty() }
                jsonPath("$[1].allowlisted") { value(true) }
            }
    }
}
```

- [ ] **Step 7: Run the controller test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=SuperAdminUserControllerTest`
Expected: `forbidden for a non-super-admin` PASSES (the SecurityConfig rule predates this feature — keep it as that rule's regression guard); `returns the roster for a super-admin` FAILS with 404, because no handler is mapped yet.

- [ ] **Step 8: Implement the controller**

Create `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminUserController.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * No authorization check and no principal parameter on purpose: the super-admin path prefix is
 * gated centrally by `hasRole("SUPER_ADMIN")` in SecurityConfig.
 *
 * Note: do not write the glob form of that path inside this KDoc — Kotlin block comments nest,
 * so an embedded slash-star-star opens a nested comment and leaves the file unclosed.
 */
@RestController
@RequestMapping("/api/super-admin/super-admins")
class SuperAdminUserController(private val roster: SuperAdminRosterService) {
    @GetMapping
    fun superAdmins(): List<SuperAdminUserResponse> = roster.roster()
}
```

- [ ] **Step 9: Run both roster test classes plus the controller test**

Run: `cd core && ./mvnw test -Dtest='SuperAdminRosterServiceTest,SuperAdminRosterEmptyAllowlistTest,SuperAdminUserControllerTest'`
Expected: PASS, 6 tests.

- [ ] **Step 10: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam core/src/test/kotlin/org/unividuell/countdown/core/iam
git commit -m "feat(core): add the super-admin roster endpoint

GET /api/super-admin/super-admins unions the is_super_admin column with the
SUPER_ADMIN_GITHUB_LOGINS allowlist and reports both raw facts per row. The two
drift by design — the flag is re-derived on every login — so showing one source
alone would hide the state the endpoint exists to reveal.

The lookup joins on a lowercased login because the allowlist itself grants the
role case-insensitively; without that, BossUser and bossuser become two rows.
Flagged users are fetched with explicit SQL because a derived
findByIsSuperAdminTrue() is ambiguous against a property named isSuperAdmin."
```

---

### Task 3: Reserve the `super-admin` slug

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/Slugs.kt:7`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/SlugsTest.kt`

**Interfaces:**
- Consumes: `Slugs.RESERVED`, `Slugs.isReserved` (already used by `CommunityService.create`).
- Produces: nothing new — `isReserved("super-admin")` now returns true.

The frontend route `/super-admin` is a static sibling of `[slug].vue` and wins route matching, so a community with that slug would be permanently unreachable. Blocking it at creation is the fix.

- [ ] **Step 1: Add the failing assertion**

In `core/src/test/kotlin/org/unividuell/countdown/core/community/SlugsTest.kt`, add this line to the existing reserved-slug test (next to `Slugs.isReserved("join") shouldBe true`):

```kotlin
        Slugs.isReserved("super-admin") shouldBe true
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=SlugsTest`
Expected: FAIL — `expected:<true> but was:<false>`.

- [ ] **Step 3: Reserve the slug**

In `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/Slugs.kt`, replace the `RESERVED` line:

```kotlin
    // "super-admin" is a static frontend route and would shadow a community with that slug.
    val RESERVED = setOf("api", "oauth2", "login", "logout", "communities", "join", "super-admin")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd core && ./mvnw test -Dtest=SlugsTest`
Expected: PASS.

- [ ] **Step 5: Run the whole backend suite**

Run: `cd core && ./mvnw test`
Expected: PASS, including `ModularityTests` — the new controllers add no module dependency edge (`community → iam` already exists via `UserQuery`; the roster is iam-internal only).

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/internal/Slugs.kt core/src/test/kotlin/org/unividuell/countdown/core/community/SlugsTest.kt
git commit -m "feat(core): reserve the super-admin slug

The SPA route /super-admin is static and outranks the dynamic /:slug, so a
community created with that slug would be unreachable forever."
```

---

### Task 4: Frontend API client and types

**Files:**
- Modify: `webapp-vue/src/api/types.ts`
- Create: `webapp-vue/src/api/superAdmin.ts`
- Test: `webapp-vue/src/api/__tests__/superAdmin.spec.ts`

**Interfaces:**
- Consumes: `apiFetch<T>(path, options?)` from `@/api/client`.
- Produces:
  - `SuperAdminMember { userId: string; username: string; githubLogin: string; status: 'PENDING' | 'ACTIVE'; isAdmin: boolean; joinedAt: string | null }`
  - `SuperAdminCommunity { id: string; name: string; slug: string; startsAt: string | null; startsAtTimezone: string; createdAt: string | null; members: SuperAdminMember[] }`
  - `SuperAdminUser { githubLogin: string; username: string | null; userId: string | null; flagged: boolean; allowlisted: boolean; createdAt: string | null }`
  - `listSuperAdmins(): Promise<SuperAdminUser[]>`, `listAllCommunities(): Promise<SuperAdminCommunity[]>`

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/api/__tests__/superAdmin.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as client from '@/api/client'
import { listAllCommunities, listSuperAdmins } from '@/api/superAdmin'

vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof client>()), apiFetch: vi.fn() }))
const apiFetch = vi.mocked(client.apiFetch)

describe('super-admin api', () => {
  beforeEach(() => apiFetch.mockReset())

  it('lists super-admins', async () => {
    apiFetch.mockResolvedValue([
      {
        githubLogin: 'boss',
        username: 'Boss',
        userId: 'u1',
        flagged: true,
        allowlisted: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ])
    const rows = await listSuperAdmins()
    expect(apiFetch).toHaveBeenCalledWith('/api/super-admin/super-admins')
    expect(rows[0]!.githubLogin).toBe('boss')
  })

  it('lists all communities with their members', async () => {
    apiFetch.mockResolvedValue([
      {
        id: 'c1',
        name: 'Team',
        slug: 'team',
        startsAt: null,
        startsAtTimezone: 'Europe/Berlin',
        createdAt: '2026-01-01T00:00:00Z',
        members: [
          {
            userId: 'u1',
            username: 'Alice',
            githubLogin: 'alice',
            status: 'ACTIVE',
            isAdmin: true,
            joinedAt: '2026-02-01T00:00:00Z',
          },
        ],
      },
    ])
    const rows = await listAllCommunities()
    expect(apiFetch).toHaveBeenCalledWith('/api/super-admin/communities')
    expect(rows[0]!.members[0]!.isAdmin).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd webapp-vue && pnpm test src/api/__tests__/superAdmin.spec.ts`
Expected: FAIL — `Failed to resolve import "@/api/superAdmin"`.

- [ ] **Step 3: Add the types**

Append to `webapp-vue/src/api/types.ts`:

```ts
export interface SuperAdminMember {
  userId: string
  username: string
  githubLogin: string
  status: 'PENDING' | 'ACTIVE'
  isAdmin: boolean
  joinedAt: string | null
}
export interface SuperAdminCommunity {
  id: string
  name: string
  slug: string
  startsAt: string | null
  startsAtTimezone: string
  createdAt: string | null
  members: SuperAdminMember[]
}
/**
 * `flagged` is the is_super_admin column, `allowlisted` is membership in
 * SUPER_ADMIN_GITHUB_LOGINS. They drift because the flag is re-derived on every login.
 */
export interface SuperAdminUser {
  githubLogin: string
  username: string | null
  userId: string | null
  flagged: boolean
  allowlisted: boolean
  createdAt: string | null
}
```

- [ ] **Step 4: Add the client module**

Create `webapp-vue/src/api/superAdmin.ts`:

```ts
import { apiFetch } from '@/api/client'
import type { SuperAdminCommunity, SuperAdminUser } from '@/api/types'

export const listSuperAdmins = () => apiFetch<SuperAdminUser[]>('/api/super-admin/super-admins')
export const listAllCommunities = () =>
  apiFetch<SuperAdminCommunity[]>('/api/super-admin/communities')
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd webapp-vue && pnpm test src/api/__tests__/superAdmin.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/api
git commit -m "feat(web): add the super-admin api client and types"
```

---

### Task 5: Super-admin shell page

**Files:**
- Create: `webapp-vue/src/pages/super-admin.vue`
- Test: `webapp-vue/src/pages/__tests__/super-admin-shell.spec.ts`

**Interfaces:**
- Consumes: `useAuth()` from `@/auth/useAuth` — `user` is a `Readonly<Ref<MeResponse | null>>` carrying `isSuperAdmin: boolean` and `username: string`.
- Produces: the `/super-admin` layout route. Children render inside its `<RouterView/>` and must contain **no** access logic.

**Test trap to respect:** the shell reads `user?.isSuperAdmin` in the template, which relies on Vue unwrapping a ref. The stub used in `slug-shell.spec.ts` (`user: { value: null }`) is a plain object, not a ref, so unwrapping would silently yield `undefined` and the positive case would never pass. The test below returns a real `ref(...)`.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/pages/__tests__/super-admin-shell.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { useAuth } from '@/auth/useAuth'

vi.mock('vue-router', () => ({
  RouterView: { template: '<div>child-route</div>' },
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
}))
vi.mock('@/auth/useAuth', () => ({ useAuth: vi.fn() }))

// A real ref, not { value: … }: the shell's template relies on Vue unwrapping it.
function mockUser(isSuperAdmin: boolean): void {
  vi.mocked(useAuth).mockReturnValue({
    user: ref({ username: 'Boss', isSuperAdmin }) as never,
    status: ref('authenticated') as never,
    bootstrap: vi.fn(),
    loginWithGitHub: vi.fn(),
    logout: vi.fn(),
    markAnonymous: vi.fn(),
  })
}

describe('super-admin shell', () => {
  beforeEach(() => vi.clearAllMocks())

  it('denies a non-super-admin and never renders the child route', async () => {
    mockUser(false)
    const Shell = (await import('@/pages/super-admin.vue')).default
    const w = mount(Shell)
    expect(w.text()).toContain('Kein Zugriff')
    expect(w.text()).not.toContain('child-route')
  })

  it('renders the child route for a super-admin', async () => {
    mockUser(true)
    const Shell = (await import('@/pages/super-admin.vue')).default
    const w = mount(Shell)
    expect(w.text()).toContain('child-route')
    expect(w.text()).not.toContain('Kein Zugriff')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd webapp-vue && pnpm test src/pages/__tests__/super-admin-shell.spec.ts`
Expected: FAIL — `Failed to resolve import "@/pages/super-admin.vue"`.

- [ ] **Step 3: Implement the shell**

Create `webapp-vue/src/pages/super-admin.vue`:

```vue
<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { useAuth } from '@/auth/useAuth'

// Unlinked area: nothing in the app navigates here, you type the URL. The access check lives
// in the shell so no child page can forget it — and because <RouterView/> is inside the v-else,
// a non-super-admin never mounts a child and therefore never issues a request. The backend
// rule on /api/super-admin/** is the real gate; this is UX.
const { user } = useAuth()
</script>

<template>
  <div v-if="!user?.isSuperAdmin" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Kein Zugriff</h1>
    <p class="text-sm text-neutral-600">Dieser Bereich ist Super-Admins vorbehalten.</p>
  </div>
  <div v-else>
    <header class="mb-4 flex items-center justify-between border-b px-4 py-2">
      <RouterLink to="/super-admin" class="font-semibold hover:underline">Super-Admin</RouterLink>
      <span class="text-sm text-neutral-600">{{ user.username }}</span>
    </header>
    <RouterView />
  </div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd webapp-vue && pnpm test src/pages/__tests__/super-admin-shell.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/pages/super-admin.vue webapp-vue/src/pages/__tests__/super-admin-shell.spec.ts
git commit -m "feat(web): add the super-admin shell with the access check

The shell owns the check so no child page can forget it, and it keeps
<RouterView/> inside the authorised branch — a non-super-admin never mounts a
child, so no child ever fires a request it would get a 403 for."
```

---

### Task 6: Landing page with the super-admin roster

**Files:**
- Create: `webapp-vue/src/pages/super-admin/index.vue`
- Test: `webapp-vue/src/pages/super-admin/__tests__/index.spec.ts`

**Interfaces:**
- Consumes: `listSuperAdmins()` and the `SuperAdminUser` type from Task 4.
- Produces: the `/super-admin` index route. No exported symbols.

Status labels map the two booleans:

| flagged | allowlisted | Label |
| --- | --- | --- |
| ✓ | ✓ | Aktiv |
| ✗ | ✓ | Wartet auf ersten Login |
| ✓ | ✗ | Nicht mehr auf der Allowlist — Flag erlischt beim nächsten Login |

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/pages/super-admin/__tests__/index.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/superAdmin'

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
}))

describe('super-admin landing page', () => {
  beforeEach(() => vi.clearAllMocks())

  it('labels each flag/allowlist combination and links to the community overview', async () => {
    vi.spyOn(api, 'listSuperAdmins').mockResolvedValue([
      {
        githubLogin: 'boss',
        username: 'Boss',
        userId: 'u1',
        flagged: true,
        allowlisted: true,
        createdAt: '2026-01-15T00:00:00Z',
      },
      {
        githubLogin: 'ghost',
        username: null,
        userId: null,
        flagged: false,
        allowlisted: true,
        createdAt: null,
      },
      {
        githubLogin: 'removed',
        username: 'Removed',
        userId: 'u3',
        flagged: true,
        allowlisted: false,
        createdAt: '2026-02-01T00:00:00Z',
      },
    ])
    const Page = (await import('@/pages/super-admin/index.vue')).default
    const w = mount(Page)
    await flushPromises()

    const rows = w.findAll('[data-test=super-admin-row]')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.text()).toContain('Aktiv')
    expect(rows[0]!.text()).toContain('15.01.2026')
    expect(rows[1]!.text()).toContain('Wartet auf ersten Login')
    expect(rows[2]!.text()).toContain('Nicht mehr auf der Allowlist')
    expect(w.find('a[href="/super-admin/communities"]').exists()).toBe(true)
  })

  it('shows an error message when the roster cannot be loaded', async () => {
    vi.spyOn(api, 'listSuperAdmins').mockRejectedValue(new Error('boom'))
    const Page = (await import('@/pages/super-admin/index.vue')).default
    const w = mount(Page)
    await flushPromises()
    expect(w.text()).toContain('konnten nicht geladen werden')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd webapp-vue && pnpm test src/pages/super-admin/__tests__/index.spec.ts`
Expected: FAIL — `Failed to resolve import "@/pages/super-admin/index.vue"`.

- [ ] **Step 3: Implement the landing page**

Create `webapp-vue/src/pages/super-admin/index.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { DateTime } from 'luxon'
import { listSuperAdmins } from '@/api/superAdmin'
import type { SuperAdminUser } from '@/api/types'

const rows = ref<SuperAdminUser[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')

// The column and the allowlist drift by design — the flag is re-derived on every login.
// Naming which source a row comes from is the whole point of this table.
function statusLabel(u: SuperAdminUser): string {
  if (u.flagged && u.allowlisted) return 'Aktiv'
  if (u.allowlisted) return 'Wartet auf ersten Login'
  return 'Nicht mehr auf der Allowlist — Flag erlischt beim nächsten Login'
}
// No community context here, so the app's default zone rather than the browser's.
function formatDate(iso: string | null): string {
  return iso ? DateTime.fromISO(iso, { zone: 'Europe/Berlin' }).toFormat('dd.MM.yyyy') : '—'
}

onMounted(async () => {
  try {
    rows.value = await listSuperAdmins()
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <section class="mx-auto max-w-3xl px-4 py-8">
    <h1 class="mb-4 text-xl font-semibold">Übersicht</h1>

    <h2 class="mb-2 font-medium">Super-Admins</h2>
    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Lade…</p>
    <p v-else-if="state === 'error'" class="text-sm text-red-600">
      Die Super-Admins konnten nicht geladen werden.
    </p>
    <table v-else class="mb-6 w-full text-left text-sm">
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

    <RouterLink
      to="/super-admin/communities"
      class="rounded border px-3 py-1.5 hover:bg-neutral-200"
    >
      Spielgemeinschaften
    </RouterLink>
  </section>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd webapp-vue && pnpm test src/pages/super-admin/__tests__/index.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/pages/super-admin
git commit -m "feat(web): add the super-admin landing page with the roster

Rows carry the raw flag/allowlist booleans; the page names the divergences so a
pending first login is not mistaken for an active super-admin."
```

---

### Task 7: Community overview page

**Files:**
- Create: `webapp-vue/src/pages/super-admin/communities.vue`
- Test: `webapp-vue/src/pages/super-admin/__tests__/communities.spec.ts`
- Modify (regenerated, do not hand-edit): `webapp-vue/typed-router.d.ts`

**Interfaces:**
- Consumes: `listAllCommunities()` and the `SuperAdminCommunity` / `SuperAdminMember` types from Task 4.
- Produces: the `/super-admin/communities` route. No exported symbols.

The zone fixture is deliberate: `Pacific/Kiritimati` is UTC+14, so `2026-03-01T20:00:00Z` falls on **02.03.2026** there but on 01.03.2026 in UTC. Dropping `{ zone }` from the formatter turns the test red.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/pages/super-admin/__tests__/communities.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/superAdmin'

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
}))

describe('super-admin community overview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders every community with its roster, admin badge and pending marker', async () => {
    vi.spyOn(api, 'listAllCommunities').mockResolvedValue([
      {
        id: 'c1',
        name: 'Team',
        slug: 'team',
        startsAt: null,
        // UTC+14: the joinedAt below lands on the next day here, but not in UTC.
        startsAtTimezone: 'Pacific/Kiritimati',
        createdAt: '2026-01-01T00:00:00Z',
        members: [
          {
            userId: 'u1',
            username: 'Alice',
            githubLogin: 'alice',
            status: 'ACTIVE',
            isAdmin: true,
            joinedAt: '2026-03-01T20:00:00Z',
          },
          {
            userId: 'u2',
            username: 'Bob',
            githubLogin: 'bob',
            status: 'PENDING',
            isAdmin: false,
            joinedAt: '2026-03-02T00:00:00Z',
          },
        ],
      },
    ])
    const Page = (await import('@/pages/super-admin/communities.vue')).default
    const w = mount(Page)
    await flushPromises()

    const members = w.findAll('[data-test=member]')
    expect(members).toHaveLength(2)
    expect(w.findAll('[data-test=admin-badge]')).toHaveLength(1)
    expect(members[0]!.text()).toContain('Alice')
    expect(members[0]!.text()).toContain('02.03.2026') // formatted in the community's zone
    expect(members[1]!.text()).toContain('ausstehend')
    expect(w.find('a[href="/team/settings"]').exists()).toBe(true)
  })

  it('shows a hint for a community without members', async () => {
    vi.spyOn(api, 'listAllCommunities').mockResolvedValue([
      {
        id: 'c2',
        name: 'Leer',
        slug: 'leer',
        startsAt: null,
        startsAtTimezone: 'Europe/Berlin',
        createdAt: '2026-01-01T00:00:00Z',
        members: [],
      },
    ])
    const Page = (await import('@/pages/super-admin/communities.vue')).default
    const w = mount(Page)
    await flushPromises()
    expect(w.text()).toContain('Keine Mitglieder')
    expect(w.findAll('[data-test=member]')).toHaveLength(0)
  })

  it('shows an error message when the overview cannot be loaded', async () => {
    vi.spyOn(api, 'listAllCommunities').mockRejectedValue(new Error('boom'))
    const Page = (await import('@/pages/super-admin/communities.vue')).default
    const w = mount(Page)
    await flushPromises()
    expect(w.text()).toContain('konnten nicht geladen werden')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd webapp-vue && pnpm test src/pages/super-admin/__tests__/communities.spec.ts`
Expected: FAIL — `Failed to resolve import "@/pages/super-admin/communities.vue"`.

- [ ] **Step 3: Implement the page**

Create `webapp-vue/src/pages/super-admin/communities.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { DateTime } from 'luxon'
import { listAllCommunities } from '@/api/superAdmin'
import type { SuperAdminCommunity } from '@/api/types'

const communities = ref<SuperAdminCommunity[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')

// Format in the community's own zone, never the browser's — the project rule for every
// community-relative timestamp, and it keeps this deterministic wherever CI runs.
function formatDate(iso: string | null, zone: string): string {
  return iso ? DateTime.fromISO(iso, { zone }).toFormat('dd.MM.yyyy') : '—'
}

onMounted(async () => {
  try {
    communities.value = await listAllCommunities()
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <section class="mx-auto max-w-4xl px-4 py-8">
    <h1 class="mb-4 text-xl font-semibold">Alle Spielgemeinschaften</h1>
    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Lade…</p>
    <p v-else-if="state === 'error'" class="text-sm text-red-600">
      Die Spielgemeinschaften konnten nicht geladen werden.
    </p>
    <template v-else>
      <article v-for="c in communities" :key="c.id" data-test="community" class="mb-8">
        <header class="mb-2 flex flex-wrap items-baseline gap-3 border-b pb-1">
          <h2 class="font-semibold">{{ c.name }}</h2>
          <code class="text-xs text-neutral-500">/{{ c.slug }}/</code>
          <span class="grow"></span>
          <RouterLink :to="`/${c.slug}/`" class="text-sm text-blue-700 hover:underline">
            Öffnen
          </RouterLink>
          <RouterLink :to="`/${c.slug}/settings`" class="text-sm text-blue-700 hover:underline">
            Einstellungen
          </RouterLink>
        </header>
        <p v-if="!c.members.length" class="text-sm text-neutral-500">Keine Mitglieder.</p>
        <table v-else class="w-full text-left text-sm">
          <thead>
            <tr class="border-b text-neutral-500">
              <th class="py-1 pr-4 font-medium">Name</th>
              <th class="py-1 pr-4 font-medium">GitHub</th>
              <th class="py-1 pr-4 font-medium">Status</th>
              <th class="py-1 pr-4 font-medium">Admin</th>
              <th class="py-1 font-medium">seit</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in c.members" :key="m.userId" data-test="member" class="border-b">
              <td class="py-1 pr-4">{{ m.username }}</td>
              <td class="py-1 pr-4">
                <code>{{ m.githubLogin }}</code>
              </td>
              <td class="py-1 pr-4">
                <span
                  v-if="m.status === 'PENDING'"
                  class="rounded bg-amber-100 px-1.5 text-xs text-amber-800"
                >
                  ausstehend
                </span>
                <span v-else>aktiv</span>
              </td>
              <td class="py-1 pr-4">
                <span
                  v-if="m.isAdmin"
                  data-test="admin-badge"
                  class="rounded bg-blue-600 px-1.5 text-xs text-white"
                >
                  Admin
                </span>
              </td>
              <td class="py-1">{{ formatDate(m.joinedAt, c.startsAtTimezone) }}</td>
            </tr>
          </tbody>
        </table>
      </article>
    </template>
  </section>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd webapp-vue && pnpm test src/pages/super-admin/__tests__/communities.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Regenerate the committed router types**

Run: `cd webapp-vue && pnpm build`
Expected: build succeeds; `webapp-vue/typed-router.d.ts` now contains `'/super-admin'`, `'/super-admin/'` and `'/super-admin/communities'`. The file is generated by the VueRouter Vite plugin and is committed by project convention — Vitest does not run that plugin, which is why this happens once here rather than in Tasks 5 and 6.

- [ ] **Step 6: Run the full frontend suite and the quality gates**

Run: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: all green. If Prettier formatting differs, run `pnpm format` and re-run `pnpm lint`.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src/pages/super-admin webapp-vue/typed-router.d.ts
git commit -m "feat(web): add the super-admin community overview page

Every community with its full roster, admins badged and pending members marked.
Join dates are formatted in the community's own zone, so the fixture uses a
UTC+14 zone where a UTC-formatted date would land on the wrong day."
```

---

### Task 8: Capture the learnings in the guidelines

**Files:**
- Modify: `.claude/guidelines/security-and-auth.md`
- Modify: `.claude/guidelines/frontend.md`
- Modify: `.claude/guidelines/persistence.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Documentation only — the project convention (`feeding-knowledge-back.md`) is that every task ends by capturing what a future contributor would otherwise rediscover the hard way.

- [ ] **Step 1: Extend the Roles section in `security-and-auth.md`**

Append to the `## Roles` section, after the existing "super-admin vs community-admins" bullet:

```markdown
- **`/api/super-admin/**` is gated once, centrally.** Controllers under that path carry **no**
  authorization check and no `AuthenticatedUser` parameter — the `SecurityConfig` rule already
  guarantees the caller. Each module contributes its own controller for its own data
  (`community.internal.SuperAdminController`, `iam.internal.SuperAdminUserController`); there is
  no aggregating `superadmin` module, because that would force "give me everything" ports into
  the shared module API for the benefit of one UI.
- **The flag and the allowlist drift on purpose.** `is_super_admin` is re-derived on every login,
  so a newly allowlisted person has no flag until they sign in and a removed one keeps it until
  their next sign-in. Anything reporting on super-admins must read both sources and say which
  one a row came from — `GET /api/super-admin/super-admins` is the reference. Match the two
  **case-insensitively** (lowercased login), because that is how `SuperAdminProperties` grants
  the role; a case-sensitive join reports one person twice.
```

- [ ] **Step 2: Add a section to `frontend.md`**

Append a new section at the end of `.claude/guidelines/frontend.md`:

```markdown
## Unlinked areas + shell-owned access checks

The super-admin area (`/super-admin`) is reachable only by typing the URL — nothing links to it.
Pattern, mirroring the `[slug].vue` shell:

- `src/pages/super-admin.vue` is a **layout** for `src/pages/super-admin/*.vue`. A static route
  segment outranks the dynamic `/:slug`, so no router config is needed — but reserve the segment
  in the backend's `Slugs.RESERVED`, or a community with that slug becomes unreachable.
- The shell does the role check **once** and keeps `<RouterView/>` inside the authorised branch.
  Children then contain no access logic and, more importantly, never mount for an unauthorised
  viewer — so they never fire a request that would 403. The backend rule is the real gate.
- No `meta` flag and no change to `guard.ts` is needed for this; adding one would only duplicate
  what the shell already enforces.

**Test trap — `useAuth` stubs must be real refs.** A component template that reads
`user?.isSuperAdmin` relies on Vue unwrapping the ref. The older stub style
`user: { value: null } as never` is a plain object, so unwrapping silently yields `undefined` and
a positive-path assertion can never pass. Return `ref({ … }) as never` from the mocked `useAuth`.
```

- [ ] **Step 3: Add a note to `persistence.md`**

Append a new section at the end of `.claude/guidelines/persistence.md`:

````markdown
## Derived query names: watch the `is` prefix

Spring Data strips a leading `Is` as an ignorable keyword, so a derived finder over a property
already named `isSuperAdmin` is ambiguous. Write the SQL explicitly instead:

```kotlin
@Query("SELECT * FROM iam.users WHERE is_super_admin = true")
fun findSuperAdmins(): List<User>
```

Second trap in the same file: `@Query("… IN (:logins)")` renders `IN ()` for an empty collection,
which is a SQL syntax error. Guard at the call site rather than in the query.
````

- [ ] **Step 4: Verify nothing else broke**

Run: `cd core && ./mvnw test`
Then: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: all green. Documentation-only changes, so this is a confirmation, not a fix cycle.

- [ ] **Step 5: Commit**

```bash
git add .claude/guidelines
git commit -m "docs: capture the super-admin area conventions in the guidelines

The central /api/super-admin/** gate and the one-controller-per-module rule,
the deliberate flag/allowlist drift and its case-insensitive join, the
shell-owned access check for unlinked areas, and two traps that cost time:
ref-shaped useAuth stubs in Vitest, and Spring Data eating a leading Is in
derived query names."
```

---

## Manual verification (after Task 8)

Not a substitute for the suites above, but worth one pass before merging:

1. `cd core && ./mvnw spring-boot:run`, then `cd webapp-vue && pnpm dev`.
2. Sign in as a **non**-super-admin test user, open `http://localhost:5173/super-admin` → "Kein Zugriff", and the network tab shows **no** request to `/api/super-admin/*`.
3. Add your test login to `SUPER_ADMIN_GITHUB_LOGINS`, restart the backend, sign out and in again, reload `/super-admin` → the roster lists you as *Aktiv*; add a login that has never signed in and confirm it shows *Wartet auf ersten Login*.
4. Follow the link to `/super-admin/communities` → every community appears with its members, admins badged; the *Einstellungen* link lands on that community's settings page where the invite link lives.
