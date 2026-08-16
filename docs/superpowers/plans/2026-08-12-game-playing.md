# Spielen (`game.round_plays`) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine angesagte Runde wird spielbar — aufdecken, tippen, urteilen, Punkte vergeben und bei jedem Tipp die ganze Runde neu auswerten, samt echtem Punktestand über den aktiven Durchlauf.

**Architecture:** `game.round_plays` hält eine Zeile pro (Runde, Spieler), angelegt beim ersten Aufdecken. Das Spiel *urteilt* (`judge` → `qualifies` + `deviation`), das Framework *vergibt* (`awardFor` → Regel + Einsatz, `pointsFor` → Punkte aller Tipps der Runde). Weil `points` eine reine Funktion persistierter Werte ist, braucht „ein späterer Tipp nimmt Punkte weg“ keinen Mechanismus, sondern nur eine Neuauswertung unter einer Zeilensperre auf der Runde. Dazu die Sicherheitskorrektur, die diese Scheibe schuldet: die Ziehung läuft ab jetzt über **zwei unabhängig geseedete Ströme**, getrennt nach *veröffentlicht* und *geheim*, weil erst hier ein Payload den Server verlässt.

**Tech Stack:** Kotlin 2.4 · Spring Boot 4.1 · Spring Data JDBC 4.1 · Spring Modulith 2.1 · PostgreSQL 18 · Flyway · Jackson 3 (`tools.jackson`) · JUnit 5 + kotest matchers + mockk + Testcontainers.

**Spec:** [`docs/superpowers/specs/2026-08-11-round-game-selection-design.md`](../specs/2026-08-11-round-game-selection-design.md) — Abschnitte *`game.round_plays` — Uhr, Tipp und Punkte*, *Der Spiel-Vertrag*, *Spielen*, *Sichtbarkeit: kein Schalter*, *Punkte sind ein Cache, kein Urteil*, *Herkunft im Original*, *„Punkte entziehen“ ist kein Mechanismus*, *Das Fenster entscheidet die Summe*, *Warum es keinen Hidden Seed gibt* (letzter Absatz: die Zwei-Strom-Auflage), sowie *Umsetzungsschnitt* Punkt 3.

**Baut auf Plan 2** ([`2026-08-12-game-round-announcement.md`](2026-08-12-game-round-announcement.md)), der als ungemergeter Vorgänger-Branch unter diesem liegt: Modul `game`, `game.round_games`, `GameType`/`GameCatalog`/`GameTypeHandle`, `GameSelection`, `GuessHueGameType` (draw + present), `Award`/`awardFor`/`windowReasonOf`, `AnnouncementService`, `GET …/rounds/current`.

## Global Constraints

- **Modulgrenze:** exponierte Typen im Basis-Package `…core.game`, alles andere in `…core.game.internal`. Der `GameType`-Vertrag bleibt **in `internal`** — er wächst hier um `judge`/`solution`, wird aber weiterhin nur innerhalb `game` implementiert. (Erst Plan 4 braucht ihn außerhalb, weil `gamelab` durch dieselben Klassen läuft; **dann** zieht er ins Basis-Package. Nicht vorwegnehmen.)
- **Modulkanten dieser Scheibe:** unverändert `game → community`, `game → countdown`, `game → rng`, `game → guesshue`, `game → iam`. Neu genutzt, aber keine neue Kante: `iam.UserQuery`/`iam.Avatar` für die Tippübersicht, `community.MemberPointsQuery` für die Standings. Niemals zurück auf `game`. `ModularityTests.verify()` muss grün bleiben.
- **`game` benutzt nur exponierte APIs anderer Module:** `CommunityQuery`, `MembershipQuery`, `CommunityEdition`, `MemberPointsQuery`, `MemberPoints`, `CountdownEngine`, `Round`, `SeededRandom`, `GuessHueDataset`, `GuessHueTarget`, `GuessHueTolerance`, `UserQuery`, `User`, `Avatar`, `AuthenticatedUser`. Nie `community.internal` oder `iam.internal`.
- **Persistenz:** Spring Data JDBC, kein JPA. `id UUID PRIMARY KEY DEFAULT uuidv7()` in der DDL, `@Id val id: UUID? = null` in der Entity, IDs niemals im Code setzen. Kein `@Column`. IDs einmal auspacken (`val id = requireNotNull(x.id)`), dann die `UUID` weitergeben.
- **Named Arguments ab zwei Argumenten** — siehe [kotlin.md](../../../.claude/guidelines/kotlin.md). Ausnahmen: ein Argument, Varargs, in Java deklarierte Funktionen (`SecureRandom.nextInt()`), trailing Lambda, `infix`.
- **Migrationen** unter `core/src/main/resources/db/migration/game/`, vorwärts, nächste freie Version ist `V2`. Bestehende Skripte nie ändern.
- **Runden-Vorzeichen:** größere Rundennummer = **früher** in der Zeit. Fenster inklusiv: `games_until_round ≤ number ≤ games_from_round`. „Vorrunde“ ist `round_number > n`. Phase zwei ist `number ≤ phase_two_start_round`.
- **Das Spiel urteilt, das Framework vergibt.** `judge` liefert `qualifies` + `deviation` + ein spielgeformtes `outcome` — **nie** eine Punktzahl. Regel und Einsatz kommen aus `awardFor` und stehen eingefroren auf der Runde.
- **`qualifies` und `deviation` verlassen den Server nicht.** Sie sind die Vergleichsgrößen des Frameworks; der Spieler erfährt `outcome` und `points`. Kein generisches „so weit daneben“-Feld im DTO.
- **Zwei Ausgänge, gezählt:** `present(params)` vor dem Tipp, `solution(params)` danach. Beides serverseitig zurückgehalten, nie im Client gefiltert. Pro Spiel pinnt ein Feldmengen-Test **beide**.
- **Ein Wert, der veröffentlicht wird, kommt nie aus dem Strom der Lösung.** Nicht „ist nicht gleich der Lösung“ — *derselbe Strom* ist das Kriterium, weil `SeededRandom` invertierbar ist.
- **Tests:** JUnit 5 als Runner + **kotest matchers** (`shouldBe`, `shouldThrow`, `shouldNotBeNull`, `shouldBeNull`, `shouldHaveSize`, `shouldContainExactly`, `shouldBeGreaterThan`) — nie `kotlin.test` oder JUnit-Assertions. Integrationstests mit `@Import(TestcontainersConfiguration::class) @SpringBootTest @Transactional`; Web-Tests mit MockMvc **Kotlin DSL** plus `with(csrf())` bei jedem POST.
- **Logging:** kotlin-logging, `private val logger = KotlinLogging.logger {}` **innerhalb** der Klasse, immer Lambda-Messages. Geloggt wird, wo Verhalten still degradiert — hier: wenn jemandem Punkte verschwinden.
- **Keine Änderung in `webapp-vue`.** Diese Scheibe ist Backend; `git diff` über `webapp-vue/` muss am Ende leer sein.
- **Sprache:** Code, Kommentare, Testnamen, Commit-Messages **englisch**. Dieser Plan ist deutsch. Deutsche Strings nutzen `„…“`.
- **Branch:** `claude/game-playing`, aufgesetzt auf dem ungemergeten `claude/game-round-announcement` (stacked PR). PR-Basis ist der Vorgänger-Branch, **nicht** `develop`.

## Warum die Zwei-Strom-Korrektur hier liegt und wie der Schnitt verläuft

Die Spec hält fest, dass die Regel „ein ausgelieferter Wert darf nie derselbe sein wie einer, der die
Lösung treibt“ zu schwach formuliert war: `nextUint32` ist bijektiv, `nextDouble` veröffentlicht 53 Bit
aus zwei aufeinanderfolgenden Wörtern, und der xoshiro128\*\*-Zustandsübergang ist eine Bijektion.
Drei veröffentlichte Doubles reichen, um den Zustand zu rekonstruieren, **rückwärts** abzuspulen und die
Ziel-Hue exakt zu lesen. Die scharfe Fassung lautet: *derselbe Strom grenzt die Lösung ein, auch wenn
der Wert ihr nicht gleicht und auch wenn er vor ihr gezogen wurde.*

Plan 2 durfte das offenlassen, weil dort **kein** Payload den Server verlässt. Diese Scheibe liefert
`present()` aus — also wird es hier behoben, und zwar nach **Veröffentlichung**, nicht nach Bedeutung:

| Strom | zieht | ist |
|---|---|---|
| `presentation` | Eintrag (→ `description`), Sättigung, Helligkeit, Start-Winkel, **und die Spieltyp-Wahl** | vollständig öffentlich |
| `solution` | nur den Hue-Jitter | das einzige Rundengeheimnis |

Zwei Konsequenzen, beide bewusst:

- **Der Eintrag wandert in den Präsentationsstrom.** Er *ist* veröffentlicht — die Beschreibung ist das
  Spiel. Ihn im Lösungsstrom zu ziehen hieße, mit jedem `pick` ein paar Bit dieses Stroms zu publizieren.
  Übrig bleibt als Geheimnis genau der Jitter (±5°), und den engt kein ausgeliefertes Feld ein.
- **Was danach noch bleibt, ist Datensatz-Geheimhaltung, nicht PRNG.** Wer den kuratierten Datensatz
  kennt, liest die Nominal-Hue direkt aus der Beschreibung — dagegen wirkt [game-content.md](../../../.claude/guidelines/game-content.md),
  nicht der Generator. Der Split nimmt dem Angreifer den *rechnerischen* Weg, nicht den inhaltlichen.

Das ändert die Signatur von `GuessHueDataset.draw` und damit auch `GuessHueLabGame` (das Plan 4 löscht,
das aber jetzt kompilieren muss). Und es macht einen bisher schwachen Test stark: „der Payload bewegt
sich nicht, wenn sich nur der Lösungsstrom ändert“ ist ein Beweis der Eigenschaft und ersetzt die
gerundete Offset-Heuristik aus Plan 2.

---

## File Structure

**Neu:**

| Datei | Verantwortung |
|---|---|
| `core/src/main/resources/db/migration/game/V2__create_round_plays.sql` | Tabelle, Unique-Index, FKs auf `game.round_games` und `iam.users` |
| `core/src/main/kotlin/…/game/internal/RoundPlay.kt` | die Entity + `PlayPoints`-Projektion |
| `core/src/main/kotlin/…/game/internal/RoundPlayRepository.kt` | Aufdeck-Upsert, Tipp-`UPDATE`, Lesen, Punkte-Projektion |
| `core/src/main/kotlin/…/game/internal/GameRandom.kt` | die zwei Ströme, getrennt nach Veröffentlichung |
| `core/src/main/kotlin/…/game/internal/Scoring.kt` | `Verdict` + `pointsFor` — die Vergabe als reine Funktion |
| `core/src/main/kotlin/…/game/internal/RoundScoring.kt` | Neuauswertung: liest alle Tipps, schreibt alle `points`, loggt Verluste |
| `core/src/main/kotlin/…/game/internal/CurrentRound.kt` | das aufgelöste Ergebnis (`NoGame` \| `Announced`), gemeinsam für alle drei Endpunkte |
| `core/src/main/kotlin/…/game/internal/RoundResponses.kt` | baut `RoundResponse` samt Sichtbarkeits-Toren |
| `core/src/main/kotlin/…/game/internal/PlayService.kt` | Aufdecken und Tippen |
| `core/src/main/kotlin/…/game/internal/RoundPlayPoints.kt` | echte Standings über den aktiven Durchlauf |
| `core/src/main/kotlin/…/game/internal/MemberPointsConfiguration.kt` | umgezogen aus `community.internal`, entscheidet echt/Stub |
| `core/src/main/kotlin/…/game/internal/StubMemberPoints.kt` | umgezogen aus `community.internal`, unverändert |
| `.claude/guidelines/game-rounds.md` | die übertragbaren Regeln aus Scheibe 1–3 |

**Geändert:**

| Datei | Änderung |
|---|---|
| `…/guesshue/GuessHueDataset.kt` | `draw(solution, presentation)`, Zug-Reihenfolge je Strom |
| `…/game/internal/GameType.kt` | `judge`, `solution`, `Judgement`, `GameOutcome`, `GameSolution`; `draw` nimmt `GameRandom` |
| `…/game/internal/GameCatalog.kt` | `GameTypeHandle.judge`/`.solution`, gemeinsames `paramsOf` |
| `…/game/internal/GuessHueGameType.kt` | `judge`, `solution`, `GuessHueOutcome`, `GuessHueSolution`, Payload-KDoc |
| `…/game/internal/RoundGameRepository.kt` | `findByIdForUpdate` |
| `…/game/internal/RoundGameStore.kt` | `lock` |
| `…/game/internal/Award.kt` | `windowReasonOf(edition, roundNumber)`-Overload |
| `…/game/internal/AnnouncementService.kt` | `resolve` liefert `CurrentRound`; Antwortbau wandert in `RoundResponses` |
| `…/game/internal/RoundDtos.kt` | `PlayDto`, `RoundResponse` um `payload`/`solution`/`me`/`others` |
| `…/game/internal/RoundController.kt` | `POST …/current/reveal`, `POST …/current/guess` |
| `…/game/internal/GameExceptions.kt` + `GameExceptionHandler.kt` | 409/400 für die Spiel-Fehler |
| `…/gamelab/internal/GuessHueLabGame.kt` | Aufrufstelle der neuen `draw`-Signatur |
| `…/community/internal/MemberPointsConfiguration.kt`, `StubMemberPoints.kt`, `ZeroMemberPoints.kt` | zwei umgezogen, `ZeroMemberPoints` gelöscht |
| `docs/superpowers/specs/2026-08-11-round-game-selection-design.md` | Zwei-Strom-Absatz: umgesetzt, Schnitt nach Veröffentlichung |
| `.claude/guidelines/README.md`, `CLAUDE.md` | Index-Eintrag für `game-rounds.md` |

**Tests neu:** `RoundPlayRepositoryTest`, `ScoringTest`, `RoundScoringTest`, `RoundLockTest`, `PlayServiceTest`, `RoundPlayPointsTest`.
**Tests geändert:** `GuessHueDrawTest`, `GuessHueGameTypeTest`, `GameCatalogTest`, `GuessHueLabGameTest`, `RoundControllerTest`, `AnnouncementServiceTest`, `MemberPointsTest`, `MemberPointsConfigurationTest` (die letzten zwei ziehen mit den Klassen um).

---

## Task 1: `game.round_plays` — Tabelle, Entity, Aufdeck-Upsert, Tipp-`UPDATE`

Nach dieser Task existiert die Tabelle mit ihren beiden Statements: Aufdecken ist idempotent, und „ein Tipp pro Spieler und Runde“ ist ein atomares `UPDATE`. Kein Service, kein Endpunkt, kein Urteil.

**Files:**
- Create: `core/src/main/resources/db/migration/game/V2__create_round_plays.sql`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlay.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlayRepository.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundPlayRepositoryTest.kt`

**Interfaces:**
- Consumes: `RoundGameStore.announce(edition, roundNumber, gameType, params, award, announcedAt)`, `Award`, `AwardRule`, `CommunityEdition`, `CommunityRepository`/`CommunityEditionRepository`/`UserRepository` **nur in Tests**, `TestcontainersConfiguration`, `tools.jackson.databind.ObjectMapper`.
- Produces:
  - `RoundPlay(id: UUID? = null, roundGameId: UUID, userId: UUID, revealedAt: Instant, revealCount: Int = 1, guess: JsonNode? = null, guessedAt: Instant? = null, qualifies: Boolean? = null, deviation: Double? = null, outcome: JsonNode? = null, points: Int? = null)`
  - `PlayPoints(userId: UUID, roundNumber: Int, points: Int)` — die Projektion, benutzt erst in Task 6
  - `RoundPlayRepository.findByRoundGameIdAndUserId(roundGameId: UUID, userId: UUID): RoundPlay?`
  - `RoundPlayRepository.findByRoundGameId(roundGameId: UUID): List<RoundPlay>`
  - `RoundPlayRepository.revealOrCount(roundGameId: UUID, userId: UUID, revealedAt: Instant): Int`
  - `RoundPlayRepository.recordGuess(id: UUID, guess: JsonNode, guessedAt: Instant, qualifies: Boolean, deviation: Double, outcome: JsonNode?): Int`

- [ ] **Step 1: Migration schreiben**

`core/src/main/resources/db/migration/game/V2__create_round_plays.sql`:

```sql
CREATE TABLE game.round_plays (
    id             UUID              PRIMARY KEY DEFAULT uuidv7(),
    round_game_id  UUID              NOT NULL REFERENCES game.round_games(id) ON DELETE CASCADE,
    -- Cross-schema FK, allowed because `game` depends on `iam` in code (AuthenticatedUser at the
    -- controller), so Modulith migrates iam first. See modules-and-migrations.md.
    user_id        UUID              NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
    -- The clock, set on the first reveal and never reset: a second reveal only bumps the counter.
    revealed_at    TIMESTAMPTZ       NOT NULL,
    -- A signal, not a lockout: repeated reveals are counted and logged, not punished.
    reveal_count   INT               NOT NULL DEFAULT 1,
    -- NULL = not guessed yet. The server stamps guessed_at, never the client.
    guess          JSONB             NULL,
    guessed_at     TIMESTAMPTZ       NULL,
    -- The game's verdict: eligible for points at all, and how far off. Both stay server-side; what
    -- the player is told is `outcome`, in the game's own words.
    qualifies      BOOLEAN           NULL,
    deviation      DOUBLE PRECISION  NULL,
    outcome        JSONB             NULL,
    -- A cache over the round's frozen award rule and every verdict of the round, not a verdict:
    -- NULL = has not guessed, 0 = guessed and came away empty.
    points         INT               NULL,
    -- This index IS the rule "one guess per player and round" — there is no check in a service.
    UNIQUE (round_game_id, user_id)
);

CREATE INDEX idx_round_plays_user ON game.round_plays (user_id);
```

- [ ] **Step 2: Entity und Projektion schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlay.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

/**
 * One player's involvement in one round: the clock, the guess, the verdict, the points.
 *
 * The row is created on the **first reveal**, not on the guess — the clock has to start when the
 * player sees the round, and a guess without a reveal is not a meaningful request.
 *
 * [qualifies] and [deviation] are the game's verdict and the framework's only comparison values;
 * they never leave the server. [outcome] is the game-shaped version the player is told, [points] the
 * cache the standings sum over. All four are `null` until there is a guess.
 *
 * No `@CreatedDate` on [revealedAt]: both writes are custom SQL (see [RoundPlayRepository]) and
 * Spring Data auditing only runs for `save()`. The caller stamps from the `Clock` bean.
 */
@Table(schema = "game", name = "round_plays")
data class RoundPlay(
    @Id
    val id: UUID? = null,
    val roundGameId: UUID,
    val userId: UUID,
    val revealedAt: Instant,
    val revealCount: Int = 1,
    val guess: JsonNode? = null,
    val guessedAt: Instant? = null,
    val qualifies: Boolean? = null,
    val deviation: Double? = null,
    val outcome: JsonNode? = null,
    val points: Int? = null,
)

/** One scored guess, reduced to what a standings sum needs: whose, which round, how much. */
data class PlayPoints(val userId: UUID, val roundNumber: Int, val points: Int)
```

- [ ] **Step 3: Den Test für das Aufdecken schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/game/RoundPlayRepositoryTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

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
import org.unividuell.countdown.core.game.internal.Award
import org.unividuell.countdown.core.game.internal.AwardRule
import org.unividuell.countdown.core.game.internal.RoundGame
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class RoundPlayRepositoryTest(
    @Autowired val plays: RoundPlayRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    private val revealedAt = Instant.parse("2026-08-12T10:00:00Z")
    private val guessedAt = Instant.parse("2026-08-12T10:05:00Z")

    private fun json(raw: String): JsonNode = mapper.readTree(raw)

    private fun aUser(): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = "player")).id)

    private fun aRound(slug: String, roundNumber: Int = 12): RoundGame {
        val creator = aUser()
        val community = communities.save(Community(name = slug, slug = slug, createdBy = creator))
        val edition = editions.save(
            CommunityEdition(communityId = requireNotNull(community.id), label = "Run 2026"),
        )
        return store.announce(
            edition = edition,
            roundNumber = roundNumber,
            gameType = "guess-hue",
            params = json("""{"hue":42.0}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
            announcedAt = revealedAt,
        )
    }

    @Test
    fun `revealing creates the row with the clock running and nothing guessed`() {
        val round = aRound("rp-reveal")
        val user = aUser()

        plays.revealOrCount(
            roundGameId = requireNotNull(round.id), userId = user, revealedAt = revealedAt,
        ) shouldBe 1

        val play = plays.findByRoundGameIdAndUserId(
            roundGameId = requireNotNull(round.id), userId = user,
        ).shouldNotBeNull()
        play.revealedAt shouldBe revealedAt
        play.revealCount shouldBe 1
        play.guess.shouldBeNull()
        play.guessedAt.shouldBeNull()
        play.points.shouldBeNull()
    }

    @Test
    fun `revealing again counts up and leaves the first timestamp alone`() {
        val round = aRound("rp-again")
        val user = aUser()
        plays.revealOrCount(roundGameId = requireNotNull(round.id), userId = user, revealedAt = revealedAt)

        // A refresh must not restart the clock — that timestamp is the round's only time evidence.
        plays.revealOrCount(
            roundGameId = requireNotNull(round.id),
            userId = user,
            revealedAt = revealedAt.plusSeconds(600),
        )

        val play = plays.findByRoundGameIdAndUserId(
            roundGameId = requireNotNull(round.id), userId = user,
        ).shouldNotBeNull()
        play.revealedAt shouldBe revealedAt
        play.revealCount shouldBe 2
        plays.findByRoundGameId(requireNotNull(round.id)) shouldHaveSize 1
    }
}
```

- [ ] **Step 4: Test laufen lassen — er muss scheitern**

Run: `cd core && ./mvnw test -Dtest='RoundPlayRepositoryTest'`
Expected: FAIL, `RoundPlayRepository` existiert nicht (Kompilierfehler).

- [ ] **Step 5: Repository schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlayRepository.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

interface RoundPlayRepository : CrudRepository<RoundPlay, UUID> {

    fun findByRoundGameIdAndUserId(roundGameId: UUID, userId: UUID): RoundPlay?

    /**
     * Every play of one round, at most as many rows as the community has members.
     *
     * A derived `findBy…` carries **no** `ORDER BY`, so the order is not stable between calls —
     * anything user-visible sorts in code (see persistence.md).
     */
    fun findByRoundGameId(roundGameId: UUID): List<RoundPlay>

    /**
     * Reveal, idempotently: create the row on the first call, count up on every later one.
     *
     * One statement rather than read-then-write, and `DO UPDATE` rather than `DO NOTHING`, because
     * the counter is the point: `revealed_at` stays the first timestamp — it is the round's clock —
     * while `reveal_count` records that somebody looked again. No lockout: Guess Hue has no time
     * scoring, so a refresh buys a trickster nothing, while a lockout would only punish bad wifi.
     *
     * Inside `ON CONFLICT DO UPDATE` the existing row is addressed by the **table name without its
     * schema** (`round_plays.reveal_count`); `game.round_plays.reveal_count` is not a valid
     * reference there.
     */
    @Modifying
    @Query(
        """
        INSERT INTO game.round_plays (round_game_id, user_id, revealed_at)
        VALUES (:roundGameId, :userId, :revealedAt)
        ON CONFLICT (round_game_id, user_id)
            DO UPDATE SET reveal_count = round_plays.reveal_count + 1
        """,
    )
    fun revealOrCount(roundGameId: UUID, userId: UUID, revealedAt: Instant): Int

    /**
     * Record the one guess. **This statement is the rule "one guess per player and round"** — not a
     * check in a service: `WHERE guessed_at IS NULL` makes a second attempt affect zero rows, and
     * zero rows is what the caller turns into a 409.
     *
     * `points` is deliberately not written here. It is a function of *all* verdicts of the round and
     * is written by the re-evaluation that follows, for every guessed row at once.
     */
    @Modifying
    @Query(
        """
        UPDATE game.round_plays
        SET guess = :guess, guessed_at = :guessedAt, qualifies = :qualifies,
            deviation = :deviation, outcome = :outcome
        WHERE id = :id AND guessed_at IS NULL
        """,
    )
    fun recordGuess(
        id: UUID,
        guess: JsonNode,
        guessedAt: Instant,
        qualifies: Boolean,
        deviation: Double,
        outcome: JsonNode?,
    ): Int
}
```

- [ ] **Step 6: Test laufen lassen — die zwei Aufdeck-Tests müssen grün sein**

Run: `cd core && ./mvnw test -Dtest='RoundPlayRepositoryTest'`
Expected: PASS.

Scheitert die Migration mit „relation iam.users does not exist“, ist `application-modules.json` unter
`target` stale: `cd core && ./mvnw clean test -Dtest='RoundPlayRepositoryTest'` und danach weiter.

- [ ] **Step 7: Die Tipp-Tests ergänzen**

In `RoundPlayRepositoryTest` anfügen:

```kotlin
    @Test
    fun `recording a guess stores the tree and the verdict`() {
        val round = aRound("rp-guess")
        val user = aUser()
        plays.revealOrCount(roundGameId = requireNotNull(round.id), userId = user, revealedAt = revealedAt)
        val play = plays.findByRoundGameIdAndUserId(
            roundGameId = requireNotNull(round.id), userId = user,
        ).shouldNotBeNull()

        plays.recordGuess(
            id = requireNotNull(play.id),
            guess = json("""{"hue":123.5}"""),
            guessedAt = guessedAt,
            qualifies = true,
            deviation = 4.25,
            outcome = json("""{"deviationDeg":4.25}"""),
        ) shouldBe 1

        val stored = plays.findByRoundGameIdAndUserId(
            roundGameId = requireNotNull(round.id), userId = user,
        ).shouldNotBeNull()
        stored.guess shouldBe json("""{"hue":123.5}""")
        stored.guessedAt shouldBe guessedAt
        stored.qualifies shouldBe true
        stored.deviation shouldBe 4.25
        stored.outcome shouldBe json("""{"deviationDeg":4.25}""")
        // Still null: the points come from the round's re-evaluation, not from this statement.
        stored.points.shouldBeNull()
    }

    @Test
    fun `a game without an outcome stores SQL NULL rather than a json null`() {
        // A game that validates without saying anything about the guess is allowed — and `outcome`
        // has to end up as SQL NULL, not as the jsonb value 'null', or "has an outcome" would be
        // true for it.
        val round = aRound("rp-no-outcome")
        val user = aUser()
        plays.revealOrCount(roundGameId = requireNotNull(round.id), userId = user, revealedAt = revealedAt)
        val play = plays.findByRoundGameIdAndUserId(
            roundGameId = requireNotNull(round.id), userId = user,
        ).shouldNotBeNull()

        plays.recordGuess(
            id = requireNotNull(play.id), guess = json("""{"hue":1.0}"""), guessedAt = guessedAt,
            qualifies = false, deviation = 180.0, outcome = null,
        ) shouldBe 1

        plays.findByRoundGameIdAndUserId(
            roundGameId = requireNotNull(round.id), userId = user,
        ).shouldNotBeNull().outcome.shouldBeNull()
    }

    @Test
    fun `a second guess changes nothing and reports zero rows`() {
        val round = aRound("rp-second")
        val user = aUser()
        plays.revealOrCount(roundGameId = requireNotNull(round.id), userId = user, revealedAt = revealedAt)
        val play = requireNotNull(
            plays.findByRoundGameIdAndUserId(roundGameId = requireNotNull(round.id), userId = user),
        )
        plays.recordGuess(
            id = requireNotNull(play.id), guess = json("""{"hue":10.0}"""), guessedAt = guessedAt,
            qualifies = true, deviation = 1.0, outcome = null,
        )

        val again = plays.recordGuess(
            id = requireNotNull(play.id), guess = json("""{"hue":20.0}"""),
            guessedAt = guessedAt.plusSeconds(60), qualifies = true, deviation = 0.5, outcome = null,
        )

        again shouldBe 0
        val stored = requireNotNull(
            plays.findByRoundGameIdAndUserId(roundGameId = requireNotNull(round.id), userId = user),
        )
        stored.guess shouldBe json("""{"hue":10.0}""")
        stored.deviation shouldBe 1.0
    }

    @Test
    fun `two players of the same round each get their own row`() {
        val round = aRound("rp-two-players")
        val first = aUser()
        val second = aUser()

        plays.revealOrCount(roundGameId = requireNotNull(round.id), userId = first, revealedAt = revealedAt)
        plays.revealOrCount(roundGameId = requireNotNull(round.id), userId = second, revealedAt = revealedAt)

        plays.findByRoundGameId(requireNotNull(round.id)) shouldHaveSize 2
    }

    @Test
    fun `the same player in two rounds gets two rows`() {
        val round = aRound("rp-two-rounds", roundNumber = 12)
        val edition = requireNotNull(editions.findActiveByCommunityId(round.let { requireNotNull(it.editionId) }))
        val other = store.announce(
            edition = edition, roundNumber = 11, gameType = "guess-hue",
            params = json("""{"hue":7.0}"""), award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
            announcedAt = revealedAt,
        )
        val user = aUser()

        plays.revealOrCount(roundGameId = requireNotNull(round.id), userId = user, revealedAt = revealedAt)
        plays.revealOrCount(roundGameId = requireNotNull(other.id), userId = user, revealedAt = revealedAt)

        plays.findByRoundGameId(requireNotNull(round.id)) shouldHaveSize 1
        plays.findByRoundGameId(requireNotNull(other.id)) shouldHaveSize 1
    }
```

Der letzte Test braucht die Edition zur bestehenden Runde. `CommunityEditionRepository.findActiveByCommunityId`
nimmt eine Community-ID, nicht eine Edition-ID — hol die Edition daher über
`editions.findById(requireNotNull(round.editionId))`:

```kotlin
        val edition = requireNotNull(editions.findById(round.editionId).orElse(null))
```

Ersetze die Zeile mit `findActiveByCommunityId` durch diese; `aRound` gibt die Runde zurück, und
`round.editionId` ist die Edition, in der sie hängt.

- [ ] **Step 8: Tests laufen lassen**

Run: `cd core && ./mvnw test -Dtest='RoundPlayRepositoryTest'`
Expected: PASS, 7 Tests.

Scheitert `a game without an outcome stores SQL NULL` an der Parameterbindung („could not determine data
type“), dann — und nur dann — `SET outcome = CAST(:outcome AS jsonb)` schreiben und den Parameter als
`String?` (`outcome?.toString()`) binden. Der Rest bleibt `JsonNode`.

- [ ] **Step 9: Ganze Suite laufen lassen**

Run: `cd core && ./mvnw test`
Expected: PASS, keine Regression.

- [ ] **Step 10: Committen**

```bash
git add core/src/main/resources/db/migration/game/V2__create_round_plays.sql core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlay.kt core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlayRepository.kt core/src/test/kotlin/org/unividuell/countdown/core/game/RoundPlayRepositoryTest.kt
git commit -m "feat(game): add round_plays with an idempotent reveal and a single-guess update"
```

---

## Task 2: Zwei unabhängig geseedete Ströme

Nach dieser Task zieht jedes Spiel aus zwei Strömen: `presentation` für alles, was veröffentlicht wird, `solution` für das Geheimnis. Kein neues Verhalten nach außen — aber die Eigenschaft, die die nächste Task ausliefern darf.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameRandom.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDataset.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameType.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameCatalog.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GuessHueGameType.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/AnnouncementService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/GuessHueLabGame.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDrawTest.kt` (geändert)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GuessHueGameTypeTest.kt` (geändert)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GameCatalogTest.kt` (geändert)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/GuessHueLabGameTest.kt` (geändert)

**Interfaces:**
- Consumes: `SeededRandom.fromSeed(seed: Int)`, `SeededRandom.pick(items)`, `SeededRandom.nextDouble()`, `java.security.SecureRandom`.
- Produces:
  - `GameRandom(solution: SeededRandom, presentation: SeededRandom)` mit `GameRandom.independent(source: SecureRandom): GameRandom`
  - `GuessHueDataset.draw(solution: SeededRandom, presentation: SeededRandom): GuessHueTarget`
  - `GameType<P>.draw(random: GameRandom, context: RoundContext): P`
  - `GameTypeHandle<P>.draw(random: GameRandom, context: RoundContext): JsonNode`

- [ ] **Step 1: Den Beweis-Test schreiben, bevor es die zwei Ströme gibt**

In `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDrawTest.kt` anfügen (Imports
ergänzen: `io.kotest.matchers.collections.shouldHaveSize`, `io.kotest.matchers.ints.shouldBeGreaterThan`):

```kotlin
    @Test
    fun `the presentation values come from the presentation stream and the hue does not`() {
        // The split is by publication: everything the player is shown is drawn from one stream, the
        // jitter that hides the answer from the other. Holding one stream fixed while varying the
        // other is what proves the split — no rounding, no heuristics.
        val varyingSolution = (1..20).map { seed ->
            dataset.draw(solution = SeededRandom.fromSeed(seed), presentation = SeededRandom.fromSeed(4711))
        }

        varyingSolution.map { Triple(it.entry, it.saturation, it.lightness) }.distinct() shouldHaveSize 1
        varyingSolution.map { it.initHue }.distinct() shouldHaveSize 1
        varyingSolution.map { it.hue }.distinct().size shouldBeGreaterThan 1
    }

    @Test
    fun `a different presentation stream redraws everything the player sees, and nothing else`() {
        val first = dataset.draw(
            solution = SeededRandom.fromSeed(7), presentation = SeededRandom.fromSeed(1),
        )
        val second = dataset.draw(
            solution = SeededRandom.fromSeed(7), presentation = SeededRandom.fromSeed(2),
        )

        // Same secret stream, so the jitter is identical; a different entry means a different hue,
        // which is why only the jitter itself can be compared here.
        (first.initHue == second.initHue) shouldBe false
        (first.hue - first.entry.hue) shouldBe (second.hue - second.entry.hue)
    }
```

Der Jitter-Vergleich `hue - entry.hue` ist nur gültig, solange `wrap360` nicht greift; wähle die Seeds
so, dass beide Einträge eine Nominal-Hue ≥ 10 und ≤ 350 haben — der Beispieldatensatz erfüllt das für
Seed 1 und 2. Schlägt der Vergleich fehl, weil ein Eintrag am Rand liegt, vergleiche stattdessen
`((first.hue - first.entry.hue) % 360.0 + 360.0) % 360.0` auf beiden Seiten.

- [ ] **Step 2: Test laufen lassen — er muss scheitern**

Run: `cd core && ./mvnw test -Dtest='GuessHueDrawTest'`
Expected: FAIL, `draw` nimmt kein `presentation` (Kompilierfehler).

- [ ] **Step 3: `GuessHueDataset.draw` auf zwei Ströme umstellen**

In `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDataset.kt` `draw` ersetzen:

```kotlin
    /**
     * **The draw order is a contract, per stream.** [presentation] draws entry, saturation,
     * lightness and start angle in that order; [solution] draws the jitter. Reorder either and every
     * round derived from the same pair of seeds changes.
     *
     * Two streams, split by **publication** rather than by importance: everything the player is
     * shown comes from [presentation], and [solution] produces the round's only secret — the jitter.
     * One stream would not do, and not because a published value might equal the answer:
     * `SeededRandom.nextDouble` publishes 53 bits of two consecutive words and the generator's
     * transition is a bijection, so a few published doubles pin the state and let it be stepped
     * **backwards** to whatever the same stream drew for the solution. The entry belongs on the
     * published side for exactly that reason — its description is what the player reads.
     *
     * What remains after the split is not a generator problem: whoever knows the curated dataset can
     * read the nominal hue off the description. That is what game-content.md protects, not this.
     *
     * Only the existing [SeededRandom] API is used. A new method there would drag new golden vectors
     * along with it, for arithmetic that belongs here instead.
     */
    fun draw(solution: SeededRandom, presentation: SeededRandom): GuessHueTarget {
        val entry = presentation.pick(entries)
        val saturation = SATURATION_MIN + presentation.nextDouble() * (SATURATION_MAX - SATURATION_MIN)
        val lightness = LIGHTNESS_MIN + presentation.nextDouble() * (LIGHTNESS_MAX - LIGHTNESS_MIN)
        val initHue = presentation.nextDouble() * 360.0
        val jittered = entry.hue + solution.nextDouble() * (2 * JITTER_DEGREES) - JITTER_DEGREES

        return GuessHueTarget(
            entry = entry,
            hue = wrap360(jittered),
            saturation = saturation,
            lightness = lightness,
            initHue = initHue,
        )
    }
```

- [ ] **Step 4: Die bestehenden Aufrufstellen im Datensatz-Test nachziehen**

In `GuessHueDrawTest` einen Helfer einführen und alle alten `dataset.draw(SeededRandom.fromSeed(x))`
darauf umstellen:

```kotlin
    /**
     * Two streams from one test seed. Independence is what production needs, not what a draw test
     * asserts — these tests are about ranges and distribution, so a derived second seed is enough,
     * as long as it is not the same number (which would make both streams identical).
     */
    private fun drawWith(seed: Int) = dataset.draw(
        solution = SeededRandom.fromSeed(seed),
        presentation = SeededRandom.fromSeed(seed xor 0x5F5F5F5F.toInt()),
    )
```

Ersetze:
- `dataset.draw(SeededRandom.fromSeed("community-42/round-7"))` → `dataset.draw(solution = SeededRandom.fromSeed("community-42/round-7"), presentation = SeededRandom.fromSeed("community-42/round-7/p"))`
- `dataset.draw(SeededRandom.fromSeed(4711))` (beide Vorkommen im Reproduzierbarkeits-Test) → `drawWith(4711)`
- `dataset.draw(SeededRandom.fromSeed(seed))` in den Schleifen → `drawWith(seed)`
- `nearZero.draw(SeededRandom.fromSeed(it))` → `nearZero.draw(solution = SeededRandom.fromSeed(it), presentation = SeededRandom.fromSeed(it xor 0x5F5F5F5F.toInt()))`

- [ ] **Step 5: Test laufen lassen**

Run: `cd core && ./mvnw test -Dtest='GuessHueDrawTest'`
Expected: PASS.

- [ ] **Step 6: `GameRandom` schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameRandom.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.rng.SeededRandom
import java.security.SecureRandom

/**
 * The two independently seeded streams a round is drawn from, split by **publication**: everything
 * that reaches a client comes from [presentation], and [solution] draws only what stays here.
 *
 * Two and not one, because `SeededRandom` is invertible: `nextDouble` publishes 53 bits of two
 * consecutive words, the xoshiro128** transition is a bijection, so a few published doubles pin the
 * generator and let it be run **backwards** past the solution's own draws. Equality of values was
 * never the bar — sharing the stream is, and a value drawn *before* the solution narrows it just as
 * well as one drawn after.
 *
 * Read [presentation] as fully public. Anything drawn from it may end up in a payload — and the game
 * type picked for the round comes from it too, because that is announced as well.
 */
class GameRandom(val solution: SeededRandom, val presentation: SeededRandom) {

    companion object {
        /**
         * Two draws from a CSPRNG, neither stored. `SecureRandom`'s output is not invertible to its
         * state, which is precisely why two seeds may come from one source here while the two
         * `SeededRandom`s must never feed each other.
         */
        fun independent(source: SecureRandom) = GameRandom(
            solution = SeededRandom.fromSeed(source.nextInt()),
            presentation = SeededRandom.fromSeed(source.nextInt()),
        )
    }
}
```

- [ ] **Step 7: Den Vertrag und seine Implementierungen umstellen**

In `GameType.kt`: `fun draw(random: SeededRandom, context: RoundContext): P` → `fun draw(random: GameRandom, context: RoundContext): P`, Import `SeededRandom` entfernen. KDoc der Methode ergänzen:

```kotlin
    /**
     * Draw the round, once, at announce time. Everything the player will be shown must come from
     * [GameRandom.presentation] — see there for why that is not a stylistic preference.
     */
    fun draw(random: GameRandom, context: RoundContext): P
```

Im KDoc von `present` den Satz über den geteilten Strom durch die jetzt geltende Zusage ersetzen:

```kotlin
    /**
     * What the player sees. Must never carry the solution, and must be drawn from
     * [GameRandom.presentation] — a payload value from the solution's stream narrows the answer even
     * when it does not resemble it.
     */
    fun present(params: P): GamePayload
```

In `GameCatalog.kt`: `GameTypeHandle.draw(random: SeededRandom, …)` → `draw(random: GameRandom, …)`, Import tauschen.

In `GuessHueGameType.kt`:

```kotlin
    override fun draw(random: GameRandom, context: RoundContext): GuessHueParams {
        val target = dataset.draw(solution = random.solution, presentation = random.presentation)
        return GuessHueParams(
```

und den langen Warn-KDoc auf `GuessHuePayload` durch die jetzt zutreffende Fassung ersetzen:

```kotlin
/**
 * What the player needs in order to play: the text, and the colour the wheel starts on.
 *
 * `GuessHueParams.hue` — the answer — is absent as a field, and now genuinely independent of every
 * field that *is* here: all four are drawn from the presentation stream, the hue's jitter from the
 * solution stream, and the two streams are seeded independently (see `GameRandom`). Pinned by
 * `GuessHueDrawTest`, which holds one stream fixed while varying the other.
 *
 * A new field is still not free: it must come from the presentation stream, and the field-set test
 * below must name it.
 */
```

- [ ] **Step 8: Die Auflösung umstellen**

In `AnnouncementService.materialise`:

```kotlin
        val history = store.history(edition = edition, roundNumber = round.number)
        val random = GameRandom.independent(secureRandom)
        val typeId = selection.pick(
            candidates = catalog.ids(),
            // The chosen type is announced, so it is a published value and comes from the published
            // stream — the same rule that governs the payload.
            history = history,
            random = random.presentation,
        ) ?: run {
```

und weiter unten `handle.draw(random = random, context = …)` (der Parameter ist jetzt das `GameRandom`).
Import `SeededRandom` entfernen, falls unbenutzt.

- [ ] **Step 9: Das Lab-Spiel kompilierbar halten**

In `gamelab/internal/GuessHueLabGame.kt` einen privaten Helfer einführen und in `reveal` und `solution`
benutzen:

```kotlin
    /**
     * The dataset needs two streams. In the lab the seed travels in the URL, so nothing is secret
     * here and a derived second seed costs nothing — the point of the split is production. Plan 4
     * replaces this class with the real `GameType` adapter.
     */
    private fun target(seed: Int) = dataset.draw(
        solution = SeededRandom.fromSeed(seed),
        presentation = SeededRandom.fromSeed(seed xor 0x5F5F5F5F.toInt()),
    )
```

`reveal` und `solution` rufen `target(seed)` statt `dataset.draw(SeededRandom.fromSeed(seed))`.

- [ ] **Step 10: `GameCatalogTest` und `GuessHueLabGameTest` nachziehen**

In `GameCatalogTest`: `FakeGame.draw` bekommt die neue Signatur, `handle.draw` den neuen Parameter:

```kotlin
        override fun draw(random: GameRandom, context: RoundContext) =
            FakeParams(label = "$id-${context.roundNumber}", secret = random.solution.nextInt(1000))
```
```kotlin
        val json = handle.draw(
            random = GameRandom(
                solution = SeededRandom.fromSeed(7),
                presentation = SeededRandom.fromSeed(8),
            ),
            context = RoundContext(roundNumber = 12, phase = Phase.ONE),
        )
```

In `GuessHueLabGameTest` die zwei `dataset.draw(SeededRandom.fromSeed(4711))` durch dieselbe Ableitung
ersetzen, die das Lab-Spiel benutzt — sonst beschreiben Test und Spiel verschiedene Runden:

```kotlin
        val target = dataset.draw(
            solution = SeededRandom.fromSeed(4711),
            presentation = SeededRandom.fromSeed(4711 xor 0x5F5F5F5F.toInt()),
        )
```

- [ ] **Step 11: `GuessHueGameTypeTest` umstellen und den schwachen Test ersetzen**

Helfer anpassen:

```kotlin
    private fun draw(phase: Phase, seed: Int = 4711, presentationSeed: Int = 0x1234) =
        game.draw(
            random = GameRandom(
                solution = SeededRandom.fromSeed(seed),
                presentation = SeededRandom.fromSeed(presentationSeed),
            ),
            context = RoundContext(roundNumber = 12, phase = phase),
        )
```

Die zwei Tests `the payload's starting angle is not the solution` und `the starting angle's offset from
the solution is not fixed across seeds` **löschen** und durch den Beweis ersetzen — er impliziert beide:
ein aus `hue` abgeleitetes Payload-Feld müsste sich bewegen, wenn `hue` sich bewegt.

```kotlin
    @Test
    fun `nothing the player sees moves when only the secret stream changes`() {
        // Replaces the old identity check and the rounded-offset heuristic: with two streams the
        // property is provable rather than approximated. A payload field derived from `hue` in any
        // way — copy, fixed offset, hash — would move here, because `hue` does.
        val drawn = (1..20).map { seed -> draw(phase = Phase.ONE, seed = seed) }

        drawn.map { game.present(it) }.distinct() shouldHaveSize 1
        drawn.map { it.hue }.distinct().size shouldBeGreaterThan 1
    }
```

Imports: `io.kotest.matchers.collections.shouldHaveSize`, `io.kotest.matchers.ints.shouldBeGreaterThan`;
`shouldHaveAtLeastSize`, `kotlin.math.round` und `io.kotest.matchers.doubles.*` entfernen, falls unbenutzt.

- [ ] **Step 12: Alles laufen lassen**

Run: `cd core && ./mvnw test`
Expected: PASS. `AnnouncementServiceTest` und `GameSelectionTest` bleiben unberührt grün — die Auswahl
bekommt weiter einen `SeededRandom`, nur einen anderen.

- [ ] **Step 13: Committen**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameRandom.kt core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDataset.kt core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameType.kt core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameCatalog.kt core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GuessHueGameType.kt core/src/main/kotlin/org/unividuell/countdown/core/game/internal/AnnouncementService.kt core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/GuessHueLabGame.kt core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDrawTest.kt core/src/test/kotlin/org/unividuell/countdown/core/game/GuessHueGameTypeTest.kt core/src/test/kotlin/org/unividuell/countdown/core/game/GameCatalogTest.kt core/src/test/kotlin/org/unividuell/countdown/core/gamelab/GuessHueLabGameTest.kt
git commit -m "fix(game): draw a round from two independent streams, split by publication"
```

---

## Task 3: Das Urteil und die Lösung

Nach dieser Task kann ein Spiel einen Tipp beurteilen und seine Lösung herausgeben. Noch schreibt niemand etwas — der Vertrag und Guess Hues Antwort darauf stehen.

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameType.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameCatalog.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GuessHueGameType.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptions.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptionHandler.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GuessHueGameTypeTest.kt` (erweitert)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GameCatalogTest.kt` (erweitert)

**Interfaces:**
- Consumes: `GuessHueParams(description, hue, saturation, lightness, initHue, toleranceDeg)`, `GuessHueTolerance.DEGREES`, `tools.jackson.databind.JsonNode`.
- Produces:
  - `interface GameOutcome`, `interface GameSolution`
  - `data class Judgement(qualifies: Boolean, deviation: Double, outcome: GameOutcome?)`
  - `GameType<P>.judge(params: P, guess: JsonNode): Judgement` (abstrakt)
  - `GameType<P>.solution(params: P): GameSolution?` (Default `null`)
  - `GameTypeHandle<P>.judge(params: JsonNode, guess: JsonNode): Judgement`, `.solution(params: JsonNode): GameSolution?`
  - `GuessHueOutcome(deviationDeg: Double, withinTolerance: Boolean?)`, `GuessHueSolution(targetHue: Double, toleranceDeg: Double?)`
  - `InvalidGuessException(message: String)` → 400

- [ ] **Step 1: Die Urteils-Tests schreiben**

In `GuessHueGameTypeTest` anfügen (Imports: `io.kotest.assertions.throwables.shouldThrow`,
`io.kotest.matchers.doubles.plusOrMinus`, `org.unividuell.countdown.core.game.internal.GuessHueOutcome`,
`…internal.GuessHueSolution`, `…internal.InvalidGuessException`, `tools.jackson.databind.json.JsonMapper`
ist schon da):

```kotlin
    private fun guess(hue: Double) = mapper.readTree("""{"hue":$hue}""")

    @Test
    fun `in phase one the tolerance is the gate`() {
        val params = draw(phase = Phase.ONE)

        val inside = game.judge(params = params, guess = guess(params.hue))
        val outside = game.judge(params = params, guess = guess((params.hue + 40.0) % 360.0))

        inside.qualifies shouldBe true
        inside.deviation shouldBe (0.0 plusOrMinus 1e-9)
        outside.qualifies shouldBe false
        outside.deviation shouldBe (40.0 plusOrMinus 1e-9)
    }

    @Test
    fun `in phase two there is no gate at all, however far off the guess is`() {
        // Phase two has no tolerance: everybody qualifies and the closest one wins, which is the
        // framework's job. A guess 179 degrees off is still a candidate.
        val params = draw(phase = Phase.TWO)

        val judgement = game.judge(params = params, guess = guess((params.hue + 179.0) % 360.0))

        judgement.qualifies shouldBe true
        judgement.deviation shouldBe (179.0 plusOrMinus 1e-9)
    }

    @Test
    fun `the distance is the shorter way round the wheel, in both phases`() {
        val params = draw(phase = Phase.ONE).copy(hue = 10.0)

        // 350 to 10 is 20 degrees the short way, not 340.
        game.judge(params = params, guess = guess(350.0)).deviation shouldBe (20.0 plusOrMinus 1e-9)
        game.judge(params = params.copy(hue = 350.0), guess = guess(10.0))
            .deviation shouldBe (20.0 plusOrMinus 1e-9)
    }

    @Test
    fun `the outcome is what the player is told, in the game's own words`() {
        val params = draw(phase = Phase.ONE)

        val hit = game.judge(params = params, guess = guess(params.hue)).outcome as GuessHueOutcome
        val phaseTwo = game.judge(params = draw(phase = Phase.TWO), guess = guess(0.0)).outcome as GuessHueOutcome

        hit.deviationDeg shouldBe (0.0 plusOrMinus 1e-9)
        hit.withinTolerance shouldBe true
        // No gate in phase two, so there is nothing to be inside of — null rather than a made-up true.
        phaseTwo.withinTolerance.shouldBeNull()
    }

    @Test
    fun `a malformed guess is rejected before anything can be written`() {
        val params = draw(phase = Phase.ONE)

        shouldThrow<InvalidGuessException> { game.judge(params = params, guess = mapper.readTree("""{}""")) }
        shouldThrow<InvalidGuessException> {
            game.judge(params = params, guess = mapper.readTree("""{"hue":"warm"}"""))
        }
        shouldThrow<InvalidGuessException> { game.judge(params = params, guess = guess(360.0)) }
        shouldThrow<InvalidGuessException> { game.judge(params = params, guess = guess(-0.5)) }
    }

    @Test
    fun `the solution carries exactly the answer and the arc, and nothing else`() {
        // Second exit out of the server, pinned like the payload: a field added here reaches every
        // player who has guessed.
        val json = mapper.writeValueAsString(game.solution(draw(phase = Phase.ONE)))

        mapper.readTree(json).propertyNames().toSet() shouldBe setOf("targetHue", "toleranceDeg")
    }

    @Test
    fun `phase two has no arc to draw`() {
        val params = draw(phase = Phase.TWO)

        val solution = game.solution(params) as GuessHueSolution

        solution.targetHue shouldBe params.hue
        solution.toleranceDeg.shouldBeNull()
    }
```

- [ ] **Step 2: Tests laufen lassen — sie müssen scheitern**

Run: `cd core && ./mvnw test -Dtest='GuessHueGameTypeTest'`
Expected: FAIL, `judge`/`solution` existieren nicht (Kompilierfehler).

- [ ] **Step 3: Den Vertrag erweitern**

In `GameType.kt` ergänzen (nach `GamePayload`):

```kotlin
/**
 * What the server computed about a guess, in the game's own words — the only thing the player is
 * told about their result. The framework's own comparison values (`qualifies`, `deviation`) stay
 * inside: a generic "this far off" field would be a third way out of the server next to
 * [GamePayload] and [GameSolution], and those we want countable.
 */
interface GameOutcome

/**
 * What a game may show once the viewer has spent their guess — the solution, and whatever else is
 * only meaningful next to it. A second way out, separate from [GamePayload] on purpose: putting it in
 * the payload would also put it in front of the guess, and the payload's field-set test would lose
 * its meaning.
 */
interface GameSolution

/**
 * What a game may say about a guess — and only that.
 *
 * **The game judges, the framework awards.** How many points a guess is worth, and whether it takes
 * somebody else's away, is the same for every game and lives in `awardFor` and `pointsFor`.
 */
data class Judgement(
    /** Eligible for points at all: Guess Hue's tolerance in phase one, unconditionally true in two. */
    val qualifies: Boolean,
    /**
     * Distance from the solution, smaller is better, `0.0` = perfect. The one value the framework
     * must be able to **compare** without being able to **compute** it. A pure right/wrong game
     * returns `0.0` for every hit — then all hits are level, and that is enough.
     */
    val deviation: Double,
    val outcome: GameOutcome?,
)
```

und in `interface GameType<P : Any>`:

```kotlin
    /**
     * Judge [guess] against the frozen params. Throws [InvalidGuessException] on a malformed or
     * out-of-range guess — **before** anything is written, so a typo does not consume the one
     * attempt the player has.
     */
    fun judge(params: P, guess: JsonNode): Judgement

    /**
     * What may be shown once the viewer has guessed. `null` — the default — is a game that reveals
     * nothing, and the default is right here because it is the safe direction: a game that
     * implements nothing gives nothing away.
     */
    fun solution(params: P): GameSolution? = null
```

Import `tools.jackson.databind.JsonNode` ergänzen.

- [ ] **Step 4: Den Handle erweitern**

In `GameCatalog.kt`, `GameTypeHandle`:

```kotlin
    /** What the player sees, from a stored `params` blob. */
    fun present(params: JsonNode): GamePayload = type.present(paramsOf(params))

    /** The game's verdict on a guess. Throws on an invalid guess; nothing is written before this. */
    fun judge(params: JsonNode, guess: JsonNode): Judgement =
        type.judge(params = paramsOf(params), guess = guess)

    /** What may be shown after the viewer's own guess, or `null` for a game that reveals nothing. */
    fun solution(params: JsonNode): GameSolution? = type.solution(paramsOf(params))

    /** The one place the `params` column and this game's `P` meet. */
    private fun paramsOf(params: JsonNode): P = mapper.treeToValue(params, type.paramsType)
```

- [ ] **Step 5: Die Exception und ihren Status ergänzen**

In `GameExceptions.kt`:

```kotlin
/**
 * The game rejected the guess's shape or range → 400. Thrown by `judge` before anything is
 * persisted: a typo must not consume the player's single attempt.
 */
class InvalidGuessException(message: String) : RuntimeException(message)
```

In `GameExceptionHandler.kt`:

```kotlin
    @ExceptionHandler(InvalidGuessException::class)
    fun badRequest(e: RuntimeException) =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.message ?: "invalid guess")
```

- [ ] **Step 6: Guess Hue urteilen und lösen lassen**

In `GuessHueGameType.kt` ergänzen — Outcome und Solution als eigene Typen, danach die zwei Methoden:

```kotlin
/**
 * What the player learns about their guess: how far off, and — in phase one — whether that was inside
 * the arc. `withinTolerance` is `null` in phase two, because there is no gate to be inside of; a
 * `false` there would claim a verdict the round never made.
 */
data class GuessHueOutcome(val deviationDeg: Double, val withinTolerance: Boolean?) : GameOutcome

/**
 * What the round looked like, once the player has spent their guess: the angle that was sought and how
 * wide around it counted. Leaves the server through `RoundResponse.solution`, never the payload.
 *
 * [toleranceDeg] is `null` in phase two — nothing to draw, because nothing was required.
 */
data class GuessHueSolution(val targetHue: Double, val toleranceDeg: Double?) : GameSolution
```

```kotlin
    /**
     * The angle is read as a number in `[0, 360)`, not as an integer: an angle is not an enumeration,
     * and an input method with a finer resolution must not fail here.
     */
    override fun judge(params: GuessHueParams, guess: JsonNode): Judgement {
        val hue = guess.get("hue")
            ?.takeIf { it.isNumber }
            ?.asDouble()
            ?: throw InvalidGuessException("guess must carry a numeric 'hue'")
        if (hue < 0.0 || hue >= 360.0) throw InvalidGuessException("hue must lie in [0, 360), was $hue")

        val deviation = distanceOnCircle(a = hue, b = params.hue)
        val tolerance = params.toleranceDeg
        return Judgement(
            // No gate in phase two: everybody is a candidate, and the framework's CLOSEST_ONLY picks
            // the winner. In phase one the inherited tolerance decides.
            qualifies = tolerance == null || deviation <= tolerance,
            deviation = deviation,
            outcome = GuessHueOutcome(
                deviationDeg = deviation,
                withinTolerance = tolerance?.let { deviation <= it },
            ),
        )
    }

    override fun solution(params: GuessHueParams) = GuessHueSolution(
        targetHue = params.hue,
        toleranceDeg = params.toleranceDeg,
    )
}

/** The original's `distanceOnCircle`: the shorter way round the wheel, so 350 to 10 is 20 degrees. */
private fun distanceOnCircle(a: Double, b: Double): Double {
    val d = ((a - b) % 360.0 + 360.0) % 360.0
    return if (d > 180.0) 360.0 - d else d
}
```

Import `tools.jackson.databind.JsonNode` ergänzen. Die schließende Klammer der Klasse rutscht vor
`distanceOnCircle` — die Funktion ist top-level und privat auf Datei-Ebene.

- [ ] **Step 7: Den Fake im Katalog-Test mitziehen**

`GameCatalogTest.FakeGame` muss `judge` implementieren (abstrakt) und darf `solution` zeigen, damit der
Handle-Pfad getestet ist:

```kotlin
    data class FakeOutcome(val seen: String) : GameOutcome
    data class FakeSolution(val secret: Int) : GameSolution

    private class FakeGame(override val id: String) : GameType<FakeParams> {
        override val displayName = "Fake $id"
        override val paramsType = FakeParams::class.java
        override fun draw(random: GameRandom, context: RoundContext) =
            FakeParams(label = "$id-${context.roundNumber}", secret = random.solution.nextInt(1000))
        override fun present(params: FakeParams) = FakePayload(label = params.label)
        override fun judge(params: FakeParams, guess: JsonNode) = Judgement(
            qualifies = guess.get("ok")?.asBoolean() == true,
            deviation = 0.0,
            outcome = FakeOutcome(seen = params.label),
        )
        override fun solution(params: FakeParams) = FakeSolution(secret = params.secret)
    }
```

Und ein Test, dass der Handle beide neuen Wege durch die JSON-Grenze trägt:

```kotlin
    @Test
    fun `the handle judges and solves from a stored params blob`() {
        val handle = catalog(FakeGame("alpha")).handle("alpha").shouldNotBeNull()
        val params = handle.draw(
            random = GameRandom(
                solution = SeededRandom.fromSeed(7),
                presentation = SeededRandom.fromSeed(8),
            ),
            context = RoundContext(roundNumber = 12, phase = Phase.ONE),
        )

        val judgement = handle.judge(params = params, guess = mapper.readTree("""{"ok":true}"""))

        judgement.qualifies shouldBe true
        judgement.outcome shouldBe FakeOutcome(seen = "alpha-12")
        handle.solution(params).shouldNotBeNull()
    }
```

Imports ergänzen: `…internal.GameOutcome`, `…internal.GameSolution`, `…internal.Judgement`,
`tools.jackson.databind.JsonNode`.

- [ ] **Step 8: Alles laufen lassen**

Run: `cd core && ./mvnw test`
Expected: PASS.

- [ ] **Step 9: Committen**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/ core/src/test/kotlin/org/unividuell/countdown/core/game/
git commit -m "feat(game): let a game judge a guess and reveal its solution"
```

---

## Task 4: Die Vergabe — reine Funktion, Neuauswertung, Serialisierung

Nach dieser Task rechnet das Framework die Punkte einer ganzen Runde aus persistierten Urteilen, schreibt sie über **alle** getippten Zeilen und serialisiert sich dabei über eine Zeilensperre auf der Runde. Noch ruft das niemand — der Tipp-Pfad kommt in Task 5.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/Scoring.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundScoring.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameRepository.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameStore.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/ScoringTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundScoringTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundLockTest.kt`

**Interfaces:**
- Consumes: `Award(rule, points)`, `AwardRule.ALL_QUALIFYING`/`.CLOSEST_ONLY`, `RoundGame`, `RoundPlay`, `RoundPlayRepository.findByRoundGameId`, `RoundPlayRepository.recordGuess`, `RoundGameStore`.
- Produces:
  - `Verdict(playId: UUID, qualifies: Boolean, deviation: Double)`
  - `pointsFor(award: Award, verdicts: List<Verdict>): Map<UUID, Int>`
  - `RoundScoring.reevaluate(round: RoundGame): Int` (Anzahl geschriebener Zeilen)
  - `RoundGameRepository.findByIdForUpdate(id: UUID): RoundGame?`
  - `RoundGameStore.lock(roundGame: RoundGame): RoundGame`

- [ ] **Step 1: Die Tests der reinen Funktion schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/game/ScoringTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.matchers.maps.shouldBeEmpty
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.Award
import org.unividuell.countdown.core.game.internal.AwardRule
import org.unividuell.countdown.core.game.internal.Verdict
import org.unividuell.countdown.core.game.internal.pointsFor
import java.util.UUID

class ScoringTest {

    private val alice = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")
    private val bob = UUID.fromString("0190f1b2-0000-7000-8000-000000000002")
    private val carol = UUID.fromString("0190f1b2-0000-7000-8000-000000000003")

    private val phaseOne = Award(rule = AwardRule.ALL_QUALIFYING, points = 1)
    private val phaseTwo = Award(rule = AwardRule.CLOSEST_ONLY, points = 7)

    @Test
    fun `every qualifying guess scores in phase one, and the others get a zero rather than nothing`() {
        val points = pointsFor(
            award = phaseOne,
            verdicts = listOf(
                Verdict(playId = alice, qualifies = true, deviation = 9.0),
                Verdict(playId = bob, qualifies = false, deviation = 40.0),
            ),
        )

        // Zero, not absent: the row was played, and the writer must be able to set it back to 0.
        points shouldBe mapOf(alice to 1, bob to 0)
    }

    @Test
    fun `only the closest qualifying guess scores in phase two`() {
        val points = pointsFor(
            award = phaseTwo,
            verdicts = listOf(
                Verdict(playId = alice, qualifies = true, deviation = 12.0),
                Verdict(playId = bob, qualifies = true, deviation = 3.5),
                Verdict(playId = carol, qualifies = false, deviation = 0.5),
            ),
        )

        // Carol is closest but does not qualify — the precondition belongs to the game, and the rule
        // awards among the eligible only.
        points shouldBe mapOf(alice to 0, bob to 7, carol to 0)
    }

    @Test
    fun `a tie gets the full amount twice - it does not split`() {
        val points = pointsFor(
            award = phaseTwo,
            verdicts = listOf(
                Verdict(playId = alice, qualifies = true, deviation = 0.0),
                Verdict(playId = bob, qualifies = true, deviation = 0.0),
            ),
        )

        // Which is also why a pure right/wrong game (deviation 0.0 for every hit) behaves like
        // ALL_QUALIFYING under this rule, without needing a special case.
        points shouldBe mapOf(alice to 7, bob to 7)
    }

    @Test
    fun `if nobody qualifies, nobody scores - under either rule`() {
        val verdicts = listOf(
            Verdict(playId = alice, qualifies = false, deviation = 20.0),
            Verdict(playId = bob, qualifies = false, deviation = 30.0),
        )

        pointsFor(award = phaseOne, verdicts = verdicts) shouldBe mapOf(alice to 0, bob to 0)
        pointsFor(award = phaseTwo, verdicts = verdicts) shouldBe mapOf(alice to 0, bob to 0)
    }

    @Test
    fun `a round nobody has guessed produces no entries at all`() {
        pointsFor(award = phaseTwo, verdicts = emptyList()).shouldBeEmpty()
    }
}
```

- [ ] **Step 2: Test laufen lassen — er muss scheitern**

Run: `cd core && ./mvnw test -Dtest='ScoringTest'`
Expected: FAIL, `pointsFor` existiert nicht.

- [ ] **Step 3: Die reine Funktion schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/Scoring.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import java.util.UUID

/** One stored guess, reduced to what an award rule is allowed to see. */
data class Verdict(val playId: UUID, val qualifies: Boolean, val deviation: Double)

/**
 * The points of every guess in a round: a pure function of the round's frozen [award] and the stored
 * verdicts, and **not** of the game — `qualifies` and `deviation` sit on the rows, so this is plain
 * framework arithmetic.
 *
 * That is also why "a later guess takes the points away" needs no mechanism of its own. It is not
 * `points = f(params, guess)` any more but `points = f(award, all verdicts of the round)`, still a
 * pure function of persisted values — so the answer is to evaluate the round again, not to subtract.
 *
 * A tie gets the full amount **twice**, it does not split: with `Double` degrees that is practically
 * unreachable, but a pure right/wrong game reports `0.0` for every hit, and there `CLOSEST_ONLY` then
 * behaves like `ALL_QUALIFYING` without a special case. Comparing `Double`s with `==` is correct
 * here — stored values against the minimum of the same stored values, not two independently computed
 * approximations.
 */
fun pointsFor(award: Award, verdicts: List<Verdict>): Map<UUID, Int> {
    val scores: (Verdict) -> Boolean = when (award.rule) {
        AwardRule.ALL_QUALIFYING -> { verdict -> verdict.qualifies }
        AwardRule.CLOSEST_ONLY -> {
            val best = verdicts.filter { it.qualifies }.minOfOrNull { it.deviation }
            { verdict -> verdict.qualifies && best != null && verdict.deviation == best }
        }
    }
    return verdicts.associate { it.playId to if (scores(it)) award.points else 0 }
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `cd core && ./mvnw test -Dtest='ScoringTest'`
Expected: PASS, 5 Tests.

- [ ] **Step 5: Die Sperre und ihren Test schreiben**

In `RoundGameRepository`:

```kotlin
    /**
     * The round's row, locked for the rest of the transaction.
     *
     * Needed because scoring writes **other players'** rows: it reads every guess of the round and
     * writes over all of them, so two concurrent guesses would each compute from the same stale
     * picture and one update would be lost — exactly in the moment the points move. Locking one row
     * serialises the guesses of *one* round; different rounds do not block each other, and at fifteen
     * players the cost is not measurable.
     */
    @Query("SELECT * FROM game.round_games WHERE id = :id FOR UPDATE")
    fun findByIdForUpdate(id: UUID): RoundGame?
```

In `RoundGameStore`:

```kotlin
    /**
     * The round, locked until the transaction ends. Taken by the guess flow before it judges, so the
     * re-evaluation that follows sees a picture nobody else can move under it.
     */
    @Transactional
    fun lock(roundGame: RoundGame): RoundGame {
        val id = requireNotNull(roundGame.id)
        return requireNotNull(rounds.findByIdForUpdate(id)) { "round $id vanished while locking it" }
    }
```

`core/src/test/kotlin/org/unividuell/countdown/core/game/RoundLockTest.kt` — bewusst **ohne**
`@Transactional`, weil eine Sperre zwischen zwei Transaktionen nur beobachtbar ist, wenn es zwei gibt:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.matchers.longs.shouldBeGreaterThan
import io.kotest.matchers.nulls.shouldNotBeNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.support.TransactionTemplate
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.game.internal.Award
import org.unividuell.countdown.core.game.internal.AwardRule
import org.unividuell.countdown.core.game.internal.RoundGameRepository
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Import(TestcontainersConfiguration::class)
@SpringBootTest
class RoundLockTest(
    @Autowired val rounds: RoundGameRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
    @Autowired val transactions: TransactionTemplate,
    @Autowired val mapper: ObjectMapper,
) {

    @Test
    fun `the second transaction waits for the first to release the round`() {
        val creator = requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = "locker")).id)
        val community = communities.save(
            Community(name = "Lock Round", slug = "lock-round-${System.nanoTime()}", createdBy = creator),
        )
        val edition = editions.save(
            CommunityEdition(communityId = requireNotNull(community.id), label = "Run 2026"),
        )
        val round = store.announce(
            edition = edition, roundNumber = 12, gameType = "guess-hue",
            params = mapper.readTree("""{"hue":1.0}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
            announcedAt = Instant.parse("2026-08-12T10:00:00Z"),
        )
        val id = requireNotNull(round.id)
        val holding = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)

        try {
            val holder = pool.submit {
                transactions.execute {
                    rounds.findByIdForUpdate(id).shouldNotBeNull()
                    holding.countDown()
                    // Held on purpose: without the lock the waiter below returns immediately, and
                    // "immediately" is the failure this test is looking for.
                    Thread.sleep(400)
                }
            }
            val waited = pool.submit<Long> {
                holding.await(5, TimeUnit.SECONDS)
                val startedAt = System.nanoTime()
                transactions.execute { rounds.findByIdForUpdate(id) }
                (System.nanoTime() - startedAt) / 1_000_000
            }

            waited.get(30, TimeUnit.SECONDS) shouldBeGreaterThan 200L
            holder.get(30, TimeUnit.SECONDS)
        } finally {
            pool.shutdownNow()
        }
    }
}
```

- [ ] **Step 6: Sperren-Test laufen lassen**

Run: `cd core && ./mvnw test -Dtest='RoundLockTest'`
Expected: PASS. Streiche versuchsweise `FOR UPDATE` aus dem Query und lass ihn erneut laufen — er muss
fallen (Wartezeit ≈ 0 ms). Danach `FOR UPDATE` wieder eintragen.

- [ ] **Step 7: Den Neuauswertungs-Test schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/game/RoundScoringTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

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
import org.unividuell.countdown.core.game.internal.Award
import org.unividuell.countdown.core.game.internal.AwardRule
import org.unividuell.countdown.core.game.internal.RoundGame
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.game.internal.RoundScoring
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class RoundScoringTest(
    @Autowired val scoring: RoundScoring,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    private val at = Instant.parse("2026-08-12T10:00:00Z")

    private fun aUser(): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = "player")).id)

    private fun aRound(slug: String, award: Award): RoundGame {
        val creator = aUser()
        val community = communities.save(Community(name = slug, slug = slug, createdBy = creator))
        val edition = editions.save(
            CommunityEdition(communityId = requireNotNull(community.id), label = "Run 2026"),
        )
        return store.announce(
            edition = edition, roundNumber = 12, gameType = "guess-hue",
            params = mapper.readTree("""{"hue":42.0}"""), award = award, announcedAt = at,
        )
    }

    /** Reveal and guess in one step, straight through the repository — no service needed here. */
    private fun guessed(round: RoundGame, user: UUID, qualifies: Boolean, deviation: Double, at: Instant) {
        val roundId = requireNotNull(round.id)
        plays.revealOrCount(roundGameId = roundId, userId = user, revealedAt = this.at)
        val play = requireNotNull(plays.findByRoundGameIdAndUserId(roundGameId = roundId, userId = user))
        plays.recordGuess(
            id = requireNotNull(play.id), guess = mapper.readTree("""{"hue":${deviation}}"""),
            guessedAt = at, qualifies = qualifies, deviation = deviation, outcome = null,
        )
    }

    private fun pointsOf(round: RoundGame, user: UUID): Int? =
        plays.findByRoundGameIdAndUserId(roundGameId = requireNotNull(round.id), userId = user)
            .shouldNotBeNull().points

    @Test
    fun `phase one writes a point for every hit and a zero for every miss`() {
        val round = aRound("sc-phase-one", Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        val hit = aUser()
        val miss = aUser()
        guessed(round = round, user = hit, qualifies = true, deviation = 4.0, at = at)
        guessed(round = round, user = miss, qualifies = false, deviation = 40.0, at = at.plusSeconds(60))

        scoring.reevaluate(round) shouldBe 2

        pointsOf(round = round, user = hit) shouldBe 1
        pointsOf(round = round, user = miss) shouldBe 0
    }

    @Test
    fun `a later, better guess takes the previous best its points`() {
        // The regression this whole design exists for: a guess writes *other* players' rows, and it
        // does so by evaluating the round again rather than by subtracting from somebody.
        val round = aRound("sc-taken", Award(rule = AwardRule.CLOSEST_ONLY, points = 7))
        val early = aUser()
        val late = aUser()
        guessed(round = round, user = early, qualifies = true, deviation = 12.0, at = at)
        scoring.reevaluate(round)
        pointsOf(round = round, user = early) shouldBe 7

        guessed(round = round, user = late, qualifies = true, deviation = 3.0, at = at.plusSeconds(60))
        scoring.reevaluate(round)

        pointsOf(round = round, user = early) shouldBe 0
        pointsOf(round = round, user = late) shouldBe 7
    }

    @Test
    fun `re-evaluating without a new guess writes nothing`() {
        // Idempotent because it is a function of stored values: no state that can drift.
        val round = aRound("sc-idempotent", Award(rule = AwardRule.CLOSEST_ONLY, points = 5))
        guessed(round = round, user = aUser(), qualifies = true, deviation = 1.0, at = at)
        scoring.reevaluate(round)

        scoring.reevaluate(round) shouldBe 0
    }

    @Test
    fun `a revealed but unguessed row keeps its null points`() {
        val round = aRound("sc-unguessed", Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        val lurker = aUser()
        plays.revealOrCount(roundGameId = requireNotNull(round.id), userId = lurker, revealedAt = at)

        scoring.reevaluate(round) shouldBe 0

        // null, not 0: "has not guessed" and "guessed and came away empty" must stay distinguishable.
        pointsOf(round = round, user = lurker) shouldBe null
    }
}
```

- [ ] **Step 8: Test laufen lassen — er muss scheitern**

Run: `cd core && ./mvnw test -Dtest='RoundScoringTest'`
Expected: FAIL, `RoundScoring` existiert nicht.

- [ ] **Step 9: Die Neuauswertung schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundScoring.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/**
 * Writes the round's points — all of them, every time somebody guesses.
 *
 * The caller must hold the round's row lock (`RoundGameStore.lock`): this reads every guess of the
 * round and writes back over all of them, including other players'. Two concurrent guesses without
 * the lock would each compute from the same stale picture and one update would be lost, precisely in
 * the moment the points move.
 */
@Component
class RoundScoring(private val plays: RoundPlayRepository) {

    private val logger = KotlinLogging.logger {}

    /** Returns how many rows changed — `0` means the stored points were already correct. */
    @Transactional
    fun reevaluate(round: RoundGame): Int {
        val guessed = plays.findByRoundGameId(requireNotNull(round.id)).filter { it.guessedAt != null }
        val points = pointsFor(
            award = Award(rule = round.awardRule, points = round.awardPoints),
            verdicts = guessed.map { play ->
                Verdict(
                    playId = requireNotNull(play.id),
                    qualifies = play.qualifies == true,
                    // A guessed row always carries a deviation; treating a missing one as "infinitely
                    // far off" keeps a broken row out of the win rather than crashing the round.
                    deviation = play.deviation ?: Double.MAX_VALUE,
                )
            },
        )

        var written = 0
        for (play in guessed) {
            val now = points[requireNotNull(play.id)] ?: 0
            if (play.points == now) continue
            if ((play.points ?: 0) > now) {
                // The one place behaviour degrades silently: somebody's points vanished, and in a
                // support case it would otherwise be their word against ours.
                logger.info {
                    "round ${round.roundNumber}: user ${play.userId} drops from ${play.points} to $now points"
                }
            }
            plays.save(play.copy(points = now))
            written++
        }
        return written
    }
}
```

- [ ] **Step 10: Tests laufen lassen**

Run: `cd core && ./mvnw test -Dtest='ScoringTest,RoundScoringTest,RoundLockTest'`
Expected: PASS.

- [ ] **Step 11: Ganze Suite und committen**

Run: `cd core && ./mvnw test`

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/ core/src/test/kotlin/org/unividuell/countdown/core/game/
git commit -m "feat(game): award points by re-evaluating the whole round under its row lock"
```

---

## Task 5: Spielen — Aufdecken, Tippen, und die Antwort mit ihren Toren

Nach dieser Task ist die Runde spielbar: aufdecken liefert den Payload, tippen urteilt, schreibt, wertet neu aus und deckt Lösung und fremde Tipps auf — beides erst nach dem eigenen Tipp.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/CurrentRound.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/AnnouncementService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundController.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptions.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptionHandler.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PlayServiceTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundControllerTest.kt` (erweitert)

**Interfaces:**
- Consumes: `AnnouncementService.currentRound(slug, userId, isSuperAdmin)`, `RoundGameStore.find/history/announce/lock`, `RoundPlayRepository.*`, `RoundScoring.reevaluate(round)`, `GameTypeHandle.present/judge/solution`, `UserQuery.findAllById`, `Avatar.of(user)`, `Round`, `CommunityEdition`, `Clock`, `ObjectMapper`.
- Produces:
  - `sealed interface CurrentRound` mit `CurrentRound.NoGame(round: Round?, reason: NoGameReason)` und `CurrentRound.Announced(round: Round, edition: CommunityEdition, roundGame: RoundGame, handle: GameTypeHandle<*>)`
  - `AnnouncementService.resolve(slug: String, userId: UUID, isSuperAdmin: Boolean): CurrentRound`
  - `RoundResponses.of(current: CurrentRound, viewerId: UUID): RoundResponse`
  - `PlayDto(userId, username, avatar, revealedAt, guessedAt, guess, outcome, points)`
  - `RoundResponse(round, game, noGameReason, payload = null, solution = null, me = null, others = emptyList())`
  - `PlayService.reveal(slug, userId, isSuperAdmin): RoundResponse`, `.guess(slug, userId, isSuperAdmin, guess): RoundResponse`
  - `NoGameToPlayException(reason)` → 409, `NotRevealedException` → 409, `AlreadyGuessedException` → 409

- [ ] **Step 1: Das aufgelöste Ergebnis als eigenen Typ schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/CurrentRound.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.countdown.Round

/**
 * The community's current round, resolved — and, if it carries a game, materialised.
 *
 * All three endpoints resolve through the same function and then diverge: the announcement renders
 * this, revealing and guessing insist on [Announced] first. Without a shared type each of them would
 * repeat the membership check, the window check and the materialisation, and they would drift.
 */
sealed interface CurrentRound {

    /** [round] is `null` when there is no grid at all — no active run, or no target date. */
    data class NoGame(val round: Round?, val reason: NoGameReason) : CurrentRound

    data class Announced(
        val round: Round,
        val edition: CommunityEdition,
        val roundGame: RoundGame,
        val handle: GameTypeHandle<*>,
    ) : CurrentRound
}
```

- [ ] **Step 2: Die Auflösung von der Antwort trennen**

In `AnnouncementService`: `currentRound` behält Signatur und Semantik, gibt den Antwortbau aber ab.

```kotlin
@Service
class AnnouncementService(
    private val communities: CommunityQuery,
    private val memberships: MembershipQuery,
    private val engine: CountdownEngine,
    private val store: RoundGameStore,
    private val catalog: GameCatalog,
    private val selection: GameSelection,
    private val responses: RoundResponses,
    private val clock: Clock,
) {
```

```kotlin
    /**
     * Not `readOnly`: the first call of a round inserts. Every later call of the same round only
     * reads, which is where practically all traffic lands.
     */
    @Transactional
    fun currentRound(slug: String, userId: UUID, isSuperAdmin: Boolean): RoundResponse = responses.of(
        current = resolve(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin),
        viewerId = userId,
    )

    /**
     * The gate and the materialisation, shared by all three endpoints: membership, the run, the
     * window, then the announced round — created here if this is the first caller of the round.
     */
    @Transactional
    fun resolve(slug: String, userId: UUID, isSuperAdmin: Boolean): CurrentRound {
        val community = communities.findBySlug(slug) ?: throw RoundAccessDeniedException()
        val communityId = requireNotNull(community.id)
        if (!isSuperAdmin && !memberships.isActiveMember(communityId = communityId, userId = userId)) {
            throw RoundAccessDeniedException()
        }
        val edition = communities.activeEditionOf(communityId)
            ?: return CurrentRound.NoGame(round = null, reason = NoGameReason.NOT_SCHEDULED)
        val startsAt = edition.startsAt
            ?: return CurrentRound.NoGame(round = null, reason = NoGameReason.NOT_SCHEDULED)

        val round = engine.roundAt(
            now = clock.instant(),
            startsAt = startsAt,
            zone = ZoneId.of(edition.startsAtTimezone),
        )
        windowReasonOf(
            roundNumber = round.number,
            gamesFromRound = edition.gamesFromRound,
            gamesUntilRound = edition.gamesUntilRound,
        )?.let { reason -> return CurrentRound.NoGame(round = round, reason = reason) }

        val existing = store.find(edition = edition, roundNumber = round.number)
        return announcedOrNoGame(
            edition = edition,
            round = round,
            roundGame = existing ?: materialise(edition = edition, round = round)
                ?: return CurrentRound.NoGame(round = round, reason = NoGameReason.NO_GAME_TYPE),
        )
    }
```

`materialise` liefert jetzt `RoundGame?` (`null` = kein Spieltyp) statt einer Antwort, und der
Katalog-Blick auf die gespeicherte Zeile wandert in `announcedOrNoGame`:

```kotlin
    private fun materialise(edition: CommunityEdition, round: Round): RoundGame? {
        val history = store.history(edition = edition, roundNumber = round.number)
        val random = GameRandom.independent(secureRandom)
        val typeId = selection.pick(
            candidates = catalog.ids(),
            history = history,
            // The chosen type is announced, so it is a published value and comes from the published
            // stream — the same rule that governs the payload.
            random = random.presentation,
        ) ?: run {
            // Unreachable today, but not because Spring would refuse to inject an empty
            // List<GameType<*>> — it does that happily. It is unreachable because GuessHueGameType
            // is an unconditional bean, so the catalogue this branch guards against never empties.
            logger.warn { "no game type available for round ${round.number} of edition ${edition.id}" }
            return null
        }
        val handle = requireNotNull(catalog.handle(typeId)) { "selection picked unknown type '$typeId'" }
        return store.announce(
            edition = edition,
            roundNumber = round.number,
            gameType = typeId,
            params = handle.draw(
                random = random,
                context = RoundContext(
                    roundNumber = round.number,
                    phase = Phase.of(edition = edition, roundNumber = round.number),
                ),
            ),
            award = awardFor(roundNumber = round.number, phaseTwoStartRound = edition.phaseTwoStartRound),
            announcedAt = clock.instant(),
        )
    }

    /**
     * Reads the game type off the stored row, not off the draw: on a lost race the row belongs to
     * whoever announced first, and their game is the one everybody plays.
     */
    private fun announcedOrNoGame(
        edition: CommunityEdition,
        round: Round,
        roundGame: RoundGame,
    ): CurrentRound {
        val handle = catalog.handle(roundGame.gameType)
        if (handle == null) {
            // The round was announced by a deployment that had a game this one does not. Nothing can
            // be played, but the round must not 500 — and the operator needs to know which type.
            logger.warn {
                "round ${round.number} announced as '${roundGame.gameType}', which this build has no game for"
            }
            return CurrentRound.NoGame(round = round, reason = NoGameReason.NO_GAME_TYPE)
        }
        return CurrentRound.Announced(
            round = round,
            edition = edition,
            roundGame = roundGame,
            handle = handle,
        )
    }
```

Die alten privaten `announced(round, roundGame)` und `noGame(round, reason)` fallen weg.

- [ ] **Step 3: Die DTOs erweitern**

In `RoundDtos.kt`:

```kotlin
/**
 * One player's involvement, as far as the viewer may see it.
 *
 * `qualifies` and `deviation` are **not** here on purpose: they are the framework's comparison
 * values, not display data. What the player learns about a result is the game-shaped [outcome], and
 * where they stand is [points]. A generic "this far off" field would be a third way out of the server
 * next to `present()` and `solution()`, and those we want countable.
 */
data class PlayDto(
    val userId: UUID,
    val username: String,
    val avatar: Avatar,
    val revealedAt: Instant,
    val guessedAt: Instant?,
    val guess: JsonNode?,
    val outcome: JsonNode?,
    val points: Int?,
)

/**
 * `round` is null when there is no grid at all (no run, no date). It is present with `game == null`
 * when the round exists but carries no game — the window, or an empty catalogue.
 *
 * The four play fields default to their empty state so a no-game answer stays one expression. Each of
 * them is a gate, and every gate is closed **server-side**: a payload the browser never receives
 * cannot be read out of the network tab either.
 */
data class RoundResponse(
    val round: RoundDto?,
    val game: GameDto?,
    val noGameReason: NoGameReason?,
    /** Only once the viewer has revealed — the reveal is what starts their clock. */
    val payload: GamePayload? = null,
    /** Only once the viewer has guessed. */
    val solution: GameSolution? = null,
    val me: PlayDto? = null,
    /** Empty until the viewer has guessed. Unconditional: there is no game for which the other
     *  answer is right, so there is no switch to get it wrong with. */
    val others: List<PlayDto> = emptyList(),
)
```

Imports ergänzen: `org.unividuell.countdown.core.iam.Avatar`, `tools.jackson.databind.JsonNode`,
`java.util.UUID`.

- [ ] **Step 4: Den Antwortbau schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

/**
 * Turns a resolved round into the answer one viewer may see.
 *
 * One place for all three endpoints, because the visibility gates are the part that must not drift:
 * the payload after the reveal, the solution and the others' guesses after the viewer's own guess.
 */
@Component
class RoundResponses(
    private val plays: RoundPlayRepository,
    private val users: UserQuery,
) {

    fun of(current: CurrentRound, viewerId: UUID): RoundResponse = when (current) {
        is CurrentRound.NoGame -> RoundResponse(
            round = current.round?.toDto(),
            game = null,
            noGameReason = current.reason,
        )

        is CurrentRound.Announced -> announced(current = current, viewerId = viewerId)
    }

    private fun announced(current: CurrentRound.Announced, viewerId: UUID): RoundResponse {
        val rows = plays.findByRoundGameId(requireNotNull(current.roundGame.id))
        val mine = rows.firstOrNull { it.userId == viewerId }
        val hasGuessed = mine?.guessedAt != null
        // Withheld, not filtered in the client. Revealed-but-unguessed rows stay out entirely: they
        // say who is looking, which is nobody's business. A participation count would be a `COUNT`,
        // not a filtered list of guesses.
        val visible = if (hasGuessed) {
            rows.filter { it.userId != viewerId && it.guessedAt != null }
        } else {
            emptyList()
        }
        val byUser = users.findAllById((visible + listOfNotNull(mine)).map { it.userId })
            .associateBy { it.id }

        return RoundResponse(
            round = current.round.toDto(),
            game = GameDto(id = current.handle.id, displayName = current.handle.displayName),
            noGameReason = null,
            payload = mine?.let { current.handle.present(current.roundGame.params) },
            solution = if (hasGuessed) current.handle.solution(current.roundGame.params) else null,
            me = mine?.let { dtoOf(play = it, user = byUser[it.userId]) },
            // Sorted by when they guessed — the order the round actually happened in, and stable
            // where two stamps collide. A row whose user row vanished drops out rather than taking
            // the page down.
            others = visible
                .sortedWith(compareBy({ it.guessedAt }, { it.userId }))
                .mapNotNull { dtoOf(play = it, user = byUser[it.userId]) },
        )
    }

    private fun dtoOf(play: RoundPlay, user: User?): PlayDto? = user?.let {
        PlayDto(
            userId = play.userId,
            username = it.username,
            avatar = Avatar.of(it),
            revealedAt = play.revealedAt,
            guessedAt = play.guessedAt,
            guess = play.guess,
            outcome = play.outcome,
            points = play.points,
        )
    }
}
```

- [ ] **Step 5: Die Spiel-Fehler ergänzen**

In `GameExceptions.kt`:

```kotlin
/**
 * The current round carries no game — outside the window, no run, or a type this build lacks → 409.
 * The state is real and the request is well-formed; it simply cannot be played.
 */
class NoGameToPlayException(reason: NoGameReason) : RuntimeException("no game to play: $reason")

/**
 * Guessing before revealing → 409. Guessing a colour whose description one never saw is not a
 * meaningful request, and the clock hangs off the reveal.
 */
class NotRevealedException(message: String = "the round has not been revealed yet") : RuntimeException(message)

/** One guess per player and round → 409. Enforced by the `UPDATE`, not by a check. */
class AlreadyGuessedException(message: String = "already guessed in this round") : RuntimeException(message)
```

In `GameExceptionHandler.kt`:

```kotlin
    @ExceptionHandler(
        NoGameToPlayException::class,
        NotRevealedException::class,
        AlreadyGuessedException::class,
    )
    fun conflict(e: RuntimeException) =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.message ?: "conflict")
```

- [ ] **Step 6: Den Spiel-Test schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/game/PlayServiceTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldBeEmpty
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
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.community.internal.MembershipService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.AlreadyGuessedException
import org.unividuell.countdown.core.game.internal.AnnouncementService
import org.unividuell.countdown.core.game.internal.CurrentRound
import org.unividuell.countdown.core.game.internal.GuessHuePayload
import org.unividuell.countdown.core.game.internal.GuessHueSolution
import org.unividuell.countdown.core.game.internal.InvalidGuessException
import org.unividuell.countdown.core.game.internal.NotRevealedException
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class PlayServiceTest(
    @Autowired val play: PlayService,
    @Autowired val announcements: AnnouncementService,
    @Autowired val communities: CommunityService,
    @Autowired val memberships: MembershipService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = login)).id)

    private fun guess(hue: Double): JsonNode = mapper.readTree("""{"hue":$hue}""")

    /**
     * A community whose countdown starts in 2099 — so the current round is a large number — with its
     * creator as first ACTIVE member. [phaseTwo] shifts the threshold above the current round, which
     * is what puts the round into phase two, because later in time is a smaller number.
     */
    private fun aCommunity(name: String, phaseTwo: Boolean = false): Pair<Community, UUID> {
        val ownerId = aUser("owner")
        val community = communities.create(creatorUserId = ownerId, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        if (phaseTwo) {
            val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
            editions.save(edition.copy(phaseTwoStartRound = currentRoundNumberOf(community) + 10))
        }
        return community to ownerId
    }

    private fun currentRoundNumberOf(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    private fun aMember(community: Community, login: String): UUID {
        val userId = aUser(login)
        memberships.join(
            community = community,
            userId = userId,
            token = requireNotNull(communities.rotateInviteToken(community = community, ttlHours = 24).inviteToken),
        )
        return userId
    }

    @Test
    fun `revealing hands out the payload and starts the clock`() {
        val (community, viewer) = aCommunity("Reveal Round")

        val res = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        val payload = res.payload.shouldNotBeNull() as GuessHuePayload
        payload.description.shouldNotBeNull()
        res.me.shouldNotBeNull().revealedAt.shouldNotBeNull()
        res.me!!.guessedAt.shouldBeNull()
        // Before the guess: no solution, no other player's guess.
        res.solution.shouldBeNull()
        res.others.shouldBeEmpty()
    }

    @Test
    fun `revealing twice returns the same round and only counts up`() {
        val (community, viewer) = aCommunity("Reveal Twice")

        val first = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        val second = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        second.payload shouldBe first.payload
        second.me.shouldNotBeNull().revealedAt shouldBe first.me.shouldNotBeNull().revealedAt
        val round = announcements.resolve(slug = community.slug, userId = viewer, isSuperAdmin = false)
        plays.findByRoundGameId(
            requireNotNull((round as CurrentRound.Announced).roundGame.id),
        ).single().revealCount shouldBe 2
    }

    @Test
    fun `the announcement hands out no payload before the reveal`() {
        val (community, viewer) = aCommunity("No Payload")

        val res = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)

        res.game.shouldNotBeNull()
        res.payload.shouldBeNull()
        res.me.shouldBeNull()
    }

    @Test
    fun `guessing without revealing is refused`() {
        val (community, viewer) = aCommunity("No Reveal")

        shouldThrow<NotRevealedException> {
            play.guess(slug = community.slug, userId = viewer, isSuperAdmin = false, guess = guess(10.0))
        }
    }

    @Test
    fun `a guess reveals the solution and scores the round`() {
        val (community, viewer) = aCommunity("Guess Round")
        val payload = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
            .payload as GuessHuePayload

        val res = play.guess(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            guess = guess(payload.initHue),
        )

        val solution = res.solution.shouldNotBeNull() as GuessHueSolution
        solution.targetHue.shouldNotBeNull()
        res.me.shouldNotBeNull().guessedAt.shouldNotBeNull()
        res.me!!.guess shouldBe guess(payload.initHue)
        // Points are written by the round's re-evaluation, in the same transaction as the guess.
        res.me!!.points.shouldNotBeNull()
    }

    @Test
    fun `an invalid guess consumes nothing and writes nothing`() {
        val (community, viewer) = aCommunity("Invalid Guess")
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        shouldThrow<InvalidGuessException> {
            play.guess(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                guess = mapper.readTree("""{"hue":"warm"}"""),
            )
        }

        val res = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)
        res.me.shouldNotBeNull().guessedAt.shouldBeNull()
        res.solution.shouldBeNull()
    }

    @Test
    fun `a second guess is refused`() {
        val (community, viewer) = aCommunity("Second Guess")
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        play.guess(slug = community.slug, userId = viewer, isSuperAdmin = false, guess = guess(10.0))

        shouldThrow<AlreadyGuessedException> {
            play.guess(slug = community.slug, userId = viewer, isSuperAdmin = false, guess = guess(20.0))
        }
    }

    @Test
    fun `the others' guesses appear only after one's own`() {
        val (community, owner) = aCommunity("Others Round")
        val other = aMember(community = community, login = "other")
        play.reveal(slug = community.slug, userId = other, isSuperAdmin = false)
        play.guess(slug = community.slug, userId = other, isSuperAdmin = false, guess = guess(30.0))

        val before = play.reveal(slug = community.slug, userId = owner, isSuperAdmin = false)
        val after = play.guess(
            slug = community.slug, userId = owner, isSuperAdmin = false, guess = guess(40.0),
        )

        before.others.shouldBeEmpty()
        after.others shouldHaveSize 1
        after.others.single().userId shouldBe other
        after.others.single().guess shouldBe guess(30.0)
    }

    @Test
    fun `in phase two a better later guess takes the earlier best its points`() {
        val (community, owner) = aCommunity("Phase Two Round", phaseTwo = true)
        val other = aMember(community = community, login = "sniper")
        play.reveal(slug = community.slug, userId = owner, isSuperAdmin = false)
        val solution = play.guess(
            slug = community.slug, userId = owner, isSuperAdmin = false, guess = guess(0.0),
        ).solution as GuessHueSolution
        // The owner scored: in phase two there is no gate, so the only guess so far is the best one.
        // awardFor in phase two is (threshold - round + 2), and the threshold sits 10 rounds above
        // the current one, so the stake is 12.
        announcements.currentRound(slug = community.slug, userId = owner, isSuperAdmin = false)
            .me.shouldNotBeNull().points shouldBe 12

        play.reveal(slug = community.slug, userId = other, isSuperAdmin = false)
        play.guess(
            slug = community.slug, userId = other, isSuperAdmin = false,
            guess = guess(solution.targetHue),
        )

        announcements.currentRound(slug = community.slug, userId = owner, isSuperAdmin = false)
            .me.shouldNotBeNull().points shouldBe 0
    }
}
```

- [ ] **Step 7: Test laufen lassen — er muss scheitern**

Run: `cd core && ./mvnw test -Dtest='PlayServiceTest'`
Expected: FAIL, `PlayService` existiert nicht.

- [ ] **Step 8: Die Fixture-Helfer gegen den echten Code prüfen**

- Prüf die Signaturen der beiden Fixture-Helfer gegen den echten Code: `CommunityService.update(...)`,
  `CommunityService.rotateInviteToken(...)` und `MembershipService.join(...)` müssen exakt so heißen und
  so aussehen. Weichen sie ab, nimm die vorhandenen — `AnnouncementServiceTest` und die
  Community-Tests zeigen die geltenden Aufrufe. Ein zweites Mitglied darf auch direkt über
  `CommunityMemberRepository` angelegt werden, wenn das der kürzere echte Weg ist.

- [ ] **Step 9: Den Spiel-Service schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayService.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.util.UUID

/**
 * Playing the current round: reveal, then guess. **Only the running round is playable** — whoever
 * missed a round has zero points for it, and past rounds are display only.
 */
@Service
class PlayService(
    private val announcements: AnnouncementService,
    private val store: RoundGameStore,
    private val plays: RoundPlayRepository,
    private val scoring: RoundScoring,
    private val responses: RoundResponses,
    private val mapper: ObjectMapper,
    private val clock: Clock,
) {
    private val logger = KotlinLogging.logger {}

    /**
     * Idempotent: the first call writes the clock, every later one only counts up. No hard lockout —
     * Guess Hue has no time scoring, so a refresh buys a trickster nothing while a lockout would only
     * punish bad wifi. The threshold at which repeated reveals become a signal arrives with the first
     * time-scored game; inventing it now would mean inventing it without data.
     */
    @Transactional
    fun reveal(slug: String, userId: UUID, isSuperAdmin: Boolean): RoundResponse {
        val current = playable(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        plays.revealOrCount(
            roundGameId = requireNotNull(current.roundGame.id),
            userId = userId,
            revealedAt = clock.instant(),
        )
        return responses.of(current = current, viewerId = userId)
    }

    @Transactional
    fun guess(slug: String, userId: UUID, isSuperAdmin: Boolean, guess: JsonNode): RoundResponse {
        val current = playable(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        // Locked first: the re-evaluation below reads and rewrites every guess of this round.
        val round = store.lock(current.roundGame)
        val play = plays.findByRoundGameIdAndUserId(
            roundGameId = requireNotNull(round.id),
            userId = userId,
        ) ?: throw NotRevealedException()

        // judge() before any write: an invalid guess must not consume the one attempt.
        val judgement = current.handle.judge(params = round.params, guess = guess)
        val recorded = plays.recordGuess(
            id = requireNotNull(play.id),
            guess = guess,
            guessedAt = clock.instant(),
            qualifies = judgement.qualifies,
            deviation = judgement.deviation,
            // Stored as the game shaped it — the framework never looks inside.
            outcome = judgement.outcome?.let { mapper.valueToTree(it) },
        )
        // Zero rows means guessed_at was already set. "One guess per round" is this UPDATE, not a
        // read-then-check.
        if (recorded == 0) throw AlreadyGuessedException()

        val written = scoring.reevaluate(round)
        logger.debug { "round ${round.roundNumber}: guess by $userId rewrote $written rows" }
        return responses.of(current = current.copy(roundGame = round), viewerId = userId)
    }

    /** The same gate for both actions: resolved, inside the window, and carrying a playable game. */
    private fun playable(slug: String, userId: UUID, isSuperAdmin: Boolean): CurrentRound.Announced =
        when (val current = announcements.resolve(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)) {
            is CurrentRound.Announced -> current
            is CurrentRound.NoGame -> throw NoGameToPlayException(current.reason)
        }
}
```

- [ ] **Step 10: Die Endpunkte ergänzen**

In `RoundController`:

```kotlin
@RestController
@RequestMapping("/api/communities/{slug}/rounds")
class RoundController(
    private val announcements: AnnouncementService,
    private val plays: PlayService,
) {

    @GetMapping("/current")
    fun current(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
    ): RoundResponse = announcements.currentRound(
        slug = slug,
        userId = me.id,
        isSuperAdmin = me.isSuperAdmin,
    )

    /** Starts the viewer's clock and hands out the payload. Idempotent. */
    @PostMapping("/current/reveal")
    fun reveal(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
    ): RoundResponse = plays.reveal(slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin)

    /** The one guess. The body is the game's own shape — the framework does not look inside. */
    @PostMapping("/current/guess")
    fun guess(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody guess: JsonNode,
    ): RoundResponse = plays.guess(
        slug = slug,
        userId = me.id,
        isSuperAdmin = me.isSuperAdmin,
        guess = guess,
    )
}
```

Imports: `org.springframework.web.bind.annotation.PostMapping`, `…RequestBody`,
`tools.jackson.databind.JsonNode`.

- [ ] **Step 11: Tests laufen lassen**

Run: `cd core && ./mvnw test -Dtest='PlayServiceTest,AnnouncementServiceTest'`
Expected: PASS. `AnnouncementServiceTest` bleibt unverändert grün — `currentRound` hat dieselbe
Signatur und dieselbe Bedeutung.

- [ ] **Step 12: Die Web-Tests ergänzen**

In `RoundControllerTest` ergänzen (Imports: `org.springframework.test.web.servlet.post`,
`org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf`,
`org.springframework.http.MediaType`, `…internal.PlayService`, `…internal.AlreadyGuessedException`,
`…internal.InvalidGuessException`, `…internal.NotRevealedException`):

```kotlin
    @MockkBean lateinit var plays: PlayService

    @Test
    fun `POST reveal hands out the payload`() {
        every { plays.reveal(slug = "team", userId = uid, isSuperAdmin = false) } returns RoundResponse(
            round = RoundDto(
                number = 12, label = "T-12",
                start = Instant.parse("2026-08-12T10:00:00Z"),
                end = Instant.parse("2026-08-13T10:00:00Z"),
            ),
            game = GameDto(id = "guess-hue", displayName = "Farbausmalung"),
            noGameReason = null,
            payload = GuessHuePayload(
                description = "ein warmes Rot", initHue = 12.5, saturation = 0.6, lightness = 0.45,
            ),
        )

        mockMvc.post("/api/communities/team/rounds/current/reveal") {
            with(principalFor()); with(csrf())
        }.andExpect {
            status { isOk() }
            jsonPath("$.payload.description") { value("ein warmes Rot") }
            jsonPath("$.payload.hue") { doesNotExist() }
        }
    }

    @Test
    fun `POST guess passes the body through untouched`() {
        every {
            plays.guess(slug = "team", userId = uid, isSuperAdmin = false, guess = any())
        } returns RoundResponse(round = null, game = null, noGameReason = null)

        mockMvc.post("/api/communities/team/rounds/current/guess") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"hue":123.5}"""
        }.andExpect { status { isOk() } }

        verify { plays.guess(slug = "team", userId = uid, isSuperAdmin = false, guess = any()) }
    }

    @Test
    fun `guessing without revealing is a conflict`() {
        every {
            plays.guess(slug = "team", userId = uid, isSuperAdmin = false, guess = any())
        } throws NotRevealedException()

        mockMvc.post("/api/communities/team/rounds/current/guess") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"hue":1.0}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `a second guess is a conflict too`() {
        every {
            plays.guess(slug = "team", userId = uid, isSuperAdmin = false, guess = any())
        } throws AlreadyGuessedException()

        mockMvc.post("/api/communities/team/rounds/current/guess") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"hue":1.0}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `a malformed guess is a bad request`() {
        every {
            plays.guess(slug = "team", userId = uid, isSuperAdmin = false, guess = any())
        } throws InvalidGuessException("hue must lie in [0, 360), was 400.0")

        mockMvc.post("/api/communities/team/rounds/current/guess") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"hue":400.0}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `POST reveal requires a session`() {
        mockMvc.post("/api/communities/team/rounds/current/reveal") { with(csrf()) }
            .andExpect { status { isUnauthorized() } }
    }
```

`verify` kommt aus `io.mockk.verify`.

- [ ] **Step 13: Alles laufen lassen**

Run: `cd core && ./mvnw test`
Expected: PASS.

- [ ] **Step 14: Committen**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/ core/src/test/kotlin/org/unividuell/countdown/core/game/
git commit -m "feat(game): make a round playable - reveal, guess, and the two visibility gates"
```

---

## Task 6: Echte Standings und der Umzug der Punkte-Naht

Nach dieser Task ist der Punktestand echt: `SUM(points)` über die abgeschlossenen Runden des aktiven Durchlaufs, die im Spielfenster liegen — mit **derselben** Fensterprüfung wie die Auflösung. `MemberPointsConfiguration` und `StubMemberPoints` ziehen nach `game.internal`, `ZeroMemberPoints` fällt weg.

**Warum der Umzug nötig ist und nicht Kosmetik:** `MemberPointsConfiguration` baut „genau einen Bean by construction“, und `community` darf nicht auf `game` zeigen. Ein zweiter Bean derselben Schnittstelle in `game` würde die Invariante brechen, und `@ConditionalOnMissingBean` in einer User-`@Configuration` ist reihenfolgeabhängig, also keine Lösung. Also wandert die Fabrik dorthin, wo sie zwischen echt und Stub entscheiden *kann*. Die Naht selbst (`MemberPointsQuery`, `MemberPoints`) bleibt in `community`.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlayPoints.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/MemberPointsConfiguration.kt` (verschoben)
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/StubMemberPoints.kt` (verschoben)
- Delete: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberPointsConfiguration.kt`, `StubMemberPoints.kt`, `ZeroMemberPoints.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlayRepository.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/Award.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/AnnouncementService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundPlayPointsTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/MemberPointsTest.kt` (verschoben aus `community/`)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/MemberPointsConfigurationTest.kt` (verschoben aus `community/`)

**Interfaces:**
- Consumes: `MemberPointsQuery`, `MemberPoints(stable, live)`, `CommunityQuery.activeEditionOf`, `CountdownEngine.roundAt`, `Clock`, `windowReasonOf`, `PlayPoints`.
- Produces:
  - `RoundPlayRepository.pointsOf(editionId: UUID, userIds: Collection<UUID>): List<PlayPoints>`
  - `windowReasonOf(edition: CommunityEdition, roundNumber: Int): NoGameReason?`
  - `RoundPlayPoints(plays, communities, engine, clock) : MemberPointsQuery` — **kein `@Component`**
  - `game.internal.MemberPointsConfiguration.memberPointsQuery(environment, plays, communities, engine, clock): MemberPointsQuery`

- [ ] **Step 1: Die Fensterprüfung an einer Stelle bündeln**

In `Award.kt` unter der bestehenden `windowReasonOf` ergänzen:

```kotlin
/**
 * Same check against a run: the announcement and the standings must not be able to disagree about
 * which rounds are in play — a round outside the window carries no game *and* counts for nothing.
 */
fun windowReasonOf(edition: CommunityEdition, roundNumber: Int): NoGameReason? = windowReasonOf(
    roundNumber = roundNumber,
    gamesFromRound = edition.gamesFromRound,
    gamesUntilRound = edition.gamesUntilRound,
)
```

Und in `AnnouncementService.resolve` den dreizeiligen Aufruf durch die Kurzform ersetzen:

```kotlin
        windowReasonOf(edition = edition, roundNumber = round.number)
            ?.let { reason -> return CurrentRound.NoGame(round = round, reason = reason) }
```

- [ ] **Step 2: Die Punkte-Projektion abfragen**

In `RoundPlayRepository` ergänzen:

```kotlin
    /**
     * Points per player and round for one run — the **input** of a standings sum, not the sum.
     *
     * Grouping and window filtering happen in Kotlin on purpose: whether a round counts is
     * `windowReasonOf`, one predicate shared with the announcement, and duplicating those two
     * comparisons in SQL is exactly how the two would drift apart. The row count is bounded by
     * members × rounds of one run — a few hundred tiny rows.
     *
     * `points IS NOT NULL` is precisely "has guessed": the re-evaluation writes a number for every
     * guessed row of a round, `0` included.
     *
     * `IN (:userIds)` renders `IN ()` for an empty collection, which is a syntax error — the caller
     * guards that.
     */
    @Query(
        """
        SELECT p.user_id AS user_id, g.round_number AS round_number, p.points AS points
        FROM game.round_plays p
        JOIN game.round_games g ON g.id = p.round_game_id
        WHERE g.edition_id = :editionId AND p.points IS NOT NULL AND p.user_id IN (:userIds)
        """,
    )
    fun pointsOf(editionId: UUID, userIds: Collection<UUID>): List<PlayPoints>
```

- [ ] **Step 3: Den Standings-Test schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/game/RoundPlayPointsTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

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
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.Award
import org.unividuell.countdown.core.game.internal.AwardRule
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayPoints
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class RoundPlayPointsTest(
    @Autowired val plays: RoundPlayRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val communities: CommunityService,
    @Autowired val communityQuery: CommunityQuery,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    private val points = RoundPlayPoints(
        plays = plays, communities = communityQuery, engine = engine, clock = clock,
    )
    private val at = Instant.parse("2026-08-12T10:00:00Z")

    private fun aUser(): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = "player")).id)

    private fun aCommunity(name: String): Pair<Community, UUID> {
        val ownerId = aUser()
        val community = communities.create(creatorUserId = ownerId, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        return community to ownerId
    }

    private fun currentRoundNumberOf(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    /** A finished, scored round: announce it, reveal, guess, and write the points directly. */
    private fun scored(community: Community, roundNumber: Int, user: UUID, points: Int) {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val round = store.find(edition = edition, roundNumber = roundNumber) ?: store.announce(
            edition = edition, roundNumber = roundNumber, gameType = "guess-hue",
            params = mapper.readTree("""{"hue":1.0}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = at,
        )
        val roundId = requireNotNull(round.id)
        plays.revealOrCount(roundGameId = roundId, userId = user, revealedAt = at)
        val play = requireNotNull(plays.findByRoundGameIdAndUserId(roundGameId = roundId, userId = user))
        plays.recordGuess(
            id = requireNotNull(play.id), guess = mapper.readTree("""{"hue":1.0}"""), guessedAt = at,
            qualifies = true, deviation = 0.0, outcome = null,
        )
        plays.save(requireNotNull(plays.findById(requireNotNull(play.id)).orElse(null)).copy(points = points))
    }

    @Test
    fun `a community without any played round scores zero rather than nothing`() {
        val (community, owner) = aCommunity("Points Empty")

        val standings = points.standings(
            communityId = requireNotNull(community.id), viewerId = owner, userIds = listOf(owner),
        )

        standings[owner].shouldNotBeNull().stable shouldBe 0
        standings[owner]!!.live.shouldBeNull()
    }

    @Test
    fun `finished rounds are summed and the running one is not`() {
        val (community, owner) = aCommunity("Points Sum")
        val current = currentRoundNumberOf(community)
        // Larger number = earlier in time, so current + 1 and + 2 are finished rounds.
        scored(community = community, roundNumber = current + 1, user = owner, points = 3)
        scored(community = community, roundNumber = current + 2, user = owner, points = 4)
        scored(community = community, roundNumber = current, user = owner, points = 9)

        val standings = points.standings(
            communityId = requireNotNull(community.id), viewerId = owner, userIds = listOf(owner),
        )

        standings[owner].shouldNotBeNull().stable shouldBe 7
        // The running round is live, not stable — and visible because the viewer guessed it.
        standings[owner]!!.live shouldBe 9
    }

    @Test
    fun `live points stay hidden until the viewer has guessed the running round themselves`() {
        val (community, owner) = aCommunity("Points Live Gate")
        val other = aUser()
        val current = currentRoundNumberOf(community)
        scored(community = community, roundNumber = current, user = other, points = 5)

        val hidden = points.standings(
            communityId = requireNotNull(community.id), viewerId = owner, userIds = listOf(other),
        )
        scored(community = community, roundNumber = current, user = owner, points = 2)
        val shown = points.standings(
            communityId = requireNotNull(community.id), viewerId = owner, userIds = listOf(other),
        )

        hidden[other].shouldNotBeNull().live.shouldBeNull()
        shown[other].shouldNotBeNull().live shouldBe 5
    }

    @Test
    fun `shrinking the window drops rounds out of the sum but not out of the database`() {
        val (community, owner) = aCommunity("Points Window")
        val current = currentRoundNumberOf(community)
        scored(community = community, roundNumber = current + 1, user = owner, points = 3)
        scored(community = community, roundNumber = current + 2, user = owner, points = 4)
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))

        // The admin closes the window below the older round: it is no longer in play.
        editions.save(edition.copy(gamesFromRound = current + 1))
        val shrunk = points.standings(
            communityId = requireNotNull(community.id), viewerId = owner, userIds = listOf(owner),
        )
        // Re-opening brings the same number back, untouched: the points sit frozen on the row and
        // only their inclusion in the sum is dynamic.
        editions.save(
            requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
                .copy(gamesFromRound = null),
        )
        val reopened = points.standings(
            communityId = requireNotNull(community.id), viewerId = owner, userIds = listOf(owner),
        )

        shrunk[owner].shouldNotBeNull().stable shouldBe 3
        reopened[owner].shouldNotBeNull().stable shouldBe 7
    }

    @Test
    fun `a run without a target date has no rounds and therefore no points`() {
        val ownerId = aUser()
        val community = communities.create(creatorUserId = ownerId, rawName = "Points No Date")

        val standings = points.standings(
            communityId = requireNotNull(community.id), viewerId = ownerId, userIds = listOf(ownerId),
        )

        standings[ownerId].shouldNotBeNull().stable shouldBe 0
    }
}
```

- [ ] **Step 4: Test laufen lassen — er muss scheitern**

Run: `cd core && ./mvnw test -Dtest='RoundPlayPointsTest'`
Expected: FAIL, `RoundPlayPoints` existiert nicht.

- [ ] **Step 5: Die echten Standings schreiben**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlayPoints.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberPoints
import org.unividuell.countdown.core.community.MemberPointsQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import java.time.Clock
import java.time.ZoneId
import java.util.UUID

/**
 * The real standings: a sum over the frozen `points` of the active run.
 *
 * `stable` counts rounds that are **finished** *and* **inside the run's current game window**. The
 * window belongs to the admin, so shrinking it lets a total drop — that follows from the rule and is
 * not an effect to design away. It is also reversible: the points sit frozen on the row and only
 * their *inclusion* in the sum is dynamic, so a re-opened window brings the same numbers back with no
 * recalculation. That is the same property that makes `points` a cache over persisted inputs rather
 * than a verdict.
 *
 * `live` is the running round, and only for a viewer who has guessed it themselves — the origin app's
 * rule, and it is decided here rather than in the client, because the client must never *materialise*
 * what it may not have.
 *
 * Deliberately **not** a `@Component`: [MemberPointsConfiguration] builds exactly one
 * `MemberPointsQuery` bean, and a second one of the same type would break that.
 */
class RoundPlayPoints(
    private val plays: RoundPlayRepository,
    private val communities: CommunityQuery,
    private val engine: CountdownEngine,
    private val clock: Clock,
) : MemberPointsQuery {

    override fun standings(
        communityId: UUID,
        viewerId: UUID,
        userIds: Collection<UUID>,
    ): Map<UUID, MemberPoints> {
        // `IN ()` is a syntax error, and there is nothing to sum for nobody.
        if (userIds.isEmpty()) return emptyMap()
        val blank = userIds.associateWith { MemberPoints(stable = 0, live = null) }
        val edition = communities.activeEditionOf(communityId) ?: return blank
        val startsAt = edition.startsAt ?: return blank

        val current = engine.roundAt(
            now = clock.instant(),
            startsAt = startsAt,
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
        val scored = plays.pointsOf(
            editionId = requireNotNull(edition.id),
            // The viewer joins the query even when they are not on this roster — a super-admin
            // looking in: the live gate asks whether *they* guessed, not whether they are ranked.
            userIds = (userIds + viewerId).distinct(),
        ).filter { windowReasonOf(edition = edition, roundNumber = it.roundNumber) == null }

        // A larger round number is earlier in time, so "finished" is `> current`.
        val stable = scored.filter { it.roundNumber > current }
            .groupBy { it.userId }
            .mapValues { (_, rounds) -> rounds.sumOf { it.points } }
        val running = scored.filter { it.roundNumber == current }
        val live = if (running.any { it.userId == viewerId }) {
            running.associate { it.userId to it.points }
        } else {
            emptyMap()
        }

        return userIds.associateWith { MemberPoints(stable = stable[it] ?: 0, live = live[it]) }
    }
}
```

- [ ] **Step 6: Test laufen lassen**

Run: `cd core && ./mvnw test -Dtest='RoundPlayPointsTest'`
Expected: PASS, 5 Tests.

- [ ] **Step 7: Die Fabrik und den Stub umziehen**

`git mv` behält die Historie:

```bash
git mv core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberPointsConfiguration.kt core/src/main/kotlin/org/unividuell/countdown/core/game/internal/MemberPointsConfiguration.kt
git mv core/src/main/kotlin/org/unividuell/countdown/core/community/internal/StubMemberPoints.kt core/src/main/kotlin/org/unividuell/countdown/core/game/internal/StubMemberPoints.kt
git rm core/src/main/kotlin/org/unividuell/countdown/core/community/internal/ZeroMemberPoints.kt
git mv core/src/test/kotlin/org/unividuell/countdown/core/community/MemberPointsTest.kt core/src/test/kotlin/org/unividuell/countdown/core/game/MemberPointsTest.kt
git mv core/src/test/kotlin/org/unividuell/countdown/core/community/MemberPointsConfigurationTest.kt core/src/test/kotlin/org/unividuell/countdown/core/game/MemberPointsConfigurationTest.kt
```

In `StubMemberPoints.kt` nur das `package` auf `org.unividuell.countdown.core.game.internal` ändern und
den KDoc-Satz über `viewerId` korrigieren, weil es jetzt Runden gibt:

```kotlin
/**
 * Invented but stable standings, so the ranking and its animation can be judged on localhost and
 * staging — both of which run the seeded Futurama test users anyway, so these numbers make no claim
 * about real players.
 *
 * [viewerId] is unused here: these numbers are not tied to rounds at all, which is exactly what makes
 * them useless for judging the live-points gate — that one belongs to [RoundPlayPoints].
 */
```

`MemberPointsConfiguration.kt` bekommt das neue Package und den echten Zweig:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.core.env.Profiles
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberPointsQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import java.time.Clock

/**
 * Exactly one `MemberPointsQuery` bean by construction. The decision cannot be expressed
 * declaratively because the required condition is a complement: return stub points only when the
 * property is true AND the profile is not production. `@ConditionalOnProperty` alone cannot express
 * negation, and chaining `@Profile` with a property condition left a gap where production with a stray
 * `enabled=true` env var would create zero beans.
 *
 * It lives in `game` rather than in `community` because that is where the two candidates live, and
 * `community` must not depend on `game`. The seam itself — `MemberPointsQuery`, `MemberPoints` — stays
 * with its consumer. `ZeroMemberPoints` is gone: [RoundPlayPoints] answers `0` for a community without
 * played rounds all by itself.
 */
@Configuration
class MemberPointsConfiguration {
    @Bean
    fun memberPointsQuery(
        environment: Environment,
        plays: RoundPlayRepository,
        communities: CommunityQuery,
        engine: CountdownEngine,
        clock: Clock,
    ): MemberPointsQuery {
        val stubEnabled = environment.getProperty("app.stub-points.enabled", Boolean::class.java, false)
        val isProduction = environment.acceptsProfiles(Profiles.of("production"))
        return if (stubEnabled && !isProduction) {
            StubMemberPoints()
        } else {
            RoundPlayPoints(plays = plays, communities = communities, engine = engine, clock = clock)
        }
    }
}
```

- [ ] **Step 8: Die umgezogenen Tests anpassen**

`MemberPointsConfigurationTest`: Package auf `org.unividuell.countdown.core.game`, Import von
`org.unividuell.countdown.core.community.MemberPointsQuery` ergänzen, und die Erwartung im zweiten Test
auf die echte Implementierung ziehen — der Test bewacht weiterhin den Config-Datei-Vertrag:

```kotlin
    /**
     * Guards the config-file contract, not the factory: `app.stub-points.enabled` is set in
     * `application-staging.yaml` and nowhere else, so that no production config file has to mention
     * stubbing. Re-adding it to `application.yaml` would silently turn invented points on for every
     * environment.
     */
    @Test
    fun `real points are what a context without that property gets`() {
        val bean = applicationContext.getBean(MemberPointsQuery::class.java)
        bean::class.simpleName shouldBe "RoundPlayPoints"
    }
```

`MemberPointsTest`: Package auf `org.unividuell.countdown.core.game`, Imports auf
`…game.internal.MemberPointsConfiguration` / `…game.internal.StubMemberPoints`. Den
`ZeroMemberPoints`-Test löschen (die Klasse gibt es nicht mehr), und die Fabrik-Tests auf die neue
Signatur ziehen — die vier Mitspieler-Beans werden nie berührt, also genügen mockk-Attrappen:

```kotlin
import io.mockk.mockk
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import java.time.Clock

    private val factory = MemberPointsConfiguration()

    /** The factory only *chooses*; it never calls into these, so relaxed mocks are honest here. */
    private fun beanFor(env: org.springframework.core.env.Environment) = factory.memberPointsQuery(
        environment = env,
        plays = mockk<RoundPlayRepository>(),
        communities = mockk<CommunityQuery>(),
        engine = CountdownEngine(),
        clock = Clock.systemUTC(),
    )
```

Alle sechs Fabrik-Tests rufen `beanFor(env)` statt `factory.memberPointsQuery(env)`, und die vier
Erwartungen `"ZeroMemberPoints"` werden zu `"RoundPlayPoints"`.

- [ ] **Step 9: Restspuren im Repo suchen**

Run: `grep -rn "ZeroMemberPoints" core/ .claude/ docs/ || echo "clean"`
Erwartung: `clean`. Nennt `core/README.md` oder eine Guideline die Klasse, zieh die Stelle auf
„echte Punkte oder Stub“ nach; die Property `app.stub-points.enabled` bleibt unverändert dokumentiert.

- [ ] **Step 10: Modularität und ganze Suite**

Run: `cd core && ./mvnw clean test`
Expected: PASS. `ModularityTests` muss grün bleiben — `game → community` und `game → countdown`
existierten schon, es kommt keine Kante hinzu; `clean`, weil sich die Bean-Struktur geändert hat und
`application-modules.json` sonst stale bleibt.

- [ ] **Step 11: Committen**

```bash
git add -A core/src/main/kotlin/org/unividuell/countdown/core/ core/src/test/kotlin/org/unividuell/countdown/core/ core/README.md
git commit -m "feat(game): sum real standings over the active run's window, and move the points seam"
```

---

## Task 7: Spec nachziehen und die Regeln festhalten

Nach dieser Task steht in der Spec, dass die Zwei-Strom-Auflage eingelöst ist, und die übertragbaren Regeln aus den Scheiben 1–3 liegen als Guideline im Repo statt nur in einem Design-Dokument.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-11-round-game-selection-design.md`
- Create: `.claude/guidelines/game-rounds.md`
- Modify: `.claude/guidelines/README.md`
- Modify: `CLAUDE.md`

**Interfaces:** keine — reine Dokumentation.

- [ ] **Step 1: Den Zwei-Strom-Absatz der Spec auf den Ist-Stand ziehen**

Im Abschnitt *Warum es keinen Hidden Seed gibt* endet der Absatz heute mit „…das ändert `guesshue` und ist
deshalb nicht diese Scheibe, sondern die nächste.“ Ersetze diesen Halbsatz durch den Ist-Stand — Ton und
Länge wie der Rest des Absatzes, keine neue Überschrift:

```markdown
Die Behebung sind **zwei unabhängig geseedete Streams**, und sie ist mit dem Spielen umgesetzt:
`GameRandom` hält beide, `GuessHueDataset.draw` nimmt sie getrennt, und der Schnitt verläuft nach
**Veröffentlichung** statt nach Bedeutung — der Eintrag (und damit die Beschreibung), Sättigung,
Helligkeit und Start-Winkel kommen aus dem Präsentationsstrom, der Lösungsstrom zieht nur den Jitter.
Auch die Spieltyp-Wahl kommt aus dem Präsentationsstrom, weil sie angesagt wird. Übrig bleibt als
Rundengeheimnis genau der Jitter, und den engt kein ausgeliefertes Feld ein. Was danach noch bleibt,
ist Datensatz-Geheimhaltung — dagegen wirkt [game-content.md](../../../.claude/guidelines/game-content.md),
nicht der Generator. Guess Hues Phase 2 war die Stelle, an der es gebissen hätte: dort gibt es kein
Toleranz-Tor, nur der nächste Tipp punktet, und exakte Rekonstruktion hätte dort jede Runde gewonnen.
```

- [ ] **Step 2: Die Guideline schreiben**

`.claude/guidelines/game-rounds.md` — englisch, wie alle Guidelines, und nur was jetzt wahr ist:

```markdown
# Game rounds

How a community's round gets a game, and how a guess becomes points. See
`docs/superpowers/specs/2026-08-11-round-game-selection-design.md` for the reasoning behind each rule.

## The run is the round coordinate, not the community

A community is permanent, its countdown is not: the target event recurs, so `(community, T-58)` is not
a key — every run has its own T-58 with its own guesses and its own ranking. Everything that hangs off
a round hangs off `edition_id` (`community.editions`), and exactly one edition per community is active,
enforced by a partial unique index on `archived_at IS NULL`.

## A larger round number is earlier

Bounds are named `from`/`until`, never start/end. "The previous round" is `round_number > n`, ascending
— the first row is the most recently played one. Phase two is `round_number <= phase_two_start_round`.
The game window is inclusive on both ends, and `games_from_round = NULL` means unbounded above.

## What must be fixed per round is materialised on the first announcement

Lazily, by the `GET` that announces it, via `INSERT … ON CONFLICT DO NOTHING` followed by a `SELECT`
— **not** by catching `DuplicateKeyException`: a constraint violation marks the transaction
rollback-only in Postgres, so the re-read inside the same transaction would fail. First writer wins,
the loser reads the winner's row and plays their game.

Persisting is allowed. The anti-cheat constraint forbids *recurring admin work*, not storage.

## One secret per round, two exits — and the rule is per stream

A round's `params` blob is its only secret, and it leaves the server through exactly two functions:
`present()` before the guess, `solution()` after it. Both are pinned per game by a field-set test.

A value that is published must never be drawn from the stream that produced the solution. Not "must
not equal the solution" — `SeededRandom` is invertible (`nextDouble` publishes 53 bits of two
consecutive words, the xoshiro128** transition is a bijection), so a published double lets the state be
stepped **backwards** to whatever the same stream drew earlier. Hence `GameRandom`, with two
independently seeded streams, and the split runs along **publication**: anything the player is shown or
that gets announced comes from `presentation`, and `solution` draws only what stays here. Two seeds
from one `SecureRandom` are fine — a CSPRNG's output is not invertible to its state.

A seed derived from round coordinates is not a secret. The seed is drawn, used, and thrown away.

## The game judges, the framework awards

A game says "eligible for points" (`qualifies`) and "this far off" (`deviation`); how many points that
is worth, and whose points expire because of it, is the same for every game. The boundary runs at the
value the framework must **compare** but cannot **compute**.

Rule *and* stake come from **one** function (`awardFor`) and are frozen onto the round, which is what
lets the balance change later without costing history. A game that has a genuine precondition puts it
in `qualifies`; if nobody meets it, nobody wins — and that is the game's statement, not the rule's.

A ported rule carries the original's name in a **comment**, not in the identifier: `CLOSEST_ONLY` says
what happens, „winner takes it all“ says where it comes from. Keep it to a few words.

## Points are a cache over persisted inputs

`points` is not a verdict but a materialised view: `points = f(award rule, all verdicts of the round)`.
Two consequences worth knowing before touching it:

- **"Taking points away" needs no mechanism.** Every guess re-evaluates the whole round and writes
  `points` for all guessed rows. No removal step, no job, no events — and the re-evaluation is
  stateless, so it heals itself.
- **A scoring bugfix is a backfill**, not a shrug about lost history.

The standings sum only rounds that are **finished** and **inside the run's current window**, using the
same `windowReasonOf` the announcement uses. Shrinking the window therefore lowers a total, and
re-opening it restores the same number untouched.

## Whoever writes other rows must serialise

An evaluation across a whole round needs a row lock on the round (`SELECT … FOR UPDATE`), or the exact
moment the points move loses an update. Locking one row serialises the guesses of *one* round; rounds
do not block each other.

## Unique index instead of a service check

"One guess per player and round" is `UNIQUE (round_game_id, user_id)` plus an
`UPDATE … WHERE guessed_at IS NULL` — zero affected rows is the 409. Not read-then-check.

Judging happens **before** the write, so an invalid guess cannot consume the one attempt.

## What is replayable from timestamps needs no column

Guesses are immutable and dated, so every intermediate state can be reconstructed — which is why there
is no column recording who took whose points. "I need a column for moment X" only holds once the replay
cannot produce X. A log line covers the operational case without making the evaluation stateful.

## A switch whose right answer is the same for every case is a bug

It moves an invariant into a per-case review. `revealsOthersBeforeGuess` was the example: the others'
guesses are delivered once the viewer has guessed, unconditionally and withheld server-side. A
participation count ("7 of 15 have guessed") is fine at any time — it is a `COUNT`, not a filtered list
of guesses.

## A rule that is meant to grow gets its whole input

`GameSelection` receives the entire history of the run and the candidate list, although "not the same
game twice in a row" would need one row. That makes the next rule a change to a pure function instead
of to a query, a service and their tests. Legitimate as long as the full input is cheap — here a few
dozen two-column rows, once per round.
```

- [ ] **Step 3: Die Guideline indexieren**

In `.claude/guidelines/README.md` in der Liste — direkt vor oder nach `game-content.md`, wo die
Spiel-Themen stehen:

```markdown
- **[Game rounds](game-rounds.md)** — der Durchlauf als Rundenkoordinate, Materialisierung per
  `ON CONFLICT`, ein Geheimnis mit zwei Ausgängen und der Regel pro Strom, „das Spiel urteilt, das
  Framework vergibt“, Punkte als Cache. *(backend)*
```

In `CLAUDE.md` in derselben Liste, im gleichen Stil wie die Nachbarzeilen:

```markdown
- **[Game rounds](.claude/guidelines/game-rounds.md)** — Durchlauf als Rundenkoordinate, lazy
  Materialisierung, ein Rundengeheimnis mit zwei Ausgängen (Regel pro *Strom*), Spiel urteilt /
  Framework vergibt, `points` als Cache, Zeilensperre beim Schreiben fremder Zeilen.
```

Setz die Zeile an die Stelle, an der die anderen Spiel-Guidelines (`game-content`, `game-lab`) stehen,
und halte Reihenfolge und Formatierung der Nachbarn ein.

- [ ] **Step 4: Prüfen, dass die Guideline keine Lüge enthält**

Run: `grep -rn "revealsOthersBeforeGuess" core/src/main | cat`
Erwartung: Treffer **nur** in `gamelab` — dort lebt der Schalter noch, und Plan 4 räumt ihn samt dem
Absatz in `game-lab.md` weg. Die neue Guideline beschreibt das Framework, und dort gibt es ihn nicht;
wenn die Formulierung so klingt, als sei er überall schon weg, schärfe den Satz.

Run: `grep -rn "ZeroMemberPoints\|LabGame" .claude/guidelines/game-rounds.md || echo "clean"`
Erwartung: `clean` — die Guideline nennt keine Klasse, die es nicht (mehr) gibt.

- [ ] **Step 5: Committen**

```bash
git add docs/superpowers/specs/2026-08-11-round-game-selection-design.md .claude/guidelines/game-rounds.md .claude/guidelines/README.md CLAUDE.md
git commit -m "docs: record the playing slice - two streams delivered, and the round rules as a guideline"
```

---

## Self-Review

**Spec-Deckung** (Abschnitte gegen Tasks):

| Spec | Task |
|---|---|
| `game.round_plays` — Uhr, Tipp und Punkte | 1 |
| Zwei unabhängig geseedete Streams (Absatz in *Warum es keinen Hidden Seed gibt*) | 2, 7 |
| Der Spiel-Vertrag: `judge`, `solution`, `Judgement`, „das Spiel urteilt, das Framework vergibt“ | 3 |
| Vorbedingung (Toleranz in Phase 1, kein Tor in Phase 2) | 3 |
| Punkte sind ein Cache: beide Vergaberegeln, Gleichstand verdoppelt, Neuauswertung | 4 |
| „Punkte entziehen“ ist kein Mechanismus; Log-Zeile beim Verlust | 4 |
| Zeilensperre auf der Runde | 4 |
| Spielen: `POST …/reveal`, `POST …/guess`, drei Schritte in einer Transaktion, 409/400 | 5 |
| Aufdecken idempotent + `reveal_count`, kein Lockout | 1, 5 |
| Sichtbarkeit: kein Schalter, `others` erst nach dem eigenen Tipp, serverseitig | 5 |
| `RoundResponse` mit `payload`/`solution`/`me`/`others`; `qualifies`/`deviation` bleiben innen | 5 |
| Tippübersicht mit Namen und Avataren | 5 |
| `MemberPointsQuery`: `stable` (abgeschlossen + im Fenster), `live` (nur nach eigenem Tipp) | 6 |
| Das Fenster entscheidet die Summe, nicht den Bestand — inkl. Umkehrbarkeit | 6 |
| Umzug von `MemberPointsConfiguration`/`StubMemberPoints`, `ZeroMemberPoints` weg | 6 |
| Tests: Vergabe, Vorbedingung, Punktekurve, Punkte, Hygiene | 3, 4, 5, 6 |
| Feed knowledge back → `game-rounds.md` | 7 |

**Bewusst nicht in dieser Scheibe** (und wo es hingehört):

- **Lab-Umbau** auf `GameCatalog`/`GameType`, Phasen-Wähler, Löschen von `LabGame`/`GuessHueLabGame`/
  `SampleLabGame`/`revealsOthersBeforeGuess`, Korrektur von `game-lab.md` → **Plan 4**. Damit auch der
  Umzug des `GameType`-Vertrags ins Basis-Package, den `gamelab` dann braucht.
- **Frontend.** Der Umsetzungsschnitt der Spec hat keine Frontend-Scheibe; `webapp-vue` bleibt
  unberührt. Der Hinweis „Punkte der laufenden Runde sind unter `CLOSEST_ONLY` vorläufig“ ist in der
  Spec benannt und wartet dort.
- **Zeitwertung, Commit-Reveal, Anomalie-Erkennung, Fast Rounds, reichere Auswahlregeln,
  Wiederholungsvermeidung innerhalb eines Typs** → *Was bewusst offen bleibt* in der Spec.
- **Teilnahme-Zähler** („7 von 15 haben getippt“) — erlaubt, aber nicht gebraucht; als `COUNT`, wenn
  jemand die Anzeige will.

**Typkonsistenz** (einmal quer gelesen):

- `Judgement(qualifies, deviation, outcome)` — erzeugt in Task 3, gelesen in Task 5 (`recordGuess`),
  gespeichert als drei Spalten + `outcome` JSONB.
- `Verdict(playId, qualifies, deviation)` und `pointsFor(award, verdicts)` — Task 4, benutzt nur von
  `RoundScoring`.
- `GameRandom(solution, presentation)` — Task 2, benutzt in `GameType.draw`, `GameTypeHandle.draw`,
  `AnnouncementService.materialise` (dort auch `random.presentation` für die Auswahl).
- `CurrentRound.Announced(round, edition, roundGame, handle)` — Task 5, `copy(roundGame = round)` nach
  dem Sperren.
- `PlayPoints(userId, roundNumber, points)` — angelegt in Task 1, abgefragt in Task 6.
- `windowReasonOf(roundNumber, gamesFromRound, gamesUntilRound)` bleibt; der `(edition, roundNumber)`-
  Overload kommt in Task 6 und wird von `AnnouncementService` **und** `RoundPlayPoints` benutzt.
- `RoundPlayRepository`: `findByRoundGameIdAndUserId`, `findByRoundGameId`, `revealOrCount`,
  `recordGuess` (Task 1), `pointsOf` (Task 6) — keine weiteren Methoden, keine Umbenennungen.

**Zwei Stellen, an denen der Plan bewusst Spielraum lässt** — beide mit Entscheidungsregel im Schritt:

1. Task 1 Step 8: falls die Bindung eines `null`-`JsonNode` als Query-Parameter scheitert, `CAST(:outcome
   AS jsonb)` für genau dieses Statement.
2. Task 5 Step 8: die Fixture-Helfer für Mitgliedschaft und Einladungs-Token sind gegen den echten
   `CommunityService`/`MembershipService` zu prüfen; im Zweifel den kürzeren vorhandenen Weg nehmen
   (Repository), nicht eine neue API erfinden.
