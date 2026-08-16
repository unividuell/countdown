# Edition einfrieren — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `startsAt` und `startsAtTimezone` einer `CommunityEdition` werden unveränderlich, sobald deren erste spielbare Runde begonnen hat — und kein anderes Feld kann sie wieder auftauen.

**Architecture:** Der Zustand ist **abgeleitet**, nicht gespeichert: eine reine Funktion `frozenSince(edition): Instant?` in `community.internal` liefert den Einfrierpunkt, `EditionService.isFrozen` vergleicht ihn gegen die `Clock`. `EditionService.update` baut die neue Edition, vergleicht sie mit der alten und wirft `EditionFrozenException` (→ 409), wenn das Raster sich ändern würde oder wenn das Update die Edition auftauen würde. Die Wire trägt `editionFrozen` als reine Anzeige; das Settings-Formular sperrt die beiden Felder und lässt sie im PATCH-Body weg.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 · JUnit 5 + kotest matchers + mockk + MockMvc Kotlin DSL + Testcontainers · Vue 3 + TypeScript strict + Vitest + @vue/test-utils.

**Spec:** [`docs/superpowers/specs/2026-08-16-edition-freeze-design.md`](../specs/2026-08-16-edition-freeze-design.md)

## Global Constraints

- **Sprache:** Quellcode, Kommentare und Commit-Messages **englisch**. User-facing Text im Frontend **deutsch**, und deutsche Anführungszeichen sind `„…“` — niemals `"`. Spec/Plan bleiben deutsch.
- **Named arguments ab zwei Argumenten** an jedem Kotlin-Aufrufpunkt (Ausnahmen: ein Argument, varargs, Java-deklarierte Funktionen, trailing lambdas, infix) — siehe [`.claude/guidelines/kotlin.md`](../../../.claude/guidelines/kotlin.md).
- **Testing-Stack:** kotest-Matcher (`shouldBe`, `shouldThrow`), mockk/`@MockkBean`, MockMvc **Kotlin DSL** (`mockMvc.patch(...) { }.andExpect { }`). Nicht Mockito, nicht `kotlin.test`, nicht `MockMvcRequestBuilders`. Frontend: Vitest `vi`, nicht mockk.
- **TDD:** erst der fallende Test, dann die minimale Implementierung. Commits klein.
- **Modulgrenze:** `countdown → community`, **nie umgekehrt**. `community`-Produktivcode darf `CountdownEngine` nicht importieren; nur der Testbaum darf beide sehen. `ModularityTests` muss grün bleiben.
- **Keine redundanten Inline-Kommentare.** Begründungen gehören in die Commit-Message und in die Guidelines, nicht als Grabstein neben die Zeile.
- Backend-Befehle laufen aus `core/`, Frontend-Befehle aus `webapp-vue/`.

---

### Task 1: `frozenSince` — der Einfrierpunkt als reine Funktion

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/EditionFreeze.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/EditionFreezeTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/EditionFreezeGridParityTest.kt`

**Interfaces:**
- Consumes: `org.unividuell.countdown.core.community.CommunityEdition` (bestehend: `startsAt: Instant?`, `startsAtTimezone: String`, `gamesFromRound: Int?`).
- Produces: `fun frozenSince(edition: CommunityEdition): Instant?` im Package `org.unividuell.countdown.core.community.internal` — Task 2 baut darauf auf.

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/community/EditionFreezeTest.kt` — ein reiner Unit-Test, kein Spring:

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.frozenSince
import java.time.Instant
import java.util.UUID

class EditionFreezeTest {

    private fun edition(
        startsAt: Instant?,
        zone: String = "Europe/Berlin",
        gamesFromRound: Int? = 24,
    ) = CommunityEdition(
        communityId = UUID.randomUUID(),
        label = "Run 2026",
        startsAt = startsAt,
        startsAtTimezone = zone,
        gamesFromRound = gamesFromRound,
    )

    @Test
    fun `without a date there is no grid to freeze`() {
        frozenSince(edition(startsAt = null)).shouldBeNull()
    }

    @Test
    fun `an unbounded window has no moment before the first playable round`() {
        val e = edition(startsAt = Instant.parse("2026-06-25T09:00:00Z"), gamesFromRound = null)

        frozenSince(e) shouldBe Instant.MIN
    }

    @Test
    fun `the freeze point is the start of the first game round`() {
        // 09:00Z is 11:00 in Berlin (CEST); round 24 starts 25 days earlier, same wall-clock.
        val e = edition(startsAt = Instant.parse("2026-06-25T09:00:00Z"), gamesFromRound = 24)

        frozenSince(e) shouldBe Instant.parse("2026-05-31T09:00:00Z")
    }

    @Test
    fun `day stepping is calendar-aware across a DST boundary`() {
        // 16:00Z is 18:00 in Berlin (CEST). Ten days earlier is 2026-03-26, still CET (UTC+1),
        // so the same wall-clock 18:00 is 17:00Z — an instant-based minus(10 days) would say 16:00Z.
        val e = edition(startsAt = Instant.parse("2026-04-05T16:00:00Z"), gamesFromRound = 9)

        frozenSince(e) shouldBe Instant.parse("2026-03-26T17:00:00Z")
    }

    @Test
    fun `a window that opens only after the start freezes at the start itself`() {
        val e = edition(startsAt = Instant.parse("2026-06-25T09:00:00Z"), gamesFromRound = -1)

        frozenSince(e) shouldBe Instant.parse("2026-06-25T09:00:00Z")
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd core && ./mvnw test -Dtest=EditionFreezeTest
```

Erwartet: Kompilierfehler — `Unresolved reference: frozenSince`.

- [ ] **Step 3: Write the minimal implementation**

`core/src/main/kotlin/org/unividuell/countdown/core/community/internal/EditionFreeze.kt`:

```kotlin
package org.unividuell.countdown.core.community.internal

import org.unividuell.countdown.core.community.CommunityEdition
import java.time.Instant
import java.time.ZoneId

/**
 * From when on this run's round grid is fixed — `null` while there is no grid at all.
 *
 * The moment is the start of round `gamesFromRound`, the earliest instant at which anyone could
 * announce a round and write a `game.round_games` row. An unbounded window (`gamesFromRound == null`)
 * has no such moment, so it answers [Instant.MIN] and every caller's `now >= frozenSince` holds.
 *
 * Deliberately not `CountdownEngine.intervalOf`: `countdown` depends on `community`, never the other
 * way round. `EditionFreezeGridParityTest` pins this copy against the engine.
 */
fun frozenSince(edition: CommunityEdition): Instant? {
    val startsAt = edition.startsAt ?: return null
    val firstGameRound = edition.gamesFromRound ?: return Instant.MIN
    return startsAt.atZone(ZoneId.of(edition.startsAtTimezone))
        .minusDays((firstGameRound + 1).toLong())
        .toInstant()
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd core && ./mvnw test -Dtest=EditionFreezeTest
```

Erwartet: PASS, 5 Tests.

- [ ] **Step 5: Write the parity test**

`core/src/test/kotlin/org/unividuell/countdown/core/community/EditionFreezeGridParityTest.kt` — der Testbaum darf beide Module sehen; dieser Test ist der Grund, warum die Kopie oben erlaubt ist:

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.frozenSince
import org.unividuell.countdown.core.countdown.CountdownEngine
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * `community` cannot call `CountdownEngine` (that would invert the module dependency), so the freeze
 * point is computed twice. This test is what keeps the two answers one answer.
 */
class EditionFreezeGridParityTest {

    private val engine = CountdownEngine()

    private fun assertMatchesEngine(startsAt: Instant, zone: String, gamesFromRound: Int) {
        val edition = CommunityEdition(
            communityId = UUID.randomUUID(),
            label = "Run 2026",
            startsAt = startsAt,
            startsAtTimezone = zone,
            gamesFromRound = gamesFromRound,
        )

        frozenSince(edition) shouldBe engine.intervalOf(
            number = gamesFromRound,
            startsAt = startsAt,
            zone = ZoneId.of(zone),
        ).start
    }

    @Test
    fun `the freeze point is the engine's start of that round`() {
        assertMatchesEngine(
            startsAt = Instant.parse("2026-06-25T09:00:00Z"),
            zone = "Europe/Berlin",
            gamesFromRound = 24,
        )
    }

    @Test
    fun `still the engine's answer across a DST boundary`() {
        assertMatchesEngine(
            startsAt = Instant.parse("2026-04-05T16:00:00Z"),
            zone = "Europe/Berlin",
            gamesFromRound = 9,
        )
    }

    @Test
    fun `still the engine's answer in a zone that is not the default`() {
        assertMatchesEngine(
            startsAt = Instant.parse("2026-11-10T14:00:00Z"),
            zone = "America/New_York",
            gamesFromRound = 30,
        )
    }
}
```

- [ ] **Step 6: Run both tests**

```bash
cd core && ./mvnw test -Dtest='EditionFreeze*'
```

Erwartet: PASS, 8 Tests. Bricht der Paritätstest, ist die Implementierung aus Step 3 falsch — nicht der Test anpassen, sondern die Funktion.

- [ ] **Step 7: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/internal/EditionFreeze.kt core/src/test/kotlin/org/unividuell/countdown/core/community/EditionFreezeTest.kt core/src/test/kotlin/org/unividuell/countdown/core/community/EditionFreezeGridParityTest.kt
git commit -m "feat(community): compute when a run's round grid becomes fixed

The freeze point is the start of round gamesFromRound — the earliest instant
someone could announce a round. community cannot call CountdownEngine without
inverting the module dependency, so the day math is computed here and pinned
against the engine by a parity test.

Refs #56"
```

---

### Task 2: Der 409 — eingefroren heißt eingefroren, und bleibt es

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityExceptions.kt` (ans Ende anfügen)
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityExceptionHandler.kt:10`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/EditionService.kt:62-82`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/EditionServiceTest.kt` (Tests ans Ende der Klasse)

**Interfaces:**
- Consumes: `frozenSince(edition)` aus Task 1.
- Produces:
  - `class EditionFrozenException(message: String) : RuntimeException(message)` → 409
  - `EditionService.isFrozen(edition: CommunityEdition): Boolean` — Task 3 ruft das auf.

- [ ] **Step 1: Write the failing tests**

An `EditionServiceTest` anhängen (die Imports oben in der Datei um `EditionFrozenException`, `java.time.temporal.ChronoUnit` und `io.kotest.matchers.booleans.shouldBeTrue` erweitern, falls nötig — `Instant` ist schon importiert):

```kotlin
    // The suite runs against the real clock, so the fixtures are relative to it: a run that starts
    // in 10 days has round 24 behind it (25 days before the start) and round 2 ahead of it (3 days
    // before the start). That is one edition that is frozen and, one field later, would not be.
    private fun aStartedRun(slug: String): CommunityEdition {
        val communityId = aCommunity(slug)
        val edition = service.create(communityId = communityId, rawLabel = "Run 2026")
        return service.update(
            edition, label = null, startsAt = Instant.now().plus(10, ChronoUnit.DAYS),
            startsAtTimezone = null, phaseTwoStartRound = null,
            gamesFromRound = 24, gamesUntilRound = null,
        )
    }

    @Test
    fun `a run whose first game round has begun is frozen`() {
        service.isFrozen(aStartedRun("es-frozen")) shouldBe true
    }

    @Test
    fun `a run whose first game round is still ahead is not frozen`() {
        val communityId = aCommunity("es-not-yet")
        val edition = service.create(communityId = communityId, rawLabel = "Run 2026")

        val dated = service.update(
            edition, label = null, startsAt = Instant.now().plus(10, ChronoUnit.DAYS),
            startsAtTimezone = null, phaseTwoStartRound = null,
            gamesFromRound = 2, gamesUntilRound = null,
        )

        service.isFrozen(dated) shouldBe false
    }

    @Test
    fun `update rejects moving the start of a frozen run`() {
        val started = aStartedRun("es-frozen-start")

        shouldThrow<EditionFrozenException> {
            service.update(
                started, label = null, startsAt = Instant.now().plus(12, ChronoUnit.DAYS),
                startsAtTimezone = null, phaseTwoStartRound = null,
                gamesFromRound = null, gamesUntilRound = null,
            )
        }
    }

    @Test
    fun `update rejects re-zoning a frozen run`() {
        val started = aStartedRun("es-frozen-zone")

        shouldThrow<EditionFrozenException> {
            service.update(
                started, label = null, startsAt = null, startsAtTimezone = "America/New_York",
                phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
            )
        }
    }

    @Test
    fun `update accepts the unchanged grid of a frozen run so a rename still works`() {
        val started = aStartedRun("es-frozen-rename")

        val updated = service.update(
            started, label = "Run 2026 reloaded", startsAt = started.startsAt,
            startsAtTimezone = started.startsAtTimezone, phaseTwoStartRound = 20,
            gamesFromRound = null, gamesUntilRound = null,
        )

        updated.label shouldBe "Run 2026 reloaded"
        updated.phaseTwoStartRound shouldBe 20
    }

    @Test
    fun `update rejects a first game round that would thaw a frozen run`() {
        val started = aStartedRun("es-frozen-thaw")

        // Round 2 begins three days before the start, which is still ahead — the same edition
        // would no longer be frozen, and the next PATCH could move the date.
        shouldThrow<EditionFrozenException> {
            service.update(
                started, label = null, startsAt = null, startsAtTimezone = null,
                phaseTwoStartRound = null, gamesFromRound = 2, gamesUntilRound = null,
            )
        }
    }

    @Test
    fun `update accepts a first game round that only pulls the freeze point forward`() {
        val started = aStartedRun("es-frozen-earlier")

        val updated = service.update(
            started, label = null, startsAt = null, startsAtTimezone = null,
            phaseTwoStartRound = null, gamesFromRound = 40, gamesUntilRound = null,
        )

        updated.gamesFromRound shouldBe 40
    }

    @Test
    fun `update moves the start freely while there is no date yet`() {
        val communityId = aCommunity("es-no-date")
        val edition = service.create(communityId = communityId, rawLabel = "Run 2026")

        val updated = service.update(
            edition, label = null, startsAt = Instant.parse("2020-01-01T10:00:00Z"),
            startsAtTimezone = null, phaseTwoStartRound = null,
            gamesFromRound = null, gamesUntilRound = null,
        )

        updated.startsAt shouldBe Instant.parse("2020-01-01T10:00:00Z")
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd core && ./mvnw test -Dtest=EditionServiceTest
```

Erwartet: Kompilierfehler — `Unresolved reference: isFrozen` und `Unresolved reference: EditionFrozenException`.

- [ ] **Step 3: Add the exception and map it to 409**

Ans Ende von `CommunityExceptions.kt`:

```kotlin
/** The run's grid is fixed because its first game round has begun → 409. */
class EditionFrozenException(message: String) : RuntimeException(message)
```

In `CommunityExceptionHandler.kt` die Zeile 10 erweitern:

```kotlin
    @ExceptionHandler(
        SlugUnavailableException::class,
        LastAdminException::class,
        EditionConflictException::class,
        EditionFrozenException::class,
    )
    fun conflict(e: RuntimeException) = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.message ?: "conflict")
```

- [ ] **Step 4: Implement the guard in `EditionService`**

`isFrozen` als neue öffentliche Methode (die Klasse ist `open`, Methoden ebenfalls):

```kotlin
    /**
     * Whether this run's grid is fixed — its first game round has begun, so round numbers are in
     * play and moving the grid would hand out one of them twice.
     */
    open fun isFrozen(edition: CommunityEdition): Boolean =
        frozenSince(edition)?.let { !clock.instant().isBefore(it) } ?: false
```

Kein `@Transactional`: die Methode rechnet, sie liest nichts.
```

Und in `update`, direkt nach dem `val next = edition.copy(...)`-Block und **vor** `validate(next)`:

```kotlin
        if (isFrozen(edition)) {
            if (next.startsAt != edition.startsAt || next.startsAtTimezone != edition.startsAtTimezone) {
                throw EditionFrozenException("the run's grid is fixed since ${frozenSince(edition)}")
            }
            if (!isFrozen(next)) {
                throw EditionFrozenException("a frozen run must not be thawed")
            }
        }
```

Der Vergleich läuft gegen `next`, nicht gegen die Argumente: `copy` hat „null = beibehalten“ schon aufgelöst, also deckt eine einzige Gleichheitsprüfung sowohl das weggelassene als auch das unverändert mitgeschickte Feld ab.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd core && ./mvnw test -Dtest=EditionServiceTest
```

Erwartet: PASS, alle Tests der Klasse (die bestehenden bleiben grün — sie benutzen entweder kein Datum oder eines im Jahr 2099).

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/internal/ core/src/test/kotlin/org/unividuell/countdown/core/community/EditionServiceTest.kt
git commit -m "feat(community): reject a grid change once the run has started

Moving startsAt after rounds were played remaps the grid onto round numbers
game.round_games already holds. The check compares the persisted edition with
the one the update would produce, so an unchanged value still passes and no
field can move the freeze point into the future to thaw the run.

Refs #56"
```

---

### Task 3: `editionFrozen` auf der Wire

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityDtos.kt:8-13` und `:40-50`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityController.kt:30,52,70,88`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityControllerTest.kt`

**Interfaces:**
- Consumes: `EditionService.isFrozen(edition)` aus Task 2.
- Produces: `CommunityResponse.editionFrozen: Boolean` — Task 5 liest es im Frontend.

- [ ] **Step 1: Write the failing tests**

In `CommunityControllerTest` ein `@BeforeEach` einfügen (Import `org.junit.jupiter.api.BeforeEach`), damit die bestehenden Tests den neuen Aufruf nicht als unstubbed mockk-Call sehen:

```kotlin
    @BeforeEach
    fun stubFreeze() {
        every { editions.isFrozen(any()) } returns false
    }
```

Und zwei neue Tests ans Ende der Klasse:

```kotlin
    @Test
    fun `GET by slug reports a frozen run`() {
        val c = community("team")
        val edition = CommunityEdition(id = UUID.randomUUID(), communityId = c.id!!, label = "Team 2026")
        every { access.requireActiveMember(userId = uid, isSuperAdmin = false, slug = "team") } returns c
        every { query.isAdmin(communityId = c.id!!, userId = uid) } returns true
        every { memberRepo.countByCommunityIdAndStatus(communityId = c.id!!, status = MemberStatus.PENDING) } returns 0
        every { editions.requireActive(c.id!!) } returns edition
        every { editions.isFrozen(edition) } returns true

        mockMvc.get("/api/communities/team") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.editionFrozen") { value(true) }
        }
    }

    @Test
    fun `PATCH surfaces a frozen run as 409`() {
        val c = community("team")
        every { access.requireAdmin(userId = uid, isSuperAdmin = false, slug = "team") } returns c
        every {
            communityService.update(
                community = c, name = null, label = null, startsAt = any(), startsAtTimezone = null,
                phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
            )
        } throws EditionFrozenException("the run's grid is fixed since 2026-05-31T09:00:00Z")

        mockMvc.patch("/api/communities/team") {
            with(principalFor()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"startsAt":"2026-07-01T09:00:00Z"}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `PATCH is 409 for a super-admin too`() {
        // The rule protects the play history, not the roles — without this case a bypass branch in
        // the controller would pass every other test in this class.
        val c = community("team")
        every { access.requireAdmin(userId = uid, isSuperAdmin = true, slug = "team") } returns c
        every {
            communityService.update(
                community = c, name = null, label = null, startsAt = any(), startsAtTimezone = null,
                phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
            )
        } throws EditionFrozenException("the run's grid is fixed since 2026-05-31T09:00:00Z")

        mockMvc.patch("/api/communities/team") {
            with(principalFor(superAdmin = true)); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"startsAt":"2026-07-01T09:00:00Z"}"""
        }.andExpect { status { isConflict() } }
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd core && ./mvnw test -Dtest=CommunityControllerTest
```

Erwartet: Kompilierfehler — `isFrozen` existiert auf dem gemockten `EditionService`, aber `$.editionFrozen` fehlt in der Response; der erste Test scheitert an `No value at JSON path "$.editionFrozen"`, sobald es kompiliert.

- [ ] **Step 3: Add the field**

In `CommunityDtos.kt` das Feld an `CommunityResponse` und an die Mapping-Funktion:

```kotlin
data class CommunityResponse(
    val id: UUID, val name: String, val slug: String,
    val startsAt: Instant?, val startsAtTimezone: String, val phaseTwoStartRound: Int?,
    val editionLabel: String, val gamesFromRound: Int?, val gamesUntilRound: Int,
    val editionFrozen: Boolean,
    val viewerIsAdmin: Boolean, val pendingCount: Int,
)
```

```kotlin
fun Community.toResponse(
    edition: CommunityEdition,
    editionFrozen: Boolean,
    viewerIsAdmin: Boolean,
    pendingCount: Int,
) = CommunityResponse(
    id = requireNotNull(id), name = name, slug = slug,
    startsAt = edition.startsAt,
    startsAtTimezone = edition.startsAtTimezone,
    phaseTwoStartRound = edition.phaseTwoStartRound,
    editionLabel = edition.label,
    gamesFromRound = edition.gamesFromRound,
    gamesUntilRound = edition.gamesUntilRound,
    editionFrozen = editionFrozen,
    viewerIsAdmin = viewerIsAdmin, pendingCount = pendingCount,
)
```

- [ ] **Step 4: Fill it at all four call sites**

In `CommunityController` bekommt jeder `toResponse`-Aufruf `editionFrozen = editions.isFrozen(<die Edition, die auch übergeben wird>)`:

- `create` (Zeile 30): `community.toResponse(edition = edition, editionFrozen = editions.isFrozen(edition), viewerIsAdmin = true, pendingCount = 0)`
- `get` (Zeile 52): die Edition vorher in eine `val edition = editions.requireActive(id)` ziehen, damit sie nur einmal geladen wird, dann `c.toResponse(edition = edition, editionFrozen = editions.isFrozen(edition), viewerIsAdmin = isAdmin, pendingCount = pending)`
- `update` (Zeile 70): `updated.community.toResponse(edition = updated.edition, editionFrozen = editions.isFrozen(updated.edition), viewerIsAdmin = true, pendingCount = pending)`
- `startEdition` (Zeile 88): `c.toResponse(edition = edition, editionFrozen = editions.isFrozen(edition), viewerIsAdmin = true, pendingCount = pending)`

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd core && ./mvnw test -Dtest=CommunityControllerTest
```

Erwartet: PASS. Meldet mockk `no answer found for: EditionService(...).isFrozen(...)`, fehlt das `@BeforeEach` aus Step 1.

- [ ] **Step 6: Run the whole backend suite**

```bash
cd core && ./mvnw test
```

Erwartet: PASS, inklusive `ModularityTests` — `community` importiert weiterhin nichts aus `countdown`.

- [ ] **Step 7: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/internal/ core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityControllerTest.kt
git commit -m "feat(community): tell the client whether the run's grid is fixed

editionFrozen is display only — the 409 stays the enforcement. It exists so the
settings form can lock the two fields instead of letting an admin fill them in
and then run into a wall.

Refs #56"
```

---

### Task 4: „Erste Spielrunde“ im Settings-Formular

**Files:**
- Modify: `webapp-vue/src/api/types.ts:27-38` (`CommunityResponse`)
- Modify: `webapp-vue/src/api/communities.ts:26-38` (`updateCommunity`-Body)
- Modify: `webapp-vue/src/pages/c/[slug]/settings.vue`
- Test: `webapp-vue/src/pages/c/[slug]/__tests__/settings.spec.ts`
- Modify (Fixtures, nur je eine Zeile): `webapp-vue/src/communities/__tests__/landingGuard.spec.ts:20`, `webapp-vue/src/communities/__tests__/sharedClock.spec.ts:11`, `webapp-vue/src/communities/__tests__/routeData.spec.ts:20`, `webapp-vue/src/communities/fallbacks/__tests__/RoundFallback.spec.ts:8`

**Interfaces:**
- Consumes: `gamesFromRound` aus `CommunityResponse` (Backend liefert es schon).
- Produces: `CommunityResponse.gamesFromRound: number | null` im Frontend-Typ; Task 5 fügt derselben Datei `editionFrozen` hinzu.

- [ ] **Step 1: Write the failing tests**

In `settings.spec.ts` das Fixture-Objekt um `gamesFromRound: 24` erweitern und zwei Tests in die bestehende `describe`-Gruppe aufnehmen:

```ts
  it('renders gamesFromRound and sends it back', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    const field = w.find('[data-test="games-from-round"]')
    expect((field.element as HTMLInputElement).value).toBe('24')

    await field.setValue(40)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.updateCommunity).toHaveBeenCalledWith(
      'team',
      expect.objectContaining({ gamesFromRound: 40 }),
    )
  })

  it('omits gamesFromRound when the field is cleared', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    await w.find('[data-test="games-from-round"]').setValue('')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.updateCommunity).toHaveBeenCalledWith(
      'team',
      expect.not.objectContaining({ gamesFromRound: expect.anything() }),
    )
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd webapp-vue && pnpm test -- settings
```

Erwartet: FAIL — `Cannot call element of undefined` bzw. der Selector `[data-test="games-from-round"]` findet nichts.

- [ ] **Step 3: Add the field to the type and the request body**

`src/api/types.ts`, in `CommunityResponse` nach `phaseTwoStartRound`:

```ts
  gamesFromRound: number | null
```

`src/api/communities.ts`, im Body-Typ von `updateCommunity`:

```ts
  body: Partial<{
    name: string
    startsAt: string
    startsAtTimezone: string
    phaseTwoStartRound: number
    gamesFromRound: number
  }>,
```

- [ ] **Step 4: Add the input**

In `settings.vue` im `<script setup>` neben `phaseTwoStartRound`:

```ts
const gamesFromRound = ref<number | null>(null)
```

in `onMounted`:

```ts
  gamesFromRound.value = c.gamesFromRound
```

im Body-Typ und im `save()`-Body — `v-model.number` liefert bei einem geleerten Feld `''`, nicht `null`, deshalb die Typprüfung statt eines `!== null`:

```ts
    const body: Partial<{
      name: string
      startsAt: string
      startsAtTimezone: string
      phaseTwoStartRound: number
      gamesFromRound: number
    }> = { name: name.value.trim(), startsAtTimezone: startsAtTimezone.value }
```

```ts
    if (typeof phaseTwoStartRound.value === 'number') body.phaseTwoStartRound = phaseTwoStartRound.value
    if (typeof gamesFromRound.value === 'number') body.gamesFromRound = gamesFromRound.value
```

(die bestehende `phaseTwoStartRound`-Zeile wird dabei ersetzt — sie schickte ein geleertes Feld als `""` mit, was das Backend mit 400 quittiert)

und im Template nach dem Phase-2-Feld:

```vue
      <label class="block text-sm"
        >Erste Spielrunde<input
          v-model.number="gamesFromRound"
          data-test="games-from-round"
          type="number"
          min="1"
          class="mt-1 w-full rounded border px-3 py-1.5"
      /></label>
      <p class="text-xs text-neutral-500">
        Größere Nummer = früher. Leer: ab der ersten Runde.
      </p>
```

- [ ] **Step 5: Fix the typed fixtures**

`gamesFromRound` ist ein Pflichtfeld, also melden vier Fixtures einen Typfehler. In jedem der vier Objekte eine Zeile ergänzen:

```ts
  gamesFromRound: null,
```

Betroffen: `communities/__tests__/landingGuard.spec.ts` (`const team: CommunityResponse`), `communities/__tests__/sharedClock.spec.ts` (`const community: CommunityResponse`), `communities/__tests__/routeData.spec.ts` (die `community()`-Factory), `communities/fallbacks/__tests__/RoundFallback.spec.ts` (die `community()`-Factory).

- [ ] **Step 6: Run tests, typecheck and lint**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Erwartet: alles grün. Meldet `vue-tsc` weitere Stellen ohne `gamesFromRound`, dort dieselbe Zeile ergänzen.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src
git commit -m "feat(settings): let an admin set the run's first game round

The field decides when the run freezes, so it has to be settable — an admin
stuck on the default null freezes the moment they pick a date. Clearing a
number field yields '' rather than null, so both numeric fields now test the
type instead of comparing against null.

Refs #56"
```

---

### Task 5: Start und Zeitzone sperren, wenn der Lauf läuft

**Files:**
- Modify: `webapp-vue/src/api/types.ts` (`CommunityResponse`)
- Modify: `webapp-vue/src/pages/c/[slug]/settings.vue`
- Test: `webapp-vue/src/pages/c/[slug]/__tests__/settings.spec.ts`
- Modify (Fixtures, je eine Zeile): dieselben vier Dateien wie in Task 4, Step 5

**Interfaces:**
- Consumes: `CommunityResponse.editionFrozen: boolean` aus Task 3.
- Produces: nichts, worauf spätere Tasks aufbauen.

- [ ] **Step 1: Write the failing tests**

Im Fixture von `settings.spec.ts` `editionFrozen: false` ergänzen, dann eine zweite `describe`-Gruppe ans Ende der Datei:

```ts
describe('settings — a run that has begun', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({ ...community, editionFrozen: true })
    vi.spyOn(api, 'getInvite').mockResolvedValue(null)
    vi.spyOn(api, 'updateCommunity').mockResolvedValue({ ...community, editionFrozen: true })
  })

  it('locks start and timezone and says why', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    expect(w.find('input[type="datetime-local"]').attributes('disabled')).toBeDefined()
    expect(w.find('select').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test="freeze-hint"]').text()).toContain('Der Lauf hat begonnen')
  })

  it('leaves start and timezone out of the request', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.updateCommunity).toHaveBeenCalledWith(
      'team',
      expect.not.objectContaining({ startsAt: expect.anything() }),
    )
    expect(api.updateCommunity).toHaveBeenCalledWith(
      'team',
      expect.not.objectContaining({ startsAtTimezone: expect.anything() }),
    )
  })
})
```

Und in die bestehende Gruppe (`editionFrozen: false`) den Gegentest, damit der Hinweis nicht nur in einer Richtung stimmt:

```ts
  it('says the grid is still open while the first game round is ahead', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    expect(w.find('input[type="datetime-local"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-test="freeze-hint"]').text()).toContain('Änderbar')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd webapp-vue && pnpm test -- settings
```

Erwartet: FAIL — `[data-test="freeze-hint"]` existiert nicht, und der Body enthält weiterhin `startsAt`.

- [ ] **Step 3: Add the field to the type**

`src/api/types.ts`, in `CommunityResponse`:

```ts
  editionFrozen: boolean
```

- [ ] **Step 4: Lock the inputs and drop them from the body**

In `settings.vue` im `<script setup>`:

```ts
const editionFrozen = ref(false)
```

in `onMounted`:

```ts
  editionFrozen.value = c.editionFrozen
```

in `save()` — die Zuweisung von `startsAtTimezone` wandert aus dem Initialisierer in den Zweig:

```ts
    const body: Partial<{
      name: string
      startsAt: string
      startsAtTimezone: string
      phaseTwoStartRound: number
      gamesFromRound: number
    }> = { name: name.value.trim() }
    if (!editionFrozen.value) {
      body.startsAtTimezone = startsAtTimezone.value
      if (startsAt.value) {
        const instant = toInstant(startsAt.value, startsAtTimezone.value)
        if (instant) body.startsAt = instant
      }
    }
```

im Template `:disabled="editionFrozen"` an `<select v-model="startsAtTimezone">` und an `<input v-model="startsAt" type="datetime-local">`, und unter den bestehenden Zeitzonen-Hinweis:

```vue
      <p data-test="freeze-hint" class="text-xs text-neutral-500">
        {{
          editionFrozen
            ? 'Der Lauf hat begonnen — Start und Zeitzone sind fix.'
            : 'Änderbar, bis die erste Spielrunde beginnt — danach ist der Lauf fix.'
        }}
      </p>
```

- [ ] **Step 5: Fix the typed fixtures**

Dieselben vier Dateien wie in Task 4, Step 5, je eine Zeile:

```ts
  editionFrozen: false,
```

- [ ] **Step 6: Run tests, typecheck and lint**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Erwartet: alles grün.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src
git commit -m "feat(settings): lock start and timezone once the run has begun

Disabled fields plus a line saying which of the two states the form is in, and
the two values are left out of the PATCH entirely — the datetime-local round
trip is minute-precise, so resending it is not reliably a no-op.

Refs #56"
```

---

### Task 6: Die Regel in die Guidelines, die Spec auf „umgesetzt“

**Files:**
- Modify: `.claude/guidelines/countdown.md`
- Modify: `docs/superpowers/specs/2026-08-16-edition-freeze-design.md` (Kopfzeile)

**Interfaces:**
- Consumes: nichts.
- Produces: nichts.

- [ ] **Step 1: Add the rule to `countdown.md`**

Ein neuer Abschnitt vor `## Related / future`:

```markdown
## A grid that is in play is fixed

`startsAt` and `startsAtTimezone` define the round grid, and a round number is not stored anywhere —
it is recomputed from them. Moving either after rounds have been announced therefore points the grid
at numbers `game.round_games` already holds: the same round a second time, or numbers skipped. Both
are unfair and unexplainable to a player.

A run is therefore **frozen** from the start of round `gamesFromRound` on — the earliest instant
anyone could announce a round (`gamesFromRound = null` means unbounded, so a run freezes with its
date). From then on the two fields are 409, and the way forward is a new edition.

The state is **derived, never stored**: `frozenSince(edition)` against the clock. That keeps it
honest without a column, but it makes the freeze point a function of editable fields — so the check
compares the persisted edition with the one the update would produce and rejects **any** update
after which the run would no longer be frozen. A rule on the effect, not on a field, needs no
revisit when the next field enters the computation.

What does **not** freeze: `phaseTwoStartRound` and the game window. Rule and stake are frozen per
round at announcement time (`award_rule`, `award_points`), so moving them only touches rounds still
to come — a game-master decision with visible effect, not a silent rewrite of history.
```

- [ ] **Step 2: Fix the stale line in the same file**

`countdown.md:10` sagt „Not yet implemented — this is the agreed model to build the `countdown` module against.“ Das Modul steht seit Langem. Die Zeile ersetzen durch:

```markdown
Implemented in the `countdown` module (`CountdownEngine` is the grid); this file stays the binding
model it is built against.
```

- [ ] **Step 3: Mark the spec as implemented**

In `docs/superpowers/specs/2026-08-16-edition-freeze-design.md` direkt unter die Überschrift, im Stil der Runden-Spec:

```markdown
**Umgesetzt** — `frozenSince`, der 409 in `EditionService.update`, `editionFrozen` auf der Wire und
das gesperrte Settings-Formular samt „Erste Spielrunde“ stehen.
```

- [ ] **Step 4: Commit**

```bash
git add .claude/guidelines/countdown.md docs/superpowers/specs/2026-08-16-edition-freeze-design.md
git commit -m "docs(countdown): record that a grid in play is fixed

The transferable rule is the shape of the check, not the feature: the freeze
point is derived from editable fields, so the guard compares before and after
instead of naming a field. Also drops the stale 'not yet implemented' line.

Refs #56"
```

---

### Task 7: Verifikation und PR

**Files:** keine.

- [ ] **Step 1: Run the full backend suite from clean**

```bash
cd core && ./mvnw clean test
```

Erwartet: PASS. `clean` ist hier nicht optional — `application-modules.json` in `target/` cacht die Modulstruktur, und `ModularityTests` soll gegen den frischen Baum urteilen.

- [ ] **Step 2: Run the full frontend suite**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Erwartet: PASS.

- [ ] **Step 3: Verify the flow in the running app**

Backend und Frontend starten, als Admin einer Community mit gesetztem Datum in der Vergangenheit die Einstellungen öffnen: Start und Zeitzone sind gesperrt und tragen den Hinweis „Der Lauf hat begonnen“. Bei einer Community, deren erste Spielrunde noch aussteht, sind beide Felder offen und der Hinweis lautet „Änderbar, …“. Nicht das Ergebnis behaupten, ohne es gesehen zu haben.

- [ ] **Step 4: Open the PR against `develop`**

```bash
gh pr create --base develop --title "Edition einfrieren: ein laufendes Rundenraster ist fix" --body "$(cat <<'EOF'
Closes #56

Moving `startsAt` after rounds were played remaps the round grid onto numbers
`game.round_games` already holds — the same round twice, or numbers skipped.

- `frozenSince(edition)` derives the freeze point (start of round `gamesFromRound`), pinned against `CountdownEngine` by a parity test because `community` must not depend on `countdown`.
- `EditionService.update` rejects a grid change on a frozen run, and rejects any update that would thaw one — a comparison of before and after, so no field can move the freeze point into the future.
- `editionFrozen` on the wire; the settings form locks start and timezone, says which state it is in, and leaves both out of the PATCH.
- `gamesFromRound` becomes settable at all — it decides when the run freezes.

`phaseTwoStartRound` and the game window stay editable on purpose: rule and stake are already frozen per round, so moving them only touches rounds still to come.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Offen, bewusst nicht in diesem Plan

Der Ausweg „neue Edition starten“ hat einen Endpunkt (`POST /api/communities/{slug}/editions`), aber keinen Knopf im UI. Der Hinweistext verweist deshalb nicht darauf. Nach dem Merge ein eigenes Issue: Bestätigung, Label, und was von den Punktständen der alten Edition sichtbar bleibt — ein Schnitt für sich.
