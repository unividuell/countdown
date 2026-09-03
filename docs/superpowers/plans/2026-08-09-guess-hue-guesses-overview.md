# Guess Hue — die Tippübersicht im Farbrad: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nach der eigenen Abgabe zeigt das Farbrad alle abgegebenen Tipps als Marker und die Toleranzgrenzen um die Lösung — als Bild, ohne Wertung.

**Architecture:** Der Server bekommt einen **zweiten Weg nach draußen** neben dem Payload (`LabGame.solution(seed)`), der genau dann öffnet, wenn der Betrachter seinen Guess verbraucht hat. Im Frontend stehen **zwei Räder über einem gemeinsamen Ring**: das heutige Eingabe-Rad (Zeiger, Tastatur, ARIA-Slider) und ein neues Lese-Rad (Ring, Marker, Sektor, keine Interaktion). Alles Rechnende — Stapelzuordnung, Bahnradien, Band-Innenkante, Sektorpfade, Tinte — liegt in reinen Modulen neben den Komponenten, weil happy-dom kein Layout rechnet. Der Umschalter zwischen Eingabe- und Auswertungskarte sitzt im Lab-Adapter.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 / Jackson 3 / kotest + mockk · Vue 3 / TypeScript strict / Tailwind v4 / Vitest + @vue/test-utils + happy-dom

**Spec:** [`docs/superpowers/specs/2026-08-09-guess-hue-guesses-overview-design.md`](../specs/2026-08-09-guess-hue-guesses-overview-design.md)

## Global Constraints

- **Quellcode ist Englisch** — Kommentare, KDoc, Bezeichner, Log- und Fehlermeldungen, Testnamen. Nutzertexte in der UI sind **Deutsch** und verwenden `„…“`, nie `"`. Commit-Messages sind Englisch. Siehe `.claude/guidelines/README.md#language`.
- **Commit-Messages enden mit** `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Niemals `git commit --amend`** — immer ein neuer Commit.
- **Der Klartext des Guess-Hue-Datensets erscheint nirgends im Repository.** Testdaten werden frei erfunden (`hue = 210, "Testeintrag"`). Siehe `.claude/guidelines/game-content.md`.
- **Jede Lab-Bean trägt beide Gates:** `@Profile("!production")` **und** `@ConditionalOnProperty("app.game-lab.enabled")` — voller Schlüssel als Annotation-*value*. Neue Beans entstehen in diesem Schnitt keine.
- **`GuessHueDataset.draw()` wird nicht verändert.** Die Ziehreihenfolge ist ein Vertrag.
- **Die Lösung verlässt den Server ausschließlich über `LabRoundResponse.solution`**, niemals über `payload`. Der Feldmengen-Test von `GuessHuePayload` bleibt unverändert grün.
- **Keine neue npm- oder Maven-Dependency.**
- **Es gibt keine Wertung in diesem Schnitt.** `LabGame.score` von Guess Hue gibt weiterhin `null`, die Toleranz wird **gezeichnet, nicht geprüft**.
- **Animationen:** die rAF-Schleife fragt **beides** — `prefers-reduced-motion` *und* `document.hidden` — und setzt im Zweifel den Endzustand direkt. CSS-Übergänge fragen nur die Media Query (`motion-reduce:`), weil `document.hidden` in CSS nicht ausdrückbar ist und der Grund für die zweite Frage (leckende `Element.animate()`-Objekte) sie nicht trifft.
- **TypeScript läuft mit `noUncheckedIndexedAccess` und `exactOptionalPropertyTypes`.** Indexzugriffe liefern `| undefined`; ein optionales Feld nimmt kein explizites `undefined` an — deshalb sind nullbare Props in diesem Plan durchgängig `T | null` und nicht `T?`.
- **Tailwind v4, mobile-first.** Keine `dark:`-Klassen — die App hat bislang keine einzige. Kein `<style>`-Block: `webapp-vue` hat keinen einzigen, das bleibt so.
- **happy-dom rechnet kein Layout und kein CSS.** Ein Spec kann nur den strukturellen Stellvertreter prüfen; Radien, Übergänge und Lesbarkeit sind Browsermessungen (Task 7).

### Befehle

```bash
# Backend, eine Testklasse
cd core && ./mvnw test -Dtest=LabServiceTest

# Backend, alles (braucht Docker für Testcontainers)
cd core && ./mvnw test

# Frontend, eine Spec-Datei
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/reveal.spec.ts

# Frontend, alles + Typen + Lint
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

## File Structure

**Backend**

| Datei | Verantwortung |
| --- | --- |
| `core/…/gamelab/LabGame.kt` *(modify)* | `LabSolution` als Marker-Interface; `solution(seed)` mit sicherem Default `null` |
| `core/…/gamelab/internal/LabDtos.kt` *(modify)* | `LabRoundResponse.solution` |
| `core/…/gamelab/internal/LabService.kt` *(modify)* | die eine Zeile, die die Schranke setzt |
| `core/…/guesshue/GuessHueTolerance.kt` *(create)* | die öffentliche Konstante ±10° |
| `core/…/gamelab/internal/GuessHueLabGame.kt` *(modify)* | `GuessHueSolution` + `solution(seed)` |

**Frontend**

| Datei | Verantwortung |
| --- | --- |
| `webapp-vue/src/games/guesshue/ring.ts` *(create)* | `ringStyle(...)`: Verlauf, Annulus-Maske, optionale Einflug-Maske |
| `webapp-vue/src/games/guesshue/HueRing.vue` *(create)* | ein `<div>` mit genau diesem Style — der gemeinsame Ring beider Räder |
| `webapp-vue/src/games/guesshue/wheel.ts` *(modify)* | `KNOB_SIZE_FRACTION`, `trackBoxStyle`, `easeOutCubic` |
| `webapp-vue/src/games/guesshue/HueWheelInput.vue` *(rename)* | das heutige `HueWheel.vue`, ohne Graustufen, mit `HueRing` |
| `webapp-vue/src/games/guesshue/reveal.ts` *(create)* | Stapelzuordnung, Bahnradien, Band-Innenkante, Sektorpfade, Tinte, Takte |
| `webapp-vue/src/games/guesshue/HueToleranceSector.vue` *(create)* | Sektor und Lösungslinie als SVG |
| `webapp-vue/src/games/guesshue/HueWheelReveal.vue` *(create)* | das Lese-Rad: Ring, Marker, Sektor, Choreografie |
| `webapp-vue/src/games/guesshue/GuessHueReveal.vue` *(create)* | die Auswertungskarte: dasselbe Zitat, das Lese-Rad |
| `webapp-vue/src/games/guesshue/GuessHueBoard.vue` *(modify)* | `HueWheelInput`; der Mittelknopf bekommt Takt 1 |
| `webapp-vue/src/gamelab/types.ts` *(modify)* | `LabRoundResponse.solution`, `GuessHueSolution` |
| `webapp-vue/src/gamelab/GuessHueLabGame.vue` *(modify)* | der Umschalter, die defensive Verengung, der Kartenübergang |
| `webapp-vue/src/gamelab/SampleGame.vue` *(modify)* | ignoriert die drei neuen Props, ohne sie ins DOM zu lassen |
| `webapp-vue/src/pages/c/[slug]/lab/[game].vue` *(modify)* | reicht `solution`, `entries`, `mineUserId` durch |

**Abweichungen von der Spec-Tabelle** (bewusst, jeweils begründet an Ort und Stelle):
`sectorInk` liegt in `reveal.ts` statt in einer eigenen Datei — es ist Teil des Sektor-Zeichnens und rein.
`ringStyle` nimmt `sweep: RingSweep | null` statt `sweep?`, weil `exactOptionalPropertyTypes` ein
explizites `undefined` an einem optionalen Feld verbietet. Es kommt ein `wheel.spec.ts` hinzu, für
die zwei Helfer, die aus `HueWheel.vue` nach `wheel.ts` umziehen. Und der Test „Einträge ohne
endliches `hue` fallen raus“ steht im Adapter-Spec statt in `HueWheelReveal.spec.ts`, weil die Spec
das Verengen ausdrücklich dem Adapter zuweist und das Lese-Rad danach nur noch Zahlen sieht.

---

## Task 1: Ein zweiter Weg aus dem Server, an genau einer Bedingung

Der Lab-Vertrag bekommt neben `reveal(seed)` einen zweiten Ausgang: `solution(seed)`. Anders als
`revealsOthersBeforeGuess` **hat er einen Default**, und zwar den sicheren — wer nichts
implementiert, enthüllt nichts.

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/LabGame.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/SampleLabGameTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabControllerTest.kt` (Compile-Folge)

**Interfaces:**
- Produces: `interface LabSolution` · `LabGame.solution(seed: Int): LabSolution?` (Default `null`) ·
  `LabRoundResponse.solution: LabSolution?`
- Consumes: nichts.

- [ ] **Step 1: Write the failing tests**

In `LabServiceTest.kt` die vorhandene `SecretiveGame` erweitern — sie ist bereits „die Form, die
Guess Hue braucht“, und wird es jetzt auch für die Lösung. Den Block ersetzen:

```kotlin
    /**
     * A game that accepts guesses without scoring them, hides the other testers until the viewer
     * has guessed, and reveals a solution once they have — the shape Guess Hue needs. Declared
     * here rather than by flipping `SampleLabGame`, whose open behaviour is itself documented and
     * tested.
     */
    private object SecretivePayload : LabPayload

    private object SecretiveSolution : LabSolution

    private class SecretiveGame : LabGame {
        override val id = "secretive"
        override val displayName = "Verschwiegen"
        override val revealsOthersBeforeGuess = false
        override fun reveal(seed: Int) = SecretivePayload
        override fun score(seed: Int, guess: JsonNode): LabOutcome? = null
        override fun solution(seed: Int) = SecretiveSolution
    }
```

und diese drei Tests ans Ende der Klasse anfügen:

```kotlin
    @Test
    fun `the solution stays behind the guess`() {
        // The whole gate: `me == null` is the one condition, and it is checked server-side — a
        // solution the browser never receives cannot be read out of the network tab either.
        grantAccess()
        secretiveService.guess(
            "team", "secretive", 42, bob.id!!, isSuperAdmin = false, mapper.readTree("""{}"""),
        )

        val before = secretiveService.open("team", "secretive", 42, alice.id!!, isSuperAdmin = false)

        before.solution.shouldBeNull()
    }

    @Test
    fun `the solution arrives with my own guess`() {
        grantAccess()

        val after = secretiveService.guess(
            "team", "secretive", 42, alice.id!!, isSuperAdmin = false, mapper.readTree("""{}"""),
        )

        after.solution shouldBe SecretiveSolution
    }

    @Test
    fun `deleting my guess puts me back in front of the gate`() {
        grantAccess()
        secretiveService.guess(
            "team", "secretive", 42, alice.id!!, isSuperAdmin = false, mapper.readTree("""{}"""),
        )

        val afterForget =
            secretiveService.forgetMine("team", "secretive", 42, alice.id!!, isSuperAdmin = false)

        afterForget.solution.shouldBeNull()
    }

    @Test
    fun `a game that reveals nothing keeps answering null after a guess`() {
        // The default is the safe direction, so the sample game inherits it without saying a word.
        grantAccess()
        val payload = game.reveal(42) as SamplePayload

        val response = service.guess(
            "team", "sample", 42, alice.id!!, isSuperAdmin = false,
            mapper.readTree("""{"value":${payload.lowerBound}}"""),
        )

        response.solution.shouldBeNull()
    }
```

Den Import ergänzen: `import org.unividuell.countdown.core.gamelab.LabSolution`.

In `SampleLabGameTest.kt` ans Ende:

```kotlin
    @Test
    fun `it reveals no solution, so the interface default carries`() {
        game.solution(4711).shouldBeNull()
    }
```

Der Import dafür: `import io.kotest.matchers.nulls.shouldBeNull`.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd core && ./mvnw test -Dtest=LabServiceTest+SampleLabGameTest
```

Erwartet: **Compile-Fehler**. `SecretiveGame.solution` überschreibt nichts, `LabSolution` gibt es
nicht, `response.solution` existiert nicht. Das ist der korrekte rote Zustand für eine
Vertragsänderung.

- [ ] **Step 3: Widen the contract in `LabGame.kt`**

Unter `interface LabOutcome` einfügen:

```kotlin
/**
 * What a game may show once the viewer has spent their guess — the solution, and whatever else is
 * only meaningful next to it. A second way out of the server, separate from [LabPayload] on
 * purpose: putting it in the payload would also put it in front of the guess, and the payload's
 * field-set test would lose its meaning.
 */
interface LabSolution
```

und in `interface LabGame`, hinter `score`:

```kotlin
    /**
     * What may be shown once the viewer has spent their guess. `null` — the default — is a game
     * that reveals nothing.
     *
     * **Here a default is right, unlike [revealsOthersBeforeGuess].** There the unsafe direction
     * ("show it") is the convenient one, so every game has to say it out loud. Here the default
     * *is* the safe direction: a game that implements nothing reveals nothing.
     */
    fun solution(seed: Int): LabSolution? = null
```

- [ ] **Step 4: Carry it in the response**

In `LabDtos.kt` das Feld hinter `payload` einziehen und den KDoc der Klasse ergänzen:

```kotlin
/**
 * Every endpoint answers with this, so the client can redraw after any action without a second
 * request. [tookOverRound] is the only thing the client cannot work out for itself — it does not
 * know which seed the server had stored before this call. [solution] is the only thing it must
 * never work out for itself.
 */
data class LabRoundResponse(
    val seed: Int,
    val game: String,
    val displayName: String,
    val payload: LabPayload,
    /** Filled only once the viewer has an entry of their own; `null` in front of that gate. */
    val solution: LabSolution?,
    val me: LabEntryDto?,
    val others: List<LabEntryDto>,
    val tookOverRound: Boolean,
)
```

Import ergänzen: `import org.unividuell.countdown.core.gamelab.LabSolution`.

**Kein Default am Feld** — es gibt genau eine Stelle, die diese Antwort baut, und die soll sich
äußern müssen.

- [ ] **Step 5: Set the gate in `LabService.respond`**

Im `LabRoundResponse(...)`-Aufruf, direkt hinter `payload`:

```kotlin
            // The one condition, and deliberately not `revealsOthersBeforeGuess`: "seeing the
            // others" and "seeing the solution" are two questions, and the second has only one
            // sensible answer in the lab. Whoever deletes their guess stands in front of the gate
            // again.
            solution = if (mine == null) null else game.solution(seed),
```

- [ ] **Step 6: Fix the controller test's fixture**

In `LabControllerTest.kt` in `response(...)` hinter `payload = ...` ergänzen:

```kotlin
        solution = null,
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd core && ./mvnw test -Dtest=LabServiceTest+SampleLabGameTest+LabControllerTest+GuessHueLabGameTest
```

Erwartet: PASS.

- [ ] **Step 8: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/gamelab core/src/test/kotlin/org/unividuell/countdown/core/gamelab
git commit -m "feat(gamelab): open a second way out once the guess is spent"
```

---

## Task 2: Guess Hue enthüllt Ziel und Toleranz

Die ±10° stehen als geerbte Mechanik im Datenset-Spec. Sie bekommen jetzt eine öffentliche
Konstante im `guesshue`-Modul und werden **mitgeschickt statt im Client hartkodiert** — der Client
zeichnet, was ihm gesagt wird, und wenn Phase 2 die Toleranz aufhebt, ist das eine Zahl im Server
und kein Frontend-Release.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueTolerance.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/GuessHueLabGame.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/GuessHueLabGameTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDrawTest.kt`

**Interfaces:**
- Consumes: `LabSolution` aus Task 1.
- Produces: `GuessHueTolerance.DEGREES: Double` (= 10.0) ·
  `GuessHueSolution(targetHue: Double, toleranceDeg: Double) : LabSolution` ·
  `GuessHueLabGame.solution(seed: Int): GuessHueSolution`

- [ ] **Step 1: Write the failing tests**

An `GuessHueLabGameTest.kt` anhängen:

```kotlin
    @Test
    fun `the solution carries the target and the tolerance and nothing else`() {
        // Same reasoning as the payload's field-set test: a new number that merely *narrows*
        // something shows up only this way.
        val json = mapper.writeValueAsString(game.solution(4711))
        val fields = mapper.readTree(json).propertyNames().toSet()

        fields shouldBe setOf("targetHue", "toleranceDeg")
    }

    @Test
    fun `the solution is the angle the dataset drew, with the module's tolerance`() {
        val target = dataset.draw(SeededRandom.fromSeed(4711))

        val solution = game.solution(4711) as GuessHueSolution

        solution.targetHue shouldBe target.hue
        solution.toleranceDeg shouldBe GuessHueTolerance.DEGREES
    }

    @Test
    fun `the same seed reveals the same solution`() {
        game.solution(4711) shouldBe game.solution(4711)
    }
```

Imports ergänzen: `org.unividuell.countdown.core.gamelab.internal.GuessHueSolution`,
`org.unividuell.countdown.core.guesshue.GuessHueTolerance`.

An `GuessHueDrawTest.kt` anhängen — die Ungleichung, die das Datenset-Spec ausdrücklich erhalten
wissen will, wird erst jetzt überhaupt ausdrückbar:

```kotlin
    @Test
    fun `the jitter stays inside the tolerance`() {
        // The inequality is the reason the jitter is 5: a player who read the description
        // perfectly must not be pushed out of the window by the jitter alone. Now that the
        // tolerance is a constant rather than prose, it can be pinned.
        GuessHueDataset.JITTER_DEGREES shouldBeLessThan GuessHueTolerance.DEGREES
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd core && ./mvnw test -Dtest=GuessHueLabGameTest+GuessHueDrawTest
```

Erwartet: **Compile-Fehler** — `GuessHueTolerance` und `GuessHueSolution` gibt es nicht,
`game.solution(...)` liefert `LabSolution?`.

- [ ] **Step 3: Create the constant**

`core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueTolerance.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue

/**
 * How far a guess may sit from the target and still be meant as right — inherited mechanics from
 * `huettehuette`, lifted out of prose because the client draws it and must not hard-code it.
 *
 * A half-window: the guess counts from `target - DEGREES` to `target + DEGREES`. Phase 2 of the
 * countdown lifts the tolerance; that is then a number here, not a frontend release.
 *
 * Nothing in this cut *checks* it — it is drawn, not scored. `GuessHueDataset.JITTER_DEGREES` must
 * stay strictly below it, which `GuessHueDrawTest` pins.
 */
object GuessHueTolerance {
    const val DEGREES = 10.0
}
```

- [ ] **Step 4: Reveal it from the lab adapter**

In `GuessHueLabGame.kt` hinter `GuessHuePayload` einfügen:

```kotlin
/**
 * What the round looked like, once the player has spent their guess: the angle that was sought and
 * how wide around it counts. It leaves the server through `LabRoundResponse.solution`, never
 * through the payload — see [LabSolution].
 */
data class GuessHueSolution(
    val targetHue: Double,
    /** Half-window, in degrees: the guess counts from `targetHue - it` to `targetHue + it`. */
    val toleranceDeg: Double,
) : LabSolution
```

und in der Klasse hinter `reveal`:

```kotlin
    /**
     * Drawn from the same seed as [reveal], so the two describe the same round. The tolerance
     * travels with it rather than living in the client: the client draws what it is told.
     */
    override fun solution(seed: Int): GuessHueSolution {
        val target = dataset.draw(SeededRandom.fromSeed(seed))
        return GuessHueSolution(
            targetHue = target.hue,
            toleranceDeg = GuessHueTolerance.DEGREES,
        )
    }
```

Imports ergänzen: `org.unividuell.countdown.core.gamelab.LabSolution`,
`org.unividuell.countdown.core.guesshue.GuessHueTolerance`.

Den Klassen-KDoc anpassen — der letzte Absatz stimmt nicht mehr:

```kotlin
 * Guesses are accepted, validated and stored; they are **not** scored. What the player sees after
 * the round is the drawn target and the tolerance around it — a picture, not a verdict. Points and
 * the ranking stay the game framework's decisions, and this class must not pre-empt them.
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd core && ./mvnw test -Dtest=GuessHueLabGameTest+GuessHueDrawTest+LabServiceTest
```

Erwartet: PASS. Insbesondere bleibt `the payload carries the description and the starting colour
and nothing else` grün — die Lösung geht neben dem Payload hinaus, nicht darin.

- [ ] **Step 6: Run the whole backend suite and commit**

```bash
cd core && ./mvnw test
```

Erwartet: PASS (braucht Docker).

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core core/src/test/kotlin/org/unividuell/countdown/core
git commit -m "feat(guesshue): reveal the drawn target and its tolerance"
```

---

## Task 3: Ein Ring für beide Räder

Der gemalte Ring ist das Einzige, was Eingabe- und Lese-Rad teilen — und er ist fast vollständig
Arithmetik. Also: eine reine Funktion, eine dünne Komponente, und das heutige `HueWheel.vue`
bekommt seinen richtigen Namen. Die Graustufen für `disabled` entfallen ersatzlos.

**Files:**
- Create: `webapp-vue/src/games/guesshue/ring.ts`
- Create: `webapp-vue/src/games/guesshue/HueRing.vue`
- Modify: `webapp-vue/src/games/guesshue/wheel.ts`
- Rename: `webapp-vue/src/games/guesshue/HueWheel.vue` → `HueWheelInput.vue`
- Modify: `webapp-vue/src/games/guesshue/GuessHueBoard.vue` (nur der Import)
- Create: `webapp-vue/src/games/guesshue/__tests__/ring.spec.ts`
- Create: `webapp-vue/src/games/guesshue/__tests__/wheel.spec.ts`
- Rename: `webapp-vue/src/games/guesshue/__tests__/HueWheel.spec.ts` → `HueWheelInput.spec.ts`

**Interfaces:**
- Produces: `ringStyle(options: RingOptions): CSSProperties` · `interface RingSweep { fromDeg: number; paintedDeg: number }` ·
  `HueRing.vue` mit Props `{ saturation, lightness, innerFraction, sweep: RingSweep | null }` ·
  `KNOB_SIZE_FRACTION = 0.09` · `trackBoxStyle(trackFraction: number): CSSProperties` ·
  `easeOutCubic(t: number): number` — alle drei aus `wheel.ts`.
- Consumes: nichts.

- [ ] **Step 1: Write the failing ring tests**

`webapp-vue/src/games/guesshue/__tests__/ring.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ringStyle } from '@/games/guesshue/ring'

const BASE = { saturation: 0.6, lightness: 0.45, innerFraction: 0.78, sweep: null }

describe('ringStyle', () => {
  it('cuts the disc into a band at the inner edge it was given', () => {
    const style = ringStyle(BASE)

    expect(style.mask).toBe('radial-gradient(closest-side, transparent 77%, #000 78%)')
    expect(style.WebkitMask).toBe(style.mask)
  })

  it('follows the inner edge inward as the band grows', () => {
    // The edge is animated frame by frame, and 0.78 - 0.1 answers 0.6799999999999999 in IEEE754 —
    // rounding is what keeps a fifteen-digit number out of the mask.
    const style = ringStyle({ ...BASE, innerFraction: 0.78 - 0.1 })

    expect(style.mask).toBe('radial-gradient(closest-side, transparent 67%, #000 68%)')
  })

  it('composes the entrance mask with the band instead of replacing it', () => {
    // Replacing it would reveal a full disc that only narrows once the sweep is done.
    const style = ringStyle({ ...BASE, sweep: { fromDeg: 210, paintedDeg: 90 } })

    expect(style.mask).toBe(
      'conic-gradient(from 210deg, #000 0deg 90deg, transparent 0deg), ' +
        'radial-gradient(closest-side, transparent 77%, #000 78%)',
    )
    // Two mask layers default to `add`; only `intersect` means "painted so far" AND "inside the
    // band", and without it the sweep goes on painting the disc's dead centre.
    expect(style).toMatchObject({ maskComposite: 'intersect', WebkitMaskComposite: 'source-in' })
  })

  it('drops the entrance mask once the ring is fully painted', () => {
    const style = ringStyle({ ...BASE, sweep: { fromDeg: 210, paintedDeg: 360 } })

    expect(style.mask).toBe('radial-gradient(closest-side, transparent 77%, #000 78%)')
    expect(style).not.toHaveProperty('maskComposite')
  })

  it('never greys the band out', () => {
    // The grayscale filter was a stand-in for "round spent". That state is now a different card,
    // and `disabled` means only "takes no input right now" — which the centre button already says.
    expect(JSON.stringify(ringStyle(BASE))).not.toContain('grayscale')
    expect(ringStyle(BASE)).not.toHaveProperty('filter')
  })

  it('paints the rainbow in the saturation and lightness it was given', () => {
    const style = ringStyle({ ...BASE, saturation: 0.5, lightness: 0.4 })

    expect(String(style.backgroundImage)).toContain('hsl(0 50% 40%)')
    expect(String(style.backgroundImage)).toContain('in hsl longer hue')
  })
})
```

`webapp-vue/src/games/guesshue/__tests__/wheel.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { KNOB_TRACK_FRACTION, easeOutCubic, trackBoxStyle } from '@/games/guesshue/wheel'

describe('trackBoxStyle', () => {
  it('puts the box centre on the track, not its top edge', () => {
    // 50 × (1 − 0.89) is where the centre goes; half the box's own 9% comes off again because
    // `top` addresses the upper edge.
    expect(trackBoxStyle(KNOB_TRACK_FRACTION)).toEqual({ top: '1%', width: '9%', height: '9%' })
  })

  it('moves inward with the track', () => {
    expect(trackBoxStyle(0.79)).toEqual({ top: '6%', width: '9%', height: '9%' })
  })
})

describe('easeOutCubic', () => {
  it('starts at nothing, ends at everything, and is past halfway in the middle', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 10)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/ring.spec.ts src/games/guesshue/__tests__/wheel.spec.ts
```

Erwartet: FAIL — `ring.ts` gibt es nicht, `trackBoxStyle`/`easeOutCubic` sind nicht exportiert.

- [ ] **Step 3: Write `ring.ts`**

```ts
/**
 * The painted rainbow band, as one style object.
 *
 * Lifted out of `HueWheel.vue` because both wheels — the one that takes input and the one that
 * shows the result — paint exactly the same ring, and because a mask string composed by hand is
 * worth asserting on without mounting anything.
 */
import type { CSSProperties } from 'vue'

/** The entrance: how much of the ring is painted so far, and where the painting started. */
export interface RingSweep {
  fromDeg: number
  paintedDeg: number
}

export interface RingOptions {
  /** 0 … 1, as the payload carries them. */
  saturation: number
  lightness: number
  /** The band's inner edge, as a fraction of the wheel's radius. */
  innerFraction: number
  /** `null` — or a full turn — paints the whole ring. */
  sweep: RingSweep | null
}

export function ringStyle({
  saturation,
  lightness,
  innerFraction,
  sweep,
}: RingOptions): CSSProperties {
  const s = `${saturation * 100}%`
  const l = `${lightness * 100}%`
  // Rounded to a tenth of a percent: the inner edge is driven frame by frame while the band grows,
  // and 0.78 - 0.1 answers 0.6799999999999999 in IEEE754, which would otherwise reach the mask as
  // a fifteen-digit string.
  const edge = Math.round(innerFraction * 1000) / 10
  const sweepMask =
    sweep && sweep.paintedDeg < 360
      ? `conic-gradient(from ${sweep.fromDeg}deg, #000 0deg ${sweep.paintedDeg}deg, transparent 0deg)`
      : null
  // The band itself: everything inside the inner edge is cut away, turning the disc into a ring.
  // Composed with the sweep mask above rather than replacing it, so the entrance still paints the
  // band progressively instead of revealing a full disc that only narrows once it is done.
  const bandMask = `radial-gradient(closest-side, transparent ${edge - 1}%, #000 ${edge}%)`
  const mask = sweepMask ? `${sweepMask}, ${bandMask}` : bandMask
  return {
    // An array of values is Vue's fallback idiom: it writes them in order and the last one the
    // browser accepts survives. Without hue interpolation the stepped ring stands — which is what
    // the original shipped, only with nine stops instead of thirteen, and it banded visibly.
    // csstype (which Vue's CSSProperties is built on) has no notion of this idiom, so the array
    // needs the cast — the runtime behaviour is Vue's, not a workaround.
    backgroundImage: [
      `conic-gradient(${Array.from({ length: 13 }, (_, i) => `hsl(${i * 30} ${s} ${l})`).join(',')})`,
      `conic-gradient(in hsl longer hue, hsl(0 ${s} ${l}), hsl(360 ${s} ${l}))`,
    ] as unknown as string,
    mask,
    WebkitMask: mask,
    // Two mask layers default to `add` (a union) — `intersect` is what turns "painted so far" AND
    // "inside the band" into the actual visible region; without it the sweep would go on painting
    // the disc's dead centre too, band or no band. csstype has no `maskComposite` entry either.
    ...(sweepMask
      ? ({
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        } as unknown as CSSProperties)
      : {}),
  } satisfies CSSProperties
}
```

- [ ] **Step 4: Extend `wheel.ts`**

Ganz oben den Import ergänzen:

```ts
import type { CSSProperties } from 'vue'
```

und ans Dateiende:

```ts
/**
 * The knob's own size, as a fraction of the wheel. Shared with the reveal wheel's markers, so
 * "my guess covers the knob exactly" is built rather than recomputed.
 */
export const KNOB_SIZE_FRACTION = 0.09

/**
 * Where a knob-sized box sits on the wheel: `top` puts its *centre* on [trackFraction] — the raw
 * CSS property addresses the box's upper edge, hence subtracting half the box's own size. Width
 * and height come along so the marker and the knob cannot drift apart in size either.
 *
 * Rounded because the arithmetic is percentages of percentages: 50 × (1 − 0.89) − 4.5 answers
 * 1.0000000000000036 in IEEE754.
 */
export function trackBoxStyle(trackFraction: number): CSSProperties {
  const size = `${KNOB_SIZE_FRACTION * 100}%`
  const top = 50 * (1 - trackFraction) - (KNOB_SIZE_FRACTION * 100) / 2
  return { top: `${Math.round(top * 10000) / 10000}%`, width: size, height: size }
}

/** Cubic, written as multiplication — `**` is fine here, but this reads as what it is. */
export function easeOutCubic(t: number): number {
  const u = 1 - t
  return 1 - u * u * u
}
```

- [ ] **Step 5: Write `HueRing.vue`**

```vue
<script setup lang="ts">
/**
 * The rainbow band both wheels paint. Nothing but a div and [ringStyle] — it exists so the input
 * wheel and the reveal wheel cannot drift apart on the one thing they genuinely share.
 */
import { computed } from 'vue'
import { ringStyle, type RingSweep } from './ring'

const props = defineProps<{
  saturation: number
  lightness: number
  innerFraction: number
  /** `null` paints the whole ring; the input wheel's entrance passes its progress here. */
  sweep: RingSweep | null
}>()

const style = computed(() =>
  ringStyle({
    saturation: props.saturation,
    lightness: props.lightness,
    innerFraction: props.innerFraction,
    sweep: props.sweep,
  }),
)
</script>

<template>
  <div
    data-test="hue-ring"
    aria-hidden="true"
    class="absolute inset-0 rounded-full"
    :style="style"
  />
</template>
```

- [ ] **Step 6: Rename the input wheel and let it use the ring**

```bash
cd webapp-vue
git mv src/games/guesshue/HueWheel.vue src/games/guesshue/HueWheelInput.vue
git mv src/games/guesshue/__tests__/HueWheel.spec.ts src/games/guesshue/__tests__/HueWheelInput.spec.ts
```

In `HueWheelInput.vue`:

1. Den Datei-KDoc um einen Satz ergänzen, direkt nach dem ersten Absatz:
   `* This is the wheel that takes input; `HueWheelReveal.vue` is the one that shows the result.
   * They share the ring and nothing else — see `HueRing.vue`.`
2. `import type { CSSProperties } from 'vue'` **entfernen** (mit `ringStyle` fällt die letzte
   Verwendung weg; `noUnusedLocals` schlägt sonst zu).
3. Die Imports ergänzen bzw. ersetzen:

```ts
import { angleFromPoint, hueName, radiusFraction, wrap360 } from './geometry'
import HueRing from './HueRing.vue'
import type { RingSweep } from './ring'
import {
  BAND_INNER_FRACTION,
  BOOT_SWEEP_MS,
  BOOT_TRAIL_MS,
  CENTRE_HOLD_FRACTION,
  KNOB_TRACK_FRACTION,
  easeOutCubic,
  trackBoxStyle,
} from './wheel'
```

4. Die lokale Funktion `easeOut` löschen und ihre beiden Aufrufe in `runSweep` auf
   `easeOutCubic` umstellen.
5. `KNOB_SIZE_FRACTION`, `KNOB_TOP_PERCENT` und den ganzen `ringStyle`-computed löschen; dafür:

```ts
/** The entrance, in the shape the ring takes it; `null` once the ring is fully painted. */
const sweep = computed<RingSweep | null>(() =>
  painted.value >= 360 ? null : { fromDeg: sweepFrom.value, paintedDeg: painted.value },
)

/** Constant, not computed: the knob rides one fixed track. */
const knobStyle = trackBoxStyle(KNOB_TRACK_FRACTION)
```

6. Im Template das Ring-`<div>` ersetzen durch:

```vue
      <HueRing
        :saturation="props.saturation"
        :lightness="props.lightness"
        :inner-fraction="BAND_INNER_FRACTION"
        :sweep="sweep"
      />
```

7. Den Knopf auf den geteilten Kasten umstellen:

```vue
        <!-- cursor-pointer is explicit: Tailwind v4's preflight resets cursors. -->
        <span
          data-test="hue-knob"
          class="absolute left-1/2 -translate-x-1/2 cursor-pointer rounded-full bg-white shadow ring-2 ring-black/20"
          :style="knobStyle"
        />
```

In `GuessHueBoard.vue` den Import umbiegen und die eine Verwendung im Template mit umbenennen:

```ts
import HueWheelInput from './HueWheelInput.vue'
```

```vue
      <HueWheelInput
        v-model:hue="hue"
        …
      </HueWheelInput>
```

- [ ] **Step 7: Drop the grayscale assertion, which no longer describes anything**

In `HueWheelInput.spec.ts` den Import auf `@/games/guesshue/HueWheelInput.vue` umstellen, die
Hilfsfunktion `mountWheel` auf `mount(HueWheelInput, …)`, und den Test
`greys out the band once the wheel is locked, so a spent round is obvious at a glance`
**ersatzlos löschen** — das Verhalten ist weg, und `ring.spec.ts` hält fest, dass es nicht
zurückkommt.

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue src/gamelab && pnpm typecheck && pnpm lint
```

Erwartet: PASS. `lab-page.spec.ts` prüft `hue-ring` weiterhin auf `from 10deg` — der `data-test`
und das Maskenformat wandern unverändert in `HueRing`/`ringStyle` mit.

- [ ] **Step 9: Commit**

```bash
git add webapp-vue/src/games/guesshue
git commit -m "refactor(guesshue): share one painted ring between both wheels"
```

---

## Task 4: Die Arithmetik der Auswertung

Reine Funktionen: welcher Tipp auf welche Bahn, wie weit das Band nach innen wächst, wo der Sektor
liegt, welche Tinte lesbar bleibt. Kein DOM, keine Komponente.

**Files:**
- Create: `webapp-vue/src/games/guesshue/reveal.ts`
- Create: `webapp-vue/src/games/guesshue/__tests__/reveal.spec.ts`

**Interfaces:**
- Consumes: `wrap360` aus `./geometry`, `BAND_INNER_FRACTION`/`KNOB_TRACK_FRACTION` aus `./wheel`,
  `readableTextColor` aus `@/ui/readableTextColor`.
- Produces:
  `interface RevealGuess { userId: string; hue: number; colorHex: string }` ·
  `interface PlacedGuess extends RevealGuess { lane: number; trackFraction: number; mine: boolean }` ·
  `interface RevealLayout { markers: PlacedGuess[]; deepestLane: number; bandInnerFraction: number }` ·
  `layoutGuesses(guesses: RevealGuess[], mineUserId: string | null): RevealLayout` ·
  `stackStep(deepestLane: number): number` · `trackFraction(lane: number, deepestLane: number): number` ·
  `bandInnerFraction(deepestLane: number): number` · `circularDistance(a: number, b: number): number` ·
  `unitPoint(angleDeg: number, radiusFraction: number): { x: number; y: number }` ·
  `sectorPaths(targetHue: number, toleranceDeg: number, innerFraction: number): SectorPaths` mit
  `interface SectorPaths { window: string | null; solution: string }` ·
  `sectorInk(hue: number, saturation: number, lightness: number): string` ·
  Konstanten `STACK_STEP`, `COLLISION_WINDOW_DEG`, `MIN_BAND_INNER_FRACTION`, `SECTOR_DELAY_MS`,
  `MARKERS_DELAY_MS`, `MARKER_STAGGER_MS`, `FADE_MS`, `BAND_GROW_MS`.

- [ ] **Step 1: Write the failing tests**

`webapp-vue/src/games/guesshue/__tests__/reveal.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  bandInnerFraction,
  circularDistance,
  layoutGuesses,
  sectorInk,
  sectorPaths,
  stackStep,
  trackFraction,
  unitPoint,
  type RevealGuess,
} from '@/games/guesshue/reveal'

function guess(userId: string, hue: number): RevealGuess {
  return { userId, hue, colorHex: '#3366cc' }
}

describe('lanes', () => {
  it('puts my own guess on the outermost lane, whatever it collides with', () => {
    // Lane 0 is where the pointer knob rode — mine has to land there, or the crossfade from knob
    // to marker is a jump.
    const { markers } = layoutGuesses([guess('other', 12), guess('me', 10)], 'me')

    expect(markers.find((m) => m.userId === 'me')).toMatchObject({ lane: 0, mine: true })
    expect(markers.find((m) => m.userId === 'other')).toMatchObject({ lane: 1, mine: false })
  })

  it('lets two guesses far enough apart share a lane', () => {
    const { markers, deepestLane } = layoutGuesses([guess('me', 0), guess('other', 30)], 'me')

    expect(markers.map((m) => m.lane)).toEqual([0, 0])
    expect(deepestLane).toBe(0)
  })

  it('treats exactly the collision window as far enough apart', () => {
    const { markers } = layoutGuesses([guess('me', 0), guess('other', 10)], 'me')

    expect(markers.map((m) => m.lane)).toEqual([0, 0])
  })

  it('stacks across the 0° seam, which is not a special case but a consequence', () => {
    // The original compared raw bounds and stacked nothing across 0°; distance on the circle makes
    // the seam disappear from the code entirely.
    const { markers } = layoutGuesses([guess('me', 358), guess('other', 3)], 'me')

    expect(markers.map((m) => m.lane)).toEqual([0, 1])
  })

  it('fills the lowest free lane rather than one per guess', () => {
    const { markers, deepestLane } = layoutGuesses(
      [guess('me', 100), guess('a', 102), guess('b', 200)],
      'me',
    )

    expect(markers.find((m) => m.userId === 'b')!.lane).toBe(0)
    expect(deepestLane).toBe(1)
  })

  it('orders equal angles by user id, so a reload draws the same picture', () => {
    const first = layoutGuesses([guess('b', 40), guess('a', 40)], null)
    const second = layoutGuesses([guess('a', 40), guess('b', 40)], null)

    expect(first.markers.map((m) => m.userId)).toEqual(['a', 'b'])
    expect(second.markers.map((m) => m.userId)).toEqual(['a', 'b'])
    expect(first.markers.map((m) => m.lane)).toEqual([0, 1])
  })

  it('works with nobody of my own in the list', () => {
    const { markers } = layoutGuesses([guess('a', 10), guess('b', 12)], null)

    expect(markers.every((m) => !m.mine)).toBe(true)
    expect(markers.map((m) => m.lane)).toEqual([0, 1])
  })
})

describe('radii', () => {
  it('drops each lane by one step, and the band by the same step', () => {
    // The same subtraction for both is why every marker sits on colour with the same margin
    // instead of beside it.
    expect(trackFraction(0, 2)).toBeCloseTo(0.89, 10)
    expect(trackFraction(1, 2)).toBeCloseTo(0.79, 10)
    expect(trackFraction(2, 2)).toBeCloseTo(0.69, 10)
    expect(bandInnerFraction(2)).toBeCloseTo(0.58, 10)
  })

  it('leaves the band alone when nothing collides', () => {
    expect(bandInnerFraction(0)).toBeCloseTo(0.78, 10)
    expect(stackStep(0)).toBeCloseTo(0.1, 10)
  })

  it('shrinks the step instead of closing the hole, from six lanes on', () => {
    // Five lanes still fit at the full step; the sixth would push the band past the floor, so the
    // markers overlap more and the wheel stays a wheel.
    expect(stackStep(5)).toBeCloseTo(0.1, 10)
    expect(bandInnerFraction(5)).toBeCloseTo(0.28, 10)

    expect(stackStep(6)).toBeCloseTo(0.53 / 6, 10)
    expect(bandInnerFraction(6)).toBeCloseTo(0.25, 10)
    expect(bandInnerFraction(11)).toBeCloseTo(0.25, 10)
  })

  it('keeps the deepest marker on the band at any depth', () => {
    for (const deepest of [0, 1, 5, 6, 11]) {
      expect(trackFraction(deepest, deepest) - bandInnerFraction(deepest)).toBeCloseTo(0.11, 10)
    }
  })
})

describe('circularDistance', () => {
  it('measures the short way round', () => {
    expect(circularDistance(10, 20)).toBe(10)
    expect(circularDistance(358, 3)).toBe(5)
    expect(circularDistance(0, 180)).toBe(180)
    expect(circularDistance(-5, 5)).toBe(10)
  })
})

describe('the sector', () => {
  it('places a point clockwise from the top, like the ring', () => {
    expect(unitPoint(0, 1).x).toBeCloseTo(0.5, 10)
    expect(unitPoint(0, 1).y).toBeCloseTo(0, 10)
    expect(unitPoint(90, 1).x).toBeCloseTo(1, 10)
    expect(unitPoint(90, 1).y).toBeCloseTo(0.5, 10)
    expect(unitPoint(180, 1).y).toBeCloseTo(1, 10)
    expect(unitPoint(270, 1).x).toBeCloseTo(0, 10)
    expect(unitPoint(90, 0.78).x).toBeCloseTo(0.89, 10)
  })

  it('draws the window as two boundary lines closed by two arcs, over the band only', () => {
    // Chosen so every coordinate is exact: the window runs from 0° to 180°, the band from 0.78.
    const { window } = sectorPaths(90, 90, 0.78)

    expect(window).toBe(
      'M 0.5,0.11 L 0.5,0 M 0.5,0.89 L 0.5,1 ' +
        'M 0.5,0.11 A 0.39,0.39 0 0,1 0.5,0.89 M 0.5,0 A 0.5,0.5 0 0,1 0.5,1',
    )
  })

  it('draws the solution as a single line, over the band only', () => {
    expect(sectorPaths(90, 90, 0.78).solution).toBe('M 0.89,0.5 L 1,0.5')
  })

  it('needs no special case for a window that runs across 0°', () => {
    expect(sectorPaths(355, 10, 0.78)).toEqual(sectorPaths(-5, 10, 0.78))
    expect(sectorPaths(355, 10, 0.78).window).toContain('0 0,1')
  })

  it('draws only the solution line at zero tolerance', () => {
    const { window, solution } = sectorPaths(90, 0, 0.78)

    expect(window).toBeNull()
    expect(solution).toBe('M 0.89,0.5 L 1,0.5')
  })

  it('follows the band inward as it grows', () => {
    expect(sectorPaths(90, 90, 0.5).solution).toBe('M 0.75,0.5 L 1,0.5')
  })
})

describe('sectorInk', () => {
  it('goes dark on a bright solution and light on a dark one', () => {
    expect(sectorInk(60, 0.9, 0.5)).toBe('#111111')
    expect(sectorInk(240, 0.9, 0.4)).toBe('#ffffff')
  })

  it('reads the angle, not just the lightness', () => {
    // Yellow and blue at the same HSL lightness are nowhere near equally bright, which is why the
    // decision goes through a real conversion rather than through `lightness > 0.5`.
    expect(sectorInk(60, 0.9, 0.45)).not.toBe(sectorInk(240, 0.9, 0.45))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/reveal.spec.ts
```

Erwartet: FAIL — das Modul gibt es nicht.

- [ ] **Step 3: Write `reveal.ts`**

```ts
/**
 * The reveal wheel's arithmetic. Pure, and kept out of the components for the same reason
 * `geometry.ts` is: happy-dom computes no layout, so lanes, radii and path data could not be
 * asserted on from inside a mounted component — here they are ordinary arithmetic.
 */
import { readableTextColor } from '@/ui/readableTextColor'
import { wrap360 } from './geometry'
import { BAND_INNER_FRACTION, KNOB_TRACK_FRACTION } from './wheel'

/** One guess to place, already narrowed to numbers by whoever read it off the wire. */
export interface RevealGuess {
  userId: string
  hue: number
  /** The guesser's avatar colour — the marker's fill. */
  colorHex: string
}

export interface PlacedGuess extends RevealGuess {
  /** 0 is the outermost lane — the one the input wheel's knob rode. */
  lane: number
  /** The marker's centre, as a fraction of the wheel's radius. */
  trackFraction: number
  /** Mine arrives out of the knob rather than fading in with the rest. */
  mine: boolean
}

export interface RevealLayout {
  markers: PlacedGuess[]
  /** The deepest lane in use; 0 when nothing collides. */
  deepestLane: number
  /** Where the band ends once it has grown inward far enough to carry that lane. */
  bandInnerFraction: number
}

/** How far each lane sits inside the one above it, as a fraction of the wheel's radius. */
export const STACK_STEP = 0.1

/**
 * Two guesses closer than this on the circle go on separate lanes. A lane-0 marker covers about
 * 11.6° itself (`2 · asin(0.09 / 0.89)`), so this sits deliberately just under a full overlap:
 * touching at the edges stays readable, and every degree more makes stacks deeper than they need
 * to be. Turn it in the lab, against real rounds.
 */
export const COLLISION_WINDOW_DEG = 10

/** The band never gets narrower than this — a wheel whose hole has closed is not a wheel. */
export const MIN_BAND_INNER_FRACTION = 0.25

/**
 * The four beats of the reveal, from the moment the reveal card is inserted. Two of them are CSS
 * transitions in the components (the card crossfade at ~200 ms, and the centre button leaving the
 * outgoing card at 0 ms over 200 ms); the three numbers below drive everything the reveal wheel
 * does to itself. They are a first proposal and belong in the lab to be turned — that is what it
 * is for.
 */
export const SECTOR_DELAY_MS = 900
export const MARKERS_DELAY_MS = 1900
export const MARKER_STAGGER_MS = 90
export const FADE_MS = 300
export const BAND_GROW_MS = 700

/**
 * How far each lane sits inside the previous one. Below the floor this is [STACK_STEP]; from six
 * lanes on it is whatever room is actually left, so the stack compresses instead of the hole
 * closing. Expressed as remaining room rather than as a lane count, so it stays correct if any of
 * the three constants above moves.
 */
export function stackStep(deepestLane: number): number {
  if (deepestLane <= 0) return STACK_STEP
  return Math.min(STACK_STEP, (BAND_INNER_FRACTION - MIN_BAND_INNER_FRACTION) / deepestLane)
}

/** The centre of a marker on [lane], given how deep the deepest stack goes. */
export function trackFraction(lane: number, deepestLane: number): number {
  return KNOB_TRACK_FRACTION - lane * stackStep(deepestLane)
}

/**
 * The band's inner edge for a stack that deep. The same subtraction as [trackFraction] — that is
 * why every marker sits on colour with the same margin instead of beside it, and why nothing
 * happens to the band at all when nothing collides.
 */
export function bandInnerFraction(deepestLane: number): number {
  return BAND_INNER_FRACTION - deepestLane * stackStep(deepestLane)
}

/**
 * Distance between two angles along the circle — `min(|a−b|, 360−|a−b|)`. The 0° seam is not a
 * special case here, it falls out of the formula; the original compared raw bounds and therefore
 * stacked nothing across it.
 */
export function circularDistance(a: number, b: number): number {
  const raw = Math.abs(wrap360(a) - wrap360(b))
  return Math.min(raw, 360 - raw)
}

/**
 * Every guess on a lane. Mine always on lane 0 — otherwise the marker no longer covers the knob it
 * grows out of; the rest sorted by angle (ties by user id, so the picture survives a reload) and
 * greedily given the lowest lane with no neighbour inside [COLLISION_WINDOW_DEG].
 */
export function layoutGuesses(guesses: RevealGuess[], mineUserId: string | null): RevealLayout {
  const mine = mineUserId === null ? undefined : guesses.find((g) => g.userId === mineUserId)
  const others = guesses
    .filter((g) => g.userId !== mineUserId)
    .sort((a, b) => wrap360(a.hue) - wrap360(b.hue) || a.userId.localeCompare(b.userId))

  /** The angles already placed, per lane. Sparse until a lane is actually used. */
  const taken: number[][] = []
  function claim(hue: number): number {
    for (let lane = 0; ; lane++) {
      const neighbours = taken[lane] ?? []
      if (neighbours.every((other) => circularDistance(other, hue) >= COLLISION_WINDOW_DEG)) {
        taken[lane] = [...neighbours, hue]
        return lane
      }
    }
  }

  const placed: { guess: RevealGuess; lane: number; mine: boolean }[] = []
  if (mine) {
    taken[0] = [wrap360(mine.hue)]
    placed.push({ guess: mine, lane: 0, mine: true })
  }
  for (const guess of others) {
    placed.push({ guess, lane: claim(wrap360(guess.hue)), mine: false })
  }

  const deepestLane = placed.reduce((deepest, entry) => Math.max(deepest, entry.lane), 0)
  return {
    markers: placed.map((entry) => ({
      ...entry.guess,
      lane: entry.lane,
      mine: entry.mine,
      trackFraction: trackFraction(entry.lane, deepestLane),
    })),
    deepestLane,
    bandInnerFraction: bandInnerFraction(deepestLane),
  }
}

export interface SectorPaths {
  /** The dashed window: two boundary lines and the two arcs that close them. `null` at zero tolerance. */
  window: string | null
  /** The solid line at the solution itself. */
  solution: string
}

/**
 * A point on the wheel in the sector SVG's unit box: centre at (0.5, 0.5), the wheel's edge at
 * radius 0.5. Angles run clockwise from the top, the same origin and direction as the ring's
 * `conic-gradient`, so nothing here needs an offset.
 */
export function unitPoint(angleDeg: number, radiusFraction: number): { x: number; y: number } {
  const rad = ((wrap360(angleDeg) - 90) * Math.PI) / 180
  const r = radiusFraction / 2
  return { x: 0.5 + r * Math.cos(rad), y: 0.5 + r * Math.sin(rad) }
}

/**
 * The window and the solution as two separate paths, because the whole key to reading the picture
 * is that dashed means boundary and solid means solution.
 *
 * Both reach only across the band, from [innerFraction] to the wheel's edge: the hole stays empty.
 * The original drew its boundary lines all the way into the centre.
 */
export function sectorPaths(
  targetHue: number,
  toleranceDeg: number,
  innerFraction: number,
): SectorPaths {
  const radial = (angle: number): string => {
    const inner = unitPoint(angle, innerFraction)
    const outer = unitPoint(angle, 1)
    return `M ${fmt(inner.x)},${fmt(inner.y)} L ${fmt(outer.x)},${fmt(outer.y)}`
  }
  const arc = (radiusFraction: number, from: number, to: number, spanDeg: number): string => {
    const a = unitPoint(from, radiusFraction)
    const b = unitPoint(to, radiusFraction)
    const r = fmt(radiusFraction / 2)
    // Sweep 1 is SVG's positive angle direction, which with y growing downwards is clockwise on
    // screen — the same direction the angles above run in.
    return `M ${fmt(a.x)},${fmt(a.y)} A ${r},${r} 0 ${spanDeg > 180 ? 1 : 0},1 ${fmt(b.x)},${fmt(b.y)}`
  }

  const solution = radial(targetHue)
  if (toleranceDeg <= 0) return { window: null, solution }

  const from = targetHue - toleranceDeg
  const to = targetHue + toleranceDeg
  const span = Math.min(360, toleranceDeg * 2)
  return {
    window: [radial(from), radial(to), arc(innerFraction, from, to, span), arc(1, from, to, span)]
      .join(' '),
    solution,
  }
}

/** Four decimals: past what a 320 px wheel can show, and short enough to keep a path readable. */
function fmt(value: number): string {
  return String(Math.round(value * 10000) / 10000)
}

/**
 * Ink that stays readable against the solution colour — the same idea as the original's
 * `readableColor`, with our own helper.
 */
export function sectorInk(hue: number, saturation: number, lightness: number): string {
  return readableTextColor(hslToHex(hue, saturation, lightness))
}

/**
 * The bridge to [readableTextColor], which parses hex and nothing else. Needed because yellow and
 * blue at the same HSL lightness are nowhere near equally bright, so the decision cannot be made
 * from `lightness` alone.
 */
function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const sector = wrap360(hue) / 60
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const rgb: [number, number, number] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second]
  const [r, g, b] = rgb
  const base = lightness - chroma / 2
  const channel = (value: number): string =>
    Math.round((value + base) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/reveal.spec.ts && pnpm typecheck && pnpm lint
```

Erwartet: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/guesshue/reveal.ts webapp-vue/src/games/guesshue/__tests__/reveal.spec.ts
git commit -m "feat(guesshue): compute lanes, band and sector for the reveal"
```

---

## Task 5: Das Lese-Rad

Der Sektor als SVG, das Rad als Bild — Ring, Marker, Sektor, keine Interaktion, kein Mitten-Slot.
Die Choreografie sitzt hier drin: was nur Deckkraft ist, läuft über CSS-Verzögerungen; die
Band-Innenkante über die eine rAF-Schleife, weil ein Verlauf als `mask-image` nicht verlässlich
interpoliert.

**Files:**
- Create: `webapp-vue/src/games/guesshue/HueToleranceSector.vue`
- Create: `webapp-vue/src/games/guesshue/HueWheelReveal.vue`
- Create: `webapp-vue/src/games/guesshue/__tests__/HueWheelReveal.spec.ts`

**Interfaces:**
- Consumes: alles aus Task 3 und 4.
- Produces: `HueWheelReveal.vue` mit Props
  `{ saturation: number; lightness: number; targetHue: number; toleranceDeg: number; guesses: RevealGuess[]; mineUserId: string | null; animate: boolean }`.

- [ ] **Step 1: Write the failing tests**

`webapp-vue/src/games/guesshue/__tests__/HueWheelReveal.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HueWheelReveal from '@/games/guesshue/HueWheelReveal.vue'
import type { RevealGuess } from '@/games/guesshue/reveal'
import { KNOB_TRACK_FRACTION, trackBoxStyle } from '@/games/guesshue/wheel'

const GUESSES: RevealGuess[] = [
  { userId: 'me', hue: 214.5, colorHex: '#3366cc' },
  { userId: 'other', hue: 40, colorHex: '#cc3366' },
]

function mountWheel(props: Partial<InstanceType<typeof HueWheelReveal>['$props']> = {}) {
  return mount(HueWheelReveal, {
    props: {
      saturation: 0.6,
      lightness: 0.45,
      targetHue: 210,
      toleranceDeg: 10,
      guesses: GUESSES,
      mineUserId: 'me',
      animate: false,
      ...props,
    },
  })
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('HueWheelReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    setHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    setHidden(false)
    vi.restoreAllMocks()
  })

  it("draws one marker per guess, in the guesser's own colour", () => {
    const w = mountWheel()
    const markers = w.findAll('[data-test="hue-marker"]')

    expect(markers).toHaveLength(2)
    // happy-dom may or may not normalise a hex to rgb() — the test pins the colour, not that.
    expect(markers[0]!.element.style.backgroundColor).toMatch(/#3366cc|rgb\(51, ?102, ?204\)/i)
    expect(markers[1]!.element.style.backgroundColor).toMatch(/#cc3366|rgb\(204, ?51, ?102\)/i)
  })

  it('turns each marker to its own angle', () => {
    const rotators = mountWheel().findAll('[data-test="hue-marker-rotator"]')

    expect(rotators[0]!.element.style.transform).toBe('rotate(214.5deg)')
    expect(rotators[1]!.element.style.transform).toBe('rotate(40deg)')
  })

  it("lands my own marker exactly where the input wheel's knob stood", () => {
    // Not recomputed here: both go through `trackBoxStyle`, which is what makes the crossfade read
    // as one circle changing colour rather than two circles swapping places.
    const marker = mountWheel().findAll('[data-test="hue-marker"]')[0]!

    expect(marker.element.style.top).toBe(trackBoxStyle(KNOB_TRACK_FRACTION).top)
  })

  it('stacks a colliding guess inward without moving mine', () => {
    const w = mountWheel({ guesses: [GUESSES[0]!, { userId: 'x', hue: 216, colorHex: '#111111' }] })
    const markers = w.findAll('[data-test="hue-marker"]')

    expect(markers[0]!.element.style.top).toBe(trackBoxStyle(KNOB_TRACK_FRACTION).top)
    expect(markers[1]!.element.style.top).not.toBe(markers[0]!.element.style.top)
  })

  it('is one picture for a screen reader, with the solution and the window in its name', () => {
    const wheel = mountWheel().get('[data-test="hue-wheel-reveal"]')

    expect(wheel.attributes('role')).toBe('img')
    expect(wheel.attributes('aria-label')).toBe(
      'Farbrad mit allen Tipps. Die Lösung liegt bei Azurblau, 210 Grad; als richtig gilt 200 bis 220 Grad.',
    )
  })

  it('says only where the solution is when there is no window', () => {
    const wheel = mountWheel({ toleranceDeg: 0 }).get('[data-test="hue-wheel-reveal"]')

    expect(wheel.attributes('aria-label')).toBe(
      'Farbrad mit allen Tipps. Die Lösung liegt bei Azurblau, 210 Grad.',
    )
  })

  it('takes no input at all', () => {
    const w = mountWheel()

    expect(w.find('[role="slider"]').exists()).toBe(false)
    expect(w.get('[data-test="hue-wheel-reveal"]').attributes('tabindex')).toBeUndefined()
    expect(w.find('[data-test="hue-knob"]').exists()).toBe(false)
  })

  it('draws the window and the solution as separate paths', () => {
    const w = mountWheel()

    expect(w.find('[data-test="hue-sector-window"]').exists()).toBe(true)
    expect(w.get('[data-test="hue-sector-solution"]').attributes('d')).toContain('M ')
  })

  it('draws only the solution line at zero tolerance', () => {
    const w = mountWheel({ toleranceDeg: 0 })

    expect(w.find('[data-test="hue-sector-window"]').exists()).toBe(false)
    expect(w.find('[data-test="hue-sector-solution"]').exists()).toBe(true)
  })

  it('shows the finished picture at once when it is not the one animating', () => {
    // A reload in an already-played round: the card was the reveal on arrival, so there is nothing
    // to play back.
    const w = mountWheel({ animate: false })

    expect(w.get('[data-test="hue-sector"]').classes()).toContain('opacity-100')
    expect(w.findAll('[data-test="hue-marker"]')[1]!.classes()).toContain('opacity-100')
  })

  it('starts the others hidden when it does animate', () => {
    const w = mountWheel({ animate: true })

    expect(w.get('[data-test="hue-sector"]').classes()).toContain('opacity-0')
    expect(w.findAll('[data-test="hue-marker"]')[1]!.classes()).toContain('opacity-0')
    // Mine never fades: it is the knob, recoloured.
    expect(w.findAll('[data-test="hue-marker"]')[0]!.classes()).toContain('opacity-100')
  })

  it('skips straight to the end under reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)

    const w = mountWheel({ animate: true })

    expect(w.get('[data-test="hue-sector"]').classes()).toContain('opacity-100')
  })

  it('skips straight to the end in a background tab', () => {
    // A staged reveal driven by requestAnimationFrame has no driver there, and nobody to see it.
    setHidden(true)

    const w = mountWheel({ animate: true })

    expect(w.get('[data-test="hue-sector"]').classes()).toContain('opacity-100')
  })

  it('grows the band inward once the last beat is due', async () => {
    const stacked = [GUESSES[0]!, { userId: 'x', hue: 216, colorHex: '#111111' }]
    const w = mountWheel({ animate: true, guesses: stacked })

    expect(w.get('[data-test="hue-ring"]').attributes('style')).toContain('78%')

    vi.advanceTimersByTime(4000)
    await w.vm.$nextTick()

    expect(w.get('[data-test="hue-ring"]').attributes('style')).toContain('68%')
  })

  it('has the band at its final width immediately when it does not animate', () => {
    const stacked = [GUESSES[0]!, { userId: 'x', hue: 216, colorHex: '#111111' }]

    const w = mountWheel({ animate: false, guesses: stacked })

    expect(w.get('[data-test="hue-ring"]').attributes('style')).toContain('68%')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/HueWheelReveal.spec.ts
```

Erwartet: FAIL — die Komponente gibt es nicht.

- [ ] **Step 3: Write `HueToleranceSector.vue`**

```vue
<script setup lang="ts">
/**
 * The window and the solution, over the band. Dashed means boundary, solid means solution — that
 * is the whole key to reading the picture, and it is why these are two paths and not one.
 *
 * A unit `viewBox` so the drawing scales with the wheel without measuring anything, and
 * `non-scaling-stroke` so the lines keep their weight in pixels while it does. `aria-hidden`
 * because the statement belongs to the wheel as a whole, not to one of its layers.
 */
import { computed } from 'vue'
import { sectorPaths } from './reveal'

const props = defineProps<{
  targetHue: number
  /** Half-window, in degrees. `0` draws the solution line and no window. */
  toleranceDeg: number
  /** The band's current inner edge — the lines stop there, the hole stays empty. */
  innerFraction: number
  /** Ink that stays readable against the solution colour. */
  color: string
}>()

const paths = computed(() => sectorPaths(props.targetHue, props.toleranceDeg, props.innerFraction))
</script>

<template>
  <svg
    data-test="hue-sector-svg"
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 size-full"
    viewBox="0 0 1 1"
    fill="none"
    :stroke="props.color"
  >
    <path
      v-if="paths.window"
      data-test="hue-sector-window"
      :d="paths.window"
      stroke-width="2"
      stroke-dasharray="6 3"
      vector-effect="non-scaling-stroke"
    />
    <path
      data-test="hue-sector-solution"
      :d="paths.solution"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
```

- [ ] **Step 4: Write `HueWheelReveal.vue`**

```vue
<script setup lang="ts">
/**
 * The wheel after the round: a picture, not a control. The same ring, every guess as a marker on
 * its lane, and the tolerance window over it. No pointer handlers, no keyboard, no centre slot.
 *
 * `role="img"` with one label for the whole thing. **That is deliberately less than parity:**
 * whoever sees the picture also reads how the guesses stand to each other, and the label says only
 * where the solution is. The full statement is the detail table, which is its own cut — until then
 * a known gap beats nothing at all.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { hueName, wrap360 } from './geometry'
import HueRing from './HueRing.vue'
import HueToleranceSector from './HueToleranceSector.vue'
import {
  BAND_GROW_MS,
  FADE_MS,
  MARKERS_DELAY_MS,
  MARKER_STAGGER_MS,
  SECTOR_DELAY_MS,
  layoutGuesses,
  sectorInk,
  type RevealGuess,
} from './reveal'
import { BAND_INNER_FRACTION, easeOutCubic, trackBoxStyle } from './wheel'
import { inBackground, prefersReducedMotion } from '@/ui/motion'

const props = defineProps<{
  /** 0 … 1, as the payload carries them. */
  saturation: number
  lightness: number
  targetHue: number
  /** Half-window, in degrees, as the server sends it. Drawn, never checked. */
  toleranceDeg: number
  guesses: RevealGuess[]
  mineUserId: string | null
  /** False when this card was already the reveal on arrival: a reload shows the finished picture. */
  animate: boolean
}>()

const layout = computed(() => layoutGuesses(props.guesses, props.mineUserId))
const ink = computed(() => sectorInk(props.targetHue, props.saturation, props.lightness))

/**
 * Asked once, when the choreography would start, not reactively — the same two questions every
 * animation in this game asks, plus the environment that has no clock at all (happy-dom).
 */
const still =
  !props.animate ||
  prefersReducedMotion() ||
  inBackground() ||
  typeof requestAnimationFrame !== 'function'

/** Everything that is only opacity hangs off this one flag; the CSS delays do the beats. */
const shown = ref(still)
/** Driven by hand — see [growBand]. */
const innerFraction = ref(still ? layout.value.bandInnerFraction : BAND_INNER_FRACTION)

let frame = 0
let bandStarted = -1

/**
 * The band's inner edge is a stop inside a mask gradient, and gradients do not interpolate as
 * `mask-image` — a plain transition on it jumps. The alternative would be a percentage variable
 * registered with `@property`; this loop wins because the input wheel already knows this shape,
 * and because the skipped-motion end state is then written in exactly one place.
 */
function growBand(now: number): void {
  if (bandStarted < 0) bandStarted = now
  const target = layout.value.bandInnerFraction
  const progress = Math.min(1, Math.max(0, (now - bandStarted - MARKERS_DELAY_MS) / BAND_GROW_MS))
  innerFraction.value =
    BAND_INNER_FRACTION + (target - BAND_INNER_FRACTION) * easeOutCubic(progress)
  frame = progress >= 1 ? 0 : requestAnimationFrame(growBand)
}

onMounted(() => {
  if (still) return
  // One frame with the from-state painted first: a transition that is set and started in the same
  // frame does not run at all.
  frame = requestAnimationFrame(() => {
    shown.value = true
    frame = layout.value.deepestLane === 0 ? 0 : requestAnimationFrame(growBand)
  })
})

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
})

/** Rounded, and folded onto the circle *after* rounding, the same way the input wheel announces. */
function announce(angle: number): number {
  return Math.round(wrap360(angle)) % 360
}

const label = computed(() => {
  const solution = `Die Lösung liegt bei ${hueName(props.targetHue)}, ${announce(props.targetHue)} Grad`
  if (props.toleranceDeg <= 0) return `Farbrad mit allen Tipps. ${solution}.`
  const from = announce(props.targetHue - props.toleranceDeg)
  const to = announce(props.targetHue + props.toleranceDeg)
  return `Farbrad mit allen Tipps. ${solution}; als richtig gilt ${from} bis ${to} Grad.`
})
</script>

<template>
  <div class="w-full">
    <div
      data-test="hue-wheel-reveal"
      role="img"
      :aria-label="label"
      class="relative mx-auto aspect-square w-full max-w-80 rounded-full select-none"
    >
      <HueRing
        :saturation="props.saturation"
        :lightness="props.lightness"
        :inner-fraction="innerFraction"
        :sweep="null"
      />

      <!-- Beat 3: how good was my guess. -->
      <div
        data-test="hue-sector"
        aria-hidden="true"
        class="absolute inset-0 transition-opacity"
        :class="shown ? 'opacity-100' : 'opacity-0'"
        :style="{ transitionDuration: `${FADE_MS}ms`, transitionDelay: `${SECTOR_DELAY_MS}ms` }"
      >
        <HueToleranceSector
          :target-hue="props.targetHue"
          :tolerance-deg="props.toleranceDeg"
          :inner-fraction="innerFraction"
          :color="ink"
        />
      </div>

      <!-- Beat 4: how good was I compared to everyone else. Mine is already there — it is the
           knob, recoloured — so it neither waits nor fades. -->
      <div
        v-for="(marker, index) in layout.markers"
        :key="marker.userId"
        data-test="hue-marker-rotator"
        aria-hidden="true"
        class="absolute inset-0"
        :style="{ transform: `rotate(${marker.hue}deg)` }"
      >
        <span
          data-test="hue-marker"
          class="absolute left-1/2 -translate-x-1/2 rounded-full ring-2 ring-white transition-opacity"
          :class="marker.mine || shown ? 'opacity-100' : 'opacity-0'"
          :style="{
            ...trackBoxStyle(marker.trackFraction),
            backgroundColor: marker.colorHex,
            transitionDuration: `${FADE_MS}ms`,
            transitionDelay: `${MARKERS_DELAY_MS + index * MARKER_STAGGER_MS}ms`,
          }"
        />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue && pnpm typecheck && pnpm lint
```

Erwartet: PASS.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/games/guesshue
git commit -m "feat(guesshue): draw the guesses and the tolerance on a reading wheel"
```

---

## Task 6: Die Karte wechselt

Der Umschalter sitzt im Lab-Adapter — er ist die Stelle, die `unknown` zu getippten Werten macht.
Beide Karten liegen während des Übergangs in derselben Rasterzelle, damit die Höhe der Umgebung die
der jeweils höheren ist und am Ende von selbst auf die der Auswertungskarte fällt.

**Files:**
- Create: `webapp-vue/src/games/guesshue/GuessHueReveal.vue`
- Modify: `webapp-vue/src/games/guesshue/GuessHueBoard.vue`
- Modify: `webapp-vue/src/gamelab/types.ts`
- Modify: `webapp-vue/src/gamelab/GuessHueLabGame.vue`
- Modify: `webapp-vue/src/gamelab/SampleGame.vue`
- Modify: `webapp-vue/src/pages/c/[slug]/lab/[game].vue`
- Test: `webapp-vue/src/gamelab/__tests__/guess-hue-lab.spec.ts`
- Test: `webapp-vue/src/gamelab/__tests__/lab-page.spec.ts`
- Test: `webapp-vue/src/gamelab/__tests__/sample-game.spec.ts`

**Interfaces:**
- Consumes: `HueWheelReveal.vue`, `RevealGuess` aus Task 5/4.
- Produces: `LabRoundResponse.solution: unknown` · `interface GuessHueSolution { targetHue: number; toleranceDeg: number }` ·
  drei neue Props im Lab-Komponentenvertrag: `solution: unknown`, `entries: LabEntryDto[]`,
  `mineUserId: string | null`.

- [ ] **Step 1: Write the failing tests**

In `guess-hue-lab.spec.ts` die Hilfsfunktion um die drei neuen Props ergänzen:

```ts
function mountAdapter(props: Record<string, unknown> = {}) {
  return mount(GuessHueLabGame, {
    props: {
      payload: PAYLOAD,
      outcome: null,
      disabled: false,
      myGuess: null,
      solution: null,
      entries: [],
      mineUserId: null,
      ...props,
    },
  })
}
```

und diesen Block ans Dateiende anfügen:

```ts
const SOLUTION = { targetHue: 210, toleranceDeg: 10 }

function entry(userId: string, hue: unknown, bgColorHex = '#3366cc') {
  return {
    userId,
    username: userId,
    avatar: { shortName: userId.toUpperCase(), bgColorHex },
    guess: { hue },
    outcome: null,
    at: '2026-08-09T12:00:00Z',
  }
}

describe('GuessHueLabGame, once the round is spent', () => {
  // A sibling `describe`, so the reduced-motion stub above does NOT reach these — that stub would
  // make "does not replay the reveal" pass for the wrong reason. Fake frames only, so the beats
  // stay under the test's control.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('turns into the reading wheel as soon as the server reveals the solution', () => {
    const w = mountAdapter({
      solution: SOLUTION,
      entries: [entry('me', 214.5)],
      mineUserId: 'me',
      myGuess: { hue: 214.5 },
      disabled: true,
    })

    expect(w.find('[data-test="hue-wheel-reveal"]').exists()).toBe(true)
    expect(w.find('[data-test="hue-wheel"]').exists()).toBe(false)
    // The input card's rule belongs to the input card.
    expect(w.find('[data-test="hue-hint"]').exists()).toBe(false)
    // The quote stays — it is what the picture is about.
    expect(w.get('[data-test="hue-description"]').text()).toBe(
      '„Testbeschreibung einer Farbe.“',
    )
  })

  it('goes back to the input card when the guess is deleted', async () => {
    const w = mountAdapter({
      solution: SOLUTION,
      entries: [entry('me', 214.5)],
      mineUserId: 'me',
      disabled: true,
    })

    await w.setProps({ solution: null, entries: [], mineUserId: null, disabled: false })

    expect(w.find('[data-test="hue-wheel"]').exists()).toBe(true)
    expect(w.find('[data-test="hue-wheel-reveal"]').exists()).toBe(false)
  })

  it.each([
    ['null', null],
    ['a number', 7],
    ['an empty object', {}],
    ['a non-numeric target', { targetHue: 'blau', toleranceDeg: 10 }],
    ['a non-finite target', { targetHue: NaN, toleranceDeg: 10 }],
    ['a missing tolerance', { targetHue: 210 }],
    ['a non-finite tolerance', { targetHue: 210, toleranceDeg: Infinity }],
  ])('leaves the input card standing for %s', (_label, solution) => {
    // `solution` is `unknown` by contract; junk must not put NaN into a transformation matrix.
    const w = mountAdapter({ solution, entries: [entry('me', 214.5)], mineUserId: 'me' })

    expect(w.find('[data-test="hue-wheel"]').exists()).toBe(true)
    expect(w.find('[data-test="hue-wheel-reveal"]').exists()).toBe(false)
  })

  it('draws one marker per usable entry', () => {
    const w = mountAdapter({
      solution: SOLUTION,
      entries: [entry('me', 214.5), entry('a', 40, '#cc3366'), entry('b', 300, '#33cc66')],
      mineUserId: 'me',
      disabled: true,
    })

    expect(w.findAll('[data-test="hue-marker"]')).toHaveLength(3)
  })

  it.each([
    ['a non-finite angle', entry('bad', NaN)],
    ['a string angle', entry('bad', '214')],
    ['no angle at all', { ...entry('bad', 0), guess: {} }],
    ['a guess from another game', { ...entry('bad', 0), guess: { value: 7 } }],
    ['no guess object', { ...entry('bad', 0), guess: null }],
  ])('drops an entry with %s instead of drawing it', (_label, bad) => {
    const w = mountAdapter({
      solution: SOLUTION,
      entries: [entry('me', 214.5), bad],
      mineUserId: 'me',
      disabled: true,
    })

    expect(w.findAll('[data-test="hue-marker"]')).toHaveLength(1)
  })

  it('plays the reveal for the guess that just landed', async () => {
    // The other direction from the reload below: this instance watched the round flip, so the
    // others are still waiting behind their delay — no frame has run to start the beats.
    const w = mountAdapter()

    await w.setProps({
      solution: SOLUTION,
      entries: [entry('me', 214.5), entry('a', 40, '#cc3366')],
      mineUserId: 'me',
      disabled: true,
    })

    expect(w.find('[data-test="hue-wheel-reveal"]').exists()).toBe(true)
    expect(w.findAll('[data-test="hue-marker"]')[1]!.classes()).toContain('opacity-0')
  })

  it('does not replay the reveal for someone reloading a spent round', () => {
    // Suspense belongs to the moment of the guess, not to the load. Mounted straight into the
    // reveal means there was no moment to build up to.
    const w = mountAdapter({
      solution: SOLUTION,
      entries: [entry('me', 214.5), entry('a', 40, '#cc3366')],
      mineUserId: 'me',
      disabled: true,
    })

    expect(w.findAll('[data-test="hue-marker"]')[1]!.classes()).toContain('opacity-100')
  })
})
```

In `lab-page.spec.ts` ans Ende der `describe('lab page', …)` anfügen:

```ts
  it('hands the game everything the reveal needs', async () => {
    // The page is the only place that knows all three: what the server revealed, who is in the
    // round, and which of them is the viewer.
    currentParams = { slug: 'team', game: 'guess-hue' }
    const mineHue = {
      userId: 'u1',
      username: 'Fry',
      avatar: { shortName: 'FRY', bgColorHex: '#abcdef' },
      guess: { hue: 214.5 },
      outcome: null,
      at: '2026-08-09T12:00:00Z',
    }
    const theirHue = { ...mineHue, userId: 'u2', username: 'Bender', guess: { hue: 40 } }
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      seed: 42,
      game: 'guess-hue',
      displayName: 'Farbausmalung',
      payload: { description: 'Eine Runde.', initHue: 10, saturation: 0.6, lightness: 0.45 },
      solution: { targetHue: 210, toleranceDeg: 10 },
      me: mineHue,
      others: [theirHue],
      tookOverRound: false,
    } as never)

    const w = await mountPage()

    expect(w.find('[data-test="hue-wheel-reveal"]').exists()).toBe(true)
    expect(w.findAll('[data-test="hue-marker"]')).toHaveLength(2)
  })
```

In `sample-game.spec.ts` anfügen:

```ts
  it('takes none of the reveal props into the DOM', () => {
    // The three reveal props are part of the contract, and the sample game wants none of them.
    // Undeclared props fall through as attributes, and an array of entries would land in the DOM
    // as `[object Object]`.
    const w = mount(SampleGame, {
      props: { payload: { lowerBound: 1, upperBound: 100 }, outcome: null, disabled: false, myGuess: null },
      attrs: { solution: { targetHue: 1, toleranceDeg: 2 }, entries: [{ userId: 'x' }], 'mine-user-id': 'x' },
    })

    expect(w.element.outerHTML).not.toContain('object Object')
    expect(w.attributes('mine-user-id')).toBeUndefined()
  })
```

(Die vorhandenen `mount(SampleGame, …)`-Aufrufe der Datei als Vorlage für Props/Imports nehmen.)

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd webapp-vue && pnpm exec vitest run src/gamelab
```

Erwartet: FAIL — die Auswertungskarte gibt es nicht, `solution` fehlt in `LabRoundResponse`
(Typfehler in `lab-page.spec.ts`), und die drei Props kommen nirgends an.

- [ ] **Step 3: Extend the frontend types**

In `webapp-vue/src/gamelab/types.ts`, in `LabRoundResponse` hinter `payload`:

```ts
  /**
   * What the game revealed once the viewer had spent their guess; `null` in front of that gate.
   * `unknown` for the same reason `payload` is generic — the shape belongs to the game.
   */
  solution: unknown
```

und ans Dateiende:

```ts
/** Guess Hue's solution. It reaches the client only once `me` is set — see the backend's gate. */
export interface GuessHueSolution {
  targetHue: number
  /** Half-window, in degrees. `0` means "no window", not "no tolerance information". */
  toleranceDeg: number
}
```

Die drei bestehenden Fixtures in `lab-page.spec.ts` (`round`, `first`, `second`) bekommen
`solution: null`; `second` erbt es über den Spread.

- [ ] **Step 4: Write `GuessHueReveal.vue`**

```vue
<script setup lang="ts">
/**
 * The card after the round: the same quote, and the wheel as a picture.
 *
 * **Nothing under it.** The input card's rule is wrong here, and a line of numbers would be a
 * stand-in for the detail table that belongs in that space — which is its own cut. So the card
 * gets *shorter* at the switch, and much longer again later. That is the decision, not a side
 * effect: pulling in a line just to keep the height would build a line that disappears again.
 */
import HueWheelReveal from './HueWheelReveal.vue'
import type { RevealGuess } from './reveal'

const props = defineProps<{
  description: string
  saturation: number
  lightness: number
  targetHue: number
  toleranceDeg: number
  guesses: RevealGuess[]
  mineUserId: string | null
  animate: boolean
}>()
</script>

<template>
  <div class="rounded-xl border border-neutral-200 bg-white p-4">
    <blockquote class="border-l-4 border-neutral-300 py-1 pl-4">
      <p
        data-test="hue-description"
        class="text-xl leading-relaxed font-medium text-neutral-900 italic select-none"
      >
        „{{ props.description }}“
      </p>
    </blockquote>

    <div class="mt-6">
      <HueWheelReveal
        :saturation="props.saturation"
        :lightness="props.lightness"
        :target-hue="props.targetHue"
        :tolerance-deg="props.toleranceDeg"
        :guesses="props.guesses"
        :mine-user-id="props.mineUserId"
        :animate="props.animate"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 5: Give the centre button its own beat in `GuessHueBoard.vue`**

Der Mittelknopf verlässt die abgehende Karte vor allem anderen. Getaktet wird das über die
Leave-Klasse, die der Adapter auf die Karte legt — deshalb braucht es keine komponentenübergreifende
Zustandsmaschine, nur eine Klasse, die von einem Vorfahren abhängt.

Am Wurzel-`<div>` `group` ergänzen:

```vue
  <!-- `group` exists for one descendant: the centre button reacts to the leave class the lab
       adapter's card transition puts on this element (`hue-card-leaving`). -->
  <div class="group rounded-xl border border-neutral-200 bg-white p-4">
```

und den Mittelknopf einwickeln:

```vue
        <template #center>
          <!-- Beat 1 of the reveal: the button leaves before the card behind it does. -->
          <div
            class="size-full transition duration-200 ease-in group-[.hue-card-leaving]:scale-50 group-[.hue-card-leaving]:opacity-0 motion-reduce:transition-none"
          >
            <HoldButton
              :ready="ready"
              :disabled="props.disabled"
              :color="color"
              label="Tipp bestätigen — gedrückt halten"
              @confirm="emit('guess', hue)"
            />
          </div>
        </template>
```

- [ ] **Step 6: Rewrite the lab adapter**

`webapp-vue/src/gamelab/GuessHueLabGame.vue`, vollständig:

```vue
<script setup lang="ts">
/**
 * Guess Hue in the lab: which card the round is on, and the two things only the lab needs — the
 * guess wrapped into the shape the endpoint takes, and the server's `unknown`s narrowed to numbers.
 *
 * The switch lives here rather than in the board because this is the place that turns `unknown`
 * into typed values. `myGuess` stays beside `entries` even though it is derivable from it: it has
 * its own documented job — the wheel's starting angle after a reload — and `SampleGame` hangs off
 * the same prop.
 */
import { computed } from 'vue'
import GuessHueBoard from '@/games/guesshue/GuessHueBoard.vue'
import GuessHueReveal from '@/games/guesshue/GuessHueReveal.vue'
import type { RevealGuess } from '@/games/guesshue/reveal'
import type { GuessHuePayload, GuessHueSolution, LabEntryDto } from './types'

const props = defineProps<{
  payload: GuessHuePayload
  outcome: unknown
  disabled: boolean
  /** The viewer's own stored guess, in whatever shape the game recorded it. */
  myGuess: unknown
  /** What the server revealed once the viewer had spent their guess, or `null`. */
  solution: unknown
  /** The visible entries, in the order the lab page already builds — mine first. */
  entries: LabEntryDto[]
  /** Which of them is mine. Never the position: that is a display decision. */
  mineUserId: string | null
}>()

const emit = defineEmits<{ guess: [value: unknown] }>()

/** Narrowed rather than cast: `unknown` by contract, and a stale round may be junk. */
function hueOf(guess: unknown): number | null {
  if (typeof guess !== 'object' || guess === null) return null
  const hue = (guess as { hue?: unknown }).hue
  return typeof hue === 'number' && Number.isFinite(hue) ? hue : null
}

const myHue = computed(() => hueOf(props.myGuess))

/**
 * Two finite numbers or nothing at all. Junk here leaves the input card standing, which is the
 * honest outcome — the alternative is `NaN` in a transformation matrix.
 */
const solution = computed<GuessHueSolution | null>(() => {
  const raw = props.solution
  if (typeof raw !== 'object' || raw === null) return null
  const { targetHue, toleranceDeg } = raw as { targetHue?: unknown; toleranceDeg?: unknown }
  if (typeof targetHue !== 'number' || !Number.isFinite(targetHue)) return null
  if (typeof toleranceDeg !== 'number' || !Number.isFinite(toleranceDeg)) return null
  return { targetHue, toleranceDeg }
})

/** An entry the wheel cannot place drops out of the list rather than being drawn wrong. */
const guesses = computed<RevealGuess[]>(() =>
  props.entries.flatMap((entry) => {
    const hue = hueOf(entry.guess)
    return hue === null
      ? []
      : [{ userId: entry.userId, hue, colorHex: entry.avatar.bgColorHex }]
  }),
)

/**
 * Whether the reveal is something that *happened* here, or something that was already true when
 * this component mounted. A reload in a spent round lands on the finished picture: suspense belongs
 * to the moment of the guess, not to the load. Read once, at setup — that is exactly the question.
 */
const arrivedUnrevealed = solution.value === null
const animate = computed(() => arrivedUnrevealed && solution.value !== null)
</script>

<template>
  <!--
    One grid cell for both cards, rather than one absolutely positioned over the other: this way
    the surroundings are as tall as whichever card is taller during the crossfade, and fall to the
    reveal card's height by themselves once the outgoing one is gone.
  -->
  <div class="grid">
    <!--
      Beat 2. No `mode`, so both cards overlap: my marker sits on the same radius and the same
      angle as the knob by construction, which is what makes the crossfade read as one circle
      changing colour. No `appear`, so a reload does not replay any of it.
    -->
    <Transition
      enter-active-class="transition-opacity duration-500 delay-200 motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-active-class="hue-card-leaving transition-opacity duration-300 motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <GuessHueReveal
        v-if="solution"
        class="[grid-area:1/1]"
        :description="props.payload.description"
        :saturation="props.payload.saturation"
        :lightness="props.payload.lightness"
        :target-hue="solution.targetHue"
        :tolerance-deg="solution.toleranceDeg"
        :guesses="guesses"
        :mine-user-id="props.mineUserId"
        :animate="animate"
      />
      <GuessHueBoard
        v-else
        class="[grid-area:1/1]"
        :description="props.payload.description"
        :init-hue="myHue ?? props.payload.initHue"
        :saturation="props.payload.saturation"
        :lightness="props.payload.lightness"
        :disabled="props.disabled"
        @guess="(hue: number) => emit('guess', { hue })"
      />
    </Transition>
  </div>
</template>
```

- [ ] **Step 7: Let the sample game ignore the three props**

In `SampleGame.vue`, direkt hinter den Imports:

```ts
/**
 * The three reveal props are part of the lab's component contract and this game wants none of
 * them. Undeclared props fall through as attributes, and an array of entries would land in the DOM
 * as `entries="[object Object]"`.
 */
defineOptions({ inheritAttrs: false })
```

- [ ] **Step 8: Pass them from the page**

In `src/pages/c/[slug]/lab/[game].vue` am `<component :is>` ergänzen:

```vue
      :solution="round.solution"
      :entries="entries"
      :mine-user-id="round.me?.userId ?? null"
```

`disabled` bleibt `busy || round.me !== null` — das ist die Aussage der *Seite* („die Runde ist
verbraucht“), und Spiele ohne Auswertungskarte hängen daran. Dass das Rad diesen Zustand nicht mehr
in Graustufen malt, ist Task 3.

- [ ] **Step 9: Run the tests to verify they pass**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Erwartet: alles PASS.

- [ ] **Step 10: Commit**

```bash
git add webapp-vue/src
git commit -m "feat(guesshue): switch to the reveal card once the round is spent"
```

---

## Task 7: Im Labor nachsehen, und die Guidelines

Was die Tests nicht abdecken, ist wie das Bild aussieht. Radien sind Brüche, die sich prüfen lassen
— ob ein sechsfacher Stapel noch lesbar ist und ob die drei Pausen sich richtig anfühlen, ist eine
Browsermessung.

**Files:**
- Inspect: `.claude/guidelines/feeding-knowledge-back.md`, `.claude/guidelines/game-lab.md`
- Modify only if all three admission questions pass: die betroffene `.claude/guidelines/*.md`

- [ ] **Step 1: Run everything once more**

```bash
cd core && ./mvnw test
cd ../webapp-vue && pnpm test && pnpm typecheck && pnpm lint
cd .. && git diff --check && git status --short --branch
```

Erwartet: alles grün, keine Whitespace-Fehler, keine ungewollten Änderungen.

- [ ] **Step 2: Verify in the lab, against `/c/{slug}/lab/guess-hue?seed=…`**

Backend und Frontend starten (`cd core && ./mvnw spring-boot:run`, `cd webapp-vue && pnpm dev`),
dann der Reihe nach:

1. **Schmal und breit.** Das Rad bleibt ein Rad, der Sektor bleibt lesbar, nichts läuft über.
2. **Mehrere Testnutzer** (Test-User-Picker) für echte Stapel — inklusive des Extremfalls „alle
   raten dasselbe“, also ≥ 7 Tipps im selben 10°-Fenster. Der Boden greift ab dem sechsten Stapel:
   das Loch schrumpft nicht weiter, die Marker überlappen stärker.
3. **Der Höhenwechsel der Karte** beim Übergang — ausdrücklich mitbeurteilen. Stört er, ist die
   Antwort ein Übergang auf der Höhe und **keine Füllzeile**.
4. **Die vier Takte.** Knopf raus (0 ms), Karten-Überblendung (~200 ms), Sektor (~900 ms), die
   anderen Marker gestaffelt samt wachsendem Band (~1900 ms). Liegt mein Marker beim Wechsel genau
   auf dem Knopf?
5. **Reduzierte Bewegung** (macOS: Systemeinstellungen → Bedienungshilfen → Anzeige → Bewegung
   reduzieren; oder DevTools → Rendering → *Emulate CSS prefers-reduced-motion*): das fertige Bild
   erscheint sofort, ohne Ruckeln.
6. **Reload** in einer bereits gespielten Runde: das fertige Bild, ohne Nachspielen.
7. **„Meinen Guess löschen“**: zurück auf die Eingabekarte, `solution` wieder `null`.
8. **Der Sektor über der 0°-Naht** — Seeds durchprobieren, bis ein Ziel nahe 0° fällt, und prüfen,
   dass das Fenster geschlossen gezeichnet wird und nicht den langen Weg herum nimmt.

Was auffällt, gehört in den Commit (Messungen, Browser, Viewport) — nicht in die Guidelines.

- [ ] **Step 3: Decide the guideline outcome**

Die Aufnahmehürde erneut lesen. Zwei Kandidaten stehen zur Prüfung, beide sind *keine*
Selbstläufer:

- **`.claude/guidelines/game-lab.md`** — der Abschnitt „Payload hygiene is a red test“ beschreibt
  heute nur `reveal()`. Es gibt jetzt einen zweiten Weg aus dem Server, mit einer eigenen Schranke
  und einem eigenen Feldmengen-Test. Das trifft jedes künftige Spiel, das etwas nach der Abgabe
  zeigt, und wird von keinem Test erzwungen — **das ist die wahrscheinliche Aufnahme**, als
  ~3 Zeilen: `LabGame.solution(seed)` hat einen Default (`null`, die sichere Richtung), die
  Schranke ist `me != null` und sitzt serverseitig, und jede `LabSolution` bekommt denselben
  Feldmengen-Test wie ihr Payload.
- **`.claude/guidelines/frontend-ui.md`** — ob „Verläufe interpolieren als `mask-image` nicht
  verlässlich, also treibt eine rAF-Schleife die eine Zahl“ transferabel genug ist. Prüfen: beißt
  das außerhalb dieses Rades wieder? Wenn nicht, bleibt es Code plus Commit.

Fällt eine Entscheidung auf „nein“, wird sie **nicht** dokumentiert — „wichtig, aber nicht in den
Guidelines“ ist ein legitimes Ergebnis. Kein leerer Doku-Commit.

- [ ] **Step 4: Commit whatever the decision was**

```bash
git add .claude/guidelines
git commit -m "docs: record the lab's second way out of the server"
```

(Entfällt, wenn Step 3 auf „keine Änderung“ endet.)
