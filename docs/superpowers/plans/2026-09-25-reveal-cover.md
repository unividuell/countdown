# Die Hülle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Aufdecken einer versiegelten Runde wird vom eigenen Bildschirm zur Hülle über dem schon gemounteten Spiel; das 3 · 2 · 1 wandert vom Band in einen Halteknopf.

**Architecture:** Server: ein dritter Ausgang `GameType.scene(params)` (Vorgabe `null`), ausgeliefert in jeder Antwort einer angekündigten Runde. Client: jede Spielkomponente bekommt `sealed`, `scene` und das Ereignis `reveal`; Musterung und Weltanschauung legen eine gemeinsame `RevealCover` über ihre Spielfläche. `RoundCard` und die Laborseite mounten das Spiel auch versiegelt und verlieren ihren eigenen Aufdeck-Screen, das Briefing-Register und die Zeremonie im Band.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 · JUnit 5 + kotest-Matcher + mockk + Testcontainers · Vue 3 + TypeScript strict + Vitest + @vue/test-utils (happy-dom) · Tailwind v4.

**Spec:** [`docs/superpowers/specs/2026-09-25-reveal-cover-design.md`](../specs/2026-09-25-reveal-cover-design.md)

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch**, deutsche Anführungszeichen `„…“`, nie `"`. Spec und Plan bleiben deutsch.
- **Commit-Messages** nach den 7 Regeln aus `CLAUDE.md`: Betreff imperativ, groß, ohne Punkt, ≤ 50 Zeichen; Leerzeile; Body umbrochen bei 72, erklärt *was* und *warum*. **Kein** `feat:`-Präfix. Letzte Zeile genau: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` — wörtlich, nicht der eigene Modellname.
- **Niemals `git commit --amend`**, immer ein neuer Commit.
- **Kotlin:** named arguments ab zwei Argumenten an jedem Aufrufpunkt (Ausnahmen: ein Argument, varargs, Java-deklarierte Funktionen, trailing lambdas, infix) — `.claude/guidelines/kotlin.md`.
- **Testing-Stack:** kotest-Matcher (`shouldBe`, `shouldBeNull`), Spring-Kontext-Tests mit `TestcontainersConfiguration`. Frontend: Vitest + `vi`, nie mockk.
- **TDD:** erst der fallende Test, dann die minimale Implementierung.
- **Keine redundanten Inline-Kommentare.** Kein Grabstein-Kommentar für Entferntes; die Begründung steht im Commit. Neue Kommentare nur, wo sie beim Lesen *dieser* Zeile einen Fehler verhindern.
- **Namen:** die Bühne heißt im Code **`scene`** (`GameScene`, `scene(params)`, Prop `scene`, `FindPatternScene`). **Nie `stage`** — `stage` ist die Stufe eines gestuften Spiels und als Prop jeder Spielkomponente schon vergeben.
- **Die Hülle verschwindet im selben Render, in dem der Payload ankommt.** Kein `<Transition>`, keine Übergangsklasse auf der Hülle.
- **Wörtliche Texte:**
  - Warnsatz: `Deine Zeit läuft ab dem Aufdecken — und du hast nur <strong>einen</strong> Versuch.`
  - Knopf in Ruhe: `START`
  - Vorbereitung: `Wird vorbereitet …`
  - Fehler: `Das Spiel konnte nicht geladen werden.` und Knopf `Nochmal versuchen`
- **Haltedauer der Hülle:** `3 × BEAT_MS`, `BEAT_MS = 1000`.
- Backend-Befehle aus `core/`, Frontend-Befehle aus `webapp-vue/`.
- **Nicht im Browser-Pane prüfbar:** das Halten läuft über `requestAnimationFrame`, und `useHoldProgress` bricht bei `visibilitychange` ab; der Pane meldet sich immer als versteckt. Kein Implementer versucht, das Halten dort nachzuweisen.

## File Structure

**Backend, geändert:**

| Datei | Änderung |
|---|---|
| `core/src/main/kotlin/org/unividuell/countdown/core/game/GameType.kt` | `interface GameScene`, `fun scene(params: P): GameScene? = null` |
| `core/src/main/kotlin/org/unividuell/countdown/core/game/GameCatalog.kt` | `GameTypeHandle.scene(params: JsonNode)` |
| `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundDtos.kt` | `RoundResponse.scene` |
| `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt` | füllt `scene` |
| `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabDtos.kt` | `LabRoundResponse.scene` |
| `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabService.kt` | füllt `scene` |
| `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/FindPatternGameType.kt` | `FindPatternScene`, `scene()` |

**Frontend, neu:**

| Datei | Aufgabe |
|---|---|
| `webapp-vue/src/ui/sceneState.ts` | Typ `SceneState` |
| `webapp-vue/src/ui/RevealCover.vue` | Milchglas, Warnsatz, Zustände, Halteknopf |
| `webapp-vue/src/ui/playClock.ts` | Typ `PlayClock` (zieht aus `useStartCeremony.ts` um) |

**Frontend, geändert:** `ui/useHoldProgress.ts`, `ui/HoldButton.vue`, `games/findpattern/{types.ts, PatternGrid.vue, FindPatternBoard.vue, FindPatternGame.vue}`, `games/spotobject/{useStreetView.ts, SpotObjectBoard.vue, SpotObjectGame.vue}`, `games/guesshue/GuessHueGame.vue`, `games/songsnippet/SongSnippetGame.vue`, `games/registry.ts`, `gamelab/{games.ts, types.ts}`, `api/types.ts`, `rounds/RoundCard.vue`, `pages/c/[slug]/index.vue`, `pages/c/[slug]/lab/[game]/index.vue`, `ui/GameHeader.vue`, `ui/flipdot/FlipDotBoard.vue`.

**Frontend, gelöscht:** `ui/useStartCeremony.ts`, `ui/__tests__/useStartCeremony.spec.ts`.

**Doku:** `.claude/guidelines/game-rounds.md`, `.claude/guidelines/frontend-ui.md`, `docs/superpowers/specs/2026-09-11-game-stopwatch-design.md`.

Reihenfolge: Server (1) → Knopf (2) → Hülle (3) → die zwei Spiele (4, 5) → Rahmen umschalten (6) → Band aufräumen (7) → Doku (8). Nach jedem Task sind alle Tests grün: die Spiele können versiegelt rendern, bevor die Karte es von ihnen verlangt.

---

### Task 1: Server — der dritte Ausgang `scene`

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameType.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameCatalog.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/FindPatternGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/FindPatternGameTypeTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GuessHueGameTypeTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/SongSnippetGameTypeTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/SpotObjectGameTypeTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PlayServiceStrictRevealTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt`

**Interfaces:**
- Produces: `interface GameScene` (Paket `org.unividuell.countdown.core.game`); `GameType.scene(params: P): GameScene?` mit Vorgabe `null`; `GameTypeHandle.scene(params: JsonNode): GameScene?`; `RoundResponse.scene: GameScene?` (JSON-Feld `scene`); `LabRoundResponse.scene: GameScene?`; `data class FindPatternScene(val cols: Int, val rows: Int, val patternLength: Int) : GameScene` in `game.internal`, JSON `{"cols":8,"rows":14,"patternLength":4}`.

- [ ] **Step 1: Failing tests schreiben**

In `FindPatternGameTypeTest.kt`, neben den Payload-Feld-Set-Test:

```kotlin
    @Test
    fun `the scene carries exactly the layout`() {
        val json = mapper.writeValueAsString(game.scene(draw(phase = Phase.TWO)))
        val fields = mapper.readTree(json).propertyNames().toSet()

        fields shouldBe setOf("cols", "rows", "patternLength")
    }

    /** Published before the reveal, so nothing drawn may reach it — from either stream. */
    @Test
    fun `the scene is the same for every round`() {
        val a = game.scene(draw(phase = Phase.TWO, seed = 1, presentationSeed = 7))
        val b = game.scene(draw(phase = Phase.TWO, seed = 2, presentationSeed = 99))

        a shouldBe b
        a shouldBe FindPatternScene(
            cols = FindPatternLayout.COLS,
            rows = FindPatternLayout.ROWS,
            patternLength = FindPatternLayout.PATTERN_LENGTH,
        )
    }
```

Import `org.unividuell.countdown.core.game.internal.FindPatternScene`.

In `GuessHueGameTypeTest.kt`, `SongSnippetGameTypeTest.kt`, `SpotObjectGameTypeTest.kt` je ein Test mit dem vorhandenen `draw`-Helfer der Datei (Guess Hue und Weltanschauung: `draw(phase = Phase.TWO)`; Anspielung: `draw()`):

```kotlin
    @Test
    fun `it sets up no scene before the reveal`() {
        game.scene(draw(phase = Phase.TWO)).shouldBeNull()
    }
```

(`io.kotest.matchers.nulls.shouldBeNull` importieren.)

In `PlayServiceStrictRevealTest.kt`: die Fake-Klasse bekommt eine Bühne, der Test den `AnnouncementService`.

```kotlin
    @TestConfiguration
    class StrictRevealGame {
        data class StrictParams(val label: String)
        data class StrictPayload(val label: String) : GamePayload
        data class StrictScene(val size: Int) : GameScene

        @Bean
        fun strictGame(): GameType<StrictParams> = object : GameType<StrictParams> {
            // … unverändert …
            override fun scene(params: StrictParams) = StrictScene(size = 3)
        }
    }
```

Konstruktor-Parameter ergänzen: `@Autowired val announcements: AnnouncementService` (Import `org.unividuell.countdown.core.game.internal.AnnouncementService`). Neuer Test:

```kotlin
    @Test
    fun `the scene is out before the reveal, the payload only after it`() {
        val (community, viewer) = aCommunity("Strict Scene")
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        store.announce(
            edition = edition, roundNumber = currentRoundNumberOf(community),
            gameType = "strict-reveal", params = mapper.readTree("""{"label":"x"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )

        val before = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)
        before.scene shouldBe StrictRevealGame.StrictScene(size = 3)
        before.payload.shouldBeNull()

        val after = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        after.scene shouldBe StrictRevealGame.StrictScene(size = 3)
        after.payload.shouldNotBeNull()
    }
```

In `LabServiceTest.kt`, im Abschnitt „the lab's own reveal gate“:

```kotlin
    @Test
    fun `a sealed lab round hands out its scene before the reveal`() {
        val (community, mine) = aCommunityWithTwoMembers()

        val response = service.open(
            slug = community.slug, gameId = "find-pattern", seed = 42, phase = Phase.TWO,
            userId = mine.me, isSuperAdmin = false,
        )

        response.payload.shouldBeNull()
        response.scene shouldBe FindPatternScene(
            cols = FindPatternLayout.COLS,
            rows = FindPatternLayout.ROWS,
            patternLength = FindPatternLayout.PATTERN_LENGTH,
        )
    }
```

- [ ] **Step 2: Laufen lassen, Fehlschlag bestätigen**

Run: `cd core && ./mvnw -q test -Dtest='FindPatternGameTypeTest,GuessHueGameTypeTest,SongSnippetGameTypeTest,SpotObjectGameTypeTest,PlayServiceStrictRevealTest,LabServiceTest'`
Expected: Kompilierfehler — `GameScene`, `scene`, `FindPatternScene` unbekannt.

- [ ] **Step 3: Implementieren**

`GameType.kt`, direkt nach `interface GameSolution`:

```kotlin
/**
 * What may reach the client **before** the reveal — the scene the game is set up on under the
 * cover, never the puzzle. A third way out next to [GamePayload] and [GameSolution], pinned per
 * game by a field-set test like both of them. Scene, not stage: stage is the rung of a staged game.
 */
interface GameScene
```

Im Interface `GameType`, direkt nach `present`:

```kotlin
    /**
     * What may be with the client before the reveal. `null` — the default — is a game whose scene
     * is its code alone, and the default is the safe direction: a game that says nothing hands out
     * nothing early. Published like the payload, so drawn from [GameRandom.presentation] if drawn
     * at all.
     */
    fun scene(params: P): GameScene? = null
```

`GameCatalog.kt`, in `GameTypeHandle` nach `present`:

```kotlin
    /** What may be shown before the reveal, from a stored `params` blob. */
    fun scene(params: JsonNode): GameScene? = type.scene(paramsOf(params))
```

`RoundDtos.kt`, in `RoundResponse` nach `previousRoundNumber`:

```kotlin
    /** Before the reveal and after it alike — it carries nothing the reveal protects. */
    val scene: GameScene? = null,
```

`RoundResponses.kt`, im `RoundResponse(...)` von `announced(...)` nach `previousRoundNumber = …`:

```kotlin
            scene = current.handle.scene(current.roundGame.params),
```

`LabDtos.kt`, in `LabRoundResponse` direkt vor `payload`:

```kotlin
    /** Before the reveal and after it alike — mirrors `RoundResponse.scene`. */
    val scene: GameScene? = null,
```

`LabService.kt`, in `respond(...)` im `LabRoundResponse(...)` direkt vor `payload = …`:

```kotlin
            scene = handle.scene(snapshot.round.params),
```

`FindPatternGameType.kt`, nach `FindPatternPayload`:

```kotlin
/** The empty board the cover lies over: the layout, which the payload repeats, and nothing drawn. */
data class FindPatternScene(val cols: Int, val rows: Int, val patternLength: Int) : GameScene
```

Import `org.unividuell.countdown.core.game.GameScene`. In der Klasse nach `present`:

```kotlin
    override fun scene(params: FindPatternParams) = FindPatternScene(
        cols = FindPatternLayout.COLS,
        rows = FindPatternLayout.ROWS,
        patternLength = FindPatternLayout.PATTERN_LENGTH,
    )
```

- [ ] **Step 4: Tests grün**

Run: dieselbe Zeile wie in Step 2, dann `cd core && ./mvnw -q test -Dtest='LabControllerTest,RoundControllerTest,ModularityTests'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src
git commit -F - <<'MSG'
Hand out a game's scene before the reveal

A sealed game will be mounted under a cover before it is revealed,
and it may prepare whatever carries no part of the puzzle. scene()
is the third way out of the server for that, next to present() and
solution(), and null by default so a game that says nothing hands
out nothing early. Musterung sends its layout, which the payload
already repeats; the other games have no scene.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 2: `HoldButton` — Halten ist Einzählen

**Files:**
- Modify: `webapp-vue/src/ui/useHoldProgress.ts`
- Modify: `webapp-vue/src/ui/HoldButton.vue`
- Modify: `webapp-vue/src/ui/useStartCeremony.ts` (nur `BEAT_MS` importieren statt definieren)
- Test: `webapp-vue/src/ui/__tests__/HoldButton.spec.ts`
- Test: `webapp-vue/src/ui/__tests__/useHoldProgress.spec.ts`

**Interfaces:**
- Produces: `export const BEAT_MS = 1000` in `ui/useHoldProgress.ts`; `useHoldProgress(durationMs, onComplete, options?: { restartOnPress?: boolean })`; `HoldButton` mit optionalem Prop `beats?: number`. Mit `beats` ist die Haltedauer `beats × BEAT_MS` (ein übergebenes `holdMs` wird ignoriert), das Element `[data-test="hold-face"]` zeigt in Ruhe `label`, beim Halten die Ziffer, beim Loslassen dieselbe Ziffer mit Klasse `opacity-0`, und ein Druck beginnt immer bei `beats`. Ohne `beats` gibt es kein `hold-face`, und alles bleibt wie heute. Eine `aria-live="polite"`-Region `[data-test="hold-beat"]` trägt die Ziffer nur während des Haltens.

- [ ] **Step 1: Failing tests schreiben**

`useHoldProgress.spec.ts` — nach dem Muster der vorhandenen Fälle (rAF per `vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })`):

```ts
  it('starts over from empty on a new press when asked to, even mid-rewind', () => {
    const onComplete = vi.fn()
    const hold = withScope(() => useHoldProgress(1000, onComplete, { restartOnPress: true }))

    hold.start()
    vi.advanceTimersByTime(600)
    hold.cancel()
    vi.advanceTimersByTime(50)
    hold.start()

    expect(hold.progress.value).toBe(0)
    vi.advanceTimersByTime(900)
    expect(onComplete).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(onComplete).toHaveBeenCalledOnce()
  })
```

(`withScope` = der Helfer, den die Datei schon nutzt, um `useHoldProgress` in einem Effect-Scope aufzurufen; heißt er dort anders, den vorhandenen verwenden.)

`HoldButton.spec.ts`, neuer `describe('with beats')` im selben `beforeEach`/`afterEach`:

```ts
  describe('with beats', () => {
    const face = (w: VueWrapper) => w.get('[data-test="hold-face"]')

    it('shows its label at rest', () => {
      const w = mountButton({ beats: 3, label: 'START' })

      expect(face(w).text()).toBe('START')
      expect(face(w).classes()).toContain('opacity-100')
    })

    it('counts 3 · 2 · 1 while held and confirms after three beats', async () => {
      const w = mountButton({ beats: 3, label: 'START' })

      await w.get('[data-test="hold-button"]').trigger('pointerdown', { isPrimary: true })
      await w.vm.$nextTick()
      expect(face(w).text()).toBe('3')

      vi.advanceTimersByTime(1100)
      await w.vm.$nextTick()
      expect(face(w).text()).toBe('2')

      vi.advanceTimersByTime(1000)
      await w.vm.$nextTick()
      expect(face(w).text()).toBe('1')
      expect(w.emitted('confirm')).toBeUndefined()

      vi.advanceTimersByTime(1000)
      expect(w.emitted('confirm')).toHaveLength(1)
    })

    it('hides the digit on release instead of counting it back up', async () => {
      const w = mountButton({ beats: 3, label: 'START' })
      const button = w.get('[data-test="hold-button"]')

      await button.trigger('pointerdown', { isPrimary: true })
      vi.advanceTimersByTime(2100)
      await w.vm.$nextTick()
      expect(face(w).text()).toBe('1')

      await button.trigger('pointerup')
      vi.advanceTimersByTime(300)
      await w.vm.$nextTick()
      expect(face(w).text()).toBe('1')
      expect(face(w).classes()).toContain('opacity-0')

      vi.advanceTimersByTime(3000)
      await w.vm.$nextTick()
      expect(face(w).text()).toBe('START')
      expect(face(w).classes()).toContain('opacity-100')
    })

    it('starts every new hold at 3, even while the ring is still running back', async () => {
      const w = mountButton({ beats: 3, label: 'START' })
      const button = w.get('[data-test="hold-button"]')

      await button.trigger('pointerdown', { isPrimary: true })
      vi.advanceTimersByTime(1500)
      await button.trigger('pointerup')
      vi.advanceTimersByTime(100)
      await button.trigger('pointerdown', { isPrimary: true })
      await w.vm.$nextTick()
      expect(face(w).text()).toBe('3')

      vi.advanceTimersByTime(2800)
      expect(w.emitted('confirm')).toBeUndefined()
      vi.advanceTimersByTime(400)
      expect(w.emitted('confirm')).toHaveLength(1)
    })

    it('holds for its beats, not for holdMs', async () => {
      const w = mountButton({ beats: 3, holdMs: 500 })

      await w.get('[data-test="hold-button"]').trigger('pointerdown', { isPrimary: true })
      vi.advanceTimersByTime(1000)
      expect(w.emitted('confirm')).toBeUndefined()
    })

    it('announces the digit only while held', async () => {
      const w = mountButton({ beats: 3, label: 'START' })
      const live = w.get('[data-test="hold-beat"]')

      expect(live.attributes('aria-live')).toBe('polite')
      expect(live.text()).toBe('')
      await w.get('[data-test="hold-button"]').trigger('pointerdown', { isPrimary: true })
      await w.vm.$nextTick()
      expect(live.text()).toBe('3')
    })
  })

  it('shows no face without beats — the confirm button stays a plain disc', () => {
    expect(mountButton().find('[data-test="hold-face"]').exists()).toBe(false)
  })
```

`VueWrapper` aus `@vue/test-utils` importieren.

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/ui/__tests__/HoldButton.spec.ts src/ui/__tests__/useHoldProgress.spec.ts`
Expected: FAIL (`beats` unbekannt, kein `hold-face`, `restartOnPress` ohne Wirkung).

- [ ] **Step 3: Implementieren**

`useHoldProgress.ts` — nach `DEFAULT_HOLD_MS`:

```ts
/** One beat of a count-in held on a `HoldButton` with `beats`. */
export const BEAT_MS = 1000

export interface HoldOptions {
  /** A press starts from empty instead of picking up a ring that is still running back. */
  restartOnPress?: boolean
}
```

Signatur: `export function useHoldProgress(durationMs: number, onComplete: () => void, options: HoldOptions = {}): HoldProgress`. In `start()`:

```ts
    if (progress.value >= 1 || options.restartOnPress) progress.value = 0
```

`useStartCeremony.ts`: die Zeile `export const BEAT_MS = 1000` ersetzen durch

```ts
import { BEAT_MS } from '@/ui/useHoldProgress'
export { BEAT_MS }
```

(der Import zu den übrigen Imports oben; die Datei verschwindet in Task 7).

`HoldButton.vue` — Prop ergänzen:

```ts
    /**
     * Turns the hold into a count-in of this many beats: the button reads [label] at rest and
     * the beat while held, and the hold lasts `beats × BEAT_MS` — [holdMs] is ignored then.
     */
    beats?: number
```

Import: `import { BEAT_MS, DEFAULT_HOLD_MS, useHoldProgress } from '@/ui/useHoldProgress'`. Aufruf:

```ts
const counting = props.beats !== undefined
const { progress, holding, start, cancel } = useHoldProgress(
  counting ? (props.beats ?? 0) * BEAT_MS : props.holdMs,
  () => {
    // … unverändert: Puls, emit('confirm') …
  },
  { restartOnPress: counting },
)

/**
 * The beat on the button, set only while held and frozen at release: the ring runs back after a
 * release, and a digit read off that ring would count 1, 2, 3 back up — a countdown that looks
 * like it is still running.
 */
const beat = ref<number | null>(null)
watch(holding, (isHolding) => {
  if (counting && isHolding) beat.value = props.beats ?? null
})
watch(progress, (value) => {
  const beats = props.beats
  if (beats === undefined || !holding.value) return
  beat.value = Math.min(beats, Math.max(1, beats - Math.floor(value * beats)))
})

const face = computed<{ text: string; shown: boolean } | null>(() => {
  if (!counting) return null
  if (holding.value) return { text: String(beat.value ?? props.beats), shown: true }
  if (progress.value > 0) return { text: String(beat.value ?? ''), shown: false }
  return { text: props.label, shown: true }
})
```

Template: `<button …/>` wird zu `<button …>…</button>` mit Inhalt, und im Wrapper `hold-pop` nach dem Button die Live-Region:

```html
    <button …unverändert…>
      <span
        v-if="face !== null"
        data-test="hold-face"
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold tracking-wide text-white transition-opacity duration-150 motion-reduce:transition-none"
        :class="face.shown ? 'opacity-100' : 'opacity-0'"
      >
        {{ face.text }}
      </span>
    </button>
    <span v-if="counting" data-test="hold-beat" class="sr-only" aria-live="polite">
      {{ holding ? beat : '' }}
    </span>
```

- [ ] **Step 4: Tests grün**

Run: `cd webapp-vue && pnpm vitest run src/ui/__tests__/ src/games/guesshue/`
Expected: PASS — die Farbausmalung-Specs unverändert grün.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/ui
git commit -F - <<'MSG'
Let a hold button count in while it is held

The reveal cover will guard the single attempt with a hold, and the
hold is the count-in: 3, 2, 1 on the button while the ring fills,
and letting go aborts. A release hides the digit rather than counting
it back up, and a new press always starts at 3 instead of resuming a
ring that is still running back. Without beats nothing changes, so
Guess Hue's confirm stays a plain disc.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 3: `RevealCover`

**Files:**
- Create: `webapp-vue/src/ui/sceneState.ts`
- Create: `webapp-vue/src/ui/RevealCover.vue`
- Test: `webapp-vue/src/ui/__tests__/RevealCover.spec.ts`

**Interfaces:**
- Consumes: `HoldButton` mit `beats` (Task 2).
- Produces: `export type SceneState = 'preparing' | 'ready' | 'failed'` in `ui/sceneState.ts`. `RevealCover` mit Props `state: SceneState`, `busy: boolean`, Emits `start: []`, `retry: []`. Absolut positioniert (`absolute inset-0 z-10`) — der Aufrufer fasst die Spielfläche und die Hülle in ein `relative`-Element und setzt `inert` selbst auf die Spielfläche. Test-IDs: `reveal-cover`, `reveal-cover-cost`, `reveal-cover-preparing`, `reveal-cover-failed`, `reveal-cover-retry`.

- [ ] **Step 1: Failing test schreiben**

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import HoldButton from '@/ui/HoldButton.vue'
import RevealCover from '@/ui/RevealCover.vue'

enableAutoUnmount(afterEach)

const mountCover = (props: Partial<{ state: 'preparing' | 'ready' | 'failed'; busy: boolean }> = {}) =>
  mount(RevealCover, { props: { state: 'ready', busy: false, ...props } })

describe('RevealCover', () => {
  it('says what the reveal costs, in every state', () => {
    for (const state of ['preparing', 'ready', 'failed'] as const) {
      const text = mountCover({ state }).get('[data-test="reveal-cover-cost"]').text()
      expect(text).toBe('Deine Zeit läuft ab dem Aufdecken — und du hast nur einen Versuch.')
    }
  })

  it('keeps the button out of reach while the scene is still being set up', () => {
    const w = mountCover({ state: 'preparing' })

    expect(w.get('[data-test="reveal-cover-preparing"]').text()).toBe('Wird vorbereitet …')
    expect(w.getComponent(HoldButton).props('ready')).toBe(false)
  })

  it('offers the hold once the scene stands, labelled START, counting three beats', () => {
    const button = mountCover({ state: 'ready' }).getComponent(HoldButton)

    expect(button.props('ready')).toBe(true)
    expect(button.props('label')).toBe('START')
    expect(button.props('beats')).toBe(3)
  })

  it('starts when the hold completes', () => {
    const w = mountCover({ state: 'ready' })

    w.getComponent(HoldButton).vm.$emit('confirm')

    expect(w.emitted('start')).toHaveLength(1)
  })

  it('offers a retry when the scene failed, and a retry never starts anything', async () => {
    const w = mountCover({ state: 'failed' })

    expect(w.get('[data-test="reveal-cover-failed"]').text()).toBe(
      'Das Spiel konnte nicht geladen werden.',
    )
    expect(w.getComponent(HoldButton).props('ready')).toBe(false)
    await w.get('[data-test="reveal-cover-retry"]').trigger('click')

    expect(w.emitted('retry')).toHaveLength(1)
    expect(w.emitted('start')).toBeUndefined()
  })

  it('locks the button while the reveal is on its way', () => {
    expect(mountCover({ busy: true }).getComponent(HoldButton).props('disabled')).toBe(true)
  })

  it('puts a fresh button back once a reveal failed, so a full ring does not claim it runs', async () => {
    const w = mountCover({ busy: true })
    const first = w.getComponent(HoldButton).vm

    await w.setProps({ busy: false })

    expect(w.getComponent(HoldButton).vm).not.toBe(first)
  })
})
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/ui/__tests__/RevealCover.spec.ts`
Expected: FAIL — Datei fehlt.

- [ ] **Step 3: Implementieren**

`ui/sceneState.ts`:

```ts
/** Where a sealed game's scene stands under its cover — the game's own knowledge, told to the cover. */
export type SceneState = 'preparing' | 'ready' | 'failed'
```

`ui/RevealCover.vue`:

```vue
<script setup lang="ts">
/**
 * The cover over a sealed game's play area: frosted glass over a scene that is already set up, and
 * the hold that opens it. The game lays it over its own play area and nothing else, so the rules
 * and the stake below stay readable; it also sets `inert` on that play area, because glass stops a
 * finger but not a keyboard or a screen reader.
 *
 * The sentence is framework copy, not a game's: sealing means the same thing for every game that
 * does it — the clock starts at the reveal, and there is no second attempt.
 */
import { ref, watch } from 'vue'
import HoldButton from '@/ui/HoldButton.vue'
import type { SceneState } from '@/ui/sceneState'

const props = defineProps<{
  state: SceneState
  /** The reveal is on its way — the card's `busy`, reaching the game as `disabled`. */
  busy: boolean
}>()

const emit = defineEmits<{ start: []; retry: [] }>()

/**
 * A completed hold leaves the ring full. When the reveal behind it fails, a full ring would claim
 * something runs that does not, so the button is remounted fresh; a remount with `ready` already
 * true does not replay the entrance, which only fires on a change of `ready`.
 */
const attempt = ref(0)
watch(
  () => props.busy,
  (now, before) => {
    if (before && !now) attempt.value++
  },
)
</script>

<template>
  <div
    data-test="reveal-cover"
    class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-white/40 p-6 text-center backdrop-blur-md"
  >
    <p data-test="reveal-cover-cost" class="max-w-xs text-sm text-neutral-800">
      Deine Zeit läuft ab dem Aufdecken — und du hast nur <strong>einen</strong> Versuch.
    </p>
    <p v-if="state === 'preparing'" data-test="reveal-cover-preparing" class="text-sm text-neutral-600">
      Wird vorbereitet …
    </p>
    <template v-else-if="state === 'failed'">
      <p data-test="reveal-cover-failed" class="text-sm text-neutral-800">
        Das Spiel konnte nicht geladen werden.
      </p>
      <button
        type="button"
        data-test="reveal-cover-retry"
        class="h-11 cursor-pointer rounded-md bg-neutral-900 px-6 text-sm font-medium text-white"
        @click="emit('retry')"
      >
        Nochmal versuchen
      </button>
    </template>
    <!-- Mounted in every state, so its entrance fires the moment `ready` flips. -->
    <div class="size-24 shrink-0" :class="{ 'animate-pulse motion-reduce:animate-none': busy }">
      <HoldButton
        :key="attempt"
        :ready="state === 'ready'"
        :disabled="busy"
        label="START"
        color="#171717"
        :beats="3"
        @confirm="emit('start')"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Tests grün, Lint, Typen**

Run: `cd webapp-vue && pnpm vitest run src/ui/__tests__/RevealCover.spec.ts && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/ui
git commit -F - <<'MSG'
Add the reveal cover

Frosted glass over a sealed game's play area, the framework's warning
sentence, and the count-in hold that opens it. It shows whether the
scene underneath is still being set up, ready, or failed — a failed
scene offers a retry and never a reveal, so a broken load no longer
costs the single attempt. The game owns its state; the cover only
shows it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 4: Musterung versiegelt

**Files:**
- Modify: `webapp-vue/src/games/findpattern/types.ts`
- Modify: `webapp-vue/src/games/findpattern/PatternGrid.vue`
- Modify: `webapp-vue/src/games/findpattern/FindPatternBoard.vue`
- Modify: `webapp-vue/src/games/findpattern/FindPatternGame.vue`
- Test: `webapp-vue/src/games/findpattern/__tests__/FindPatternGame.spec.ts`
- Test: `webapp-vue/src/games/findpattern/__tests__/PatternGrid.spec.ts` (falls vorhanden; sonst im Game-Spec abdecken)

**Interfaces:**
- Consumes: `RevealCover` (Task 3), Server-`scene` `{cols, rows, patternLength}` (Task 1).
- Produces: `FindPatternGame` nimmt `sealed?: boolean`, `scene?: unknown`, emittiert `reveal: []`. `FindPatternBoard` nimmt `payload: FindPatternPayload | null`, `scene?: FindPatternScene | null`, `sealed?: boolean` (Vorgabe `false`), emittiert `reveal: []`. `PatternGrid.image: string | null`. `types.ts`: `interface FindPatternScene`, `asFindPatternScene(value: unknown): FindPatternScene | null`. Test-IDs: `pattern-play` (die Spielfläche), `pattern-grid-placeholder`, `pattern-image-placeholder`.

- [ ] **Step 1: Failing tests schreiben** — in `FindPatternGame.spec.ts`:

```ts
const SCENE = { cols: 8, rows: 14, patternLength: 4 }

describe('sealed', () => {
  const sealed = (over: Record<string, unknown> = {}) =>
    mountGame({ payload: null, sealed: true, scene: SCENE, ...over })

  it('sets up the empty board under the cover instead of refusing the round', () => {
    const w = sealed()

    expect(w.text()).not.toContain('Diese Runde lässt sich hier nicht anzeigen.')
    expect(w.find('[data-test="pattern-grid-placeholder"]').exists()).toBe(true)
    expect(w.find('[data-test="pattern-image-placeholder"]').exists()).toBe(true)
    expect(w.find('[data-test="reveal-cover"]').exists()).toBe(true)
  })

  it('makes the play area inert and leaves the rules outside the cover', () => {
    const w = sealed()
    const play = w.get('[data-test="pattern-play"]')
    const rules = w.getComponent(FindPatternBriefing).element

    expect(play.attributes('inert')).toBeDefined()
    expect(rules.closest('[inert]')).toBeNull()
    expect(rules.closest('[data-test="reveal-cover"]')).toBeNull()
  })

  it('reports the scene as ready at once — there is nothing to load', () => {
    expect(sealed().getComponent(RevealCover).props('state')).toBe('ready')
  })

  it('asks for the reveal when the cover starts', () => {
    const w = sealed()

    w.getComponent(RevealCover).vm.$emit('start')

    expect(w.emitted('reveal')).toHaveLength(1)
  })

  it('passes the card busy on to the cover', () => {
    expect(sealed({ disabled: true }).getComponent(RevealCover).props('busy')).toBe(true)
  })

  it('drops the cover in the same render the payload arrives in', async () => {
    const w = sealed()

    await w.setProps({ sealed: false, payload: PAYLOAD })

    expect(w.find('[data-test="reveal-cover"]').exists()).toBe(false)
    expect(w.find('[data-test="pattern-grid-placeholder"]').exists()).toBe(false)
    expect(w.get('[data-test="pattern-play"]').attributes('inert')).toBeUndefined()
  })

  it('still refuses a sealed round whose scene it cannot read', () => {
    expect(sealed({ scene: { cols: 'x' } }).text()).toContain(
      'Diese Runde lässt sich hier nicht anzeigen.',
    )
  })
})
```

Imports ergänzen: `FindPatternBriefing` aus `@/games/findpattern/FindPatternBriefing.vue`, `RevealCover` aus `@/ui/RevealCover.vue`.

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/games/findpattern/`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`types.ts`, nach `FindPatternPayload`:

```ts
/** The layout the empty board is set up in under the cover — the server's `FindPatternScene`. */
export interface FindPatternScene {
  cols: number
  rows: number
  patternLength: number
}
```

und nach `isFindPatternPayload`:

```ts
export function asFindPatternScene(value: unknown): FindPatternScene | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<FindPatternScene>
  if (
    !isFiniteInteger(candidate.cols) ||
    !isFiniteInteger(candidate.rows) ||
    !isFiniteInteger(candidate.patternLength)
  ) {
    return null
  }
  return { cols: candidate.cols, rows: candidate.rows, patternLength: candidate.patternLength }
}
```

`PatternGrid.vue`: Prop `image: string | null` (Doku: „`null` under the cover: an empty field of the board's own proportions“). Im Template das `<img>` bekommt `v-if="props.image !== null"`, direkt danach:

```html
    <div
      v-else
      data-test="pattern-grid-placeholder"
      class="block w-full bg-neutral-100"
      :style="{ aspectRatio: `${props.cols} / ${props.rows}` }"
    />
```

Die Seitenverhältnisse stimmen, weil der Server beide Bilder aus quadratischen Blöcken rendert (`FindPatternImages`: Brett `cols × rows`, Muster `patternLength × 1`).

`FindPatternBoard.vue`:
- Props: `payload: FindPatternPayload | null`, dazu
  ```ts
  /** The layout under the cover, while `payload` is still withheld. */
  scene?: FindPatternScene | null
  /** Sealed: the empty board under the cover, and the hold that reveals it. */
  sealed?: boolean
  ```
  mit `withDefaults(…, { submittedStartIndex: null, scene: null, sealed: false })` — bestehende Vorgaben beibehalten.
- `const layout = computed(() => props.payload ?? props.scene)` und überall `props.payload.patternLength` → `layout.value?.patternLength ?? 0`, `props.payload.cols/rows` → `layout.value`. In `onCell` zusätzlich `if (props.disabled || props.sealed) return`.
- Emits: `{ guess: [value: { startIndex: number }]; reveal: [] }`.
- Template, der erste Block:

```html
    <div v-if="layout" class="relative mx-auto w-full max-w-[22rem]">
      <div
        data-test="pattern-play"
        class="flex w-full flex-col items-center gap-3"
        :inert="props.sealed || undefined"
      >
        <PatternGrid
          :image="props.payload?.boardImage ?? null"
          :cols="layout.cols"
          :rows="layout.rows"
          :outlines="outlines"
          :numbers="[]"
          :interactive="!props.disabled && !props.sealed"
          @cell="onCell"
        />
        <p class="text-center text-lg">Finde das folgende Muster im Spielfeld</p>
        <img
          v-if="props.payload"
          :src="props.payload.patternImage"
          alt="Das gesuchte Muster"
          class="block w-full border-2 border-black"
          style="image-rendering: pixelated"
          draggable="false"
        />
        <div
          v-else
          data-test="pattern-image-placeholder"
          class="block w-full border-2 border-black bg-neutral-100"
          :style="{ aspectRatio: `${layout.patternLength} / 1` }"
        />
      </div>
      <RevealCover v-if="props.sealed" state="ready" :busy="props.disabled" @start="emit('reveal')" />
    </div>
```

`FindPatternGame.vue`:
- Props ergänzen:
  ```ts
  /** Sealed: mounted under the cover before the reveal, `payload` still `null`. */
  sealed?: boolean
  /** The layout the empty board is set up in while sealed. */
  scene?: unknown
  ```
- Emits: `{ guess: [unknown]; skip: [number]; giveUp: []; reveal: [] }` — den Kopfkommentar zu `skip`/`giveUp` so lassen.
- `const scene = computed(() => (props.sealed ? asFindPatternScene(props.scene) : null))`
- Template: die Verweigerung wird `<p v-if="payload === null && scene === null" …>`; die Reveal-Karte `v-if="solution && payload"`; `FindPatternBoard` bekommt zusätzlich `:scene="scene"`, `:sealed="props.sealed === true"`, `@reveal="emit('reveal')"`.

- [ ] **Step 4: Tests grün, Lint, Typen**

Run: `cd webapp-vue && pnpm vitest run src/games/findpattern/ && pnpm lint && pnpm typecheck`
Expected: PASS — alle bisherigen Musterung-Specs unverändert grün.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/findpattern
git commit -F - <<'MSG'
Set Musterung up under the reveal cover

A sealed Musterung round now mounts the board: an empty grid in the
layout the server hands out before the reveal, under the cover, with
its rules readable below. The payload only fills in the two images,
so the cover can drop in the render that brings them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 5: Weltanschauung versiegelt

**Files:**
- Modify: `webapp-vue/src/games/spotobject/useStreetView.ts`
- Modify: `webapp-vue/src/games/spotobject/SpotObjectBoard.vue`
- Modify: `webapp-vue/src/games/spotobject/SpotObjectGame.vue`
- Test: `webapp-vue/src/games/spotobject/__tests__/SpotObjectGame.spec.ts`
- Test: `webapp-vue/src/games/spotobject/__tests__/SpotObjectBoard.spec.ts` und jede weitere Datei unter `games/spotobject/__tests__/`, die `useStreetView` mockt — ihr Mock bekommt `ready: ref(true)`.

**Interfaces:**
- Consumes: `RevealCover`, `SceneState` (Task 3).
- Produces: `UseStreetView.ready: Ref<boolean>` — `true`, sobald `mount` Konfiguration und Skript geladen und die Karte gebaut hat; `mount` setzt `error` am Anfang auf `null`. `SpotObjectBoard` emittiert `scene-state: [state: SceneState]` (sofort und bei jeder Änderung) und legt per `defineExpose` `retry(): void` frei. `SpotObjectGame` nimmt `sealed?: boolean`, `scene?: unknown`, emittiert `reveal: []`. Test-ID `spot-play`.

- [ ] **Step 1: Failing tests schreiben**

`mockStreetView()` in `SpotObjectGame.spec.ts` bekommt einen Parameter und `ready`:

```ts
function mockStreetView(over: Partial<{ ready: Ref<boolean>; error: Ref<string | null> }> = {}) {
  const mount = vi.fn()
  vi.mocked(useStreetView).mockReturnValue({
    error: ref<string | null>(null),
    ready: ref(true),
    mount,
    // … übrige Felder unverändert …
    ...over,
  })
  return { mount }
}
```

(`Ref` als Typ aus `vue` importieren.) Neue Fälle:

```ts
describe('sealed', () => {
  const sealed = (over: Record<string, unknown> = {}) =>
    mountGame({ payload: null, sealed: true, ...over })

  it('mounts the map under the cover instead of refusing the round', () => {
    mockStreetView()
    const w = sealed()

    expect(w.text()).not.toContain('Diese Runde lässt sich hier nicht anzeigen.')
    expect(w.find('[data-test="spot-map"]').exists()).toBe(true)
    expect(w.find('[data-test="reveal-cover"]').exists()).toBe(true)
  })

  it('makes the map inert and leaves the rules outside the cover', () => {
    mockStreetView()
    const w = sealed()
    const rules = w.getComponent(SpotObjectRules).element

    expect(w.get('[data-test="spot-play"]').attributes('inert')).toBeDefined()
    expect(rules.closest('[inert]')).toBeNull()
    expect(rules.closest('[data-test="reveal-cover"]')).toBeNull()
  })

  it('tells the cover the map is still being set up', () => {
    mockStreetView({ ready: ref(false) })

    expect(sealed().getComponent(RevealCover).props('state')).toBe('preparing')
  })

  it('tells the cover once the map stands', () => {
    mockStreetView()

    expect(sealed().getComponent(RevealCover).props('state')).toBe('ready')
  })

  it('turns a failed load into a retry that mounts the map again', async () => {
    const { mount } = mockStreetView({ ready: ref(false), error: ref('boom') })
    const w = sealed()
    expect(w.getComponent(RevealCover).props('state')).toBe('failed')

    w.getComponent(RevealCover).vm.$emit('retry')

    expect(mount).toHaveBeenCalledTimes(2)
    expect(w.emitted('reveal')).toBeUndefined()
  })

  it('asks for the reveal when the cover starts', () => {
    mockStreetView()
    const w = sealed()

    w.getComponent(RevealCover).vm.$emit('start')

    expect(w.emitted('reveal')).toHaveLength(1)
  })

  it('shows no term under the cover, and drops the cover in the render the term arrives in', async () => {
    mockStreetView()
    const w = sealed()
    expect(w.text()).not.toContain(PAYLOAD.term)

    await w.setProps({ sealed: false, payload: PAYLOAD })

    expect(w.find('[data-test="reveal-cover"]').exists()).toBe(false)
    expect(w.text()).toContain(PAYLOAD.term)
  })
})
```

Imports: `RevealCover` aus `@/ui/RevealCover.vue`. Ob `SpotObjectRules` innerhalb von `SpotObjectBriefing` gemountet ist, zeigt der bestehende Import der Datei; sonst `SpotObjectBriefing` importieren und dessen Element prüfen.

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/games/spotobject/`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`useStreetView.ts`: in `UseStreetView`

```ts
  /**
   * The scene stands: config and script loaded, the map built. Not „the map is idle“ — Google
   * streams tiles on every pan anyway, mid-play included, and refuses them outright on `localhost`,
   * where an idle map would never arrive.
   */
  ready: Ref<boolean>
```

in `useStreetView`: `const ready = ref(false)`; in `mount` als erste Zeile im `try` `error.value = null`, als letzte Zeile im `try` (nach `swallowScrollKeys(element)`) `ready.value = true`; `ready` ins Rückgabeobjekt.

`SpotObjectBoard.vue`:

```ts
import { computed, onMounted, ref, toRef, useTemplateRef, watch } from 'vue'
import type { SceneState } from '@/ui/sceneState'
// …
const { currentTip, error, heading, jumpMissed, mount, noCoverage, openMiniMap, pano, ready, toPanorama, toWorldMap } =
  useStreetView({ trailColor: toRef(props, 'trailColor'), locked: toRef(props, 'disabled') })

const emit = defineEmits<{ guess: [tip: SpotObjectTip]; 'scene-state': [state: SceneState] }>()

const sceneState = computed<SceneState>(() => {
  if (error.value !== null) return 'failed'
  return ready.value ? 'ready' : 'preparing'
})
watch(sceneState, (state) => emit('scene-state', state), { immediate: true })

/** The cover's „Nochmal versuchen“: the same mount again, on the same element. */
function retry(): void {
  if (stage.value) void mount(stage.value)
}

defineExpose({ retry })
```

(Die vorhandene `defineEmits`-Zeile ersetzen; das Destrukturieren um `ready` erweitern; die Formatierung macht Prettier.)

`SpotObjectGame.vue`:
- Props ergänzen: `sealed?: boolean` („Sealed: the map mounts under the cover before the reveal, `payload` still `null`.“), `scene?: unknown` („Declared, never read: Weltanschauung's scene is the loaded map, not data.“).
- Emits: `{ guess: [unknown]; skip: [number]; giveUp: []; reveal: [] }`.
- Script:
  ```ts
  import { computed, ref, useTemplateRef, watch } from 'vue'
  import RevealCover from '@/ui/RevealCover.vue'
  import type { SceneState } from '@/ui/sceneState'
  // …
  const sceneState = ref<SceneState>('preparing')
  const board = useTemplateRef<InstanceType<typeof SpotObjectBoard>>('board')
  ```
- Template: die Verweigerung wird `<p v-if="payload === null && !props.sealed" …>`; die Reveal-Hälfte `v-if="revealed && payload"`; die Spiel-Hälfte:

```html
    <template v-else>
      <div class="relative">
        <div data-test="spot-play" :inert="props.sealed || undefined">
          <SpotObjectBoard
            ref="board"
            :disabled="props.disabled || props.sealed === true"
            :trail-color="trailColor"
            @guess="(value) => emit('guess', value)"
            @scene-state="(state) => (sceneState = state)"
          >
            <SpotObjectTerm v-if="payload" :term="payload.term" />
          </SpotObjectBoard>
        </div>
        <RevealCover
          v-if="props.sealed"
          :state="sceneState"
          :busy="props.disabled"
          @start="emit('reveal')"
          @retry="board?.retry()"
        />
      </div>

      <SpotObjectBriefing … unverändert … />
    </template>
```

- [ ] **Step 4: Tests grün, Lint, Typen**

Run: `cd webapp-vue && pnpm vitest run src/games/spotobject/ && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/spotobject
git commit -F - <<'MSG'
Set Weltanschauung up under the reveal cover

Its payload is the term alone, so its scene is time: the map mounts
under the cover and loads config and Maps script before the reveal
instead of after it, where the load used to run on the scored clock.
A load that fails now shows a retry on the cover; before, it failed
after the reveal, with the single attempt already spent.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 6: Rahmen umschalten — Karte und Labor mounten das versiegelte Spiel

**Files:**
- Modify: `webapp-vue/src/api/types.ts`
- Modify: `webapp-vue/src/gamelab/types.ts`
- Modify: `webapp-vue/src/rounds/RoundCard.vue`
- Modify: `webapp-vue/src/pages/c/[slug]/index.vue`
- Modify: `webapp-vue/src/pages/c/[slug]/lab/[game]/index.vue`
- Modify: `webapp-vue/src/games/registry.ts`
- Modify: `webapp-vue/src/gamelab/games.ts`
- Modify: `webapp-vue/src/games/guesshue/GuessHueGame.vue`
- Modify: `webapp-vue/src/games/songsnippet/SongSnippetGame.vue`
- Test: `webapp-vue/src/rounds/__tests__/RoundCard.spec.ts`
- Test: `webapp-vue/src/pages/c/[slug]/__tests__/index.spec.ts`
- Test: `webapp-vue/src/gamelab/__tests__/lab-page.spec.ts`
- Test: jede Datei mit einem `RoundResponse`- oder `LabRoundResponse`-Fixture (`pnpm typecheck` listet sie; bekannt: `rounds/__tests__/{useRound,useRoundHistory,RoundHistory}.spec.ts`)

**Interfaces:**
- Consumes: `sealed`/`scene`/`reveal` an Musterung (Task 4) und Weltanschauung (Task 5); `RoundResponse.scene` vom Server (Task 1).
- Produces: `RoundResponse.scene: unknown`, `LabRoundResponse.scene: unknown`. `RoundCard` ohne Prop `step`; mountet das Spiel in den Gesichtern `sealed`, `playing`, `done` mit `:sealed="face === 'sealed'"`, `:scene`, `@reveal`. `gameBriefings` und `labBriefings` existieren nicht mehr. Die Seite und das Labor benutzen `useStartCeremony` nicht mehr.

- [ ] **Step 1: Tests umschreiben (failing)**

`RoundCard.spec.ts`:
- `StubGame`: Props `sealed: { type: Boolean, default: false }` und `scene: { type: null, default: null }` ergänzen, Emits `'reveal'`, Template um `'<button data-test="stub-reveal" @click="$emit(\'reveal\')">reveal</button>'`.
- `StubBriefing` und `gameBriefings` aus `vi.hoisted`/`vi.mock` entfernen; `StartStep`-Import und `step` aus `mountCard` entfernen; `aRound` bekommt `scene: null`.
- Ersetzen — die ersten beiden Fälle:

```ts
  it('mounts the game sealed, and reaches its reveal through to the page', async () => {
    const reveal = vi.fn().mockResolvedValue(undefined)
    const w = mountCard({
      round: aRound({ payload: null, scene: { cols: 8 } }),
      stage: 'sealed',
      reveal,
    })

    const stub = w.getComponent(StubGame)
    expect(stub.props('sealed')).toBe(true)
    expect(stub.props('payload')).toBeNull()
    expect(stub.props('scene')).toEqual({ cols: 8 })

    await w.get('[data-test="stub-reveal"]').trigger('click')
    expect(reveal).toHaveBeenCalledOnce()
  })

  it('hands the sealed game the card busy as disabled', () => {
    const w = mountCard({ round: aRound({ payload: null }), stage: 'sealed', busy: true })

    expect(w.getComponent(StubGame).props('disabled')).toBe(true)
  })

  it('hands the game its payload once the round is open', async () => {
    // … bestehender Fall, plus:
    expect(stub.props('sealed')).toBe(false)
  })
```

- `'says so instead of offering a reveal when the sealed game has no renderer'`: statt `round-reveal` prüfen `expect(w.findComponent(StubGame).exists()).toBe(false)`.
- `'puts the sealed face on that same surface'`: `stub-reveal` statt `round-reveal`.
- Löschen: `"carries the game's boxes on the sealed face…"`, `'says what the reveal costs before it is clicked'`, `'says nothing about a clock on a round that is being played'`, `'shows the start signal the page is playing…'`, `'holds the waiting face while the reveal is on its way'` — Warnsatz und Einzählen gehören jetzt `RevealCover` (Task 3).

`index.spec.ts`:
- `BEAT_MS`-Import und die drei Fälle `'counts the player in before it reveals'`, `'holds the reveal button shut while the signal runs'`, `'opens the game to input the moment the round does, even mid-ceremony'` samt `sealedPage()` löschen; jedes Fixture bekommt `scene: null`. Neu:

```ts
  it('hands the card the reveal itself — the count-in is the hold on the cover now', async () => {
    vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const hook = mockUseRound({
      stage: 'sealed',
      round: aRoundResponse({
        game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: true },
      }),
    })
    vi.mocked(useRound).mockReturnValue(hook)

    const w = mountPage()
    await flushPromises()

    expect(w.getComponent(RoundCard).props('reveal')).toBe(hook.reveal)
    expect(w.getComponent(RoundCard).props('busy')).toBe(hook.busy.value)
  })
```

(Heißt das Busy-Feld von `mockUseRound` anders, das vorhandene verwenden.)

`lab-page.spec.ts`:
- `StubGame`: `payload: { type: null, default: null }` (statt `Object, required`), Props `sealed`, `scene` wie oben, Emits `['guess', 'reveal']`, Template um den `stub-reveal`-Knopf.
- `labBriefings` und `StubBriefing` aus Mock und Hoisting entfernen; `BEAT_MS`-Import entfernen; jedes `LabRoundResponse`-Fixture bekommt `scene: null`.
- `revealThroughSignal` ersetzen:

```ts
/** The game asks for the reveal the way a real one does once its cover's hold completes. */
async function revealFromGame(w: VueWrapper): Promise<void> {
  await w.get('[data-test="stub-reveal"]').trigger('click')
  await flushPromises()
}
```

- Den Briefing-Fall (Awards am `StubBriefing`) löschen. Die Siegel-Fälle umschreiben:

```ts
  it('mounts the game sealed while the round is not yet revealed', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round, revealed: false, payload: null, scene: { cols: 8 },
    } as never)

    const w = await mountPage()
    const stub = w.getComponent(StubGame)

    expect(stub.props('sealed')).toBe(true)
    expect(stub.props('payload')).toBeNull()
    expect(stub.props('scene')).toEqual({ cols: 8 })
  })

  it('never seals a game that has not asked for a deliberate reveal', async () => {
    const w = await mountPage()

    expect(w.getComponent(StubGame).props('sealed')).toBe(false)
    expect(api.revealLabRound).not.toHaveBeenCalled()
  })

  it('reveals the round when the game asks, and unseals it', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({ ...round, revealed: false, payload: null } as never)
    vi.spyOn(api, 'revealLabRound').mockResolvedValue({ ...round, revealed: true } as never)

    const w = await mountPage()
    await revealFromGame(w)

    expect(api.revealLabRound).toHaveBeenCalledWith('team', 'stub', 42, 'ONE')
    expect(w.getComponent(StubGame).props('sealed')).toBe(false)
  })

  it('runs the tester clock from the reveal on', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({ ...round, revealed: false, payload: null } as never)
    vi.spyOn(api, 'revealLabRound').mockResolvedValue({ ...round, revealed: true } as never)

    const w = await mountPage()
    expect(w.getComponent(GameHeader).props('play')).toBeNull()

    await revealFromGame(w)

    expect(w.getComponent(GameHeader).props('play')).toMatchObject({ phase: 'running' })
  })
```

- `'puts the tester back in front of the gate after a reset, without a dead end'`: statt `lab-sealed`/`lab-reveal` prüfen, dass `StubGame` nach dem Reset wieder `sealed: true` hat, `props('disabled')` `false` ist, und ein zweites `revealFromGame` `revealLabRound` zum zweiten Mal ruft. Den bisherigen Einzähl-Fall `'counts the tester in and then runs their own clock'` löschen (ersetzt durch den Uhr-Fall oben). Übrige Aufrufe von `revealThroughSignal` → `revealFromGame`.

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm vitest run src/rounds src/pages src/gamelab`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`api/types.ts`, in `RoundResponse` nach `previousRoundNumber`:

```ts
  /**
   * What may be with the client before the reveal: the scene the game is set up on under the
   * cover. On every answer to an announced round, before the reveal and after it. `null` for a
   * game whose scene is its code alone. The shape belongs to the game.
   */
  scene: unknown
```

`gamelab/types.ts`, in `LabRoundResponse` vor `payload`:

```ts
  /** Before the reveal and after it alike — mirrors `RoundResponse.scene`. */
  scene: unknown
```

`RoundCard.vue`:
- `gameBriefings`-Import, `briefing`-Computed, Prop `step` (samt Default und KDoc) und den `StartStep`-Import entfernen; `PlayClock` weiter aus `@/ui/useStartCeremony` (Umzug in Task 7).
- `play`:

```ts
const play = computed<PlayClock | null>(() => {
  const me = props.round?.me
  if (props.closed || me == null || me.guessedAt !== null) return null
  return props.round?.game?.requiresReveal === true
    ? { phase: 'running', since: me.revealedAt }
    : null
})
```

  KDoc darüber: „What the band's board shows: a timed play that has not been answered yet. `closed` is asked separately from `guessedAt` — the history is full of rows nobody ever guessed on, and without it their clock would run forever.“
- Template: den ganzen `v-else-if="face === 'sealed'"`-Block löschen. Die Komponente:

```html
      <component
        :is="component"
        v-else-if="face === 'sealed' || face === 'playing' || face === 'done'"
        :key="round?.round?.number"
        :sealed="face === 'sealed'"
        :scene="round?.scene ?? null"
        :payload="round?.payload"
        … übrige Bindungen unverändert …
        @reveal="onReveal"
        @guess="onGuess"
        @skip="onSkip"
        @give-up="onGiveUp"
      />
```

  Den Kommentar über der Unrenderbar-Prüfung („Checked ahead of `stage` … offering "Aufdecken" first …“) auf „a sealed round for a game this build cannot render is just as unrenderable as a playing one“ kürzen — ohne Verweis auf einen Knopf, den es hier nicht mehr gibt.

`pages/c/[slug]/index.vue`: Import `useStartCeremony`, die Destrukturierung `startStep`/`runCeremony` samt Kommentar und `revealWithSignal` samt KDoc entfernen. An `RoundCard`: `:busy="busy"`, `:reveal="reveal"`, `:step` weg.

`pages/c/[slug]/lab/[game]/index.vue`:
- `labBriefings` aus dem Import, `briefing`-Computed, `useStartCeremony`-Import (der Typ `PlayClock` bleibt — `import type { PlayClock } from '@/ui/useStartCeremony'`), `startStep`/`runCeremony`, `revealWithSignal` entfernen.
- `labPlay`:

```ts
const labPlay = computed<PlayClock | null>(() => {
  const since = playStartedAt.value
  return since !== null && round.value?.me == null ? { phase: 'running', since } : null
})
```

- Template: den `lab-sealed`-Block samt Kommentar löschen; an der Spielkomponente `v-else` entfernen und ergänzen: `:sealed="!round.revealed"`, `:scene="round.scene"`, `@reveal="reveal"`.

`games/registry.ts`: `gameBriefings` samt KDoc und die vier `…Briefing`-Imports entfernen.

`gamelab/games.ts`: `labBriefings` samt KDoc und `gameBriefings` aus dem Import entfernen.

`GuessHueGame.vue` und `SongSnippetGame.vue`, je in `defineProps`:

```ts
  /** Declared, never used here: this game never seals, and the contract has one shape. */
  sealed?: boolean
  /** Declared, never used here — see `sealed`. */
  scene?: unknown
```

- [ ] **Step 4: Fixtures nachziehen, alles grün**

Run: `cd webapp-vue && pnpm typecheck` — jedes gemeldete Fixture ohne `scene` bekommt `scene: null`. Dann `pnpm lint && pnpm test`.
Expected: PASS, und `grep -rn "gameBriefings\|labBriefings\|round-reveal\|lab-sealed\|lab-reveal" src` findet nichts.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src
git commit -F - <<'MSG'
Mount the sealed game under its cover

The card and the lab no longer draw a reveal screen of their own: a
sealed round mounts its game, which sets up its scene under the cover
and asks for the reveal when the hold completes. With the game
mounted, it shows its own rules, so the briefing registry that stood
in for a missing game goes, and so does the count-in in the band —
the hold is the count-in now.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 7: Das Band zählt nicht mehr ein

**Files:**
- Create: `webapp-vue/src/ui/playClock.ts`
- Delete: `webapp-vue/src/ui/useStartCeremony.ts`, `webapp-vue/src/ui/__tests__/useStartCeremony.spec.ts`
- Modify: `webapp-vue/src/ui/GameHeader.vue`
- Modify: `webapp-vue/src/ui/flipdot/FlipDotBoard.vue`
- Modify: `webapp-vue/src/rounds/RoundCard.vue`, `webapp-vue/src/pages/c/[slug]/lab/[game]/index.vue` (Import von `PlayClock`)
- Test: `webapp-vue/src/ui/__tests__/GameHeader.spec.ts`
- Test: `webapp-vue/src/ui/flipdot/__tests__/FlipDotBoard.spec.ts`

**Interfaces:**
- Produces: `export type PlayClock = { phase: 'running'; since: string }` in `ui/playClock.ts`. `GameHeader.play` nur noch `PlayClock | null`. `FlipDotBoard` ohne Prop `solid`.

- [ ] **Step 1: Tests anpassen**

`GameHeader.spec.ts`: alle Fälle mit `phase: 'start'` oder `phase: 'waiting'` löschen, `PlayClock`-Import auf `@/ui/playClock` umstellen. `FlipDotBoard.spec.ts`: alle Fälle, die `solid` setzen, löschen.

- [ ] **Step 2: Implementieren**

`ui/playClock.ts`:

```ts
/**
 * What the band's board shows instead of the round countdown: a timed play, running since the
 * instant its clock started — `me.revealedAt` in a real round. `null` — the countdown itself — is
 * every other caller's case.
 */
export type PlayClock = { phase: 'running'; since: string }
```

`GameHeader.vue`: Import `import type { PlayClock } from '@/ui/playClock'`; `WAITING_WIDTH` samt KDoc, die Zweige `start` und `waiting` und das Feld `solid` aus `face` entfernen:

```ts
const face = computed<{ text: string; label: string; tone: Tone } | null>(() => {
  const play = props.play
  const [text, label] =
    play !== null
      ? [elapsedClock(play.since, now.value), elapsedReading(play.since, now.value)]
      : [remainingClock(props.endsAt, now.value), remainingReading(props.endsAt, now.value)]

  if (text === null || label === null) return null
  return { text, label, tone: play !== null ? 'alarm' : 'default' }
})
```

Im Template `:solid="face.solid"` entfernen.

`FlipDotBoard.vue`: Prop `solid` samt KDoc und Default entfernen (`withDefaults(…, { tone: 'default' })`, den Kopfkommentar „tone and solid default …“ auf „tone defaults …“); `bm`:

```ts
const bm = computed(() => {
  const glyphs = bitmap(props.text)
  return props.pad === undefined ? glyphs : padded(glyphs, props.pad)
})
```

`uniform` bleibt — `shown` braucht es für die Boot-Phasen.

`RoundCard.vue` und Laborseite: `PlayClock` aus `@/ui/playClock` importieren. `useStartCeremony.ts` und seinen Spec löschen.

- [ ] **Step 3: Alles grün**

Run: `cd webapp-vue && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS, und `grep -rn "useStartCeremony\|StartStep\|StartBeat\|solid" src --include='*.ts' --include='*.vue'` findet nur fremde Treffer (CSS-`solid` in Borders, `HueToleranceSector`, `reveal.ts`, `useWalkMap`).

- [ ] **Step 4: Commit**

```bash
git add -A webapp-vue/src
git commit -F - <<'MSG'
Stop counting in on the band

The count-in moved into the cover's hold, so the band only ever shows
the round countdown or a running play clock. The start and waiting
faces, the ceremony that drove them and the board's solid field lose
their last user and go.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 8: Wissen zurückführen

**Files:**
- Modify: `.claude/guidelines/game-rounds.md`
- Modify: `.claude/guidelines/frontend-ui.md`
- Modify: `docs/superpowers/specs/2026-09-11-game-stopwatch-design.md`

- [ ] **Step 1: `game-rounds.md`**

Im Abschnitt „One secret per round, two exits — and the rule is per stream“ nach dem ersten Absatz einfügen:

```markdown
The **scene** is a third publication, and deliberately *not* a third exit for the secret.
`GameType.scene(params)` is what may reach the client before the reveal — the layout a sealed game
sets up under its cover — and it carries nothing the reveal protects: that is its contract, pinned
by a field-set test per game like `present()` and `solution()`. `null` is the default and the safe
direction. It is named scene, not stage, because stage is the rung of a staged game.
```

- [ ] **Step 2: `frontend-ui.md`**

Neuer Abschnitt am Ende:

```markdown
## The reveal cover

- **A sealed round mounts its game.** The game lays `RevealCover` over its own play area and
  nothing else, and sets `inert` on that area — glass stops a finger, not a keyboard. Its rules and
  stake stay outside both: the sealed round is when they are read at leisure.
- **The game owns the cover's state.** It knows whether its scene stands (`preparing | ready |
  failed`); a failed scene offers a retry and never a reveal, so a broken load costs no attempt.
- **When the payload arrives, a game only inserts.** Anything that costs time belongs to the scene
  under the cover. The cover leaves in the same render, with no transition: the scored clock is
  already running, and a fade would be ours on top of the line's.
- **The hold is the count-in.** `HoldButton` with `beats`: the digit follows the hold, a release
  hides it rather than counting it back up, and a new press always starts at the top.
```

- [ ] **Step 3: Spieluhr-Spec**

Unter der Statuszeile von `2026-09-11-game-stopwatch-design.md`:

```markdown
**Nachtrag (2026-09-25):** Das Einzählen im Band und das volle Feld als Ladeanzeige sind
zurückgebaut. Das 3 · 2 · 1 ist jetzt das Halten auf der Hülle — siehe
[Die Hülle](2026-09-25-reveal-cover-design.md). Die Stoppuhr ab `revealedAt` bleibt.
```

- [ ] **Step 4: Gesamtlauf**

Run: `cd core && ./mvnw test` und `cd webapp-vue && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .claude/guidelines docs/superpowers/specs/2026-09-11-game-stopwatch-design.md
git commit -F - <<'MSG'
Record the reveal cover's rules

The scene joins the exits in game-rounds.md as a publication that
carries no secret; frontend-ui.md gains who owns the cover, what may
happen when the payload lands, and how the hold counts in. The
stopwatch spec notes that its count-in on the band is gone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

## Handprobe (nach Task 8, nicht im Browser-Pane)

Auf einem echten Handy, Labor `/c/<slug>/lab/find-pattern?seed=42&phase=TWO` und `/c/<slug>/lab/spot-object?seed=42&phase=TWO`:

1. Hülle über der Spielfläche, Regeln darunter lesbar und aufklappbar.
2. START halten → 3 · 2 · 1 im Knopf; bei „2“ loslassen → Ziffer blendet aus, kein Hochzählen; sofort wieder halten → beginnt bei 3.
3. Durchhalten → Hülle ist weg, sobald das Spiel da ist, ohne Ausblenden; das Band zeigt die Stoppuhr.
4. Weltanschauung im Flugmodus öffnen → „Das Spiel konnte nicht geladen werden.“, Netz an, „Nochmal versuchen“ → Karte steht, START erscheint.
