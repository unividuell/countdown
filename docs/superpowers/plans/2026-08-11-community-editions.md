# Durchlauf (`community.editions`) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Community bekommt **Durchläufe** — genau einer aktiv — und `starts_at`, `starts_at_timezone` und `phase_two_start_round` wandern von `communities` dorthin, damit eine Runde später an `(edition_id, round_number)` hängen kann.

**Architecture:** Neue Tabelle `community.editions` mit partiellem Unique-Index „genau ein aktiver Durchlauf je Community“. Umgesetzt als **expand/contract**: `V3` legt die Tabelle an und füllt sie aus den Community-Spalten, alle Leser und Schreiber ziehen um, `V4` löscht die alten Spalten. Nach außen bleibt `CommunityResponse` formgleich (die Werte kommen aus dem aktiven Durchlauf), deshalb bleibt das Frontend in diesem Plan **unberührt**.

**Tech Stack:** Kotlin 2.4 · Spring Boot 4.1 · Spring Data JDBC · Spring Modulith 2.1 · PostgreSQL 18 · Flyway · JUnit 5 + kotest matchers + mockk + Testcontainers.

**Spec:** [`docs/superpowers/specs/2026-08-11-round-game-selection-design.md`](../specs/2026-08-11-round-game-selection-design.md) — Abschnitte *Die dritte Koordinate: der Durchlauf*, *`community.editions`*, *Umsetzungsschnitt* Punkt 1.

## Global Constraints

- **Modulgrenze:** Exponierte Typen im Basis-Package `…core.community` (hier: `CommunityEdition`), alles andere in `…core.community.internal`. `ModularityTests.verify()` muss grün bleiben.
- **Persistenz:** Spring Data JDBC, keine JPA. PK ist `id UUID PRIMARY KEY DEFAULT uuidv7()` in der DDL und `@Id val id: UUID? = null` in der Entity — **niemals** IDs im Code setzen.
- **Kein `@Column`:** `DefaultNamingStrategy` mappt camelCase → snake_case. `@Table` nur für Schema + Tabellenname.
- **Zeitstempel:** `@CreatedDate` / `@LastModifiedDate` + `@EnableJdbcAuditing`. **Niemals** `updatedAt = Instant.now()` im Service — Auditing ist die einzige Quelle.
- **`community.id` einmal auspacken:** `val id = requireNotNull(c.id)` und dann die `UUID` weitergeben. Nicht wiederholt `c.id!!` schreiben.
- **Migrationen:** `core/src/main/resources/db/migration/community/`, vorwärts, je Modul eigene Versionsreihe. Bestehende Skripte **nicht** ändern (Flyway-Checksum; Staging läuft).
- **Runden-Vorzeichen:** größere Rundennummer = **früher** in der Zeit. Fenster inklusiv: `games_until_round ≤ number ≤ games_from_round`. `games_from_round = NULL` heißt „ab der ersten Runde“, `games_until_round` Default `0`.
- **„null = keep“:** Bestehende Semantik von `CommunityService.update` — ein nicht gesetztes Feld bleibt unverändert; Löschen eines Werts ist außerhalb des Scopes.
- **Tests:** kotest matchers (`shouldBe`, `shouldThrow`, `shouldNotBeNull`), **nicht** `kotlin.test`/JUnit-Assertions. Web-Tests mit MockMvc **Kotlin DSL**. Integrationstests mit `@Import(TestcontainersConfiguration::class) @SpringBootTest @Transactional`.
- **Sprache:** Code, Kommentare, Testnamen und Commit-Messages **englisch**. Dieser Plan ist deutsch. Nutzertexte auf Deutsch nutzen `„…“`, nie `"`.
- **Zeitzonen:** nur IANA-Region-IDs (`ZoneId.getAvailableZoneIds()`), keine Fixed-Offsets — DST-korrekte Rundenmathematik braucht Regionszonen.
- **Branch:** von `develop` abzweigen, PR mit `--base develop`.

---

## File Structure

**Neu:**

| Datei | Verantwortung |
|---|---|
| `core/src/main/resources/db/migration/community/V3__create_editions.sql` | Tabelle, partieller Unique-Index, CHECK, Backfill aus `communities` |
| `core/src/main/resources/db/migration/community/V4__drop_community_edition_columns.sql` | die drei alten Spalten löschen |
| `core/src/main/kotlin/…/community/CommunityEdition.kt` | die Entity, **exponiert** (andere Module lesen sie) |
| `core/src/main/kotlin/…/community/internal/CommunityEditionRepository.kt` | `findActiveByCommunityId`, `findAllActive` |
| `core/src/main/kotlin/…/community/internal/EditionService.kt` | Lebenszyklus + Validierung eines Durchlaufs |
| `core/src/test/kotlin/…/community/CommunityEditionRepositoryTest.kt` | UUID v7, aktiver Durchlauf, partieller Index |
| `core/src/test/kotlin/…/community/EditionServiceTest.kt` | Validierung, `startNew` (Archivieren + Erben) |

**Geändert:**

| Datei | Änderung |
|---|---|
| `…/community/Community.kt` | drei Felder entfernen (Task 5) |
| `…/community/CommunityQuery.kt` | `activeEditionOf(communityId)` als Cross-Modul-Port |
| `…/community/internal/CommunityQueryService.kt` | Port implementieren |
| `…/community/internal/CommunityService.kt` | `create` legt den ersten Durchlauf an; `update` schreibt den Durchlauf |
| `…/community/internal/CommunityDtos.kt` | `toResponse` nimmt die Edition; zwei neue Response-/Request-Felder |
| `…/community/internal/CommunityController.kt` | Verdrahtung + `POST /{slug}/editions` |
| `…/community/internal/CommunityExceptions.kt` | `EditionConflictException` |
| `…/community/internal/CommunityExceptionHandler.kt` | die neue Exception auf 409 |
| `…/community/internal/SuperAdminOverviewService.kt` | aktive Durchläufe **gebatcht** lesen |
| `…/countdown/internal/CountdownService.kt` | Runden aus dem Durchlauf auflösen |
| `…/community/CommunityServiceTest.kt`, `…/countdown/CountdownServiceTest.kt`, `…/community/SuperAdminOverviewServiceTest.kt`, `…/community/CommunityControllerTest.kt` | mitziehen |

---

## Task 1: Tabelle, Entity, Repository (expand)

Nach dieser Task existiert die Tabelle und ist befüllt; **das Verhalten der App ändert sich nicht**, die alten Spalten sind weiter maßgeblich.

**Files:**
- Create: `core/src/main/resources/db/migration/community/V3__create_editions.sql`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/CommunityEdition.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityEditionRepository.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityEditionRepositoryTest.kt`

**Interfaces:**
- Consumes: `Community`, `CommunityRepository`, `TestcontainersConfiguration`, `UserRepository` (bestehend).
- Produces: `CommunityEdition(id, communityId, label, startsAt, startsAtTimezone, phaseTwoStartRound, gamesFromRound, gamesUntilRound, archivedAt, createdAt, updatedAt)` mit `CommunityEdition.DEFAULT_TIMEZONE = "Europe/Berlin"`; `CommunityEditionRepository.findActiveByCommunityId(UUID): CommunityEdition?` und `findAllActive(): List<CommunityEdition>`.

- [ ] **Step 1: Migration schreiben**

`core/src/main/resources/db/migration/community/V3__create_editions.sql`:

```sql
CREATE TABLE community.editions (
    id                        UUID         PRIMARY KEY DEFAULT uuidv7(),
    community_id              UUID         NOT NULL REFERENCES community.communities(id) ON DELETE CASCADE,
    label                     TEXT         NOT NULL,
    starts_at                 TIMESTAMPTZ  NULL,
    starts_at_timezone        TEXT         NOT NULL DEFAULT 'Europe/Berlin',
    phase_two_start_round     INT          NULL,
    games_from_round          INT          NULL,
    games_until_round         INT          NOT NULL DEFAULT 0,
    archived_at               TIMESTAMPTZ  NULL,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- A larger round number is EARLIER in time, so the window is until <= number <= from.
    -- Spelled out here because "from < until" reads correct to a newcomer and is not.
    CONSTRAINT editions_window_ordered
        CHECK (games_from_round IS NULL OR games_from_round >= games_until_round)
);

-- The invariant: exactly one active edition per community. A partial index, not a trigger.
CREATE UNIQUE INDEX idx_editions_one_active_per_community
    ON community.editions (community_id) WHERE archived_at IS NULL;

CREATE INDEX idx_editions_community ON community.editions (community_id);

-- Backfill: every existing community is its own first run, labelled with its name.
INSERT INTO community.editions (community_id, label, starts_at, starts_at_timezone, phase_two_start_round)
SELECT id, name, starts_at, starts_at_timezone, phase_two_start_round
FROM community.communities;
```

- [ ] **Step 2: Failing test schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityEditionRepositoryTest.kt`:

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.assertions.throwables.shouldThrow
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.dao.DuplicateKeyException
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityEditionRepositoryTest(
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
) {
    private fun aCommunity(slug: String): UUID {
        val creator = users.save(User(githubId = System.nanoTime(), githubLogin = "creator"))
        val c = communities.save(Community(name = slug, slug = slug, createdBy = creator.id!!))
        return requireNotNull(c.id)
    }

    @Test
    fun `saves an edition with a uuid v7 id and finds the active one`() {
        val communityId = aCommunity("edition-basics")

        val saved = editions.save(CommunityEdition(communityId = communityId, label = "Run 2026"))

        saved.id.shouldNotBeNull().version() shouldBe 7
        saved.createdAt.shouldNotBeNull()
        saved.startsAtTimezone shouldBe "Europe/Berlin"
        saved.gamesUntilRound shouldBe 0
        saved.gamesFromRound.shouldBeNull()

        val active = editions.findActiveByCommunityId(communityId).shouldNotBeNull()
        active.label shouldBe "Run 2026"
    }

    @Test
    fun `an archived edition is no longer the active one`() {
        val communityId = aCommunity("edition-archived")
        val first = editions.save(CommunityEdition(communityId = communityId, label = "Run 2026"))

        editions.save(first.copy(archivedAt = Instant.parse("2026-08-11T00:00:00Z")))

        editions.findActiveByCommunityId(communityId).shouldBeNull()
    }

    @Test
    fun `findAllActive returns one row per community and skips archived ones`() {
        val a = aCommunity("edition-active-a")
        val b = aCommunity("edition-active-b")
        editions.save(CommunityEdition(communityId = a, label = "A 2026"))
        val old = editions.save(CommunityEdition(communityId = b, label = "B 2025"))
        editions.save(old.copy(archivedAt = Instant.parse("2026-01-01T00:00:00Z")))
        editions.save(CommunityEdition(communityId = b, label = "B 2026"))

        val active = editions.findAllActive()

        active shouldHaveSize 2
        active.map { it.label }.toSet() shouldBe setOf("A 2026", "B 2026")
    }

    // The constraint violation marks THIS test's transaction rollback-only, so the test asserts the
    // throw and queries nothing afterwards. Neighbouring tests are unaffected — each @Test in a
    // @Transactional Spring test runs in its own transaction and rolls back on its own.
    @Test
    fun `a second active edition for the same community is rejected`() {
        val communityId = aCommunity("edition-only-one-active")
        editions.save(CommunityEdition(communityId = communityId, label = "Run 2026"))

        shouldThrow<DuplicateKeyException> {
            editions.save(CommunityEdition(communityId = communityId, label = "Run 2027"))
        }
    }
}
```

- [ ] **Step 3: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=CommunityEditionRepositoryTest`
Expected: Kompilierfehler — `CommunityEdition` und `CommunityEditionRepository` existieren nicht.

- [ ] **Step 4: Entity schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/community/CommunityEdition.kt`:

```kotlin
package org.unividuell.countdown.core.community

import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

/**
 * One run of a community's countdown: the target date and everything hanging off the round grid.
 *
 * The community itself is permanent, the run is not: the target event recurs (annually, sometimes
 * more often), so `(community, T-58)` is not a key — every run has its own T-58 with its own guesses
 * and its own ranking. Exactly one edition per community is active, enforced by a partial unique
 * index on `archived_at IS NULL`.
 *
 * Exposed rather than internal because `countdown` (and later the game framework) resolves rounds
 * from it. See `docs/superpowers/specs/2026-08-11-round-game-selection-design.md`.
 */
@Table(schema = "community", name = "editions")
data class CommunityEdition(
    @Id
    val id: UUID? = null,
    val communityId: UUID,
    /** Display name of the run, e.g. „Hüttenwochenende 2026“. */
    val label: String,
    val startsAt: Instant? = null,
    val startsAtTimezone: String = DEFAULT_TIMEZONE,
    val phaseTwoStartRound: Int? = null,
    /**
     * First round that carries a game — the *larger* number, because a larger round number is
     * earlier in time. `null` means "from the very first round".
     */
    val gamesFromRound: Int? = null,
    /** Last round that carries a game — the smaller number. `0` is T-0, the day before the start. */
    val gamesUntilRound: Int = 0,
    /** `null` = active. Archiving is how a run ends; rows are never deleted. */
    val archivedAt: Instant? = null,
    @CreatedDate
    val createdAt: Instant? = null,
    @LastModifiedDate
    val updatedAt: Instant? = null,
) {
    companion object {
        /** Mirrors the column default in `V3__create_editions.sql`. */
        const val DEFAULT_TIMEZONE = "Europe/Berlin"
    }
}
```

- [ ] **Step 5: Repository schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityEditionRepository.kt`:

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import org.unividuell.countdown.core.community.CommunityEdition
import java.util.UUID

interface CommunityEditionRepository : CrudRepository<CommunityEdition, UUID> {

    /**
     * Explicit SQL rather than a derived `findByCommunityIdAndArchivedAtIsNull`: this query is the
     * read side of the partial unique index, and spelling it out keeps the two in sight of each
     * other. See persistence.md on derived-query traps.
     */
    @Query("SELECT * FROM community.editions WHERE community_id = :communityId AND archived_at IS NULL")
    fun findActiveByCommunityId(communityId: UUID): CommunityEdition?

    /** For list screens: one query for every community's active edition, never one per row. */
    @Query("SELECT * FROM community.editions WHERE archived_at IS NULL")
    fun findAllActive(): List<CommunityEdition>
}
```

- [ ] **Step 6: Test laufen lassen und Erfolg bestätigen**

Run: `cd core && ./mvnw test -Dtest=CommunityEditionRepositoryTest`
Expected: PASS, 4 Tests.

- [ ] **Step 7: Backfill gegen die lokale Datenbank prüfen**

Die Testcontainers-DB ist beim Flyway-Lauf leer, der Backfill kopiert dort **null Zeilen** — er kann durch keinen Integrationstest belegt werden. Gegen die lokale Dev-DB mit echten Zeilen dagegen schon.

Run: `cd core && ./mvnw spring-boot:run` (startet Postgres via Compose, migriert, dann mit `Ctrl-C` beenden)

Dann den Mapped-Port holen und prüfen:

```bash
docker compose port postgres 5432
```

```sql
SELECT count(*) AS mismatches
FROM community.communities c
JOIN community.editions e ON e.community_id = c.id
WHERE (c.starts_at, c.starts_at_timezone, c.phase_two_start_round)
      IS DISTINCT FROM (e.starts_at, e.starts_at_timezone, e.phase_two_start_round);
```

Expected: `mismatches = 0`, und `SELECT count(*) FROM community.editions WHERE archived_at IS NULL` gleich der Anzahl Communities. Ist die lokale DB leer, ist der Check wertlos — dann vorher über `/api/dev/login` zwei Communities anlegen und die Migration mit `docker compose down -v` + Neustart wiederholen.

- [ ] **Step 8: Commit**

```bash
git add core/src/main/resources/db/migration/community/V3__create_editions.sql \
        core/src/main/kotlin/org/unividuell/countdown/core/community/CommunityEdition.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityEditionRepository.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityEditionRepositoryTest.kt
git commit -m "feat(community): add the editions table, backfilled from the community columns"
```

---

## Task 2: `EditionService` — Lebenszyklus und Validierung

Reine Ergänzung: der Service existiert und ist getestet, aber noch ruft ihn niemand.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/EditionService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityExceptions.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityExceptionHandler.kt` (die `conflict`-Methode)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/EditionServiceTest.kt`

**Interfaces:**
- Consumes: `CommunityEdition`, `CommunityEditionRepository` (Task 1), `Clock` (Bean in `CoreApplication`).
- Produces:
  - `EditionService.active(communityId: UUID): CommunityEdition?`
  - `EditionService.requireActive(communityId: UUID): CommunityEdition`
  - `EditionService.create(communityId: UUID, rawLabel: String, inheritFrom: CommunityEdition? = null): CommunityEdition`
  - `EditionService.startNew(communityId: UUID, rawLabel: String): CommunityEdition`
  - `EditionService.update(edition: CommunityEdition, label: String?, startsAt: Instant?, startsAtTimezone: String?, phaseTwoStartRound: Int?, gamesFromRound: Int?, gamesUntilRound: Int?): CommunityEdition`
  - `EditionConflictException(message: String, cause: Throwable?)` → HTTP 409

- [ ] **Step 1: Failing test schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/community/EditionServiceTest.kt`:

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.community.internal.EditionService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class EditionServiceTest(
    @Autowired val service: EditionService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
) {
    private fun aCommunity(slug: String): UUID {
        val creator = users.save(User(githubId = System.nanoTime(), githubLogin = "creator"))
        return requireNotNull(communities.save(Community(name = slug, slug = slug, createdBy = creator.id!!)).id)
    }

    @Test
    fun `create makes the first active edition with the defaults`() {
        val communityId = aCommunity("es-create")

        val edition = service.create(communityId, "  Run 2026  ")

        edition.label shouldBe "Run 2026"
        edition.startsAt.shouldBeNull()
        edition.startsAtTimezone shouldBe CommunityEdition.DEFAULT_TIMEZONE
        edition.gamesUntilRound shouldBe 0
        edition.archivedAt.shouldBeNull()
    }

    @Test
    fun `requireActive fails loudly when the invariant is broken`() {
        val communityId = aCommunity("es-no-edition")

        shouldThrow<IllegalStateException> { service.requireActive(communityId) }
    }

    @Test
    fun `update sets a valid IANA timezone and keeps unset fields`() {
        val communityId = aCommunity("es-update")
        val edition = service.create(communityId, "Run 2026")

        val updated = service.update(
            edition, label = null, startsAt = Instant.parse("2099-01-01T10:00:00Z"),
            startsAtTimezone = "America/New_York", phaseTwoStartRound = 20,
            gamesFromRound = 24, gamesUntilRound = null,
        )

        updated.label shouldBe "Run 2026"
        updated.startsAtTimezone shouldBe "America/New_York"
        updated.phaseTwoStartRound shouldBe 20
        updated.gamesFromRound shouldBe 24
        updated.gamesUntilRound shouldBe 0
    }

    @Test
    fun `update rejects an invalid timezone`() {
        val communityId = aCommunity("es-bad-zone")
        val edition = service.create(communityId, "Run 2026")

        shouldThrow<IllegalArgumentException> {
            service.update(
                edition, label = null, startsAt = null, startsAtTimezone = "Mars/Olympus",
                phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
            )
        }
    }

    @Test
    fun `update rejects a phaseTwoStartRound that is not positive`() {
        val communityId = aCommunity("es-bad-phase")
        val edition = service.create(communityId, "Run 2026")

        shouldThrow<IllegalArgumentException> {
            service.update(
                edition, label = null, startsAt = null, startsAtTimezone = null,
                phaseTwoStartRound = 0, gamesFromRound = null, gamesUntilRound = null,
            )
        }
    }

    @Test
    fun `update rejects a window whose first round is later than its last`() {
        val communityId = aCommunity("es-bad-window")
        val edition = service.create(communityId, "Run 2026")

        // A larger number is earlier: from=5 with until=10 would end before it begins.
        shouldThrow<IllegalArgumentException> {
            service.update(
                edition, label = null, startsAt = null, startsAtTimezone = null,
                phaseTwoStartRound = null, gamesFromRound = 5, gamesUntilRound = 10,
            )
        }
    }

    @Test
    fun `update accepts a negative last round so games can run past the start`() {
        val communityId = aCommunity("es-negative-window")
        val edition = service.create(communityId, "Run 2026")

        val updated = service.update(
            edition, label = null, startsAt = null, startsAtTimezone = null,
            phaseTwoStartRound = null, gamesFromRound = 24, gamesUntilRound = -3,
        )

        updated.gamesUntilRound shouldBe -3
    }

    @Test
    fun `startNew archives the current edition and inherits its setup`() {
        val communityId = aCommunity("es-start-new")
        val first = service.create(communityId, "Run 2026")
        service.update(
            first, label = null, startsAt = Instant.parse("2026-10-01T16:00:00Z"),
            startsAtTimezone = "America/New_York", phaseTwoStartRound = 20,
            gamesFromRound = 24, gamesUntilRound = -1,
        )

        val second = service.startNew(communityId, "Run 2027")

        second.label shouldBe "Run 2027"
        second.startsAt.shouldBeNull()          // the new date is not known yet
        second.startsAtTimezone shouldBe "America/New_York"
        second.phaseTwoStartRound shouldBe 20
        second.gamesFromRound shouldBe 24
        second.gamesUntilRound shouldBe -1

        service.requireActive(communityId).label shouldBe "Run 2027"
        editions.findAllActive().count { it.communityId == communityId } shouldBe 1
        val archived = editions.findAll().single { it.label == "Run 2026" }
        archived.archivedAt.shouldNotBeNull()
    }
}
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=EditionServiceTest`
Expected: Kompilierfehler — `EditionService` existiert nicht.

- [ ] **Step 3: Exception ergänzen**

In `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityExceptions.kt` **anhängen**:

```kotlin
/** A community already has an active edition (partial unique index lost the race) → 409. */
class EditionConflictException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)
```

In `CommunityExceptionHandler.kt` die `conflict`-Zeile erweitern:

```kotlin
    @ExceptionHandler(SlugUnavailableException::class, LastAdminException::class, EditionConflictException::class)
    fun conflict(e: RuntimeException) = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.message ?: "conflict")
```

- [ ] **Step 4: Service schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/community/internal/EditionService.kt`:

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * The lifecycle of a community's runs. A run is never deleted, only archived, and a community has
 * exactly one active run at a time — the partial unique index is the enforcement, this service is
 * the well-lit path to it.
 */
@Service
open class EditionService(
    private val editions: CommunityEditionRepository,
    private val clock: Clock,
) {
    @Transactional(readOnly = true)
    open fun active(communityId: UUID): CommunityEdition? = editions.findActiveByCommunityId(communityId)

    /**
     * Every community has an active edition: `CommunityService.create` makes one and the V3
     * migration backfilled the rest. A miss is a broken invariant, not a user error — hence 500.
     */
    @Transactional(readOnly = true)
    open fun requireActive(communityId: UUID): CommunityEdition =
        active(communityId) ?: throw IllegalStateException("community $communityId has no active edition")

    /** [inheritFrom] carries the setup forward when a follow-up run starts; only the date resets. */
    @Transactional
    open fun create(communityId: UUID, rawLabel: String, inheritFrom: CommunityEdition? = null): CommunityEdition {
        val fresh = CommunityEdition(communityId = communityId, label = rawLabel.trim())
        val edition = inheritFrom?.let {
            fresh.copy(
                startsAtTimezone = it.startsAtTimezone,
                phaseTwoStartRound = it.phaseTwoStartRound,
                gamesFromRound = it.gamesFromRound,
                gamesUntilRound = it.gamesUntilRound,
            )
        } ?: fresh
        validate(edition)
        return try {
            editions.save(edition)
        } catch (e: DuplicateKeyException) {
            throw EditionConflictException("community $communityId already has an active edition", e)
        }
    }

    /**
     * Archive the current run and open the next one. Two concurrent calls both archive and both
     * insert; the partial index rejects the loser, which surfaces as a 409 rather than a second
     * active run.
     */
    @Transactional
    open fun startNew(communityId: UUID, rawLabel: String): CommunityEdition {
        val current = active(communityId)
        if (current != null) editions.save(current.copy(archivedAt = clock.instant()))
        return create(communityId, rawLabel, inheritFrom = current)
    }

    /** "null = keep" throughout, matching `CommunityService.update`; clearing a value is out of scope. */
    @Transactional
    open fun update(
        edition: CommunityEdition,
        label: String?,
        startsAt: Instant?,
        startsAtTimezone: String?,
        phaseTwoStartRound: Int?,
        gamesFromRound: Int?,
        gamesUntilRound: Int?,
    ): CommunityEdition {
        val next = edition.copy(
            label = label?.trim() ?: edition.label,
            startsAt = startsAt ?: edition.startsAt,
            startsAtTimezone = startsAtTimezone ?: edition.startsAtTimezone,
            phaseTwoStartRound = phaseTwoStartRound ?: edition.phaseTwoStartRound,
            gamesFromRound = gamesFromRound ?: edition.gamesFromRound,
            gamesUntilRound = gamesUntilRound ?: edition.gamesUntilRound,
        )
        validate(next)
        return editions.save(next)
    }

    /** Validating the finished aggregate, not the arguments — one place covers create and update. */
    private fun validate(edition: CommunityEdition) {
        require(edition.label.length in 3..50) { "label must be 3..50 chars" }
        edition.phaseTwoStartRound?.let { require(it > 0) { "phaseTwoStartRound must be > 0" } }
        // IANA region IDs only (by design): DST-correct round math needs region zones, not offsets.
        require(ZoneId.getAvailableZoneIds().contains(edition.startsAtTimezone)) {
            "invalid timezone: ${edition.startsAtTimezone}"
        }
        // A larger round number is earlier in time, so the first round must not be below the last.
        edition.gamesFromRound?.let {
            require(it >= edition.gamesUntilRound) {
                "gamesFromRound ($it) must not be below gamesUntilRound (${edition.gamesUntilRound})"
            }
        }
    }
}
```

- [ ] **Step 5: Test laufen lassen und Erfolg bestätigen**

Run: `cd core && ./mvnw test -Dtest=EditionServiceTest`
Expected: PASS, 8 Tests.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/internal/EditionService.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityExceptions.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityExceptionHandler.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/community/EditionServiceTest.kt
git commit -m "feat(community): add EditionService with validation and run rollover"
```

---

## Task 3: Der Umschalter — der Durchlauf wird maßgeblich

Die eine Task, in der Schreiber **und** Leser gemeinsam umziehen. Sie lassen sich nicht trennen: sobald `update` den Durchlauf schreibt, sind die Community-Spalten veraltet, und jeder Leser, der noch dort liest, liefert falsche Werte.

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/CommunityQuery.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityQueryService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityController.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/SuperAdminOverviewService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/countdown/internal/CountdownService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityServiceTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/countdown/CountdownServiceTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityControllerTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/SuperAdminOverviewServiceTest.kt`

**Interfaces:**
- Consumes: `EditionService` (Task 2), `CommunityEditionRepository` (Task 1).
- Produces:
  - `CommunityQuery.activeEditionOf(communityId: UUID): CommunityEdition?` — der Cross-Modul-Port; **nullable**, weil `countdown` und später `game` „kein Durchlauf“ als eigenen Zustand behandeln müssen.
  - `CommunityWithEdition(val community: Community, val edition: CommunityEdition)` in `community.internal`.
  - `CommunityService.update(community, name, label, startsAt, startsAtTimezone, phaseTwoStartRound, gamesFromRound, gamesUntilRound): CommunityWithEdition`
  - `Community.toResponse(edition: CommunityEdition, viewerIsAdmin: Boolean, pendingCount: Int): CommunityResponse`
  - `CommunityResponse` zusätzlich mit `editionLabel: String`, `gamesFromRound: Int?`, `gamesUntilRound: Int`.
  - `UpdateCommunityRequest` zusätzlich mit `editionLabel: String?`, `gamesFromRound: Int?`, `gamesUntilRound: Int?`.

- [ ] **Step 1: Failing test für den Port und den Schreiber**

In `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityServiceTest.kt` die drei Tests `update sets a valid IANA timezone`, `update rejects an invalid timezone` und `new community defaults to Europe Berlin` **ersetzen** durch:

```kotlin
    @Test
    fun `create makes the first active edition labelled with the community name`() {
        val c = service.create(aUser().id!!, "Hütte 2026")

        val edition = query.activeEditionOf(requireNotNull(c.id)).shouldNotBeNull()
        edition.label shouldBe "Hütte 2026"
        edition.startsAtTimezone shouldBe CommunityEdition.DEFAULT_TIMEZONE
        edition.startsAt.shouldBeNull()
    }

    @Test
    fun `update writes the schedule to the active edition and the name to the community`() {
        val c = service.create(aUser().id!!, "Zone Team")

        val (community, edition) = service.update(
            c, name = "Zone Team Renamed", label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "America/New_York",
            phaseTwoStartRound = 20, gamesFromRound = 24, gamesUntilRound = null,
        )

        community.name shouldBe "Zone Team Renamed"
        community.slug shouldBe "zone-team"           // the slug is immutable
        edition.startsAtTimezone shouldBe "America/New_York"
        edition.phaseTwoStartRound shouldBe 20
        edition.gamesFromRound shouldBe 24
        edition.gamesUntilRound shouldBe 0
        query.activeEditionOf(requireNotNull(c.id))!!.startsAtTimezone shouldBe "America/New_York"
    }

    @Test
    fun `update rejects an invalid timezone`() {
        val c = service.create(aUser().id!!, "Bad Zone")

        shouldThrow<IllegalArgumentException> {
            service.update(
                c, name = null, label = null, startsAt = null, startsAtTimezone = "Mars/Olympus",
                phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
            )
        }
    }
```

Dazu oben im Test die Abhängigkeit und die Imports ergänzen:

```kotlin
class CommunityServiceTest(
    @Autowired val service: CommunityService,
    @Autowired val query: CommunityQueryService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val users: UserRepository,
) {
```

```kotlin
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import org.unividuell.countdown.core.community.internal.CommunityQueryService
import java.time.Instant
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=CommunityServiceTest`
Expected: Kompilierfehler — `activeEditionOf` und die neue `update`-Signatur existieren nicht.

- [ ] **Step 3: Port und Query-Service erweitern**

`CommunityQuery.kt`:

```kotlin
package org.unividuell.countdown.core.community

import java.util.UUID

/** Read-only access to communities, for consumption by other modules. */
interface CommunityQuery {
    fun findBySlug(slug: String): Community?
    fun findById(id: UUID): Community?

    /**
     * The community's current run, or `null` if it has none.
     *
     * Nullable on purpose although every community has one: a consumer resolving rounds must be able
     * to answer "not scheduled" rather than blow up, and that decision belongs to the consumer.
     */
    fun activeEditionOf(communityId: UUID): CommunityEdition?
}
```

In `CommunityQueryService.kt` das Repository injizieren und die Methode implementieren:

```kotlin
@Service
@Transactional(readOnly = true)
class CommunityQueryService(
    private val communities: CommunityRepository,
    private val members: CommunityMemberRepository,
    private val editions: CommunityEditionRepository,
) : CommunityQuery, MembershipQuery {
    override fun findBySlug(slug: String): Community? = communities.findBySlug(slug)
    override fun findById(id: UUID): Community? = communities.findByIdOrNull(id)
    override fun activeEditionOf(communityId: UUID): CommunityEdition? =
        editions.findActiveByCommunityId(communityId)
    // … unchanged below
```

Import ergänzen: `import org.unividuell.countdown.core.community.CommunityEdition`.

- [ ] **Step 4: `CommunityService` umbauen**

`CommunityService.kt` — `EditionService` injizieren, `create` legt den ersten Durchlauf an, `update` verteilt auf beide Aggregate. Der bisherige manuelle `updatedAt = Instant.now()` **entfällt**: `@LastModifiedDate` + `@EnableJdbcAuditing` sind laut persistence.md die einzige Quelle.

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import java.time.Instant
import java.util.UUID

/** A community together with its current run — what every read of a community actually needs. */
data class CommunityWithEdition(val community: Community, val edition: CommunityEdition)

@Service
open class CommunityService(
    private val communities: CommunityRepository,
    private val members: CommunityMemberRepository,
    private val editions: EditionService,
) {
    @Transactional
    open fun create(creatorUserId: UUID, rawName: String): Community {
        val name = rawName.trim()
        require(name.length in 3..50) { "name must be 3..50 chars" }
        val slug = Slugs.slugify(name)
        require(slug.length >= 3) { "derived slug must be at least 3 chars" }
        if (communities.findBySlug(slug) != null) throw SlugUnavailableException("slug '$slug' is taken")
        val community = try {
            communities.save(Community(name = name, slug = slug, createdBy = creatorUserId))
        } catch (e: DuplicateKeyException) {
            throw SlugUnavailableException("slug '$slug' is taken")
        }
        val communityId = requireNotNull(community.id)
        members.save(
            CommunityMember(
                communityId = communityId,
                userId = creatorUserId,
                status = MemberStatus.ACTIVE,
                isAdmin = true,
            )
        )
        // The first run is labelled with the community name: it is the community's first countdown,
        // and an admin renames it when a second one starts.
        editions.create(communityId, name)
        return community
    }

    /**
     * The community owns its name, the run owns the schedule. One transaction over both so a
     * rejected timezone cannot leave a renamed community behind — the **rollback** is what
     * guarantees that, not the order of the two writes.
     */
    @Transactional
    open fun update(
        community: Community,
        name: String?,
        label: String?,
        startsAt: Instant?,
        startsAtTimezone: String?,
        phaseTwoStartRound: Int?,
        gamesFromRound: Int?,
        gamesUntilRound: Int?,
    ): CommunityWithEdition {
        name?.let { require(it.trim().length in 3..50) { "name must be 3..50 chars" } }
        val communityId = requireNotNull(community.id)
        val edition = editions.update(
            edition = editions.requireActive(communityId),
            label = label,
            startsAt = startsAt,
            startsAtTimezone = startsAtTimezone,
            phaseTwoStartRound = phaseTwoStartRound,
            gamesFromRound = gamesFromRound,
            gamesUntilRound = gamesUntilRound,
        )
        // slug is immutable — never recomputed
        val saved = communities.save(community.copy(name = name?.trim() ?: community.name))
        return CommunityWithEdition(saved, edition)
    }
}
```

- [ ] **Step 5: Test laufen lassen und Erfolg bestätigen**

Run: `cd core && ./mvnw test -Dtest=CommunityServiceTest`
Expected: PASS. Der Rest der Suite ist an dieser Stelle noch rot — das ist erwartet und wird in den folgenden Steps behoben.

- [ ] **Step 6: Failing test für den Countdown**

In `core/src/test/kotlin/org/unividuell/countdown/core/countdown/CountdownServiceTest.kt` den `communities.update(...)`-Aufruf im Test `forSlug exposes current and next round when configured` auf die neue Signatur bringen und einen Test für den Durchlauf-Wechsel ergänzen:

```kotlin
    @Test
    fun `forSlug exposes current and next round when configured`() {
        val ownerId = aUser().id!!
        val c = communities.create(ownerId, "Has Start")
        communities.update(
            c, name = null, label = null, startsAt = Instant.parse("2099-01-01T10:00:00Z"),
            startsAtTimezone = "Europe/Berlin", phaseTwoStartRound = null,
            gamesFromRound = null, gamesUntilRound = null,
        )
        val res = countdown.forSlug(c.slug, ownerId, false)
        val round = res.round!!; val nextRound = res.nextRound!!
        (round.number > 0) shouldBe true
        nextRound.number shouldBe round.number - 1
        nextRound.start shouldBe round.end
    }

    @Test
    fun `forSlug follows the active edition when a new run starts`() {
        val ownerId = aUser().id!!
        val c = communities.create(ownerId, "Second Run")
        communities.update(
            c, name = null, label = null, startsAt = Instant.parse("2099-01-01T10:00:00Z"),
            startsAtTimezone = "Europe/Berlin", phaseTwoStartRound = null,
            gamesFromRound = null, gamesUntilRound = null,
        )

        editions.startNew(requireNotNull(c.id), "Run 2100")

        // The new run has no date yet, so there is no round — the old run's date is not consulted.
        val res = countdown.forSlug(c.slug, ownerId, false)
        res.startsAt.shouldBeNull()
        res.round.shouldBeNull()
    }
```

Konstruktor und Imports ergänzen:

```kotlin
class CountdownServiceTest(
    @Autowired val countdown: CountdownService,
    @Autowired val communities: CommunityService,
    @Autowired val editions: EditionService,
    @Autowired val users: UserRepository,
) {
```

```kotlin
import io.kotest.matchers.nulls.shouldBeNull
import org.unividuell.countdown.core.community.internal.EditionService
```

- [ ] **Step 7: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=CountdownServiceTest`
Expected: FAIL — `forSlug follows the active edition when a new run starts` liefert noch die Runde aus `communities.starts_at`.

- [ ] **Step 8: `CountdownService` auf den Durchlauf umstellen**

```kotlin
package org.unividuell.countdown.core.countdown.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
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
@Transactional(readOnly = true)
class CountdownService(
    private val communityQuery: CommunityQuery,
    private val membershipQuery: MembershipQuery,
    private val engine: CountdownEngine,
    private val clock: Clock,
) : CountdownQuery {

    override fun currentRound(communityId: UUID, now: Instant): Round? {
        val edition = communityQuery.activeEditionOf(communityId) ?: return null
        val startsAt = edition.startsAt ?: return null
        return engine.roundAt(now, startsAt, ZoneId.of(edition.startsAtTimezone))
    }

    /** Build the display payload for [slug], gated to active members (super-admin allowed). */
    fun forSlug(slug: String, userId: UUID, isSuperAdmin: Boolean): CountdownResponse {
        val c = communityQuery.findBySlug(slug) ?: throw CountdownAccessDeniedException()
        val communityId = requireNotNull(c.id)
        if (!isSuperAdmin && !membershipQuery.isActiveMember(communityId, userId)) {
            throw CountdownAccessDeniedException()
        }
        val now = clock.instant()
        // No active edition is an invariant violation elsewhere, but here it reads the same as
        // "no date yet": there is nothing to count down to, so the display says so.
        val edition = communityQuery.activeEditionOf(communityId)
            ?: return CountdownResponse(now, null, CommunityEdition.DEFAULT_TIMEZONE, null, null)
        val startsAt = edition.startsAt
            ?: return CountdownResponse(now, null, edition.startsAtTimezone, null, null)
        val zone = ZoneId.of(edition.startsAtTimezone)
        val current = engine.roundAt(now, startsAt, zone)
        val next = engine.intervalOf(current.number - 1, startsAt, zone) // later in time = number - 1
        return CountdownResponse(now, startsAt, edition.startsAtTimezone, current.toDto(), next.toDto())
    }
}
```

- [ ] **Step 9: Test laufen lassen und Erfolg bestätigen**

Run: `cd core && ./mvnw test -Dtest=CountdownServiceTest`
Expected: PASS, 5 Tests.

- [ ] **Step 10: DTOs und Response-Mapper umstellen**

In `CommunityDtos.kt`:

```kotlin
data class CommunityResponse(
    val id: UUID, val name: String, val slug: String,
    val startsAt: Instant?, val startsAtTimezone: String, val phaseTwoStartRound: Int?,
    val editionLabel: String, val gamesFromRound: Int?, val gamesUntilRound: Int,
    val viewerIsAdmin: Boolean, val pendingCount: Int,
)
```

```kotlin
data class UpdateCommunityRequest(
    val name: String?, val editionLabel: String?,
    val startsAt: Instant?, val startsAtTimezone: String?, val phaseTwoStartRound: Int?,
    val gamesFromRound: Int?, val gamesUntilRound: Int?,
)

data class StartEditionRequest(val label: String)
```

```kotlin
fun Community.toResponse(edition: CommunityEdition, viewerIsAdmin: Boolean, pendingCount: Int) =
    CommunityResponse(
        id = requireNotNull(id), name = name, slug = slug,
        startsAt = edition.startsAt,
        startsAtTimezone = edition.startsAtTimezone,
        phaseTwoStartRound = edition.phaseTwoStartRound,
        editionLabel = edition.label,
        gamesFromRound = edition.gamesFromRound,
        gamesUntilRound = edition.gamesUntilRound,
        viewerIsAdmin = viewerIsAdmin, pendingCount = pendingCount,
    )
```

Import ergänzen: `import org.unividuell.countdown.core.community.CommunityEdition`.

`StartEditionRequest` wird erst in Task 4 benutzt; es steht hier, weil alle Request-Typen dieses Moduls in dieser Datei liegen.

- [ ] **Step 11: Controller verdrahten**

In `CommunityController.kt` `EditionService` injizieren und die drei Handler anpassen:

```kotlin
class CommunityController(
    private val communityService: CommunityService,
    private val editions: EditionService,
    private val membershipQuery: MembershipQuery,
    private val access: CommunityAccess,
    private val selection: SelectionService,
    private val memberRepo: CommunityMemberRepository,
    private val users: UserQuery,
) {
```

```kotlin
    @PostMapping
    fun create(@AuthenticationPrincipal me: AuthenticatedUser, @RequestBody body: CreateCommunityRequest): ResponseEntity<CommunityResponse> {
        if (!users.mayCreateCommunities(me.id)) throw CommunityCreationNotAllowedException()
        val community = communityService.create(me.id, body.name)
        val edition = editions.requireActive(requireNotNull(community.id))
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(community.toResponse(edition, viewerIsAdmin = true, pendingCount = 0))
    }
```

```kotlin
    @GetMapping("/{slug}")
    fun get(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String): CommunityResponse {
        val c = access.requireActiveMember(me.id, me.isSuperAdmin, slug)
        val id = requireNotNull(c.id)
        val isAdmin = me.isSuperAdmin || membershipQuery.isAdmin(id, me.id)
        val pending = if (isAdmin) memberRepo.countByCommunityIdAndStatus(id, MemberStatus.PENDING).toInt() else 0
        return c.toResponse(editions.requireActive(id), viewerIsAdmin = isAdmin, pendingCount = pending)
    }

    @PatchMapping("/{slug}")
    fun update(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String, @RequestBody body: UpdateCommunityRequest): CommunityResponse {
        val c = access.requireAdmin(me.id, me.isSuperAdmin, slug)
        val id = requireNotNull(c.id)
        val updated = communityService.update(
            c, body.name, body.editionLabel, body.startsAt, body.startsAtTimezone,
            body.phaseTwoStartRound, body.gamesFromRound, body.gamesUntilRound,
        )
        val pending = memberRepo.countByCommunityIdAndStatus(id, MemberStatus.PENDING).toInt()
        return updated.community.toResponse(updated.edition, viewerIsAdmin = true, pendingCount = pending)
    }
```

- [ ] **Step 12: `SuperAdminOverviewService` gebatcht umstellen**

Ein `editions.requireActive(id)` innerhalb des `.map { }` wäre ein N+1 über alle Communities — persistence.md verbietet das ausdrücklich. Stattdessen einmal `findAllActive()` und indexieren.

Den Konstruktor erweitern, den KDoc-Satz von „Three queries“ auf „Four queries“ korrigieren, und `overview()` vollständig so:

```kotlin
@Service
class SuperAdminOverviewService(
    private val communities: CommunityRepository,
    private val members: CommunityMemberRepository,
    private val editions: CommunityEditionRepository,
    private val users: UserQuery,
) {
    @Transactional(readOnly = true)
    fun overview(): List<SuperAdminCommunityResponse> {
        val allMembers = members.findAll().toList()
        val byCommunity = allMembers.groupBy { it.communityId }
        val usersById = users.findAllById(allMembers.map { it.userId }.distinct()).associateBy { it.id }
        // One query for every community's active edition. A requireActive() inside the map below
        // would be an N+1 that grows with the number of communities — see persistence.md.
        val activeEditions = editions.findAllActive().associateBy { it.communityId }

        return communities.findAll()
            .sortedBy { it.name.lowercase() }
            .map { c ->
                // Local non-null id: byCommunity is keyed on UUID, and Community.id is UUID?.
                val id = requireNotNull(c.id)
                val edition = activeEditions[id]
                SuperAdminCommunityResponse(
                    id = id,
                    name = c.name,
                    slug = c.slug,
                    startsAt = edition?.startsAt,
                    startsAtTimezone = edition?.startsAtTimezone ?: CommunityEdition.DEFAULT_TIMEZONE,
                    createdAt = c.createdAt,
                    members = byCommunity[id].orEmpty()
                        .map { it.toResponse(usersById[it.userId]) }
                        .sortedWith(MEMBER_ORDER),
                )
            }
    }
```

Der Rest der Klasse (`CommunityMember.toResponse`, `MEMBER_ORDER`, `UNKNOWN`) bleibt unverändert. Import ergänzen: `import org.unividuell.countdown.core.community.CommunityEdition`.

Der bestehende `SuperAdminOverviewServiceTest` prüft Sortierung und Rosterinhalt und kommt ohne Durchlauf-Zeilen aus; er muss nur grün bleiben. Ein neuer Test ist hier nicht nötig — was `startsAtTimezone` liefert, deckt schon `SuperAdminControllerTest` über die gemockte Service-Antwort ab.

- [ ] **Step 13: Controller-Test nachziehen**

`CommunityControllerTest` ist ein **mockk-Test ohne DB**: jede Controller-Abhängigkeit ist ein `@MockkBean`. Der Controller hat mit Step 11 eine neue bekommen, also braucht der Test sie auch — sonst scheitert der Kontextaufbau der ganzen Klasse.

Bean ergänzen:

```kotlin
    @MockkBean lateinit var editions: EditionService
```

Und `GET by slug returns the startsAtTimezone` auf den Durchlauf umstellen — der Timezone-Wert kommt jetzt aus der Edition, nicht mehr aus der Community:

```kotlin
    @Test
    fun `GET by slug returns the timezone of the active edition`() {
        val c = community("team")
        every { access.requireActiveMember(uid, false, "team") } returns c
        every { query.isAdmin(c.id!!, uid) } returns false
        every { editions.requireActive(c.id!!) } returns CommunityEdition(
            id = UUID.randomUUID(), communityId = c.id!!, label = "Team 2026",
            // NOT the default: Community defaults to Europe/Berlin too, so asserting the default
            // would hold even if the controller read the timezone from the community. See testing.md.
            startsAtTimezone = "America/New_York",
        )
        mockMvc.get("/api/communities/team") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.startsAtTimezone") { value("America/New_York") }
            jsonPath("$.editionLabel") { value("Team 2026") }
            jsonPath("$.gamesUntilRound") { value(0) }
        }
    }
```

Jeder weitere Test derselben Datei, der `access.requireActiveMember` oder `requireAdmin` stubbt und danach eine `CommunityResponse` erwartet, braucht dasselbe `every { editions.requireActive(...) }` — mockk lässt einen ungestubbten Aufruf mit `io.mockk.MockKException: no answer found` scheitern, die Meldung nennt die Methode. Der Test `POST creates a community` braucht es ebenfalls, weil `create` die Edition nachlädt.

- [ ] **Step 14: Die ganze Suite laufen lassen**

Run: `cd core && ./mvnw test`
Expected: PASS. Bleibt etwas rot, ist es ein Aufrufer der alten `update`-Signatur oder von `toResponse` — beide Fehler sind Kompilierfehler mit exakter Fundstelle. `ModularityTests` muss grün sein: `community` hat keine neue Abhängigkeit bekommen, `countdown → community` bestand schon.

- [ ] **Step 15: Commit**

```bash
git add core/src/main core/src/test
git commit -m "refactor(community): make the active edition the source of truth for the schedule"
```

---

## Task 4: `POST /{slug}/editions` — neuen Durchlauf starten

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityControllerTest.kt`

**Interfaces:**
- Consumes: `EditionService.startNew`, `StartEditionRequest`, `Community.toResponse` (Task 2 und 3).
- Produces: `POST /api/communities/{slug}/editions` → `201` mit `CommunityResponse` des neuen Durchlaufs; `403` für Nicht-Admins, `404` für Nicht-Mitglieder, `400` bei einem Label unter 3 Zeichen.

- [ ] **Step 1: Failing test schreiben**

An `CommunityControllerTest.kt` anhängen — mockk-Stil wie der Rest der Datei, kein DB-Zugriff. `with(csrf())` ist bei jedem `POST` Pflicht, sonst antwortet Spring Security mit 403 und der Test misst das Falsche. Das inhaltliche Verhalten von `startNew` (Archivieren, Erben, `startsAt` leer) ist bereits in `EditionServiceTest` gedeckt; hier wird nur die HTTP-Schicht geprüft.

```kotlin
    @Test
    fun `POST editions returns the new run with the inherited setup`() {
        val c = community("rollover")
        every { access.requireAdmin(uid, false, "rollover") } returns c
        every { editions.startNew(c.id!!, "Rollover 2027") } returns CommunityEdition(
            id = UUID.randomUUID(), communityId = c.id!!, label = "Rollover 2027",
            startsAtTimezone = "America/New_York", phaseTwoStartRound = 20, gamesFromRound = 24,
        )
        every { memberRepo.countByCommunityIdAndStatus(c.id!!, MemberStatus.PENDING) } returns 0

        mockMvc.post("/api/communities/rollover/editions") {
            with(principalFor()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"label":"Rollover 2027"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.editionLabel") { value("Rollover 2027") }
            jsonPath("$.startsAtTimezone") { value("America/New_York") }
            jsonPath("$.phaseTwoStartRound") { value(20) }
            jsonPath("$.gamesFromRound") { value(24) }
        }
    }

    @Test
    fun `POST editions is forbidden for a non-admin member`() {
        every { access.requireAdmin(uid, false, "rollover") } throws NotAdminException()

        mockMvc.post("/api/communities/rollover/editions") {
            with(principalFor()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"label":"Nope 2027"}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `POST editions surfaces a too-short label as 400`() {
        val c = community("rollover")
        every { access.requireAdmin(uid, false, "rollover") } returns c
        every { editions.startNew(c.id!!, "ab") } throws IllegalArgumentException("label must be 3..50 chars")

        mockMvc.post("/api/communities/rollover/editions") {
            with(principalFor()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"label":"ab"}"""
        }.andExpect { status { isBadRequest() } }
    }
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=CommunityControllerTest`
Expected: FAIL mit `404` bzw. `405` — der Endpunkt existiert nicht.

- [ ] **Step 3: Endpunkt implementieren**

In `CommunityController.kt` ergänzen:

```kotlin
    /**
     * Start the next run: the current one is archived, the new one inherits its setup and starts
     * without a date. The membership stays where it belongs — on the community.
     */
    @PostMapping("/{slug}/editions")
    fun startEdition(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody body: StartEditionRequest,
    ): ResponseEntity<CommunityResponse> {
        val c = access.requireAdmin(me.id, me.isSuperAdmin, slug)
        val id = requireNotNull(c.id)
        val edition = editions.startNew(id, body.label)
        val pending = memberRepo.countByCommunityIdAndStatus(id, MemberStatus.PENDING).toInt()
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(c.toResponse(edition, viewerIsAdmin = true, pendingCount = pending))
    }
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

Run: `cd core && ./mvnw test -Dtest=CommunityControllerTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityController.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityControllerTest.kt
git commit -m "feat(community): let an admin start the next run"
```

---

## Task 5: Contract — die alten Spalten fallen

Erst jetzt, weil niemand mehr aus ihnen liest oder in sie schreibt. Die Task ist absichtlich klein: wäre sie es nicht, wäre Task 3 unvollständig.

**Files:**
- Create: `core/src/main/resources/db/migration/community/V4__drop_community_edition_columns.sql`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/Community.kt:16-18`

**Interfaces:**
- Consumes: alles aus Task 3.
- Produces: `Community(id, name, slug, inviteToken, inviteTokenExpiresAt, createdBy, createdAt, updatedAt)` — ohne `startsAt`, `startsAtTimezone`, `phaseTwoStartRound`.

- [ ] **Step 1: Vor dem Löschen den Backfill ein letztes Mal gegenprüfen**

Gegen die lokale Dev-DB, in der beide Seiten noch existieren:

```sql
SELECT count(*) AS mismatches
FROM community.communities c
JOIN community.editions e ON e.community_id = c.id AND e.archived_at IS NULL
WHERE (c.starts_at, c.starts_at_timezone, c.phase_two_start_round)
      IS DISTINCT FROM (e.starts_at, e.starts_at_timezone, e.phase_two_start_round);
```

Expected: `0`. Ist es nicht `0`, **hier abbrechen**: entweder hat der Backfill nicht gegriffen oder Task 3 hat einen Schreiber übersehen, der noch die alten Spalten füllt. Beides ist zu klären, bevor die Spalten weg sind. Achtung: Zeilen, die *nach* Task 3 über `PATCH` geändert wurden, haben absichtlich abweichende alte Spalten — für den Check am besten eine frische DB (`docker compose down -v`) und die Prüfung direkt nach der Migration.

- [ ] **Step 2: Migration schreiben**

`core/src/main/resources/db/migration/community/V4__drop_community_edition_columns.sql`:

```sql
-- The schedule now lives on community.editions (V3). Contract half of expand/contract:
-- everything reads and writes the edition, so these three columns are unreferenced.
ALTER TABLE community.communities
    DROP COLUMN starts_at,
    DROP COLUMN starts_at_timezone,
    DROP COLUMN phase_two_start_round;
```

- [ ] **Step 3: Die drei Felder aus der Entity entfernen**

`Community.kt` — nur diese drei Zeilen löschen, alles andere bleibt:

```kotlin
@Table(schema = "community", name = "communities")
data class Community(
    @Id
    val id: UUID? = null,
    val name: String,
    val slug: String,
    val inviteToken: String? = null,
    val inviteTokenExpiresAt: Instant? = null,
    val createdBy: UUID,
    @CreatedDate
    val createdAt: Instant? = null,
    @LastModifiedDate
    val updatedAt: Instant? = null,
)
```

- [ ] **Step 4: Die ganze Suite laufen lassen**

Run: `cd core && ./mvnw clean test`

`clean` ist hier nicht Aberglaube: `application-modules.json` im `target` beschreibt die erkannte Modulstruktur und steuert die Flyway-Strategie je Modul — ein stales File lässt neue Migrationen ausfallen (siehe modules-and-migrations.md).

Expected: PASS, alle Tests. Ein Kompilierfehler hier ist ein Leser, den Task 3 übersehen hat — die Fundstelle steht im Fehler.

- [ ] **Step 5: Frontend-Suite als Gegenprobe**

Run: `cd webapp-vue && pnpm test && pnpm typecheck`
Expected: PASS ohne jede Änderung. Genau das ist die Zusage dieses Plans: `CommunityResponse` hat nur Felder **dazu**bekommen, keins verloren, also merkt das Frontend nichts. Schlägt hier etwas fehl, ist ein Feld verschwunden, das doch benutzt wurde.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/resources/db/migration/community/V4__drop_community_edition_columns.sql \
        core/src/main/kotlin/org/unividuell/countdown/core/community/Community.kt
git commit -m "refactor(community): drop the schedule columns now that editions own them"
```

- [ ] **Step 7: Wissensrückfluss und PR**

Prüfen, was aus dieser Arbeit in `.claude/guidelines/` gehört. Kandidaten aus der Spec, jeweils gegen die Messlatte in [feeding-knowledge-back.md](../../../.claude/guidelines/feeding-knowledge-back.md) („beißt es woanders wieder? gibt es kein Guardrail? kostet Wiederfinden mehr als ein grep?“):

- **Der Durchlauf ist die Rundenkoordinate, nicht die Community** — trägt, weil jede künftige Tabelle mit Rundenbezug daran hängt. Gehört nach `modules-and-migrations.md` oder in ein neues `game-rounds.md` (das Plan 2 ohnehin anlegt).
- **Größere Rundennummer = früher; Grenzen heißen `from`/`until`** — hat mit `editions_window_ordered` bereits ein Guardrail in der DB; die Prosa dazu ist eine Zeile wert, mehr nicht.
- **Expand/contract in zwei Migrationen** samt „`clean` vor dem Trauen wegen `application-modules.json`“ — Letzteres steht schon in `modules-and-migrations.md`; nichts Neues.

Dann PR gegen `develop`:

```bash
git push -u origin HEAD
gh pr create --base develop --title "feat(community): editions as the round coordinate" --body "…"
```

---

## Self-Review

**Spec-Abdeckung** (Abschnitt *`community.editions`* und *Umsetzungsschnitt* 1):

| Spec-Anforderung | Task |
|---|---|
| Tabelle mit `label`, `starts_at`, `starts_at_timezone`, `phase_two_start_round`, `games_from_round`, `games_until_round`, `archived_at` | 1 |
| Partieller Unique-Index „genau ein aktiver Durchlauf“ | 1 (DDL + Test) |
| Migration: eine Edition je Community, `label` = Name, `from = NULL`, `until = 0` | 1 (Backfill) |
| Validierung `games_from_round >= games_until_round` | 1 (CHECK) + 2 (Service, 400) |
| `games_until_round` darf negativ sein | 2 (Test) |
| Drei Spalten fallen aus `communities` | 5 |
| `CommunityResponse` nach außen formgleich | 3 (Step 10) + 5 (Step 5 als Gegenprobe) |
| `CountdownService` liest den Durchlauf | 3 (Steps 6–9) |
| API-Aktion „neuen Durchlauf starten“ | 4 |
| `CommunityQuery`-Port für `game`/`countdown` | 3 (Step 3) |

**Korrektur an der Spec:** Deren Testliste nennt „die Migration legt für jede bestehende Community genau eine Edition mit den übernommenen Werten an“ als Test. Das ist **nicht** als Integrationstest machbar: Flyway läuft in der Testcontainers-DB vor jeder Zeile, der Backfill kopiert dort null Zeilen. Ersetzt durch die SQL-Gegenprobe gegen die lokale Dev-DB (Task 1 Step 7, Task 5 Step 1). Diese Korrektur gehört in die Spec, wenn Plan 1 durch ist.

**Abweichung von der Spec, absichtlich:** Die Spec beschreibt *eine* Migration `V3`. Der Plan nimmt **zwei** (`V3` anlegen + befüllen, `V4` löschen), weil sonst Entity und Schema in einem einzigen, nicht testbaren Sprung umziehen müssten. Operativ ist es identisch — beide Skripte liegen im selben PR und laufen im selben Boot.

**Platzhalter:** keine. Jeder Code-Step trägt den vollständigen Text; die einzige Stelle mit zwei Möglichkeiten (`jsonPath("$.startsAt")` — `doesNotExist()` vs. `value(null)`) ist als solche benannt, mit der Regel, welche gilt und wie der erste Testlauf es entscheidet.

**Typkonsistenz:** `activeEditionOf` (Task 3) heißt in `CountdownService`, `CommunityQueryService` und der `CommunityQuery`-Schnittstelle gleich. `requireActive` (Task 2) wird in Task 3 Step 11 und Task 4 Step 3 identisch aufgerufen. `CommunityEdition.DEFAULT_TIMEZONE` ist in Task 1 definiert und in Task 3 (Steps 8, 12) sowie Task 2 (Test) benutzt. `CommunityWithEdition` wird in Task 3 Step 4 definiert und in Step 11 destrukturiert. `StartEditionRequest` ist in Task 3 Step 10 definiert und in Task 4 benutzt — bewusst eine Task früher, weil alle Request-Typen des Moduls in `CommunityDtos.kt` liegen.
