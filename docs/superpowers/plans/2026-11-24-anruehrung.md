# Anrührung (mix-color) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new game `mix-color` („Anrührung“): the player drops pigments into a circle, one server step per drop, until it matches a target colour; scored by OKLab ΔE.

**Architecture:** Two small extensions to the game contract (a step may read earlier inputs; `judge` sees the stored steps), a Kotlin port of spectral.js in a new Modulith module `mixcolor`, the adapter `MixColorGameType` in `game.internal`, and a frontend game under `webapp-vue/src/games/mixcolor/`. Mixing happens only on the server; the client shows each step's answer.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith, JUnit 5 + Kotest matchers + MockK; Vue 3 + TS strict + Tailwind v4, Vitest + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-11-24-anruehrung-design.md` — read it first; this plan argues from it.

## Global Constraints

- Game id `mix-color`, module `mixcolor`, classes `MixColor*`, display name `Anrührung`.
- Pigments, in this order: `c` Cyan `#00A0E9`, `m` Magenta `#E4007C`, `y` Gelb `#FFE600`, `w` Weiß `#FFFFFF`, `k` Schwarz `#1A1A1A`.
- `CAPACITY = 20` is a module constant used **only in `draw`**; everything else reads `params.capacity`.
- `TOLERANCE = 4.0` (phase one), `null` in phase two; `EPSILON = 1e-9` on the gate, as in `MatchScaleGameType`.
- `deviation` = 100 × Euclidean OKLab distance between the two **`#RRGGBB`** colours (glass and target).
- `requiresReveal = scoresOnDuration = false`; `stages = capacity + 1`; `stagesScore = false`.
- Mixing model only in Kotlin. **No new dependency** in `webapp-vue/package.json` or `core/pom.xml`; spectral.js 3.0.0 is installed only to write the golden vectors, outside the project.
- Player-facing text never says „Glas“ or „Reagenzglas“ — it is a „Kreis“. Code and comments may say glass.
- User-facing German uses `„…“`, never `"`.
- Kotlin: named arguments from two arguments on (`.claude/guidelines/kotlin.md`); kotlin-logging inside the class.
- Commits follow the 7 rules in `CLAUDE.md`, end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Frontend gates: `pnpm exec vue-tsc -b`, `pnpm lint` (check its output for `warning` — it exits 0 on Prettier warnings), `pnpm test`.

## Review Focus

1. **A double tap on a nozzle** before the host sets `disabled` must emit one `skip`, not two (the second would be a 409 and a reload). → Task 7 test `one tap in flight`.
2. **Reloading with a full circle and no guess** must hold „Fertig“ by itself exactly once per mount, not loop after a failed guess. → Task 7 test `auto-hold once`.
3. **A round with `capacity` ≠ 20** must fill, lock and auto-hold at its own capacity in the UI too. → Task 7 test with `capacity: 3`.
4. **A corrupt stored step** (unknown pigment in `round_plays.steps`) must make `judge` refuse with `InvalidGuessException`, not score a partial glass. → Task 4 test.
5. **Another player who gave up** (guessed, no guess, `outcome: null`) must render in the reveal without drops and not crash the bars. → Task 8 test.

---

### Task 1: Steps can read earlier inputs; `judge` sees the steps

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameType.kt` (L93-98 `GuessContext`, L234-237 `step`)
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameCatalog.kt` (L57-62 handle `step`)
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt` (L145-172 `answerOf`)
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayService.kt` (L108-111 `GuessContext`, L172-199 `skip`)
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabService.kt` (L147-149, L213, L442-451, L507-513)
- Modify: `.claude/guidelines/game-rounds.md` (*Stages*, bullet „A stage can carry data“)
- Create: `core/src/test/kotlin/org/unividuell/countdown/core/game/EarlierStepsGame.kt` (test fake, registered the way `PlayServiceStepTest` registers `CountingGame`)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PlayServiceStepTest.kt`, `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabStagedFlowTest.kt`

**Interfaces:**
- Produces (package `org.unividuell.countdown.core.game`):
  - `data class StepContext(val earlier: List<JsonNode?>)` — inputs of stages `0 until stage`, JSON null mapped to `null`.
  - `fun step(params: P, stage: Int, input: JsonNode?, context: StepContext): GameStepAnswer? = step(params = params, stage = stage, input = input)` on `GameType`.
  - `GuessContext(sinceRevealMs: Long?, playId: UUID?, steps: List<JsonNode?> = emptyList())`.
  - `GameTypeHandle.step(params: JsonNode, stage: Int, input: JsonNode?, earlier: List<JsonNode>): GameStepAnswer?` — no default; maps `NullNode` → `null` for `input` and each `earlier` entry.

- [ ] **Step 1: Write the failing tests**

`EarlierStepsGame`, a test fake whose `step(params, stage, input, context)` answers `context.earlier.size` and whose `judge(params, guess, context)` returns `deviation = context.steps.size.toDouble()`. Then:
  - `PlayServiceStepTest`: `` `a step sees the inputs before it` `` — three skips; `MyPlayDto.steps.map { answer }` is `[0, 1, 2]`. `` `judge sees the stored steps` `` — two skips, guess; stored deviation `2.0`.
  - `LabStagedFlowTest`: the same two, through `LabService`.

- [ ] **Step 2: Run them, expect FAIL** (no `StepContext`, no `steps` on `GuessContext`)

Run: `cd core && ./mvnw test -Dtest='PlayServiceStepTest,LabStagedFlowTest'`

- [ ] **Step 3: Implement**

Add the types above. Every call site uses the four-argument handle:
  - `RoundResponses.answerOf` and `LabService.answerOf`: `earlier = steps.subList(0, i)`.
  - `PlayService.skip`: load the play row **before** validating (`NotRevealedException` if absent, as now further down), pass `earlier = play.steps.toList()`; `fromStage` guard and `advanceStage` unchanged.
  - `LabService.skip`: `earlier = store.stepsOf(...)`.
  - `PlayService.guess`: `GuessContext(…, steps = play.steps.map { it.takeUnless(JsonNode::isNull) })`; `LabService.guess` likewise from `store.stepsOf(...)`.
  - `game-rounds.md`, *Stages*: add one sentence each — a step answer may read the earlier inputs (`StepContext`); `judge` sees the stored inputs (`GuessContext.steps`).

- [ ] **Step 4: Run the whole backend suite, expect PASS** (Peilung, Deduster, `GameCatalogTest`, `LabPointsParityTest` untouched and green)

Run: `cd core && ./mvnw clean test`

- [ ] **Step 5: Commit** — `Let a game step read the steps before it`

---

### Task 2: The mixing model — spectral.js ported to Kotlin

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/mixcolor/Pigment.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/mixcolor/Mixing.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/mixcolor/internal/Spectral.kt`
- Create: `shared/mix-color/spectral-vectors.json`
- Modify: `shared/README.md` (table row + recipe)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/mixcolor/MixingGoldenVectorTest.kt`

**Interfaces:**
- Produces (package `org.unividuell.countdown.core.mixcolor`):
  - `enum class Pigment(val key: String, val displayName: String, val hex: String)` with `CYAN, MAGENTA, YELLOW, WHITE, BLACK` per Global Constraints; `companion object { fun ofKey(key: String): Pigment? }`.
  - `fun mixHex(recipe: Map<Pigment, Int>): String?` — `#RRGGBB` (upper case, as spectral.js' `toString()`), `null` for an empty recipe or no positive count.
  - `fun deltaE(a: String, b: String): Double` — 100 × Euclidean OKLab distance of two `#RRGGBB`.
  - `internal/Spectral.kt`: `object Spectral { fun mix(parts: List<Pair<String, Int>>): String; fun oklabOf(hex: String): DoubleArray }` — the port; `Mixing.kt` calls it, the test reads `oklabOf` directly.

- [ ] **Step 1: Write the vectors with spectral.js 3.0.0, outside the project**

In a temp dir: `npm i --no-save spectral.js@3.0.0`, then a `node -e` script (pasted into `shared/README.md` like the seal-vectors recipe) that writes:

```json
{
  "mixes":  [ { "recipe": { "c": 1, "y": 1 }, "hex": "#41CA42", "oklab": [0.74, 0.0, 0.0] } ],
  "deltaE": [ { "a": "#FF0000", "b": "#00FF00", "deltaE": 0.0 } ]
}
```

`hex` = `mix(...[Color(pigmentHex), count]).toString()`; `oklab` = `new Color(hex).OKLab` (of the hex, as the game measures); `deltaE` = `100 × hypot` of two such OKLab. Cover: each pigment alone, every pair 1:1, the three-way C+M+Y, a black-heavy (`k` ≥ 5), a white-heavy, a 20-drop recipe, an out-of-gamut-prone vivid pair (exercises `gamutMap`), and 1:1 next to 2:2 of the same pair. (The values above are illustrative only.)

- [ ] **Step 2: Write the failing test** `MixingGoldenVectorTest` reading `File("../shared/mix-color/spectral-vectors.json")`:
  - `` `every mix matches spectral js` ``: `mixHex(recipe) shouldBe hex`.
  - `` `oklab of every mix matches` ``: `Spectral.oklabOf(hex)` each component `plusOrMinus 1e-9`.
  - `` `every deltaE matches` ``: `deltaE(a, b) shouldBe (deltaE plusOrMinus 1e-9)`.
  - `` `an empty recipe has no colour` ``: `mixHex(emptyMap()).shouldBeNull()`; `mixHex(mapOf(Pigment.CYAN to 0)).shouldBeNull()`.
  - `` `ratios mix identically` ``: `mixHex(c=1,m=1) shouldBe mixHex(c=2,m=2)`.

- [ ] **Step 3: Run, expect FAIL** — `cd core && ./mvnw test -Dtest=MixingGoldenVectorTest`

- [ ] **Step 4: Port** into `internal/Spectral.kt`, keeping spectral.js' function names so the port can be read side by side: `parse`/sRGB, `sRGB_to_lRGB`, `lRGB_to_sRGB`, `lRGB_to_R` (with the `BASE_SPECTRA` tables), `R_to_XYZ` (`CIE_CMF`), `XYZ_to_lRGB`, `XYZ_to_OKLab`, `OKLab_to_OKLCh`, `OKLCh_to_OKLab`, `OKLab_to_XYZ`, `KS`, `KM`, `mix` (concentration `factor² × tintingStrength² × luminance`, tinting strength 1, luminance `max(EPSILON, XYZ[1])`), `inGamut`, `gamutMap` (`jnd = 0.03`, `e = 0.0001`) and `toString` (map method, hex). File header: the MIT notice of spectral.js, „Ported from spectral.js 3.0.0, `spectral.js`“. `Mixing.kt` is the thin public API over it. If one hex flips on a rounding boundary between V8 and the JVM, swap that recipe in the vectors (spec, *Goldvektoren*) — do not loosen the hex check.

- [ ] **Step 5: Run, expect PASS**; also `./mvnw test -Dtest=ModularityTests`.

- [ ] **Step 6: Commit** — `Port spectral.js pigment mixing to Kotlin`

---

### Task 3: `MixColorGameType` — draw, payload, solution, stages

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/MixColorGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/MixColorGameTypeTest.kt` (plain unit test, no Spring — like `EchoLocateGameTypeTest`)

**Interfaces:**
- Consumes: `Pigment`, `mixHex` (Task 2).
- Produces:
  - `data class MixColorParams(val recipe: Map<String, Int>, val targetHex: String, val capacity: Int, val tolerance: Double?)`
  - `data class MixColorPigmentDto(val key: String, val name: String, val hex: String)`
  - `data class MixColorPayload(val targetHex: String, val capacity: Int, val pigments: List<MixColorPigmentDto>) : GamePayload`
  - `data class MixColorSolution(val recipe: Map<String, Int>, val tolerance: Double?) : GameSolution`
  - `@Component class MixColorGameType(private val mapper: ObjectMapper) : GameType<MixColorParams>`; `id = "mix-color"`, `displayName = "Anrührung"`; `companion object { const val CAPACITY = 20; const val TOLERANCE = 4.0 }`.

- [ ] **Step 1: Write the failing tests**
  - `` `draws two or three pigments, each at least once, within capacity` `` — over seeds 1..200: `recipe.size in 2..3`, all values ≥ 1, `recipe.values.sum() in recipe.size..20`, keys ⊂ `c m y w k`, `capacity shouldBe 20`, `targetHex shouldBe mixHex(recipe)`.
  - `` `only presentation moves the draw` `` — fixed presentation seed, varied solution and scene seeds: equal params; and vice versa: differ.
  - `` `tolerance follows the phase` `` — ONE → `4.0`, TWO → `null`.
  - `` `stages follow capacity` `` — `stages(params.copy(capacity = 3)) shouldBe 4`, `stagesScore shouldBe false`, `requiresReveal` and `scoresOnDuration` `false`.
  - Field sets: payload `setOf("targetHex", "capacity", "pigments")`, solution `setOf("recipe", "tolerance")`; `pigments` keys in order `c m y w k`.

- [ ] **Step 2: Run, expect FAIL** — `cd core && ./mvnw test -Dtest=MixColorGameTypeTest`

- [ ] **Step 3: Implement** `draw` (spec, *Ziehung*, all from `random.presentation`: `nextBoolean()` for 2 or 3, `sample(pigments, k)`, `nextIntBetween(k, CAPACITY)` for the total, one drop each, the rest one by one via `pick`), `present`, `solution`, `stages`, `stagesScore`, `requiresReveal`, `scoresOnDuration`.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit** — `Add the Anrührung game: draw and exits`

---

### Task 4: `MixColorGameType` — the drop and the guess

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/MixColorGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/MixColorGameTypeTest.kt`

**Interfaces:**
- Consumes: `StepContext`, `GuessContext.steps` (Task 1); `mixHex`, `deltaE` (Task 2).
- Produces:
  - `data class MixColorGlass(val hex: String) : GameStepAnswer`
  - `data class MixColorOutcome(val hex: String, val recipe: Map<String, Int>, val deviation: Double, val withinTolerance: Boolean?) : GameOutcome`
  - Step input `{ "base": "<key>" }`; guess `{ "drops": <Int> }`, stored narrowed as exactly that.

- [ ] **Step 1: Write the failing tests**
  - `` `a drop answers the glass after it` `` — earlier `[c]`, input `y` → `MixColorGlass(mixHex(c=1, y=1))`.
  - `` `a malformed drop is refused` `` — `shouldThrow<InvalidStepException>` for `null`, `{}`, `{"base":"x"}`, `{"base":"c","n":1}`, `{"base":1}`, `"c"`, `[1]`.
  - `` `judge scores the stored glass` `` — steps `[c, y]`, guess `{"drops":2}` → `deviation shouldBe deltaE(mixHex(c=1,y=1), params.targetHex)`, outcome `hex`, `recipe = {c:1, y:1}`.
  - `` `a perfect glass is zero and ratios tie bit for bit` `` — target recipe `{c:1, m:1}`: steps `[c, m]` and `[c, m, c, m]` both `deviation shouldBe 0.0`.
  - `` `the gate is 4,0 in phase one` `` — fix a target and find two glasses whose `deltaE` lies just below and just above 4.0 (assert those values first, so the test documents them); `withinTolerance` true/false, `qualifies` follows. Phase two: `qualifies` true, `withinTolerance` null.
  - `` `judge refuses an empty glass, a count that differs and a corrupt step` `` — `InvalidGuessException` for steps `[]`; steps `[c]` with `{"drops":2}`; missing/non-int/negative `drops`; steps `[c, {"base":"x"}]` (Review Focus 4).
  - Field sets: answer `setOf("hex")`, outcome `setOf("hex", "recipe", "deviation", "withinTolerance")`; the target recipe appears in neither payload nor answer.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** `step(params, stage, input, context)` (validate with an `hasExactly("base")` helper like Peilung's, `Pigment.ofKey`; recipe = earlier + input; `MixColorGlass(mixHex(recipe)!!)`), and `judge(params, guess, context)` (parse `drops`, rebuild the recipe from `context.steps` — any invalid entry is `InvalidGuessException` — compare count, `deviation = deltaE(hex, params.targetHex)`, gate as `MatchScaleGameType`: `withinTolerance = params.tolerance?.let { deviation <= it + EPSILON }`, `qualifies = withinTolerance ?: true`). The two-argument `judge` throws `InvalidGuessException("mix-color judges from the stored steps")`. Measure an answer for 20 drops (`MyPlayDto.steps` mixes 210 times); add a prefix cache only if it is noticeable (spec leaves it to the builder).

- [ ] **Step 4: Run** `MixColorGameTypeTest`, then `./mvnw clean test`, expect PASS.

- [ ] **Step 5: Commit** — `Let Anrührung take drops and judge the glass`

---

### Task 5: `HoldButton` holds without a finger

**Files:**
- Modify: `webapp-vue/src/ui/HoldButton.vue`
- Test: `webapp-vue/src/ui/__tests__/HoldButton.spec.ts`

**Interfaces:**
- Produces: prop `autoHold?: boolean` (default `false`). When it turns `true` while `ready && !disabled`, the button starts its hold exactly as a press would (charge sound, sparks, `progress` events) and emits `confirm` on completion. Pointer and key releases do not cancel an auto-hold; `disabled` turning true does (existing watch). Turning `autoHold` false mid-hold cancels.

- [ ] **Step 1: Write the failing tests** (fake rAF as the existing spec does)
  - `` `auto-hold charges and confirms like a press` `` — mount with `autoHold: false`, set `true`, advance `DEFAULT_HOLD_MS + 50` → `emitted('confirm')` length 1, `playCharge` called, `progress` emitted increasing.
  - `` `auto-hold is not cancelled by pointerleave` ``.
  - `` `disabled cancels an auto-hold` ``.
  - Existing tests unchanged and green (all other callers omit the prop).

- [ ] **Step 2: Run, expect FAIL** — `cd webapp-vue && pnpm vitest run src/ui/__tests__/HoldButton.spec.ts`

- [ ] **Step 3: Implement** via the existing `startIfAllowed()` / `useHoldProgress` and a `watch(() => props.autoHold, …, { immediate: true })`; the release handlers return early while the hold is an auto-hold.

- [ ] **Step 4: Run** the spec plus every spec that references `HoldButton` (list in the exploration: copyblocks, echolocate, guesshue, matchscale, paintratio, placepatch, songsnippet, turnpipes, RevealCover), expect PASS.

- [ ] **Step 5: Commit** — `Let HoldButton hold itself on request`

---

### Task 6: Frontend types and scoreboard rows

**Files:**
- Create: `webapp-vue/src/games/mixcolor/types.ts`, `webapp-vue/src/games/mixcolor/scoreboard.ts`
- Test: `webapp-vue/src/games/mixcolor/__tests__/types.spec.ts`, `webapp-vue/src/games/mixcolor/__tests__/scoreboard.spec.ts`

**Interfaces:**
- Produces (`types.ts`, narrowing style of `games/matchscale/types.ts`):
  - `interface MixColorPigment { key: string; name: string; hex: string }`
  - `interface MixColorPayload { targetHex: string; capacity: number; pigments: MixColorPigment[] }`
  - `type Recipe = Record<string, number>`
  - `interface MixColorSolution { recipe: Recipe; tolerance: number | null }`
  - `interface MixColorOutcome { hex: string; recipe: Recipe; deviation: number; withinTolerance: boolean | null }`
  - `asMixColorPayload`, `asMixColorSolution`, `asMixColorOutcome` (`unknown → X | null`), `glassOf(answer: unknown): string | null` (`{hex}`), `dropsOf(guess: unknown): number | null`.
  - Hex check `/^#[0-9A-Fa-f]{6}$/`; capacity a positive integer; recipe values non-negative integers.
- Produces (`scoreboard.ts`):
  - `interface ScoreboardRow extends SharedScoreboardRow { drops: string; off: string; deviation: number | null; hex: string | null; recipe: Recipe | null }`
  - `formatDeviation(d: number): string` → `"3,2"` (one decimal, German comma); `toleranceText(t: number): string` → `"≤ 4,0"`.
  - `scoreboardRows({ entries, awardRule, mineUserId }): ScoreboardRow[]` — `rowHead` from `@/games/scoreboardColumns`, sort points desc, deviation asc, `userId`; `withTicks` from `@/games/ranking`.

- [ ] **Step 1: Write the failing tests** — junk payloads (bad hex, `capacity: 0`, `1.5`, missing pigments) → `null`; valid fixture round-trips; `glassOf({hex:'#00a0e9'})` keeps the value; `formatDeviation(3.24) === '3,2'`, `formatDeviation(0) === '0,0'`, `toleranceText(4) === '≤ 4,0'`; a given-up entry (`outcome: null`) yields `drops: '–'`, `deviation: null`, sorted last.

- [ ] **Step 2: Run, expect FAIL** — `pnpm vitest run src/games/mixcolor`

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit** — `Add Anrührung's client types and scoreboard rows`

---

### Task 7: The board — field, glass, nozzles, „Fertig“

**Files:**
- Create: `webapp-vue/src/games/mixcolor/MixerGlass.vue` (from the spike's `MixerSwirl.vue`, fine variant only)
- Create: `webapp-vue/src/games/mixcolor/MixColorBoard.vue`, `MixColorBriefing.vue`, `MixColorRules.vue`
- Test: `webapp-vue/src/games/mixcolor/__tests__/MixColorBoard.spec.ts`

**Interfaces:**
- Consumes: Task 5 `autoHold`; Task 6 types.
- Produces:
  - `MixerGlass` props `{ fill: string | null; splashes: { id: number; hex: string; angle: number }[] }` — empty fill `#8C8C8C`; swirl numbers from the spec (*Spielfläche*: 7 arms, 1.3 turns, stroke 2.2, opacity 0.45, period 0.7 s; splash 900 ms; fill 700 ms; fade 600 ms); under `prefers-reduced-motion` no splash, no swirl. Take the spike file from branch `feature/farbmischer-game-concept-853090` (`webapp-vue/src/spike/farbmischer/MixerSwirl.vue`) with `git show`.
  - `MixColorBoard` props `{ payload: MixColorPayload; steps: StepView[]; disabled: boolean; awardRule: AwardRule | null; awardPoints: number | null; myColorHex: string }`; emits `{ skip: [stage: number, input: { base: string }]; guess: [value: { drops: number }] }`.

- [ ] **Step 1: Write the failing tests** (host round-trip as `EchoLocateBoard.spec.ts`'s `answer()`; `HoldButton` via `getComponent(HoldButton)`)
  - `` `a tap emits one drop at the current stage` `` — steps `[]`, tap Cyan → `emitted('skip')` `[[0, { base: 'c' }]]`.
  - `` `one tap in flight` `` — two taps before `disabled` is set → one `skip` (Review Focus 1); after `answer(w, [step])` a tap emits `[1, …]`.
  - `` `nozzles and Fertig are locked while disabled` ``.
  - `` `the glass shows the last answer` `` — `MixerGlass` `fill` is the last step's `hex`; `null` without steps.
  - `` `Fertig sends the confirmed drop count` `` — two steps, `HoldButton` `confirm` → `[[{ drops: 2 }]]`; with no steps Fertig is disabled.
  - `` `the last drop holds Fertig by itself` `` — `capacity: 3`, after the third confirmed step `HoldButton` `props('autoHold')` is true and nozzles are locked (Review Focus 3); `confirm` → `guess` `{ drops: 3 }`.
  - `` `auto-hold once` `` — mount with a full circle: `autoHold` true; after `confirm` and a failed guess (`disabled` true→false, no solution) it stays false (Review Focus 2).
  - `` `the fill bar reads n / capacity` `` — `"2 / 3"`.
  - `` `player text never names a glass` `` — rendered text of board, briefing and rules matches neither `/Glas/` nor `/Reagenz/`.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement.** Layout per the spec sketch (*Spielfläche*): square field in `targetHex`, glass ≈ 58 % centred, fill bar, five nozzles (≥ 44 px, `pigment.hex`, `aria-label` = pigment name), `HoldButton` (`label="Mischung abgeben — gedrückt halten"`, `:auto-hold`, `@confirm`), `MixColorBriefing` below. Local `pending` flag: set on tap, cleared when `steps.length` changes or `disabled` falls. Briefing: `InfoBox storage-key="mix-color"` with an abstract in the player's terms (mix the target colour in the circle; what goes in stays in; at most `capacity` drops), `AwardBox game-id="mix-color"` with `#qualifies` „Abstand höchstens 4,0.“ and `#closest` „Die Mischung, die am nächsten dran ist.“ Rules: one `<li>` each — tap a colour to add a drop; nothing comes back out; full circle hands in by itself; „Fertig“ by holding.

- [ ] **Step 4: Run, expect PASS**; `pnpm exec vue-tsc -b`.

- [ ] **Step 5: Commit** — `Add Anrührung's board`

---

### Task 8: Reveal, scoreboard, registration

**Files:**
- Create: `webapp-vue/src/games/mixcolor/DropBars.vue`, `MixColorReveal.vue`, `MixColorScoreboard.vue`, `MixColorGame.vue`
- Modify: `webapp-vue/src/games/registry.ts` (`'mix-color': MixColorGame`), `webapp-vue/src/gamelab/games.ts` (`{ id: 'mix-color', title: 'Anrührung' }`)
- Test: `webapp-vue/src/games/mixcolor/__tests__/DropBars.spec.ts`, `__tests__/MixColorGame.spec.ts`

**Interfaces:**
- Consumes: Tasks 6, 7.
- Produces:
  - `DropBars` props `{ pigments: MixColorPigment[]; target: Recipe; player: Recipe | null; capacity: number }` — one row per pigment present in `target` or `player`, a target lane above a player lane, one grid column per drop up to `capacity`; drops drawn in the pigment colour.
  - `MixColorGame` follows `MatchScaleGame.vue`: `solution ? <MixColorReveal> : <MixColorBoard>`; passes `:steps="props.steps ?? []"`, forwards `skip` and `guess`.
  - `MixColorReveal`: field in `targetHex`, `MixerGlass` filled with the selected row's `hex` (own by default), `DropBars` with the selected row's `recipe`, `MixColorScoreboard` (columns Name · Tropfen · Abstand · Pkt; fact „Toleranz ≤ 4,0“ only in phase one); tapping a name selects it, tapping again returns to own. Timing from `revealChoreography.ts` as `MatchScaleScoreboard` does.

- [ ] **Step 1: Write the failing tests**
  - `DropBars`: target `{c:3, m:1}`, player `{c:2, y:1}` → rows c, m, y; c lanes have 3 and 2 drops; m player lane empty; y target lane empty.
  - `` `a given-up player renders without drops` `` — selecting an entry with `outcome: null` shows no player lane and no glass fill change, no throw (Review Focus 5).
  - `MixColorGame`: with `solution` it renders the reveal, without the board; `skip` from the board is re-emitted with stage and input.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run the frontend gates** — `pnpm test`, `pnpm exec vue-tsc -b`, `pnpm lint` (no `warning` lines), expect PASS.

- [ ] **Step 5: Commit** — `Add Anrührung's reveal and register the game`

---

### Task 9: Play it in the lab

**Files:** none expected; fixes go to the task that owns the code.

- [ ] **Step 1:** Start `backend` and `frontend` from `.claude/launch.json` (check the dev server's cwd is this worktree). Open `/c/<slug>/lab/mix-color` on phone width.
- [ ] **Step 2:** Phase one: drop, watch swirl and fill, reload mid-round (circle keeps its colour, nothing undone), hand in by holding; reveal shows bars and scoreboard with „Toleranz ≤ 4,0“.
- [ ] **Step 3:** Phase two: fill to capacity — „Fertig“ charges by itself and hands in; no 21st drop is offered.
- [ ] **Step 4:** Dark mode and reduced motion: glass rim and empty grey readable; no swirl.
- [ ] **Step 5:** Full suites: `cd core && ./mvnw clean test`; `cd webapp-vue && pnpm test && pnpm exec vue-tsc -b && pnpm lint`. Report the tolerance feel and timings (answer latency for 20 drops) in the PR description; nothing to commit unless a fix was needed.
