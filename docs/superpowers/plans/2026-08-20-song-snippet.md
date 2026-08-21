# Song Snippet („Anspielung") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Heardle-artiges Stufen-Ratespiel: Der Server schneidet die Snippet-Leiter (0,1/0,5/2/8/15s) beim Materialisieren der Runde aus einem Deezer-Preview und liefert nie mehr Bytes, als die Stufe des Spielers erlaubt.

**Architecture:** Das `game`-Framework wächst um Stufen (`round_plays.stage`), Skip/Aufgeben, einen generischen Asset-Endpoint und fünf optionale `GameType`-Hooks. Ein neues schemaloses-außer-einer-Tabelle Modul `songsnippet` kapselt Deezer hinter `SongCatalog`/`PreviewSource`, schneidet MP3→WAV pure-JVM (JLayer) und persistiert die Leiter in `songsnippet.round_audio` (bewusst ohne FK). Der Adapter `SongSnippetGameType` liegt wie Guess Hues in `game.internal`. Punkte laufen unverändert über `awardFor`/`pointsFor`: `deviation` = erreichte Stufe.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 / Spring Data JDBC / Flyway / PostgreSQL 18 · JLayer (`javazoom:jlayer`) + `javax.sound.sampled` · JUnit 5 + kotest + mockk + Testcontainers · Vue 3 + TypeScript strict + VueUse + Tailwind v4 + Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-20-song-snippet-design.md`](../specs/2026-08-20-song-snippet-design.md)

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch** mit `„…“`-Anführungszeichen, nie `"`. Spec/Plan deutsch.
- **Named arguments ab zwei Argumenten** an jedem Kotlin-Aufrufpunkt (Ausnahmen: ein Argument, varargs, Java-deklarierte Funktionen, trailing lambdas, infix).
- **Testing:** kotest-Matcher, mockk, MockMvc Kotlin DSL, Testcontainers. Frontend: Vitest `vi`. TDD: erst der fallende Test.
- **Persistenz:** Spring Data JDBC, kein `@Column`, UUID v7 aus Postgres (`uuidv7()`), Migrationen modulweise unter `core/src/main/resources/db/migration/<modul>/`.
- **Modulgrenzen:** `ModularityTests.verify()` muss grün bleiben. Java-Pfeil einbahnig `game → songsnippet`; `songsnippet` importiert **nie** aus `game`.
- **Logging:** kotlin-logging, `private val logger = KotlinLogging.logger {}` in der Klasse, immer Lambda-Messages.
- **Keine redundanten Inline-Kommentare** — Kommentare nur für Constraints, die der Code nicht zeigen kann.
- **Kein Test ruft Deezer.** Vendor-Zugriffe laufen über `SongCatalog`/`PreviewSource` und werden gestubbt; HTTP-Tests gegen `MockRestServiceServer`; Test-Fixtures sind einmalig eingefangene echte Deezer-Responses.
- **Spielregeln (fix):** 5 Stufen `[0.1, 0.5, 2.0, 8.0, 15.0]` Sekunden, Fade-Skip 0,5s, Solution-Asset-Key `99`. Phase eins: falscher Guess unterhalb der letzten Stufe = Stufe +1, nicht gespeichert. Phase zwei (`CLOSEST_ONLY`): jeder Guess terminal.
- Backend-Befehle aus `core/`, Frontend-Befehle aus `webapp-vue/`.

---

### Task 1: `stage` auf `round_plays` + Skip-/Aufgeben-Statements

**Files:**
- Create: `core/src/main/resources/db/migration/game/V3__round_play_stage.sql`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlay.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlayRepository.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundPlayStageRepositoryTest.kt`

**Interfaces:**
- Produces: `RoundPlay.stage: Int` (Default 0), `RoundPlayRepository.advanceStage(roundGameId: UUID, userId: UUID, expectedStage: Int): Int`, `RoundPlayRepository.giveUp(roundGameId: UUID, userId: UUID, guessedAt: Instant): Int` — beide geben die Zahl betroffener Zeilen zurück, `0` ist das 409 des Aufrufers.

- [ ] **Step 1: Migration schreiben**

```sql
-- V3__round_play_stage.sql
-- How far the player has opened this round's staged content. Framework state: the flow advances
-- it under the same zero-rows-is-a-409 guards as the guess; what a stage MEANS (0.1s ... 15s of
-- audio) is the game's business. Constant 0 for single-stage games like Guess Hue.
ALTER TABLE game.round_plays
    ADD COLUMN stage INT NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Fallenden Repository-Test schreiben**

Harness-Muster: exakt wie `RoundPlayRepositoryTest` (gleiche Annotationen/Fixtures — Datei lesen und die Arrangement-Helfer für User/Community/Edition/Runde übernehmen). Neue Testmethoden:

```kotlin
@Test
fun `advanceStage moves the stage exactly when the expected stage still holds`() {
    // arrange: ein round_plays-Row via revealOrCount (stage landet auf DEFAULT 0)
    plays.advanceStage(roundGameId = roundGameId, userId = userId, expectedStage = 0) shouldBe 1
    plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId)!!.stage shouldBe 1
    // dieselbe erwartete Stufe nochmal: null Zeilen — das Idiom, kein Fehler
    plays.advanceStage(roundGameId = roundGameId, userId = userId, expectedStage = 0) shouldBe 0
}

@Test
fun `advanceStage refuses once the play is spent`() {
    plays.giveUp(roundGameId = roundGameId, userId = userId, guessedAt = clock.instant()) shouldBe 1
    plays.advanceStage(roundGameId = roundGameId, userId = userId, expectedStage = 0) shouldBe 0
}

@Test
fun `giveUp spends the round without an answer, exactly once`() {
    plays.giveUp(roundGameId = roundGameId, userId = userId, guessedAt = clock.instant()) shouldBe 1
    val row = plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId)!!
    row.guessedAt.shouldNotBeNull()
    row.guess.shouldBeNull()
    row.qualifies.shouldBeNull()
    plays.giveUp(roundGameId = roundGameId, userId = userId, guessedAt = clock.instant()) shouldBe 0
}
```

- [ ] **Step 3: Test laufen lassen — er fällt** (`./mvnw test -Dtest=RoundPlayStageRepositoryTest`; erwartet: Kompilierfehler `advanceStage`/`giveUp`/`stage` unbekannt)

- [ ] **Step 4: Entity + Statements implementieren**

`RoundPlay`: nach `revealCount` einfügen:

```kotlin
    /** Staged progression, 0-based. Advanced by skip or (phase one) a wrong non-terminal guess. */
    val stage: Int = 0,
```

`RoundPlayRepository`: zwei Methoden anfügen:

```kotlin
    /**
     * Advance the staged reveal by one, guarded like the guess: `stage = :expectedStage` makes a
     * raced second click affect zero rows, and zero rows is the caller's 409. `guessed_at IS NULL`
     * keeps a finished play frozen.
     */
    @Modifying
    @Query(
        """
        UPDATE game.round_plays SET stage = stage + 1
        WHERE round_game_id = :roundGameId AND user_id = :userId
          AND stage = :expectedStage AND guessed_at IS NULL
        """,
    )
    fun advanceStage(roundGameId: UUID, userId: UUID, expectedStage: Int): Int

    /**
     * Spend the round without an answer: `guessed_at` set, `guess` and the verdict columns stay
     * NULL — the re-evaluation reads that as "not qualifying" and writes 0 points.
     */
    @Modifying
    @Query(
        """
        UPDATE game.round_plays SET guessed_at = :guessedAt
        WHERE round_game_id = :roundGameId AND user_id = :userId AND guessed_at IS NULL
        """,
    )
    fun giveUp(roundGameId: UUID, userId: UUID, guessedAt: Instant): Int
```

- [ ] **Step 5: Test läuft grün** (`./mvnw test -Dtest=RoundPlayStageRepositoryTest`), danach die Nachbarschaft: `./mvnw test -Dtest='RoundPlay*,RoundScoringTest'`

- [ ] **Step 6: Commit** — `feat(game): staged reveal column and the two guarded transitions`

---

### Task 2: `GameType`-Vertragswachstum + pure Flow-Entscheidung

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/PlayFlow.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameType.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameCatalog.kt` (GameTypeHandle)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PlayFlowTest.kt`

**Interfaces:**
- Produces:
  - `game.RoundAsset(mediaType: String, bytes: ByteArray)` (plain class, kein data class)
  - `game.SOLUTION_ASSET_KEY: Int = 99`
  - `GameType`: `stages(params): Int = 1`, `produceAssets(params): Map<Int, RoundAsset> = emptyMap()`, `materialised(params, roundGameId: UUID) {}`, `asset(params, roundGameId, key): RoundAsset? = null`, `releaseAssets(roundGameIds: List<UUID>) {}`
  - `RoundContext(roundNumber, phase, previousParams: List<JsonNode> = emptyList())`
  - `guessActionFor(rule: AwardRule, qualifies: Boolean, stage: Int, stages: Int): GuessAction` mit `enum GuessAction { RECORD, ADVANCE_STAGE }`
  - `GameTypeHandle`: `stages(params: JsonNode)`, `produceAssets(params: JsonNode)`, `materialised(params: JsonNode, roundGameId)`, `asset(params: JsonNode, roundGameId, key)`, `releaseAssets(roundGameIds)`

- [ ] **Step 1: Fallenden Test für die Flow-Entscheidung schreiben** (reiner Unit-Test, kein Spring)

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class PlayFlowTest {

    @Test
    fun `a wrong guess below the last stage of an ALL_QUALIFYING round advances`() {
        guessActionFor(rule = AwardRule.ALL_QUALIFYING, qualifies = false, stage = 0, stages = 5)
            .shouldBe(GuessAction.ADVANCE_STAGE)
        guessActionFor(rule = AwardRule.ALL_QUALIFYING, qualifies = false, stage = 3, stages = 5)
            .shouldBe(GuessAction.ADVANCE_STAGE)
    }

    @Test
    fun `everything else records`() {
        // richtig -> terminal, egal wo
        guessActionFor(rule = AwardRule.ALL_QUALIFYING, qualifies = true, stage = 0, stages = 5)
            .shouldBe(GuessAction.RECORD)
        // letzte Stufe -> terminal auch bei falsch
        guessActionFor(rule = AwardRule.ALL_QUALIFYING, qualifies = false, stage = 4, stages = 5)
            .shouldBe(GuessAction.RECORD)
        // Phase zwei -> immer terminal
        guessActionFor(rule = AwardRule.CLOSEST_ONLY, qualifies = false, stage = 0, stages = 5)
            .shouldBe(GuessAction.RECORD)
        // Ein-Stufen-Spiel (Guess Hue): es gibt kein "unterhalb der letzten Stufe"
        guessActionFor(rule = AwardRule.ALL_QUALIFYING, qualifies = false, stage = 0, stages = 1)
            .shouldBe(GuessAction.RECORD)
    }
}
```

- [ ] **Step 2: Test fällt** (`./mvnw test -Dtest=PlayFlowTest`; Kompilierfehler)

- [ ] **Step 3: `PlayFlow.kt` implementieren**

```kotlin
package org.unividuell.countdown.core.game

/** What the framework does with a judged guess. */
enum class GuessAction { RECORD, ADVANCE_STAGE }

/**
 * Terminal or not — the framework's decision, made without a new flag: a wrong guess below the
 * last stage of an ALL_QUALIFYING round advances the stage instead of recording; everything else
 * records. CLOSEST_ONLY (phase two, frozen on the round) is always terminal — one guess, whatever
 * the stage. Pure and exposed, so the lab replays the exact rule the real round applies — the
 * `pointsFor` precedent.
 */
fun guessActionFor(rule: AwardRule, qualifies: Boolean, stage: Int, stages: Int): GuessAction =
    if (rule == AwardRule.ALL_QUALIFYING && !qualifies && stage < stages - 1) GuessAction.ADVANCE_STAGE
    else GuessAction.RECORD
```

- [ ] **Step 4: `GameType.kt` erweitern** — `import java.util.UUID` ergänzen; oberhalb des Interfaces:

```kotlin
/** The asset key under which a round's solution audio/artefact hides behind the solution gate. */
const val SOLUTION_ASSET_KEY = 99

/**
 * One binary artefact of a round — bytes plus how to serve them. A plain class, not a data class:
 * ByteArray equality is identity, and nothing ever compares assets.
 */
class RoundAsset(val mediaType: String, val bytes: ByteArray)
```

`RoundContext` erweitern (Default hält alle bestehenden Aufrufer quellkompatibel):

```kotlin
/** What a game may know about the round it is drawing for. [previousParams] are the frozen params
 *  of this edition's earlier rounds OF THE SAME GAME TYPE — for draws that avoid repetition. */
data class RoundContext(
    val roundNumber: Int,
    val phase: Phase,
    val previousParams: List<JsonNode> = emptyList(),
)
```

Im Interface `GameType<P : Any>` nach `solution()` anfügen:

```kotlin
    /** How many stages this game's rounds have. 1 — the default — means: no staged progression. */
    fun stages(params: P): Int = 1

    /**
     * Compute the round's binary assets, keyed by stage plus [SOLUTION_ASSET_KEY]. Expensive — may
     * perform network I/O. Called once per round by whoever owns the storage: [materialised] for a
     * real round, the lab's in-memory store for a lab round.
     */
    fun produceAssets(params: P): Map<Int, RoundAsset> = emptyMap()

    /**
     * After the round row exists: produce and persist this round's assets — the game owns its
     * storage. Must be idempotent: on an announce race both first callers run the materialisation
     * branch, so the loser calls this a second time.
     */
    fun materialised(params: P, roundGameId: UUID) {}

    /** One stored asset of a real round. The framework gates WHO may fetch; the game only fetches. */
    fun asset(params: P, roundGameId: UUID, key: Int): RoundAsset? = null

    /** These rounds no longer need their assets — delete what you stored for them. */
    fun releaseAssets(roundGameIds: List<UUID>) {}
```

- [ ] **Step 5: `GameTypeHandle` (in `GameCatalog.kt`) um Passthroughs erweitern** — `import java.util.UUID` ergänzen:

```kotlin
    /** How many stages a round of this game has, from a stored `params` blob. */
    fun stages(params: JsonNode): Int = type.stages(paramsOf(params))

    /** Compute (expensively) the round's assets — the lab's path; the real round goes through [materialised]. */
    fun produceAssets(params: JsonNode): Map<Int, RoundAsset> = type.produceAssets(paramsOf(params))

    /** Produce and persist the round's assets — the game owns its storage. Idempotent. */
    fun materialised(params: JsonNode, roundGameId: UUID) =
        type.materialised(params = paramsOf(params), roundGameId = roundGameId)

    /** One stored asset. The caller gates; this only fetches. */
    fun asset(params: JsonNode, roundGameId: UUID, key: Int): RoundAsset? =
        type.asset(params = paramsOf(params), roundGameId = roundGameId, key = key)

    /** Forwarded verbatim — no params involved. */
    fun releaseAssets(roundGameIds: List<UUID>) = type.releaseAssets(roundGameIds)
```

- [ ] **Step 6: Alles grün** — `./mvnw test -Dtest='PlayFlowTest,GameCatalogTest,GuessHueGameTypeTest'` (Guess Hue kompiliert unverändert: alle neuen Members haben Defaults)

- [ ] **Step 7: Commit** — `feat(game): staged-game contract — stages, assets, materialised hook, pure guess-action rule`

---

### Task 3: PlayService — Stufen-Guess, Skip, Aufgeben + Endpoints + DTO-Stufe

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundController.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptions.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptionHandler.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PlayServiceStagedTest.kt`

**Interfaces:**
- Consumes: Task 1 (`advanceStage`, `giveUp`, `stage`), Task 2 (`guessActionFor`, `stages()`)
- Produces: `PlayService.skip(slug, userId, isSuperAdmin, roundNumber, fromStage): RoundResponse`, `PlayService.giveUp(slug, userId, isSuperAdmin, roundNumber): RoundResponse`, geänderte `guess()`-Semantik; Wire: `POST …/current/skip` mit `SkipRequest(roundNumber, fromStage)`, `POST …/current/give-up` mit `GiveUpRequest(roundNumber)`; `MyPlayDto.stage: Int`, `OtherPlayDto.stage: Int`; `StageMovedOnException` → 409

- [ ] **Step 1: Fallenden Test schreiben** — Harness und Fixture-Helfer (`aUser`, `aCommunity`, `currentRoundNumberOf`, direkter `store.announce`) **verbatim aus `PlayServiceStrictRevealTest` übernehmen**; die Fake-Game-`@TestConfiguration` sieht so aus:

```kotlin
@TestConfiguration
class StagedGame {
    data class StagedParams(val answer: String)
    data class StagedPayload(val stages: Int) : GamePayload

    /** Five stages, judges string equality on "answer" — the smallest staged game possible. */
    @Bean
    fun stagedGame(): GameType<StagedParams> = object : GameType<StagedParams> {
        override val id = "staged-fake"
        override val displayName = "Stufig"
        override val paramsType = StagedParams::class.java
        override fun draw(random: GameRandom, context: RoundContext) = StagedParams(answer = "42")
        override fun present(params: StagedParams) = StagedPayload(stages = 5)
        override fun judge(params: StagedParams, guess: JsonNode) = Judgement(
            qualifies = guess.get("answer")?.asString() == params.answer,
            deviation = 0.0,
            outcome = null,
        )
        override fun requiresReveal(params: StagedParams) = false
        override fun stages(params: StagedParams) = 5
    }
}
```

*(Falls `asString()` in tools.jackson 3 anders heißt: dieselbe Lese-API verwenden, mit der `GuessHueGameType.judge` Zahlen liest — `get(...)?.takeIf { … }` — und für Strings das Pendant; im Zweifel `mapper.treeToValue` auf eine kleine data class, wie der echte Adapter in Task 9.)*

Testmethoden (Round wird via `store.announce(gameType = "staged-fake", params = mapper.readTree("""{"answer":"42"}"""), award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), …)` angelegt; für Phase zwei `award = Award(rule = AwardRule.CLOSEST_ONLY, points = 5)`):

```kotlin
@Test
fun `a wrong guess below the last stage advances instead of recording`() {
    play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
    val res = play.guess(slug = community.slug, userId = viewer, isSuperAdmin = false,
        roundNumber = roundNumber, guess = mapper.readTree("""{"answer":"7"}"""))
    res.me.shouldNotBeNull().stage shouldBe 1
    res.me.shouldNotBeNull().guessedAt.shouldBeNull()
    res.solution.shouldBeNull()
}

@Test
fun `a correct guess records with the stage as its deviation`() {
    play.reveal(...)
    play.skip(slug = community.slug, userId = viewer, isSuperAdmin = false,
        roundNumber = roundNumber, fromStage = 0)
    val res = play.guess(..., guess = mapper.readTree("""{"answer":"42"}"""))
    res.me.shouldNotBeNull().guessedAt.shouldNotBeNull()
    res.me.shouldNotBeNull().stage shouldBe 1
    res.me.shouldNotBeNull().points shouldBe 1
}

@Test
fun `a wrong guess on the last stage is terminal with zero points`() {
    play.reveal(...)
    repeat(4) { i -> play.skip(..., fromStage = i) }
    val res = play.guess(..., guess = mapper.readTree("""{"answer":"7"}"""))
    res.me.shouldNotBeNull().guessedAt.shouldNotBeNull()
    res.me.shouldNotBeNull().points shouldBe 0
}

@Test
fun `under CLOSEST_ONLY every guess is terminal`() {
    // announce mit CLOSEST_ONLY; ein falscher Guess auf Stufe 0:
    val res = play.guess(..., guess = mapper.readTree("""{"answer":"7"}"""))
    res.me.shouldNotBeNull().guessedAt.shouldNotBeNull()
}

@Test
fun `skip is guarded by the expected stage`() {
    play.reveal(...)
    play.skip(..., fromStage = 0)
    shouldThrow<StageMovedOnException> { play.skip(..., fromStage = 0) }
    shouldThrow<StageMovedOnException> { play.skip(..., fromStage = 4) } // >= stages-1
}

@Test
fun `under CLOSEST_ONLY the least audio wins, and a tie pays both in full`() {
    // announce mit CLOSEST_ONLY, points = 5; drei Mitglieder derselben Community anlegen
    // (aUser + Membership wie im Harness; zur Not drei aCommunity-Owner-Konstruktion spiegeln).
    // alice: richtig auf Stufe 0 — bob: skip einmal, dann richtig auf Stufe 1
    aliceGuessesCorrectAtStage0()
    bobSkipsOnceThenGuessesCorrect()
    val afterBob = play.guess(/* bobs terminaler Guess */)
    // wenigstes Audio gewinnt: alice 5, bob 0
    afterBob.others.single { it.userId == alice }.points shouldBe 5
    afterBob.me.shouldNotBeNull().points shouldBe 0
    // carol zieht mit alice gleich (richtig auf Stufe 0): Gleichstand zahlt BEIDEN voll
    carolGuessesCorrectAtStage0()
    val final = play.reveal(slug = community.slug, userId = alice, isSuperAdmin = false)
    final.me.shouldNotBeNull().points shouldBe 5
    final.others.single { it.userId == carol }.points shouldBe 5
}

@Test
fun `giving up spends the round without an answer`() {
    play.reveal(...)
    val res = play.giveUp(slug = community.slug, userId = viewer, isSuperAdmin = false,
        roundNumber = roundNumber)
    res.me.shouldNotBeNull().guessedAt.shouldNotBeNull()
    res.me.shouldNotBeNull().points shouldBe 0
    res.solution.shouldBeNull() // staged-fake hat kein solution(); das Gate selbst prüft Task 4
    shouldThrow<AlreadyGuessedException> { play.giveUp(...) }
}
```

- [ ] **Step 2: Test fällt** (`./mvnw test -Dtest=PlayServiceStagedTest`; Kompilierfehler `skip`/`giveUp`/`stage`)

- [ ] **Step 3: Exceptions + Handler**

`GameExceptions.kt` anfügen:

```kotlin
/** The staged reveal moved under the click (raced skip, raced wrong guess, or the top) → 409. */
class StageMovedOnException(message: String = "the stage has moved on") : RuntimeException(message)
```

`GameExceptionHandler`: `StageMovedOnException::class` in die `conflict(...)`-Liste aufnehmen.

- [ ] **Step 4: DTOs + Responses**

`RoundDtos.kt`: `OtherPlayDto` bekommt `val stage: Int` (nach `avatar`), `MyPlayDto` ebenso. Doc-Ergänzung an `OtherPlayDto.stage`:

```kotlin
    /**
     * Safe although timestamps are not: an "other" row is listed only once that player is finished
     * (see RoundResponses) — a final stage is a result, not a live tactic.
     */
    val stage: Int,
```

Requests anfügen:

```kotlin
/** Advance the staged reveal: from the stage the client believes it is on. */
data class SkipRequest(val roundNumber: Int, val fromStage: Int)

/** Spend the round without an answer. */
data class GiveUpRequest(val roundNumber: Int)
```

`RoundResponses`: `mineDtoOf` und `otherDtoOf` reichen `stage = play.stage` durch.

- [ ] **Step 5: PlayService**

`guess(...)` — zwischen `judge` und `recordGuess` (Imports: `GuessAction`, `guessActionFor`):

```kotlin
        val judgement = current.handle.judge(params = round.params, guess = guess)
        val stages = current.handle.stages(round.params)
        val action = guessActionFor(
            rule = round.awardRule,
            qualifies = judgement.qualifies,
            stage = play.stage,
            stages = stages,
        )
        if (action == GuessAction.ADVANCE_STAGE) {
            // Judged and discarded on purpose: in phase one a wrong guess below the last stage only
            // burns the stage. The terminal write below stays the only guess the row ever keeps.
            val advanced = plays.advanceStage(
                roundGameId = requireNotNull(round.id), userId = userId, expectedStage = play.stage,
            )
            if (advanced == 0) throw StageMovedOnException()
            return responses.of(current = current.copy(roundGame = round), viewerId = userId)
        }
        // For a staged game the distance IS the stage — framework state the game cannot know. A
        // single-stage game keeps the game's own distance.
        val deviation = if (stages > 1) play.stage.toDouble() else judgement.deviation
        val recorded = plays.recordGuess(
            id = requireNotNull(play.id),
            guess = guess,
            guessedAt = clock.instant(),
            qualifies = judgement.qualifies,
            deviation = deviation,
            outcome = judgement.outcome?.let { mapper.valueToTree(it) },
        )
```

Neue Methoden:

```kotlin
    /** Voluntary stage advance. Own row only — no round lock needed, the guard is the statement. */
    @Transactional
    fun skip(slug: String, userId: UUID, isSuperAdmin: Boolean, roundNumber: Int, fromStage: Int): RoundResponse {
        val current = playable(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        if (current.round.number != roundNumber) throw RoundMovedOnException(current.round.number)
        val stages = current.handle.stages(current.roundGame.params)
        // No skip off the top: the exits up there are the terminal guess, or giving up.
        if (fromStage < 0 || fromStage >= stages - 1) throw StageMovedOnException()
        val roundGameId = requireNotNull(current.roundGame.id)
        val advanced = plays.advanceStage(roundGameId = roundGameId, userId = userId, expectedStage = fromStage)
        if (advanced == 0) {
            plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId)
                ?: throw NotRevealedException()
            throw StageMovedOnException()
        }
        return responses.of(current = current, viewerId = userId)
    }

    /** The explicit exit without an answer: spends the guess, scores 0, opens the solution gate. */
    @Transactional
    fun giveUp(slug: String, userId: UUID, isSuperAdmin: Boolean, roundNumber: Int): RoundResponse {
        val current = playable(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        if (current.round.number != roundNumber) throw RoundMovedOnException(current.round.number)
        // Locked like a guess: the re-evaluation below reads and rewrites every guess of this round.
        val round = store.lock(current.roundGame)
        val roundGameId = requireNotNull(round.id)
        plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId)
            ?: throw NotRevealedException()
        val spent = plays.giveUp(roundGameId = roundGameId, userId = userId, guessedAt = clock.instant())
        if (spent == 0) throw AlreadyGuessedException()
        scoring.reevaluate(round)
        return responses.of(current = current.copy(roundGame = round), viewerId = userId)
    }
```

- [ ] **Step 6: Controller-Endpoints**

```kotlin
    /** Voluntary stage advance — „mehr hören“. Guarded by the stage the client believes it is on. */
    @PostMapping("/current/skip")
    fun skip(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody body: SkipRequest,
    ): RoundResponse = plays.skip(
        slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin,
        roundNumber = body.roundNumber, fromStage = body.fromStage,
    )

    /** The explicit exit without an answer. */
    @PostMapping("/current/give-up")
    fun giveUp(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody body: GiveUpRequest,
    ): RoundResponse = plays.giveUp(
        slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin, roundNumber = body.roundNumber,
    )
```

- [ ] **Step 7: Grün + Regression** — `./mvnw test -Dtest='PlayService*,RoundControllerTest,RoundResponses*'`, dann volle Suite `./mvnw test`

- [ ] **Step 8: Commit** — `feat(game): staged guess flow — skip, give-up, wrong-guess-advances in phase one`

---

### Task 4: Generischer Asset-Endpoint mit Stufen- und Solution-Gate

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundController.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptions.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptionHandler.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundAssetGateTest.kt`

**Interfaces:**
- Consumes: Task 2 (`asset()`, `SOLUTION_ASSET_KEY`, `RoundAsset`), Task 3 (Stufe auf dem Play-Row)
- Produces: `GET /api/communities/{slug}/rounds/current/assets/{roundNumber}/{key}` → Bytes mit `Content-Type` des Assets, `Cache-Control: private, max-age=86400, immutable`; 403 `AssetForbiddenException`, 404 `AssetNotFoundException`; `PlayService.asset(slug, userId, isSuperAdmin, roundNumber, key): RoundAsset`

- [ ] **Step 1: Fallenden Test schreiben** — gleiche Harness wie Task 3; das Fake-Game bekommt zusätzlich Assets:

```kotlin
        override fun asset(params: StagedParams, roundGameId: UUID, key: Int): RoundAsset? =
            when (key) {
                in 0..4 -> RoundAsset(mediaType = "audio/wav", bytes = byteArrayOf(key.toByte()))
                SOLUTION_ASSET_KEY -> RoundAsset(mediaType = "audio/mpeg", bytes = byteArrayOf(99))
                else -> null
            }
```

```kotlin
@Test
fun `a player may fetch every unlocked stage and nothing above`() {
    play.reveal(...)
    play.skip(..., fromStage = 0)
    play.asset(..., roundNumber = roundNumber, key = 0).bytes shouldBe byteArrayOf(0)
    play.asset(..., roundNumber = roundNumber, key = 1).bytes shouldBe byteArrayOf(1)
    shouldThrow<AssetForbiddenException> { play.asset(..., key = 2) }
}

@Test
fun `the solution asset opens with the spent guess, not before`() {
    play.reveal(...)
    shouldThrow<AssetForbiddenException> { play.asset(..., key = SOLUTION_ASSET_KEY) }
    play.giveUp(...)
    play.asset(..., key = SOLUTION_ASSET_KEY).mediaType shouldBe "audio/mpeg"
}

@Test
fun `an unknown key inside the allowed range is a 404, a foreign round a 409`() {
    play.reveal(...)
    shouldThrow<AssetNotFoundException> { play.asset(..., key = 7) }        // 7 > stage -> forbidden zuerst!
    shouldThrow<RoundMovedOnException> { play.asset(..., roundNumber = roundNumber + 1, key = 0) }
}
```

*(Achtung Reihenfolge im dritten Test: `key = 7` ist oberhalb der Stufe → erwartet `AssetForbiddenException`. Für den echten 404 einen Key ≤ Stufe wählen, den das Fake-Game nicht liefert — dafür das Fake-Game so ändern, dass `key == 1` `null` liefert, oder den 404-Fall über ein zweites Fake prüfen. Einfachste Variante: Fake liefert nur `key == 0` und `99`; nach `skip` ist `key = 1` erlaubt aber ungefüllt → 404.)*

- [ ] **Step 2: Test fällt** (`./mvnw test -Dtest=RoundAssetGateTest`)

- [ ] **Step 3: Exceptions**

```kotlin
/** The key lies above the caller's stage, or behind a solution gate that is still closed → 403. */
class AssetForbiddenException(message: String = "this asset is not yours to fetch yet") :
    RuntimeException(message)

/** The gate allowed it, but the game has nothing stored under this key → 404. */
class AssetNotFoundException(message: String = "no such asset") : RuntimeException(message)
```

Handler: `AssetForbiddenException` → neuer `@ExceptionHandler` mit `HttpStatus.FORBIDDEN`; `AssetNotFoundException` in den bestehenden `notFound(...)`-Handler aufnehmen.

- [ ] **Step 4: PlayService.asset**

```kotlin
    /**
     * One stored asset of the current round. The gate is framework state: unlocked stages stay
     * fetchable ([key] <= the caller's stage), the solution asset opens with the spent guess.
     */
    @Transactional(readOnly = true)
    fun asset(slug: String, userId: UUID, isSuperAdmin: Boolean, roundNumber: Int, key: Int): RoundAsset {
        val current = playable(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        if (current.round.number != roundNumber) throw RoundMovedOnException(current.round.number)
        val roundGameId = requireNotNull(current.roundGame.id)
        val play = plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId)
            ?: throw NotRevealedException()
        val allowed = if (key == SOLUTION_ASSET_KEY) play.guessedAt != null else key in 0..play.stage
        if (!allowed) throw AssetForbiddenException()
        return current.handle.asset(params = current.roundGame.params, roundGameId = roundGameId, key = key)
            ?: throw AssetNotFoundException()
    }
```

- [ ] **Step 5: Controller** (Imports: `org.springframework.http.HttpHeaders`, `org.springframework.http.ResponseEntity`)

```kotlin
    /**
     * The round's binary assets, stage-gated. Round number and key ride in the URL so each pair is
     * its own privately cacheable resource — without the round number, yesterday's cache would
     * replay the wrong round.
     */
    @GetMapping("/current/assets/{roundNumber}/{key}")
    fun asset(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable roundNumber: Int,
        @PathVariable key: Int,
    ): ResponseEntity<ByteArray> {
        val asset = plays.asset(
            slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin,
            roundNumber = roundNumber, key = key,
        )
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_TYPE, asset.mediaType)
            .header(HttpHeaders.CACHE_CONTROL, "private, max-age=86400, immutable")
            .body(asset.bytes)
    }
```

- [ ] **Step 6: Grün** — `./mvnw test -Dtest='RoundAssetGateTest,PlayService*'`

- [ ] **Step 7: Commit** — `feat(game): stage-gated round asset endpoint`

---

### Task 5: Announce-Pfad — `materialised`-Hook, Cleanup, `previousParams`

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/AnnouncementService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameRepository.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameStore.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/AnnouncementMaterialisedHookTest.kt`

**Interfaces:**
- Consumes: Task 2 (`materialised`, `releaseAssets`, `RoundContext.previousParams`)
- Produces: `RoundGameRepository.findByEditionIdAndGameType(editionId, gameType): List<RoundGame>`, `RoundGameRepository.idsOfOtherRounds(editionId, roundNumber): List<UUID>`, `RoundGameStore.previousParams(edition, gameType): List<JsonNode>`, `RoundGameStore.roundIdsExcept(edition, roundNumber): List<UUID>`

- [ ] **Step 1: Fallenden Test schreiben** — Harness wie Task 3, Fake-Game zeichnet Hook-Aufrufe auf:

```kotlin
@TestConfiguration
class RecordingGame {
    class Recorder {
        val materialisedFor = CopyOnWriteArrayList<UUID>()
        val releasedRounds = CopyOnWriteArrayList<UUID>()
        val previousParamsSeen = CopyOnWriteArrayList<List<JsonNode>>()
    }
    @Bean fun recorder() = Recorder()
    @Bean
    fun recordingGame(recorder: Recorder): GameType<RecParams> = object : GameType<RecParams> {
        override val id = "recording-fake"
        override val displayName = "Aufzeichnend"
        override val paramsType = RecParams::class.java
        override fun draw(random: GameRandom, context: RoundContext): RecParams {
            recorder.previousParamsSeen.add(context.previousParams)
            return RecParams(n = context.roundNumber)
        }
        override fun present(params: RecParams) = RecPayload(n = params.n)
        override fun judge(params: RecParams, guess: JsonNode) =
            Judgement(qualifies = true, deviation = 0.0, outcome = null)
        override fun requiresReveal(params: RecParams) = false
        override fun materialised(params: RecParams, roundGameId: UUID) {
            recorder.materialisedFor.add(roundGameId)
        }
        override fun releaseAssets(roundGameIds: List<UUID>) {
            recorder.releasedRounds.addAll(roundGameIds)
        }
    }
    data class RecParams(val n: Int)
    data class RecPayload(val n: Int) : GamePayload
}
```

Tests: (a) erster `resolve` einer Runde ruft `materialised` mit der Runden-ID; (b) `releaseAssets` bekommt die IDs **anderer** Runden der Edition (eine ältere Runde direkt via `store.announce` mit kleinerem/größerem `roundNumber` anlegen); (c) `previousParams` enthält die Params früherer Runden **desselben Typs** — die ältere Runde einmal als `recording-fake`, eine weitere als `guess-hue` anlegen und asserten, dass nur die eine ankommt.

*(Achtung: `materialise` läuft nur, wenn die Selektion diesen Typ zieht — wie in `PlayServiceStrictRevealTest` dokumentiert. Für (a) deshalb nicht über die Selektion gehen, sondern den Zweig direkt provozieren: Edition ohne bestehende Runde + Katalog, in dem das Fake das einzige … ist nicht machbar, Guess Hue ist unconditional. Stattdessen die für die aktuelle Runde gezogene Zufalls-Selektion umgehen: den Test auf `AnnouncementService.resolve` fahren und BEIDE möglichen Typen zulassen — asserten, dass genau der materialisierte Typ seinen Hook bekam: wenn `store.find(...)!!.gameType == "recording-fake"`, dann `recorder.materialisedFor` enthält die ID; der Cleanup-Assert (b) gilt typunabhängig, weil `releaseEarlierRounds` ALLE Handles aufruft.)*

- [ ] **Step 2: Test fällt** (`./mvnw test -Dtest=AnnouncementMaterialisedHookTest`)

- [ ] **Step 3: Repository + Store**

`RoundGameRepository`:

```kotlin
    /** Earlier rounds of one game type — the draw's repetition-avoidance input. Derived query. */
    fun findByEditionIdAndGameType(editionId: UUID, gameType: String): List<RoundGame>

    /** Every round of the edition except the current one — the cleanup's scope. */
    @Query("SELECT id FROM game.round_games WHERE edition_id = :editionId AND round_number <> :roundNumber")
    fun idsOfOtherRounds(editionId: UUID, roundNumber: Int): List<UUID>
```

`RoundGameStore`:

```kotlin
    /** The frozen params of this edition's earlier rounds of [gameType] — what a draw may avoid. */
    @Transactional(readOnly = true)
    fun previousParams(edition: CommunityEdition, gameType: String): List<JsonNode> =
        rounds.findByEditionIdAndGameType(
            editionId = requireNotNull(edition.id),
            gameType = gameType,
        ).map { it.params }

    /** Every round id of [edition] except [roundNumber] — the rounds whose assets may go. */
    @Transactional(readOnly = true)
    fun roundIdsExcept(edition: CommunityEdition, roundNumber: Int): List<UUID> =
        rounds.idsOfOtherRounds(editionId = requireNotNull(edition.id), roundNumber = roundNumber)
```

- [ ] **Step 4: AnnouncementService.materialise erweitern**

```kotlin
        val handle = requireNotNull(catalog.handle(typeId)) { "selection picked unknown type '$typeId'" }
        val announced = store.announce(
            edition = edition,
            roundNumber = round.number,
            gameType = typeId,
            params = handle.draw(
                random = random,
                context = RoundContext(
                    roundNumber = round.number,
                    phase = Phase.of(edition = edition, roundNumber = round.number),
                    previousParams = store.previousParams(edition = edition, gameType = typeId),
                ),
            ),
            award = awardFor(roundNumber = round.number, phaseTwoStartRound = edition.phaseTwoStartRound),
            announcedAt = clock.instant(),
        )
        // May run twice on an announce race — both first callers pass through this branch. The
        // game's storage is idempotent for exactly that reason.
        handle.materialised(params = announced.params, roundGameId = requireNotNull(announced.id))
        releaseEarlierRounds(edition = edition, current = round.number)
        return announced
```

Neue private Methode:

```kotlin
    /**
     * Only the current round is playable — past rounds are display-only and have no asset
     * endpoint — so whatever any game stored for earlier rounds may go. Every game is asked;
     * each deletes only what it owns (a no-op for most).
     */
    private fun releaseEarlierRounds(edition: CommunityEdition, current: Int) {
        val earlier = store.roundIdsExcept(edition = edition, roundNumber = current)
        if (earlier.isEmpty()) return
        for (id in catalog.ids()) {
            catalog.handle(id)?.releaseAssets(earlier)
        }
    }
```

- [ ] **Step 5: Grün + Regression** — `./mvnw test -Dtest='Announcement*'`, dann `./mvnw test`

- [ ] **Step 6: Commit** — `feat(game): materialised hook, previous-params context, earlier-round asset cleanup`

---

### Task 6: `songsnippet`-Modul — Vendor-Interfaces, Deezer-Implementierung, Such-/Track-Controller

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/songsnippet/SongCatalog.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/songsnippet/internal/SongSnippetProperties.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/songsnippet/internal/SongSnippetConfiguration.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/songsnippet/internal/DeezerSongCatalog.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/songsnippet/internal/DeezerPreviewSource.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/songsnippet/internal/SongSnippetController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/songsnippet/DeezerSongCatalogTest.kt`
- Test-Fixtures: `core/src/test/resources/songsnippet/deezer-search-hotel-california.json`, `deezer-playlist-tracks.json`, `deezer-track.json`

**Interfaces:**
- Produces (exposed, `songsnippet`-Wurzelpaket):

```kotlin
data class CatalogTrack(
    val trackId: Long,
    val artist: String,
    /** Deezer's title_short — the version-free title („Hotel California“, not „… (2013 Remaster)“). */
    val title: String,
    val coverUrl: String?,
    /** Permanent web link for humans — the admin's way back to the song. */
    val link: String,
)

data class ResolvedTrack(val track: CatalogTrack, val previewUrl: String)

/** The catalogue vendor, behind an interface so the implementation can be swapped — and so no test
 *  ever touches the network. */
interface SongCatalog {
    /** The merged, preview-filtered pool of the configured playlists. Cached by the implementation. */
    fun poolTracks(): List<CatalogTrack>
    fun search(query: String): List<CatalogTrack>
    /** Fresh resolution by permanent track id — the preview URL inside is signed and short-lived. */
    fun track(trackId: Long): ResolvedTrack?
}

/** Downloads one preview file. Separate from the catalogue: a different vendor may serve the bytes. */
interface PreviewSource {
    fun download(previewUrl: String): ByteArray
}
```

- Wire: `GET /api/song-snippet/search?q=…` → `List<SongSearchResultDto(trackId, artist, title, coverUrl)>` (leere Liste bei `q.length < 3`); `GET /api/song-snippet/tracks/{trackId}` → `TrackDto(trackId, artist, title, coverUrl, link, previewUrl)` oder 404.

- [ ] **Step 1: Fixtures einfangen** (einmalig, echte Responses — danach nie wieder Netz):

```bash
mkdir -p core/src/test/resources/songsnippet
curl -s --get 'https://api.deezer.com/search' --data-urlencode 'q=hotel california eagles' --data-urlencode 'limit=5' > core/src/test/resources/songsnippet/deezer-search-hotel-california.json
curl -s 'https://api.deezer.com/playlist/10396822102/tracks?limit=400' > core/src/test/resources/songsnippet/deezer-playlist-tracks.json
curl -s 'https://api.deezer.com/track/426703682' > core/src/test/resources/songsnippet/deezer-track.json
```

Sichtprüfung: `title_short`/`title_version` vorhanden, `preview`-URLs signiert, Playlist-Tracks teils ohne Preview (genau diese Fälle sollen die Tests treffen).

- [ ] **Step 2: Fallenden Test schreiben** — reiner Spring-Web-Test ohne Boot-Kontext:

```kotlin
package org.unividuell.countdown.core.songsnippet

import io.kotest.matchers.collections.shouldNotBeEmpty
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo
import org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess
import org.springframework.web.client.RestClient
import org.unividuell.countdown.core.songsnippet.internal.DeezerSongCatalog
import org.unividuell.countdown.core.songsnippet.internal.SongSnippetProperties
import java.time.Clock
import java.time.Duration

class DeezerSongCatalogTest {

    private fun fixture(name: String): String =
        requireNotNull(javaClass.getResource("/songsnippet/$name")).readText()

    private fun catalogAgainst(setup: (MockRestServiceServer) -> Unit): DeezerSongCatalog {
        val builder = RestClient.builder().baseUrl("https://api.deezer.com")
        val server = MockRestServiceServer.bindTo(builder).build()
        setup(server)
        return DeezerSongCatalog(
            client = builder.build(),
            properties = SongSnippetProperties(
                playlistIds = listOf(10396822102L),
                poolCacheTtl = Duration.ofHours(6),
            ),
            clock = Clock.systemUTC(),
        )
    }

    @Test
    fun `the pool merges playlist tracks and drops the ones without a preview`() {
        val catalog = catalogAgainst { server ->
            server.expect(requestTo("https://api.deezer.com/playlist/10396822102/tracks?limit=400"))
                .andRespond(withSuccess(fixture("deezer-playlist-tracks.json"), MediaType.APPLICATION_JSON))
        }
        val pool = catalog.poolTracks()
        pool.shouldNotBeEmpty()
        // Jede Zeile stammt aus einem Track MIT preview; Titel ist title_short (versionsfrei):
        pool.forEach { it.title shouldBe it.title.trim() }
    }

    @Test
    fun `the pool is cached - a second call answers without a second request`() {
        val catalog = catalogAgainst { server ->
            // genau EINE erwartete Anfrage; eine zweite ließe den MockServer fehlschlagen
            server.expect(requestTo("https://api.deezer.com/playlist/10396822102/tracks?limit=400"))
                .andRespond(withSuccess(fixture("deezer-playlist-tracks.json"), MediaType.APPLICATION_JSON))
        }
        catalog.poolTracks()
        catalog.poolTracks()
    }

    @Test
    fun `search maps the essentials and title_short wins over the versioned title`() {
        val catalog = catalogAgainst { server ->
            server.expect(requestTo("https://api.deezer.com/search?q=hotel%20california%20eagles&limit=8"))
                .andRespond(withSuccess(fixture("deezer-search-hotel-california.json"), MediaType.APPLICATION_JSON))
        }
        val hits = catalog.search("hotel california eagles")
        hits.shouldNotBeEmpty()
        hits.first().title shouldBe "Hotel California"   // nicht "... (2013 Remaster)"
        hits.first().artist shouldBe "Eagles"
    }

    @Test
    fun `track resolves the permanent id to a fresh preview url`() {
        val catalog = catalogAgainst { server ->
            server.expect(requestTo("https://api.deezer.com/track/426703682"))
                .andRespond(withSuccess(fixture("deezer-track.json"), MediaType.APPLICATION_JSON))
        }
        val resolved = catalog.track(426703682L).shouldNotBeNull()
        resolved.track.trackId shouldBe 426703682L
        resolved.previewUrl.startsWith("https://") shouldBe true
    }
}
```

*(Die exakten `requestTo`-URLs an das URL-Encoding von RestClient anpassen, falls der erste Lauf sie anders formatiert — der MockServer-Fehlertext nennt die tatsächliche URL.)*

- [ ] **Step 3: Test fällt** (Kompilierfehler), dann implementieren:

`SongSnippetProperties.kt`:

```kotlin
package org.unividuell.countdown.core.songsnippet.internal

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

/** Public editorial playlists the pool merges — a public catalogue, not game content. */
@ConfigurationProperties("app.song-snippet")
data class SongSnippetProperties(
    val playlistIds: List<Long> = emptyList(),
    val poolCacheTtl: Duration = Duration.ofHours(6),
)
```

`SongSnippetConfiguration.kt` (Registrierung wie `GuessHueDatasetConfiguration` — deren Registrierungsmechanik übernehmen; falls dort `@EnableConfigurationProperties` steht, hier genauso):

```kotlin
package org.unividuell.countdown.core.songsnippet.internal

import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.client.RestClient

@Configuration
@EnableConfigurationProperties(SongSnippetProperties::class)
class SongSnippetConfiguration {

    /** One client for the Deezer API; timeouts are the announce path's protection. */
    @Bean
    fun deezerRestClient(builder: RestClient.Builder): RestClient =
        builder.baseUrl("https://api.deezer.com").build()
}
```

*(Timeouts: falls `RestClient.Builder` im Projekt-Setup keine Default-Timeouts trägt, `ClientHttpRequestFactorySettings.defaults().withConnectTimeout(Duration.ofSeconds(5)).withReadTimeout(Duration.ofSeconds(5))` über `ClientHttpRequestFactoryBuilder.detect().build(...)` auf den Builder setzen — API-Namen gegen die Boot-4-Javadoc prüfen.)*

`DeezerSongCatalog.kt`:

```kotlin
package org.unividuell.countdown.core.songsnippet.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.unividuell.countdown.core.songsnippet.CatalogTrack
import org.unividuell.countdown.core.songsnippet.ResolvedTrack
import org.unividuell.countdown.core.songsnippet.SongCatalog
import java.time.Clock
import java.time.Duration
import java.time.Instant

/** Property names mirror Deezer's JSON verbatim so binding needs no annotations. */
internal data class DeezerArtistJson(val name: String = "")
internal data class DeezerAlbumJson(val cover_medium: String? = null)
internal data class DeezerTrackJson(
    val id: Long = 0,
    val title_short: String = "",
    val readable: Boolean = true,
    val preview: String? = null,
    val link: String = "",
    val artist: DeezerArtistJson = DeezerArtistJson(),
    val album: DeezerAlbumJson? = null,
)
internal data class DeezerTrackListJson(
    val data: List<DeezerTrackJson> = emptyList(),
    val next: String? = null,
)

@Component
class DeezerSongCatalog(
    private val client: RestClient,
    private val properties: SongSnippetProperties,
    private val clock: Clock,
) : SongCatalog {

    private val logger = KotlinLogging.logger {}

    private data class CachedPool(val at: Instant, val tracks: List<CatalogTrack>)

    @Volatile
    private var cachedPool: CachedPool? = null

    /** Tiny LRU so thirty people typing the same evening do not multiply into Deezer's rate limit. */
    private val searchCache = object : LinkedHashMap<String, List<CatalogTrack>>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<CatalogTrack>>) =
            size > 512
    }

    override fun poolTracks(): List<CatalogTrack> {
        val now = clock.instant()
        cachedPool
            ?.takeIf { Duration.between(it.at, now) < properties.poolCacheTtl }
            ?.let { return it.tracks }
        val fresh = properties.playlistIds
            .flatMap { fetchPlaylistTracks(it) }
            .distinctBy { it.trackId }
        if (fresh.isNotEmpty()) cachedPool = CachedPool(at = now, tracks = fresh)
        return fresh
    }

    override fun search(query: String): List<CatalogTrack> {
        synchronized(searchCache) { searchCache[query] }?.let { return it }
        val body = client.get()
            .uri { it.path("/search").queryParam("q", query).queryParam("limit", 8).build() }
            .retrieve()
            .body(DeezerTrackListJson::class.java) ?: DeezerTrackListJson()
        val hits = body.data.mapNotNull { it.toCatalogTrack() }
        synchronized(searchCache) { searchCache[query] = hits }
        return hits
    }

    override fun track(trackId: Long): ResolvedTrack? {
        val json = client.get().uri("/track/{id}", trackId).retrieve()
            .body(DeezerTrackJson::class.java) ?: return null
        val track = json.toCatalogTrack() ?: return null
        val preview = json.preview ?: return null
        return ResolvedTrack(track = track, previewUrl = preview)
    }

    private fun fetchPlaylistTracks(playlistId: Long): List<CatalogTrack> {
        val body = client.get()
            .uri("/playlist/{id}/tracks?limit=400", playlistId)
            .retrieve()
            .body(DeezerTrackListJson::class.java) ?: DeezerTrackListJson()
        if (body.next != null) {
            logger.warn { "playlist $playlistId has more than 400 tracks; pool is truncated" }
        }
        return body.data.mapNotNull { it.toCatalogTrack() }
    }

    /** Null for a track the game cannot use — no preview, or not readable. */
    private fun DeezerTrackJson.toCatalogTrack(): CatalogTrack? {
        if (!readable || preview.isNullOrBlank() || id == 0L) return null
        return CatalogTrack(
            trackId = id,
            artist = artist.name,
            title = title_short,
            coverUrl = album?.cover_medium,
            link = link,
        )
    }
}
```

`DeezerPreviewSource.kt`:

```kotlin
package org.unividuell.countdown.core.songsnippet.internal

import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.unividuell.countdown.core.songsnippet.PreviewSource
import java.net.URI

@Component
class DeezerPreviewSource(builder: RestClient.Builder) : PreviewSource {

    /** Absolute, signed CDN URLs — no base URL to share with the API client. */
    private val client = builder.build()

    override fun download(previewUrl: String): ByteArray =
        requireNotNull(client.get().uri(URI.create(previewUrl)).retrieve().body(ByteArray::class.java)) {
            "empty preview download from $previewUrl"
        }
}
```

`SongSnippetController.kt`:

```kotlin
package org.unividuell.countdown.core.songsnippet.internal

import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import org.unividuell.countdown.core.songsnippet.SongCatalog

data class SongSearchResultDto(val trackId: Long, val artist: String, val title: String, val coverUrl: String?)
data class TrackDto(
    val trackId: Long, val artist: String, val title: String,
    val coverUrl: String?, val link: String, val previewUrl: String,
)

/**
 * Catalogue-wide, round-free — which is why it lives here and not next to the round endpoints:
 * a search over the whole public catalogue reveals nothing about the chosen song.
 */
@RestController
@RequestMapping("/api/song-snippet")
class SongSnippetController(private val catalog: SongCatalog) {

    /** Below three characters the answer is an empty list, not an error — cheap and honest. */
    @GetMapping("/search")
    fun search(@RequestParam q: String): List<SongSearchResultDto> {
        if (q.trim().length < 3) return emptyList()
        return catalog.search(q.trim()).map {
            SongSearchResultDto(trackId = it.trackId, artist = it.artist, title = it.title, coverUrl = it.coverUrl)
        }
    }

    /** Fresh resolution — the reveal uses this to make wrong guesses playable straight from Deezer. */
    @GetMapping("/tracks/{trackId}")
    fun track(@PathVariable trackId: Long): TrackDto {
        val resolved = catalog.track(trackId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "no such track")
        return TrackDto(
            trackId = resolved.track.trackId,
            artist = resolved.track.artist,
            title = resolved.track.title,
            coverUrl = resolved.track.coverUrl,
            link = resolved.track.link,
            previewUrl = resolved.previewUrl,
        )
    }
}
```

- [ ] **Step 4: Grün** — `./mvnw test -Dtest=DeezerSongCatalogTest`; danach `./mvnw test -Dtest=ModularityTests` (neues Modul `songsnippet` wird erkannt; bei „module not found“: `./mvnw clean` wegen stale `application-modules.json`, siehe modules-and-migrations.md)

- [ ] **Step 5: Commit** — `feat(songsnippet): vendor interfaces with the Deezer implementation and the catalogue endpoints`

---

### Task 7: Audio-Pipeline — JLayer-Decode, sample-genaue Präfix-Schnitte, WAV

**Files:**
- Modify: `core/pom.xml`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/songsnippet/SongSnippetStages.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/songsnippet/AudioClip.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/songsnippet/internal/SnippetCutter.kt`
- Create: `core/src/test/resources/songsnippet/fixture-tone.mp3` (generiert)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/songsnippet/SnippetCutterTest.kt`

**Interfaces:**
- Produces (exposed):

```kotlin
object SongSnippetStages {
    /** The ladder. Prefixes of one and the same excerpt — stage n is contained in stage n+1. */
    val DURATIONS_SECONDS: List<Double> = listOf(0.1, 0.5, 2.0, 8.0, 15.0)
    /** Skipped before cutting: label-side fade-ins would make the 0.1s stage effectively silence. */
    const val FADE_SKIP_SECONDS = 0.5
    /** Mirrors game's SOLUTION_ASSET_KEY (= 99) without importing it — the arrow points game -> songsnippet. */
    const val SOLUTION_KEY = 99
}

/** One cut (or passed-through) piece of audio. Plain class: nothing compares clips. */
class AudioClip(val mediaType: String, val bytes: ByteArray)
```

- `SnippetCutter.ladder(mp3: ByteArray): Map<Int, AudioClip>` — Keys `0..4` (WAV, stereo, 16-bit) + `99` (Original-MP3 unverändert)

- [ ] **Step 1: JLayer-Dependency in `core/pom.xml`** (in den `<dependencies>`-Block):

```xml
		<dependency>
			<!-- Pure-java MP3 decoder for the snippet pipeline - no ffmpeg in the image. -->
			<groupId>javazoom</groupId>
			<artifactId>jlayer</artifactId>
			<version>1.0.1</version>
		</dependency>
```

- [ ] **Step 2: Fixture-MP3 generieren** (einmalig; 16s Sinuston, stereo, 44,1 kHz, ~256 KB):

```bash
ffmpeg -f lavfi -i "sine=frequency=440:duration=16" -ac 2 -ar 44100 -b:a 128k core/src/test/resources/songsnippet/fixture-tone.mp3
```

- [ ] **Step 3: Fallenden Golden-Test schreiben**

```kotlin
package org.unividuell.countdown.core.songsnippet

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.songsnippet.internal.SnippetCutter
import java.io.ByteArrayInputStream
import javax.sound.sampled.AudioSystem

class SnippetCutterTest {

    private val mp3: ByteArray =
        requireNotNull(javaClass.getResource("/songsnippet/fixture-tone.mp3")).readBytes()

    private val ladder = SnippetCutter().ladder(mp3)

    private fun pcmOf(key: Int): Pair<ByteArray, javax.sound.sampled.AudioFormat> {
        val stream = AudioSystem.getAudioInputStream(ByteArrayInputStream(ladder.getValue(key).bytes))
        return stream.readAllBytes() to stream.format
    }

    @Test
    fun `the ladder carries the five stages plus the solution key`() {
        ladder.keys.sorted() shouldContainExactly listOf(0, 1, 2, 3, 4, SongSnippetStages.SOLUTION_KEY)
    }

    @Test
    fun `every stage is sample-exact, stereo, 44_1 kHz`() {
        val expectedFrames = listOf(4410L, 22050L, 88200L, 352800L, 661500L)
        SongSnippetStages.DURATIONS_SECONDS.indices.forEach { stage ->
            val (pcm, format) = pcmOf(stage)
            format.channels shouldBe 2
            format.sampleRate shouldBe 44100.0f
            format.sampleSizeInBits shouldBe 16
            (pcm.size / format.frameSize).toLong() shouldBe expectedFrames[stage]
        }
    }

    @Test
    fun `each stage is a prefix of the next - more of the same, never a different spot`() {
        (0..3).forEach { stage ->
            val (shorter, _) = pcmOf(stage)
            val (longer, _) = pcmOf(stage + 1)
            longer.copyOfRange(0, shorter.size) shouldBe shorter
        }
    }

    @Test
    fun `the solution key passes the original mp3 through untouched`() {
        val solution = ladder.getValue(SongSnippetStages.SOLUTION_KEY)
        solution.mediaType shouldBe "audio/mpeg"
        solution.bytes shouldBe mp3
    }

    @Test
    fun `stage wavs declare their media type`() {
        ladder.getValue(0).mediaType shouldBe "audio/wav"
    }
}
```

- [ ] **Step 4: Test fällt**, dann `SnippetCutter` implementieren:

```kotlin
package org.unividuell.countdown.core.songsnippet.internal

import javazoom.jl.decoder.Bitstream
import javazoom.jl.decoder.Decoder
import javazoom.jl.decoder.SampleBuffer
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.songsnippet.AudioClip
import org.unividuell.countdown.core.songsnippet.SongSnippetStages
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.sound.sampled.AudioFormat
import javax.sound.sampled.AudioInputStream
import javax.sound.sampled.AudioSystem

/**
 * MP3 -> PCM -> sample-exact prefix cuts -> WAV, pure JVM. The cuts all start at the same offset
 * (the fade skip), so every stage is a prefix of the next — more of the same, never a new spot.
 */
@Component
class SnippetCutter {

    private class Pcm(val samples: ShortArray, val channels: Int, val sampleRate: Int)

    fun ladder(mp3: ByteArray): Map<Int, AudioClip> {
        val pcm = decode(mp3)
        val skipFrames = (SongSnippetStages.FADE_SKIP_SECONDS * pcm.sampleRate).toInt()
        val totalFrames = pcm.samples.size / pcm.channels
        val stages = SongSnippetStages.DURATIONS_SECONDS.mapIndexed { stage, seconds ->
            val wantedFrames = (seconds * pcm.sampleRate).toInt()
            val from = minOf(skipFrames, totalFrames)
            val to = minOf(from + wantedFrames, totalFrames)
            stage to AudioClip(mediaType = "audio/wav", bytes = wav(pcm = pcm, fromFrame = from, toFrame = to))
        }
        return (stages + (SongSnippetStages.SOLUTION_KEY to AudioClip(mediaType = "audio/mpeg", bytes = mp3)))
            .toMap()
    }

    private fun decode(mp3: ByteArray): Pcm {
        val bitstream = Bitstream(ByteArrayInputStream(mp3))
        val decoder = Decoder()
        val chunks = ArrayList<ShortArray>()
        var channels = 0
        var sampleRate = 0
        while (true) {
            val header = bitstream.readFrame() ?: break
            val frame = decoder.decodeFrame(header, bitstream) as SampleBuffer
            if (channels == 0) {
                channels = frame.channelCount
                sampleRate = frame.sampleFrequency
            }
            chunks.add(frame.buffer.copyOf(frame.bufferLength))
            bitstream.closeFrame()
        }
        bitstream.close()
        require(channels > 0) { "not a decodable mp3" }
        val total = chunks.sumOf { it.size }
        val samples = ShortArray(total)
        var offset = 0
        for (chunk in chunks) {
            chunk.copyInto(samples, destinationOffset = offset)
            offset += chunk.size
        }
        return Pcm(samples = samples, channels = channels, sampleRate = sampleRate)
    }

    private fun wav(pcm: Pcm, fromFrame: Int, toFrame: Int): ByteArray {
        val frameCount = (toFrame - fromFrame).coerceAtLeast(0)
        val bytes = ByteArray(frameCount * pcm.channels * 2)
        var i = 0
        for (frame in fromFrame until toFrame) {
            for (channel in 0 until pcm.channels) {
                val sample = pcm.samples[frame * pcm.channels + channel].toInt()
                bytes[i++] = (sample and 0xff).toByte()
                bytes[i++] = ((sample shr 8) and 0xff).toByte()
            }
        }
        val format = AudioFormat(pcm.sampleRate.toFloat(), 16, pcm.channels, true, false)
        val out = ByteArrayOutputStream()
        AudioInputStream(ByteArrayInputStream(bytes), format, frameCount.toLong()).use { stream ->
            AudioSystem.write(stream, javax.sound.sampled.AudioFileFormat.Type.WAVE, out)
        }
        return out.toByteArray()
    }
}
```

*(JLayer-API-Namen (`channelCount`/`sampleFrequency` vs. `getChannelCount()`…) beim ersten Kompilieren gegen das Artefakt prüfen — Kotlin mappt die Getter automatisch.)*

- [ ] **Step 5: Grün** — `./mvnw test -Dtest=SnippetCutterTest`

- [ ] **Step 6: Commit** — `feat(songsnippet): pure-JVM snippet pipeline — JLayer decode, prefix cuts, WAV out`

---

### Task 8: `songsnippet.round_audio` — Migration, Entity, Store

**Files:**
- Create: `core/src/main/resources/db/migration/songsnippet/V1__create_round_audio.sql`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/songsnippet/internal/RoundAudio.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/songsnippet/internal/RoundAudioRepository.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/songsnippet/SongSnippetAudioStore.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/songsnippet/SongSnippetAudioStoreTest.kt`

**Interfaces:**
- Produces (exposed): `SongSnippetAudioStore.store(roundGameId: UUID, key: Int, mediaType: String, bytes: ByteArray)` (idempotent), `find(roundGameId: UUID, key: Int): AudioClip?`, `release(roundGameIds: List<UUID>): Int`

- [ ] **Step 1: Migration**

```sql
-- V1__create_round_audio.sql
CREATE TABLE songsnippet.round_audio (
    id            UUID  PRIMARY KEY DEFAULT uuidv7(),
    -- Soft reference into game.round_games — deliberately NO foreign key: the code arrow points
    -- game -> songsnippet (the adapter lives in game.internal), so Modulith migrates this schema
    -- BEFORE game's, and a cross-schema FK against the code arrow cannot be created on a fresh
    -- database. The plugin pattern: host code calls plugin, plugin data hangs off host data.
    -- Lifecycle is owned by releaseAssets (announce-time cleanup) instead.
    round_game_id UUID  NOT NULL,
    stage         INT   NOT NULL,
    media_type    TEXT  NOT NULL,
    bytes         BYTEA NOT NULL,
    UNIQUE (round_game_id, stage)
);
```

*(Vorher prüfen, wie andere Module ihr Schema anlegen: `grep -rn "CREATE SCHEMA" core/src/main/resources/db/migration/` — falls `game`/`iam` ihr Schema explizit anlegen, hier genauso eine `CREATE SCHEMA IF NOT EXISTS songsnippet;`-Zeile voranstellen; falls die Modulith-Flyway-Strategie Schemata selbst anlegt, weglassen.)*

- [ ] **Step 2: Fallenden Test schreiben** (`@SpringBootTest` + `@Import(TestcontainersConfiguration::class)` + `@Transactional`, Muster `RoundPlayRepositoryTest`):

```kotlin
@Test
fun `store is idempotent - the announce race may run the hook twice`() {
    val roundGameId = UUID.randomUUID()
    store.store(roundGameId = roundGameId, key = 0, mediaType = "audio/wav", bytes = byteArrayOf(1))
    store.store(roundGameId = roundGameId, key = 0, mediaType = "audio/wav", bytes = byteArrayOf(2))
    store.find(roundGameId = roundGameId, key = 0)!!.bytes shouldBe byteArrayOf(1)
}

@Test
fun `find answers null for a key never stored`() {
    store.find(roundGameId = UUID.randomUUID(), key = 3).shouldBeNull()
}

@Test
fun `release deletes every row of the given rounds`() {
    val a = UUID.randomUUID(); val b = UUID.randomUUID(); val keep = UUID.randomUUID()
    listOf(a, b, keep).forEach {
        store.store(roundGameId = it, key = 0, mediaType = "audio/wav", bytes = byteArrayOf(0))
    }
    store.release(roundGameIds = listOf(a, b)) shouldBe 2
    store.find(roundGameId = a, key = 0).shouldBeNull()
    store.find(roundGameId = keep, key = 0).shouldNotBeNull()
}
```

*(`round_game_id` ist bewusst ein freies UUID — genau das erlaubt der fehlende FK, und der Test dokumentiert es.)*

- [ ] **Step 3: Implementieren**

`RoundAudio.kt` (internal):

```kotlin
package org.unividuell.countdown.core.songsnippet.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.util.UUID

/** Plain class: ByteArray equality is identity, and nothing compares audio rows. */
@Table(schema = "songsnippet", name = "round_audio")
class RoundAudio(
    @Id
    val id: UUID? = null,
    val roundGameId: UUID,
    val stage: Int,
    val mediaType: String,
    val bytes: ByteArray,
)
```

`RoundAudioRepository.kt` (internal):

```kotlin
package org.unividuell.countdown.core.songsnippet.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import java.util.UUID

interface RoundAudioRepository : CrudRepository<RoundAudio, UUID> {

    fun findByRoundGameIdAndStage(roundGameId: UUID, stage: Int): RoundAudio?

    /** First writer wins, the loser is a no-op — the materialised hook may run twice on a race. */
    @Modifying
    @Query(
        """
        INSERT INTO songsnippet.round_audio (round_game_id, stage, media_type, bytes)
        VALUES (:roundGameId, :stage, :mediaType, :bytes)
        ON CONFLICT (round_game_id, stage) DO NOTHING
        """,
    )
    fun insertIfAbsent(roundGameId: UUID, stage: Int, mediaType: String, bytes: ByteArray): Int

    @Modifying
    @Query("DELETE FROM songsnippet.round_audio WHERE round_game_id IN (:roundGameIds)")
    fun deleteForRounds(roundGameIds: Collection<UUID>): Int
}
```

`SongSnippetAudioStore.kt` (exposed):

```kotlin
package org.unividuell.countdown.core.songsnippet

import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.songsnippet.internal.RoundAudio
import org.unividuell.countdown.core.songsnippet.internal.RoundAudioRepository
import java.util.UUID

/** The round-audio cache: written once at materialisation, read per stage, deleted with the round. */
@Component
class SongSnippetAudioStore(private val repository: RoundAudioRepository) {

    @Transactional
    fun store(roundGameId: UUID, key: Int, mediaType: String, bytes: ByteArray) {
        repository.insertIfAbsent(roundGameId = roundGameId, stage = key, mediaType = mediaType, bytes = bytes)
    }

    @Transactional(readOnly = true)
    fun find(roundGameId: UUID, key: Int): AudioClip? =
        repository.findByRoundGameIdAndStage(roundGameId = roundGameId, stage = key)
            ?.let { AudioClip(mediaType = it.mediaType, bytes = it.bytes) }

    @Transactional
    fun release(roundGameIds: List<UUID>): Int = repository.deleteForRounds(roundGameIds)
}
```

- [ ] **Step 4: Grün** — `./mvnw test -Dtest=SongSnippetAudioStoreTest` (bei „migration didn't apply“: `./mvnw clean`, stale `application-modules.json`)

- [ ] **Step 5: Commit** — `feat(songsnippet): round audio cache table and store, deliberately without a cross-schema FK`

---

### Task 9: Der Adapter — `SongSnippetGameType` in `game.internal`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/SongSnippetGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/SongSnippetGameTypeTest.kt`

**Interfaces:**
- Consumes: Task 2 (Contract), Task 6 (`SongCatalog`, `PreviewSource`), Task 7 (`SnippetCutter`, `SongSnippetStages`), Task 8 (`SongSnippetAudioStore`)
- Produces: Game-ID `song-snippet`, Anzeigename `Anspielung`; `SongSnippetParams(trackId, artist, title, coverUrl, link)`; `present()` = `{stageDurationsSeconds}`; `solution()` = `{artist, title, coverUrl, link}`; Guess-Wire `{trackId?, artist?, title?}`

- [ ] **Step 1: Fallenden Test schreiben** — Muster `GuessHueGameTypeTest`, aber ohne Boot-Kontext (der Adapter hat nur Konstruktor-Abhängigkeiten → plain Unit-Test mit Stubs):

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.SongSnippetGameType
import org.unividuell.countdown.core.game.internal.SongSnippetParams
import org.unividuell.countdown.core.rng.SeededRandom
import org.unividuell.countdown.core.songsnippet.AudioClip
import org.unividuell.countdown.core.songsnippet.CatalogTrack
import org.unividuell.countdown.core.songsnippet.PreviewSource
import org.unividuell.countdown.core.songsnippet.ResolvedTrack
import org.unividuell.countdown.core.songsnippet.SongCatalog
import org.unividuell.countdown.core.songsnippet.SongSnippetAudioStore
import org.unividuell.countdown.core.songsnippet.internal.SnippetCutter
import io.mockk.every
import io.mockk.mockk
import tools.jackson.databind.json.JsonMapper

class SongSnippetGameTypeTest {

    private val mapper = JsonMapper.builder().build()

    /** Real captured shapes: title is title_short, link is the permanent web URL. */
    private fun track(id: Long, artist: String, title: String) = CatalogTrack(
        trackId = id, artist = artist, title = title,
        coverUrl = "https://cdn.example/cover.jpg", link = "https://www.deezer.com/track/$id",
    )

    private val pool = listOf(
        track(id = 426703682L, artist = "Eagles", title = "Hotel California"),
        track(id = 1L, artist = "Juli", title = "Perfekte Welle"),
        track(id = 2L, artist = "Peter Fox", title = "Schüttel deinen Speck"),
    )

    private val catalog = mockk<SongCatalog> { every { poolTracks() } returns pool }
    private val game = SongSnippetGameType(
        catalog = catalog,
        previews = mockk<PreviewSource>(),
        cutter = mockk<SnippetCutter>(),
        audio = mockk<SongSnippetAudioStore>(),
        mapper = mapper,
    )

    private fun draw(previous: List<SongSnippetParams> = emptyList()) = game.draw(
        random = GameRandom(
            solution = SeededRandom.fromSeed(4711),
            presentation = SeededRandom.fromSeed(0x1234),
        ),
        context = RoundContext(
            roundNumber = 12,
            phase = Phase.ONE,
            previousParams = previous.map { mapper.valueToTree(it) },
        ),
    )

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "song-snippet"
        game.displayName shouldBe "Anspielung"
    }

    @Test
    fun `the draw avoids every track this edition already played`() {
        val first = draw()
        val second = draw(previous = listOf(first))
        second.trackId shouldBe draw(previous = listOf(first)).trackId // deterministic
        (second.trackId == first.trackId) shouldBe false
    }

    @Test
    fun `an exhausted pool allows repeats instead of failing the round`() {
        val all = pool.map { SongSnippetParams(trackId = it.trackId, artist = it.artist, title = it.title, coverUrl = it.coverUrl, link = it.link) }
        draw(previous = all) // must not throw
    }

    @Test
    fun `the payload carries exactly the stage durations and nothing else`() {
        val json = mapper.writeValueAsString(game.present(draw()))
        mapper.readTree(json).propertyNames().toSet() shouldBe setOf("stageDurationsSeconds")
    }

    @Test
    fun `the solution carries exactly the four reveal fields`() {
        val json = mapper.writeValueAsString(game.solution(draw()))
        mapper.readTree(json).propertyNames().toSet() shouldBe
            setOf("artist", "title", "coverUrl", "link")
    }

    private fun judge(params: SongSnippetParams, guess: String) =
        game.judge(params = params, guess = mapper.readTree(guess))

    @Test
    fun `a matching track id is correct`() {
        val params = draw()
        judge(params, """{"trackId":${params.trackId}}""").qualifies shouldBe true
    }

    @Test
    fun `normalized artist and title match even when the case and spacing drift`() {
        val params = SongSnippetParams(trackId = 9, artist = "Eagles", title = "Hotel California", coverUrl = null, link = "x")
        judge(params, """{"artist":"  eagles ","title":"hotel   california"}""").qualifies shouldBe true
        judge(params, """{"artist":"Eagles","title":"Hotel Kalifornien"}""").qualifies shouldBe false
    }

    @Test
    fun `deviation is zero - the framework owns the stage`() {
        val params = draw()
        judge(params, """{"trackId":${params.trackId}}""").deviation shouldBe 0.0
    }

    @Test
    fun `a guess with neither id nor pair is rejected before anything is written`() {
        shouldThrow<InvalidGuessException> { judge(draw(), """{}""") }
        shouldThrow<InvalidGuessException> { judge(draw(), """{"artist":"Eagles"}""") }
    }

    @Test
    fun `five stages, no deliberate reveal`() {
        game.stages(draw()) shouldBe 5
        game.requiresReveal(draw()) shouldBe false
    }
}
```

- [ ] **Step 2: Test fällt**, dann implementieren:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.RoundAsset
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.songsnippet.PreviewSource
import org.unividuell.countdown.core.songsnippet.SongCatalog
import org.unividuell.countdown.core.songsnippet.SongSnippetAudioStore
import org.unividuell.countdown.core.songsnippet.SongSnippetStages
import org.unividuell.countdown.core.songsnippet.internal.SnippetCutter
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.util.Locale
import java.util.UUID

/** The frozen round. Artist and title double as the answer; the track id is its permanent handle. */
data class SongSnippetParams(
    val trackId: Long,
    val artist: String,
    val title: String,
    val coverUrl: String?,
    val link: String,
)

/** All the player needs before guessing: how long each stage is. Zero track information. */
data class SongSnippetPayload(val stageDurationsSeconds: List<Double>) : GamePayload

/** What the player is told about their guess — the stage advance itself rides on the response. */
data class SongSnippetOutcome(val correct: Boolean) : GameOutcome

data class SongSnippetSolution(
    val artist: String,
    val title: String,
    val coverUrl: String?,
    val link: String,
) : GameSolution

/** The wire shape of a guess, bound leniently — judge() decides what is enough. */
private data class SongSnippetGuess(
    val trackId: Long? = null,
    val artist: String? = null,
    val title: String? = null,
)

/**
 * Song Snippet as an announceable game. The adapter lives here and `songsnippet` knows nothing
 * about it — the same reasoning as GuessHueGameType, and this round of contract changes is
 * exactly the case that reasoning exists for.
 */
@Component
class SongSnippetGameType(
    private val catalog: SongCatalog,
    private val previews: PreviewSource,
    private val cutter: SnippetCutter,
    private val audio: SongSnippetAudioStore,
    private val mapper: ObjectMapper,
) : GameType<SongSnippetParams> {

    override val id = "song-snippet"
    override val displayName = "Anspielung"
    override val paramsType = SongSnippetParams::class.java

    override fun draw(random: GameRandom, context: RoundContext): SongSnippetParams {
        val pool = catalog.poolTracks()
        require(pool.isNotEmpty()) { "song-snippet pool is empty - check app.song-snippet.playlist-ids" }
        val used = context.previousParams.mapNotNull { it.get("trackId")?.asLong() }.toSet()
        val fresh = pool.filterNot { it.trackId in used }
        // An exhausted pool allows repeats rather than failing the round.
        val track = random.solution.pick(fresh.ifEmpty { pool })
        return SongSnippetParams(
            trackId = track.trackId,
            artist = track.artist,
            title = track.title,
            coverUrl = track.coverUrl,
            link = track.link,
        )
    }

    override fun present(params: SongSnippetParams) =
        SongSnippetPayload(stageDurationsSeconds = SongSnippetStages.DURATIONS_SECONDS)

    override fun requiresReveal(params: SongSnippetParams) = false

    override fun stages(params: SongSnippetParams) = SongSnippetStages.DURATIONS_SECONDS.size

    override fun judge(params: SongSnippetParams, guess: JsonNode): Judgement {
        val g = try {
            mapper.treeToValue(guess, SongSnippetGuess::class.java)
        } catch (e: Exception) {
            throw InvalidGuessException("guess must carry trackId or artist+title")
        }
        val hasPair = g.artist != null && g.title != null
        if (g.trackId == null && !hasPair) {
            throw InvalidGuessException("guess must carry trackId or artist+title")
        }
        val correct = (g.trackId != null && g.trackId == params.trackId) ||
            (hasPair &&
                normalized(g.artist) == normalized(params.artist) &&
                normalized(g.title) == normalized(params.title))
        return Judgement(
            qualifies = correct,
            // The distance of a staged game is the stage — framework state, overridden there.
            deviation = 0.0,
            outcome = SongSnippetOutcome(correct = correct),
        )
    }

    override fun solution(params: SongSnippetParams) = SongSnippetSolution(
        artist = params.artist,
        title = params.title,
        coverUrl = params.coverUrl,
        link = params.link,
    )

    override fun produceAssets(params: SongSnippetParams): Map<Int, RoundAsset> {
        val resolved = checkNotNull(catalog.track(params.trackId)) {
            "track ${params.trackId} no longer resolvable for audio"
        }
        val mp3 = previews.download(resolved.previewUrl)
        return cutter.ladder(mp3).mapValues { (_, clip) ->
            RoundAsset(mediaType = clip.mediaType, bytes = clip.bytes)
        }
    }

    override fun materialised(params: SongSnippetParams, roundGameId: UUID) {
        for ((key, asset) in produceAssets(params)) {
            audio.store(roundGameId = roundGameId, key = key, mediaType = asset.mediaType, bytes = asset.bytes)
        }
    }

    override fun asset(params: SongSnippetParams, roundGameId: UUID, key: Int): RoundAsset? =
        audio.find(roundGameId = roundGameId, key = key)
            ?.let { RoundAsset(mediaType = it.mediaType, bytes = it.bytes) }

    override fun releaseAssets(roundGameIds: List<UUID>) {
        audio.release(roundGameIds)
    }
}

/** Lowercase, trimmed, whitespace collapsed — title_short is already version-free. */
private fun normalized(value: String?): String? =
    value?.lowercase(Locale.ROOT)?.trim()?.replace(Regex("\\s+"), " ")
```

- [ ] **Step 3: Grün + Draw-Unabhängigkeit** — `./mvnw test -Dtest=SongSnippetGameTypeTest`. Zusätzlich einen Test nach `GuessHueDrawTest`-Muster ergänzen: Payload bleibt identisch, wenn nur der Solution-Stream variiert (trivial — Payload ist konstant — der Test dokumentiert es):

```kotlin
@Test
fun `nothing the player sees moves when only the secret stream changes`() {
    val payloads = (1..10).map { seed ->
        game.present(game.draw(
            random = GameRandom(solution = SeededRandom.fromSeed(seed), presentation = SeededRandom.fromSeed(7)),
            context = RoundContext(roundNumber = 12, phase = Phase.ONE),
        ))
    }
    payloads.distinct().size shouldBe 1
}
```

- [ ] **Step 4: Volle Suite** — `./mvnw test` (Selektion kennt jetzt zwei echte Spiele; falls ein bestehender Test implizit „guess-hue ist das einzige Spiel“ annimmt, den Test auf explizites `store.announce` umstellen — dokumentiertes Muster aus `PlayServiceStrictRevealTest`)

- [ ] **Step 5: Commit** — `feat(game): song-snippet adapter — draw, judge, staged assets ("Anspielung")`

---

### Task 10: Konfiguration + Boot-Integration

**Files:**
- Modify: `core/src/main/resources/application.yaml`
- Modify: `core/src/test/resources/application.yaml` (falls vorhanden: Pool-IDs leer lassen — Tests stubben)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/songsnippet/SongSnippetBootTest.kt`

- [ ] **Step 1: Default-Pool konfigurieren** — in `application.yaml` unter `app:` (nach `guess-hue:`):

```yaml
  song-snippet:
    # Public Deezer editorial playlists the pool merges („Deutschland, deine Hits“ 00er + 10er).
    # A public catalogue, not game content — no sops, unlike guess-hue.
    playlist-ids: 10396822102,10396828062
```

- [ ] **Step 2: Boot-Smoke-Test** — Kontext lädt mit beiden Spielen im Katalog, ohne Netz:

```kotlin
@Import(TestcontainersConfiguration::class)
@SpringBootTest
class SongSnippetBootTest(@Autowired val catalog: GameCatalog) {

    @Test
    fun `the catalogue carries both real games, sorted`() {
        catalog.ids() shouldBe listOf("guess-hue", "song-snippet")
    }
}
```

*(Der Kontext ruft kein Deezer: `poolTracks()` läuft erst beim Draw. Falls ein bestehender Integrationstest durch die Selektion zufällig `song-snippet` zieht und dann in `materialised` Netz bräuchte: für den Test-Scope eine `@TestConfiguration` mit Stub-`SongCatalog`/`PreviewSource`-`@Primary`-Beans in `TestcontainersConfiguration`-Nähe ergänzen — Sample-Pool aus drei `CatalogTrack`s, `PreviewSource` liefert die Fixture-MP3. Das hält die geltende Regel: kein Test ruft Deezer.)*

- [ ] **Step 3: Volle Suite + Modularity** — `./mvnw test`

- [ ] **Step 4: Commit** — `feat(songsnippet): default editorial pool configuration`

---

### Task 11: Labor — Stufen, Assets, Skip/Aufgeben

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabRoundStore.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabController.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabDtos.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabStagedFlowTest.kt`

**Interfaces:**
- Consumes: Task 2 (`guessActionFor`, `produceAssets`, `stages`), Task 3 (Semantik), Task 4 (Gate-Regeln)
- Produces: `LabRoundResponse.myStage: Int`; `LabEntryDto.stage: Int`; Endpoints `POST /api/lab/{slug}/{game}/skip?seed=&phase=` (Body `{"fromStage": n}`), `POST .../give-up`, `GET .../assets/{key}?seed=&phase=` → Bytes

- [ ] **Step 1: Fallenden Test** — Muster `LabServiceTest`/`LabControllerTest` (Harness übernehmen); Kernfälle:

```kotlin
@Test
fun `the lab replays the staged flow - wrong below the top advances, stage rides the response`() {
    // song-snippet-Runde öffnen (Stub-SongCatalog aus Task 10 liefert den Pool)
    val opened = service.open(slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
        userId = tester, isSuperAdmin = false)
    opened.myStage shouldBe 0
    val afterWrong = service.guess(..., guess = mapper.readTree("""{"artist":"x","title":"y"}"""))
    afterWrong.myStage shouldBe 1
    afterWrong.me.shouldBeNull()
}

@Test
fun `lab assets follow the same gate - unlocked stages yes, above no, solution behind the spent guess`() {
    service.open(...)
    service.asset(..., key = 0).mediaType shouldBe "audio/wav"
    shouldThrow<LabAssetForbiddenException> { service.asset(..., key = 3) }
    service.giveUp(...)
    service.asset(..., key = 99).mediaType shouldBe "audio/mpeg"
}
```

*(Asset-Bytes kommen aus `handle.produceAssets` gegen den Stub-`PreviewSource` mit der Fixture-MP3 — einmal pro Lab-Runde, danach aus dem In-Memory-Eintrag.)*

- [ ] **Step 2: Implementieren**

`LabRoundStore.Round` wächst um:

```kotlin
        /** Per-tester staged progress — the lab's stand-in for round_plays.stage. */
        val stages = ConcurrentHashMap<UUID, Int>()
        /** Produced once per lab round, lazily — one ladder per (community, game), self-limiting. */
        @Volatile var assets: Map<Int, RoundAsset>? = null
```

Neue Store-Methoden (alle unter `synchronized(stored)`, wie die bestehenden):

```kotlin
    fun stageOf(communityId: UUID, gameId: String, round: LabRound, userId: UUID): Int
    /** true when the expected stage still held — the same zero-rows idiom, in memory. */
    fun advanceStage(communityId: UUID, gameId: String, round: LabRound, userId: UUID, expected: Int): Boolean
    /** Lazily produced, then cached on the round. [produce] runs outside any DB — pure lab memory. */
    fun assetsOf(communityId: UUID, gameId: String, round: LabRound, produce: () -> Map<Int, RoundAsset>): Map<Int, RoundAsset>
```

`LabEntry`/`LabEntryDto` bekommen `val stage: Int` (beim `record` aus `stages[userId] ?: 0` befüllt). `LabRoundResponse` bekommt `val myStage: Int` (aus `stages[me] ?: 0`).

`LabService`:
- `guess(...)`: vor dem `record` die Flow-Entscheidung:

```kotlin
        val stage = store.stageOf(communityId = communityId, gameId = gameId, round = playing, userId = userId)
        val judgement = handle.judge(params = playing.params, guess = guess)
        val stages = handle.stages(playing.params)
        if (guessActionFor(rule = playing.award.rule, qualifies = judgement.qualifies,
                stage = stage, stages = stages) == GuessAction.ADVANCE_STAGE) {
            store.advanceStage(communityId = communityId, gameId = gameId, round = playing,
                userId = userId, expected = stage)
            return respond(communityId = communityId, handle = handle,
                snapshot = store.open(communityId = communityId, gameId = gameId, round = playing), me = userId)
        }
        val adjusted = if (stages > 1) judgement.copy(deviation = stage.toDouble()) else judgement
        // ... record(judgement = adjusted) wie bisher
```

- `skip(...)`: wie `guess`, nur `advanceStage` mit `expected = fromStage` und Guard `fromStage < stages - 1`, sonst `AlreadyGuessedException`-analoge `LabStageMovedOnException` (→ 409 im `LabExceptionHandler`).
- `giveUp(...)`: `store.record(...)` mit `guess = mapper.nullNode()` (bzw. `NullNode.instance`), `judgement = Judgement(qualifies = false, deviation = stage.toDouble(), outcome = null)`.
- `asset(...)`: Gate identisch zur echten Runde (Stufe des Testers / `99` hinter eigenem Entry), Bytes aus `store.assetsOf(produce = { handle.produceAssets(playing.params) })`, sonst `LabAssetForbiddenException` (403) / 404.

`LabController`: drei Endpoints nach dem Muster der bestehenden (seed+phase als Params, `@RequestBody` für skip).

- [ ] **Step 3: Grün** — `./mvnw test -Dtest='Lab*'`

- [ ] **Step 4: Commit** — `feat(gamelab): staged flow, asset gate and per-tester stage in the lab`

---

### Task 12: Frontend — Typen, API, `useRound`, `RoundCard`-Vertrag

**Files:**
- Modify: `webapp-vue/src/api/types.ts`
- Modify: `webapp-vue/src/api/rounds.ts`
- Create: `webapp-vue/src/api/assets.ts`
- Create: `webapp-vue/src/games/songsnippet/api.ts`
- Modify: `webapp-vue/src/rounds/useRound.ts`
- Modify: `webapp-vue/src/rounds/RoundCard.vue`
- Modify: `webapp-vue/src/pages/c/[slug]/index.vue`
- Modify: `webapp-vue/src/games/GameEntry.ts`

**Interfaces:**
- Produces:
  - `OtherPlayDto.stage: number` (damit auch `MyPlayDto`, das erbt)
  - `skipStage(slug, roundNumber, fromStage)`, `giveUpRound(slug, roundNumber)`, `roundAssetUrl(slug, roundNumber, key): string`
  - `fetchAssetBlob(url: string): Promise<Blob>`
  - `searchSongs(q, signal?): Promise<SongSuggestion[]>` mit `SongSuggestion{trackId, artist, title, coverUrl}`; `resolveTrack(trackId): Promise<TrackPreview>` mit `TrackPreview{…, previewUrl}`
  - `useRound` zusätzlich: `skip(fromStage: number): Promise<void>`, `giveUp(): Promise<void>`
  - `RoundCard`-Props zusätzlich: `skip`, `giveUp` (Callbacks), `assetUrl: (key: number) => string`; ans Game-Component durchgereicht: `:stage`, `:asset-url`, `@skip`, `@give-up`
  - `GameEntry.stage: number`

- [ ] **Step 1: Typen** — `types.ts`: in `OtherPlayDto` nach `avatar`:

```ts
  /** Final stage of a finished play — an "other" row is only ever listed once its player is done. */
  stage: number
```

`GameEntry.ts`: `stage: number` ergänzen (jede Welt trägt es jetzt: `MyPlayDto`, `OtherPlayDto`, `LabEntryDto`).

- [ ] **Step 2: API-Funktionen**

`rounds.ts` anfügen:

```ts
/** [fromStage] is the stage the caller believes it is on — the server 409s a mismatch. */
export const skipStage = (slug: string, roundNumber: number, fromStage: number) =>
  apiFetch<RoundResponse>(roundUrl(slug, '/skip'), {
    method: 'POST',
    body: JSON.stringify({ roundNumber, fromStage }),
  })

export const giveUpRound = (slug: string, roundNumber: number) =>
  apiFetch<RoundResponse>(roundUrl(slug, '/give-up'), {
    method: 'POST',
    body: JSON.stringify({ roundNumber }),
  })

/** Round number and key ride in the URL so each pair is its own privately cacheable resource. */
export const roundAssetUrl = (slug: string, roundNumber: number, key: number): string =>
  roundUrl(slug, `/assets/${roundNumber}/${key}`)
```

`api/assets.ts` (neu):

```ts
/**
 * Binary sidecar to `apiFetch`, which is JSON-only by contract: same credentials, no CSRF needed
 * (GET), errors as plain exceptions the caller turns into UI state.
 */
export async function fetchAssetBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`asset ${url} -> ${res.status}`)
  return res.blob()
}
```

`games/songsnippet/api.ts` (neu):

```ts
import { apiFetch } from '@/api/client'

export interface SongSuggestion {
  trackId: number
  artist: string
  title: string
  coverUrl: string | null
}

export interface TrackPreview extends SongSuggestion {
  link: string
  previewUrl: string
}

export const searchSongs = (q: string, signal?: AbortSignal) =>
  apiFetch<SongSuggestion[]>(`/api/song-snippet/search?q=${encodeURIComponent(q)}`, { signal })

/** Fresh preview URL by permanent track id — the reveal plays wrong guesses straight from Deezer. */
export const resolveTrack = (trackId: number) =>
  apiFetch<TrackPreview>(`/api/song-snippet/tracks/${trackId}`)
```

*(Falls `ApiFetchOptions` kein `signal` kennt: dort ergänzen — `client.ts` reicht es an `fetch` durch und kombiniert es mit dem Timeout-Signal via `AbortSignal.any`.)*

- [ ] **Step 3: `useRound` erweitern** — nach `submit`:

```ts
  async function skip(fromStage: number): Promise<void> {
    const number = round.value?.round?.number
    if (number === undefined) return
    await run(async () => {
      round.value = await skipStage(slug, number, fromStage)
    })
  }

  async function giveUp(): Promise<void> {
    const number = round.value?.round?.number
    if (number === undefined) return
    await run(async () => {
      round.value = await giveUpRound(slug, number)
    })
  }
```

Return-Objekt und Rückgabetyp um `skip`, `giveUp` ergänzen.

- [ ] **Step 4: `RoundCard` + Page verdrahten**

`RoundCard.vue`-Props ergänzen:

```ts
  skip: (fromStage: number) => Promise<void>
  giveUp: () => Promise<void>
  assetUrl: (key: number) => string
```

`<component :is>` bekommt zusätzlich:

```
      :stage="round?.me?.stage ?? 0"
      :asset-url="assetUrl"
      @skip="props.skip"
      @give-up="props.giveUp"
```

`pages/c/[slug]/index.vue`: `skip`/`giveUp` aus `useRound` destrukturieren und zusammen mit einem URL-Builder durchreichen:

```ts
const assetUrl = (key: number): string =>
  roundAssetUrl(slug, round.value?.round?.number ?? 0, key)
```

- [ ] **Step 5: Lint + Typecheck** — `pnpm lint && pnpm vue-tsc -b` (Guess Hue ignoriert die neuen Props als Fallthrough — kein Fehler)

- [ ] **Step 6: Commit** — `feat(webapp): staged-round wiring — skip, give-up, asset urls, stage on the entry types`

---

### Task 13: Frontend — Stufenleisten-Arithmetik und Playback

**Files:**
- Create: `webapp-vue/src/games/songsnippet/stagebar.ts`
- Create: `webapp-vue/src/games/songsnippet/usePlayback.ts`
- Test: `webapp-vue/src/games/songsnippet/__tests__/stagebar.test.ts`

**Interfaces:**
- Produces:
  - `barFraction(seconds: number, totalSeconds: number): number` — √-Zeitskala
  - `stageMarks(durations: number[], totalSeconds: number): number[]` — Bruchpositionen der Stufengrenzen
  - `usePlayback(): { positionSeconds: Ref<number>; playing: Ref<boolean>; setSource(url: string): void; restart(): void; pause(): void; dispose(): void }`

- [ ] **Step 1: Fallenden Test schreiben**

```ts
import { describe, expect, it } from 'vitest'
import { barFraction, stageMarks } from '../stagebar'

const DURATIONS = [0.1, 0.5, 2, 8, 15]

describe('stagebar', () => {
  it('maps time to the bar on a sqrt scale - the tiny first stages stay visible', () => {
    expect(barFraction(0, 15)).toBe(0)
    expect(barFraction(15, 15)).toBe(1)
    expect(barFraction(0.1, 15)).toBeCloseTo(Math.sqrt(0.1 / 15), 10)
    expect(barFraction(2, 15)).toBeCloseTo(Math.sqrt(2 / 15), 10)
  })

  it('clamps beyond the ends', () => {
    expect(barFraction(-1, 15)).toBe(0)
    expect(barFraction(20, 15)).toBe(1)
  })

  it('places one mark per stage boundary, on the same scale', () => {
    const marks = stageMarks(DURATIONS, 15)
    expect(marks).toHaveLength(5)
    expect(marks[0]).toBeCloseTo(Math.sqrt(0.1 / 15), 10)
    expect(marks[4]).toBe(1)
  })
})
```

- [ ] **Step 2: Test fällt** (`pnpm vitest run src/games/songsnippet`), dann implementieren:

```ts
/**
 * The bar's time scale is sqrt, not linear: linearly, the 0.1s stage would be a 0.7% sliver.
 * sqrt keeps the short stages visible (0.1s ≈ 8% of the bar) while staying monotone and exact at
 * every boundary. Display-only — nothing here has a Kotlin twin, so no golden vectors needed.
 */
export function barFraction(seconds: number, totalSeconds: number): number {
  if (totalSeconds <= 0) return 0
  const clamped = Math.min(Math.max(seconds, 0), totalSeconds)
  return Math.sqrt(clamped / totalSeconds)
}

/** One mark per stage boundary, as fractions of the bar width. */
export function stageMarks(durations: number[], totalSeconds: number): number[] {
  return durations.map((d) => barFraction(d, totalSeconds))
}
```

`usePlayback.ts`:

```ts
import { onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'

/**
 * One audio element, owned here. `restart()` is the play button's whole semantics: always from the
 * start, never a toggle — pausing is a separate, smaller control. Position is sampled with
 * requestAnimationFrame while playing, because `timeupdate` (~4 Hz) is too coarse for a progress
 * bar over a 0.1s clip.
 */
export function usePlayback(): {
  positionSeconds: Ref<number>
  playing: Ref<boolean>
  setSource: (url: string) => void
  restart: () => void
  pause: () => void
  dispose: () => void
} {
  const audio = new Audio()
  audio.preload = 'auto'
  const positionSeconds = ref(0)
  const playing = ref(false)
  let raf = 0

  const sample = (): void => {
    positionSeconds.value = audio.currentTime
    if (!audio.paused) raf = requestAnimationFrame(sample)
  }
  audio.addEventListener('play', () => {
    playing.value = true
    raf = requestAnimationFrame(sample)
  })
  const stop = (): void => {
    playing.value = false
    cancelAnimationFrame(raf)
    positionSeconds.value = audio.currentTime
  }
  audio.addEventListener('pause', stop)
  audio.addEventListener('ended', stop)

  function setSource(url: string): void {
    audio.pause()
    audio.src = url
    audio.load()
    positionSeconds.value = 0
  }
  function restart(): void {
    audio.currentTime = 0
    void audio.play().catch(() => {
      // Autoplay policy or a torn-down element - the button stays pressable, nothing to surface.
    })
  }
  function pause(): void {
    audio.pause()
  }
  function dispose(): void {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
  onUnmounted(dispose)

  return { positionSeconds, playing, setSource, restart, pause, dispose }
}
```

- [ ] **Step 3: Grün** — `pnpm vitest run src/games/songsnippet`

- [ ] **Step 4: Commit** — `feat(webapp): song-snippet stage bar arithmetic and playback composable`

---

### Task 14: Frontend — Spielbrett (Board, Suche, Leiste) + Registry

**Files:**
- Create: `webapp-vue/src/games/songsnippet/types.ts`
- Create: `webapp-vue/src/games/songsnippet/StageBar.vue`
- Create: `webapp-vue/src/games/songsnippet/SongSearchBox.vue`
- Create: `webapp-vue/src/games/songsnippet/SongSnippetBoard.vue`
- Create: `webapp-vue/src/games/songsnippet/SongSnippetGame.vue`
- Modify: `webapp-vue/src/games/registry.ts`

**Interfaces:**
- Consumes: Task 12 (Props/Emits-Vertrag, APIs), Task 13 (stagebar, usePlayback)
- Produces: Registry-Eintrag `'song-snippet': SongSnippetGame`; `types.ts`:

```ts
export interface SongSnippetPayload {
  stageDurationsSeconds: number[]
}
export interface SongSnippetSolution {
  artist: string
  title: string
  coverUrl: string | null
  link: string
}
export interface SongSnippetGuessWire {
  trackId: number
  artist: string
  title: string
}
export function isSongSnippetPayload(value: unknown): value is SongSnippetPayload {
  return (
    typeof value === 'object' && value !== null &&
    Array.isArray((value as SongSnippetPayload).stageDurationsSeconds)
  )
}
```

- [ ] **Step 1: `StageBar.vue`** — die Leiste mit den drei Zuständen (leicht gefüllt = freigeschaltet, Striche = Grenzen, volle Füllung = Playback-Position):

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { barFraction, stageMarks } from './stagebar'

const props = defineProps<{
  durations: number[]
  totalSeconds: number
  unlockedSeconds: number
  positionSeconds: number
}>()

const unlockedPct = computed(() => barFraction(props.unlockedSeconds, props.totalSeconds) * 100)
const playheadPct = computed(
  () => Math.min(barFraction(props.positionSeconds, props.totalSeconds) * 100, unlockedPct.value),
)
const marks = computed(() => stageMarks(props.durations, props.totalSeconds))
</script>

<template>
  <div class="relative h-3 w-full overflow-hidden rounded-full bg-neutral-200" data-test="stage-bar">
    <div
      class="absolute inset-y-0 left-0 bg-amber-200"
      data-test="stage-unlocked"
      :style="{ width: `${unlockedPct}%` }"
    />
    <div
      class="absolute inset-y-0 left-0 bg-amber-400"
      data-test="stage-playhead"
      :style="{ width: `${playheadPct}%` }"
    />
    <div
      v-for="(mark, i) in marks"
      :key="i"
      class="absolute inset-y-0 w-px bg-neutral-400"
      :style="{ left: `${mark * 100}%` }"
    />
  </div>
</template>
```

- [ ] **Step 2: `SongSearchBox.vue`** — Combobox nach dem `useProfileDraft`-Muster (watchDebounced + Generationszähler + AbortController):

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { searchSongs } from './api'
import type { SongSuggestion } from './api'

const SEARCH_DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 3

defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ select: [SongSuggestion] }>()

const query = ref('')
const suggestions = ref<SongSuggestion[]>([])
const selected = ref<SongSuggestion | null>(null)

/** Only the newest answer may win — the routeData/useProfileDraft guard. */
let generation = 0
let abort: AbortController | null = null

watchDebounced(
  query,
  async (q) => {
    selected.value = null
    abort?.abort()
    if (q.trim().length < MIN_QUERY_LENGTH) {
      suggestions.value = []
      return
    }
    const mine = ++generation
    abort = new AbortController()
    try {
      const hits = await searchSongs(q.trim(), abort.signal)
      if (mine === generation) suggestions.value = hits
    } catch {
      if (mine === generation) suggestions.value = []
    }
  },
  { debounce: SEARCH_DEBOUNCE_MS },
)

function choose(hit: SongSuggestion): void {
  selected.value = hit
  query.value = `${hit.artist} — ${hit.title}`
  suggestions.value = []
  emit('select', hit)
}
</script>

<template>
  <div class="relative">
    <input
      v-model="query"
      type="text"
      data-test="song-search"
      class="h-11 w-full rounded-full border border-neutral-300 bg-white px-4 text-sm"
      placeholder="Song suchen…"
      :disabled="disabled"
    />
    <ul
      v-if="suggestions.length > 0"
      class="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
      data-test="song-suggestions"
    >
      <li v-for="hit in suggestions" :key="hit.trackId">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50"
          @click="choose(hit)"
        >
          <img v-if="hit.coverUrl" :src="hit.coverUrl" alt="" class="h-8 w-8 rounded" />
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium">{{ hit.title }}</span>
            <span class="block truncate text-xs text-neutral-500">{{ hit.artist }}</span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
```

- [ ] **Step 3: `SongSnippetBoard.vue`** — Cover-Platzhalter, Leiste, Play-Zeile (Play exakt zentriert, kleiner Pause daneben), Suche + Skip, Guess/Aufgeben:

```vue
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import HoldButton from '@/ui/HoldButton.vue'
import { fetchAssetBlob } from '@/api/assets'
import StageBar from './StageBar.vue'
import SongSearchBox from './SongSearchBox.vue'
import { usePlayback } from './usePlayback'
import type { SongSuggestion } from './api'

const props = defineProps<{
  durations: number[]
  stage: number
  awardRule: AwardRule | null
  disabled: boolean
  assetUrl: (key: number) => string
  notice: string | null
}>()

const emit = defineEmits<{
  guess: [SongSuggestion]
  skip: [number]
  giveUp: []
}>()

const playback = usePlayback()
const picked = ref<SongSuggestion | null>(null)
const loadingStage = ref(false)

const totalSeconds = computed(() => props.durations[props.durations.length - 1] ?? 15)
const unlockedSeconds = computed(() => props.durations[props.stage] ?? 0)
const lastStage = computed(() => props.stage >= props.durations.length - 1)
const phaseTwo = computed(() => props.awardRule === 'CLOSEST_ONLY')
const stageLabel = computed(() => `${String(unlockedSeconds.value).replace('.', ',')}s`)

let objectUrl: string | null = null
watch(
  () => props.stage,
  async (stage) => {
    loadingStage.value = true
    try {
      const blob = await fetchAssetBlob(props.assetUrl(stage))
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
      objectUrl = URL.createObjectURL(blob)
      playback.setSource(objectUrl)
    } catch (err) {
      console.error('[song-snippet] stage audio failed', err)
    } finally {
      loadingStage.value = false
    }
  },
  { immediate: true },
)
onUnmounted(() => {
  if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
})
</script>

<template>
  <div class="flex flex-col gap-5 rounded-xl border border-neutral-200 bg-white p-5">
    <!-- Reserved from the start: the real cover lands in exactly this box after the reveal, so
         the layout never jumps on submitting a guess. -->
    <div
      class="mx-auto flex h-32 w-32 items-center justify-center rounded-xl bg-neutral-100 text-5xl text-neutral-400"
      data-test="cover-placeholder"
    >
      ?
    </div>

    <StageBar
      :durations="durations"
      :total-seconds="totalSeconds"
      :unlocked-seconds="unlockedSeconds"
      :position-seconds="playback.positionSeconds.value"
    />

    <!-- The big play button stays horizontally centered; the smaller pause pays for the
         asymmetry, never the centering. -->
    <div class="grid grid-cols-[1fr_auto_1fr] items-center">
      <span />
      <button
        type="button"
        data-test="play"
        class="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-amber-400 text-3xl text-neutral-900 disabled:opacity-40"
        :disabled="loadingStage"
        aria-label="Von vorn abspielen"
        @click="playback.restart()"
      >
        ▶
      </button>
      <span class="flex items-center gap-3 justify-self-start pl-4">
        <button
          type="button"
          data-test="pause"
          class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-neutral-200 text-sm"
          aria-label="Pause"
          @click="playback.pause()"
        >
          ⏸
        </button>
        <span class="font-mono text-sm text-amber-600" data-test="stage-label">{{ stageLabel }}</span>
      </span>
    </div>

    <p v-if="notice" class="text-center text-sm text-amber-700" data-test="song-notice">{{ notice }}</p>

    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <SongSearchBox :disabled="disabled" @select="picked = $event" />
      </div>
      <div class="flex flex-col items-end">
        <button
          type="button"
          data-test="skip"
          class="h-11 cursor-pointer rounded-full border border-neutral-300 px-4 text-sm disabled:opacity-40"
          :disabled="disabled || lastStage"
          @click="emit('skip', stage)"
        >
          ⏭ Skip
        </button>
        <span class="mt-1 text-xs text-neutral-500">
          {{ phaseTwo ? 'kann den Sieg kosten' : 'kostet nur Ruhm' }}
        </span>
      </div>
    </div>

    <div class="flex flex-col items-center gap-1">
      <HoldButton
        :ready="true"
        :disabled="disabled || picked === null"
        label="Tipp abgeben"
        color="#f59e0b"
        @confirm="picked !== null && emit('guess', picked)"
      />
      <span class="text-xs text-neutral-500">
        {{ phaseTwo ? 'kann die gesamte Runde verbrennen' : 'verbrennt höchstens diese Stufe' }}
      </span>
    </div>

    <div class="flex flex-col items-center gap-1">
      <HoldButton
        :ready="true"
        :disabled="disabled"
        label="Aufgeben"
        color="#a3a3a3"
        @confirm="emit('giveUp')"
      />
    </div>
  </div>
</template>
```

*(`HoldButton`-Props gegen die Komponente prüfen — `ready`/`disabled`/`label`/`color` sind der Stand von heute.)*

- [ ] **Step 4: `SongSnippetGame.vue`** — Narrowing, Board/Reveal-Switch, „Falsch"-Notice bei Stufen-Advance:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import SongSnippetBoard from './SongSnippetBoard.vue'
import SongSnippetReveal from './SongSnippetReveal.vue'
import { isSongSnippetPayload } from './types'
import type { SongSnippetSolution } from './types'
import type { SongSuggestion } from './api'

const props = defineProps<{
  payload: unknown
  outcome: unknown
  myGuess: unknown
  solution: unknown
  entries: GameEntry[]
  mineUserId: string | null
  awardRule: AwardRule | null
  disabled: boolean
  stage?: number
  assetUrl?: (key: number) => string
}>()

const emit = defineEmits<{ guess: [unknown]; skip: [number]; giveUp: [] }>()

const durations = computed(() =>
  isSongSnippetPayload(props.payload) ? props.payload.stageDurationsSeconds : [],
)
const revealed = computed(() => props.solution !== null && props.solution !== undefined)

/** A stage that grew without the play ending is exactly „falsch geraten oder geskippt“. */
const notice = ref<string | null>(null)
watch(
  () => props.stage ?? 0,
  (now, before) => {
    if (now > before && !revealed.value) notice.value = 'Falsch — nächste Stufe frei.'
  },
)

function onGuess(hit: SongSuggestion): void {
  notice.value = null
  emit('guess', { trackId: hit.trackId, artist: hit.artist, title: hit.title })
}
</script>

<template>
  <SongSnippetReveal
    v-if="revealed"
    :solution="solution as SongSnippetSolution"
    :durations="durations"
    :entries="entries"
    :mine-user-id="mineUserId"
    :asset-url="assetUrl"
  />
  <SongSnippetBoard
    v-else
    :durations="durations"
    :stage="stage ?? 0"
    :award-rule="awardRule"
    :disabled="disabled"
    :asset-url="assetUrl ?? (() => '')"
    :notice="notice"
    @guess="onGuess"
    @skip="emit('skip', $event)"
    @give-up="emit('giveUp')"
  />
</template>
```

*(Achtung Emit-Name: `@give-up` im Template ↔ `giveUp` im `defineEmits` — Vue normalisiert; im `RoundCard` konsistent `@give-up` verwenden.)*

- [ ] **Step 5: Registry**

```ts
import SongSnippetGame from './songsnippet/SongSnippetGame.vue'
// …
export const gameComponents: Record<string, Component> = {
  'guess-hue': GuessHueGame,
  'song-snippet': SongSnippetGame,
}
```

- [ ] **Step 6: Lint + Typecheck + Tests** — `pnpm lint && pnpm vue-tsc -b && pnpm vitest run`

- [ ] **Step 7: Commit** — `feat(webapp): song-snippet board — cover slot, stage bar, restart-only play, search, skip, give-up`

---

### Task 15: Frontend — Auflösung + Scoreboard + Lab-Verdrahtung

**Files:**
- Create: `webapp-vue/src/games/songsnippet/SongSnippetReveal.vue`
- Modify: `webapp-vue/src/gamelab/games.ts`
- Modify: `webapp-vue/src/gamelab/api.ts`
- Modify: `webapp-vue/src/pages/c/[slug]/lab/[game].vue`

**Interfaces:**
- Consumes: Task 11 (Lab-Endpoints, `myStage`), Task 12–14
- Produces: Reveal-Ansicht mit identischen Layout-Plätzen; Scoreboard mit Tipp-Spalte + Abspielen falscher Tipps; Lab spielbar inkl. Stufen

- [ ] **Step 1: `SongSnippetReveal.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GameEntry } from '@/games/GameEntry'
import { fetchAssetBlob } from '@/api/assets'
import StageBar from './StageBar.vue'
import { usePlayback } from './usePlayback'
import { resolveTrack } from './api'
import type { SongSnippetSolution } from './types'

const SOLUTION_ASSET_KEY = 99
const SOLUTION_SECONDS = 30

const props = defineProps<{
  solution: SongSnippetSolution
  durations: number[]
  entries: GameEntry[]
  mineUserId: string | null
  assetUrl?: (key: number) => string
}>()

const playback = usePlayback()
const loaded = ref(false)
let objectUrl: string | null = null

/** Loaded on the first tap, not on mount — browser policies want a gesture anyway. */
async function playSolution(): Promise<void> {
  if (!loaded.value && props.assetUrl) {
    const blob = await fetchAssetBlob(props.assetUrl(SOLUTION_ASSET_KEY))
    objectUrl = URL.createObjectURL(blob)
    playback.setSource(objectUrl)
    loaded.value = true
  }
  playback.restart()
}

/** A wrong guess row can be listened to straight from Deezer — resolved fresh, never stored. */
const guessPlayer = usePlayback()
async function playGuess(entry: GameEntry): Promise<void> {
  const guess = entry.guess as { trackId?: number } | null
  if (!guess?.trackId) return
  try {
    const track = await resolveTrack(guess.trackId)
    guessPlayer.setSource(track.previewUrl)
    guessPlayer.restart()
  } catch (err) {
    console.error('[song-snippet] guess preview failed', err)
  }
}

function guessLabel(entry: GameEntry): string {
  const guess = entry.guess as { artist?: string; title?: string } | null
  if (!guess?.title) return '— aufgegeben —'
  return `${guess.artist ?? '?'} — ${guess.title}`
}
function isCorrect(entry: GameEntry): boolean {
  return (entry.outcome as { correct?: boolean } | null)?.correct === true
}
const sorted = computed(() =>
  [...props.entries].sort((a, b) => (b.points ?? 0) - (a.points ?? 0)),
)
</script>

<template>
  <div class="flex flex-col gap-5 rounded-xl border border-neutral-200 bg-white p-5">
    <!-- Same slot the question mark held - the layout does not jump. -->
    <img
      v-if="solution.coverUrl"
      :src="solution.coverUrl"
      alt=""
      class="mx-auto h-32 w-32 rounded-xl object-cover"
      data-test="cover"
    />
    <div v-else class="mx-auto flex h-32 w-32 items-center justify-center rounded-xl bg-neutral-100 text-5xl">🎵</div>

    <p class="text-center">
      <span class="block text-base font-semibold">{{ solution.title }}</span>
      <span class="block text-sm text-neutral-500">{{ solution.artist }}</span>
      <a :href="solution.link" target="_blank" rel="noopener" class="text-xs text-neutral-400 underline">
        Auf Deezer öffnen
      </a>
    </p>

    <StageBar
      :durations="durations"
      :total-seconds="SOLUTION_SECONDS"
      :unlocked-seconds="SOLUTION_SECONDS"
      :position-seconds="playback.positionSeconds.value"
    />

    <div class="grid grid-cols-[1fr_auto_1fr] items-center">
      <span />
      <button
        type="button"
        data-test="play-solution"
        class="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-amber-400 text-3xl"
        aria-label="Auflösung abspielen"
        @click="playSolution"
      >
        ▶
      </button>
      <span class="justify-self-start pl-4">
        <button
          type="button"
          class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-neutral-200 text-sm"
          aria-label="Pause"
          @click="playback.pause()"
        >
          ⏸
        </button>
      </span>
    </div>

    <table class="w-full text-sm" data-test="song-scoreboard">
      <tbody>
        <tr
          v-for="entry in sorted"
          :key="entry.userId"
          :class="entry.userId === mineUserId ? 'font-semibold' : ''"
        >
          <td class="py-1 pr-2">{{ entry.username }}</td>
          <td class="min-w-0 py-1 pr-2">
            <span :class="isCorrect(entry) ? 'text-emerald-700' : 'text-neutral-500'">
              {{ guessLabel(entry) }}
            </span>
            <button
              v-if="!isCorrect(entry) && (entry.guess as { trackId?: number } | null)?.trackId"
              type="button"
              class="ml-1 cursor-pointer text-xs underline"
              data-test="play-guess"
              @click="playGuess(entry)"
            >
              anhören
            </button>
          </td>
          <td class="py-1 pr-2 text-right font-mono text-xs text-neutral-500">
            {{ entry.stage != null ? `${durations[entry.stage] ?? '?'}s` : '' }}
          </td>
          <td class="py-1 text-right font-mono">{{ entry.points ?? 0 }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

*(Unsere Auflösung hat keine Zeit-Choreografie — `SPOILER_HOLD_MS` (3800ms, Guess Hues längster Takt) bleibt unverändert; nichts läuft hier länger.)*

- [ ] **Step 2: Lab verdrahten**

`gamelab/games.ts`: `{ id: 'song-snippet', title: 'Anspielung' }` in `labGameList` aufnehmen.

`gamelab/api.ts`: nach dem Muster der bestehenden Funktionen ergänzen (Pfad-Schema aus `LabController`):

```ts
export const skipLabStage = (slug: string, game: string, seed: number, phase: string, fromStage: number) =>
  apiFetch<LabRoundResponse>(
    `/api/lab/${encodeURIComponent(slug)}/${encodeURIComponent(game)}/skip?seed=${seed}&phase=${phase}`,
    { method: 'POST', body: JSON.stringify({ fromStage }) },
  )

export const giveUpLabRound = (slug: string, game: string, seed: number, phase: string) =>
  apiFetch<LabRoundResponse>(
    `/api/lab/${encodeURIComponent(slug)}/${encodeURIComponent(game)}/give-up?seed=${seed}&phase=${phase}`,
    { method: 'POST', body: JSON.stringify({}) },
  )

export const labAssetUrl = (slug: string, game: string, seed: number, phase: string, key: number): string =>
  `/api/lab/${encodeURIComponent(slug)}/${encodeURIComponent(game)}/assets/${key}?seed=${seed}&phase=${phase}`
```

`LabRoundResponse`-Typ um `myStage: number` ergänzen (wo der Typ definiert ist — `src/gamelab/`).

`pages/c/[slug]/lab/[game].vue`: dem `<component :is>` zusätzlich geben:

```
      :stage="round?.myStage ?? 0"
      :asset-url="(key: number) => labAssetUrl(slug, gameId, seed!, phase, key)"
      @skip="(from: number) => run(() => skipLabStage(slug, gameId, seed!, phase, from).then(setRound))"
      @give-up="run(() => giveUpLabRound(slug, gameId, seed!, phase).then(setRound))"
```

*(`run`/`setRound` an die tatsächlichen Helfer der Seite anpassen — die Seite hat für `guess` bereits denselben Mechanismus; exakt dieses Muster kopieren.)*

- [ ] **Step 3: Lint + Typecheck + alle Frontend-Tests** — `pnpm lint && pnpm vue-tsc -b && pnpm vitest run`

- [ ] **Step 4: Manuelle Lab-Runde** (Verifikation vor dem Behaupten): Backend + Frontend starten (`.claude/launch.json`), `/c/<slug>/lab/song-snippet?seed=7` öffnen, hören: 0,1s spielt; Skip → 0,5s; falscher Tipp in Phase eins → Stufe rückt, Notice erscheint; richtiger Tipp → Reveal mit Cover, 30s-Hook, Scoreboard mit Tipp-Spalte. Screenshot für den PR.

- [ ] **Step 5: Commit** — `feat(webapp): song-snippet reveal with guess column and straight-from-Deezer wrong-guess playback; lab wiring`

---

### Task 16: Wissensrückfluss + Endabnahme

**Files:**
- Modify: `.claude/guidelines/modules-and-migrations.md`
- Modify: `.claude/guidelines/game-rounds.md`
- Modify: `.claude/guidelines/frontend.md`

- [ ] **Step 1: Guidelines ergänzen** (je ein kurzer Absatz, Stil der Datei):
  - `modules-and-migrations.md`, hinter dem Cross-Schema-FK-Absatz: das **Plugin-Muster** — wenn der Code-Pfeil Host→Plugin zeigt, die Daten aber Plugin→Host hängen, ist der FK gegen den Code-Pfeil auf frischer DB nicht anlegbar (Migrationsreihenfolge folgt dem Code-Graphen); wir verzichten dann auf den FK statt die Strategie zu verbiegen, und der Verzicht steht als Kommentar in der Migration (`songsnippet.round_audio` ist das Beispiel).
  - `game-rounds.md`: die Stufen-Verallgemeinerung — `round_plays.stage` gehört dem Framework, `deviation` einer Stufen-Runde ist die Stufe (das Framework überschreibt, das Spiel liefert `0.0`), „falscher Guess unterhalb der letzten Stufe rückt vor" gilt nur für `ALL_QUALIFYING`, Aufgeben = `guessed_at` ohne `guess`, Assets sind stufen-gegated (`rundengebunden = Framework-URL, katalogweit = Modul-URL`).
  - `frontend.md`: `apiFetch` bleibt JSON-only; binäre Runden-Assets laufen über `fetchAssetBlob` (credentialed `fetch → Blob → ObjectURL`).
- [ ] **Step 2: Volle Verifikation** — `cd core && ./mvnw test` **und** `cd webapp-vue && pnpm lint && pnpm vue-tsc -b && pnpm vitest run`; Ausgaben prüfen, nicht nur Exit-Codes.
- [ ] **Step 3: Commit** — `docs(guidelines): what the song-snippet round leaves behind`

---

## Offene, bewusst kleine Risiken (für den Ausführenden)

1. **tools.jackson-3-API für String-Reads** (`asString()` vs. `asText()`): der Plan umgeht sie via `mapper.treeToValue` auf kleine data classes; wo doch ein direkter Node-Read nötig ist, die Schreibweise aus einer kompilierenden Stelle des Repos übernehmen.
2. **JLayer-Getter-Namen** und **MockRestServiceServer-URL-Encoding**: beim ersten Kompilieren/Testlauf gegen die tatsächlichen Artefakte prüfen; die Tests sind so geschrieben, dass der Fehlertext die Korrektur diktiert.
3. **`CREATE SCHEMA` in V1**: vor Task 8 per `grep -rn "CREATE SCHEMA" core/src/main/resources/db/migration/` klären, ob die Modulith-Flyway-Strategie Schemata selbst anlegt.
4. **Selektion kennt jetzt zwei Spiele**: bestehende Integrationstests, die implizit „nur guess-hue" annehmen, auf explizites `store.announce` umstellen (dokumentiertes Muster).
