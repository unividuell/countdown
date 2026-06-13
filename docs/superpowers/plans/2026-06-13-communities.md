# Communities (Multi-Tenancy Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app multi-tenant: a `community` (Spielgemeinschaft) is a first-class tenant with membership, admin roles, a reusable 7-day invite link + admin approval, and URL-slug-based context.

**Architecture:** New Spring Modulith module `community` (Postgres schema `community`, module-Flyway, depends on `iam` via `UserQuery`), following the `iam` pattern (public root API + `internal/`). Frontend adds slug-based routing (`/[slug]/` shell + guard), a post-login redirect resolver, create/join flows, and a community switcher.

**Tech Stack:** Kotlin 2.3 / Spring Boot 4.1 / Spring Modulith 2.1 / Spring Data JDBC / PostgreSQL 18 / Flyway · Vue 3 + Vite 8 + Vue Router 5 (file-based) + Tailwind v4 · tests: mockk + kotest + MockMvc Kotlin DSL + Testcontainers (backend), Vitest + `vi` (frontend).

**Spec:** `docs/superpowers/specs/2026-06-13-communities-design.md` (read it; this plan implements it).

**Conventions (from `.claude/guidelines/`):** module API in base package + everything else in `internal/`; schema-per-module + module-Flyway (`db/migration/community/`, starts at V1); `@Table(schema="community")`; UUID v7 via Postgres `uuidv7()`; cross-schema FKs are allowed (module dep tree orders migrations — `community` deps on `iam`); after adding the module do `./mvnw clean` (stale `application-modules.json`). Tests are TDD: failing test → minimal impl → green → commit.

**Package root:** `org.unividuell.countdown.core.community` (public) and `…community.internal` (rest).

---

## Phase 1 — Backend: schema, entities, repositories

### Task 1: Flyway migration — schema + tables

**Files:**
- Create: `core/src/main/resources/db/migration/community/V1__create_communities.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE SCHEMA IF NOT EXISTS community;

CREATE TABLE community.communities (
    id                        UUID         PRIMARY KEY DEFAULT uuidv7(),
    name                      TEXT         NOT NULL,
    slug                      TEXT         NOT NULL UNIQUE,
    starts_at                 TIMESTAMPTZ  NULL,
    phase_two_start_round     INT          NULL,
    invite_token              TEXT         NULL UNIQUE,
    invite_token_expires_at   TIMESTAMPTZ  NULL,
    created_by                UUID         NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE community.community_members (
    id            UUID         PRIMARY KEY DEFAULT uuidv7(),
    community_id  UUID         NOT NULL REFERENCES community.communities(id) ON DELETE CASCADE,
    user_id       UUID         NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
    status        TEXT         NOT NULL,
    is_admin      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (community_id, user_id)
);
CREATE INDEX idx_members_user ON community.community_members(user_id);

CREATE TABLE community.community_user_selection (
    user_id       UUID         PRIMARY KEY REFERENCES iam.users(id) ON DELETE CASCADE,
    community_id  UUID         NOT NULL REFERENCES community.communities(id) ON DELETE CASCADE,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Commit** (verified by Task 2's repository test booting the migration)

```bash
git add core/src/main/resources/db/migration/community/V1__create_communities.sql
git commit -m "feat(community): V1 migration — schema + communities/members/selection"
```

### Task 2: `Community` aggregate + repository

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/Community.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityRepository.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityRepositoryTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityRepositoryTest(
    @Autowired val repository: CommunityRepository,
    @Autowired val users: UserRepository,
) {
    private fun aUser() = users.save(User(githubId = 1L, githubLogin = "octocat"))

    @Test
    fun `saves a community with a uuid v7 id and finds it by slug`() {
        val creator = aUser()
        val saved = repository.save(Community(name = "Hütte Hütte", slug = "huette-huette", createdBy = creator.id!!))

        saved.id.shouldNotBeNull()
        saved.id!!.version() shouldBe 7
        saved.createdAt.shouldNotBeNull()
        repository.findBySlug("huette-huette").shouldNotBeNull()
        repository.findBySlug("does-not-exist").shouldBeNull()
    }
}
```

- [ ] **Step 2: Run — expect compile failure (types missing)**

Run: `cd core && ./mvnw -q test -Dtest=CommunityRepositoryTest`
Expected: FAIL (unresolved `Community` / `CommunityRepository`).

- [ ] **Step 3: Implement the aggregate + repository**

`Community.kt`:
```kotlin
package org.unividuell.countdown.core.community

import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

@Table(schema = "community", name = "communities")
data class Community(
    @Id
    val id: UUID? = null,
    val name: String,
    val slug: String,
    val startsAt: Instant? = null,
    val phaseTwoStartRound: Int? = null,
    val inviteToken: String? = null,
    val inviteTokenExpiresAt: Instant? = null,
    val createdBy: UUID,
    @CreatedDate
    val createdAt: Instant? = null,
    @LastModifiedDate
    val updatedAt: Instant? = null,
)
```

`internal/CommunityRepository.kt`:
```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.data.repository.CrudRepository
import org.unividuell.countdown.core.community.Community
import java.util.UUID

interface CommunityRepository : CrudRepository<Community, UUID> {
    fun findBySlug(slug: String): Community?
    fun findByInviteToken(inviteToken: String): Community?
}
```

- [ ] **Step 4: Run — expect PASS** · `./mvnw -q test -Dtest=CommunityRepositoryTest`
- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/Community.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityRepository.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityRepositoryTest.kt
git commit -m "feat(community): Community aggregate + repository"
```

### Task 3: `CommunityMember` aggregate + repository

**Files:**
- Create: `…/community/CommunityMember.kt` (aggregate + `MemberStatus` enum)
- Create: `…/community/internal/CommunityMemberRepository.kt`
- Test: `…/community/CommunityMemberRepositoryTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import io.kotest.matchers.collections.shouldHaveSize
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityMemberRepositoryTest(
    @Autowired val members: CommunityMemberRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
) {
    @Test
    fun `stores membership and queries by community, user and admin count`() {
        val u = users.save(User(githubId = 2L, githubLogin = "u2"))
        val c = communities.save(Community(name = "Team", slug = "team", createdBy = u.id!!))
        members.save(CommunityMember(communityId = c.id!!, userId = u.id!!, status = MemberStatus.ACTIVE, isAdmin = true))

        members.findByCommunityId(c.id!!) shouldHaveSize 1
        members.findByCommunityIdAndUserId(c.id!!, u.id!!)!!.isAdmin shouldBe true
        members.countActiveAdmins(c.id!!) shouldBe 1
        members.findActiveByUserId(u.id!!) shouldHaveSize 1
    }
}
```

- [ ] **Step 2: Run — expect compile failure.**
- [ ] **Step 3: Implement**

`CommunityMember.kt`:
```kotlin
package org.unividuell.countdown.core.community

import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

enum class MemberStatus { PENDING, ACTIVE }

@Table(schema = "community", name = "community_members")
data class CommunityMember(
    @Id
    val id: UUID? = null,
    val communityId: UUID,
    val userId: UUID,
    val status: MemberStatus,
    val isAdmin: Boolean = false,
    @CreatedDate
    val createdAt: Instant? = null,
    @LastModifiedDate
    val updatedAt: Instant? = null,
)
```

`internal/CommunityMemberRepository.kt`:
```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import org.unividuell.countdown.core.community.CommunityMember
import java.util.UUID

interface CommunityMemberRepository : CrudRepository<CommunityMember, UUID> {
    fun findByCommunityId(communityId: UUID): List<CommunityMember>
    fun findByCommunityIdAndUserId(communityId: UUID, userId: UUID): CommunityMember?

    @Query("SELECT count(*) FROM community.community_members WHERE community_id = :cid AND status = 'ACTIVE' AND is_admin = true")
    fun countActiveAdmins(cid: UUID): Long

    @Query("SELECT * FROM community.community_members WHERE user_id = :uid AND status = 'ACTIVE'")
    fun findActiveByUserId(uid: UUID): List<CommunityMember>
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(community): CommunityMember aggregate + repository`

### Task 4: `CommunityUserSelection` + upsert repository

**Files:**
- Create: `…/community/internal/CommunityUserSelection.kt`
- Create: `…/community/internal/CommunityUserSelectionRepository.kt`
- Test: `…/community/CommunityUserSelectionRepositoryTest.kt`

The PK is a non-generated `user_id` → a plain `save` would `UPDATE` an existing row. Use an explicit upsert.

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.community.internal.CommunityUserSelectionRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityUserSelectionRepositoryTest(
    @Autowired val selection: CommunityUserSelectionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
) {
    @Test
    fun `upsert sets then overwrites the selected community`() {
        val u = users.save(User(githubId = 3L, githubLogin = "u3"))
        val c1 = communities.save(Community(name = "One", slug = "one", createdBy = u.id!!))
        val c2 = communities.save(Community(name = "Two", slug = "two", createdBy = u.id!!))

        selection.upsert(u.id!!, c1.id!!)
        selection.findCommunityId(u.id!!) shouldBe c1.id
        selection.upsert(u.id!!, c2.id!!)
        selection.findCommunityId(u.id!!) shouldBe c2.id
    }
}
```

- [ ] **Step 2: Run — expect compile failure.**
- [ ] **Step 3: Implement** (a repository with `@Modifying` upsert; no entity class needed)

`internal/CommunityUserSelectionRepository.kt`:
```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.Repository
import java.util.UUID

interface CommunityUserSelectionRepository : Repository<Any, UUID> {
    @Modifying
    @Query(
        """
        INSERT INTO community.community_user_selection (user_id, community_id, updated_at)
        VALUES (:userId, :communityId, now())
        ON CONFLICT (user_id) DO UPDATE SET community_id = :communityId, updated_at = now()
        """
    )
    fun upsert(userId: UUID, communityId: UUID)

    @Query("SELECT community_id FROM community.community_user_selection WHERE user_id = :userId")
    fun findCommunityId(userId: UUID): UUID?
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(community): user selection upsert repository`

---

## Phase 2 — Backend: slug, services, access

### Task 5: Slug derivation + reserved blocklist

**Files:**
- Create: `…/community/internal/Slugs.kt`
- Test: `…/community/SlugsTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.Slugs

class SlugsTest {
    @Test
    fun `derives url-safe slug with german transliteration`() {
        Slugs.slugify("Hütte Hütte") shouldBe "huette-huette"
        Slugs.slugify("Café Crème") shouldBe "cafe-creme"
        Slugs.slugify("Süßes & Saures!") shouldBe "suesses-saures"
        Slugs.slugify("  multiple   spaces  ") shouldBe "multiple-spaces"
        Slugs.slugify("Team---A") shouldBe "team-a"
    }

    @Test
    fun `reserved slugs are detected`() {
        Slugs.isReserved("api") shouldBe true
        Slugs.isReserved("join") shouldBe true
        Slugs.isReserved("team-a") shouldBe false
    }
}
```

- [ ] **Step 2: Run — expect compile failure.**
- [ ] **Step 3: Implement**

```kotlin
package org.unividuell.countdown.core.community.internal

import java.text.Normalizer

object Slugs {
    val RESERVED = setOf("api", "oauth2", "login", "logout", "communities", "join")

    fun slugify(name: String): String {
        val umlauts = name.lowercase()
            .replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
        val noDiacritics = Normalizer.normalize(umlauts, Normalizer.Form.NFKD)
            .replace("\\p{M}+".toRegex(), "")
        return noDiacritics
            .replace("[^a-z0-9]+".toRegex(), "-")
            .trim('-')
            .replace("-+".toRegex(), "-")
    }

    fun isReserved(slug: String): Boolean = slug in RESERVED
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(community): slug derivation + reserved blocklist`

### Task 6: Domain exceptions

**Files:**
- Create: `…/community/internal/CommunityExceptions.kt`

- [ ] **Step 1: Implement** (no test; consumed by later tasks)

```kotlin
package org.unividuell.countdown.core.community.internal

/** Derived slug is already taken or reserved → 409. */
class SlugUnavailableException(message: String) : RuntimeException(message)

/** Would leave a community with zero admins → 409. */
class LastAdminException(message: String = "A community must keep at least one admin") : RuntimeException(message)

/** Caller is not an ACTIVE member of the community → 404 (no info leak). */
class CommunityAccessDeniedException(message: String = "No access") : RuntimeException(message)

/** Caller is an ACTIVE member but not an admin where admin is required → 403. */
class NotAdminException(message: String = "Admin required") : RuntimeException(message)

/** Invite token does not exist → 404. */
class InviteNotFoundException(message: String = "Invalid invite") : RuntimeException(message)

/** Invite token exists but has expired → 410. */
class InviteExpiredException(message: String = "Invite expired") : RuntimeException(message)
```

- [ ] **Step 2: Commit** — `feat(community): domain exceptions`

### Task 7: `CommunityService.create` + `update`

**Files:**
- Create: `…/community/internal/CommunityService.kt`
- Test: `…/community/CommunityServiceTest.kt`

Validation rules: name trimmed, length 3..50 (`IllegalArgumentException` → 400); slug derived, length ≥3 (`IllegalArgumentException` → 400); reserved → `SlugUnavailableException`; existing slug → `SlugUnavailableException`. On create insert community then creator membership ACTIVE+admin. `update` validates `phaseTwoStartRound` > 0 when present; never changes the slug.

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.community.internal.SlugUnavailableException
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityServiceTest(
    @Autowired val service: CommunityService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val users: UserRepository,
) {
    private fun aUser() = users.save(User(githubId = System.nanoTime(), githubLogin = "creator"))

    @Test
    fun `create derives slug and makes the creator an active admin`() {
        val creator = aUser()
        val c = service.create(creator.id!!, "Hütte Hütte")
        c.slug shouldBe "huette-huette"
        val m = members.findByCommunityIdAndUserId(c.id!!, creator.id!!)!!
        m.status shouldBe MemberStatus.ACTIVE
        m.isAdmin shouldBe true
    }

    @Test
    fun `create rejects a name shorter than 3 chars`() {
        shouldThrow<IllegalArgumentException> { service.create(aUser().id!!, "ab") }
    }

    @Test
    fun `create rejects a duplicate slug`() {
        val u = aUser()
        service.create(u.id!!, "Team A")
        shouldThrow<SlugUnavailableException> { service.create(u.id!!, "team a") }
    }

    @Test
    fun `create rejects a reserved slug`() {
        shouldThrow<SlugUnavailableException> { service.create(aUser().id!!, "join") }
    }
}
```

- [ ] **Step 2: Run — expect compile failure.**
- [ ] **Step 3: Implement**

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import java.time.Instant
import java.util.UUID

@Service
open class CommunityService(
    private val communities: CommunityRepository,
    private val members: CommunityMemberRepository,
) {
    @Transactional
    open fun create(creatorUserId: UUID, rawName: String): Community {
        val name = rawName.trim()
        require(name.length in 3..50) { "name must be 3..50 chars" }
        val slug = Slugs.slugify(name)
        require(slug.length >= 3) { "derived slug must be at least 3 chars" }
        if (Slugs.isReserved(slug)) throw SlugUnavailableException("slug '$slug' is reserved")
        if (communities.findBySlug(slug) != null) throw SlugUnavailableException("slug '$slug' is taken")
        val community = try {
            communities.save(Community(name = name, slug = slug, createdBy = creatorUserId))
        } catch (e: DuplicateKeyException) {
            throw SlugUnavailableException("slug '$slug' is taken")
        }
        members.save(
            CommunityMember(
                communityId = community.id!!,
                userId = creatorUserId,
                status = MemberStatus.ACTIVE,
                isAdmin = true,
            )
        )
        return community
    }

    @Transactional
    open fun update(community: Community, name: String?, startsAt: Instant?, phaseTwoStartRound: Int?): Community {
        name?.let { require(it.trim().length in 3..50) { "name must be 3..50 chars" } }
        phaseTwoStartRound?.let { require(it > 0) { "phaseTwoStartRound must be > 0" } }
        // slug is immutable — never recomputed
        return communities.save(
            community.copy(
                name = name?.trim() ?: community.name,
                startsAt = startsAt ?: community.startsAt,
                phaseTwoStartRound = phaseTwoStartRound ?: community.phaseTwoStartRound,
                updatedAt = Instant.now(),
            )
        )
    }
}
```

> Note: `update` uses "null = keep" semantics; clearing `startsAt`/`phaseTwoStartRound` is out of scope (not in the spec). If the UI must clear them later, switch to an explicit "present" wrapper — a follow-up.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(community): create + update service`

### Task 8: Invite — generate / revoke / accept

**Files:**
- Create: `…/community/internal/MembershipService.kt`
- Test: `…/community/MembershipServiceInviteTest.kt`

Token: URL-safe random (`SecureRandom` → base64url, 32 bytes). Expiry fixed 7 days. `accept` returns a sealed result.

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.types.shouldBeInstanceOf
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.*
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.time.Instant
import java.time.temporal.ChronoUnit

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class MembershipServiceInviteTest(
    @Autowired val service: MembershipService,
    @Autowired val communityService: CommunityService,
    @Autowired val communities: CommunityRepository,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val users: UserRepository,
) {
    private fun user(login: String) = users.save(User(githubId = System.nanoTime(), githubLogin = login))

    @Test
    fun `generate produces a token with 7-day expiry; regenerate replaces it`() {
        val c = communityService.create(user("admin").id!!, "Team")
        val first = service.generateInvite(c.id!!)
        first.expiresAt.isAfter(Instant.now().plus(6, ChronoUnit.DAYS)) shouldBe true
        val second = service.generateInvite(c.id!!)
        (second.token != first.token) shouldBe true
        communities.findByInviteToken(first.token) shouldBe null
    }

    @Test
    fun `accept creates a PENDING membership`() {
        val c = communityService.create(user("admin").id!!, "Team")
        val token = service.generateInvite(c.id!!).token
        val joiner = user("joiner")
        val result = service.accept(token, joiner.id!!)
        result.shouldBeInstanceOf<AcceptResult.JoinedPending>()
        members.findByCommunityIdAndUserId(c.id!!, joiner.id!!)!!.status shouldBe MemberStatus.PENDING
    }

    @Test
    fun `accept of an unknown token throws InviteNotFound`() {
        shouldThrow<InviteNotFoundException> { service.accept("nope", user("x").id!!) }
    }

    @Test
    fun `accept of an expired token throws InviteExpired`() {
        val c = communityService.create(user("admin").id!!, "Team")
        val token = service.generateInvite(c.id!!).token
        communities.save(communities.findBySlug("team")!!.copy(inviteTokenExpiresAt = Instant.now().minusSeconds(1)))
        shouldThrow<InviteExpiredException> { service.accept(token, user("late").id!!) }
    }
}
```

- [ ] **Step 2: Run — expect compile failure.**
- [ ] **Step 3: Implement** (this task adds the invite parts; Task 9 adds the rest of `MembershipService`)

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import java.security.SecureRandom
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Base64
import java.util.UUID

data class InviteInfo(val token: String, val expiresAt: Instant)

sealed interface AcceptResult {
    val community: Community
    data class JoinedPending(override val community: Community) : AcceptResult
    data class AlreadyPending(override val community: Community) : AcceptResult
    data class AlreadyActive(override val community: Community) : AcceptResult
}

@Service
open class MembershipService(
    private val communities: CommunityRepository,
    private val members: CommunityMemberRepository,
) {
    private val random = SecureRandom()
    private val encoder = Base64.getUrlEncoder().withoutPadding()
    private val inviteTtl = java.time.Duration.ofDays(7)

    @Transactional
    open fun generateInvite(communityId: UUID): InviteInfo {
        val community = communities.findById(communityId).orElseThrow()
        val token = encoder.encodeToString(ByteArray(32).also { random.nextBytes(it) })
        val expiresAt = Instant.now().plus(inviteTtl)
        communities.save(community.copy(inviteToken = token, inviteTokenExpiresAt = expiresAt, updatedAt = Instant.now()))
        return InviteInfo(token, expiresAt)
    }

    @Transactional
    open fun revokeInvite(communityId: UUID) {
        val community = communities.findById(communityId).orElseThrow()
        communities.save(community.copy(inviteToken = null, inviteTokenExpiresAt = null, updatedAt = Instant.now()))
    }

    @Transactional
    open fun accept(token: String, userId: UUID): AcceptResult {
        val community = communities.findByInviteToken(token) ?: throw InviteNotFoundException()
        if (community.inviteTokenExpiresAt?.isBefore(Instant.now()) != false) throw InviteExpiredException()
        val existing = members.findByCommunityIdAndUserId(community.id!!, userId)
        return when (existing?.status) {
            MemberStatus.ACTIVE -> AcceptResult.AlreadyActive(community)
            MemberStatus.PENDING -> AcceptResult.AlreadyPending(community)
            null -> {
                members.save(CommunityMember(communityId = community.id!!, userId = userId, status = MemberStatus.PENDING))
                AcceptResult.JoinedPending(community)
            }
        }
    }
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(community): invite generate/revoke/accept`

### Task 9: Membership — approve / promote / demote / remove / leave (last-admin guard)

**Files:**
- Modify: `…/community/internal/MembershipService.kt`
- Test: `…/community/MembershipServiceAdminTest.kt`

Last-admin guard: a `demote`, `remove`, or `leave` that targets the only `ACTIVE && is_admin` member throws `LastAdminException`.

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.*
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class MembershipServiceAdminTest(
    @Autowired val service: MembershipService,
    @Autowired val communityService: CommunityService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val users: UserRepository,
) {
    private fun user(login: String) = users.save(User(githubId = System.nanoTime(), githubLogin = login))

    @Test
    fun `approve flips PENDING to ACTIVE`() {
        val admin = user("admin"); val c = communityService.create(admin.id!!, "Team")
        val joiner = user("joiner")
        service.accept(service.generateInvite(c.id!!).token, joiner.id!!)
        service.approve(c.id!!, joiner.id!!)
        members.findByCommunityIdAndUserId(c.id!!, joiner.id!!)!!.status shouldBe MemberStatus.ACTIVE
    }

    @Test
    fun `promote and demote toggle is_admin`() {
        val admin = user("admin"); val c = communityService.create(admin.id!!, "Team")
        val p = user("player"); service.accept(service.generateInvite(c.id!!).token, p.id!!); service.approve(c.id!!, p.id!!)
        service.promote(c.id!!, p.id!!)
        members.findByCommunityIdAndUserId(c.id!!, p.id!!)!!.isAdmin shouldBe true
        service.demote(c.id!!, p.id!!)
        members.findByCommunityIdAndUserId(c.id!!, p.id!!)!!.isAdmin shouldBe false
    }

    @Test
    fun `cannot demote, remove or leave the last admin`() {
        val admin = user("admin"); val c = communityService.create(admin.id!!, "Team")
        shouldThrow<LastAdminException> { service.demote(c.id!!, admin.id!!) }
        shouldThrow<LastAdminException> { service.remove(c.id!!, admin.id!!) }
        shouldThrow<LastAdminException> { service.leave(c.id!!, admin.id!!) }
    }
}
```

- [ ] **Step 2: Run — expect compile failure.**
- [ ] **Step 3: Implement (append to `MembershipService`)**

```kotlin
    @Transactional
    open fun approve(communityId: UUID, userId: UUID) {
        val m = require(communityId, userId)
        members.save(m.copy(status = MemberStatus.ACTIVE, updatedAt = Instant.now()))
    }

    @Transactional
    open fun promote(communityId: UUID, userId: UUID) {
        val m = require(communityId, userId)
        members.save(m.copy(isAdmin = true, updatedAt = Instant.now()))
    }

    @Transactional
    open fun demote(communityId: UUID, userId: UUID) {
        val m = require(communityId, userId)
        guardLastAdmin(communityId, m)
        members.save(m.copy(isAdmin = false, updatedAt = Instant.now()))
    }

    @Transactional
    open fun remove(communityId: UUID, userId: UUID) {
        val m = require(communityId, userId)
        guardLastAdmin(communityId, m)
        members.delete(m)
    }

    /** Self-leave — same invariant as remove. */
    @Transactional
    open fun leave(communityId: UUID, userId: UUID) = remove(communityId, userId)

    private fun require(communityId: UUID, userId: UUID): CommunityMember =
        members.findByCommunityIdAndUserId(communityId, userId)
            ?: throw IllegalArgumentException("membership not found")

    private fun guardLastAdmin(communityId: UUID, target: CommunityMember) {
        if (target.status == MemberStatus.ACTIVE && target.isAdmin && members.countActiveAdmins(communityId) <= 1) {
            throw LastAdminException()
        }
    }
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(community): approve/promote/demote/remove/leave + last-admin guard`

### Task 10: Public module API — `CommunityQuery`, `MembershipQuery` + impl; selection service

**Files:**
- Create: `…/community/CommunityQuery.kt`, `…/community/MembershipQuery.kt`
- Create: `…/community/internal/CommunityQueryService.kt` (implements both)
- Create: `…/community/internal/SelectionService.kt`
- Test: `…/community/CommunityQueryServiceTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import io.kotest.matchers.collections.shouldHaveSize
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.community.internal.MembershipService
import org.unividuell.countdown.core.community.internal.SelectionService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityQueryServiceTest(
    @Autowired val query: CommunityQuery,
    @Autowired val membershipQuery: MembershipQuery,
    @Autowired val selection: SelectionService,
    @Autowired val communityService: CommunityService,
    @Autowired val membership: MembershipService,
    @Autowired val users: UserRepository,
) {
    private fun user(login: String) = users.save(User(githubId = System.nanoTime(), githubLogin = login))

    @Test
    fun `query + membership reflect active communities and admin status`() {
        val admin = user("admin"); val c = communityService.create(admin.id!!, "Team")
        query.findBySlug("team")!!.id shouldBe c.id
        membershipQuery.isActiveMember(c.id!!, admin.id!!) shouldBe true
        membershipQuery.isAdmin(c.id!!, admin.id!!) shouldBe true
        membershipQuery.activeCommunitiesOf(admin.id!!) shouldHaveSize 1
    }

    @Test
    fun `pending member is not active`() {
        val admin = user("admin"); val c = communityService.create(admin.id!!, "Team")
        val p = user("p"); membership.accept(membership.generateInvite(c.id!!).token, p.id!!)
        membershipQuery.isActiveMember(c.id!!, p.id!!) shouldBe false
        membershipQuery.activeCommunitiesOf(p.id!!) shouldHaveSize 0
    }

    @Test
    fun `selection round-trips`() {
        val u = user("u"); val c = communityService.create(u.id!!, "Team")
        selection.set(u.id!!, c.id!!)
        selection.get(u.id!!) shouldBe c.id
    }
}
```

- [ ] **Step 2: Run — expect compile failure.**
- [ ] **Step 3: Implement**

`CommunityQuery.kt`:
```kotlin
package org.unividuell.countdown.core.community

import java.util.UUID

/** Read-only access to communities, for consumption by other modules. */
interface CommunityQuery {
    fun findBySlug(slug: String): Community?
    fun findById(id: UUID): Community?
}
```

`MembershipQuery.kt`:
```kotlin
package org.unividuell.countdown.core.community

import java.util.UUID

interface MembershipQuery {
    fun isActiveMember(communityId: UUID, userId: UUID): Boolean
    fun isAdmin(communityId: UUID, userId: UUID): Boolean
    fun activeCommunitiesOf(userId: UUID): List<Community>
}
```

`internal/CommunityQueryService.kt`:
```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.community.MembershipQuery
import java.util.UUID

@Service
@Transactional(readOnly = true)
class CommunityQueryService(
    private val communities: CommunityRepository,
    private val members: CommunityMemberRepository,
) : CommunityQuery, MembershipQuery {
    override fun findBySlug(slug: String): Community? = communities.findBySlug(slug)
    override fun findById(id: UUID): Community? = communities.findByIdOrNull(id)

    override fun isActiveMember(communityId: UUID, userId: UUID): Boolean =
        members.findByCommunityIdAndUserId(communityId, userId)?.status == MemberStatus.ACTIVE

    override fun isAdmin(communityId: UUID, userId: UUID): Boolean =
        members.findByCommunityIdAndUserId(communityId, userId)
            ?.let { it.status == MemberStatus.ACTIVE && it.isAdmin } ?: false

    override fun activeCommunitiesOf(userId: UUID): List<Community> =
        members.findActiveByUserId(userId).mapNotNull { communities.findByIdOrNull(it.communityId) }
}
```

`internal/SelectionService.kt`:
```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
open class SelectionService(private val selection: CommunityUserSelectionRepository) {
    @Transactional
    open fun set(userId: UUID, communityId: UUID) = selection.upsert(userId, communityId)

    @Transactional(readOnly = true)
    open fun get(userId: UUID): UUID? = selection.findCommunityId(userId)
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(community): public query API + selection service`

### Task 11: `CommunityAccess` — resolve membership/admin from (userId, slug) + super-admin override

**Files:**
- Create: `…/community/internal/CommunityAccess.kt`
- Test: `…/community/CommunityAccessTest.kt`

- [ ] **Step 1: Write the failing test** (uses real services + Testcontainers)

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.*
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityAccessTest(
    @Autowired val access: CommunityAccess,
    @Autowired val communityService: CommunityService,
    @Autowired val membership: MembershipService,
    @Autowired val users: UserRepository,
) {
    private fun user(login: String) = users.save(User(githubId = System.nanoTime(), githubLogin = login))

    @Test
    fun `non-member gets access denied (404 semantics)`() {
        communityService.create(user("admin").id!!, "Team")
        shouldThrow<CommunityAccessDeniedException> { access.requireActiveMember(user("stranger").id!!, false, "team") }
    }

    @Test
    fun `active non-admin can read but not admin`() {
        val c = communityService.create(user("admin").id!!, "Team")
        val p = user("p"); membership.accept(membership.generateInvite(c.id!!).token, p.id!!); membership.approve(c.id!!, p.id!!)
        access.requireActiveMember(p.id!!, false, "team").slug shouldBe "team"
        shouldThrow<NotAdminException> { access.requireAdmin(p.id!!, false, "team") }
    }

    @Test
    fun `super-admin overrides membership and admin`() {
        communityService.create(user("admin").id!!, "Team")
        access.requireAdmin(user("super").id!!, true, "team").slug shouldBe "team"
    }
}
```

- [ ] **Step 2: Run — expect compile failure.**
- [ ] **Step 3: Implement**

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.MembershipQuery
import java.util.UUID

@Service
class CommunityAccess(
    private val communities: CommunityRepository,
    private val membership: MembershipQuery,
) {
    /** Active member (or super-admin) of [slug], else [CommunityAccessDeniedException] (→404). */
    fun requireActiveMember(userId: UUID, isSuperAdmin: Boolean, slug: String): Community {
        val c = communities.findBySlug(slug) ?: throw CommunityAccessDeniedException()
        if (isSuperAdmin || membership.isActiveMember(c.id!!, userId)) return c
        throw CommunityAccessDeniedException()
    }

    /** Admin (or super-admin) of [slug]; 404 if not even a member, 403 if member but not admin. */
    fun requireAdmin(userId: UUID, isSuperAdmin: Boolean, slug: String): Community {
        val c = requireActiveMember(userId, isSuperAdmin, slug)
        if (isSuperAdmin || membership.isAdmin(c.id!!, userId)) return c
        throw NotAdminException()
    }
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(community): CommunityAccess authorization resolver`

---

## Phase 3 — Backend: controllers + error mapping

### Task 12: DTOs + `@RestControllerAdvice` exception mapping

**Files:**
- Create: `…/community/internal/CommunityDtos.kt`
- Create: `…/community/internal/CommunityExceptionHandler.kt`

- [ ] **Step 1: Implement DTOs**

```kotlin
package org.unividuell.countdown.core.community.internal

import org.unividuell.countdown.core.community.Community
import java.time.Instant
import java.util.UUID

data class CommunityResponse(
    val id: UUID, val name: String, val slug: String,
    val startsAt: Instant?, val phaseTwoStartRound: Int?,
)
data class CommunitySummary(val id: UUID, val name: String, val slug: String)
data class CreateCommunityRequest(val name: String)
data class UpdateCommunityRequest(val name: String?, val startsAt: Instant?, val phaseTwoStartRound: Int?)
data class InviteResponse(val url: String, val expiresAt: Instant)
data class SelectionRequest(val communityId: UUID)
data class MemberResponse(
    val userId: UUID, val username: String, val status: String, val isAdmin: Boolean,
)
data class AcceptResponse(val status: String, val name: String, val slug: String)

fun Community.toResponse() = CommunityResponse(id!!, name, slug, startsAt, phaseTwoStartRound)
fun Community.toSummary() = CommunitySummary(id!!, name, slug)
```

- [ ] **Step 2: Implement exception → HTTP mapping**

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(basePackages = ["org.unividuell.countdown.core.community.internal"])
class CommunityExceptionHandler {
    @ExceptionHandler(SlugUnavailableException::class, LastAdminException::class)
    fun conflict(e: RuntimeException) = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.message ?: "conflict")

    @ExceptionHandler(CommunityAccessDeniedException::class, InviteNotFoundException::class)
    fun notFound(e: RuntimeException) = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message ?: "not found")

    @ExceptionHandler(NotAdminException::class)
    fun forbidden(e: RuntimeException) = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, e.message ?: "forbidden")

    @ExceptionHandler(InviteExpiredException::class)
    fun gone(e: RuntimeException) = ProblemDetail.forStatusAndDetail(HttpStatus.GONE, e.message ?: "gone")

    @ExceptionHandler(IllegalArgumentException::class)
    fun badRequest(e: IllegalArgumentException) = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.message ?: "bad request")
}
```

- [ ] **Step 3: Commit** — `feat(community): DTOs + exception→HTTP mapping`

### Task 13: `CommunityController` — create, list, get, patch, selection

**Files:**
- Create: `…/community/internal/CommunityController.kt`
- Test: `…/community/CommunityControllerTest.kt`

The controller derives `userId`/`isSuperAdmin` from `@AuthenticationPrincipal CountdownOAuth2User` (see `iam` test for the principal helper). Services are `@MockkBean`ed; `CommunityAccess` too where used.

- [ ] **Step 1: Write the failing test** (mirror `UserControllerTest` structure)

```kotlin
package org.unividuell.countdown.core.community

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.justRun
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.*
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.*
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class CommunityControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var communityService: CommunityService
    @MockkBean lateinit var query: org.unividuell.countdown.core.community.MembershipQuery
    @MockkBean lateinit var communityQuery: org.unividuell.countdown.core.community.CommunityQuery
    @MockkBean lateinit var access: CommunityAccess
    @MockkBean lateinit var selection: SelectionService

    private val uid = UUID.fromString("018f0000-0000-7000-8000-000000000000")
    private fun principal(superAdmin: Boolean = false) = authentication(
        OAuth2AuthenticationToken(
            CountdownOAuth2User(User(id = uid, githubId = 1L, githubLogin = "octocat", isSuperAdmin = superAdmin), mapOf("login" to "octocat")),
            CountdownOAuth2User(User(id = uid, githubId = 1L, githubLogin = "octocat", isSuperAdmin = superAdmin), emptyMap()).authorities,
            "github",
        )
    )
    private fun community(slug: String) = Community(id = UUID.randomUUID(), name = "Team", slug = slug, createdBy = uid)

    @Test
    fun `POST creates a community`() {
        every { communityService.create(uid, "Team A") } returns community("team-a")
        mockMvc.post("/api/communities") {
            with(principal()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Team A"}"""
        }.andExpect { status { isCreated() }; jsonPath("$.slug") { value("team-a") } }
    }

    @Test
    fun `POST surfaces slug conflict as 409`() {
        every { communityService.create(uid, "join") } throws SlugUnavailableException("reserved")
        mockMvc.post("/api/communities") {
            with(principal()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"join"}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `GET communities lists active memberships`() {
        every { query.activeCommunitiesOf(uid) } returns listOf(community("team-a"))
        mockMvc.get("/api/communities") { with(principal()) }
            .andExpect { status { isOk() }; jsonPath("$[0].slug") { value("team-a") } }
    }

    @Test
    fun `GET by slug requires membership`() {
        every { access.requireActiveMember(uid, false, "secret") } throws CommunityAccessDeniedException()
        mockMvc.get("/api/communities/secret") { with(principal()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `PATCH requires admin`() {
        every { access.requireAdmin(uid, false, "team-a") } throws NotAdminException()
        mockMvc.patch("/api/communities/team-a") {
            with(principal()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"New"}"""
        }.andExpect { status { isForbidden() } }
    }
}
```

- [ ] **Step 2: Run — expect compile failure.**
- [ ] **Step 3: Implement**

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.*
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User

@RestController
@RequestMapping("/api/communities")
class CommunityController(
    private val communityService: CommunityService,
    private val membershipQuery: MembershipQuery,
    private val access: CommunityAccess,
    private val selection: SelectionService,
) {
    private val CountdownOAuth2User.uid get() = user.id!!
    private val CountdownOAuth2User.sa get() = user.isSuperAdmin

    @PostMapping
    fun create(@AuthenticationPrincipal me: CountdownOAuth2User, @RequestBody body: CreateCommunityRequest): ResponseEntity<CommunityResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(communityService.create(me.uid, body.name).toResponse())

    @GetMapping
    fun mine(@AuthenticationPrincipal me: CountdownOAuth2User): List<CommunitySummary> =
        membershipQuery.activeCommunitiesOf(me.uid).map { it.toSummary() }

    @GetMapping("/selection")
    fun getSelection(@AuthenticationPrincipal me: CountdownOAuth2User): Map<String, Any?> =
        mapOf("communityId" to selection.get(me.uid))

    @PutMapping("/selection")
    fun setSelection(@AuthenticationPrincipal me: CountdownOAuth2User, @RequestBody body: SelectionRequest): ResponseEntity<Void> {
        selection.set(me.uid, body.communityId); return ResponseEntity.noContent().build()
    }

    @GetMapping("/{slug}")
    fun get(@AuthenticationPrincipal me: CountdownOAuth2User, @PathVariable slug: String): CommunityResponse =
        access.requireActiveMember(me.uid, me.sa, slug).toResponse()

    @PatchMapping("/{slug}")
    fun update(@AuthenticationPrincipal me: CountdownOAuth2User, @PathVariable slug: String, @RequestBody body: UpdateCommunityRequest): CommunityResponse {
        val c = access.requireAdmin(me.uid, me.sa, slug)
        return communityService.update(c, body.name, body.startsAt, body.phaseTwoStartRound).toResponse()
    }
}
```

> Note: `/selection` is declared before `/{slug}` so it isn't captured by the path variable. (Spring matches the more specific literal path first, but keep the ordering explicit for readers.)

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(community): CommunityController (create/list/get/patch/selection)`

### Task 14: `MemberController` — invite, join, members, approve, promote/demote, remove/leave

**Files:**
- Create: `…/community/internal/MemberController.kt`
- Test: `…/community/MemberControllerTest.kt`

Uses `iam.UserQuery` to enrich member rows with `username` for `GET …/members`.

- [ ] **Step 1: Write the failing test** (key cases — full matrix follows the same shape)

```kotlin
package org.unividuell.countdown.core.community

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.justRun
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.*
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.*
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class MemberControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var membership: MembershipService
    @MockkBean lateinit var access: CommunityAccess
    @MockkBean lateinit var memberRepo: CommunityMemberRepository
    @MockkBean lateinit var userQuery: UserQuery

    private val uid = UUID.fromString("018f0000-0000-7000-8000-000000000000")
    private fun principal() = authentication(
        OAuth2AuthenticationToken(
            CountdownOAuth2User(User(id = uid, githubId = 1L, githubLogin = "octocat"), mapOf("login" to "octocat")),
            CountdownOAuth2User(User(id = uid, githubId = 1L, githubLogin = "octocat"), emptyMap()).authorities, "github",
        )
    )
    private fun community(slug: String) = Community(id = UUID.randomUUID(), name = "Team", slug = slug, createdBy = uid)

    @Test
    fun `admin generates an invite link`() {
        val c = community("team")
        every { access.requireAdmin(uid, false, "team") } returns c
        every { membership.generateInvite(c.id!!) } returns InviteInfo("tok123", Instant.parse("2030-01-01T00:00:00Z"))
        mockMvc.post("/api/communities/team/invite") { with(principal()); with(csrf()) }
            .andExpect { status { isOk() }; jsonPath("$.url") { value(org.hamcrest.Matchers.containsString("/join/tok123")) } }
    }

    @Test
    fun `accept of expired token returns 410`() {
        every { membership.accept("tok", uid) } throws InviteExpiredException()
        mockMvc.post("/api/communities/join/tok") { with(principal()); with(csrf()) }
            .andExpect { status { isGone() } }
    }

    @Test
    fun `accept returns the community + status`() {
        every { membership.accept("tok", uid) } returns AcceptResult.JoinedPending(community("team"))
        mockMvc.post("/api/communities/join/tok") { with(principal()); with(csrf()) }
            .andExpect { status { isOk() }; jsonPath("$.status") { value("JOINED_PENDING") }; jsonPath("$.slug") { value("team") } }
    }
}
```

- [ ] **Step 2: Run — expect compile failure.**
- [ ] **Step 3: Implement**

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.*
import org.springframework.web.util.UriComponentsBuilder
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.iam.UserQuery
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import java.util.UUID

@RestController
@RequestMapping("/api/communities")
class MemberController(
    private val membership: MembershipService,
    private val access: CommunityAccess,
    private val memberRepo: CommunityMemberRepository,
    private val userQuery: UserQuery,
) {
    private val CountdownOAuth2User.uid get() = user.id!!
    private val CountdownOAuth2User.sa get() = user.isSuperAdmin

    @PostMapping("/{slug}/invite")
    fun invite(@AuthenticationPrincipal me: CountdownOAuth2User, @PathVariable slug: String): InviteResponse {
        val c = access.requireAdmin(me.uid, me.sa, slug)
        val info = membership.generateInvite(c.id!!)
        val url = UriComponentsBuilder.fromPath("/join/{token}").buildAndExpand(info.token).toUriString()
        return InviteResponse(url = url, expiresAt = info.expiresAt)
    }

    @DeleteMapping("/{slug}/invite")
    fun revoke(@AuthenticationPrincipal me: CountdownOAuth2User, @PathVariable slug: String): ResponseEntity<Void> {
        val c = access.requireAdmin(me.uid, me.sa, slug); membership.revokeInvite(c.id!!)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/join/{token}")
    fun join(@AuthenticationPrincipal me: CountdownOAuth2User, @PathVariable token: String): AcceptResponse {
        val r = membership.accept(token, me.uid)
        val status = when (r) {
            is AcceptResult.JoinedPending -> "JOINED_PENDING"
            is AcceptResult.AlreadyPending -> "ALREADY_PENDING"
            is AcceptResult.AlreadyActive -> "ALREADY_ACTIVE"
        }
        return AcceptResponse(status, r.community.name, r.community.slug)
    }

    @GetMapping("/{slug}/members")
    fun members(@AuthenticationPrincipal me: CountdownOAuth2User, @PathVariable slug: String): List<MemberResponse> {
        val c = access.requireActiveMember(me.uid, me.sa, slug)
        return memberRepo.findByCommunityId(c.id!!).map {
            MemberResponse(
                userId = it.userId,
                username = userQuery.findById(it.userId)?.username ?: "?",
                status = it.status.name,
                isAdmin = it.isAdmin,
            )
        }
    }

    @PostMapping("/{slug}/members/{userId}/approve")
    fun approve(@AuthenticationPrincipal me: CountdownOAuth2User, @PathVariable slug: String, @PathVariable userId: UUID): ResponseEntity<Void> {
        val c = access.requireAdmin(me.uid, me.sa, slug); membership.approve(c.id!!, userId)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/{slug}/members/{userId}/promote")
    fun promote(@AuthenticationPrincipal me: CountdownOAuth2User, @PathVariable slug: String, @PathVariable userId: UUID): ResponseEntity<Void> {
        val c = access.requireAdmin(me.uid, me.sa, slug); membership.promote(c.id!!, userId)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/{slug}/members/{userId}/demote")
    fun demote(@AuthenticationPrincipal me: CountdownOAuth2User, @PathVariable slug: String, @PathVariable userId: UUID): ResponseEntity<Void> {
        val c = access.requireAdmin(me.uid, me.sa, slug); membership.demote(c.id!!, userId)
        return ResponseEntity.noContent().build()
    }

    @DeleteMapping("/{slug}/members/{userId}")
    fun remove(@AuthenticationPrincipal me: CountdownOAuth2User, @PathVariable slug: String, @PathVariable userId: UUID): ResponseEntity<Void> {
        // self-leave: an active member may remove themselves; otherwise admin required
        if (userId == me.uid) {
            val c = access.requireActiveMember(me.uid, me.sa, slug); membership.leave(c.id!!, me.uid)
        } else {
            val c = access.requireAdmin(me.uid, me.sa, slug); membership.remove(c.id!!, userId)
        }
        return ResponseEntity.noContent().build()
    }
}
```

- [ ] **Step 4: Run — expect PASS** (add tests for approve/promote/demote/remove + self-leave + member-list following the same shape; ensure last-admin 409 surfaces via the service throwing `LastAdminException`).
- [ ] **Step 5: Commit** — `feat(community): MemberController (invite/join/members/approve/promote/demote/remove)`

### Task 15: Modularity + full-migration integration check; clean build

**Files:**
- (No new prod code — verification.) Optionally Test: `…/community/CommunityMigrationIT.kt` (a `@SpringBootTest` that boots = full Flyway set applied; `CommunityRepositoryTest` already proves this, so this task mainly re-verifies modularity + does the clean build.)

- [ ] **Step 1: Run the modularity test** — `cd core && ./mvnw -q test -Dtest=ModularityTests`
  Expected: PASS. `community` may depend on `iam`'s exposed API only (`UserQuery`); no `internal` leakage.
- [ ] **Step 2: Clean build to refresh `application-modules.json`** — `cd core && ./mvnw clean test`
  Expected: all tests green; the regenerated `META-INF/spring-modulith/application-modules.json` now includes `community` (stale-file stumbling block, per the modules guideline).
- [ ] **Step 3: Commit** (if the IT was added) — `test(community): full-migration + modularity verification`

---

## Phase 4 — Frontend: types, client, slug, composable

Frontend conventions (`.claude/guidelines/frontend.md`): composables + VueUse (no Pinia), `apiFetch`/`useAuth`, Vitest + `vi`. File-based routes via `vue-router/auto-routes`.

### Task 16: API types + client functions

**Files:**
- Modify: `webapp-vue/src/api/types.ts` (append community types)
- Create: `webapp-vue/src/api/communities.ts`
- Test: `webapp-vue/src/api/__tests__/communities.spec.ts`

- [ ] **Step 1: Write the failing test** (mock `apiFetch`)

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as client from '@/api/client'
import { createCommunity, listCommunities, joinByToken } from '@/api/communities'

vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof client>()), apiFetch: vi.fn() }))
const apiFetch = vi.mocked(client.apiFetch)

describe('communities api', () => {
  beforeEach(() => apiFetch.mockReset())

  it('creates a community', async () => {
    apiFetch.mockResolvedValue({ id: '1', name: 'Team A', slug: 'team-a', startsAt: null, phaseTwoStartRound: null })
    const c = await createCommunity('Team A')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities', { method: 'POST', body: JSON.stringify({ name: 'Team A' }) })
    expect(c.slug).toBe('team-a')
  })

  it('lists communities', async () => {
    apiFetch.mockResolvedValue([{ id: '1', name: 'A', slug: 'a' }])
    expect(await listCommunities()).toHaveLength(1)
  })

  it('joins by token', async () => {
    apiFetch.mockResolvedValue({ status: 'JOINED_PENDING', name: 'A', slug: 'a' })
    const r = await joinByToken('tok')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities/join/tok', { method: 'POST' })
    expect(r.status).toBe('JOINED_PENDING')
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`@/api/communities` missing). `cd webapp-vue && pnpm test`
- [ ] **Step 3: Implement**

`types.ts` append:
```ts
export interface CommunityResponse {
  id: string; name: string; slug: string
  startsAt: string | null; phaseTwoStartRound: number | null
}
export interface CommunitySummary { id: string; name: string; slug: string }
export interface MemberResponse { userId: string; username: string; status: 'PENDING' | 'ACTIVE'; isAdmin: boolean }
export interface InviteResponse { url: string; expiresAt: string }
export interface AcceptResponse { status: 'JOINED_PENDING' | 'ALREADY_PENDING' | 'ALREADY_ACTIVE'; name: string; slug: string }
```

`communities.ts`:
```ts
import { apiFetch } from '@/api/client'
import type { AcceptResponse, CommunityResponse, CommunitySummary, InviteResponse, MemberResponse } from '@/api/types'

export const listCommunities = () => apiFetch<CommunitySummary[]>('/api/communities')
export const getSelection = () => apiFetch<{ communityId: string | null }>('/api/communities/selection')
export const setSelection = (communityId: string) =>
  apiFetch<void>('/api/communities/selection', { method: 'PUT', body: JSON.stringify({ communityId }) })
export const createCommunity = (name: string) =>
  apiFetch<CommunityResponse>('/api/communities', { method: 'POST', body: JSON.stringify({ name }) })
export const getCommunity = (slug: string) => apiFetch<CommunityResponse>(`/api/communities/${slug}`)
export const updateCommunity = (slug: string, body: Partial<{ name: string; startsAt: string; phaseTwoStartRound: number }>) =>
  apiFetch<CommunityResponse>(`/api/communities/${slug}`, { method: 'PATCH', body: JSON.stringify(body) })
export const generateInvite = (slug: string) =>
  apiFetch<InviteResponse>(`/api/communities/${slug}/invite`, { method: 'POST' })
export const joinByToken = (token: string) =>
  apiFetch<AcceptResponse>(`/api/communities/join/${token}`, { method: 'POST' })
export const listMembers = (slug: string) => apiFetch<MemberResponse[]>(`/api/communities/${slug}/members`)
export const approveMember = (slug: string, userId: string) =>
  apiFetch<void>(`/api/communities/${slug}/members/${userId}/approve`, { method: 'POST' })
export const promoteMember = (slug: string, userId: string) =>
  apiFetch<void>(`/api/communities/${slug}/members/${userId}/promote`, { method: 'POST' })
export const demoteMember = (slug: string, userId: string) =>
  apiFetch<void>(`/api/communities/${slug}/members/${userId}/demote`, { method: 'POST' })
export const removeMember = (slug: string, userId: string) =>
  apiFetch<void>(`/api/communities/${slug}/members/${userId}`, { method: 'DELETE' })
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(web): community api client + types`

### Task 17: Slug preview function (TS) with backend parity

**Files:**
- Create: `webapp-vue/src/lib/slugify.ts`
- Test: `webapp-vue/src/lib/__tests__/slugify.spec.ts`

- [ ] **Step 1: Write the failing test** — the SAME cases as the backend `SlugsTest`

```ts
import { describe, expect, it } from 'vitest'
import { slugify } from '@/lib/slugify'

describe('slugify (parity with backend Slugs.slugify)', () => {
  it.each([
    ['Hütte Hütte', 'huette-huette'],
    ['Café Crème', 'cafe-creme'],
    ['Süßes & Saures!', 'suesses-saures'],
    ['  multiple   spaces  ', 'multiple-spaces'],
    ['Team---A', 'team-a'],
  ])('slugify(%s) = %s', (input, expected) => expect(slugify(input)).toBe(expected))
})
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** (mirror the Kotlin rules exactly)

```ts
// Mirror of backend Slugs.slugify (Kotlin is the source of truth). Keep in parity — see SlugsTest.
export function slugify(name: string): string {
  const umlauts = name
    .toLowerCase()
    .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss')
  const noDiacritics = umlauts.normalize('NFKD').replace(/\p{M}+/gu, '')
  return noDiacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(web): slug preview fn (parity with backend)`

### Task 18: `useCommunities` composable (list + current + selection + redirect target)

**Files:**
- Create: `webapp-vue/src/communities/useCommunities.ts`
- Test: `webapp-vue/src/communities/__tests__/useCommunities.spec.ts`

The redirect resolver: given the active list + last-selected, returns `{ kind: 'none' } | { kind: 'one', slug } | { kind: 'choose' } | { kind: 'last', slug }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { resolveLanding } from '@/communities/useCommunities'

describe('resolveLanding', () => {
  const a = { id: '1', name: 'A', slug: 'a' }
  const b = { id: '2', name: 'B', slug: 'b' }
  it('none when no active communities', () => expect(resolveLanding([], null)).toEqual({ kind: 'none' }))
  it('one when exactly one', () => expect(resolveLanding([a], null)).toEqual({ kind: 'one', slug: 'a' }))
  it('last-selected when many and selection is still active', () =>
    expect(resolveLanding([a, b], '2')).toEqual({ kind: 'last', slug: 'b' }))
  it('choose when many and selection is stale/missing', () =>
    expect(resolveLanding([a, b], '999')).toEqual({ kind: 'choose' }))
})
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement**

```ts
import { ref } from 'vue'
import type { CommunitySummary } from '@/api/types'
import { listCommunities, getSelection } from '@/api/communities'

export type Landing =
  | { kind: 'none' }
  | { kind: 'one'; slug: string }
  | { kind: 'last'; slug: string }
  | { kind: 'choose' }

export function resolveLanding(active: CommunitySummary[], lastSelectedId: string | null): Landing {
  if (active.length === 0) return { kind: 'none' }
  if (active.length === 1) return { kind: 'one', slug: active[0]!.slug }
  const last = active.find((c) => c.id === lastSelectedId)
  return last ? { kind: 'last', slug: last.slug } : { kind: 'choose' }
}

const active = ref<CommunitySummary[]>([])
export function useCommunities() {
  async function refresh(): Promise<void> { active.value = await listCommunities() }
  async function landing(): Promise<Landing> {
    const [list, sel] = await Promise.all([listCommunities(), getSelection()])
    active.value = list
    return resolveLanding(list, sel.communityId)
  }
  return { active, refresh, landing }
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(web): useCommunities + landing resolver`

---

## Phase 5 — Frontend: routes, guard, pages

### Task 19: Post-login redirect resolver at `/`

**Files:**
- Modify: `webapp-vue/src/pages/index.vue` (turn into a resolver that routes by `landing()`)
- Test: `webapp-vue/src/pages/__tests__/index.spec.ts`

- [ ] **Step 1: Write the failing test** (mock `useCommunities().landing` + a router push)

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as comp from '@/communities/useCommunities'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: push }) }))

describe('index redirect resolver', () => {
  beforeEach(() => push.mockReset())
  it('redirects to the single community', async () => {
    vi.spyOn(comp, 'useCommunities').mockReturnValue({
      active: { value: [] } as never, refresh: vi.fn(),
      landing: vi.fn().mockResolvedValue({ kind: 'one', slug: 'a' }),
    })
    const Index = (await import('@/pages/index.vue')).default
    mount(Index)
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/a/')
  })
  it('redirects to /communities when none', async () => {
    vi.spyOn(comp, 'useCommunities').mockReturnValue({
      active: { value: [] } as never, refresh: vi.fn(),
      landing: vi.fn().mockResolvedValue({ kind: 'none' }),
    })
    const Index = (await import('@/pages/index.vue')).default
    mount(Index); await flushPromises()
    expect(push).toHaveBeenCalledWith('/communities')
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** `pages/index.vue`

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCommunities } from '@/communities/useCommunities'

const router = useRouter()
const { landing } = useCommunities()

onMounted(async () => {
  const l = await landing()
  if (l.kind === 'none' || l.kind === 'choose') router.replace('/communities')
  else router.replace(`/${l.slug}/`)
})
</script>

<template>
  <p class="py-8 text-center text-sm text-neutral-500">Lade deine Spielgemeinschaften…</p>
</template>
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(web): post-login community redirect resolver`

### Task 20: `/communities` chooser/message page + `/communities/new` create form

**Files:**
- Create: `webapp-vue/src/pages/communities/index.vue` (list active + "create"; if empty, message + generic invite hint)
- Create: `webapp-vue/src/pages/communities/new.vue` (name input + live slug preview + 409 handling)
- Test: `webapp-vue/src/pages/communities/__tests__/new.spec.ts`

- [ ] **Step 1: Write the failing test** (live preview + 409)

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { ApiError } from '@/api/client'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: push }) }))

describe('create community page', () => {
  beforeEach(() => push.mockReset())
  it('shows the live slug preview as the user types', async () => {
    const New = (await import('@/pages/communities/new.vue')).default
    const w = mount(New)
    await w.find('input').setValue('Hütte Hütte')
    expect(w.text()).toContain('huette-huette')
  })
  it('surfaces a 409 as a friendly message', async () => {
    vi.spyOn(api, 'createCommunity').mockRejectedValue(new ApiError(409, 'taken'))
    const New = (await import('@/pages/communities/new.vue')).default
    const w = mount(New)
    await w.find('input').setValue('Team A')
    await w.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(w.text()).toMatch(/bereits vergeben|Namen anpassen/i)
    expect(push).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** `pages/communities/new.vue`

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { slugify } from '@/lib/slugify'
import { createCommunity } from '@/api/communities'
import { ApiError } from '@/api/client'

const router = useRouter()
const name = ref('')
const error = ref<string | null>(null)
const slug = computed(() => slugify(name.value))
const tooShort = computed(() => slug.value.length < 3)

async function submit(): Promise<void> {
  error.value = null
  try {
    const c = await createCommunity(name.value.trim())
    router.replace(`/${c.slug}/`)
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 409
      ? 'Dieser Name ergibt einen bereits vergebenen/reservierten Slug — bitte anpassen.'
      : 'Erstellen fehlgeschlagen. Bitte erneut versuchen.'
  }
}
</script>

<template>
  <section class="mx-auto max-w-md py-8">
    <h1 class="mb-4 text-xl font-semibold">Spielgemeinschaft erstellen</h1>
    <form @submit.prevent="submit">
      <label class="block text-sm font-medium" for="name">Name</label>
      <input id="name" v-model="name" class="mt-1 w-full rounded border px-3 py-1.5" minlength="3" maxlength="50" required />
      <p class="mt-2 text-sm text-neutral-500">
        URL: <code>/{{ slug || '…' }}/</code>
        <span v-if="name && tooShort" class="text-amber-600"> (mind. 3 Zeichen)</span>
      </p>
      <button class="mt-4 rounded border px-3 py-1.5 hover:bg-neutral-200" :disabled="tooShort">Erstellen</button>
      <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p>
    </form>
  </section>
</template>
```

`pages/communities/index.vue`:
```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useCommunities } from '@/communities/useCommunities'

const { active, refresh } = useCommunities()
onMounted(refresh)
</script>

<template>
  <section class="mx-auto max-w-md py-8">
    <h1 class="mb-4 text-xl font-semibold">Deine Spielgemeinschaften</h1>
    <ul v-if="active.length" class="mb-6 space-y-2">
      <li v-for="c in active" :key="c.id">
        <RouterLink :to="`/${c.slug}/`" class="text-blue-700 hover:underline">{{ c.name }}</RouterLink>
      </li>
    </ul>
    <p v-else class="mb-6 text-sm text-neutral-600">
      Du bist noch in keiner Spielgemeinschaft. Erstelle eine — oder öffne einen Einladungslink, den du erhalten hast.
    </p>
    <RouterLink to="/communities/new" class="rounded border px-3 py-1.5 hover:bg-neutral-200">Spielgemeinschaft erstellen</RouterLink>
  </section>
</template>
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(web): communities chooser + create page (live slug, 409)`

### Task 21: `/join/[token]` accept page

**Files:**
- Create: `webapp-vue/src/pages/join/[token].vue`
- Test: `webapp-vue/src/pages/join/__tests__/token.spec.ts`

States: pending ("warte auf Bestätigung"), already-active (redirect to `/<slug>/`), invalid (404)/expired (410) → error message.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { ApiError } from '@/api/client'

const replace = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }), useRoute: () => ({ params: { token: 'tok' } }) }))

describe('join page', () => {
  beforeEach(() => replace.mockReset())
  it('shows waiting on JOINED_PENDING', async () => {
    vi.spyOn(api, 'joinByToken').mockResolvedValue({ status: 'JOINED_PENDING', name: 'Team', slug: 'team' })
    const W = (await import('@/pages/join/[token].vue')).default
    const w = mount(W); await flushPromises()
    expect(w.text()).toMatch(/Bestätigung|Team/)
  })
  it('redirects on ALREADY_ACTIVE', async () => {
    vi.spyOn(api, 'joinByToken').mockResolvedValue({ status: 'ALREADY_ACTIVE', name: 'Team', slug: 'team' })
    const W = (await import('@/pages/join/[token].vue')).default
    mount(W); await flushPromises()
    expect(replace).toHaveBeenCalledWith('/team/')
  })
  it('shows expired on 410', async () => {
    vi.spyOn(api, 'joinByToken').mockRejectedValue(new ApiError(410, 'gone'))
    const W = (await import('@/pages/join/[token].vue')).default
    const w = mount(W); await flushPromises()
    expect(w.text()).toMatch(/abgelaufen|ungültig/i)
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { joinByToken } from '@/api/communities'
import { ApiError } from '@/api/client'

const route = useRoute()
const router = useRouter()
const state = ref<'loading' | 'pending' | 'error'>('loading')
const message = ref('')

onMounted(async () => {
  try {
    const r = await joinByToken(String(route.params.token))
    if (r.status === 'ALREADY_ACTIVE') return router.replace(`/${r.slug}/`)
    state.value = 'pending'
    message.value = `Antrag für „${r.name}" gestellt — warte auf Bestätigung durch einen Spielleiter.`
  } catch (e) {
    state.value = 'error'
    message.value = e instanceof ApiError && e.status === 410
      ? 'Dieser Einladungslink ist abgelaufen.'
      : 'Dieser Einladungslink ist ungültig.'
  }
})
</script>

<template>
  <section class="mx-auto max-w-md py-8 text-center">
    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Einladung wird geprüft…</p>
    <p v-else-if="state === 'pending'" class="text-sm">{{ message }}</p>
    <p v-else class="text-sm text-red-600">{{ message }}</p>
  </section>
</template>
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(web): join-by-token accept page`

### Task 22: `/[slug]/` community shell + guard + switcher

**Files:**
- Create: `webapp-vue/src/pages/[slug].vue` (shell: resolves membership via `getCommunity`; renders switcher + `<RouterView>`; on 404 → no-access)
- Create: `webapp-vue/src/communities/CommunitySwitcher.vue`
- Create: `webapp-vue/src/pages/[slug]/index.vue` (community home placeholder)
- Test: `webapp-vue/src/pages/__tests__/slug-shell.spec.ts`

> Routing note: file-based routing maps `pages/[slug].vue` to `/:slug` with nested `pages/[slug]/index.vue`. Static routes (`/communities`, `/join/...`) win over the dynamic segment. The reserved-slug blocklist on the backend is the safety net.

- [ ] **Step 1: Write the failing test** (member → renders; non-member 404 → no-access)

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { ApiError } from '@/api/client'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { slug: 'team' } }),
  RouterView: { template: '<div>child</div>' },
}))

describe('community shell guard', () => {
  it('renders when an active member', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({ id: '1', name: 'Team', slug: 'team', startsAt: null, phaseTwoStartRound: null })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell); await flushPromises()
    expect(w.text()).toContain('Team')
  })
  it('shows no-access on 404', async () => {
    vi.spyOn(api, 'getCommunity').mockRejectedValue(new ApiError(404, 'no access'))
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell); await flushPromises()
    expect(w.text()).toMatch(/kein Zugriff|nicht gefunden/i)
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** `pages/[slug].vue`

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { getCommunity, setSelection } from '@/api/communities'
import { ApiError } from '@/api/client'
import type { CommunityResponse } from '@/api/types'
import CommunitySwitcher from '@/communities/CommunitySwitcher.vue'

const route = useRoute()
const community = ref<CommunityResponse | null>(null)
const state = ref<'loading' | 'ready' | 'no-access'>('loading')

async function resolve(slug: string): Promise<void> {
  state.value = 'loading'
  try {
    community.value = await getCommunity(slug)
    state.value = 'ready'
    void setSelection(community.value.id) // remember last-selected
  } catch (e) {
    state.value = e instanceof ApiError && e.status === 404 ? 'no-access' : 'no-access'
    community.value = null
  }
}
onMounted(() => resolve(String(route.params.slug)))
watch(() => route.params.slug, (s) => resolve(String(s)))
</script>

<template>
  <div v-if="state === 'loading'" class="py-8 text-center text-sm text-neutral-500">Lade…</div>
  <div v-else-if="state === 'no-access'" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Kein Zugriff</h1>
    <p class="text-sm text-neutral-600">Diese Spielgemeinschaft existiert nicht oder du bist kein Mitglied.</p>
  </div>
  <div v-else>
    <header class="mb-4 flex items-center justify-between border-b px-4 py-2">
      <span class="font-semibold">{{ community?.name }}</span>
      <CommunitySwitcher :current-slug="community!.slug" />
    </header>
    <RouterView />
  </div>
</template>
```

`communities/CommunitySwitcher.vue`:
```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCommunities } from '@/communities/useCommunities'
import { setSelection } from '@/api/communities'

defineProps<{ currentSlug: string }>()
const router = useRouter()
const { active, refresh } = useCommunities()
onMounted(refresh)

async function go(slug: string, id: string): Promise<void> {
  await setSelection(id)
  router.push(`/${slug}/`)
}
</script>

<template>
  <div class="flex items-center gap-2">
    <select class="rounded border px-2 py-1 text-sm"
            :value="currentSlug"
            @change="(e) => { const c = active.find(x => x.slug === (e.target as HTMLSelectElement).value); if (c) go(c.slug, c.id) }">
      <option v-for="c in active" :key="c.id" :value="c.slug">{{ c.name }}</option>
    </select>
    <button class="rounded border px-2 py-1 text-sm hover:bg-neutral-200" @click="router.push('/communities/new')">＋</button>
  </div>
</template>
```

`pages/[slug]/index.vue`:
```vue
<script setup lang="ts">
// Community home. Per-community countdown/game content is a later spec.
</script>
<template>
  <section class="mx-auto max-w-md py-8 text-center text-sm text-neutral-600">
    Willkommen in dieser Spielgemeinschaft.
  </section>
</template>
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(web): community shell + guard + switcher`

### Task 23: `/[slug]/members` admin page (approve / promote / demote / remove) + `/[slug]/settings` (edit + invite)

**Files:**
- Create: `webapp-vue/src/pages/[slug]/members.vue`
- Create: `webapp-vue/src/pages/[slug]/settings.vue`
- Test: `webapp-vue/src/pages/[slug]/__tests__/members.spec.ts`

These pages call `listMembers`/`approveMember`/… and `updateCommunity`/`generateInvite`. They render admin controls; non-admin actions return 403 (surfaced as a disabled/hidden control + error toast). Admin-only rendering is best-effort UI; the backend is the real gate.

- [ ] **Step 1: Write the failing test** (members list + approve calls API + refreshes)

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { slug: 'team' } }) }))

describe('members admin page', () => {
  it('lists members and approves a pending one', async () => {
    const list = vi.spyOn(api, 'listMembers')
    list.mockResolvedValue([{ userId: 'u1', username: 'Alice', status: 'PENDING', isAdmin: false }])
    const approve = vi.spyOn(api, 'approveMember').mockResolvedValue(undefined as never)
    const Members = (await import('@/pages/[slug]/members.vue')).default
    const w = mount(Members); await flushPromises()
    expect(w.text()).toContain('Alice')
    list.mockResolvedValue([{ userId: 'u1', username: 'Alice', status: 'ACTIVE', isAdmin: false }])
    await w.find('[data-test=approve]').trigger('click'); await flushPromises()
    expect(approve).toHaveBeenCalledWith('team', 'u1')
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** `pages/[slug]/members.vue`

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { listMembers, approveMember, promoteMember, demoteMember, removeMember } from '@/api/communities'
import type { MemberResponse } from '@/api/types'

const route = useRoute()
const slug = String(route.params.slug)
const members = ref<MemberResponse[]>([])
const error = ref<string | null>(null)

async function load(): Promise<void> { members.value = await listMembers(slug) }
async function run(fn: () => Promise<void>): Promise<void> {
  error.value = null
  try { await fn(); await load() } catch { error.value = 'Aktion fehlgeschlagen.' }
}
onMounted(load)
</script>

<template>
  <section class="mx-auto max-w-lg py-8">
    <h1 class="mb-4 text-xl font-semibold">Mitglieder</h1>
    <p v-if="error" class="mb-3 text-sm text-red-600">{{ error }}</p>
    <ul class="space-y-2">
      <li v-for="m in members" :key="m.userId" class="flex items-center justify-between gap-2 border-b py-2 text-sm">
        <span>{{ m.username }} <em class="text-neutral-500">({{ m.status }}{{ m.isAdmin ? ', Admin' : '' }})</em></span>
        <span class="flex gap-2">
          <button v-if="m.status === 'PENDING'" data-test="approve" class="rounded border px-2 py-0.5" @click="run(() => approveMember(slug, m.userId))">Bestätigen</button>
          <button v-if="m.status === 'ACTIVE' && !m.isAdmin" class="rounded border px-2 py-0.5" @click="run(() => promoteMember(slug, m.userId))">Zu Admin</button>
          <button v-if="m.status === 'ACTIVE' && m.isAdmin" class="rounded border px-2 py-0.5" @click="run(() => demoteMember(slug, m.userId))">Admin entz.</button>
          <button class="rounded border px-2 py-0.5 text-red-600" @click="run(() => removeMember(slug, m.userId))">Entfernen</button>
        </span>
      </li>
    </ul>
  </section>
</template>
```

`pages/[slug]/settings.vue` (edit name/startsAt/phaseTwoStartRound + invite link):
```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getCommunity, updateCommunity, generateInvite } from '@/api/communities'

const route = useRoute()
const slug = String(route.params.slug)
const name = ref(''); const startsAt = ref(''); const phaseTwoStartRound = ref<number | null>(null)
const inviteUrl = ref<string | null>(null); const error = ref<string | null>(null)

onMounted(async () => {
  const c = await getCommunity(slug)
  name.value = c.name; startsAt.value = c.startsAt ?? ''; phaseTwoStartRound.value = c.phaseTwoStartRound
})
async function save(): Promise<void> {
  error.value = null
  try {
    await updateCommunity(slug, {
      name: name.value.trim(),
      startsAt: startsAt.value || undefined,
      phaseTwoStartRound: phaseTwoStartRound.value ?? undefined,
    })
  } catch { error.value = 'Speichern fehlgeschlagen.' }
}
async function invite(): Promise<void> {
  const r = await generateInvite(slug)
  inviteUrl.value = `${window.location.origin}${r.url}`
}
</script>

<template>
  <section class="mx-auto max-w-md py-8">
    <h1 class="mb-4 text-xl font-semibold">Einstellungen</h1>
    <form class="space-y-3" @submit.prevent="save">
      <label class="block text-sm">Name<input v-model="name" class="mt-1 w-full rounded border px-3 py-1.5" minlength="3" maxlength="50" /></label>
      <p class="text-xs text-neutral-500">URL-Slug <code>/{{ slug }}/</code> ist unveränderlich.</p>
      <label class="block text-sm">Start (ISO)<input v-model="startsAt" class="mt-1 w-full rounded border px-3 py-1.5" placeholder="2026-09-01T11:00:00+02:00" /></label>
      <label class="block text-sm">Phase-2-Startrunde<input v-model.number="phaseTwoStartRound" type="number" min="1" class="mt-1 w-full rounded border px-3 py-1.5" /></label>
      <button class="rounded border px-3 py-1.5 hover:bg-neutral-200">Speichern</button>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    </form>
    <div class="mt-6">
      <button class="rounded border px-3 py-1.5 hover:bg-neutral-200" @click="invite">Einladungslink erzeugen</button>
      <p v-if="inviteUrl" class="mt-2 break-all text-sm"><code>{{ inviteUrl }}</code></p>
    </div>
  </section>
</template>
```

- [ ] **Step 4: Run — expect PASS** (add a settings test for the invite-link render following the members shape).
- [ ] **Step 5: Commit** — `feat(web): members admin + community settings (edit + invite)`

### Task 24: Full suites green + feed knowledge back

**Files:**
- Modify: `.claude/guidelines/` (capture conventions per the spec's "Feed knowledge back")

- [ ] **Step 1: Backend** — `cd core && ./mvnw clean test` → all green (incl. `ModularityTests`, regenerated `application-modules.json`).
- [ ] **Step 2: Frontend** — `cd webapp-vue && pnpm test && pnpm build` → green.
- [ ] **Step 3: Capture learnings** into `.claude/guidelines/` (new or existing files):
  - multi-tenant `community_id` scoping convention;
  - slug-derivation **parity rule** (Kotlin source of truth + TS mirror + parity test);
  - module cross-read API pattern (`CommunityQuery`/`MembershipQuery`);
  - URL-slug-as-context routing/guard pattern (`/[slug].vue` shell resolving membership; last-selected on resolve).
  - (cross-schema FK + migration-ordering already captured in `modules-and-migrations.md`.)
- [ ] **Step 4: Commit** — `docs(community): feed conventions back into guidelines`

---

## Self-Review

**Spec coverage:** community entity + 3 tables + cross-schema FKs (Task 1–4); slug rules + reserved + parity (Task 5, 17); creation→creator-admin + name/slug validation + 409 (Task 7, 13); membership PENDING/ACTIVE + is_admin (Task 3, 9); invite reusable 7-day + regenerate + accept paths (Task 8, 14); approve/promote/demote/remove/leave + last-admin (Task 9); super-admin override + no-access 404 + not-admin 403 (Task 11, 12, 13, 14); selection + login-redirect resolver (Task 4, 10, 18, 19); routing `/communities`,`/communities/new`,`/join/[token]`,`/[slug]/` + switcher + no-access (Task 19–23); error mapping 400/404/403/409/410 (Task 12); tests both sides (every task); modularity + clean build (Task 15, 24); feed-back (Task 24). All spec sections map to a task.

**Type consistency:** `MemberStatus {PENDING,ACTIVE}`, `AcceptResult` discriminator strings (`JOINED_PENDING`/`ALREADY_PENDING`/`ALREADY_ACTIVE`) match the TS `AcceptResponse.status` union and the join page. `Slugs.slugify` (Kotlin) and `slugify` (TS) share the documented rule + identical test cases. `CommunityAccess.requireActiveMember/requireAdmin(userId, isSuperAdmin, slug)` signature is used consistently in both controllers. API client paths match the controller `@RequestMapping` routes.

**Placeholder scan:** no TBD/TODO; each code step contains complete code; commands have expected outcomes. The per-community game content `pages/[slug]/index.vue` is intentionally a placeholder *screen* (out of scope), not a plan placeholder.
