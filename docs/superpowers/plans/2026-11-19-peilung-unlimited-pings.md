# Peilung: beliebig viele Pings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Peilung allows unlimited pings, a „Ping | Pin“ switch and „Zurücksetzen“; phase two charges 0.05 cells per ping, shown as a bar in the scoreboard cell.

**Architecture:** The ladder stays finite (`PINGS = 999`, a hidden cap). The framework hands the player's stage (= pings spent) to `judge` via `GuessContext.stage`; Peilung adds `pingCost × stage` to the deviation in phase two and publishes it as `outcome.score`. The frontend's `flow.ts` gains a mode and a reset; the scoreboard sorts by `score` and paints it as a two-part bar.

**Tech Stack:** Kotlin/Spring (core), Vue 3 + Vitest (webapp-vue).

**Spec:** `docs/superpowers/specs/2026-10-25-peilung-design.md` (sections *Die Regeln*, *Der Zug*, *Der Tipp*, *Das Feld*, *Auflösung und Historie*, *Erklärung*). Issue: unividuell/countdown#153.

## Global Constraints

- `PINGS = 999`, `PING_COST = 0.05` (cells per ping), phase two only; `pingCost = null` in phase one.
- Frozen params: old rows lack `pingCost` → it must deserialize to `null` (default value).
- Pings counted = the player's stage = every ping, including those before a reset.
- UI labels exactly: „Ping“, „Pin“, „Zurücksetzen“, „Pings“; status lines „1. Klick: Ping, 2. Klick: Markieren“, „Markieren“, „Pins 1/2“.
- Bar label: `0,8 + 9 Pings` (`1 Ping` singular), German decimal comma, one decimal.
- Phase-two AwardBox: append „Wenige Pings werden belohnt.“ to the existing closest sentence.
- Peilung does not read `useGameSound`; no sound switch.
- Kotlin: named arguments from two arguments on. German UI text uses `„…“`.
- Never commit `.claude/launch.json` (local Kotlin-daemon workaround).

## Review Focus

1. A round frozen before this change (params without `pingCost`, outcome without `score`) loads, judges and renders distance-only — tested in Task 1 and Task 3.
2. „Zurücksetzen“ or the switch while a ping loads or a wave runs would desync rings from waves — both are no-ops outside `pinging`/`pinning` (Task 2).
3. After a reset, the next wave's rings still land at the right ping index (`rings.length === waves.length`) — Task 2.
4. A draft with pins, then more pings, then reload: pins come back (Task 2).
5. Give-up or unreadable rows in phase two: no bar, sorted last; the longest score sets the bar scale, a round of one row must not divide by zero (Task 3).

---

### Task 1: Backend — cap, ping cost, stage in `GuessContext`

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameType.kt` (`GuessContext`)
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayService.kt:108`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabService.kt:148`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/DedusterGameType.kt:146`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/EchoLocateGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/EchoLocateGameTypeTest.kt`, `PlayServiceStepTest.kt`, `gamelab/LabStagedFlowTest.kt`; fix call sites in `GameCatalogTest.kt`, `DedusterGameTypeTest.kt`

**Interfaces:**
- Produces: `GuessContext(sinceRevealMs: Long?, playId: UUID?, stage: Int)` — no default, every call site says it. `EchoLocateParams.pingCost: Double? = null`. `EchoLocateOutcome(distance, withinTolerance, pinOf, score: Double?)`. Wire: outcome JSON gains `score` (number or `null`).

- [ ] **Step 1: Write the failing tests** in `EchoLocateGameTypeTest`

```kotlin
// replaces `params.pings shouldBe 3` and `game.stages(params) shouldBe 4`
params.pings shouldBe 999
game.stages(params) shouldBe 1000

@Test fun `phase two freezes a ping cost of 0,05, phase one none`() {
    draw(context = context(phase = Phase.TWO)).pingCost shouldBe 0.05
    draw(context = context(phase = Phase.ONE)).pingCost.shouldBeNull()
}

@Test fun `phase two adds the ping cost per spent ping to the distance`() {
    // one clip, pin 0.8 cells from the target's centre, 9 pings spent
    val j = game.judge(params = phaseTwoParams, guess = pinAt(distance = 0.8), context = GuessContext(sinceRevealMs = null, playId = null, stage = 9))
    j.deviation shouldBe (1.25 plusOrMinus 1e-9)
    (j.outcome as EchoLocateOutcome).score shouldBe (1.25 plusOrMinus 1e-9)
    (j.outcome as EchoLocateOutcome).distance shouldBe (0.8 plusOrMinus 1e-9)
}

@Test fun `phase one ignores the pings`() { /* stage = 9 → deviation == distance, score null */ }

@Test fun `a round frozen without a ping cost reads as none`() {
    // params JSON without "pingCost" → pingCost == null; judge → score null, deviation == distance
}
```

Outcome field-set test (line ~258): `setOf("distance", "withinTolerance", "pinOf", "score")`.

In `PlayServiceStepTest`: after two steps, a guess reaches the game's `judge` with `context.stage == 2` (capture the context with mockk `slot`). Same in `LabStagedFlowTest` for `LabService.guess`.

- [ ] **Step 2: Run, verify they fail**

Run: `cd core && ./mvnw test -Dkotlin.compiler.daemon=false -Dtest='EchoLocateGameTypeTest,PlayServiceStepTest,LabStagedFlowTest'`
Expected: compile failure on `stage` / `pingCost` / `score`.

- [ ] **Step 3: Implement**

- `GuessContext.stage: Int` with KDoc „steps this player has taken; Peilung's pings“. `PlayService` passes `play.stage`, `LabService` the player's stored stage, `DedusterGameType` `0`.
- `EchoLocateGameType`: `PINGS = 999`, `PING_COST = 0.05`; `pingCost` drawn like `toleranceRadius` (`ONE -> null`, `TWO -> PING_COST`). Override `judge(params, guess, context)`; the two-argument `judge` delegates with `stage = 0`. `deviation = mean + (pingCost ?: 0.0) * context.stage`; `score = pingCost?.let { mean + it * context.stage }`.
- Payload unchanged (`pings` now carries the cap).

- [ ] **Step 4: Run the touched tests, then the full suite**

Run: `cd core && ./mvnw clean test -Dkotlin.compiler.daemon=false`
Expected: BUILD SUCCESS (incl. `LabPointsParityTest`, `ModularityTests`).

- [ ] **Step 5: Commit** — `Charge Peilung's pings in phase two` (body: why; `Closes` stays for the PR)

---

### Task 2: Frontend — mode switch, reset, no ping count

**Files:**
- Modify: `webapp-vue/src/games/echolocate/flow.ts`
- Modify: `webapp-vue/src/games/echolocate/EchoLocateBoard.vue`
- Modify: `webapp-vue/src/games/echolocate/EchoLocateRules.vue`
- Test: `webapp-vue/src/games/echolocate/__tests__/flow.spec.ts`, `EchoLocateBoard.spec.ts`

**Interfaces:**
- Produces in `flow.ts`: `type Mode = 'ping' | 'pin'`; `FlowState.mode: Mode`; `switchMode(state: FlowState, mode: Mode): FlowState`; `reset(state: FlowState): FlowState`; `canSteer(state: FlowState): boolean` (true in `pinging`/`pinning`); `pingsLeft(state: FlowState): boolean` (`waves.length < pings`).

- [ ] **Step 1: Write the failing tests** in `flow.spec.ts`

- `initialFlow` starts in mode `'ping'`; with `waves.length >= pings` in `'pin'`.
- `initialFlow` keeps the draft's pins even when pings are left (replaces „keeps no pins while pings are left“).
- `unlocked` opens into `pinging` in mode `ping`, into `pinning` in mode `pin`.
- `switchMode(…, 'pin')` from `pinging` → phase `pinning`; back to `'ping'` → `pinging`, pins kept.
- `switchMode` in `closed`, `loading`, `wave` returns the state unchanged.
- `switchMode(…, 'ping')` at the cap stays `pinning`.
- `settle` ends a wave into `pinning` when the mode is `pin`, into `pinging` when `ping`.
- `reset` in `pinging`/`pinning`: `rings` keeps its length with every entry `[]`, `pins` is `[]`, `waves` unchanged; in `loading`/`wave`/`closed` unchanged.
- After `reset`, a new ping + mark puts the ring at index `waves.length - 1` (`rings.length === waves.length`).
- `statusLine`: `pinging` → `1. Klick: Ping, 2. Klick: Markieren`; `pinning` → `Pins 1/2`.
- `guessOf` after `reset` + new pins: rings of earlier pings are `[]`.

In `EchoLocateBoard.spec.ts`:
- Buttons „Ping“ and „Pin“ with `aria-pressed` follow the mode; disabled under the cover, while loading and during a wave.
- „Pin“ click then a field tap sets a pin (no `skip` emitted).
- „Zurücksetzen“ empties rings and pins in the saved draft; pings (`steps`) untouched; disabled during a wave.
- At `steps.length === payload.pings`, „Ping“ is disabled.

- [ ] **Step 2: Run, verify they fail**

Run: `cd webapp-vue && pnpm vitest run src/games/echolocate`
Expected: FAIL (missing exports / old status text).

- [ ] **Step 3: Implement**

- `idle(state)` → `state.mode === 'ping' && pingsLeft(state) ? 'pinging' : 'pinning'`. Update the header diagram of `flow.ts`.
- Board: one row between field and status line — a two-button group „Ping | Pin“ (`aria-pressed`, styled like Anmaßung's tool buttons, ≥44 px tall) and a plain „Zurücksetzen“ button; disabled when `!canSteer(flow)`; „Ping“ also when `!pingsLeft(flow)`. Update the header sketch.
- Rules last bullet (both numbers): „„Ping“ und „Pin“ schalten um, was ein Tipp tut. Ein Pin für den Spruch. „Zurücksetzen“ räumt Ringe und Pins ab. Zum Abgeben „Abgeben“ gedrückt halten.“ (`pro Spruch` for two).

- [ ] **Step 4: Run tests, lint, types**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm exec vue-tsc -b`
Expected: all green; `pnpm lint` output has no `warning`.

- [ ] **Step 5: Commit** — `Let Peilung switch between ping and pin`

---

### Task 3: Frontend — scoreboard bar and phase-two briefing

**Files:**
- Modify: `webapp-vue/src/games/echolocate/types.ts` (`EchoLocateOutcome`, `asEchoLocateOutcome`)
- Modify: `webapp-vue/src/games/echolocate/scoreboard.ts`
- Modify: `webapp-vue/src/games/echolocate/EchoLocateScoreboard.vue`
- Modify: `webapp-vue/src/games/echolocate/EchoLocateBriefing.vue`
- Test: `__tests__/types.spec.ts`, `scoreboard.spec.ts`, `EchoLocateReveal.spec.ts`, `EchoLocateGame.spec.ts` (briefing)

**Interfaces:**
- Consumes: outcome `score: number | null` (Task 1).
- Produces: `EchoLocateOutcome.score: number | null`; `ScoreRow.pingCount: number | null`; `ScoreRow.scoreLabel: string | null` (`0,8 + 9 Pings`); `ScoreRow.bar: { distance: number; pings: number } | null` — fractions of the round's largest score, `distance + pings <= 1`.

- [ ] **Step 1: Write the failing tests**

- `asEchoLocateOutcome`: `score` missing or `null` → `null`; finite number → kept; string → whole outcome `null`.
- `scoreRows` phase two: rows sorted by `score` (Anna 0,4/30 → 1,9; Bert 1,2/4 → 1,4; Cem 0,8/9 → 1,25 → order Cem, Bert, Anna); Anna's `bar` = `{ distance: 0.4/1.9, pings: 1.5/1.9 }`; `scoreLabel` `0,8 + 9 Pings`, `1,2 + 1 Ping` for one ping; two clips `Ø 0,8 + 9 Pings`.
- `scoreRows` phase one (`score` null): sorted by distance as before, `bar` null, `pingCount` = pings.
- Give-up row: `bar`, `scoreLabel`, `pingCount` null, last. One row only: its bar is full (`distance + pings === 1`).
- Scoreboard component: phase one columns „Abstand“, „Pings“; phase two one column „Abstand + Pings“ whose cell shows `scoreLabel` over a background with two segments (assert inline `background` contains both percentages).
- Briefing in phase two (`toleranceRadius === null`): closest text ends with „Wenige Pings werden belohnt.“; phase one unchanged.

- [ ] **Step 2: Run, verify they fail** — `pnpm vitest run src/games/echolocate` → FAIL.

- [ ] **Step 3: Implement**

- Sort key `score ?? distance`. Bar scale: the largest `score` among shown rows.
- Phase-two column: `ground: () => null` (cell bare) and the `cell-<key>` slot draws its own surface: a `linear-gradient` with the row colour solid for `distance`, the row colour at ~45 % for `pings`, the rest the table surface; text in ink readable on the row colour. Exact colours and whether the sum fits are settled at the phone (spec says so) — start with label only.
- Column labels: phase one „Abstand“ + „Pings“ (`width: '3rem'`, numeric, end); phase two „Abstand + Pings“.
- Briefing `#closest`: append ` Wenige Pings werden belohnt.` when `toleranceRadius === null`.

- [ ] **Step 4: Run tests, lint, types** — as Task 2 Step 4.

- [ ] **Step 5: Commit** — `Show Peilung's pings in its scoreboard`

---

### Task 4: Hand test and knowledge

- [ ] **Step 1:** Lab, both phases, one and two clips, at phone width (375 px): switch, reset, many pings, hand in; reveal shows all pings of a selected player but only kept rings; phase-two bar readable in light and dark. Screenshot to the user.
- [ ] **Step 2:** `.claude/guidelines/game-rounds.md`: `GuessContext.stage` — the framework hands the spent stage to `judge`, for games whose steps cost score. Commit `Note the stage in GuessContext`.
- [ ] **Step 3:** Spec status line: „umgesetzt“ date; open PR against `develop` with `Closes #153` only on the user's go.
