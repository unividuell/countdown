# Countdown Engine + Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the app's countdown core — a server-authoritative round engine (DST-correct, round-0, signed `T-`/`T+`) and a live ticking header display, plus the `community.startsAtTimezone` field and zone-relative admin entry.

**Architecture:** A new pure-function `countdown` Spring Modulith module owns all round logic and emits **absolute instants** (current + next round) via `GET /api/communities/{slug}/countdown`. The Vue header reads those instants and ticks locally with pure subtraction + duration formatting — **no round logic is duplicated in TS**. Round numbering, intervals, and DST handling live only in Kotlin and follow [`.claude/guidelines/countdown.md`](../../.claude/guidelines/countdown.md) verbatim.

**Tech Stack:** Kotlin 2.3 / Spring Boot 4.1 / Spring Modulith 2.1 / Spring Data JDBC / Flyway / PostgreSQL 18 (backend); Vue 3 / Vite 8 / TypeScript / Luxon / VueUse / Vitest (frontend). Tests: mockk + kotest + MockMvc DSL + Testcontainers (backend), Vitest + `vi` (frontend). TDD throughout.

**Round model (reference — do not re-derive):** `round n = [startsAt − (n+1)d, startsAt − n d)`, start-inclusive, zone-/DST-aware. `n=0` is the last day before start (`[startsAt−1d, startsAt)`). `n<0` is at/after start (`n=−1` = first event day). Label: `n≥0 → "T-n"`, `n<0 → "T+|n|"`. Numbers **decrease** as time advances; the next round (later in time) is `n−1`.

---

## File Structure

**Backend (create):**
- `core/src/main/resources/db/migration/community/V2__add_starts_at_timezone.sql` — the new column.
- `core/src/main/kotlin/org/unividuell/countdown/core/countdown/Round.kt` — public `Round` value type.
- `core/src/main/kotlin/org/unividuell/countdown/core/countdown/CountdownEngine.kt` — public pure engine.
- `core/src/main/kotlin/org/unividuell/countdown/core/countdown/CountdownQuery.kt` — public query interface (future scoring).
- `core/src/main/kotlin/org/unividuell/countdown/core/countdown/internal/CountdownDtos.kt`
- `core/src/main/kotlin/org/unividuell/countdown/core/countdown/internal/CountdownService.kt`
- `core/src/main/kotlin/org/unividuell/countdown/core/countdown/internal/CountdownController.kt`
- `core/src/main/kotlin/org/unividuell/countdown/core/countdown/internal/CountdownExceptions.kt` + `CountdownExceptionHandler.kt`
- Tests: `core/src/test/kotlin/org/unividuell/countdown/core/countdown/CountdownEngineTest.kt`, `CountdownControllerTest.kt`, `CountdownServiceTest.kt`.

**Backend (modify):**
- `core/.../community/Community.kt` — add `startsAtTimezone`.
- `core/.../community/internal/CommunityDtos.kt` — `CommunityResponse` + `UpdateCommunityRequest` + `toResponse`.
- `core/.../community/internal/CommunityService.kt` — `update(...)` gains `startsAtTimezone` + IANA validation.
- `core/.../community/internal/CommunityController.kt` — pass `body.startsAtTimezone`.
- `core/.../CoreApplication.kt` — register a `Clock` bean.

**Frontend (create):**
- `webapp-vue/src/api/countdown.ts` — `getCountdown`.
- `webapp-vue/src/communities/countdown.ts` — **pure** display functions (`computeView`, `nextBaseUnitConfig`, `boundaryAction`).
- `webapp-vue/src/communities/useCountdown.ts` — composable wiring clock + fetch around the pure functions.
- `webapp-vue/src/communities/CountdownDisplay.vue` — the header widget.
- Tests: `webapp-vue/src/communities/__tests__/countdown.spec.ts`, `webapp-vue/src/communities/__tests__/CountdownDisplay.spec.ts`, `webapp-vue/src/pages/[slug]/__tests__/settings.spec.ts`, `webapp-vue/src/__tests__/app-header.spec.ts`.

**Frontend (modify):**
- `webapp-vue/src/api/types.ts` — `Round`, `CountdownResponse`, `startsAtTimezone` on `CommunityResponse`.
- `webapp-vue/src/api/communities.ts` — `updateCommunity` body type gains `startsAtTimezone`.
- `webapp-vue/src/communities/context.ts` — widen to `activeCommunity`.
- `webapp-vue/src/App.vue` — main-header title + `'YY` + mount the widget.
- `webapp-vue/src/pages/[slug].vue` — set/clear `activeCommunity`; drop the duplicated name link.
- `webapp-vue/src/pages/[slug]/settings.vue` — zone select + zone-relative `startsAt`.
- Mock fixups: `slug-shell.spec.ts`, `[slug]/__tests__/members.spec.ts`, `[slug]/__tests__/requests.spec.ts`.

---

## Task 1: `community.startsAtTimezone` field

**Files:**
- Create: `core/src/main/resources/db/migration/community/V2__add_starts_at_timezone.sql`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/Community.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityServiceTest.kt`, `CommunityControllerTest.kt`

- [ ] **Step 1: Write the failing service tests**

Append to `CommunityServiceTest.kt` (inside the class):

```kotlin
    @Test
    fun `update sets a valid IANA timezone`() {
        val u = aUser()
        val c = service.create(u.id!!, "Zone Team")
        val updated = service.update(c, name = null, startsAt = null, startsAtTimezone = "America/New_York", phaseTwoStartRound = null)
        updated.startsAtTimezone shouldBe "America/New_York"
    }

    @Test
    fun `update rejects an invalid timezone`() {
        val u = aUser()
        val c = service.create(u.id!!, "Bad Zone")
        shouldThrow<IllegalArgumentException> {
            service.update(c, name = null, startsAt = null, startsAtTimezone = "Mars/Olympus", phaseTwoStartRound = null)
        }
    }

    @Test
    fun `new community defaults to Europe Berlin`() {
        val c = service.create(aUser().id!!, "Default Zone")
        c.startsAtTimezone shouldBe "Europe/Berlin"
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd core && ./mvnw -q -Dtest=CommunityServiceTest test`
Expected: FAIL — `update` has no `startsAtTimezone` parameter; `Community` has no `startsAtTimezone` property (compile error).

- [ ] **Step 3: Add the migration**

Create `core/src/main/resources/db/migration/community/V2__add_starts_at_timezone.sql`:

```sql
ALTER TABLE community.communities
    ADD COLUMN starts_at_timezone TEXT NOT NULL DEFAULT 'Europe/Berlin';
```

- [ ] **Step 4: Add the entity field**

In `Community.kt`, add the property after `startsAt`:

```kotlin
    val startsAt: Instant? = null,
    val startsAtTimezone: String = "Europe/Berlin",
    val phaseTwoStartRound: Int? = null,
```

- [ ] **Step 5: Extend the DTOs**

In `CommunityDtos.kt`, replace `CommunityResponse`, `UpdateCommunityRequest`, and `toResponse`:

```kotlin
data class CommunityResponse(
    val id: UUID, val name: String, val slug: String,
    val startsAt: Instant?, val startsAtTimezone: String, val phaseTwoStartRound: Int?,
    val viewerIsAdmin: Boolean, val pendingCount: Int,
)
```

```kotlin
data class UpdateCommunityRequest(val name: String?, val startsAt: Instant?, val startsAtTimezone: String?, val phaseTwoStartRound: Int?)
```

```kotlin
fun Community.toResponse(viewerIsAdmin: Boolean, pendingCount: Int) =
    CommunityResponse(id!!, name, slug, startsAt, startsAtTimezone, phaseTwoStartRound, viewerIsAdmin, pendingCount)
```

- [ ] **Step 6: Validate + persist in the service**

In `CommunityService.kt`, replace the `update` function:

```kotlin
    @Transactional
    open fun update(community: Community, name: String?, startsAt: Instant?, startsAtTimezone: String?, phaseTwoStartRound: Int?): Community {
        name?.let { require(it.trim().length in 3..50) { "name must be 3..50 chars" } }
        phaseTwoStartRound?.let { require(it > 0) { "phaseTwoStartRound must be > 0" } }
        startsAtTimezone?.let { require(ZoneId.getAvailableZoneIds().contains(it)) { "invalid timezone: $it" } }
        // slug is immutable — never recomputed
        return communities.save(
            community.copy(
                name = name?.trim() ?: community.name,
                startsAt = startsAt ?: community.startsAt,
                startsAtTimezone = startsAtTimezone ?: community.startsAtTimezone,
                phaseTwoStartRound = phaseTwoStartRound ?: community.phaseTwoStartRound,
                updatedAt = Instant.now(),
            )
        )
    }
```

Add the import at the top of `CommunityService.kt`:

```kotlin
import java.time.ZoneId
```

- [ ] **Step 7: Pass the field through the controller**

In `CommunityController.kt`, update the `update` call:

```kotlin
        val updated = communityService.update(c, body.name, body.startsAt, body.startsAtTimezone, body.phaseTwoStartRound)
```

- [ ] **Step 8: Add the controller test**

Append to `CommunityControllerTest.kt` (inside the class):

```kotlin
    @Test
    fun `GET by slug returns the startsAtTimezone`() {
        val c = community("team")
        every { access.requireActiveMember(uid, false, "team") } returns c
        every { query.isAdmin(c.id!!, uid) } returns false
        mockMvc.get("/api/communities/team") { with(principal()) }.andExpect {
            status { isOk() }
            jsonPath("$.startsAtTimezone") { value("Europe/Berlin") }
        }
    }
```

(`community("team")` builds a `Community` with the default `startsAtTimezone`.)

- [ ] **Step 9: Run the backend tests**

Run: `cd core && ./mvnw -q -Dtest=CommunityServiceTest,CommunityControllerTest test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add core/src/main/resources/db/migration/community/V2__add_starts_at_timezone.sql \
        core/src/main/kotlin/org/unividuell/countdown/core/community/ \
        core/src/test/kotlin/org/unividuell/countdown/core/community/
git commit -m "feat(core): add community.startsAtTimezone (IANA, validated, default Europe/Berlin)"
```

---

## Task 2: `CountdownEngine` (pure round/DST logic)

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/countdown/Round.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/countdown/CountdownEngine.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/countdown/CountdownEngineTest.kt`

- [ ] **Step 1: Write the failing engine tests**

Create `CountdownEngineTest.kt`:

```kotlin
package org.unividuell.countdown.core.countdown

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.ZoneId
import java.time.ZonedDateTime

class CountdownEngineTest {
    private val engine = CountdownEngine()
    private val berlin = ZoneId.of("Europe/Berlin")
    private fun at(y: Int, mo: Int, d: Int, h: Int, mi: Int = 0, s: Int = 0) =
        ZonedDateTime.of(y, mo, d, h, mi, s, 0, berlin).toInstant()

    private val startsAt = at(2026, 6, 25, 11) // 2026-06-25 11:00 Europe/Berlin (= 09:00Z, summer)

    @Test
    fun `labels flip sign around the start`() {
        engine.labelOf(10) shouldBe "T-10"
        engine.labelOf(0) shouldBe "T-0"
        engine.labelOf(-1) shouldBe "T+1"
        engine.labelOf(-2) shouldBe "T+2"
    }

    @Test
    fun `the last day before start is round 0, start-inclusive`() {
        // start of round 0 = startsAt - 1 day, 11:00
        engine.roundAt(at(2026, 6, 24, 11), startsAt, berlin).number shouldBe 0
        engine.roundAt(at(2026, 6, 24, 11, 0, 1), startsAt, berlin).number shouldBe 0
        engine.roundAt(at(2026, 6, 25, 10, 59, 59), startsAt, berlin).number shouldBe 0
    }

    @Test
    fun `the start instant begins round -1 (T+1)`() {
        val r = engine.roundAt(startsAt, startsAt, berlin)
        r.number shouldBe -1
        r.label shouldBe "T+1"
        r.start shouldBe startsAt
        r.end shouldBe at(2026, 6, 26, 11)
        // one second before the start is still round 0
        engine.roundAt(at(2026, 6, 25, 10, 59, 59), startsAt, berlin).number shouldBe 0
    }

    @Test
    fun `a day eleven days out is round 10`() {
        val r = engine.roundAt(at(2026, 6, 14, 11), startsAt, berlin)
        r.number shouldBe 10
        r.label shouldBe "T-10"
        r.start shouldBe at(2026, 6, 14, 11)
        r.end shouldBe at(2026, 6, 15, 11)
    }

    @Test
    fun `spring-forward day is exactly one round of 23 real hours`() {
        val springStart = at(2026, 3, 29, 11) // clocks jump 02->03 on 2026-03-29
        val r = engine.roundAt(at(2026, 3, 28, 12), springStart, berlin)
        r.number shouldBe 0
        r.start shouldBe at(2026, 3, 28, 11)
        r.end shouldBe springStart
        Duration.between(r.start, r.end) shouldBe Duration.ofHours(23)
    }

    @Test
    fun `fall-back day is exactly one round of 25 real hours`() {
        val fallStart = at(2026, 10, 25, 11) // clocks fall 03->02 on 2026-10-25
        val r = engine.roundAt(at(2026, 10, 24, 12), fallStart, berlin)
        r.number shouldBe 0
        r.start shouldBe at(2026, 10, 24, 11)
        r.end shouldBe fallStart
        Duration.between(r.start, r.end) shouldBe Duration.ofHours(25)
    }

    @Test
    fun `intervalOf is consistent with roundAt`() {
        val r = engine.intervalOf(10, startsAt, berlin)
        r.number shouldBe 10
        r.start shouldBe at(2026, 6, 14, 11)
        r.end shouldBe at(2026, 6, 15, 11)
        // next round in time is number - 1, starting where this one ends
        engine.intervalOf(9, startsAt, berlin).start shouldBe r.end
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd core && ./mvnw -q -Dtest=CountdownEngineTest test`
Expected: FAIL — `CountdownEngine` / `Round` do not exist (compile error).

- [ ] **Step 3: Create the `Round` type**

Create `Round.kt`:

```kotlin
package org.unividuell.countdown.core.countdown

import java.time.Instant

/** A round: its signed number, display label, and half-open [start, end) interval (start-inclusive). */
data class Round(val number: Int, val label: String, val start: Instant, val end: Instant)
```

- [ ] **Step 4: Create the engine**

Create `CountdownEngine.kt`:

```kotlin
package org.unividuell.countdown.core.countdown

import org.springframework.stereotype.Component
import java.time.Instant
import java.time.Period
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Pure, server-authoritative round engine. See .claude/guidelines/countdown.md.
 *   round n = [startsAt - (n+1) days, startsAt - n days)   (start-inclusive, zone-/DST-aware)
 * n = 0 is the last day before the start; n < 0 is at/after the start. Numbers decrease over time.
 * Day math is calendar-aware (ZonedDateTime.minus(Period)) so a DST day still counts as one round.
 */
@Component
class CountdownEngine {

    fun labelOf(number: Int): String = if (number >= 0) "T-$number" else "T+${-number}"

    /** The round whose [start, end) interval contains [now] (start-inclusive). */
    fun roundAt(now: Instant, startsAt: Instant, zone: ZoneId, roundLength: Period = Period.ofDays(1)): Round {
        val startZ = startsAt.atZone(zone)
        fun boundary(k: Int): Instant = startZ.minus(roundLength.multipliedBy(k)).toInstant()
        val perDay = roundLength.days.coerceAtLeast(1)
        // k* = smallest k with boundary(k) <= now; the current round number is k* - 1.
        var k = (ChronoUnit.DAYS.between(now.atZone(zone).toLocalDate(), startZ.toLocalDate()) / perDay).toInt()
        while (boundary(k) > now) k++
        while (boundary(k - 1) <= now) k--
        return intervalOf(k - 1, startsAt, zone, roundLength)
    }

    /** The labelled [start, end) interval of round [number]. */
    fun intervalOf(number: Int, startsAt: Instant, zone: ZoneId, roundLength: Period = Period.ofDays(1)): Round {
        val startZ = startsAt.atZone(zone)
        val start = startZ.minus(roundLength.multipliedBy(number + 1)).toInstant()
        val end = startZ.minus(roundLength.multipliedBy(number)).toInstant()
        return Round(number, labelOf(number), start, end)
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd core && ./mvnw -q -Dtest=CountdownEngineTest test`
Expected: PASS (all 7 tests).

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/countdown/ \
        core/src/test/kotlin/org/unividuell/countdown/core/countdown/CountdownEngineTest.kt
git commit -m "feat(core): countdown engine — signed rounds, round 0, start-inclusive, DST-correct"
```

---

## Task 3: Countdown module — query, service, controller

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/CoreApplication.kt` (Clock bean)
- Create: `core/.../countdown/CountdownQuery.kt`
- Create: `core/.../countdown/internal/CountdownDtos.kt`
- Create: `core/.../countdown/internal/CountdownService.kt`
- Create: `core/.../countdown/internal/CountdownController.kt`
- Create: `core/.../countdown/internal/CountdownExceptions.kt`
- Create: `core/.../countdown/internal/CountdownExceptionHandler.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/countdown/CountdownControllerTest.kt`, `CountdownServiceTest.kt`

- [ ] **Step 1: Write the failing controller tests**

Create `CountdownControllerTest.kt`:

```kotlin
package org.unividuell.countdown.core.countdown

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
import org.springframework.test.web.servlet.get
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.countdown.internal.CountdownService
import org.unividuell.countdown.core.countdown.internal.CountdownResponse
import org.unividuell.countdown.core.countdown.internal.RoundDto
import org.unividuell.countdown.core.countdown.internal.CountdownAccessDeniedException
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class CountdownControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var service: CountdownService

    private val uid = UUID.fromString("018f0000-0000-7000-8000-000000000000")
    private fun principal() = authentication(
        OAuth2AuthenticationToken(
            CountdownOAuth2User(User(id = uid, githubId = 1L, githubLogin = "octocat"), mapOf("login" to "octocat")),
            CountdownOAuth2User(User(id = uid, githubId = 1L, githubLogin = "octocat"), emptyMap()).authorities,
            "github",
        )
    )

    @Test
    fun `GET countdown returns the current and next round`() {
        val now = Instant.parse("2026-06-14T09:00:00Z")
        every { service.forSlug("team", uid, false) } returns CountdownResponse(
            serverNow = now, startsAt = Instant.parse("2026-06-25T09:00:00Z"), startsAtTimezone = "Europe/Berlin",
            round = RoundDto(10, "T-10", Instant.parse("2026-06-14T09:00:00Z"), Instant.parse("2026-06-15T09:00:00Z")),
            nextRound = RoundDto(9, "T-9", Instant.parse("2026-06-15T09:00:00Z"), Instant.parse("2026-06-16T09:00:00Z")),
        )
        mockMvc.get("/api/communities/team/countdown") { with(principal()) }.andExpect {
            status { isOk() }
            jsonPath("$.round.label") { value("T-10") }
            jsonPath("$.nextRound.number") { value(9) }
            jsonPath("$.startsAtTimezone") { value("Europe/Berlin") }
        }
    }

    @Test
    fun `GET countdown 404s a non-member`() {
        every { service.forSlug("secret", uid, false) } throws CountdownAccessDeniedException()
        mockMvc.get("/api/communities/secret/countdown") { with(principal()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `GET countdown returns null rounds when startsAt is unset`() {
        val now = Instant.parse("2026-06-14T09:00:00Z")
        every { service.forSlug("team", uid, false) } returns CountdownResponse(now, null, "Europe/Berlin", null, null)
        mockMvc.get("/api/communities/team/countdown") { with(principal()) }.andExpect {
            status { isOk() }
            jsonPath("$.round") { value(null) }
        }
    }
}
```

Add the missing import line at the top (kept separate to mirror the community test style):

```kotlin
import org.springframework.test.web.servlet.MockMvc
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd core && ./mvnw -q -Dtest=CountdownControllerTest test`
Expected: FAIL — `CountdownService`, `CountdownResponse`, `RoundDto`, `CountdownAccessDeniedException`, controller do not exist.

- [ ] **Step 3: Register a `Clock` bean**

In `CoreApplication.kt`, add the bean (and imports):

```kotlin
import org.springframework.context.annotation.Bean
import java.time.Clock

@SpringBootApplication
@EnableJdbcAuditing
@ConfigurationPropertiesScan
class CoreApplication {
    @Bean
    fun clock(): Clock = Clock.systemUTC()
}
```

- [ ] **Step 4: Create the public query interface**

Create `countdown/CountdownQuery.kt`:

```kotlin
package org.unividuell.countdown.core.countdown

import java.time.Instant
import java.util.UUID

/** Read-only round lookup for other modules (e.g. future scoring). Null if the community has no startsAt. */
interface CountdownQuery {
    fun currentRound(communityId: UUID, now: Instant): Round?
}
```

- [ ] **Step 5: Create the DTOs**

Create `countdown/internal/CountdownDtos.kt`:

```kotlin
package org.unividuell.countdown.core.countdown.internal

import org.unividuell.countdown.core.countdown.Round
import java.time.Instant

data class RoundDto(val number: Int, val label: String, val start: Instant, val end: Instant)
data class CountdownResponse(
    val serverNow: Instant,
    val startsAt: Instant?,
    val startsAtTimezone: String,
    val round: RoundDto?,
    val nextRound: RoundDto?,
)

fun Round.toDto() = RoundDto(number, label, start, end)
```

- [ ] **Step 6: Create the exceptions + handler**

Create `countdown/internal/CountdownExceptions.kt`:

```kotlin
package org.unividuell.countdown.core.countdown.internal

/** Caller is not an ACTIVE member of the community → 404 (no info leak). */
class CountdownAccessDeniedException(message: String = "No access") : RuntimeException(message)
```

Create `countdown/internal/CountdownExceptionHandler.kt`:

```kotlin
package org.unividuell.countdown.core.countdown.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(basePackages = ["org.unividuell.countdown.core.countdown.internal"])
class CountdownExceptionHandler {
    @ExceptionHandler(CountdownAccessDeniedException::class)
    fun notFound(e: RuntimeException) = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message ?: "not found")
}
```

- [ ] **Step 7: Create the service**

Create `countdown/internal/CountdownService.kt`:

```kotlin
package org.unividuell.countdown.core.countdown.internal

import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.countdown.CountdownQuery
import org.unividuell.countdown.core.countdown.Round
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@Service
class CountdownService(
    private val communityQuery: CommunityQuery,
    private val membershipQuery: MembershipQuery,
    private val engine: CountdownEngine,
    private val clock: Clock,
) : CountdownQuery {

    override fun currentRound(communityId: UUID, now: Instant): Round? {
        val c = communityQuery.findById(communityId) ?: return null
        val startsAt = c.startsAt ?: return null
        return engine.roundAt(now, startsAt, ZoneId.of(c.startsAtTimezone))
    }

    /** Build the display payload for [slug], gated to active members (super-admin allowed). */
    fun forSlug(slug: String, userId: UUID, isSuperAdmin: Boolean): CountdownResponse {
        val c = communityQuery.findBySlug(slug) ?: throw CountdownAccessDeniedException()
        if (!isSuperAdmin && !membershipQuery.isActiveMember(c.id!!, userId)) throw CountdownAccessDeniedException()
        val now = clock.instant()
        val startsAt = c.startsAt
            ?: return CountdownResponse(now, null, c.startsAtTimezone, null, null)
        val zone = ZoneId.of(c.startsAtTimezone)
        val current = engine.roundAt(now, startsAt, zone)
        val next = engine.intervalOf(current.number - 1, startsAt, zone) // later in time = number - 1
        return CountdownResponse(now, startsAt, c.startsAtTimezone, current.toDto(), next.toDto())
    }
}
```

- [ ] **Step 8: Create the controller**

Create `countdown/internal/CountdownController.kt`:

```kotlin
package org.unividuell.countdown.core.countdown.internal

import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.iam.AuthenticatedUser

@RestController
@RequestMapping("/api/communities")
class CountdownController(private val service: CountdownService) {
    @GetMapping("/{slug}/countdown")
    fun get(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String): CountdownResponse =
        service.forSlug(slug, me.id, me.isSuperAdmin)
}
```

- [ ] **Step 9: Run the controller tests**

Run: `cd core && ./mvnw -q -Dtest=CountdownControllerTest test`
Expected: PASS.

- [ ] **Step 10: Write the service integration test**

Create `CountdownServiceTest.kt` (real engine + real DB community, fixed `Clock`):

```kotlin
package org.unividuell.countdown.core.countdown

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.internal.CountdownAccessDeniedException
import org.unividuell.countdown.core.countdown.internal.CountdownService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.time.Instant

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CountdownServiceTest(
    @Autowired val countdown: CountdownService,
    @Autowired val communities: CommunityService,
    @Autowired val users: UserRepository,
) {
    private fun aUser() = users.save(User(githubId = System.nanoTime(), githubLogin = "creator"))

    @Test
    fun `forSlug 404s a non-member`() {
        val owner = aUser()
        val c = communities.create(owner.id!!, "Members Only")
        val outsider = aUser()
        shouldThrow<CountdownAccessDeniedException> { countdown.forSlug(c.slug, outsider.id!!, false) }
    }

    @Test
    fun `forSlug returns null rounds when startsAt unset`() {
        val owner = aUser()
        val c = communities.create(owner.id!!, "No Start Yet")
        val res = countdown.forSlug(c.slug, owner.id!!, false)
        res.round shouldBe null
        res.nextRound shouldBe null
        res.startsAtTimezone shouldBe "Europe/Berlin"
    }

    @Test
    fun `forSlug exposes current and next round when configured`() {
        val owner = aUser()
        val c = communities.create(owner.id!!, "Has Start")
        communities.update(c, name = null, startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin", phaseTwoStartRound = null)
        val res = countdown.forSlug(c.slug, owner.id!!, false)
        // far-future start → a large positive (T-) round; next round is one fewer, contiguous.
        (res.round!!.number > 0) shouldBe true
        res.nextRound!!.number shouldBe res.round!!.number - 1
        res.nextRound!!.start shouldBe res.round!!.end
    }
}
```

- [ ] **Step 11: Run the service test + the modularity check**

Run: `cd core && ./mvnw -q -Dtest=CountdownServiceTest,ModularityTests test`
Expected: PASS — `ModularityTests` confirms `countdown → community`/`iam` is allowed and `community` does **not** depend on `countdown`.

- [ ] **Step 12: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/countdown/ \
        core/src/main/kotlin/org/unividuell/countdown/core/CoreApplication.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/countdown/
git commit -m "feat(core): countdown module — /{slug}/countdown emits current+next round (member-gated)"
```

---

## Task 4: Frontend API + types

**Files:**
- Modify: `webapp-vue/src/api/types.ts`
- Create: `webapp-vue/src/api/countdown.ts`
- Modify: `webapp-vue/src/api/communities.ts`
- Test: `webapp-vue/src/api/__tests__/communities.spec.ts` (add a case)

- [ ] **Step 1: Write the failing API test**

Create `webapp-vue/src/api/__tests__/countdown.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as client from '@/api/client'
import { getCountdown } from '@/api/countdown'

vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof client>()), apiFetch: vi.fn() }))
const apiFetch = vi.mocked(client.apiFetch)

describe('countdown api', () => {
  beforeEach(() => apiFetch.mockReset())

  it('fetches the countdown for a slug', async () => {
    apiFetch.mockResolvedValue({
      serverNow: '2026-06-14T09:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: { number: 10, label: 'T-10', start: '2026-06-14T09:00:00Z', end: '2026-06-15T09:00:00Z' },
      nextRound: { number: 9, label: 'T-9', start: '2026-06-15T09:00:00Z', end: '2026-06-16T09:00:00Z' },
    })
    const r = await getCountdown('team')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities/team/countdown')
    expect(r.round?.label).toBe('T-10')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd webapp-vue && pnpm vitest run src/api/__tests__/countdown.spec.ts`
Expected: FAIL — `@/api/countdown` and the `Round`/`CountdownResponse` types do not exist.

- [ ] **Step 3: Add the types**

In `webapp-vue/src/api/types.ts`, add `startsAtTimezone` to `CommunityResponse` and append the new types:

```ts
export interface CommunityResponse {
  id: string
  name: string
  slug: string
  startsAt: string | null
  startsAtTimezone: string
  phaseTwoStartRound: number | null
  viewerIsAdmin: boolean
  pendingCount: number
}
```

```ts
export interface Round {
  number: number
  label: string
  start: string
  end: string
}
export interface CountdownResponse {
  serverNow: string
  startsAt: string | null
  startsAtTimezone: string
  round: Round | null
  nextRound: Round | null
}
```

- [ ] **Step 4: Create the API function**

Create `webapp-vue/src/api/countdown.ts`:

```ts
import { apiFetch } from '@/api/client'
import type { CountdownResponse } from '@/api/types'

export const getCountdown = (slug: string) =>
  apiFetch<CountdownResponse>(`/api/communities/${slug}/countdown`)
```

- [ ] **Step 5: Extend the `updateCommunity` body**

In `webapp-vue/src/api/communities.ts`, update the `updateCommunity` signature:

```ts
export const updateCommunity = (
  slug: string,
  body: Partial<{ name: string; startsAt: string; startsAtTimezone: string; phaseTwoStartRound: number }>,
) =>
  apiFetch<CommunityResponse>(`/api/communities/${slug}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
```

- [ ] **Step 6: Run the API test**

Run: `cd webapp-vue && pnpm vitest run src/api/__tests__/countdown.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src/api/types.ts webapp-vue/src/api/countdown.ts \
        webapp-vue/src/api/communities.ts webapp-vue/src/api/__tests__/countdown.spec.ts
git commit -m "feat(web): countdown API client + types; startsAtTimezone on community"
```

---

## Task 5: Pure display functions (`computeView`, `nextBaseUnitConfig`, `boundaryAction`)

**Files:**
- Create: `webapp-vue/src/communities/countdown.ts`
- Test: `webapp-vue/src/communities/__tests__/countdown.spec.ts`

- [ ] **Step 1: Write the failing pure-function tests**

Create `webapp-vue/src/communities/__tests__/countdown.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeView, nextBaseUnitConfig, boundaryAction } from '@/communities/countdown'
import type { Round } from '@/api/types'

const zone = 'Europe/Berlin'
const ms = (iso: string) => Date.parse(iso)
const daysBase = { months: false, weeks: false, days: true }

const round10: Round = {
  number: 10, label: 'T-10',
  start: '2026-06-14T09:00:00Z', end: '2026-06-15T09:00:00Z',
}
const startsAt = '2026-06-25T09:00:00Z'

describe('computeView', () => {
  it('is idle without a round or startsAt', () => {
    expect(computeView(null, startsAt, zone, ms('2026-06-14T09:00:00Z'), daysBase).state).toBe('idle')
    expect(computeView(round10, null, zone, ms('2026-06-14T09:00:00Z'), daysBase).state).toBe('idle')
  })

  it('counts down before start: day count = |round.number|, h:m:s to next boundary', () => {
    // 12h before round end (2026-06-14T21:00Z)
    const v = computeView(round10, startsAt, zone, ms('2026-06-14T21:00:00Z'), daysBase)
    expect(v.state).toBe('before')
    expect(v.prefix).toBe('T-')
    expect(v.label).toBe('T-10')
    expect(v.chips).toEqual([
      { value: '10', unit: 'd' },
      { value: '12', unit: 'h' },
      { value: '00', unit: 'm' },
      { value: '00', unit: 's' },
    ])
  })

  it('weeks base re-expresses the time to start with a w chip', () => {
    const v = computeView(round10, startsAt, zone, ms('2026-06-14T21:00:00Z'), { months: false, weeks: true, days: true })
    expect(v.chips.some((c) => c.unit === 'w')).toBe(true)
    expect(v.chips.some((c) => c.unit === 'd')).toBe(true)
  })

  it('counts up after start (event running)', () => {
    const r: Round = { number: -1, label: 'T+1', start: '2026-06-25T09:00:00Z', end: '2026-06-26T09:00:00Z' }
    const v = computeView(r, startsAt, zone, ms('2026-06-25T11:30:00Z'), daysBase)
    expect(v.state).toBe('after')
    expect(v.prefix).toBe('T+')
    expect(v.label).toBe('T+1')
    expect(v.chips[0]).toEqual({ value: '0', unit: 'd' }) // 2h30m after start
    expect(v.chips[1]).toEqual({ value: '02', unit: 'h' })
  })
})

describe('nextBaseUnitConfig cycles days -> months+weeks -> weeks -> days', () => {
  it('cycles', () => {
    const a = nextBaseUnitConfig({ months: false, weeks: false, days: true })
    expect(a).toEqual({ months: true, weeks: true, days: true })
    const b = nextBaseUnitConfig(a)
    expect(b).toEqual({ months: false, weeks: true, days: true })
    const c = nextBaseUnitConfig(b)
    expect(c).toEqual({ months: false, weeks: false, days: true })
  })
})

describe('boundaryAction', () => {
  const next: Round = { number: 9, label: 'T-9', start: '2026-06-15T09:00:00Z', end: '2026-06-16T09:00:00Z' }
  it('none before the boundary', () =>
    expect(boundaryAction(round10, next, ms('2026-06-15T08:59:59Z'))).toBe('none'))
  it('shift into nextRound when past the boundary but inside next', () =>
    expect(boundaryAction(round10, next, ms('2026-06-15T12:00:00Z'))).toBe('shift'))
  it('refetch when past nextRound too (or no next)', () => {
    expect(boundaryAction(round10, next, ms('2026-06-16T12:00:00Z'))).toBe('refetch')
    expect(boundaryAction(round10, null, ms('2026-06-15T12:00:00Z'))).toBe('refetch')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd webapp-vue && pnpm vitest run src/communities/__tests__/countdown.spec.ts`
Expected: FAIL — `@/communities/countdown` does not exist.

- [ ] **Step 3: Implement the pure functions**

Create `webapp-vue/src/communities/countdown.ts`:

```ts
import { DateTime } from 'luxon'
import type { DurationUnit } from 'luxon'
import type { Round } from '@/api/types'

export interface Chip {
  value: string
  unit: string
}
export interface CountdownView {
  state: 'idle' | 'before' | 'after'
  prefix: string
  label: string
  chips: Chip[]
}
export interface BaseUnitConfig {
  months: boolean
  weeks: boolean
  days: boolean
}

const pad2 = (n?: number) => String(Math.trunc(Math.abs(n ?? 0))).padStart(2, '0')
const whole = (n?: number) => String(Math.trunc(Math.abs(n ?? 0)))

/** Click-to-cycle the higher-order base unit: days -> months+weeks+days -> weeks+days -> days. */
export function nextBaseUnitConfig(cfg: BaseUnitConfig): BaseUnitConfig {
  if (cfg.months) return { months: false, weeks: true, days: true }
  if (cfg.weeks) return { months: false, weeks: false, days: true }
  return { months: true, weeks: true, days: true }
}

/**
 * Pure display projection. Round logic stays on the backend; here we only subtract + format
 * absolute instants. Before start (number >= 0): day count = |number|, h:m:s = round.end - now.
 * After start (number < 0): "event running", count up since startsAt. Weeks/months are a cosmetic
 * calendar re-expression of the time to startsAt.
 */
export function computeView(
  round: Round | null,
  startsAt: string | null,
  zone: string,
  nowMs: number,
  cfg: BaseUnitConfig,
): CountdownView {
  if (!round || !startsAt) return { state: 'idle', prefix: '', label: '', chips: [] }
  const now = DateTime.fromMillis(nowMs, { zone })
  const start = DateTime.fromISO(startsAt, { zone })

  if (round.number < 0) {
    const up = now.diff(start, ['days', 'hours', 'minutes', 'seconds']).toObject()
    return {
      state: 'after',
      prefix: 'T+',
      label: round.label,
      chips: [
        { value: whole(up.days), unit: 'd' },
        { value: pad2(up.hours), unit: 'h' },
        { value: pad2(up.minutes), unit: 'm' },
        { value: pad2(up.seconds), unit: 's' },
      ],
    }
  }

  const lower = DateTime.fromISO(round.end, { zone }).diff(now, ['hours', 'minutes', 'seconds']).toObject()
  const chips: Chip[] = []
  if (cfg.months || cfg.weeks) {
    const units: DurationUnit[] = []
    if (cfg.months) units.push('months')
    if (cfg.weeks) units.push('weeks')
    units.push('days')
    const hi = start.diff(now, units).toObject()
    if (hi.months !== undefined) chips.push({ value: whole(hi.months), unit: 'M' })
    if (hi.weeks !== undefined) chips.push({ value: whole(hi.weeks), unit: 'w' })
    chips.push({ value: whole(hi.days), unit: 'd' })
  } else {
    chips.push({ value: whole(round.number), unit: 'd' }) // authoritative day count = |round.number|
  }
  chips.push({ value: pad2(lower.hours), unit: 'h' })
  chips.push({ value: pad2(lower.minutes), unit: 'm' })
  chips.push({ value: pad2(lower.seconds), unit: 's' })
  return { state: 'before', prefix: 'T-', label: round.label, chips }
}

export type BoundaryAction = 'none' | 'shift' | 'refetch'

/** Decide what to do when the clock reaches the current round's end. */
export function boundaryAction(round: Round | null, nextRound: Round | null, nowMs: number): BoundaryAction {
  if (!round || nowMs < Date.parse(round.end)) return 'none'
  if (nextRound && nowMs < Date.parse(nextRound.end)) return 'shift'
  return 'refetch'
}
```

- [ ] **Step 4: Run the tests**

Run: `cd webapp-vue && pnpm vitest run src/communities/__tests__/countdown.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/communities/countdown.ts webapp-vue/src/communities/__tests__/countdown.spec.ts
git commit -m "feat(web): pure countdown display projection (computeView, base-unit cycle, boundary)"
```

---

## Task 6: `useCountdown` composable + `CountdownDisplay` component

**Files:**
- Create: `webapp-vue/src/communities/useCountdown.ts`
- Create: `webapp-vue/src/communities/CountdownDisplay.vue`
- Test: `webapp-vue/src/communities/__tests__/CountdownDisplay.spec.ts`

- [ ] **Step 1: Write the failing component test**

Create `webapp-vue/src/communities/__tests__/CountdownDisplay.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/countdown'

describe('CountdownDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T21:00:00Z')) // 12h before round end
  })
  afterEach(() => vi.useRealTimers())

  it('renders the ticking countdown for the active community', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: { number: 10, label: 'T-10', start: '2026-06-14T09:00:00Z', end: '2026-06-15T09:00:00Z' },
      nextRound: { number: 9, label: 'T-9', start: '2026-06-15T09:00:00Z', end: '2026-06-16T09:00:00Z' },
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    expect(w.text()).toContain('T-')
    expect(w.text()).toContain('10') // |round.number| days
    expect(w.text()).toContain('12') // hours to next boundary
  })

  it('cycles the base unit on click', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: { number: 10, label: 'T-10', start: '2026-06-14T09:00:00Z', end: '2026-06-15T09:00:00Z' },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    await w.find('[data-test="countdown"]').trigger('click')
    expect(w.text()).toMatch(/w$|w\b/) // a weeks chip appears after one cycle
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd webapp-vue && pnpm vitest run src/communities/__tests__/CountdownDisplay.spec.ts`
Expected: FAIL — the composable/component do not exist.

- [ ] **Step 3: Implement the composable**

Create `webapp-vue/src/communities/useCountdown.ts`:

```ts
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { getCountdown } from '@/api/countdown'
import type { Round } from '@/api/types'
import { boundaryAction, computeView, nextBaseUnitConfig } from '@/communities/countdown'
import type { BaseUnitConfig } from '@/communities/countdown'

export function useCountdown(slug: Ref<string | null | undefined>) {
  const round = ref<Round | null>(null)
  const nextRound = ref<Round | null>(null)
  const startsAt = ref<string | null>(null)
  const zone = ref('UTC')
  const skewMs = ref(0)
  const nowMs = ref(Date.now())
  const cfg = reactive<BaseUnitConfig>({ months: false, weeks: false, days: true })
  let timer: ReturnType<typeof setInterval> | undefined

  async function load(s: string) {
    const r = await getCountdown(s)
    round.value = r.round
    nextRound.value = r.nextRound
    startsAt.value = r.startsAt
    zone.value = r.startsAtTimezone
    skewMs.value = Date.parse(r.serverNow) - Date.now()
  }

  function tick() {
    nowMs.value = Date.now()
    const corr = nowMs.value + skewMs.value
    const action = boundaryAction(round.value, nextRound.value, corr)
    if (action === 'shift') {
      round.value = nextRound.value
      nextRound.value = null
    }
    if (action !== 'none' && slug.value) void load(slug.value)
  }

  onMounted(() => {
    if (slug.value) void load(slug.value)
    timer = setInterval(tick, 1000)
  })
  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })
  watch(
    () => slug.value,
    (s) => {
      if (s) void load(s)
      else {
        round.value = null
        nextRound.value = null
        startsAt.value = null
      }
    },
  )

  const view = computed(() =>
    computeView(round.value, startsAt.value, zone.value, nowMs.value + skewMs.value, cfg),
  )

  function cycleBaseUnit() {
    Object.assign(cfg, nextBaseUnitConfig(cfg))
  }

  return { view, cycleBaseUnit }
}
```

- [ ] **Step 4: Implement the component**

Create `webapp-vue/src/communities/CountdownDisplay.vue`:

```vue
<script setup lang="ts">
import { toRef } from 'vue'
import { useCountdown } from '@/communities/useCountdown'

const props = defineProps<{ slug: string | null | undefined }>()
const { view, cycleBaseUnit } = useCountdown(toRef(props, 'slug'))
</script>

<template>
  <div
    v-if="view.state !== 'idle'"
    data-test="countdown"
    role="button"
    class="flex items-center gap-1 font-mono text-sm tabular-nums select-none sm:gap-2"
    :title="view.state === 'after' ? 'Event läuft' : 'Countdown bis zum Start'"
    @click="cycleBaseUnit"
  >
    <span v-if="view.state === 'after'" class="mr-1 text-xs uppercase tracking-wide text-stone-300"
      >Event läuft</span
    >
    <span>{{ view.prefix }}</span>
    <span v-for="(chip, i) in view.chips" :key="i">
      <span>{{ chip.value }}</span
      ><span class="text-xs text-stone-300">{{ chip.unit }}</span>
    </span>
  </div>
</template>
```

- [ ] **Step 5: Run the component tests**

Run: `cd webapp-vue && pnpm vitest run src/communities/__tests__/CountdownDisplay.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/communities/useCountdown.ts webapp-vue/src/communities/CountdownDisplay.vue \
        webapp-vue/src/communities/__tests__/CountdownDisplay.spec.ts
git commit -m "feat(web): useCountdown composable + CountdownDisplay header widget"
```

---

## Task 7: Active-community context + main-header integration

**Files:**
- Modify: `webapp-vue/src/communities/context.ts`
- Modify: `webapp-vue/src/pages/[slug].vue`
- Modify: `webapp-vue/src/App.vue`
- Test: `webapp-vue/src/__tests__/app-header.spec.ts` (create)
- Modify (mock fixups): `webapp-vue/src/pages/__tests__/slug-shell.spec.ts`

- [ ] **Step 1: Widen the context module ref**

In `webapp-vue/src/communities/context.ts`, replace the `activeCommunityName` ref with `activeCommunity` (keep the `communityKey`/`useCommunityContext` parts unchanged):

```ts
import type { InjectionKey, Ref } from 'vue'
import { inject, ref } from 'vue'
import type { CommunityResponse } from '@/api/types'

export interface CommunityContext {
  community: Readonly<Ref<CommunityResponse>>
  refresh: () => Promise<void>
}
export const communityKey: InjectionKey<CommunityContext> = Symbol('community')

/** The community currently in context (the `/[slug]/` shell sets it, clears on leave). Read by the
 *  App-level main header, which lives ABOVE the `[slug]` provider tree (so a module ref, not inject). */
export interface ActiveCommunity {
  slug: string
  name: string
  startsAt: string | null
  startsAtTimezone: string
}
export const activeCommunity = ref<ActiveCommunity | null>(null)

export function useCommunityContext(): CommunityContext {
  const ctx = inject(communityKey)
  if (!ctx) throw new Error('community context not provided (must be used within the [slug] shell)')
  return ctx
}
```

- [ ] **Step 2: Update `[slug].vue` to set/clear it and drop the duplicate title link**

In `webapp-vue/src/pages/[slug].vue`:

Change the import:

```ts
import { activeCommunity, communityKey } from '@/communities/context'
```

In `resolve(...)`, replace the success/failure assignments to `activeCommunityName`:

```ts
    community.value = await getCommunity(slug)
    state.value = 'ready'
    activeCommunity.value = {
      slug: community.value.slug,
      name: community.value.name,
      startsAt: community.value.startsAt,
      startsAtTimezone: community.value.startsAtTimezone,
    }
    void setSelection(community.value.id)
```

```ts
  } catch (e) {
    state.value = e instanceof ApiError && e.status === 404 ? 'no-access' : 'error'
    community.value = null
    activeCommunity.value = null
  }
```

In `onUnmounted`:

```ts
onUnmounted(() => {
  activeCommunity.value = null
})
```

In the template, remove the now-duplicated title link and let the controls keep their place. Replace the header opening:

```html
    <header class="mb-4 flex items-center justify-end border-b px-4 py-2">
      <div class="flex items-center gap-2">
```

(Delete the `<RouterLink to="/" class="font-semibold hover:underline">{{ community?.name }}</RouterLink>` line; the community title now lives in the App-level main header. `RouterLink` is still used by the admin menu, so keep its import.)

- [ ] **Step 3: Update `App.vue` (title + `'YY` + widget)**

Replace `webapp-vue/src/App.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { DateTime } from 'luxon'
import { useTitle } from '@vueuse/core'
import { activeCommunity } from '@/communities/context'
import CountdownDisplay from '@/communities/CountdownDisplay.vue'

// Tab title follows the community in context, else the app name.
useTitle(computed(() => activeCommunity.value?.name ?? 'countdown'))

// Top-left brand: the active community's title + a '<YY> edition suffix (always startsAt.year).
const brand = computed(() => activeCommunity.value?.name ?? 'countdown')
const yearSuffix = computed(() => {
  const c = activeCommunity.value
  if (!c?.startsAt) return ''
  const year = DateTime.fromISO(c.startsAt, { zone: c.startsAtTimezone }).year
  return ` '${String(year).slice(-2)}`
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-neutral-100 text-neutral-900">
    <header class="flex items-center justify-between gap-4 bg-stone-900 px-4 py-3 text-stone-50">
      <RouterLink to="/" class="font-semibold hover:underline"
        >{{ brand }}<span class="text-stone-400">{{ yearSuffix }}</span></RouterLink
      >
      <CountdownDisplay v-if="activeCommunity?.startsAt" :slug="activeCommunity.slug" />
    </header>
    <main class="flex-1 p-4">
      <RouterView />
    </main>
    <footer class="bg-stone-900 px-4 py-3 text-sm text-stone-300">countdown.unividuell.org</footer>
  </div>
</template>
```

- [ ] **Step 4: Fix the slug-shell test (title moved out)**

In `webapp-vue/src/pages/__tests__/slug-shell.spec.ts`:
- Add `startsAtTimezone: 'Europe/Berlin'` to **every** `getCommunity` mock object (there are four).
- In the test `shows the ⚙ admin menu with a pending badge only for admins, and links the name to /`, **remove** the assertion `expect(w.find('a[href="/"]').exists()).toBe(true) // name links home` (the home link now lives in `App.vue`, not the shell). Rename the test to `shows the ⚙ admin menu with a pending badge only for admins`.

- [ ] **Step 5: Write the App-header test**

Create `webapp-vue/src/__tests__/app-header.spec.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '@/App.vue'
import { activeCommunity } from '@/communities/context'

const stubs = {
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
  RouterView: { template: '<div />' },
  CountdownDisplay: { template: '<div data-test="countdown-widget" />', props: ['slug'] },
}

describe('App main header', () => {
  beforeEach(() => {
    activeCommunity.value = null
  })

  it('shows the app name and no countdown when no community is active', () => {
    const w = mount(App, { global: { stubs } })
    expect(w.find('a[href="/"]').text()).toBe('countdown')
    expect(w.find('[data-test="countdown-widget"]').exists()).toBe(false)
  })

  it('shows the community title + year suffix and the countdown when active', () => {
    activeCommunity.value = {
      slug: 'huette',
      name: 'Hütte Hütte',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
    }
    const w = mount(App, { global: { stubs } })
    expect(w.find('a[href="/"]').text()).toContain('Hütte Hütte')
    expect(w.find('a[href="/"]').text()).toContain("'26")
    expect(w.find('[data-test="countdown-widget"]').exists()).toBe(true)
  })

  it('shows the title without a year suffix and hides the countdown when startsAt is unset', () => {
    activeCommunity.value = {
      slug: 'huette',
      name: 'Hütte Hütte',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
    }
    const w = mount(App, { global: { stubs } })
    expect(w.find('a[href="/"]').text()).toBe('Hütte Hütte')
    expect(w.find('[data-test="countdown-widget"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 6: Run the affected frontend tests**

Run: `cd webapp-vue && pnpm vitest run src/__tests__/app-header.spec.ts src/pages/__tests__/slug-shell.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src/communities/context.ts webapp-vue/src/pages/'[slug].vue' \
        webapp-vue/src/App.vue webapp-vue/src/__tests__/app-header.spec.ts \
        webapp-vue/src/pages/__tests__/slug-shell.spec.ts
git commit -m "feat(web): main-header shows active community title + 'YY + countdown widget"
```

---

## Task 8: Settings — zone select + zone-relative `startsAt`

**Files:**
- Modify: `webapp-vue/src/pages/[slug]/settings.vue`
- Test: `webapp-vue/src/pages/[slug]/__tests__/settings.spec.ts` (create)

- [ ] **Step 1: Write the failing settings test**

Create `webapp-vue/src/pages/[slug]/__tests__/settings.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('@/communities/useAdminGuard', () => ({ useAdminGuard: vi.fn() }))
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({
    community: { value: { slug: 'team', viewerIsAdmin: true } },
    refresh: vi.fn(),
  }),
}))

const community = {
  id: '1',
  name: 'Team',
  slug: 'team',
  startsAt: '2026-06-25T09:00:00Z', // 11:00 in Europe/Berlin (summer)
  startsAtTimezone: 'Europe/Berlin',
  phaseTwoStartRound: null,
  viewerIsAdmin: true,
  pendingCount: 0,
}

describe('settings — timezone + zone-relative startsAt', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({ ...community })
    vi.spyOn(api, 'getInvite').mockResolvedValue(null)
    vi.spyOn(api, 'updateCommunity').mockResolvedValue({ ...community })
  })

  it('renders the startsAt as wall-time in the selected zone (11:00, not browser-local)', async () => {
    const Settings = (await import('@/pages/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    const startInput = w.find('input[type="datetime-local"]').element as HTMLInputElement
    expect(startInput.value).toBe('2026-06-25T11:00')
    const zoneSelect = w.find('select')
    expect((zoneSelect.element as HTMLSelectElement).value).toBe('Europe/Berlin')
  })

  it('saves startsAt converted from the selected zone and sends startsAtTimezone', async () => {
    const Settings = (await import('@/pages/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.updateCommunity).toHaveBeenCalledWith(
      'team',
      expect.objectContaining({ startsAt: '2026-06-25T09:00:00.000Z', startsAtTimezone: 'Europe/Berlin' }),
    )
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd webapp-vue && pnpm vitest run src/pages/'[slug]'/__tests__/settings.spec.ts`
Expected: FAIL — no zone select; `toInstant`/`toLocalInput` use browser-local, not the zone; `startsAtTimezone` not sent.

- [ ] **Step 3: Update the script of `settings.vue`**

In `webapp-vue/src/pages/[slug]/settings.vue`, add a `startsAtTimezone` ref and make the conversions zone-aware. Replace the `<script setup>` body's relevant parts:

Add to the refs block (after `startsAt`):

```ts
const startsAtTimezone = ref('Europe/Berlin')
const zones = Intl.supportedValuesOf('timeZone')
```

Replace the two conversion helpers:

```ts
// <input type="datetime-local"> holds a zone-less wall-clock string. We interpret it IN the
// community's startsAtTimezone (not the browser zone): instant <-> "yyyy-MM-dd'T'HH:mm" in that zone.
function toLocalInput(iso: string, zone: string): string {
  return DateTime.fromISO(iso, { zone }).toFormat("yyyy-MM-dd'T'HH:mm")
}
function toInstant(local: string, zone: string): string | null {
  return DateTime.fromISO(local, { zone }).toUTC().toISO()
}
```

Replace the `onMounted` body's first lines (zone first, then startsAt rendered in that zone):

```ts
onMounted(async () => {
  const c = await getCommunity(slug)
  name.value = c.name
  startsAtTimezone.value = c.startsAtTimezone
  startsAt.value = c.startsAt ? toLocalInput(c.startsAt, c.startsAtTimezone) : ''
  phaseTwoStartRound.value = c.phaseTwoStartRound
  const inv = await getInvite(slug)
  inviteUrl.value = inv ? fullUrl(inv.url) : null
})
```

Replace the `save()` body (build the body with the zone, always send `startsAtTimezone`):

```ts
async function save(): Promise<void> {
  error.value = null
  try {
    const body: Partial<{
      name: string
      startsAt: string
      startsAtTimezone: string
      phaseTwoStartRound: number
    }> = { name: name.value.trim(), startsAtTimezone: startsAtTimezone.value }
    if (startsAt.value) {
      const instant = toInstant(startsAt.value, startsAtTimezone.value)
      if (instant) body.startsAt = instant
    }
    if (phaseTwoStartRound.value !== null) body.phaseTwoStartRound = phaseTwoStartRound.value
    await updateCommunity(slug, body)
    await refresh()
  } catch {
    error.value = 'Speichern fehlgeschlagen.'
  }
}
```

- [ ] **Step 4: Add the zone select to the template**

In `settings.vue`, insert a zone `<label>` immediately **before** the Start `<label>`:

```html
      <label class="block text-sm"
        >Zeitzone<select
          v-model="startsAtTimezone"
          class="mt-1 w-full rounded border px-3 py-1.5"
        >
          <option v-for="z in zones" :key="z" :value="z">{{ z }}</option>
        </select></label
      >
```

- [ ] **Step 5: Run the settings test**

Run: `cd webapp-vue && pnpm vitest run src/pages/'[slug]'/__tests__/settings.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/pages/'[slug]/settings.vue' webapp-vue/src/pages/'[slug]'/__tests__/settings.spec.ts
git commit -m "feat(web): settings — IANA zone select + zone-relative startsAt entry"
```

---

## Task 9: Full verification + remaining mock fixups + knowledge feedback

**Files:**
- Modify (mock fixups): `webapp-vue/src/pages/[slug]/__tests__/members.spec.ts`, `webapp-vue/src/pages/[slug]/__tests__/requests.spec.ts`
- Modify: `.claude/guidelines/frontend.md`, `.claude/guidelines/modules-and-migrations.md`

- [ ] **Step 1: Fix remaining CommunityResponse mocks**

In `members.spec.ts` and `requests.spec.ts`, add `startsAtTimezone: 'Europe/Berlin'` to every `getCommunity` mock object that sets `viewerIsAdmin` (so the literals satisfy the widened `CommunityResponse` type).

- [ ] **Step 2: Run the full frontend suite + typecheck + lint**

Run: `cd webapp-vue && pnpm lint && pnpm test`
Expected: PASS (all specs green, no TS errors).

- [ ] **Step 3: Run the full backend suite**

Run: `cd core && ./mvnw -q verify`
Expected: PASS (includes `ModularityTests`, Flyway migration applies on a fresh Testcontainers DB).

- [ ] **Step 4: Feed knowledge back — `frontend.md`**

Append a section to `.claude/guidelines/frontend.md`:

```markdown
## Server-authoritative ticking values (countdown pattern)

For live values that must agree with the backend (the countdown), the backend owns the logic and
emits **absolute instants** (`GET /api/communities/{slug}/countdown` → current + next `Round` with
`start`/`end` instants + `serverNow`). The SPA never re-derives the rounds — it ticks a local
1 s clock, corrects skew once (`serverNow − Date.now()`), and only **subtracts + formats**
(`src/communities/countdown.ts` is a pure projection; `useCountdown` wires the clock/fetch around
it). At a round boundary it shifts to the pre-fetched `nextRound`, then refetches (~once/day). No
KT/TS parity test is needed because no logic is duplicated. Decompose: pure functions (testable
without mounting, like `resolveLanding`) + a thin composable + a thin component.

**App-level header state:** `App.vue` sits above the `[slug]` provider tree, so state it needs from
the active community (title, `startsAt`, `startsAtTimezone`) is published via a module-level ref
`activeCommunity` in `src/communities/context.ts` (set by the shell on resolve, cleared on unmount),
not via `provide`/`inject`.
```

- [ ] **Step 5: Feed knowledge back — `modules-and-migrations.md`**

Append a note to `.claude/guidelines/modules-and-migrations.md`:

```markdown
## A module may own no tables (yet)

A pure-logic module ships without a Flyway migration when it owns no state — e.g. the `countdown`
module is a pure engine over `community` data and has **no `countdown` schema/migration**. Add the
schema later when the module first persists something. `ModularityTests` still validates its
dependencies (`countdown → community`, never the reverse).
```

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/pages/'[slug]'/__tests__/members.spec.ts \
        webapp-vue/src/pages/'[slug]'/__tests__/requests.spec.ts \
        .claude/guidelines/frontend.md .claude/guidelines/modules-and-migrations.md
git commit -m "test(web): fixup community mocks; docs: countdown patterns + table-less module"
```

- [ ] **Step 7: Final manual smoke (optional, with backend running)**

Run backend (`cd core && ./mvnw spring-boot:run`) + frontend (`cd webapp-vue && pnpm dev`), sign in via test-auth, set a `startsAt` + zone in settings, and confirm: the main header shows `<community> '<YY>` + a ticking `T-… d h m s`, clicking it cycles units, and a community without `startsAt` shows the title without a countdown.

---

## Self-Review

**Spec coverage:** `startsAtTimezone` field + validation + admin entry (Tasks 1, 8) ✓ · `CountdownEngine` round 0 / start-inclusive / signed labels / DST (Task 2) ✓ · `countdown` module + member-gated `/countdown` payload with current+next round + null-startsAt 200 (Task 3) ✓ · no-duplicated-logic client (pure `computeView` + `useCountdown`, Tasks 5–6) ✓ · boundary advance + ~daily refetch (`boundaryAction`, Tasks 5–6) ✓ · main-header placement, title + `'YY` always `startsAt.year`, hidden off-community (Task 7) ✓ · `activeCommunity` widened context (Task 7) ✓ · after-start "Event läuft" + count-up (Task 5 `computeView` `after` branch + Task 6 component) ✓ · click-to-cycle base unit (Tasks 5–6) ✓ · table-less module note + parity-not-needed note (Task 9) ✓.

**Placeholder scan:** none — every code step has complete content; commands have expected output.

**Type consistency:** `Round`/`RoundDto` fields `{number,label,start,end}` match across Kotlin and TS · `CountdownResponse` fields `{serverNow,startsAt,startsAtTimezone,round,nextRound}` identical backend/frontend · `computeView(round, startsAt, zone, nowMs, cfg)` / `boundaryAction(round, nextRound, nowMs)` / `nextBaseUnitConfig(cfg)` signatures match their tests and `useCountdown` call sites · `update(community, name, startsAt, startsAtTimezone, phaseTwoStartRound)` matches the controller call and both service tests · `activeCommunity: ActiveCommunity | null` shape `{slug,name,startsAt,startsAtTimezone}` matches `[slug].vue`, `App.vue`, and `app-header.spec.ts`.
