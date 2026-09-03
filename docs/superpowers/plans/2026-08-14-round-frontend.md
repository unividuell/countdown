# Die Runde im Frontend — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Spieler kann die Runde seiner Community spielen — aufdecken, tippen, Auflösung sehen, Punkte in der Mitgliederzeile —, ohne das Entwickler-Lab zu benutzen.

**Architecture:** Der Spiel-Vertrag bekommt eine letzte Frage, die nur das Spiel beantworten kann: braucht diese Runde ein bewusstes Aufdecken? Die Antwort steuert, ob der Client sofort spielt oder erst klickt, und ob ein zweites Aufdecken 409 ist. Im Frontend zieht die Komponente, die Brett und Auflösung umschaltet, aus dem wegwerfbaren Lab-Ordner in den geteilten `games/`-Ordner; Lab und Runde rendern danach dieselbe Komponente über **eine** Registry. Die Karte hält keinen Spielzustand — ihre drei Zustände folgen aus der Antwort.

**Tech Stack:** Backend: Kotlin 2.4 · Spring Boot 4.1 · Spring Modulith 2.1 · Jackson 3 (`tools.jackson`) · JUnit 5 + kotest + mockk + Testcontainers. Frontend: Vite 8 · Vue 3 · TypeScript (strict) · Vue Router 5 (file-based) · Tailwind v4 · Vitest + happy-dom · pnpm.

**Spec:** [`docs/superpowers/specs/2026-08-14-round-frontend-design.md`](../specs/2026-08-14-round-frontend-design.md) — dazu [`2026-08-11-round-game-selection-design.md`](../specs/2026-08-11-round-game-selection-design.md) für die Regeln, aus denen dieser Zugang folgt (Vergabe, Sichtbarkeit, „nur die laufende Runde ist spielbar“).

**Baut auf Plan 4** ([`2026-08-12-game-lab-consolidation.md`](2026-08-12-game-lab-consolidation.md)), der als ungemergeter Vorgänger-Branch unter diesem liegt: der Vertrag im Basis-Package `game`, `GameCatalog`/`GameTypeHandle`, das Lab auf den echten Klassen, `GuessHuePayload.toleranceDeg`.

## Global Constraints

- **Der Reveal-Schalter hat keinen Default.** `GameType.requiresReveal(params)` ist abstrakt: jedes Spiel antwortet, weil die bequeme Richtung (`false`) die unsichere ist — sie lässt die Uhr ohne Zutun des Spielers laufen und kennt keinen Lockout.
- **„Genau einmal“ ist ein Statement, keine Prüfung:** `INSERT … ON CONFLICT DO NOTHING`, null Zeilen ⇒ 409. Dasselbe Muster wie „ein Tipp pro Runde“, damit zwei gleichzeitige Klicks nicht beide durchkommen.
- **Die Karte leitet ihre Zustände aus der Antwort ab**, nie aus lokalen Flags: `requiresReveal && me == null` → Vorher-Karte, `me.guessedAt == null` → Spiel, sonst Auflösung.
- **`GET` deckt nicht auf.** Bei `requiresReveal = false` schickt die Seite selbst `POST …/reveal`, sobald sie ein Spiel ohne eigenen Eintrag sieht. `revealed_at` behält eine Bedeutung: der Payload ging raus.
- **Wer eine Runde adressiert, sagt welche.** Der Tipp trägt die Rundennummer aus der Antwort; weicht sie ab, ist das 409, und der Client holt neu statt einen Fehler zu behaupten.
- **Eine Registry, ein Adapter.** Die Spielkomponente liegt in `src/games/`, nicht in `src/gamelab/` — das Lab darf auf Geteiltes zeigen, Geteiltes nie auf das Lab. `src/gamelab/` bleibt löschbar.
- **`qualifies` und `deviation` verlassen den Server nicht.** Was der Spieler erfährt, ist `outcome` und `points`.
- **Named Arguments ab zwei Argumenten** ([kotlin.md](../../../.claude/guidelines/kotlin.md)); IDs einmal auspacken, dann die `UUID` weitergeben — auch in Tests.
- **Tests Backend:** JUnit 5 + **kotest matchers** (nie `kotlin.test`/JUnit-Assertions); Integrationstests mit `@Import(TestcontainersConfiguration::class) @SpringBootTest`; Web-Tests mit MockMvc **Kotlin DSL**, jeder POST mit `with(csrf())`.
- **Tests Frontend:** Vitest + `vi` (nicht mockk), happy-dom; `pnpm test`, `pnpm typecheck` und `pnpm lint` müssen grün sein. Das Skript heißt `typecheck`, **nicht** `type-check`.
- **Mobile-first** ([frontend-ui.md](../../../.claude/guidelines/frontend-ui.md)): die Karte wird auf dem Telefon gespielt; Tap-Ziele wie die bestehenden (`h-11`), keine Hover-only-Bedienung.
- **Sprache:** Code, Kommentare, Testnamen, Commit-Messages **englisch**; dieser Plan ist deutsch. Deutsche Anzeigetexte nutzen `„…“` — tiefes öffnendes, hohes schließendes Anführungszeichen, nie ein gerades `"` als Schließer.
- **Branch:** `claude/round-frontend`, aufgesetzt auf dem ungemergeten `claude/game-lab-consolidation` (stacked PR). PR-Basis ist der Vorgänger-Branch, **nicht** `develop`.

---

## File Structure

**Backend — geändert:**

| Datei | Änderung |
|---|---|
| `core/…/game/GameType.kt` | `requiresReveal(params: P): Boolean`, abstrakt |
| `core/…/game/GameCatalog.kt` | `GameTypeHandle.requiresReveal(params: JsonNode)` |
| `core/…/game/internal/GuessHueGameType.kt` | antwortet `false`, in jeder Phase |
| `core/…/game/internal/RoundPlayRepository.kt` | `revealOnce(...)` neben `revealOrCount(...)` |
| `core/…/game/internal/PlayService.kt` | wählt das Statement; nimmt `roundNumber` beim Tipp |
| `core/…/game/internal/RoundDtos.kt` | `GameDto.requiresReveal`, `RoundResponse.awardRule/awardPoints`, `GuessRequest` |
| `core/…/game/internal/RoundResponses.kt` | füllt die neuen Felder aus der Runde |
| `core/…/game/internal/RoundController.kt` | Tipp nimmt `GuessRequest` |
| `core/…/game/internal/GameExceptions.kt` + `GameExceptionHandler.kt` | `AlreadyRevealedException`, `RoundMovedOnException` → 409 |

**Frontend — neu:**

| Datei | Verantwortung |
|---|---|
| `webapp-vue/src/games/GameEntry.ts` | die schmale Eintragsform, die beide Welten in die Spielkomponente geben |
| `webapp-vue/src/games/registry.ts` | `id → Komponente`, geteilt von Lab und Runde |
| `webapp-vue/src/games/guesshue/GuessHueGame.vue` | **verschoben** aus `gamelab/GuessHueLabGame.vue` |
| `webapp-vue/src/api/rounds.ts` | die drei Aufrufe der Runde |
| `webapp-vue/src/rounds/useRound.ts` | Laden, Aufdecken, Tippen, Zustände, 409-Nachzug |
| `webapp-vue/src/rounds/RoundCard.vue` | die Karte samt Zustandswahl und Punkt-Zeile |

**Frontend — geändert:** `src/api/types.ts` (Wire-Typen der Runde), `src/gamelab/games.ts` (benutzt die geteilte Registry), `src/gamelab/GuessHueLabGame.vue` (gelöscht), `src/pages/c/[slug]/index.vue` (wählt Karte oder Fallback, zieht den Roster nach).

---

## Task 1: Der Reveal-Schalter

Nach dieser Task beantwortet jedes Spiel, ob seine Runde ein bewusstes Aufdecken braucht, und für ein Spiel, das `true` sagt, ist das zweite Aufdecken 409. Der Client weiß es aus der Antwort. Guess Hue sagt `false`, also ändert sich für den einzigen echten Spieler-Pfad nichts — geprüft wird der `true`-Zweig mit einem gefälschten Spieltyp.

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameType.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameCatalog.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GuessHueGameType.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlayRepository.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptions.kt`, `GameExceptionHandler.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GuessHueGameTypeTest.kt`, `GameCatalogTest.kt`, `PlayServiceTest.kt`, `RoundControllerTest.kt`

**Interfaces:**
- Consumes: `GameTypeHandle.judge/present/solution/draw`, `CurrentRound.Announced(round, roundGame, handle)`, `RoundPlayRepository.revealOrCount(roundGameId, userId, revealedAt)`, `RoundGameStore.lock`, `RoundScoring.reevaluate`.
- Produces:
  - `GameType<P>.requiresReveal(params: P): Boolean` — abstrakt
  - `GameTypeHandle<P>.requiresReveal(params: JsonNode): Boolean`
  - `RoundPlayRepository.revealOnce(roundGameId: UUID, userId: UUID, revealedAt: Instant): Int`
  - `GameDto(id: String, displayName: String, requiresReveal: Boolean)`
  - `AlreadyRevealedException` → 409

- [ ] **Step 1: Die Frage in den Vertrag schreiben**

In `game/GameType.kt`, in `interface GameType<P : Any>` nach `present`:

```kotlin
    /**
     * Whether this round needs a **deliberate** reveal before the player may play it.
     *
     * `false` means the client may show the playable game straight away; the clock (`revealed_at`)
     * then starts when the card appears, and a reload costs nothing — pure statistics. `true` means
     * the player opens the round with an explicit action, and may do so **exactly once**.
     *
     * **No default on purpose.** Every game answers it, because the convenient direction is the
     * unsafe one: inheriting `false` would start somebody's clock without their consent. Contrast
     * the deleted `revealsOthersBeforeGuess`, which was a bug *because* its right answer was the
     * same everywhere — here the answers genuinely differ per game, so the switch earns its place.
     *
     * Takes [params] rather than a phase: the phase is already in there (Guess Hue's
     * `toleranceDeg` shows how), and a game may just as well decide from its own content.
     */
    fun requiresReveal(params: P): Boolean
```

In `game/GameCatalog.kt`, in `GameTypeHandle`:

```kotlin
    /** Whether this round needs a deliberate reveal, from a stored `params` blob. */
    fun requiresReveal(params: JsonNode): Boolean = type.requiresReveal(paramsOf(params))
```

- [ ] **Step 2: Guess Hue antworten lassen, mit Test**

In `GuessHueGameTypeTest` ergänzen:

```kotlin
    @Test
    fun `no phase of this game needs a deliberate reveal`() {
        // It does not score on time, so a refresh buys a trickster nothing and a click in front of
        // the wheel would be a hurdle without a purpose. The switch exists for games that do.
        game.requiresReveal(draw(phase = Phase.ONE)) shouldBe false
        game.requiresReveal(draw(phase = Phase.TWO)) shouldBe false
    }
```

Run: `cd core && ./mvnw test -Dtest='GuessHueGameTypeTest'` → FAIL (Methode fehlt). Dann in `GuessHueGameType`:

```kotlin
    /**
     * Never, in either phase: Guess Hue does not score on time, so the clock is statistics rather
     * than stake, and a deliberate reveal would cost the player a tap for nothing.
     */
    override fun requiresReveal(params: GuessHueParams) = false
```

Danach ist `GameCatalogTest.FakeGame` unvollständig — gib ihr `override fun requiresReveal(params: FakeParams) = false` und einen Test, dass der Handle die Frage durch die JSON-Grenze trägt:

```kotlin
    @Test
    fun `the handle answers the reveal question from a stored params blob`() {
        val handle = catalog(FakeGame("alpha")).handle("alpha").shouldNotBeNull()
        val params = handle.draw(
            random = GameRandom(
                solution = SeededRandom.fromSeed(7),
                presentation = SeededRandom.fromSeed(8),
            ),
            context = RoundContext(roundNumber = 12, phase = Phase.ONE),
        )

        handle.requiresReveal(params) shouldBe false
    }
```

Run: `cd core && ./mvnw test -Dtest='GuessHueGameTypeTest,GameCatalogTest'` → PASS.

- [ ] **Step 3: Das Aufdeck-Statement für „genau einmal“**

In `RoundPlayRepository`, neben `revealOrCount`:

```kotlin
    /**
     * Reveal **exactly once**, for a game that requires a deliberate one.
     *
     * `DO NOTHING` rather than `DO UPDATE`: zero affected rows means the row already existed, which
     * the caller turns into a 409. The same atomic shape as the single guess, and for the same
     * reason — two clicks arriving together must not both win, and a read-then-check would let them.
     */
    @Modifying
    @Query(
        """
        INSERT INTO game.round_plays (round_game_id, user_id, revealed_at)
        VALUES (:roundGameId, :userId, :revealedAt)
        ON CONFLICT (round_game_id, user_id) DO NOTHING
        """,
    )
    fun revealOnce(roundGameId: UUID, userId: UUID, revealedAt: Instant): Int
```

- [ ] **Step 4: Den Fehler und seinen Status ergänzen**

In `GameExceptions.kt`:

```kotlin
/**
 * A second reveal of a round that asked for a deliberate one → 409. Only games that answer `true` to
 * `GameType.requiresReveal` are strict here; for the others a reload is free and counted, not refused.
 */
class AlreadyRevealedException(message: String = "this round has already been revealed") :
    RuntimeException(message)
```

In `GameExceptionHandler.kt` die Klasse in die bestehende `conflict`-Liste aufnehmen, neben `NoGameToPlayException`, `NotRevealedException`, `AlreadyGuessedException`.

- [ ] **Step 5: Den Service wählen lassen**

In `PlayService.reveal` den Körper ersetzen:

```kotlin
    @Transactional
    fun reveal(slug: String, userId: UUID, isSuperAdmin: Boolean): RoundResponse {
        val current = playable(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        val roundGameId = requireNotNull(current.roundGame.id)
        val revealedAt = clock.instant()
        if (current.handle.requiresReveal(current.roundGame.params)) {
            // Exactly once, decided by the statement rather than by a check — see revealOnce().
            val opened = plays.revealOnce(
                roundGameId = roundGameId, userId = userId, revealedAt = revealedAt,
            )
            if (opened == 0) throw AlreadyRevealedException()
        } else {
            // Idempotent, no lockout: this game does not score on time, so a refresh is free. The
            // counter still records that somebody looked again.
            plays.revealOrCount(
                roundGameId = roundGameId, userId = userId, revealedAt = revealedAt,
            )
        }
        return responses.of(current = current, viewerId = userId)
    }
```

- [ ] **Step 6: Das Flag an den Client geben**

In `RoundDtos.kt`:

```kotlin
/**
 * [requiresReveal] rides on the game rather than on the round, because it is the game's answer — and
 * it is therefore absent exactly when there is no game to answer for.
 */
data class GameDto(val id: String, val displayName: String, val requiresReveal: Boolean)
```

In `RoundResponses.announced` die Konstruktion nachziehen:

```kotlin
            game = GameDto(
                id = current.handle.id,
                displayName = current.handle.displayName,
                requiresReveal = current.handle.requiresReveal(current.roundGame.params),
            ),
```

- [ ] **Step 7: Den `true`-Zweig testbar machen und testen**

`PlayServiceTest` bekommt einen gefälschten Spieltyp, der ein bewusstes Aufdecken verlangt. Ohne ihn wäre die Regel ungetesteter Code — es gibt kein echtes Spiel, das `true` antwortet. Das Muster ist dasselbe, mit dem `AnnouncementServiceTest` eine Runde mit unbekanntem Typ vorschreibt: die Zeile direkt setzen, statt sie auslosen zu lassen.

```kotlin
    @TestConfiguration
    class StrictRevealGame {
        data class StrictParams(val label: String)
        data class StrictPayload(val label: String) : GamePayload

        /** A game that insists on a deliberate reveal, so the "exactly once" rule has an exerciser. */
        @Bean
        fun strictGame(): GameType<StrictParams> = object : GameType<StrictParams> {
            override val id = "strict-reveal"
            override val displayName = "Streng"
            override val paramsType = StrictParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = StrictParams(label = "x")
            override fun present(params: StrictParams) = StrictPayload(label = params.label)
            override fun judge(params: StrictParams, guess: JsonNode) =
                Judgement(qualifies = true, deviation = 0.0, outcome = null)
            override fun requiresReveal(params: StrictParams) = true
        }
    }
```

Die Klasse mit `@Import(StrictRevealGame::class)` am Test einbinden (neben `TestcontainersConfiguration`) und zwei Tests schreiben:

```kotlin
    @Test
    fun `a game that asks for a deliberate reveal is revealed exactly once`() {
        val (community, viewer) = aCommunity("Strict Reveal")
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        // Written straight to the row: the selection must not decide which game this test gets.
        store.announce(
            edition = edition, roundNumber = currentRoundNumberOf(community),
            gameType = "strict-reveal", params = mapper.readTree("""{"label":"x"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )

        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        shouldThrow<AlreadyRevealedException> {
            play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        }
    }

    @Test
    fun `a game that does not ask stays idempotent, and says so in the response`() {
        val (community, viewer) = aCommunity("Free Reveal")

        val first = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        val again = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        first.game.shouldNotBeNull().requiresReveal shouldBe false
        again.me.shouldNotBeNull().revealedAt shouldBe first.me.shouldNotBeNull().revealedAt
    }
```

Prüf beim Schreiben die vorhandenen Fixtures von `PlayServiceTest` (`aCommunity`, `currentRoundNumberOf`, die injizierten Beans) und benutze sie, statt neue zu bauen. Braucht der Test `RoundGameStore` oder `ObjectMapper` und sind sie nicht injiziert, ergänze sie im Konstruktor.

- [ ] **Step 8: Web-Test nachziehen**

In `RoundControllerTest` tragen die gestubbten `GameDto`-Konstruktionen jetzt `requiresReveal`. Dazu ein Test, dass ein zweites Aufdecken als 409 durchgeht:

```kotlin
    @Test
    fun `a second reveal of a strict round is a conflict`() {
        every { plays.reveal(slug = "team", userId = uid, isSuperAdmin = false) } throws
            AlreadyRevealedException()

        mockMvc.post("/api/communities/team/rounds/current/reveal") {
            with(principalFor()); with(csrf())
        }.andExpect { status { isConflict() } }
    }
```

- [ ] **Step 9: Alles laufen lassen und committen**

Run: `cd core && ./mvnw test`
Expected: PASS.

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game core/src/test/kotlin/org/unividuell/countdown/core/game
git commit -m "feat(game): let each game say whether its round needs a deliberate reveal"
```

---

## Task 2: Die Vergaberegel in der Antwort, die Rundennummer am Tipp

Nach dieser Task weiß der Client, welche Regel für die laufende Runde gilt und was sie zahlt — und ein Tipp kann nicht mehr gegen eine Runde gewertet werden, die der Spieler nie gesehen hat.

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundController.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptions.kt`, `GameExceptionHandler.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PlayServiceTest.kt`, `RoundControllerTest.kt`

**Interfaces:**
- Consumes: `RoundGame.awardRule`, `RoundGame.awardPoints`, `CurrentRound.Announced.round.number`, `PlayService.guess(slug, userId, isSuperAdmin, guess)`.
- Produces:
  - `RoundResponse.awardRule: AwardRule?`, `RoundResponse.awardPoints: Int?` — `null` genau dann, wenn es kein Spiel gibt
  - `GuessRequest(roundNumber: Int, guess: JsonNode)`
  - `PlayService.guess(slug: String, userId: UUID, isSuperAdmin: Boolean, roundNumber: Int, guess: JsonNode): RoundResponse`
  - `RoundMovedOnException(current: Int)` → 409

- [ ] **Step 1: Den Test für die veraltete Runde schreiben**

In `PlayServiceTest`:

```kotlin
    @Test
    fun `a guess for a round that has moved on is refused, and nothing is written`() {
        // A tab left open across the day boundary would otherwise have its guess judged against a
        // round the player never saw — with a deviation that means nothing to them.
        val (community, viewer) = aCommunity("Stale Round")
        val current = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        val staleNumber = requireNotNull(current.round).number + 1

        shouldThrow<RoundMovedOnException> {
            play.guess(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = staleNumber, guess = guess(10.0),
            )
        }

        announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)
            .me.shouldNotBeNull().guessedAt.shouldBeNull()
    }

    @Test
    fun `the response carries the rule and the stake the round was frozen with`() {
        val (community, viewer) = aCommunity("Award Fields")

        val res = announcements.currentRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
        )

        res.awardRule shouldBe AwardRule.ALL_QUALIFYING
        res.awardPoints shouldBe 1
    }
```

Run: `cd core && ./mvnw test -Dtest='PlayServiceTest'` → FAIL (Signatur und Felder fehlen).

- [ ] **Step 2: Die Felder ergänzen**

In `RoundDtos.kt`, `RoundResponse` um zwei Felder erweitern — mit dem Satz, der sagt, warum sie dort und nicht am `GameDto` stehen:

```kotlin
    /**
     * The rule and the stake this round was frozen with — `null` exactly when there is no game. They
     * belong to the round, not to the game type: the same game pays differently in phase two, and the
     * client needs both to say that a `CLOSEST_ONLY` score is provisional („bester Tipp bisher“).
     */
    val awardRule: AwardRule? = null,
    val awardPoints: Int? = null,
```

Und in `RoundResponses.announced` füllen:

```kotlin
            awardRule = current.roundGame.awardRule,
            awardPoints = current.roundGame.awardPoints,
```

- [ ] **Step 3: Den Tipp seine Runde nennen lassen**

In `RoundDtos.kt`:

```kotlin
/**
 * The guess, plus the round the client believes it is playing. „Current“ is not the same thing for a
 * client and a server once a day boundary passes between the two, and the difference would show up as
 * a verdict against a target the player never saw.
 */
data class GuessRequest(val roundNumber: Int, val guess: JsonNode)
```

In `GameExceptions.kt`:

```kotlin
/**
 * The client guessed for a round that is no longer the current one → 409. Not an error to show: the
 * client refetches and renders the round that *is* current.
 */
class RoundMovedOnException(current: Int) :
    RuntimeException("the current round is now $current")
```

…und die Klasse in die `conflict`-Liste des Handlers aufnehmen.

In `PlayService.guess` den Parameter ergänzen und **vor** allem anderen prüfen:

```kotlin
    @Transactional
    fun guess(
        slug: String,
        userId: UUID,
        isSuperAdmin: Boolean,
        roundNumber: Int,
        guess: JsonNode,
    ): RoundResponse {
        val current = playable(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        // Checked before the lock and before judging: a guess meant for another round must not touch
        // this one at all.
        if (current.round.number != roundNumber) throw RoundMovedOnException(current.round.number)
```

Der Rest des Körpers bleibt unverändert.

In `RoundController` den Tipp umstellen:

```kotlin
    /** The one guess. The body is the game's own shape, plus the round it is meant for. */
    @PostMapping("/current/guess")
    fun guess(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody body: GuessRequest,
    ): RoundResponse = plays.guess(
        slug = slug,
        userId = me.id,
        isSuperAdmin = me.isSuperAdmin,
        roundNumber = body.roundNumber,
        guess = body.guess,
    )
```

- [ ] **Step 4: Die bestehenden Aufrufstellen nachziehen**

`PlayServiceTest`s vorhandene `play.guess(...)`-Aufrufe brauchen jetzt `roundNumber`. Nimm die Nummer aus der Antwort, die der Test schon hat (`res.round!!.number`), **nicht** aus einer eigenen Rechnung — sonst prüft der Test die Wahrheit des Servers gegen sich selbst. Wo ein Test die Runde nicht bereits kennt, lies sie einmal über `announcements.currentRound(...)`.

`RoundControllerTest`s Tipp-Tests schicken jetzt `{"roundNumber":12,"guess":{"hue":123.5}}` und stubben `plays.guess(slug = …, userId = …, isSuperAdmin = …, roundNumber = 12, guess = any())`. Der „passes the body through untouched“-Test muss weiterhin beobachten, dass die *innere* Tipp-Form unverändert ankommt — die Slot-Capture, die dort schon existiert, greift auf `guess`, nicht auf den Umschlag.

- [ ] **Step 5: Alles laufen lassen und committen**

Run: `cd core && ./mvnw test`
Expected: PASS.

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game core/src/test/kotlin/org/unividuell/countdown/core/game
git commit -m "feat(game): publish the round's award rule and pin a guess to its round"
```

---

## Task 3: Eine Spielkomponente für beide Welten

Nach dieser Task liegt die Komponente, die Brett und Auflösung umschaltet, in `src/games/` statt im Lab-Ordner, und beide Welten finden sie über eine Registry. **Kein neues Verhalten** — die Lab-Suite muss unverändert grün bleiben.

**Warum das ein eigener Task ist:** die Komponente heißt heute `gamelab/GuessHueLabGame.vue` und hängt am Lab-Typ `LabEntryDto`. Würde die Runde sie von dort importieren, zeigte geteilter Code auf den wegwerfbaren Ordner — genau die Richtung, die die Lab-Guideline verbietet. Und eine Kopie wären wieder zwei Adapter, die auseinanderlaufen können; mit diesem Argument hat Plan 4 gerade das Kotlin-Pendant gelöscht.

**Files:**
- Create: `webapp-vue/src/games/GameEntry.ts`
- Create: `webapp-vue/src/games/registry.ts`
- Move: `webapp-vue/src/gamelab/GuessHueLabGame.vue` → `webapp-vue/src/games/guesshue/GuessHueGame.vue`
- Move: `webapp-vue/src/gamelab/__tests__/guess-hue-lab.spec.ts` → `webapp-vue/src/games/guesshue/__tests__/GuessHueGame.spec.ts`
- Modify: `webapp-vue/src/gamelab/games.ts`, `webapp-vue/src/gamelab/__tests__/lab-page.spec.ts`, `…/lab-index.spec.ts`

**Interfaces:**
- Consumes: `GuessHueBoard` (`description`, `initHue`, `saturation`, `lightness`, `toleranceDeg`, `disabled`; emit `guess: [hue: number]`), `GuessHueReveal` (`description`, `saturation`, `lightness`, `targetHue`, `toleranceDeg`, `guesses: RevealGuess[]`, `mineUserId`, `animate`).
- Produces:
  - `type GameEntry = { userId: string; guess: unknown; avatar: { bgColorHex: string } }`
  - `gameComponents: Record<string, Component>` in `src/games/registry.ts`
  - `src/games/guesshue/GuessHueGame.vue` mit den Props `payload`, `outcome`, `myGuess`, `solution`, `entries: GameEntry[]`, `mineUserId: string | null`, `disabled` und dem Emit `guess: [value: unknown]`

- [ ] **Step 1: Die schmale Eintragsform definieren**

`webapp-vue/src/games/GameEntry.ts`:

```ts
/**
 * What a game component needs to know about one player's entry — and nothing more.
 *
 * Deliberately narrower than either wire type: the lab's `LabEntryDto` and the round's `PlayDto` both
 * satisfy this structurally, so neither world has to map, and the component stays ignorant of which
 * one it renders for. Widening it is how a game would start depending on the lab.
 */
export type GameEntry = {
  userId: string
  guess: unknown
  avatar: { bgColorHex: string }
}
```

- [ ] **Step 2: Die Komponente verschieben**

```bash
cd webapp-vue
git mv src/gamelab/GuessHueLabGame.vue src/games/guesshue/GuessHueGame.vue
git mv src/gamelab/__tests__/guess-hue-lab.spec.ts src/games/guesshue/__tests__/GuessHueGame.spec.ts
```

In `GuessHueGame.vue`: den Import von `LabEntryDto` durch `GameEntry` ersetzen, den Prop-Typ auf
`entries: GameEntry[]` ändern, die Importpfade an die neue Lage anpassen (richte dich am Stil der
Nachbardateien in `src/games/guesshue/`). Der Datei-KDoc nennt heute das Lab; schreib ihn so um, dass er
die Komponente beschreibt, die beide Welten benutzen — was sie tut (Payload und Lösung eingrenzen, Brett
oder Auflösung zeigen, die Auflösungs-Choreografie nur bei einem echten Übergang spielen), nicht wo sie
herkam.

In `GuessHueGame.spec.ts` die Importpfade nachziehen und den `describe`-Namen auf die Komponente
umstellen. **Keine Assertion ändern** — die Datei prüft weiterhin dasselbe Verhalten.

- [ ] **Step 3: Die Registry anlegen**

`webapp-vue/src/games/registry.ts`:

```ts
import type { Component } from 'vue'
import GuessHueGame from './guesshue/GuessHueGame.vue'

/**
 * Every game the client can render, by the id the server announces (`GameDto.id` for a real round,
 * `LabRoundResponse.game` in the lab).
 *
 * One registry for both, because two would be two adapters that can drift — the argument that deleted
 * the lab's own Kotlin adapter. A game missing here has no renderer, and both callers say so rather
 * than rendering a blank card.
 */
export const gameComponents: Record<string, Component> = {
  'guess-hue': GuessHueGame,
}
```

- [ ] **Step 4: Das Lab auf die Registry setzen**

`src/gamelab/games.ts` behält, was ihm gehört — den Titel für die Lab-Übersicht — und holt die Komponente
aus der Registry:

```ts
import type { Component } from 'vue'
import { gameComponents } from '@/games/registry'

export interface LabGameEntry {
  /** Matches `GameType.id` on the server — it is the `:game` URL segment. */
  id: string
  /**
   * Shown by the lab index only. The server owns the authoritative name and sends it as
   * `LabRoundResponse.displayName`, which is what the game page's heading renders — so a drift between
   * the two shows up the moment you open the game, rather than hiding.
   */
  title: string
}

/** The games the lab offers, in index order. The renderer comes from the shared registry. */
export const labGameList: readonly LabGameEntry[] = [{ id: 'guess-hue', title: 'Farbausmalung' }]

/** Lookup by URL segment, for the game page. */
export const labGames: Record<string, Component> = gameComponents
```

Prüf danach die zwei Lab-Tests, die die Registry berühren: `lab-index.spec.ts` liest `labGameList`
(dessen Einträge jetzt kein `component` mehr tragen), und `lab-page.spec.ts` mockt `@/gamelab/games` —
der Mock muss weiterhin **beides** liefern, `labGameList` und `labGames`, sonst findet die Seite keinen
Renderer.

- [ ] **Step 5: Frontend-Suite laufen lassen**

Run: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS, **gleiche Testzahl wie vorher** — dies ist ein Umzug, kein neues Verhalten. Weicht die
Zahl ab, hat der Umzug etwas verändert; finde heraus was, statt die Zahl zu akzeptieren.

Run: `grep -rn "GuessHueLabGame" webapp-vue/src || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Committen**

```bash
git add -A webapp-vue/src
git commit -m "refactor(games): share the guess-hue adapter between the lab and the round"
```

---

## Task 4: Der Zugang zur Runde — API, Typen, Zustand

Nach dieser Task kann Code die Runde laden, aufdecken und tippen und kennt ihre drei Zustände. Noch rendert nichts davon etwas.

**Files:**
- Create: `webapp-vue/src/api/rounds.ts`
- Create: `webapp-vue/src/rounds/useRound.ts`
- Modify: `webapp-vue/src/api/types.ts`
- Test: `webapp-vue/src/api/__tests__/rounds.spec.ts`
- Test: `webapp-vue/src/rounds/__tests__/useRound.spec.ts`

**Interfaces:**
- Consumes: `apiFetch<T>(path, options)` und `ApiError` (mit `.status`) aus `@/api/client`; `AvatarView` aus `@/api/types`.
- Produces:
  - Wire-Typen in `api/types.ts`: `NoGameReason`, `AwardRule`, `RoundDto`, `GameDto`, `PlayDto`, `RoundResponse`
  - `api/rounds.ts`: `getCurrentRound(slug)`, `revealRound(slug)`, `submitGuess(slug, roundNumber, guess)`
  - `useRound(slug): { round, state, stage, busy, notice, reveal, submit, reload }`
  - `type RoundStage = 'no-game' | 'sealed' | 'playing' | 'done'`

- [ ] **Step 1: Die Wire-Typen schreiben**

In `src/api/types.ts` anfügen — die Runde gehört zu den Produkttypen, **nicht** in `gamelab/types.ts`,
das bewusst mit dem Lab löschbar bleibt:

```ts
export type NoGameReason = 'NOT_SCHEDULED' | 'BEFORE_WINDOW' | 'AFTER_WINDOW' | 'NO_GAME_TYPE'
export type AwardRule = 'ALL_QUALIFYING' | 'CLOSEST_ONLY'

export interface RoundDto {
  /** Signed T-offset. A larger number is *earlier* in time. */
  number: number
  label: string
  start: string
  end: string
}

export interface GameDto {
  id: string
  displayName: string
  /** True when this round wants a deliberate reveal — then it may be revealed exactly once. */
  requiresReveal: boolean
}

export interface PlayDto {
  userId: string
  username: string
  avatar: AvatarView
  revealedAt: string
  guessedAt: string | null
  guess: unknown
  /** The game's own shape. `null` for a game that judges without saying anything. */
  outcome: unknown
  /** `null` until the round is scored; `0` means „played and came away empty“. */
  points: number | null
}

export interface RoundResponse {
  /** `null` when there is no grid at all — no run, or no target date. */
  round: RoundDto | null
  game: GameDto | null
  noGameReason: NoGameReason | null
  /** Only once the viewer has revealed. The shape belongs to the game. */
  payload: unknown
  /** Only once the viewer has guessed. */
  solution: unknown
  me: PlayDto | null
  /** Empty until the viewer has guessed — withheld by the server, not filtered here. */
  others: PlayDto[]
  /** `null` exactly when there is no game. Under `CLOSEST_ONLY` a score is provisional. */
  awardRule: AwardRule | null
  awardPoints: number | null
}
```

- [ ] **Step 2: Den API-Test schreiben**

`webapp-vue/src/api/__tests__/rounds.spec.ts` — folge der Form von `gamelab/__tests__/api.spec.ts`
(dieselbe `vi.mock('@/api/client')`-Technik):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '@/api/client'
import { getCurrentRound, revealRound, submitGuess } from '@/api/rounds'

vi.mock('@/api/client', () => ({ apiFetch: vi.fn().mockResolvedValue({}) }))

describe('rounds api', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the current round', async () => {
    await getCurrentRound('team')
    expect(client.apiFetch).toHaveBeenCalledWith('/api/communities/team/rounds/current')
  })

  it('reveals with a post and no body', async () => {
    await revealRound('team')
    expect(client.apiFetch).toHaveBeenCalledWith('/api/communities/team/rounds/current/reveal', {
      method: 'POST',
    })
  })

  it('sends the guess together with the round it is meant for', async () => {
    await submitGuess('team', 12, { hue: 123.5 })
    expect(client.apiFetch).toHaveBeenCalledWith('/api/communities/team/rounds/current/guess', {
      method: 'POST',
      body: JSON.stringify({ roundNumber: 12, guess: { hue: 123.5 } }),
    })
  })

  it('encodes a slug that needs it', async () => {
    await getCurrentRound('a b/c')
    expect(client.apiFetch).toHaveBeenCalledWith('/api/communities/a%20b%2Fc/rounds/current')
  })
})
```

Run: `cd webapp-vue && pnpm test rounds` → FAIL, das Modul fehlt.

- [ ] **Step 3: Das API-Modul schreiben**

`webapp-vue/src/api/rounds.ts`:

```ts
import { apiFetch } from '@/api/client'
import type { RoundResponse } from '@/api/types'

/** The slug is user-chosen, so it is encoded; the round is always „current“ — the server decides which. */
const roundUrl = (slug: string, sub = ''): string =>
  `/api/communities/${encodeURIComponent(slug)}/rounds/current${sub}`

export const getCurrentRound = (slug: string) => apiFetch<RoundResponse>(roundUrl(slug))

export const revealRound = (slug: string) =>
  apiFetch<RoundResponse>(roundUrl(slug, '/reveal'), { method: 'POST' })

/**
 * [roundNumber] is the round the caller believes it is playing. The server refuses a mismatch with 409
 * rather than judging the guess against a round the player never saw.
 */
export const submitGuess = (slug: string, roundNumber: number, guess: unknown) =>
  apiFetch<RoundResponse>(roundUrl(slug, '/guess'), {
    method: 'POST',
    body: JSON.stringify({ roundNumber, guess }),
  })
```

Run: `cd webapp-vue && pnpm test rounds` → PASS.

- [ ] **Step 4: Den Zustands-Test schreiben**

`webapp-vue/src/rounds/__tests__/useRound.spec.ts`, mit gemocktem `@/api/rounds`. Ruf das Composable in
einer Wegwerf-Komponente auf — sieh in `src/communities/__tests__/` nach der Form, die dieses Projekt
für Composable-Tests benutzt, und übernimm sie. Ein Fixture-Helfer:

```ts
const announced = (over: Partial<RoundResponse> = {}): RoundResponse => ({
  round: { number: 12, label: 'T-12', start: '2026-08-14T10:00:00Z', end: '2026-08-15T10:00:00Z' },
  game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: false },
  noGameReason: null,
  payload: null,
  solution: null,
  me: null,
  others: [],
  awardRule: 'ALL_QUALIFYING',
  awardPoints: 1,
  ...over,
})

const aPlay = (over: Partial<PlayDto> = {}): PlayDto => ({
  userId: 'u1',
  username: 'Fry',
  avatar: { shortName: 'FRY', bgColorHex: '#bf40b3' },
  revealedAt: '2026-08-14T11:00:00Z',
  guessedAt: null,
  guess: null,
  outcome: null,
  points: null,
  ...over,
})
```

Die sechs Fälle:

1. `'a game that needs no deliberate reveal is revealed without asking'` — `getCurrentRound` liefert
   `announced()`, `revealRound` liefert `announced({ me: aPlay(), payload: { description: 'x' } })`:
   nach dem Mount ist `revealRound` **einmal** gerufen und `stage.value` ist `'playing'`.
2. `'a game that wants a deliberate reveal waits for it'` — `game.requiresReveal = true`, `me: null`:
   `revealRound` **nicht** gerufen, `stage` ist `'sealed'`; nach `await reveal()` ist es `'playing'`.
3. `'a viewer who has already guessed lands on the result'` — `me: aPlay({ guessedAt: '…', points: 1 })`
   und `solution: { targetHue: 10, toleranceDeg: 10 }`: `stage` ist `'done'`, `revealRound` nicht gerufen.
4. `'no game means no stage to play'` — `game: null, noGameReason: 'AFTER_WINDOW'`: `stage` ist `'no-game'`.
5. `'a guess sends the round number it was shown'` — nach `await submit({ hue: 1 })` ist `submitGuess`
   mit `('team', 12, { hue: 1 })` gerufen.
6. `'a 409 reloads instead of claiming an error'` — `submitGuess` wirft `new ApiError(409, 'conflict')`
   (sieh `api/client.ts` für den echten Konstruktor), danach liefert `getCurrentRound` den
   `done`-Zustand: nach `await submit(...)` ist `stage` `'done'`, `notice.value` gesetzt, und
   `getCurrentRound` wurde ein zweites Mal gerufen.

Run: `cd webapp-vue && pnpm test useRound` → FAIL, das Composable fehlt.

- [ ] **Step 5: Das Composable schreiben**

`webapp-vue/src/rounds/useRound.ts`:

```ts
import { computed, onMounted, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { ApiError } from '@/api/client'
import { getCurrentRound, revealRound, submitGuess } from '@/api/rounds'
import type { RoundResponse } from '@/api/types'

/** Which of the card's faces the current answer calls for. */
export type RoundStage = 'no-game' | 'sealed' | 'playing' | 'done'

export function useRound(slug: string): {
  round: Ref<RoundResponse | null>
  state: Ref<'loading' | 'ready' | 'failed'>
  stage: ComputedRef<RoundStage>
  busy: Ref<boolean>
  notice: Ref<string | null>
  reveal: () => Promise<void>
  submit: (guess: unknown) => Promise<void>
  reload: () => Promise<void>
} {
  const round = ref<RoundResponse | null>(null)
  const state = ref<'loading' | 'ready' | 'failed'>('loading')
  const busy = ref(false)
  const notice = ref<string | null>(null)

  /**
   * Derived, never stored: a local „I have guessed“ can disagree with the server, the answer cannot.
   * `sealed` is the only face that exists because a *game* asked for it.
   */
  const stage = computed<RoundStage>(() => {
    const current = round.value
    if (current === null || current.game === null) return 'no-game'
    if (current.me === null) return 'sealed'
    return current.me.guessedAt === null ? 'playing' : 'done'
  })

  async function reload(): Promise<void> {
    round.value = await getCurrentRound(slug)
  }

  /**
   * A game that needs no deliberate reveal is revealed as soon as its card exists — that is what keeps
   * `revealed_at` meaning „the payload went out“ rather than „some page was fetched“, and it is why the
   * `GET` stays read-only.
   */
  async function load(): Promise<void> {
    state.value = 'loading'
    try {
      await reload()
      const game = round.value?.game ?? null
      if (game !== null && round.value?.me == null && !game.requiresReveal) {
        round.value = await revealRound(slug)
      }
      state.value = 'ready'
    } catch (err) {
      console.error('[round] failed to load', err)
      state.value = 'failed'
    }
  }

  async function reveal(): Promise<void> {
    await run(async () => {
      round.value = await revealRound(slug)
    })
  }

  async function submit(guess: unknown): Promise<void> {
    const number = round.value?.round?.number
    if (number === undefined) return
    await run(async () => {
      round.value = await submitGuess(slug, number, guess)
    })
  }

  /**
   * A 409 is not an error to show: the round moved on, or it was already revealed or already guessed.
   * In every one of those cases the server knows better, so refetch and render the truth with one line
   * of explanation instead of a failure the player cannot act on.
   */
  async function run(action: () => Promise<void>): Promise<void> {
    busy.value = true
    notice.value = null
    try {
      await action()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        notice.value = 'Die Runde hat sich geändert — hier ist der aktuelle Stand.'
        await reload().catch((e) => console.error('[round] reload after 409 failed', e))
      } else {
        console.error('[round] action failed', err)
        notice.value = 'Das hat nicht funktioniert. Versuch es nochmal.'
      }
    } finally {
      busy.value = false
    }
  }

  onMounted(load)
  return { round, state, stage, busy, notice, reveal, submit, reload }
}
```

- [ ] **Step 6: Tests laufen lassen und committen**

Run: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add webapp-vue/src/api webapp-vue/src/rounds
git commit -m "feat(rounds): add the round's api module and its derived stages"
```

---

## Task 5: Die Karte an der Community-Seite

Nach dieser Task spielt ein Spieler die Runde auf der Seite seiner Community: aufdecken (wenn das Spiel es verlangt), tippen, Auflösung sehen — und die Punkte in der Mitgliederzeile stehen danach richtig da.

**Files:**
- Create: `webapp-vue/src/rounds/RoundCard.vue`
- Modify: `webapp-vue/src/pages/c/[slug]/index.vue`
- Test: `webapp-vue/src/rounds/__tests__/RoundCard.spec.ts`
- Test: `webapp-vue/src/pages/c/[slug]/__tests__/index.spec.ts`

**Interfaces:**
- Consumes: `useRound(slug)` samt `RoundStage`, `gameComponents` aus `@/games/registry`, `GameEntry`, `useRoster(slug)` (hat bereits `reload()`), `RoundFallback` (Props `community`, `members`).
- Produces: `RoundCard` mit den Props `slug: string`, dem Emit `guessed: []`, und den Test-Handles `round-reveal`, `round-award`, `round-notice`, `round-unrenderable`.

- [ ] **Step 1: Den Kartentest schreiben**

`webapp-vue/src/rounds/__tests__/RoundCard.spec.ts`, mit gemocktem `@/rounds/useRound` und gemockter
Registry. Für die Stub-Komponente gilt dieselbe Hoisting-Falle wie in `lab-page.spec.ts`: definiere sie
in der `vi.mock`-Fabrik oder über `vi.hoisted`. Die Fälle:

1. `'shows the game and a reveal button while the round is sealed'` — `stage: 'sealed'`:
   `[data-test="round-reveal"]` existiert, das Stub-Spiel nicht; ein Klick ruft `reveal()`.
2. `'hands the game its payload once the round is open'` — `stage: 'playing'`: das Stub-Spiel ist da und
   bekommt `payload` und `myGuess`, `disabled` ist `false`; sein `guess`-Emit ruft `submit(value)`.
3. `'shows the result once the viewer has guessed'` — `stage: 'done'`: das Stub-Spiel bekommt `solution`,
   `entries` beginnt mit dem eigenen Eintrag, und `disabled` ist `true`.
4. `'names the stake, and calls it provisional under closest-only'` — `awardRule: 'CLOSEST_ONLY'`,
   `awardPoints: 2`, `me.points: 2`: `[data-test="round-award"]` nennt die 2 und den vorläufigen
   Charakter; mit `awardRule: 'ALL_QUALIFYING'` nennt derselbe Knoten ihn **nicht**.
5. `'emits guessed so the page can refresh the standings'` — nach dem `guess`-Emit des Stubs ist
   `guessed` emittiert.
6. `'shows the notice when the server refused'` — `notice` gesetzt ⇒ `[data-test="round-notice"]` sichtbar.
7. `'says so when no renderer is registered for the announced game'` — `game.id: 'unknown-game'`,
   `stage: 'playing'` ⇒ `[data-test="round-unrenderable"]` statt einer leeren Karte.

- [ ] **Step 2: Test laufen lassen — er muss scheitern**

Run: `cd webapp-vue && pnpm test RoundCard`
Expected: FAIL, die Komponente fehlt.

- [ ] **Step 3: Die Karte schreiben**

`webapp-vue/src/rounds/RoundCard.vue`. Aufbau statt wörtlichem Code, weil Rahmen, Radius und Abstände am
Nachbarstil hängen — `src/communities/fallbacks/CountdownCard.vue` und `MessageCard.vue` sind die Vorlage:

- `const { round, stage, busy, notice, reveal, submit } = useRound(props.slug)`
- `const component = computed(() => { const id = round.value?.game?.id; return id === undefined ? null : (gameComponents[id] ?? null) })`
- `entries`: eigener Eintrag zuerst, dann `others` — dieselbe Reihenfolge, die die Lab-Seite baut, weil
  die Auflösung „mine first“ erwartet: `me ? [me, ...others] : others`.
- `stage === 'sealed'` → eine Karte mit dem Spielnamen aus `round.game.displayName` und einem Knopf
  (`data-test="round-reveal"`, `h-11` wie die übrigen Aktionen, `:disabled="busy"`), der `reveal()` ruft.
- `stage === 'playing' || stage === 'done'` → **dieselbe** `<component :is="component">`, weil die
  Spielkomponente selbst zwischen Brett und Auflösung umschaltet. Props: `payload`, `outcome`
  (`round.me?.outcome ?? null`), `myGuess` (`round.me?.guess ?? null`), `solution`, `entries`,
  `mineUserId` (`round.me?.userId ?? null`), `disabled` (`busy || stage === 'done'`); `@guess` ruft
  `submit(value)` und danach `emit('guessed')` — nur wenn der Tipp durchging, also nach dem `await`.
- `component === null` → `data-test="round-unrenderable"` mit einer nüchternen Meldung: der Server kennt
  ein Spiel, das dieser Build nicht rendert. Ein Betriebszustand, kein Spielerfehler.
- `notice` → `data-test="round-notice"`, eine Zeile über der Karte.
- Die Punktzeile (`data-test="round-award"`), sichtbar sobald `round.me?.points != null`: nennt die
  Punkte und, bei `awardRule === 'CLOSEST_ONLY'`, dass sie vorläufig sind. Vorschlag, deutsch mit `„…“`:
  bei `CLOSEST_ONLY` `Du hast 2 Punkte — bester Tipp bisher, das kann sich noch ändern.`, sonst
  `Du hast 1 Punkt.` Einzahl und Mehrzahl korrekt behandeln.

- [ ] **Step 4: Die Seite verdrahten**

Die Seite besitzt den Rundenzustand, nicht die Karte: `useRoster` liegt schon dort, und eine Karte, die
im `no-game`-Fall einen Countdown rendert, mischte zwei Zuständigkeiten. Also in
`src/pages/c/[slug]/index.vue` `useRound(community.value.slug)` **einmal** aufrufen, `stage` entscheiden
lassen und `RoundCard` die Rückgabe als Props geben — oder, wenn dir das zu viele Props sind, `useRound`
in der Karte lassen und die Seite nur nach `stage` fragen. Wähle **einen** Weg, halte die Karte dumm,
und schreib die Begründung in einen Satz Kommentar. Zwei Aufrufe von `useRound` sind kein Weg: das lädt
zweimal.

```vue
    <RoundCard v-if="stage !== 'no-game'" … class="mt-6" @guessed="reload" />
    <RoundFallback v-else :community="community" :members="settledMembers" class="mt-6" />
```

`reload` ist das `reload` aus `useRoster`. **Warum überhaupt:** `live` erscheint serverseitig erst, wenn
der Betrachter selbst getippt hat, und unter `CLOSEST_ONLY` verschiebt ein späterer, besserer Tipp fremde
Punkte — nach dem eigenen Tipp sind die Zahlen also in jedem Fall neu zu holen.

Solange die Runde lädt (`state === 'loading'`), darf die Seite nicht zwischen Karte und Fallback
springen: nimm den Platzhalter-Zweig, den die Seite für den Roster schon hat, als Vorbild.

- [ ] **Step 5: Den Seitentest ergänzen**

In `src/pages/c/[slug]/__tests__/index.spec.ts`, mit gemocktem `@/rounds/useRound` und `@/members/useRoster`:

1. `'shows the round card when the round has a game'` — `stage: 'playing'` ⇒ `RoundCard` da,
   `RoundFallback` nicht.
2. `'falls back to the countdown when the round has no game'` — `stage: 'no-game'` ⇒ umgekehrt.
3. `'reloads the roster after a guess'` — die Karte emittiert `guessed`, `useRoster`s `reload` wurde gerufen.

- [ ] **Step 6: Alles laufen lassen und committen**

Run: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add webapp-vue/src
git commit -m "feat(rounds): play the round on the community page"
```

---

## Task 6: Regeln festhalten und die Spec schließen

**Files:**
- Modify: `.claude/guidelines/game-rounds.md`
- Modify: `.claude/guidelines/frontend-state.md`
- Modify: `docs/superpowers/specs/2026-08-14-round-frontend-design.md`

- [ ] **Step 1: `game-rounds.md` ergänzen**

Zwei Absätze, im Ton der Datei:

- **Der Reveal-Schalter.** Eine Frage mit echter Varianz je Spiel gehört ins Spiel und bekommt keinen
  Default, wenn die bequeme Richtung die unsichere ist. Dazu der Kontrast, den die Datei schon kennt: ein
  Schalter mit überall derselben richtigen Antwort ist ein Bug — der Unterschied ist nicht der
  Mechanismus, sondern ob es Varianz gibt. Und: „genau einmal“ ist ein `INSERT … ON CONFLICT DO NOTHING`,
  kein Lesen-dann-Prüfen.
- **Wer eine Runde adressiert, sagt welche.** „Die aktuelle“ ist über die Tagesgrenze hinweg nicht
  dasselbe für Client und Server; die Nummer mitzuschicken kostet ein Feld und verhindert ein Urteil
  gegen ein nie gesehenes Ziel.

- [ ] **Step 2: `frontend-state.md` ergänzen**

Ein Absatz: **Zustand aus der Antwort ableiten, nicht mitschreiben.** Die drei Gesichter der Rundenkarte
folgen aus `me`/`solution` statt aus lokalen Flags, weil ein lokales „schon getippt“ von der Serverwahrheit
abweichen kann und die Antwort nicht. Dazu die 409-Regel: kein Fehler, den man anzeigt, sondern ein
Signal, neu zu laden — der Server weiß es besser.

- [ ] **Step 3: Die Spec schließen**

Im Design-Dokument dieser Scheibe am Kopf in einem Satz festhalten, dass sie umgesetzt ist — so wie die
Runden-Spec es für ihre Scheiben tut. *Was bewusst offen bleibt* bleibt unverändert stehen. Kein neuer
Abschnitt.

- [ ] **Step 4: Prüfen, dass nichts Totes zitiert wird**

Run: `grep -rn "GuessHueLabGame" .claude/ webapp-vue/src docs/superpowers/specs || echo "clean"`
Erwartung: `clean` bis auf datierte Design-Dokumente, die ihren Stand von damals beschreiben.

- [ ] **Step 5: Committen**

```bash
git add .claude docs/superpowers/specs
git commit -m "docs: record the round frontend's rules - the reveal switch and derived state"
```

---

## Self-Review

**Spec-Deckung:**

| Spec-Abschnitt | Task |
|---|---|
| `requiresReveal` im Vertrag, ohne Default, `params` statt Phase | 1 |
| Guess Hue antwortet `false` in jeder Phase | 1 |
| „genau einmal“ per `ON CONFLICT DO NOTHING`, 409 | 1 |
| Das Flag erreicht den Client | 1 (`GameDto.requiresReveal`) |
| `awardRule`/`awardPoints` in der Antwort | 2 |
| Die Rundennummer am Tipp, 409 bei Abweichung | 2 |
| Eine Registry, ein Adapter, geteilt mit dem Lab | 3 |
| Drei Zustände, aus der Antwort abgeleitet | 4 (`stage`), 5 (Darstellung) |
| Impliziter Reveal bei `requiresReveal = false` | 4 |
| Wiederkehrer sieht sofort das Ergebnis | 4, 5 |
| `noGameReason` → Fallback; kein Renderer → eigene Meldung | 5 |
| Vorläufige Punkte unter `CLOSEST_ONLY` | 5 |
| Roster-Nachzug nach dem Tipp | 5 |
| Feed knowledge back | 6 |

**Typkonsistenz:** `GameDto.requiresReveal` (1) ⇄ TS `GameDto.requiresReveal` (4). `RoundResponse.awardRule`
(2) ⇄ TS-Literale `'ALL_QUALIFYING' | 'CLOSEST_ONLY'` (4) — die Enum-Namen reisen als String, die Literale
müssen exakt stimmen; ebenso `NoGameReason`. `GuessRequest(roundNumber, guess)` (2) ⇄ der Body von
`submitGuess` (4). `GameEntry` (3) ⇄ die `entries`, die `RoundCard` baut (5): `PlayDto` erfüllt die Form
strukturell, es braucht keine Abbildung. `RoundStage` (4) ⇄ die Zweige der Karte und der Seite (5).

**Drei Stellen, an denen dieser Plan bewusst eine Entscheidung offen lässt** — jede mit Regel:

1. Task 3 Step 5: weicht die Testzahl nach dem Umzug ab, ist das ein Fund, keine neue Erwartung.
2. Task 5 Step 3/4: wer den Rundenzustand besitzt und wie viele Props die Karte bekommt. Empfehlung samt
   Begründung steht da; abweichen ist erlaubt, aber begründungspflichtig — und zwei `useRound`-Aufrufe
   sind es nie.
3. Task 5 Step 3: die Textvorschläge für die Punktzeile sind Vorschläge. Anzeigetext gehört dem
   Menschen; weicht der Implementer ab, gehört die Fassung in den Report, nicht bloß in den Commit.

**Was bewusst draußen bleibt:** die Vorschau-Stufe vor dem Aufdecken, der Verlauf vergangener Runden,
Zeitwertung, und jede Form von Polling — ein späterer, besserer Tipp eines anderen Spielers wird erst
beim nächsten Laden sichtbar.
