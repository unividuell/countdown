# Guess Hue — Eingabeseite: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guess Hue im Game-Lab spielbar machen — Beschreibung lesen, Farbrad drehen, Mittelknopf halten, Winkel abgeben. Ohne Wertung.

**Architecture:** Der Lab-Adapter in `gamelab` ruft `GuessHueDataset.draw()` auf; ein neues Modulith-Modul entsteht nicht. Der `LabGame`-Vertrag wird an ein Spiel angepasst, das Guesses annimmt, aber nicht wertet. Im Frontend ist das Rad eine eigene Komponente ohne neue Dependency; reine Geometrie und die Halte-Mechanik liegen in eigenen Modulen, weil happy-dom kein Layout rechnet.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 / Jackson 3 / kotest + mockk · Vue 3 / TypeScript strict / Tailwind v4 / Vitest + @vue/test-utils + happy-dom / VueUse

**Spec:** [`docs/superpowers/specs/2026-08-08-guess-hue-input-design.md`](../specs/2026-08-08-guess-hue-input-design.md)

## Global Constraints

- **Quellcode ist Englisch** — Kommentare, KDoc, Bezeichner, Log- und Fehlermeldungen, Testnamen. Nutzertexte in der UI sind **Deutsch**. Commit-Messages sind Englisch. Siehe `.claude/guidelines/README.md#language`.
- **Commit-Messages enden mit** `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Niemals `git commit --amend`** — immer ein neuer Commit. HEAD gehört unter Umständen jemand anderem.
- **Der Klartext des Guess-Hue-Datensets erscheint nirgends im Repository** — nicht in Code, Test, Fixture, Commit-Message. Testdaten werden frei erfunden (`hue = 210, "Testeintrag"`), niemals aus `.local/` kopiert. Siehe `.claude/guidelines/game-content.md`.
- **Jede Lab-Bean trägt beide Gates:** `@Profile("!production")` **und** `@ConditionalOnProperty("app.game-lab.enabled")` — voller Schlüssel als Annotation-*value*, nie `prefix=`/`name=`.
- **`GuessHueDataset.draw()` wird nicht verändert.** Die Ziehreihenfolge ist ein Vertrag; jede Änderung ändert rückwirkend jede je aus einem Seed abgeleitete Runde.
- **Keine neue npm-Dependency.** Erlaubt ist ausschließlich, was `webapp-vue/package.json` bereits führt.
- **Animationen:** jede prüft **beides** — `prefers-reduced-motion` *und* `document.hidden` — und zeichnet im Zweifel den Endzustand direkt. Siehe `.claude/guidelines/frontend-state.md`.
- **happy-dom hat keine Web Animations API** (`Element.prototype.animate` ist `undefined`) und rechnet **kein Layout** (`getBoundingClientRect()` liefert Nullen). Jeder `el.animate(...)`-Aufruf braucht davor `typeof el.animate === 'function'`.
- **Tailwind v4, mobile-first.** Erst schmal bauen, dann mit `sm:`/`md:` erweitern. Tippziele ≥ 44 px. Keine `dark:`-Klassen — die App hat bislang keine einzige.

### Befehle

```bash
# Backend, eine Testklasse
cd core && ./mvnw test -Dtest=GuessHueLabGameTest

# Backend, alles (braucht Docker für Testcontainers)
cd core && ./mvnw test

# Frontend, eine Spec-Datei
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/geometry.spec.ts

# Frontend, alles + Typen + Lint
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

## File Structure

**Backend**

| Datei | Verantwortung |
| --- | --- |
| `core/…/gamelab/LabGame.kt` *(modify)* | `score` wird nullable; `revealsOthersBeforeGuess` kommt dazu |
| `core/…/gamelab/internal/LabRoundStore.kt` *(modify)* | `LabEntry.outcome` nullable |
| `core/…/gamelab/internal/LabDtos.kt` *(modify)* | `LabEntryDto.outcome` nullable |
| `core/…/gamelab/internal/LabService.kt` *(modify)* | hält `others` zurück, wenn das Spiel es verlangt |
| `core/…/gamelab/internal/SampleLabGame.kt` *(modify)* | erklärt `revealsOthersBeforeGuess = true` |
| `core/…/gamelab/internal/GuessHueLabGame.kt` *(create)* | Payload, Ziehung, Guess-Validierung |

**Frontend**

| Datei | Verantwortung |
| --- | --- |
| `webapp-vue/src/games/guesshue/geometry.ts` *(create)* | reine Funktionen: Winkel, Radius, Farbname |
| `webapp-vue/src/games/guesshue/wheel.ts` *(create)* | die Konstanten der Bewegung |
| `webapp-vue/src/games/guesshue/HueWheel.vue` *(create)* | das Rad |
| `webapp-vue/src/games/guesshue/GuessHueBoard.vue` *(create)* | die Spielkarte |
| `webapp-vue/src/ui/useHoldProgress.ts` *(create)* | Halte-Mechanik |
| `webapp-vue/src/ui/HoldButton.vue` *(create)* | Knopf mit Fortschrittsring |
| `webapp-vue/src/gamelab/GuessHueLabGame.vue` *(create)* | Adapter + vorläufige Tipp-Karte |
| `webapp-vue/src/gamelab/types.ts` *(modify)* | `GuessHuePayload` |
| `webapp-vue/src/gamelab/games.ts` *(modify)* | Registrierung |
| `webapp-vue/src/gamelab/LabEntries.vue` *(modify)* | kein `→ null` |
| `webapp-vue/src/gamelab/SampleGame.vue` *(modify)* | nimmt `myGuess` entgegen |
| `webapp-vue/src/pages/c/[slug]/lab/[game].vue` *(modify)* | reicht `myGuess` durch |

---

## Task 1: Der Lab-Vertrag lässt ein Spiel schweigen

Ein Spiel, das Guesses annimmt ohne sie zu werten, und eines, das die Einträge der anderen erst nach dem eigenen Guess zeigt. Beides sind Vertragsänderungen am Lab — das Lab passt sich an, das Spiel nicht.

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/LabGame.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabRoundStore.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/SampleLabGame.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt`

**Interfaces:**
- Produces: `LabGame.score(seed: Int, guess: JsonNode): LabOutcome?` · `LabGame.revealsOthersBeforeGuess: Boolean` (abstrakt, **ohne** Default) · `LabEntry.outcome: LabOutcome?` · `LabEntryDto.outcome: LabOutcome?`

- [ ] **Step 1: Write the failing test**

An `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt` anhängen — die Imports oben in der Datei entsprechend ergänzen (`LabGame`, `LabOutcome`, `LabPayload`, `JsonNode` sind teils schon da):

```kotlin
    /**
     * A game that accepts guesses without scoring them and hides the other testers until the
     * viewer has guessed — the shape Guess Hue needs. Declared here rather than by flipping
     * `SampleLabGame`, whose open behaviour is itself documented and tested.
     */
    private object SecretivePayload : LabPayload

    private class SecretiveGame : LabGame {
        override val id = "secretive"
        override val displayName = "Verschwiegen"
        override val revealsOthersBeforeGuess = false
        override fun reveal(seed: Int) = SecretivePayload
        override fun score(seed: Int, guess: JsonNode): LabOutcome? = null
    }

    private val secretive = SecretiveGame()
    private val secretiveService =
        LabService(communities, memberships, users, store, listOf(secretive))

    @Test
    fun `a game that hides the others shows none of them before I have guessed`() {
        grantAccess()
        secretiveService.guess(
            "team", "secretive", 42, bob.id!!, isSuperAdmin = false, mapper.readTree("""{}"""),
        )

        val response = secretiveService.open("team", "secretive", 42, alice.id!!, isSuperAdmin = false)

        response.me.shouldBeNull()
        response.others.shouldBeEmpty()
    }

    @Test
    fun `a game that hides the others shows them once I have guessed`() {
        grantAccess()
        secretiveService.guess(
            "team", "secretive", 42, bob.id!!, isSuperAdmin = false, mapper.readTree("""{}"""),
        )

        val response = secretiveService.guess(
            "team", "secretive", 42, alice.id!!, isSuperAdmin = false, mapper.readTree("""{}"""),
        )

        response.me.shouldNotBeNull()
        response.others.map { it.username } shouldContainExactly listOf("bob")
    }

    @Test
    fun `a game that does not score stores an entry without an outcome`() {
        grantAccess()

        val response = secretiveService.guess(
            "team", "secretive", 42, alice.id!!, isSuperAdmin = false, mapper.readTree("""{}"""),
        )

        response.me.shouldNotBeNull().outcome.shouldBeNull()
    }

    @Test
    fun `the sample game keeps showing the others before I have guessed`() {
        // The default-free property means this stays a decision, not an inheritance.
        grantAccess()
        val payload = game.reveal(42) as SamplePayload
        service.guess(
            "team", "sample", 42, bob.id!!, isSuperAdmin = false,
            mapper.readTree("""{"value":${payload.lowerBound}}"""),
        )

        val response = service.open("team", "sample", 42, alice.id!!, isSuperAdmin = false)

        response.others.map { it.username } shouldContainExactly listOf("bob")
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd core && ./mvnw test -Dtest=LabServiceTest
```

Erwartet: **Compile-Fehler**. `SecretiveGame` überschreibt ein `revealsOthersBeforeGuess`, das es noch nicht gibt, und ihr `score` gibt `LabOutcome?` zurück, wo `LabOutcome` verlangt ist. Das ist der korrekte rote Zustand für eine Vertragsänderung.

- [ ] **Step 3: Widen the contract in `LabGame.kt`**

`score`s Signatur und KDoc ersetzen und die neue Property ergänzen:

```kotlin
    /**
     * Whether the other testers' entries are visible before the viewer has guessed.
     *
     * **There is deliberately no default.** Every game states it, because inheriting it is exactly
     * the mistake: a game whose only feedback is another player's guess gives the round away to
     * whoever reads the list first. Decide it per game, with the anti-cheat spec in hand.
     */
    val revealsOthersBeforeGuess: Boolean

    /**
     * Re-derives the solution from [seed] and scores [guess]. Never trusts the client.
     *
     * Returns `null` for a game that accepts and **validates** guesses without scoring them yet —
     * the guess is stored, the entry simply carries no outcome. Rejecting an invalid guess stays
     * this method's job either way: [LabService] calls it before the store, so a malformed guess
     * must throw rather than return `null`.
     */
    fun score(seed: Int, guess: JsonNode): LabOutcome?
```

- [ ] **Step 4: Thread the nullable outcome through store and DTO**

In `LabRoundStore.kt`:

```kotlin
data class LabEntry(
    val userId: UUID,
    val guess: JsonNode,
    /** `null` where the game accepts guesses without scoring them. */
    val outcome: LabOutcome?,
    /** Display order only — never a score. Timing is deliberately out of scope for the lab. */
    val at: Instant,
)
```

und in derselben Datei die Signatur von `record`:

```kotlin
    fun record(
        communityId: UUID,
        gameId: String,
        seed: Int,
        userId: UUID,
        guess: JsonNode,
        outcome: LabOutcome?,
    ): RecordResult {
```

In `LabDtos.kt`:

```kotlin
data class LabEntryDto(
    val userId: UUID,
    val username: String,
    val avatar: Avatar,
    val guess: JsonNode,
    val outcome: LabOutcome?,
    val at: Instant,
)
```

- [ ] **Step 5: Withhold `others` in `LabService.respond`**

Den `return LabRoundResponse(...)`-Block in `respond` ersetzen:

```kotlin
        val mine = dtos.firstOrNull { it.userId == me }
        return LabRoundResponse(
            seed = snapshot.seed,
            game = game.id,
            displayName = game.displayName,
            payload = game.reveal(seed),
            me = mine,
            // Withheld, not filtered client-side: a payload the browser never receives cannot be
            // read out of the network tab either.
            others = if (mine == null && !game.revealsOthersBeforeGuess) {
                emptyList()
            } else {
                dtos.filter { it.userId != me }
            },
            tookOverRound = snapshot.tookOverRound,
        )
```

- [ ] **Step 6: Make the sample game state its choice**

In `SampleLabGame.kt`, direkt unter `override val displayName`:

```kotlin
    /**
     * The lab's stand-in has no competitive stake, so the whole round stays visible — that is what
     * makes it useful for watching two testers at once. A real game decides this on its own terms;
     * see the class KDoc above.
     */
    override val revealsOthersBeforeGuess = true
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd core && ./mvnw test -Dtest='LabServiceTest,LabRoundStoreTest,SampleLabGameTest,LabControllerTest,LabDisabledTest'
```

Erwartet: PASS, alle fünf Klassen.

- [ ] **Step 8: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/gamelab core/src/test/kotlin/org/unividuell/countdown/core/gamelab
git commit -m "$(cat <<'EOF'
feat(gamelab): let a game accept guesses it does not score, and hide the others

Two contract changes a real game needs and the stand-in never did. `score()`
returns a nullable outcome, so a game can validate a guess and store it
without judging it — rejecting a malformed guess stays the same throw.

`revealsOthersBeforeGuess` has no default on purpose. Where the only feedback
in a round is somebody else's guess, the entry list hands the answer to
whoever reads it first, and a default would be an invitation to inherit that
rather than decide it. The sample now states its own answer out loud.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `GuessHueLabGame`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/GuessHueLabGame.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/GuessHueLabGameTest.kt`

**Interfaces:**
- Consumes: `LabGame` aus Task 1 (nullable `score`, `revealsOthersBeforeGuess`); `GuessHueDataset.draw(SeededRandom): GuessHueTarget`; `SeededRandom.fromSeed(Int)`
- Produces: `GuessHuePayload(description: String, initHue: Double, saturation: Double, lightness: Double)` · Lab-Spiel-Id `"guess-hue"` · Guess-Form `{"hue": <number>}`

- [ ] **Step 1: Write the failing test**

Create `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/GuessHueLabGameTest.kt`:

```kotlin
package org.unividuell.countdown.core.gamelab

import tools.jackson.module.kotlin.jacksonObjectMapper
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.comparables.shouldBeGreaterThanOrEqualTo
import io.kotest.matchers.comparables.shouldBeLessThan
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.gamelab.internal.GuessHueLabGame
import org.unividuell.countdown.core.gamelab.internal.GuessHuePayload
import org.unividuell.countdown.core.gamelab.internal.InvalidGuessException
import org.unividuell.countdown.core.guesshue.GuessHueDataset
import org.unividuell.countdown.core.guesshue.GuessHueDifficulty
import org.unividuell.countdown.core.guesshue.GuessHueEntry
import org.unividuell.countdown.core.rng.SeededRandom

class GuessHueLabGameTest {

    // Invented entries. Real descriptions are a secret and never appear in this repository —
    // see .claude/guidelines/game-content.md.
    private val dataset = GuessHueDataset(
        listOf(
            GuessHueEntry(hue = 0, difficulty = GuessHueDifficulty.EASY, description = "Testeintrag A."),
            GuessHueEntry(hue = 120, difficulty = GuessHueDifficulty.MEDIUM, description = "Testeintrag B."),
            GuessHueEntry(hue = 210, difficulty = GuessHueDifficulty.HARD, description = "Testeintrag C."),
        ),
    )
    private val game = GuessHueLabGame(dataset)
    private val mapper = jacksonObjectMapper()

    private fun guessOf(raw: String) = mapper.readTree(raw)

    @Test
    fun `the payload carries the description and the starting colour and nothing else`() {
        // Pins the field set, not the absence of the answer: a field that merely narrows the
        // target hue would slip past an "is the answer absent" assertion.
        val json = mapper.writeValueAsString(game.reveal(4711))
        val fields = mapper.readTree(json).propertyNames().toSet()

        fields shouldBe setOf("description", "initHue", "saturation", "lightness")
    }

    @Test
    fun `the payload matches what the dataset drew for that seed`() {
        // Re-derives the round exactly as the game does. The duplication pins the draw order:
        // reordering GuessHueDataset.draw breaks this test instead of silently rewriting every
        // round ever derived from a stored seed.
        val target = dataset.draw(SeededRandom.fromSeed(4711))

        val payload = game.reveal(4711) as GuessHuePayload

        payload.description shouldBe target.entry.description
        payload.initHue shouldBe target.initHue
        payload.saturation shouldBe target.saturation
        payload.lightness shouldBe target.lightness
    }

    @Test
    fun `the same seed reveals the same payload`() {
        game.reveal(4711) shouldBe game.reveal(4711)
    }

    @Test
    fun `the starting angle stays on the circle`() {
        val angles = (1..50).map { (game.reveal(it) as GuessHuePayload).initHue }

        // Checked in plain arithmetic and asserted once — an assertion per draw would measure the
        // harness rather than the subject.
        angles.min() shouldBeGreaterThanOrEqualTo 0.0
        angles.max() shouldBeLessThan 360.0
    }

    @Test
    fun `a valid guess is accepted and not scored`() {
        game.score(4711, guessOf("""{"hue":214.37}""")).shouldBeNull()
    }

    @Test
    fun `a guess without the hue field is rejected`() {
        shouldThrow<InvalidGuessException> { game.score(4711, guessOf("""{}""")) }
    }

    @Test
    fun `a guess that is not a number is rejected`() {
        shouldThrow<InvalidGuessException> { game.score(4711, guessOf("""{"hue":"blau"}""")) }
    }

    @Test
    fun `a negative angle is rejected`() {
        shouldThrow<InvalidGuessException> { game.score(4711, guessOf("""{"hue":-0.1}""")) }
    }

    @Test
    fun `a full turn is rejected because it is the same angle as zero`() {
        shouldThrow<InvalidGuessException> { game.score(4711, guessOf("""{"hue":360.0}""")) }
    }

    @Test
    fun `the others stay hidden until the viewer has guessed`() {
        // Without scoring, another tester's angle is the only signal in the round — and a strong
        // one, because they read the same description.
        game.revealsOthersBeforeGuess shouldBe false
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd core && ./mvnw test -Dtest=GuessHueLabGameTest
```

Erwartet: Compile-Fehler — `GuessHueLabGame` und `GuessHuePayload` gibt es nicht.

- [ ] **Step 3: Write the implementation**

Create `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/GuessHueLabGame.kt`:

```kotlin
package org.unividuell.countdown.core.gamelab.internal

import tools.jackson.databind.JsonNode
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.gamelab.LabGame
import org.unividuell.countdown.core.gamelab.LabOutcome
import org.unividuell.countdown.core.gamelab.LabPayload
import org.unividuell.countdown.core.guesshue.GuessHueDataset
import org.unividuell.countdown.core.rng.SeededRandom

/**
 * What the player needs in order to play: the text, and the colour the wheel starts on.
 *
 * `GuessHueTarget.hue` — the answer — is absent, and so is anything it could be derived from. The
 * starting angle is drawn independently of the target, so it narrows nothing; saturation and
 * lightness are the same for every angle on the wheel.
 */
data class GuessHuePayload(
    val description: String,
    val initHue: Double,
    /** Fractions, not percent: `hsl()` in the browser takes them as-is, hex would need converting. */
    val saturation: Double,
    val lightness: Double,
) : LabPayload

/**
 * Guess Hue in the lab: the input side only.
 *
 * It draws through the `guesshue` module's public API and adds nothing of its own — the round is
 * `GuessHueDataset.draw`, unchanged, so what the lab shows is what the real game will show. Per
 * the lab's direction rule, this adapter lives here and `guesshue` knows nothing about it.
 *
 * Guesses are accepted, validated and stored; they are **not** scored. Tolerance, points and the
 * view after the round are the game framework's decisions, and this class must not pre-empt them.
 */
@Component
@Profile("!production")
@ConditionalOnProperty("app.game-lab.enabled")
class GuessHueLabGame(private val dataset: GuessHueDataset) : LabGame {

    override val id = "guess-hue"
    override val displayName = "Farbausmalung"

    /**
     * Without scoring, another tester's angle is the only signal the round carries — and whoever
     * produced it had read the same description. Showing it to someone who has not guessed yet
     * would simply be the answer.
     */
    override val revealsOthersBeforeGuess = false

    override fun reveal(seed: Int): GuessHuePayload {
        val target = dataset.draw(SeededRandom.fromSeed(seed))
        return GuessHuePayload(
            description = target.entry.description,
            initHue = target.initHue,
            saturation = target.saturation,
            lightness = target.lightness,
        )
    }

    /**
     * Validates only. `null` means "accepted, not scored" — see [LabGame.score].
     *
     * The angle is checked as a number in `[0, 360)`, not as an integer: an angle is not an
     * enumeration, and an input method with a finer resolution must not fail here.
     */
    override fun score(seed: Int, guess: JsonNode): LabOutcome? {
        val hue = guess.get("hue")
            ?.takeIf { it.isNumber }
            ?.asDouble()
            ?: throw InvalidGuessException("guess must carry a numeric 'hue'")
        if (hue < 0.0 || hue >= 360.0) throw InvalidGuessException("hue must lie in [0, 360), was $hue")
        return null
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd core && ./mvnw test -Dtest=GuessHueLabGameTest
```

Erwartet: PASS, 10 Tests.

- [ ] **Step 5: Run the module and context tests**

```bash
cd core && ./mvnw test -Dtest='ModularityTests,LabControllerTest,LabDisabledTest'
```

Erwartet: PASS, ohne Änderung an beiden. `ModularityTests` beweist, dass `gamelab` nur die öffentliche API von `guesshue` benutzt. `LabDisabledTest` prüft **paketweit**, dass mit abgeschaltetem Lab keine `gamelab`-Bean existiert — es zählt keine Spiele auf und muss deshalb nicht mitgepflegt werden. Wird es trotzdem rot, fehlt eines der beiden Gates an `GuessHueLabGame`; dann das Gate reparieren, nie den Test.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/GuessHueLabGame.kt core/src/test/kotlin/org/unividuell/countdown/core/gamelab/GuessHueLabGameTest.kt
git commit -m "$(cat <<'EOF'
feat(gamelab): draw a Guess Hue round for the lab

The dataset module already draws the whole round, so the adapter is the draw
plus a payload that leaves the answer behind. It needs no module of its own,
and `guesshue` needs no knowledge of the lab.

Guesses are validated and stored, never scored: tolerance and points belong
to the game framework, and deciding them here would pre-empt it. The angle is
checked as a number in [0, 360) rather than an integer — an angle is not an
enumeration.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Die Geometrie des Rades

Reine Funktionen, ausgelagert, weil happy-dom kein Layout rechnet: `getBoundingClientRect()` liefert dort Nullen, Zeigermathe wäre im Komponententest nicht prüfbar.

**Files:**
- Create: `webapp-vue/src/games/guesshue/geometry.ts`
- Create: `webapp-vue/src/games/guesshue/wheel.ts`
- Test: `webapp-vue/src/games/guesshue/__tests__/geometry.spec.ts`

**Interfaces:**
- Produces: `wrap360(deg: number): number` · `angleFromPoint(x: number, y: number, box: Box): number` · `radiusFraction(x: number, y: number, box: Box): number` · `hueName(hue: number): string` · `interface Box { left: number; top: number; width: number; height: number }` · Konstanten `BOOT_SWEEP_MS`, `BOOT_TRAIL_MS`, `HOLD_MS`, `DEAD_ZONE_FRACTION`

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/games/guesshue/__tests__/geometry.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { angleFromPoint, hueName, radiusFraction, wrap360 } from '@/games/guesshue/geometry'

/** A 200x200 wheel whose centre sits at (150, 250). */
const BOX = { left: 50, top: 150, width: 200, height: 200 }

describe('wrap360', () => {
  it('leaves an angle on the circle alone', () => {
    expect(wrap360(0)).toBe(0)
    expect(wrap360(359.5)).toBe(359.5)
  })

  it('folds a full turn back to zero', () => {
    expect(wrap360(360)).toBe(0)
    expect(wrap360(725)).toBe(5)
  })

  it('folds a negative angle forwards, not to a negative remainder', () => {
    // `-10 % 360` is -10 in JS; a bare modulo would put the knob nowhere.
    expect(wrap360(-10)).toBe(350)
    expect(wrap360(-370)).toBe(350)
  })
})

describe('angleFromPoint', () => {
  it('reads zero straight above the centre', () => {
    expect(angleFromPoint(150, 100, BOX)).toBe(0)
  })

  it('grows clockwise through the four axes', () => {
    expect(angleFromPoint(250, 250, BOX)).toBe(90)
    expect(angleFromPoint(150, 400, BOX)).toBe(180)
    expect(angleFromPoint(50, 250, BOX)).toBe(270)
  })

  it('reads the diagonals', () => {
    expect(angleFromPoint(250, 150, BOX)).toBeCloseTo(45)
    expect(angleFromPoint(250, 350, BOX)).toBeCloseTo(135)
    expect(angleFromPoint(50, 350, BOX)).toBeCloseTo(225)
    expect(angleFromPoint(50, 150, BOX)).toBeCloseTo(315)
  })

  it('never answers with a negative angle', () => {
    // The upper left quadrant is where atan2 goes negative.
    expect(angleFromPoint(100, 200, BOX)).toBeGreaterThanOrEqual(0)
    expect(angleFromPoint(100, 200, BOX)).toBeLessThan(360)
  })
})

describe('radiusFraction', () => {
  it('is zero at the centre', () => {
    expect(radiusFraction(150, 250, BOX)).toBe(0)
  })

  it('is one at the edge', () => {
    expect(radiusFraction(250, 250, BOX)).toBeCloseTo(1)
  })

  it('is a half half way out', () => {
    expect(radiusFraction(150, 200, BOX)).toBeCloseTo(0.5)
  })

  it('answers zero for a box without size, rather than dividing by zero', () => {
    // Exactly what happy-dom hands every component test.
    expect(radiusFraction(0, 0, { left: 0, top: 0, width: 0, height: 0 })).toBe(0)
  })
})

describe('hueName', () => {
  it('names the twelve anchors', () => {
    expect(hueName(0)).toBe('Rot')
    expect(hueName(120)).toBe('Grün')
    expect(hueName(240)).toBe('Blau')
    expect(hueName(330)).toBe('Pink')
  })

  it('snaps to the nearest anchor', () => {
    expect(hueName(14)).toBe('Rot')
    expect(hueName(16)).toBe('Orange')
  })

  it('wraps past the last anchor back to the first', () => {
    expect(hueName(350)).toBe('Rot')
    expect(hueName(359.9)).toBe('Rot')
  })

  it('accepts an angle off the circle', () => {
    expect(hueName(-10)).toBe('Rot')
    expect(hueName(480)).toBe('Grün')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/geometry.spec.ts
```

Erwartet: FAIL — `Failed to resolve import "@/games/guesshue/geometry"`.

- [ ] **Step 3: Write the implementation**

Create `webapp-vue/src/games/guesshue/geometry.ts`:

```ts
/**
 * The wheel's arithmetic, kept out of the component on purpose: happy-dom computes no layout, so
 * `getBoundingClientRect()` answers zeroes there and pointer maths is untestable inside a mounted
 * component. Here it can be tested against a box we state ourselves.
 */

/** The part of a `DOMRect` the wheel needs. */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Folds any angle onto `[0, 360)`. `%` alone keeps the sign, which puts the knob nowhere. */
export function wrap360(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/**
 * The angle from the box's centre to the point, in degrees **clockwise from the top** — the same
 * origin and direction as CSS `conic-gradient`, so the ring needs no offset.
 *
 * `atan2` measures from the positive x axis, and screen y grows downwards, which already makes it
 * clockwise; `+ 90` moves the origin from the right to the top.
 */
export function angleFromPoint(x: number, y: number, box: Box): number {
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  return wrap360((Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90)
}

/**
 * How far the point sits from the centre, as a fraction of the wheel's radius — 0 at the centre,
 * 1 at the edge. Used for the dead zone: near the centre a millimetre of finger movement is a
 * ninety-degree jump in [angleFromPoint].
 */
export function radiusFraction(x: number, y: number, box: Box): number {
  const radius = Math.min(box.width, box.height) / 2
  if (radius <= 0) return 0
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  return Math.hypot(x - cx, y - cy) / radius
}

/**
 * German colour names on a 30° grid.
 *
 * This is screen-reader parity, not a hint: whoever sees the wheel reads the same information off
 * the colour in its centre. The grid stays coarse for exactly that reason — a finer vocabulary
 * would tell a screen-reader user more than the picture does.
 */
const HUE_NAMES = [
  'Rot',
  'Orange',
  'Gelb',
  'Gelbgrün',
  'Grün',
  'Blaugrün',
  'Türkis',
  'Azurblau',
  'Blau',
  'Violett',
  'Magenta',
  'Pink',
] as const

export function hueName(hue: number): string {
  return HUE_NAMES[Math.round(wrap360(hue) / 30) % HUE_NAMES.length]!
}
```

- [ ] **Step 4: Write the constants module**

Create `webapp-vue/src/games/guesshue/wheel.ts`:

```ts
/**
 * The timings and proportions of the wheel, in one place so they can be tuned in the lab without
 * hunting through components.
 */

/** One full turn of the knob while the ring paints itself behind it. */
export const BOOT_SWEEP_MS = 800

/**
 * How far the painted ring trails the knob. This gap is the whole effect: it turns the knob into a
 * comet head and the ring into its trail. Too small and they move as one block.
 */
export const BOOT_TRAIL_MS = 70

/**
 * How long the confirm button must be held.
 *
 * The original held for 2000 ms, which reads long on the second attempt. This is the number to
 * turn while playing in the lab — it is the whole reason the lab exists.
 */
export const HOLD_MS = 1200

/**
 * The dead zone in the wheel's centre, as a fraction of the radius. It is the confirm button's own
 * radius: the button covers 30 % of the wheel's width, so what it catches, the wheel ignores.
 */
export const DEAD_ZONE_FRACTION = 0.3
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/geometry.spec.ts
```

Erwartet: PASS, 15 Tests.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/games/guesshue
git commit -m "$(cat <<'EOF'
feat(guess-hue): add the wheel's geometry and timings

Pointer maths lives in its own module because happy-dom computes no layout:
inside a mounted component every rect is zeroes and none of this could be
tested. Here it is checked against a box the test states itself.

Angles run clockwise from the top, the same origin as CSS conic-gradient, so
the ring needs no offset anywhere. The dead-zone fraction is the confirm
button's own radius — what the button catches, the wheel ignores.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Die Halte-Mechanik

**Files:**
- Create: `webapp-vue/src/ui/useHoldProgress.ts`
- Test: `webapp-vue/src/ui/__tests__/useHoldProgress.spec.ts`

**Interfaces:**
- Produces: `useHoldProgress(durationMs: number, onComplete: () => void): { progress: Readonly<Ref<number>>; holding: Readonly<Ref<boolean>>; start(): void; cancel(): void }`

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/ui/__tests__/useHoldProgress.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useHoldProgress } from '@/ui/useHoldProgress'

/**
 * The composable registers a `visibilitychange` listener through VueUse, which needs an effect
 * scope — so it is exercised inside a throwaway component rather than called bare.
 */
function mountHold(durationMs = 1000) {
  const onComplete = vi.fn()
  let api!: ReturnType<typeof useHoldProgress>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useHoldProgress(durationMs, onComplete)
        return () => h('div')
      },
    }),
  )
  return { api, onComplete, wrapper }
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('useHoldProgress', () => {
  beforeEach(() => {
    // rAF is what drives the loop; the default fake set does not cover it.
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    setHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    setHidden(false)
  })

  it('starts at rest', () => {
    const { api } = mountHold()

    expect(api.progress.value).toBe(0)
    expect(api.holding.value).toBe(false)
  })

  it('fills while held and completes exactly once', () => {
    const { api, onComplete } = mountHold(1000)

    api.start()
    vi.advanceTimersByTime(500)
    expect(api.progress.value).toBeGreaterThan(0.3)
    expect(api.progress.value).toBeLessThan(1)
    expect(onComplete).not.toHaveBeenCalled()

    vi.advanceTimersByTime(700)
    expect(api.progress.value).toBe(1)
    expect(api.holding.value).toBe(false)
    expect(onComplete).toHaveBeenCalledTimes(1)

    // The loop is stopped, not merely idle — no second completion can arrive later.
    vi.advanceTimersByTime(5000)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('runs back down when released early and never completes', () => {
    const { api, onComplete } = mountHold(1000)

    api.start()
    vi.advanceTimersByTime(400)
    const peak = api.progress.value
    api.cancel()
    vi.advanceTimersByTime(100)

    expect(api.progress.value).toBeLessThan(peak)
    vi.advanceTimersByTime(2000)
    expect(api.progress.value).toBe(0)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('starts a fresh attempt after a completed one', () => {
    const { api, onComplete } = mountHold(1000)

    api.start()
    vi.advanceTimersByTime(1200)
    expect(api.progress.value).toBe(1)

    api.start()
    expect(api.progress.value).toBe(0)
    vi.advanceTimersByTime(1200)
    expect(onComplete).toHaveBeenCalledTimes(2)
  })

  it('abandons the hold when the tab goes to the background', () => {
    // rAF does not run in a background tab, so a hold left standing would resume from a stale
    // start and complete for someone who is not looking.
    const { api, onComplete } = mountHold(1000)

    api.start()
    vi.advanceTimersByTime(900)
    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(api.holding.value).toBe(false)
    expect(api.progress.value).toBe(0)

    setHidden(false)
    vi.advanceTimersByTime(5000)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('stops the loop when its scope is torn down', () => {
    const { api, wrapper } = mountHold(1000)

    api.start()
    vi.advanceTimersByTime(100)
    wrapper.unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd webapp-vue && pnpm exec vitest run src/ui/__tests__/useHoldProgress.spec.ts
```

Erwartet: FAIL — `Failed to resolve import "@/ui/useHoldProgress"`.

- [ ] **Step 3: Write the implementation**

Create `webapp-vue/src/ui/useHoldProgress.ts`:

```ts
import { onScopeDispose, readonly, ref, type Ref } from 'vue'
import { useEventListener } from '@vueuse/core'

/** How much faster the ring runs back than it filled. Releasing should read as undoing. */
const REWIND_FACTOR = 2

export interface HoldProgress {
  /** 0 … 1. Drives the ring; 1 means the hold completed. */
  progress: Readonly<Ref<number>>
  holding: Readonly<Ref<boolean>>
  start: () => void
  cancel: () => void
}

/**
 * Hold-to-confirm, as a value rather than an effect: a progress number that fills while held and
 * runs back when released, and one call to [onComplete] when it reaches the top.
 *
 * Driven by `requestAnimationFrame` rather than a CSS transition because both the rewind and the
 * completion callback have to be steered from here anyway — and because progress is information,
 * so it stays visible under `prefers-reduced-motion` where a decorative transition would not.
 */
export function useHoldProgress(durationMs: number, onComplete: () => void): HoldProgress {
  const progress = ref(0)
  const holding = ref(false)
  let frame = 0
  let last = -1

  function stop(): void {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    last = -1
  }

  function step(now: number): void {
    if (last < 0) {
      // First frame: establish the clock, advance nothing. Its timestamp is arbitrary.
      last = now
      frame = requestAnimationFrame(step)
      return
    }
    const delta = (now - last) / durationMs
    last = now

    if (holding.value) {
      progress.value = Math.min(1, progress.value + delta)
      if (progress.value >= 1) {
        stop()
        holding.value = false
        onComplete()
        return
      }
    } else {
      progress.value = Math.max(0, progress.value - delta * REWIND_FACTOR)
      if (progress.value <= 0) {
        stop()
        return
      }
    }
    frame = requestAnimationFrame(step)
  }

  function run(): void {
    if (frame) return
    frame = requestAnimationFrame(step)
  }

  function start(): void {
    // A completed hold left the ring full; pressing again is a new attempt, not a continuation.
    if (progress.value >= 1) progress.value = 0
    holding.value = true
    run()
  }

  /** Release: the ring runs back down rather than snapping away. */
  function cancel(): void {
    if (!holding.value) return
    holding.value = false
    run()
  }

  /**
   * Leaving the tab abandons the hold outright — no rewind, no completion.
   *
   * `requestAnimationFrame` does not run in a background tab, so a hold left standing would resume
   * from a stale timestamp and could finish for someone who is not looking. That is exactly the
   * accidental confirmation the keyboard gesture was designed to rule out.
   */
  useEventListener(document, 'visibilitychange', () => {
    if (!document.hidden) return
    stop()
    holding.value = false
    progress.value = 0
  })

  onScopeDispose(stop)

  return { progress: readonly(progress), holding: readonly(holding), start, cancel }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd webapp-vue && pnpm exec vitest run src/ui/__tests__/useHoldProgress.spec.ts
```

Erwartet: PASS, 6 Tests.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/ui/useHoldProgress.ts webapp-vue/src/ui/__tests__/useHoldProgress.spec.ts
git commit -m "$(cat <<'EOF'
feat(ui): add hold-to-confirm progress

Progress as a value, not an effect: it fills while held, runs back twice as
fast when released, and calls back once at the top. Driven by rAF because the
rewind and the completion have to be steered from here anyway — and because
progress is information, so the ring survives prefers-reduced-motion where a
decorative transition would not.

Leaving the tab abandons the hold outright. rAF does not run in the
background, so a hold left standing would resume from a stale timestamp and
could complete for someone who is not looking.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `HoldButton`

**Files:**
- Create: `webapp-vue/src/ui/HoldButton.vue`
- Test: `webapp-vue/src/ui/__tests__/HoldButton.spec.ts`

**Interfaces:**
- Consumes: `useHoldProgress` (Task 4)
- Produces: Props `{ ready: boolean; disabled: boolean; label: string; color: string; holdMs: number }`, Emit `confirm: []`

> **`ui/` darf nicht auf `games/` zeigen.** Der Knopf ist wiederverwendbar; seine eigenen Timings (`POP_MS`, `PULSE_MS`) stehen deshalb in ihm selbst. Nur die Haltedauer kommt von außen — sie gehört dem Spiel, nicht dem Knopf.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/ui/__tests__/HoldButton.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HoldButton from '@/ui/HoldButton.vue'

function mountButton(props: Partial<InstanceType<typeof HoldButton>['$props']> = {}) {
  return mount(HoldButton, {
    props: {
      ready: true,
      disabled: false,
      label: 'Tipp bestätigen',
      color: 'hsl(210 60% 45%)',
      holdMs: 1000,
      ...props,
    },
  })
}

function installAnimate(): ReturnType<typeof vi.fn> {
  // happy-dom has no Web Animations API; a test that wants to observe it installs it itself.
  const animate = vi.fn()
  Object.defineProperty(Element.prototype, 'animate', {
    value: animate,
    configurable: true,
    writable: true,
  })
  return animate
}

describe('HoldButton', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    // @ts-expect-error — removing the stub again
    delete Element.prototype.animate
  })

  it('is inert while it is not ready', () => {
    const w = mountButton({ ready: false })

    expect(w.get('[data-test="hold-button"]').attributes('inert')).toBeDefined()
  })

  it('drops inert once it is ready', () => {
    const w = mountButton({ ready: true })

    expect(w.get('[data-test="hold-button"]').attributes('inert')).toBeUndefined()
  })

  it('confirms after the full hold', async () => {
    const w = mountButton()

    await w.get('[data-test="hold-button"]').trigger('pointerdown')
    vi.advanceTimersByTime(1200)

    expect(w.emitted('confirm')).toHaveLength(1)
  })

  it('does not confirm when released early', async () => {
    const w = mountButton()

    await w.get('[data-test="hold-button"]').trigger('pointerdown')
    vi.advanceTimersByTime(400)
    await w.get('[data-test="hold-button"]').trigger('pointerup')
    vi.advanceTimersByTime(3000)

    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('holds on the keyboard too, and swallows the space key so the page does not scroll', async () => {
    const w = mountButton()
    const el = w.get('[data-test="hold-button"]')
    // A real event, because trigger() cannot report whether `.prevent` was applied.
    const down = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    el.element.dispatchEvent(down)
    vi.advanceTimersByTime(1200)

    expect(down.defaultPrevented).toBe(true)
    expect(w.emitted('confirm')).toHaveLength(1)
  })

  it('does not confirm on a synthetic click without a hold', async () => {
    // The whole point of the gesture: an assistive tool or a stray Enter must not submit.
    const w = mountButton()

    await w.get('[data-test="hold-button"]').trigger('click')
    vi.advanceTimersByTime(3000)

    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('abandons a keyboard hold when the key comes back up', async () => {
    const w = mountButton()
    const el = w.get('[data-test="hold-button"]')

    el.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    vi.advanceTimersByTime(400)
    el.element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    vi.advanceTimersByTime(3000)

    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('ignores a hold while disabled', async () => {
    const w = mountButton({ disabled: true })

    await w.get('[data-test="hold-button"]').trigger('pointerdown')
    vi.advanceTimersByTime(3000)

    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('springs in when it becomes ready', async () => {
    const animate = installAnimate()
    const w = mountButton({ ready: false })

    await w.setProps({ ready: true })

    expect(animate).toHaveBeenCalledTimes(1)
    const keyframes = animate.mock.calls[0]![0] as Array<{ transform: string }>
    expect(keyframes[0]!.transform).toContain('scale(0)')
    expect(keyframes.at(-1)!.transform).toContain('scale(1)')
  })

  it('does not spring in when motion is reduced', async () => {
    const animate = installAnimate()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const w = mountButton({ ready: false })

    await w.setProps({ ready: true })

    expect(animate).not.toHaveBeenCalled()
    expect(w.get('[data-test="hold-button"]').attributes('inert')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd webapp-vue && pnpm exec vitest run src/ui/__tests__/HoldButton.spec.ts
```

Erwartet: FAIL — `Failed to resolve import "@/ui/HoldButton.vue"`.

- [ ] **Step 3: Write the implementation**

Create `webapp-vue/src/ui/HoldButton.vue`:

```vue
<script setup lang="ts">
/**
 * Hold to confirm. The gesture is the safeguard: nothing is submitted by a single press, and a
 * synthetic click without a real hold submits nothing at all.
 *
 * The keyboard gets the *same* gesture rather than a cheaper one — `keydown` starts the hold,
 * `keyup` abandons it. Letting Enter confirm outright would be exactly the accidental submission
 * the hold exists to prevent. Known limit: someone who cannot hold a key for the full duration
 * cannot confirm; lifting that needs a setting, and the setting is not this component's business.
 */
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useHoldProgress } from '@/ui/useHoldProgress'

/** The button's own timings. They stay here so `ui/` never has to reach into a game. */
const POP_MS = 400
const PULSE_MS = 200

const props = defineProps<{
  /** False while the wheel is still drawing itself: the button is neither seen nor reachable. */
  ready: boolean
  disabled: boolean
  label: string
  /** The colour the button shows — the hue currently under the wheel's knob. */
  color: string
  holdMs: number
}>()

const emit = defineEmits<{ confirm: [] }>()

const button = useTemplateRef<HTMLButtonElement>('button')
const keyHeld = ref(false)

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function inBackground(): boolean {
  return document.hidden
}

function canAnimate(el: Element | null): el is Element {
  // happy-dom has no Web Animations API, and neither has any point in animating an unseen tab.
  return !!el && typeof el.animate === 'function' && !prefersReducedMotion() && !inBackground()
}

const { progress, start, cancel } = useHoldProgress(props.holdMs, () => {
  if (canAnimate(button.value)) {
    button.value.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
      { duration: PULSE_MS, easing: 'ease-out' },
    )
  }
  emit('confirm')
})

/**
 * Absent, then a spring: too large, then under, then over, then under, settling. The amplitude
 * sequence is the whole effect, which is why it is written as keyframes and not as spring
 * parameters. It carries the one thing the screen otherwise never says — this is where you play.
 */
watch(
  () => props.ready,
  (ready) => {
    if (!ready || !canAnimate(button.value)) return
    button.value.animate(
      [
        { transform: 'scale(0)', opacity: 0, offset: 0 },
        { transform: 'scale(0.6)', opacity: 1, offset: 0.15 },
        { transform: 'scale(1.18)', offset: 0.22 },
        { transform: 'scale(0.94)', offset: 0.42 },
        { transform: 'scale(1.06)', offset: 0.62 },
        { transform: 'scale(0.98)', offset: 0.8 },
        { transform: 'scale(1)', offset: 1 },
      ],
      { duration: POP_MS, easing: 'ease-out' },
    )
  },
)

function beginHold(): void {
  if (props.disabled || !props.ready) return
  start()
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== ' ' && event.key !== 'Enter') return
  // Swallowed so the page does not scroll and the button's own click never fires.
  event.preventDefault()
  if (event.repeat || keyHeld.value) return
  keyHeld.value = true
  beginHold()
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.key !== ' ' && event.key !== 'Enter') return
  keyHeld.value = false
  cancel()
}

const ringStyle = computed(() => ({
  background: `conic-gradient(currentColor ${progress.value * 360}deg, transparent 0deg)`,
  // Turns the disc into a ring; `closest-side` keeps it proportional at any wheel size.
  mask: 'radial-gradient(closest-side, transparent 84%, #000 85%)',
  WebkitMask: 'radial-gradient(closest-side, transparent 84%, #000 85%)',
  opacity: progress.value > 0 ? 1 : 0,
}))
</script>

<template>
  <div class="relative size-full">
    <span
      data-test="hold-ring"
      aria-hidden="true"
      class="pointer-events-none absolute -inset-[12%] rounded-full text-neutral-900"
      :style="ringStyle"
    />
    <!--
      `|| undefined` is not decoration: Vue keeps `inert="false"` in the DOM for a plain false,
      and it would still be in effect. See frontend-ui.md.
    -->
    <button
      ref="button"
      data-test="hold-button"
      type="button"
      :inert="!props.ready || undefined"
      :aria-label="props.label"
      :disabled="props.disabled"
      :style="{ backgroundColor: props.color }"
      class="absolute inset-0 cursor-pointer rounded-full shadow-inner ring-1 ring-black/10 disabled:cursor-not-allowed"
      @pointerdown="beginHold"
      @pointerup="cancel"
      @pointercancel="cancel"
      @pointerleave="cancel"
      @keydown="onKeyDown"
      @keyup="onKeyUp"
    />
  </div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd webapp-vue && pnpm exec vitest run src/ui/__tests__/HoldButton.spec.ts
```

Erwartet: PASS, 10 Tests.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/ui/HoldButton.vue webapp-vue/src/ui/__tests__/HoldButton.spec.ts
git commit -m "$(cat <<'EOF'
feat(ui): add a hold-to-confirm button with a progress ring

The keyboard gets the same gesture rather than a cheaper one: keydown starts
the hold, keyup abandons it. Letting Enter confirm outright would be exactly
the accidental submission the hold exists to prevent, so a synthetic click
without a real hold now submits nothing.

The button is absent until the caller says it is ready, then springs in —
overshoot, then a damped wobble. Until then it is inert, or an invisible
button would still be tabbable and holdable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `HueWheel`

**Files:**
- Create: `webapp-vue/src/games/guesshue/HueWheel.vue`
- Test: `webapp-vue/src/games/guesshue/__tests__/HueWheel.spec.ts`

**Interfaces:**
- Consumes: `geometry.ts`, `wheel.ts` (Task 3)
- Produces: Props `{ hue: number; saturation: number; lightness: number; disabled: boolean }`, Emits `update:hue: [number]` und `boot-done: []`, Slot `center`

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/games/guesshue/__tests__/HueWheel.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HueWheel from '@/games/guesshue/HueWheel.vue'

function mountWheel(props: Partial<InstanceType<typeof HueWheel>['$props']> = {}) {
  return mount(HueWheel, {
    props: { hue: 210, saturation: 0.6, lightness: 0.45, disabled: false, ...props },
  })
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('HueWheel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    setHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    setHidden(false)
    vi.restoreAllMocks()
  })

  it('is one slider, named and described for a screen reader', () => {
    const w = mountWheel({ hue: 240 })
    const el = w.get('[data-test="hue-wheel"]')

    expect(el.attributes('role')).toBe('slider')
    expect(el.attributes('aria-label')).toBe('Farbton')
    expect(el.attributes('aria-roledescription')).toBe('Farbrad')
    expect(el.attributes('aria-valuemin')).toBe('0')
    expect(el.attributes('aria-valuemax')).toBe('359')
    expect(el.attributes('aria-valuenow')).toBe('240')
    expect(el.attributes('aria-valuetext')).toBe('Blau, 240 Grad')
  })

  it('rounds only what is read aloud', () => {
    const w = mountWheel({ hue: 240.7 })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('241')
  })

  it('is reachable by keyboard, and not while disabled', () => {
    expect(mountWheel().get('[data-test="hue-wheel"]').attributes('tabindex')).toBe('0')
    expect(
      mountWheel({ disabled: true }).get('[data-test="hue-wheel"]').attributes('tabindex'),
    ).toBe('-1')
  })

  it('steps by one on the arrows, in both directions', async () => {
    const w = mountWheel({ hue: 100 })
    const el = w.get('[data-test="hue-wheel"]')

    await el.trigger('keydown', { key: 'ArrowRight' })
    await el.trigger('keydown', { key: 'ArrowUp' })
    await el.trigger('keydown', { key: 'ArrowLeft' })
    await el.trigger('keydown', { key: 'ArrowDown' })

    expect(w.emitted('update:hue')).toEqual([[101], [101], [99], [99]])
  })

  it('steps by ten on page up and down', async () => {
    const w = mountWheel({ hue: 100 })
    const el = w.get('[data-test="hue-wheel"]')

    await el.trigger('keydown', { key: 'PageUp' })
    await el.trigger('keydown', { key: 'PageDown' })

    expect(w.emitted('update:hue')).toEqual([[110], [90]])
  })

  it('jumps to the ends on Home and End', async () => {
    const w = mountWheel({ hue: 100 })
    const el = w.get('[data-test="hue-wheel"]')

    await el.trigger('keydown', { key: 'Home' })
    await el.trigger('keydown', { key: 'End' })

    expect(w.emitted('update:hue')).toEqual([[0], [359]])
  })

  it('wraps around the circle rather than clamping', async () => {
    const w = mountWheel({ hue: 0 })

    await w.get('[data-test="hue-wheel"]').trigger('keydown', { key: 'ArrowDown' })

    expect(w.emitted('update:hue')).toEqual([[359]])
  })

  it('swallows the arrow key so the page does not scroll', () => {
    const w = mountWheel()
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })

    w.get('[data-test="hue-wheel"]').element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves the space key to the confirm button in its centre', () => {
    const w = mountWheel()
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })

    w.get('[data-test="hue-wheel"]').element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(w.emitted('update:hue')).toBeUndefined()
  })

  it('ignores the keyboard while disabled', async () => {
    const w = mountWheel({ disabled: true })

    await w.get('[data-test="hue-wheel"]').trigger('keydown', { key: 'ArrowUp' })

    expect(w.emitted('update:hue')).toBeUndefined()
  })

  it('renders whatever is put in its centre', () => {
    const w = mount(HueWheel, {
      props: { hue: 10, saturation: 0.6, lightness: 0.45, disabled: false },
      slots: { center: '<b data-test="knobbly">x</b>' },
    })

    expect(w.find('[data-test="knobbly"]').exists()).toBe(true)
  })

  it('reports the ring finished right away when motion is reduced', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)

    const w = mountWheel()
    await w.vm.$nextTick()

    expect(w.emitted('boot-done')).toHaveLength(1)
  })

  it('reports the ring finished right away in a background tab', async () => {
    setHidden(true)

    const w = mountWheel()
    await w.vm.$nextTick()

    expect(w.emitted('boot-done')).toHaveLength(1)
  })

  it('reports the ring finished once the sweep has run', async () => {
    const w = mountWheel()
    vi.advanceTimersByTime(2000)
    await w.vm.$nextTick()

    expect(w.emitted('boot-done')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/HueWheel.spec.ts
```

Erwartet: FAIL — `Failed to resolve import "@/games/guesshue/HueWheel.vue"`.

- [ ] **Step 3: Write the implementation**

Create `webapp-vue/src/games/guesshue/HueWheel.vue`:

```vue
<script setup lang="ts">
/**
 * The colour wheel. Three layers: a static ring, a rotating layer carrying the knob, and a slot in
 * the middle for whatever confirms.
 *
 * Angles run clockwise from the top — the same origin and direction as CSS `conic-gradient`, so
 * nothing here needs an offset. The pointer maths lives in `geometry.ts`, because happy-dom
 * computes no layout and it could not be tested from in here.
 *
 * Written rather than pulled in: the original reached into `@radial-color-picker`'s DOM by class
 * name and overrode its internals in CSS. Its ideas are kept — one `role="slider"` for the whole
 * wheel, the key map, grab-anywhere, the rotating layer — its code is not.
 */
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { angleFromPoint, hueName, radiusFraction, wrap360 } from './geometry'
import { BOOT_SWEEP_MS, BOOT_TRAIL_MS, DEAD_ZONE_FRACTION } from './wheel'

const props = defineProps<{
  hue: number
  /** 0 … 1, as the payload carries them. */
  saturation: number
  lightness: number
  disabled: boolean
}>()

const emit = defineEmits<{ 'update:hue': [number]; 'boot-done': [] }>()

const root = useTemplateRef<HTMLDivElement>('root')

/** During the sweep the rotator follows this instead of `hue`; `null` once the wheel is live. */
const sweepKnob = ref<number | null>(null)
/** How much of the ring is painted, in degrees; 360 once the wheel is live. */
const painted = ref(0)
/** Where the ring starts opening — the angle the wheel was handed on mount. */
const sweepFrom = ref(0)
const dragging = ref(false)
let frame = 0

const KEY_STEPS: Record<string, number> = {
  ArrowUp: 1,
  ArrowRight: 1,
  ArrowDown: -1,
  ArrowLeft: -1,
  PageUp: 10,
  PageDown: -10,
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function inBackground(): boolean {
  return document.hidden
}

/** Cubic, written as multiplication — `**` is fine here, but this reads as what it is. */
function easeOut(t: number): number {
  const u = 1 - t
  return 1 - u * u * u
}

function finishSweep(): void {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  if (sweepKnob.value === null && painted.value === 360) return
  sweepKnob.value = null
  painted.value = 360
  emit('boot-done')
}

/**
 * The knob starts where it will end and runs exactly one full turn; behind it the ring opens as a
 * mask that trails by [BOOT_TRAIL_MS]. That lag is the whole effect — it makes the knob a comet
 * head and the ring its trail. Start and end angle are the same, but differ per round, so the
 * place where the ring opens moves with the round.
 */
function runSweep(): void {
  let started = -1
  const from = sweepFrom.value

  function step(now: number): void {
    if (started < 0) started = now
    const elapsed = now - started
    const knob = Math.min(1, elapsed / BOOT_SWEEP_MS)
    const trail = Math.min(1, Math.max(0, (elapsed - BOOT_TRAIL_MS) / BOOT_SWEEP_MS))

    sweepKnob.value = wrap360(from + easeOut(knob) * 360)
    painted.value = easeOut(trail) * 360

    if (trail >= 1) {
      finishSweep()
      return
    }
    frame = requestAnimationFrame(step)
  }

  frame = requestAnimationFrame(step)
}

onMounted(() => {
  sweepFrom.value = props.hue
  if (prefersReducedMotion() || inBackground() || typeof requestAnimationFrame !== 'function') {
    finishSweep()
    return
  }
  runSweep()
})

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
})

function commit(next: number): void {
  emit('update:hue', wrap360(next))
}

function applyPointer(event: PointerEvent): void {
  const el = root.value
  if (!el) return
  const box = el.getBoundingClientRect()
  // Near the centre a millimetre of finger movement is a ninety-degree jump, so the last angle
  // simply stands. The confirm button covers the same disc and catches presses there itself.
  if (radiusFraction(event.clientX, event.clientY, box) < DEAD_ZONE_FRACTION) return
  commit(angleFromPoint(event.clientX, event.clientY, box))
}

function onPointerDown(event: PointerEvent): void {
  if (props.disabled) return
  // Grabbing the wheel wins over its own entrance; dragging against a running animation is worse
  // than losing the last frames of it.
  finishSweep()
  root.value?.setPointerCapture(event.pointerId)
  dragging.value = true
  applyPointer(event)
}

function onPointerMove(event: PointerEvent): void {
  if (dragging.value) applyPointer(event)
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging.value) return
  dragging.value = false
  if (root.value?.hasPointerCapture(event.pointerId)) {
    root.value.releasePointerCapture(event.pointerId)
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (props.disabled) return
  // Space and Enter belong to whatever sits in the centre slot; they must pass through untouched.
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    finishSweep()
    commit(event.key === 'Home' ? 0 : 359)
    return
  }
  const step = KEY_STEPS[event.key]
  if (step === undefined) return
  event.preventDefault()
  finishSweep()
  commit(props.hue + step)
}

const knobAngle = computed(() => sweepKnob.value ?? props.hue)

const ringStyle = computed(() => {
  const s = `${props.saturation * 100}%`
  const l = `${props.lightness * 100}%`
  const mask =
    painted.value >= 360
      ? undefined
      : `conic-gradient(from ${sweepFrom.value}deg, #000 0deg ${painted.value}deg, transparent 0deg)`
  return {
    // An array of values is Vue's fallback idiom: it writes them in order and the last one the
    // browser accepts survives. Without hue interpolation the stepped ring stands — which is what
    // the original shipped, only with nine stops instead of thirteen, and it banded visibly.
    backgroundImage: [
      `conic-gradient(${Array.from({ length: 13 }, (_, i) => `hsl(${i * 30} ${s} ${l})`).join(',')})`,
      `conic-gradient(in hsl longer hue, hsl(0 ${s} ${l}), hsl(360 ${s} ${l}))`,
    ],
    mask,
    WebkitMask: mask,
  }
})

const rotatorStyle = computed(() => ({
  transform: `rotate(${knobAngle.value}deg)`,
  willChange: dragging.value || sweepKnob.value !== null ? 'transform' : undefined,
}))
</script>

<template>
  <div class="w-full">
    <div
      ref="root"
      data-test="hue-wheel"
      role="slider"
      aria-label="Farbton"
      aria-roledescription="Farbrad"
      aria-valuemin="0"
      aria-valuemax="359"
      :aria-valuenow="Math.round(wrap360(props.hue))"
      :aria-valuetext="`${hueName(props.hue)}, ${Math.round(wrap360(props.hue))} Grad`"
      :aria-disabled="props.disabled || undefined"
      :tabindex="props.disabled ? -1 : 0"
      class="relative mx-auto aspect-square w-full max-w-80 touch-none rounded-full select-none"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeyDown"
    >
      <div
        data-test="hue-ring"
        aria-hidden="true"
        class="absolute inset-0 rounded-full"
        :style="ringStyle"
      />
      <div aria-hidden="true" class="absolute inset-0" :style="rotatorStyle">
        <span
          data-test="hue-knob"
          class="absolute top-[2%] left-1/2 size-[9%] -translate-x-1/2 rounded-full bg-white shadow ring-2 ring-black/20"
        />
      </div>
      <div class="absolute top-1/2 left-1/2 aspect-square w-[30%] -translate-x-1/2 -translate-y-1/2">
        <slot name="center" />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/HueWheel.spec.ts
```

Erwartet: PASS, 14 Tests.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/guesshue/HueWheel.vue webapp-vue/src/games/guesshue/__tests__/HueWheel.spec.ts
git commit -m "$(cat <<'EOF'
feat(guess-hue): add the colour wheel

Written rather than pulled in: the original reached into the picker library's
DOM by class name and overrode its internals in CSS. Its ideas are kept — one
role="slider" for the whole wheel, the key map, grab-anywhere, the rotating
layer that makes the knob need no trigonometry — its code is not.

Pointer handling is one captured pointer instead of four listener pairs on
document, and the ring is one interpolated conic-gradient instead of nine
stops that banded visibly. On mount the knob runs a full turn and the ring
opens behind it, trailing by 70 ms so the knob reads as a comet head.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Die Spielkarte

**Files:**
- Create: `webapp-vue/src/games/guesshue/GuessHueBoard.vue`
- Test: `webapp-vue/src/games/guesshue/__tests__/GuessHueBoard.spec.ts`

**Interfaces:**
- Consumes: `HueWheel.vue` (Task 6), `HoldButton.vue` (Task 5), `HOLD_MS` (Task 3)
- Produces: Props `{ description: string; initHue: number; saturation: number; lightness: number; disabled: boolean }`, Emit `guess: [hue: number]`

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/games/guesshue/__tests__/GuessHueBoard.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GuessHueBoard from '@/games/guesshue/GuessHueBoard.vue'

function mountBoard(props: Partial<InstanceType<typeof GuessHueBoard>['$props']> = {}) {
  return mount(GuessHueBoard, {
    props: {
      description: 'Testbeschreibung einer Farbe.',
      initHue: 210,
      saturation: 0.6,
      lightness: 0.45,
      disabled: false,
      ...props,
    },
  })
}

describe('GuessHueBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    // Reduced motion, so the wheel reports itself ready without a sweep to wait out.
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('quotes the description with German quotation marks', () => {
    const w = mountBoard({ description: 'Ein Blau wie am späten Abend.' })

    expect(w.get('[data-test="hue-description"]').text()).toBe('„Ein Blau wie am späten Abend."')
  })

  it('starts the wheel on the angle it was handed', () => {
    const w = mountBoard({ initHue: 137 })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('137')
  })

  it('follows the wheel when the player turns it', async () => {
    const w = mountBoard({ initHue: 100 })

    await w.get('[data-test="hue-wheel"]').trigger('keydown', { key: 'PageUp' })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('110')
  })

  it('emits the angle the wheel stands on, unrounded', async () => {
    const w = mountBoard({ initHue: 210.4 })
    await w.vm.$nextTick()

    await w.get('[data-test="hold-button"]').trigger('pointerdown')
    vi.advanceTimersByTime(2000)

    expect(w.emitted('guess')).toEqual([[210.4]])
  })

  it('carries the rule where it does not compete with the wheel', () => {
    const hint = mountBoard().get('[data-test="hue-hint"]')

    expect(hint.text()).toContain('Farbton')
    // Set back deliberately: present when looked for, quiet otherwise.
    expect(hint.classes()).toContain('text-xs')
    expect(hint.classes()).toContain('text-neutral-500')
  })

  it('locks the wheel and the button once the round is spent', () => {
    const w = mountBoard({ disabled: true })

    expect(w.get('[data-test="hue-wheel"]').attributes('tabindex')).toBe('-1')
    expect(w.get('[data-test="hold-button"]').attributes('disabled')).toBeDefined()
  })

  it('follows a new starting angle handed down after a reload', async () => {
    const w = mountBoard({ initHue: 10 })

    await w.setProps({ initHue: 300 })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('300')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/GuessHueBoard.spec.ts
```

Erwartet: FAIL — `Failed to resolve import "@/games/guesshue/GuessHueBoard.vue"`.

- [ ] **Step 3: Write the implementation**

Create `webapp-vue/src/games/guesshue/GuessHueBoard.vue`:

```vue
<script setup lang="ts">
/**
 * One card: the round. A text paints a colour in words, the wheel is turned until it matches, the
 * button in its centre is held to confirm.
 *
 * It knows nothing about "my guess" and nothing about the lab — it is handed a starting angle and
 * whether it is locked, and it hands back an angle. That is what lets the real game page reuse it
 * without dragging any wheel or hold logic along.
 */
import { computed, ref, watch } from 'vue'
import HoldButton from '@/ui/HoldButton.vue'
import HueWheel from './HueWheel.vue'
import { HOLD_MS } from './wheel'

const props = defineProps<{
  description: string
  initHue: number
  saturation: number
  lightness: number
  disabled: boolean
}>()

const emit = defineEmits<{ guess: [hue: number] }>()

const hue = ref(props.initHue)
// A reload hands down a new starting angle — the lab feeds back the angle already guessed.
watch(
  () => props.initHue,
  (next) => {
    hue.value = next
  },
)

/** False until the ring has finished drawing itself; the confirm button stays away until then. */
const ready = ref(false)

const color = computed(
  () => `hsl(${hue.value} ${props.saturation * 100}% ${props.lightness * 100}%)`,
)
</script>

<template>
  <div class="rounded-xl border border-neutral-200 bg-white p-4">
    <!--
      A rule, not a box: a bordered card inside a bordered card reads as clutter. `select-none`
      is not cosmetic — without it a thumb resting beside the wheel selects the text and raises
      the iOS callout.
    -->
    <blockquote class="border-l-4 border-neutral-300 py-1 pl-4">
      <p
        data-test="hue-description"
        class="text-xl leading-relaxed font-medium text-neutral-900 italic select-none"
      >
        „{{ props.description }}"
      </p>
    </blockquote>

    <div class="mt-6">
      <HueWheel
        v-model:hue="hue"
        :saturation="props.saturation"
        :lightness="props.lightness"
        :disabled="props.disabled"
        @boot-done="ready = true"
      >
        <template #center>
          <HoldButton
            :ready="ready"
            :disabled="props.disabled"
            :hold-ms="HOLD_MS"
            :color="color"
            label="Tipp bestätigen — gedrückt halten"
            @confirm="emit('guess', hue)"
          />
        </template>
      </HueWheel>
    </div>

    <p data-test="hue-hint" class="mt-8 text-xs text-neutral-500">
      Du stellst nur den Farbton ein — Sättigung und Helligkeit sind vorgegeben. Eine kleine
      Abweichung ist erlaubt.
    </p>
  </div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/GuessHueBoard.spec.ts
```

Erwartet: PASS, 7 Tests.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/guesshue/GuessHueBoard.vue webapp-vue/src/games/guesshue/__tests__/GuessHueBoard.spec.ts
git commit -m "$(cat <<'EOF'
feat(guess-hue): add the game card

One card, one thing: the round. The description is a rule rather than a box,
because a bordered card inside a bordered card reads as clutter, and it is
select-none so a thumb resting beside the wheel does not raise the iOS
selection callout.

The rule about hue-only input sits well below the wheel, smaller and muted —
present when looked for, quiet otherwise. That is what lets the screen do
without a disclosure nobody opens.

The card knows nothing about "my guess" and nothing about the lab: it takes a
starting angle and a lock, and hands back an angle.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Im Lab ankommen

Der Adapter, die Registrierung — und die vorläufige Tipp-Karte, die bewusst *neben* dem Spiel steht und im Lab-Code lebt, damit sie mit ihm verschwindet.

**Files:**
- Create: `webapp-vue/src/gamelab/GuessHueLabGame.vue`
- Modify: `webapp-vue/src/gamelab/types.ts`
- Modify: `webapp-vue/src/gamelab/games.ts`
- Modify: `webapp-vue/src/gamelab/LabEntries.vue`
- Modify: `webapp-vue/src/gamelab/SampleGame.vue`
- Modify: `webapp-vue/src/pages/c/[slug]/lab/[game].vue`
- Test: `webapp-vue/src/gamelab/__tests__/guess-hue-lab.spec.ts`
- Test: `webapp-vue/src/gamelab/__tests__/lab-page.spec.ts` *(erweitern)*

**Interfaces:**
- Consumes: `GuessHueBoard.vue` (Task 7); Backend-Payload aus Task 2
- Produces: `GuessHuePayload` (TS) · Lab-Komponenten-Prop `myGuess: unknown`

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/gamelab/__tests__/guess-hue-lab.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GuessHueLabGame from '@/gamelab/GuessHueLabGame.vue'
import type { GuessHuePayload } from '@/gamelab/types'

const PAYLOAD: GuessHuePayload = {
  description: 'Testbeschreibung einer Farbe.',
  initHue: 210.4,
  saturation: 0.6,
  lightness: 0.45,
}

function mountAdapter(props: Record<string, unknown> = {}) {
  return mount(GuessHueLabGame, {
    props: { payload: PAYLOAD, outcome: null, disabled: false, myGuess: null, ...props },
  })
}

describe('GuessHueLabGame', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts the wheel on the payload angle while nothing has been guessed', () => {
    const w = mountAdapter()

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('210')
  })

  it('starts the wheel on my own guess once there is one', () => {
    // After a reload the payload still carries the starting angle; showing it would misreport a
    // round that is already spent.
    const w = mountAdapter({ myGuess: { hue: 42.5 }, disabled: true })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('43')
  })

  it('sends the angle as the guess the backend expects', async () => {
    const w = mountAdapter()
    await w.vm.$nextTick()

    await w.get('[data-test="hold-button"]').trigger('pointerdown')
    vi.advanceTimersByTime(2000)

    expect(w.emitted('guess')).toEqual([[{ hue: 210.4 }]])
  })

  it('shows no second card before a guess is in', () => {
    expect(mountAdapter().find('[data-test="lab-guess-card"]').exists()).toBe(false)
  })

  it('shows the provisional card with the rounded angle once a guess is in', () => {
    const w = mountAdapter({ myGuess: { hue: 42.5 }, disabled: true })

    expect(w.get('[data-test="lab-guess-card"]').text()).toContain('43')
  })

  it('survives a guess shape it does not recognise', () => {
    // `myGuess` is `unknown` by contract; a stale round from another game must not throw.
    const w = mountAdapter({ myGuess: { value: 7 }, disabled: true })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('210')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd webapp-vue && pnpm exec vitest run src/gamelab/__tests__/guess-hue-lab.spec.ts
```

Erwartet: FAIL — `Failed to resolve import "@/gamelab/GuessHueLabGame.vue"`.

- [ ] **Step 3: Add the payload type**

In `webapp-vue/src/gamelab/types.ts`, unter den Sample-Typen anhängen:

```ts
/** Guess Hue's payload. The target hue is absent by design — see the backend's field-set test. */
export interface GuessHuePayload {
  description: string
  initHue: number
  /** Fractions, not percent. */
  saturation: number
  lightness: number
}
```

Im selben File `LabEntryDto` um den Kommentar zum nullbaren Outcome ergänzen:

```ts
  guess: unknown
  /** `null` where the game accepts guesses without scoring them. */
  outcome: unknown
```

- [ ] **Step 4: Write the adapter**

Create `webapp-vue/src/gamelab/GuessHueLabGame.vue`:

```vue
<script setup lang="ts">
/**
 * Guess Hue in the lab: the board plus the two things only the lab needs — the guess wrapped into
 * the shape the endpoint takes, and a provisional card showing what was submitted.
 *
 * That card lives here rather than in the board on purpose. Standing beside the game rather than
 * inside it says by itself that it does not belong, and living in the lab adapter means it
 * disappears together with the lab instead of by documentation. The real view after a round is a
 * separate subject and will replace it.
 */
import { computed } from 'vue'
import GuessHueBoard from '@/games/guesshue/GuessHueBoard.vue'
import type { GuessHuePayload } from './types'

const props = defineProps<{
  payload: GuessHuePayload
  outcome: unknown
  disabled: boolean
  /** The viewer's own stored guess, in whatever shape the game recorded it. */
  myGuess: unknown
}>()

const emit = defineEmits<{ guess: [value: unknown] }>()

/** Narrowed rather than cast: the prop is `unknown` by contract, and a stale round may be junk. */
const myHue = computed(() => {
  const guess = props.myGuess
  if (typeof guess !== 'object' || guess === null) return null
  const hue = (guess as { hue?: unknown }).hue
  return typeof hue === 'number' ? hue : null
})
</script>

<template>
  <GuessHueBoard
    :description="props.payload.description"
    :init-hue="myHue ?? props.payload.initHue"
    :saturation="props.payload.saturation"
    :lightness="props.payload.lightness"
    :disabled="props.disabled"
    @guess="(hue: number) => emit('guess', { hue })"
  />

  <!-- Lab scaffolding with an expiry date. It may vanish without replacement. -->
  <div
    v-if="myHue !== null"
    data-test="lab-guess-card"
    class="mt-3 rounded-xl border border-dashed border-neutral-300 bg-white p-4"
  >
    <p class="text-sm text-neutral-600">
      Dein Tipp steht: <strong class="text-neutral-900">{{ Math.round(myHue) }}°</strong>
    </p>
    <p class="mt-1 text-xs text-neutral-400">
      Vorläufige Labor-Anzeige — die Ansicht nach der Abgabe wird noch gebaut.
    </p>
  </div>
</template>
```

- [ ] **Step 5: Register the game**

In `webapp-vue/src/gamelab/games.ts`: den Import ergänzen und die Liste erweitern.

```ts
import GuessHueLabGame from './GuessHueLabGame.vue'
```

```ts
export const labGameList: readonly LabGameEntry[] = [
  { id: 'sample', title: 'Zahlenraten (Attrappe)', component: SampleGame },
  { id: 'guess-hue', title: 'Farbausmalung', component: GuessHueLabGame },
]
```

- [ ] **Step 6: Pass the viewer's own guess down, and drop a null outcome**

In `webapp-vue/src/pages/c/[slug]/lab/[game].vue`, am `<component>`-Tag eine Zeile ergänzen:

```vue
    <component
      :is="gameComponent"
      v-if="round"
      :payload="round.payload"
      :outcome="round.me?.outcome ?? null"
      :my-guess="round.me?.guess ?? null"
      :disabled="busy || round.me !== null"
      @guess="guess"
    />
```

In `webapp-vue/src/gamelab/LabEntries.vue` den `<code>`-Block ersetzen:

```vue
      <code class="ml-auto text-xs text-neutral-500">
        {{ JSON.stringify(entry.guess)
        }}<template v-if="entry.outcome !== null"> → {{ JSON.stringify(entry.outcome) }}</template>
      </code>
```

In `webapp-vue/src/gamelab/SampleGame.vue` die Props um `myGuess` erweitern und den Eingabewert daraus vorbelegen — ein Reload zeigt sonst ein leeres Feld neben einer Runde, in der man geraten hat:

```ts
const props = defineProps<{
  payload: SamplePayload
  outcome: SampleOutcome | null
  disabled: boolean
  myGuess: unknown
}>()
const emit = defineEmits<{ guess: [value: unknown] }>()

function storedValue(guess: unknown): number | null {
  if (typeof guess !== 'object' || guess === null) return null
  const value = (guess as { value?: unknown }).value
  return typeof value === 'number' ? value : null
}

const value = ref<number | null>(storedValue(props.myGuess))
```

- [ ] **Step 7: Cover the new prop on the lab page**

In `webapp-vue/src/gamelab/__tests__/lab-page.spec.ts` am Ende der bestehenden `describe('lab page', …)`-Gruppe anhängen. Sie nutzt `round`, `mountPage()` und den `vi.spyOn(api, …)`-Aufbau aus `beforeEach` — beides steht schon in der Datei:

```ts
  it('hands the viewer their own stored guess to the game component', async () => {
    // The payload carries the round, not the player. Without this the sample's input would be
    // empty in a round the viewer has already spent — and the wheel of a real game would sit on
    // the starting angle instead of the angle that was submitted.
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      me: {
        userId: 'u1',
        username: 'Fry',
        avatar: { shortName: 'FRY', bgColorHex: '#abcdef' },
        guess: { value: 150 },
        outcome: { correct: false, distance: 5, direction: 'LOWER' },
        at: '2026-08-08T12:00:00Z',
      },
    } as never)

    const w = await mountPage()

    expect((w.get('[data-test="sample-input"]').element as HTMLInputElement).value).toBe('150')
  })

  it('prints no arrow for an entry the game did not score', async () => {
    // Guess Hue stores guesses without judging them, so `outcome` is legitimately null and the
    // debug line must not read "→ null".
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      others: [
        {
          userId: 'u2',
          username: 'Bender',
          avatar: { shortName: 'BEND', bgColorHex: '#123456' },
          guess: { hue: 214.3 },
          outcome: null,
          at: '2026-08-08T12:00:00Z',
        },
      ],
    } as never)

    const w = await mountPage()

    expect(w.get('[data-test="lab-entries"]').text()).toContain('214.3')
    expect(w.get('[data-test="lab-entries"]').text()).not.toContain('→')
  })

- [ ] **Step 8: Run the whole frontend suite**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Erwartet: alles grün. `lab-index.spec.ts` iteriert `labGameList` generisch und trägt den zweiten Eintrag ohne Änderung.

- [ ] **Step 9: Commit**

```bash
git add webapp-vue/src/gamelab webapp-vue/src/pages/c/\[slug\]/lab/\[game\].vue
git commit -m "$(cat <<'EOF'
feat(gamelab): play Guess Hue in the lab

The adapter wraps the angle into the shape the endpoint takes and feeds the
viewer's own stored guess back as the wheel's starting angle — the payload
carries the round, not the player, so without it a reload would sit on the
starting angle in a round that is already spent. The lab's component contract
gains `myGuess` for that, and the sample game uses it the same way.

The "guess is in" card is deliberately a second card and deliberately lives
here: standing beside the game says by itself that it does not belong, and
living in the adapter means it disappears with the lab rather than by
documentation.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Im Browser verifizieren und die Regeln zurückspeisen

Was hier geprüft wird, kann kein Test prüfen: Layout, Farbe, Gefühl, und alles, was eine Browser-Messung ist.

**Files:**
- Modify: `.claude/guidelines/game-lab.md`
- Modify: `.claude/guidelines/frontend-ui.md`
- Modify: `webapp-vue/README.md`

- [ ] **Step 1: Run the full backend suite**

```bash
cd core && ./mvnw test
```

Erwartet: grün. Braucht Docker (Testcontainers).

- [ ] **Step 2: Start the app with the real dataset**

Das entschlüsselte Datenset bereitstellen (siehe `.claude/guidelines/game-content.md` und `core/README.md`) und `app.guess-hue.dataset-path` darauf zeigen lassen. Beim Start muss im Log stehen:

```
Guess Hue loaded 60 entries from …
```

Steht dort stattdessen die Sample-Warnung, ist der Pfad nicht angekommen — dann sind die Beschreibungen Platzhalter und die folgende Beurteilung wertlos.

Frontend über `preview_start` starten, **nie** über einen Bash-Dev-Server.

- [ ] **Step 3: Verify the round on a narrow viewport**

Auf `/c/<slug>/lab/guess-hue?seed=4711`, Viewport `mobile` (375×812):

- Der Ring zeichnet sich in einer vollen Umdrehung, der Knopf läuft sichtbar voraus.
- Der Bestätigungsknopf ist während des Einflugs **nicht da** und ploppt danach federnd auf.
- Das Rad füllt die Karte praktisch ganz aus, die Seite scrollt **nicht** horizontal.
- Die Beschreibung steht in „…" und ist nicht markierbar.
- Die Hinweiszeile steht deutlich abgesetzt, klein und gedämpft.

Screenshot sichern.

- [ ] **Step 4: Verify the gesture**

- Ziehen am Ring folgt dem Finger; in der Radmitte springt nichts.
- Halten füllt den Ring, Loslassen vor dem Ende lässt ihn zurücklaufen und schickt nichts.
- Volles Halten schickt ab; danach ist das Rad gesperrt und die zweite Karte steht darunter.
- Mit `Tab` auf das Rad: Pfeile drehen es, `aria-valuetext` wird vorgelesen (VoiceOver/Chrome-A11y-Panel).
- Mit `Tab` auf den Knopf: kurzes `Enter` schickt **nichts**, gehaltenes `Enter` schickt ab.
- Während des Haltens den Tab wechseln: beim Zurückkommen ist der Ring leer und nichts wurde abgeschickt.

- [ ] **Step 5: Verify the second tester and the withheld list**

Mit einem zweiten Testnutzer (Dev-Login-Picker) denselben Seed öffnen:

- Vor dem eigenen Guess ist die Einträgeliste **leer**, obwohl der andere schon geraten hat.
- Nach dem eigenen Guess erscheint sein Eintrag, ohne `→ null`.
- Im Netzwerk-Tab enthält die Antwort auf `GET /api/lab/…/guess-hue` **kein** `others`-Element, solange `me` null ist — und in keiner Antwort ein Feld, das den Zielwinkel trägt.

- [ ] **Step 6: Verify reduced motion**

Viewport auf `desktop`, `prefers-reduced-motion` im Browser aktivieren, neu laden:

- Ring vollständig, Knopf sofort da und sofort bedienbar.
- Der Halte-Ring füllt sich weiterhin — Fortschritt ist Information.

- [ ] **Step 7: Feed the rules back**

In `.claude/guidelines/game-lab.md` unter *Payload hygiene* ergänzen — der Absatz dort endet heute mit „…not inherit the lab's default by copying the sample":

```markdown
That decision now has a place to live: `LabGame.revealsOthersBeforeGuess` is **abstract, with no
default**, so every game states it. Guess Hue answers `false` — without scoring, another tester's
guess is the only signal the round carries, and whoever produced it read the same description. The
service withholds the list server-side rather than filtering it in the client, because a payload
the browser never receives cannot be read out of the network tab either.

`LabGame.score` returns `LabOutcome?`: a game may accept and validate a guess without judging it.
`null` is "stored, not scored" — throwing is still how an invalid guess is refused, and it must
stay that way, because `LabService` calls `score()` before the store so a bad guess never consumes
the single attempt.
```

In `.claude/guidelines/frontend-ui.md` unter *Animation on a phone's main thread* ergänzen:

```markdown
- **A gesture that commits something must not be reachable by a single key.** Hold-to-confirm on
  the pointer and `Enter` on the keyboard are not the same safeguard: a synthetic click from voice
  control or an assistive tool fires the second and never the first. Give the keyboard the *same*
  gesture — `keydown` starts the hold, `keyup` abandons it, `event.repeat` is ignored, and the
  default is prevented so the button's own click never fires. It fails closed. The residual limit
  (someone who cannot hold a key for the full duration) is real and belongs in the spec, not in a
  cheaper fallback. `ui/HoldButton.vue` is the worked example.
- **An element that is animated in from nothing must be `inert` until it arrives**, not merely
  invisible — otherwise it is tabbable, and a hold gesture on it completes while nobody can see it.
```

In `webapp-vue/README.md` den Beispielblock im Abschnitt *Game lab* um das erste echte Spiel ergänzen, damit dort nicht nur die Attrappe steht:

```
/c/<slug>/lab              # the index
/c/<slug>/lab/sample       # a game; the page rolls a seed and writes it into the URL
/c/<slug>/lab/guess-hue    # Farbausmalung — the first real game
/c/<slug>/lab/sample?seed=42   # a specific round
```

Und darunter einen Satz anfügen:

```markdown
Guess Hue reads its descriptions from the encrypted dataset. Without
`app.guess-hue.dataset-path` the backend falls back to the bundled sample and says so in the
startup log — the game is playable either way, but the texts are placeholders. See
`.claude/guidelines/game-content.md`.
```

- [ ] **Step 8: Commit**

```bash
git add .claude/guidelines webapp-vue/README.md
git commit -m "$(cat <<'EOF'
docs: record what the first real lab game taught us

The per-game decision about showing other testers now has a place to live, so
the guideline points at the property instead of only warning about the
default. Withholding happens server-side: a payload the browser never
receives cannot be read out of the network tab.

The keyboard note is the one that would otherwise be re-litigated. Enter and
hold-to-confirm are not the same safeguard — a synthetic click fires one and
never the other — so the keyboard gets the same gesture rather than a cheaper
one, and an element animated in from nothing stays inert until it arrives.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Push and open the pull request**

```bash
git push -u origin HEAD
```

```bash
gh pr create --base develop --title "feat(guess-hue): the input side, playable in the lab" --body "$(cat <<'EOF'
Guess Hue's input side: a text paints a colour in words, a wheel is turned
until it matches, the button in its centre is held to confirm. Scoring stays
out — the guess is validated and stored, nothing judges it.

**Backend.** No new Modulith module: the dataset module already draws the
whole round, so the lab adapter calls it. Two contract changes fall out of a
game that accepts guesses without scoring them — `score()` returns a nullable
outcome, and `revealsOthersBeforeGuess` is abstract with no default. Guess Hue
answers `false`: without scoring, another tester's angle is the only signal
the round carries, and whoever produced it read the same description. The
service withholds the list rather than letting the client filter it.

**Frontend.** The wheel is written rather than ported. The original reached
into `@radial-color-picker`'s DOM by class name and overrode its internals in
CSS; its ideas are kept — one `role="slider"`, the key map, grab-anywhere, the
rotating layer — its code is not. No new dependency: `hsl()` and an
interpolated `conic-gradient` do what `chroma-js` did.

The keyboard gets the *same* hold gesture as the pointer, not a cheaper one:
a synthetic click without a real hold submits nothing. Every animation bails
out on both `prefers-reduced-motion` and `document.hidden`, and a hold is
abandoned outright when the tab goes to the background.

**Provisional:** the "guess is in" card is lab scaffolding. It is a second
card, below the game card, and lives in the lab adapter so it disappears with
the lab rather than by documentation. The real view after a round is a
separate subject.

Spec: `docs/superpowers/specs/2026-08-08-guess-hue-input-design.md`
Plan: `docs/superpowers/plans/2026-08-08-guess-hue-input.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> `--base develop` ist Pflicht. Behauptet ein Werkzeug, die Basis sei `main`, liest es ein veraltetes `origin/HEAD`.
