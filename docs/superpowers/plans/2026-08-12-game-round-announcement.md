# Die Ansage (`game.round_games`) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Runde sagt ihr Spiel an — der erste Aufruf materialisiert Spieltyp, Params und Vergaberegel unverrückbar in `game.round_games`, jeder weitere liefert genau dieselbe Runde.

**Architecture:** Neues Modulith-Modul `game` mit eigenem Schema. Der Lesepfad ist ein `SELECT`; nur der erste Aufruf einer Runde schreibt, per `INSERT … ON CONFLICT DO NOTHING` plus `SELECT`, damit ein Rennen ohne Exception ausgeht. Die Auswahl des Spieltyps ist eine reine Funktion über die Historie des Durchlaufs, damit sie später wachsen kann, ohne die Materialisierung anzufassen. Gespielt wird noch nicht — diese Scheibe endet bei „welches Spiel, und was sieht der Spieler davon“.

**Tech Stack:** Kotlin 2.4 · Spring Boot 4.1 · Spring Data JDBC 4.1 · Spring Modulith 2.1 · PostgreSQL 18 · Flyway · Jackson 3 (`tools.jackson`) · JUnit 5 + kotest matchers + mockk + Testcontainers.

**Spec:** [`docs/superpowers/specs/2026-08-11-round-game-selection-design.md`](../specs/2026-08-11-round-game-selection-design.md) — Abschnitte *Modul-Schnitt*, *`game.round_games` — die Ansage*, *Auflösung: die Ansage materialisiert*, *Die Auswahl ist eine reine Funktion*, *Der Spiel-Vertrag*, *Phasen wandern in die Params*, sowie *Umsetzungsschnitt* Punkt 2.

**Baut auf Plan 1** ([`2026-08-11-community-editions.md`](2026-08-11-community-editions.md)), der bereits gemergt sein muss oder — wie hier — als ungemergeter Vorgänger-Branch unter diesem liegt: `community.editions`, `CommunityEdition`, `CommunityQuery.activeEditionOf`.

## Global Constraints

- **Modulgrenze:** exponierte Typen im Basis-Package `…core.game`, alles andere in `…core.game.internal`. Der `GameType`-Vertrag liegt **in `internal`**, weil ihn niemand außerhalb implementiert — eine veröffentlichte API ohne Konsumenten wäre ein falsches Signal.
- **Modulkanten dieser Scheibe:** `game → community`, `game → countdown`, `game → rng`, `game → guesshue`. **Nicht** `game → iam` (das kommt mit der Tippübersicht in Plan 3) und niemals zurück auf `game`. `ModularityTests.verify()` muss grün bleiben.
- **`game` benutzt nur exponierte APIs anderer Module:** `CommunityQuery`, `MembershipQuery`, `CommunityEdition`, `CountdownEngine`, `Round`, `SeededRandom`, `GuessHueDataset`, `GuessHueTarget`, `GuessHueTolerance`. Nie `community.internal` — `CountdownService` ist der Präzedenzfall.
- **Persistenz:** Spring Data JDBC, kein JPA. `id UUID PRIMARY KEY DEFAULT uuidv7()` in der DDL, `@Id val id: UUID? = null` in der Entity, IDs niemals im Code setzen. Kein `@Column`.
- **`community.id` / `edition.id` einmal auspacken** (`val id = requireNotNull(x.id)`), dann die `UUID` weitergeben.
- **Named Arguments ab zwei Argumenten** — siehe [kotlin.md](../../../.claude/guidelines/kotlin.md). Ausnahmen: ein Argument, Varargs, in Java deklarierte Funktionen, trailing Lambda, `infix`.
- **Migrationen** unter `core/src/main/resources/db/migration/game/`, vorwärts, eigene Versionsreihe ab `V1`. Bestehende Skripte nie ändern. Nach dem Anlegen eines **neuen Moduls** `./mvnw clean` — `application-modules.json` im `target` steuert die Flyway-Strategie je Modul und ist sonst stale.
- **Runden-Vorzeichen:** größere Rundennummer = **früher** in der Zeit. Fenster inklusiv: `games_until_round ≤ number ≤ games_from_round`. „Vorrunde“ ist `round_number > n`.
- **Der Hidden Seed wird nicht persistiert und nicht abgeleitet.** `SeededRandom.fromSeed(secureRandom.nextInt())` einmal bauen, ziehen, wegwerfen. Die `params`-Spalte ist die Autorität.
- **Die Lösung verlässt den Server in dieser Scheibe nicht.** `present(params)` liefert, was der Spieler zum Spielen braucht; alles andere bleibt drin. Pro Spiel pinnt ein Feldmengen-Test den serialisierten Payload.
- **Tests:** JUnit 5 als Runner + **kotest matchers** (`shouldBe`, `shouldThrow`, `shouldNotBeNull`, `shouldBeNull`, `shouldHaveSize`, `shouldContainExactly`) — nie `kotlin.test` oder JUnit-Assertions. Integrationstests mit `@Import(TestcontainersConfiguration::class) @SpringBootTest @Transactional`; Web-Tests mit MockMvc **Kotlin DSL**.
- **Sprache:** Code, Kommentare, Testnamen, Commit-Messages **englisch**. Dieser Plan ist deutsch. Deutsche Strings nutzen `„…“` — tiefes öffnendes, hohes schließendes Anführungszeichen, nie ein gerades `"` als Schließer.
- **Branch:** dieser Plan liegt auf `claude/game-round-announcement`, das auf dem ungemergeten `claude/community-round-game-selection-8fac97` aufbaut (stacked PR). PR-Basis ist der Vorgänger-Branch, **nicht** `develop`.

## `params` ist `JSONB`, und der Converter ist der dokumentierte Weg

Die Spec schreibt `params JSONB`, und dabei bleibt es. Der Weg dorthin ist in der
[Spring-Data-JDBC-Doku](https://docs.spring.io/spring-data/jdbc/docs/current-SNAPSHOT/reference/html/#jdbc.java-config)
festgelegt: eine Unterklasse von `AbstractJdbcConfiguration`, die **`userConverters()`** überschreibt.

Drei Dinge dazu nachgeprüft, weil jedes davon den Plan hätte kippen können:

1. **`jdbcCustomConversions()` nicht überschreiben.** Die Doku ist explizit: „This is no longer necessary
   or even recommended, since that method assembles conversions intended for all databases, conversions
   registered by the `Dialect` used and conversions registered by the user.“ Wer sie überschreibt,
   verliert die Dialekt-Conversions. `userConverters()` ist der Haken, der genau das vermeidet.
2. **Boot tritt zurück.** `DataJdbcRepositoriesAutoConfiguration$SpringBootJdbcConfiguration` erbt selbst
   von `AbstractJdbcConfiguration` und trägt `@ConditionalOnMissingBean(AbstractJdbcConfiguration)` — eine
   eigene Unterklasse ersetzt sie also, statt mit ihr zu kollidieren. (Zusätzlich trägt jede ihrer
   `@Bean`-Methoden dieselbe Bedingung; ein einzelner eigener `JdbcCustomConversions`-Bean wäre also
   auch möglich, ist aber genau der von der Doku verworfene Weg.)
3. **Was der Ersatz kostet, ist hier nichts.** Boots Unterklasse überschreibt `getInitialEntitySet()`
   (Entity-Scanning über die Auto-Configuration-Packages) und wertet `spring.data.jdbc.dialect` aus.
   `AbstractJdbcConfiguration.getInitialEntitySet()` scannt stattdessen `getMappingBasePackages()`, per
   Default das **Package der Config-Klasse** — liegt sie in `org.unividuell.countdown.core`, deckt sie
   denselben Baum ab. Und die Dialekt-Property setzt dieses Projekt nicht; der Dialekt wird aus der
   Connection erkannt (`jdbcDialect(NamedParameterJdbcOperations)`).

Das Feld heißt deshalb `params: JsonNode`, **nicht `String`**: ein `String ↔ PGobject`-Converter würde
für *jedes* String-Feld jeder Entity greifen. Der Converter muss an einem Typ hängen, den nur JSON-Spalten
benutzen.

Eine Unsicherheit bleibt und ist als eigener Schritt eingeplant (Task 1 Step 10): ob ein `JsonNode` auch
als **Parameter einer eigenen `@Query`** durch die Write-Conversion läuft. Falls nicht, bindet genau dieses
eine Statement den serialisierten `String` mit `CAST(:params AS jsonb)`; der Rest bleibt `JsonNode`. Das
ist die einzige Stelle, an der der Plan etwas offen lässt, und der Schritt sagt, wie man es entscheidet.

---

## File Structure

**Neu:**

| Datei | Verantwortung |
|---|---|
| `core/src/main/kotlin/…/core/JdbcConversionsConfiguration.kt` | `JsonNode ↔ PGobject`, damit `jsonb`-Spalten mappen — bewusst im Root-Package |
| `core/src/main/resources/db/migration/game/V1__create_round_games.sql` | Schema `game`, Tabelle, Unique-Index, Cross-Schema-FK |
| `core/src/main/kotlin/…/game/internal/RoundGame.kt` | die Entity + `PastRound` |
| `core/src/main/kotlin/…/game/internal/RoundGameRepository.kt` | Lookup, Historie, `INSERT … ON CONFLICT` |
| `core/src/main/kotlin/…/game/internal/RoundGameStore.kt` | Repository-Fassade über `CommunityEdition` |
| `core/src/main/kotlin/…/game/internal/Award.kt` | `Phase`, `AwardRule`, `Award`, `awardFor` — die Phasen-Arithmetik |
| `core/src/main/kotlin/…/game/internal/GameType.kt` | der Vertrag + `RoundContext`, `GamePayload` |
| `core/src/main/kotlin/…/game/internal/GameCatalog.kt` | sammelt die Beans, `GameTypeHandle` |
| `core/src/main/kotlin/…/game/internal/GameSelection.kt` | die Auswahlregel als reine Funktion |
| `core/src/main/kotlin/…/game/internal/GuessHueGameType.kt` | Adapter: `GuessHueParams`, `draw`, `present` |
| `core/src/main/kotlin/…/game/internal/AnnouncementService.kt` | die Auflösung |
| `core/src/main/kotlin/…/game/internal/RoundDtos.kt` | `RoundResponse`, `GameDto`, `NoGameReason` |
| `core/src/main/kotlin/…/game/internal/RoundController.kt` | `GET …/rounds/current` |
| `core/src/main/kotlin/…/game/internal/GameExceptions.kt` + `GameExceptionHandler.kt` | 404 für Nicht-Mitglieder |

**Tests:** `RoundGameRepositoryTest`, `AwardTest`, `GameSelectionTest`, `GameCatalogTest`, `GuessHueGameTypeTest`, `AnnouncementServiceTest`, `RoundControllerTest`.

---

## Task 1: Modul, Tabelle, Entity, Store

Nach dieser Task existiert das Modul `game` mit seiner Tabelle, und die Phasen-Arithmetik steht. Kein Endpunkt, kein Spiel.

**Warum die Phasen-Arithmetik hier mitkommt und nicht in Task 4:** der Cross-Schema-FK auf `community.editions` funktioniert nur, wenn Flyway `community` **vor** `game` migriert, und Modulith leitet diese Reihenfolge aus der **Code**-Abhängigkeit ab. Eine Entity mit `editionId: UUID` erzeugt keine. `RoundGameStore` und `Phase.of` nehmen `CommunityEdition` — damit existiert die Kante im selben Commit wie der FK, und beides ist echt gebraucht, keine Attrappe.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/JdbcConversionsConfiguration.kt`
- Create: `core/src/main/resources/db/migration/game/V1__create_round_games.sql`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGame.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameRepository.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameStore.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/Award.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundGameRepositoryTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/AwardTest.kt`

**Interfaces:**
- Consumes: `CommunityEdition` (Plan 1, exponiert), `CommunityRepository`/`CommunityEditionRepository` **nur in Tests** zum Anlegen von Fixtures, `TestcontainersConfiguration`, `Clock` (Bean in `CoreApplication`), `tools.jackson.databind.ObjectMapper` (Bean, Jackson 3).
- Produces:
  - `JdbcConversionsConfiguration` — `AbstractJdbcConfiguration`-Unterklasse mit `JsonNode ↔ PGobject`
  - `RoundGame(id: UUID? = null, editionId: UUID, roundNumber: Int, gameType: String, params: JsonNode, awardRule: AwardRule, awardPoints: Int, announcedAt: Instant)`
  - `PastRound(roundNumber: Int, gameType: String)`
  - `RoundGameRepository.findByEditionIdAndRoundNumber(editionId: UUID, roundNumber: Int): RoundGame?`, `.historyOf(editionId: UUID, after: Int): List<PastRound>`, `.insertIfAbsent(…): Int`
  - `RoundGameStore.find(edition: CommunityEdition, roundNumber: Int): RoundGame?`, `.history(edition: CommunityEdition, roundNumber: Int): List<PastRound>`, `.announce(edition: CommunityEdition, roundNumber: Int, gameType: String, params: JsonNode, award: Award, announcedAt: Instant): RoundGame`
  - `enum class Phase { ONE, TWO }` mit `Phase.of(roundNumber: Int, phaseTwoStartRound: Int?): Phase` und `Phase.of(edition: CommunityEdition, roundNumber: Int): Phase`
  - `enum class AwardRule { ALL_QUALIFYING, CLOSEST_ONLY }`
  - `data class Award(val rule: AwardRule, val points: Int)` mit `awardFor(roundNumber: Int, phaseTwoStartRound: Int?): Award`

- [ ] **Step 1: Migration schreiben**

`core/src/main/resources/db/migration/game/V1__create_round_games.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS game;

CREATE TABLE game.round_games (
    id            UUID         PRIMARY KEY DEFAULT uuidv7(),
    edition_id    UUID         NOT NULL REFERENCES community.editions(id) ON DELETE CASCADE,
    round_number  INT          NOT NULL,
    game_type     TEXT         NOT NULL,
    -- The frozen draw, opaque to the framework and CONTAINING THE SOLUTION. jsonb so the database
    -- rejects a malformed blob at the insert; mapped via a JsonNode converter, see
    -- JdbcConversionsConfiguration.
    params        JSONB        NOT NULL,
    -- Rule and stake are derived from the phase at announce time and frozen with the round, so
    -- moving phase_two_start_round later changes coming rounds and no past one.
    award_rule    TEXT         NOT NULL,
    award_points  INT          NOT NULL,
    announced_at  TIMESTAMPTZ  NOT NULL,
    UNIQUE (edition_id, round_number)
);

CREATE INDEX idx_round_games_edition ON game.round_games (edition_id);
```

- [ ] **Step 2: Failing test für Repository und Store schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/game/RoundGameRepositoryTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.game.internal.AwardRule
import org.unividuell.countdown.core.game.internal.RoundGameRepository
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.Award
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Instant

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class RoundGameRepositoryTest(
    @Autowired val rounds: RoundGameRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    private val announcedAt = Instant.parse("2026-08-12T10:00:00Z")

    private fun json(raw: String): JsonNode = mapper.readTree(raw)
    private fun anEdition(slug: String): CommunityEdition {
        val creator = users.save(User(githubId = System.nanoTime(), githubLogin = "creator"))
        val community = communities.save(
            Community(name = slug, slug = slug, createdBy = requireNotNull(creator.id)),
        )
        return editions.save(
            CommunityEdition(communityId = requireNotNull(community.id), label = "Run 2026"),
        )
    }

    @Test
    fun `announce writes the round and find reads it back`() {
        val edition = anEdition("rg-announce")

        val announced = store.announce(
            edition = edition,
            roundNumber = 12,
            gameType = "guess-hue",
            params = json("""{"description":"ein warmes Rot"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
            announcedAt = announcedAt,
        )

        announced.id.shouldNotBeNull().version() shouldBe 7
        announced.roundNumber shouldBe 12
        announced.awardRule shouldBe AwardRule.ALL_QUALIFYING
        announced.awardPoints shouldBe 1
        announced.params shouldBe json("""{"description":"ein warmes Rot"}""")

        val found = store.find(edition = edition, roundNumber = 12).shouldNotBeNull()
        found.gameType shouldBe "guess-hue"
        store.find(edition = edition, roundNumber = 11).shouldBeNull()
    }

    @Test
    fun `announce is idempotent - the second call returns the first round untouched`() {
        val edition = anEdition("rg-idempotent")
        val first = store.announce(
            edition = edition, roundNumber = 12, gameType = "guess-hue",
            params = json("""{"n":1}"""), award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
            announcedAt = announcedAt,
        )

        // A different draw for the same round must not win: ON CONFLICT DO NOTHING, then SELECT.
        val second = store.announce(
            edition = edition, roundNumber = 12, gameType = "other-game",
            params = json("""{"n":2}"""), award = Award(rule = AwardRule.CLOSEST_ONLY, points = 9),
            announcedAt = announcedAt,
        )

        second.id shouldBe first.id
        second.gameType shouldBe "guess-hue"
        second.params shouldBe json("""{"n":1}""")
        second.awardPoints shouldBe 1
        rounds.historyOf(editionId = requireNotNull(edition.id), after = Int.MIN_VALUE) shouldHaveSize 1
    }

    @Test
    fun `history is the rounds earlier in time, most recent first`() {
        val edition = anEdition("rg-history")
        val award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1)
        // Larger number = earlier in time. Round 8 is "now"; 9, 10, 12 came before it, 7 comes after.
        for (n in listOf(12, 10, 9, 8, 7)) {
            store.announce(
                edition = edition, roundNumber = n, gameType = "game-$n",
                params = json("""{"n":$n}"""), award = award, announcedAt = announcedAt,
            )
        }

        val history = store.history(edition = edition, roundNumber = 8)

        // Ascending round_number = most recently played first: 9 is the round before 8.
        history.map { it.roundNumber } shouldContainExactly listOf(9, 10, 12)
        history.first().gameType shouldBe "game-9"
    }

    @Test
    fun `history skips a gap rather than stopping at it`() {
        val edition = anEdition("rg-gap")
        val award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1)
        store.announce(
            edition = edition, roundNumber = 20, gameType = "long-ago",
            params = json("""{}"""), award = award, announcedAt = announcedAt,
        )

        // Nobody opened rounds 19..9, so they do not exist. Round 20 is still the previous round.
        val history = store.history(edition = edition, roundNumber = 8)

        history.map { it.roundNumber } shouldContainExactly listOf(20)
    }

    @Test
    fun `two editions of the same community keep their own rounds`() {
        val first = anEdition("rg-two-editions")
        val second = editions.save(
            CommunityEdition(communityId = first.communityId, label = "Run 2027")
                .let { it.copy() },
        ).let { it }
        val award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1)
        store.announce(
            edition = first, roundNumber = 5, gameType = "first-run",
            params = json("""{}"""), award = award, announcedAt = announcedAt,
        )
        store.announce(
            edition = second, roundNumber = 5, gameType = "second-run",
            params = json("""{}"""), award = award, announcedAt = announcedAt,
        )

        store.find(edition = first, roundNumber = 5).shouldNotBeNull().gameType shouldBe "first-run"
        store.find(edition = second, roundNumber = 5).shouldNotBeNull().gameType shouldBe "second-run"
    }
}
```

> Zum Test `two editions of the same community keep their own rounds`: der partielle Unique-Index aus Plan 1 erlaubt nur **einen aktiven** Durchlauf je Community. Zwei gleichzeitig aktive gehen also nicht — der zweite muss beim Anlegen sofort archiviert werden. Ersetze die `second`-Zeile durch:
> ```kotlin
> val second = editions.save(
>     CommunityEdition(
>         communityId = first.communityId,
>         label = "Run 2027",
>         archivedAt = Instant.parse("2027-01-01T00:00:00Z"),
>     ),
> )
> ```
> und importiere `java.time.Instant`. Der Test prüft die Schlüssel-Trennung, nicht den Lebenszyklus.

- [ ] **Step 3: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=RoundGameRepositoryTest`
Expected: Kompilierfehler — `RoundGame`, `RoundGameRepository`, `RoundGameStore`, `Award`, `AwardRule` existieren nicht.

- [ ] **Step 4: Converter, Entity und `PastRound` schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/JdbcConversionsConfiguration.kt` — **im Root-Package**,
nicht in einem Modul: es ist Infrastruktur für alle Module, und `getMappingBasePackages()` (Default: das
Package dieser Klasse) muss den ganzen Entity-Baum abdecken, weil diese Unterklasse Boots
`SpringBootJdbcConfiguration` samt deren Entity-Scanning ersetzt.

```kotlin
package org.unividuell.countdown.core

import org.postgresql.util.PGobject
import org.springframework.context.annotation.Configuration
import org.springframework.core.convert.converter.Converter
import org.springframework.data.convert.ReadingConverter
import org.springframework.data.convert.WritingConverter
import org.springframework.data.jdbc.repository.config.AbstractJdbcConfiguration
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper

/**
 * Makes `jsonb` columns map to [JsonNode].
 *
 * `userConverters()` is the hook the Spring Data JDBC reference names, and deliberately not
 * `jdbcCustomConversions()`: that method assembles the store's own conversions plus the ones the
 * `Dialect` registers, and overriding it drops them.
 *
 * Spring Boot's `SpringBootJdbcConfiguration` extends the same base class and carries
 * `@ConditionalOnMissingBean(AbstractJdbcConfiguration)`, so this class replaces it rather than
 * colliding with it. Two things Boot's version added are therefore ours to cover: entity scanning
 * (handled by living in the root package — `getMappingBasePackages()` defaults to this package) and
 * the `spring.data.jdbc.dialect` property, which this project does not set; the dialect is detected
 * from the connection.
 */
@Configuration
class JdbcConversionsConfiguration(private val mapper: ObjectMapper) : AbstractJdbcConfiguration() {

    override fun userConverters(): List<*> = listOf(
        JsonNodeToPGobjectConverter(),
        PGobjectToJsonNodeConverter(mapper = mapper),
    )
}

/** `jsonb` is a typed parameter for Postgres — a plain String would arrive as `varchar` and be rejected. */
@WritingConverter
class JsonNodeToPGobjectConverter : Converter<JsonNode, PGobject> {
    override fun convert(source: JsonNode): PGobject = PGobject().apply {
        type = "jsonb"
        value = source.toString()
    }
}

@ReadingConverter
class PGobjectToJsonNodeConverter(private val mapper: ObjectMapper) : Converter<PGobject, JsonNode> {
    override fun convert(source: PGobject): JsonNode = mapper.readTree(source.value ?: "null")
}
```

Dann die Entity:

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGame.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

/**
 * A round's announcement, frozen. Once this row exists, the round's game, its content and its stake
 * never change again — that is the whole point of writing it down rather than deriving it: the
 * catalogue is code, and a newly deployed game type must not rewrite a round somebody already played.
 *
 * [params] is the game's own opaque blob and **contains the solution**. It leaves the server only
 * through `GameType.present` (and, from Plan 3 on, `solution`), never as a field. Held as a
 * [JsonNode] rather than a `String` so the `JsonNode ↔ PGobject` converter has a type of its own to
 * hang on — a `String` converter would apply to every text column in every entity.
 *
 * No `@CreatedDate` on [announcedAt]: the insert is custom SQL (see
 * [RoundGameRepository.insertIfAbsent]) and Spring Data auditing only runs for `save()`. The caller
 * stamps it from the `Clock` bean.
 */
@Table(schema = "game", name = "round_games")
data class RoundGame(
    @Id
    val id: UUID? = null,
    val editionId: UUID,
    val roundNumber: Int,
    val gameType: String,
    val params: JsonNode,
    val awardRule: AwardRule,
    val awardPoints: Int,
    val announcedAt: Instant,
)

/** A round that already happened, as much of it as the selection rule is allowed to see. */
data class PastRound(val roundNumber: Int, val gameType: String)
```

- [ ] **Step 5: Repository schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameRepository.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

interface RoundGameRepository : CrudRepository<RoundGame, UUID> {

    fun findByEditionIdAndRoundNumber(editionId: UUID, roundNumber: Int): RoundGame?

    /**
     * The rounds of this edition that lie **earlier in time** than [after] — a larger round number is
     * earlier, so that is `round_number > :after`, ascending, which puts the most recently played
     * round first.
     *
     * Returns the whole history rather than just the previous round: the selection rule is meant to
     * grow ("not within the last three", even distribution), and giving it everything means the next
     * rule is a change to a pure function instead of to this query. Bounded by the rounds of one
     * edition — some dozens of two-column rows.
     */
    @Query(
        """
        SELECT round_number, game_type FROM game.round_games
        WHERE edition_id = :editionId AND round_number > :after
        ORDER BY round_number ASC
        """,
    )
    fun historyOf(editionId: UUID, after: Int): List<PastRound>

    /**
     * First writer wins, and the loser gets no exception.
     *
     * `ON CONFLICT DO NOTHING` rather than catching `DuplicateKeyException`: a constraint violation
     * marks the transaction rollback-only in Postgres, so the re-read that follows would fail inside
     * the same transaction. One statement without an error state avoids the whole subject.
     *
     * Returns the number of rows inserted — 0 means somebody else announced this round first.
     */
    @Modifying
    @Query(
        """
        INSERT INTO game.round_games
            (edition_id, round_number, game_type, params, award_rule, award_points, announced_at)
        VALUES (:editionId, :roundNumber, :gameType, :params, :awardRule, :awardPoints, :announcedAt)
        ON CONFLICT (edition_id, round_number) DO NOTHING
        """,
    )
    fun insertIfAbsent(
        editionId: UUID,
        roundNumber: Int,
        gameType: String,
        params: JsonNode,
        awardRule: String,
        awardPoints: Int,
        announcedAt: Instant,
    ): Int
}
```

- [ ] **Step 6: Store schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameStore.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
import tools.jackson.databind.JsonNode
import java.time.Instant

/**
 * The table, expressed in the terms the rest of the module thinks in: a run and a round number.
 *
 * It exists as its own unit so [AnnouncementService] never handles an edition id, and so the
 * "insert then read back" pair stays in one place rather than being repeated by every caller.
 */
@Component
class RoundGameStore(private val rounds: RoundGameRepository) {

    @Transactional(readOnly = true)
    fun find(edition: CommunityEdition, roundNumber: Int): RoundGame? =
        rounds.findByEditionIdAndRoundNumber(
            editionId = requireNotNull(edition.id),
            roundNumber = roundNumber,
        )

    /** The rounds of [edition] earlier in time than [roundNumber], most recently played first. */
    @Transactional(readOnly = true)
    fun history(edition: CommunityEdition, roundNumber: Int): List<PastRound> =
        rounds.historyOf(editionId = requireNotNull(edition.id), after = roundNumber)

    /**
     * Announce [roundNumber] — or, if somebody else got there first, return their announcement.
     * Either way the returned row is what every later reader will see.
     */
    @Transactional
    fun announce(
        edition: CommunityEdition,
        roundNumber: Int,
        gameType: String,
        params: JsonNode,
        award: Award,
        announcedAt: Instant,
    ): RoundGame {
        val editionId = requireNotNull(edition.id)
        rounds.insertIfAbsent(
            editionId = editionId,
            roundNumber = roundNumber,
            gameType = gameType,
            params = params,
            awardRule = award.rule.name,
            awardPoints = award.points,
            announcedAt = announcedAt,
        )
        return requireNotNull(
            rounds.findByEditionIdAndRoundNumber(editionId = editionId, roundNumber = roundNumber),
        ) { "round $roundNumber of edition $editionId vanished right after it was announced" }
    }
}
```

> `announcedAt` ist **Pflichtparameter ohne Default**, und das ist Absicht: ein `Instant.now()` als
> Default würde den `Clock`-Bean umgehen, den dieses Projekt überall injiziert, und Tests unbestimmt
> machen. `AnnouncementService` (Task 4) gibt die Zeit aus dem `Clock` mit, die Tests einen festen
> Instant.

- [ ] **Step 7: Failing test für die Phasen-Arithmetik schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/game/AwardTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.game.internal.AwardRule
import org.unividuell.countdown.core.game.internal.Phase
import org.unividuell.countdown.core.game.internal.awardFor
import java.util.UUID

class AwardTest {

    @Test
    fun `without a phase-two threshold every round is phase one and worth one point`() {
        for (round in listOf(30, 5, 0, -3)) {
            Phase.of(roundNumber = round, phaseTwoStartRound = null) shouldBe Phase.ONE
            val award = awardFor(roundNumber = round, phaseTwoStartRound = null)
            award.rule shouldBe AwardRule.ALL_QUALIFYING
            award.points shouldBe 1
        }
    }

    @Test
    fun `phase two starts at the threshold and stays, because later in time is a smaller number`() {
        Phase.of(roundNumber = 21, phaseTwoStartRound = 20) shouldBe Phase.ONE
        Phase.of(roundNumber = 20, phaseTwoStartRound = 20) shouldBe Phase.TWO
        Phase.of(roundNumber = 0, phaseTwoStartRound = 20) shouldBe Phase.TWO
        Phase.of(roundNumber = -1, phaseTwoStartRound = 20) shouldBe Phase.TWO
    }

    @Test
    fun `the stake grows by one per round from the threshold on`() {
        // The value table from huettehuette's `pointsOfRound`, threshold 20:
        // round   21, 20, 19, 18, …,  1,  0, -1
        // points   1,  2,  3,  4, …, 21, 22, 23
        val expected = mapOf(21 to 1, 20 to 2, 19 to 3, 18 to 4, 5 to 17, 1 to 21, 0 to 22, -1 to 23)
        for ((round, points) in expected) {
            awardFor(roundNumber = round, phaseTwoStartRound = 20).points shouldBe points
        }
    }

    @Test
    fun `phase two is winner takes it all`() {
        awardFor(roundNumber = 20, phaseTwoStartRound = 20).rule shouldBe AwardRule.CLOSEST_ONLY
        awardFor(roundNumber = 21, phaseTwoStartRound = 20).rule shouldBe AwardRule.ALL_QUALIFYING
    }

    @Test
    fun `phase and award turn over at the same round`() {
        // One predicate behind both, so a raised tolerance can never disagree with a raised stake.
        for (round in 25 downTo -5) {
            val phase = Phase.of(roundNumber = round, phaseTwoStartRound = 20)
            val rule = awardFor(roundNumber = round, phaseTwoStartRound = 20).rule
            when (phase) {
                Phase.ONE -> rule shouldBe AwardRule.ALL_QUALIFYING
                Phase.TWO -> rule shouldBe AwardRule.CLOSEST_ONLY
            }
        }
    }

    @Test
    fun `the edition overload reads the threshold off the run`() {
        val edition = CommunityEdition(
            communityId = UUID.randomUUID(), label = "Run 2026", phaseTwoStartRound = 20,
        )

        Phase.of(edition = edition, roundNumber = 20) shouldBe Phase.TWO
        Phase.of(edition = edition, roundNumber = 21) shouldBe Phase.ONE
    }
}
```

- [ ] **Step 8: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=AwardTest`
Expected: Kompilierfehler — `Phase`, `AwardRule`, `awardFor` existieren nicht.

- [ ] **Step 9: Die Phasen-Arithmetik schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/Award.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.community.CommunityEdition

enum class Phase { ONE, TWO;

    companion object {
        /** Later in time means a smaller round number, so phase two is `roundNumber <= threshold`. */
        fun of(roundNumber: Int, phaseTwoStartRound: Int?): Phase =
            if (phaseTwoStartRound != null && roundNumber <= phaseTwoStartRound) TWO else ONE

        fun of(edition: CommunityEdition, roundNumber: Int): Phase =
            of(roundNumber = roundNumber, phaseTwoStartRound = edition.phaseTwoStartRound)
    }
}

enum class AwardRule {
    /** Every qualifying guess scores. */
    ALL_QUALIFYING,

    /** In the original „winner takes it all“ — `winnerTakesItAll` / `winnerTakesItAllCleaner`. */
    CLOSEST_ONLY,
}

data class Award(val rule: AwardRule, val points: Int)

/**
 * Rule *and* stake from one function, so a raised tolerance and a raised stake cannot drift apart.
 * The result is frozen onto the round, which is what lets the numbers change later without costing
 * history.
 */
fun awardFor(roundNumber: Int, phaseTwoStartRound: Int?): Award =
    when (Phase.of(roundNumber = roundNumber, phaseTwoStartRound = phaseTwoStartRound)) {
        Phase.ONE -> Award(rule = AwardRule.ALL_QUALIFYING, points = 1)
        // „Schlag den Raab“: from the threshold on the stake grows by one per round.
        // Over Gauß summable — what is still up for grabs from here on.
        Phase.TWO -> Award(
            rule = AwardRule.CLOSEST_ONLY,
            points = requireNotNull(phaseTwoStartRound) - roundNumber + 2,
        )
    }
```

- [ ] **Step 10: Beide Tests laufen lassen — und die eine offene Frage entscheiden**

Run: `cd core && ./mvnw clean test -Dtest='AwardTest+RoundGameRepositoryTest'`
Expected: PASS. **`clean` ist hier Pflicht**, nicht Vorsicht: `game` ist ein neues Modulith-Modul, und die stale `application-modules.json` im `target` würde dazu führen, dass `db/migration/game/` gar nicht gescannt wird — der Test scheitert dann mit „relation game.round_games does not exist“ und nicht mit einem Hinweis auf die Ursache.

**Die offene Frage:** ob ein `JsonNode` auch als Parameter einer eigenen `@Query` durch die
Write-Conversion läuft. Das Lesen tut es sicher (der Converter greift beim Mapping der Ergebniszeile),
beim Binden eines Query-Parameters ist es nicht garantiert. Der Test `announce writes the round and find
reads it back` entscheidet es:

- **Läuft er grün:** nichts zu tun, der Converter greift in beide Richtungen.
- **Scheitert er** mit `column "params" is of type jsonb but expression is of type character varying`
  oder einem Konvertierungsfehler auf dem Parameter: ändere **nur** `insertIfAbsent` auf einen
  `String`-Parameter und caste im SQL — `VALUES (…, CAST(:params AS jsonb), …)` — und serialisiere im
  Store mit `params.toString()`. Entity, Lesepfad und alle anderen Signaturen bleiben `JsonNode`.

Halte im Commit fest, welcher der beiden Fälle eingetreten ist. Das ist die Information, die beim
nächsten `jsonb`-Feld Zeit spart.

- [ ] **Step 11: Modulith-Kante prüfen**

Run: `cd core && ./mvnw test -Dtest=ModularityTests`
Expected: PASS. `game → community` besteht jetzt über `CommunityEdition` in `RoundGameStore` und `Phase`. Scheitert `verify()` mit einem Zyklus, ist versehentlich eine Abhängigkeit von `community` auf `game` entstanden — die darf es nicht geben.

- [ ] **Step 12: Commit**

```bash
git add core/src/main/resources/db/migration/game \
        core/src/main/kotlin/org/unividuell/countdown/core/game \
        core/src/test/kotlin/org/unividuell/countdown/core/game
git commit -m "feat(game): add the game module with the round_games table and the phase arithmetic"
```

---

## Task 2: Der Spiel-Vertrag, der Katalog, die Auswahl

Reine Ergänzung: der Vertrag steht und die Auswahlregel ist getestet, aber noch implementiert kein Spiel den Vertrag und niemand ruft die Auswahl.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameType.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameCatalog.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameSelection.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GameSelectionTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GameCatalogTest.kt`

**Interfaces:**
- Consumes: `PastRound` (Task 1), `Phase` (Task 1), `SeededRandom` (Modul `rng`, exponiert).
- Produces:
  - `interface GamePayload` — Marker; was der Spieler sieht
  - `data class RoundContext(val roundNumber: Int, val phase: Phase)`
  - `interface GameType<P : Any>` mit `id: String`, `displayName: String`, `paramsType: Class<P>`, `draw(random: SeededRandom, context: RoundContext): P`, `present(params: P): GamePayload`
  - `class GameTypeHandle<P : Any>` mit `id`, `displayName`, `draw(random, context): JsonNode`, `present(params: JsonNode): GamePayload`
  - `GameCatalog.ids(): List<String>` (sortiert), `GameCatalog.handle(id: String): GameTypeHandle<*>?`
  - `fun interface GameSelection { fun pick(candidates: List<String>, history: List<PastRound>, random: SeededRandom): String? }` und die Implementierung `DifferentFromPreviousRound`

- [ ] **Step 1: Failing test für die Auswahl schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/game/GameSelectionTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.DifferentFromPreviousRound
import org.unividuell.countdown.core.game.internal.PastRound
import org.unividuell.countdown.core.rng.SeededRandom

class GameSelectionTest {

    private val selection = DifferentFromPreviousRound()

    private fun random() = SeededRandom.fromSeed(4711)

    @Test
    fun `with an empty history it picks any candidate`() {
        val picked = selection.pick(
            candidates = listOf("alpha", "beta"), history = emptyList(), random = random(),
        )

        listOf("alpha", "beta") shouldContain picked
    }

    @Test
    fun `it does not pick the type of the round before`() {
        // history is most-recently-played first, so "alpha" is the previous round.
        val history = listOf(
            PastRound(roundNumber = 9, gameType = "alpha"),
            PastRound(roundNumber = 10, gameType = "beta"),
        )

        repeat(20) {
            selection.pick(
                candidates = listOf("alpha", "beta"),
                history = history,
                random = SeededRandom.fromSeed(it),
            ) shouldBe "beta"
        }
    }

    @Test
    fun `the rule is a preference - with one type it repeats rather than cancelling the game`() {
        val history = listOf(PastRound(roundNumber = 9, gameType = "alpha"))

        selection.pick(
            candidates = listOf("alpha"), history = history, random = random(),
        ) shouldBe "alpha"
    }

    @Test
    fun `no candidates means no game`() {
        selection.pick(candidates = emptyList(), history = emptyList(), random = random())
            .shouldBeNull()
    }

    @Test
    fun `only the round immediately before counts, not the whole history`() {
        // "beta" was two rounds ago and is fair game again; only "alpha" is excluded.
        val history = listOf(
            PastRound(roundNumber = 9, gameType = "alpha"),
            PastRound(roundNumber = 10, gameType = "beta"),
        )

        val picked = selection.pick(
            candidates = listOf("alpha", "beta"), history = history, random = random(),
        )

        picked shouldBe "beta"
        picked shouldNotBe "alpha"
    }

    @Test
    fun `the same random stream yields the same choice`() {
        val candidates = listOf("alpha", "beta", "gamma")

        val first = selection.pick(candidates = candidates, history = emptyList(), random = SeededRandom.fromSeed(99))
        val second = selection.pick(candidates = candidates, history = emptyList(), random = SeededRandom.fromSeed(99))

        first shouldBe second
    }

    @Test
    fun `it draws over all candidates, not just the first`() {
        // A rule that always returned candidates.first() would pass every test above. This one
        // fails unless the choice actually varies with the random stream.
        val candidates = listOf("alpha", "beta", "gamma")

        val seen = (0 until 50).mapNotNull {
            selection.pick(candidates = candidates, history = emptyList(), random = SeededRandom.fromSeed(it))
        }.toSet()

        seen shouldBe candidates.toSet()
    }
}
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=GameSelectionTest`
Expected: Kompilierfehler — `DifferentFromPreviousRound` existiert nicht.

- [ ] **Step 3: Vertrag und Auswahl schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameType.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.rng.SeededRandom

/**
 * What a game shows the player. It carries what is needed to play and **never the solution** — pinned
 * by a serialisation test per game that asserts the exact field set, so a new field cannot slip in
 * unnoticed. A marker interface rather than `Any` so that test has something to hang on.
 */
interface GamePayload

/** What a game may know about the round it is drawing for. */
data class RoundContext(val roundNumber: Int, val phase: Phase)

/**
 * A game the framework can announce.
 *
 * Deliberately in `internal`: the adapters live in this module, so nobody outside implements this,
 * and a published API without consumers would be a false signal. If the direction ever flips to the
 * plugin shape — game modules implementing it themselves — the contract moves to the base package.
 *
 * A game is a **pure function of its params**, not of a seed: [draw] runs once, at announce time, and
 * everything afterwards reads the frozen result. That is what makes a round unchangeable when the
 * content behind it changes.
 */
interface GameType<P : Any> {
    /** URL segment and column value, e.g. `guess-hue`. Unique across the catalogue. */
    val id: String

    /** German display name, e.g. „Farbausmalung“. */
    val displayName: String

    /** For deserialising [params] back out of the round's `params` column. */
    val paramsType: Class<P>

    fun draw(random: SeededRandom, context: RoundContext): P

    /** What the player sees — never the solution, not even something it can be derived from. */
    fun present(params: P): GamePayload
}
```

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameSelection.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.rng.SeededRandom

/**
 * Which game a round gets.
 *
 * A pure function over the candidates and the run's history, and it receives the **whole** history
 * rather than just the previous round on purpose: "not within the last three", even distribution and
 * weighting all live in that list already, so the next rule is a change here and nowhere else. Had
 * the resolution passed only the previous type, every one of those would have meant changing the
 * query, the service and their tests.
 *
 * `null` means no type is available. Filtering [candidates] — a game whose content a community has
 * not provided yet — happens **before** the call and does not touch the rule either.
 */
fun interface GameSelection {
    /** [history] is most-recently-played first. */
    fun pick(candidates: List<String>, history: List<PastRound>, random: SeededRandom): String?
}

/**
 * The first and simplest rule: not the same game twice in a row.
 *
 * It is a **preference, not an exclusion criterion** — if honouring it would leave nothing, the rule
 * drops rather than the round losing its game. Today exactly one type exists, so the rule never
 * fires against the real catalogue; that is why its test uses a fake one.
 */
@Component
class DifferentFromPreviousRound : GameSelection {
    override fun pick(candidates: List<String>, history: List<PastRound>, random: SeededRandom): String? {
        if (candidates.isEmpty()) return null
        val previous = history.firstOrNull()?.gameType
        val preferred = candidates.filterNot { it == previous }
        return random.pick(preferred.ifEmpty { candidates })
    }
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

Run: `cd core && ./mvnw test -Dtest=GameSelectionTest`
Expected: PASS, 7 Tests.

- [ ] **Step 5: Failing test für den Katalog schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/game/GameCatalogTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.GameCatalog
import org.unividuell.countdown.core.game.internal.GamePayload
import org.unividuell.countdown.core.game.internal.GameType
import org.unividuell.countdown.core.game.internal.Phase
import org.unividuell.countdown.core.game.internal.RoundContext
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.json.JsonMapper

class GameCatalogTest {

    data class FakeParams(val label: String, val secret: Int)
    data class FakePayload(val label: String) : GamePayload

    private class FakeGame(override val id: String) : GameType<FakeParams> {
        override val displayName = "Fake $id"
        override val paramsType = FakeParams::class.java
        override fun draw(random: SeededRandom, context: RoundContext) =
            FakeParams(label = "$id-${context.roundNumber}", secret = random.nextInt(1000))
        override fun present(params: FakeParams) = FakePayload(label = params.label)
    }

    private val mapper = JsonMapper.builder().build()

    private fun catalog(vararg games: GameType<*>) = GameCatalog(games = games.toList(), mapper = mapper)

    @Test
    fun `ids are sorted, so a draw from the same seed is reproducible regardless of bean order`() {
        val sorted = catalog(FakeGame("zulu"), FakeGame("alpha")).ids()

        sorted shouldContainExactly listOf("alpha", "zulu")
    }

    @Test
    fun `a duplicate id fails the boot rather than shadowing a game`() {
        val e = shouldThrow<IllegalArgumentException> { catalog(FakeGame("same"), FakeGame("same")) }

        e.message.shouldNotBeNull() shouldContain "same"
    }

    @Test
    fun `an unknown id has no handle`() {
        catalog(FakeGame("alpha")).handle("nope").shouldBeNull()
    }

    @Test
    fun `the handle round-trips params through json without the caller knowing the type`() {
        val handle = catalog(FakeGame("alpha")).handle("alpha").shouldNotBeNull()

        val json = handle.draw(
            random = SeededRandom.fromSeed(7),
            context = RoundContext(roundNumber = 12, phase = Phase.ONE),
        )
        val payload = handle.present(json)

        json.toString() shouldContain "alpha-12"
        payload shouldBe FakePayload(label = "alpha-12")
    }

    @Test
    fun `the handle exposes id and display name for the announcement`() {
        val handle = catalog(FakeGame("alpha")).handle("alpha").shouldNotBeNull()

        handle.id shouldBe "alpha"
        handle.displayName shouldBe "Fake alpha"
    }
}
```

- [ ] **Step 6: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=GameCatalogTest`
Expected: Kompilierfehler — `GameCatalog` existiert nicht.

- [ ] **Step 7: Katalog und Handle schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameCatalog.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper

/**
 * One game, with its generic parameter captured, so the rest of the module can hold
 * `GameTypeHandle<*>` and still call through without a cast.
 *
 * This is the only place the `P` of a [GameType] and the `String` in the `params` column meet. It is
 * a class rather than a few helper functions precisely so that meeting has exactly one location — no
 * `UNCHECKED_CAST` anywhere else, because there is no cast at all: `P` is bound at construction.
 */
class GameTypeHandle<P : Any>(
    private val type: GameType<P>,
    private val mapper: ObjectMapper,
) {
    val id: String get() = type.id
    val displayName: String get() = type.displayName

    /** Draw a round and turn it into the tree the `params` column stores. */
    fun draw(random: SeededRandom, context: RoundContext): JsonNode =
        mapper.valueToTree(type.draw(random = random, context = context))

    /** What the player sees, from a stored `params` blob. */
    fun present(params: JsonNode): GamePayload =
        type.present(mapper.treeToValue(params, type.paramsType))
}

/**
 * Every game the framework can announce. Bean presence *is* the release: `guesshue` fails the boot
 * under `production`/`staging` when its dataset is missing anyway (see game-content.md), so a game
 * that cannot run does not reach this list.
 */
@Component
class GameCatalog(games: List<GameType<*>>, mapper: ObjectMapper) {

    private val handles: Map<String, GameTypeHandle<*>> =
        games.associate { it.id to handleFor(type = it, mapper = mapper) }

    init {
        require(handles.size == games.size) {
            "duplicate game type id among ${games.map { it.id }}"
        }
    }

    /**
     * Sorted, and that is load-bearing rather than tidiness: the selection draws from this list, so
     * bean order — which Spring does not promise — must not decide which game a round gets.
     */
    fun ids(): List<String> = handles.keys.sorted()

    fun handle(id: String): GameTypeHandle<*>? = handles[id]

    private companion object {
        /** Captures `P` at construction; without this indirection the map would need a cast. */
        private fun <P : Any> handleFor(type: GameType<P>, mapper: ObjectMapper) =
            GameTypeHandle(type = type, mapper = mapper)
    }
}
```

> Der `require` im `init` läuft **nach** der `handles`-Initialisierung, weil eine Map doppelte
> Schlüssel still zusammenfaltet — die Größenprüfung ist genau deshalb die Erkennung. Ein
> `groupBy`-Vorlauf wäre gleichwertig; diese Fassung ist kürzer und der Test pinnt das Verhalten.

- [ ] **Step 8: Test laufen lassen und Erfolg bestätigen**

Run: `cd core && ./mvnw test -Dtest=GameCatalogTest`
Expected: PASS, 5 Tests.

> Läuft der Kontext eines `@SpringBootTest` an dieser Stelle nicht mehr an, weil `GameCatalog` keinen
> `GameType`-Bean findet: Spring injiziert für `List<T>` ohne Kandidaten eine leere Liste, kein
> Fehler. Der Katalog ist dann leer und `ids()` gibt `emptyList()` — genau der Zustand, den Task 4 als
> `NoGame(NO_GAME_TYPE)` beantwortet.

- [ ] **Step 9: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game core/src/test/kotlin/org/unividuell/countdown/core/game
git commit -m "feat(game): add the game type contract, the catalogue and the selection rule"
```

---

## Task 3: Guess Hue als erster Spieltyp

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GuessHueGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GuessHueGameTypeTest.kt`

**Interfaces:**
- Consumes: `GameType`, `GamePayload`, `RoundContext`, `Phase` (Tasks 1–2); `GuessHueDataset.draw(random: SeededRandom): GuessHueTarget`, `GuessHueTarget(entry, hue, saturation, lightness, initHue)`, `GuessHueEntry.description`, `GuessHueTolerance.DEGREES` (Modul `guesshue`, exponiert); `SeededRandom`.
- Produces:
  - `data class GuessHueParams(description: String, hue: Double, saturation: Double, lightness: Double, initHue: Double, toleranceDeg: Double?)`
  - `data class GuessHuePayload(description: String, initHue: Double, saturation: Double, lightness: Double) : GamePayload`
  - `GuessHueGameType` mit `id = "guess-hue"`, `displayName = "Farbausmalung"`

- [ ] **Step 1: Failing test schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/game/GuessHueGameTypeTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.matchers.doubles.shouldBeGreaterThanOrEqual
import io.kotest.matchers.doubles.shouldBeLessThan
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldNotBeEmpty
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.game.internal.GuessHueGameType
import org.unividuell.countdown.core.game.internal.Phase
import org.unividuell.countdown.core.game.internal.RoundContext
import org.unividuell.countdown.core.guesshue.GuessHueTolerance
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.json.JsonMapper

@Import(TestcontainersConfiguration::class)
@SpringBootTest
class GuessHueGameTypeTest(@Autowired val game: GuessHueGameType) {

    private val mapper = JsonMapper.builder().build()

    private fun draw(phase: Phase, seed: Int = 4711) =
        game.draw(
            random = SeededRandom.fromSeed(seed),
            context = RoundContext(roundNumber = 12, phase = phase),
        )

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "guess-hue"
        game.displayName shouldBe "Farbausmalung"
    }

    @Test
    fun `a drawn round carries the description and a hue inside the wheel`() {
        val params = draw(phase = Phase.ONE)

        params.description.shouldNotBeEmpty()
        params.hue shouldBeGreaterThanOrEqual 0.0
        params.hue shouldBeLessThan 360.0
        params.initHue shouldBeGreaterThanOrEqual 0.0
        params.initHue shouldBeLessThan 360.0
    }

    @Test
    fun `the same seed draws the same round`() {
        draw(phase = Phase.ONE, seed = 99) shouldBe draw(phase = Phase.ONE, seed = 99)
    }

    @Test
    fun `phase one bakes in the inherited tolerance, phase two has no gate at all`() {
        draw(phase = Phase.ONE).toleranceDeg shouldBe GuessHueTolerance.DEGREES
        draw(phase = Phase.TWO).toleranceDeg.shouldBeNull()
    }

    @Test
    fun `the payload carries exactly what the player needs and nothing else`() {
        // Pinning the field SET, not the absence of `hue`: a new field that merely narrows the
        // answer would slip past an "is the solution absent" assertion.
        val json = mapper.writeValueAsString(game.present(draw(phase = Phase.ONE)))

        mapper.readTree(json).propertyNames().toSet() shouldBe
            setOf("description", "initHue", "saturation", "lightness")
    }

    @Test
    fun `the payload's starting angle is not the solution`() {
        val params = draw(phase = Phase.ONE)

        // initHue is drawn independently of the target, so it narrows nothing. If a future change
        // ever derives one from the other, this test is the one that should fail.
        val payload = game.present(params)
        payload.initHue shouldBe params.initHue
        (payload.initHue == params.hue) shouldBe false
    }
}
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=GuessHueGameTypeTest`
Expected: Kompilierfehler — `GuessHueGameType` existiert nicht.

- [ ] **Step 3: Den Adapter schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GuessHueGameType.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.guesshue.GuessHueDataset
import org.unividuell.countdown.core.guesshue.GuessHueTolerance
import org.unividuell.countdown.core.rng.SeededRandom

/**
 * The frozen round. `hue` is the answer and never leaves the server.
 *
 * [toleranceDeg] is both the gate and the arc the client draws: in phase one a guess must land inside
 * it to qualify, and in phase two there is **no gate** — only the closest guess scores, however far
 * off everyone was — so the value is `null` there. A boolean beside it would be a second way of
 * saying the same thing.
 */
data class GuessHueParams(
    val description: String,
    val hue: Double,
    val saturation: Double,
    val lightness: Double,
    val initHue: Double,
    val toleranceDeg: Double?,
)

/**
 * What the player needs in order to play: the text, and the colour the wheel starts on.
 *
 * `GuessHueParams.hue` — the answer — is absent, and so is anything it could be derived from. The
 * starting angle is drawn independently of the target, so it narrows nothing; saturation and
 * lightness are the same for every angle on the wheel.
 */
data class GuessHuePayload(
    val description: String,
    val initHue: Double,
    /** Fractions, not percent: `hsl()` in the browser takes them as-is, hex would need converting. */
    val saturation: Double,
    val lightness: Double,
) : GamePayload

/**
 * Guess Hue as an announceable game.
 *
 * The adapter lives here and `guesshue` knows nothing about it — a change to the [GameType] contract
 * stays local to this module, and "which games exist" has exactly one place. The draw itself is
 * `GuessHueDataset.draw`, unchanged, so what is announced is what the dataset says.
 */
@Component
class GuessHueGameType(private val dataset: GuessHueDataset) : GameType<GuessHueParams> {

    override val id = "guess-hue"
    override val displayName = "Farbausmalung"
    override val paramsType = GuessHueParams::class.java

    override fun draw(random: SeededRandom, context: RoundContext): GuessHueParams {
        val target = dataset.draw(random)
        return GuessHueParams(
            description = target.entry.description,
            hue = target.hue,
            saturation = target.saturation,
            lightness = target.lightness,
            initHue = target.initHue,
            toleranceDeg = when (context.phase) {
                Phase.ONE -> GuessHueTolerance.DEGREES
                Phase.TWO -> null
            },
        )
    }

    override fun present(params: GuessHueParams) = GuessHuePayload(
        description = params.description,
        initHue = params.initHue,
        saturation = params.saturation,
        lightness = params.lightness,
    )
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

Run: `cd core && ./mvnw test -Dtest=GuessHueGameTypeTest`
Expected: PASS, 6 Tests. Der Test bootet einen Spring-Kontext, weil `GuessHueDataset` ein Bean ist — im Test greift die Sample-Datensatz-Konfiguration (`GuessHueTestDatasetConfiguration`), also braucht er keine kuratierten Inhalte.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GuessHueGameType.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/game/GuessHueGameTypeTest.kt
git commit -m "feat(game): announce Guess Hue — draw and present, with the phase baked into params"
```

---

## Task 4: Die Auflösung und der Ansage-Endpunkt

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/AnnouncementService.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundDtos.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundController.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptions.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptionHandler.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/AnnouncementServiceTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundControllerTest.kt`

**Interfaces:**
- Consumes: alles aus Tasks 1–3; `CommunityQuery.findBySlug(slug)`, `CommunityQuery.activeEditionOf(communityId)`, `MembershipQuery.isActiveMember(communityId, userId)` (Modul `community`, exponiert); `CountdownEngine.roundAt(now, startsAt, zone)` und `intervalOf(number, startsAt, zone)`, `Round(number, label, start, end)` (Modul `countdown`, exponiert); `Clock`.
- Produces:
  - `enum class NoGameReason { NOT_SCHEDULED, BEFORE_WINDOW, AFTER_WINDOW, NO_GAME_TYPE }`
  - `data class RoundDto(number: Int, label: String, start: Instant, end: Instant)`
  - `data class GameDto(id: String, displayName: String)`
  - `data class RoundResponse(round: RoundDto?, game: GameDto?, noGameReason: NoGameReason?)`
  - `AnnouncementService.currentRound(slug: String, userId: UUID, isSuperAdmin: Boolean): RoundResponse`
  - `RoundAccessDeniedException` → HTTP 404
  - `GET /api/communities/{slug}/rounds/current`

- [ ] **Step 1: Failing test für die Auflösung schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/game/AnnouncementServiceTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

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
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.community.internal.EditionService
import org.unividuell.countdown.core.game.internal.AnnouncementService
import org.unividuell.countdown.core.game.internal.NoGameReason
import org.unividuell.countdown.core.game.internal.RoundAccessDeniedException
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.time.Instant

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class AnnouncementServiceTest(
    @Autowired val announcements: AnnouncementService,
    @Autowired val communities: CommunityService,
    @Autowired val editions: EditionService,
    @Autowired val editionRepository: CommunityEditionRepository,
    @Autowired val users: UserRepository,
) {
    private fun aUser() = users.save(User(githubId = System.nanoTime(), githubLogin = "creator"))

    /** A community whose countdown starts far in the future, so the current round is a large number. */
    private fun aCommunity(name: String, gamesFromRound: Int? = null, gamesUntilRound: Int? = null): Community {
        val owner = aUser()
        val community = communities.create(creatorUserId = requireNotNull(owner.id), rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = gamesFromRound, gamesUntilRound = gamesUntilRound,
        )
        return community
    }

    private fun ownerOf(community: Community) =
        requireNotNull(communities.create(creatorUserId = requireNotNull(aUser().id), rawName = "unused").id)

    @Test
    fun `a non-member gets no announcement at all`() {
        val owner = aUser()
        val community = communities.create(creatorUserId = requireNotNull(owner.id), rawName = "Members Only Round")
        val outsider = aUser()

        shouldThrow<RoundAccessDeniedException> {
            announcements.currentRound(
                slug = community.slug, userId = requireNotNull(outsider.id), isSuperAdmin = false,
            )
        }
    }

    @Test
    fun `a super-admin may look without being a member`() {
        val owner = aUser()
        val community = communities.create(creatorUserId = requireNotNull(owner.id), rawName = "Super Round")
        val superAdmin = aUser()

        val res = announcements.currentRound(
            slug = community.slug, userId = requireNotNull(superAdmin.id), isSuperAdmin = true,
        )

        res.noGameReason shouldBe NoGameReason.NOT_SCHEDULED
    }

    @Test
    fun `without a date there is no round and no game`() {
        val owner = aUser()
        val community = communities.create(creatorUserId = requireNotNull(owner.id), rawName = "No Date Round")

        val res = announcements.currentRound(
            slug = community.slug, userId = requireNotNull(owner.id), isSuperAdmin = false,
        )

        res.round.shouldBeNull()
        res.game.shouldBeNull()
        res.noGameReason shouldBe NoGameReason.NOT_SCHEDULED
    }

    @Test
    fun `the current round is announced with a game`() {
        val community = aCommunity("Announced Round")
        val viewer = requireNotNull(communities.findMemberViewer(community))

        val res = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)

        res.round.shouldNotBeNull().number shouldBe res.round!!.number  // the round exists
        res.game.shouldNotBeNull().id shouldBe "guess-hue"
        res.game!!.displayName shouldBe "Farbausmalung"
        res.noGameReason.shouldBeNull()
    }

    @Test
    fun `announcing twice returns the same game - the round is materialised once`() {
        val community = aCommunity("Stable Round")
        val viewer = requireNotNull(communities.findMemberViewer(community))

        val first = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)
        val second = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)

        second.game shouldBe first.game
        second.round shouldBe first.round
    }

    @Test
    fun `a round before the window has no game but still has a round`() {
        // The current round is a large number (the date is in 2099); a window that starts later in
        // time — a smaller number — has not begun yet.
        val community = aCommunity("Before Window", gamesFromRound = 5, gamesUntilRound = 0)
        val viewer = requireNotNull(communities.findMemberViewer(community))

        val res = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)

        res.round.shouldNotBeNull()
        res.game.shouldBeNull()
        res.noGameReason shouldBe NoGameReason.BEFORE_WINDOW
    }

    @Test
    fun `a round after the window has no game either`() {
        val community = aCommunity("After Window")
        val edition = requireNotNull(editionRepository.findActiveByCommunityId(requireNotNull(community.id)))
        val current = announcements.currentRound(
            slug = community.slug,
            userId = requireNotNull(communities.findMemberViewer(community)),
            isSuperAdmin = false,
        ).round
        // Close the window entirely above the current round: until > current means it already ended.
        editionRepository.save(
            edition.copy(gamesFromRound = null, gamesUntilRound = requireNotNull(current).number + 5),
        )

        val res = announcements.currentRound(
            slug = community.slug,
            userId = requireNotNull(communities.findMemberViewer(community)),
            isSuperAdmin = false,
        )

        res.noGameReason shouldBe NoGameReason.AFTER_WINDOW
    }
}
```

> **Zwei Stellen in diesem Test brauchen eine Entscheidung beim Schreiben, und zwar diese:**
>
> 1. `communities.findMemberViewer(...)` **existiert nicht** und soll nicht gebaut werden. Der Ersteller
>    einer Community ist ihr erstes aktives Mitglied (`CommunityService.create`), also halte die
>    `owner`-UUID im Test fest und benutze sie als Betrachter. Ersetze `aCommunity` durch eine Fassung,
>    die `Pair<Community, UUID>` zurückgibt, und lass `ownerOf` weg — die Hilfsfunktion war ein
>    Denkfehler beim Aufschreiben und würde eine zweite, fremde Community anlegen.
> 2. `res.round.shouldNotBeNull().number shouldBe res.round!!.number` ist eine Tautologie. Ersetze sie
>    durch die Aussage, die wirklich gilt: bei einem Start 2099 liegt die aktuelle Rundennummer weit
>    über 0, also `res.round.shouldNotBeNull().number shouldBeGreaterThan 0` (Import
>    `io.kotest.matchers.ints.shouldBeGreaterThan`). Eine Assertion, die nicht scheitern kann, ist
>    keine.

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=AnnouncementServiceTest`
Expected: Kompilierfehler — `AnnouncementService`, `NoGameReason`, `RoundAccessDeniedException` existieren nicht.

- [ ] **Step 3: DTOs und Exception schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundDtos.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.countdown.Round
import java.time.Instant

/** Why this round carries no game. Distinguished so the UI can say something true. */
enum class NoGameReason {
    /** No active run, or the run has no target date yet — the countdown has not begun. */
    NOT_SCHEDULED,

    /** The round lies before the run's game window: a larger number than `games_from_round`. */
    BEFORE_WINDOW,

    /** The round lies after it: a smaller number than `games_until_round`. */
    AFTER_WINDOW,

    /** The window is open but the catalogue offers nothing. */
    NO_GAME_TYPE,
}

/**
 * Mirrors `countdown.internal.RoundDto` field for field, deliberately rather than reusing it: that
 * one is `internal` to the `countdown` module, and a shared DTO would tie two modules' wire formats
 * together. Four fields are cheaper than that coupling.
 */
data class RoundDto(val number: Int, val label: String, val start: Instant, val end: Instant)

data class GameDto(val id: String, val displayName: String)

/**
 * `round` is null when there is no grid at all (no run, no date). It is present with `game == null`
 * when the round exists but carries no game — the window, or an empty catalogue.
 *
 * Plan 3 adds the play state (`payload`, `solution`, `me`, `others`); this slice announces only.
 */
data class RoundResponse(
    val round: RoundDto?,
    val game: GameDto?,
    val noGameReason: NoGameReason?,
)

fun Round.toDto() = RoundDto(number = number, label = label, start = start, end = end)
```

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptions.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

/** Caller is not an ACTIVE member of the community → 404, so membership does not leak. */
class RoundAccessDeniedException(message: String = "No access") : RuntimeException(message)
```

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptionHandler.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(basePackages = ["org.unividuell.countdown.core.game.internal"])
class GameExceptionHandler {
    @ExceptionHandler(RoundAccessDeniedException::class)
    fun notFound(e: RuntimeException) =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message ?: "not found")
}
```

- [ ] **Step 4: Die Auflösung schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/AnnouncementService.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.countdown.Round
import org.unividuell.countdown.core.rng.SeededRandom
import java.security.SecureRandom
import java.time.Clock
import java.time.ZoneId
import java.util.UUID

/**
 * Which game the community is playing right now.
 *
 * The read path is a `SELECT`; only the first caller of a round writes. That is why this is a `GET`
 * that materialises: the announcement **is** the materialisation. Were the row written on first
 * reveal instead, the announcement would have to be computed unpersisted beforehand and could differ
 * from the row written later — exactly the drift the frozen round exists to prevent.
 */
@Service
class AnnouncementService(
    private val communities: CommunityQuery,
    private val memberships: MembershipQuery,
    private val engine: CountdownEngine,
    private val store: RoundGameStore,
    private val catalog: GameCatalog,
    private val selection: GameSelection,
    private val clock: Clock,
) {
    private val logger = KotlinLogging.logger {}

    /** The hidden seed is drawn, never derived: `(edition, round)` would be guessable. */
    private val secureRandom = SecureRandom()

    /**
     * Not `readOnly`: the first call of a round inserts. Every later call of the same round only
     * reads, which is where practically all traffic lands.
     */
    @Transactional
    fun currentRound(slug: String, userId: UUID, isSuperAdmin: Boolean): RoundResponse {
        val community = communities.findBySlug(slug) ?: throw RoundAccessDeniedException()
        val communityId = requireNotNull(community.id)
        if (!isSuperAdmin && !memberships.isActiveMember(communityId = communityId, userId = userId)) {
            throw RoundAccessDeniedException()
        }
        val edition = communities.activeEditionOf(communityId)
            ?: return noGame(round = null, reason = NoGameReason.NOT_SCHEDULED)
        val startsAt = edition.startsAt
            ?: return noGame(round = null, reason = NoGameReason.NOT_SCHEDULED)

        val round = engine.roundAt(
            now = clock.instant(),
            startsAt = startsAt,
            zone = ZoneId.of(edition.startsAtTimezone),
        )
        // A larger round number is earlier in time, so "before the window" is a number above its
        // first round, and "after" is a number below its last.
        edition.gamesFromRound?.let { from ->
            if (round.number > from) return noGame(round = round, reason = NoGameReason.BEFORE_WINDOW)
        }
        if (round.number < edition.gamesUntilRound) {
            return noGame(round = round, reason = NoGameReason.AFTER_WINDOW)
        }

        val existing = store.find(edition = edition, roundNumber = round.number)
        if (existing != null) return announced(round = round, roundGame = existing)

        return materialise(edition = edition, round = round)
    }

    private fun materialise(edition: CommunityEdition, round: Round): RoundResponse {
        val history = store.history(edition = edition, roundNumber = round.number)
        val random = SeededRandom.fromSeed(secureRandom.nextInt())
        val typeId = selection.pick(
            candidates = catalog.ids(),
            history = history,
            random = random,
        ) ?: run {
            logger.warn { "no game type available for round ${round.number} of edition ${edition.id}" }
            return noGame(round = round, reason = NoGameReason.NO_GAME_TYPE)
        }
        val handle = requireNotNull(catalog.handle(typeId)) { "selection picked unknown type '$typeId'" }
        val params = handle.draw(
            random = random,
            context = RoundContext(
                roundNumber = round.number,
                phase = Phase.of(edition = edition, roundNumber = round.number),
            ),
        )
        val announced = store.announce(
            edition = edition,
            roundNumber = round.number,
            gameType = typeId,
            params = params,
            award = awardFor(
                roundNumber = round.number,
                phaseTwoStartRound = edition.phaseTwoStartRound,
            ),
            announcedAt = clock.instant(),
        )
        return announced(round = round, roundGame = announced)
    }

    /**
     * Reads the game type off the stored row, not off the draw: on a lost race the row belongs to
     * whoever announced first, and their game is the one everybody plays.
     */
    private fun announced(round: Round, roundGame: RoundGame): RoundResponse {
        val handle = catalog.handle(roundGame.gameType)
        if (handle == null) {
            // The round was announced by a deployment that had a game this one does not. Nothing can
            // be played, but the round must not 500 — and the operator needs to know which type.
            logger.warn { "round ${round.number} announced as '${roundGame.gameType}', which this build has no game for" }
            return noGame(round = round, reason = NoGameReason.NO_GAME_TYPE)
        }
        return RoundResponse(
            round = round.toDto(),
            game = GameDto(id = handle.id, displayName = handle.displayName),
            noGameReason = null,
        )
    }

    private fun noGame(round: Round?, reason: NoGameReason) =
        RoundResponse(round = round?.toDto(), game = null, noGameReason = reason)
}
```

- [ ] **Step 5: Test laufen lassen und Erfolg bestätigen**

Run: `cd core && ./mvnw test -Dtest=AnnouncementServiceTest`
Expected: PASS.

- [ ] **Step 6: Failing test für den Endpunkt schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/game/RoundControllerTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

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
import org.unividuell.countdown.core.game.internal.AnnouncementService
import org.unividuell.countdown.core.game.internal.GameDto
import org.unividuell.countdown.core.game.internal.NoGameReason
import org.unividuell.countdown.core.game.internal.RoundAccessDeniedException
import org.unividuell.countdown.core.game.internal.RoundDto
import org.unividuell.countdown.core.game.internal.RoundResponse
import org.unividuell.countdown.core.principalFor
import java.time.Instant

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class RoundControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean lateinit var announcements: AnnouncementService

    private val uid = TEST_USER_ID

    @Test
    fun `GET current round returns the round and its game`() {
        every {
            announcements.currentRound(slug = "team", userId = uid, isSuperAdmin = false)
        } returns RoundResponse(
            round = RoundDto(
                number = 12, label = "T-12",
                start = Instant.parse("2026-08-12T10:00:00Z"),
                end = Instant.parse("2026-08-13T10:00:00Z"),
            ),
            game = GameDto(id = "guess-hue", displayName = "Farbausmalung"),
            noGameReason = null,
        )

        mockMvc.get("/api/communities/team/rounds/current") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.round.number") { value(12) }
            jsonPath("$.round.label") { value("T-12") }
            jsonPath("$.game.id") { value("guess-hue") }
            jsonPath("$.game.displayName") { value("Farbausmalung") }
        }
    }

    @Test
    fun `GET current round names the reason when there is no game`() {
        every {
            announcements.currentRound(slug = "team", userId = uid, isSuperAdmin = false)
        } returns RoundResponse(round = null, game = null, noGameReason = NoGameReason.NOT_SCHEDULED)

        mockMvc.get("/api/communities/team/rounds/current") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.noGameReason") { value("NOT_SCHEDULED") }
        }
    }

    @Test
    fun `GET current round is 404 for a non-member`() {
        every {
            announcements.currentRound(slug = "secret", userId = uid, isSuperAdmin = false)
        } throws RoundAccessDeniedException()

        mockMvc.get("/api/communities/secret/rounds/current") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `GET current round passes the super-admin flag through`() {
        every {
            announcements.currentRound(slug = "team", userId = uid, isSuperAdmin = true)
        } returns RoundResponse(round = null, game = null, noGameReason = NoGameReason.NOT_SCHEDULED)

        mockMvc.get("/api/communities/team/rounds/current") { with(principalFor(superAdmin = true)) }
            .andExpect { status { isOk() } }
    }

    @Test
    fun `GET current round requires a session`() {
        mockMvc.get("/api/communities/team/rounds/current").andExpect { status { isUnauthorized() } }
    }
}
```

- [ ] **Step 7: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd core && ./mvnw test -Dtest=RoundControllerTest`
Expected: FAIL mit 404 auf allen Fällen — der Endpunkt existiert nicht.

- [ ] **Step 8: Controller schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundController.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.iam.AuthenticatedUser

@RestController
@RequestMapping("/api/communities/{slug}/rounds")
class RoundController(private val announcements: AnnouncementService) {

    @GetMapping("/current")
    fun current(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
    ): RoundResponse = announcements.currentRound(
        slug = slug,
        userId = me.id,
        isSuperAdmin = me.isSuperAdmin,
    )
}
```

> `AuthenticatedUser` liegt im **exponierten** Package `…core.iam`, ist also erlaubt — aber es erzeugt
> die Modulkante `game → iam`, die die Global Constraints für diese Scheibe ausschließen. Prüfe, wie
> `CountdownController` das löst: es benutzt dieselbe Annotation, also besteht die Kante
> `countdown → iam` schon und ist normal. **Nimm die Kante auf** und ergänze sie in den
> Constraints — die Alternative wäre, den Principal über ein eigenes Interface zu duplizieren, und das
> wäre schlechter. Notiere die Korrektur im Commit.

- [ ] **Step 9: Test laufen lassen und Erfolg bestätigen**

Run: `cd core && ./mvnw test -Dtest=RoundControllerTest`
Expected: PASS, 5 Tests.

- [ ] **Step 10: Nebenläufigkeit prüfen**

Ergänze in `AnnouncementServiceTest`:

```kotlin
    @Test
    fun `two callers racing the same round end up with one row and the same game`() {
        val (community, viewer) = aCommunityWithOwner("Raced Round")

        // Same round, two announcements. The second must not overwrite the first: ON CONFLICT DO
        // NOTHING, then read the winner's row.
        val first = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)
        val second = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)

        second.game shouldBe first.game
        val edition = requireNotNull(editionRepository.findActiveByCommunityId(requireNotNull(community.id)))
        rounds.historyOf(editionId = requireNotNull(edition.id), after = Int.MIN_VALUE) shouldHaveSize 1
    }
```

Das ist **kein echtes Rennen** — beide Aufrufe laufen sequenziell in derselben Transaktion, und das ist die Wahrheit, die dieser Test prüft: Idempotenz. Ein echter Parallelitätstest bräuchte zwei Transaktionen und ist hier nicht die Mühe wert, weil der Unique-Index die Garantie trägt und `ON CONFLICT DO NOTHING` sie ausdrückt. Schreib das so in den Testnamen: `announcing the same round twice leaves one row`.

Run: `cd core && ./mvnw test -Dtest=AnnouncementServiceTest`
Expected: PASS.

- [ ] **Step 11: Ganze Suite und Modulith**

Run: `cd core && ./mvnw clean test`
Expected: PASS. `ModularityTests` grün mit `game → community, countdown, rng, guesshue, iam`.

- [ ] **Step 12: Commit**

```bash
git add core/src/main core/src/test
git commit -m "feat(game): announce the current round over HTTP, materialised on first ask"
```

---

## Task 5: Spec und Guidelines nachziehen

**Files:**
- Modify: `docs/superpowers/specs/2026-08-11-round-game-selection-design.md`
- Modify: `.claude/guidelines/persistence.md`

- [ ] **Step 1: Den Converter in der Spec festhalten**

Die Spec bleibt bei `JSONB` — nichts zu korrigieren. Ergänze aber unter der `round_games`-Tabelle den
Satz, der beim nächsten JSON-Feld die Recherche erspart:

```markdown
**`params JSONB` braucht einen Converter, und zwar genau einen Haken:** eine
`AbstractJdbcConfiguration`-Unterklasse, die `userConverters()` überschreibt (`JsonNode ↔ PGobject`).
Nicht `jdbcCustomConversions()` überschreiben — das setzt die Conversions des Dialekts mit außer Kraft.
Die Unterklasse ersetzt Boots `SpringBootJdbcConfiguration` (`@ConditionalOnMissingBean`), muss deshalb
im Root-Package liegen, damit `getMappingBasePackages()` alle Entities erfasst. Das Feld ist ein
`JsonNode`, kein `String`: ein String-Converter würde jede Textspalte jeder Entity treffen.
```

`round_plays.guess` und `.outcome` (Plan 3) bleiben damit ebenfalls `JSONB`.

- [ ] **Step 2: Die Modulkante in der Spec korrigieren**

Die Spec listet `game → iam` mit der Begründung „Namen und Avatare in der Tippübersicht“. Diese
Scheibe braucht `iam` schon früher, für `AuthenticatedUser` am Controller. Ergänze in der
Modul-Schnitt-Liste hinter der `iam`-Zeile: `(und `AuthenticatedUser` am Controller, ab der Ansage)`.

- [ ] **Step 3: Die JSON-Spalten-Regel in `persistence.md` aufnehmen**

Ergänze nach dem Abschnitt „Moving or dropping a column“:

```markdown
## `jsonb` columns: one config class, and only these two rules

A `jsonb` column maps to a **`JsonNode`** field. Two rules, both easy to get wrong:

1. **Register the converters via `userConverters()`** in a subclass of `AbstractJdbcConfiguration` —
   the hook the Spring Data JDBC reference names. Do **not** override `jdbcCustomConversions()`: that
   method assembles the store's conversions *and* the ones the `Dialect` registers, and overriding it
   silently drops the dialect's.
2. **Put that class in the root package** (`org.unividuell.countdown.core`). It replaces Spring Boot's
   `SpringBootJdbcConfiguration`, which carries `@ConditionalOnMissingBean(AbstractJdbcConfiguration)`,
   and with it Boot's entity scanning. `AbstractJdbcConfiguration` scans `getMappingBasePackages()`
   instead — by default the package of your config class, so the root package covers everything. Boot's
   other addition, the `spring.data.jdbc.dialect` property, goes unread; we do not set it (the dialect
   comes from the connection).

The field must be `JsonNode`, never `String`: a `String ↔ PGobject` converter would apply to every text
column in every entity.

Reading is covered by the converter. Binding a `JsonNode` as a parameter of a custom `@Query` is not
guaranteed — if such a statement fails on the parameter, cast in the SQL (`CAST(:params AS jsonb)`) and
pass the serialised string for that one query only.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs .claude/guidelines/persistence.md
git commit -m "docs: record why params is text, and the module edge the announcement needs"
```

---

## Self-Review

**Spec-Abdeckung** (*Umsetzungsschnitt* Punkt 2 und die Abschnitte, die er zieht):

| Spec-Anforderung | Task |
|---|---|
| Modul `game`, Schema, Migrationen unter `db/migration/game/` | 1 |
| `round_games` mit `edition_id`, `round_number`, `game_type`, `params`, `award_rule`, `award_points`, `announced_at`, `UNIQUE (edition_id, round_number)` | 1 |
| „Keine Zeile heißt kein Spiel“ (kein `game_type = NULL`) | 1 (DDL: `game_type NOT NULL`, keine Marker-Zeile) |
| Cross-Schema-FK auf `community.editions`, geordnet über die Modul-Abhängigkeit | 1 (der Grund, warum `Phase.of`/`RoundGameStore` dort liegen) |
| Phase = `roundNumber <= phaseTwoStartRound`, eine Prüfung für Toleranz und Einsatz | 1 (`Phase.of`, `awardFor`, Test *phase and award turn over at the same round*) |
| `awardFor`: 1 vor Phase 2, danach `phase2Start − round + 2` | 1 (Testvektoren aus dem Original) |
| `GameType` mit `id`, `displayName`, `paramsType`, `draw`, `present`; in `internal` | 2 |
| `GameTypeHandle<P>` kapselt den Generics-Sprung, kein `UNCHECKED_CAST` | 2 |
| `GameCatalog` scheitert am Boot bei doppelter `id`; sortierte Ids | 2 |
| `GameSelection` als reine Funktion über die **ganze** Historie; Regel als Präferenz | 2 (mit gefälschtem Katalog getestet) |
| `GuessHueParams` inkl. `toleranceDeg: Double?`; Phase 2 ohne Tor | 3 |
| Payload-Feldmengen-Test | 3 |
| Auflösung Schritte 1–6 samt `ON CONFLICT DO NOTHING` + `SELECT` | 1 (Repository) + 4 (Service) |
| Hidden Seed gezogen statt abgeleitet, nicht persistiert | 4 (`SecureRandom`, nirgends gespeichert) |
| `NoGameReason` mit vier Fällen; `NOT_SCHEDULED` deckt „kein Durchlauf“ und „kein Termin“ | 4 |
| Fenster beidseitig inklusiv | 4 (Tests BEFORE/AFTER) |
| Ein `GET`, der materialisiert, mit Begründung | 4 |
| `params JSONB`, gehalten als `JsonNode`, Converter über `userConverters()` | 1 (`JdbcConversionsConfiguration`) |

**Bewusst nicht in diesem Plan** (Spec-Abschnitt *Spielen* und *Punkte*): `round_plays`, Aufdecken,
Tippen, `judge`, `Judgement`, die Vergaberegeln samt Neuauswertung, `solution`, Standings,
Tippübersicht, der Lab-Umbau. `GameType` hat hier nur `draw` und `present`; Plan 3 ergänzt `judge`
und `solution` additiv.

**Platzhalter:** keine. Zwei Stellen enthalten absichtlich einen *Fehler mit Korrekturanweisung* statt
fertigem Code — der zweite aktive Durchlauf in Task 1 Step 2 und die `findMemberViewer`-Tautologie in
Task 4 Step 1. Das ist kein Platzhalter, sondern die ehrlichste Form für Stellen, an denen mir beim
Schreiben selbst ein Fehler auffiel: der Umsetzer sieht beides, den Fehlgriff und warum er falsch ist.

**Eine offene Frage, bewusst offen und mit Entscheidungsregel:** ob ein `JsonNode` als Parameter einer
eigenen `@Query` durch die Write-Conversion läuft (Task 1 Step 10). Der Lesepfad ist sicher, das Binden
nicht garantiert; der Schritt nennt beide Ausgänge und die Fallback-Änderung, die dann genau ein
Statement betrifft. Das ist keine Lücke im Plan, sondern eine Frage, die ein Testlauf in zwei Minuten
beantwortet und Bytecode-Lesen nicht.

**Korrektur an meiner eigenen ersten Fassung:** dieser Plan stand zuerst auf `params TEXT`, begründet
damit, ein eigener `JdbcCustomConversions`-Bean kollidiere mit Boots geerbtem `@Bean`. Das war falsch —
jede `@Bean`-Methode in Boots `SpringBootJdbcConfiguration` trägt `@ConditionalOnMissingBean`, und der
von der Doku empfohlene Weg (`userConverters()`) tritt ohnehin an die Stelle der ganzen Klasse. Auch
das zweite Argument, der Verlust von Boots Entity-Scanning, schrumpft auf „Config-Klasse ins
Root-Package“. `JSONB` ist damit die richtige Wahl und die Spec braucht keine Korrektur.

**Typkonsistenz:** `Award`/`AwardRule`/`Phase` in Task 1 definiert, in 3 (`Phase`) und 4 (`awardFor`)
benutzt. `PastRound` in Task 1, konsumiert von `GameSelection` in 2 und `store.history` in 4.
`GamePayload`/`RoundContext` in Task 2, implementiert in 3, aufgerufen in 4 über `GameTypeHandle`.
`RoundGameStore.announce` nimmt `params: JsonNode`, `Award` und `announcedAt: Instant` (Pflichtparameter,
kein Default) — die Signatur in Task 1 Step 6 stimmt mit dem Aufruf in Task 4 Step 4 überein.
`GameTypeHandle.draw`/`present` arbeiten in Task 2 auf `JsonNode` und passen damit zum Entity-Feld aus
Task 1 und zum Service in Task 4.
`toDto()` in Task 4 Step 3 ist `game.internal`s eigenes und kollidiert nicht mit dem gleichnamigen in
`countdown.internal`, weil beide `internal` sind und nie im selben Import landen.
