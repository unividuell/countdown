# Runden-History — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unter der laufenden Runde hängt die vorherige als dieselbe Reveal-UI, und ein „Weiter zurück“-Button läuft den ganzen Lauf rückwärts bis zu seiner ersten angekündigten Runde.

**Architecture:** `CurrentRound` wird zu `ResolvedRound` und trägt Lauf, Runde, einen Zeiger auf die nächstältere Runde und ein `closed`-Flag — damit bleibt `RoundResponses` der eine Ort der Sichtbarkeits-Gates und `AnnouncementService.resolve` der eine Ort des Mitgliedschafts-Gates. Ein neuer `HistoryService` löst eine benannte Runde gegen die laufende auf und lehnt alles ab, was nicht strikt älter ist. Der Asset-Endpunkt wird pro Runde adressierbar und verzweigt einmal: Stufen-Gate für die laufende Runde, offen für eine abgeschlossene. Im Frontend eine Prop an `RoundCard` (`closed`), ein Composable (`useRoundHistory`) und ein Segment (`RoundHistory.vue`). Das Aufräumen der Assets beim Ankündigen fällt weg.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 / Spring Data JDBC / PostgreSQL 18 · JUnit 5 + kotest + mockk + MockMvc Kotlin DSL + Testcontainers · Vue 3 + TypeScript strict + Tailwind v4 + Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-23-round-history-design.md`](../specs/2026-08-23-round-history-design.md)

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch** mit `„…“`-Anführungszeichen, nie `"`. Spec/Plan deutsch.
- **Named arguments ab zwei Argumenten** an jedem Kotlin-Aufrufpunkt (Ausnahmen: ein Argument, varargs, Java-deklarierte Funktionen, trailing lambdas, infix).
- **Testing:** kotest-Matcher, mockk, MockMvc Kotlin DSL, Testcontainers (Docker muss laufen). Frontend: Vitest `vi`, nie mockk. **TDD: erst der fallende Test.**
- **Persistenz:** Spring Data JDBC, kein `@Column`. **Keine Migration in diesem Plan** — es kommt keine Spalte dazu.
- **Angewandte Migrationen werden nicht editiert**, auch nicht ihre Kommentare: das bricht die Flyway-Checksumme. Der falsch werdende Kommentar in `V1__create_round_audio.sql` bleibt stehen, die Korrektur geht nach `game-rounds.md` (Task 13).
- **Modulgrenzen:** `ModularityTests.verify()` muss grün bleiben. `game` importiert nie aus `gamelab`.
- **Logging:** kotlin-logging, `private val logger = KotlinLogging.logger {}` in der Klasse, immer Lambda-Messages.
- **Keine redundanten Inline-Kommentare** — Kommentare nur für Constraints, die der Code nicht zeigen kann.
- **Eine größere Rundennummer ist früher.** „Die vorherige Runde“ heißt `round_number > n`. Nach oben begrenzt nur `gamesFromRound`; `gamesUntilRound` grenzt die jüngere Seite ab.
- **Die Sicherheitszeile:** `GET /rounds/{roundNumber}` nimmt ausschließlich Runden **strikt älter** als die laufende. Ohne diese Zeile ist der Endpunkt ein zweiter Weg an die Lösung der laufenden Runde.
- Backend-Befehle aus `core/`, Frontend-Befehle aus `webapp-vue/`.
- **`GuessHueGame`s Reveal-Watch bleibt ohne `immediate: true`.** Eine History-Karte montiert immer
  schon aufgelöst; nur der echte `null → non-null`-Übergang darf die Choreografie starten, sonst
  spielt jede History-Karte beim Erscheinen die Aufdeck-Animation nach.
- Branch ist bereits `claude/community-edition-round-history-3d61a0`; PRs gehen gegen `develop`.

## File Structure

**Backend, neu**

| Datei | Verantwortung |
| --- | --- |
| `core/src/main/kotlin/.../game/internal/ResolvedRound.kt` | Ersetzt `CurrentRound.kt`. Der sealed Typ für „eine aufgelöste Runde“ — laufend oder abgeschlossen. |
| `core/src/main/kotlin/.../game/internal/HistoryService.kt` | Löst eine benannte, ältere Runde auf. Besitzt die Ablehnungsregeln. |
| `core/src/test/kotlin/.../game/RoundHistoryServiceTest.kt` | Integrationstest der offenen Gates und aller Ablehnungen. |

**Backend, geändert**

| Datei | Änderung |
| --- | --- |
| `.../game/internal/RoundGameRepository.kt` | `previousRoundNumber`-Query. `idsOfOtherRounds` fällt weg. |
| `.../game/internal/RoundGameStore.kt` | `previousRound(edition, roundNumber)`. `roundIdsExcept` fällt weg. |
| `.../game/internal/AnnouncementService.kt` | Füllt die neuen Felder; `releaseEarlierRounds` fällt weg. |
| `.../game/internal/RoundResponses.kt` | `open = hasGuessed \|\| closed`; reicht den Zeiger durch. |
| `.../game/internal/RoundDtos.kt` | `RoundResponse.previousRoundNumber`. |
| `.../game/internal/PlayService.kt` | Asset-Pfad verzweigt an der Rundennummer. |
| `.../game/internal/RoundController.kt` | `GET /{roundNumber}`, `GET /{roundNumber}/assets/{key}`. |
| `.../game/internal/GameExceptions.kt`, `GameExceptionHandler.kt` | `RoundNotFoundException` → 404. |

**Frontend, neu**

| Datei | Verantwortung |
| --- | --- |
| `webapp-vue/src/ui/LabelledDivider.vue` | Waagerechte Linie mit Label in der Mitte. Rein präsentativ. |
| `webapp-vue/src/rounds/useRoundHistory.ts` | Die geladene Liste, der abgeleitete Zeiger, `loadMore` über `useAction`. |
| `webapp-vue/src/rounds/RoundHistory.vue` | Das Segment: Trenner, Karten, Button oder Abschlusshinweis. |

**Frontend, geändert:** `src/api/rounds.ts` (`getRound`, neuer Asset-Pfad), `src/api/types.ts` (ein Feld), `src/rounds/RoundCard.vue` (`closed`), `src/pages/c/[slug]/index.vue` (montiert das Segment).

---

### Task 1: Der Zeiger in die Vergangenheit

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameRepository.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameStore.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundGameRepositoryTest.kt`

**Interfaces:**
- Consumes: nichts.
- Produces: `RoundGameStore.previousRound(edition: CommunityEdition, roundNumber: Int): Int?` — die nächstältere angekündigte Rundennummer innerhalb des Spielfensters, oder `null`.

- [ ] **Step 1: Write the failing tests**

In `RoundGameRepositoryTest.kt` ans Ende der Klasse, vor der schließenden `}`:

```kotlin
    @Test
    fun `previousRound is the next larger announced round number, skipping gaps`() {
        val edition = anEdition("rg-previous")
        for (roundNumber in listOf(20, 17, 12)) {
            store.announce(
                edition = edition, roundNumber = roundNumber, gameType = "guess-hue",
                params = json("""{"n":$roundNumber}"""),
                award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
                announcedAt = announcedAt,
            )
        }

        store.previousRound(edition = edition, roundNumber = 12) shouldBe 17
        // 18 and 19 were never announced; the chain steps over them instead of ending there.
        store.previousRound(edition = edition, roundNumber = 17) shouldBe 20
        store.previousRound(edition = edition, roundNumber = 20).shouldBeNull()
    }

    @Test
    fun `previousRound stops at the run's game window`() {
        val edition = editions.save(anEdition("rg-previous-window").copy(gamesFromRound = 18))
        for (roundNumber in listOf(20, 17)) {
            store.announce(
                edition = edition, roundNumber = roundNumber, gameType = "guess-hue",
                params = json("""{"n":$roundNumber}"""),
                award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
                announcedAt = announcedAt,
            )
        }

        // Round 20 lies BEFORE the window — a larger number is earlier — so it is not reachable,
        // exactly as the standings do not sum it.
        store.previousRound(edition = edition, roundNumber = 17).shouldBeNull()
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd core && ./mvnw test -Dtest=RoundGameRepositoryTest`
Expected: Kompilierfehler — `Unresolved reference: previousRound`.

- [ ] **Step 3: Add the query**

In `RoundGameRepository.kt`, direkt unter `historyOf`:

```kotlin
    /**
     * The next round of this edition **earlier in time** than [after] — the smallest round number
     * above it, because a larger round number is earlier. [notOlderThan] caps the walk at the run's
     * game window; older means a larger number, so `gamesFromRound` is the only bound that can
     * exclude an older round.
     *
     * `MIN` over an empty set is `NULL`, and that IS „ganz am Anfang“ — no second query and no
     * `COUNT` needed to tell the two apart.
     */
    @Query(
        """
        SELECT MIN(round_number) FROM game.round_games
        WHERE edition_id = :editionId AND round_number > :after AND round_number <= :notOlderThan
        """,
    )
    fun previousRoundNumber(editionId: UUID, after: Int, notOlderThan: Int): Int?
```

- [ ] **Step 4: Add the store method**

In `RoundGameStore.kt`, direkt unter `history`:

```kotlin
    /**
     * The next older announced round of [edition], or `null` when [roundNumber] is the oldest one
     * the run has. `Int.MAX_VALUE` stands in for an unbounded window, which is what a `null`
     * `gamesFromRound` means.
     */
    @Transactional(readOnly = true)
    fun previousRound(edition: CommunityEdition, roundNumber: Int): Int? =
        rounds.previousRoundNumber(
            editionId = requireNotNull(edition.id),
            after = roundNumber,
            notOlderThan = edition.gamesFromRound ?: Int.MAX_VALUE,
        )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd core && ./mvnw test -Dtest=RoundGameRepositoryTest`
Expected: PASS, alle Fälle der Klasse.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameRepository.kt core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameStore.kt core/src/test/kotlin/org/unividuell/countdown/core/game/RoundGameRepositoryTest.kt
git commit -m "feat(game): the next older announced round of a run"
```

---

### Task 2: `CurrentRound` wird `ResolvedRound`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/ResolvedRound.kt`
- Delete: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/CurrentRound.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/AnnouncementService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/AnnouncementServiceTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PlayServiceTest.kt`

**Interfaces:**
- Consumes: `RoundGameStore.previousRound(edition, roundNumber): Int?` (Task 1).
- Produces:
  - `ResolvedRound` mit `communityId: UUID`, `edition: CommunityEdition?`, `round: Round?`, `previousRoundNumber: Int?`
  - `ResolvedRound.NoGame(communityId, edition, round, previousRoundNumber, reason)`
  - `ResolvedRound.Announced(communityId, edition, round, previousRoundNumber, roundGame, handle, closed)`
  - `RoundResponse.previousRoundNumber: Int?` (Default `null`)
  - `AnnouncementService.resolve(slug, userId, isSuperAdmin): ResolvedRound`

- [ ] **Step 1: Write the failing test**

In `AnnouncementServiceTest.kt` ans Ende der Klasse:

```kotlin
    @Test
    fun `the announcement names the previous round, and null while there is none`() {
        val (community, viewer) = aCommunityWithOwner("Previous Pointer")
        val edition = requireNotNull(
            editionRepository.findActiveByCommunityId(requireNotNull(community.id)),
        )
        val currentNumber = currentRoundNumberOf(community)

        announcements.currentRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
        ).previousRoundNumber.shouldBeNull()

        // Three rounds earlier in time — a larger number — and with a gap, so the pointer has to
        // answer with the nearest one rather than the oldest.
        store.announce(
            edition = edition, roundNumber = currentNumber + 3, gameType = "guess-hue",
            params = mapper.readTree("""{"n":1}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )

        announcements.currentRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
        ).previousRoundNumber shouldBe currentNumber + 3
    }
```

Und in `PlayServiceTest.kt` ans Ende der Klasse — die Falle, dass der Zeiger nur auf dem `GET`
landet:

```kotlin
    @Test
    fun `an action response names the previous round too`() {
        val (community, viewer) = aCommunity("Pointer On Actions")
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val older = currentRoundNumberOf(community) + 2
        store.announce(
            edition = edition, roundNumber = older, gameType = "guess-hue",
            params = mapper.readTree("""{"n":1}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )

        // The client replaces its whole round object with an action response, so a pointer only on
        // the GET would make the history disappear on the first guess.
        play.reveal(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
        ).previousRoundNumber shouldBe older
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd core && ./mvnw test -Dtest='AnnouncementServiceTest,PlayServiceTest'`
Expected: Kompilierfehler — `Unresolved reference: previousRoundNumber`.

- [ ] **Step 3: Create `ResolvedRound.kt` and delete `CurrentRound.kt`**

```kotlin
package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.countdown.Round
import org.unividuell.countdown.core.game.GameTypeHandle
import java.util.UUID

/**
 * A round of a community, resolved — the running one, or a closed one from its history.
 *
 * All four endpoints resolve through the same function and then diverge: the announcement renders
 * this, revealing and guessing insist on [Announced] first, the history resolves a named round
 * against the running one. Without a shared type each of them would repeat the membership check,
 * the window check and the materialisation, and they would drift.
 */
sealed interface ResolvedRound {

    /** Whose round this is. Every consumer that draws a person needs it, and it is known before
     *  the round is: the gate resolves the community first. */
    val communityId: UUID

    /** The run the round hangs off. `null` only when the community has none — then there is no grid
     *  either, and nothing can be resolved against it. */
    val edition: CommunityEdition?

    /** `null` when there is no grid at all — no active run, or no target date. */
    val round: Round?

    /**
     * The next older announced round inside the run's window, or `null` for „ganz am Anfang“.
     *
     * Lives here rather than as a parameter of [RoundResponses.of] because all six response call
     * sites need it and none of them may forget it: the client replaces its whole round object with
     * every action response, so a pointer only on the `GET` would lose the history on the first
     * guess.
     */
    val previousRoundNumber: Int?

    data class NoGame(
        override val communityId: UUID,
        override val edition: CommunityEdition?,
        override val round: Round?,
        override val previousRoundNumber: Int?,
        val reason: NoGameReason,
    ) : ResolvedRound

    data class Announced(
        override val communityId: UUID,
        override val edition: CommunityEdition,
        override val round: Round,
        override val previousRoundNumber: Int?,
        val roundGame: RoundGame,
        val handle: GameTypeHandle<*>,
        /**
         * Whether this round is over. Not a switch anybody answers per case — the announcement path
         * always passes `false`, the history path always `true` — but the one fact that decides
         * whether the visibility gates in [RoundResponses] are still holding anything back.
         */
        val closed: Boolean,
    ) : ResolvedRound
}
```

```bash
git rm core/src/main/kotlin/org/unividuell/countdown/core/game/internal/CurrentRound.kt
```

- [ ] **Step 4: Rewrite `AnnouncementService.resolve`**

`currentRound` bleibt bis auf den Rückgabetyp der Hilfsfunktion unverändert. `resolve` und die zwei privaten Helfer:

```kotlin
    /**
     * The gate and the materialisation, shared by all four endpoints: membership, the run, the
     * window, then the announced round — created here if this is the first caller of the round.
     */
    @Transactional
    fun resolve(slug: String, userId: UUID, isSuperAdmin: Boolean): ResolvedRound {
        val community = communities.findBySlug(slug) ?: throw RoundAccessDeniedException()
        val communityId = requireNotNull(community.id)
        if (!isSuperAdmin && !memberships.isActiveMember(communityId = communityId, userId = userId)) {
            throw RoundAccessDeniedException()
        }
        val edition = communities.activeEditionOf(communityId)
            ?: return notScheduled(communityId = communityId, edition = null)
        val startsAt = edition.startsAt
            ?: return notScheduled(communityId = communityId, edition = edition)

        val round = engine.roundAt(
            now = clock.instant(),
            startsAt = startsAt,
            zone = ZoneId.of(edition.startsAtTimezone),
        )
        // Computed for every answer, including the ones that carry no game: the history hangs under
        // the fallback too, and after the event that is the only reason to open the page.
        val previous = store.previousRound(edition = edition, roundNumber = round.number)
        windowReasonOf(edition = edition, roundNumber = round.number)?.let { reason ->
            return ResolvedRound.NoGame(
                communityId = communityId, edition = edition, round = round,
                previousRoundNumber = previous, reason = reason,
            )
        }

        val existing = store.find(edition = edition, roundNumber = round.number)
        return announcedOrNoGame(
            communityId = communityId,
            edition = edition,
            round = round,
            previousRoundNumber = previous,
            roundGame = existing ?: materialise(edition = edition, round = round)
                ?: return ResolvedRound.NoGame(
                    communityId = communityId, edition = edition, round = round,
                    previousRoundNumber = previous, reason = NoGameReason.NO_GAME_TYPE,
                ),
        )
    }

    /** No run, or a run without a target date: no grid, so nothing can be previous to anything. */
    private fun notScheduled(communityId: UUID, edition: CommunityEdition?) = ResolvedRound.NoGame(
        communityId = communityId, edition = edition, round = null,
        previousRoundNumber = null, reason = NoGameReason.NOT_SCHEDULED,
    )

    /**
     * Reads the game type off the stored row, not off the draw: on a lost race the row belongs to
     * whoever announced first, and their game is the one everybody plays.
     */
    private fun announcedOrNoGame(
        communityId: UUID,
        edition: CommunityEdition,
        round: Round,
        previousRoundNumber: Int?,
        roundGame: RoundGame,
    ): ResolvedRound {
        val handle = catalog.handle(roundGame.gameType)
        if (handle == null) {
            logger.warn {
                "round ${round.number} announced as '${roundGame.gameType}', which this build has no game for"
            }
            return ResolvedRound.NoGame(
                communityId = communityId, edition = edition, round = round,
                previousRoundNumber = previousRoundNumber, reason = NoGameReason.NO_GAME_TYPE,
            )
        }
        return ResolvedRound.Announced(
            communityId = communityId,
            edition = edition,
            round = round,
            previousRoundNumber = previousRoundNumber,
            roundGame = roundGame,
            handle = handle,
            closed = false,
        )
    }
```

`currentRound`s Signatur bleibt; nur der Import/Typ ändert sich implizit.

- [ ] **Step 5: Add the DTO field**

In `RoundDtos.kt`, in `RoundResponse` direkt nach `noGameReason`:

```kotlin
    /**
     * The next older announced round of this run, or `null` for „ganz am Anfang“. Present on every
     * round answer, the action responses included: the client replaces its whole round object with
     * each of them, so a pointer only on the `GET` would lose the history on the first guess.
     */
    val previousRoundNumber: Int? = null,
```

- [ ] **Step 6: Pass it through `RoundResponses`**

`of` und `announced` — `CurrentRound` → `ResolvedRound`, plus je eine Zeile:

```kotlin
    fun of(current: ResolvedRound, viewerId: UUID): RoundResponse = when (current) {
        is ResolvedRound.NoGame -> RoundResponse(
            round = current.round?.toDto(),
            game = null,
            noGameReason = current.reason,
            previousRoundNumber = current.previousRoundNumber,
        )

        is ResolvedRound.Announced -> announced(current = current, viewerId = viewerId)
    }
```

In `announced(...)` in das `RoundResponse(...)` aufnehmen: `previousRoundNumber = current.previousRoundNumber,` und die Signatur auf `current: ResolvedRound.Announced` ändern.

- [ ] **Step 7: Rename the type in `PlayService`**

Rein mechanisch: `CurrentRound.Announced` → `ResolvedRound.Announced`, `CurrentRound.NoGame` → `ResolvedRound.NoGame`, der Rückgabetyp von `playable` auf `ResolvedRound.Announced`. `current.copy(roundGame = round)` bleibt gültig.

- [ ] **Step 8: Run the full module suite**

Run: `cd core && ./mvnw test -Dtest='Round*Test,Announcement*Test,PlayService*Test,Lab*Test,ModularityTests'`
Expected: PASS, inklusive der beiden neuen Fälle aus Step 1. Sollte ein Test noch `CurrentRound` importieren, dort ebenfalls umbenennen — keine weiteren Anpassungen.

- [ ] **Step 9: Commit**

```bash
git add -A core/src
git commit -m "refactor(game): a resolved round carries its run and its previous round"
```

---

### Task 3: `HistoryService` und die offenen Gates

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/HistoryService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptions.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptionHandler.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundHistoryServiceTest.kt`

**Interfaces:**
- Consumes: `ResolvedRound`, `AnnouncementService.resolve`, `RoundGameStore.previousRound`, `RoundResponses.of`, `CountdownEngine.intervalOf(number, startsAt, zone)`.
- Produces:
  - `HistoryService.pastRound(slug: String, userId: UUID, isSuperAdmin: Boolean, roundNumber: Int): RoundResponse`
  - `HistoryService.resolve(current: ResolvedRound, roundNumber: Int): ResolvedRound`
  - `RoundNotFoundException`

- [ ] **Step 1: Write the failing test**

Neue Datei `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundHistoryServiceTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.HistoryService
import org.unividuell.countdown.core.game.internal.NoGameReason
import org.unividuell.countdown.core.game.internal.RoundAccessDeniedException
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundNotFoundException
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.songsnippet.SongSnippetTestCatalogConfiguration
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * The history endpoint's service: which rounds it accepts, and what a closed round shows.
 *
 * [PastGame] is a fake with a real solution, announced directly through [RoundGameStore] so the
 * selection never gets to pick something else for a planted round.
 *
 * Every case here calls `pastRound`, which resolves — and therefore MATERIALISES — the running
 * round. `song-snippet` is an unconditional bean, so its draw could win that materialisation and
 * download a Deezer preview; [SongSnippetTestCatalogConfiguration] is what keeps this test off the
 * network.
 */
@Import(
    TestcontainersConfiguration::class,
    RoundHistoryServiceTest.PastGame::class,
    SongSnippetTestCatalogConfiguration::class,
)
@SpringBootTest
@Transactional
class RoundHistoryServiceTest(
    @Autowired val history: HistoryService,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    @TestConfiguration
    class PastGame {
        data class PastParams(val answer: String)
        data class PastPayload(val hint: String) : GamePayload
        data class PastSolution(val answer: String) : GameSolution

        @Bean
        fun pastGame(): GameType<PastParams> = object : GameType<PastParams> {
            override val id = "past-fake"
            override val displayName = "Vergangen"
            override val paramsType = PastParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = PastParams(answer = "42")
            override fun present(params: PastParams) = PastPayload(hint = "zwei Ziffern")
            override fun requiresReveal(params: PastParams) = false
            override fun judge(params: PastParams, guess: JsonNode) = Judgement(
                qualifies = guess.get("answer")?.asString() == params.answer,
                deviation = 0.0,
                outcome = null,
            )
            override fun solution(params: PastParams) = PastSolution(answer = params.answer)
        }
    }

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = login)).id)

    private fun aCommunity(name: String): Pair<Community, UUID> {
        val ownerId = aUser("owner")
        val community = communities.create(creatorUserId = ownerId, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        return community to ownerId
    }

    private fun aMember(community: Community, login: String): UUID {
        val userId = aUser(login)
        members.save(
            CommunityMember(
                communityId = requireNotNull(community.id), userId = userId,
                status = MemberStatus.ACTIVE,
            ),
        )
        return userId
    }

    private fun currentRoundNumberOf(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    /** Plants an announced round of [gameType] at [roundNumber] and returns its id. */
    private fun announceAt(community: Community, roundNumber: Int, gameType: String = "past-fake"): UUID {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return requireNotNull(
            store.announce(
                edition = edition, roundNumber = roundNumber, gameType = gameType,
                params = mapper.readTree("""{"answer":"42"}"""),
                award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
                announcedAt = clock.instant(),
            ).id,
        )
    }

    private fun aFinishedPlay(roundGameId: UUID, userId: UUID, answer: String) {
        plays.revealOrCount(roundGameId = roundGameId, userId = userId, revealedAt = clock.instant())
        val play = requireNotNull(
            plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId),
        )
        plays.recordGuess(
            id = requireNotNull(play.id),
            guess = mapper.readTree("""{"answer":"$answer"}"""),
            guessedAt = clock.instant(),
            qualifies = answer == "42",
            deviation = 0.0,
            outcome = null,
        )
    }

    @Test
    fun `a closed round shows its payload, its solution and every finished guess to someone who never played it`() {
        val (community, viewer) = aCommunity("History Open")
        val player = aMember(community, "player")
        val past = currentRoundNumberOf(community) + 1
        val roundGameId = announceAt(community = community, roundNumber = past)
        aFinishedPlay(roundGameId = roundGameId, userId = player, answer = "42")

        val res = history.pastRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = past,
        )

        res.round.shouldNotBeNull().number shouldBe past
        res.game.shouldNotBeNull().id shouldBe "past-fake"
        res.payload.shouldNotBeNull()
        res.solution.shouldNotBeNull()
        res.me.shouldBeNull()
        res.others shouldHaveSize 1
        res.others.first().userId shouldBe player
    }

    @Test
    fun `a revealed but never guessed row stays out of a closed round's others`() {
        val (community, viewer) = aCommunity("History Lurker")
        val lurker = aMember(community, "lurker")
        val past = currentRoundNumberOf(community) + 1
        val roundGameId = announceAt(community = community, roundNumber = past)
        plays.revealOrCount(roundGameId = roundGameId, userId = lurker, revealedAt = clock.instant())

        val res = history.pastRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = past,
        )

        // Who looked is about people, not about the round; the end of the round does not change that.
        res.others shouldHaveSize 0
    }

    @Test
    fun `the running round and anything newer is not history`() {
        val (community, viewer) = aCommunity("History Current")
        val current = currentRoundNumberOf(community)

        shouldThrow<RoundNotFoundException> {
            history.pastRound(
                slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = current,
            )
        }
        shouldThrow<RoundNotFoundException> {
            history.pastRound(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = current - 1,
            )
        }
    }

    @Test
    fun `a round that was never announced is not history`() {
        val (community, viewer) = aCommunity("History Missing")

        shouldThrow<RoundNotFoundException> {
            history.pastRound(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = currentRoundNumberOf(community) + 5,
            )
        }
    }

    @Test
    fun `a round that fell out of the run's window is not history`() {
        val (community, viewer) = aCommunity("History Window")
        val past = currentRoundNumberOf(community) + 1
        announceAt(community = community, roundNumber = past)
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        editions.save(edition.copy(gamesFromRound = past - 1))

        shouldThrow<RoundNotFoundException> {
            history.pastRound(
                slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = past,
            )
        }
    }

    @Test
    fun `previousRoundNumber chains through the history and ends at null`() {
        val (community, viewer) = aCommunity("History Chain")
        val current = currentRoundNumberOf(community)
        announceAt(community = community, roundNumber = current + 1)
        announceAt(community = community, roundNumber = current + 4)

        history.pastRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = current + 1,
        ).previousRoundNumber shouldBe current + 4
        history.pastRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = current + 4,
        ).previousRoundNumber.shouldBeNull()
    }

    @Test
    fun `a closed round whose game this build lacks keeps its round and its pointer`() {
        val (community, viewer) = aCommunity("History Unknown Type")
        val current = currentRoundNumberOf(community)
        announceAt(community = community, roundNumber = current + 1, gameType = "gone-away")
        announceAt(community = community, roundNumber = current + 2)

        val res = history.pastRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = current + 1,
        )

        res.game.shouldBeNull()
        res.noGameReason shouldBe NoGameReason.NO_GAME_TYPE
        res.round.shouldNotBeNull().number shouldBe current + 1
        // The chain walks past the gap instead of ending at it.
        res.previousRoundNumber shouldBe current + 2
    }

    @Test
    fun `a non-member gets no history at all`() {
        val (community, _) = aCommunity("History Secret")
        val outsider = aUser("outsider")
        val past = currentRoundNumberOf(community) + 1
        announceAt(community = community, roundNumber = past)

        shouldThrow<RoundAccessDeniedException> {
            history.pastRound(
                slug = community.slug, userId = outsider, isSuperAdmin = false, roundNumber = past,
            )
        }
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=RoundHistoryServiceTest`
Expected: Kompilierfehler — `Unresolved reference: HistoryService`, `RoundNotFoundException`.

- [ ] **Step 3: Add the exception and its mapping**

In `GameExceptions.kt`:

```kotlin
/**
 * No such round in this community's history → 404. Every reason lands here on purpose — not strictly
 * older than the running round, never announced, outside the run's window — because telling them
 * apart would tell the caller which rounds exist.
 */
class RoundNotFoundException(message: String = "no such round") : RuntimeException(message)
```

In `GameExceptionHandler.kt` die erste `@ExceptionHandler`-Liste erweitern:

```kotlin
    @ExceptionHandler(
        RoundAccessDeniedException::class,
        AssetNotFoundException::class,
        RoundNotFoundException::class,
    )
```

- [ ] **Step 4: Open the gates in `RoundResponses`**

In `announced(...)`, `hasGuessed` behalten und ergänzen:

```kotlin
        val hasGuessed = mine?.guessedAt != null
        // A closed round holds nothing back: nobody can play it any more, so the gate that protects
        // the answer has nothing left to protect. What stays withheld either way is a
        // revealed-but-unguessed row — that says who looked, which is about people, not the round.
        val open = hasGuessed || current.closed
        val visible = if (open) {
            rows.filter { it.userId != viewerId && it.guessedAt != null }
        } else {
            emptyList()
        }
```

und in dem `RoundResponse(...)`:

```kotlin
            payload = if (open || mine != null) current.handle.present(current.roundGame.params) else null,
            solution = if (open) current.handle.solution(current.roundGame.params) else null,
```

- [ ] **Step 5: Create `HistoryService.kt`**

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.GameCatalog
import java.time.ZoneId
import java.util.UUID

/**
 * Rounds that are over.
 *
 * Only the running round is playable, so a closed round has nothing left to protect — see the
 * visibility table in `docs/superpowers/specs/2026-08-23-round-history-design.md`. The one line
 * that must never move is the strictly-older refusal below: without it this is a second way to the
 * running round's solution, past `present()`/`solution()` and their field-set tests.
 */
@Service
class HistoryService(
    private val announcements: AnnouncementService,
    private val store: RoundGameStore,
    private val catalog: GameCatalog,
    private val responses: RoundResponses,
    private val engine: CountdownEngine,
) {

    /**
     * Not `readOnly`: [AnnouncementService.resolve] materialises the running round for its first
     * caller of the day, and that caller may well be this one.
     */
    @Transactional
    fun pastRound(slug: String, userId: UUID, isSuperAdmin: Boolean, roundNumber: Int): RoundResponse =
        responses.of(
            current = resolve(
                current = announcements.resolve(
                    slug = slug, userId = userId, isSuperAdmin = isSuperAdmin,
                ),
                roundNumber = roundNumber,
            ),
            viewerId = userId,
        )

    /**
     * [roundNumber] against an already-resolved running round. The parameter rather than a second
     * `resolve()` call, so the asset path does not resolve the same round twice.
     */
    fun resolve(current: ResolvedRound, roundNumber: Int): ResolvedRound {
        val edition = current.edition ?: throw RoundNotFoundException()
        val startsAt = edition.startsAt ?: throw RoundNotFoundException()
        val currentNumber = current.round?.number ?: throw RoundNotFoundException()
        // A larger number is earlier: only strictly older rounds are history. This is the line that
        // keeps the running round's solution out of here.
        if (roundNumber <= currentNumber) throw RoundNotFoundException()
        if (windowReasonOf(edition = edition, roundNumber = roundNumber) != null) {
            throw RoundNotFoundException()
        }
        val roundGame = store.find(edition = edition, roundNumber = roundNumber)
            ?: throw RoundNotFoundException()
        val round = engine.intervalOf(
            number = roundNumber,
            startsAt = startsAt,
            zone = ZoneId.of(edition.startsAtTimezone),
        )
        val previous = store.previousRound(edition = edition, roundNumber = roundNumber)
        // A type this build has no game for is a gap the history shows rather than hides, and the
        // chain walks past it.
        val handle = catalog.handle(roundGame.gameType) ?: return ResolvedRound.NoGame(
            communityId = current.communityId,
            edition = edition,
            round = round,
            previousRoundNumber = previous,
            reason = NoGameReason.NO_GAME_TYPE,
        )
        return ResolvedRound.Announced(
            communityId = current.communityId,
            edition = edition,
            round = round,
            previousRoundNumber = previous,
            roundGame = roundGame,
            handle = handle,
            closed = true,
        )
    }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd core && ./mvnw test -Dtest=RoundHistoryServiceTest`
Expected: PASS, alle acht Fälle.

- [ ] **Step 7: Run the neighbours to prove the live gates did not move**

Run: `cd core && ./mvnw test -Dtest='PlayService*Test,RoundResponses*Test,RoundControllerTest,Announcement*Test'`
Expected: PASS. `open` darf für die laufende Runde nichts geöffnet haben — genau das prüfen die bestehenden Withholding-Tests.

- [ ] **Step 8: Commit**

```bash
git add core/src
git commit -m "feat(game): a closed round shows its solution to every member"
```

---

### Task 4: Der History-Endpunkt

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundControllerTest.kt`

**Interfaces:**
- Consumes: `HistoryService.pastRound(slug, userId, isSuperAdmin, roundNumber)`.
- Produces: `GET /api/communities/{slug}/rounds/{roundNumber}`.

- [ ] **Step 1: Write the failing tests**

In `RoundControllerTest.kt`: `@MockkBean lateinit var histories: HistoryService` zu den beiden bestehenden `@MockkBean` dazu, dann ans Ende der Klasse:

```kotlin
    @Test
    fun `GET a past round returns it with its previous-round pointer`() {
        every {
            histories.pastRound(slug = "team", userId = uid, isSuperAdmin = false, roundNumber = 13)
        } returns RoundResponse(
            round = RoundDto(
                number = 13, label = "T-13",
                start = Instant.parse("2026-08-11T10:00:00Z"),
                end = Instant.parse("2026-08-12T10:00:00Z"),
            ),
            game = GameDto(id = "guess-hue", displayName = "Farbausmalung", requiresReveal = false),
            noGameReason = null,
            previousRoundNumber = 14,
            solution = GuessHueSolution(targetHue = 5.0, toleranceDeg = 10.0),
        )

        mockMvc.get("/api/communities/team/rounds/13") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.round.number") { value(13) }
            jsonPath("$.previousRoundNumber") { value(14) }
            jsonPath("$.solution.targetHue") { value(5.0) }
        }
    }

    @Test
    fun `GET a round that is not history is 404`() {
        every {
            histories.pastRound(slug = "team", userId = uid, isSuperAdmin = false, roundNumber = 11)
        } throws RoundNotFoundException()

        mockMvc.get("/api/communities/team/rounds/11") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `GET a past round passes the super-admin flag through`() {
        every {
            histories.pastRound(slug = "team", userId = uid, isSuperAdmin = true, roundNumber = 13)
        } returns RoundResponse(round = null, game = null, noGameReason = null)

        mockMvc.get("/api/communities/team/rounds/13") { with(principalFor(superAdmin = true)) }
            .andExpect { status { isOk() } }
    }

    @Test
    fun `GET a past round requires a session`() {
        mockMvc.get("/api/communities/team/rounds/13").andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `the current segment still wins over the round-number template`() {
        every {
            announcements.currentRound(slug = "team", userId = uid, isSuperAdmin = false)
        } returns RoundResponse(round = null, game = null, noGameReason = NoGameReason.NOT_SCHEDULED)

        mockMvc.get("/api/communities/team/rounds/current") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.noGameReason") { value("NOT_SCHEDULED") }
        }
    }
```

Imports ergänzen: `org.unividuell.countdown.core.game.internal.HistoryService`, `...RoundNotFoundException`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd core && ./mvnw test -Dtest=RoundControllerTest`
Expected: Kompilierfehler bzw. 404/405 auf `/rounds/13`.

- [ ] **Step 3: Add the mapping**

In `RoundController.kt` `histories: HistoryService` in den Konstruktor, und nach `current()`:

```kotlin
    /**
     * A round of this community's history. Only rounds **strictly older** than the running one —
     * the running round's own answer is `/current`, and the service refuses anything else with 404.
     */
    @GetMapping("/{roundNumber}")
    fun past(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable roundNumber: Int,
    ): RoundResponse = histories.pastRound(
        slug = slug,
        userId = me.id,
        isSuperAdmin = me.isSuperAdmin,
        roundNumber = roundNumber,
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd core && ./mvnw test -Dtest=RoundControllerTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src
git commit -m "feat(game): GET a past round of a community"
```

---

### Task 5: Assets werden pro Runde adressiert

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundController.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundAssetGateTest.kt`

**Interfaces:**
- Consumes: `HistoryService.resolve(current, roundNumber)`.
- Produces: `GET /api/communities/{slug}/rounds/{roundNumber}/assets/{key}`; `PlayService.asset` behält seine Signatur.

- [ ] **Step 1: Rewrite the failing tests**

In `RoundAssetGateTest.kt` den Fall `an unfilled key inside the allowed range is a 404, a foreign round a 409` **ersetzen** durch:

```kotlin
    @Test
    fun `an unfilled key inside the allowed range is a 404, and a newer round is unknown`() {
        val (community, viewer) = aCommunity("Asset Gate Not Found")
        val roundNumber = announceGated(community)
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        play.skip(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, fromStage = 0,
        )

        shouldThrow<AssetNotFoundException> {
            play.asset(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = roundNumber, key = 1,
            )
        }
        // A SMALLER number is later in time: a round that has not happened is no round at all.
        shouldThrow<RoundNotFoundException> {
            play.asset(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = roundNumber - 1, key = 0,
            )
        }
    }

    @Test
    fun `a closed round's assets are open, without a play row and above every stage`() {
        val (community, viewer) = aCommunity("Asset Gate Closed")
        // The running round is announced first on purpose: `play.asset` resolves it, and resolving
        // an un-announced round MATERIALISES it — which would let the selection draw `song-snippet`
        // and download a Deezer preview inside an asset test.
        announceGated(community)
        val past = currentRoundNumberOf(community) + 1
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        store.announce(
            edition = edition, roundNumber = past, gameType = "gated-fake",
            params = mapper.readTree("""{"answer":"42"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )

        // Never revealed, never guessed: whoever missed the round may still hear it afterwards.
        play.asset(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = past, key = 0,
        ).bytes shouldBe byteArrayOf(0)
        play.asset(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = past, key = SOLUTION_ASSET_KEY,
        ).mediaType shouldBe "audio/mpeg"
    }
```

Und der Fall, den die Spec ausdrücklich nennt — nach dem Event darf die History nicht verstummen:

```kotlin
    @Test
    fun `a closed round's assets survive the window closing over them`() {
        val (community, viewer) = aCommunity("Asset Gate After Window")
        val past = currentRoundNumberOf(community) + 1
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        store.announce(
            edition = edition, roundNumber = past, gameType = "gated-fake",
            params = mapper.readTree("""{"answer":"42"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )
        // The run's window now ends one round before the running one, so the running round carries
        // no game at all (AFTER_WINDOW). The branch has to key off the round NUMBER — off „does the
        // running round carry a game“ it would take every reveal clip of the history down with it
        // on the day the event ends.
        //
        // No `announceGated` needed here, unlike the case above: the window check runs BEFORE the
        // materialisation, so nothing can be drawn for the running round at all.
        editions.save(edition.copy(gamesUntilRound = past))

        play.asset(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = past, key = SOLUTION_ASSET_KEY,
        ).mediaType shouldBe "audio/mpeg"
    }
```

Imports ergänzen: `org.unividuell.countdown.core.game.internal.RoundNotFoundException`; `RoundMovedOnException` entfernen, falls unbenutzt.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd core && ./mvnw test -Dtest=RoundAssetGateTest`
Expected: FAIL — `RoundMovedOnException` statt `RoundNotFoundException`, und der Closed-Fall wirft `RoundMovedOnException`.

- [ ] **Step 3: Rewrite `PlayService.asset`**

`history: HistoryService` in den Konstruktor, und:

```kotlin
    /**
     * One stored asset of a round.
     *
     * Two gates behind one URL, chosen by the number: the running round keeps the stage gate
     * (unlocked stages, the solution key with the spent guess), a closed round is open — nothing
     * gates a round nobody can play any more, and its reveal shows the solution anyway.
     *
     * Resolved with the caller's own super-admin flag, unlike [playable]: fetching bytes is a read,
     * and the read bypass exists so an admin may look without joining. Consequence: an admin
     * without a membership row now gets a 409 on the RUNNING round's asset (no play row) rather
     * than a 404 (no membership) — the more honest of the two.
     *
     * Not `readOnly`: like [AnnouncementService.currentRound], the first fetch of an un-materialised
     * round inserts.
     */
    @Transactional
    fun asset(slug: String, userId: UUID, isSuperAdmin: Boolean, roundNumber: Int, key: Int): RoundAsset {
        val current = announcements.resolve(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        val currentNumber = current.round?.number ?: throw RoundNotFoundException()
        // A larger number is earlier: anything above the running round is history.
        if (roundNumber > currentNumber) {
            val closed = history.resolve(current = current, roundNumber = roundNumber)
            if (closed !is ResolvedRound.Announced) throw AssetNotFoundException()
            return closed.handle.asset(
                params = closed.roundGame.params,
                roundGameId = requireNotNull(closed.roundGame.id),
                key = key,
            ) ?: throw AssetNotFoundException()
        }
        if (roundNumber < currentNumber) throw RoundNotFoundException()
        // A `when` over both cases, the same idiom `playable()` uses: Kotlin does NOT narrow to a
        // sibling subtype after an `is NoGame` check, so neither a bare `current.roundGame` nor an
        // explicit cast is the right shape here.
        val announced = when (current) {
            is ResolvedRound.NoGame -> throw NoGameToPlayException(current.reason)
            is ResolvedRound.Announced -> current
        }
        val roundGameId = requireNotNull(announced.roundGame.id)
        val play = plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId)
            ?: throw NotRevealedException()
        val allowed = if (key == SOLUTION_ASSET_KEY) play.guessedAt != null else key in 0..play.stage
        if (!allowed) throw AssetForbiddenException()
        return announced.handle.asset(params = announced.roundGame.params, roundGameId = roundGameId, key = key)
            ?: throw AssetNotFoundException()
    }
```

- [ ] **Step 4: Move the controller mapping**

`asset` in `RoundController.kt`: `@GetMapping("/current/assets/{roundNumber}/{key}")` → `@GetMapping("/{roundNumber}/assets/{key}")`. Der Body bleibt Zeile für Zeile identisch; nur der Doc-Kommentar wird:

```kotlin
    /**
     * The round's binary assets. The round number rides in the URL so each pair is its own privately
     * cacheable resource — without it, yesterday's cache would replay the wrong round. Which gate
     * applies follows from the number: see [PlayService.asset].
     */
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd core && ./mvnw test -Dtest='RoundAssetGateTest,PlayService*Test,RoundControllerTest'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/src
git commit -m "feat(game): one asset URL per round, open once the round is closed"
```

---

### Task 6: Kein Aufräumen beim Ankündigen

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/AnnouncementService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameStore.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameRepository.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/AnnouncementMaterialisedHookTest.kt`

**Interfaces:**
- Consumes: nichts.
- Produces: `GameType.releaseAssets` / `GameCatalog.releaseAssets` / `SongSnippetAudioStore.release` bleiben ohne Aufrufer — die Naht für den Archivierungs-Hook.

- [ ] **Step 1: Invert the test**

In `AnnouncementMaterialisedHookTest.kt` den Fall `materialising a round releases every earlier round's assets across the whole catalogue` **ersetzen** durch:

```kotlin
    @Test
    fun `materialising a round leaves every earlier round's assets alone`() {
        val (community, viewer) = aCommunity("Cleanup Round")
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = currentRoundNumberOf(community)
        store.announce(
            edition = edition, roundNumber = roundNumber + 1, gameType = "guess-hue",
            params = mapper.readTree("""{"n":1}"""), award = anAward(), announcedAt = clock.instant(),
        )

        announcements.resolve(slug = community.slug, userId = viewer, isSuperAdmin = false)

        // The history renders a past round's reveal and plays its audio, so announcing the next
        // round must not delete it. Releasing belongs to archiving the run, and nothing archives
        // here.
        recorder.releasedRounds.shouldBeEmpty()
    }
```

Den Klassen-Kommentar anpassen: der Satz über Test (b) („`releaseEarlierRounds` calls every handle in the catalogue…“) wird zu „test (b) asserts that nothing is released at all, so the catalogue-wide call is irrelevant to it“. Import `io.kotest.matchers.collections.shouldBeEmpty` ergänzen; `shouldContain` behalten (Test (a) und (c) nutzen es).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=AnnouncementMaterialisedHookTest`
Expected: FAIL — `releasedRounds` enthält die geplante frühere Runde.

- [ ] **Step 3: Delete the cleanup**

In `AnnouncementService.kt`:
- die Zeile `releaseEarlierRounds(edition = edition, current = round.number)` aus `materialise` entfernen,
- die private Funktion `releaseEarlierRounds` samt ihrem Doc-Kommentar entfernen.

In `RoundGameStore.kt` `roundIdsExcept` entfernen, in `RoundGameRepository.kt` `idsOfOtherRounds` entfernen. Ungenutzte Imports (`java.util.UUID` in `RoundGameStore`, falls sonst nirgends verwendet) mitentfernen.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd core && ./mvnw test -Dtest='AnnouncementMaterialisedHookTest,RoundGameRepositoryTest,Announcement*Test'`
Expected: PASS.

- [ ] **Step 5: Run the whole backend suite once**

Run: `cd core && ./mvnw test`
Expected: PASS. Erst mit diesem Lauf ist das Backend fertig.

- [ ] **Step 6: Commit**

```bash
git add core/src
git commit -m "feat(game): stop releasing a past round's assets when the next one is announced"
```

---

### Task 7: Frontend-API und der neue Asset-Pfad

**Files:**
- Modify: `webapp-vue/src/api/rounds.ts`
- Modify: `webapp-vue/src/api/types.ts`
- Modify: `webapp-vue/src/pages/c/[slug]/index.vue` (nur der Doc-Kommentar über `assetUrl`)
- Test: `webapp-vue/src/api/__tests__/rounds.spec.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `getRound(slug: string, roundNumber: number): Promise<RoundResponse>`
  - `roundAssetUrl(slug: string, roundNumber: number, key: number): string` → `/api/communities/{slug}/rounds/{roundNumber}/assets/{key}`
  - `RoundResponse.previousRoundNumber: number | null`

- [ ] **Step 1: Write the failing tests**

In `webapp-vue/src/api/__tests__/rounds.spec.ts` den Import auf `import { getCurrentRound, getRound, revealRound, roundAssetUrl, submitGuess } from '@/api/rounds'` erweitern und ergänzen:

```ts
  it('reads one past round by its number', async () => {
    await getRound('team', 13)
    expect(client.apiFetch).toHaveBeenCalledWith('/api/communities/team/rounds/13')
  })

  it('builds an asset url per round and key', () => {
    // The round number is part of the path, not a query: each pair is its own cacheable resource.
    expect(roundAssetUrl('team', 13, 99)).toBe('/api/communities/team/rounds/13/assets/99')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp-vue && pnpm test src/api/__tests__/rounds.spec.ts`
Expected: FAIL — `getRound is not a function`, und die alte Asset-URL.

- [ ] **Step 3: Implement**

In `src/api/rounds.ts`:

```ts
/** One past round, by its number. The server refuses anything that is not strictly older with 404. */
export const getRound = (slug: string, roundNumber: number) =>
  apiFetch<RoundResponse>(
    `/api/communities/${encodeURIComponent(slug)}/rounds/${roundNumber}`,
  )

/** Round number and key ride in the URL so each pair is its own privately cacheable resource. */
export const roundAssetUrl = (slug: string, roundNumber: number, key: number): string =>
  `/api/communities/${encodeURIComponent(slug)}/rounds/${roundNumber}/assets/${key}`
```

Die alte `roundAssetUrl` (die über `roundUrl(slug, …)` lief) ersetzen.

In `src/api/types.ts`, in `interface RoundResponse` nach `noGameReason`:

```ts
  /**
   * The next older announced round of this run, or `null` for „ganz am Anfang“. On every round
   * answer, the action responses included — the client replaces its whole round object with each of
   * them.
   */
  previousRoundNumber: number | null
```

In `src/pages/c/[slug]/index.vue` den Kommentar über `assetUrl` auf den neuen Pfad ziehen:

```ts
/** The asset lives at `{slug}/rounds/{roundNumber}/assets/{key}` — this round's own. */
```

- [ ] **Step 4: Run the tests, the typecheck and the lint**

Run: `cd webapp-vue && pnpm test src/api/__tests__/rounds.spec.ts && pnpm typecheck && pnpm lint`
Expected: Tests PASS. `pnpm typecheck` schlägt jetzt in **jeder Test-Fixture** fehl, die ein `RoundResponse` baut (`previousRoundNumber` fehlt). Die betroffenen Fixtures um `previousRoundNumber: null` ergänzen. Es sind **genau zwei** Dateien:
`src/rounds/__tests__/useRound.spec.ts` und `src/rounds/__tests__/RoundCard.spec.ts`.
`src/pages/c/[slug]/__tests__/index.spec.ts` nennt `RoundResponse` nur als Typannotation und baut
nie ein Literal — dort entsteht die erste Fabrik erst in Task 12. Die Treffer unter `src/gamelab/`
gehören zu `LabRoundResponse`, einem eigenen Typ, der kein Feld bekommt.

- [ ] **Step 5: Run the whole frontend suite**

Run: `cd webapp-vue && pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src
git commit -m "feat(webapp): read a past round, and address assets by round"
```

---

### Task 8: `LabelledDivider`

**Files:**
- Create: `webapp-vue/src/ui/LabelledDivider.vue`
- Test: `webapp-vue/src/ui/__tests__/LabelledDivider.spec.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `LabelledDivider` mit Default-Slot; `data-test="labelled-divider"`, `data-test="labelled-divider-label"`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LabelledDivider from '@/ui/LabelledDivider.vue'

describe('LabelledDivider', () => {
  it('puts its slot between two rules', () => {
    const w = mount(LabelledDivider, { slots: { default: 'Abgeschlossene Runden' } })

    expect(w.get('[data-test="labelled-divider-label"]').text()).toBe('Abgeschlossene Runden')
    // Two decorative rules — the label is the only thing in the reading order.
    const rules = w.findAll('[aria-hidden="true"]')
    expect(rules).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd webapp-vue && pnpm test src/ui/__tests__/LabelledDivider.spec.ts`
Expected: FAIL — die Datei existiert nicht.

- [ ] **Step 3: Create the component**

```vue
<script setup lang="ts">
// A horizontal rule with a label in its middle: the seam between the running round and the run's
// past, and the closing line at its beginning.
//
// Presentational only. The rules are `aria-hidden`, the label is ordinary text in the reading
// order — a section heading would be wrong for „Du bist ganz am Anfang angekommen“, which is a
// sentence, not a heading.
</script>

<template>
  <div data-test="labelled-divider" class="flex items-center">
    <span class="grow border-t border-neutral-300" aria-hidden="true" />
    <span data-test="labelled-divider-label" class="mx-4 shrink-0 text-sm text-neutral-500">
      <slot />
    </span>
    <span class="grow border-t border-neutral-300" aria-hidden="true" />
  </div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd webapp-vue && pnpm test src/ui/__tests__/LabelledDivider.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/ui/LabelledDivider.vue webapp-vue/src/ui/__tests__/LabelledDivider.spec.ts
git commit -m "feat(webapp): a divider with a label in its middle"
```

---

### Task 9: `RoundCard` bekommt `closed`

**Files:**
- Modify: `webapp-vue/src/rounds/RoundCard.vue`
- Test: `webapp-vue/src/rounds/__tests__/RoundCard.spec.ts`

**Interfaces:**
- Consumes: `RoundResponse`.
- Produces: `RoundCard` mit `closed?: boolean` (Default `false`); `stage`, `busy`, `notice`, `reveal`, `submit`, `skip`, `giveUp` sind optional; `assetUrl` und `round` bleiben Pflicht.

- [ ] **Step 1: Write the failing tests**

In `src/rounds/__tests__/RoundCard.spec.ts` ans Ende der `describe`:

```ts
  it('shows a closed round as its reveal, without a clock and without an action', () => {
    const me = aPlay({ guessedAt: '2026-08-14T12:00:00Z', guess: { hue: 7 }, points: 1 })
    const round = aRound({ me, others: [anOther({ guess: { hue: 3 } })], solution: { targetHue: 5 } })

    const w = mount(RoundCard, {
      props: { round, closed: true, assetUrl: (key: number) => `/assets/${key}` },
    })

    const stub = w.findComponent(StubGame)
    expect(stub.props('solution')).toEqual(round.solution)
    expect(stub.props('disabled')).toBe(true)
    // No clock: a closed round's countdown would read 00:00:00 forever.
    expect(w.findComponent(GameHeader).props('endsAt')).toBe(null)
    expect(w.find('[data-test="round-reveal"]').exists()).toBe(false)
  })

  it('shows a closed round the viewer never played', () => {
    const other = anOther({ guess: { hue: 3 }, points: 1 })
    const round = aRound({ me: null, others: [other], solution: { targetHue: 5 } })

    const stub = mount(RoundCard, {
      props: { round, closed: true, assetUrl: (key: number) => `/assets/${key}` },
    }).findComponent(StubGame)

    expect(stub.exists()).toBe(true)
    expect(stub.props('entries')).toEqual([other])
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp-vue && pnpm test src/rounds/__tests__/RoundCard.spec.ts`
Expected: FAIL — Pflicht-Props fehlen bzw. `closed` wird ignoriert und die Karte rendert nichts.

- [ ] **Step 3: Rewrite the props and the derived values**

In `src/rounds/RoundCard.vue` den `defineProps`-Block ersetzen:

```ts
const props = withDefaults(
  defineProps<{
    round: RoundResponse | null
    assetUrl: (key: number) => string
    /**
     * The round is over: the reveal face, no clock, no action. One prop with three effects at one
     * place — a second card would be a second place for „the same reveal UI“ to drift.
     */
    closed?: boolean
    /** Which face a running round calls for. A closed round has none. */
    stage?: RoundStage
    busy?: boolean
    notice?: string | null
    reveal?: () => Promise<void>
    submit?: (guess: unknown) => Promise<void>
    skip?: (fromStage: number) => Promise<void>
    giveUp?: () => Promise<void>
  }>(),
  { closed: false, busy: false, notice: null },
)
```

und darunter:

```ts
/** A closed round is done by definition — there is no stage left to derive it from. */
const face = computed<RoundStage>(() => (props.closed ? 'done' : (props.stage ?? 'no-game')))
/** The band's clock, silenced for a closed round: its countdown would read 00:00:00 forever. */
const endsAt = computed<string | null>(() =>
  props.closed ? null : (props.round?.round?.end ?? null),
)
const disabled = computed(() => props.closed || props.busy || face.value === 'done')
```

Die Callback-Wrapper:

```ts
async function onReveal(): Promise<void> {
  await props.reveal?.()
}

/**
 * `submit` never rejects — a failed or raced attempt lands in `notice` instead (see `useRound`'s
 * `run`) — so whether the guess actually went through is read off `notice` staying `null` after
 * the await, not off a resolved promise.
 */
async function onGuess(value: unknown): Promise<void> {
  if (props.submit === undefined) return
  await props.submit(value)
  if (props.notice === null) emit('guessed')
}

function onSkip(fromStage: number): void {
  void props.skip?.(fromStage)
}

function onGiveUp(): void {
  void props.giveUp?.()
}
```

Im Template: `:ends-at="endsAt"`, `v-else-if="face === 'sealed'"`, `v-else-if="face === 'playing' || face === 'done'"`, `:disabled="disabled"`, `@skip="onSkip"`, `@give-up="onGiveUp"`. Der bestehende `GameHeader`-Kommentar bekommt zwei Zeilen angehängt:

```
           A closed round loses the clock, not the band: which round and which game stays exactly
           where the running round puts it.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp-vue && pnpm test src/rounds/__tests__/RoundCard.spec.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/rounds/RoundCard.vue webapp-vue/src/rounds/__tests__/RoundCard.spec.ts
git commit -m "feat(webapp): a round card can render a closed round"
```

---

### Task 10: `useRoundHistory`

**Files:**
- Create: `webapp-vue/src/rounds/useRoundHistory.ts`
- Test: `webapp-vue/src/rounds/__tests__/useRoundHistory.spec.ts`

**Interfaces:**
- Consumes: `getRound(slug, roundNumber)`, `useAction`, `RoundResponse.previousRoundNumber`.
- Produces: `useRoundHistory(slug: string, from: Ref<number | null>)` → `{ items: Ref<RoundResponse[]>, busy: Readonly<Ref<boolean>>, error: Readonly<Ref<string | null>>, canLoadMore: ComputedRef<boolean>, loadMore: () => Promise<void> }`

- [ ] **Step 1: Write the failing tests**

Neue Datei `webapp-vue/src/rounds/__tests__/useRoundHistory.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/rounds'
import type { RoundResponse } from '@/api/types'
import { useRoundHistory } from '../useRoundHistory'

const closed = (number: number, previous: number | null): RoundResponse => ({
  round: {
    number,
    label: `T-${number}`,
    start: '2026-08-10T10:00:00Z',
    end: '2026-08-11T10:00:00Z',
  },
  game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: false },
  noGameReason: null,
  previousRoundNumber: previous,
  payload: { description: 'x' },
  solution: { targetHue: 5, toleranceDeg: 10 },
  me: null,
  others: [],
  awardRule: 'ALL_QUALIFYING',
  awardPoints: 1,
})

/** The composable watches `from` immediately, so it needs a host component to run its effects. */
function host(from: Ref<number | null>) {
  let api: ReturnType<typeof useRoundHistory>
  const Cmp = defineComponent({
    setup() {
      api = useRoundHistory('team', from)
      return () => h('div')
    },
  })
  return { Cmp, history: () => api }
}

describe('useRoundHistory', () => {
  afterEach(() => vi.restoreAllMocks())

  it('loads the previous round by itself', async () => {
    const spy = vi.spyOn(api, 'getRound').mockResolvedValue(closed(13, 14))
    const { Cmp, history } = host(ref(13))

    mount(Cmp)
    await flushPromises()

    expect(spy).toHaveBeenCalledExactlyOnceWith('team', 13)
    expect(history().items.value).toHaveLength(1)
    expect(history().canLoadMore.value).toBe(true)
  })

  it('walks further back on demand and stops when the pointer runs out', async () => {
    vi.spyOn(api, 'getRound').mockImplementation(async (_slug, number) =>
      number === 13 ? closed(13, 14) : closed(14, null),
    )
    const { Cmp, history } = host(ref(13))

    mount(Cmp)
    await flushPromises()
    await history().loadMore()

    expect(history().items.value.map((i) => i.round?.number)).toEqual([13, 14])
    expect(history().canLoadMore.value).toBe(false)
  })

  it('renders nothing to load while there is no history', async () => {
    const spy = vi.spyOn(api, 'getRound').mockResolvedValue(closed(13, null))
    const { Cmp, history } = host(ref(null))

    mount(Cmp)
    await flushPromises()

    expect(spy).not.toHaveBeenCalled()
    expect(history().canLoadMore.value).toBe(false)
  })

  it('drops a second load while one is in flight', async () => {
    let release: (r: RoundResponse) => void = () => {}
    vi.spyOn(api, 'getRound').mockReturnValue(
      new Promise<RoundResponse>((resolve) => {
        release = resolve
      }),
    )
    const { Cmp, history } = host(ref(13))

    mount(Cmp)
    // The eager first load is still open; a click now must be dropped, not queued — queueing would
    // append the same round twice a moment later.
    const second = history().loadMore()
    release(closed(13, 14))
    await second
    await flushPromises()

    expect(api.getRound).toHaveBeenCalledTimes(1)
    expect(history().items.value).toHaveLength(1)
  })

  it('keeps what it has when a load fails, and says so', async () => {
    vi.spyOn(api, 'getRound')
      .mockResolvedValueOnce(closed(13, 14))
      .mockRejectedValueOnce(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { Cmp, history } = host(ref(13))

    mount(Cmp)
    await flushPromises()
    await history().loadMore()

    expect(history().items.value).toHaveLength(1)
    expect(history().error.value).toBe('Die Runde konnte nicht geladen werden.')
    // The pointer is unchanged, so the button stays and the click can be retried.
    expect(history().canLoadMore.value).toBe(true)
  })

  it('starts over when the current round moves under an open tab', async () => {
    vi.spyOn(api, 'getRound').mockImplementation(async (_slug, number) => closed(number, number + 1))
    const from = ref<number | null>(13)
    const { Cmp, history } = host(from)

    mount(Cmp)
    await flushPromises()
    await history().loadMore()
    expect(history().items.value).toHaveLength(2)

    // The day boundary passed: `useRound` refetched a different round after a 409, so the history
    // hangs off the wrong place and is rebuilt from the new one.
    from.value = 12
    await flushPromises()

    expect(history().items.value.map((i) => i.round?.number)).toEqual([12])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp-vue && pnpm test src/rounds/__tests__/useRoundHistory.spec.ts`
Expected: FAIL — `Failed to resolve import '../useRoundHistory'`.

- [ ] **Step 3: Implement the composable**

```ts
import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { getRound } from '@/api/rounds'
import type { RoundResponse } from '@/api/types'
import { useAction } from '@/ui/useAction'

/**
 * The rounds below the running one — the run's past, one round per click.
 *
 * [from] is `previousRoundNumber` of the running round's answer, the entry into the past. The number
 * to load next is **derived, never stored**: an empty list means [from], otherwise it is the last
 * item's own pointer. A `null` there is „ganz am Anfang“, and that is exactly what hides the button
 * — no second request and no flag to keep in sync.
 */
export function useRoundHistory(
  slug: string,
  from: Ref<number | null>,
): {
  items: Ref<RoundResponse[]>
  busy: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
  canLoadMore: ComputedRef<boolean>
  loadMore: () => Promise<void>
} {
  const items = ref<RoundResponse[]>([])
  const { busy, error, run } = useAction(() => 'Die Runde konnte nicht geladen werden.')

  const next = computed<number | null>(() => {
    const last = items.value[items.value.length - 1]
    return last === undefined ? from.value : last.previousRoundNumber
  })
  const canLoadMore = computed(() => next.value !== null)

  async function loadMore(): Promise<void> {
    const roundNumber = next.value
    if (roundNumber === null) return
    // `run` drops a second call while one is in flight, which is exactly the double-click guard the
    // button needs, and it clears `busy` in a `finally` so a failure does not lock it forever.
    await run(async () => {
      items.value = [...items.value, await getRound(slug, roundNumber)]
    })
  }

  /**
   * The first round loads by itself: somebody coming back the next day should see yesterday's
   * result without asking for it. The same function, not a second path.
   *
   * Re-runs when [from] changes, which is the day boundary passing under an open tab — `useRound`
   * refetched a different round after a 409, and a history hanging off the previous one would start
   * in the wrong place.
   */
  watch(
    from,
    () => {
      items.value = []
      void loadMore()
    },
    { immediate: true },
  )

  return { items, busy, error, canLoadMore, loadMore }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp-vue && pnpm test src/rounds/__tests__/useRoundHistory.spec.ts && pnpm typecheck`
Expected: PASS, alle sechs Fälle.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/rounds/useRoundHistory.ts webapp-vue/src/rounds/__tests__/useRoundHistory.spec.ts
git commit -m "feat(webapp): walk a run's past one round at a time"
```

---

### Task 11: `RoundHistory.vue`

**Files:**
- Create: `webapp-vue/src/rounds/RoundHistory.vue`
- Test: `webapp-vue/src/rounds/__tests__/RoundHistory.spec.ts`

**Interfaces:**
- Consumes: `useRoundHistory`, `RoundCard` (`closed`), `LabelledDivider`, `ActionButton`, `roundAssetUrl`.
- Produces: `RoundHistory` mit Props `slug: string`, `from: number | null`; `data-test="history-more"`, `data-test="history-error"`.

- [ ] **Step 1: Write the failing tests**

Neue Datei `webapp-vue/src/rounds/__tests__/RoundHistory.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import type { RoundResponse } from '@/api/types'
import LabelledDivider from '@/ui/LabelledDivider.vue'
import RoundCard from '@/rounds/RoundCard.vue'
import RoundHistory from '@/rounds/RoundHistory.vue'
import { _resetSharedClock } from '@/ui/sharedClock'
import { useRoundHistory } from '@/rounds/useRoundHistory'

/**
 * The composable is mocked: its own derivation of the pointer is covered by
 * `useRoundHistory.spec.ts`, so this file only checks what the section renders for a given state.
 */
vi.mock('@/rounds/useRoundHistory', () => ({ useRoundHistory: vi.fn() }))

const closed = (number: number): RoundResponse => ({
  round: {
    number,
    label: `T-${number}`,
    start: '2026-08-10T10:00:00Z',
    end: '2026-08-11T10:00:00Z',
  },
  game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: false },
  noGameReason: null,
  previousRoundNumber: null,
  payload: { description: 'x' },
  solution: { targetHue: 5, toleranceDeg: 10 },
  me: null,
  others: [],
  awardRule: 'ALL_QUALIFYING',
  awardPoints: 1,
})

function mockHistory(
  over: { items?: RoundResponse[]; canLoadMore?: boolean; error?: string | null } = {},
): ReturnType<typeof useRoundHistory> {
  return {
    items: ref(over.items ?? []),
    busy: ref(false),
    error: ref(over.error ?? null),
    canLoadMore: computed(() => over.canLoadMore ?? false),
    loadMore: vi.fn().mockResolvedValue(undefined),
  }
}

// RoundCard mounts the header band, which subscribes to the shared clock while it lives.
enableAutoUnmount(afterEach)
afterEach(_resetSharedClock)
afterEach(() => vi.clearAllMocks())

describe('RoundHistory', () => {
  it('renders nothing at all while the run has no past', () => {
    vi.mocked(useRoundHistory).mockReturnValue(mockHistory())

    const w = mount(RoundHistory, { props: { slug: 'team', from: null } })

    expect(w.findComponent(LabelledDivider).exists()).toBe(false)
    expect(w.find('[data-test="history-more"]').exists()).toBe(false)
  })

  it('labels the seam and renders every loaded round as a closed card', () => {
    vi.mocked(useRoundHistory).mockReturnValue(
      mockHistory({ items: [closed(13), closed(14)], canLoadMore: true }),
    )

    const w = mount(RoundHistory, { props: { slug: 'team', from: 13 } })

    expect(w.findAllComponents(LabelledDivider)[0]?.text()).toBe('Abgeschlossene Runden')
    const cards = w.findAllComponents(RoundCard)
    expect(cards).toHaveLength(2)
    expect(cards[0]?.props('closed')).toBe(true)
    // `props()` is typed `unknown`, so the builder has to be narrowed before it can be called.
    const assetUrl = cards[0]?.props('assetUrl') as (key: number) => string
    expect(assetUrl(99)).toBe('/api/communities/team/rounds/13/assets/99')
  })

  it('asks for more until the beginning, then says so instead', async () => {
    const history = mockHistory({ items: [closed(13)], canLoadMore: true })
    vi.mocked(useRoundHistory).mockReturnValue(history)

    const more = mount(RoundHistory, { props: { slug: 'team', from: 13 } })
    await more.get('[data-test="history-more"]').trigger('click')
    expect(history.loadMore).toHaveBeenCalledOnce()

    vi.mocked(useRoundHistory).mockReturnValue(
      mockHistory({ items: [closed(13)], canLoadMore: false }),
    )
    const done = mount(RoundHistory, { props: { slug: 'team', from: 13 } })

    expect(done.find('[data-test="history-more"]').exists()).toBe(false)
    expect(done.findAllComponents(LabelledDivider).at(-1)?.text()).toBe(
      'Du bist ganz am Anfang angekommen',
    )
  })

  it('reports a failed load without dropping what it already has', () => {
    vi.mocked(useRoundHistory).mockReturnValue(
      mockHistory({
        items: [closed(13)],
        canLoadMore: true,
        error: 'Die Runde konnte nicht geladen werden.',
      }),
    )

    const w = mount(RoundHistory, { props: { slug: 'team', from: 13 } })

    expect(w.get('[data-test="history-error"]').text()).toBe(
      'Die Runde konnte nicht geladen werden.',
    )
    expect(w.findAllComponents(RoundCard)).toHaveLength(1)
    expect(w.find('[data-test="history-more"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp-vue && pnpm test src/rounds/__tests__/RoundHistory.spec.ts`
Expected: FAIL — `Failed to resolve import '@/rounds/RoundHistory.vue'`.

- [ ] **Step 3: Create the component**

```vue
<script setup lang="ts">
/**
 * „Abgeschlossene Runden“ — the run's past under the running round, newest first.
 *
 * Renders nothing at all while there is no past: no seam, no hint. The closing line appears only
 * once somebody has actually walked to the beginning, which is why it replaces the button rather
 * than standing next to it.
 */
import { toRef } from 'vue'
import { roundAssetUrl } from '@/api/rounds'
import ActionButton from '@/ui/ActionButton.vue'
import LabelledDivider from '@/ui/LabelledDivider.vue'
import RoundCard from '@/rounds/RoundCard.vue'
import { useRoundHistory } from '@/rounds/useRoundHistory'

const props = defineProps<{
  slug: string
  /** `previousRoundNumber` of the running round: the entry into the past, `null` for none. */
  from: number | null
}>()

const { items, busy, error, canLoadMore, loadMore } = useRoundHistory(
  props.slug,
  toRef(props, 'from'),
)

/**
 * One closure per round rather than one per card render would be cheaper, and is not needed:
 * `SongPlayerReveal` calls this only inside a click handler, so no watcher hangs off its identity.
 */
const assetUrlFor = (roundNumber: number) => (key: number) =>
  roundAssetUrl(props.slug, roundNumber, key)
</script>

<template>
  <template v-if="from !== null">
    <LabelledDivider class="mt-8">Abgeschlossene Runden</LabelledDivider>

    <!-- Keyed on the round number, the same measure `RoundCard` keys its game renderer on. -->
    <RoundCard
      v-for="item in items"
      :key="item.round?.number ?? 0"
      class="mt-6"
      :round="item"
      closed
      :asset-url="assetUrlFor(item.round?.number ?? 0)"
    />

    <p v-if="error" data-test="history-error" class="mt-6 text-sm text-neutral-500">{{ error }}</p>

    <div v-if="canLoadMore" class="mt-6 flex justify-center">
      <ActionButton data-test="history-more" :busy="busy" @click="loadMore">
        Weiter zurück
      </ActionButton>
    </div>
    <LabelledDivider v-else class="mt-8">Du bist ganz am Anfang angekommen</LabelledDivider>
  </template>
</template>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp-vue && pnpm test src/rounds/__tests__/RoundHistory.spec.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/rounds/RoundHistory.vue webapp-vue/src/rounds/__tests__/RoundHistory.spec.ts
git commit -m "feat(webapp): the closed-rounds section under the running round"
```

---

### Task 12: Die Seite hängt die History ein

**Files:**
- Modify: `webapp-vue/src/pages/c/[slug]/index.vue`
- Test: `webapp-vue/src/pages/c/[slug]/__tests__/index.spec.ts`

**Interfaces:**
- Consumes: `RoundHistory` (Props `slug`, `from`), `RoundResponse.previousRoundNumber`.
- Produces: nichts für spätere Tasks.

- [ ] **Step 1: Write the failing tests**

In `src/pages/c/[slug]/__tests__/index.spec.ts` oben ergänzen:

```ts
/**
 * Stubbed at the page level: what the section renders is covered by `RoundHistory.spec.ts`, and the
 * real component would fetch. This file only checks the page's wiring — which entry point the
 * history is given.
 */
vi.mock('@/rounds/RoundHistory.vue', () => ({
  default: defineComponent({
    name: 'RoundHistory',
    props: { slug: { type: String, required: true }, from: { type: Number, default: null } },
    template: '<div data-test="round-history" />',
  }),
}))
```

`defineComponent` zum `vue`-Import hinzufügen und `import RoundHistory from '@/rounds/RoundHistory.vue'` ergänzen. Die Datei hat noch keine `RoundResponse`-Fabrik — eine anlegen, neben `mockUseRound`:

```ts
const aRoundResponse = (over: Partial<RoundResponse> = {}): RoundResponse => ({
  round: { number: 12, label: 'T-12', start: '2026-08-14T10:00:00Z', end: '2026-08-15T10:00:00Z' },
  game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: false },
  noGameReason: null,
  previousRoundNumber: null,
  payload: null,
  solution: null,
  me: null,
  others: [],
  awardRule: 'ALL_QUALIFYING',
  awardPoints: 1,
  ...over,
})
```

`mountPage()` in dieser Datei ist **synchron** — nicht `await`en. Dann drei Fälle:

```ts
  it("hands the history the running round's previous-round pointer", () => {
    // `game: null` — `useRound` is mocked, so `stage` is decoupled from the round data. Keeping the
    // real `guess-hue` id would mount the actual game component, and a 'done' round needs a real
    // payload for that: a detail this test has no reason to supply.
    vi.mocked(useRound).mockReturnValue(
      mockUseRound({
        stage: 'done',
        round: aRoundResponse({ previousRoundNumber: 13, game: null }),
      }),
    )

    const w = mountPage()

    expect(w.findComponent(RoundHistory).props('from')).toBe(13)
  })

  it('hangs the history under the fallback too', () => {
    vi.mocked(useRound).mockReturnValue(
      mockUseRound({ stage: 'no-game', round: aRoundResponse({ previousRoundNumber: 13 }) }),
    )

    const w = mountPage()

    // After the event, looking back is the only reason left to open the page.
    expect(w.findComponent(RoundFallback).exists()).toBe(true)
    expect(w.findComponent(RoundHistory).props('from')).toBe(13)
  })

  it('mounts no history while the round is still loading', () => {
    vi.mocked(useRound).mockReturnValue(mockUseRound({ loading: true }))

    const w = mountPage()

    expect(w.findComponent(RoundHistory).exists()).toBe(false)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp-vue && pnpm test 'src/pages/c/[slug]/__tests__/index.spec.ts'`
Expected: FAIL — `RoundHistory` ist nicht montiert.

- [ ] **Step 3: Mount the section**

In `src/pages/c/[slug]/index.vue` `import RoundHistory from '@/rounds/RoundHistory.vue'` ergänzen und im Template **nach** dem `RoundFallback`:

```vue
  <!-- Under the card AND under the fallback: after the event the fallback is what stands here, and
       looking back is then the only reason left to open the page. Held until the round has landed,
       so the entry point is the real one rather than a `null` that would immediately be replaced. -->
  <RoundHistory
    v-if="roundState === 'ready'"
    :slug="community.slug"
    :from="round?.previousRoundNumber ?? null"
  />
```

- [ ] **Step 4: Run the whole frontend suite**

Run: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'webapp-vue/src/pages/c/[slug]/index.vue' 'webapp-vue/src/pages/c/[slug]/__tests__/index.spec.ts'
git commit -m "feat(webapp): the community page carries the round history"
```

---

### Task 13: Die Guidelines nachziehen

**Files:**
- Modify: `.claude/guidelines/game-rounds.md`
- Modify: `.claude/guidelines/frontend-state.md`

**Interfaces:**
- Consumes: nichts.
- Produces: nichts.

- [ ] **Step 1: Correct the asset URL and the lifecycle claim in `game-rounds.md`**

Im letzten Absatz („Binary round assets follow the same stage-gating…“):
- `/api/communities/{slug}/rounds/current/assets/{roundNumber}/{key}` → `/api/communities/{slug}/rounds/{roundNumber}/assets/{key}`, und dazu den Satz, dass die Regel jetzt an der Nummer hängt: Stufen-Gate für die laufende Runde, offen für eine abgeschlossene.
- Den Schluss ab „Cleanup itself only fires on the *next* materialisation…“ **ersetzen**. Neuer Inhalt, in eigenen Worten formuliert: es gibt kein Aufräumen beim Ankündigen mehr, weil die History das Reveal einer vergangenen Runde spielt; `releaseAssets` bleibt als Naht ohne Aufrufer und wartet auf das Archivieren einer Edition; der Speicher ist damit keine Obergrenze („nie mehr als eine Leiter pro Community und Lauf“), sondern eine Wachstumsrate; und der Kommentar in `V1__create_round_audio.sql` ist dadurch veraltet, wird aber nicht angefasst, weil das die Flyway-Checksumme brechen würde.

- [ ] **Step 2: Add the history rule to `game-rounds.md`**

Ein neuer Abschnitt, ungefähr nach „A larger round number is earlier“ — als Regel formuliert, nicht als Änderungsbericht:

- Eine abgeschlossene Runde ist offen: Payload, Lösung und alle beendeten Tipps gehen an jedes Mitglied, weil eine unspielbare Runde nichts zu schützen hat. Was auch dort geschlossen bleibt: aufgedeckt-aber-nie-geraten, weil das über Personen spricht und nicht über die Runde.
- Die eine Zeile, die dieses Öffnen sicher macht: nur **strikt älter** als die laufende Runde. Der Endpunkt wäre sonst ein zweiter Weg an die aktuelle Lösung, an `present()`/`solution()` und ihren Feldmengen-Tests vorbei.
- Der Weg in die Vergangenheit ist ein Zeiger auf jeder Antwort (`previousRoundNumber`), keine Seite: `MIN(round_number)` oberhalb von `n` im Fenster; `NULL` ist „ganz am Anfang“. Nie angekündigte Tage haben keine Zeile und fallen dadurch aus der Kette, ohne dass jemand sie zählt.
- Warum der Zeiger auf `ResolvedRound` liegt und nicht als Parameter durch die Antwort-Aufrufe wandert: der Client ersetzt sein ganzes Rundenobjekt mit jeder Aktionsantwort, also darf keine Aufrufstelle ihn vergessen können.

- [ ] **Step 2b: Verweise auf `CurrentRound` prüfen**

Run: `rg -n 'CurrentRound' .claude docs core webapp-vue`
Jede Fundstelle in Guidelines und Specs auf `ResolvedRound` ziehen — **außer** in `docs/superpowers/specs/`- und `docs/superpowers/plans/`-Dateien mit einem früheren Datum: die beschreiben den Stand ihres Tages und werden nicht rückdatiert.

- [ ] **Step 3: One line in `frontend-state.md`**

Ein Satz zum Muster, das `useRoundHistory` etabliert: eine nachladende Liste leitet ihren „was kommt als nächstes“-Zeiger aus dem letzten Eintrag ab statt ihn zu speichern, `null` dort ist gleichzeitig das Ende und die Bedingung, die den Button ausblendet — und der Ladevorgang läuft über `useAction`, das den Doppelklick verschluckt und `busy` in einem `finally` räumt.

- [ ] **Step 4: Verify the whole thing once**

Run: `cd core && ./mvnw test`
Run: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: beide PASS.

- [ ] **Step 5: Commit**

```bash
git add .claude/guidelines
git commit -m "docs(guidelines): a closed round is open, and its assets outlive the next one"
```

---

## Verifikation am Ende

Manuell im Browser (`pnpm dev` in `webapp-vue/`, Backend über `./mvnw spring-boot:run` in `core/`):

1. Eine Community mit mindestens zwei angekündigten Runden aufrufen: unter der laufenden Karte steht der Trenner „Abgeschlossene Runden“ und darunter die Vorrunde als Reveal — ohne Uhr im Kopfband.
2. „Weiter zurück“ zeigt während des Ladens den Spinner des `ActionButton`; ein zweiter Klick währenddessen fügt keine zweite Karte an.
3. Am Anfang des Laufs verschwindet der Button und „Du bist ganz am Anfang angekommen“ steht an seiner Stelle.
4. Bei einer Song-Snippet-Runde in der History spielt „Auflösung abspielen“ das Audio — der Beweis, dass das Aufräumen wirklich aus ist.
5. In den Dev-Tools: `GET /api/communities/{slug}/rounds/{aktuelleNummer}` liefert 404.
